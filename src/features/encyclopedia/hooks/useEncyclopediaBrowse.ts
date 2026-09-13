import { useState, useCallback } from 'react';
import { showErrorToast } from '../../../shared/lib/errorReporting';
import { db, callEncyclopediaDownload } from '../../../supabaseClient';
import type { EncyclopediaCategoryRow, EncyclopediaFormRow } from '../../../types';

// هوك تصفح/تحميل "الموسوعة القانونية" لأي مستخدم (مش سوبر أدمن بس) —
// قراءة فقط، مفيش أي كتابة على encyclopedia_categories/encyclopedia_forms
// هنا خالص (ده دور useAdminEncyclopedia حصريًا). التحميل الفعلي بيعدّي
// على encyclopedia-download (فانكشن منفصلة تمامًا عن encyclopedia-admin،
// راجع تعليقها) عشان الباكت private ومحتاج service_role لتوليد رابط
// موقّع، وكمان لتحديث download_count (كتابة الجدول مقصورة على سوبر أدمن
// في الـRLS).
export function useEncyclopediaBrowse() {
  const [categories, setCategories] = useState<EncyclopediaCategoryRow[]>([]);
  const [forms, setForms] = useState<EncyclopediaFormRow[]>([]);
  const [loadingEncyclopedia, setLoadingEncyclopedia] = useState(false);
  const [downloadingFormId, setDownloadingFormId] = useState<string | null>(null);
  const [previewingFormId, setPreviewingFormId] = useState<string | null>(null);

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

  // ── تحميل نموذج: يجيب رابط موقّع مؤقت من encyclopedia-download، يفتحه
  // في تاب جديد عشان المتصفح يبدأ التحميل، من غير ما نبني رابط Storage
  // يدويًا هنا (الباكت private أصلاً فمفيش رابط ثابت يصلح). ──
  const handleDownloadForm = async (form: EncyclopediaFormRow) => {
    setDownloadingFormId(form.id);
    try {
      const { url } = await callEncyclopediaDownload(form.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      showErrorToast('encyclopedia_download_form', e, 'تعذّر تحميل النموذج. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'الموسوعة القانونية');
    }
    setDownloadingFormId(null);
  };

  // ── معاينة نموذج قبل التحميل: نفس رابط التحميل الموقّع بالظبط (mode:
  // 'view')، من غير ما يزوّد عداد التحميلات. الـPDF بيتفتح مباشرة في تاب
  // جديد (المتصفح بيعرضه inline بشكل طبيعي). الـWord (docx) مش المتصفح
  // بيعرضه لوحده، فبنلفه بـGoogle Docs Viewer (بيقدر يقرا أي رابط HTTPS
  // عام مؤقت زي الرابط الموقّع طول ما لسه صالح وقت الفتح). ──
  const handlePreviewForm = async (form: EncyclopediaFormRow) => {
    setPreviewingFormId(form.id);
    try {
      const { url } = await callEncyclopediaDownload(form.id, 'view');
      const viewerUrl = form.file_type === 'docx'
        ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`
        : url;
      window.open(viewerUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      showErrorToast('encyclopedia_preview_form', e, 'تعذّر فتح المعاينة. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'الموسوعة القانونية');
    }
    setPreviewingFormId(null);
  };

  return {
    categories, forms, loadingEncyclopedia, fetchEncyclopedia,
    downloadingFormId, handleDownloadForm,
    previewingFormId, handlePreviewForm,
  };
}
