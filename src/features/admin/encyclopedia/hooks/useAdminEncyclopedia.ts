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

  // ── جلب المجلدات + النماذج (قراءة مباشرة — RLS مفتوحة لأي authenticated) ──
  const fetchEncyclopedia = useCallback(async () => {
    setLoadingEncyclopedia(true);
    try {
      const [{ data: cats }, { data: frms }] = await Promise.all([
        db.from('encyclopedia_categories').select('*').order('name_ar'),
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
  };
}
