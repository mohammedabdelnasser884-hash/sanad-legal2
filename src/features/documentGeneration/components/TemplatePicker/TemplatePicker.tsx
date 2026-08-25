// ══════════════════════════════════════════════════════════════════
// TemplatePicker.tsx — القسم 9.1 (شريط الفلترة + شبكة القوالب + حالاتها)
// ══════════════════════════════════════════════════════════════════

import React from 'react';
import { I } from '../../../../constants';
import { Sel } from '@/shared/ui/Sel';
import TemplateCard from './TemplateCard';
import { useDocumentTemplates, DOCUMENT_CATEGORIES } from '../../hooks/useDocumentTemplates';
import type { DocumentTemplate } from '../../types';

interface TemplatePickerProps {
  onSelectTemplate: (template: DocumentTemplate) => void;
}

export default function TemplatePicker({ onSelectTemplate }: TemplatePickerProps) {
  const { filteredTemplates, loading, error, search, setSearch, category, setCategory, reload, isSearchActive } = useDocumentTemplates();

  return (
    <div className="space-y-4">
      {/* شريط البحث الموحّد (القسم 5.1): بحث فعّال بيدوّر في كل التصنيفات
          ويعطّل فلتر التصنيف مؤقتًا — التصنيف يرجع يشتغل تاني أول ما البحث يتمسح */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          data-testid="doc-gen-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم أو وصف أي مستند، من كل التصنيفات..."
          className="w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 transition-colors"
          style={{ fontFamily: 'Cairo,sans-serif' }}
        />
        <div className="sm:w-48">
          <Sel
            testId="doc-gen-category-filter"
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
            options={['الكل', ...DOCUMENT_CATEGORIES]}
            disabled={isSearchActive}
          />
        </div>
      </div>
      {isSearchActive && (
        <p className="text-[10px] text-slate-500 -mt-2">نتايج البحث من كل التصنيفات — امسح البحث للرجوع للتصفح بالتصنيف</p>
      )}

      {/* حالة التحميل */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      )}

      {/* حالة الخطأ */}
      {!loading && error && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="text-xs text-rose-400 font-bold">{error}</span>
          <button
            onClick={reload}
            className="px-4 py-2 rounded-xl text-[11px] font-black text-purple-300 bg-purple-500/10 border border-purple-500/20"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* شبكة القوالب */}
      {!loading && !error && filteredTemplates.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredTemplates.map((t) => (
            <TemplateCard key={t.id} template={t} onClick={() => onSelectTemplate(t)} />
          ))}
        </div>
      )}

      {/* حالة القائمة الفارغة (فلترة فقط — الأربعة موجودين دايمًا) */}
      {!loading && !error && filteredTemplates.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <I.Folder className="w-8 h-8 text-slate-600" />
          <span className="text-xs text-slate-500 font-bold">مفيش قوالب مطابقة</span>
          <button
            onClick={() => { setSearch(''); setCategory('الكل'); }}
            className="px-4 py-2 rounded-xl text-[11px] font-bold text-slate-400 bg-white/5 border border-white/10"
          >
            امسح الفلاتر
          </button>
        </div>
      )}
    </div>
  );
}
