import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import DatePicker from '@/shared/ui/DatePicker';
import { I } from '../../../constants';
import { useModalPresentation } from '../../../shared/hooks/useModalPresentation';
import type { CaseSessionRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';

interface FinalJudgmentModalProps {
    session: CaseSessionRow;
    caseData: MappedCase;
    onClose: () => void;
    // ⚠️ (مرحلة 5، 12 سبتمبر 2026): بترجع Promise<{ ok: boolean } | void> —
    // نفس نمط handleFinalJudgment في useCaseSessions.ts. المودال بيقفل
    // نفسه لوحده بس لو ok !== false (يعني نجاح فعلي أو تقييد أوفلاين —
    // الاتنين بيتعاملوا كنجاح من ناحية إغلاق المودال، الفرق بس في الـtoast).
    onConfirm: (judgmentDate: string, verdictText: string) => Promise<{ ok: boolean } | void>;
}

/**
 * FinalJudgmentModal (مرحلة 5 — خطة إعادة تصميم إغلاق سلسلة الجلسات)
 *
 * يُعرض لما المستخدم يضغط زرار "🏛️ الحكم النهائي" (بيظهر بس لو آخر جلسة
 * متعلّمة is_judgment_reserved = true — راجع TimelineSection.tsx).
 *
 * خطوتين:
 * 1. إدخال تاريخ الحكم + منطوق الحكم (حقلين إجباريين).
 * 2. شاشة تأكيد ثانية توضّح إن هذا إجراء نهائي (إقفال القضية) قبل التنفيذ
 *    الفعلي — القضية هتتحول لـ"منتهية" ومفيش رجوع تلقائي غير عن طريق
 *    "⚡ تحديث" على جلسة جديدة (سيناريو إعادة الفتح، مرحلة 3).
 */
function FinalJudgmentModal({ session, caseData, onClose, onConfirm }: FinalJudgmentModalProps) {
    const [judgmentDate, setJudgmentDate] = useState(session.session_date || '');
    const [verdictText, setVerdictText] = useState('');
    const [step, setStep] = useState<'form' | 'confirm'>('form');
    const [saving, setSaving] = useState(false);
    const modalPresentation = useModalPresentation();

    const canProceed = !!judgmentDate && verdictText.trim().length > 0;

    const handleFinalConfirm = async () => {
        setSaving(true);
        const result = await onConfirm(judgmentDate, verdictText.trim());
        setSaving(false);
        if (result && result.ok === false) {
            // فشل حقيقي — نرجع لشاشة الإدخال عشان المستخدم يعيد المحاولة
            // من غير ما يفقد اللي كتبه (judgmentDate/verdictText لسه محفوظين
            // في الـstate). الـtoast بتاع الخطأ اتعرض بالفعل من جوه
            // handleFinalJudgment نفسها.
            setStep('form');
            return;
        }
        onClose();
    };

    return createPortal(
        React.createElement('div', {
            className: `fixed inset-0 z-[70] flex ${modalPresentation.overlayAlignClassName} justify-center`,
            style: { background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' },
            onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget && !saving) onClose(); }
        },
            React.createElement('div', {
                className: `w-full max-w-lg bg-premium-bg border border-emerald-500/25 ${modalPresentation.isDesktop ? 'rounded-3xl' : 'rounded-t-3xl'} p-5 space-y-4 ${modalPresentation.panelAnimationClassName}`,
                style: { maxHeight: '90vh', overflowY: 'auto' },
                'data-testid': 'final-judgment-modal',
            },
                React.createElement('div', { className: "w-10 h-1 bg-white/15 rounded-full mx-auto mb-1" }),

                step === 'form'
                    ? React.createElement(React.Fragment, null,
                        // Header
                        React.createElement('div', { className: "flex items-center justify-between" },
                            React.createElement('div', { className: "flex items-center gap-2" },
                                React.createElement('div', { className: "w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center" },
                                    React.createElement(I.Scale)
                                ),
                                React.createElement('div', null,
                                    React.createElement('h3', { className: "text-sm font-black text-emerald-400" }, "🏛️ الحكم النهائي"),
                                    React.createElement('p', { className: "text-[10px] text-slate-500 mt-0.5" }, caseData.title || '—')
                                )
                            ),
                            React.createElement('button', {
                                onClick: onClose,
                                className: "w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 active:scale-90"
                            }, React.createElement(I.X))
                        ),

                        React.createElement('div', { className: "h-px bg-white/5" }),

                        // تحذير مختصر
                        React.createElement('div', { className: "bg-emerald-500/8 border border-emerald-500/15 rounded-2xl p-3 text-[10px] text-slate-400 leading-relaxed" },
                            "تسجيل الحكم النهائي هيغلق القضية تلقائيًا (تتحول حالتها إلى \"منتهية\"). لو القضية اتفتحت تاني بعد كده (استئناف/طعن)، هترجع \"نشطة\" تلقائيًا أول ما تسجّل جلسة جديدة عليها."
                        ),

                        // تاريخ الحكم
                        React.createElement(DatePicker, {
                            label: "📅 تاريخ الحكم",
                            value: judgmentDate,
                            onChange: (v: string) => setJudgmentDate(v),
                            required: true,
                            testId: 'final-judgment-date-trigger',
                            dayTestId: 'final-judgment-date-day',
                        }),

                        // منطوق الحكم
                        React.createElement('div', { className: "space-y-1.5" },
                            React.createElement('label', { className: "block text-[10px] font-black text-slate-400" },
                                "📜 منطوق الحكم"
                            ),
                            React.createElement('textarea', {
                                value: verdictText,
                                onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setVerdictText(e.target.value),
                                placeholder: "اكتب منطوق الحكم كما صدر...",
                                rows: 4,
                                className: "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/40 resize-none font-medium leading-relaxed",
                                style: { direction: 'rtl' },
                                'data-testid': 'final-judgment-verdict-text',
                            })
                        ),

                        // Buttons
                        React.createElement('div', { className: "flex gap-2 pt-1" },
                            React.createElement('button', {
                                onClick: () => setStep('confirm'),
                                disabled: !canProceed,
                                'data-testid': 'final-judgment-next',
                                className: "flex-1 py-3 bg-gradient-to-tr from-emerald-500 to-emerald-300 text-premium-bg rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                            }, "متابعة"),
                            React.createElement('button', {
                                onClick: onClose,
                                'data-testid': 'final-judgment-cancel',
                                className: "px-4 py-3 bg-white/5 text-slate-400 rounded-2xl text-xs font-bold active:scale-95"
                            }, "إلغاء")
                        )
                      )
                    : React.createElement(React.Fragment, null,
                        // شاشة التأكيد الثانية
                        React.createElement('div', { className: "flex items-start gap-3" },
                            React.createElement('div', { className: "w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-2xl shrink-0" }, "⚖️"),
                            React.createElement('div', null,
                                React.createElement('h3', { className: "text-sm font-black text-white" }, "تأكيد الحكم النهائي وإغلاق القضية"),
                                React.createElement('p', { className: "text-[10px] text-emerald-400 font-bold mt-0.5" }, "هذا الإجراء سيُنهي القضية — راجع البيانات قبل التأكيد")
                            )
                        ),

                        React.createElement('div', { className: "bg-white/5 border border-white/10 rounded-2xl p-3 space-y-2" },
                            React.createElement('div', { className: "flex justify-between text-[10px]" },
                                React.createElement('span', { className: "text-slate-500 font-bold" }, "تاريخ الحكم"),
                                React.createElement('span', { className: "text-white font-black" }, judgmentDate)
                            ),
                            React.createElement('div', null,
                                React.createElement('p', { className: "text-[10px] text-slate-500 font-bold mb-1" }, "منطوق الحكم"),
                                React.createElement('p', { className: "text-[11px] text-slate-200 font-bold leading-relaxed" }, verdictText)
                            )
                        ),

                        React.createElement('div', { className: "bg-rose-500/8 border border-rose-500/15 rounded-2xl p-3 text-[10px] text-slate-400 leading-relaxed" },
                            "بتأكيدك صدور حكم نهائي في الدعوى سيتم نقل الدعوى لقسم القضايا المنتهية، وفي حالة وجود طعن يمكنك تسجيله كقضية جديدة منفصلة."
                        ),

                        React.createElement('div', { className: "flex gap-2 pt-1" },
                            React.createElement('button', {
                                onClick: handleFinalConfirm,
                                disabled: saving,
                                'data-testid': 'final-judgment-confirm',
                                className: "flex-1 py-3 bg-gradient-to-tr from-emerald-500 to-emerald-300 text-premium-bg rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                            },
                                saving ? React.createElement(I.Spin) : React.createElement(I.Check),
                                saving ? "جاري التسجيل..." : "تأكيد الحكم وإغلاق القضية"
                            ),
                            React.createElement('button', {
                                onClick: () => setStep('form'),
                                disabled: saving,
                                'data-testid': 'final-judgment-back',
                                className: "px-4 py-3 bg-white/5 text-slate-400 rounded-2xl text-xs font-bold active:scale-95 disabled:opacity-50"
                            }, "رجوع")
                        )
                      )
            )
        ),
        document.body
    );
}

export default FinalJudgmentModal;
