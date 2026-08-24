import { db } from '../supabaseClient';
import type { Database } from '../database.types';
import { showSyncIndicator, hideSyncIndicator, toast } from '../shared/lib/notifications';
import { logActivity, recalcNextHearing } from '../shared/lib/dataAccess';
import { type DbWriteTable, type OfflineQueueItem, dbFrom, stripOfflineSentinels } from './offlineQueue';

// ══════════════════════════════════════════════════════════
//  offlineSync.ts — منطق المزامنة الفعلي (تمبيد FK/id + دورة المزامنة
//  الكاملة نفسها)، اتفصل من offlineQueue.ts بتاريخ 24 أغسطس 2026 عشان
//  يتحمّل بـ import() ديناميكي بس لحظة ما المزامنة فعليًا هتشتغل، مش جزء
//  من الـbundle الرئيسي (~615 سطر نادرة الاستخدام مقارنة بـ__dbWrite اللي
//  بيتنادى في كل كتابة). راجع bundle-security-review-verification-v2-2.md
//  (بند 4) للتفاصيل الكاملة لقرار التقسيم ده.
//
//  ⚠️ ملاحظة تقسيم مهمة: `stripOfflineSentinels` و`dbFrom` **فضلوا** في
//  offlineQueue.ts (مش هنا) رغم إنهم في نفس نطاق الكود الأصلي، لأن
//  __dbWrite (اللي لازم يفضل eager) بيستخدمهم في مسار الكتابة الأونلاين
//  العادي — بيتم استيرادهم هنا من هناك بدل تكرارهم.
// ══════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════
//  🆕 المرحلة 1 (خطة توسيع نظام الأوفلاين) — آلية تمبيد عامة (FK Temp ID)
//  ═══════════════════════════════════════════════════════════
//  الفرق عن `_offlineCaseTempId`/`_offlineCaseTitle` القديمة (لسه شغالة
//  زي ما هي فوق، من غير أي تعديل — الآلية دي إضافية جنبها، مش بديلة عنها):
//  القديمة مبنية خصيصًا لحالة واحدة (جلسة بتستنى قضية، وحقل `case_id` بس).
//  الجديدة عامة: أي عملية (INSERT أو UPDATE) على أي جدول من DbWriteTable
//  ممكن "تشاور" على أي حقل FK بيشاور على سجل لسه في الطابور (مش بس
//  case_id، ومش بس جدول cases).
//
//  الشكل: `_offlineFkTempId` بيتحط جوه `data` (زي أي sentinel تاني في
//  الملف ده) كمصفوفة من المراجع دي، مرجع واحد لكل حقل FK محتاج حل.
export interface OfflineFkTempIdRef {
    /** اسم العمود الحقيقي في الجدول المستهدف (مثلاً 'case_id', 'client_id') */
    field: string;
    /** المعرّف المؤقت (`_offlineTempId`) بتاع السجل المُشار إليه */
    tempId: string;
    /** الجدول اللي السجل المُشار إليه هيتحط فيه */
    table: DbWriteTable;
    /**
     * قيمة احتياطية (اسم/عنوان) تُستخدم للـ fallback النادر لما التمبيد
     * يختفي من الذاكرة (تشغيلة جديدة عدّت قبل ما يتزامن السجل المرجعي).
     * زي `_offlineCaseTitle` القديمة بس هنا عامة لأي جدول مدعوم.
     */
    fallbackNameValue?: string;
}

// العمود المستخدم في البحث الاحتياطي بالاسم لكل جدول مدعوم — نفس فكرة
// البحث بـ `title` في القضايا القديم، بس معمم. الجداول اللي مش هنا (زي
// case_sessions) مفيهاش معنى لبحث بالاسم أصلاً (مفيش عمود "اسم" فريد
// منطقي للبحث عنه)، فبتفضل تعتمد على تطابق التمبيد في نفس التشغيلة بس.
const FK_FALLBACK_NAME_COLUMN: Partial<Record<DbWriteTable, string>> = {
    cases: 'title',
    clients: 'full_name',
};

