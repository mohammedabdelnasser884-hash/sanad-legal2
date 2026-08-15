import { useState, useCallback, useEffect } from 'react';
import { db } from '../../../../supabaseClient';
import { createFetchGuard } from '../../../../shared/lib/offlineGuard';
import { recordError, recordSuccess } from '../../../../systemHealth';
import { toast } from '../../../../shared/lib/notifications';
import { MONTHS_AR } from '../../../../shared/ui/arabicLocale';
import type { ProfileRow } from '../../../../types';

// ─────────────────────────────────────────────────────────
//  useAdminStats — قسم "الإحصائيات" في لوحة الإدارة (13 أغسطس 2026).
//
//  عدد القضايا/الموكلين بييجوا جاهزين من App.tsx (casesTotal/clientsTotal —
//  نفس الأرقام المعروضة فوق تابات القضايا/الموكلين، مفيش داعي نكررهم هنا).
//  الملخص المالي (إجمالي/محصّل) مختلف: محتاج مجموع كل صفوف case_fees في
//  القاعدة (مش بس الصفحة المحمّلة)، فمنطقه منسوخ عمدًا من
//  fetchGrandSummary في useFeesActions.ts (نفس الاستعلام ونفس نمط
//  offline guard) — بدل ما نجيب useFeesActions كامل (هوك تقيل مربوط
//  بمنطق إضافة/تعديل/حذف الأتعاب بالكامل) لمجرد رقمين هنا.
// ─────────────────────────────────────────────────────────
const ADMIN_STATS_SUMMARY_CACHE_KEY = 'sanad_cached_admin_stats_summary_v1';
const ADMIN_STATS_TREND_CACHE_KEY   = 'sanad_cached_admin_stats_trend_v1';
const ADMIN_STATS_OPS_CACHE_KEY     = 'sanad_cached_admin_stats_ops_v1';
const ADMIN_STATS_CASE_STATUS_CACHE_KEY = 'sanad_cached_admin_stats_case_status_v1';
const TREND_MONTHS = 6;
const CASE_STATUSES = ['نشطة', 'مؤجلة', 'منتهية'] as const;

// ملاحظة تصميم مقصودة (مش خلط عشوائي بين مصدرين):
// - grandTotal/grandPaid (الرقم الكلي كل الوقت) بييجوا من case_fees.total_fees/paid_fees
//   بالضبط زي fetchGrandSummary في useFeesActions.ts، عشان يفضلوا مطابقين
//   لنفس الرقم المعروض في تاب "الأتعاب" — paid_fees ده بيتزامن مع فعليًا مع
//   fee_payments عند كل إضافة/حذف دفعة (شوف useFeesActions.ts).
// - monthlyTrend.paid (المحصّل شهر بشهر) لازم يجي من fee_payments.payment_date
//   لأن case_fees مفيهوش تاريخ لكل دفعة، بس إجمالي تراكمي. علشان كده
//   الاتنين مش بيستخدموا نفس الجدول — مش تضارب، كل واحد بيجاوب سؤال مختلف
//   (إجمالي محصّل كام؟ / في الشهر ده اتحصّل كام؟) ومفيش جدول واحد يجاوب
//   عليهم الاتنين. اتوضّح ده في الواجهة بدل ما نغيّر المصدر.

export interface CaseStatusBreakdown {
    active: number;   // نشطة
    deferred: number; // مؤجلة
    closed: number;   // منتهية
    other: number;    // status=null أو قيمة خارج الـ3 المعروفين — عشان الأرقام متتوهش
}

export interface MonthlyTrendPoint {
    key: string;   // 'YYYY-MM' — للمقارنة/الفرز فقط
    label: string; // 'أغسطس' — للعرض
    total: number; // إجمالي الأتعاب المستحقة (case_fees.total_fees) اللي اتسجلت الشهر ده
    paid: number;  // إجمالي المحصّل فعليًا (fee_payments.amount) الشهر ده
}

// بيبني هيكل الـ6 شهور فاضي (بالترتيب من الأقدم للأحدث) عشان الشهور اللي
// مفيهاش أي بيانات تظهر في الرسم بقيمة صفر بدل ما تختفي تمامًا.
function buildEmptyMonths(count: number): MonthlyTrendPoint[] {
    const out: MonthlyTrendPoint[] = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        out.push({ key, label: MONTHS_AR[d.getMonth()], total: 0, paid: 0 });
    }
    return out;
}

