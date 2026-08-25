// ══════════════════════════════════════════════════════════════════
// useDocumentTemplates.ts — جلب/فلترة القوالب (القسم 2 + القسم 9.1)
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getActiveTemplates } from '../api/templatesApi';
import type { DocumentTemplate } from '../types';

// التصنيفات الأربعة الوحيدة (القسم 5) — بدون إضافة أي تصنيف تاني (القسم 9.1)
export const DOCUMENT_CATEGORIES = ['إنذارات', 'توكيلات', 'عرائض', 'طلبات'] as const;
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

export function useDocumentTemplates(): UseDocumentTemplatesResult {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState<DocumentCategoryFilter>('الكل');

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
    return templates.filter((t) => category === 'الكل' || t.category === category);
  }, [templates, debouncedSearch, category]);

  const isSearchActive = debouncedSearch.trim() !== '';

  return { templates, filteredTemplates, loading, error, search, setSearch, category, setCategory, reload: load, isSearchActive };
}
