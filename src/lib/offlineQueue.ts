import { db } from '../supabaseClient';
import type { Database } from '../database.types';
import { showOfflineBanner, hideOfflineBanner, showSyncIndicator } from '../shared/lib/notifications';
// 🆕 (تقسيم offlineSync.ts — 24 أغسطس 2026): hideSyncIndicator/toast/
// logActivity/recalcNextHearing كانوا مستوردين هنا بس استخدامهم الوحيد كان
// جوه منطق المزامنة (window.__syncOfflineQueue) اللي اتنقل لـofflineSync.ts.
// اتشالوا من هنا (unused) وبقوا مستوردين هناك بدل كده.

// ══════════════════════════════════════════════════════════
//  Offline Queue (IndexedDB) + __dbWrite — منقول من main.tsx
//  (اتفصل بتاريخ 15 يوليو 2026 كجزء من خطة تخفيف main.tsx)
// ══════════════════════════════════════════════════════════

// ⚠️ الجداول الحقيقية اللي ممكن توصل لـ __dbWrite — اتأكدت من كل نداء فعلي
// في المشروع كله (useCaseActions.ts، useClientActions.ts، useRemindersTab.ts).
// مستخدمة في توقيع __dbWrite نفسه، وكمان في OfflineQueueItem.table تحت (لأن
// __offlineEnqueue بيتنادى حصريًا من جوه __dbWrite بنفس القيم دي بالظبط —
// مفيش أي نداء تاني ليها في المشروع كله).
//
// 🆕 المرحلة 6 (خطة توسيع نظام الأوفلاين — H-3، 21 يوليو): 'reminders' اتضافت
// كأول جدول من الأربعة المتبقية (الأولوية: بساطة، صفر أعمدة FK بتشاور على
// جدول تاني ممكن يكون لسه في الطابور — بعكس case_fees مثلًا).
//
// 🆕 المرحلة 6 (تكملة): 'case_fees' و'fee_payments' اتضافوا تانيًا. ⚠️ قرار
// عمل محسوم مع صاحب المشروع (21 يوليو): تسجيل دفعة أتعاب (`handleAddPayment`،
// بينادي RPC ذرّية `record_fee_payment`) وحذف دفعة (`handleDeletePayment`،
// عمليتين متتاليتين متعتمدتين — حذف + إعادة حساب) **ممنوعين تمامًا أوفلاين**
// (رسالة صريحة "يتطلب اتصال بالإنترنت")، مش مقيّدين في الطابور — عشان منرجعش
// لمشكلة الـ partial-save اللي المرحلة 4 حلّتها أصلاً لو حاولنا نبني نسخة
// أوفلاين من عملية متعددة الخطوات معتمدة على نتيجة السيرفر. عمليات case_fees
// التانية (إضافة سجل جديد من غير دفعة مبدئية، حذف/أرشفة/استرجاع) عمليات
// وحيدة الخطوة، فهي دي اللي فعليًا بتستخدم __dbWrite/الطابور تحت.
//
// 🆕 المرحلة 6 (تكملة ثانية، 21 يوليو): 'case_notes' اتضافت — تحويلات خالصة
// على جدول واحد (INSERT/UPDATE/DELETE)، صفر تفاعل مع Storage، وصفر FK فعلي
// على case_id (مؤكَّد بالقسم 0.1 من التقرير: case_notes مالهاش FK نحو
// cases)، فمفيش داعي لـ _offlineFkTempId هنا أصلاً — وقت ما المستخدم بيضيف
// ملاحظة، القضية نفسها لازم تكون محمّلة ومعروضة على الشاشة بالفعل (يعني
// سجل حقيقي متزامن، مش تمبيد لسه في الطابور).
// ⚠️ 'case_documents' اتفحصت وقُرِّر عمدًا إنها **متتضافش** هنا: كل عملية
// عليها (رفع/حذف) خطوة معتمدة ماديًا على الشبكة (بايتات الملف نفسها لازم
// توصل فعليًا لـ Supabase Storage — مفيش تمثيل ممكن للملف في IndexedDB/
// الطابور زي صف DB عادي)، فمينفعش "نقيّدها" زي باقي الجداول. نفس فلسفة
// قرار case_fees/fee_payments بالظبط — راجع useCaseDocuments.ts للتفصيل.
//
// 🆕 المرحلة 6.5 (تكملة ثالثة، 21 يوليو): `case_sessions` كانت مُدرجة هنا
// من الأول (من التلات جداول الأصلية)، لكن استخدامها كان مقصور فعليًا على
// تدفقات "ربط جلسة مستقلة بقضية" (useSessionLinking.ts/NewStandaloneSessionModal.tsx)
// بس. إضافة/تعديل/حذف جلسة من *صفحة تفاصيل القضية مباشرة* (useCaseSessions.ts)
// كانت لسه بتستخدم db.from()/safeUpdate مباشر. دلوقتي بقت بتستخدم __dbWrite
// زيها زي باقي التدفقات. case_id في السيناريو ده دايمًا حقيقي (القضية
// محمّلة ومعروضة على الشاشة بالفعل، مش تمبيد)، فمفيش داعي لـ
// _offlineFkTempId/_offlineCaseTempId هنا — لكن عشان next_hearing يتحدّث
// صح بعد المزامنة (مش بس أونلاين فورًا)، useCaseSessions.ts بيبعت sentinel
// جديد `_offlineSessionCaseId` (INSERT: case_id نفسه موجود أصلاً كعمود
// حقيقي فمش محتاج سنتينل؛ UPDATE/DELETE: محتاجين السنتينل لأن case_id مش
// جزء من بيانات العملية أصلاً) — شوف caseSessionCaseIdsToRecalc تحت.
//
// 🆕 المرحلة 2 (خطة تعدد الأطراف، 22 يوليو): 'case_parties' اتضافت هنا
// كتجهيز مبكر بس (الجدول نفسه اتعمل في المرحلة 1، فاضي لسه). لا يوجد أي
// نداء فعلي لـ __dbWrite بـ 'case_parties' في الكود لحد المرحلة دي —
// هيتضاف فعليًا وقت تعديل الفورمات (مراحل 4-6). الإضافة هنا دلوقتي بس
// عشان التوقيع يبقى جاهز، وده مطابق تمامًا لبند "توسيع DbWriteTable"
// في جدول تتبع المراحل (قسم 11، مرحلة 2).
export type DbWriteTable = 'clients' | 'cases' | 'case_sessions' | 'reminders' | 'case_fees' | 'fee_payments' | 'case_notes' | 'case_parties';

