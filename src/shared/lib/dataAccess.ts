// القفل التفاؤلي (safeUpdate) وتسجيل النشاط (logActivity) وكشف نوع الجهاز
import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import type { Database } from '../../database.types';
import { toast } from './notifications';
import { getCurrentTenantId } from '../../constants';

// ══════════════════════════════════════════════════════════════
//  safeUpdate — Optimistic Locking
//  بيتحقق إن السجل مش اتعدل من حد تاني قبل ما يكتب
// ══════════════════════════════════════════════════════════════
/**
 * @param db         - Supabase client
 * @param table      - اسم الجدول
 * @param id         - id السجل
 * @param data       - البيانات الجديدة
 * @param knownUpdatedAt - قيمة updated_at اللي أنت شايفها (جبتها مع السجل)
 *
 * @returns { success, conflict, error }
 *   success  = true  → اتحفظ تمام
 *   conflict = true  → حد تاني عدّل السجل ده قبلك
 *   error           → خطأ من Supabase
 */
// ── تحديد نوع الجهاز من User-Agent string ──
export function detectDevice(ua: string): string {
    if (!ua) return 'جهاز غير معروف 💻';
    const u = ua.toLowerCase();
    if (u.includes('iphone') || u.includes('android') || u.includes('mobile')) return 'هاتف محمول 📱';
    if (u.includes('ipad') || u.includes('tablet')) return 'تابلت 📲';
    if (u.includes('mac'))     return 'Mac 💻';
    if (u.includes('windows')) return 'Windows 🖥';
    if (u.includes('linux'))   return 'Linux 🐧';
    return 'جهاز غير معروف 💻';
}

// ⚠️ الجداول الحقيقية الوحيدة اللي بتتنادى بيها safeUpdate فعليًا في المشروع
// (اتحقق من كل نداء في SessionUpdateModal.tsx/RemindersTab.tsx/
// StandaloneSessionDetailModal.tsx/useFeesActions.ts/useClientActions.ts/
// useCaseDetailActions.ts) — كلها عندها عمود updated_at حقيقي في database.types.ts.
// لو جدول جديد يتضاف مستقبلاً لاستخدام safeUpdate، يتضاف هنا كعضو جديد
// في الـ union بدل ما يترجع الباب مفتوح لـ `as any`.
export type SafeUpdateTable =
    | 'cases' | 'case_sessions' | 'case_fees' | 'case_notes' | 'clients' | 'reminders';

export async function safeUpdate<T extends SafeUpdateTable>(
    db: SupabaseClient<Database>,
    table: T,
    id: string | number,
    data: Database['public']['Tables'][T]['Update'],
    knownUpdatedAt: string | null
): Promise<{ success: boolean; conflict: boolean; error: PostgrestError | null }> {

    // table بقى الآن Generic مقيّد بـ SafeUpdateTable (union حقيقي من أسماء
    // الجداول)، و data بقى مطابق لنوع Update الحقيقي بتاع الجدول المحدد —
    // مفيش `as any` هنا خالص.
    //
    // ⚠️ قيد معروف في supabase-js + TypeScript: تسلسل .update()/.select() ثم
    // .eq() على db.from(table) لما `table` يكون Generic type parameter (T
    // extends SafeUpdateTable) بدل literal ثابت بيخلي المكتبة تحاول تحل
    // النوع على مستوى الـ schema كله بدل الستة جداول المسموحة بس، فبترجع
    // أخطاء ضخمة وقت البناء (نفس المشكلة بالظبط في main.tsx مع __dbWrite —
    // راجع تعليق dbFrom هناك لتفاصيل أوسع). الحل: نأكد لـ TypeScript إن
    // الجدول واحد من الستة المعروفين فعلاً (بنستخدم 'cases' كممثل — عنده
    // نفس أعمدة id/updated_at المشتركة بين كل جداول SafeUpdateTable) وقت
    // بناء الـ query builder بس. التحقق الحقيقي من اسم الجدول لسه قائم عن
    // طريق `table: T extends SafeUpdateTable` في توقيع الدالة.
    const dbFrom = () => db.from(table as unknown as 'cases');

    // لو مفيش updated_at محفوظ — نعمل UPDATE عادي بدون check (للبيانات القديمة)
    if (!knownUpdatedAt) {
        const { error } = await dbFrom().update(data as unknown as Database['public']['Tables']['cases']['Update']).eq('id', id as string);
        return { success: !error, conflict: false, error };
    }

    // 1. اتحقق إن updated_at مش اتغير من لما جبت السجل
    const { data: current, error: fetchErr } = await dbFrom()
        .select('updated_at')
        .eq('id', id as string)
        .single();

    if (fetchErr) {
        return { success: false, conflict: false, error: fetchErr };
    }

    // 2. قارن الـ timestamps — كل جداول SafeUpdateTable عندها updated_at حقيقي وقت التشغيل.
    const serverTime  = new Date(current.updated_at as string).getTime();
    const clientTime  = new Date(knownUpdatedAt).getTime();

    if (serverTime > clientTime) {
        // 💥 Conflict — حد تاني عدّل السجل ده
        toast('⚠️ هذا السجل عدّله شخص آخر — يُرجى فتحه من جديد', true);
        return { success: false, conflict: true, error: null };
    }

    // 3. آمن — نكتب
    const { error } = await dbFrom().update(data as unknown as Database['public']['Tables']['cases']['Update']).eq('id', id as string);
    return { success: !error, conflict: false, error };
}