// مُصدَّرة (exported) عشان تتغطى باختبارات وحدة مباشرة (`dbClient` بيتحقن
// كباراميتر بدل import مباشر لـ db، بنفس نمط `safeUpdate` في dataAccess.ts)
// من غير الحاجة لمحاكاة IndexedDB كاملة.
//
// بترجع:
//  - `shouldRetry: true` لو فيه مرجع واحد على الأقل لسه مش قابل للحل
//    (لا في tempIdToRealId ولا fallback بالاسم نجح)، سواء كان لسه في
//    الطابور نفسه أو اختفى تمامًا — في الحالتين، الاستدعاء الحالي (Caller)
//    المفروض يعمل bumpRetry ويستنى الدورة الجاية، بنفس منطق INSERT
//    القديم بالظبط.
//  - `data` مُحدَّثة (الحقول اتستبدلت بالـ id الحقيقي) لو كل المراجع اتحلت.
export async function resolveOfflineFkRefs(
    dbClient: typeof db,
    op: OfflineQueueItem,
    tempIdToRealId: Map<string, string>,
    queue: OfflineQueueItem[],
): Promise<{ data: Record<string, unknown>; shouldRetry: boolean }> {
    const refs = (op.data?._offlineFkTempId as OfflineFkTempIdRef[] | undefined) || [];
    if (!refs || refs.length === 0) {
        return { data: op.data || {}, shouldRetry: false };
    }
    const updated: Record<string, unknown> = { ...op.data };
    for (const ref of refs) {
        // (أ) اتحل فعلاً في نفس دورة المزامنة دي
        if (tempIdToRealId.has(ref.tempId)) {
            updated[ref.field] = tempIdToRealId.get(ref.tempId);
            continue;
        }
        // (ب) لسه معلّق في الطابور نفسه — نستنى الدورة الجاية (مفيش داعي
        // نحاول fallback بالاسم أصلاً هنا، لأن السجل المرجعي هيتزامن قريب)
        const stillQueued = queue.some(
            (q) => q.table === ref.table && (q.data as Record<string, unknown> | undefined)?._offlineTempId === ref.tempId
        );
        if (stillQueued) {
            return { data: op.data || {}, shouldRetry: true };
        }
        // (ج) fallback بالاسم — الحالة النادرة (تشغيلة جديدة، التمبيد مش
        // موجود في الذاكرة ولا في الطابور، يبقى غالبًا اتزامن قبل كده)
        const nameColumn = FK_FALLBACK_NAME_COLUMN[ref.table];
        let resolvedByName = false;
        if (nameColumn && ref.fallbackNameValue) {
            // ⚠️ نفس الكاست الموثّق فوق تعريف dbFrom() بالظبط (ref.table هنا
            // Generic من نوع DbWriteTable مش literal ثابت — من غير الكاست ده
            // TypeScript بيحاول يحل النوع على مستوى الـ schema كله فبيرجّع
            // أخطاء بناء ضخمة، مش لأن اسم الجدول غلط فعليًا وقت التشغيل).
            // ⚠️ كاست إضافي هنا (`as any` موثّق ومقصود، بنفس اتفاقية
            // `db.from(table as any)` المقبولة فعليًا في 6 مواضع تانية بالمشروع
            // — راجع ملاحظات Phase 4.5 لتنظيف `any`): عمود البحث (`nameColumn`)
            // بيتحدد ديناميكيًا من FK_FALLBACK_NAME_COLUMN حسب الجدول (مش
            // literal ثابت زي 'title' القديمة)، فـ TypeScript مستحيل يتحقق منه
            // وقت الكتابة مهما كان الكاست على اسم الجدول نفسه. التحقق الحقيقي
            // من صحة اسم العمود بيحصل وقت التشغيل فعليًا (Supabase هيرجّع خطأ
            // واضح لو العمود مش موجود)، وده مغطى بمعالجة الأخطاء العادية في
            // دورة المزامنة (catch + bumpRetry).
            const { data: row } = await (dbClient.from(ref.table as 'cases') as unknown as {
                select: (col: string) => {
                    eq: (col: string, val: string) => {
                        order: (col: string, opts: { ascending: boolean }) => {
                            limit: (n: number) => { maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }> };
                        };
                    };
                };
            })
                .select('id')
                .eq(nameColumn, ref.fallbackNameValue)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (row?.id) {
                updated[ref.field] = row.id;
                resolvedByName = true;
            }
        }
        if (!resolvedByName) {
            // مفيش حل — لا تمبيد في الذاكرة، لا في الطابور، لا fallback نجح
            return { data: op.data || {}, shouldRetry: true };
        }
    }
    delete updated._offlineFkTempId;
    return { data: updated, shouldRetry: false };
}

