// ══════════════════════════════════════════════════════════════════
// Stepper.tsx — القسم 9 من Sanad_Legal_Documents_Master_Plan_v5.md
// (أولوية 3: إعادة تصميم الويزارد بالتصنيفات)
//
// مكوّن عام (مش خاص بالمستندات القانونية) لعرض دوائر مرقّمة RTL بحالة
// نشط/منجز/لسه — قابل لإعادة الاستخدام في أي ويزارد تاني بسند.
//
// ⚠️ خطوة "القسم" تظهر منجزة (checked) تلقائيًا لما الرحلة داخلة من
// قضية مفتوحة (hasCaseContext) لأنها بتتخطى، مش لأن المستخدم اختارها
// فعليًا — ده بيتحدد من الأب (LegalDocumentsPage) عن طريق تمرير
// currentStepIndex أعلى من index خطوة القسم من البداية، مش مسؤولية
// Stepper نفسه.
// ══════════════════════════════════════════════════════════════════

import React from 'react';
import { I } from '../../constants';

export interface StepperStep {
  key: string;
  label: string;
}

interface StepperProps {
  steps: StepperStep[];
  /** index الخطوة الحالية (0-based) — كل خطوة قبلها تتعرض كـ"منجزة" */
  currentStepIndex: number;
  testId?: string;
}

export default function Stepper({ steps, currentStepIndex, testId }: StepperProps) {
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-1" dir="rtl">
      {steps.map((step, i) => {
        const isDone = i < currentStepIndex;
        const isActive = i === currentStepIndex;
        const isLast = i === steps.length - 1;

        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center gap-1 min-w-0">
              <div
                data-testid={`${testId ? `${testId}-` : ''}circle-${step.key}`}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 transition-colors ${
                  isDone
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : isActive
                    ? 'text-premium-bg'
                    : 'bg-white/5 text-slate-500'
                }`}
                style={isActive ? { background: 'linear-gradient(135deg,#d4af37,#f0c040)' } : undefined}
              >
                {isDone ? <I.Check /> : i + 1}
              </div>
              <span
                className={`text-[9px] font-bold truncate max-w-[52px] text-center ${
                  isActive ? 'text-white' : isDone ? 'text-emerald-300' : 'text-slate-600'
                }`}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div className={`h-0.5 flex-1 rounded-full transition-colors ${isDone ? 'bg-emerald-500/30' : 'bg-white/5'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