// ══════════════════════════════════════════════════════════════
//  buildFieldDiff — مقارنة كائن قديم/جديد وبناء قايمة التغييرات
//  اللي فعلاً حصلت، جاهزة للتخزين في عمود changes (JSONB) وللعرض
//  في سجل النشاط كـ "من ← إلى".
//
//  ⚠️ لازم تتنادى بالكائن القديم *قبل* أي كتابة في الداتابيز
//  (مش بعد refetch)، وإلا القيمة "القديمة" هتبقى هي الجديدة نفسها.
//
//  @param oldObj - الكائن قبل التعديل (مثلاً existingCaseRecord)
//  @param newObj - الكائن بعد التعديل (مثلاً form)
//  @param fields - خريطة الحقول المطلوب مقارنتها فقط، مع label
//                  عربي للعرض و format اختياري (مثلاً client_id → اسم الموكل)
//  @returns فقط الحقول اللي فعلاً القيمة القديمة ≠ الجديدة
// ══════════════════════════════════════════════════════════════
export interface FieldDiffMap {
    [field: string]: { label: string; format?: (v: unknown) => string };
}

export interface FieldDiffEntry {
    field: string;
    label: string;
    old: string;
    new: string;
}

// تطبيع القيمة لمقارنة نصية — عشان '' و null و undefined ميتحسبوش تغيير كاذب
function normalizeForDiff(v: unknown, format?: (v: unknown) => string): string {
    if (v === null || v === undefined || v === '') return '';
    return format ? format(v) : String(v);
}

export function buildFieldDiff(
    oldObj: Record<string, unknown> | null | undefined,
    newObj: Record<string, unknown> | null | undefined,
    fields: FieldDiffMap
): FieldDiffEntry[] {
    const result: FieldDiffEntry[] = [];
    if (!oldObj || !newObj) return result;

    for (const field of Object.keys(fields)) {
        const { label, format } = fields[field];
        const oldRaw = oldObj[field];
        const newRaw = newObj[field];
        const oldText = normalizeForDiff(oldRaw, format);
        const newText = normalizeForDiff(newRaw, format);

        if (oldText === newText) continue; // مفيش تغيير فعلي

        result.push({ field, label, old: oldText, new: newText });
    }

    return result;
}

// ══════════════════════════════════════════════════════════════
//  buildDeleteSnapshot / buildAddSnapshot
//  ⚡ NEW (سجل النشاط — تغطية كاملة للحذف/الإضافة، 30 أغسطس 2026):
//  buildFieldDiff بتقارن قديم بجديد وقت التعديل، لكن وقت الحذف مفيش
//  "جديد"، ووقت الإضافة مفيش "قديم". الدالتين دول بيستخدموا نفس شكل
//  FieldDiffEntry (وبالتالي نفس عرض "من ← إلى" الجاهز في ActivitySection)
//  لكن بمعنى مختلف:
//    - buildDeleteSnapshot: old = القيمة قبل الحذف، new = "🗑️ محذوف"
//      (بيحفظ آخر صورة من السجل المهم قبل ما يتشال نهائيًا)
//    - buildAddSnapshot: old = "—"، new = القيمة اللي اتدخلت
//      (بيوثّق كل الحقول اللي دخلها المستخدم وقت الإضافة)
//  زي buildFieldDiff بالظبط، لازم تتنادى بالسجل *قبل* عملية DELETE
//  الفعلية (أو بعد الإدراج في حالة الإضافة، بنفس الكائن اللي اتبعت للـ insert).
// ══════════════════════════════════════════════════════════════
const DELETED_MARK = '🗑️ محذوف';

