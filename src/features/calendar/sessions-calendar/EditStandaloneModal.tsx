// ══════════════════════════════════════════════════════════════
// EditStandaloneModal.tsx — مستخرج من StandaloneSessionDetailModal.tsx
// (تفكيك المرحلة 4 من خطة تحسين الأداء، 7 سبتمبر 2026). استخراج مباشر
// بدون إعادة كتابة — نفس المنطق والتعليقات الأصلية بالحرف. يحتوي على
// EditStandaloneModal (الغلاف الخارجي اللي بيجيب أطراف الجلسة من
// case_parties) وEditStandaloneModalForm (الفورم الفعلي). النسخة
// الأصلية الكاملة محفوظة في docs/archive/StandaloneSessionDetailModal.pre-phase4-split.tsx.txt
// ══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '../../../shared/lib/notifications';
import { showErrorToast } from '../../../shared/lib/errorReporting';
import { recordSuccess } from '../../../systemHealth';
import { I } from '../../../constants';
import { Inp } from '@/shared/ui/Inp';
import { Sel } from '@/shared/ui/Sel';
import { COURT_LEVELS, onlyDigits, Field } from '../NewStandaloneSessionModal';
import { normalizeArabicDigits } from '../../../shared/lib/sanitize';
import { useModalPresentation } from '@/shared/hooks/useModalPresentation';
import type { SessionWithLegacyFields } from '../../../types';
import { syncSessionIdentityToGroupSiblings } from '../hooks/caseSessionLinkingShared';
import { usePartyFields } from '@/shared/parties/usePartyFields';
import { PartyFieldsGroup } from '@/shared/parties/PartyFieldsGroup';
import { validateParties } from '@/shared/lib/casePartiesValidation';
import { useFormDraft } from '@/shared/hooks/useFormDraft';
import { useUnsavedChangesGuard } from '@/shared/hooks/useUnsavedChangesGuard';
import type { PartyFieldValue, PartySide } from '@/shared/parties/partyTypes';
import {
    getPartyState,
    isLinkedState,
    isOrphanState,
    isOrphanedLink,
    canUnlinkParty,
    getPartyStateMessage,
    type PartyDomainContext,
} from '@/shared/parties/partyDomainService';
import type { ClientRow } from '../../../types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../database.types';

const CASE_TYPES = ['مدني', 'تجاري', 'جنائي', 'عمالي', 'إداري', 'أسرة', 'أخرى'];
const inputCls = 'w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600';
const inputStyle = { fontFamily: 'Cairo,sans-serif' };
// 🔒 FIX (تقرير الموثوقية — نتيجة 4، ثم CHANGED مرحلة 6.4 خطة تعدد الأطراف):
// onlyDigits القديمة (كانت بتقيّد حقلي الرقم القومي المفردين) اتشالت —
// فاليديشن الرقم القومي بقت بالكامل من casePartiesValidation.ts (نفس تغيير
// EditCaseModal.tsx مرحلة 5.1)، والحقل نفسه بقى جوه PartyFields.tsx.

// ⚡ شكل صف case_parties كما بيرجع من الداتابيز — نفس الشكل بالحرف المستخدم
// في EditCaseModal.tsx (مرحلة 5.1)؛ case_parties لسه مش موجودة في
// database.types.ts (اتضافت بـ SQL مباشر) فمفيش طريقة نولّد بيها الأنواع
// من هنا من غير نت.
interface CasePartyRow {
    id: string;
    side: PartySide;
    is_client: boolean;
    name: string;
    capacity: string;
    national_id: string | null;
    address: string | null;
    power_of_attorney: string | null;
    client_id: string | null;
    sort_order: number;
    // 🆕 (خطة توحيد "ربط طرف بموكل موجود" — مرحلة 2، 6 أغسطس 2026): نفس
    // إضافة CasePartyRow في EditCaseModal.tsx بالحرف.
    updated_at: string | null;
}

interface EditStandaloneModalProps {
    session: SessionWithLegacyFields;
    db: SupabaseClient<Database>;
    onClose: () => void;
    onSaved: () => void;
    // ⚡ NEW (خطة توحيد مصدر بيانات الموكل، مرحلة 3): نفس فكرة EditCaseModal.tsx
    // بالظبط — لو الجلسة مربوطة بموكل حي (session.client_id + الموكل موجود
    // فعليًا)، الاسم/الرقم القومي/بيانات التوكيل بتتقفل وتتيجي من ملف الموكل
    // مباشرة. **بدون** عنوان هنا لأن case_sessions مفيهاش عمود plaintiff_address
    // أصلاً (مؤكد من الخطة). لو الموكل محذوف/orphaned، linkedClient بتوصل
    // null والحقول تفضل حرة (fallback المرحلة السابعة).
    linkedClient?: ClientRow | null;
    // ⚡ CHANGED (قفل بيانات كل الأطراف المربوطة بموكل حقيقي، لا الطرف
    // الأساسي بس): نفس التغيير اللي حصل في EditCaseModal.tsx — بياخد
    // الموكل (ClientRow) بتاع الطرف اللي اتضغط عليه تحديدًا.
    onOpenClientProfile?: (client: ClientRow) => void;
    // ⚡ NEW: لازمة عشان نلاقي بيانات أي موكل مربوط بطرف *غير* الأساسي
    // (client_id بتاعه بيتحط وقت إنشاء الجلسة عن طريق الربط لكل طرف على حدة).
    clients?: ClientRow[];
    // ⚡ NEW (توحيد "المحكمة"/"نوع القضية" مع فورمي القضية — 12 أغسطس 2026):
    // نفس props بالظبط اللي EditCaseModal.tsx بياخدها — قايمة محاكم/تصنيفات
    // الدولة الحالية (اختيارية)، تُستخدم كـdatalist اقتراحات بس تحت.
    countryCourts?: string[];
    countryCaseTypes?: string[];
    // ⚡ REMOVED (خطة إلغاء ربط/إنشاء موكل من الجلسة المستقلة، المرحلة 6 — 9
    // أغسطس 2026): openNewClientModal كانت هنا لزرار "➕ إنشاء موكل جديد"
    // جنب دروب-داون ربط طرف غير مربوط في EditStandaloneModalForm — الدروب-
    // داون والزرار اتشالوا بالكامل في المرحلة 3، فبقت prop بلا استخدام
    // داخلي من وقتها. اتشالت السلسلة كلها لحد المصدر (DashboardTab.tsx/
    // SessionsCalendar.tsx) — openNewClientModal نفسها في App.tsx لسه حية
    // (بتتستخدم في أماكن تانية زي NewCaseModal/EditCaseModal).
}