// ══════════════════════════════════════════════════════════
//  🆕 المرحلة 3-1 (خطة توسيع نظام الأوفلاين) — تمبيد id السجل نفسه
//  ═══════════════════════════════════════════════════════════
//  🔎 اكتشاف معماري أثناء تنفيذ 3-1: `_offlineFkTempId` فوق بيحل مراجع FK
//  *جوه* `data` بس (مثال: case_sessions.case_id بيشاور على قضية لسه
//  تمبيد). لكن في `handleLinkExistingClient` (useClientLinking.ts /
//  useSessionLinking.ts)، العملية هي UPDATE على جدول `cases` بمعرّف
//  `createdCaseId` اللي ممكن يبقى هو نفسه لسه تمبيد (لو القضية اتقيدت
//  أوفلاين في `handleLinkCase` قبلها ولسه ما اتزامنتش) — يعني هنا الـ id
//  بتاع *السطر نفسه المستهدف بالـ UPDATE* هو التمبيد، مش قيمة حقل جوه
//  `data`. مفيش أي آلية قديمة بتحل `op.id` نفسه — دورة المزامنة كانت
//  بتعمل `.eq('id', op.id as string)` مباشرة من غير أي فحص، فلو `op.id`
//  فضل تمبيد (نص زي 'tmp-...') كان الـ UPDATE هيتنفذ فعليًا ضد Supabase من
//  غير ما يطابق أي صف حقيقي — Supabase بيرجّع نجاح صامت (صفر صفوف
//  متأثرة، من غير error) في الحالة دي، يعني المستخدم كان هيشوف "✅ تم
//  الربط" رغم إن الربط ما حصلش خالص. الدالة دي بتسد الفجوة دي بنفس منطق
//  `resolveOfflineFkRefs` بالظبط (تمبيد اتحل في نفس الدورة → لسه في
//  الطابور → fallback بالاسم) بس مطبّقة على `op.id` نفسه بدل حقل جوه
//  `data`.
//
//  الشكل: بدل sentinel من نوع مصفوفة (زي `_offlineFkTempId`)، هنا مرجع
//  واحد بس ممكن يتحط (السجل نفسه له id واحد بس، مش عدة حقول FK):
//  `data._offlineSelfTempId: string` (نفس التمبيد اللي اتحط في `id`
//  الأصلي وقت النداء) + `data._offlineSelfFallbackName?: string`
//  اختياري للـ fallback بالاسم.
export async function resolveOfflineSelfId(
    dbClient: typeof db,
    op: OfflineQueueItem,
    tempIdToRealId: Map<string, string>,
    queue: OfflineQueueItem[],
): Promise<{ realId: string | null; shouldRetry: boolean }> {
    const tempId = op.data?._offlineSelfTempId as string | undefined;
    if (!tempId) {
        // مفيش sentinel — الـ id الأصلي حقيقي بالفعل من الأول (الحالة
        // العادية لكل عمليات UPDATE اللي كانت شغالة قبل 3-1).
        return { realId: op.id as string, shouldRetry: false };
    }
    // (أ) اتحل فعلاً في نفس دورة المزامنة دي
    if (tempIdToRealId.has(tempId)) {
        return { realId: tempIdToRealId.get(tempId) as string, shouldRetry: false };
    }
    // (ب) لسه معلّق في الطابور نفسه (عملية INSERT القضية لسه ما اتعالجتش
    // أو فشلت) — نستنى الدورة الجاية، بنفس منطق resolveOfflineFkRefs
    const stillQueued = queue.some(
        (q) => q.table === op.table && (q.data as Record<string, unknown> | undefined)?._offlineTempId === tempId
    );
    if (stillQueued) {
        return { realId: null, shouldRetry: true };
    }
    // (جـ) fallback بالاسم — الحالة النادرة (السجل الأصلي اتزامن في
    // تشغيلة سابقة ومعندناش التمبيد في الذاكرة)
    const nameColumn = FK_FALLBACK_NAME_COLUMN[op.table];
    const fallbackNameValue = op.data?._offlineSelfFallbackName as string | undefined;
    if (nameColumn && fallbackNameValue) {
        const { data: row } = await (dbClient.from(op.table as 'cases') as unknown as {
            select: (col: string) => {
                eq: (col: string, val: string) => {
                    order: (col: string, opts: { ascending: boolean }) => {
                        limit: (n: number) => { maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }> };
                    };
                };
            };
        })
            .select('id')
            .eq(nameColumn, fallbackNameValue)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (row?.id) return { realId: row.id, shouldRetry: false };
    }
    // مفيش حل — لا تمبيد في الذاكرة، لا في الطابور، لا fallback نجح
    return { realId: null, shouldRetry: true };
}
// ══════════════════════════════════════════════════════════════
//  🆕 (سجل النشاط — تتبع التغييرات، مرحلة 4.1 "فجوة الأوفلاين"، 19
//  أغسطس 2026): قبل كده UPDATE/DELETE أوفلاين ما كانوش بيسجلوا أي نشاط
//  خالص وقت المزامنة (غير INSERT لـcases، شوف الفيكس الأقدم تحت). أي
//  تعديل أو حذف حصل وإنت أوفلاين كان يختفي تمامًا من "سجل النشاط" —
//  حتى لو نجحت المزامنة فعليًا.
//
//  ⚠️ حدود متعمّدة (النطاق هنا "وجود نشاط مسجّل"، مش ديف حقل-بحقل زي
//  المراحل 1-4 أونلاين): طابور الأوفلاين (IndexedDB) بيخزّن بس البيانات
//  الجديدة (op.data) وقت الكتابة الأصلية — مفيش "قيمة قديمة" متلقوطة
//  وقتها لمقارنتها هنا بعد المزامنة (ده كان محتاج تغيير أعمق في شكل
//  __dbWrite نفسه لالتقاط snapshot قبل كل عملية أوفلاين، خارج نطاق
//  المرحلة دي). فبنسجل بس *إن* الحدث حصل (زي نمط INSERT/'إضافة قضية'
//  الموجود بالفعل)، بعلامة "(أوفلاين)" واضحة في details.
const OFFLINE_ACTIVITY_CONFIG: Partial<Record<DbWriteTable, {
    entity_type: string;
    actionUpdate: string;
    actionDelete: string;
    // اسم الحقل (لو موجود في op.data بعد UPDATE) اللي نعرضه كـdetails —
    // مش كل UPDATE هيحمله (ممكن يكون تعديل حقل واحد بس، زي status)، فده
    // best-effort مش مضمون.
    nameField?: string;
}>> = {
    cases: { entity_type: 'case', actionUpdate: 'تعديل قضية', actionDelete: 'حذف قضية', nameField: 'title' },
    clients: { entity_type: 'client', actionUpdate: 'تعديل موكل', actionDelete: 'حذف موكل', nameField: 'full_name' },
    case_sessions: { entity_type: 'session', actionUpdate: 'تعديل جلسة', actionDelete: 'حذف جلسة' },
    reminders: { entity_type: 'reminder', actionUpdate: 'تعديل تذكير', actionDelete: 'حذف تذكير' },
    case_fees: { entity_type: 'fee', actionUpdate: 'تعديل أتعاب', actionDelete: 'حذف أتعاب' },
    fee_payments: { entity_type: 'fee', actionUpdate: 'تعديل دفعة أتعاب', actionDelete: 'حذف دفعة أتعاب' },
    case_notes: { entity_type: 'note', actionUpdate: 'تعديل ملاحظة', actionDelete: 'حذف ملاحظة' },
    case_parties: { entity_type: 'case', actionUpdate: 'تعديل طرف دعوى', actionDelete: 'حذف طرف دعوى' },
};

