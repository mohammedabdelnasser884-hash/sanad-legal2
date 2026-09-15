import React, { useState } from 'react';
import { toast } from '../../../shared/lib/notifications';
import { I } from '../../../constants';
import { Inp } from '@/shared/ui/Inp';
import { useModalPresentation } from '@/shared/hooks/useModalPresentation';
import type { LawyerGuideCategoryRow } from '../../../types';
import type { LawyerGuideCategoryForm } from './hooks/useAdminLawyerGuide';

// ══════════════════════════════════════════
//  مودال إضافة / تعديل تصنيف في "دليل المحامي" — مستوى واحد بس
//  (بدون parent_id، بعكس مجلدات الموسوعة القانونية). حقل "أيقونة"
//  اختياري (إيموجي بسيط، زي ⚖️ أو 🏛️، بيتخزن كـtext خام).
// ══════════════════════════════════════════
interface LawyerGuideCategoryModalProps {
  onClose: () => void;
  onSave: (form: LawyerGuideCategoryForm) => void;
  saving: boolean;
  editingCategory: LawyerGuideCategoryRow | null;
}

function LawyerGuideCategoryModal({ onClose, onSave, saving, editingCategory }: LawyerGuideCategoryModalProps) {
  const modalPresentation = useModalPresentation();
  const [nameAr, setNameAr] = useState(editingCategory?.name_ar || '');
  const [icon, setIcon] = useState(editingCategory?.icon || '');

  const handleSubmit = () => {
    if (!nameAr.trim()) { toast('يرجى إدخال اسم التصنيف', true); return; }
    onSave({ name_ar: nameAr.trim(), icon: icon.trim() || null });
  };

  return React.createElement('div', {
    className: `fixed inset-0 z-50 flex ${modalPresentation.overlayAlignClassName} justify-center bg-black/70 backdrop-blur-sm`,
    onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); },
  },
    React.createElement('div', { className: `bg-premium-card w-full max-w-lg ${modalPresentation.panelShapeClassName} p-6 pb-10 shadow-2xl ${modalPresentation.panelAnimationClassName} max-h-[88vh] overflow-y-auto no-scrollbar` },
      React.createElement('div', { className: 'w-10 h-1 bg-white/20 rounded-full mx-auto mb-5' }),
      React.createElement('h3', { className: 'text-sm font-black mb-5 text-white flex items-center gap-2' },
        React.createElement('span', { className: 'w-1 h-4 bg-amber-400 rounded-full' }),
        editingCategory ? 'تعديل تصنيف' : 'إضافة تصنيف جديد لدليل المحامي'
      ),
      React.createElement('div', { className: 'space-y-4' },
        React.createElement(Inp, {
          label: 'اسم التصنيف', value: nameAr,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNameAr(e.target.value),
          placeholder: 'مثال: القضاء والنيابة', required: true, 'data-testid': 'admin-lawyer-guide-category-name',
        }),
        React.createElement(Inp, {
          label: 'أيقونة (اختياري)', value: icon,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setIcon(e.target.value),
          placeholder: 'مثال: ⚖️', 'data-testid': 'admin-lawyer-guide-category-icon',
        }),
        React.createElement('button', {
          disabled: saving,
          onClick: handleSubmit,
          'data-testid': 'admin-lawyer-guide-category-submit',
          className: 'w-full py-3.5 rounded-xl font-black text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform mt-2 text-white',
          style: { background: 'linear-gradient(135deg,#d97706,#fbbf24)' },
        }, saving ? React.createElement(I.Spin) : null, saving ? 'جاري الحفظ...' : (editingCategory ? 'حفظ التعديلات' : 'إضافة التصنيف'))
      )
    )
  );
}

export default LawyerGuideCategoryModal;
