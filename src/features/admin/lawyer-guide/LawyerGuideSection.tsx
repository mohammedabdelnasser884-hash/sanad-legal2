import React, { useState } from 'react';
import { I } from '../../../constants';
import { useNestedModalBackButton } from '../../../shared/lib/useNestedModalBackButton';
import type { LawyerGuideCategoryRow, LawyerGuideLinkRow } from '../../../types';

interface LawyerGuideSectionProps {
  loadingLawyerGuide: boolean;
  guideCategories: LawyerGuideCategoryRow[];
  guideLinks: LawyerGuideLinkRow[];
  setEditingGuideCategory: React.Dispatch<React.SetStateAction<LawyerGuideCategoryRow | null>>;
  setShowGuideCategoryModal: React.Dispatch<React.SetStateAction<boolean>>;
  setConfirmDeleteGuideCategory: React.Dispatch<React.SetStateAction<LawyerGuideCategoryRow | null>>;
  setEditingGuideLink: React.Dispatch<React.SetStateAction<LawyerGuideLinkRow | null>>;
  setGuideLinkModalCategoryId: React.Dispatch<React.SetStateAction<string | null>>;
  setShowGuideLinkModal: React.Dispatch<React.SetStateAction<boolean>>;
  setConfirmDeleteGuideLink: React.Dispatch<React.SetStateAction<LawyerGuideLinkRow | null>>;
  reordering: boolean;
  handleReorderGuideLink: (link: LawyerGuideLinkRow, direction: 'up' | 'down') => void;
}

