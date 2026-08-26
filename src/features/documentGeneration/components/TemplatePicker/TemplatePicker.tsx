// ══════════════════════════════════════════════════════════════════
// TemplatePicker.tsx — القسم 9.1 (شريط الفلترة + شبكة القوالب + حالاتها)
// + القسم 9 (أولوية 3): prop اختياري lockedCategory لخطوة "② المستند"
// جوه تصنيف مقفول (داخل من CategoryPicker.tsx).
//
// ⚠️ لما lockedCategory مش موجود (مسار hasCaseContext من CaseDetailView —
// قسم 9 "منطق الدخول"): السلوك زي ما هو بالظبط قبل أولوية 3 — نفس
// الـtestids، نفس شريط البحث/الفلتر، نفس الشبكة. صفر تغيير سلوكي، عشان
// e2e/document-generation.spec.ts الموجود يفضل شغال من غير أي تعديل.
// ══════════════════════════════════════════════════════════════════

import React from 'react';
import { I } from '../../../../constants';
import { Sel } from '@/shared/ui/Sel';
import TemplateCard from './TemplateCard';
import TemplateRow from './TemplateRow';
import { useDocumentTemplates, DOCUMENT_CATEGORIES } from '../../hooks/useDocumentTemplates';
import type { DocumentCategoryFilter } from '../../hooks/useDocumentTemplates';
import type { DocumentTemplate } from '../../types';

interface TemplatePickerProps {
  onSelectTemplate: (template: DocumentTemplate) => void;
  /** لو موجود: خطوة "المستند" جوه تصنيف مقفول (أولوية 3) — يخفي dropdown
   * التصنيف وشريط البحث الموحّد، ويعرض صفوف (TemplateRow) مفلترة على
   * التصنيف ده بس بدل الشبكة الكاملة. */
  lockedCategory?: Exclude<DocumentCategoryFilter, 'الكل'>;
  /** أولوية 4 (القسم 5.1) — بيتجاهل تمامًا لو lockedCategory موجود؛ بيتطبّق
   * بس في مسار hasCaseContext (كل التصنيفات) عشان يرتّب القوالب الأكتر
   * صلة بنوع القضية أول الشبكة، من غير ما يخفي الباقي. */
  categoryPriority?: Exclude<DocumentCategoryFilter, 'الكل'>[];
}

export default function TemplatePicker({ onSelectTemplate, lockedCategory, categoryPriority }: TemplatePickerProps) {
  const { filteredTemplates, loading, error, search, setSearch, category, setCategory, reload, isSearchActive } =
    useDocumentTemplates(lockedCategory, categoryPriority);

  return (
    <div className="space-y-4">
      {!lockedCategory && (
        <>
          {/* شريط البحث الموحّد (القسم 5.1): بحث فعّال بيدوّر في كل التصنيفات
              ويعطّل فلتر التصنيف مؤقتًا — التصنيف يرجع يشتغل تاني أول ما البحث يتمسح.
              ⚠️ ده بس مسار hasCaseContext (قسم 9 "منطق الدخول") — البحث الموحّد
              الأساسي للمسار العادي بقى في CategoryPicker.tsx (راجع قسم 16). */}
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
        </>
      )}

      {/* حالة التحميل */}
      {loading && (
        <div className={lockedCategory ? 'space-y-2' : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3'}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={lockedCategory ? 'h-16 rounded-2xl bg-white/5 animate-pulse' : 'h-24 rounded-2xl bg-white/5 animate-pulse'} />
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

      {/* شبكة/قايمة القوالب */}
      {!loading && !error && filteredTemplates.length > 0 && (
        lockedCategory ? (
          <div className="space-y-2">
            {filteredTemplates.map((t) => (
              <TemplateRow key={t.id} template={t} onClick={() => onSelectTemplate(t)} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredTemplates.map((t) => (
              <TemplateCard key={t.id} template={t} onClick={() => onSelectTemplate(t)} />
            ))}
          </div>
        )
      )}

      {/* حالة القائمة الفارغة */}
      {!loading && !error && filteredTemplates.length === 0 && (
        lockedCategory ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <I.Folder className="w-8 h-8 text-slate-600" />
            <span className="text-xs text-slate-500 font-bold">مفيش مستندات في التصنيف ده لسه</span>
          </div>
        ) : (
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
        )
      )}
    </div>
  );
}