export function buildDeleteSnapshot(
    record: Record<string, unknown> | null | undefined,
    fields: FieldDiffMap
): FieldDiffEntry[] {
    const result: FieldDiffEntry[] = [];
    if (!record) return result;
    for (const field of Object.keys(fields)) {
        const { label, format } = fields[field];
        const text = normalizeForDiff(record[field], format);
        if (!text) continue; // مفيش قيمة أصلاً — مفيش داعي نسجلها
        result.push({ field, label, old: text, new: DELETED_MARK });
    }
    return result;
}

export function buildAddSnapshot(
    record: Record<string, unknown> | null | undefined,
    fields: FieldDiffMap
): FieldDiffEntry[] {
    const result: FieldDiffEntry[] = [];
    if (!record) return result;
    for (const field of Object.keys(fields)) {
        const { label, format } = fields[field];
        const text = normalizeForDiff(record[field], format);
        if (!text) continue;
        result.push({ field, label, old: '—', new: text });
    }
    return result;
}

// ══════════════════════════════════════════════════════════════
//  logActivity — تسجيل نشاط في activity_log (لوحة الإدارة)
//  ⚠️ مصممة عشان متعطلش أي عملية أساسية:
//  - لو المستخدم مش عامل لوجين (نادرًا) → بترجع بصمت
//  - لو فشل الكتابة في activity_log لأي سبب (الجدول لسه متعمل،
//    مشكلة شبكة، RLS...) → بتعمل console.error بس وما بترميش error
//  - بتُستخدم بدون await في الأماكن اللي بتنادي عليها (fire-and-forget)
//    عشان تسجيل النشاط ما يأخرش استجابة الشاشة للمستخدم.
//
//  @param db          - Supabase client (نفس النمط المستخدم في safeUpdate)
//  @param action      - وصف الإجراء بالعربي، مثلاً 'إضافة قضية'
//  @param opts.details      - تفاصيل إضافية (اسم القضية/الموكل...)
//  @param opts.entity_type  - 'case' | 'client' | 'user' | 'portal' | 'fee' | 'session' | 'note' | 'document'
//  @param opts.entity_id    - id السجل المرتبط (لو موجود)
//  @param opts.userName     - اسم المستخدم المنفِّذ — لو اتبعت من profile يُستخدم مباشرةً
//                             ويُوفَّر query على جدول profiles لكل استدعاء (N+1 fix)
//  @param opts.client_name  - اسم الموكل المرتبط (لعرضه كشارة في لوحة الإدارة)
//  @param opts.case_name    - عنوان/اسم القضية المرتبطة (لعرضها كشارة)
//  @param opts.case_type    - نوع القضية المرتبطة (لعرضه كشارة)
//  @param opts.changes      - قايمة الحقول اللي اتغيرت فعليًا (من buildFieldDiff)،
//                             بتتخزن في عمود changes (JSONB) وتتعرض كـ "من ← إلى"
// ══════════════════════════════════════════════════════════════
export async function logActivity(
    db: SupabaseClient<Database>,
    action: string,
    opts?: {
        details?: string | null;
        entity_type?: string | null;
        entity_id?: string | null;
        userName?: string | null;
        client_name?: string | null;
        case_name?: string | null;
        case_type?: string | null;
        changes?: FieldDiffEntry[] | null;
    }
): Promise<void> {
    try {
        const { data: sessionData } = await db.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) return;

        // لو المستدعي بعت userName جاهز (من profile state) نستخدمه مباشرةً
        // ونوفّر query إضافي على profiles في كل استدعاء
        let userName: string | null = opts?.userName ?? null;
        // ══════════════════════════════════════════════════════════
        //  🔴 FIX (تشخيص "بطء بيزيد مع الوقت" — 8 سبتمبر 2026): الكود
        //  القديم هنا كان بيقول في التعليق فوق "بنوفّر query على profiles"
        //  بس فعليًا بيعمل نداء SELECT جديد على profiles في كل الحالتين
        //  (سواء userName اتبعت ولا لأ) عشان بس يجيب tenant_id. logActivity
        //  بينادى من 74 مكان مختلف في المشروع كله (أي إضافة/تعديل/حذف —
        //  قضية، جلسة، عميل، أتعاب، مستند...) — يعني كل عملية كتابة في
        //  التطبيق كانت بتدفع تكلفة query إضافي كامل على profiles، حتى لو
        //  الـtenant_id بتاع المستخدم الحالي متغيّرش من ساعة ما سجّل دخوله.
        //  القيمة دي أصلًا محفوظة جاهزة في الذاكرة (getCurrentTenantId من
        //  constants.ts، بتتحدّث مرة واحدة بس في useAuthProfile.ts لما
        //  البروفايل يتحمّل) — فبنستخدمها مباشرة، ومنرجعش نسأل قاعدة
        //  البيانات إلا لو (حالة نادرة جدًا) الكاش لسه فاضي.
        // ══════════════════════════════════════════════════════════
        let tenantId: string | null = getCurrentTenantId();
        if (!userName) {
            // fallback: نجيب الاسم من DB (لسه محتاجينه، مفيش كاش له في
            // الذاكرة زي tenant_id) — ولو tenant_id مش متكشوف من الكاش
            // لأي سبب، نجيبه كمان من نفس النداء ده بدل نداء منفصل.
            userName = user.email || null;
            const { data: prof } = await db.from('profiles').select('full_name,tenant_id').eq('user_id', user.id).maybeSingle();
            if (prof?.full_name) userName = prof.full_name;
            if (!tenantId && prof?.tenant_id) tenantId = prof.tenant_id;
        } else if (!tenantId) {
            // حالة نادرة: عندنا userName بس الكاش فاضي (مثلاً logActivity
            // اتنادى قبل ما useAuthProfile يخلّص أول تحميل) — fallback
            // لنداء DB زي الكود القديم بالظبط، بس مرة واحدة بس مش دايمًا.
            const { data: prof } = await db.from('profiles').select('tenant_id').eq('user_id', user.id).maybeSingle();
            if (prof?.tenant_id) tenantId = prof.tenant_id;
        }

        await db.from('activity_log').insert([{
            user_id: user.id,
            user_name: userName,
            tenant_id: tenantId,
            action,
            details: opts?.details ?? null,
            entity_type: opts?.entity_type ?? null,
            entity_id: opts?.entity_id ?? null,
            client_name: opts?.client_name ?? null,
            case_name: opts?.case_name ?? null,
            case_type: opts?.case_type ?? null,
            changes: opts?.changes && opts.changes.length > 0 ? opts.changes : null,
        }]);
    } catch (e) {
        console.error('[activityLog] فشل تسجيل النشاط (تم تجاهله، العملية الأساسية لم تتأثر):', e);
    }
}

