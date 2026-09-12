import React from 'react';
import { I } from '../../../constants';
import { Inp } from '@/shared/ui/Inp';
import DatePicker from '@/shared/ui/DatePicker';
import type { CaseSessionRow } from '../../../types';

// شكل فورم الجلسة (إضافة/تعديل) زي ما هو فعليًا في useCaseDetailActions.ts
// (useState({date,time_period,location_floor,location_hall,description,result,next_action}))
// وزي ما handleUpdateSession بيتوقعه بالظبط — ده مختلف عن أعمدة `case_sessions`
// الحقيقية (session_date/session_time/session_floor/session_hall) لأنه شكل
// فورم وسيط، مش صف قاعدة بيانات مباشر.
export interface SessionForm {
  date: string;
  time_period: string;
  location_floor: string;
  location_hall: string;
  description: string;
  result: string;
  next_action: string;
}

export interface EditingSessionForm extends SessionForm {
  id: string;
}

interface TimelineSectionProps {
  loadingSessions: boolean;
  sessions: CaseSessionRow[];
  editingSession: EditingSessionForm | null;
  setEditingSession: (v: EditingSessionForm | null | ((p: EditingSessionForm | null) => EditingSessionForm | null)) => void;
  handleUpdateSession: (sessionId: string, form: EditingSessionForm) => void | Promise<void>;
  setSessionUpdateTarget: (s: CaseSessionRow) => void;
  // 🆕 (خطة إعادة تصميم إغلاق سلسلة الجلسات، مرحلة 4، 12 سبتمبر 2026):
  // يفتح `FinalJudgmentModal` (مرحلة 5) على الجلسة اللي اتضغط عليها زرار
  // "🏛️ الحكم النهائي".
  setFinalJudgmentTarget: (s: CaseSessionRow) => void;
  // 🆕 (طلب "تعديل/حذف الحكم النهائي"، 12 سبتمبر 2026): بيفتح مودال تأكيد
  // إلغاء الحكم النهائي (نفس شكل setConfirmDeleteSession تحت، بس بيستهدف
  // إلغاء الحكم لا حذف الجلسة نفسها).
  setConfirmDeleteJudgment: (v: { id: string; date: string } | null) => void;
  // 🆕 (خطة إعادة تصميم إغلاق سلسلة الجلسات، مرحلة 9، 12 سبتمبر 2026):
  // بيخفي زرار "🏛️ الحكم النهائي" لو المستخدم مالوش صلاحية can_edit_cases.
  // "⚡ تحديث" و"✏️ تعديل" اتسابوا زي ما هم (توصية الخطة، قسم 10.3) —
  // القرار وقت التنفيذ: مش كل تعديل جلسة بيقفل القضية، لكن الحكم النهائي
  // إجراء نهائي بيغيّر حالة القضية نفسها، فمنطقي يتقيّد بصلاحية تعديل
  // القضية تحديدًا.
  canEditCase: boolean;
  deletingSessionId: string | null;
  setConfirmDeleteSession: (v: { id: string; date: string } | null) => void;
  // 🆕 (خطة إعادة تصميم إغلاق سلسلة الجلسات، مرحلة 7، 12 سبتمبر 2026):
  // status القضية — عشان نحدد نعرض كارت "✅ حكم نهائي" فوق التايم لاين
  // ولا لأ. مبعوتة كـprop منفصلة (مش caseData كامل) عشان الملف يفضل
  // معتمد بس على الأعمدة اللي فعلاً بيستخدمها، زي باقي الملف.
  caseStatus: string | null;
  // 🆕 (طلب "إلغاء حجز النطق بالحكم قبل تسجيل أي حكم"، 12 سبتمبر 2026):
  // id الجلسة اللي جاري إلغاء حجزها دلوقتي (null لو مفيش عملية شغالة) —
  // نفس نمط deletingSessionId.
  cancelingReservationId: string | null;
  // بيعمل UPDATE واحد بس (is_judgment_reserved: false) على الجلسة، من
  // غير أي لمس لـcases.status — راجع تعليق الدالة في useCaseSessions.ts.
  handleCancelJudgmentReservation: (sessionId: string) => void | Promise<void>;
}

