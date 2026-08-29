import React, { useState, useEffect, useCallback } from 'react';
import { toast } from '../../../shared/lib/notifications';
import { safeUpdate, logActivity, buildFieldDiff, buildDeleteSnapshot, buildAddSnapshot, type FieldDiffMap } from '../../../shared/lib/dataAccess';
import { ilikeOrClause } from '../../../shared/lib/sanitize';
import { COUNTRY_CONFIGS } from '../../../constants';
import { db } from '../../../supabaseClient';
import { formatArNumber, formatArDate } from '../../../shared/ui/arabicLocale';
import { createFetchGuard } from '../../../shared/lib/offlineGuard';
import { recordError, recordSuccess } from '../../../systemHealth';
import { computeFeeStatus } from '../feeStatus';
import { formatPartySideLine } from '../../../shared/parties/partyDisplay';
import type { PartyDisplayRow } from '../../../shared/parties/partiesDisplay';
import type { ClientRow, CaseFeeRow, FeePaymentRow, ProfileRow, PaymentsByFeeId } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';

const PAGE_SIZE = 15;

// ── نتيجة اشتقاق "اسم الموكل" من القضية (طلب المستخدم — 29 أغسطس 2026) ──
export interface ResolvedCaseClient {
    // معرف موكل حقيقي في جدول clients لو الجهة شخص واحد مرتبط بموكل — وإلا ''.
    clientId: string;
    // النص اليدوي (المسمى القانوني الجامع) لو الجهة أكتر من شخص — وإلا ''.
    manualText: string;
    // النص الجاهز للعرض في الحقل المقفول — فاضي يعني "مفيش موكل مرتبط
    // بالقضية دي" (القضية محتاجة تتظبط من تاب القضايا أولًا).
    displayLabel: string;
}

const EMPTY_RESOLVED_CLIENT: ResolvedCaseClient = { clientId: '', manualText: '', displayLabel: '' };

// ⚡ NEW (طلب المستخدم — 29 أغسطس 2026): بما إن اختيار القضية إجباري أصلاً
// وقت إضافة/تعديل سجل أتعاب، اسم الموكل بقى بيتاخد تلقائيًا من القضية
// نفسها (مقفول — مش قابل للتعديل من فورم الأتعاب) بدل اختيار مستقل. لو
// جهة الموكل في القضية فيها أكتر من شخص مسمّى، بيتعرض المسمى القانوني
// الجامع ليهم بدل اسم واحد — بنفس الدالة المستخدمة في كل مكان تاني في
// المشروع لعرض ملخص الجهة (formatPartySideLine)، عشان الصيغة تتوحّد مع
// باقي الشاشات (كارت القضية، الجلسات، إلخ) بدل ما نبني تنسيق تاني هنا.
//
// ⚠️ الجهة المقصودة بـ"الموكل" هنا محدَّدة بمطابقة case_parties.client_id
// مع cases.client_id (الموكل الأساسي المسجّل على القضية وقت الحفظ — راجع
// NewCaseModal.tsx: `partyFields.plaintiffs.find(p=>p.is_client)`) — مفيش
// حاجة جديدة مضافة لسكيمة case_parties ولا لاستعلام useAppData.ts، فقط
// استخدام الحقول المتاحة أصلًا (side/name/client_id) على MappedCase.parties.
//
// ⚠️ نطاق التطبيق: فورم "إضافة/تعديل أتعاب" (FeesTab.tsx) بس — فورم
// "تسجيل دفعة" المستقل في FeeCard.tsx (اختيار موكل منفصل خاص بالدفعة)
// اتسيب زي ما هو عمدًا، مفيش طلب صريح بتغييره.
export function resolveCaseFeeClient(lc: MappedCase | undefined, clients: ClientRow[]): ResolvedCaseClient {
    if (!lc) return EMPTY_RESOLVED_CLIENT;
    const parties = (lc.parties || []) as PartyDisplayRow[];
    const clientSideParty = lc.client_id ? parties.find((p) => p.client_id === lc.client_id) : null;
    const side = clientSideParty?.side || null;
    const namedOnSide = side ? parties.filter((p) => p.side === side && p.name && p.name.trim()) : [];
    if (namedOnSide.length > 1) {
        const legalTitle = side === 'plaintiff' ? lc.plaintiff_legal_title : lc.defendant_legal_title;
        const joint = formatPartySideLine(namedOnSide, legalTitle);
        if (joint) return { clientId: '', manualText: joint, displayLabel: joint };
    }
    const matchedClient = lc.client_id ? clients.find((cl) => cl.id === lc.client_id) : null;
    if (matchedClient?.full_name) return { clientId: lc.client_id as string, manualText: '', displayLabel: matchedClient.full_name };
    return EMPTY_RESOLVED_CLIENT;
}

// ─────────────────────────────────────────────────────────
//  🔒 FIX (طلب المستخدم بعد فيكس فحص التكرار — 13 أغسطس 2026): الفتشات
//  الثلاث تحت (fetchStatusCounts/fetchGrandSummary/fetchFees) كان عندها
//  الحماية من التعليق للأبد (createFetchGuard) بالفعل من فيكس 9 أغسطس، لكن
//  من غير أي كاش fallback — أوف لاين، القسم كان بيقعد "بيحمّل" لحظة ثم
//  يرجع فاضي بصمت (recordError بس، من غير أي نسخة قديمة تتعرض). نفس نمط
//  الكاش المستخدم بالفعل في useAppData.ts (القضايا/الموكلين)، مقيّد
//  بـtenant_id عشان مفيش تسريب بيانات مكتب لمكتب تاني على نفس الجهاز.
//  fetchFees بيتكاش بس لأول صفحة (page 0) من غير بحث — نفس قيد
//  useAppData.ts بالظبط — ومفتاح كاش منفصل لكل تاب (collected/deferred/open)
//  عشان آخر تاب فتحه المستخدم يفضل متاح أوف لاين.
// ─────────────────────────────────────────────────────────
const FEES_COUNTS_CACHE_KEY  = 'sanad_cached_fees_counts_v1';
const FEES_SUMMARY_CACHE_KEY = 'sanad_cached_fees_summary_v1';
const FEES_PAGE0_CACHE_PREFIX = 'sanad_cached_fees_page0_v1:';

function saveFeesCache<T>(key: string, tenantId: string | null | undefined, data: T) {
    try { localStorage.setItem(key, JSON.stringify({ tenantId: tenantId ?? null, data })); } catch { /* localStorage غير متاح — تجاهل */ }
}
function loadFeesCache<T>(key: string, tenantId: string | null | undefined): T | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { tenantId: string | null; data: T };
        if (parsed.tenantId !== (tenantId ?? null)) return null;
        return parsed.data;
    } catch { return null; }
}