interface StandaloneEditForm {
    court: string;
    title: string;
    case_number: string;
    case_year: string;
    case_type: string;
    circuit_number: string;
    // ⚡ FIX (فورم تعديل الجلسة المستقلة كان ناقص عن فورم الإنشاء — 11
    // أغسطس 2026): court_level/session_hall/secretary_hall/secretary_name/
    // secretary_mobile كانوا موجودين في Form (NewStandaloneSessionModal.tsx)
    // وبيتسجلوا وقت الإنشاء، لكن غايبين هنا بالكامل — يعني بعد أول حفظ،
    // محدش يقدر يعدّلهم تاني أبدًا. description/result اتعمّدنا ما نضيفهمش
    // هنا لأنهم أصلًا معندهمش أي UI في فورم الإنشاء نفسه (result بيتسجل من
    // مسار منفصل تمامًا: SessionUpdateModal.tsx "ما تم في الجلسة").
    court_level: string;
    session_date: string;
    session_time: string;
    session_hall: string;
    secretary_hall: string;
    secretary_name: string;
    secretary_mobile: string;
    next_action: string;
}

// ══════════════════════════════════════════════════════════════
//  EditStandaloneModal (outer shell) — مرحلة 6.4 من خطة تعدد الأطراف: نفس
//  فكرة EditCaseModal.tsx (مرحلة 5.1) بالحرف — قبل ما الفورم الحقيقي
//  (EditStandaloneModalForm تحت) يتبني، لازم نجيب أطراف الجلسة الموجودة
//  فعلاً من case_parties (بـ session_id مش case_id هنا)، عشان
//  usePartyFields() يتهيّأ بالقيم الصح من أول رندر. جلسة قديمة معهاش أي
//  صف في case_parties بترجع array فاضية، والفورم الداخلي بيعمل fallback
//  لبيانات الأعمدة القديمة (plaintiff/defendant) زي ما كان يحصل بالظبط
//  قبل التعديل ده.
// ══════════════════════════════════════════════════════════════
function EditStandaloneModal(props: EditStandaloneModalProps) {
    const { session, db } = props;
    const [partiesState, setPartiesState] = useState<{ loaded: boolean; rows: CasePartyRow[] }>({ loaded: false, rows: [] });

    useEffect(() => {
        let cancelled = false;
        setPartiesState({ loaded: false, rows: [] });
        (async () => {
            // ⚠️ case_parties بقت مضافة في database.types.ts (خطة تعدد
            // الأطراف، مرحلة 1) — مفيش داعي لكاست 'as cases' تاني هنا.
            const { data, error } = await db.from('case_parties')
                .select('*')
                .eq('session_id', session.id)
                .order('sort_order', { ascending: true });
            if (cancelled) return;
            // لو الاستعلام فشل: fallback لسلوك طرف واحد من الأعمدة القديمة
            // بدل ما نمنع فتح فورم التعديل بالكامل (نفس قرار EditCaseModal.tsx).
            setPartiesState({ loaded: true, rows: error ? [] : ((data as unknown as CasePartyRow[]) || []) });
        })();
        return () => { cancelled = true; };
    }, [session.id, db]);

    if (!partiesState.loaded) {
        return createPortal(
            React.createElement('div', {
                className: 'fixed inset-0 z-[60] flex items-center justify-center',
                style: { background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }
            },
                React.createElement(I.Spin)
            ),
            document.body
        );
    }

    return React.createElement(EditStandaloneModalForm, { ...props, existingPartyRows: partiesState.rows });
}

interface EditStandaloneModalFormProps extends EditStandaloneModalProps {
    existingPartyRows: CasePartyRow[];
}