// ══════════════════════════════════════════════════════════════
//  recalcNextHearing — إعادة حساب next_hearing لقضية معينة
//  ⚠️ منقولة من useCaseSessions.ts (كانت معرّفة جوه الهوك بس) لمكان
//  مشترك، عشان أي مكان تاني بينشئ/بيربط جلسة بقضية (زي تحويل جلسة
//  مستقلة لقضية في useClientLinking.ts/useSessionLinking.ts) يقدر
//  ينادي نفس المنطق الموحّد بدل ما يكرره بإيده.
//  بتجيب كل جلسات القضية، وتحسب أقرب تاريخ فعلي >= اليوم، وتحدّث
//  next_hearing بيه (أو null لو مفيش جلسات قادمة خالص).
// ══════════════════════════════════════════════════════════════
export async function recalcNextHearing(db: SupabaseClient<Database>, caseId: string): Promise<void> {
    const { data: allSessions } = await db
        .from('case_sessions')
        .select('session_date')
        .eq('case_id', caseId);
    const todayStr = new Date().toISOString().slice(0, 10);
    let nearest: string | null = null;
    (allSessions || []).forEach((s) => {
        if (!s.session_date || s.session_date < todayStr) return;
        if (!nearest || s.session_date < nearest) nearest = s.session_date;
    });
    await db.from('cases').update({ next_hearing: nearest }).eq('id', caseId);
}

// ══════════════════════════════════════════════════════════════
//  fetchMissedSessions — تعريف موحّد لـ"الجلسة الفائتة"
//  ⚠️ خطة "إعادة تصميم إغلاق سلسلة الجلسات"، المرحلة 8 (12 سبتمبر 2026):
//  كان عندنا 3 تعريفات مختلفة فعليًا لنفس المفهوم في 3 أماكن —
//  useDashboardFeed.ts (آخر جلسة في القضية + مفيش جلسة جاية، بغضّ النظر
//  عن result/next_action) مقابل SessionsCalendar.tsx (بادچ العداد)
//  وMissedTab.tsx (أي جلسة فات تاريخها ومفيهاش result/next_action، بغضّ
//  النظر عن وجود جلسة جاية) — وده سبب فعليًا "تعارض عداد 63/14" اللي
//  MissedTab.tsx كان بيصلّح نص المشكلة بتاعته بس (limit) من غير ما يصلّح
//  اختلاف التعريف نفسه.
//  التعريف الموحّد دلوقتي: جلسة فائتة = آخر جلسة مسجّلة في قضيتها (مفيش
//  جلسة جاية مجدولة بعدها) + تاريخها فات + مفيهاش result ولا next_action
//  (محدش رجع حدّثها فعليًا) + القضية نفسها مش "منتهية" (لو اتقفلت بحكم
//  نهائي — مرحلة 6 — مفيش داعي تتحسب فائتة تاني).
//  بيرجع نفس شكل الصف اللي الأماكن التلاتة بتحتاجه فعليًا (نفس أعمدة
//  الـselect القديمة + status جوه cases embed)، وكل مكان يكاستها لنوعه
//  المحلي زي ما بيعمل فعلاً مع نتائج Supabase في باقي الملف (as unknown as X[]).
// ══════════════════════════════════════════════════════════════
export interface MissedSessionCaseEmbed {
    id: string;
    title: string | null;
    court_name: string | null;
    case_type: string | null;
    case_number_official: string | null;
    client_id: string | null;
    status: string | null;
}

