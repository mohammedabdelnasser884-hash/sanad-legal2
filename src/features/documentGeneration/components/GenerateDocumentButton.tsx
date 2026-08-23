// ══════════════════════════════════════════════════════════════════
// GenerateDocumentButton.tsx — القسم 9.5
// زرار بسيط جوه تبويب docs في CaseDetailView، جنب زرار "☁️ رفع مستند
// جديد" الموجود فعليًا في DocsSection.tsx. بنفس الحجم/نمط العرض (مستطيل
// full-width بحدود منقطة) لكن بستايل ثانوي مختلف بصريًا عن زرار الرفع
// (نمط solid بدل dashed) عشان يتضحوا كإجراءين مختلفين مش نفس الزرار.
//
// الزرار نفسه ملوش أي منطق تنقل داخلي — بيستقبل onClick من فوق (القسم 8:
// عند الضغط بيروح على TemplatePicker مباشرة بوضع case_bound تلقائي،
// المنطق ده في LegalDocumentsPage عبر initialCaseId، مش هنا).
// ══════════════════════════════════════════════════════════════════

import React from 'react';
import { I } from '../../../constants';

interface GenerateDocumentButtonProps {
  onClick: () => void;
}

export default function GenerateDocumentButton({ onClick }: GenerateDocumentButtonProps) {
  return (
    <button
      data-testid="case-detail-generate-document-btn"
      onClick={onClick}
      className="w-full py-4 border-2 border-purple-500/30 rounded-2xl flex flex-col items-center justify-center gap-2 text-purple-400 hover:bg-purple-500/5 transition-all active:scale-[0.98]"
    >
      <I.Doc className="w-6 h-6" />
      <span className="text-xs font-black">توليد مستند</span>
      <span className="text-[9px] text-slate-500">من قوالب سند القانونية الجاهزة</span>
    </button>
  );
}