// ⚠️ قيد معروف في supabase-js + TypeScript: تسلسل .insert()/.update()/.delete()
// ثم .select()/.eq() على db.from(table) لما `table` يكون Generic (T extends
// DbWriteTable) بدل literal واحد ثابت بيخلي المكتبة تحاول تحل النوع على
// مستوى الـ schema كله (كل الجداول) بدل التلات جداول المسموحة بس، فبترجع
// أخطاء ضخمة (RejectExcessProperties/keyof) وقت البناء — نفس المشكلة ظهرت
// في useAdminBackup.ts مع دالة dynFrom لكن على نطاق أوسع هنا بسبب السلسلة
// الأطول (insert().select().single()، update().eq().select().single()).
// الحل: نأكد لـ TypeScript إن الجدول واحد من التلات المعروفين فعلاً (بنستخدم
// 'cases' كممثل — عنده نفس أعمدة id/updated_at المشتركة بين التلات جداول)
// وقت بناء الـ query builder بس. التحقق الحقيقي من اسم الجدول وقت الكتابة
// لسه قائم عن طريق `table: DbWriteTable` في توقيع الدالة الخارجية — الكاست
// هنا بيأثر بس على شكل الـ builder وقت الـ type-check، مش على اسم الجدول
// أو البيانات الفعلية وقت التشغيل.
// 🆕 (تقسيم offlineSync.ts — 24 أغسطس 2026): بقت exported لأن offlineSync.ts
// (الملف اللي بيتحمّل lazy، شوف تعريف window.__syncOfflineQueue تحت) محتاجها
// برضه (لمسار Optimistic Locking جوه فرع UPDATE). صفر تغيير في الجسم نفسه.
export function dbFrom(table: DbWriteTable) {
  return db.from(table as 'cases');
}