let __syncQueueRunning = false;
export async function runOfflineSync(): Promise<void> {
    // BUG FIX: القفل ده كان موجود فقط في __runOfflineSyncIfNeeded، لكن
    // Service Worker بينده على __syncOfflineQueue مباشرة عند Background Sync
    // (في serviceWorkerBootstrap.ts)، فكان ممكن العمليتين تتنفذوا في نفس
    // الوقت وتعمل INSERT مكرر لنفس القضية. دلوقتي القفل بقى جوه الدالة
    // نفسها فيغطي كل المصادر.
    if (__syncQueueRunning) return;
    __syncQueueRunning = true;
    try {
    const queue = await window.__getOfflineQueue?.() || [];
    if (queue.length === 0) return;
    showSyncIndicator(`جاري مزامنة ${queue.length} عملية...`);
    let successCount = 0, failCount = 0;
    // 🔒 FIX (تتبع زر "إضافة قضية" — 18 يوليو 2026): خريطة tempId → id حقيقي،
    // بتتبني أثناء التشغيلة دي بس. كانت الجلسة الأولى لقضية أوفلاين بتتربط
    // بالقضية عن طريق البحث بالعنوان فقط (.eq('title', ...).order(created_at
    // desc).limit(1)) — لو فيه قضيتين اتضافوا أوفلاين بنفس العنوان بالظبط،
    // كان ممكن الجلسة تتربط بالقضية الغلط بصمت. دلوقتي المطابقة الأساسية
    // بقت بالمعرّف المؤقت (فريد لكل عملية إضافة، صفر احتمال تصادم)، والبحث
    // بالعنوان بقى fallback بس للحالة النادرة إن القضية اتزامنت في تشغيلة
    // سابقة قبل ما تتزامن الجلسة (التطابق بالـ tempId ميبقاش متاح وقتها لأن
    // الخريطة دي محلية للتشغيلة الحالية فقط).
    const tempIdToRealId = new Map<string, string>();
    // 🆕 المرحلة 4 (خطة توسيع نظام الأوفلاين): مجموعتين محليتين للتشغيلة دي
    // بس، عشان نعرف بعد الحلقة كلها لأي قضية لازم نعيد حساب next_hearing.
    // `syncedCaseIds`: القضايا اللي اتزامنت (INSERT ناجح) في نفس الدورة دي
    // بالظبط — مش القضايا الموجودة أصلاً من قبل (دول next_hearing بتاعهم
    // محسوب صح فعلاً من مسارات تانية، مش محتاجين إعادة حساب هنا).
    // `casesLinkedThisCycle`: القضايا اللي معاها تحديث case_sessions.case_id
    // اتزامن بنجاح في نفس الدورة — التقاطع بين المجموعتين هو بالظبط سيناريو
    // handleLinkCase (قضية + ربط جلستها الأولى، الاتنين أوفلاين مع بعض)،
    // اللي next_hearing بتاعه كان بيفضل فاضي بعد المزامنة قبل الفيكس ده.
    const syncedCaseIds = new Set<string>();
    const casesLinkedThisCycle = new Set<string>();
    // 🆕 المرحلة 6.5: قضايا (حقيقية بالفعل، مش تمبيد) محتاجة إعادة حساب
    // next_hearing بعد المزامنة بسبب عملية case_sessions (INSERT/UPDATE/
    // DELETE) اتزامنت بنجاح من useCaseSessions.ts — بعكس casesLinkedThisCycle
    // فوق اللي مقصورة على تقاطعها مع syncedCaseIds (سيناريو قضية جديدة
    // بالكامل أوفلاين)، هنا القضية موجودة أصلاً من قبل الدورة دي، فالتحديث
    // مطلوب دايمًا (بلا شرط تقاطع) لأي case_id اتجمّع هنا.
    const caseSessionCaseIdsToRecalc = new Set<string>();
    // 🔒 FIX (تتبع "إضافة قضية" — 18 يوليو 2026): سقف محاولات — عنصر فشل
    // ~15 مرة متتالية (يعني قريب من ربع ساعة بمعدل محاولة كل دقيقة، غير
    // محاولات أحداث 'online'/'load' الإضافية) بيتحسب "عالق" ويتجمع في
    // stuckItems عشان نطلع تنبيه واحد واضح للمستخدم بدل ما يفضل يحاول
    // للأبد بصمت من غير ما حد ياخد باله.
    const RETRY_ALERT_THRESHOLD = 15;
    const stuckItems: OfflineQueueItem[] = [];
    async function bumpRetry(item: OfflineQueueItem) {
        const updated: OfflineQueueItem = { ...item, retryCount: (item.retryCount || 0) + 1 };
        await window.__updateOfflineItem?.(updated);
        if (updated.retryCount === RETRY_ALERT_THRESHOLD) stuckItems.push(updated);
    }
    for (const op of queue) {
        try {
            let error = null;
            let conflict = false;
            // 🆕 المرحلة 4: هيتحدد جوه فرع UPDATE تحت لو العملية دي بتربط
            // جلسة بقضية (case_sessions.case_id) — شوف linksCaseSession
            // واستخدامها في فرع النجاح تحت.
            let linkedCaseIdForRecalc: string | null = null;
            // 🆕 المرحلة 6.5: هيتحدد جوه فرع UPDATE (تعديل جلسة من صفحة
            // تفاصيل القضية) — لازم يتصرّح هنا (مش جوه الفرع نفسه) عشان
            // يفضل متاح لفرع النجاح تحت بعد ما الـ if/else-if كله يخلص.
            let sessionCaseIdForRecalc: string | null = null;
            // ⚡ NEW (سجل النشاط — تتبع التغييرات، مرحلة 4.1 (فجوة
            // الأوفلاين)، 19 أغسطس 2026): resolvedOpId كانت متصرّحة جوه فرع
            // UPDATE بس (`let` محلي للفرع) — بنرفعها هنا (زي
            // sessionCaseIdForRecalc فوق بالظبط) عشان تفضل متاحة لفرع
            // النجاح تحت بعد ما الـ if/else-if يخلص، ونستخدمها في تسجيل
            // نشاط "تعديل" بالـid الحقيقي (مش op.id الخام، اللي ممكن يكون
            // لسه تمبيد لو _offlineSelfTempId موجودة).
            let resolvedOpId: string | null = null;

            if (op.type === 'INSERT') {
                // البيانات هنا Record<string, unknown> عام (زي useAdminBackup.ts) —
                // كاست ضيق مربوط باسم الجدول الحقيقي المتحقق منه فعلاً (op.table
                // بقى DbWriteTable مش string)، بنفس نمط __dbWrite تحت بالظبط.
                // BUG-20 FIX: جلسة مرتبطة بقضية أوفلاين — نجيب الـ id الحقيقي أولاً
                if (op.table === 'case_sessions' && (op.data?._offlineCaseTempId || op.data?._offlineCaseTitle)) {
                    const tempId = op.data?._offlineCaseTempId as string | undefined;
                    let realCaseId: string | null = null;

                    if (tempId && tempIdToRealId.has(tempId)) {
                        // القضية اتزامنت فعلاً جوه التشغيلة دي — مطابقة دقيقة
                        realCaseId = tempIdToRealId.get(tempId) || null;
                    } else if (tempId && queue.some((q) => q.table === 'cases' && (q.data as Record<string, unknown> | undefined)?._offlineTempId === tempId)) {
                        // القضية بتاعتها لسه في الطابور (متعالجتش أو فشلت النهاردة) — نستنى الدور الجاي
                        await bumpRetry(op);
                        failCount++;
                        continue;
                    } else if (op.data?._offlineCaseTitle) {
                        // Fallback: القضية غالبًا اتزامنت في تشغيلة سابقة ومعندناش tempId مطابق —
                        // نرجع للبحث بالعنوان كحل احتياطي أخير
                        const { data: caseRow } = await db
                            .from('cases')
                            .select('id')
                            .eq('title', op.data._offlineCaseTitle as string)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .maybeSingle();
                        realCaseId = caseRow?.id || null;
                    }

                    if (!realCaseId) {
                        // القضية لسه مش اتزامنت أصلاً — نفضل في الـ queue ونكمل
                        await bumpRetry(op);
                        failCount++;
                        continue;
                    }
                    op.data = { ...op.data, case_id: realCaseId };
                    delete op.data._offlineCaseTempId;
                    delete op.data._offlineCaseTitle;
                }
                // 🆕 المرحلة 1: حل مراجع FK العامة (_offlineFkTempId) لو موجودة —
                // بيشتغل جنب الآلية القديمة (_offlineCaseTempId) فوق من غير ما
                // يعارضها؛ الاتنين ممكن يتواجدوا في نفس العملية نظريًا (مش
                // متوقع فعليًا حاليًا لحد ما المرحلة 2 تتنفذ) من غير تعارض لأنهم
                // بيشتغلوا على حقول مختلفة.
                if (op.data?._offlineFkTempId) {
                    const resolved = await resolveOfflineFkRefs(db, op, tempIdToRealId, queue);
                    if (resolved.shouldRetry) {
                        await bumpRetry(op);
                        failCount++;
                        continue;
                    }
                    op.data = resolved.data;
                }
                const insertData = stripOfflineSentinels(op.data);
                // 🆕 المرحلة 1: كان مقصور على `op.table === 'cases'` بس — دلوقتي
                // معمم لأي جدول، عشان أي INSERT (قضية أو عميل) يقدر يسجّل
                // تمبيده في نفس الـ Map المشتركة (tempIdToRealId) ويتستخدم في
                // حل مراجع FK لعمليات تانية بعده في نفس الدورة (شوف
                // resolveOfflineFkRefs فوق). صفر تغيير سلوك للقضايا الموجودة.
                if (op.data?._offlineTempId) {
                    const res = await db.from(op.table).insert([insertData as Database['public']['Tables'][typeof op.table]['Insert']]).select('id').single();
                    error = res.error;
                    if (!error && res.data) {
                        const newId = (res.data as { id: string }).id;
                        tempIdToRealId.set(op.data._offlineTempId as string, newId);
                        // 🆕 المرحلة 4: نسجّل القضايا الجديدة اللي اتزامنت في نفس
                        // الدورة دي فقط — شوف تعريف syncedCaseIds فوق.
                        if (op.table === 'cases') syncedCaseIds.add(newId);
                    }
                } else {
                    ({ error } = await db.from(op.table).insert([insertData as Database['public']['Tables'][typeof op.table]['Insert']]));
                    // 🆕 المرحلة 6.5: إضافة جلسة من صفحة تفاصيل القضية مباشرة
                    // (useCaseSessions.ts) — case_id هنا حقيقي دايمًا (مفيش
                    // _offlineTempId ولا _offlineFkTempId في العملية دي أصلاً)،
                    // موجود كعمود حقيقي في insertData نفسها، فمش محتاجين
                    // sentinel منفصل للـ INSERT (بعكس UPDATE/DELETE تحت).
                    if (!error && op.table === 'case_sessions' && insertData?.case_id) {
                        caseSessionCaseIdsToRecalc.add(insertData.case_id as string);
                    }
                }
            } else if (op.type === 'UPDATE') {
                // 🆕 المرحلة 3-1: لازم نحل تمبيد id السطر نفسه (لو موجود) قبل أي
                // حاجة تانية — لو لسه معلّق أو مش قابل للحل، منعملش أي محاولة
                // update أصلاً (بعكس _offlineFkTempId اللي بيحل حقول *جوه*
                // data، مش هوية السطر المستهدف نفسه).
                resolvedOpId = op.id as string;
                // 🆕 المرحلة 6.5: sentinel `_offlineSessionCaseId` من
                // useCaseSessions.ts (تعديل جلسة من صفحة تفاصيل القضية
                // مباشرة) — case_id حقيقي دايمًا هنا (مش تمبيد)، بنلقطه هنا
                // قبل أي strip عشان نعرف نعيد حساب next_hearing بعد نجاح
                // الـ UPDATE تحت (شوف caseSessionCaseIdsToRecalc).
                sessionCaseIdForRecalc = op.table === 'case_sessions'
                    ? (op.data?._offlineSessionCaseId as string | undefined) || null
                    : null;
                if (op.data?._offlineSelfTempId) {
                    const selfResolved = await resolveOfflineSelfId(db, op, tempIdToRealId, queue);
                    if (selfResolved.shouldRetry || !selfResolved.realId) {
                        await bumpRetry(op);
                        failCount++;
                        continue;
                    }
                    resolvedOpId = selfResolved.realId;
                }
                // 🆕 المرحلة 1: حل مراجع FK العامة (_offlineFkTempId) لو موجودة —
                // نفس منطق فرع INSERT فوق بالظبط، بس هنا للـ UPDATE (مثال:
                // ربط جلسة حقيقية بقضية لسه في الطابور — case_id تمبيد).
                // 🆕 المرحلة 4: قبل ما نحل المراجع (resolveOfflineFkRefs بتشيل
                // _offlineFkTempId من op.data بعد الحل)، بنسجّل هل العملية دي
                // أصلاً بتربط جلسة بقضية (case_sessions.case_id) — لو آه، بعد
                // نجاح الـ UPDATE فعليًا تحت، هنضيف الـ case_id المُحل
                // (الحقيقي) لـ casesLinkedThisCycle عشان نعرف نعيد حساب
                // next_hearing بعد الحلقة كلها لو القضية دي نفسها اتزامنت
                // (INSERT) في نفس الدورة (شوف syncedCaseIds فوق).
                const linksCaseSession = op.table === 'case_sessions'
                    && ((op.data?._offlineFkTempId as OfflineFkTempIdRef[] | undefined) || []).some((r) => r.field === 'case_id' && r.table === 'cases');
                if (op.data?._offlineFkTempId) {
                    const resolved = await resolveOfflineFkRefs(db, op, tempIdToRealId, queue);
                    if (resolved.shouldRetry) {
                        await bumpRetry(op);
                        failCount++;
                        continue;
                    }
                    op.data = resolved.data;
                    // 🆕 المرحلة 4: بعد الحل، op.data.case_id بقى الـ id الحقيقي
                    // (لو اتحل من tempIdToRealId) — ده اللي محتاجينه لتسجيله
                    // في casesLinkedThisCycle بعد نجاح الـ UPDATE تحت.
                    if (linksCaseSession) linkedCaseIdForRecalc = (op.data?.case_id as string | undefined) || null;
                }
                // op.id هنا هي الـ id الحقيقي (string) بتاع السجل — مش الرقم
                // التلقائي بتاع IndexedDB (ده بس لعمليات INSERT، زي ما موثّق
                // فوق تعريف OfflineQueueItem). كاست `as string` بنفس منطق
                // `id as string` في __dbWrite تحت.
                // Optimistic Locking — نتحقق إن السجل مش اتعدل من حد تاني
                if (op.knownUpdatedAt) {
                    const { data: current, error: fetchErr } = await dbFrom(op.table)
                        .select('updated_at').eq('id', resolvedOpId).single();

                    if (!fetchErr && current && current.updated_at) {
                        const serverTime = new Date(current.updated_at).getTime();
                        const clientTime = new Date(op.knownUpdatedAt).getTime();
                        if (serverTime > clientTime) {
                            // تعارض — مش هنكتب فوق تعديل حد تاني
                            conflict = true;
                        }
                    }
                }
                if (!conflict) {
                    // 🆕 المرحلة 1: stripOfflineSentinels هنا احتياط — resolveOfflineFkRefs
                    // فوق بيشيل `_offlineFkTempId` بنفسه لما يحل كل المراجع، لكن
                    // بنستدعيها تاني هنا زي ما بيحصل مع INSERT، تحسبًا لأي sentinel
                    // تاني يتضاف مستقبلاً لعمليات UPDATE من غير ما ننسى نشيله هنا.
                    // 🆕 المرحلة 3-1: بنستخدم resolvedOpId (مش op.id الخام) —
                    // للعمليات العادية (مفيش _offlineSelfTempId) القيمتين
                    // متطابقتين دايمًا، صفر تغيير سلوك.
                    ({ error } = await db.from(op.table).update(stripOfflineSentinels(op.data) as Database['public']['Tables'][typeof op.table]['Update']).eq('id', resolvedOpId));
                }
            } else if (op.type === 'DELETE') {
                ({ error } = await db.from(op.table).delete().eq('id', op.id as string));
            }

            if (conflict) {
                // نحذف العملية من الـ Queue ونعدّ كـ conflict
                await window.__deleteOfflineItem(op.id);
                failCount++;
            } else if (!error) {
                await window.__deleteOfflineItem(op.id);
                successCount++;
                // 🔒 FIX (تتبع "إضافة قضية" — 18 يوليو 2026): قضية اتضافت وإنت
                // أوفلاين ماكانتش بتتسجل في "سجل النشاط" خالص — لا وقت الإضافة
                // (لسه معندهاش id حقيقي) ولا بعد كده وقت المزامنة (مفيش نداء
                // logActivity أصلاً في المسار ده). النتيجة: أي قضية اتضافت
                // أوفلاين كانت تختفي تمامًا من السجل. بنسجّلها هنا دلوقتي، بعد
                // نجاح الإدراج الحقيقي فعليًا، بنفس شكل نشاط "إضافة قضية" اللي
                // بيتسجل في المسار الأونلاين.
                if (op.type === 'INSERT' && op.table === 'cases') {
                    const newId = tempIdToRealId.get(op.data?._offlineTempId as string) || null;
                    const title = (op.data?.title as string) || null;
                    const caseType = (op.data?.case_type as string) || null;
                    logActivity(db, 'إضافة قضية', {
                        entity_type: 'case',
                        entity_id: newId,
                        details: title ? `${title} (أُضيفت أوفلاين)` : 'أُضيفت أوفلاين',
                        case_name: title,
                        case_type: caseType,
                    });
                }
                // ⚡ NEW (مرحلة 4.1 "فجوة الأوفلاين"، 19 أغسطس 2026): تسجيل
                // نشاط UPDATE/DELETE ناجح — راجع تعليق OFFLINE_ACTIVITY_CONFIG
                // فوق للحدود المتعمّدة (details بس، مفيش changes/ديف حقول).
                if (op.type === 'UPDATE' && resolvedOpId) {
                    const cfg = OFFLINE_ACTIVITY_CONFIG[op.table];
                    if (cfg) {
                        const name = cfg.nameField ? (op.data?.[cfg.nameField] as string | undefined) : undefined;
                        logActivity(db, cfg.actionUpdate, {
                            entity_type: cfg.entity_type,
                            entity_id: resolvedOpId,
                            details: name ? `${name} (تعديل أوفلاين)` : 'تعديل أوفلاين',
                        });
                    }
                } else if (op.type === 'DELETE') {
                    const cfg = OFFLINE_ACTIVITY_CONFIG[op.table];
                    if (cfg) {
                        logActivity(db, cfg.actionDelete, {
                            entity_type: cfg.entity_type,
                            entity_id: (op.id as string) || null,
                            details: 'حذف أوفلاين',
                        });
                    }
                }
                // 🆕 المرحلة 4: تسجيل ربط جلسة↔قضية ناجح في نفس الدورة —
                // شوف تعريف casesLinkedThisCycle فوق. بيتحقق فعليًا بعد
                // الحلقة كلها (مش هنا) عشان نضمن إن القضية نفسها خلصت
                // مزامنة (ترتيب العمليات في الطابور مش مضمون قضية قبل
                // جلستها دايمًا لو فيه bumpRetry/إعادة محاولات).
                if (op.type === 'UPDATE' && linkedCaseIdForRecalc) {
                    casesLinkedThisCycle.add(linkedCaseIdForRecalc);
                }
                // 🆕 المرحلة 6.5: تعديل/حذف جلسة من صفحة تفاصيل القضية
                // مباشرة — القضية دي حقيقية وموجودة من قبل الدورة دي (مش
                // محتاجة تقاطع مع syncedCaseIds زي casesLinkedThisCycle فوق).
                if (op.type === 'UPDATE' && sessionCaseIdForRecalc) {
                    caseSessionCaseIdsToRecalc.add(sessionCaseIdForRecalc);
                } else if (op.type === 'DELETE' && op.table === 'case_sessions' && op.data?._offlineSessionCaseId) {
                    caseSessionCaseIdsToRecalc.add(op.data._offlineSessionCaseId as string);
                }
            } else {
                // BUG FIX: كان بيتجاهل تفاصيل الخطأ تمامًا، فمستحيل تعرف ليه
                // عملية معينة فاضلة عالقة في الـ queue ومش بتتزامن أبدًا
                // (مثلاً قيمة مفقودة مطلوبة، أو RLS بترفض الإدراج).
                console.error('[Offline Sync] فشلت عملية', op.type, op.table, '—', error?.message || error);
                await bumpRetry(op);
                failCount++;
            }
        } catch (err) {
            console.error('[Offline Sync] استثناء غير متوقع في عملية', op.type, op.table, '—', err);
            await bumpRetry(op);
            failCount++;
        }
    }
    // ══════════════════════════════════════════════════════════
    //  🆕 المرحلة 4 (خطة توسيع نظام الأوفلاين) — إعادة حساب next_hearing
    //  بعد المزامنة، لأي قضية اتزامنت (INSERT) في نفس الدورة *و* كان معاها
    //  تحديث جلسة (case_id) اتزامن بنجاح في نفس الدورة (التقاطع بين
    //  syncedCaseIds وcasesLinkedThisCycle). قبل الفيكس ده، next_hearing
    //  كان بيفضل فاضي دايمًا للقضايا اللي اتعملت من "تحويل جلسة مستقلة
    //  لقضية" وهي أوفلاين بالكامل (handleLinkCase في
    //  useClientLinking.ts/useSessionLinking.ts) — لأن recalcNextHearing
    //  فيه select على case_sessions لازم يتنفذ بعد وجود القضية فعليًا في
    //  القاعدة (مستحيل يتحول لعملية طابور عادية زي باقي العمليات، نفس
    //  التوثيق في هدف المرحلة دي بالخطة الأصلية). أونلاين، الاستدعاء
    //  المباشر في useClientLinking.ts/useSessionLinking.ts فضل زي ما هو
    //  بالظبط (صفر تغيير هناك) — هنا بس بيغطي المسار الأوفلاين.
    //  كل استدعاء معزول بـ try/catch مستقل: فشل إعادة حساب next_hearing
    //  لقضية واحدة (مثلاً مشكلة شبكة عابرة) لازم ميأثرش على تقرير نجاح/فشل
    //  باقي عمليات المزامنة اللي خلصت فعلاً قبل النقطة دي.
    // ══════════════════════════════════════════════════════════
    for (const caseId of casesLinkedThisCycle) {
        if (!syncedCaseIds.has(caseId)) continue;
        try {
            await recalcNextHearing(db, caseId);
        } catch (err) {
            console.error('[Offline Sync] فشل إعادة حساب next_hearing بعد المزامنة للقضية', caseId, '—', err);
        }
    }
    // 🆕 المرحلة 6.5: نفس فكرة الحلقة فوق، لكن لجلسات اتضافت/اتعدّلت/اتحذفت
    // من صفحة تفاصيل القضية مباشرة (useCaseSessions.ts) وإحنا أوفلاين.
    // بعكس الحلقة فوق، هنا مفيش شرط تقاطع مع syncedCaseIds — القضية دايمًا
    // كانت موجودة وحقيقية من قبل الدورة دي أصلاً (مش قضية جديدة بالكامل
    // اتزامنت في نفس الوقت)، فالتحديث مطلوب لكل عنصر جُمع هنا بلا استثناء.
    for (const caseId of caseSessionCaseIdsToRecalc) {
        try {
            await recalcNextHearing(db, caseId);
        } catch (err) {
            console.error('[Offline Sync] فشل إعادة حساب next_hearing بعد مزامنة جلسة للقضية', caseId, '—', err);
        }
    }
    if (successCount > 0 && failCount === 0) {
        hideSyncIndicator(`✅ تمت المزامنة — ${successCount} عملية`);
        toast(`✅ تمت المزامنة (${successCount} عملية)`);
    } else if (failCount > 0) {
        hideSyncIndicator(`⚠️ تمت جزئياً (${successCount}/${successCount + failCount})`);
    } else { hideSyncIndicator(); }
    // 🔒 FIX (تتبع "إضافة قضية" — 18 يوليو 2026): تنبيه واحد واضح (مش تكرار
    // كل دقيقة) أول ما عنصر يعدّي سقف المحاولات — بدل ما يفضل يحاول للأبد
    // بصمت من غير ما حد ياخد باله إنه محتاج تدخل يدوي (مثلاً بيانات ناقصة،
    // أو قضية مرتبطة فشلت تتزامن نهائيًا).
    if (stuckItems.length > 0) {
        toast(`⚠️ فيه ${stuckItems.length} عملية عالقة من فترة طويلة ومش بتتزامن — راجع اتصالك بالإنترنت، ولو المشكلة استمرت تواصل مع الدعم`, true);
        console.error('[Offline Sync] عناصر عالقة تجاوزت سقف المحاولات:', stuckItems);
    }
    window.dispatchEvent(new CustomEvent('offline-sync-complete'));
    } finally {
        __syncQueueRunning = false;
    }
}
