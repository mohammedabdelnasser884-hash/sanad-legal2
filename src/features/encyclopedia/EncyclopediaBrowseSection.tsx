import React, { useState } from 'react';
import { I } from '../../constants';
import { useNestedModalBackButton } from '../../shared/lib/useNestedModalBackButton';
import type { EncyclopediaCategoryRow, EncyclopediaFormRow } from '../../types';

interface EncyclopediaBrowseSectionProps {
  loadingEncyclopedia: boolean;
  categories: EncyclopediaCategoryRow[];
  forms: EncyclopediaFormRow[];
  downloadingFormId: string | null;
  onDownload: (form: EncyclopediaFormRow) => void;
  previewingFormId: string | null;
  onPreview: (form: EncyclopediaFormRow) => void;
}

// بطاقة نموذج (ملف) — نسخة عرض/تحميل بس، بدون تعديل/حذف (ده مقصور على
// EncyclopediaSection.tsx بتاعة لوحة الإدارة). زرارين: معاينة (يفتح
// الملف للعرض بس، من غير ما يزوّد عداد التحميلات) وتحميل (زي ما كان).
// categoryLabel اختياري — بيتحط بس في نتائج البحث المسطّحة (context
// عن مكان النموذج، لأن نتيجة البحث بتظهر من غير التنقل جوه المجلدات).
function FormCard({ form, downloading, onDownload, previewing, onPreview, categoryLabel }: {
  form: EncyclopediaFormRow;
  downloading: boolean;
  onDownload: () => void;
  previewing: boolean;
  onPreview: () => void;
  categoryLabel?: string;
}) {
  return React.createElement('div', {
    key: form.id, 'data-testid': 'encyclopedia-form-card',
    className: 'bg-premium-card border border-white/5 rounded-2xl p-3.5 space-y-2',
  },
    React.createElement('div', { className: 'flex items-start gap-2.5' },
      React.createElement('div', { className: 'w-8 h-8 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 shrink-0' },
        React.createElement(I.Doc)
      ),
      React.createElement('div', { className: 'flex-1 min-w-0' },
        React.createElement('p', { className: 'text-xs font-black text-white leading-snug' }, form.title),
        form.description && React.createElement('p', { className: 'text-[10px] text-slate-500 mt-0.5 leading-relaxed' }, form.description),
        React.createElement('div', { className: 'flex items-center gap-1.5 flex-wrap mt-1' },
          React.createElement('span', { className: 'inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400 uppercase' }, form.file_type),
          categoryLabel && React.createElement('span', { 'data-testid': 'encyclopedia-search-result-category', className: 'inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-400/10 text-amber-400' }, categoryLabel)
        )
      )
    ),
    React.createElement('div', { className: 'flex items-center gap-2' },
      React.createElement('button', {
        onClick: onPreview, disabled: previewing || downloading, 'data-testid': 'encyclopedia-form-preview',
        className: 'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-[11px] font-black active:scale-95 transition-transform disabled:opacity-50',
      }, previewing ? React.createElement(I.Spin) : React.createElement(I.Eye), previewing ? 'جاري الفتح...' : 'معاينة'),
      React.createElement('button', {
        onClick: onDownload, disabled: downloading || previewing, 'data-testid': 'encyclopedia-form-download',
        className: 'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-teal-400/10 border border-teal-400/20 text-teal-400 text-[11px] font-black active:scale-95 transition-transform disabled:opacity-50',
      }, downloading ? React.createElement(I.Spin) : React.createElement(I.Download), downloading ? 'جاري التحميل...' : 'تحميل')
    )
  );
}

// بطاقة مجلد — للتنقل بس (فتح المجلد)، بدون تعديل/حذف.
function FolderCard({ category, formsCount, onOpen }: {
  category: EncyclopediaCategoryRow;
  formsCount: number;
  onOpen: () => void;
}) {
  return React.createElement('button', {
    key: category.id, onClick: onOpen, 'data-testid': 'encyclopedia-folder-card',
    className: 'w-full bg-premium-card border border-white/5 rounded-2xl p-3.5 flex items-center gap-3 text-right active:scale-[0.98] transition-transform',
  },
    React.createElement('div', { className: 'w-9 h-9 rounded-xl bg-amber-400/10 flex items-center justify-center text-amber-400 shrink-0' },
      React.createElement(I.Folder)
    ),
    React.createElement('div', { className: 'flex-1 min-w-0' },
      React.createElement('p', { className: 'text-xs font-black text-white leading-tight truncate' }, category.name_ar),
      React.createElement('p', { className: 'text-[9.5px] text-slate-500 mt-0.5' }, `${formsCount} نموذج`)
    ),
    React.createElement(I.ChevronLeft)
  );
}