// بطاقة رابط — بتتكرر جوه أي تصنيف مفتوح. أزرار "لأعلى/لأسفل" اختيارية
// (بترتيب يدوي — قرار #1 محسوم) بتظهر بس جوه تصنيف مفتوح، مش في نتائج
// البحث اللي بتخلط روابط من تصنيفات مختلفة (الترتيب هناك مالوش معنى).
function LinkCard({ link, onEdit, onDelete, onMoveUp, onMoveDown, reordering }: {
  link: LawyerGuideLinkRow;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  reordering?: boolean;
}) {
  return React.createElement('div', {
    key: link.id, 'data-testid': 'admin-lawyer-guide-link-card',
    className: 'bg-premium-card border border-white/5 rounded-2xl p-3.5 space-y-2',
  },
    React.createElement('div', { className: 'flex items-start gap-2.5' },
      (onMoveUp || onMoveDown) && React.createElement('div', { className: 'flex flex-col gap-1 shrink-0' },
        React.createElement('button', {
          onClick: onMoveUp, disabled: !onMoveUp || reordering,
          'data-testid': 'admin-lawyer-guide-link-move-up',
          className: 'w-6 h-6 rounded-md bg-white/5 border border-white/10 text-slate-300 flex items-center justify-center disabled:opacity-25 active:scale-90 transition-transform',
        }, React.createElement('svg', { className: 'w-3 h-3', fill: 'none', viewBox: '0 0 24 24', strokeWidth: '2.5', stroke: 'currentColor' },
          React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M4.5 15.75l7.5-7.5 7.5 7.5' }))),
        React.createElement('button', {
          onClick: onMoveDown, disabled: !onMoveDown || reordering,
          'data-testid': 'admin-lawyer-guide-link-move-down',
          className: 'w-6 h-6 rounded-md bg-white/5 border border-white/10 text-slate-300 flex items-center justify-center disabled:opacity-25 active:scale-90 transition-transform',
        }, React.createElement('svg', { className: 'w-3 h-3', fill: 'none', viewBox: '0 0 24 24', strokeWidth: '2.5', stroke: 'currentColor' },
          React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M19.5 8.25l-7.5 7.5-7.5-7.5' })))
      ),
      React.createElement('div', { className: 'w-8 h-8 rounded-xl bg-amber-400/10 flex items-center justify-center text-amber-400 shrink-0' },
        React.createElement(I.ExternalLink)
      ),
      React.createElement('div', { className: 'flex-1 min-w-0' },
        React.createElement('p', { className: 'text-xs font-black text-white leading-snug' }, link.title),
        link.description && React.createElement('p', { className: 'text-[10px] text-slate-500 mt-0.5 leading-relaxed' }, link.description),
        React.createElement('a', {
          href: link.url, target: '_blank', rel: 'noopener noreferrer', dir: 'ltr',
          className: 'text-[9.5px] text-teal-400 mt-1 block truncate hover:underline',
        }, link.url),
        React.createElement('div', { className: 'flex items-center gap-2 mt-1 flex-wrap' },
          link.entity_type && React.createElement('span', { className: 'text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400' }, link.entity_type),
          link.last_verified_at && React.createElement('span', { className: 'text-[9px] text-slate-600' }, `آخر مراجعة: ${link.last_verified_at}`)
        )
      )
    ),
    React.createElement('div', { className: 'flex items-center gap-2 pt-1' },
      React.createElement('button', {
        onClick: onEdit, 'data-testid': 'admin-lawyer-guide-link-edit',
        className: 'flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-[11px] font-bold active:scale-95 transition-transform',
      }, React.createElement(I.Edit), 'تعديل'),
      React.createElement('button', {
        onClick: onDelete, 'data-testid': 'admin-lawyer-guide-link-delete',
        className: 'flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-bold active:scale-95 transition-transform',
      }, React.createElement(I.Trash), 'حذف')
    )
  );
}

// بطاقة تصنيف — مستوى واحد بس (بدون مستوى فرعي، بعكس مجلدات الموسوعة القانونية)
function CategoryCard({ category, linksCount, onOpen, onEdit, onDelete }: {
  category: LawyerGuideCategoryRow;
  linksCount: number;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return React.createElement('div', {
    key: category.id, 'data-testid': 'admin-lawyer-guide-category-card',
    className: 'bg-premium-card border border-white/5 rounded-2xl p-3.5 flex items-center gap-3',
  },
    React.createElement('button', {
      onClick: onOpen, className: 'flex-1 flex items-center gap-3 text-right min-w-0',
      'data-testid': 'admin-lawyer-guide-category-open',
    },
      React.createElement('div', { className: 'w-9 h-9 rounded-xl bg-amber-400/10 flex items-center justify-center text-amber-400 shrink-0 text-base' },
        category.icon || React.createElement(I.Scale)
      ),
      React.createElement('div', { className: 'flex-1 min-w-0' },
        React.createElement('p', { className: 'text-xs font-black text-white leading-tight truncate' }, category.name_ar),
        React.createElement('p', { className: 'text-[9.5px] text-slate-500 mt-0.5' }, `${linksCount} رابط`)
      ),
      React.createElement(I.ChevronLeft)
    ),
    React.createElement('button', {
      onClick: onEdit, 'data-testid': 'admin-lawyer-guide-category-edit',
      className: 'w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-slate-300 flex items-center justify-center shrink-0 active:scale-95 transition-transform',
    }, React.createElement(I.Edit)),
    React.createElement('button', {
      onClick: onDelete, 'data-testid': 'admin-lawyer-guide-category-delete',
      className: 'w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0 active:scale-95 transition-transform',
    }, React.createElement(I.Trash))
  );
}

function LawyerGuideSection({
  loadingLawyerGuide, guideCategories, guideLinks,
  setEditingGuideCategory, setShowGuideCategoryModal, setConfirmDeleteGuideCategory,
  setEditingGuideLink, setGuideLinkModalCategoryId, setShowGuideLinkModal, setConfirmDeleteGuideLink,
  reordering, handleReorderGuideLink,
}: LawyerGuideSectionProps) {
  // مستوى واحد بس — activeCategoryId يمثل التصنيف المفتوح حاليًا، null = القائمة الرئيسية
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const activeCategory = guideCategories.find((c) => c.id === activeCategoryId) || null;
  const linksOf = (categoryId: string) => guideLinks.filter((l) => l.category_id === categoryId);

  // بحث موحّد في العنوان/الوصف عبر كل التصنيفات دفعة واحدة (نفس نمط بحث الصيغ والنماذج)
  const searchResults = search.trim()
    ? guideLinks.filter((l) => {
        const q = search.trim().toLowerCase();
        return l.title.toLowerCase().includes(q) || (l.description || '').toLowerCase().includes(q);
      })
    : null;

  useNestedModalBackButton(!!activeCategory, () => setActiveCategoryId(null));

  if (loadingLawyerGuide) {
    return React.createElement('div', { className: 'flex justify-center py-10' }, React.createElement(I.Spin));
  }

  return React.createElement('div', { className: 'space-y-3' },
    // ── شريط البحث ──
    React.createElement('div', { className: 'relative' },
      React.createElement('input', {
        value: search,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value),
        placeholder: 'ابحث في دليل المحامي...',
        'data-testid': 'admin-lawyer-guide-search',
        className: 'w-full p-3 pr-10 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600',
        style: { fontFamily: 'Cairo,sans-serif' },
      }),
      React.createElement('div', { className: 'absolute top-1/2 -translate-y-1/2 right-3 text-slate-500' }, React.createElement(I.Search))
    ),

    // ── نتائج البحث (تتخطى شكل التصنيفات كله) ──
    searchResults && React.createElement(React.Fragment, null,
      searchResults.length === 0
        ? React.createElement('div', { 'data-testid': 'admin-lawyer-guide-empty', className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs' }, 'لا توجد نتائج')
        : searchResults.map((link) => React.createElement(LinkCard, {
            key: link.id, link,
            onEdit: () => { setEditingGuideLink(link); setGuideLinkModalCategoryId(null); setShowGuideLinkModal(true); },
            onDelete: () => setConfirmDeleteGuideLink(link),
          }))
    ),

    // ── باقي الواجهة (تصنيفات/روابط) بس لما البحث فاضي ──
    !searchResults && React.createElement(React.Fragment, null,
      // ── Breadcrumb ──
      activeCategory && React.createElement('div', { className: 'flex items-center gap-1.5 text-[11px] font-bold' },
        React.createElement('button', {
          onClick: () => setActiveCategoryId(null),
          className: 'text-slate-400 hover:text-white',
        }, 'دليل المحامي'),
        React.createElement(I.ChevronLeft),
        React.createElement('span', { className: 'text-amber-400' }, activeCategory.name_ar)
      ),

      // ── أزرار الإضافة ──
      React.createElement('div', { className: 'flex items-center gap-2' },
        !activeCategory && React.createElement('button', {
          onClick: () => { setEditingGuideCategory(null); setShowGuideCategoryModal(true); },
          'data-testid': 'admin-lawyer-guide-new-category',
          className: 'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 text-[11px] font-black active:scale-95 transition-transform',
        }, React.createElement(I.Plus), 'تصنيف جديد'),
        React.createElement('button', {
          onClick: () => { setEditingGuideLink(null); setGuideLinkModalCategoryId(activeCategory?.id || null); setShowGuideLinkModal(true); },
          'data-testid': 'admin-lawyer-guide-new-link',
          disabled: guideCategories.length === 0,
          className: 'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-teal-400/10 border border-teal-400/20 text-teal-400 text-[11px] font-black active:scale-95 transition-transform disabled:opacity-40',
        }, React.createElement(I.Plus), 'رابط جديد')
      ),

      // ── المستوى الجذري: التصنيفات ──
      !activeCategory && (
        guideCategories.length === 0
          ? React.createElement('div', { 'data-testid': 'admin-lawyer-guide-empty', className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs' }, 'لا توجد تصنيفات مضافة بعد')
          : guideCategories.map((cat) => React.createElement(CategoryCard, {
              key: cat.id, category: cat, linksCount: linksOf(cat.id).length,
              onOpen: () => setActiveCategoryId(cat.id),
              onEdit: () => { setEditingGuideCategory(cat); setShowGuideCategoryModal(true); },
              onDelete: () => setConfirmDeleteGuideCategory(cat),
            }))
      ),

      // ── داخل تصنيف: روابطه (بالترتيب اليدوي — أزرار لأعلى/لأسفل) ──
      activeCategory && (
        linksOf(activeCategory.id).length === 0
          ? React.createElement('div', { 'data-testid': 'admin-lawyer-guide-empty', className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs' }, 'التصنيف فارغ حاليًا')
          : linksOf(activeCategory.id).map((link, idx, arr) => React.createElement(LinkCard, {
              key: link.id, link, reordering,
              onEdit: () => { setEditingGuideLink(link); setGuideLinkModalCategoryId(null); setShowGuideLinkModal(true); },
              onDelete: () => setConfirmDeleteGuideLink(link),
              onMoveUp: idx > 0 ? () => handleReorderGuideLink(link, 'up') : undefined,
              onMoveDown: idx < arr.length - 1 ? () => handleReorderGuideLink(link, 'down') : undefined,
            }))
      )
    )
  );
}

export default LawyerGuideSection;
