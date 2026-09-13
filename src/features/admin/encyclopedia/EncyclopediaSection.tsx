import React, { useState } from 'react';
import { I } from '../../../constants';
import type { EncyclopediaCategoryRow, EncyclopediaFormRow } from '../../../types';

interface EncyclopediaSectionProps {
  loadingEncyclopedia: boolean;
  categories: EncyclopediaCategoryRow[];
  forms: EncyclopediaFormRow[];
  setEditingCategory: React.Dispatch<React.SetStateAction<EncyclopediaCategoryRow | null>>;
  setCategoryParentForNew: React.Dispatch<React.SetStateAction<string | null>>;
  setShowCategoryModal: React.Dispatch<React.SetStateAction<boolean>>;
  setConfirmDeleteCategory: React.Dispatch<React.SetStateAction<EncyclopediaCategoryRow | null>>;
  setEditingForm: React.Dispatch<React.SetStateAction<EncyclopediaFormRow | null>>;
  setFormModalCategoryId: React.Dispatch<React.SetStateAction<string | null>>;
  setShowFormModal: React.Dispatch<React.SetStateAction<boolean>>;
  setConfirmDeleteForm: React.Dispatch<React.SetStateAction<EncyclopediaFormRow | null>>;
  setBatchModalCategoryId: React.Dispatch<React.SetStateAction<string | null>>;
  setShowBatchUploadModal: React.Dispatch<React.SetStateAction<boolean>>;
}