// ⚠️ شكل عنصر واحد في طابور الأوفلاين (IndexedDB) — نفس الحقول اللي
// بيتضافوا فعليًا في __offlineEnqueue (timestamp/status) + الحقول اللي
// بيتبعتوا من __dbWrite (type/table/data/id/knownUpdatedAt). `data` لسه
// Record<string, unknown> عام عن قصد: العملية ممكن تكون لأي جدول من
// جداول التطبيق (نفس التفاوت الموثّق في useAdminBackup.ts — مش سهو).
//
// 🔎 اكتشاف (موثّق سابقًا، اتصلح بعد موافقة صريحة من المستخدم): `id` هنا
// فعليًا بيتخزن فيه قيمتين مختلفتين حسب نوع العملية — مش تسرّب لنوع غلط،
// ده تصميم مقصود من الأول: IndexedDB بيستخدم أي خاصية بنفس اسم الـ
// keyPath ('id') كـ *مفتاح السجل نفسه* لو كانت معرّفة، وبيولّد رقم تلقائي
// بس لو كانت `undefined`. يعني: عمليات INSERT بتتبعت من غير `id` (بيتولّد
// رقم تلقائي `number`)، وعمليات UPDATE/DELETE بتتبعت بالـ id الحقيقي بتاع
// السجل (`string`، من __dbWrite). النوع بقى `number | string` عشان يعكس
// الحالتين الحقيقيتين دول — صفر تغيير سلوك، تصحيح دقة نوع بس.
//
// 🔎 اكتشاف تاني (اتصلح بعد موافقة صريحة من المستخدم): `table` كانت معرّفة
// `string` عام. بحثت في كل المشروع عن كل نداء فعلي بيضيف عنصر للطابور —
// المصدر الوحيد هو __dbWrite (تحت)، اللي بينادي __offlineEnqueue بنفس قيمة
// `table: T` بتاعته (T extends DbWriteTable) وقت الفشل أونلاين. مفيش أي
// نداء تاني لـ __offlineEnqueue في المشروع كله. يعني القيمة الفعلية
// المخزّنة في IndexedDB دايمًا واحدة من التلاتة دول بالظبط — نفس النوع
// المُعرَّف فوق (DbWriteTable)، فاستخدمته هنا بدل `string` العام.
export interface OfflineQueueItem {
  id: number | string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: DbWriteTable;
  data?: Record<string, unknown>;
  knownUpdatedAt?: string | null;
  timestamp: number;
  status: string;
  // 🔒 FIX (تتبع "إضافة قضية" — 18 يوليو 2026): عدد مرات فشل المزامنة لنفس
  // العنصر ده. قبل كده، عنصر عالق (مثلاً جلسة مستنية قضية اتعرقلت) كان
  // بيحاول يتزامن كل دقيقة *للأبد* من غير أي سقف أو تنبيه واضح للمستخدم إن
  // فيه حاجة محتاجة تدخل يدوي. `undefined`/غير موجود = عنصر قديم من قبل
  // الفيكس، بنعامله كـ 0.
  retryCount?: number;
}

declare global {
  interface Window {
    __offlineEnqueue: (op: object) => Promise<boolean>;
    __getOfflineQueue: () => Promise<OfflineQueueItem[]>;
    __getOfflineQueueCount: () => Promise<number>;
    __deleteOfflineItem: (id: number | string) => Promise<void>;
    __updateOfflineItem: (item: OfflineQueueItem) => Promise<void>;
    __syncOfflineQueue: () => Promise<void>;
    // ⚠️ `table` بقى Generic (T extends DbWriteTable) بدل `string` — بيتحقق
    // وقت الكتابة إن اسم الجدول حقيقي وموجود في database.types.ts (كان ده
    // أصل الـ `any` القديم، زي نفس نمط dynFrom في useAdminBackup.ts).
    // `data` فضلت Record<string, unknown> عن قصد (مش Insert/Update الحقيقي
    // بتاع الجدول): نداء واحد فعلي (حفظ قضية أوفلاين مع جلستها الأولى في
    // useCaseActions.ts) بيبعت حقل sentinel مؤقت (`_offlineCaseTitle`) مش
    // عمود DB حقيقي — بيتحذف قبل الإدراج الفعلي وقت المزامنة. ربطها بنوع
    // صارم كان هيرفض الحقل ده غلط رغم إنه سلوك مقصود وموجود من الأول.
    // `data` المرجعة بقت `Partial<Row>` (مش `Row` الكامل) لأن مسار
    // UPDATE بيرجّع بس `updated_at` من `.select('updated_at')`، مش الصف
    // كامل — Partial بتغطي الحالتين (INSERT بيرجّع صف كامل، UPDATE بيرجّع
    // عمود واحد بس) من غير ما تدّعي شكل مش حقيقي.
    //
    // 🆕 المرحلة 1: `data` بقى ممكن يحمل كمان `_offlineFkTempId:
    // OfflineFkTempIdRef[]` (شوف تعريفها فوق) — سنتينل عام لأي عملية
    // INSERT/UPDATE محتاجة "تشاور" على سجل لسه في الطابور (مش بس
    // `_offlineCaseTempId` القديمة المقصورة على case_id). زي باقي حقول
    // الـ sentinel، بيتشال قبل أي كتابة حقيقية في القاعدة (أونلاين أو وقت
    // المزامنة) وميوصلش لـ Supabase أبدًا.
    __dbWrite: <T extends DbWriteTable>(op: {
      type: 'INSERT' | 'UPDATE' | 'DELETE';
      table: T;
      data?: Record<string, unknown>;
      id?: string;
      knownUpdatedAt?: string | null;
      returning?: boolean;
    }) => Promise<{
      error: unknown;
      offline?: boolean;
      queued?: boolean;
      data?: Partial<Database['public']['Tables'][T]['Row']> | null;
      conflict?: boolean;
    }>;
  }
}