function EditStandaloneModalForm({ session, db, onClose, onSaved, linkedClient = null, onOpenClientProfile, existingPartyRows, clients = [], countryCourts, countryCaseTypes }: EditStandaloneModalFormProps) {
    // 🆕 (F3): isDesktop بس مستخدم هنا — راجع تعليق الاستيراد فوق.
    const modalPresentation = useModalPresentation();
    // ⚡ NEW: الجلسة مربوطة فعليًا بموكل حي لو linkedClient موصول (مش null).
    const isLinked = !!linkedClient;
    // ⚡ NEW (خطة توحيد مصدر بيانات الموكل، مرحلة 7 — fallback الموكل
    // المحذوف): الجلسة عندها client_id فعلي، لكن الأب مش لاقي صف الموكل
    // (اتمسح/soft-deleted). الحقول بترجع حرة تلقائيًا (isLinked=false)
    // من غير أي تغيير هنا — الإضافة الوحيدة تنبيه واضح للمستخدم.
    // ⚡ CHANGED (خطة توحيد قفل الطرف، المرحلة 2): isOrphanedLink() الموحّدة
    // بدل الشرط المكتوب يدويًا — نفس النتيجة، مصدر واحد.
    const isOrphaned = isOrphanedLink(session.client_id, linkedClient);
    const [form, setForm] = useState<StandaloneEditForm>({
        court: session.court || '',
        title: session.title || '',
        case_number: session.case_number?.split('/')?.[0] || '',
        case_year: session.case_number?.split('/')?.[1] || '',
        // ⚡ CHANGED (توحيد "نوع القضية" مع فورمي القضية — 12 أغسطس 2026):
        // نص حر مباشر زي form.type في EditCaseModal.tsx، مفيش داعي بعد كده
        // لتفرقة "أخرى" عن قيمة من القايمة (CASE_TYPES بقت اقتراحات
        // datalist بس تحت).
        case_type: session.case_type || '',
        circuit_number: session.circuit_number || '',
        court_level: session.court_level || '',
        session_date: session.session_date || '',
        session_time: session.session_time || 'صباحي',
        session_hall: session.session_hall || '',
        secretary_hall: session.secretary_hall || '',
        secretary_name: session.secretary_name || '',
        secretary_mobile: session.secretary_mobile || '',
        next_action: session.next_action || '',
    });
    const [saving, setSaving] = useState(false);
    // 🔢 FIX (تطبيع الأرقام العربية عند التعديل — 12 أغسطس 2026): نفس فيكس
    // NewStandaloneSessionModal.tsx — set() هنا مستخدمة لمعظم حقول فورم
    // تعديل الجلسة المستقلة (رقم القضية/السنة/الدائرة...)، فبنحوّل أي رقم
    // عربي (٠-٩) لإنجليزي تلقائيًا وقت الكتابة.
    const set = (k: keyof StandaloneEditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: normalizeArabicDigits(e.target.value) }));

    // ⚡ NEW (مرحلة 6.4 — خطة تعدد الأطراف): array أطراف الجلسة (مدعين
    // ومدعى عليهم، بلا حدود) بدل حقلي "الموكل"/"الخصم" المفردين القدامى —
    // نفس منطق EditCaseModal.tsx (مرحلة 5.1)، بس هنا القيم الابتدائية بتيجي
    // من case_parties (session_id) لو الجلسة دي دخل عليها بيانات فعلاً من
    // الفورم الجديد، وإلا fallback لنفس منطق الأعمدة القديمة (plaintiff/
    // defendant) — حساب لمرة واحدة بس وقت الـ mount.
    const [initialParties] = useState<{ plaintiffs: PartyFieldValue[]; defendants: PartyFieldValue[] }>(() => {
        if (existingPartyRows.length > 0) {
            const toField = (row: CasePartyRow): PartyFieldValue => ({
                id: row.id,
                side: row.side,
                is_client: row.is_client,
                name: row.name || '',
                capacity: row.capacity || '',
                national_id: row.national_id || '',
                address: row.address || '',
                power_of_attorney: row.power_of_attorney || '',
                client_id: row.client_id || null,
                // 🆕 (خطة توحيد "ربط طرف بموكل موجود" — مرحلة 2): نفس
                // EditCaseModal.tsx بالحرف — تستخدمها syncSessionParties تحت
                // كـknownUpdatedAt.
                updated_at: row.updated_at || null,
            });
            return {
                plaintiffs: existingPartyRows.filter((r) => r.side === 'plaintiff').map(toField),
                defendants: existingPartyRows.filter((r) => r.side === 'defendant').map(toField),
            };
        }
        // fallback لجلسة قديمة معهاش أي صف في case_parties لسه — طرف واحد
        // في كل جهة، بنفس القيم اللي كانت بتتعرض في الحقول المفردة القديمة
        // (بما فيها قفل بيانات الموكل المربوط لو isLinked). العنوان فاضي
        // دايمًا هنا — case_sessions مفيهاش عمود plaintiff_address أصلاً.
        // ⚠️ الـ id هنا نص ثابت ('legacy-plaintiff'/'legacy-defendant') مش
        // UUID حقيقي من case_parties — علامة واضحة لمنطق الحفظ تحت إن الصف
        // ده لسه ملوش نظير في الداتابيز (يحتاج INSERT مش UPDATE).
        return {
            plaintiffs: [{
                id: 'legacy-plaintiff',
                side: 'plaintiff' as PartySide,
                is_client: true,
                name: isLinked ? (linkedClient!.full_name || '') : (session.plaintiff || ''),
                capacity: session.plaintiff_role || '',
                national_id: isLinked ? (linkedClient!.national_id || '') : (session.plaintiff_national_id || ''),
                address: '',
                power_of_attorney: isLinked ? (linkedClient!.cr_number || '') : (session.plaintiff_power_of_attorney || ''),
                client_id: session.client_id || null,
            }],
            defendants: [{
                id: 'legacy-defendant',
                side: 'defendant' as PartySide,
                is_client: false,
                name: session.defendant || '',
                capacity: session.defendant_role || '',
                national_id: session.defendant_national_id || '',
                address: '',
                power_of_attorney: '',
                client_id: null,
            }],
        };
    });
    // ⚡ NEW (خطة توحيد قفل الطرف، المرحلة 2): سياق الربط الموحّد — نفس
    // فكرة EditCaseModal.tsx بالحرف (شوف تعليقها هناك للتفاصيل).
    const domainContext = useMemo<PartyDomainContext>(() => {
        const byId = new Map(clients.map((c) => [c.id, c]));
        if (linkedClient) byId.set(linkedClient.id, linkedClient);
        return { primaryClientId: session.client_id || null, clients: Array.from(byId.values()) };
    }, [clients, linkedClient, session.client_id]);

    const partyFields = usePartyFields({
        initialPlaintiffs: initialParties.plaintiffs,
        initialDefendants: initialParties.defendants,
        // 🆕 (خطة "المسمى القانوني" — مرحلة 3): تحميل القيمة الحالية من
        // session (لو موجودة) — نفس نمط EditCaseModal.tsx.
        initialLegalTitles: {
            plaintiff: session.plaintiff_legal_title || '',
            defendant: session.defendant_legal_title || '',
        },
        // 🆕 (المرحلة 2): نفس فكرة EditCaseModal.tsx — يغذّي فاليديشن
        // الاسم بالأطراف الـorphan فعليًا (إصلاح باگ 5.5).
        domainContext,
    });

    // الطرف اللي لازم يتقفل (readOnly) — الطرف المربوط فعليًا بموكل حي من
    // clients، بمطابقة client_id (بيتحسب مرة واحدة وقت الـ mount زي
    // initialParties فوق) — نفس فكرة EditCaseModal.tsx مرحلة 5.1.
    const [linkedPartyId] = useState<string | null>(() => {
        if (!isLinked) return null;
        const all = [...initialParties.plaintiffs, ...initialParties.defendants];
        return all.find((p) => p.client_id === session.client_id)?.id ?? null;
    });
    // ⚡ CHANGED (المرحلة 2): بدل !!party.client_id مباشرة — طرف orphan
    // (أساسي أو ثانوي) بيرجع false (قابل للتعديل الحر) دلوقتي.
    const renderPartyReadOnly = (party: PartyFieldValue) => isLinkedState(getPartyState(party, domainContext));
    // ⚡ CHANGED (المرحلة 2 — إصلاح باگ 5.1، dead-end حقيقي): قبل كده
    // الدالة دي كانت بترجع null بالكامل (مفيش أي محتوى إضافي خالص) لو
    // linkedPartyClient مش موجود — يعني طرف ثانوي اتربط بموكل وبعدين
    // الموكل اتمسح كان بيفضل مقفول (renderPartyReadOnly فوق) بلا أي مخرج:
    // بلا تنبيه، بلا زرار unlink (الملف ده أصلًا معهوش دروب-داون "ربط
    // بموكل من النظام" زي EditCaseModal.tsx — الإصلاح هنا هو أول زرار فك
    // ربط بيتضاف للملف ده أصلًا، مش بس تعديل موجود).
    // ⚡ NEW (خطة توحيد قفل الطرف — المرحلة 3، "preview قبل فك الربط"، 6
    // أغسطس 2026): نفس نمط EditCaseModal.tsx بالحرف — طرف LINKED فعليًا
    // (موكل حي) بيمر بخطوة تأكيد صغيرة قبل ما زرار "🔓 فك الربط" ينفذ.
    // طرف ORPHAN_PARTY (مالوش موكل حي أصلًا) بيتفك على طول زي ما كان،
    // مفيش حاجة تستاهل preview لموكل اتمسح بالفعل.
    const [unlinkConfirmPartyId, setUnlinkConfirmPartyId] = useState<string | null>(null);

    // ⚡ REMOVED (خطة إلغاء ربط/إنشاء موكل من الجلسة المستقلة، Phase 3 — 9
    // أغسطس 2026): linkClientToParty/requestLinkClientToParty/
    // applyCreatedClientToParty (دروب-داون "ربط بموكل من النظام" + زرار
    // "➕ إنشاء موكل جديد" لطرف غير مربوط) اتشالوا بالكامل. طرف غير مربوط
    // في الجلسة المستقلة دلوقتي بيفضل حر بلا أي طريق ربط/إنشاء موكل —
    // ده بيحصل بس بعد التحويل لقضية.

    // ⚡ CHANGED (توحيد تجربة الطرف الأساسي/الثانوي — 12 أغسطس 2026): نفس
    // التعديل اللي حصل في EditCaseModal.tsx بالحرف — الطرف الأساسي
    // (party.id === linkedPartyId) كان بيرجع null بالكامل هنا (مفيش زرار
    // "عدّل من ملف الموكل" ليه)، بعكس أي طرف ثانوي مربوط. دلوقتي عنده فرع
    // مختصر بيوريله بس الزرار، من غير زرار فك الربط (فك ربط الجلسة
    // بموكلها الأساسي بيتم من مكان تاني، مش من هنا).
    const renderPartyExtra = (party: PartyFieldValue) => {
        if (party.id === linkedPartyId) {
            if (!party.is_client || !onOpenClientProfile || !linkedClient) return null;
            return React.createElement('div', { className: 'flex items-center justify-between' },
                React.createElement('p', { className: 'text-[9px] text-slate-500' }, '🟢 موكل المكتب — بيانات هذا الطرف بتتقرا من ملف الموكل'),
                React.createElement('button', {
                    type: 'button',
                    onClick: () => onOpenClientProfile(linkedClient),
                    className: 'text-[9px] font-black text-premium-gold shrink-0',
                    'data-testid': `edit-standalone-session-open-client-profile-${party.id}`,
                }, '✏️ عدّل من ملف الموكل')
            );
        }
        if (!party.is_client) return null;
        const state = getPartyState(party, domainContext);
        const linkedPartyClient = clients.find((c) => c.id === party.client_id) || null;
        const confirmingUnlink = unlinkConfirmPartyId === party.id;
        if (!party.client_id) {
            // ⚡ REMOVED (Phase 3، 9 أغسطس 2026): طرف غير مربوط أصلًا —
            // مفيش دروب-داون ربط ولا زرار إنشاء موكل هنا تاني (كانا هنا
            // قبل كده). الطرف بيفضل بيانات حرة قابلة للتعديل، والربط/
            // الإنشاء بيبقى متاح بس بعد تحويل الجلسة لقضية.
            return null;
        }
        return React.createElement('div', { className: 'space-y-2' },
            isOrphanState(state) && React.createElement('div', { className: 'bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2', 'data-testid': `edit-standalone-session-party-orphaned-warning-${party.id}` },
                React.createElement('p', { className: 'text-[9px] text-amber-400 font-bold leading-relaxed' }, `⚠️ ${getPartyStateMessage(state)}`)
            ),
            isLinkedState(state) && onOpenClientProfile && linkedPartyClient && React.createElement('div', { className: 'flex items-center justify-between' },
                React.createElement('p', { className: 'text-[9px] text-slate-500' }, '🔗 مربوط بموكل من النظام — بيانات الطرف ده بتتقرا من ملف الموكل'),
                React.createElement('button', {
                    type: 'button',
                    onClick: () => onOpenClientProfile(linkedPartyClient),
                    className: 'text-[9px] font-black text-premium-gold shrink-0',
                    'data-testid': `edit-standalone-session-open-client-profile-${party.id}`,
                }, '✏️ عدّل من ملف الموكل')
            ),
            // 🆕 زرار فك الربط — كان مفقود بالكامل قبل كده، وده أصل الـ
            // dead-end. متاح لأي طرف عنده client_id (حي أو orphan) — بيصفّر
            // client_id بس محليًا في الفورم (نفس منطق linkClientToParty في
            // EditCaseModal.tsx وقت اختيار "— بدون ربط —")، فيرجع الطرف
            // بيانات حرة قابلة للتعديل فورًا.
            // ⚡ CHANGED (المرحلة 3): طرف LINKED فعليًا بيفتح تأكيد أول
            // بدل ما ينفذ فورًا؛ طرف ORPHAN_PARTY (مفيش موكل حي يتفك عنه
            // فعليًا) لسه بينفذ على طول.
            canUnlinkParty(state) && !confirmingUnlink && React.createElement('button', {
                type: 'button',
                onClick: () => {
                    if (isLinkedState(state) && linkedPartyClient) { setUnlinkConfirmPartyId(party.id); return; }
                    partyFields.updateParty(party.id, 'client_id', null);
                },
                className: 'text-[10px] font-bold text-rose-400 mt-1',
                'data-testid': `edit-standalone-session-unlink-party-${party.id}`,
            }, '🔓 فك الربط عن هذا الطرف'),
            confirmingUnlink && React.createElement('div', { className: 'bg-rose-500/10 border border-rose-500/20 rounded-xl p-2.5 space-y-2', 'data-testid': `edit-standalone-session-unlink-preview-${party.id}` },
                React.createElement('p', { className: 'text-[9px] text-rose-300 font-bold leading-relaxed' },
                    `⚠️ هيتم فك ربط "${party.name || 'هذا الطرف'}" عن الموكل "${linkedPartyClient?.full_name}". بيانات الطرف (الاسم/الرقم القومي/العنوان/التوكيل) هتفضل زي ما هي دلوقتي كنسخة يدوية قابلة للتعديل الحر، ومش هتتحدّث تلقائيًا من ملف الموكل تاني.`
                ),
                React.createElement('div', { className: 'flex gap-2' },
                    React.createElement('button', {
                        type: 'button',
                        onClick: () => { partyFields.updateParty(party.id, 'client_id', null); setUnlinkConfirmPartyId(null); },
                        className: 'flex-1 py-2 rounded-lg bg-rose-500 text-white text-[10px] font-black',
                        'data-testid': `edit-standalone-session-unlink-confirm-${party.id}`,
                    }, 'فك الربط'),
                    React.createElement('button', {
                        type: 'button',
                        onClick: () => setUnlinkConfirmPartyId(null),
                        className: 'flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-[10px] font-black',
                        'data-testid': `edit-standalone-session-unlink-cancel-${party.id}`,
                    }, 'إلغاء')
                )
            ),
        );
    };

    // ══════════════ حفظ مسودة تلقائي (خطة 1 أغسطس 2026 — آخر فورم) ══════════════
    // نفس منطق EditCaseModal.tsx بالحرف، بمفتاح متضمّن session.id عشان
    // مسودة جلسة متختلطش بمسودة جلسة تانية. EditStandaloneModalForm بيتبني
    // بس بعد ما existingPartyRows اتجابت فعلاً من الأب (EditStandaloneModal
    // فوق)، فالفورم هنا دايمًا بيبدأ ببيانات الجلسة الحقيقية من أول رندر —
    // مفيش داعي لـenabled=false.
    interface EditStandaloneDraftData {
        form: StandaloneEditForm;
        parties: PartyFieldValue[];
        legalTitles: { plaintiff: string; defendant: string };
    }
    const draftData: EditStandaloneDraftData = { form, parties: partyFields.parties, legalTitles: partyFields.legalTitles };
    const draft = useFormDraft<EditStandaloneDraftData>({ key: `edit-standalone-session:${session.id}`, data: draftData });

    useEffect(() => {
        if (!draft.restoredDraft) return;
        setForm(draft.restoredDraft.form);
        partyFields.replaceParties(draft.restoredDraft.parties);
        partyFields.replaceLegalTitles(draft.restoredDraft.legalTitles);
        toast('📝 تم استرجاع بيانات كنت بتكتبها قبل كده');
        draft.dismissRestoredDraft();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft.restoredDraft]);

    // تحذير قبل الإغلاق لو فيه بيانات مكتوبة لسه ما اتحفظتش (الـbaseline
    // هنا هو بيانات الجلسة المحمّلة فعليًا، مش فورم فاضي)
    const { guardedClose, confirmModal } = useUnsavedChangesGuard(draftData, { form, parties: partyFields.parties, legalTitles: partyFields.legalTitles }, onClose, draft.clearDraft);

    // ⚡ NEW (مرحلة 6.4): مزامنة الحفظ الفعلي في case_parties — نفس فلسفة
    // syncCaseParties في useCaseActions.ts (مرحلة 5.2) بالحرف، بس بـ
    // session_id بدل case_id. existingIds بتيجي من existingPartyRows اللي
    // اتجابت وقت فتح الفورم (مفيش استعلام جديد وقت الحفظ)، فبتشتغل حتى
    // أوفلاين (window.__dbWrite بيتعامل مع الأوفلاين لوحده لكل نداء). صف
    // موجود في existingIds = UPDATE، صف مش موجود فيها (id مؤقت legacy-*/
    // party-*) = INSERT، صف كان موجود واختفى من الفورم دلوقتي = DELETE.
    // ⚡ CHANGED (خطة توحيد "ربط طرف بموكل موجود" — مرحلة 4، 6 أغسطس
    // 2026): نفس تعديل syncCaseParties في useCaseActions.ts بالحرف —
    // 'conflict' بقت reason مستقلة بتحمل أسماء الأطراف المتعارضة.
    type SyncPartiesResult = { ok: true } | { ok: false; reason: 'validation'; message: string } | { ok: false; reason: 'write' } | { ok: false; reason: 'conflict'; conflictNames: string[] };
    const syncSessionParties = async (targetSessionId: string): Promise<SyncPartiesResult> => {
        const parties = partyFields.parties;
        // 🆕 (خطة "المسمى القانوني" — مرحلة 3): نفس منطق useCaseActions.ts/
        // NewStandaloneSessionModal.tsx — خط دفاع تاني لقاعدة 6.
        const serverCheck = validateParties(parties, {
            plaintiff: partyFields.legalTitles.plaintiff || '',
            defendant: partyFields.legalTitles.defendant || '',
        });
        if (!serverCheck.valid) {
            return { ok: false, reason: 'validation', message: serverCheck.message || '⚠️ بيانات أطراف الدعوى غير مكتملة أو غير صحيحة' };
        }
        const existingIds = existingPartyRows.map((r) => r.id);
        const currentIds = new Set(parties.map((p) => p.id));
        let allOk = true;
        const conflictNames: string[] = [];
        // 1) حذف أي صف كان موجود فعلاً وقت فتح الفورم واتشال منها دلوقتي
        for (const oldId of existingIds) {
            if (!currentIds.has(oldId)) {
                const delResult = await window.__dbWrite({ type: 'DELETE', table: 'case_parties', id: oldId });
                if (delResult.error) allOk = false;
            }
        }
        // 2) upsert لكل طرف موجود في الفورم دلوقتي
        for (let i = 0; i < parties.length; i++) {
            const p = parties[i];
            const rowData: Record<string, unknown> = {
                case_id: null,
                session_id: targetSessionId,
                side: p.side,
                is_client: p.is_client,
                name: p.name,
                capacity: p.capacity,
                national_id: p.national_id || null,
                address: p.address || null,
                power_of_attorney: p.power_of_attorney || null,
                client_id: p.client_id || null,
                sort_order: i,
            };
            const result = existingIds.includes(p.id)
                ? await window.__dbWrite({ type: 'UPDATE', table: 'case_parties', data: rowData, id: p.id, knownUpdatedAt: p.updated_at || null })
                : await window.__dbWrite({ type: 'INSERT', table: 'case_parties', data: rowData });
            if (result.conflict) {
                conflictNames.push(p.name?.trim() || `طرف رقم ${i + 1}`);
                allOk = false;
            } else if (result.error) {
                allOk = false;
            }
        }
        if (allOk) return { ok: true };
        if (conflictNames.length > 0) return { ok: false, reason: 'conflict', conflictNames };
        return { ok: false, reason: 'write' };
    };

    const handleSave = async () => {
        if (!form.session_date) { toast('⚠️ تاريخ الجلسة مطلوب', true); return; }
        if (!form.title?.trim()) {
            toast('⚠️ يجب ملء الحقول الإجبارية المحددة بعلامة (*)', true);
            return;
        }
        // ⚡ NEW (طلب مباشر — 12 أغسطس 2026): نفس فحوصات بيانات القضية
        // الإجبارية في NewStandaloneSessionModal.tsx بالحرف — راجع التعليق هناك.
        if (!form.court.trim()) { toast('⚠️ حقل "المحكمة" مطلوب', true); return; }
        if (!form.case_number.trim()) { toast('⚠️ حقل "رقم القضية" مطلوب', true); return; }
        if (!form.case_year.trim()) { toast('⚠️ حقل "السنة" مطلوب', true); return; }
        if (!form.case_type.trim()) { toast('⚠️ حقل "نوع القضية" مطلوب', true); return; }
        if (!form.circuit_number.trim()) { toast('⚠️ حقل "الدائرة" مطلوب', true); return; }
        if (!form.court_level.trim()) { toast('⚠️ حقل "درجة التقاضي" مطلوب', true); return; }
        // ⚡ CHANGED (مرحلة 6.4 — خطة تعدد الأطراف): فاليديشن أطراف الجلسة
        // كلها بقت من casePartiesValidation.ts (نفس قواعد NewCaseModal.tsx
        // مرحلة 4.1 وEditCaseModal.tsx مرحلة 5.1) بدل الفحوصات المفردة
        // القديمة (الاسم الثلاثي للخصم، طول الرقم القومي يدويًا).
        if (!partyFields.validation.valid) {
            toast(partyFields.validation.message || 'يرجى مراجعة بيانات أطراف الدعوى', true);
            return;
        }
        setSaving(true);
        // ⚡ CHANGED (توحيد "نوع القضية" مع فورمي القضية — 12 أغسطس 2026):
        // نص حر مباشر، نفس تغيير NewStandaloneSessionModal.tsx بالحرف.
        const finalCaseType = form.case_type.trim();
        const fullCaseNumber = [form.case_number, form.case_year].filter(Boolean).join('/');
        // ⚡ CHANGED (خطة تفكيك legacy columns — Phase F.2، 6 أغسطس 2026):
        // primaryPlaintiff/primaryDefendant كانوا بيتحسبوا هنا عشان يتبعتوا
        // كنسخة احتياطية على الأعمدة القديمة (تحت + في مزامنة السلاسل) —
        // اتشالت الكتابتين الاتنين. partyFields.legalTitles لسه لازمة
        // كمدخل فاليديشن بس في syncSessionParties تحت.
        const { error, offline, queued, conflict } = await window.__dbWrite({
            type: 'UPDATE', table: 'case_sessions', id: session.id,
            data: {
                court: form.court || null,
                title: form.title || null,
                case_number: fullCaseNumber || null,
                case_type: finalCaseType || null,
                circuit_number: form.circuit_number || null,
                court_level: form.court_level.trim() || null,
                session_date: form.session_date,
                session_time: form.session_time || null,
                session_hall: form.session_hall || null,
                secretary_hall: form.secretary_hall || null,
                secretary_name: form.secretary_name || null,
                secretary_mobile: form.secretary_mobile || null,
                next_action: form.next_action || null,
                // 🔧 FIX (13 أغسطس 2026): نفس الغلطة اللي اتصلحت في
                // NewStandaloneSessionModal.tsx — plaintiff_legal_title/
                // defendant_legal_title اتشالوا غلط أثناء Phase F.2 رغم إنهم
                // مش من الأعمدة القديمة، دول عمود الميزة الحالية نفسها.
                plaintiff_legal_title: partyFields.legalTitles.plaintiff || null,
                defendant_legal_title: partyFields.legalTitles.defendant || null,
            },
            knownUpdatedAt: session.updated_at || null,
        });
        // 🔒 FIX (تقرير الموثوقية — القسم 12، Concurrent Editing): توست بدل السكوت التام.
        if (conflict) { setSaving(false); toast('⚠️ هذه الجلسة عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة', true); return; }
        // ⚠️ `error` هنا بيبقى null في حالة النجاح أونلاين *وكمان* في حالة
        // التقييد الناجح في طابور الأوفلاين (offline && queued) — __dbWrite
        // بيرجّع error حقيقي بس لو فشل الاتصال أونلاين، أو لو فشل الحفظ محليًا
        // في IndexedDB نفسها وقت الأوفلاين. يعني الفحص ده وحده كافي للحالتين.
        if (error) {
            setSaving(false);
            showErrorToast('session_save', error, 'تعذّر حفظ الجلسة. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'حفظ الجلسة');
            return;
        }
        // 🆕 FIX (٤ سبتمبر ٢٠٢٦): تسجيل نجاح الحفظ عشان أي بانر خطأ سابق
        // لـ"حفظ الجلسة" يختفي فورًا من الرئيسية — بدل ما يفضل معلّق لحد ما
        // المستخدم يقفله يدوي رغم إن المشكلة اتحلت بالفعل.
        recordSuccess('session_save');
        // 🆕 (خطة حفظ المسودات — 1 أغسطس 2026): نفس قرار NewStandaloneSessionModal.tsx
        // — بيانات الجلسة اتحفظت فعليًا في الداتابيز (أو اتقيّدت في طابور
        // الأوفلاين بأمان لو النت مقطوع) بحلول هنا (مش مجرد الضغط على "حفظ")،
        // فالمسودة بتتمسح دلوقتي بالظبط في الحالتين.
        draft.clearDraft();
        // 🔒 FIX (تناسق "هوية" السلسلة — 5 أغسطس 2026): لو الجلسة دي عضو في
        // سلسلة session_group_id، نفس حقول "هوية القضية" (محكمة/عنوان/رقم
        // قضية/نوع/دائرة/بيانات المدعي والمدعى عليه) اللي اتصححت هنا لازم
        // تتزامن مع باقي جلسات السلسلة التاريخية — عمدًا من غير
        // session_date/session_time/next_action (دول خاصين بكل جلسة على
        // حدة). syncSessionIdentityToGroupSiblings بترجع {siblingCount:0}
        // لو مفيش session_group_id أصلاً (صفر تغيير سلوك للجلسة العادية).
        const identitySyncResult = await syncSessionIdentityToGroupSiblings(db, session, {
            court: form.court || null,
            title: form.title || null,
            case_number: fullCaseNumber || null,
            case_type: finalCaseType || null,
            circuit_number: form.circuit_number || null,
            // ⚡ CHANGED (Phase F.2، 6 أغسطس 2026): كانت هنا مزامنة نفس
            // الأعمدة القديمة (plaintiff/defendant/...) لكل جلسات السلسلة
            // التاريخية — اتشالت (نفس تعديل نداء __dbWrite فوق بالحرف).
            // أطراف كل جلسة في السلسلة بقت مستقلة في case_parties الخاصة
            // بيها، مش محتاجة "هوية" مشتركة للأطراف عبر السلسلة أصلًا.
        });
        // ⚡ NEW (مرحلة 6.4): مزامنة أطراف الدعوى الفعلية في case_parties —
        // بعد نجاح تحديث بيانات الجلسة نفسها، بالـ session_id الحقيقي
        // مباشرة (مفيش داعي لسنتينل، الجلسة أصلاً موجودة قبل التعديل).
        const partiesResult = await syncSessionParties(session.id);
        setSaving(false);
        if (!identitySyncResult.ok) {
            toast('⚠️ تم تعديل الجلسة، لكن حصل خطأ في مزامنة بيانات بعض جلسات السلسلة التاريخية — راجعها يدويًا', true);
        }
        if (!partiesResult.ok) {
            // 🔒 نفس مبدأ 4.3/5.2: توست واحد بس، برسالة الفاليديشن المحددة
            // لو ده السبب، رسالة تعارض تسمي الأطراف بالظبط (مرحلة 4)، أو
            // رسالة عامة لو فشل الكتابة — من غير ما يمنع نجاح حفظ الجلسة نفسها.
            toast(
                partiesResult.reason === 'validation'
                    ? partiesResult.message
                    : partiesResult.reason === 'conflict'
                    ? `⚠️ تم تعديل الجلسة، لكن الأطراف التالية عدّلها شخص آخر بعد ما فتحت الفورم: ${partiesResult.conflictNames.join('، ')} — راجعها بعد إعادة الفتح`
                    : '⚠️ تم تعديل الجلسة، لكن حصل خطأ في مزامنة بعض أطراف الدعوى — راجعها بعد إعادة الفتح',
                true
            );
        }
        // 🆕 (توحيد الأوفلاين): توست مختلف لو التعديل الأساسي اتقيّد في
        // الطابور بدل ما يوصل السيرفر فورًا — نفس صياغة handleUpdateSession
        // في useCaseSessions.ts.
        toast(offline && queued ? '📥 تعديل الجلسة محفوظ محلياً — سيُزامن عند عودة الإنترنت' : '✅ تم تعديل الجلسة');
        onSaved();
        onClose();
    };

    const modalTree = createPortal(
        React.createElement('div', {
            className: `fixed inset-0 z-[60] flex ${modalPresentation.overlayAlignClassName} justify-center`,
            style: { background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' },
            onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) guardedClose(); }
        },
            React.createElement('div', {
                className: `w-full max-w-lg lg:max-w-2xl ${modalPresentation.isDesktop ? 'rounded-3xl' : 'rounded-t-3xl'} overflow-hidden bg-premium-card border border-white/8`,
                style: { maxHeight: '92vh' },
                'data-testid': 'edit-standalone-session-modal'
            },
                React.createElement('div', { className: 'flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/5' },
                    React.createElement('div', { className: 'flex items-center gap-2' },
                        React.createElement('span', { className: 'text-xl' }, '✏️'),
                        React.createElement('h2', { className: 'text-sm font-black text-white' }, 'تعديل الجلسة المستقلة')
                    ),
                    React.createElement('button', { onClick: guardedClose, className: 'w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-slate-400', 'data-testid': 'edit-standalone-session-close' }, React.createElement(I.X))
                ),
                React.createElement('div', {
                    className: 'overflow-y-auto px-5 py-4 space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start lg:grid-flow-row-dense',
                    style: { maxHeight: 'calc(92vh - 130px)' }
                },
                    // المحكمة — نص حر، مع datalist للاقتراح من قايمة محاكم
                    // الدولة لو موجودة — نفس فيكس فورم الإنشاء (12 أغسطس 2026).
                    React.createElement('div', null,
                        React.createElement(Inp, {
                            label: 'المحكمة', required: true, value: form.court, onChange: set('court'),
                            placeholder: 'مثال: محكمة جنوب القاهرة',
                            list: (countryCourts && countryCourts.length > 0) ? 'edit-standalone-session-courts-list' : undefined,
                            'data-testid': 'edit-standalone-session-court',
                        }),
                        countryCourts && countryCourts.length > 0 && React.createElement('datalist', { id: 'edit-standalone-session-courts-list' },
                            countryCourts.map((c: string) => React.createElement('option', { key: c, value: c }))
                        )
                    ),
                    React.createElement('div', {className:'lg:col-span-2'}, React.createElement(Inp, { label: 'موضوع الجلسة / عنوان', required: true, value: form.title, onChange: set('title'), placeholder: 'مثال: قضية إيجار', 'data-testid': 'edit-standalone-session-title' })),
                    React.createElement('div', { className: 'grid grid-cols-2 gap-3 lg:col-span-2' },
                        React.createElement(Inp, { label: 'رقم القضية', required: true, value: form.case_number, onChange: set('case_number'), placeholder: '1234', 'data-testid': 'edit-standalone-session-case-number' }),
                        // 🐛 FIX (12 أغسطس 2026): كان ناقص maxLength=4 هنا بعكس
                        // فورم الإنشاء وفورمي القضية الاتنين — المستخدم كان يقدر
                        // يكتب سنة أطول من 4 أرقام وهو بيعدّل جلسة موجودة.
                        React.createElement(Inp, { label: 'السنة', required: true, value: form.case_year, onChange: set('case_year'), placeholder: '2024', maxLength: 4, 'data-testid': 'edit-standalone-session-case-year' })
                    ),
                    // نوع القضية — نص حر مع datalist اقتراحات (من قايمة
                    // تصنيفات الدولة لو موجودة، وإلا CASE_TYPES الافتراضية)
                    // بدل Select مقفول — نفس فيكس فورم الإنشاء بالحرف.
                    React.createElement('div', { className: 'grid grid-cols-2 gap-3 lg:col-span-2' },
                        React.createElement(Field, { label: 'نوع القضية', required: true },
                            React.createElement('input', {
                                value: form.case_type,
                                onChange: set('case_type'),
                                placeholder: 'مدني / تجاري...',
                                className: inputCls,
                                style: inputStyle,
                                list: 'edit-standalone-session-case-types-list',
                                'data-testid': 'edit-standalone-session-case-type',
                            }),
                            React.createElement('datalist', { id: 'edit-standalone-session-case-types-list' },
                                (countryCaseTypes && countryCaseTypes.length > 0 ? countryCaseTypes : CASE_TYPES).map((t: string) => React.createElement('option', { key: t, value: t }))
                            )
                        ),
                        React.createElement(Inp, { label: 'الدائرة', required: true, value: form.circuit_number, onChange: set('circuit_number'), placeholder: 'الدائرة 7', 'data-testid': 'edit-standalone-session-circuit' })
                    ),
                    // ⚡ FIX (فورم التعديل الناقص — 11 أغسطس 2026): درجة
                    // التقاضي كانت موجودة في فورم الإنشاء بس غايبة هنا.
                    React.createElement(Field, { label: 'درجة التقاضي', required: true },
                        React.createElement('input', {
                            value: form.court_level,
                            onChange: set('court_level'),
                            placeholder: 'اكتب درجة التقاضي',
                            className: inputCls,
                            style: inputStyle,
                            list: 'edit-standalone-session-court-levels-list',
                            'data-testid': 'edit-standalone-session-court-level',
                        }),
                        React.createElement('datalist', { id: 'edit-standalone-session-court-levels-list' },
                            COURT_LEVELS.map((lvl: string) => React.createElement('option', { key: lvl, value: lvl }))
                        )
                    ),
                    React.createElement('div', { className: 'grid grid-cols-2 gap-3 lg:col-span-2' },
                        React.createElement('div', null,
                            React.createElement('label', { className: 'block text-[10px] font-bold text-slate-400 mb-1.5' }, 'تاريخ الجلسة', React.createElement('span', { className: 'text-rose-400 mr-0.5' }, ' *')),
                            React.createElement('input', { type: 'date', value: form.session_date, onChange: set('session_date'), className: inputCls, style: inputStyle, 'data-testid': 'edit-standalone-session-date' })
                        ),
                        React.createElement(Sel, { label: 'توقيت الجلسة', value: form.session_time, onChange: set('session_time'), options: [{ value: 'صباحي', label: '🌅 صباحي' }, { value: 'مسائي', label: '🌆 مسائي' }] })
                    ),
                    React.createElement('div', { className: 'border-t border-white/5 my-1 lg:col-span-2' }),
                    // ══════════════ أطراف الدعوى ══════════════
                    // ⚡ CHANGED (مرحلة 6.4 — خطة تعدد الأطراف، 23 يوليو 2026):
                    // بدل حقلي "الموكل"/"الخصم" المفردين، PartyFieldsGroup
                    // بيدعم عدد بلا حدود من المدعين والمدعى عليهم — نفس تغيير
                    // EditCaseModal.tsx (مرحلة 5.1) بالحرف. الطرف المربوط فعليًا
                    // بموكل حي (linkedPartyId فوق) بيتقفل (readOnly).
                    isLinked && React.createElement('div', { className: 'flex items-center justify-between lg:col-span-2' },
                        React.createElement('p', { className: 'text-[9px] text-slate-500' }, '🔗 مربوط بموكل من النظام — بيانات الطرف ده بتتقرا من ملف الموكل'),
                        onOpenClientProfile && linkedClient && React.createElement('button', {
                            type: 'button', onClick: () => onOpenClientProfile(linkedClient),
                            className: 'text-[9px] font-black text-premium-gold shrink-0'
                        }, '✏️ عدّل من ملف الموكل')
                    ),
                    // ⚡ NEW (مرحلة 7 — fallback الموكل المحذوف): الجلسة كانت
                    // مربوطة بموكل اتحذف بعد كده. الحقول تحت رجعت حرة بقيمها
                    // الأخيرة المحفوظة في عمود الجلسة نفسه (مفيش كراش/فراغ).
                    isOrphaned && React.createElement('div', { className: 'bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 lg:col-span-2', 'data-testid': 'edit-standalone-orphaned-client-warning' },
                        React.createElement('p', { className: 'text-[9px] text-amber-400 font-bold leading-relaxed' },
                            '⚠️ الموكل محذوف — البيانات دي آخر ما هو معروف عن الموكل، وبقت قابلة للتعديل الحر.'
                        )
                    ),
                    React.createElement('div', {className:'lg:col-span-2'}, React.createElement(PartyFieldsGroup, { controller: partyFields, testIdPrefix: 'edit-standalone-session', renderPartyReadOnly, renderPartyExtra, getPartyState: (party: PartyFieldValue) => getPartyState(party, domainContext) })),
                    React.createElement('div', { className: 'border-t border-white/5 my-1 lg:col-span-2' }),
                    React.createElement('div', {className:'lg:col-span-2'}, React.createElement(Inp, { label: 'الإجراء القادم', value: form.next_action, onChange: set('next_action'), placeholder: 'مثال: تقديم مذكرة دفاع' })),
                    // ⚡ FIX (فورم التعديل الناقص — 11 أغسطس 2026): الطابق
                    // وقاعة الجلسة + بيانات سكرتير الجلسة كانوا موجودين في
                    // فورم الإنشاء بس غايبين من فورم التعديل بالكامل.
                    React.createElement(Inp, { label: 'الطابق وقاعة الجلسة', value: form.session_hall, onChange: set('session_hall'), placeholder: 'مثال: الدور الأول - قاعة 5' }),
                    React.createElement(Inp, { label: 'قاعة سكرتير الجلسة', value: form.secretary_hall, onChange: set('secretary_hall'), placeholder: 'رقم أو اسم قاعة السكرتير' }),
                    React.createElement('div', { className: 'grid grid-cols-2 gap-3 lg:col-span-2' },
                        React.createElement(Inp, { label: 'اسم سكرتير الجلسة', value: form.secretary_name, onChange: set('secretary_name'), placeholder: 'اسم السكرتير' }),
                        React.createElement(Inp, {
                            label: 'موبايل السكرتير',
                            value: form.secretary_mobile,
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, secretary_mobile: onlyDigits(e.target.value, 11) })),
                            placeholder: 'رقم الموبايل',
                            inputMode: 'numeric',
                            maxLength: 11
                        })
                    ),
                    React.createElement('div', { className: 'h-4 lg:col-span-2' })
                ),
                React.createElement('div', { className: 'px-5 py-4 border-t border-white/5 flex gap-3' },
                    React.createElement('button', { onClick: guardedClose, className: 'flex-1 py-3 rounded-2xl text-xs font-bold text-slate-400 bg-white/5 hover:bg-white/10 transition-all', 'data-testid': 'edit-standalone-session-cancel' }, 'إلغاء'),
                    React.createElement('button', {
                        onClick: handleSave, disabled: saving || !form.session_date,
                        className: 'flex-grow-[2] py-3 rounded-2xl text-xs font-black text-premium-bg transition-all disabled:opacity-40',
                        style: { background: saving ? '#888' : 'linear-gradient(135deg,#d4af37,#f0c040)' },
                        'data-testid': 'edit-standalone-session-save'
                    }, saving ? '⏳ جاري الحفظ...' : '✅ حفظ التعديلات')
                )
            )
        ),
        document.body
    );

    return React.createElement(React.Fragment, null, modalTree, confirmModal);
}


export default EditStandaloneModal;