export interface MissedSessionRow {
    id: string;
    session_date: string | null;
    session_time: string | null;
    session_floor: string | null;
    session_hall: string | null;
    description: string | null;
    case_id: string | null;
    client_id: string | null;
    result: string | null;
    next_action: string | null;
    title: string | null;
    case_number: string | null;
    court: string | null;
    case_type: string | null;
    circuit_number: string | null;
    cases: MissedSessionCaseEmbed | MissedSessionCaseEmbed[] | null;
}

// نفس أعمدة الـselect المستخدمة فعليًا في الأماكن التلاتة قبل التوحيد،
// بالإضافة لـstatus جوه cases embed (كانت ناقصة في التلاتة أماكن).
export const MISSED_SESSION_SELECT =
    'id,session_date,session_time,session_floor,session_hall,description,case_id,client_id,result,next_action,title,case_number,court,case_type,circuit_number,cases(id,title,court_name,case_type,case_number_official,client_id,status)';

function missedSessionCaseStatus(cases: MissedSessionCaseEmbed | MissedSessionCaseEmbed[] | null): string | null {
    if (!cases) return null;
    return Array.isArray(cases) ? (cases[0]?.status ?? null) : cases.status;
}

/**
 * @param db       - Supabase client
 * @param todayStr - تاريخ اليوم بصيغة YYYY-MM-DD (نفس صيغة fmtDate/toDateStr في الأماكن الثلاثة)
 * @param signal   - AbortSignal اختياري (مرّرها لو الاستدعاء بيستخدم offlineGuard زي MissedTab.tsx/useDashboardFeed.ts)
 * @returns صفوف الجلسات الفائتة (بعد فلترة الشروط الأربعة فوق)، أو error لو الاستعلام فشل
 */
export async function fetchMissedSessions(
    db: SupabaseClient<Database>,
    todayStr: string,
    signal?: AbortSignal
): Promise<{ data: MissedSessionRow[] | null; error: PostgrestError | { message: string } | null }> {
    // ملحوظة: builder Supabase بيتغيّر نوعه بعد .abortSignal()، فبنبنيه في
    // تعبير واحد متسلسل (زي كل استعلامات المشروع) بدل ما نعيد تعيينه لمتغيّر
    // وسيط — تفاديًا لأي تعارض نوع TypeScript مش قادرين نتأكد منه محليًا
    // (مفيش node_modules/tsc في بيئة التنفيذ دي).
    const ctrl = signal ? null : new AbortController();
    const effectiveSignal = signal ?? (ctrl as AbortController).signal;
    const [futureRes, pastRes] = await Promise.all([
        db.from('case_sessions').select('case_id').gte('session_date', todayStr).abortSignal(effectiveSignal),
        db.from('case_sessions').select(MISSED_SESSION_SELECT).lt('session_date', todayStr).order('session_date', { ascending: false }).abortSignal(effectiveSignal),
    ]);
    if (futureRes.error || pastRes.error) {
        return { data: null, error: pastRes.error || futureRes.error };
    }
    const caseIdsWithFuture = new Set((futureRes.data || []).map((s: { case_id: string | null }) => s.case_id));
    const seenCases = new Set<string | null>();
    const missed = ((pastRes.data || []) as unknown as MissedSessionRow[]).filter((s) => {
        if (caseIdsWithFuture.has(s.case_id)) return false;              // فيه جلسة جاية مجدولة لنفس القضية
        if (seenCases.has(s.case_id)) return false;                      // مش آخر جلسة في القضية
        seenCases.add(s.case_id);
        if (s.result?.trim() || s.next_action?.trim()) return false;     // اتحدثت فعليًا (نتيجة أو خطوة تالية)
        if (missedSessionCaseStatus(s.cases) === 'منتهية') return false; // القضية اتقفلت بحكم نهائي
        return true;
    });
    return { data: missed, error: null };
}
