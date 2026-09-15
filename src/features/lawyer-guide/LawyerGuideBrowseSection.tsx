import React, { useState } from 'react';
import { I } from '../../constants';
import { useNestedModalBackButton } from '../../shared/lib/useNestedModalBackButton';
import type { LawyerGuideCategoryRow, LawyerGuideLinkRow } from '../../types';

interface LawyerGuideBrowseSectionProps {
  loadingLawyerGuide: boolean;
  categories: LawyerGuideCategoryRow[];
  links: LawyerGuideLinkRow[];
  onOpenLink: (link: LawyerGuideLinkRow) => void;
  // ⚡ NEW: نفس فكرة onManageEncyclopedia بالظبط — بيظهر بس لحساب
  // السوبر أدمن الوحيد (isAISuperAdmin في App.tsx)، وبينقّل لنفس شاشة
  // إدارة دليل المحامي في لوحة الإدارة (قسم 'lawyer_guide').
  onManageLawyerGuide?: () => void;
}

// بطاقة رابط — نسخة عرض/فتح بس (بدون تعديل/حذف/ترتيب، ده مقصور على
// LawyerGuideSection.tsx بتاعة لوحة الإدارة). نفس هيكل FormCard بتاعة
// الموسوعة (row واحد، p-3.5، rounded-2xl) — بس بدون معاينة/تحميل، زرار
// واحد بس لفتح الرابط الخارجي.
function LinkCard({ link, onOpen, categoryLabel }: {
  link: LawyerGuideLinkRow;
  onOpen: () => void;
  categoryLabel?: string;
}) {
  return React.createElement('button', {
    key: link.id, onClick: onOpen, 'data-testid': 'lawyer-guide-link-card',
    className: 'w-full bg-premium-card border border-white/5 rounded-2xl p-3.5 flex items-center gap-3 text-right active:scale-[0.98] transition-transform',
  },
    React.createElement('div', {
      className: 'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-400/10 text-amber-400',
    }, React.createElement(I.ExternalLink)),
    React.createElement('div', { className: 'flex-1 min-w-0' },
      React.createElement('p', { className: 'text-xs font-black text-white leading-tight truncate' }, link.title),
      link.description && !categoryLabel && React.createElement('p', { className: 'text-[9.5px] text-slate-500 leading-snug line-clamp-1 mt-0.5' }, link.description),
      categoryLabel && React.createElement('span', { 'data-testid': 'lawyer-guide-search-result-category', className: 'inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-400/10 text-amber-400 mt-0.5' }, categoryLabel),
      React.createElement('div', { className: 'flex items-center gap-2 mt-1 flex-wrap' },
        link.entity_type && React.createElement('span', { className: 'text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400' }, link.entity_type),
        link.last_verified_at && React.createElement('span', { className: 'text-[9px] text-slate-600' }, `آخر مراجعة: ${link.last_verified_at}`)
      )
    ),
    React.createElement(I.ChevronLeft)
  );
}

// بطاقة تصنيف — مستوى واحد بس (بدون مستوى فرعي، مطابق لـCategoryCard
// بتاعة لوحة الإدارة — دليل المحامي مالوش تصنيفات متداخلة زي الموسوعة).
function CategoryCard({ category, linksCount, onOpen }: {
  category: LawyerGuideCategoryRow;
  linksCount: number;
  onOpen: () => void;
}) {
  return React.createElement('button', {
    key: category.id, onClick: onOpen, 'data-testid': 'lawyer-guide-category-card',
    className: 'w-full bg-premium-card border border-white/5 rounded-2xl p-3.5 flex items-center gap-3 text-right active:scale-[0.98] transition-transform',
  },
    React.createElement('div', {
      className: 'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-400/10 text-amber-400 text-base',
    }, category.icon || React.createElement(I.Scale)),
    React.createElement('div', { className: 'flex-1 min-w-0' },
      React.createElement('p', { className: 'text-xs font-black text-white leading-tight truncate' }, category.name_ar),
      React.createElement('p', { className: 'text-[9.5px] text-slate-500 mt-0.5' }, `${linksCount} رابط`)
    ),
    React.createElement(I.ChevronLeft)
  );
}

