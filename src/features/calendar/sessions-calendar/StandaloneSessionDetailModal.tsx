import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '../../../shared/lib/notifications';
import { showErrorToast } from '../../../shared/lib/errorReporting';
import { recordSuccess } from '../../../systemHealth';
import { I, loadOfficeSetting } from '../../../constants';
import SessionUpdateModal from './SessionUpdateModal';
import { escapeHtml } from '../../../shared/lib/sanitize';
import { PDF_FONT_FAMILY, PDF_FONT_LINK } from '../../../shared/lib/pdf';
import DeleteConfirmModal from '@/shared/modals/DeleteConfirmModal';
import { useModalPresentation } from '@/shared/hooks/useModalPresentation';
import { checkPermission, type PermissionBearing } from '../../../shared/lib/permissions';
import type { SessionWithLegacyFields } from '../../../types';
import { findClientDataMismatches, fetchSessionClientParties, unlinkClientFromSessionParty, makeOfflineTempId, buildCaseInsertData, linkSessionGroupToCase } from '../hooks/caseSessionLinkingShared';
import { checkCaseNumberDuplicate } from '@/shared/lib/caseValidation';
import { runDuplicateCheckOfflineAware } from '@/shared/lib/offlineGuard';
import { recalcNextHearing } from '@/shared/lib/dataAccess';
import type { PartySide } from '@/shared/parties/partyTypes';
import { summarizePartySide, type PartyPersonLike } from '@/shared/parties/partyDisplay';
import {
    getPartyState,
    isOrphanedLink,
    getPartyStateBadge,
    type PartyDomainContext,
} from '@/shared/parties/partyDomainService';
import type { CaseSessionRow, ClientRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';
import { fetchMappedCaseById } from '../../../hooks/useAppData';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../database.types';
// 🔶 (تفكيك المرحلة 4، 7 سبتمبر 2026): EditStandaloneModal (وEditStandaloneModalForm
// الداخلي) اتنقلوا لملف مستقل — استخراج مباشر بدون إعادة كتابة. راجع
// EditStandaloneModal.tsx. التوقيع والسلوك الخارجي لم يتغيّرا.
import EditStandaloneModal from './EditStandaloneModal';

interface StandaloneSessionDetailModalProps {
    session: SessionWithLegacyFields;
    db: SupabaseClient<Database>;
    onClose: () => void;
    onDone: () => void;
    onNotify?: (msg: string) => void;
    onClientAdded?: () => void;
    // ⚡ NEW (خطة توحيد مصدر بيانات الموكل، مرحلة 3): لازمين عشان نلاقي
    // الموكل الحي المرتبط بالجلسة (session.client_id) ونمرره لـ
    // EditStandaloneModal، ونفتح تفاصيل الموكل من زرار "✏️ عدّل من ملف الموكل".
    clients?: ClientRow[];
    onOpenClientProfile?: (client: ClientRow) => void;
    // ⚡ NEW (استرجاع ميزة "تحويل الجلسة المستقلة لقضية" — 12 أغسطس 2026):
    // لو موجودة، بتتنادى بعد نجاح تحويل الجلسة لقضية (أونلاين بس — راجع
    // تعليق handleConvertToCase) بالقضية الجديدة كاملة (MappedCase جاهزة
    // عبر fetchMappedCaseById في useAppData.ts) عشان تفتح ملفها فورًا،
    // بدل ما تسيب المستخدم يدوّر عليها بنفسه في تبويب القضايا. اختيارية
    // عشان الشاشتين اللي بيستخدموا المودال ده (DashboardTab.tsx عبر
    // setSelectedCase مباشرة، SessionsCalendar.tsx عبر onOpenCase الموجود
    // أصلًا للقضايا المربوطة) يقدروا يمرروها بسهولة.
    onOpenCase?: (c: MappedCase) => void;
    // 🔒 FIX (نفس باگ "عدّل من ملف الموكل جوه تعديل القضية بيرجّع للصفحة
    // العادية مش لفورم التعديل" — CaseDetailView.tsx — بس هنا لفورم تعديل
    // الجلسة المستقلة، 12 أغسطس 2026): بتوصل من DashboardTab.tsx/
    // SessionsCalendar.tsx وبتعكس إذا كان مودال تفاصيل/تعديل الموكل لسه
    // مفتوح فعليًا — راجع useEffect تحت لتفاصيل الاستخدام.
    clientProfileOpen?: boolean;
    // ⚡ REMOVED (خطة إلغاء ربط/إنشاء موكل من الجلسة المستقلة، المرحلة 6 — 9
    // أغسطس 2026): onOpenCreateClientForSessionParty وopenNewClientModal
    // كانوا هنا خدمة لـ LinkSessionModal (اتشال Phase 2) وزرار "➕ إنشاء
    // موكل جديد" جوه EditStandaloneModalForm (اتشال Phase 3) — الاتنين
    // بقوا بلا مستهلك حقيقي من وقتها. اتشالت السلسلة كلها من DashboardTab.tsx
    // وSessionsCalendar.tsx كمان.
    // ⚡ NEW (توحيد "المحكمة"/"نوع القضية" مع فورمي القضية — 12 أغسطس 2026):
    // بيتمرروا لـEditStandaloneModal تحت — راجع تعليق countryCourts في
    // EditStandaloneModalProps فوق.
    countryCourts?: string[];
    countryCaseTypes?: string[];
    // ⚡ NEW (خطة تفعيل الصلاحيات الناقصة — الجلسات، 11 سبتمبر 2026):
    // لزراري "تعديل"/"حذف" تحت — نفس نمط CaseDetailView.tsx. اختياري
    // عشان مايكسرش أي استدعاء قديم؛ بيتعامل زي "مفيش صلاحية" لو غايب.
    profile?: PermissionBearing | null;
}

function StandaloneSessionDetailModal({ session: partialSession, db, onClose, onDone, onNotify, onClientAdded, clients = [], onOpenClientProfile, onOpenCase, countryCourts, countryCaseTypes, clientProfileOpen = false, profile }: StandaloneSessionDetailModalProps) {
    // ⚡ NEW (مرحلة 3 خطة الصلاحيات — الجلسات المستقلة): can_edit_sessions/
    // can_delete_sessions لزراري "تعديل"/"حذف" تحت. الجلسة دي مستقلة
    // دايمًا (case_id IS NULL) — المودال ده أصلًا مخصص للجلسات المستقلة
    // بس، فمفيش داعي لفحص case_id هنا زي ما اتعمل فى RLS.
    const canEditSession = checkPermission(profile, 'can_edit_sessions');
    const canDeleteSession = checkPermission(profile, 'can_delete_sessions');
    // 🆕 (F3): مودال "تفاصيل الجلسة" — بيستخدم isDesktop بس (بدون تغيير
    // max-width، الشاشة دي عرض/قراءة مش فورم شبكي فمحتاجاش عرض أوسع).
    const modalPresentation = useModalPresentation();
    const [showUpdate, setShowUpdate] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    // 🔒 FIX (نفس نمط CaseDetailView.tsx): بنسجّل إننا قفلنا فورم تعديل
    // الجلسة عشان نفتح ملف الموكل (زرار "عدّل من ملف الموكل")، عشان نعرف
    // نرجّع الفورم تاني لما مودال الموكل يتقفل (حفظ أو إلغاء أو ✕).
    const wasEditingRef = useRef(false);
    useEffect(() => {
        if (!clientProfileOpen && wasEditingRef.current) {
            wasEditingRef.current = false;
            setShowEdit(true);
        }
    }, [clientProfileOpen]);
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    // 🆕 (طلب "زر طباعة تقرير PDF لبيانات الجلسة المستقلة" — 13 أغسطس 2026)
    const [exportingPdf, setExportingPdf] = useState(false);
    // ⚡ NEW (استرجاع ميزة "تحويل الجلسة المستقلة لقضية" — 11 أغسطس 2026)
    const [showConvertConfirm, setShowConvertConfirm] = useState(false);
    const [converting, setConverting] = useState(false);
    // ⚡ NEW (نقل زرار فك الربط من EditStandaloneModal لجنب سطر "👤 الموكل"
    // هنا مباشرة).
    const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
    const [unlinkingClient, setUnlinkingClient] = useState(false);

    // ⚡ [حل جذري] الـ session الجاي كـ prop غالبًا مصدره استعلام select()
    // مبني بأعمدة محدودة (CalendarTab.tsx / useDashboardFeed.ts، مبنيين
    // كده عمدًا لتخفيف تحميل قوائم العرض) — فمش فيه plaintiff_national_id/
    // plaintiff_power_of_attorney/defendant_national_id وغيرهم. من غير
    // الفتش ده، أي إجراء هنا (تعديل/تحديث الجلسة/ربط) هيسجّل null في
    // الحقول دي بدل القيمة الحقيقية ("البيانات بتطير"). فبمجرد ما
    // المودال يفتح، بنجيب الصف كامل (select *) بالـ id مرة واحدة،
    // ونستخدمه هو بس في كل حاجة تحت (عرض + تمرير لكل الموديلات
    // الفرعية) — مش الـ prop الناقص. كده أي عمود جديد يتضاف مستقبلاً
    // في case_sessions بيوصل تلقائي من غير ما نلمس أي select() تاني.
    const [fullSession, setFullSession] = useState<SessionWithLegacyFields>(partialSession);
    const [loadingFull, setLoadingFull] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoadingFull(true);
        db.from('case_sessions').select('*').eq('id', partialSession.id).single()
            .then(({ data, error }) => {
                if (cancelled) return;
                if (!error && data) setFullSession(data as CaseSessionRow);
                setLoadingFull(false);
            });
        return () => { cancelled = true; };
    }, [partialSession.id, db]);

    // ⚡ NEW (طلب "عرض تعدد الأطراف في مودال عرض الجلسة المستقلة" — 3
    // أغسطس 2026): نفس استعلام EditStandaloneModal بالحرف (case_parties
    // بـ session_id) — بس هنا للعرض القرائي فقط. جلسة قديمة/بلا صفوف
    // ترجع array فاضية، وبنعمل fallback لعمودي plaintiff/defendant
    // القدامى تحت زي ما كان يحصل بالظبط قبل التعديل ده.
    // ⚡ CHANGED (خطة توحيد قفل الطرف — المرحلة 3، سد فجوة 5.4، 6 أغسطس
    // 2026): client_id بقى جزء من الـselect — قبل كده الاستعلام كان
    // بيجيب side/name/capacity بس، فمكانش فيه بيانات كفاية لحساب حالة
    // الطرف (getPartyState) وعرض شارة في العرض القرائي هنا. مفيش تغيير
    // في شكل fallback الأعمدة القديمة تحت — عمود جديد بس بيتضاف كخيار.
    const [sessionParties, setSessionParties] = useState<{ side: PartySide; name: string; capacity: string; client_id: string | null }[]>([]);
    useEffect(() => {
        let cancelled = false;
        db.from('case_parties').select('side,name,capacity,client_id').eq('session_id', partialSession.id).order('sort_order', { ascending: true })
            .then(({ data, error }) => {
                if (cancelled) return;
                setSessionParties(error ? [] : ((data as unknown as { side: PartySide; name: string; capacity: string; client_id: string | null }[]) || []));
            });
        return () => { cancelled = true; };
    }, [partialSession.id, db]);

    // 🆕 (خطة تسلسل الجلسة المستقلة، 3 أغسطس 2026): كل الجلسات اللي شاركت
    // نفس session_group_id — يعني نتجت كلها عن نفس الجلسة المستقلة
    // الأصلية عبر ضغطات "⚡ تحديث الجلسة" المتتالية. لو fullSession
    // مالهاش session_group_id (لسه ما "اتحدّثت" ولا مرة، أو جلسة قديمة
    // قبل الفيكس ده)، القائمة تفضل فاضية والسكشن مش بيظهر خالص.
    const [chainSessions, setChainSessions] = useState<CaseSessionRow[]>([]);
    useEffect(() => {
        let cancelled = false;
        const groupId = fullSession.session_group_id;
        if (!groupId) { setChainSessions([]); return; }
        db.from('case_sessions').select('*').eq('session_group_id', groupId).order('session_date', { ascending: true })
            .then(({ data, error }) => {
                if (cancelled) return;
                setChainSessions(error ? [] : ((data as CaseSessionRow[]) || []));
            });
        return () => { cancelled = true; };
    }, [fullSession.session_group_id, db]);

    const session = fullSession;
    // ⚡ REMOVED (خطة إلغاء ربط/إنشاء موكل من الجلسة المستقلة، Phase 2 — 9
    // أغسطس 2026): hasCase كان بيتحكم بس في ظهور زرار "🔗 ربط" (اتشال
    // بالكامل). لو احتجناه تاني مستقبلاً لغرض تاني، يترجع بسهولة.
    const hasClient = !!session.client_id;
    // ⚡ FIX (8 أغسطس 2026 — نفس باگ "الموكل محذوف" غلط اللي اتصلح في
    // CasesTab.tsx/CaseDetailView.tsx): كان بيعتمد على session.client_id
    // القديم بس. لو الجلسة اترّبط طرفها الأساسي بموكل عبر case_parties
    // (sessionParties فوق، محمّلة أصلاً لعرض تعدد الأطراف) بعد ما
    // session.client_id فضل من غير مزامنة، كان بيظهر "محذوف" غلط مع إن
    // الموكل حي ومربوط فعلاً. primaryPartyClientId بياخد أول طرف عنده
    // client_id من sessionParties كـ fallback لو العمود القديم فاضي/غلط.
    // ⚠️ لازم نجرّب نتيجة كل id على حدة (مش || على الـids الخام) — لو
    // session.client_id نفسه موجود بس غلط/قديم (مش null، بس مش بيتلاقى
    // في clients)، الـ|| كان هيوقف عنده وميوصلش لـprimaryPartyClientId
    // الصحيح خالص.
    const primaryPartyClientId = sessionParties.find((p) => p.client_id)?.client_id || null;
    const linkedClient = [session.client_id, primaryPartyClientId]
        .filter((id): id is string => !!id)
        .map((id) => clients.find((c) => c.id === id))
        .find((c): c is ClientRow => !!c) || null;
    const effectiveClientId = linkedClient?.id || session.client_id || primaryPartyClientId || null;
    // ⚡ NEW (خطة توحيد مصدر بيانات الموكل، مرحلة 7 — fallback الموكل
    // المحذوف): hasClient=true (effectiveClientId موجود) لكن linkedClient
    // طلع null — يعني الموكل ده اتحذف (soft-deleted) بعد ما الجلسة
    // اتربطت بيه، مش إن الجلسة مش مربوطة بحد أصلاً.
    // ⚡ CHANGED (خطة توحيد قفل الطرف، المرحلة 2): isOrphanedLink() الموحّدة
    // بدل الشرط اليدوي — نفس النتيجة بالظبط (hasClient && !linkedClient).
    const isOrphaned = isOrphanedLink(effectiveClientId, linkedClient);

    // كائن قضية اصطناعي خفيف بيتبنى من بيانات الجلسة المستقلة نفسها (مفيش قضية حقيقية أصلاً)
    // عشان يتمرر لـ SessionUpdateModal اللي بيتوقع caseData: MappedCase — نفس القيم بالظبط
    // اللي كانت بتتبني قبل التنظيف، مع كاست موثّق واحد لأن الشكل مش مطابق 100% لـ MappedCase
    // الحقيقي (الحقول دي بس شكل محلي يخدم الحقول اللي SessionUpdateModal.tsx بيقرأها فعليًا:
    // id/title/number/court).
    const caseData = {
        id: null,
        title: session.title || session.case_number || 'جلسة مستقلة',
        number: session.case_number || null,
        court: session.court || null,
        plaintiff: session.plaintiff || null,
        defendant: session.defendant || null,
        type: session.case_type || null,
        case_type: session.case_type || null,
    } as unknown as MappedCase;

    // ⚡ NEW: لو فيه صفوف case_parties لهذه الجلسة بنستخدمها، وإلا
    // fallback لعمودي plaintiff/defendant المفردين (جلسة قديمة). الاسم
    // المعروض = اسم أول طرف مسمّى + "وآخرين" لو الجهة فيها أكتر من شخص،
    // والصفة بتتاخد من حقل capacity المسجل فعليًا لأول شخص — مش كلمة
    // "موكل"/"خصم" ثابتة زي ما كان قبل كده.
    const plaintiffPersons: PartyPersonLike[] = (() => {
        const rows = sessionParties.filter((p) => p.side === 'plaintiff' && p.name?.trim());
        if (rows.length > 0) return rows;
        return session.plaintiff ? [{ name: session.plaintiff, capacity: session.plaintiff_role || '' }] : [];
    })();
    const defendantPersons: PartyPersonLike[] = (() => {
        const rows = sessionParties.filter((p) => p.side === 'defendant' && p.name?.trim());
        if (rows.length > 0) return rows;
        return session.defendant ? [{ name: session.defendant, capacity: session.defendant_role || '' }] : [];
    })();
    const plaintiffSummary = summarizePartySide(plaintiffPersons);
    const defendantSummary = summarizePartySide(defendantPersons);
    // ⚡ NEW (خطة توحيد قفل الطرف — المرحلة 3، سد فجوة 5.4، 6 أغسطس 2026):
    // شارة نصية صغيرة (إيموجي) بتتلحق باسم أول شخص مسمّى في الجهة، لو
    // بيانات case_parties.client_id متاحة له (بعد إضافتها للاستعلام
    // فوق). صفوف الـfallback القديمة (plaintiff/defendant المفردين،
    // جلسة قبل تعدد الأطراف) client_id مالهاش قيمة أصلًا فبترجع '' —
    // نفس شكل العرض القديم بالظبط بلا أي تغيير. الصفوف هنا كلها للعرض
    // القرائي فقط (rows أدناه بتاخد value: string|null بسيط، مش JSX)،
    // فالشارة نص مضغوط جنب الاسم بدل pill ملوّن كامل زي كارت الفورم.
    const sessionDomainContext: PartyDomainContext = { primaryClientId: session.client_id || null, clients };
    const partyStateBadgeSuffix = (persons: PartyPersonLike[]): string => {
        const first = persons[0] as (PartyPersonLike & { client_id?: string | null }) | undefined;
        if (!first?.client_id) return '';
        const badge = getPartyStateBadge(getPartyState({ client_id: first.client_id }, sessionDomainContext));
        return badge ? ` ${badge.emoji}` : '';
    };
    // 🔒 FIX (طلب "عرض اسم واحد بس من الخصوم" — 13 أغسطس 2026): partyLine
    // القديمة كانت بتختصر أي جهة فيها أكتر من شخص لـ"primaryName وآخرين"
    // (اسم واحد بس)، فالأسماء الباقية كانت بتختفي تمامًا من شاشة عرض
    // الجلسة المستقلة رغم إنها متسجلة فعليًا في case_parties. دلوقتي بتعرض
    // كل الأسماء المسجلة لكل جهة (زي InfoSection.tsx في تفاصيل القضية) —
    // شخص واحد: الاسم بس (زي ما كان بالظبط). أكتر من شخص: كل الأسماء
    // مفصولة بفاصلة، وصفة كل شخص جنب اسمه (بدل صف "صفة الطرف" المنفصل
    // اللي كان بيعرض صفة أول شخص بس ومبيعبّرش عن الجهة كلها).
    const partyNamesLine = (persons: PartyPersonLike[]): string | null => {
        const named = persons.filter((p) => p.name && p.name.trim());
        if (named.length === 0) return null;
        if (named.length === 1) {
            return `${named[0].name!.trim()}${partyStateBadgeSuffix(persons)}`;
        }
        return named.map((p, i) => {
            const nm = p.name!.trim();
            const cap = (p.capacity || '').trim();
            const suffix = i === 0 ? partyStateBadgeSuffix(persons) : '';
            return `${cap ? `${nm} (${cap})` : nm}${suffix}`;
        }).join('، ');
    };

    const rows: { label: string; value: string | null; key?: string }[] = [
        { label: '📅 التاريخ', value: session.session_date || null },
        { label: '🕐 التوقيت', value: session.session_time || null },
        { label: '🏛 المحكمة', value: session.court || null },
        { label: '📋 رقم القضية', value: session.case_number || null },
        { label: '📂 نوع القضية', value: session.case_type || null },
        { label: '⚖️ الدائرة', value: session.circuit_number || null },
        { label: '👤 الطرف الأول', value: partyNamesLine(plaintiffPersons), key: 'primaryParty' },
        { label: '🏷 صفة الطرف الأول', value: (plaintiffSummary && plaintiffSummary.othersCount === 0) ? plaintiffSummary.primaryCapacity || null : null },
        { label: '👤 الطرف الثاني', value: partyNamesLine(defendantPersons) },
        { label: '🏷 صفة الطرف الثاني', value: (defendantSummary && defendantSummary.othersCount === 0) ? defendantSummary.primaryCapacity || null : null },
        { label: '⚡ الإجراء القادم', value: session.next_action || null },
        { label: '📝 ما تم', value: session.result || null },
    ].filter((r) => r.value);

    // 🆕 (طلب "زر طباعة تقرير PDF لبيانات الجلسة المستقلة" — 13 أغسطس
    // 2026): نفس نمط handleExportPdf بتاع تقرير القضية (useCaseDetailActions.ts)
    // بالحرف (نفس الهيدر/الخط/شعار المكتب)، بس مبني على بيانات الجلسة
    // المستقلة نفسها (مفيش case_id أصلاً) بدل بيانات قضية كاملة — أطراف
    // الدعوى هنا بتتاخد من plaintiffPersons/defendantPersons فوق (نفس
    // مصدر العرض القرائي، فمفيش تعارض بين اللي ظاهر في الشاشة واللي
    // بيتطبع)، وسجل الجلسات القديمة (chainSessions) بيتعرض كقسم "الجلسات"
    // زي تقرير القضية بالظبط.
    const handleExportSessionPdf = async () => {
        setExportingPdf(true);
        try {
            const MONTHS_FULL = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
            const now = new Date();
            const dateStr = now.getDate() + ' ' + MONTHS_FULL[now.getMonth()] + ' ' + now.getFullYear();

            const [officeName, officeAddress, officePhone, officeEmail, officeLogo] = await Promise.all([
                loadOfficeSetting('office_name'),
                loadOfficeSetting('office_address'),
                loadOfficeSetting('office_phone'),
                loadOfficeSetting('office_email'),
                loadOfficeSetting('office_logo'),
            ]);
            const name = escapeHtml(officeName || '');
            const address = escapeHtml(officeAddress || '');
            const phone = escapeHtml(officePhone || '');
            const email = escapeHtml(officeEmail || '');
            const contactLine = [address, phone, email].filter(Boolean).join(' | ');

            const sanadSvg = `<svg width="32" height="32" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <line x1="6" y1="13" x2="34" y2="13" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="9.5" y1="21" x2="34" y2="21" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="13" y1="29" x2="34" y2="29" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="6" y1="13" x2="6" y2="32" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round"/>
          <circle cx="6" cy="13" r="4.5" fill="#D4AF37"/>
          <circle cx="6" cy="33" r="3" fill="#D4AF37" opacity="0.38"/>
        </svg>`;
            const logoHtml = officeLogo
                ? `<img src="${officeLogo}" style="width:56px;height:56px;object-fit:contain;border-radius:8px;border:1px solid rgba(255,255,255,0.2);" />`
                : `<div style="width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,#0d1a2e,#0B1320);border:1px solid rgba(212,175,55,0.25);display:flex;align-items:center;justify-content:center;">${sanadSvg}</div>`;
            const displayName = name || 'سَنَد';
            const displaySub = name ? '' : 'نظام التشغيل القانوني';

            const safeTitle = escapeHtml(session.title || 'جلسة مستقلة');
            const caseNum = (() => { const p = (session.case_number || '').split('/'); return p.length === 2 ? p[0] + ' لسنة ' + p[1] : session.case_number || '—'; })();
            const safeCaseNum = escapeHtml(caseNum);
            const safeCaseType = escapeHtml(session.case_type || '—');
            const safeCourt = escapeHtml(session.court || '—');
            const safeCourtLevel = escapeHtml(session.court_level || '');
            const safeCircuitNumber = escapeHtml(session.circuit_number || '');
            const safeDate = escapeHtml(session.session_date || '—');
            const safeTime = escapeHtml(session.session_time || '');

            // نفس renderPartySideBlock بتاع تقرير القضية بالحرف — شخص واحد:
            // بلوك حقل مفرد. أكتر من شخص: قايمة أسماء مضغوطة، صفة كل شخص جنبه.
            const renderPartySideBlock = (persons: PartyPersonLike[], labelSingle: string): string => {
                const named = persons.filter((p) => p.name && p.name.trim());
                if (named.length === 0) return '';
                if (named.length === 1) {
                    const p = named[0];
                    return `<div class="field"><label>${escapeHtml(p.capacity || labelSingle)}</label><span>${escapeHtml(p.name!.trim())}</span></div>`;
                }
                const lines = named.map((p) =>
                    `<div class="party-person-line">${escapeHtml(p.name!.trim())}${p.capacity ? ` <span class="party-person-capacity">(${escapeHtml(p.capacity)})</span>` : ''}</div>`
                ).join('');
                return `<div class="party-group-box">${lines}</div>`;
            };
            const hasParties = plaintiffPersons.some((p) => p.name?.trim()) || defendantPersons.some((p) => p.name?.trim());

            const safeSessionHall = escapeHtml(session.session_hall || '');
            const safeSecretaryHall = escapeHtml(session.secretary_hall || '');
            const safeSecretaryName = escapeHtml(session.secretary_name || '');
            const safeSecretaryMobile = escapeHtml(session.secretary_mobile || '');
            const safeSessionTimeLabel = safeTime === 'صباحي' ? '🌅 صباحي' : safeTime === 'مسائي' ? '🌆 مسائي' : '';
            const hasExtraInfo = !!(safeSessionTimeLabel || safeSessionHall || safeSecretaryHall || safeSecretaryName || safeSecretaryMobile);

            const safeNextAction = escapeHtml(session.next_action || '');
            const safeResult = escapeHtml(session.result || '');

            const historySessions = chainSessions.length > 1 ? chainSessions : [];

            const win = window.open('', '_blank');
            if (!win) { setExportingPdf(false); return; }

            const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><title>تقرير الجلسة - ${safeTitle}</title>
${PDF_FONT_LINK}
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:${PDF_FONT_FAMILY};background:#f8f9fa;color:#1a1a2e;padding:20px;}
  .page{max-width:800px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);}
  .header{background:linear-gradient(135deg,#1a1a2e,#16213e);color:#D4AF37;padding:28px 32px;}
  .header-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
  .office-info{display:flex;align-items:center;gap:12px;}
  .office-name{font-size:16px;font-weight:900;color:#D4AF37;}
  .office-contact{font-size:10px;color:rgba(212,175,55,0.6);margin-top:2px;}
  .case-title{font-size:20px;font-weight:900;color:#fff;text-align:center;}
  .case-sub{font-size:11px;color:rgba(212,175,55,0.7);text-align:center;margin-top:6px;}
  .badge{display:inline-block;padding:4px 14px;border-radius:20px;border:1px solid #D4AF37;color:#D4AF37;font-size:11px;margin-top:8px;}
  .header-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px;padding-top:16px;border-top:1px solid rgba(212,175,55,0.2);}
  .header-field{background:rgba(255,255,255,0.06);border:1px solid rgba(212,175,55,0.15);border-radius:8px;padding:10px 12px;}
  .header-field label{font-size:9px;color:rgba(212,175,55,0.65);display:block;margin-bottom:3px;font-weight:700;}
  .header-field span{font-size:12px;font-weight:700;color:#fff;}
  .gold-bar{height:3px;background:linear-gradient(90deg,#D4AF37,#E8C84A,#D4AF37);}
  .section{padding:20px 24px;border-bottom:1px solid #f0f0f0;}
  .section h2{font-size:13px;font-weight:900;color:#1a1a2e;margin-bottom:14px;padding-bottom:6px;border-bottom:2px solid #D4AF37;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .field{background:#f8f9fa;border-radius:8px;padding:10px 12px;}
  .field label{font-size:9px;color:#888;display:block;margin-bottom:3px;font-weight:700;}
  .field span{font-size:12px;font-weight:700;color:#1a1a2e;}
  .party-group-box{grid-column:1/-1;background:#f8f9fa;border-radius:8px;padding:10px 12px;}
  .party-person-line{font-size:11px;font-weight:700;color:#1a1a2e;padding:2px 0;}
  .party-person-capacity{font-size:10px;font-weight:600;color:#888;}
  .session-card{border:1px solid #e8e8e8;border-right:4px solid #D4AF37;border-radius:8px;padding:12px;margin-bottom:8px;}
  .session-date{font-size:12px;font-weight:900;color:#D4AF37;margin-bottom:6px;}
  .session-label{font-size:9px;color:#888;font-weight:700;margin-top:6px;}
  .session-val{font-size:11px;color:#333;margin-top:2px;line-height:1.6;}
  .footer{background:#f8f9fa;padding:14px 24px;text-align:center;font-size:9px;color:#888;}
  @media print{body{padding:0;}.page{box-shadow:none;border-radius:0;}}
</style></head><body>
<div class="page">
  <div class="header">
    <div class="header-top">
      <div class="office-info">
        ${logoHtml}
        <div>
          <div class="office-name">${displayName}</div>
          ${displaySub ? `<div style="font-size:9px;color:rgba(212,175,55,0.5);margin-top:1px;">${displaySub}</div>` : ''}
          ${contactLine ? `<div class="office-contact">${contactLine}</div>` : ''}
        </div>
      </div>
      <div style="text-align:left">
        <div style="font-size:10px;color:rgba(212,175,55,0.6);">تاريخ الإصدار</div>
        <div style="font-size:12px;font-weight:700;color:#D4AF37;">${dateStr}</div>
      </div>
    </div>
    <div style="border-top:1px solid rgba(212,175,55,0.2);padding-top:16px;text-align:center;">
      <div class="case-title">⚡ ${safeTitle}</div>
      <div class="case-sub">تقرير جلسة مستقلة (غير مرتبطة بملف قضية)</div>
      <div class="badge">${safeDate}${safeTime ? ' — ' + escapeHtml(safeSessionTimeLabel || safeTime) : ''}</div>
    </div>
    <div class="header-fields">
      <div class="header-field"><label>رقم القيد</label><span>${safeCaseNum}</span></div>
      <div class="header-field"><label>نوع القضية</label><span>${safeCaseType}</span></div>
      <div class="header-field"><label>المحكمة</label><span>${safeCourt}</span></div>
      ${safeCourtLevel ? `<div class="header-field"><label>درجة التقاضي</label><span>${safeCourtLevel}</span></div>` : ''}
      ${safeCircuitNumber ? `<div class="header-field"><label>رقم الدائرة</label><span>${safeCircuitNumber}</span></div>` : ''}
    </div>
  </div>
  <div class="gold-bar"></div>

  ${hasParties ? `
  <div class="section">
    <h2>⚖️ أطراف الدعوى</h2>
    <div class="grid2">
      ${renderPartySideBlock(plaintiffPersons, 'الطرف الأول')}
      ${renderPartySideBlock(defendantPersons, 'الطرف الثاني')}
    </div>
  </div>` : ''}

  ${hasExtraInfo ? `
  <div class="section">
    <h2>🗂 بيانات إضافية</h2>
    <div class="grid2">
      ${safeSessionHall ? `<div class="field"><label>الطابق وقاعة الجلسة</label><span>${safeSessionHall}</span></div>` : ''}
      ${safeSecretaryHall ? `<div class="field"><label>قاعة سكرتير الجلسة</label><span>${safeSecretaryHall}</span></div>` : ''}
      ${safeSecretaryName ? `<div class="field"><label>اسم سكرتير الجلسة</label><span>${safeSecretaryName}</span></div>` : ''}
      ${safeSecretaryMobile ? `<div class="field"><label>موبايل سكرتير الجلسة</label><span>${safeSecretaryMobile}</span></div>` : ''}
    </div>
  </div>` : ''}

  ${(safeNextAction || safeResult) ? `
  <div class="section">
    <h2>📝 آخر تحديث</h2>
    <div class="grid2">
      ${safeResult ? `<div class="field" style="grid-column:1/-1;"><label>ما تم في الجلسة</label><span>${safeResult}</span></div>` : ''}
      ${safeNextAction ? `<div class="field" style="grid-column:1/-1;"><label>الإجراء القادم</label><span>${safeNextAction}</span></div>` : ''}
    </div>
  </div>` : ''}

  ${historySessions.length > 0 ? `
  <div class="section">
    <h2>🕓 سجل الجلسات (${historySessions.length})</h2>
    ${historySessions.map((s) => `
    <div class="session-card">
      <div class="session-date">📅 ${escapeHtml(s.session_date || '')}${s.id === session.id ? ' (الحالية)' : ''}</div>
      ${s.result ? `<div class="session-label">ما تم</div><div class="session-val">${escapeHtml(s.result)}</div>` : ''}
    </div>`).join('')}
  </div>` : ''}

  <div class="footer">🔒 ملف سري — ${displayName}${contactLine ? ' | ' + contactLine : ''} | تاريخ الإصدار: ${dateStr}</div>
</div>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;
            win.document.write(html);
            win.document.close();
            toast('📄 جاري فتح ملف الطباعة...');
        } finally {
            setExportingPdf(false);
        }
    };

    // 🆕 (توحيد الأوفلاين لشاشة الجلسة المستقلة — 5 أغسطس 2026): __dbWrite
    // بدل db.from(...).delete() المباشر — لو النت مقطوع، الحذف بيتقيّد في
    // طابور الأوفلاين (window.__dbWrite) بدل ما يفشل بتوست خطأ عادي، ويتزامن
    // فعليًا لما النت يرجع. مفيش داعي لسنتينل `_offlineSessionCaseId` هنا
    // (زي useCaseSessions.ts) لأن دي أصلاً جلسة *مستقلة* — case_id بتاعها
    // null دايمًا، فمفيش next_hearing لقضية نعيد حسابه بعد المزامنة.
    const handleDelete = async () => {
        setDeleting(true);
        try {
            const { error, offline, queued } = await window.__dbWrite({ type: 'DELETE', table: 'case_sessions', id: session.id });
            if (error) {
                showErrorToast('session_delete', error, 'تعذّر حذف الجلسة. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'حذف الجلسة');
                return;
            }
            recordSuccess('session_delete');
            toast(offline && queued ? '📥 حذف الجلسة محفوظ محلياً — سيُزامن عند عودة الإنترنت' : '✅ تم حذف الجلسة');
            onDone();
            onClose();
        } catch { toast('❌ خطأ غير متوقع', true); }
        finally { setDeleting(false); setShowConfirmDelete(false); }
    };

    // ⚡ NEW (استرجاع ميزة "تحويل الجلسة المستقلة لقضية" — 11 أغسطس 2026):
    // كانت متاحة قبل كده عبر LinkSessionModal (اتشالت من زمان) وهوكها
    // useSessionLinking.ts (اتشال بعدها كـ"كود ميت" — راجع تعليق الإيمبورت
    // فوق). بتستخدم نفس buildCaseInsertData/linkSessionGroupToCase اللي
    // فورم الإنشاء (useClientLinking.ts) بيستخدمها فعليًا — منطق واحد بس.
    // ⚠️ buildCaseInsertData (Phase F.3، 6 أغسطس) مبقتش بتكتب أعمدة
    // plaintiff/defendant المفردة القديمة على جدول cases خالص — فمفيش
    // داعي نحسب "الطرف الأساسي" هنا زي فورم الإنشاء، أطراف الدعوى الحقيقية
    // (بأسمائها وأرقامها القومية) بتتنقل لوحدها عبر linkSessionGroupToCase
    // (اللي بينادي movePartiesFromSessionToCase داخليًا لكل جلسة في نفس
    // السلسلة). session.session_group_id (مش null زي فورم الإنشاء) بيتبعت
    // هنا عشان لو الجلسة دي عضو في سلسلة "⚡ تحديث الجلسة"، كل السلسلة
    // تتحول مع بعض دفعة واحدة (بدل ما جلسات تانية تفضل مستقلة غلط).
    const handleConvertToCase = async () => {
        setConverting(true);
        try {
            const caseTitle = session.title || session.case_number || 'قضية من جلسة مستقلة';
            // 🔒 FIX (خلل: تعذّر إنشاء القضية — idx_cases_tenant_case_number_unique،
            // 12 أغسطس 2026): نفس الفيكس المطبّق في useClientLinking.ts
            // (handleLinkCase) — هنا كمان كان مفيش فحص تكرار رقم القيد قبل
            // الـ INSERT، فرقم قيد مسجل بالفعل لقضية بنفس المحكمة والنوع
            // كان بيوصّل لرسالة Postgres خام غير مفهومة للمستخدم بدل رسالة
            // واضحة زي باقي مسارات إنشاء القضية.
            // 🔒 FIX (تقرير فحص أعطال الأوف لاين — 13 أغسطس 2026): أوف لاين أو
            // تايم آوت بيأجّلوا الفحص بدل ما يوقفوا التحويل بالكامل — نفس
            // فيكس useClientLinking.ts (handleLinkCase).
            let caseDup: { duplicate: boolean; message?: string } = { duplicate: false };
            try {
                const check = await runDuplicateCheckOfflineAware((signal) =>
                    checkCaseNumberDuplicate(db, session.case_number, session.court_level, session.case_type, undefined, signal)
                );
                if (check.skipped) toast('⚠️ أوف لاين — فحص تكرار رقم القيد هيتأجل لحد المزامنة', false);
                else caseDup = check.result!;
            } catch (e) {
                showErrorToast('case_number_duplicate_check', e, 'تعذّر التحقق من رقم القيد. حاول مرة أخرى.', 'تحويل جلسة لقضية');
                return;
            }
            recordSuccess('case_number_duplicate_check');
            if (caseDup.duplicate) {
                toast(caseDup.message!, true);
                return;
            }
            const offlineTempId = makeOfflineTempId();
            const { error, offline, queued, data: insertedCase } = await window.__dbWrite({
                type: 'INSERT',
                table: 'cases',
                data: buildCaseInsertData({
                    court: session.court,
                    caseNumber: session.case_number,
                    caseType: session.case_type,
                    circuitNumber: session.circuit_number,
                    sessionHall: session.session_hall,
                    sessionTime: session.session_time,
                    courtLevel: session.court_level,
                    secretaryHall: session.secretary_hall,
                    secretaryName: session.secretary_name,
                    secretaryMobile: session.secretary_mobile,
                    // 🔒 FIX (المسمى القانوني الجامع بيتمسح بعد تحويل جلسة
                    // لقضية — 12 أغسطس 2026): مكانوش متبعتين هنا خالص —
                    // راجع تعليق buildCaseInsertData في
                    // caseSessionLinkingShared.ts لتفاصيل السبب الكامل
                    // (بما فيه الجزء التاني من الباج، اللي كان في الدالة
                    // نفسها بتتجاهل القيمتين حتى لو اتبعتوا).
                    plaintiffLegalTitle: session.plaintiff_legal_title,
                    defendantLegalTitle: session.defendant_legal_title,
                }, caseTitle, offlineTempId, session.client_id ?? null),
                returning: true,
            });
            if (error) {
                // 🔒 FIX (نفس الفيكس فوق): خط دفاع أخير لو الفحص المسبق فوّت حالة
                // (سباق بين تبويبين، إلخ) — نفس رسالة useCaseActions.ts/
                // useClientLinking.ts بالظبط بدل الرسالة العامة.
                if ((error as { code?: string }).code === '23505') {
                    toast('⚠️ رقم القيد ده مسجل بالفعل لقضية موجودة', true);
                } else {
                    showErrorToast('case_create', error, 'تعذّر إنشاء القضية. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'إنشاء قضية');
                }
                return;
            }
            // نفس منطق useClientLinking.ts: أوفلاين، مفيش id حقيقي راجع —
            // بنستخدم التمبيد نفسه كمرجع مؤقت لحد ما يتزامن.
            const realOrTempCaseId = (offline && queued) ? offlineTempId : (insertedCase as { id: string } | null)?.id;
            if (!realOrTempCaseId) {
                showErrorToast('case_create', new Error('no id returned'), 'تعذّر إنشاء القضية. حاول مرة أخرى.', 'إنشاء قضية');
                return;
            }
            recordSuccess('case_create');
            const groupLinkResult = await linkSessionGroupToCase(
                db, { id: session.id, session_group_id: session.session_group_id }, realOrTempCaseId, offline, queued, offlineTempId, caseTitle,
            );
            if (!groupLinkResult.ok && groupLinkResult.failedIds.includes(session.id)) {
                showErrorToast('session_case_link', null, 'تم إنشاء القضية لكن تعذّر ربط الجلسة بها. حاول تحديث الصفحة.', 'ربط الجلسة بالقضية');
                return;
            }
            recordSuccess('session_case_link');
            if (offline && queued) {
                toast('📥 القضية محفوظة محلياً — ستُضاف وتترّبط الجلسة بيها فور عودة الإنترنت');
            } else if (!groupLinkResult.ok) {
                toast('⚠️ تم إنشاء القضية وربط الجلسة، لكن حصل خطأ في نقل بعض أطراف الدعوى الإضافية — راجعها يدويًا', true);
            } else {
                // ⚡ NEW (فتح ملف القضية فورًا بعد التحويل — 12 أغسطس 2026):
                // أونلاين بس (لو أوفلاين، realOrTempCaseId تمبيد محلي —
                // مفيش صف حقيقي في cases نقدر نجيبه بيه لحد ما يتزامن).
                const mapped = onOpenCase ? await fetchMappedCaseById(realOrTempCaseId) : null;
                if (mapped) {
                    toast('✅ تم تحويل الجلسة لقضية بنجاح');
                    onOpenCase!(mapped);
                } else {
                    toast('✅ تم تحويل الجلسة لقضية بنجاح — هتلاقيها في تبويب القضايا');
                }
                // next_hearing للقضية الجديدة — أونلاين بس (أوفلاين هتتحسب
                // تلقائيًا بعد المزامنة، نفس تعليق useClientLinking.ts).
                await recalcNextHearing(db, realOrTempCaseId);
            }
            setShowConvertConfirm(false);
            onDone();
            onClose();
        } catch {
            toast('❌ حدث خطأ غير متوقع، حاول مرة أخرى', true);
        } finally {
            setConverting(false);
        }
    };

    // ⚡ NEW: نفس منطق handleUnlink اللي كان جوه EditStandaloneModal بالظبط،
    // بس هنا بيحدّث fullSession محليًا كمان عشان زرار الربط/فك الربط يتحدّث
    // فورًا من غير ما يقفل الشاشة (بعكس الحذف).
    // 🆕 (توحيد الأوفلاين — 5 أغسطس 2026): __dbWrite بدل safeUpdate — بيحافظ
    // على نفس فحص التعارض (knownUpdatedAt) أونلاين، وبيقيّد في طابور
    // الأوفلاين لو النت مقطوع بدل الفشل المباشر.
    // 🔒 FIX (توحيد فك ربط الطرف الأساسي — 8 أغسطس 2026): قبل كده الدالة
    // دي كانت بتصفّر case_sessions.client_id بس، من غير ما تلمس صف
    // case_parties المطابق للطرف الأساسي — فيسيبه شايل client_id قديم،
    // ولما الفورم يتفتح تاني getPartyState يصنّفه "طرف ثانوي مربوط" بدل
    // حر (رغم إن التوست بيقول "بقت قابلة للتعديل"). دلوقتي بنجيب صفوف
    // case_parties بتاعة الجلسة أول (fetchSessionClientParties — نفس
    // الدالة المستخدمة في مكان تاني، مفيش استعلام جديد)، ولو لقينا الطرف
    // اللي client_id بتاعه بيطابق session.client_id، بنستخدم
    // unlinkClientFromSessionParty (بتصفّر الجدولين مع بعض بفحص تعارض
    // منفصل لكل واحد). لو مفيش أي صف case_parties أصلًا (جلسة قديمة قبل
    // نظام تعدد الأطراف)، بنرجع بالظبط لنفس السلوك القديم (تحديث
    // case_sessions بس) — صفر تغيير سلوك لهذه الحالة.
    const handleUnlinkClient = async () => {
        setUnlinkingClient(true);
        const sessionParties = await fetchSessionClientParties(db, session.id);
        const matchedParty = session.client_id
            ? sessionParties.find((p) => p.client_id === session.client_id)
            : undefined;

        if (matchedParty) {
            const result = await unlinkClientFromSessionParty(
                matchedParty.id, true, session.id,
                matchedParty.updated_at ?? null, session.updated_at || null,
            );
            setUnlinkingClient(false);
            if (result.conflict) {
                toast(result.conflictScope === 'session'
                    ? '⚠️ هذه الجلسة عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة'
                    : '⚠️ بيانات هذا الطرف عدّلها شخص آخر بعد ما فتحت الجلسة — أعد المحاولة', true);
                return;
            }
            if (!result.ok) {
                showErrorToast('session_unlink', new Error('unlink session primary party failed'), 'تعذّر فك ربط الجلسة عن الموكل. حاول مرة أخرى.', 'فك ربط الجلسة');
                return;
            }
            recordSuccess('session_unlink');
            toast('✅ تم فك الربط — بيانات الموكل في الجلسة بقت قابلة للتعديل الحر');
            setFullSession((prev) => ({ ...prev, client_id: null }));
            setShowUnlinkConfirm(false);
            onDone();
            return;
        }

        // فولباك: مفيش صف case_parties مطابق (جلسة قديمة قبل مرحلة تعدد
        // الأطراف) — نفس الكتابة المباشرة القديمة بالظبط.
        const { error, offline, queued, conflict } = await window.__dbWrite({
            type: 'UPDATE', table: 'case_sessions', id: session.id,
            data: { client_id: null },
            knownUpdatedAt: session.updated_at || null,
        });
        setUnlinkingClient(false);
        if (conflict) { toast('⚠️ هذه الجلسة عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة', true); return; }
        if (error) {
            showErrorToast('session_unlink', error, 'تعذّر فك ربط الجلسة عن الموكل. حاول مرة أخرى.', 'فك ربط الجلسة');
            return;
        }
        recordSuccess('session_unlink');
        toast(offline && queued
            ? '📥 فك الربط محفوظ محلياً — سيُزامن عند عودة الإنترنت'
            : '✅ تم فك الربط — بيانات الموكل في الجلسة بقت قابلة للتعديل الحر');
        setFullSession((prev) => ({ ...prev, client_id: null }));
        setShowUnlinkConfirm(false);
        onDone();
    };

    const modal = React.createElement('div', {
        className: `fixed inset-0 z-50 flex ${modalPresentation.overlayAlignClassName} justify-center`,
        style: { background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' },
        onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); }
    },
        React.createElement('div', {
            className: `w-full max-w-lg ${modalPresentation.isDesktop ? 'rounded-3xl' : 'rounded-t-3xl'} overflow-hidden bg-premium-card border border-white/8`,
            style: { maxHeight: '90vh' },
            'data-testid': 'standalone-session-detail-modal'
        },
            // ── هيدر ──
            React.createElement('div', { className: 'flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/5' },
                React.createElement('div', { className: 'flex items-center gap-2' },
                    React.createElement('span', { className: 'text-xl' }, '⚡'),
                    React.createElement('div', null,
                        React.createElement('h2', { className: 'text-sm font-black text-white' }, session.title || 'جلسة مستقلة'),
                        React.createElement('p', { className: 'text-[10px] text-amber-400/70' }, 'جلسة غير مرتبطة بملف قضية')
                    )
                ),
                React.createElement('button', {
                    onClick: onClose,
                    className: 'w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-slate-400 hover:bg-white/10',
                    'data-testid': 'standalone-session-detail-header-close'
                }, React.createElement(I.X))
            ),

            // ── تفاصيل ──
            React.createElement('div', {
                className: 'overflow-y-auto px-5 py-4 space-y-2',
                style: { maxHeight: 'calc(90vh - 160px)' }
            },
                ...rows.map(({ label, value, key }) => {
                    // ⚡ سطر "👤 الموكل" بس — لو الجلسة مربوطة بموكل حي
                    // (hasClient)، بيظهر تحته زرار "🔓 فك الربط".
                    if (key === 'primaryParty' && hasClient) {
                        return React.createElement('div', {
                            key: label,
                            className: 'py-2 border-b border-white/5'
                        },
                            React.createElement('div', { className: 'flex items-start justify-between gap-3' },
                                React.createElement('span', { className: 'text-[10px] font-bold text-slate-500 shrink-0' }, label),
                                ' ',
                                React.createElement('span', { className: 'text-[11px] font-semibold text-white text-left' }, value)
                            ),
                            // ⚡ NEW (مرحلة 7 — fallback الموكل المحذوف): الموكل
                            // المرتبط بالجلسة دي اتحذف — القيمة فوق آخر نسخة معروفة.
                            isOrphaned && React.createElement('p', {
                                className: 'text-[9px] text-amber-400 font-bold mt-1',
                                'data-testid': 'standalone-orphaned-client-note'
                            }, '⚠️ الموكل ده محذوف من قائمة الموكلين'),
                            showUnlinkConfirm
                                ? React.createElement('div', { className: 'mt-2 space-y-2' },
                                    React.createElement('p', { className: 'text-[9px] text-slate-500 leading-relaxed' },
                                        'متأكد؟ هيتصفّر ربط الجلسة بملف الموكل، وترجع بياناته قابلة للتعديل الحر.'
                                    ),
                                    React.createElement('div', { className: 'flex gap-2' },
                                        React.createElement('button', {
                                            disabled: unlinkingClient,
                                            onClick: handleUnlinkClient,
                                            className: 'flex-1 bg-rose-500 text-white rounded-lg py-1.5 text-[10px] font-black disabled:opacity-60',
                                            'data-testid': 'standalone-session-unlink-confirm'
                                        }, unlinkingClient ? '⏳ جارٍ فك الربط...' : 'نعم، افصل الربط'),
                                        React.createElement('button', {
                                            disabled: unlinkingClient,
                                            onClick: () => setShowUnlinkConfirm(false),
                                            className: 'flex-1 bg-white/5 border border-white/10 text-slate-300 rounded-lg py-1.5 text-[10px] font-black disabled:opacity-60',
                                            'data-testid': 'standalone-session-unlink-cancel'
                                        }, 'إلغاء')
                                    )
                                  )
                                : React.createElement('div', { className: 'flex justify-end mt-1' },
                                    React.createElement('button', {
                                        onClick: () => setShowUnlinkConfirm(true),
                                        className: 'text-[9px] font-black text-rose-400',
                                        'data-testid': 'standalone-session-unlink-trigger'
                                    }, '🔓 فك الربط')
                                  )
                        );
                    }
                    return React.createElement('div', {
                        key: label,
                        className: 'flex items-start justify-between gap-3 py-2 border-b border-white/5'
                    },
                        React.createElement('span', { className: 'text-[10px] font-bold text-slate-500 shrink-0' }, label),
                        ' ',
                        React.createElement('span', { className: 'text-[11px] font-semibold text-white text-left' }, value)
                    );
                }),

                // ── 🕓 سجل هذه الجلسة (خطة تسلسل الجلسة المستقلة، 3 أغسطس 2026) ──
                // بيظهر بس لو فيه أكتر من جلسة واحدة في نفس السلسلة (مفيش
                // فايدة تعرض سجل من عنصر واحد). قرائي بالكامل — قصده يورّي
                // "الجلسات القديمة لسه موجودة" مش تعديلها من هنا.
                chainSessions.length > 1 && React.createElement('div', {
                    className: 'pt-3 mt-1',
                    'data-testid': 'standalone-session-chain-history'
                },
                    React.createElement('h4', { className: 'text-[10px] font-black text-slate-400 mb-2' }, '🕓 سجل هذه الجلسة'),
                    ...chainSessions.map((s) => {
                        const isCurrent = s.id === session.id;
                        return React.createElement('div', {
                            key: s.id,
                            className: `py-1.5 border-b border-white/5 ${isCurrent ? '' : 'opacity-70'}`
                        },
                            React.createElement('div', { className: 'flex items-center justify-between gap-3' },
                                React.createElement('span', { className: 'text-[10px] font-bold text-slate-300' },
                                    `📅 ${s.session_date || '—'}${isCurrent ? ' (الحالية)' : ''}`
                                )
                            ),
                            s.result && React.createElement('p', { className: 'text-[10px] text-slate-500 mt-0.5' }, `📝 ${s.result}`)
                        );
                    })
                )
            ),

            // ── Footer ──
            React.createElement('div', { className: 'px-5 pb-5 pt-3 border-t border-white/5 space-y-2' },
                // ⚡ NEW (استرجاع ميزة "تحويل الجلسة المستقلة لقضية" — 11
                // أغسطس 2026): زرار منفصل وواضح فوق "⚡ تحديث الجلسة" —
                // إجراء كبير (بيعمل قضية جديدة ويحول الجلسة كلها ليها).
                React.createElement('button', {
                    onClick: () => setShowConvertConfirm(true),
                    disabled: loadingFull,
                    className: 'w-full py-2.5 rounded-2xl text-xs font-black text-premium-gold bg-premium-gold/10 border border-premium-gold/30 hover:bg-premium-gold/15 transition-all disabled:opacity-50',
                    'data-testid': 'standalone-session-convert-to-case-trigger'
                }, '🔁 تحويل الجلسة لقضية'),

                // زر تحديث الجلسة — كبير ذهبي
                React.createElement('button', {
                    onClick: () => setShowUpdate(true),
                    disabled: loadingFull,
                    className: 'w-full py-3 rounded-2xl text-xs font-black text-premium-bg transition-all disabled:opacity-50',
                    style: { background: 'linear-gradient(135deg,#d4af37,#f0c040)' },
                    'data-testid': 'standalone-session-update-trigger'
                }, loadingFull ? '⏳ جاري تحميل بيانات الجلسة...' : '⚡ تحديث الجلسة'),

                // صف الأزرار الصغيرة
                React.createElement('div', { className: 'flex gap-2' },
                    React.createElement('button', {
                        onClick: onClose,
                        className: 'flex-1 py-2.5 rounded-2xl text-xs font-bold text-slate-400 bg-white/5 hover:bg-white/10 transition-all',
                        'data-testid': 'standalone-session-footer-close'
                    }, 'إغلاق'),
                    // 🆕 (طلب "زر طباعة تقرير PDF لبيانات الجلسة المستقلة" — 13
                    // أغسطس 2026): نفس مكان/شكل زرار "📄 تصدير PDF" بتاع تقرير
                    // القضية (CaseDetailView.tsx) — بس هنا بصف الأزرار الصغيرة
                    // جنب تعديل/حذف بدل هيدر منفصل.
                    React.createElement('button', {
                        onClick: handleExportSessionPdf,
                        disabled: loadingFull || exportingPdf,
                        className: 'flex-1 py-2.5 rounded-2xl text-xs font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-all disabled:opacity-50',
                        'data-testid': 'standalone-session-export-pdf-trigger'
                    }, exportingPdf ? '⏳ ...' : '📄 طباعة'),
                    // ⚡ NEW (مرحلة 3 خطة الصلاحيات — الجلسات المستقلة):
                    // بيختفي كليًا لمن ليس له can_edit_sessions.
                    canEditSession && React.createElement('button', {
                        onClick: () => setShowEdit(true),
                        disabled: loadingFull,
                        className: 'flex-1 py-2.5 rounded-2xl text-xs font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-all disabled:opacity-50',
                        'data-testid': 'standalone-session-edit-trigger'
                    }, '✏️ تعديل'),
                    // ⚡ NEW (مرحلة 3 خطة الصلاحيات — الجلسات المستقلة):
                    // بيختفي كليًا لمن ليس له can_delete_sessions.
                    canDeleteSession && React.createElement('button', {
                        onClick: () => setShowConfirmDelete(true),
                        disabled: deleting,
                        className: 'flex-1 py-2.5 rounded-2xl text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-all disabled:opacity-40',
                        'data-testid': 'standalone-session-delete-trigger'
                    }, '🗑 حذف')
                )
            )
        )
    );

    return React.createElement(React.Fragment, null,
        createPortal(modal, document.body),
        showConfirmDelete && createPortal(React.createElement(DeleteConfirmModal, {
            title: "حذف الجلسة",
            itemName: session.title || session.case_number || 'جلسة مستقلة',
            itemType: "الجلسة",
            mode: "delete",
            loading: deleting,
            onConfirm: handleDelete,
            onCancel: () => setShowConfirmDelete(false),
            inputTestId: 'standalone-session-delete-input',
            confirmTestId: 'standalone-session-delete-confirm',
            cancelTestId: 'standalone-session-delete-cancel',
        }), document.body),
        // ⚡ NEW (استرجاع ميزة "تحويل الجلسة المستقلة لقضية" — 11 أغسطس
        // 2026): تأكيد بسيط (مش DeleteConfirmModal — ده مش حذف، وماحدش
        // محتاج يكتب اسم الجلسة عشان يأكد)، نفس نمط تأكيد الحذف البسيط
        // المستخدم في CaseDetailView.tsx.
        showConvertConfirm && createPortal(
            React.createElement('div', {
                className: 'fixed inset-0 z-[95] flex items-center justify-center bg-black/80 backdrop-blur-sm p-5',
                onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget && !converting) setShowConvertConfirm(false); }
            },
                React.createElement('div', { className: 'w-full max-w-sm bg-premium-card border border-white/10 rounded-3xl p-6 slide-up shadow-2xl space-y-4' },
                    React.createElement('h3', { className: 'text-sm font-black text-white' }, '🔁 تحويل الجلسة لقضية'),
                    React.createElement('p', { className: 'text-xs text-slate-400 leading-relaxed' },
                        'هيتعمل ملف قضية جديد ببيانات الجلسة دي (المحكمة/رقم القضية/الأطراف)، وهتترّبط بيها الجلسة تلقائيًا. لو الجلسة دي جزء من سلسلة "⚡ تحديث"، كل السلسلة هتترّبط بنفس القضية.'
                    ),
                    React.createElement('div', { className: 'flex gap-3' },
                        React.createElement('button', {
                            onClick: handleConvertToCase,
                            disabled: converting,
                            'data-testid': 'standalone-session-convert-to-case-confirm',
                            className: 'flex-1 py-3 bg-premium-gold text-black rounded-xl text-xs font-black active:scale-95 transition-all disabled:opacity-60'
                        }, converting ? '⏳ جاري التحويل...' : 'نعم، حوّلها لقضية'),
                        React.createElement('button', {
                            onClick: () => setShowConvertConfirm(false),
                            disabled: converting,
                            'data-testid': 'standalone-session-convert-to-case-cancel',
                            className: 'flex-1 py-3 bg-white/5 text-slate-300 rounded-xl text-xs font-black active:scale-95 transition-all disabled:opacity-60'
                        }, 'إلغاء')
                    )
                )
            ), document.body),
        showEdit && React.createElement(EditStandaloneModal, {
            session, db,
            onClose: () => setShowEdit(false),
            onSaved: () => { onDone(); onClose(); },
            linkedClient,
            clients,
            onOpenClientProfile: onOpenClientProfile ? (c: ClientRow) => { wasEditingRef.current = true; setShowEdit(false); onOpenClientProfile(c); } : undefined,
            countryCourts,
            countryCaseTypes,
        }),
        showUpdate && React.createElement(SessionUpdateModal, {
            session, caseData, db,
            onClose: () => setShowUpdate(false),
            onDone: () => { onDone(); onClose(); },
            onNotify,
            linkedClient,
        })
    );
}

export default StandaloneSessionDetailModal;
