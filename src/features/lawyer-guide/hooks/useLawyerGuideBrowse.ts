import { useState, useCallback } from 'react';
import { db } from '../../../supabaseClient';
import type { LawyerGuideCategoryRow, LawyerGuideLinkRow } from '../../../types';

// هوك تصفح "دليل المحامي" لأي مستخدم (مش سوبر أدمن بس) — قراءة فقط،
// مفيش أي كتابة على lawyer_guide_categories/lawyer_guide_links هنا خالص
// (ده دور useAdminLawyerGuide حصريًا في لوحة الإدارة). نفس فكرة
// useEncyclopediaBrowse بالظبط، بس أبسط: مفيش تحميل ملفات هنا خالص —
// كل رابط بيتفتح مباشرة في تاب جديد (window.open)، فمفيش داعي لأي
// Edge Function وسيطة زي encyclopedia-download (الروابط مش ملفات في
// باكت private، هي روابط خارجية عادية).
export function useLawyerGuideBrowse() {
  const [categories, setCategories] = useState<LawyerGuideCategoryRow[]>([]);
  const [links, setLinks] = useState<LawyerGuideLinkRow[]>([]);
  const [loadingLawyerGuide, setLoadingLawyerGuide] = useState(false);

  // ── جلب التصنيفات + الروابط (قراءة مباشرة — RLS مفتوحة لأي authenticated) ──
  // الروابط بتتجاب مرتّبة بالترتيب اليدوي (sort_order) اللي الأدمن ضبطه،
  // نفس ترتيب useAdminLawyerGuide بالظبط.
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

  // ── فتح رابط خارجي: تاب جديد، من غير أي تتبّع أو عداد (بعكس تحميل
  // نماذج الموسوعة اللي بيزوّد download_count) — الرابط عام أصلاً. ──
  const handleOpenLink = (link: LawyerGuideLinkRow) => {
    window.open(link.url, '_blank', 'noopener,noreferrer');
  };

  return { categories, links, loadingLawyerGuide, fetchLawyerGuide, handleOpenLink };
}
