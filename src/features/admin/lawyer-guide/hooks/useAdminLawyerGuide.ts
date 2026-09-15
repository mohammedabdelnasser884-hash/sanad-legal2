import { useState, useCallback } from 'react';
import { toast } from '../../../../shared/lib/notifications';
import { logActivity, buildAddSnapshot, buildDeleteSnapshot, type FieldDiffMap } from '../../../../shared/lib/dataAccess';
import { showErrorToast } from '../../../../shared/lib/errorReporting';
import { recordSuccess } from '../../../../systemHealth';
import { db, callEncyclopediaAction } from '../../../../supabaseClient';
import type { ProfileRow, LawyerGuideCategoryRow, LawyerGuideLinkRow } from '../../../../types';

// ══════════════════════════════════════════════════════
//  هوك إدارة "دليل المحامي" — مرحلة 3 من خطة "إعادة هيكلة
//  الموسوعة القانونية إلى الموارد القانونية". نفس نمط
//  useAdminEncyclopedia.ts بالظبط (نفس callEncyclopediaAction، نفس
//  edge function encyclopedia-admin)، لكن أبسط: مستوى واحد بس من
//  التصنيفات (بدون parent_id)، وروابط نصية بحتة (بدون رفع ملفات/
//  Storage خالص).
// ══════════════════════════════════════════════════════

export interface LawyerGuideCategoryForm {
  name_ar: string;
  icon: string | null;
}

export interface LawyerGuideLinkForm {
  category_id: string;
  title: string;
  url: string;
  description: string;
  entity_type: string;
  last_verified_at: string; // '' = بدون تاريخ
}

const CATEGORY_FIELD_DIFF: FieldDiffMap = {
  name_ar: { label: 'اسم التصنيف' },
};
const LINK_FIELD_DIFF: FieldDiffMap = {
  title: { label: 'عنوان الرابط' },
};