function EncyclopediaBrowseSection({
  loadingEncyclopedia, categories, forms, downloadingFormId, onDownload,
  previewingFormId, onPreview,
}: EncyclopediaBrowseSectionProps) {
  // مستويين بس — activeCategoryId يمثل المجلد المفتوح حاليًا (رئيسي أو فرعي)، null = القائمة الرئيسية
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  // بحث خاص بالموسوعة — بيدوّر في عنوان/وصف كل النماذج بغض النظر عن
  // المجلد الحالي (مش محتاج تفتح المجلدات واحد واحد). نتيجة مسطّحة، مش
  // فلترة على المستوى الحالي بس.
  const [searchQuery, setSearchQuery] = useState('');

  const activeCategory = categories.find((c) => c.id === activeCategoryId) || null;
  const topLevel = categories.filter((c) => !c.parent_id);
  const subCategoriesOf = (parentId: string) => categories.filter((c) => c.parent_id === parentId);
  const formsOf = (categoryId: string) => forms.filter((f) => f.category_id === categoryId);
  const formsCountIncludingChildren = (categoryId: string) =>
    formsOf(categoryId).length + subCategoriesOf(categoryId).reduce((sum, c) => sum + formsOf(c.id).length, 0);

  // ── رجوع خطوة واحدة: من مجلد فرعي → مجلده الرئيسي، من مجلد رئيسي →
  // القائمة الجذرية. نفس الدالة تتنادى من زرار "رجوع" الظاهر في الشاشة
  // ومن زر رجوع الموبايل الفعلي تحت (تسلسل واحد متسق للاتنين). ──
  const goBackOneLevel = () => {
    setActiveCategoryId((current) => {
      const currentCategory = categories.find((c) => c.id === current) || null;
      return currentCategory ? currentCategory.parent_id : null;
    });
  };

  // ── زر الرجوع الفعلي بالموبايل: مسجّلين مستويين مستقلين عن بعض (بنفس
  // آلية registerNestedModal المستخدمة أصلاً لمودالات فرعية جوه مودالات
  // رئيسية) عشان الضغطة الأولى ترجع من الفرعي للرئيسي بس، مش تقفل التاب
  // كله دفعة واحدة. لازم نفصل بين "داخل أي مجلد" (يشمل الاتنين) و"داخل
  // فرعي تحديدًا" عشان يتسجلوا كخطوتين منفصلتين في الـstack. ──
  const isInsideAnyFolder = activeCategory !== null;
  const isInsideSubFolder = activeCategory !== null && activeCategory.parent_id !== null;
  useNestedModalBackButton(isInsideAnyFolder, () => setActiveCategoryId(null));
  useNestedModalBackButton(isInsideSubFolder, () => {
    if (activeCategory?.parent_id) setActiveCategoryId(activeCategory.parent_id);
  });

  // ── البحث: نتيجة مسطّحة عبر كل النماذج (مش مقصورة على المجلد المفتوح
  // حاليًا)، من غير أي استعلام إضافي — البيانات كلها محمّلة أصلاً
  // (fetchEncyclopedia بيجيب الكل مرة واحدة). زر رجوع الموبايل وقت
  // البحث بيقفل البحث الأول (زي أي overlay)، قبل ما يرجع لمنطق المجلدات. ──
  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length > 0;
  const searchResults = isSearching
    ? forms.filter((f) =>
        f.title.toLowerCase().includes(trimmedQuery.toLowerCase())
        || (f.description || '').toLowerCase().includes(trimmedQuery.toLowerCase())
      )
    : [];
  const categoryLabelFor = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return '';
    if (!cat.parent_id) return cat.name_ar;
    const parent = categories.find((c) => c.id === cat.parent_id);
    return parent ? `${parent.name_ar} / ${cat.name_ar}` : cat.name_ar;
  };
  useNestedModalBackButton(isSearching, () => setSearchQuery(''));

  if (loadingEncyclopedia) {
    return React.createElement('div', { className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs' },
      React.createElement(I.Spin), React.createElement('span', { className: 'mr-2' }, 'جاري التحميل...')
    );
  }

  return React.createElement('div', { className: 'space-y-3 fade-in' },

    // شرح بسيط
    React.createElement('div', { className: 'bg-premium-card border border-teal-500/15 rounded-2xl p-3.5 flex items-start gap-2.5' },
      React.createElement('div', { className: 'w-8 h-8 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 shrink-0' },
        React.createElement(I.Folder)
      ),
      React.createElement('p', { className: 'text-[11px] text-slate-400 leading-relaxed' },
        'نماذج وصيغ قانونية جاهزة للتحميل، منظّمة في مجلدات.'
      )
    ),

    // ── بحث خاص بالموسوعة — شغّال في أي وقت (مستوى جذري أو جوه مجلد)،
    // بيدوّر في كل النماذج مرة واحدة (مش محتاج تفتح المجلدات). ──
    React.createElement('div', { className: 'relative' },
      React.createElement('input', {
        type: 'text', value: searchQuery,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value),
        placeholder: 'ابحث في الموسوعة القانونية...', 'data-testid': 'encyclopedia-search-input',
        className: 'w-full bg-premium-card border border-white/10 rounded-xl py-2.5 pr-3.5 pl-9 text-[11px] font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-400/40',
      }),
      isSearching && React.createElement('button', {
        onClick: () => setSearchQuery(''), 'data-testid': 'encyclopedia-search-clear',
        className: 'absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-slate-300',
        'aria-label': 'مسح البحث',
      }, '×')
    ),

    // ── وضع البحث: نتيجة مسطّحة، بتحجب التنقل بالمجلدات مؤقتًا ──
    isSearching && (
      searchResults.length === 0
        ? React.createElement('div', { 'data-testid': 'encyclopedia-search-empty', className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs' }, 'مفيش نتايج مطابقة')
        : searchResults.map((form) => React.createElement(FormCard, {
            key: form.id, form, downloading: downloadingFormId === form.id,
            onDownload: () => onDownload(form),
            previewing: previewingFormId === form.id,
            onPreview: () => onPreview(form),
            categoryLabel: categoryLabelFor(form.category_id),
          }))
    ),

    // ── مسار التنقل (Breadcrumb) + زرار رجوع صريح ──
    !isSearching && activeCategory && React.createElement('div', { className: 'flex items-center gap-2' },
      React.createElement('button', {
        onClick: goBackOneLevel, 'data-testid': 'encyclopedia-back-button',
        className: 'w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 shrink-0 active:scale-90 transition-transform',
        'aria-label': 'رجوع',
      }, React.createElement(I.ChevronRight, { className: 'w-4 h-4' })),
      React.createElement('div', { className: 'flex items-center gap-1.5 text-[11px] font-bold flex-wrap' },
        React.createElement('button', {
          onClick: () => setActiveCategoryId(null),
          'data-testid': 'encyclopedia-breadcrumb-root',
          className: 'text-slate-400 hover:text-white',
        }, 'الموسوعة القانونية'),
        React.createElement(I.ChevronLeft),
        activeCategory.parent_id && React.createElement(React.Fragment, null,
          React.createElement('button', {
            onClick: () => setActiveCategoryId(activeCategory.parent_id),
            className: 'text-slate-400 hover:text-white',
          }, categories.find((c) => c.id === activeCategory.parent_id)?.name_ar || ''),
          React.createElement(I.ChevronLeft)
        ),
        React.createElement('span', { className: 'text-teal-400' }, activeCategory.name_ar)
      )
    ),

    // ── المستوى الجذري: المجلدات الرئيسية ──
    !isSearching && !activeCategory && (
      topLevel.length === 0
        ? React.createElement('div', { 'data-testid': 'encyclopedia-empty', className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs' }, 'لا توجد مجلدات مضافة بعد')
        : topLevel.map((cat) => React.createElement(FolderCard, {
            key: cat.id, category: cat, formsCount: formsCountIncludingChildren(cat.id),
            onOpen: () => setActiveCategoryId(cat.id),
          }))
    ),

    // ── داخل مجلد رئيسي: مجلداته الفرعية + نماذجه المباشرة ──
    !isSearching && activeCategory && !activeCategory.parent_id && React.createElement(React.Fragment, null,
      subCategoriesOf(activeCategory.id).map((sub) => React.createElement(FolderCard, {
        key: sub.id, category: sub, formsCount: formsOf(sub.id).length,
        onOpen: () => setActiveCategoryId(sub.id),
      })),
      formsOf(activeCategory.id).map((form) => React.createElement(FormCard, {
        key: form.id, form, downloading: downloadingFormId === form.id,
        onDownload: () => onDownload(form),
        previewing: previewingFormId === form.id,
        onPreview: () => onPreview(form),
      })),
      subCategoriesOf(activeCategory.id).length === 0 && formsOf(activeCategory.id).length === 0 &&
        React.createElement('div', { 'data-testid': 'encyclopedia-empty', className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs' }, 'المجلد فارغ حاليًا')
    ),

    // ── داخل مجلد فرعي: نماذجه بس (مفيش مستوى تالت) ──
    !isSearching && activeCategory && activeCategory.parent_id && React.createElement(React.Fragment, null,
      formsOf(activeCategory.id).length === 0
        ? React.createElement('div', { 'data-testid': 'encyclopedia-empty', className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs' }, 'المجلد فارغ حاليًا')
        : formsOf(activeCategory.id).map((form) => React.createElement(FormCard, {
            key: form.id, form, downloading: downloadingFormId === form.id,
            onDownload: () => onDownload(form),
            previewing: previewingFormId === form.id,
            onPreview: () => onPreview(form),
          }))
    )
  );
}

export default EncyclopediaBrowseSection;
