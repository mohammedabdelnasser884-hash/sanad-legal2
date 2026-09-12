import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import DatePicker from '@/shared/ui/DatePicker';
import { I } from '../../../constants';
import type { CaseSessionRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';

// 🆕 (خطة إعادة تصميم مودال "النطق بالحكم"، بنود 15+16+18، 12 سبتمبر
// 2026): نوع الاختيار الأول جوه المودال — نهائي (زي ما كان قبل كده)،
// تمهيدي/جزئي (بند 15)، تأجيل (بند 16). isEditMode بيتخطى شاشة
// الاختيار دي تمامًا ويدخل على مسار 'final' مباشرة (راجع تعليق
// isEditMode تحت).
type JudgmentChoice = 'final' | 'preliminary' | 'postpone';

interface FinalJudgmentModalProps {
    session: CaseSessionRow;
    caseData: MappedCase;
    onClose: () => void;
    // ⚠️ (مرحلة 5، 12 سبتمبر 2026): بترجع Promise<{ ok: boolean } | void> —
    // نفس نمط handleFinalJudgment في useCaseSessions.ts. المودال بيقفل
    // نفسه لوحده بس لو ok !== false (يعني نجاح فعلي أو تقييد أوفلاين —
    // الاتنين بيتعاملوا كنجاح من ناحية إغلاق المودال، الفرق بس في الـtoast).
    onConfirm: (judgmentDate: string, verdictText: string) => Promise<{ ok: boolean } | void>;
    // 🆕 (بند 15، خطة إعادة تصميم مودال "النطق بالحكم"): مسار "حكم
    // تمهيدي/جزئي" — نفس نمط onConfirm فوق (Promise<{ok}>), لكن بيستقبل
    // منطوق الحكم + تاريخ الجلسة القادمة (تاريخ الحكم نفسه مقفول ومشتق من
    // الجلسة، مش محتاج يتبعت — راجع handlePreliminaryJudgment).
    onConfirmPreliminary?: (verdictText: string, nextSessionDate: string) => Promise<{ ok: boolean } | void>;
    // 🆕 (بند 16): مسار "تأجيل النطق بالحكم" — حقل واحد بس (الجلسة القادمة).
    onConfirmPostpone?: (nextSessionDate: string) => Promise<{ ok: boolean } | void>;
    // 🆕 (طلب "تعديل/حذف الحكم النهائي"، 12 سبتمبر 2026): لما القضية أصلاً
    // "منتهية"، نفس المودال والـonConfirm (handleFinalJudgment) بيتستخدموا
    // للتعديل — بيكتبوا فوق نفس الجلسة تاني، مفيش داعي لمنطق/جدول جديد.
    // الفرق بس نصّي (عنوان/تحذيرات/زرار التأكيد)، وبيتخطى شاشة الاختيار
    // (choice) — وضع التعديل بيخص حكم نهائي مُسجَّل بالفعل بس، فمفيش داعي
    // يختار من التلات مسارات تاني.
    // 🔓 (بند 18، قرار جيمي 12 سبتمبر 2026): قفل حقل "تاريخ الحكم" بيخص
    // لحظة *تسجيل* حكم جديد (نهائي/تمهيدي) بس — في isEditMode الحقل يفضل
    // DatePicker قابل للتعديل زي ما كان بالظبط، عشان تصحيح غلطة كتابية في
    // تاريخ حكم اتسجّل بالفعل يفضل ممكن من غير ما تحتاج تلغي الحكم كله.
    isEditMode?: boolean;
}

/**
 * FinalJudgmentModal (خطة إعادة تصميم إغلاق سلسلة الجلسات — مرحلة 5 +
 * بنود 15/16/18)
 *
 * يُعرض لما المستخدم يضغط زرار "🏛️ النطق بالحكم" (بيظهر بس لو آخر جلسة
 * متعلّمة is_judgment_reserved = true — راجع TimelineSection.tsx).
 *
 * خطوة اختيار أولى (مش في isEditMode) بين 3 مسارات:
 * - نهائي: حقلين (تاريخ الحكم مقفول + منطوق الحكم) + شاشة تأكيد ثانية —
 *   القضية تتحول لـ"منتهية".
 * - تمهيدي/جزئي: نفس الحقلين + الجلسة القادمة — القضية تفضل "متداولة".
 * - تأجيل: حقل واحد (الجلسة القادمة) من غير منطوق حكم.
 */
function FinalJudgmentModal({ session, caseData, onClose, onConfirm, onConfirmPreliminary, onConfirmPostpone, isEditMode }: FinalJudgmentModalProps) {
    // step: 'choice' — شاشة الاختيار الأولى. 'form' — إدخال بيانات المسار
    // المختار. 'confirm' — شاشة التأكيد الثانية (لمسار نهائي/تمهيدي بس؛
    // مسار تأجيل بيتأكد من نفس شاشة الفورم، مفيهوش بيانات كفاية تستاهل
    // شاشة تأكيد منفصلة).
    const [step, setStep] = useState<'choice' | 'form' | 'confirm'>(isEditMode ? 'form' : 'choice');
    const [choice, setChoice] = useState<JudgmentChoice>('final');
    const [judgmentDate, setJudgmentDate] = useState(session.session_date || '');
    const [verdictText, setVerdictText] = useState(session.result || '');
    const [nextSessionDate, setNextSessionDate] = useState('');
    const [saving, setSaving] = useState(false);
    // 🔧 FIX (طلب جيمي، 12 سبتمبر 2026): المودال ده تحديدًا كان بيتبع
    // useModalPresentation العام (Bottom Sheet على الموبايل، مركزي على
    // الديسكتوب بس) — طلب إنه يفضل مركزي في نص الشاشة دايمًا، حتى على
    // الموبايل. بنستخدم قيم ثابتة (نفس قيم الديسكتوب في useModalPresentation:
    // items-center + rounded-3xl بحدود كاملة + fade-in بدل slide-up) في
    // الـclassName تحت مباشرة، من غير الاعتماد على الـhook العام أصلاً —
    // صفر تأثير على أي مودال تاني بيستخدمه.

    const canProceedFinal = !!judgmentDate && verdictText.trim().length > 0;
    const canProceedPreliminary = verdictText.trim().length > 0 && !!nextSessionDate;
    const canProceedPostpone = !!nextSessionDate;

    const handleChoose = (c: JudgmentChoice) => {
        setChoice(c);
        setStep('form');
    };

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

    const handlePreliminaryConfirm = async () => {
        if (!onConfirmPreliminary) return;
        setSaving(true);
        const result = await onConfirmPreliminary(verdictText.trim(), nextSessionDate);
        setSaving(false);
        if (result && result.ok === false) { setStep('form'); return; }
        onClose();
    };

    const handlePostponeConfirm = async () => {
        if (!onConfirmPostpone) return;
        setSaving(true);
        const result = await onConfirmPostpone(nextSessionDate);
        setSaving(false);
        if (result && result.ok === false) return;
        onClose();
    };

    return createPortal(
        React.createElement('div', {
            className: "fixed inset-0 z-[70] flex items-center justify-center",
            style: { background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' },
            onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget && !saving) onClose(); }
        },
            React.createElement('div', {
                className: "w-full max-w-lg bg-premium-bg border border-emerald-500/25 rounded-3xl p-5 space-y-4 fade-in",
                style: { maxHeight: '90vh', overflowY: 'auto' },
                'data-testid': 'final-judgment-modal',
            },
                React.createElement('div', { className: "w-10 h-1 bg-white/15 rounded-full mx-auto mb-1" }),

                // ── شاشة الاختيار الأولى (بنود 15/16/18) ──
                step === 'choice'
                    ? React.createElement(React.Fragment, null,
                        React.createElement('div', { className: "flex items-center justify-between" },
                            React.createElement('div', { className: "flex items-center gap-2" },
                                React.createElement('div', { className: "w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center" },
                                    React.createElement(I.Scale)
                                ),
                                React.createElement('div', null,
                                    React.createElement('h3', { className: "text-sm font-black text-emerald-400" }, "🏛️ النطق بالحكم"),
                                    React.createElement('p', { className: "text-[10px] text-slate-500 mt-0.5" }, caseData.title || '—')
                                )
                            ),
                            React.createElement('button', {
                                onClick: onClose,
                                className: "w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 active:scale-90"
                            }, React.createElement(I.X))
                        ),

                        React.createElement('div', { className: "h-px bg-white/5" }),

                        React.createElement('p', { className: "text-[10px] text-slate-500 font-bold" }, "اختر نوع الإجراء:"),

                        React.createElement('button', {
                            onClick: () => handleChoose('final'),
                            'data-testid': 'judgment-choice-final',
                            className: "w-full flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-500/8 border border-emerald-500/20 active:scale-[0.98] transition-all text-right"
                        },
                            React.createElement('span', { className: "text-xl" }, "🏛️"),
                            React.createElement('div', null,
                                React.createElement('p', { className: "text-xs font-black text-emerald-400" }, "حكم نهائي"),
                                React.createElement('p', { className: "text-[10px] text-slate-500 mt-0.5" }, "القضية تتحول لـ\"منتهية\"")
                            )
                        ),
                        React.createElement('button', {
                            onClick: () => handleChoose('preliminary'),
                            'data-testid': 'judgment-choice-preliminary',
                            className: "w-full flex items-center gap-3 p-3.5 rounded-2xl bg-sky-500/8 border border-sky-500/20 active:scale-[0.98] transition-all text-right"
                        },
                            React.createElement('span', { className: "text-xl" }, "⚖️"),
                            React.createElement('div', null,
                                React.createElement('p', { className: "text-xs font-black text-sky-400" }, "حكم تمهيدي / جزئي"),
                                React.createElement('p', { className: "text-[10px] text-slate-500 mt-0.5" }, "القضية تفضل \"متداولة\" وتُجدول جلسة قادمة")
                            )
                        ),
                        React.createElement('button', {
                            onClick: () => handleChoose('postpone'),
                            'data-testid': 'judgment-choice-postpone',
                            className: "w-full flex items-center gap-3 p-3.5 rounded-2xl bg-amber-500/8 border border-amber-500/20 active:scale-[0.98] transition-all text-right"
                        },
                            React.createElement('span', { className: "text-xl" }, "⏳"),
                            React.createElement('div', null,
                                React.createElement('p', { className: "text-xs font-black text-amber-400" }, "تأجيل النطق بالحكم"),
                                React.createElement('p', { className: "text-[10px] text-slate-500 mt-0.5" }, "من غير أي حكم — بس جدولة جلسة قادمة")
                            )
                        ),

                        React.createElement('button', {
                            onClick: onClose,
                            'data-testid': 'final-judgment-cancel',
                            className: "w-full py-3 bg-white/5 text-slate-400 rounded-2xl text-xs font-bold active:scale-95"
                        }, "إلغاء")
                      )

                // ── شاشة الفورم (حسب المسار المختار) ──
                : step === 'form'
                    ? React.createElement(React.Fragment, null,
                        // Header
                        React.createElement('div', { className: "flex items-center justify-between" },
                            React.createElement('div', { className: "flex items-center gap-2" },
                                React.createElement('div', { className: "w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center" },
                                    React.createElement(I.Scale)
                                ),
                                React.createElement('div', null,
                                    React.createElement('h3', { className: "text-sm font-black text-emerald-400" },
                                        isEditMode ? "✏️ تعديل الحكم النهائي" : choice === 'preliminary' ? "⚖️ حكم تمهيدي / جزئي" : choice === 'postpone' ? "⏳ تأجيل النطق بالحكم" : "🏛️ حكم نهائي"
                                    ),
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
                            isEditMode
                                ? "هتعدّل تاريخ الحكم و/أو منطوقه على نفس الجلسة — القضية هتفضل \"منتهية\" زي ما هي."
                                : choice === 'preliminary'
                                    ? "هيتسجّل المنطوق على الجلسة الحالية، وهتتجدول جلسة قادمة عادية — القضية هتفضل \"متداولة\" زي ما هي."
                                    : choice === 'postpone'
                                        ? "هتتجدول جلسة قادمة لنفس \"جلسة النطق بالحكم\"، من غير أي حكم يتسجّل دلوقتي."
                                        : "تسجيل الحكم النهائي هيغلق القضية تلقائيًا. لو حصل طعن/استئناف، سجّله كقضية جديدة منفصلة. لو احتجت بس تكمل جلسات على نفس القضية دي لأي سبب تاني، هترجع \"نشطة\" تلقائيًا أول ما تسجّل عليها جلسة جديدة."
                        ),

                        // تاريخ الحكم — بيظهر لمساري نهائي وتمهيدي بس (مش تأجيل)
                        choice !== 'postpone' && (
                            isEditMode
                                // 🔓 (بند 18): في وضع التعديل الحقل يفضل قابل
                                // للتعديل زي ما كان بالظبط.
                                ? React.createElement(DatePicker, {
                                    label: "📅 تاريخ الحكم",
                                    value: judgmentDate,
                                    onChange: (v: string) => setJudgmentDate(v),
                                    required: true,
                                    testId: 'final-judgment-date-trigger',
                                    dayTestId: 'final-judgment-date-day',
                                    // 🔧 FIX (تراكب الكاليندر فوق زرار "رجوع"/التأكيد، 12
                                    // سبتمبر 2026): inline بس هنا جوه مودال "النطق بالحكم" —
                                    // صفر تأثير على الاستخدامات التسعة التانية لـDatePicker.
                                    inline: true,
                                })
                                // 🔒 (بند 18): تسجيل جديد (نهائي/تمهيدي) — نص
                                // عرض ثابت مشتق من تاريخ الجلسة نفسها، مش
                                // قابل للتعديل. أي تاريخ مختلف فعليًا لازم
                                // يتسجّل كجلسة جديدة عن طريق "تأجيل".
                                : React.createElement('div', { className: "space-y-1.5" },
                                    React.createElement('label', { className: "block text-[10px] font-black text-slate-400" }, "📅 تاريخ الحكم"),
                                    React.createElement('div', {
                                        className: "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-300 font-bold",
                                        'data-testid': 'final-judgment-date-display',
                                    }, judgmentDate || '—')
                                )
                        ),

                        // منطوق الحكم — بيظهر لمساري نهائي وتمهيدي بس
                        // 🔒 (طلب "منطوق الحكم إجباري زي التاريخ"، 12 سبتمبر
                        // 2026): كان إجباري بالفعل فعليًا (زرار "متابعة" مقفول
                        // من غير نص — canProceedFinal/canProceedPreliminary
                        // تحت)، بس من غير أي علامة بصرية. أضفنا نجمة حمرا زي
                        // علامة التاريخ بالظبط، صفر تغيير على منطق التفعيل.
                        choice !== 'postpone' && React.createElement('div', { className: "space-y-1.5" },
                            React.createElement('label', { className: "block text-[10px] font-black text-slate-400" },
                                "📜 منطوق الحكم",
                                React.createElement('span', { className: "text-rose-400 mr-1" }, "*")
                            ),
                            React.createElement('textarea', {
                                value: verdictText,
                                onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setVerdictText(e.target.value),
                                placeholder: "اكتب منطوق الحكم كما صدر...",
                                rows: 4,
                                className: "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/40 resize-none font-medium leading-relaxed",
                                style: { direction: 'rtl' },
                                'data-testid': choice === 'preliminary' ? 'preliminary-judgment-verdict-text' : 'final-judgment-verdict-text',
                            })
                        ),

                        // الجلسة القادمة — بيظهر لمساري تمهيدي وتأجيل بس
                        (choice === 'preliminary' || choice === 'postpone') && React.createElement(DatePicker, {
                            label: "📅 الجلسة القادمة",
                            value: nextSessionDate,
                            onChange: (v: string) => setNextSessionDate(v),
                            required: true,
                            testId: choice === 'preliminary' ? 'preliminary-judgment-next-date-trigger' : 'postpone-judgment-next-date-trigger',
                            dayTestId: choice === 'preliminary' ? 'preliminary-judgment-next-date-day' : 'postpone-judgment-next-date-day',
                            // 🔧 FIX (تراكب الكاليندر فوق زرار "رجوع"/التأكيد، 12
                            // سبتمبر 2026): نفس الفيكس فوق — inline بس هنا.
                            inline: true,
                        }),

                        // Buttons
                        React.createElement('div', { className: "flex gap-2 pt-1" },
                            choice === 'postpone'
                                // مسار تأجيل: مفيش شاشة تأكيد منفصلة (حقل واحد
                                // بس) — الحفظ مباشر من هنا.
                                ? React.createElement('button', {
                                    onClick: handlePostponeConfirm,
                                    disabled: !canProceedPostpone || saving,
                                    'data-testid': 'postpone-judgment-confirm',
                                    className: "flex-1 py-3 bg-gradient-to-tr from-amber-500 to-amber-300 text-premium-bg rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                                },
                                    saving ? React.createElement(I.Spin) : React.createElement(I.Check),
                                    saving ? "جاري الحفظ..." : "تأجيل النطق بالحكم"
                                )
                                : React.createElement('button', {
                                    onClick: () => setStep('confirm'),
                                    disabled: choice === 'preliminary' ? !canProceedPreliminary : !canProceedFinal,
                                    'data-testid': choice === 'preliminary' ? 'preliminary-judgment-next' : 'final-judgment-next',
                                    className: "flex-1 py-3 bg-gradient-to-tr from-emerald-500 to-emerald-300 text-premium-bg rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                                }, "متابعة"),
                            React.createElement('button', {
                                onClick: isEditMode ? onClose : () => setStep('choice'),
                                disabled: saving,
                                'data-testid': choice === 'postpone' ? 'postpone-judgment-cancel' : 'final-judgment-cancel',
                                className: "px-4 py-3 bg-white/5 text-slate-400 rounded-2xl text-xs font-bold active:scale-95 disabled:opacity-50"
                            }, isEditMode ? "إلغاء" : "رجوع")
                        )
                      )

                // ── شاشة التأكيد الثانية (لمساري نهائي/تمهيدي بس) ──
                : React.createElement(React.Fragment, null,
                        React.createElement('div', { className: "flex items-start gap-3" },
                            React.createElement('div', { className: "w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-2xl shrink-0" }, "⚖️"),
                            React.createElement('div', null,
                                React.createElement('h3', { className: "text-sm font-black text-white" },
                                    isEditMode ? "تأكيد تعديل الحكم النهائي" : choice === 'preliminary' ? "تأكيد الحكم التمهيدي" : "تأكيد الحكم النهائي وإغلاق القضية"
                                ),
                                React.createElement('p', { className: "text-[10px] text-emerald-400 font-bold mt-0.5" },
                                    isEditMode ? "راجع البيانات الجديدة قبل التأكيد" : choice === 'preliminary' ? "راجع البيانات قبل التأكيد — القضية هتفضل متداولة" : "هذا الإجراء سيُنهي القضية — راجع البيانات قبل التأكيد"
                                )
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
                            ),
                            choice === 'preliminary' && React.createElement('div', { className: "flex justify-between text-[10px] pt-1 border-t border-white/5" },
                                React.createElement('span', { className: "text-slate-500 font-bold" }, "الجلسة القادمة"),
                                React.createElement('span', { className: "text-white font-black" }, nextSessionDate)
                            )
                        ),

                        React.createElement('div', { className: "bg-rose-500/8 border border-rose-500/15 rounded-2xl p-3 text-[10px] text-slate-400 leading-relaxed" },
                            isEditMode
                                ? "بتأكيدك هيتحدّث تاريخ الحكم ومنطوقه على نفس الجلسة — القضية هتفضل \"منتهية\" زي ما هي."
                                : choice === 'preliminary'
                                    ? "بتأكيدك هيتسجّل المنطوق على الجلسة الحالية، وهتتجدول الجلسة القادمة — القضية هتفضل \"متداولة\"."
                                    : "بتأكيدك صدور حكم نهائي في الدعوى سيتم نقل الدعوى لقسم القضايا المنتهية، وفي حالة وجود طعن يمكنك تسجيله كقضية جديدة منفصلة."
                        ),

                        React.createElement('div', { className: "flex gap-2 pt-1" },
                            React.createElement('button', {
                                onClick: choice === 'preliminary' ? handlePreliminaryConfirm : handleFinalConfirm,
                                disabled: saving,
                                'data-testid': choice === 'preliminary' ? 'preliminary-judgment-confirm' : 'final-judgment-confirm',
                                className: "flex-1 py-3 bg-gradient-to-tr from-emerald-500 to-emerald-300 text-premium-bg rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                            },
                                saving ? React.createElement(I.Spin) : React.createElement(I.Check),
                                saving ? "جاري الحفظ..." : (isEditMode ? "تأكيد التعديل" : choice === 'preliminary' ? "تأكيد الحكم التمهيدي" : "تأكيد الحكم وإغلاق القضية")
                            ),
                            React.createElement('button', {
                                onClick: () => setStep('form'),
                                disabled: saving,
                                'data-testid': choice === 'preliminary' ? 'preliminary-judgment-back' : 'final-judgment-back',
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