// شكل بيانات مودال الفاتورة (مبني من fee + payment وقت الإصدار في FeeCard.tsx)
export interface InvoiceModalState {
    payment: FeePaymentRow;
    fee: CaseFeeRow;
    invoiceNum: string;
    caseName: string;
    clientName: string;
    receivedBy: string;
    amount: string;
    payDate: string;
    issueDate: string;
    totalFees: string;
    paidFees: string;
    remaining: string;
    isFullyPaid: boolean;
    notes: string;
}

// شكل تأكيد حذف دفعة (مبني في FeeCard.tsx)
export interface ConfirmDeletePayState {
    payId: string;
    fee: CaseFeeRow;
    amount: number;
    payDate: string | null;
}

// شكل فورم إضافة/تعديل الأتعاب (مستخدم فعليًا كـ strings في كل مكان —
// إدخالات نصية/رقمية بتتقارن أو تتحول بـ parseFloat لاحقًا في handleSave)
export interface FeeFormState {
    case_id: string;
    client_id: string;
    receiver: string;
    total: string;
    paid: string;
    payment_date: string;
    notes: string;
}

// ⚡ NEW (تاب "الأتعاب" جوه تفاصيل القضية — 29 أغسطس 2026): caseScopeId
// اختياري — لو معدّى، الـhook بيشتغل في "وضع قضية واحدة" بدل الوضع
// العام (تصفّح/فلترة/بحث/pagination عبر كل أتعاب المكتب). في الوضعين،
// القراءة والكتابة بتحصل على *نفس* جدول case_fees/fee_payments في
// الداتابيز — مفيش نسخة بيانات منفصلة ولا تكرار تخزين، فأي إضافة/تعديل
// من هنا يظهر فورًا في تاب "الأتعاب" العام (والعكس) في أول فتح/تحديث ليه.
export function useFeesActions(cases: MappedCase[], clients: ClientRow[], country?: string, profile?: ProfileRow | null, externalRefreshSignal?: number, caseScopeId?: string) {
    const [fees, setFees] = useState<CaseFeeRow[]>([]);
    const [payments, setPayments] = useState<PaymentsByFeeId>({}); // keyed by fee_id
    const [expandedPayments, setExpandedPayments] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<FeeFormState>({case_id:'', client_id:'', receiver:'', total:'', paid:'', payment_date:'', notes:''});
    const [saving, setSaving] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [addPaymentFor, setAddPaymentFor] = useState<string | null>(null);
    // 🔒 FIX (تقرير الموثوقية الشامل — H-1): زرار "تسجيل" دفعة أتعاب كان الوحيد
    // من غير حماية دبل كليك/دبل تاب (بعكس باقي أزرار الحفظ في المشروع). بنقفل
    // بـ id الأتعاب الحالية فورًا في أول سطر من handleAddPayment، نفس فلسفة
    // "نتيجة 0" (saving/savingCase/... إلخ) المطبّقة في باقي المشروع.
    const [payingFeeId, setPayingFeeId] = useState<string | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [payDate, setPayDate] = useState('');
    const [payNote, setPayNote] = useState('');
    const [confirmDeletePay, setConfirmDeletePay] = useState<ConfirmDeletePayState | null>(null);
    const [confirmDeleteFee, setConfirmDeleteFee] = useState<CaseFeeRow | null>(null);
    const [invoiceModal, setInvoiceModal] = useState<InvoiceModalState | null>(null);
    const [payReceiver, setPayReceiver] = useState('');
    const [payClientName, setPayClientName] = useState('');
    const [payClientNameText, setPayClientNameText] = useState('');
    const [feesSearch, setFeesSearch] = useState('');
    // 🔀 FIX (دمج تابي "مؤجلة" و"مفتوحة" — 20 أغسطس 2026): الفلتر بقى تاني
    // بقيمتين بس (collected/pending) بدل التلاتة. عمود status في الداتابيز
    // نفسه فضل زي ما هو (3 قيم: collected/deferred/open) — الدمج على مستوى
    // العرض والفلترة بس (fetchFees تحت بتستخدم .in() للـpending)، عشان منمسّش
    // RPCs (record_fee_payment/create_fee_with_advance) ولا migration التصحيح
    // القديم. راجع feesSections تحت لتفاصيل الدمج، وstatusCounts.pending
    // للعدّاد المجمّع.
    const [feesFilter, setFeesFilter] = useState<'collected'|'pending'>('pending');

    // ── pagination state ──
    const [feesPage, setFeesPage]   = useState(0);
    const [feesTotal, setFeesTotal] = useState(0);
    const [feesMore, setFeesMore]   = useState(false);

    // ── FIX: الملخص المالي الإجمالي (كل الأتعاب، مش الصفحة الحالية) ──
    const [grandTotalAll, setGrandTotalAll] = useState(0);
    const [grandPaidAll,  setGrandPaidAll]  = useState(0);
    const [loadingSummary, setLoadingSummary] = useState(false);

    // ── عدد كل تاب من السيرفر مباشرة (بديل feesByCategory.length المُهمَل) ──
    // 🔀 FIX (دمج التابين): statusCounts لسه بيجيب الـ3 أعداد الحقيقية
    // (collected/deferred/open) من الداتابيز زي ما هي — مفيدة لعرض التفصيل
    // الكامل في SummaryModal — بالإضافة لـpending المحسوب (deferred+open)
    // عشان تاب "غير محصّلة" المدموج يعرض رقمه من غير استعلام رابع.
    const [statusCounts, setStatusCounts] = useState<Record<string, number>>({collected:0,deferred:0,open:0,pending:0});

    const fetchStatusCounts = useCallback(async () => {
        if (!profile) return;
        // ⚡ FIX (تحليل شكوى "قسم الأتعاب بيقعد يحمّل" — 9 أغسطس 2026): نفس
        // نمط useRemindersTab.ts/CalendarTab.tsx — offline يوقف فورًا،
        // أونلاين بطيء يتقفل بعد 8 ثواني بدل ما يفضل معلّق، وأي فشل يتسجل
        // بلقب واضح (db_fees) بدل ما يظهر برسالة عامة غلط في الداشبورد.
        const guard = createFetchGuard();
        if (guard.offline) {
            recordError('db_fees', 'offline');
            const cached = loadFeesCache<Record<string, number>>(FEES_COUNTS_CACHE_KEY, profile.tenant_id);
            if (cached) { setStatusCounts(cached); toast('أنت أوف لاين — بتشوف آخر نسخة محفوظة من عدّاد الأتعاب'); }
            return;
        }
        try {
            const [c1, c2, c3] = await Promise.all([
                db.from('case_fees').select('id', { count: 'exact', head: true }).eq('status','collected').is('deleted_at', null).abortSignal(guard.controller.signal),
                db.from('case_fees').select('id', { count: 'exact', head: true }).eq('status','deferred').is('deleted_at', null).abortSignal(guard.controller.signal),
                db.from('case_fees').select('id', { count: 'exact', head: true }).eq('status','open').is('deleted_at', null).abortSignal(guard.controller.signal),
            ]);
            if (c1.error || c2.error || c3.error) throw (c1.error || c2.error || c3.error);
            const collected = c1.count||0, deferred = c2.count||0, open = c3.count||0;
            const counts = { collected, deferred, open, pending: deferred + open };
            setStatusCounts(counts);
            saveFeesCache(FEES_COUNTS_CACHE_KEY, profile.tenant_id, counts);
            recordSuccess('db_fees');
        } catch (err) {
            const msg = guard.didTimeOut() ? 'timeout' : (err as { message?: string })?.message || 'fetch failed';
            recordError('db_fees', msg);
            const cached = loadFeesCache<Record<string, number>>(FEES_COUNTS_CACHE_KEY, profile.tenant_id);
            if (cached) setStatusCounts(cached);
        } finally {
            guard.cleanup();
        }
    }, [profile]);

    const fetchGrandSummary = useCallback(async () => {
        if (!profile) return;
        setLoadingSummary(true);
        const guard = createFetchGuard();
        if (guard.offline) {
            recordError('db_fees', 'offline');
            const cached = loadFeesCache<{ total: number; paid: number }>(FEES_SUMMARY_CACHE_KEY, profile.tenant_id);
            if (cached) { setGrandTotalAll(cached.total); setGrandPaidAll(cached.paid); toast('أنت أوف لاين — بتشوف آخر نسخة محفوظة من إجمالي الأتعاب'); }
            setLoadingSummary(false);
            return;
        }
        try {
            const { data, error } = await db.from('case_fees').select('total_fees,paid_fees').is('deleted_at', null).abortSignal(guard.controller.signal);
            if (error) throw error;
            const t = (data || []).reduce((s: number, f: { total_fees: number | null }) => s + (f.total_fees || 0), 0);
            const p = (data || []).reduce((s: number, f: { paid_fees: number | null }) => s + (f.paid_fees  || 0), 0);
            setGrandTotalAll(t);
            setGrandPaidAll(p);
            saveFeesCache(FEES_SUMMARY_CACHE_KEY, profile.tenant_id, { total: t, paid: p });
            recordSuccess('db_fees');
        } catch (err) {
            const msg = guard.didTimeOut() ? 'timeout' : (err as { message?: string })?.message || 'fetch failed';
            recordError('db_fees', msg);
            const cached = loadFeesCache<{ total: number; paid: number }>(FEES_SUMMARY_CACHE_KEY, profile.tenant_id);
            if (cached) { setGrandTotalAll(cached.total); setGrandPaidAll(cached.paid); }
        } finally {
            guard.cleanup();
            setLoadingSummary(false);
        }
    }, [profile]);

    useEffect(() => { fetchGrandSummary(); fetchStatusCounts(); }, [fetchGrandSummary, fetchStatusCounts]);

    // ── عملة الدولة المختارة ──
    const currency = COUNTRY_CONFIGS[country||'EG']?.currency || 'جنيه مصري';

    // ── جلب الأتعاب من DB (paginated + server-side search + status filter) ──
    const fetchFees = useCallback(async (page = 0, status = feesFilter, search = feesSearch, append = false) => {
        if (!profile) return;
        setLoading(true);
        const from = page * PAGE_SIZE;
        const to   = from + PAGE_SIZE - 1;

        // ⚡ FIX (تحليل شكوى "قسم الأتعاب بيقعد يحمّل" — 9 أغسطس 2026): نفس
        // نمط fetchStatusCounts/fetchGrandSummary فوق — offline يوقف فورًا،
        // أونلاين بطيء يتقفل بعد 8 ثواني، وأي فشل يتسجل بلقب واضح.
        // 🔄 CHANGED (طلب المستخدم — 29 أغسطس 2026، توسيع بحث الأتعاب): الـguard
        // بقى بيتعمل هنا فوق (قبل بناء أي استعلام) بدل تحت، لأن بحث اسم/رقم/نوع
        // الدعوى (تحت) بقى محتاج استعلام شبكة إضافي على جدول `cases` قبل
        // استعلام `case_fees` الرئيسي — لازم نفس فحص الأوفلاين يغطي الاتنين
        // مع بعض، مش بس الاستعلام الرئيسي زي قبل.
        const guard = createFetchGuard();
        if (guard.offline) {
            recordError('db_fees', 'offline');
            if (page === 0 && !search.trim()) {
                const cached = loadFeesCache<{ fees: CaseFeeRow[]; payments: PaymentsByFeeId }>(FEES_PAGE0_CACHE_PREFIX + status, profile.tenant_id);
                if (cached) {
                    setFees(cached.fees);
                    setPayments(cached.payments);
                    setFeesMore(false);
                    toast('أنت أوف لاين — بتشوف آخر نسخة محفوظة من الأتعاب');
                }
            }
            setLoading(false);
            return;
        }

        let q = db.from('case_fees')
            .select('*', { count: 'exact' })
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .range(from, to);
        // 🔀 FIX (دمج تابي "مؤجلة" و"مفتوحة"): تاب "pending" بيغطي حالتين
        // فعليتين في الداتابيز (deferred + open) — .in() بدل .eq() واحدة.
        // تاب "collected" لسه .eq() عادية زي ما كانت.
        q = status === 'pending' ? q.in('status', ['deferred', 'open']) : q.eq('status', status);

        if (search.trim()) {
            const s = search.trim();
            // FIX: فاصلة أو قوس في نص البحث كان بيكسر صياغة فلتر .or()
            // 🔄 CHANGED (طلب المستخدم — 29 أغسطس 2026): البحث كان بيغطي اسم
            // الموكل والملاحظات بس — كتابة اسم الدعوى/رقمها/نوعها كانت بترجع
            // نتيجة فاضية دايمًا. case_title عمود موجود فعليًا على case_fees
            // نفسها (بيتسجل وقت الإنشاء، create_fee_with_advance RPC) فبإمكاننا
            // نضيفه هنا مباشرة من غير أي استعلام إضافي. لكن رقم القضية
            // (case_number_official) ونوعها (case_type) أعمدة موجودة بس على
            // جدول `cases` نفسه، مش متكررة (denormalized) على case_fees — فلو
            // نص البحث ملقاش تطابق مباشر في client_name/notes/case_title،
            // بندوّر كمان على قضايا مطابقة بالاسم/الرقم/النوع في `cases` ونجيب
            // كل سجلات الأتعاب المرتبطة بيها (نفس نمط title/case_number_official
            // المستخدم في useAppData.ts/CaseSearchSelect.tsx، + case_type إضافي
            // هنا تحديدًا لأن ده المطلوب صراحة).
            const orParts = [
                ilikeOrClause('client_name', s),
                ilikeOrClause('notes', s),
                ilikeOrClause('case_title', s),
            ];
            const { data: matchedCases } = await db.from('cases')
                .select('id')
                .is('deleted_at', null)
                .or([
                    ilikeOrClause('title', s),
                    ilikeOrClause('case_number_official', s),
                    ilikeOrClause('case_type', s),
                ].join(','))
                .limit(200)
                .abortSignal(guard.controller.signal);
            if (matchedCases && matchedCases.length > 0) {
                const ids = matchedCases.map((c: { id: string }) => c.id);
                orParts.push(`case_id.in.(${ids.join(',')})`);
            }
            q = q.or(orParts.join(','));
        }

        try {
            const { data, error, count } = await q.abortSignal(guard.controller.signal);
            if (error) throw error;

            const list = data || [];

            // جلب الدفعات للصفحة الحالية بس
            const feeIds = list.map((f) => f.id);
            const grouped: PaymentsByFeeId = {};
            if (feeIds.length > 0) {
                const { data: pays, error: paysErr } = await db.from('fee_payments')
                    .select('*')
                    .in('fee_id', feeIds)
                    .order('payment_date', { ascending: false })
                    .abortSignal(guard.controller.signal);
                if (paysErr) throw paysErr;
                (pays || []).forEach((p) => {
                    const key = p.fee_id as string;
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(p);
                });
            }

            if (append) {
                setFees((prev) => [...prev, ...list]);
                setPayments((prev) => ({ ...prev, ...grouped }));
            } else {
                setFees(list);
                setPayments(grouped);
            }

            setFeesTotal(count || 0);
            setFeesPage(page);
            setFeesMore((page + 1) * PAGE_SIZE < (count || 0));
            if (page === 0 && !search.trim()) saveFeesCache(FEES_PAGE0_CACHE_PREFIX + status, profile.tenant_id, { fees: list, payments: grouped });
            recordSuccess('db_fees');
        } catch (err) {
            const msg = guard.didTimeOut() ? 'timeout' : (err as { message?: string })?.message || 'fetch failed';
            recordError('db_fees', msg);
            if (page === 0 && !search.trim()) {
                const cached = loadFeesCache<{ fees: CaseFeeRow[]; payments: PaymentsByFeeId }>(FEES_PAGE0_CACHE_PREFIX + status, profile.tenant_id);
                if (cached) { setFees(cached.fees); setPayments(cached.payments); setFeesMore(false); }
            }
        } finally {
            guard.cleanup();
            setLoading(false);
        }
    }, [profile, feesFilter, feesSearch]);

    // ── جلب كل سجلات الأتعاب الخاصة بقضية واحدة بس (وضع caseScopeId) ──
    // مفيش pagination ولا فلتر حالة (pending/collected) ولا بحث هنا —
    // قضية واحدة عادةً معاها سجل أتعاب واحد أو اتنين، فمفيش داعي لتعقيد
    // الاستعلام العام. نفس جدولي case_fees/fee_payments بالظبط.
    const fetchFeesForCase = useCallback(async (caseId: string) => {
        if (!profile || !caseId) return;
        setLoading(true);
        const guard = createFetchGuard();
        if (guard.offline) {
            recordError('db_fees', 'offline');
            setLoading(false);
            return;
        }
        try {
            const { data, error } = await db.from('case_fees')
                .select('*')
                .eq('case_id', caseId)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .abortSignal(guard.controller.signal);
            if (error) throw error;
            const list = data || [];
            const feeIds = list.map((f) => f.id);
            const grouped: PaymentsByFeeId = {};
            if (feeIds.length > 0) {
                const { data: pays, error: paysErr } = await db.from('fee_payments')
                    .select('*')
                    .in('fee_id', feeIds)
                    .order('payment_date', { ascending: false })
                    .abortSignal(guard.controller.signal);
                if (paysErr) throw paysErr;
                (pays || []).forEach((p) => {
                    const key = p.fee_id as string;
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(p);
                });
            }
            setFees(list);
            setPayments(grouped);
            setFeesTotal(list.length);
            setFeesPage(0);
            setFeesMore(false);
            recordSuccess('db_fees');
        } catch (err) {
            const msg = guard.didTimeOut() ? 'timeout' : (err as { message?: string })?.message || 'fetch failed';
            recordError('db_fees', msg);
        } finally {
            guard.cleanup();
            setLoading(false);
        }
    }, [profile]);

    // ── إعادة الجلب بعد أي كتابة (حفظ/دفعة/حذف...) — بترجع لنفس مصدر
    // البيانات المناسب حسب الوضع (قضية واحدة أو القائمة العامة). ──
    const refetchFees = useCallback(() => {
        if (caseScopeId) fetchFeesForCase(caseScopeId);
        else fetchFees(0, feesFilter, feesSearch, false);
    }, [caseScopeId, fetchFeesForCase, fetchFees, feesFilter, feesSearch]);

    useEffect(() => {
        if (caseScopeId) fetchFeesForCase(caseScopeId);
        else fetchFees(0, feesFilter, feesSearch, false);
    }, [caseScopeId, fetchFeesForCase, fetchFees, feesFilter, feesSearch]);

    // 🔧 FIX (20 أغسطس 2026): زرار الريفرش في الهيدر كان بيحدّث القضايا
    // بس (fetchCases)، وتاب الأتعاب عنده بياناته الخاصة (fetchFees/
    // fetchGrandSummary/fetchStatusCounts) اللي مالهاش أي علاقة بالقضايا
    // — يعني الزرار كان شكلي هنا، مبيغيّرش أي حاجة ظاهرة على الشاشة.
    // نفس نمط externalRefreshSignal المستخدم فعليًا في SessionsCalendar.tsx
    // (App.tsx بيبعت رقم بيزيد كل ضغطة، والـeffect ده بيعمل refetch كامل).
    // skippedFirstRun بيمنع فetch مزدوج عند أول تحميل (الإشارة بتوصل بقيمة
    // ابتدائية معرّفة من App.tsx مش undefined).
    const skippedFirstRun = React.useRef(false);
    useEffect(() => {
        if (!skippedFirstRun.current) { skippedFirstRun.current = true; return; }
        if (externalRefreshSignal === undefined) return;
        refetchFees();
        fetchGrandSummary();
        fetchStatusCounts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [externalRefreshSignal]);

    // ── عند تغيير التاب أو البحث ──
    const handleFilterChange = (newFilter: 'collected'|'pending') => {
        setFeesFilter(newFilter);
        setFeesSearch('');
        fetchFees(0, newFilter, '', false);
    };

    const handleSearch = (term: string) => {
        setFeesSearch(term);
        fetchFees(0, feesFilter, term, false);
    };

    const handleSave = async () => {
        // 🔒 FIX (طلب المستخدم — 29 أغسطس 2026): كل حقول فورم الأتعاب بقت
        // إجبارية عدا "ملاحظات". "المبلغ المدفوع" و"تاريخ الدفعة" إجباريين
        // بس في مسار الإنشاء الجديد (!editId) — في وضع التعديل الحقل ده
        // أصلاً disabled ومالوش تأثير (راجع تعليق fee-paid في FeesTab.tsx).
        if (!form.case_id) { toast('❌ حقل "القضية" مطلوب — يرجى اختيار القضية', true); return; }
        // 🔒 CHANGED (طلب المستخدم — 29 أغسطس 2026): اسم الموكل مبقاش قابل
        // للتحديد يدويًا من الفورم — بيتشتق من القضية المختارة وقت الحفظ
        // نفسه (نفس نمط resolveCaseFeeClient المستخدم في FeeCard.tsx)، عشان
        // نضمن إن أي تعديل لاحق على ربط القضية بالموكل (بعد ما الفورم اتفتح)
        // ينعكس في القيمة الفعلية المحفوظة، مش قيمة قديمة متجمدة في form.client_id.
        const selectedCaseForSave = cases.find((c) => c.id === form.case_id);
        const resolvedClient = resolveCaseFeeClient(selectedCaseForSave, clients);
        if (!resolvedClient.displayLabel) { toast('❌ القضية دي مش مربوطة بموكل — يرجى تحديد الموكل من بيانات القضية أولاً', true); return; }
        if (!form.receiver?.trim()) { toast('❌ حقل "المستلم من المكتب" مطلوب', true); return; }
        const parsedTotal = parseFloat(form.total);
        if (!form.total || isNaN(parsedTotal)) { toast('❌ حقل "إجمالي الأتعاب" مطلوب', true); return; }
        if (parsedTotal < 0) { toast('❌ خطأ: إجمالي الأتعاب لا يمكن أن يكون سالباً', true); return; }
        if (!editId) {
            const parsedPaid = parseFloat(form.paid);
            if (!form.paid || isNaN(parsedPaid) || parsedPaid <= 0) { toast('❌ حقل "المبلغ المدفوع" مطلوب — أدخلي الدفعة الأولى (مقدم الأتعاب)', true); return; }
            if (!form.payment_date) { toast('❌ حقل "تاريخ الدفعة" مطلوب', true); return; }
        }
        setSaving(true);
        const clientId: string | null = resolvedClient.clientId || null;
        const clientName: string | null = resolvedClient.displayLabel || null;
        const payload = {
            case_id: form.case_id,
            case_title: cases.find((c) => c.id === form.case_id)?.title || null,
            client_id: clientId,
            client_name: clientName,
            receiver: form.receiver||null,
            total_fees: parsedTotal,
            notes: form.notes||null,
        };
        if(editId){
            const editFee = fees.find((f) => f.id === editId);
            const newTotal = payload.total_fees;
            const currentPaid = editFee?.paid_fees || 0;
            const payloadWithStatus = { ...payload, status: computeFeeStatus(newTotal, currentPaid) };
            const { conflict } = await safeUpdate(db, 'case_fees', editId, payloadWithStatus, editFee?.updated_at || null);
            // 🔒 FIX (تقرير الموثوقية — القسم 12، Concurrent Editing): توست بدل السكوت التام.
            if (conflict) { setSaving(false); toast('⚠️ سجل الأتعاب ده عدّله شخص آخر بعد ما فتحته — أعد المحاولة', true); return; }
            toast('✅ تم تحديث الأتعاب');
            // ⚡ NEW (سجل النشاط — تتبع التغييرات، مرحلة 4، 19 أغسطس 2026):
            // editFee هو CaseFeeRow خام من الـstate (اتلقط فوق قبل safeUpdate)
            // — مقارنته مباشرة مع payloadWithStatus آمنة.
            const feeFieldDiffMap: FieldDiffMap = {
                receiver: { label: 'المستلم' },
                total_fees: { label: 'إجمالي الأتعاب' },
                notes: { label: 'ملاحظات' },
                status: { label: 'الحالة' },
            };
            const feeChanges = buildFieldDiff(
                editFee as unknown as Record<string, unknown>,
                payloadWithStatus as unknown as Record<string, unknown>,
                feeFieldDiffMap
            );
            logActivity(db, 'تعديل أتعاب', {
                entity_type: 'fee', entity_id: editId, details: clientName || form.case_id,
                client_name: clientName || null,
                case_name: cases.find((c) => c.id === form.case_id)?.title || null,
                case_type: cases.find((c) => c.id === form.case_id)?.type || null,
                changes: feeChanges,
            });
            // 🔒 FIX (26 يوليو 2026 — نفس مشكلة handleAddPayment): تعديل سجل
            // أتعاب مفتوح تفاصيله (nested داخل feeDetail) بتحديث محلي بدل
            // fetchFees الكاملة اللي ممكن تشيله من fees[] لو الإجمالي/الحالة
            // الجديدة مش متوافقة مع فلتر التاب المفتوح، وتسحب معاها المودال.
            setFees((prev) => prev.map((f) => (f.id === editId ? { ...f, ...payloadWithStatus } : f)));
            setSaving(false);
            setShowForm(false); setForm({case_id:'',client_id:'',receiver:'',total:'',paid:'',payment_date:'',notes:''}); setEditId(null);
            fetchGrandSummary();
            fetchStatusCounts();
            return;
        } else {
            const initialPaidAmount = parseFloat(form.paid) > 0 ? parseFloat(form.paid) : 0;
            // 🔒 قرار عمل محسوم مع صاحب المشروع (21 يوليو — المرحلة 6): إضافة
            // سجل أتعاب جديد (بدفعة مبدئية أو من غيرها) بتُمنع تمامًا أوفلاين
            // برضو — رسالة صريحة "يتطلب اتصال بالإنترنت" بدل التقييد في
            // الطابور. نفس فلسفة تسجيل/حذف الدفعة (منطق مالي، أفضل نمنعه
            // كامل من إنه يتقيّد وينفّذ بعدين في وقت مختلف تمامًا).
            if (!navigator.onLine) {
                toast('⚠️ إضافة أتعاب جديدة يتطلب اتصالاً بالإنترنت — أعد المحاولة عند توفر الاتصال', true);
                setSaving(false);
                return;
            }
            // 🔒 FIX (المرحلة 5 — RPC ذرّية create_fee_with_advance): كان ده
            // لحد 4 استعلامات منفصلة (insert case_fees → insert fee_payments
            // → select لإعادة حساب المجموع → update case_fees) بلا transaction
            // حقيقية بينهم — فشل نت فى النص كان بيسيب سجل أتعاب متسجل بدفعة
            // مقدّمة فى fee_payments بينما case_fees.paid_fees/status لسه صفر
            // (نفس مشكلة H-2 اللي اتحلت فى handleAddPayment/المرحلة 4، بس
            // هنا فى مسار الإنشاء). دلوقتي الأربعة بقوا جوه RPC واحدة بتتنفذ
            // فى transaction حقيقية على مستوى القاعدة — إما تنجح كلها أو
            // ترجع كلها.
            const { data: inserted, error } = await db.rpc('create_fee_with_advance', {
                p_case_id: payload.case_id,
                p_case_title: payload.case_title,
                p_client_id: payload.client_id,
                p_client_name: payload.client_name,
                p_receiver: payload.receiver,
                p_total_fees: payload.total_fees,
                p_notes: payload.notes,
                p_paid_amount: initialPaidAmount,
                p_payment_date: form.payment_date || null,
            });
            if(error){ toast('❌ فشل حفظ الأتعاب الجديدة — تحقق من الاتصال وأعد المحاولة', true); setSaving(false); return; }
            toast('✅ تم إضافة الأتعاب');
            // ⚡ NEW (سجل النشاط — بيان مميز عند الإضافة، مرحلة 4): المبلغ
            // بدل ما نكتفي باسم الموكل/القضية.
            const feeAddDetails = `${clientName || form.case_id} — ${payload.total_fees} ج.م`;
            // ⚡ FIX: Functions في database.types.ts معرّفة بشكل عام (permissive
            // index signature — Returns: unknown) لأنه مفيش استعلام حقيقي على
            // pg_proc اتعمل لدالة create_fee_with_advance بعينها، فـ supabase-js
            // بيرجع inserted كـ `{}` بدل الصف الحقيقي. بنعمل cast هنا للشكل
            // المعروف فعليًا (RPC بترجع صف واحد فيه id).
            const insertedRow = inserted as { id?: string } | null;
            // ⚡ FIX (طلب المستخدم — 30 أغسطس 2026): كان الـ changes بيسجل
            // المبلغ الإجمالي والمستلم بس. بنضيف هنا القضية والموكل (متاحين
            // أصلاً في payload) والمقدم المدفوع (initialPaidAmount، مش جزء من
            // payload لإنه بيتبعت لـ RPC بشكل منفصل) عشان سجل النشاط يوثّق
            // كل حاجة اتدخلت وقت إضافة الأتعاب مش المبلغ الإجمالي بس.
            logActivity(db, 'إضافة أتعاب', {
                entity_type: 'fee', entity_id: insertedRow?.id, details: feeAddDetails,
                client_name: clientName || null,
                case_name: cases.find((c) => c.id === form.case_id)?.title || null,
                case_type: cases.find((c) => c.id === form.case_id)?.type || null,
                changes: buildAddSnapshot({ ...payload, advance_amount: initialPaidAmount } as unknown as Record<string, unknown>, {
                    case_title: { label: 'القضية' },
                    client_name: { label: 'الموكل' },
                    total_fees: { label: 'إجمالي الأتعاب', format: (v) => fmt(v as number) },
                    advance_amount: { label: 'دفعة مقدمة', format: (v) => fmt(v as number) },
                    receiver: { label: 'المستلم' },
                }),
            });
        }
        setSaving(false);
        setShowForm(false); setForm({case_id:'',client_id:'',receiver:'',total:'',paid:'',payment_date:'',notes:''}); setEditId(null);
        refetchFees();
        fetchGrandSummary();
        fetchStatusCounts();
    };

    const handleAddPayment = async (fee: CaseFeeRow) => {
        if (payingFeeId) return; // دفعة تانية لسه شغالة — تجاهل أي استدعاء إضافي
        setPayingFeeId(fee.id);
        const amount = parseFloat(payAmount)||0;
        if(amount<=0){ toast('أدخل مبلغاً صحيحاً',true); setPayingFeeId(null); return; }
        // 🔒 FIX (طلب المستخدم — 29 أغسطس 2026): باقي حقول فورم "تسجيل دفعة"
        // إجبارية عدا الملاحظات (payNote).
        const hasPayClient = (payClientName === '__manual__' ? !!payClientNameText?.trim() : !!payClientName);
        if (!hasPayClient) { toast('❌ حقل "اسم الموكل" مطلوب', true); setPayingFeeId(null); return; }
        if (!payDate) { toast('❌ حقل "تاريخ الدفعة" مطلوب', true); setPayingFeeId(null); return; }
        if (!payReceiver?.trim()) { toast('❌ حقل "المستلم من المكتب" مطلوب', true); setPayingFeeId(null); return; }
        // 🔒 قرار عمل محسوم مع صاحب المشروع (21 يوليو — المرحلة 6، توسيع
        // الأوفلاين): تسجيل دفعة بينادي RPC ذرّية (record_fee_payment) —
        // نظام طابور الأوفلاين (__dbWrite) بيدعم بس INSERT/UPDATE/DELETE على
        // جدول، مش نداء RPC. بنمنع العملية بالكامل أوفلاين (رسالة صريحة) بدل
        // ما نبني نسخة أوفلاين متعددة الخطوات وترجعنا لمشكلة الـ partial-save
        // اللي المرحلة 4 حلّتها أصلاً.
        if (!navigator.onLine) {
            toast('⚠️ تسجيل الدفعة يتطلب اتصالاً بالإنترنت — أعد المحاولة عند توفر الاتصال', true);
            setPayingFeeId(null);
            return;
        }
        const remaining = (fee.total_fees || 0) - (fee.paid_fees || 0);
        if ((fee.total_fees || 0) > 0 && amount > remaining) {
            toast(`⚠️ المبلغ (${formatArNumber(amount)}) يتجاوز المتبقي (${formatArNumber(remaining)} ${currency}). تأكد من الصحة.`, true);
        }
        let resolvedClientId: string | null = null;
        let resolvedClientName: string | null = null;
        if (payClientName === '__manual__') {
            resolvedClientName = payClientNameText || null;
            resolvedClientId = null;
        } else if (payClientName) {
            const matchedClient = clients.find((cl) => cl.id === payClientName);
            resolvedClientName = matchedClient?.full_name || null;
            resolvedClientId = payClientName;
        } else {
            resolvedClientName = fee.client_name || null;
            resolvedClientId = fee.client_id || null;
        }
        // 🔒 FIX (تقرير الموثوقية الشامل — H-2، المرحلة 4): كان ده 3
        // استعلامات منفصلة (insert → select → update) بلا transaction
        // حقيقية بينهم — فشل نت فى النص كان بيسيب دفعة متسجلة والإجمالي
        // مش متحدّث (partial save موثّق فى الكود القديم). دلوقتي التلاتة
        // بقوا جوه RPC واحدة (record_fee_payment) بتتنفذ فى transaction
        // حقيقية على مستوى القاعدة — إما تنجح كلها أو ترجع كلها.
        const { data: updatedFeeRow, error: rpcError } = await db.rpc('record_fee_payment', {
            p_fee_id: fee.id,
            p_amount: amount,
            p_payment_date: payDate || null,
            p_notes: payNote || null,
            p_received_by: payReceiver || null,
            p_client_id: resolvedClientId,
            p_client_name: resolvedClientName,
        });
        if(rpcError){ toast('❌ فشل تسجيل الدفعة، يرجى المحاولة مرة أخرى', true); setPayingFeeId(null); return; }
        toast('✅ تم تسجيل الدفعة');
        logActivity(db, 'تسجيل دفعة', {
            entity_type: 'fee', entity_id: fee.id,
            details: `${formatArNumber(amount)} ${currency} — ${resolvedClientName || fee.client_name || ''}`,
            client_name: resolvedClientName || fee.client_name || null,
            case_name: cases.find((c) => c.id === fee.case_id)?.title || null,
            case_type: cases.find((c) => c.id === fee.case_id)?.type || null,
        });
        setPayingFeeId(null);
        setAddPaymentFor(null); setPayAmount(''); setPayDate(''); setPayNote(''); setPayReceiver(''); setPayClientName(''); setPayClientNameText('');
        // 🔒 FIX (26 يوليو 2026 — مودال تفاصيل الأتعاب بيختفي بعد سداد كامل
        // أو زيادة): كان هنا fetchFees(0, feesFilter,...) بتستبدل كل قايمة
        // fees بنتيجة سيرفر مفلترة بـ status الحالي. لو الدفعة كمّلت السداد
        // (status بيتحول لـ 'collected' جوه الـ RPC) والفلتر المفتوح
        // 'deferred'، السجل يختفي من fees[] فورًا فيسحب معاه مودال التفاصيل
        // المفتوح من تحت المستخدم. بنحدّث السجل ده بس محليًا ببيانات الـ RPC
        // الراجعة (نفس صف case_fees بعد التحديث) — يفضل ظاهر بأحدث بياناته
        // لحد ما المستخدم يقفل المودال أو يغيّر الفلتر/البحث بنفسه (وقتها
        // fetchFees الطبيعية هي اللي تشيله من القايمة).
        if (updatedFeeRow) {
            setFees((prev) => prev.map((f) => (f.id === fee.id ? { ...f, ...updatedFeeRow } : f)));
        }
        const { data: refreshedPays } = await db.from('fee_payments')
            .select('*')
            .eq('fee_id', fee.id)
            .order('payment_date', { ascending: false });
        setPayments((prev) => ({ ...prev, [fee.id]: refreshedPays || [] }));
        fetchGrandSummary();
        fetchStatusCounts();
    };

    const handleDeletePayment = async (payId: string, fee: CaseFeeRow) => {
        // 🔒 قرار عمل (21 يوليو — المرحلة 6): حذف دفعة عملية خطوتين متعتمدتين
        // (حذف الدفعة → إعادة حساب paid_fees من مجموع الباقي → تحديث case_fees)
        // بنفس طبيعة تسجيل دفعة بالظبط — بتُمنع تمامًا أوفلاين لنفس السبب
        // (تجنّب partial-save لو الخطوة الأولى نجحت والتانية اتقيّدت في طابور
        // منفصل هيتنفذ فى وقت مختلف تمامًا وقت المزامنة).
        if (!navigator.onLine) {
            toast('⚠️ حذف الدفعة يتطلب اتصالاً بالإنترنت — أعد المحاولة عند توفر الاتصال', true);
            return;
        }
        // ⚡ NEW (سجل النشاط — تغطية كاملة، 30 أغسطس 2026): بنلقط مبلغ
        // وتاريخ الدفعة قبل حذفها فعليًا من الداتابيز.
        const deletedPayment = (payments[fee.id] || []).find((p) => p.id === payId);
        const { error: deleteError } = await window.__dbWrite({ type: 'DELETE', table: 'fee_payments', id: payId });
        if(deleteError){ toast('❌ فشل حذف الدفعة، يرجى المحاولة مرة أخرى', true); return; }
        const {data:allPays} = await db.from('fee_payments').select('amount').eq('fee_id',fee.id);
        const realPaid = (allPays||[]).reduce((s: number, p: { amount: number | null }) => s+(p.amount||0), 0);
        const newStatus = computeFeeStatus(fee.total_fees || 0, realPaid);
        const { error: updateError } = await window.__dbWrite({
            type: 'UPDATE', table: 'case_fees',
            data: {paid_fees: realPaid, status: newStatus},
            id: fee.id,
        });
        if(updateError){ toast('⚠️ تم حذف الدفعة لكن فشل تحديث إجمالي المدفوع، يرجى تحديث الصفحة', true); refetchFees(); fetchGrandSummary(); return; }
        toast('🗑 تم حذف الدفعة');
        logActivity(db, 'حذف دفعة', {
            entity_type: 'fee', entity_id: fee.id, details: fee.client_name || null,
            client_name: fee.client_name || null,
            case_name: cases.find((c) => c.id === fee.case_id)?.title || null,
            case_type: cases.find((c) => c.id === fee.case_id)?.type || null,
            changes: buildDeleteSnapshot(deletedPayment as unknown as Record<string, unknown>, {
                amount: { label: 'المبلغ', format: (v) => fmt(v as number) },
                payment_date: { label: 'تاريخ الدفعة', format: (v) => fmtDate(v as string) },
            }),
        });
        // 🔒 FIX (26 يوليو 2026 — نفس مشكلة handleAddPayment): تحديث محلي
        // للسجل بدل fetchFees الكاملة اللي ممكن تشيله من fees[] لو الفلتر
        // مش مطابق لحالته الجديدة وتسحب معاها مودال التفاصيل المفتوح.
        setFees((prev) => prev.map((f) => (f.id === fee.id ? { ...f, paid_fees: realPaid, status: newStatus } : f)));
        setPayments((prev) => ({ ...prev, [fee.id]: (prev[fee.id] || []).filter((p) => p.id !== payId) }));
        fetchGrandSummary();
        fetchStatusCounts();
    };

    // ─ حذف سجل أتعاب نهائيًا من قاعدة البيانات (مرحلة 2 — مكتمل، مفيش كود إضافي مطلوب) ─
    // ⚠️ القرار المحسوم فى الخطة (18 يوليو 2026): حذف أتعاب نهائيًا يحذف سجل
    // الأتعاب فقط، وميحذفش قضية ولا موكل. الـ FK الحقيقية بتغطي الباقي تلقائيًا:
    //   - fee_payments.fee_id → CASCADE (الدفعات جزء من سجل الأتعاب نفسه، منطقي تتحذف معاه)
    //   - invoices.fee_payment_id/case_id/client_id → SET NULL (الفواتير تفضل موجودة بسجلها كامل)
    // يعني الدالة دي مش محتاجة أي كاسكيد يدوي.
    const handlePermanentDeleteFee = async (id: string) => {
        const targetFee = fees.find((f) => f.id === id);
        const { error, offline, queued } = await window.__dbWrite({ type: 'DELETE', table: 'case_fees', id });
        if (offline && queued) { toast('📥 الحذف محفوظ محلياً — سيُزامن عند عودة الإنترنت'); return; }
        if (error) { toast('❌ فشل حذف الأتعاب نهائياً — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('🗑️ تم حذف الأتعاب نهائياً');
        logActivity(db, 'حذف أتعاب نهائياً', {
            entity_type: 'fee', entity_id: id,
            client_name: targetFee?.client_name || null,
            case_name: cases.find((c) => c.id === targetFee?.case_id)?.title || null,
            case_type: cases.find((c) => c.id === targetFee?.case_id)?.type || null,
            changes: buildDeleteSnapshot(targetFee as unknown as Record<string, unknown>, {
                total_fees: { label: 'إجمالي الأتعاب', format: (v) => fmt(v as number) },
                paid_fees: { label: 'المدفوع', format: (v) => fmt(v as number) },
            }),
        });
        refetchFees();
        fetchGrandSummary();
        fetchStatusCounts();
    };

    // ─ أرشفة سجل أتعاب (بدل حذف نهائي — البند 8 من قائمة الإجراءات) ─
    const handleDelete = async (id: string) => {
        const targetFee = fees.find((f) => f.id === id);
        const { error: feeError, offline, queued } = await window.__dbWrite({
            type: 'UPDATE', table: 'case_fees', data: { deleted_at: new Date().toISOString() }, id
        });
        if (offline && queued) { toast('📥 الأرشفة محفوظة محلياً — ستُزامن عند عودة الإنترنت'); return; }
        if(feeError){ toast('❌ فشل أرشفة الأتعاب — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('📦 تم نقل الأتعاب للأرشيف');
        logActivity(db, 'أرشفة أتعاب', {
            entity_type: 'fee', entity_id: id,
            client_name: targetFee?.client_name || null,
            case_name: cases.find((c) => c.id === targetFee?.case_id)?.title || null,
            case_type: cases.find((c) => c.id === targetFee?.case_id)?.type || null,
        });
        refetchFees();
        fetchGrandSummary();
        fetchStatusCounts();
    };

    // ─ استرجاع أتعاب من الأرشيف ─
    const handleRestoreFee = async (id: string) => {
        const { error, offline, queued } = await window.__dbWrite({ type: 'UPDATE', table: 'case_fees', data: { deleted_at: null }, id });
        if (offline && queued) { toast('📥 الاسترجاع محفوظ محلياً — سيُزامن عند عودة الإنترنت'); return; }
        if (error) { toast('❌ فشل استرجاع الأتعاب — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('✅ تم استرجاع الأتعاب');
        logActivity(db, 'استرجاع أتعاب من الأرشيف', { entity_type: 'fee', entity_id: id });
        refetchFees();
        fetchGrandSummary();
        fetchStatusCounts();
    };

    const fmt = (n: number | string | null | undefined) => n!=null ? formatArNumber(Number(n),{maximumFractionDigits:0}) : '0';
    const fmtDate = (d: string | null | undefined) => d ? formatArDate(d,{year:'numeric',month:'short',day:'numeric'}) : '';

    // getFeeCategory تفيد في عرض الكارد بس (مش للتصنيف في DB)
    const getFeeCategory = (fee: CaseFeeRow) => {
        const total = fee.total_fees || 0;
        const paid  = fee.paid_fees  || 0;
        if (total <= 0) return 'open';
        if (paid >= total) return 'collected';
        return 'deferred';
    };

    // 🔀 FIX (دمج تابي "مؤجلة" و"مفتوحة" — 20 أغسطس 2026): تابين بدل تلاتة.
    // "pending" بيغطي حالتي deferred+open معًا (راجع fetchFees فوق) — الفرق
    // بينهم (اتفقنا على المبلغ ولا لسه) بقى معروض كشارة على كل كارت في
    // FeeCard.tsx بدل تاب منفصل، فمفيش فقد للمعلومة، بس أقل ضجة بصريًا.
    const feesSections = [
        {
            key: 'pending' as const,
            label: 'غير محصّلة',
            emoji: '⏳',
            desc: 'متفق عليها أو لسه محتاجة تحديد',
            activeBg: 'bg-amber-500/20 border-amber-500/40',
            activeText: 'text-amber-300',
            countActiveBg: 'bg-amber-500/30 text-amber-200',
        },
        {
            key: 'collected' as const,
            label: 'محصّلة',
            emoji: '✅',
            desc: 'أرباحك الفعلية',
            activeBg: 'bg-emerald-500/20 border-emerald-500/40',
            activeText: 'text-emerald-300',
            countActiveBg: 'bg-emerald-500/30 text-emerald-200',
        },
    ];

    const totalAll  = fees.reduce((s, f) => s+(f.total_fees||0), 0);
    const paidAll   = fees.reduce((s, f) => s+(f.paid_fees||0), 0);
    const remaining = totalAll - paidAll;

    const filteredFees = fees;
    const feesAfterCategoryFilter = fees;

    const grandTotal     = grandTotalAll;
    const grandPaid      = grandPaidAll;
    const grandRemaining = grandTotalAll - grandPaidAll;

  return {
    fees, setFees, payments, setPayments, expandedPayments, setExpandedPayments,
    loading, showForm, setShowForm, form, setForm, saving, editId, setEditId,
    addPaymentFor, setAddPaymentFor, payingFeeId, payAmount, setPayAmount, payDate, setPayDate,
    payNote, setPayNote, confirmDeletePay, setConfirmDeletePay,
    confirmDeleteFee, setConfirmDeleteFee, invoiceModal, setInvoiceModal,
    payReceiver, setPayReceiver, payClientName, setPayClientName,
    payClientNameText, setPayClientNameText, feesSearch, setFeesSearch,
    feesFilter, setFeesFilter,

    // pagination
    feesPage, feesTotal, feesMore,
    fetchFees, fetchFeesForCase, handleFilterChange, handleSearch,

    handleSave, handleAddPayment, handleDeletePayment, handleDelete, handlePermanentDeleteFee, handleRestoreFee,

    getFeeCategory,
    feesSections,
    feesAfterCategoryFilter,
    filteredFees,

    totalAll, paidAll, remaining,
    grandTotal, grandPaid, grandRemaining, loadingSummary, fetchGrandSummary,
    statusCounts, fetchStatusCounts,
    fmt, fmtDate,
  };
}
