import React, { useState } from 'react';
import { toast } from '../../../shared/lib/notifications';
import { I } from '../../../constants';
import { Inp } from '@/shared/ui/Inp';
import { Sel } from '@/shared/ui/Sel';
import { useModalPresentation } from '@/shared/hooks/useModalPresentation';
import type { LawyerGuideCategoryRow, LawyerGuideLinkRow } from '../../../types';
import type { LawyerGuideLinkForm } from './hooks/useAdminLawyerGuide';

// ══════════════════════════════════════════
//  مودال إضافة / تعديل رابط في "دليل المحامي" — بيانات نصية بحتة
//  (بدون أي ملف/Storage). last_verified_at يتحدّث يدويًا من الأدمن
//  (مش تلقائي — قرار محسوم في الخطة).
// ══════════════════════════════════════════
interface LawyerGuideLinkModalProps {
  onClose: () => void;
  onSave: (form: LawyerGuideLinkForm) => void;
  saving: boolean;
  categories: LawyerGuideCategoryRow[];
  editingLink: LawyerGuideLinkRow | null;
  defaultCategoryId: string | null;
}

function LawyerGuideLinkModal({ onClose, onSave, saving, categories, editingLink, defaultCategoryId }: LawyerGuideLinkModalProps) {
  const modalPresentation = useModalPresentation();
  const [form, setForm] = useState<LawyerGuideLinkForm>({
    category_id: editingLink?.category_id || defaultCategoryId || (categories[0]?.id || ''),
    title: editingLink?.title || '',
    url: editingLink?.url || '',
    description: editingLink?.description || '',
    entity_type: editingLink?.entity_type || '',
    last_verified_at: editingLink?.last_verified_at || '',
  });
  const s = (k: keyof LawyerGuideLinkForm, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name_ar }));

  const handleSubmit = () => {
    if (!form.category_id) { toast('يرجى اختيار التصنيف', true); return; }
    if (!form.title.trim()) { toast('يرجى إدخال عنوان الرابط', true); return; }
    if (!form.url.trim()) { toast('يرجى إدخال رابط (URL) صحيح', true); return; }
    onSave({ ...form, title: form.title.trim(), url: form.url.trim() });
  };

  return React.createElement('div', {
    className: `fixed inset-0 z-50 flex ${modalPresentation.overlayAlignClassName} justify-center bg-black/70 backdrop-blur-sm`,
    onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); },
  },
    React.createElement('div', { className: `bg-premium-card w-full max-w-lg ${modalPresentation.panelShapeClassName} p-6 pb-10 shadow-2xl ${modalPresentation.panelAnimationClassName} max-h-[88vh] overflow-y-auto no-scrollbar` },
      React.createElement('div', { className: 'w-10 h-1 bg-white/20 rounded-full mx-auto mb-5' }),
      React.createElement('h3', { className: 'text-sm font-black mb-5 text-white flex items-center gap-2' },
        React.createElement('span', { className: 'w-1 h-4 bg-amber-400 rounded-full' }),
        editingLink ? 'تعديل رابط' : 'إضافة رابط جديد لدليل المحامي'
      ),
      React.createElement('div', { className: 'space-y-4' },
        React.createElement(Sel, {
          label: 'التصنيف', value: form.category_id,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => s('category_id', e.target.value),
          options: categoryOptions, testId: 'admin-lawyer-guide-link-category',
        }),
        React.createElement(Inp, {
          label: 'عنوان الرابط', value: form.title,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('title', e.target.value),
          placeholder: 'مثال: وزارة العدل المصرية', required: true, 'data-testid': 'admin-lawyer-guide-link-title',
        }),
        React.createElement(Inp, {
          label: 'الرابط (URL)', type: 'url', value: form.url,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('url', e.target.value),
          placeholder: 'https://moj.gov.eg/', required: true, 'data-testid': 'admin-lawyer-guide-link-url',
          dir: 'ltr',
        }),
        React.createElement(Inp, {
          label: 'وصف مختصر (اختياري)', value: form.description,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('description', e.target.value),
          placeholder: 'يشمل: الاستعلام عن رول الجلسة، موقف الدعوى...', 'data-testid': 'admin-lawyer-guide-link-description',
        }),
        React.createElement(Inp, {
          label: 'نوع الجهة (اختياري)', value: form.entity_type,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('entity_type', e.target.value),
          placeholder: 'مثال: جهة حكومية رسمية', 'data-testid': 'admin-lawyer-guide-link-entity-type',
        }),
        React.createElement(Inp, {
          label: 'تاريخ آخر مراجعة (اختياري)', type: 'date', value: form.last_verified_at,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('last_verified_at', e.target.value),
          'data-testid': 'admin-lawyer-guide-link-last-verified',
        }),
        React.createElement('button', {
          disabled: saving,
          onClick: handleSubmit,
          'data-testid': 'admin-lawyer-guide-link-submit',
          className: 'w-full py-3.5 rounded-xl font-black text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform mt-2 text-white',
          style: { background: 'linear-gradient(135deg,#d97706,#fbbf24)' },
        }, saving ? React.createElement(I.Spin) : null, saving ? 'جاري الحفظ...' : (editingLink ? 'حفظ التعديلات' : 'إضافة الرابط'))
      )
    )
  );
}

export default LawyerGuideLinkModal;