// بطاقة نموذج (ملف) — بتتكرر جوه أي مجلد (رئيسي أو فرعي)
function FormCard({ form, onEdit, onDelete }: {
  form: EncyclopediaFormRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return React.createElement('div', {
    key: form.id, 'data-testid': 'admin-encyclopedia-form-card',
    className: 'bg-premium-card border border-white/5 rounded-2xl p-3.5 space-y-2',
  },
    React.createElement('div', { className: 'flex items-start gap-2.5' },
      React.createElement('div', { className: 'w-8 h-8 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 shrink-0' },
        React.createElement(I.Doc)
      ),
      React.createElement('div', { className: 'flex-1 min-w-0' },
        React.createElement('p', { className: 'text-xs font-black text-white leading-snug' }, form.title),
        form.description && React.createElement('p', { className: 'text-[10px] text-slate-500 mt-0.5 leading-relaxed' }, form.description),
        React.createElement('div', { className: 'flex items-center gap-2 mt-1' },
          React.createElement('span', { className: 'text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400 uppercase' }, form.file_type),
          React.createElement('span', { className: 'text-[9px] text-slate-600' }, `${form.download_count || 0} تحميل`)
        )
      )
    ),
    React.createElement('div', { className: 'flex items-center gap-2 pt-1' },
      React.createElement('button', {
        onClick: onEdit, 'data-testid': 'admin-encyclopedia-form-edit',
        className: 'flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-[11px] font-bold active:scale-95 transition-transform',
      }, React.createElement(I.Edit), 'تعديل'),
      React.createElement('button', {
        onClick: onDelete, 'data-testid': 'admin-encyclopedia-form-delete',
        className: 'flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-bold active:scale-95 transition-transform',
      }, React.createElement(I.Trash), 'حذف')
    )
  );
}

// بطاقة مجلد — بتتكرر في القائمة الرئيسية (مجلدات رئيسية) وجوه مجلد رئيسي (مجلدات فرعية)
function FolderCard({ category, formsCount, onOpen, onEdit, onDelete }: {
  category: EncyclopediaCategoryRow;
  formsCount: number;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return React.createElement('div', {
    key: category.id, 'data-testid': 'admin-encyclopedia-folder-card',
    className: 'bg-premium-card border border-white/5 rounded-2xl p-3.5 flex items-center gap-3',
  },
    React.createElement('button', {
      onClick: onOpen, className: 'flex-1 flex items-center gap-3 text-right min-w-0',
      'data-testid': 'admin-encyclopedia-folder-open',
    },
      React.createElement('div', { className: 'w-9 h-9 rounded-xl bg-amber-400/10 flex items-center justify-center text-amber-400 shrink-0' },
        React.createElement(I.Folder)
      ),
      React.createElement('div', { className: 'flex-1 min-w-0' },
        React.createElement('p', { className: 'text-xs font-black text-white leading-tight truncate' }, category.name_ar),
        React.createElement('p', { className: 'text-[9.5px] text-slate-500 mt-0.5' }, `${formsCount} نموذج`)
      ),
      React.createElement(I.ChevronLeft)
    ),
    React.createElement('button', {
      onClick: onEdit, 'data-testid': 'admin-encyclopedia-folder-edit',
      className: 'w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-slate-300 flex items-center justify-center shrink-0 active:scale-95 transition-transform',
    }, React.createElement(I.Edit)),
    React.createElement('button', {
      onClick: onDelete, 'data-testid': 'admin-encyclopedia-folder-delete',
      className: 'w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0 active:scale-95 transition-transform',
    }, React.createElement(I.Trash))
  );
}

function EncyclopediaSection({
  loadingEncyclopedia, categories, forms,
  setEditingCategory, setCategoryParentForNew, setShowCategoryModal, setConfirmDeleteCategory,
  setEditingForm, setFormModalCategoryId, setShowFormModal, setConfirmDeleteForm,
  setBatchModalCategoryId, setShowBatchUploadModal,
}: EncyclopediaSectionProps) {
  // مستويين بس — activeCategoryId يمثل المجلد المفتوح حاليًا (رئيسي أو فرعي)، null = القائمة الرئيسية
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const activeCategory = categories.find((c) => c.id === activeCategoryId) || null;
  const topLevel = categories.filter((c) => !c.parent_id);
  const subCategoriesOf = (parentId: string) => categories.filter((c) => c.parent_id === parentId);
  const formsOf = (categoryId: string) => forms.filter((f) => f.category_id === categoryId);
  const formsCountIncludingChildren = (categoryId: string) =>
    formsOf(categoryId).length + subCategoriesOf(categoryId).reduce((sum, c) => sum + formsOf(c.id).length, 0);

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
        'مجلدات ونماذج جاهزة للتحميل تظهر لكل المكاتب في التطبيق. مستويين من المجلدات بس (رئيسي وفرعي).'
      )
    ),

    // ── مسار التنقل (Breadcrumb) ──
    activeCategory && React.createElement('div', { className: 'flex items-center gap-1.5 text-[11px] font-bold' },
      React.createElement('button', {
        onClick: () => setActiveCategoryId(null),
        'data-testid': 'admin-encyclopedia-breadcrumb-root',
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
    ),

    // ── أزرار الإضافة ──
    // زرار المجلد (رئيسي/فرعي) بيتغيّر حسب المستوى الحالي زي ما كان.
    // "نموذج جديد" و"رفع متعدد" بقوا ظاهرين دايمًا (حتى في القائمة الرئيسية
    // برة أي مجلد) — اختيار المجلد بقى بيتم من جوه المودال نفسه.
    React.createElement('div', { className: 'space-y-2' },
      (!activeCategory || !activeCategory.parent_id) && React.createElement('div', { className: 'flex' },
        !activeCategory && React.createElement('button', {
          onClick: () => { setEditingCategory(null); setCategoryParentForNew(null); setShowCategoryModal(true); },
          'data-testid': 'admin-encyclopedia-new-folder',
          className: 'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 text-[11px] font-black active:scale-95 transition-transform',
        }, React.createElement(I.Plus), 'مجلد رئيسي جديد'),
        activeCategory && !activeCategory.parent_id && React.createElement('button', {
          onClick: () => { setEditingCategory(null); setCategoryParentForNew(activeCategory.id); setShowCategoryModal(true); },
          'data-testid': 'admin-encyclopedia-new-subfolder',
          className: 'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 text-[11px] font-black active:scale-95 transition-transform',
        }, React.createElement(I.Plus), 'مجلد فرعي جديد')
      ),
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('button', {
          onClick: () => { setEditingForm(null); setFormModalCategoryId(activeCategory?.id || null); setShowFormModal(true); },
          'data-testid': 'admin-encyclopedia-new-form',
          className: 'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-teal-400/10 border border-teal-400/20 text-teal-400 text-[11px] font-black active:scale-95 transition-transform',
        }, React.createElement(I.Plus), 'نموذج جديد'),
        React.createElement('button', {
          onClick: () => { setBatchModalCategoryId(activeCategory?.id || null); setShowBatchUploadModal(true); },
          'data-testid': 'admin-encyclopedia-new-batch',
          className: 'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-400/10 border border-indigo-400/20 text-indigo-400 text-[11px] font-black active:scale-95 transition-transform',
        }, React.createElement(I.Doc), 'رفع متعدد')
      )
    ),

    // ── المستوى الجذري: المجلدات الرئيسية ──
    !activeCategory && (
      topLevel.length === 0
        ? React.createElement('div', { 'data-testid': 'admin-encyclopedia-empty', className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs' }, 'لا توجد مجلدات مضافة بعد')
        : topLevel.map((cat) => React.createElement(FolderCard, {
            key: cat.id, category: cat, formsCount: formsCountIncludingChildren(cat.id),
            onOpen: () => setActiveCategoryId(cat.id),
            onEdit: () => { setEditingCategory(cat); setShowCategoryModal(true); },
            onDelete: () => setConfirmDeleteCategory(cat),
          }))
    ),

    // ── داخل مجلد رئيسي: مجلداته الفرعية + نماذجه المباشرة ──
    activeCategory && !activeCategory.parent_id && React.createElement(React.Fragment, null,
      subCategoriesOf(activeCategory.id).map((sub) => React.createElement(FolderCard, {
        key: sub.id, category: sub, formsCount: formsOf(sub.id).length,
        onOpen: () => setActiveCategoryId(sub.id),
        onEdit: () => { setEditingCategory(sub); setShowCategoryModal(true); },
        onDelete: () => setConfirmDeleteCategory(sub),
      })),
      formsOf(activeCategory.id).map((form) => React.createElement(FormCard, {
        key: form.id, form,
        onEdit: () => { setEditingForm(form); setFormModalCategoryId(null); setShowFormModal(true); },
        onDelete: () => setConfirmDeleteForm(form),
      })),
      subCategoriesOf(activeCategory.id).length === 0 && formsOf(activeCategory.id).length === 0 &&
        React.createElement('div', { 'data-testid': 'admin-encyclopedia-empty', className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs' }, 'المجلد فارغ حاليًا')
    ),

    // ── داخل مجلد فرعي: نماذجه بس (مفيش مستوى تالت) ──
    activeCategory && activeCategory.parent_id && React.createElement(React.Fragment, null,
      formsOf(activeCategory.id).length === 0
        ? React.createElement('div', { 'data-testid': 'admin-encyclopedia-empty', className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs' }, 'المجلد فارغ حاليًا')
        : formsOf(activeCategory.id).map((form) => React.createElement(FormCard, {
            key: form.id, form,
            onEdit: () => { setEditingForm(form); setFormModalCategoryId(null); setShowFormModal(true); },
            onDelete: () => setConfirmDeleteForm(form),
          }))
    )
  );
}

export default EncyclopediaSection;
