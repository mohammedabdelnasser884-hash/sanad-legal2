// ══════════════════════════════════════════════════════════════════
// useDocumentTemplates.ts — جلب/فلترة القوالب (القسم 2 + القسم 9.1)
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getActiveTemplates } from '../api/templatesApi';
import type { DocumentTemplate } from '../types';

// 8 تصنيفات (كانت 9 — "توكيلات" اتشالت من الإنتاج، قرار 23.2/23.3 من
// التقرير: جلسة كود منفصلة، 26 أغسطس 2026). الباقي: الثلاثة الأصليين
// المتبقيين + الخمسة الجداد (إعلانات/أشكال/تظلمات/جنح مباشرة/عقود).
export const DOCUMENT_CATEGORIES = [
  'إنذارات', 'عرائض', 'طلبات',
  'إعلانات', 'أشكال', 'تظلمات', 'جنح مباشرة', 'عقود',
] as const;
export type DocumentCategoryFilter = 'الكل' | (typeof DOCUMENT_CATEGORIES)[number];

interface UseDocumentTemplatesResult {
  templates: DocumentTemplate[];
  filteredTemplates: DocumentTemplate[];
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (v: string) => void;
  category: DocumentCategoryFilter;
  setCategory: (v: DocumentCategoryFilter) => void;
  reload: () => void;
  /** true لما فيه نص بحث فعّال — يعني الفلترة دلوقتي متجاوزة فلتر التصنيف وبتدوّر في كل القوالب */
  isSearchActive: boolean;
}

// initialCategory: يُستخدم من TemplatePicker.tsx لما يكون داخل بـlockedCategory
// (خطوة "المستند" جوه تصنيف مقفول — أولوية 3) عشان يبدأ مفلتر على التصنيف ده
// مباشرة بدل 'الكل'. اختياري — بدون تمريره، السلوك زي ما كان بالظبط ('الكل').
//
// categoryPriority: أولوية 4 (القسم 5.1) — لو موجودة، بترتّب filteredTemplates
// بحيث القوالب اللي تصنيفها في القايمة ديه تطلع الأول (بنفس ترتيب القايمة)،
// من غير ما تخفي أي قالب تاني — sort مستقر (stable) بس، مش filter. بتتجاهل
// تمامًا لو فيه lockedCategory (initialCategory) أو بحث فعّال، لأنهم أصلًا
// بيحصروا/يرتبوا النتايج بمنطق مختلف مش له علاقة بنوع القضية.
export function useDocumentTemplates(
  initialCategory?: DocumentCategoryFilter,
  categoryPriority?: Exclude<DocumentCategoryFilter, 'الكل'>[],
): UseDocumentTemplatesResult {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState<DocumentCategoryFilter>(initialCategory ?? 'الكل');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getActiveTemplates()
      .then(setTemplates)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'تعذّر تحميل القوالب'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // debounce 300ms على حقل البحث (القسم 9.1)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // بحث موحّد (القسم 5.1): لو فيه نص بحث، بيدوّر في اسم/وصف كل القوالب مهما
  // كان تصنيفهم — بيتجاوز فلتر التصنيف مؤقتًا. لو حقل البحث فاضي، بيرجع
  // يشتغل بفلتر التصنيف العادي زي ما كان.
  const filteredTemplates = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (q !== '') {
      return templates.filter((t) => {
        const nameMatch = t.name_ar.toLowerCase().includes(q);
        const descMatch = (t.description ?? '').toLowerCase().includes(q);
        return nameMatch || descMatch;
      });
    }
    const base = templates.filter((t) => category === 'الكل' || t.category === category);

    // أولوية 4: الترتيب حسب نوع القضية بيتطبّق بس لما مفيش تصنيف مقفول
    // (category === 'الكل') ومفيش initialCategory ثابت جاي من lockedCategory —
    // يعني بس في مسار hasCaseContext من غير قفل تصنيف (القسم 9 "منطق الدخول").
    if (category === 'الكل' && !initialCategory && categoryPriority && categoryPriority.length > 0) {
      const rank = (cat: string) => {
        const idx = categoryPriority.indexOf(cat as (typeof categoryPriority)[number]);
        return idx === -1 ? categoryPriority.length : idx;
      };
      // Array.prototype.sort مستقر (ES2019+) — القوالب اللي مالهاش أولوية
      // بتفضل بترتيبها الأصلي بعد اللي ليها أولوية، مش بتتخفي.
      return [...base].sort((a, b) => rank(a.category) - rank(b.category));
    }

    return base;
  }, [templates, debouncedSearch, category, initialCategory, categoryPriority]);

  const isSearchActive = debouncedSearch.trim() !== '';

  return { templates, filteredTemplates, loading, error, search, setSearch, category, setCategory, reload: load, isSearchActive };
}