// ══════════════════════════════════════════════════════════
//  IndexedDB — Offline Queue
// ══════════════════════════════════════════════════════════
const DB_NAME    = 'sanad-offline';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

function openOfflineDB(): Promise<IDBDatabase> {
    return new Promise((resolve: (db: IDBDatabase) => void, reject: (err: unknown) => void) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
        req.onsuccess  = () => resolve(req.result);
        req.onerror    = () => reject(req.error);
    });
}

window.__offlineEnqueue = async (operation: object): Promise<boolean> => {
    try {
        const db    = await openOfflineDB();
        const tx    = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.add({ ...operation, timestamp: Date.now(), status: 'pending' });
        await new Promise<void>((res: () => void, rej: (err: unknown) => void) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    } catch (err) {
        // BUG FIX: ده كان بيفشل بصمت من قبل — والـ caller كان يفتكر إن الحفظ
        // المحلي تم بنجاح وهو فعليًا لسه متضايع. دلوقتي بنرجّع false عشان
        // __dbWrite يقدر يبلّغ المستخدم إن الحفظ فشل فعلاً.
        console.error('[Offline] Failed to enqueue — data NOT saved locally:', err);
        return false;
    }
    // طبقة إضافية: نسجّل Background Sync لو المتصفح بيدعمها (Chrome/Android).
    // ده تحسين فوقي بس — مش الاعتماد الأساسي، لأن Safari/iOS مابيدعمهاش أصلاً.
    // الاعتماد الأساسي هو مستمع 'online' المباشر اللي تحت في نفس الملف.
    try {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            const reg = await navigator.serviceWorker.ready;
            // ⚠️ Background Sync (SyncManager) لسه مش جزء من TS lib.dom القياسية
            // (API تجريبي، Chrome/Android بس) — الكاست هنا محصور في الخاصية
            // دي بس (مش الـ registration كله زي `as any` القديمة).
            await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register('sync-offline-queue');
        }
    } catch (err) {
        // طبيعي إن ده يفشل على متصفحات مش داعمة — متجاهلين
    }
    return true;
};

window.__getOfflineQueue = async () => {
    try {
        const db    = await openOfflineDB();
        const tx    = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req   = store.getAll();
        return new Promise<OfflineQueueItem[]>((res: (items: OfflineQueueItem[]) => void, rej: (err: unknown) => void) => {
            req.onsuccess = () => res(req.result || []);
            req.onerror   = () => rej(req.error);
        });
    } catch { return []; }
};

window.__getOfflineQueueCount = async () => {
    const q = await window.__getOfflineQueue();
    return q.length;
};