function TimelineSection({
  loadingSessions, sessions,
  editingSession, setEditingSession, handleUpdateSession,
  setSessionUpdateTarget, setFinalJudgmentTarget, setConfirmDeleteJudgment, canEditCase, deletingSessionId, setConfirmDeleteSession,
  caseStatus, cancelingReservationId, handleCancelJudgmentReservation,
}: TimelineSectionProps) {
  // 🆕 (خطة إعادة تصميم إغلاق سلسلة الجلسات، مرحلة 7، 12 سبتمبر 2026):
  // كارت "✅ حكم نهائي" — بيظهر بس لو آخر جلسة (i===0) هي نفسها اللي
  // اتسجّل عليها الحكم فعليًا عن طريق FinalJudgmentModal (مرحلة 5/6).
  // مفيش عمود منفصل بيميّز "جلسة حكم" عن "جلسة عادية اتحدّث فيها result"،
  // فبنستخدم نفس العلامة الموجودة بالفعل: is_judgment_reserved بيفضل
  // true على الجلسة دي حتى بعد ما handleFinalJudgment يسجّل الحكم عليها
  // (مش بيصفّرها — راجع useCaseSessions.ts) — فالشرط الدقيق: آخر جلسة +
  // is_judgment_reserved === true + القضية status === 'منتهية'. كده منفرّق
  // عن قضية اتقفلت يدويًا من EditCaseModal من غير ما تعدي على الفلو ده.
  const lastSession = sessions[0];
  const showJudgmentCard = !!lastSession && lastSession.is_judgment_reserved === true && caseStatus === 'منتهية';

  // 🆕 (تعديل تخطيطي، 12 سبتمبر 2026): زرار "🏛️ الحكم النهائي" بقى منفصل
  // وبعرض القسم كامل، فوق كارت آخر جلسة مباشرة — بدل ما كان جوه هيدر
  // الكارت. بيظهر بس لو الجلسة محجوزة للحكم + عندك صلاحية تعديل القضية،
  // وطالما الحكم لسه ماتسجّلش فعليًا (caseStatus !== 'منتهية') — لو
  // اتسجّل، الكارت الأخضر (showJudgmentCard) فوق هو اللي بيظهر بدل الزرار.
  const showJudgmentTrigger = !!lastSession && lastSession.is_judgment_reserved === true && canEditCase && caseStatus !== 'منتهية';

  // قرار نصّي (بعد سؤال جيمي، 12 سبتمبر 2026): كارت منفصل بعرض القسم
  // كله فوق آخر جلسة، ومنطوق الحكم مختصر سطرين افتراضيًا (line-clamp-2)
  // مع زرار "عرض الكل" بيظهر بس لو فعلاً النص أطول من سطرين (بنتأكد
  // فعليًا بقياس scrollHeight/clientHeight بدل تخمين عدد حروف).
  const judgmentTextRef = React.useRef<HTMLParagraphElement | null>(null);
  const [judgmentExpanded, setJudgmentExpanded] = React.useState(false);
  const [judgmentOverflows, setJudgmentOverflows] = React.useState(false);
  React.useLayoutEffect(() => {
    if (!showJudgmentCard || judgmentExpanded) return;
    const el = judgmentTextRef.current;
    if (el) setJudgmentOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [showJudgmentCard, judgmentExpanded, lastSession?.id, lastSession?.result]);

  // 🆕 (طلب "كارت حكم تمهيدي بنفس شكل كارت الحكم النهائي"، 12 سبتمبر
  // 2026): نفس منطق قياس overflow فوق، لكن لأي عدد جلسات فيها
  // judgment_type === 'تمهيدي' مع بعض (مش جلسة واحدة بس زي showJudgmentCard) —
  // كل واحدة منهم بتاخد كارت كامل بنفس تصميم "✅ حكم نهائي" (بادچ + منطوق
  // + عرض الكل)، لكن في مكانها الطبيعي جوه تسلسل الـTimeline (مش مثبتة
  // فوق زي كارت الحكم النهائي، لأن القضية هنا لسه "متداولة" وبتتضاف
  // عليها جلسات جديدة فوقها بالترتيب الزمني العادي). بنستخدم Map بدل ref
  // واحد عشان نتابع كذا كارت في نفس الوقت.
  const prelimVerdictRefs = React.useRef(new Map<string, HTMLParagraphElement>());
  const [prelimExpanded, setPrelimExpanded] = React.useState<Record<string, boolean>>({});
  const [prelimOverflows, setPrelimOverflows] = React.useState<Record<string, boolean>>({});
  React.useLayoutEffect(() => {
    const next: Record<string, boolean> = {};
    prelimVerdictRefs.current.forEach((el, id) => {
      if (el) next[id] = el.scrollHeight > el.clientHeight + 1;
    });
    setPrelimOverflows((prev) => {
      const keys = Object.keys(next);
      const changed = keys.length !== Object.keys(prev).length || keys.some((k) => next[k] !== prev[k]);
      return changed ? next : prev;
    });
  }, [sessions, prelimExpanded]);

  return React.createElement('div', {className: "space-y-4 fade-in"},
                // 🆕 كارت "✅ حكم نهائي" — فوق التايم لاين كله، بعرض القسم
                // (مش جوه صف الـtimeline اللي فيه عمود النقطة/الخط، عشان
                // يبان "منفصل" و"بعرض القسم كلة" زي ما اتفقنا).
                showJudgmentCard && React.createElement('div', {
                    className: "bg-emerald-500/5 border border-emerald-500/25 rounded-2xl p-4 slide-up text-center",
                    'data-testid': 'final-judgment-card',
                  },
                  // 🆕 (تعديل تخطيطي، 12 سبتمبر 2026): زراري تعديل/حذف بقوا
                  // أيقونة فقط، في صف مستقل فوق البادچ (مش position: absolute
                  // زي المحاولة الأولى — كانت بتتراكب فوق نص "✅ صدر حكم نهائي
                  // بجلسة..." لأنه كان بياخد عرض الكارت كله). الصف ده بياخد
                  // مكانه الطبيعي في التخطيط (`flex justify-start`) فبيدفع
                  // البادچ لتحت من غير أي تراكب. مقيّدين بـcanEditCase زي ما
                  // كانوا بالظبط، ونفس الـdata-testid.
                  canEditCase && React.createElement('div', { className: "flex justify-end gap-1.5 mb-2" },
                    React.createElement('button', {
                      onClick: () => setFinalJudgmentTarget(lastSession),
                      'data-testid': 'final-judgment-edit-trigger',
                      title: 'تعديل الحكم النهائي',
                      className: "w-7 h-7 rounded-lg flex items-center justify-center active:scale-90 transition-all",
                      style: {background:'rgba(212,175,55,0.15)', color:'#D4AF37', border:'1px solid rgba(212,175,55,0.3)'}
                    }, React.createElement(I.Edit, {className: "w-3.5 h-3.5"})),
                    React.createElement('button', {
                      onClick: () => setConfirmDeleteJudgment({ id: lastSession.id, date: lastSession.session_date || '—' }),
                      'data-testid': 'final-judgment-delete-trigger',
                      title: 'حذف الحكم النهائي',
                      className: "w-7 h-7 rounded-lg flex items-center justify-center active:scale-90 transition-all",
                      style: {background:'rgba(244,63,94,0.1)', color:'#fb7185', border:'1px solid rgba(244,63,94,0.25)'}
                    }, React.createElement(I.Trash, {className: "w-3.5 h-3.5"}))
                  ),
                  React.createElement('span', {className: "inline-block px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-black mb-2"},
                    "✅ صدر حكم نهائي بجلسة " + lastSession.session_date
                  ),
                  React.createElement('p', {className: "text-[10px] font-black text-emerald-400/80 mb-1"}, "منطوق الحكم"),
                  React.createElement('p', {
                    ref: judgmentTextRef,
                    className: `text-sm text-slate-100 font-black leading-relaxed ${judgmentExpanded ? '' : 'line-clamp-2'}`,
                    'data-testid': 'final-judgment-verdict-text-display',
                  }, lastSession.result),
                  judgmentOverflows && React.createElement('button', {
                    onClick: () => setJudgmentExpanded((v) => !v),
                    'data-testid': 'final-judgment-verdict-toggle',
                    className: "mt-1.5 text-[10px] font-black text-emerald-400 underline underline-offset-2 active:scale-95 transition-all",
                  }, judgmentExpanded ? "إخفاء" : "عرض الكل")
                ),
                // 🆕 زرار "🏛️ الحكم النهائي" — منفصل وبعرض القسم كامل، فوق
                // كارت آخر جلسة (راجع تعليق showJudgmentTrigger فوق).
                // 🆕 (طلب "إلغاء حجز النطق بالحكم قبل تسجيل أي حكم"، 12
                // سبتمبر 2026): جنبه زرار أيقونة صغير "↩️ إلغاء الحجز" —
                // نفس شرط الظهور بالظبط (showJudgmentTrigger)، لأنه نفس
                // السيناريو المستهدف حرفيًا: آخر جلسة محجوزة للحكم ولسه
                // مفيش حكم اتسجّل فعليًا (القضية لسه غير "منتهية"). الفرق
                // عن كارت "✅ حكم نهائي" فوق (اللي فيه ✏️/🗑️ خاصين بحكم
                // *مسجّل فعلاً*): هنا مفيش حكم أصلاً، فمفيش داعي لمودال
                // تأكيد — عملية غير مدمّرة وبترجع الجلسة زي أي جلسة عادية.
                showJudgmentTrigger && React.createElement('div', {className: "flex items-center gap-2 slide-up"},
                    React.createElement('button', {
                        onClick: () => setFinalJudgmentTarget(lastSession),
                        'data-testid': 'final-judgment-trigger',
                        className: "flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-2xl text-xs font-black active:scale-[0.98] transition-all",
                        style: {background:'rgba(16,185,129,0.12)', color:'#10b981', border:'1px solid rgba(16,185,129,0.35)'}
                    }, "🏛️ النطق بالحكم"),
                    cancelingReservationId === lastSession.id
                    ? React.createElement('div', {className: "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0", style:{background:'rgba(255,255,255,0.04)'}}, React.createElement(I.Spin))
                    : React.createElement('button', {
                        onClick: () => handleCancelJudgmentReservation(lastSession.id),
                        'data-testid': 'judgment-reservation-cancel-trigger',
                        title: 'إلغاء حجز النطق بالحكم',
                        className: "w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black active:scale-90 transition-all shrink-0",
                        style: {background:'rgba(255,255,255,0.04)', color:'#94a3b8', border:'1px solid rgba(255,255,255,0.08)'}
                    }, "↩️")
                ),
                // 🗑️ FIX (خطة إعادة تصميم إغلاق سلسلة الجلسات، مرحلة 1، 12
                // سبتمبر 2026): زرار "إضافة جلسة جديدة" وفورمه اتشالوا نهائي
                // من هنا — كانوا بيسمحوا بإنشاء جلسة جديدة من غير أي التزام
                // بتسجيل نتيجة الجلسة اللي قبلها، بعكس "⚡ تحديث الجلسة" اللي
                // بيجبر التسلسل يفضل متصل. الطريقة الوحيدة دلوقتي لإنشاء جلسة
                // جديدة هي "⚡ تحديث" (SessionUpdateModal)، ولإقفال السلسلة
                // نهائيًا هو زرار "🏛️ الحكم النهائي" (مشروط، راجع قسم 4).

                // Timeline
                loadingSessions
                    ? React.createElement('div', {className: "flex items-center justify-center py-16 gap-2 text-slate-500 text-xs"}, React.createElement(I.Spin), "جاري التحميل...")
                    : sessions.length === 0
                        // ⚠️ ده عمليًا مش المفروض يحصل بعد إجبارية تاريخ الجلسة
                        // الأولى وقت تسجيل القضية (NewCaseModal.tsx) — نسيبه
                        // كـfallback نصي بلا أي زرار فعلي (بند 3.1 من الخطة).
                        ? React.createElement('div', {className: "text-center py-16 space-y-3"},
                            React.createElement('div', {className: "w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center text-3xl mx-auto"}, "🗓"),
                            React.createElement('p', {className: "text-white/60 font-black text-sm"}, "لا توجد جلسات مسجلة"),
                          )
                        : React.createElement('div', {className: "relative"},
                            // الخط الرأسي للـ timeline
                            React.createElement('div', {className: "absolute right-[27px] top-4 bottom-4 w-px bg-gradient-to-b from-premium-gold/40 via-white/10 to-transparent"}),
                            React.createElement('div', {className: "space-y-4"},
                                sessions.map((s: CaseSessionRow, i: number) =>
                                    React.createElement('div', {key: s.id, className: "flex gap-4 items-start relative"},
                                        // نقطة الـ timeline
                                        React.createElement('div', {className: "shrink-0 w-14 flex flex-col items-center gap-1 relative z-10"},
                                            React.createElement('div', {className: `w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${i === 0 ? 'border-premium-gold bg-premium-gold/20 text-premium-gold' : 'border-white/15 bg-premium-bg text-slate-500'}`},
                                                sessions.length - i
                                            ),
                                            React.createElement('span', {className: "text-[8px] text-slate-500 font-bold text-center leading-tight"}, i === 0 ? 'الأخيرة' : '')
                                        ),
                                        // كارت الجلسة
                                        editingSession?.id === s.id
                                        ? React.createElement('div', {className: "flex-1 bg-premium-card border border-premium-gold/30 rounded-2xl p-4 space-y-3 slide-up"},
                                            React.createElement('h4', {className: "text-xs font-black text-premium-gold"}, "✏️ تعديل الجلسة"),
                                            React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                                                React.createElement(DatePicker, {label:"تاريخ الجلسة", value:editingSession.date, onChange:(v: string) =>setEditingSession((p: EditingSessionForm | null) =>({...(p as EditingSessionForm),date:v})), testId:'session-edit-date-trigger', dayTestId:'session-edit-date-day'}),
                                                React.createElement('div',null,
                                                    React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"وقت الجلسة"),
                                                    React.createElement('div',{className:"flex gap-1"},
                                                        ['صباحي','مسائي'].map((t: string) =>React.createElement('button',{
                                                            key:t,
                                                            onClick:()=>setEditingSession((p: EditingSessionForm | null) =>({...(p as EditingSessionForm),time_period:t})),
                                                            className:`flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all active:scale-95 ${editingSession.time_period===t?'bg-premium-gold text-premium-bg':'bg-white/5 border border-white/10 text-slate-400'}`
                                                        },t==='صباحي'?'🌅':'🌆'))
                                                    )
                                                )
                                            ),
                                            React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                                                React.createElement(Inp,{label:"الطابق",value:editingSession.location_floor,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setEditingSession((p: EditingSessionForm | null) =>({...(p as EditingSessionForm),location_floor:e.target.value})),placeholder:"الطابق"}),
                                                React.createElement(Inp,{label:"رقم القاعة",value:editingSession.location_hall,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setEditingSession((p: EditingSessionForm | null) =>({...(p as EditingSessionForm),location_hall:e.target.value})),placeholder:"القاعة"})
                                            ),
                                            React.createElement(Inp, {label:"ما جرى", value:editingSession.description, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setEditingSession((p: EditingSessionForm | null) =>({...(p as EditingSessionForm),description:e.target.value})), placeholder:"ملخص ما دار...", 'data-testid':'session-edit-description'}),
                                            React.createElement(Inp, {label:"النتيجة", value:editingSession.result, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setEditingSession((p: EditingSessionForm | null) =>({...(p as EditingSessionForm),result:e.target.value})), placeholder:"قرار المحكمة..."}),
                                            React.createElement(Inp, {label:"الإجراء القادم", value:editingSession.next_action, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setEditingSession((p: EditingSessionForm | null) =>({...(p as EditingSessionForm),next_action:e.target.value})), placeholder:"ما المطلوب؟"}),
                                            React.createElement('div', {className: "flex gap-2"},
                                                React.createElement('button', {
                                                    onClick: () => { handleUpdateSession(s.id, editingSession); setEditingSession(null); },
                                                    'data-testid': 'session-edit-save',
                                                    className: "flex-1 py-2.5 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl text-xs font-black flex items-center justify-center gap-1 active:scale-95"
                                                }, React.createElement(I.Check), "حفظ"),
                                                React.createElement('button', {onClick:()=>setEditingSession(null), 'data-testid':'session-edit-cancel', className:"px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"}, "إلغاء")
                                            )
                                          )
                                        : React.createElement('div', {
                                            className: `flex-1 bg-premium-card border rounded-2xl p-4 mb-1 transition-all active:scale-[0.99] ${i === 0 ? 'border-premium-gold/25 shadow-neon-gold' : 'border-white/5'} ${i === 0 && caseStatus !== 'منتهية' && s.is_judgment_reserved !== true ? 'cursor-pointer' : ''}`,
                                            'data-testid': 'session-card',
                                            onClick: () => (i === 0 && caseStatus !== 'منتهية' && s.is_judgment_reserved !== true) ? setSessionUpdateTarget(s) : null
                                          },
                                            // التاريخ + أزرار
                                            React.createElement('div', {className: "flex items-center justify-between mb-3"},
                                                React.createElement('div', {className: "flex items-center gap-2"},
                                                    React.createElement('div', {className: "p-1.5 bg-premium-gold/10 rounded-lg"},
                                                        React.createElement(I.CalGrid, {className: "w-4 h-4"})
                                                    ),
                                                    React.createElement('div',null,
                                                        React.createElement('span', {className: "text-[11px] font-black text-premium-gold"}, s.session_date),
                                                        s.session_time && React.createElement('span',{
                                                            className:"mr-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-black",
                                                            style:{background:s.session_time==='صباحي'?'rgba(251,191,36,0.15)':'rgba(99,102,241,0.15)',color:s.session_time==='صباحي'?'#fbbf24':'#818cf8'}
                                                        },s.session_time==='صباحي'?'🌅 صباحي':'🌆 مسائي')
                                                    )
                                                ),
                                                React.createElement('div', {className: "flex items-center gap-1.5"},
                                                    // 🔧 FIX (طلب جيمي، 12 سبتمبر 2026): آخر جلسة كانت من غير زرار
                                                    // تعديل/حذف خالص — الوحيد المتاح ليها كان "⚡ تحديث" اللي بيسجّل
                                                    // "ما تم" وبيعمل جلسة جديدة تالية، مش بيعدّل بيانات الجلسة نفسها
                                                    // (تاريخ/طابق/قاعة/وصف)، ومفيهوش حذف خالص. دلوقتي بقت آخر جلسة
                                                    // تاخد نفس زراري تعديل/حذف الجلسات القديمة بالظبط.
                                                    // ⚠️ استثناء واحد مقصود: لو آخر جلسة "محجوزة للحكم"
                                                    // (is_judgment_reserved === true) — سواء لسه معلّقة أو الحكم
                                                    // اتسجّل عليها فعلاً — بنسيب زراري التعديل/الحذف الخاصين
                                                    // بالحكم نفسه (فوق، جوه كارت "✅ حكم نهائي" أو زرار "🏛️ النطق
                                                    // بالحكم") هما نقطة الدخول الوحيدة. حذف الجلسة دي مباشرة بزرار
                                                    // الحذف العادي (handleDeleteSession) كان هيمسحها كاملة من غير
                                                    // ما يرجّع cases.status لـ"نشطة" — نفس فئة الباگ اللي فضّلناه
                                                    // بالظبط في onUpdate بتاع handleFinalJudgment (الطلب اللي
                                                    // قبل ده). إلغاء/تعديل الحكم لازم يعدّي من مساره المخصص
                                                    // (setConfirmDeleteJudgment/setFinalJudgmentTarget) عشان
                                                    // يحدّث حالة القضية صح.
                                                    i === 0 && React.createElement('span', {className: "text-[9px] px-2 py-0.5 bg-premium-gold/10 text-premium-gold rounded-full font-bold"}, "آخر جلسة"),
                                                    s.is_judgment_reserved !== true && React.createElement(React.Fragment, null,
                                                        React.createElement('button', {
                                                            onClick: (e: React.MouseEvent) => { e.stopPropagation(); setEditingSession({id:s.id, date:s.session_date||'', time_period:s.session_time||'صباحي', location_floor:s.session_floor||'', location_hall:s.session_hall||'', description:s.description||'', result:s.result||'', next_action:s.next_action||''}); },
                                                            'data-testid': 'session-edit-trigger',
                                                            className: "w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 hover:text-premium-gold active:scale-90 transition-all"
                                                        }, React.createElement(I.Edit)),
                                                        deletingSessionId === s.id
                                                        ? React.createElement('div', {className:"w-6 h-6 flex items-center justify-center"}, React.createElement(I.Spin))
                                                        : React.createElement('button', {
                                                            onClick: (e: React.MouseEvent) => { e.stopPropagation(); setConfirmDeleteSession({id: s.id, date: s.session_date || '—'}); },
                                                            'data-testid': 'session-delete-trigger',
                                                            className: "w-6 h-6 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 active:scale-90 transition-all"
                                                        }, React.createElement(I.Trash))
                                                    )
                                                )
                                            ),
                                            // الموقع
                                            (s.session_floor||s.session_hall) && React.createElement('div',{
                                                className:"flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-xl text-[10px] font-bold",
                                                style:{background:'rgba(14,165,233,0.08)',border:'1px solid rgba(14,165,233,0.15)',color:'#38bdf8'}
                                            },
                                                React.createElement('span',null,"📍"),
                                                s.session_floor && React.createElement('span',null,"الطابق "+s.session_floor),
                                                s.session_floor && s.session_hall && React.createElement('span',{className:"text-slate-600 mx-1"},"·"),
                                                s.session_hall && React.createElement('span',null,"قاعة "+s.session_hall)
                                            ),
                                            s.description && React.createElement('div', {className: "mb-3"},
                                                React.createElement('p', {className: "text-[9px] font-black text-slate-500 mb-1"}, "ما جرى"),
                                                React.createElement('p', {className: "text-xs text-slate-200 leading-relaxed"}, s.description)
                                            ),
                                            // ما جرى في الجلسة
                                            // 🔁 (طلب "كارت حكم تمهيدي بنفس شكل كارت الحكم النهائي"، 12
                                            // سبتمبر 2026): البادچ الصغير القديم "⚖️ حكم تمهيدي" اتشال
                                            // بالكامل، ومكانه بقى كارت كامل الحجم بنفس تصميم/بيانات كارت
                                            // "✅ حكم نهائي" فوق (بادچ + "منطوق الحكم" + النص + عرض الكل)،
                                            // بس بلون أزرق (sky) بدل الأخضر عشان يتفرّق بصريًا عن الحكم
                                            // النهائي، ومن غير أزرار تعديل/حذف (مش مطلوبة هنا). الفرق
                                            // الجوهري عن كارت الحكم النهائي: ده مش مثبت فوق الـTimeline
                                            // كله — بياخد مكانه الطبيعي جوه تسلسل الجلسات، فأي جلسة جديدة
                                            // بعده (بما فيها الجلسة اللي اتعملت وقت الحكم التمهيدي نفسه)
                                            // بتظهر فوقه بالترتيب الزمني العادي — لأن القضية هنا لسه
                                            // "متداولة" ومفتوحة لإضافة جلسات، بعكس الحكم النهائي.
                                            s.result && (s.judgment_type === 'تمهيدي'
                                                ? React.createElement('div', {
                                                    className: "bg-sky-500/5 border border-sky-500/25 rounded-2xl p-4 mb-2 text-center",
                                                    'data-testid': 'preliminary-judgment-card',
                                                  },
                                                    React.createElement('span', {className: "inline-block px-3 py-1.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-sm font-black mb-2"},
                                                      "⚖️ صدر حكم تمهيدي بجلسة " + (s.session_date || '—')
                                                    ),
                                                    React.createElement('p', {className: "text-[10px] font-black text-sky-400/80 mb-1"}, "منطوق الحكم"),
                                                    React.createElement('p', {
                                                        ref: (el: HTMLParagraphElement | null) => {
                                                            if (el) prelimVerdictRefs.current.set(s.id, el);
                                                            else prelimVerdictRefs.current.delete(s.id);
                                                        },
                                                        className: `text-sm text-slate-100 font-black leading-relaxed ${prelimExpanded[s.id] ? '' : 'line-clamp-2'}`,
                                                        'data-testid': 'preliminary-judgment-verdict-text-display',
                                                    }, s.result),
                                                    prelimOverflows[s.id] && React.createElement('button', {
                                                        onClick: () => setPrelimExpanded((p) => ({...p, [s.id]: !p[s.id]})),
                                                        'data-testid': 'preliminary-judgment-verdict-toggle',
                                                        className: "mt-1.5 text-[10px] font-black text-sky-400 underline underline-offset-2 active:scale-95 transition-all",
                                                    }, prelimExpanded[s.id] ? "إخفاء" : "عرض الكل")
                                                )
                                                : React.createElement('div', {className: "bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3 mb-2"},
                                                    React.createElement('p', {className: "text-[9px] font-black text-emerald-400 mb-1"}, "📌 النتيجة"),
                                                    React.createElement('p', {className: "text-[11px] text-slate-200 font-bold leading-relaxed"}, s.result)
                                                )
                                            ),
                                            // الإجراء القادم
                                            s.next_action && React.createElement('div', {className: "bg-amber-500/5 border border-amber-500/15 rounded-xl p-3 mb-2"},
                                                React.createElement('p', {className: "text-[9px] font-black text-amber-400 mb-1"}, "⚡ الإجراء القادم"),
                                                React.createElement('p', {className: "text-[11px] text-slate-200 font-bold leading-relaxed"}, s.next_action)
                                            ),
                                            // 🆕 زرار "⚡ تحديث" — بقى تحت الكارت بعرض كامل بدل ما كان
                                            // زرار صغير جوه الهيدر (تعديل تخطيطي، 12 سبتمبر 2026).
                                            // 🆕 (طلب "إخفاء زر تحديث آخر جلسة بعد الحكم النهائي"، 12 سبتمبر
                                            // 2026): الزرار بقى مش بيظهر لو القضية "منتهية" — بعد ما الحكم
                                            // يتسجّل، مفيش داعي تحديث آخر جلسة من هنا. لسه ممكن يترجع "نشطة"
                                            // بس عن طريق إلغاء الحكم (كارت "✅ حكم نهائي" فوق).
                                            // 🆕 (بند 14، خطة إعادة تصميم مودال "النطق بالحكم"، 12 سبتمبر
                                            // 2026): الشرط اتوسّع — الزرار دلوقتي بيختفي كمان بمجرد ما آخر
                                            // جلسة تتحدد كـ"محجوزة للحكم" (is_judgment_reserved === true)،
                                            // مش بس لما القضية تبقى "منتهية". السبب: زرار "🏛️ النطق بالحكم"
                                            // (showJudgmentTrigger فوق) بقى نقطة الدخول الوحيدة المفروضة لأي
                                            // إجراء على الجلسة دي (نهائي/تمهيدي/تأجيل) طول ما هي محجوزة للحكم؛
                                            // "⚡ تحديث" العادي كان بيفتح نفس مودال SessionUpdateModal اللي مش
                                            // مصمم لمسارات الحكم دي.
                                            i === 0 && caseStatus !== 'منتهية' && s.is_judgment_reserved !== true && React.createElement('button', {
                                                onClick: (e: React.MouseEvent) => { e.stopPropagation(); setSessionUpdateTarget(s); },
                                                'data-testid': 'session-update-trigger',
                                                className: "w-full py-2.5 rounded-xl text-[10px] font-black active:scale-[0.98] transition-all",
                                                style: {background:'rgba(212,175,55,0.15)', color:'#D4AF37', border:'1px solid rgba(212,175,55,0.3)'}
                                            }, "⚡ تحديث")
                                          )
                                    )
                                )
                            )
                          )
            );
}

export default TimelineSection;