function LawyerGuideBrowseSection({
  loadingLawyerGuide, categories, links, onOpenLink, onManageLawyerGuide,
}: LawyerGuideBrowseSectionProps) {
  // مستوى واحد بس — activeCategoryId يمثل التصنيف المفتوح حاليًا، null = القائمة الرئيسية
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  // بحث خاص بدليل المحامي — بيدوّر في عنوان/وصف كل الروابط بغض النظر عن
  // التصنيف الحالي، نفس نمط بحث الصيغ والنماذج بالظبط.
  const [searchQuery, setSearchQuery] = useState('');

  const activeCategory = categories.find((c) => c.id === activeCategoryId) || null;
  const linksOf = (categoryId: string) => links.filter((l) => l.category_id === categoryId);

  useNestedModalBackButton(activeCategory !== null, () => setActiveCategoryId(null));

  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length > 0;
  const searchResults = isSearching
    ? links.filter((l) =>
        l.title.toLowerCase().includes(trimmedQuery.toLowerCase())
        || (l.description || '').toLowerCase().includes(trimmedQuery.toLowerCase())
      )
    : [];
  const categoryLabelFor = (categoryId: string) =>
    categories.find((c) => c.id === categoryId)?.name_ar || '';
  useNestedModalBackButton(isSearching, () => setSearchQuery(''));

  if (loadingLawyerGuide) {
    return React.createElement('div', { className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs' },
      React.createElement(I.Spin), React.createElement('span', { className: 'mr-2' }, 'جاري التحميل...')
    );
  }

  return React.createElement('div', { className: 'space-y-3 fade-in' },

    // شرح بسيط — ظاهر بس في الصفحة الجذرية (التصنيفات الرئيسية)
    !activeCategory && React.createElement('div', { className: 'bg-premium-card border border-teal-500/15 rounded-2xl p-3.5' },
      React.createElement('div', { className: 'flex items-start gap-2.5' },
        React.createElement('div', { className: 'w-8 h-8 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 shrink-0' },
          React.createElement(I.Scale)
        ),
        React.createElement('p', { className: 'flex-1 text-[11px] text-slate-400 leading-relaxed' },
          'دليل خدمات رسمية قابل للبحث (وزارة العدل، الشهر العقاري، الضرائب وغيرها)، منظّم في تصنيفات.'
        )
      )
    ),

    // ── زرار "إدارة دليل المحامي" — يظهر بس لحساب السوبر أدمن ──
    onManageLawyerGuide && React.createElement('button', {
      onClick: onManageLawyerGuide, 'data-testid': 'lawyer-guide-manage-button',
      className: 'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 text-[11px] font-black active:scale-95 transition-transform',
    }, React.createElement(I.Scale), 'إدارة دليل المحامي'),

    // ── بحث خاص بدليل المحامي ──
    React.createElement('div', { className: 'relative' },
      React.createElement('input', {
        type: 'text', value: searchQuery,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value),
        placeholder: 'ابحث في دليل المحامي...', 'data-testid': 'lawyer-guide-search-input',
        className: 'w-full bg-premium-card border border-white/10 rounded-xl py-2.5 pr-3.5 pl-9 text-[11px] font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-400/40',
      }),
      isSearching && React.createElement('button', {
        onClick: () => setSearchQuery(''), 'data-testid': 'lawyer-guide-search-clear',
        className: 'absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-slate-300',
        'aria-label': 'مسح البحث',
      }, '×')
    ),

    // ── وضع البحث: نتيجة مسطّحة، بتحجب التنقل بالتصنيفات مؤقتًا ──
    isSearching && (
      searchResults.length === 0
        ? React.createElement('div', { 'data-testid': 'lawyer-guide-search-empty', className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs' }, 'مفيش نتايج مطابقة')
        : searchResults.map((link) => React.createElement(LinkCard, {
            key: link.id, link, onOpen: () => onOpenLink(link),
            categoryLabel: categoryLabelFor(link.category_id),
          }))
    ),

    // ── مسار التنقل (Breadcrumb) + زرار رجوع صريح ──
    !isSearching && activeCategory && React.createElement('div', { className: 'flex items-center gap-2' },
      React.createElement('button', {
        onClick: () => setActiveCategoryId(null), 'data-testid': 'lawyer-guide-back-button',
        className: 'w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 shrink-0 active:scale-90 transition-transform',
        'aria-label': 'رجوع',
      }, React.createElement(I.ChevronRight, { className: 'w-4 h-4' })),
      React.createElement('div', { className: 'flex items-center gap-1.5 text-[11px] font-bold flex-wrap' },
        React.createElement('button', {
          onClick: () => setActiveCategoryId(null),
          'data-testid': 'lawyer-guide-breadcrumb-root',
          className: 'text-slate-400 hover:text-white',
        }, 'دليل المحامي'),
        React.createElement(I.ChevronLeft),
        React.createElement('span', { className: 'text-teal-400' }, activeCategory.name_ar)
      )
    ),

    // ── المستوى الجذري: التصنيفات ──
    !isSearching && !activeCategory && (
      categories.length === 0
        ? React.createElement('div', { 'data-testid': 'lawyer-guide-empty', className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs' }, 'لا توجد تصنيفات مضافة بعد')
        : categories.map((cat) => React.createElement(CategoryCard, {
            key: cat.id, category: cat, linksCount: linksOf(cat.id).length,
            onOpen: () => setActiveCategoryId(cat.id),
          }))
    ),

    // ── داخل تصنيف: روابطه (بالترتيب اليدوي اللي الأدمن ضبطه) ──
    !isSearching && activeCategory && (
      linksOf(activeCategory.id).length === 0
        ? React.createElement('div', { 'data-testid': 'lawyer-guide-empty', className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs' }, 'التصنيف فارغ حاليًا')
        : linksOf(activeCategory.id).map((link) => React.createElement(LinkCard, {
            key: link.id, link, onOpen: () => onOpenLink(link),
          }))
    )
  );
}

export default LawyerGuideBrowseSection;
