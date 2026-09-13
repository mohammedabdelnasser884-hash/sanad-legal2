import { useState, useCallback } from 'react';
import { toast } from '../../../../shared/lib/notifications';
import { logActivity, buildAddSnapshot, buildDeleteSnapshot, type FieldDiffMap } from '../../../../shared/lib/dataAccess';
import { showErrorToast } from '../../../../shared/lib/errorReporting';
import { recordSuccess } from '../../../../systemHealth';
import { db, callEncyclopediaAction } from '../../../../supabaseClient';
import type { ProfileRow, EncyclopediaCategoryRow, EncyclopediaFormRow } from '../../../../types';

// فورم إضافة/تعديل مجلد — نفس الحقول اللي بيبعتها EncyclopediaCategoryModal.tsx
export interface EncyclopediaCategoryForm {
  name_ar: string;
  parent_id: string | null;
}

// فورم إضافة/تعديل نموذج — نفس الحقول اللي بيبعتها EncyclopediaFormModal.tsx
export interface EncyclopediaFormFormValues {
  title: string;
  description: string;
  category_id: string;
}

// نتيجة رفع كل ملف على حدة في الرفع المتعدد — نفس الملف يفشل أو ينجح
// لوحده من غير ما يوقف باقي الدفعة
export interface EncyclopediaBatchFileResult {
  fileName: string;
  title: string;
  status: 'success' | 'error';
  error?: string;
}

const ENCYCLOPEDIA_FIELD_DIFF: FieldDiffMap = {
  name_ar: { label: 'اسم المجلد' },
};

// أقصى حجم ملف مسموح به للموسوعة القانونية — قرار منفصل تمامًا عن حد
// الـ1 ميجا الخاص بمستندات القضايا (راجع تقرير التنفيذ مرحلة 2). نفس
// الرقم المُطبَّق فعليًا داخل encyclopedia-admin (MAX_FILE_SIZE_BYTES)،
// اتكرر هنا فقط للتحقق المبكر في الواجهة قبل تحويل الملف لـbase64.
export const ENCYCLOPEDIA_MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 ميجا
export const ENCYCLOPEDIA_ALLOWED_EXTENSIONS = ['pdf', 'docx'];

// يحوّل ملف لـbase64 خام (من غير بادئة data: URL) عشان يتبعت لـ
// encyclopedia-admin زي ما هي متوقعاه (file_base64).
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

