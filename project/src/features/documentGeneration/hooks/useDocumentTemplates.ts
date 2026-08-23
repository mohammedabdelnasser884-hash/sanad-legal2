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

  const filteredTemplates = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return templates.filter((t) => {
      const matchesCategory = category === 'الكل' || t.category === category;
      const matchesSearch = q === '' || t.name_ar.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [templates, debouncedSearch, category]);

  return { templates, filteredTemplates, loading, error, search, setSearch, category, setCategory, reload: load };
}
