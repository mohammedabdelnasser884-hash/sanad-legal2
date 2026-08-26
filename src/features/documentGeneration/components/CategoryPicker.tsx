// ══════════════════════════════════════════════════════════════════
// CategoryPicker.tsx — القسم 6 + القسم 9 (أولوية 3) من
// Sanad_Legal_Documents_Master_Report.md
//
// خطوة "① القسم" الجديدة — شبكة كاردز التصنيفات + كارت "حافظة مستندات"
// منفصل (بينقّل بره الويزارد تمامًا لتاب المستندات الموجود فعليًا،
// مش بيدخل توليد مستند خالص — القسم 8.2).
//
// ⚠️ قرار تصميم (مش سؤال مفتوح — مستنتج مباشرة من رسم القسم 6 في
// التقرير): شريط البحث الموحّد اتحط هنا، فوق شبكة التصنيفات، مش في
// TemplatePicker — عشان يقدر "يقفز مباشرة لنتائج من كل التصنيفات" من
// غير ما يحتاج المستخدم يختار تصنيف الأول (ده بالظبط اللي عوّض زرار
// "+ مستند جديد" القديم اللي اتشال — سجل القرارات بند 2). البحث
// الموحّد اللي كان جوه TemplatePicker.tsx (أولوية 1، لسه موجود هناك)
// فضل زي ما هو تمامًا وبيشتغل بس في مسار الدخول من قضية مفتوحة
// (hasCaseContext) اللي بيتخطى الشاشة دي بالكامل — صفر تغيير في
// السلوك ده، وصفر خطر على e2e/document-generation.spec.ts الموجود.
// ══════════════════════════════════════════════════════════════════

import React from 'react';
import { I } from '../../../constants';
import TemplateCard from './TemplatePicker/TemplateCard';
import { useDocumentTemplates, DOCUMENT_CATEGORIES } from '../hooks/useDocumentTemplates';
import type { DocumentTemplate } from '../types';

// ألوان بادچ لكل تصنيف — لو تصنيف جديد اتضاف من غير ما يتسجل هنا،
// بيرجع للـfallback الرمادي (نفس منطق CATEGORY_BADGE_STYLE في
// TemplateCard.tsx) من غير ما يكسر أي حاجة.
const CATEGORY_CARD_STYLE: Record<string, string> = {
  'إنذارات':     'bg-rose-500/10 text-rose-300 border-rose-500/20',
  'توكيلات':     'bg-blue-500/10 text-blue-300 border-blue-500/20',
  'عرائض':       'bg-amber-500/10 text-amber-300 border-amber-500/20',
  'طلبات':       'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  'إعلانات':     'bg-purple-500/10 text-purple-300 border-purple-500/20',
  'أشكال':       'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
  'تظلمات':      'bg-orange-500/10 text-orange-300 border-orange-500/20',
  'جنح مباشرة':  'bg-red-500/10 text-red-300 border-red-500/20',
  'عقود':        'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
};

interface CategoryPickerProps {
  onSelectCategory: (category: (typeof DOCUMENT_CATEGORIES)[number]) => void;
  /** البحث الموحّد بيقفز مباشرة لقالب من غير المرور بخطوة "المستند" جوه تصنيف مقفول */
  onSelectTemplate: (template: DocumentTemplate) => void;
  /** كارت "حافظة مستندات" — تنقّل بره الويزارد بالكامل (القسم 8.2)، مش توليد */
  onOpenArchive: () => void;
}

export default function CategoryPicker({ onSelectCategory, onSelectTemplate, onOpenArchive }: CategoryPickerProps) {
  const { filteredTemplates, loading, error, search, setSearch, reload, isSearchActive } = useDocumentTemplates();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-black text-white">المستندات القانونية</h3>
        <p className="text-[10px] text-slate-500 mt-1">اختر تصنيف، أو ابحث عن اسم المستند مباشرة</p>
      </div>

      {/* شريط البحث الموحّد (القسم 5.1 + 6) — بيدوّر في كل التصنيفات دفعة واحدة */}
      <input
        data-testid="doc-gen-category-search-input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ابحث باسم أو وصف أي مستند، من كل التصنيفات..."
        className="w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 transition-colors"
        style={{ fontFamily: 'Cairo,sans-serif' }}
      />

      {isSearchActive ? (
        <>
          <p className="text-[10px] text-slate-500 -mt-2">نتايج البحث من كل التصنيفات — امسح البحث للرجوع لتصفح التصنيفات</p>

          {loading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          )}

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

          {!loading && !error && filteredTemplates.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredTemplates.map((t) => (
                <TemplateCard key={t.id} template={t} onClick={() => onSelectTemplate(t)} />
              ))}
            </div>
          )}

          {!loading && !error && filteredTemplates.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <I.Folder className="w-8 h-8 text-slate-600" />
              <span className="text-xs text-slate-500 font-bold">مفيش مستندات مطابقة</span>
              <button
                onClick={() => setSearch('')}
                className="px-4 py-2 rounded-xl text-[11px] font-bold text-slate-400 bg-white/5 border border-white/10"
              >
                امسح البحث
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div data-testid="doc-gen-category-grid" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {DOCUMENT_CATEGORIES.map((cat) => {
              const style = CATEGORY_CARD_STYLE[cat] ?? 'bg-white/10 text-slate-300 border-white/10';
              return (
                <button
                  key={cat}
                  data-testid={`doc-gen-category-card-${cat}`}
                  onClick={() => onSelectCategory(cat)}
                  className={`text-right p-4 rounded-2xl border transition-all active:scale-[0.98] hover:opacity-90 ${style}`}
                >
                  <span className="text-xs font-black leading-snug">{cat}</span>
                </button>
              );
            })}
          </div>

          {/* كارت "حافظة مستندات" — منفصل بصريًا ووظيفيًا عن شبكة التصنيفات (القسم 6/8.2) */}
          <button
            data-testid="doc-gen-archive-card"
            onClick={onOpenArchive}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-premium-card border border-white/10 hover:border-purple-500/30 transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-2">
              <I.Folder className="w-5 h-5 text-slate-400" />
              <div className="text-right">
                <span className="block text-xs font-black text-white">حافظة مستندات</span>
                <span className="block text-[10px] text-slate-500 mt-0.5">أرشفة مستند جاهز عندك بالفعل — مش توليد</span>
              </div>
            </div>
            <I.ChevronRight className="w-4 h-4 text-slate-600 rotate-180" />
          </button>
        </>
      )}
    </div>
  );
}
