import React, { useState } from 'react';
import { toast } from '../../../shared/lib/notifications';
import { I } from '../../../constants';
import { Inp } from '@/shared/ui/Inp';
import { Sel } from '@/shared/ui/Sel';
import { useModalPresentation } from '@/shared/hooks/useModalPresentation';
import type { EncyclopediaCategoryRow } from '../../../types';
import type { EncyclopediaCategoryForm } from './hooks/useAdminEncyclopedia';

// ══════════════════════════════════════════
//  مودال إضافة / تعديل مجلد في الموسوعة القانونية
//  مستويين بس مسموحين — لو editingCategory نفسه مجلد فرعي (له parent_id)،
//  أو لو defaultParentId جاي من "إضافة مجلد فرعي" داخل مجلد رئيسي، مفيش
//  اختيار "مجلد أب" أصلاً (القيد بيتفرض من الـ Edge Function/الـtrigger
//  بردو، لكن إخفاء الاختيار هنا بيمنع محاولة غلط من الأساس).
// ══════════════════════════════════════════
interface EncyclopediaCategoryModalProps {
  onClose: () => void;
  onSave: (form: EncyclopediaCategoryForm) => void;
  saving: boolean;
  categories: EncyclopediaCategoryRow[];
  editingCategory: EncyclopediaCategoryRow | null;
  defaultParentId: string | null;
}

function EncyclopediaCategoryModal({ onClose, onSave, saving, categories, editingCategory, defaultParentId }: EncyclopediaCategoryModalProps) {
  const modalPresentation = useModalPresentation();
  const [nameAr, setNameAr] = useState(editingCategory?.name_ar || '');
  const [parentId, setParentId] = useState<string>(editingCategory?.parent_id || defaultParentId || '');

  // مجلدات رئيسية فقط (بدون parent_id) تصلح كـ"أب" — ومينفعش المجلد يبقى أب لنفسه
  const topLevelCategories = categories.filter((c) => !c.parent_id && c.id !== editingCategory?.id);
  const isSubfolder = !!(editingCategory?.parent_id || defaultParentId);

  const handleSubmit = () => {
    if (!nameAr.trim()) { toast('يرجى إدخال اسم المجلد', true); return; }
    onSave({ name_ar: nameAr.trim(), parent_id: isSubfolder ? (parentId || null) : null });
  };

  return React.createElement('div', {
    className: `fixed inset-0 z-50 flex ${modalPresentation.overlayAlignClassName} justify-center bg-black/70 backdrop-blur-sm`,
    onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); },
  },
    React.createElement('div', { className: `bg-premium-card w-full max-w-lg ${modalPresentation.panelShapeClassName} p-6 pb-10 shadow-2xl ${modalPresentation.panelAnimationClassName} max-h-[88vh] overflow-y-auto no-scrollbar` },
      React.createElement('div', { className: 'w-10 h-1 bg-white/20 rounded-full mx-auto mb-5' }),
      React.createElement('h3', { className: 'text-sm font-black mb-5 text-white flex items-center gap-2' },
        React.createElement('span', { className: 'w-1 h-4 bg-teal-400 rounded-full' }),
        editingCategory ? 'تعديل مجلد' : (isSubfolder ? 'إضافة مجلد فرعي' : 'إضافة مجلد جديد')
      ),
      React.createElement('div', { className: 'space-y-4' },
        React.createElement(Inp, {
          label: 'اسم المجلد', value: nameAr,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNameAr(e.target.value),
          placeholder: 'مثال: صيغ عقود الإيجار', required: true, 'data-testid': 'admin-encyclopedia-category-name',
        }),
        isSubfolder && React.createElement(Sel, {
          label: 'المجلد الرئيسي',
          value: parentId,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setParentId(e.target.value),
          options: topLevelCategories.map((c) => ({ value: c.id, label: c.name_ar })),
          testId: 'admin-encyclopedia-category-parent',
        }),
        React.createElement('button', {
          disabled: saving,
          onClick: handleSubmit,
          'data-testid': 'admin-encyclopedia-category-submit',
          className: 'w-full py-3.5 rounded-xl font-black text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform mt-2 text-white',
          style: { background: 'linear-gradient(135deg,#0d9488,#2dd4bf)' },
        }, saving ? React.createElement(I.Spin) : null, saving ? 'جاري الحفظ...' : (editingCategory ? 'حفظ التعديلات' : 'إضافة المجلد'))
      )
    )
  );
}

export default EncyclopediaCategoryModal;
