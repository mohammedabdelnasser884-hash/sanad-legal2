import React, { useState } from 'react';
import { toast } from '../../../shared/lib/notifications';
import { I } from '../../../constants';
import { Inp } from '@/shared/ui/Inp';
import { Sel } from '@/shared/ui/Sel';
import { useModalPresentation } from '@/shared/hooks/useModalPresentation';
import { ENCYCLOPEDIA_MAX_FILE_SIZE, ENCYCLOPEDIA_ALLOWED_EXTENSIONS } from './hooks/useAdminEncyclopedia';
import type { EncyclopediaCategoryRow, EncyclopediaFormRow } from '../../../types';
import type { EncyclopediaFormFormValues } from './hooks/useAdminEncyclopedia';

// ══════════════════════════════════════════
//  مودال رفع / تعديل نموذج (ملف) في الموسوعة القانونية
//  الصيغ المسموحة: PDF أو Word (docx) فقط — حد الحجم 2 ميجا (قرار منفصل
//  عن حد مستندات القضايا الأصغر، راجع تقرير التنفيذ مرحلة 2).
// ══════════════════════════════════════════
interface EncyclopediaFormModalProps {
  onClose: () => void;
  onSave: (form: EncyclopediaFormFormValues, file: File | null) => void;
  saving: boolean;
  categories: EncyclopediaCategoryRow[];
  editingForm: EncyclopediaFormRow | null;
  defaultCategoryId: string | null;
}

function EncyclopediaFormModal({ onClose, onSave, saving, categories, editingForm, defaultCategoryId }: EncyclopediaFormModalProps) {
  const modalPresentation = useModalPresentation();
  const [form, setForm] = useState<EncyclopediaFormFormValues>({
    title: editingForm?.title || '',
    description: editingForm?.description || '',
    category_id: editingForm?.category_id || defaultCategoryId || (categories[0]?.id || ''),
  });
  const [file, setFile] = useState<File | null>(null);
  const s = (k: keyof EncyclopediaFormFormValues, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // كل المجلدات (رئيسية وفرعية) تصلح كوجهة للنموذج — النماذج بس اللي مقيّدة بمستويين، مش المجلد نفسه
  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.parent_id ? `— ${c.name_ar}` : c.name_ar,
  }));

  const handleSubmit = () => {
    if (!form.title.trim()) { toast('يرجى إدخال عنوان النموذج', true); return; }
    if (!form.category_id) { toast('يرجى اختيار المجلد', true); return; }
    if (!editingForm && !file) { toast('يرجى رفع ملف للنموذج (PDF أو Word)', true); return; }
    onSave(form, file);
  };

  return React.createElement('div', {
    className: `fixed inset-0 z-50 flex ${modalPresentation.overlayAlignClassName} justify-center bg-black/70 backdrop-blur-sm`,
    onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); },
  },
    React.createElement('div', { className: `bg-premium-card w-full max-w-lg ${modalPresentation.panelShapeClassName} p-6 pb-10 shadow-2xl ${modalPresentation.panelAnimationClassName} max-h-[88vh] overflow-y-auto no-scrollbar` },
      React.createElement('div', { className: 'w-10 h-1 bg-white/20 rounded-full mx-auto mb-5' }),
      React.createElement('h3', { className: 'text-sm font-black mb-5 text-white flex items-center gap-2' },
        React.createElement('span', { className: 'w-1 h-4 bg-teal-400 rounded-full' }),
        editingForm ? 'تعديل نموذج' : 'إضافة نموذج جديد للموسوعة القانونية'
      ),
      React.createElement('div', { className: 'space-y-4' },
        React.createElement(Inp, {
          label: 'عنوان النموذج', value: form.title,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('title', e.target.value),
          placeholder: 'مثال: صيغة عقد إيجار سكني', required: true, 'data-testid': 'admin-encyclopedia-form-title',
        }),
        React.createElement(Inp, {
          label: 'وصف مختصر (اختياري)', value: form.description,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('description', e.target.value),
          placeholder: 'مثال: يصلح للإيجار السكني الجديد', 'data-testid': 'admin-encyclopedia-form-description',
        }),
        React.createElement(Sel, {
          label: 'المجلد', value: form.category_id,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => s('category_id', e.target.value),
          options: categoryOptions, testId: 'admin-encyclopedia-form-category',
        }),

        // ── رفع الملف ──
        React.createElement('div', null,
          React.createElement('label', { className: 'block text-[10px] font-bold text-slate-400 mb-1.5' },
            'ملف النموذج (PDF أو Word)',
            !editingForm && React.createElement('span', { className: 'text-rose-400 mr-1' }, '*')
          ),
          React.createElement('label', {
            className: 'flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-dashed border-teal-400/30 bg-teal-400/5 text-teal-400 text-xs font-bold cursor-pointer active:scale-95 transition-transform',
          },
            React.createElement(I.Doc),
            React.createElement('span', null, file ? file.name : (editingForm?.file_name || 'اختر ملف PDF أو Word')),
            React.createElement('input', {
              type: 'file', accept: '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              className: 'hidden', 'data-testid': 'admin-encyclopedia-form-file',
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const ext = (f.name.split('.').pop() || '').toLowerCase();
                if (!ENCYCLOPEDIA_ALLOWED_EXTENSIONS.includes(ext)) { toast('الصيغ المسموحة فقط: PDF أو Word (docx)', true); return; }
                if (f.size > ENCYCLOPEDIA_MAX_FILE_SIZE) { toast('❌ حجم الملف أكبر من المسموح (2 ميجابايت كحد أقصى)', true); return; }
                setFile(f);
              },
            })
          ),
          editingForm && React.createElement('p', { className: 'text-[9px] text-slate-600 mt-1' }, 'اتركه بدون تغيير لو لا تريد استبدال الملف الحالي')
        ),

        React.createElement('button', {
          disabled: saving,
          onClick: handleSubmit,
          'data-testid': 'admin-encyclopedia-form-submit',
          className: 'w-full py-3.5 rounded-xl font-black text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform mt-2 text-white',
          style: { background: 'linear-gradient(135deg,#0d9488,#2dd4bf)' },
        }, saving ? React.createElement(I.Spin) : null, saving ? 'جاري الرفع...' : (editingForm ? 'حفظ التعديلات' : 'رفع النموذج'))
      )
    )
  );
}

export default EncyclopediaFormModal;