function saveCache<T>(key: string, tenantId: string | null | undefined, data: T) {
    try { localStorage.setItem(key, JSON.stringify({ tenantId: tenantId ?? null, data, savedAt: Date.now() })); } catch { /* localStorage غير متاح — تجاهل */ }
}
function loadCache<T>(key: string, tenantId: string | null | undefined): { data: T; savedAt: number } | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { tenantId: string | null; data: T; savedAt?: number };
        if (parsed.tenantId !== (tenantId ?? null)) return null;
        return { data: parsed.data, savedAt: parsed.savedAt || 0 };
    } catch { return null; }
}

export function useAdminStats(profile: ProfileRow | null, casesTotal: number = 0) {
    const [grandTotal, setGrandTotal]         = useState(0);
    const [grandPaid, setGrandPaid]           = useState(0);
    const [loadingFeesStats, setLoadingFeesStats] = useState(false);
    const [monthlyTrend, setMonthlyTrend]     = useState<MonthlyTrendPoint[]>(() => buildEmptyMonths(TREND_MONTHS));
    const [sessionsThisWeek, setSessionsThisWeek]   = useState(0);
    const [overdueReminders, setOverdueReminders]   = useState(0);
    const [overdueSessions, setOverdueSessions]     = useState(0);
    const [caseStatusBreakdown, setCaseStatusBreakdown] = useState<CaseStatusBreakdown>({ active: 0, deferred: 0, closed: 0, other: 0 });
    // آخر وقت اتحدّثت فيه البيانات فعليًا (سواء من السيرفر أو من الكاش
    // وقت الأوف لاين) — بيتعرض للمستخدم عشان يعرف الأرقام دي جديدة قد إيه.
    const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
    const [isStale, setIsStale] = useState(false);

    const grandRemaining = grandTotal - grandPaid;
    const collectedRate  = grandTotal > 0 ? Math.round((grandPaid / grandTotal) * 100) : 0;

    const fetchStatsSummary = useCallback(async () => {
        if (!profile) return;
        setLoadingFeesStats(true);
        const guard = createFetchGuard();
        if (guard.offline) {
            recordError('db_admin_stats', 'offline');
            const cached = loadCache<{ total: number; paid: number }>(ADMIN_STATS_SUMMARY_CACHE_KEY, profile.tenant_id);
            if (cached) {
                setGrandTotal(cached.data.total); setGrandPaid(cached.data.paid);
                setLastUpdatedAt(cached.savedAt); setIsStale(true);
                toast('أنت أوف لاين — بتشوف آخر نسخة محفوظة من إحصائيات الأتعاب');
            }
            const cachedTrend = loadCache<MonthlyTrendPoint[]>(ADMIN_STATS_TREND_CACHE_KEY, profile.tenant_id);
            if (cachedTrend) setMonthlyTrend(cachedTrend.data);
            const cachedOps = loadCache<{ sessionsThisWeek: number; overdueReminders: number; overdueSessions: number }>(ADMIN_STATS_OPS_CACHE_KEY, profile.tenant_id);
            if (cachedOps) { setSessionsThisWeek(cachedOps.data.sessionsThisWeek); setOverdueReminders(cachedOps.data.overdueReminders); setOverdueSessions(cachedOps.data.overdueSessions ?? 0); }
            const cachedStatus = loadCache<CaseStatusBreakdown>(ADMIN_STATS_CASE_STATUS_CACHE_KEY, profile.tenant_id);
            if (cachedStatus) setCaseStatusBreakdown(cachedStatus.data);
            setLoadingFeesStats(false);
            return;
        }
        try {
            const { data, error } = await db.from('case_fees').select('total_fees,paid_fees').is('deleted_at', null).abortSignal(guard.controller.signal);
            if (error) throw error;
            const t = (data || []).reduce((s: number, f: { total_fees: number | null }) => s + (f.total_fees || 0), 0);
            const p = (data || []).reduce((s: number, f: { paid_fees: number | null }) => s + (f.paid_fees  || 0), 0);
            setGrandTotal(t);
            setGrandPaid(p);
            saveCache(ADMIN_STATS_SUMMARY_CACHE_KEY, profile.tenant_id, { total: t, paid: p });
            recordSuccess('db_admin_stats');

            // ── الرسم البياني: مستحق/محصّل شهريًا آخر 6 شهور ──
            // total: مجموع case_fees.total_fees حسب شهر created_at (شهر تسجيل
            // سجل الأتعاب). paid: مجموع fee_payments.amount حسب شهر الدفعة
            // الفعلية (payment_date) — من جدول الدفعات نفسه (مش paid_fees
            // التراكمي في case_fees) عشان نعرف الشهر ده بالذات اتحصّل فيه قد إيه.
            const months = buildEmptyMonths(TREND_MONTHS);
            const sinceDate = new Date(); sinceDate.setDate(1); sinceDate.setMonth(sinceDate.getMonth() - (TREND_MONTHS - 1));
            const sinceISO = sinceDate.toISOString().slice(0, 10);
            const monthKeyOf = (iso: string) => iso.slice(0, 7);

            // ── إحصائيات تشغيلية: جلسات الأسبوع الجاي + جلسات متأخرة + تذكيرات متأخرة ──
            const todayISO = new Date().toISOString().slice(0, 10);
            const weekAheadISO = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

            const [feesRes, paymentsRes, sessionsRes, remindersRes, caseStatusRes, futureSessCasesRes, pastSessCasesRes] = await Promise.all([
                db.from('case_fees').select('total_fees,created_at').is('deleted_at', null).gte('created_at', sinceISO).abortSignal(guard.controller.signal),
                db.from('fee_payments').select('amount,payment_date').gte('payment_date', sinceISO).abortSignal(guard.controller.signal),
                db.from('case_sessions').select('id', { count: 'exact', head: true }).gte('session_date', todayISO).lte('session_date', weekAheadISO).abortSignal(guard.controller.signal),
                db.from('reminders').select('id', { count: 'exact', head: true }).eq('done', false).lt('due_date', todayISO).abortSignal(guard.controller.signal),
                // استعلام واحد بس لعمود status (مش 4 عدّادات منفصلة) — عشان
                // active/deferred/closed تيجي من نفس اللقطة (snapshot) بالضبط،
                // من غير خطر إن قضية تتغيّر حالتها بين استعلام وتاني وتُخرّب
                // "other" (كان بيتحسب بالفرق ولو حصل ديسينك كان بيتغطى بـ
                // Math.max(0,...) من غير ما يبان إن في مشكلة).
                db.from('cases').select('status').is('deleted_at', null).abortSignal(guard.controller.signal),
                // ── جلسات متأخرة: نفس تعريف "جلسة فائتة" المستخدم في
                // useDashboardFeed.ts بالضبط (قضية مفيهاش جلسة مستقبلية +
                // آخر جلسة فائتة ليها) — عشان الرقم هنا يتطابق مع لوحة
                // التحكم الرئيسية، مش تعريف تاني مستقل. بنجيب case_id بس
                // (مش كل بيانات الجلسة) لأننا محتاجين العدد بس هنا.
                db.from('case_sessions').select('case_id').gte('session_date', todayISO).abortSignal(guard.controller.signal),
                db.from('case_sessions').select('case_id').lt('session_date', todayISO).abortSignal(guard.controller.signal),
            ]);
            if (feesRes.error) throw feesRes.error;
            if (paymentsRes.error) throw paymentsRes.error;
            if (sessionsRes.error) throw sessionsRes.error;
            if (remindersRes.error) throw remindersRes.error;
            if (caseStatusRes.error) throw caseStatusRes.error;
            if (futureSessCasesRes.error) throw futureSessCasesRes.error;
            if (pastSessCasesRes.error) throw pastSessCasesRes.error;

            const byKey = new Map(months.map((m) => [m.key, m]));
            for (const f of (feesRes.data || []) as { total_fees: number | null; created_at: string | null }[]) {
                if (!f.created_at) continue;
                const bucket = byKey.get(monthKeyOf(f.created_at));
                if (bucket) bucket.total += f.total_fees || 0;
            }
            for (const p2 of (paymentsRes.data || []) as { amount: number | null; payment_date: string | null }[]) {
                if (!p2.payment_date) continue;
                const bucket = byKey.get(monthKeyOf(p2.payment_date));
                if (bucket) bucket.paid += p2.amount || 0;
            }
            setMonthlyTrend(months);
            saveCache(ADMIN_STATS_TREND_CACHE_KEY, profile.tenant_id, months);

            const sessionsCount  = sessionsRes.count  ?? 0;
            const remindersCount = remindersRes.count ?? 0;
            const futureCaseIds = new Set((futureSessCasesRes.data || []).map((s: { case_id: string | null }) => s.case_id));
            const overdueCaseIds = new Set(
                (pastSessCasesRes.data || [])
                    .map((s: { case_id: string | null }) => s.case_id)
                    .filter((caseId: string | null) => !futureCaseIds.has(caseId))
            );
            const overdueSessionsCount = overdueCaseIds.size;
            setSessionsThisWeek(sessionsCount);
            setOverdueReminders(remindersCount);
            setOverdueSessions(overdueSessionsCount);
            saveCache(ADMIN_STATS_OPS_CACHE_KEY, profile.tenant_id, { sessionsThisWeek: sessionsCount, overdueReminders: remindersCount, overdueSessions: overdueSessionsCount });

            // ── تقسيم القضايا حسب الحالة ──
            // الإجمالي بييجي من casesTotal (نفس رقم بطاقة "عدد القضايا" في
            // نفس الشاشة وفوق تاب القضايا) — مصدر واحد للرقم الكلي في كل
            // الشاشة، مش استعلام تاني يجيب رقم إجمالي مستقل. "other" بيغطي
            // قضايا status=null (سجلات قديمة) أو أي قيمة خارج الـ3 المعروفين.
            const active   = (caseStatusRes.data || []).filter((c: { status: string | null }) => c.status === CASE_STATUSES[0]).length;
            const deferred = (caseStatusRes.data || []).filter((c: { status: string | null }) => c.status === CASE_STATUSES[1]).length;
            const closed   = (caseStatusRes.data || []).filter((c: { status: string | null }) => c.status === CASE_STATUSES[2]).length;
            const other    = Math.max(0, casesTotal - active - deferred - closed);
            const breakdown: CaseStatusBreakdown = { active, deferred, closed, other };
            setCaseStatusBreakdown(breakdown);
            saveCache(ADMIN_STATS_CASE_STATUS_CACHE_KEY, profile.tenant_id, breakdown);

            setLastUpdatedAt(Date.now());
            setIsStale(false);
        } catch (err) {
            const msg = guard.didTimeOut() ? 'timeout' : (err as { message?: string })?.message || 'fetch failed';
            recordError('db_admin_stats', msg);
            const cached = loadCache<{ total: number; paid: number }>(ADMIN_STATS_SUMMARY_CACHE_KEY, profile.tenant_id);
            if (cached) { setGrandTotal(cached.data.total); setGrandPaid(cached.data.paid); setLastUpdatedAt(cached.savedAt); setIsStale(true); }
            const cachedTrend = loadCache<MonthlyTrendPoint[]>(ADMIN_STATS_TREND_CACHE_KEY, profile.tenant_id);
            if (cachedTrend) setMonthlyTrend(cachedTrend.data);
            const cachedOps = loadCache<{ sessionsThisWeek: number; overdueReminders: number; overdueSessions: number }>(ADMIN_STATS_OPS_CACHE_KEY, profile.tenant_id);
            if (cachedOps) { setSessionsThisWeek(cachedOps.data.sessionsThisWeek); setOverdueReminders(cachedOps.data.overdueReminders); setOverdueSessions(cachedOps.data.overdueSessions ?? 0); }
            const cachedStatus = loadCache<CaseStatusBreakdown>(ADMIN_STATS_CASE_STATUS_CACHE_KEY, profile.tenant_id);
            if (cachedStatus) setCaseStatusBreakdown(cachedStatus.data);
        } finally {
            guard.cleanup();
            setLoadingFeesStats(false);
        }
    }, [profile, casesTotal]);

    return {
        grandTotal, grandPaid, grandRemaining, collectedRate, loadingFeesStats, monthlyTrend,
        sessionsThisWeek, overdueReminders, overdueSessions, caseStatusBreakdown, lastUpdatedAt, isStale, fetchStatsSummary,
    };
}
