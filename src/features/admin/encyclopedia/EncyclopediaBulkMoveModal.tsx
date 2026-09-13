import React, { useState } from 'react';
import { toast } from '../../../shared/lib/notifications';
import { I } from '../../../constants';
import { Sel } from '@/shared/ui/Sel';
import { useModalPresentation } from '@/shared/hooks/useModalPresentation';
import type { EncyclopediaCategoryRow, EncyclopediaFormRow } from '../../../types';

// ══════════════════════════════════════════
//  مودال "نقل المحدد" — الموسوعة القانونية
//  اختيار مجلد وجهة واحد لكل الملفات المحددة سوا، ثم نقلهم دفعة واحدة.
//  تقنيًا: تغيير category_id بس عبر action='updateForm' الحالية، تسلسليًا
//  على كل ملف (راجع handleBulkMoveForms في useAdminEncyclopedia) — نفس
//  فكرة الرفع المتعدد بالظبط، صفر action جديدة في السيرفر.
// ══════════════════════════════════════════
interface EncyclopediaBulkMoveModalProps {
  forms: EncyclopediaFormRow[];
  categories: EncyclopediaCategoryRow[];
  moving: boolean;
  onMove: (forms: EncyclopediaFormRow[], targetCategoryId: string) => void;
  onClose: () => void;
}

function EncyclopediaBulkMoveModal({ forms, categories, moving, onMove, onClose }: EncyclopediaBulkMoveModalProps) {
  const modalPresentation = useModalPresentation();

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.parent_id ? `— ${c.name_ar}` : c.name_ar,
  }));

  // المجلد الحالي للملفات المحددة (لو كلهم في نفس المجلد) مستبعد من الاختيار
  // الافتراضي — أول مجلد تاني في الترتيب بدل ما نسيب المستخدم يختار "نفس المجلد" بالغلط
  const currentCategoryId = forms.length > 0 && forms.every((f) => f.category_id === forms[0].category_id)
    ? forms[0].category_id
    : null;
  const defaultTarget = categoryOptions.find((o) => o.value !== currentCategoryId)?.value || categoryOptions[0]?.value || '';
  const [targetCategoryId, setTargetCategoryId] = useState<string>(defaultTarget);

  const canClose = !moving;
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (canClose && e.target === e.currentTarget) onClose();
  };

  const handleSubmit = () => {
    if (!targetCategoryId) { toast('يرجى اختيار المجلد الجديد', true); return; }
    if (targetCategoryId === currentCategoryId) { toast('الملفات موجودة في هذا المجلد بالفعل', true); return; }
    onMove(forms, targetCategoryId);
  };

  return React.createElement('div', {
    className: `fixed inset-0 z-50 flex ${modalPresentation.overlayAlignClassName} justify-center bg-black/70 backdrop-blur-sm`,
    onClick: handleBackdropClick,
  },
    React.createElement('div', { className: `bg-premium-card w-full max-w-lg ${modalPresentation.panelShapeClassName} p-6 pb-10 shadow-2xl ${modalPresentation.panelAnimationClassName} max-h-[88vh] overflow-y-auto no-scrollbar` },
      React.createElement('div', { className: 'w-10 h-1 bg-white/20 rounded-full mx-auto mb-5' }),
      React.createElement('h3', { className: 'text-sm font-black mb-5 text-white flex items-center gap-2' },
        React.createElement('span', { className: 'w-1 h-4 bg-indigo-400 rounded-full' }),
        `نقل ${forms.length} ${forms.length === 1 ? 'نموذج' : 'نماذج'}`
      ),
      React.createElement('div', { className: 'space-y-4' },

        // ── قائمة الملفات المطلوب نقلها (للمراجعة قبل التأكيد) ──
        React.createElement('div', { className: 'space-y-1.5 max-h-40 overflow-y-auto no-scrollbar', 'data-testid': 'admin-encyclopedia-bulkmove-list' },
          forms.map((f) => React.createElement('div', {
            key: f.id,
            className: 'flex items-center gap-2 bg-premium-bg border border-white/5 rounded-xl p-2.5',
          },
            React.createElement('div', { className: 'w-6 h-6 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400 shrink-0' },
              React.createElement(I.Doc)
            ),
            React.createElement('p', { className: 'text-[10.5px] text-slate-300 font-bold truncate' }, f.title)
          ))
        ),

        // ── اختيار المجلد الجديد ──
        React.createElement(Sel, {
          label: 'انقل لمجلد إيه؟', value: targetCategoryId,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setTargetCategoryId(e.target.value),
          options: categoryOptions, disabled: moving, testId: 'admin-encyclopedia-bulkmove-category',
        }),

        React.createElement('button', {
          disabled: moving || !targetCategoryId,
          onClick: handleSubmit,
          'data-testid': 'admin-encyclopedia-bulkmove-submit',
          className: 'w-full py-3.5 rounded-xl font-black text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform mt-2 text-white',
          style: { background: 'linear-gradient(135deg,#4338ca,#818cf8)' },
        }, moving ? React.createElement(I.Spin) : null, moving ? 'جاري النقل...' : `نقل ${forms.length} ${forms.length === 1 ? 'نموذج' : 'نماذج'}`)
      )
    )
  );
}

export default EncyclopediaBulkMoveModal;