export function useAdminLawyerGuide(profile?: ProfileRow | null) {
  const _userName = profile?.full_name || null;

  const [categories, setCategories] = useState<LawyerGuideCategoryRow[]>([]);
  const [links, setLinks] = useState<LawyerGuideLinkRow[]>([]);
  const [loadingLawyerGuide, setLoadingLawyerGuide] = useState(false);

  const [showGuideCategoryModal, setShowGuideCategoryModal] = useState(false);
  const [editingGuideCategory, setEditingGuideCategory] = useState<LawyerGuideCategoryRow | null>(null);
  const [confirmDeleteGuideCategory, setConfirmDeleteGuideCategory] = useState<LawyerGuideCategoryRow | null>(null);
  const [savingGuideCategory, setSavingGuideCategory] = useState(false);

  const [showGuideLinkModal, setShowGuideLinkModal] = useState(false);
  const [editingGuideLink, setEditingGuideLink] = useState<LawyerGuideLinkRow | null>(null);
  const [guideLinkModalCategoryId, setGuideLinkModalCategoryId] = useState<string | null>(null);
  const [confirmDeleteGuideLink, setConfirmDeleteGuideLink] = useState<LawyerGuideLinkRow | null>(null);
  const [savingGuideLink, setSavingGuideLink] = useState(false);

  // ── جلب التصنيفات + الروابط (قراءة مباشرة — RLS مفتوحة لأي authenticated) ──
  const fetchLawyerGuide = useCallback(async () => {
    setLoadingLawyerGuide(true);
    try {
      const [{ data: cats }, { data: lnks }] = await Promise.all([
        db.from('lawyer_guide_categories').select('*').order('sort_order').order('name_ar'),
        db.from('lawyer_guide_links').select('*').order('category_id').order('sort_order').order('title'),
      ]);
      if (cats) setCategories(cats);
      if (lnks) setLinks(lnks);
    } catch (e) { /* الجدولين غير موجودين بعد (قبل تشغيل الـmigration) */ }
    setLoadingLawyerGuide(false);
  }, []);

  // ── إضافة / تعديل تصنيف ──
  const handleSaveGuideCategory = async (form: LawyerGuideCategoryForm) => {
    setSavingGuideCategory(true);
    try {
      if (editingGuideCategory) {
        await callEncyclopediaAction({
          action: 'updateLinkCategory', id: editingGuideCategory.id,
          name_ar: form.name_ar, icon: form.icon,
        });
        toast('✅ تم حفظ التعديلات');
        logActivity(db, 'تعديل تصنيف في دليل المحامي', {
          userName: _userName, entity_type: 'lawyer_guide_category', entity_id: editingGuideCategory.id,
          details: form.name_ar,
          changes: [{ field: 'name_ar', label: 'اسم التصنيف', old: editingGuideCategory.name_ar, new: form.name_ar }],
        });
      } else {
        await callEncyclopediaAction({ action: 'createLinkCategory', name_ar: form.name_ar, icon: form.icon });
        toast('✅ تم إنشاء التصنيف');
        logActivity(db, 'إضافة تصنيف لدليل المحامي', {
          userName: _userName, entity_type: 'lawyer_guide_category', details: form.name_ar,
          changes: buildAddSnapshot(form as unknown as Record<string, unknown>, CATEGORY_FIELD_DIFF),
        });
      }
      setShowGuideCategoryModal(false);
      setEditingGuideCategory(null);
      fetchLawyerGuide();
      recordSuccess('lawyer_guide_save_category');
    } catch (e) {
      showErrorToast('lawyer_guide_save_category', e, 'تعذّر حفظ التصنيف. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'دليل المحامي');
    }
    setSavingGuideCategory(false);
  };

  // ── حذف تصنيف (Cascade يشمل كل الروابط جواه) ──
  const handleDeleteGuideCategory = async (category: LawyerGuideCategoryRow) => {
    setSavingGuideCategory(true);
    try {
      await callEncyclopediaAction({ action: 'deleteLinkCategory', id: category.id });
      toast('🗑️ تم حذف التصنيف وكل روابطه');
      logActivity(db, 'حذف تصنيف من دليل المحامي', {
        userName: _userName, entity_type: 'lawyer_guide_category', entity_id: category.id,
        details: category.name_ar,
        changes: buildDeleteSnapshot(category as unknown as Record<string, unknown>, CATEGORY_FIELD_DIFF),
      });
      setConfirmDeleteGuideCategory(null);
      fetchLawyerGuide();
      recordSuccess('lawyer_guide_delete_category');
    } catch (e) {
      showErrorToast('lawyer_guide_delete_category', e, 'تعذّر حذف التصنيف. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'دليل المحامي');
    }
    setSavingGuideCategory(false);
  };

  // ── إضافة / تعديل رابط ──
  const handleSaveGuideLink = async (form: LawyerGuideLinkForm) => {
    setSavingGuideLink(true);
    try {
      const payloadCommon = {
        category_id: form.category_id,
        title: form.title,
        url: form.url,
        description: form.description || null,
        entity_type: form.entity_type || null,
        last_verified_at: form.last_verified_at || null,
      };
      if (editingGuideLink) {
        await callEncyclopediaAction({ action: 'updateLink', id: editingGuideLink.id, ...payloadCommon });
        toast('✅ تم حفظ التعديلات');
        logActivity(db, 'تعديل رابط في دليل المحامي', {
          userName: _userName, entity_type: 'lawyer_guide_link', entity_id: editingGuideLink.id, details: form.title,
        });
      } else {
        // ⚡ ترتيب يدوي (قرار #1 محسوم — الأهم يفضل فوق): الرابط الجديد
        // بيتحط في آخر ترتيب تصنيفه الحالي (max(sort_order) + 1)، عشان
        // ميقفزش لأول القائمة من غير قصد. إعادة الترتيب الفعلية بعد كده
        // بتتم بأزرار "لأعلى/لأسفل" في الواجهة (handleReorderGuideLink).
        const siblingsMax = links
          .filter((l) => l.category_id === form.category_id)
          .reduce((max, l) => Math.max(max, l.sort_order || 0), -1);
        await callEncyclopediaAction({ action: 'createLink', ...payloadCommon, sort_order: siblingsMax + 1 });
        toast('✅ تم إضافة الرابط');
        logActivity(db, 'إضافة رابط لدليل المحامي', {
          userName: _userName, entity_type: 'lawyer_guide_link', details: form.title,
          changes: buildAddSnapshot(form as unknown as Record<string, unknown>, LINK_FIELD_DIFF),
        });
      }
      setShowGuideLinkModal(false);
      setEditingGuideLink(null);
      setGuideLinkModalCategoryId(null);
      fetchLawyerGuide();
      recordSuccess('lawyer_guide_save_link');
    } catch (e) {
      showErrorToast('lawyer_guide_save_link', e, 'تعذّر حفظ الرابط. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'دليل المحامي');
    }
    setSavingGuideLink(false);
  };

  // ── إعادة ترتيب رابط (لأعلى/لأسفل) — بتبدّل sort_order مع الجار
  // المباشر في نفس التصنيف بس (نفس مصفوفة guideLinks مرتّبة بالفعل
  // بـsort_order من fetchLawyerGuide). عمليتين updateLink متتاليتين،
  // صفر action جديدة في السيرفر.
  const [reordering, setReordering] = useState(false);
  const handleReorderGuideLink = async (link: LawyerGuideLinkRow, direction: 'up' | 'down') => {
    const siblings = links.filter((l) => l.category_id === link.category_id);
    const idx = siblings.findIndex((l) => l.id === link.id);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || targetIdx < 0 || targetIdx >= siblings.length) return;
    const neighbor = siblings[targetIdx];
    setReordering(true);
    try {
      await Promise.all([
        callEncyclopediaAction({ action: 'updateLink', id: link.id, sort_order: neighbor.sort_order }),
        callEncyclopediaAction({ action: 'updateLink', id: neighbor.id, sort_order: link.sort_order }),
      ]);
      fetchLawyerGuide();
      recordSuccess('lawyer_guide_reorder_link');
    } catch (e) {
      showErrorToast('lawyer_guide_reorder_link', e, 'تعذّر تغيير الترتيب. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'دليل المحامي');
    }
    setReordering(false);
  };

  // ── حذف رابط ──
  const handleDeleteGuideLink = async (link: LawyerGuideLinkRow) => {
    setSavingGuideLink(true);
    try {
      await callEncyclopediaAction({ action: 'deleteLink', id: link.id });
      toast('🗑️ تم حذف الرابط');
      logActivity(db, 'حذف رابط من دليل المحامي', {
        userName: _userName, entity_type: 'lawyer_guide_link', entity_id: link.id, details: link.title,
      });
      setConfirmDeleteGuideLink(null);
      fetchLawyerGuide();
      recordSuccess('lawyer_guide_delete_link');
    } catch (e) {
      showErrorToast('lawyer_guide_delete_link', e, 'تعذّر حذف الرابط. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'دليل المحامي');
    }
    setSavingGuideLink(false);
  };

  return {
    guideCategories: categories, guideLinks: links, loadingLawyerGuide, fetchLawyerGuide,
    showGuideCategoryModal, setShowGuideCategoryModal,
    editingGuideCategory, setEditingGuideCategory,
    confirmDeleteGuideCategory, setConfirmDeleteGuideCategory,
    savingGuideCategory, handleSaveGuideCategory, handleDeleteGuideCategory,
    showGuideLinkModal, setShowGuideLinkModal,
    editingGuideLink, setEditingGuideLink,
    guideLinkModalCategoryId, setGuideLinkModalCategoryId,
    confirmDeleteGuideLink, setConfirmDeleteGuideLink,
    savingGuideLink, handleSaveGuideLink, handleDeleteGuideLink,
    reordering, handleReorderGuideLink,
  };
}
