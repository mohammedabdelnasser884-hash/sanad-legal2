// ══════════════════════════════════════════════════════════════════
// TemplateRow.tsx — القسم 9 (أولوية 3) من Sanad_Legal_Documents_Master_Report.md
//
// صف كامل العرض لعرض مستند واحد جوه تصنيف مقفول (خطوة "② المستند").
// بديل لـTemplateCard.tsx (الشبكة) في المسار الجديد اللي بيدخل من
// CategoryPicker — مفيش داعي لبادچ التصنيف هنا لأن التصنيف أصلًا
// مقفول ومعروف (القسم 8.1: "قايمة بأسماء مستندات التصنيف المختار بس").
// ══════════════════════════════════════════════════════════════════

import React from 'react';
import { I } from '../../../../constants';
import type { DocumentTemplate } from '../../types';

interface TemplateRowProps {
  template: DocumentTemplate;
  onClick: () => void;
}

export default function TemplateRow({ template, onClick }: TemplateRowProps) {
  return (
    <button
      data-testid={`doc-gen-template-row-${template.id}`}
      onClick={onClick}
      className="w-full flex items-center justify-between p-4 rounded-2xl bg-premium-card border border-white/10 hover:border-purple-500/30 transition-all active:scale-[0.98] text-right"
    >
      <div className="min-w-0">
        <span className="block text-xs font-black text-white leading-snug">{template.name_ar}</span>
        {template.description && (
          <span className="block text-[10px] text-slate-500 mt-1 truncate">{template.description}</span>
        )}
      </div>
      <I.ChevronRight className="w-4 h-4 text-slate-600 rotate-180 shrink-0 mr-2" />
    </button>
  );
}
