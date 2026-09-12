import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '../../../shared/lib/notifications';
import { showErrorToast } from '../../../shared/lib/errorReporting';
import { recalcNextHearing } from '../../../shared/lib/dataAccess';
import { copySessionPartiesToNewSession, makeSessionGroupId } from '../hooks/caseSessionLinkingShared';
import { escapeTelegramHtml } from '../../../shared/lib/sanitize';
import DatePicker from '@/shared/ui/DatePicker';
import { I } from '../../../constants';
import { useModalPresentation } from '../../../shared/hooks/useModalPresentation';
import type { CaseSessionRow, ClientRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../database.types';

interface SessionUpdateModalProps {
    session: CaseSessionRow;
    caseData: MappedCase;
    db: SupabaseClient<Database>;
    onClose: () => void;
    onDone?: () => void;
    onNotify?: (msg: string) => void;
    // ⚡ NEW (خطة توحيد مصدر بيانات الموكل، مرحلة 5): الموكل الحي المرتبط
    // بالجلسة المستقلة (session.client_id) — لو موجود، بيتاخد منه
    // الاسم/الرقم القومي/رقم التوكيل عند بناء الجلسة القادمة، بدل نسخ
    // نسخة الجلسة الحالية اللي ممكن تكون قديمة لو الموكل تعدّل بعدها.
    // ⚠️ (Phase F.2، 6 أغسطس 2026): بقى مش مُستخدم جوه الملف ده — كان
    // بيتاخد منه اسم/رقم قومي/رقم توكيل الموكل لمزامنة الأعمدة القديمة
    // (اتشالت فوق). سايبينه في التوقيع عشان أي Caller بيبعته حاليًا يفضل
    // شغّال من غير تعديل — noUnusedParameters=false في tsconfig فمفيش خطأ.
    linkedClient?: ClientRow | null;
}

/**
 * SessionUpdateModal
 * 
 * يُعرض لما المستخدم يضغط على زر "تحديث الجلسة" في آخر جلسة.
 * 
 * المنطق:
 * 1. يسجّل "ما تم" في الجلسة الحالية (يحدّث حقل result)
 * 2. يُنشئ جلسة جديدة بالتاريخ والمطلوب الجديد
 * 3. الجلسة القديمة تفضل موجودة بدون زر تحديث (عشان مش آخر جلسة دلوقتي)
 */
function SessionUpdateModal({ session, caseData, db, onClose, onDone, onNotify, linkedClient }: SessionUpdateModalProps) {
    const [whatHappened, setWhatHappened] = useState(session.result || '');
    const [nextDate, setNextDate] = useState('');
    const [nextRequired, setNextRequired] = useState(session.next_action || '');
    const [saving, setSaving] = useState(false);
    // 🆕 (خطة إعادة تصميم إغلاق سلسلة الجلسات، مرحلة 3، 12 سبتمبر 2026):
    // توجل "محجوزة للحكم" — الـPre-check (قسم 4 من الخطة): لو الجلسة
    // الحالية (اللي بنعمل لها "⚡ تحديث" دلوقتي) أصلاً كانت متعلّمة
    // is_judgment_reserved = true، التوجل بيجي مفعّل تلقائيًا على الجلسة
    // الجديدة كمان — مفيش سبب منطقي إن قضية كانت محجوزة للحكم فجأة
    // تبقى مش محجوزة من غير قرار صريح من المستخدم يشيله.
    const [judgmentReserved, setJudgmentReserved] = useState(session.is_judgment_reserved === true);
    // 🆕 (دفعة 2.1 — تقرير تشخيص تجربة سطح المكتب): نفس نمط useModalPresentation
    // المُطبَّق في NewCaseModal.tsx. هنا الحدود بالفعل كاملة (border-premium-gold/20)
    // مش border-t زي باقي المودالات، فبنستبدل بس جزء الاستدارة/الأنيميشن/المحاذاة
    // ونسيب لون وسمك الحدود الحالي زي ما هو.
    const modalPresentation = useModalPresentation();

    const handleSave = async () => {
        if (!nextDate) { toast('⚠️ حدد تاريخ الجلسة القادمة', true); return; }
        setSaving(true);

        const isStandalone = !caseData.id;
        // 🆕 (خطة تسلسل الجلسة المستقلة، 3 أغسطس 2026): session_group_id
        // بيربط كل الجلسات اللي نتجت عن نفس الجلسة المستقلة الأصلية عبر
        // سلسلة "تحديث الجلسة" المتكررة — لتفريقه عن case_id (اللي مش
        // موجود للمستقلة أصلاً). أول مرة السلسلة دي بتتحدّث، الجلسة
        // الحالية مفيش عندها session_group_id لسه، فبنولّد واحد جديد
        // ونحطه على الجلسة القديمة (تحت) والجديدة (تحت) معًا. لو الجلسة
        // الحالية أصلاً جزء من سلسلة سابقة، بنستخدم نفس المعرّف الموجود.
        const groupId = isStandalone ? (session.session_group_id || makeSessionGroupId()) : null;

        // 1. حدّث الجلسة الحالية بـ "ما تم" — عبر __dbWrite (دعم أوفلاين،
        // مرحلة 3 من خطة إعادة تصميم إغلاق سلسلة الجلسات، 12 سبتمبر 2026):
        // كانت بتستخدم safeUpdate (كتابة مباشرة) — لو النت مقطوع وقت الجلسة
        // كان "⚡ تحديث" بالكامل بيفشل بالخطأ العام بدل ما يتقيّد محليًا
        // زي باقي عمليات الجلسات (حذف/تعديل) في useCaseSessions.ts.
        const updateResult = await window.__dbWrite({
            type: 'UPDATE',
            table: 'case_sessions',
            id: session.id,
            data: {
                result: whatHappened || null,
                ...(isStandalone && !session.session_group_id ? { session_group_id: groupId } : {}),
            },
            knownUpdatedAt: session.updated_at || null,
        });
        // 🔒 نفس فحص الـConflict القديم (تقرير الموثوقية — القسم 12).
        if (updateResult.conflict) { setSaving(false); toast('⚠️ هذه الجلسة عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة', true); return; }
        if (updateResult.error && !updateResult.offline) { setSaving(false); showErrorToast('session_update', updateResult.error, 'فشل تسجيل ما تم في الجلسة', 'تحديث جلسة'); return; }

        // 2. أنشئ جلسة جديدة — عبر __dbWrite كمان (نفس السبب فوق).
        // ⚠️ الجلسة المستقلة (caseData.id = null) مالهاش صف في جدول cases —
        // كل بياناتها (العنوان/الموكل/الخصم/المحكمة...) متخزنة على صف الجلسة
        // نفسه. من غير نسخها هنا، الجلسة الجديدة كانت هتتولد فاضية تمامًا
        // (بس تاريخ ومطلوب) وتفقد كل هويتها. القضايا الحقيقية مش محتاجة
        // النسخ ده لأن البيانات بتتجاب من جدول cases عن طريق case_id.
        const insertResult = await window.__dbWrite({
            type: 'INSERT',
            table: 'case_sessions',
            returning: true,
            data: {
                case_id: caseData.id,
                session_date: nextDate,
                session_time: session.session_time || null,
                session_floor: session.session_floor || null,
                session_hall: session.session_hall || null,
                court_level: session.court_level || null,
                secretary_hall: session.secretary_hall || null,
                secretary_name: session.secretary_name || null,
                secretary_mobile: session.secretary_mobile || null,
                next_action: nextRequired || null,
                // 🆕 (مرحلة 3، بوابة "محجوزة للحكم"): بتتكتب على الجلسة
                // الجديدة نفسها اللي إحنا بنعملها دلوقتي — راجع تعليق
                // الـstate فوق لتفاصيل الـPre-check.
                is_judgment_reserved: judgmentReserved,
                ...(isStandalone ? {
                    title: session.title || null,
                    case_number: session.case_number || null,
                    court: session.court || null,
                    case_type: session.case_type || null,
                    circuit_number: session.circuit_number || null,
                    // ⚡ CHANGED (خطة تفكيك legacy columns — Phase F.2، 6 أغسطس
                    // 2026): كانت هنا مزامنة plaintiff/plaintiff_role/
                    // plaintiff_national_id/plaintiff_power_of_attorney/
                    // defendant/defendant_role/defendant_national_id/
                    // plaintiff_legal_title/defendant_legal_title من الجلسة
                    // الحالية (أو ملف الموكل الحي لو مربوطة) — ده كان مصدر
                    // الكتابة الرابع المكتشف في تحديث 6 (تصحيح "SessionUpdateModal
                    // من طبقة الكتابة مش العرض"). كل أطراف الجلسة الحقيقيين
                    // بيتنسخوا فعليًا لـcase_parties الجلسة الجديدة تحت عبر
                    // copySessionPartiesToNewSession — مفيش داعي لأي مزامنة هنا.
                    client_id: session.client_id || null,
                    // 🆕 (خطة تسلسل الجلسة المستقلة، 3 أغسطس 2026): راجع تعليق
                    // groupId فوق — نفس المعرّف بالحرف على الجلسة الجديدة.
                    session_group_id: groupId,
                } : {}),
            },
        });

        setSaving(false);

        if (insertResult.error) { showErrorToast('session_create', insertResult.error, 'فشل إنشاء الجلسة الجديدة', 'إنشاء جلسة تقويم'); return; }

        // 📥 لو أي من الكتابتين اتقيّدت أوفلاين (مش من المفروض يحصل واحدة
        // بس من غير التانية عمليًا — النت إما موجود أو مقطوع وقت النداءين
        // المتتاليين دول — لكن بنتأكد من الاتنين احتياطيًا)، نوقف هنا:
        // نسخ الأطراف/recalcNextHearing/إعادة فتح القضية/تيليجرام كلها
        // عمليات onDone/بعد-الكتابة مش لازمة (أو مش ممكنة) وقت الأوفلاين —
        // هتتنفذ آثارها المطلوبة (زي next_hearing) وقت المزامنة الفعلية.
        if (updateResult.offline && updateResult.queued || insertResult.offline && insertResult.queued) {
            toast('📥 تم حفظ التحديث محليًا — سيُزامن عند عودة الإنترنت');
            onDone?.();
            onClose();
            return;
        }

        const newSessionId = insertResult.data?.id;

        // 🆕 (خطة "المسمى القانوني" — بند مؤجل ثانٍ، 24 يوليو 2026): نسخ كل
        // صفوف case_parties بتاعة الجلسة الحالية (لو فيها أكتر من شخص تحت
        // أي طرف — ورثة/شركاء) للجلسة الجديدة. هذه نسخة (INSERT) لا نقل
        // (UPDATE) — الجلسة القديمة لازم تفضل محتفظة بصفوفها الأصلية كسجل
        // تاريخي لما حصل فيها. مقصورة على المسار المستقل فقط (isStandalone)
        // — القضايا الحقيقية بتاخد أطرافها من case_parties.case_id، مش
        // مرتبطة بـsession_id، فمش محتاجة أي نسخ هنا أصلاً.
        if (isStandalone && newSessionId) {
            const copyResult = await copySessionPartiesToNewSession(db, session.id, newSessionId);
            if (!copyResult.ok) {
                toast('⚠️ تم إنشاء الجلسة القادمة لكن تعذّر نسخ بيانات بعض أطراف الدعوى — راجعها يدويًا', true);
            }
        }

        if (!isStandalone) {
            // 🔴 FIX الحرج (مرحلة 2، 12 سبتمبر 2026): من غير الاستدعاء ده،
            // `cases.next_hearing` كان بيفضل معلّق على تاريخ الجلسة القديمة
            // (اللي دلوقتي بقت النتيجة مسجّلة عليها) بدل الجلسة الجديدة
            // القادمة — يعني البحث الشامل وكارت الجلسة في الداشبورد/التقويم
            // كانوا هيعرضوا بيانات غلط بمجرد ما زرار "إضافة جلسة" اتشال.
            // مقصورة على القضايا الحقيقية (caseData.id موجود) — الجلسة
            // المستقلة (isStandalone) مالهاش صف في جدول `cases` أصلًا.
            await recalcNextHearing(db, caseData.id);

            // 🆕 (مرحلة 3، سيناريو "إعادة الفتح"، قسم 4.6 من الخطة): لو
            // القضية كانت متقفلة ("منتهية") — عادةً بعد حكم نهائي سابق —
            // وبنسجّل جلسة جديدة ليها دلوقتي عن طريق "⚡ تحديث"، ده معناه
            // عمليًا إن القضية اتفتحت تاني (استئناف/طعن/إعادة نظر)، فحالتها
            // لازم ترجع "نشطة" تلقائيًا بدل ما تفضل عالقة على "منتهية" رغم
            // وجود جلسة قادمة فعلية. عملية best-effort (مش بنوقف نجاح
            // تحديث الجلسة لو فشلت — القضية هتفضل "منتهية" والمستخدم يقدر
            // يغيّرها يدويًا من قائمة الحالة العادية).
            if (caseData.status === 'منتهية') {
                const reopenResult = await window.__dbWrite({
                    type: 'UPDATE',
                    table: 'cases',
                    id: caseData.id,
                    data: { status: 'نشطة' },
                    knownUpdatedAt: caseData.updated_at || null,
                });
                if (reopenResult.error || reopenResult.conflict) {
                    toast('⚠️ تم تحديث الجلسة، لكن تعذّر إعادة فتح القضية تلقائيًا — غيّر حالتها يدويًا من القضية', true);
                }
            }
        }

        toast('✅ تم تحديث الجلسة وإنشاء الجلسة القادمة');

        if (onNotify) {
            let msg = `📅 <b>جلسة جديدة تمت جدولتها</b>\n`;
            msg += `━━━━━━━━━━━━━━━━━━━━\n`;
            msg += `⚖️ <b>${escapeTelegramHtml(caseData.title || '—')}</b>\n`;
            msg += `📋 رقم القيد: ${escapeTelegramHtml(caseData.number || '—')}\n`;
            msg += `🏛 المحكمة: ${escapeTelegramHtml(caseData.court || '—')}\n`;
            if (whatHappened) msg += `📝 ما تم: ${escapeTelegramHtml(whatHappened)}\n`;
            msg += `📆 الجلسة القادمة: ${escapeTelegramHtml(nextDate)}\n`;
            if (nextRequired) msg += `⚡ المطلوب: ${escapeTelegramHtml(nextRequired)}\n`;
            onNotify(msg);
        }

        onDone?.();
        onClose();
    };

    return createPortal(
        React.createElement('div', {
            className: `fixed inset-0 z-50 flex ${modalPresentation.overlayAlignClassName} justify-center`,
            style: { background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' },
            onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); }
        },
            React.createElement('div', {
                className: `w-full max-w-lg bg-premium-bg border border-premium-gold/20 ${modalPresentation.isDesktop ? 'rounded-3xl' : 'rounded-t-3xl'} p-5 space-y-4 ${modalPresentation.panelAnimationClassName}`,
                style: { maxHeight: '90vh', overflowY: 'auto' },
                'data-testid': 'session-update-modal',
            },
                // Handle bar
                React.createElement('div', { className: "w-10 h-1 bg-white/15 rounded-full mx-auto mb-1" }),

                // Header
                React.createElement('div', { className: "flex items-center justify-between" },
                    React.createElement('div', null,
                        React.createElement('h3', { className: "text-sm font-black text-premium-gold" }, "⚡ تحديث الجلسة"),
                        React.createElement('p', { className: "text-[10px] text-slate-500 mt-0.5" },
                            `جلسة ${session.session_date} · ${caseData.title || '—'}`
                        )
                    ),
                    React.createElement('button', {
                        onClick: onClose,
                        className: "w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 active:scale-90"
                    }, React.createElement(I.X))
                ),

                // Divider
                React.createElement('div', { className: "h-px bg-white/5" }),

                // الحقل 1: ما تم في الجلسة
                React.createElement('div', { className: "space-y-1.5" },
                    React.createElement('label', { className: "block text-[10px] font-black text-slate-400" },
                        "📝 ما تم في هذه الجلسة"
                    ),
                    React.createElement('textarea', {
                        value: whatHappened,
                        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setWhatHappened(e.target.value),
                        placeholder: "اكتب ملخص ما جرى في الجلسة...",
                        rows: 3,
                        className: "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-premium-gold/40 resize-none font-medium leading-relaxed",
                        style: { direction: 'rtl' },
                        'data-testid': 'session-update-what-happened',
                    })
                ),

                // Divider section
                React.createElement('div', { className: "flex items-center gap-2 my-1" },
                    React.createElement('div', { className: "flex-1 h-px bg-white/5" }),
                    React.createElement('span', { className: "text-[9px] text-slate-600 font-black" }, "الجلسة القادمة"),
                    React.createElement('div', { className: "flex-1 h-px bg-white/5" })
                ),

                // الحقل 2: تاريخ الجلسة القادمة
                React.createElement(DatePicker, {
                    label: "📅 تاريخ الجلسة القادمة",
                    value: nextDate,
                    onChange: (v: string) => setNextDate(v),
                    required: true,
                    testId: 'session-update-next-date-trigger',
                    dayTestId: 'session-update-next-date-day',
                }),

                // 🆕 (مرحلة 3، بوابة "محجوزة للحكم"): توجل جنب تاريخ الجلسة
                // القادمة — بيتفعّل تلقائيًا لو الجلسة الحالية أصلاً محجوزة
                // للحكم (Pre-check، راجع تعليق الـstate فوق).
                React.createElement('button', {
                    type: 'button',
                    onClick: () => setJudgmentReserved((p: boolean) => !p),
                    'data-testid': 'session-update-judgment-reserved-toggle',
                    className: `w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all active:scale-[0.99] ${judgmentReserved ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10'}`
                },
                    React.createElement('span', { className: `text-[10px] font-black ${judgmentReserved ? 'text-emerald-400' : 'text-slate-400'}` },
                        "🏛️ هذه الجلسة محجوزة للحكم"
                    ),
                    React.createElement('span', {
                        className: `w-9 h-5 rounded-full relative transition-colors ${judgmentReserved ? 'bg-emerald-500' : 'bg-white/15'}`
                    },
                        React.createElement('span', {
                            className: `absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${judgmentReserved ? 'right-0.5' : 'right-4'}`
                        })
                    )
                ),

                // الحقل 3: المطلوب في الجلسة القادمة
                React.createElement('div', { className: "space-y-1.5" },
                    React.createElement('label', { className: "block text-[10px] font-black text-slate-400" },
                        "⚡ المطلوب في الجلسة القادمة"
                    ),
                    React.createElement('textarea', {
                        value: nextRequired,
                        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setNextRequired(e.target.value),
                        placeholder: "ما المطلوب تنفيذه أو تحضيره قبل الجلسة القادمة؟",
                        rows: 2,
                        className: "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-premium-gold/40 resize-none font-medium leading-relaxed",
                        style: { direction: 'rtl' },
                        'data-testid': 'session-update-next-required',
                    })
                ),

                // Buttons
                React.createElement('div', { className: "flex gap-2 pt-1" },
                    React.createElement('button', {
                        onClick: handleSave,
                        disabled: saving || !nextDate,
                        'data-testid': 'session-update-save',
                        className: "flex-1 py-3 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                    },
                        saving
                            ? React.createElement(I.Spin)
                            : React.createElement(I.Check),
                        saving ? "جاري الحفظ..." : "حفظ وإنشاء الجلسة القادمة"
                    ),
                    React.createElement('button', {
                        onClick: onClose,
                        'data-testid': 'session-update-cancel',
                        className: "px-4 py-3 bg-white/5 text-slate-400 rounded-2xl text-xs font-bold active:scale-95"
                    }, "إلغاء")
                )
            )
        ),
        document.body
    );
}

export default SessionUpdateModal;