window.__deleteOfflineItem = async (id: number | string) => {
    try {
        const db    = await openOfflineDB();
        const tx    = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        return new Promise<void>((res: () => void, rej: (err: unknown) => void) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    } catch (err) {
        console.error('[Offline] Failed to delete item:', err);
    }
};

// 🔒 FIX (تتبع "إضافة قضية" — 18 يوليو 2026): بنحفظ العنصر بالكامل تاني (مع
// retryCount محدَّث) بدل ما نسيبه زي ما هو في الـ IndexedDB — من غيرها،
// العداد كان هيفضل دايمًا 0/undefined وميقدرش نكتشف العناصر العالقة أبدًا.
window.__updateOfflineItem = async (item: OfflineQueueItem) => {
    try {
        const db    = await openOfflineDB();
        const tx    = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(item);
        return new Promise<void>((res: () => void, rej: (err: unknown) => void) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    } catch (err) {
        console.error('[Offline] Failed to update item:', err);
    }
};

// ══════════════════════════════════════════════════════════
//  حقول الـ sentinel المؤقتة (_offlineTempId، _offlineCaseTitle،
//  _offlineCaseTempId) مش أعمدة حقيقية في أي جدول — بيتم إنشاؤها من الكود
//  عشان تستخدم في الربط وقت المزامنة بس (شوف useCaseActions.ts). لازم
//  تتشال قبل أي INSERT حقيقي في القاعدة، أونلاين أو أوفلاين، وإلا Supabase
//  هيرفض العملية بخطأ "column does not exist".
// ══════════════════════════════════════════════════════════
// 🆕 (تقسيم offlineSync.ts — 24 أغسطس 2026): بقت exported — بتتستخدم هنا جوه
// __dbWrite (لازم تفضل eager) *و* جوه offlineSync.ts (منطق المزامنة، بيتحمّل
// lazy). عمدًا **متنقلتش** لملف المزامنة رغم إنها في نفس نطاق الأسطر اللي
// اتنقل معظمه، لأن __dbWrite (اللي لازم يفضل sync ومتاح فورًا لكل كتابة في
// التطبيق) بيستخدمها في مسار الكتابة الأونلاين العادي (سطر ~940/976 تحت) —
// نقلها كان هيضطر __dbWrite يعمل import() ديناميكي في كل عملية كتابة عادية،
// وده بالظبط اللي التقسيم ده قاصد يتجنبه.
export function stripOfflineSentinels<T extends Record<string, unknown> | undefined>(data: T): T {
    if (!data) return data;
    const cleaned: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
        if (!key.startsWith('_offline')) cleaned[key] = (data as Record<string, unknown>)[key];
    }
    return cleaned as T;
}

// 🆕 (تقسيم offlineSync.ts — 24 أغسطس 2026): `OfflineFkTempIdRef`،
// `resolveOfflineFkRefs`، و`resolveOfflineSelfId` (كانوا هنا) اتنقلوا
// لملف `offlineSync.ts` (بيتحمّل lazy عبر import() — شوف window.__syncOfflineQueue
// تحت) لأنهم مستخدمين حصريًا جوه منطق المزامنة نفسه، مفيش أي نداء ليهم في
// أي مسار eager. الاختبارات اللي كانت بتستوردهم من هنا لازم تتحدّث لتستوردهم
// من './offlineSync' بدل كده.

// ══════════════════════════════════════════════════════════
//  Offline Sync Queue — DB Write Wrapper
// ══════════════════════════════════════════════════════════
let __syncQueueRunning = false;
// 🆕 (تقسيم offlineSync.ts — 24 أغسطس 2026، بند 4 من bundle-security-review-
// verification-v2-2.md): جسم المزامنة الفعلي (~615 سطر: OFFLINE_ACTIVITY_CONFIG
// + resolveOfflineFkRefs/resolveOfflineSelfId + الحلقة الكاملة) اتنقل لملف
// offlineSync.ts منفصل، بيتحمّل بـ import() ديناميكي هنا بس أول ما المزامنة
// فعليًا تتطلب — مش جزء من الـbundle الرئيسي بعد كده.
//
// ⚠️ التعريف نفسه (window.__syncOfflineQueue) لازم يفضل *sync* ومتاح فورًا
// من غير أي await — بيتنادى بـ`?.()` (optional chaining) من 4 أماكن:
// serviceWorkerBootstrap.ts (SW message handler)، حدث 'online'، حدث 'load'،
// setInterval كل دقيقة، وجوه __dbWrite تحت. لو التعريف نفسه كان بيتحط على
// window بعد ما الـimport() يخلص (مش قبله)، أي نداء ليها قبل التحميل هيلاقيها
// undefined ويعدي بصمت من غير أي خطأ ولا retry (`?.()` بتتجاهل undefined
// بهدوء) — يعني سايكل مزامنة كامل ممكن يضيع بصمت. الحل: window.__syncOfflineQueue
// نفسها بتتعرّف sync دايمًا هنا فورًا؛ الـimport() الديناميكي بيحصل *جوه*
// جسمها وقت أول نداء بس (فيبطّئ أول نداء لحد ما الـchunk يتحمّل، مش أكتر —
// أي نداء بعد كده هيلاقي الموديول متكاش بالفعل من المتصفح).
window.__syncOfflineQueue = async () => {
    const mod = await import('./offlineSync');
    return mod.runOfflineSync();
};

// ══════════════════════════════════════════════════════════
//  المزامنة الفعلية — الاعتماد الأساسي (يشتغل في كل المتصفحات)
//  Background Sync فوق (لو الجهاز بيدعمها) ميغطّيش Safari/iOS أبدًا،
//  فمحتاجين آلية تشتغل أونلاين مباشرة كل وقت ما التطبيق مفتوح.
// ══════════════════════════════════════════════════════════
let __syncInFlight = false;
async function __runOfflineSyncIfNeeded() {
    if (__syncInFlight) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    try {
        const count = await window.__getOfflineQueueCount?.() || 0;
        if (count === 0) return;
        __syncInFlight = true;
        await window.__syncOfflineQueue?.();
    } catch (err) {
        console.error('[Offline] Sync attempt failed:', err);
    } finally {
        __syncInFlight = false;
    }
}

// 1) أول ما ترجع أونلاين — جرّب تزامن فورًا
window.addEventListener('online', () => { __runOfflineSyncIfNeeded(); });

// 2) أول ما يفتح التطبيق (لو كانت فيه عمليات معلّقة من قبل ما يتقفل المتصفح) وإنت أصلاً أونلاين
window.addEventListener('load', () => { __runOfflineSyncIfNeeded(); });

// 3) شبكة أمان إضافية — فحص دوري كل دقيقة لو فيه عمليات معلّقة ومتصل بالنت
//    (يغطي حالات نادرة زي رجوع النت من غير ما يطلق حدث 'online' بشكل موثوق)
setInterval(() => { __runOfflineSyncIfNeeded(); }, 60000);

window.__dbWrite = async function <T extends DbWriteTable>({ type, table, data, id, knownUpdatedAt, returning }: {
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    table: T;
    data?: Record<string, unknown>;
    id?: string;
    knownUpdatedAt?: string | null;
    returning?: boolean;
}) {
    // 🆕 المرحلة 3-1: لو العملية معاها `_offlineSelfTempId` (يعني الـ id
    // المستهدف بالـ UPDATE هو نفسه لسه تمبيد — مثال: `handleLinkExistingClient`
    // بيحاول يربط موكل بقضية اتعملت في `handleLinkCase` قبلها وهي أوفلاين)،
    // لازم نقيّد العملية في الطابور دايمًا حتى لو `navigator.onLine === true`
    // فعليًا دلوقتي. السبب: القضية نفسها ممكن تكون لسه معلّقة في الطابور
    // (رجع النت بس دورة المزامنة التلقائية لسه ما اشتغلتش)، فلو حاولنا
    // نبعت UPDATE مباشر أونلاين بـ `.eq('id', tempId)`، Supabase هيرجّع
    // نجاح صامت (صفر صفوف متأثرة، من غير error) لأن مفيش صف حقيقي بالـ id
    // ده — يعني المستخدم هيشوف "تم الربط" رغم إن الربط ما حصلش خالص. القيد
    // الإجباري هنا بيضمن إن العملية تتحل صح وقت المزامنة (نفس الدورة أو
    // اللي بعدها) عن طريق resolveOfflineSelfId فوق.
    const forceQueueForSelfTempId = type === 'UPDATE' && !!data?._offlineSelfTempId;
    if (navigator.onLine && !forceQueueForSelfTempId) {
        try {
            let error = null;
            let insertedRow: Partial<Database['public']['Tables'][T]['Row']> | null = null;
            let updatedRow: Partial<Database['public']['Tables'][T]['Row']> | null = null;
            if (type === 'INSERT') {
                // 🔒 FIX: `data` ممكن يحمل حقول sentinel مؤقتة (_offlineTempId...)
                // متبعتة دايمًا من useCaseActions.ts بغض النظر عن أونلاين/أوفلاين
                // (عشان لو الاتصال قطع فجأة أثناء المحاولة، يبقى معاها بيانات
                // كافية للربط وقت المزامنة اللاحقة). مش أعمدة حقيقية، فلازم
                // تتشال هنا قبل أي INSERT حقيقي أونلاين وإلا Supabase هيرفض
                // العملية بخطأ "column does not exist".
                const cleanData = stripOfflineSentinels(data);
                if (returning) {
                    // بنرجّع الصف المُدرج فعليًا (بدل ما نسيب الكولر يخمّن الـ id
                    // بإعادة استعلام بالعنوان/التاريخ — ده كان بيسبب ربط غلط
                    // في حالات نادرة زي إدخال قضيتين بنفس العنوان في نفس اللحظة)
                    const res = await dbFrom(table).insert([cleanData as Database['public']['Tables']['cases']['Insert']]).select().single();
                    error = res.error;
                    insertedRow = res.data as unknown as Partial<Database['public']['Tables'][T]['Row']> | null;
                } else {
                    ({ error } = await dbFrom(table).insert([cleanData as Database['public']['Tables']['cases']['Insert']]));
                }
            } else if (type === 'UPDATE') {
                // Optimistic Locking — online
                if (knownUpdatedAt) {
                    const { data: current, error: fetchErr } = await dbFrom(table).select('updated_at').eq('id', id as string).single();

                    if (!fetchErr && current && current.updated_at) {
                        const serverTime = new Date(current.updated_at).getTime();
                        const clientTime = new Date(knownUpdatedAt).getTime();
                        if (serverTime > clientTime) {
                            return { error: { message: 'conflict' }, conflict: true, offline: false };
                        }
                    }
                }
                // FIX: بنرجّع updated_at الجديد بعد التحديث (بدل ما نسيب الكولر
                // فاكر updated_at القديم اللي جابها هو). من غير ده، أي تعديل
                // تاني على نفس السجل بعد التعديل الأول مباشرة كان هيتكشف غلط
                // كـ"تعارض" مع نفسه (لأن آخر updated_at محفوظة عنده محليًا
                // هتفضل أقدم من اللي فعليًا في السيرفر بعد أول تعديل ناجح).
                // 🆕 المرحلة 1: بنشيل أي حقل sentinel (_offline...) قبل الإرسال
                // الفعلي هنا — كانت من غير تنظيف قبل كده (بعكس مسار INSERT فوق
                // اللي عنده stripOfflineSentinels من الأول). ما كانش ده بيسبب
                // مشكلة فعلية لحد دلوقتي لأن مفيش caller بيبعت sentinel مع
                // UPDATE وهو أونلاين، لكن مع _offlineFkTempId الجديدة (المفروض
                // تتبعت بغض النظر عن حالة الاتصال، زي _offlineCaseTempId)، لازم
                // تتشال هنا كمان وإلا Supabase هيرفض العملية.
                const cleanUpdateData = stripOfflineSentinels(data);
                const res = await dbFrom(table).update(cleanUpdateData as Database['public']['Tables']['cases']['Update']).eq('id', id as string).select('updated_at').single();
                error = res.error;
                updatedRow = res.data as unknown as Partial<Database['public']['Tables'][T]['Row']> | null;
            } else if (type === 'DELETE') {
                ({ error } = await dbFrom(table).delete().eq('id', id as string));
            }
            return { error, offline: false, data: insertedRow || updatedRow };
        } catch {
            // الشبكة بتقول أونلاين بس الطلب فشل فعليًا — نحاول نحفظ محليًا
            // 🐛 FIX (تشخيص أوفلاين — نسخة 3، 26 يوليو 2026): كان بيتبعت
            // `{ type, table, data, id, knownUpdatedAt }` بالـ shorthand
            // دايمًا — يعني في عمليات INSERT (id === undefined)، الخاصية
            // `id` كانت لسه موجودة كـ "own property" بقيمة undefined بدل
            // ما تكون غائبة تمامًا. IndexedDB بيفرّق بين الاتنين: خاصية
            // غائبة = يولّد autoIncrement، خاصية موجودة بقيمة undefined =
            // `DataError: ...key path yielded a value that is not a valid
            // key`. ده كان بيكسر أي INSERT أوفلاين فعليًا (مش بس في
            // التستات) لأن __offlineEnqueue كان بيرجع false دايمًا في
            // الحالة دي. الفيكس: منضيفش `id` للـ object أصلاً لو undefined.
            const opToQueue: Record<string, unknown> = { type, table, data, knownUpdatedAt };
            if (id !== undefined) opToQueue.id = id;
            const saved = await window.__offlineEnqueue(opToQueue);
            if (!saved) {
                // BUG FIX: قبل كان بيرجع queued:true دايمًا حتى لو فشل الحفظ في
                // IndexedDB، فالمستخدم يشوف "محفوظة محلياً" والبيانات ضايعة فعليًا.
                return { error: { message: 'فشل الاتصال بالسيرفر، وفشل الحفظ المحلي أيضاً — يرجى المحاولة مرة أخرى' }, offline: true, queued: false };
            }
            return { error: null, offline: true, queued: true };
        }
    } else {
        // نحفظ knownUpdatedAt في الـ Queue عشان نستخدمه وقت المزامنة
        // 🐛 FIX (زي أعلاه بالظبط): نفس المشكلة، وده هو المسار اللي فعليًا
        // بيتنفّذ في تستات الأوفلاين (context.setOffline(true) → navigator.onLine
        // false مباشرة) — ده كان السبب الحقيقي الوحيد لكل فشل التستات دي.
        const opToQueue: Record<string, unknown> = { type, table, data, knownUpdatedAt };
        if (id !== undefined) opToQueue.id = id;
        const saved = await window.__offlineEnqueue(opToQueue);
        if (!saved) {
            // BUG FIX: نفس المشكلة — هنا كانت أوضح، لأن المستخدم فعليًا offline
            // وملوش طريقة تانية يحفظ بيها، فلو IndexedDB فشلت (مساحة تخزين ممتلئة،
            // متصفح Private/Incognito، أو خطأ غير متوقع) كانت البيانات تتفقد بصمت
            // والمستخدم يفتكر إنها "محفوظة محلياً" زي ما الرسالة كانت بتقوله.
            return { error: { message: 'فشل الحفظ محلياً — تأكد من توفر مساحة تخزين كافية في المتصفح، أو إنك مش في وضع التصفح الخفي (Private/Incognito)' }, offline: true, queued: false };
        }
        // 🆕 المرحلة 3-1: لو الوصول للفرع ده كان بسبب forceQueueForSelfTempId
        // (يعني إحنا أونلاين فعليًا، بس مضطرين نقيّد لحد ما القضية تتزامن)،
        // منعرضش بانر "أوفلاين" المضلل (المستخدم مش أوفلاين فعليًا)، وبدل ما
        // نستنى دورة المزامنة الدورية (كل دقيقة) أو حدث 'online' (مش هيتفعّل
        // لأننا already أونلاين)، بنحاول مزامنة فورية دلوقتي (best-effort،
        // fire-and-forget) — لو القضية اتزامنت خلاص من دورة سابقة، العملية
        // دي هتتحل وتتنفذ في نفس اللحظة تقريبًا بدل ما تستنى لحد 60 ثانية.
        if (navigator.onLine && forceQueueForSelfTempId) {
            window.__syncOfflineQueue?.();
        } else {
            const count = await window.__getOfflineQueueCount?.() || 0;
            showOfflineBanner(count);
        }
        return { error: null, offline: true, queued: true };
    }
};

// ══════════════════════════════════════════════════════════
//  إشعارات حالة الشبكة (أونلاين/أوفلاين) — بانر + مؤشر مزامنة
//  🐛 FIX (البانر البرتقالي بيفضل ثابت حتى بعد رجوع النت — 9 أغسطس
//  2026): المستمعين على 'network-offline'/'network-online' تحت
//  كانوا بيعتمدوا على CustomEvent بنفس الاسمين — بس مفيش أي كود في
//  المشروع كله كان بيعمل dispatchEvent لهم فعليًا. النتيجة: البانر
//  كان بيظهر (من showOfflineBanner المستدعاة من IIFE تحت أو من
//  __dbWrite وقت محاولة كتابة أوفلاين)، بس مفيش أي مسار حقيقي كان
//  بيقفله (hideOfflineBanner) لما النت يرجع تاني — المستخدم يفضل شايف
//  البانر البرتقالي "أنت الآن offline" للأبد لحد ما يعمل refresh
//  للصفحة بنفسه. الفيكس: نربط المستمعين دول بأحداث المتصفح الحقيقية
//  'online'/'offline' مباشرة (بدل الأحداث المخصصة اللي محدش بيبعتها).
// ══════════════════════════════════════════════════════════
// 🐛 FIX (اللوج الجديد بعد الفيكس السابق — 9 أغسطس 2026): كان الـlistener
// بينتظر (await) نتيجة __getOfflineQueueCount قبل ما ينادي showOfflineBanner
// أصلاً — يعني ظهور البانر نفسه (مش بس رقم البادج) كان معلّق على نداء
// غير متزامن مالوش داعي يوقف عرض البانر. النتيجة: تأخير حقيقي (ولو بسيط)
// في ظهور بانر "أنت أوف لاين" بعد الحدث فعليًا، وده اللي كان بيخلي تست
// "showOfflineBanner بتتنادى" يفشل أحيانًا (توقيت الـmicrotask بتاع await
// مش مضمون يتغطى بعدد محدد من "await Promise.resolve()" في التست).
// الحل: نعرض البانر فورًا (بدون انتظار)، وبعدين لما الرقم يوصل نحدّث
// البادج بنداء تاني — pendingCount اختياري أصلاً (افتراضيًا 0) ومالوش
// تأثير على ظهور البانر نفسه، بس بيتحكم في نص البادج جواه بس.
window.addEventListener('offline', () => {
    showOfflineBanner();
    (async () => {
        const count = await window.__getOfflineQueueCount?.() || 0;
        showOfflineBanner(count);
    })();
});
window.addEventListener('online', async () => {
    hideOfflineBanner();
    // 🐛 FIX (جزء من فيكس البانر فوق): showSyncIndicator منعرضهاش إلا لو
    // فيه فعليًا عمليات معلّقة (count > 0) — لأن __syncOfflineQueue بترجع
    // فورًا من غير ما تقفل المؤشر لو الطابور فاضي، فكان ممكن مؤشر
    // "جاري المزامنة..." يفضل ظاهر للأبد في أكتر الحالات (رجوع نت عادي
    // من غير أي عملية معلّقة أصلاً).
    const count = await window.__getOfflineQueueCount?.() || 0;
    if (count > 0) showSyncIndicator('جاري المزامنة...');
});
if (!navigator.onLine) {
    // 🐛 FIX (نفس فيكس listener الـ'offline' فوق): نفس المبدأ — نعرض
    // البانر فورًا عند تحميل الصفحة لو أوف لاين من الأساس، من غير ما
    // نستنى نداء غير متزامن للرقم الأول.
    showOfflineBanner();
    (async () => {
        const count = await window.__getOfflineQueueCount?.() || 0;
        showOfflineBanner(count);
    })();
}