export function useAdminEncyclopedia(profile?: ProfileRow | null) {
  const _userName = profile?.full_name || null;

  const [categories, setCategories] = useState<EncyclopediaCategoryRow[]>([]);
  const [forms, setForms] = useState<EncyclopediaFormRow[]>([]);
  const [loadingEncyclopedia, setLoadingEncyclopedia] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<EncyclopediaCategoryRow | null>(null);
  const [categoryParentForNew, setCategoryParentForNew] = useState<string | null>(null);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<EncyclopediaCategoryRow | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingForm, setEditingForm] = useState<EncyclopediaFormRow | null>(null);
  const [formModalCategoryId, setFormModalCategoryId] = useState<string | null>(null);
  const [confirmDeleteForm, setConfirmDeleteForm] = useState<EncyclopediaFormRow | null>(null);
  const [savingForm, setSavingForm] = useState(false);

  // ── الرفع المتعدد (batch) — مجلد واحد لكل الدفعة، نفس uploadForm بس في لوب تسلسلي ──
  const [showBatchUploadModal, setShowBatchUploadModal] = useState(false);
  const [batchModalCategoryId, setBatchModalCategoryId] = useState<string | null>(null);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [batchResults, setBatchResults] = useState<EncyclopediaBatchFileResult[] | null>(null);

  // ── وضع "تحديد" + حذف/نقل جماعي — بيشتغل جوه أي مجلد مفتوح، نفس فكرة
  //    الرفع المتعدد فوق بالظبط: صفر action جديدة في السيرفر، بس بيتكرر
  //    deleteForm/updateForm الحاليين تسلسليًا على كل ملف محدد. selectMode
  //    وselectedFormIds هنا (مش جوه EncyclopediaSection) عشان نقدر نصفّرهم
  //    تلقائيًا بعد نجاح أي عملية جماعية من غير ما نحتاج تنسيق إضافي بين
  //    الهوك والمكوّن.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedFormIds, setSelectedFormIds] = useState<Set<string>>(new Set());
  const [confirmBulkDeleteForms, setConfirmBulkDeleteForms] = useState<EncyclopediaFormRow[] | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkMoveForms, setBulkMoveForms] = useState<EncyclopediaFormRow[] | null>(null);
  const [bulkMoving, setBulkMoving] = useState(false);

  const toggleSelectMode = useCallback(() => {
    setSelectMode((v) => !v);
    setSelectedFormIds(new Set());
  }, []);

  const toggleFormSelected = useCallback((id: string) => {
    setSelectedFormIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectMode(false);
    setSelectedFormIds(new Set());
  }, []);

  // ── جلب المجلدات + النماذج (قراءة مباشرة — RLS مفتوحة لأي authenticated) ──
  const fetchEncyclopedia = useCallback(async () => {
    setLoadingEncyclopedia(true);
    try {
      const [{ data: cats }, { data: frms }] = await Promise.all([
        db.from('encyclopedia_categories').select('*').order('sort_order').order('name_ar'),
        db.from('encyclopedia_forms').select('*').order('title'),
      ]);
      if (cats) setCategories(cats);
      if (frms) setForms(frms);
    } catch (e) { /* الجدولين غير موجودين بعد (قبل تشغيل الـmigration) */ }
    setLoadingEncyclopedia(false);
  }, []);

  // ── إضافة / تعديل مجلد ──
  const handleSaveCategory = async (form: EncyclopediaCategoryForm) => {
    setSavingCategory(true);
    try {
      if (editingCategory) {
        await callEncyclopediaAction({
          action: 'updateCategory', id: editingCategory.id,
          name_ar: form.name_ar, parent_id: form.parent_id,
        });
        toast('✅ تم حفظ التعديلات');
        logActivity(db, 'تعديل مجلد الموسوعة القانونية', {
          userName: _userName, entity_type: 'encyclopedia_category', entity_id: editingCategory.id,
          details: form.name_ar,
          changes: [{ field: 'name_ar', label: 'اسم المجلد', old: editingCategory.name_ar, new: form.name_ar }],
        });
      } else {
        await callEncyclopediaAction({
          action: 'createCategory', name_ar: form.name_ar, parent_id: form.parent_id,
        });
        toast('✅ تم إنشاء المجلد');
        logActivity(db, 'إضافة مجلد للموسوعة القانونية', {
          userName: _userName, entity_type: 'encyclopedia_category', details: form.name_ar,
          changes: buildAddSnapshot(form as unknown as Record<string, unknown>, ENCYCLOPEDIA_FIELD_DIFF),
        });
      }
      setShowCategoryModal(false);
      setEditingCategory(null);
      setCategoryParentForNew(null);
      fetchEncyclopedia();
      recordSuccess('encyclopedia_save_category');
    } catch (e) {
      showErrorToast('encyclopedia_save_category', e, 'تعذّر حفظ المجلد. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'الموسوعة القانونية');
    }
    setSavingCategory(false);
  };

  // ── حذف مجلد (Cascade يشمل أي مجلد فرعي وكل النماذج جواه — تأكيد الواجهة هنا) ──
  const handleDeleteCategory = async (category: EncyclopediaCategoryRow) => {
    setSavingCategory(true);
    try {
      await callEncyclopediaAction({ action: 'deleteCategory', id: category.id });
      toast('🗑️ تم حذف المجلد وكل ما بداخله');
      logActivity(db, 'حذف مجلد من الموسوعة القانونية', {
        userName: _userName, entity_type: 'encyclopedia_category', entity_id: category.id,
        details: category.name_ar,
        changes: buildDeleteSnapshot(category as unknown as Record<string, unknown>, ENCYCLOPEDIA_FIELD_DIFF),
      });
      setConfirmDeleteCategory(null);
      fetchEncyclopedia();
      recordSuccess('encyclopedia_delete_category');
    } catch (e) {
      showErrorToast('encyclopedia_delete_category', e, 'تعذّر حذف المجلد. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'الموسوعة القانونية');
    }
    setSavingCategory(false);
  };

  // ── رفع / تعديل نموذج ──
  const handleSaveForm = async (form: EncyclopediaFormFormValues, file: File | null) => {
    setSavingForm(true);
    try {
      let fileFields: { file_name: string; file_type: string; file_base64: string } | null = null;
      if (file) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!ENCYCLOPEDIA_ALLOWED_EXTENSIONS.includes(ext)) {
          toast('❌ الصيغ المسموحة فقط: PDF أو Word (docx)', true);
          setSavingForm(false);
          return;
        }
        if (file.size > ENCYCLOPEDIA_MAX_FILE_SIZE) {
          toast('❌ حجم الملف أكبر من المسموح (2 ميجابايت كحد أقصى)', true);
          setSavingForm(false);
          return;
        }
        fileFields = { file_name: file.name, file_type: ext, file_base64: await fileToBase64(file) };
      }

      if (editingForm) {
        await callEncyclopediaAction({
          action: 'updateForm', id: editingForm.id,
          title: form.title, description: form.description || null, category_id: form.category_id,
          ...(fileFields || {}),
        });
        toast('✅ تم حفظ التعديلات');
        logActivity(db, 'تعديل نموذج في الموسوعة القانونية', {
          userName: _userName, entity_type: 'encyclopedia_form', entity_id: editingForm.id,
          details: form.title,
        });
      } else {
        if (!fileFields) { toast('يرجى رفع ملف للنموذج', true); setSavingForm(false); return; }
        await callEncyclopediaAction({
          action: 'uploadForm', category_id: form.category_id,
          title: form.title, description: form.description || null, ...fileFields,
        });
        toast('✅ تم رفع النموذج');
        logActivity(db, 'إضافة نموذج للموسوعة القانونية', {
          userName: _userName, entity_type: 'encyclopedia_form', details: form.title,
        });
      }
      setShowFormModal(false);
      setEditingForm(null);
      setFormModalCategoryId(null);
      fetchEncyclopedia();
      recordSuccess('encyclopedia_save_form');
    } catch (e) {
      showErrorToast('encyclopedia_save_form', e, 'تعذّر رفع الملف. تأكد من نوع وحجم الملف وحاول تاني. لو المشكلة استمرت، تواصل مع الدعم.', 'الموسوعة القانونية');
    }
    setSavingForm(false);
  };

  // ── حذف نموذج ──
  const handleDeleteForm = async (form: EncyclopediaFormRow) => {
    setSavingForm(true);
    try {
      await callEncyclopediaAction({ action: 'deleteForm', id: form.id });
      toast('🗑️ تم حذف النموذج');
      logActivity(db, 'حذف نموذج من الموسوعة القانونية', {
        userName: _userName, entity_type: 'encyclopedia_form', entity_id: form.id, details: form.title,
      });
      setConfirmDeleteForm(null);
      fetchEncyclopedia();
      recordSuccess('encyclopedia_delete_form');
    } catch (e) {
      showErrorToast('encyclopedia_delete_form', e, 'تعذّر حذف النموذج. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'الموسوعة القانونية');
    }
    setSavingForm(false);
  };

  // ── حذف جماعي — نفس action='deleteForm' الحالية بالظبط، بتتكرر تسلسليًا
  //    على كل ملف من الملفات المحددة. ملف بيفشل حذفه (مثلاً اتحذف من جلسة
  //    تانية قبل كده) مبيوقفش الباقي، وفي الآخر بيظهر توست بملخص النتيجة.
  const handleBulkDeleteForms = async (formsToDelete: EncyclopediaFormRow[]) => {
    if (formsToDelete.length === 0) return;
    setBulkDeleting(true);
    let successCount = 0;
    for (const form of formsToDelete) {
      try {
        await callEncyclopediaAction({ action: 'deleteForm', id: form.id });
        logActivity(db, 'حذف نموذج من الموسوعة القانونية', {
          userName: _userName, entity_type: 'encyclopedia_form', entity_id: form.id, details: form.title,
        });
        successCount++;
      } catch (e) {
        console.error('[encyclopedia:bulkDelete]', form.title, e instanceof Error ? e.message : e);
      }
    }
    setConfirmBulkDeleteForms(null);
    clearSelection();
    fetchEncyclopedia();
    setBulkDeleting(false);
    if (successCount > 0) recordSuccess('encyclopedia_bulk_delete_form');
    if (successCount === formsToDelete.length) toast(`🗑️ تم حذف ${successCount} نموذج`);
    else if (successCount === 0) toast('❌ فشل حذف كل الملفات المحددة، حاول مرة أخرى', true);
    else toast(`⚠️ تم حذف ${successCount} من ${formsToDelete.length} — حاول تاني مع الباقي`, true);
  };

  // ── نقل جماعي — عمليًا مجرد تغيير category_id، فبيستخدم نفس
  //    action='updateForm' الحالية (من غير أي file_base64) بالظبط، تسلسليًا
  //    على كل ملف محدد. صفر migration وصفر action جديدة في السيرفر.
  const handleBulkMoveForms = async (formsToMove: EncyclopediaFormRow[], targetCategoryId: string) => {
    if (formsToMove.length === 0 || !targetCategoryId) return;
    setBulkMoving(true);
    let successCount = 0;
    for (const form of formsToMove) {
      try {
        await callEncyclopediaAction({ action: 'updateForm', id: form.id, category_id: targetCategoryId });
        logActivity(db, 'نقل نموذج في الموسوعة القانونية', {
          userName: _userName, entity_type: 'encyclopedia_form', entity_id: form.id, details: form.title,
        });
        successCount++;
      } catch (e) {
        console.error('[encyclopedia:bulkMove]', form.title, e instanceof Error ? e.message : e);
      }
    }
    setBulkMoveForms(null);
    clearSelection();
    fetchEncyclopedia();
    setBulkMoving(false);
    if (successCount > 0) recordSuccess('encyclopedia_bulk_move_form');
    if (successCount === formsToMove.length) toast(`📁 تم نقل ${successCount} نموذج`);
    else if (successCount === 0) toast('❌ فشل نقل كل الملفات المحددة، حاول مرة أخرى', true);
    else toast(`⚠️ تم نقل ${successCount} من ${formsToMove.length} — حاول تاني مع الباقي`, true);
  };

  // ── رفع دفعة ملفات مرة واحدة على نفس المجلد — واحد واحد بالتسلسل، نفس
  //    action='uploadForm' الحالية بالظبط (مفيش فانكشن جديدة في السيرفر).
  //    لو ملف فشل (حجم/نوع/أي خطأ سيرفر)، بيتسجّل فشله والباقي بيكمل عادي.
  const handleUploadBatch = async (categoryId: string, items: { file: File; title: string }[]) => {
    setBatchUploading(true);
    setBatchResults(null);
    const results: EncyclopediaBatchFileResult[] = [];
    for (let i = 0; i < items.length; i++) {
      const { file, title } = items[i];
      const finalTitle = title.trim() || file.name;
      setBatchProgress({ current: i + 1, total: items.length });
      try {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!ENCYCLOPEDIA_ALLOWED_EXTENSIONS.includes(ext)) {
          throw new Error('الصيغ المسموحة فقط: PDF أو Word (docx)');
        }
        if (file.size > ENCYCLOPEDIA_MAX_FILE_SIZE) {
          throw new Error('حجم الملف أكبر من المسموح (2 ميجابايت كحد أقصى)');
        }
        const file_base64 = await fileToBase64(file);
        await callEncyclopediaAction({
          action: 'uploadForm', category_id: categoryId,
          title: finalTitle, description: null,
          file_name: file.name, file_type: ext, file_base64,
        });
        logActivity(db, 'إضافة نموذج للموسوعة القانونية', {
          userName: _userName, entity_type: 'encyclopedia_form', details: finalTitle,
        });
        results.push({ fileName: file.name, title: finalTitle, status: 'success' });
      } catch (e) {
        results.push({
          fileName: file.name, title: finalTitle, status: 'error',
          error: e instanceof Error ? e.message : 'خطأ غير معروف',
        });
      }
    }
    setBatchResults(results);
    setBatchProgress(null);
    setBatchUploading(false);
    fetchEncyclopedia();

    const successCount = results.filter((r) => r.status === 'success').length;
    if (successCount > 0) recordSuccess('encyclopedia_batch_upload');
    if (successCount === results.length) toast(`✅ تم رفع ${successCount} نموذج بنجاح`);
    else if (successCount === 0) toast('❌ فشل رفع كل الملفات، راجع التفاصيل', true);
    else toast(`⚠️ تم رفع ${successCount} من ${results.length} — راجع القائمة لمعرفة الملفات الفاشلة`, true);
  };

  return {
    categories, forms, loadingEncyclopedia, fetchEncyclopedia,
    showCategoryModal, setShowCategoryModal,
    editingCategory, setEditingCategory,
    categoryParentForNew, setCategoryParentForNew,
    confirmDeleteCategory, setConfirmDeleteCategory,
    savingCategory, handleSaveCategory, handleDeleteCategory,
    showFormModal, setShowFormModal,
    editingForm, setEditingForm,
    formModalCategoryId, setFormModalCategoryId,
    confirmDeleteForm, setConfirmDeleteForm,
    savingForm, handleSaveForm, handleDeleteForm,
    showBatchUploadModal, setShowBatchUploadModal,
    batchModalCategoryId, setBatchModalCategoryId,
    batchUploading, batchProgress, batchResults, setBatchResults,
    handleUploadBatch,
    selectMode, toggleSelectMode, selectedFormIds, toggleFormSelected, clearSelection,
    confirmBulkDeleteForms, setConfirmBulkDeleteForms, bulkDeleting, handleBulkDeleteForms,
    bulkMoveForms, setBulkMoveForms, bulkMoving, handleBulkMoveForms,
  };
}
