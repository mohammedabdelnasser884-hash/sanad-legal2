/**
 * systemHealth — نظام متابعة صحة الخدمات
 * ─────────────────────────────────────────
 * يسجّل نجاح أو فشل أي عملية في التطبيق (جلب بيانات، حفظ، تيليجرام، ...)
 * ويخزّنها في localStorage، وينشر إيفنت فوري (HEALTH_EVENT) لتحديث
 * بانر الأخطاء في الصفحة الرئيسية لحظة حدوث المشكلة من أي مكان في الكود،
 * بدون داعي لأي شاشة تكون مفتوحة وقتها.
 */

import { getEdgeFunctionErrorMessage, looksArabicUserMessage, type EdgeFunctionError } from './shared/lib/edgeFunctionErrors';

// ─── مفاتيح معروفة (لها اسم ورسالة جاهزة بالعربي) ───────────────────────────
// أي مفتاح تاني غير الموجودين هنا لسه يعمل بشكل طبيعي، وهياخد اسم/رسالة
// عامة افتراضية إلا لو تم تمرير label/message مخصصة عند التسجيل.
export type KnownServiceKey =
  | 'telegram'
  | 'db_cases'
  | 'db_cases_search'
  | 'db_clients'
  | 'db_sessions'
  | 'db_reminders'
  | 'db_dashboard'
  | 'db_fees'
  | 'db_documents'
  | 'session_scheduler'
  | 'office_login'
  | 'app_general'
  // 🔀 FIX (20 أغسطس 2026 — طلب المستخدم بعد استفسار عن بانر "عملية في
  // النظام" غامض): المفاتيح دي كانت بتُستخدم فعليًا في recordError() في
  // أماكن مختلفة (useAppData.ts/AppModals.tsx/ClientsTab.tsx) من غير اسم
  // عربي مخصص، فكانت كلها بتظهر بنفس العنوان العام المُربك "عملية في
  // النظام" (resolveLabel/friendlyError كانوا بيرجعوا للـfallback العام
  // لأي مفتاح مش في القاموس ده). إضافتهم هنا كمفاتيح معروفة بترجّع كل
  // واحد لاسمه ورسالته الواضحة المناسبة، من غير أي تعديل في مكان
  // الاستدعاء نفسه (الملف ده هو المصدر المركزي الوحيد).
  | 'db_case_parties'
  | 'db_case_by_id'
  | 'db_sessions_by_case_ids'
  | 'db_clients_by_id'
  | 'db_cases_by_id'
  | 'db_case_parties_by_client'
  | 'db_cases_by_client_id'
  | 'db_case_parties_by_client_ids'
  // ⚡ FIX (23 أغسطس 2026 — أول تشغيل CI حقيقي لميزة توليد المستندات
  // القانونية اتفشل: انتظار زرار "توليد المستند" علّق 10 ثواني بعد
  // اختيار القالب، مرتين متتاليتين، من غير أي خطأ واضح). useGenerateDocument.ts
  // كان الاستثناء الوحيد في المشروع اللي بينادي db.from(...) لتحميل حقول
  // القالب/بيانات القضية من غير createFetchGuard — نفس فئة باج 9 أغسطس
  // (docs/fees). لو فيه أي تعليق شبكة حقيقي، الفورم كان هيفضل عالق على
  // "جارِ تحميل الحقول..." للأبد بدل ما يبين خطأ. مضاف هنا بنفس النمط.
  | 'db_document_generation';

// أي مفتاح: من القائمة المعروفة فوق، أو أي نص مخصص من أي شاشة في التطبيق
export type ServiceKey = KnownServiceKey | string;

export interface ServiceStatus {
  key: ServiceKey;
  label: string;           // اسم الخدمة بالعربي
  status: 'ok' | 'error' | 'unknown';
  lastSuccess: string | null;   // ISO timestamp
  lastError: string | null;     // ISO timestamp
  errorMsg: string | null;      // رسالة الخطأ بلغة المستخدم
  // ⚡ [جديد] نص الخطأ التقني الخام من Supabase/Postgres، لو موجود —
  // بيتعرض كتفصيلة صغيرة تحت الرسالة الودودة في بانر الداشبورد، عشان
  // لو المشكلة اتكررت نقدر نشخّصها من غير ما نحتاج نوصل للوجز/الترمينال
  // (الشغل كله من الموبايل من غير أي وصول لطرفية).
  rawError: string | null;
  // 🆕 FIX (٤ سبتمبر ٢٠٢٦ — طلب المستخدم بعد بلاغ عن نفس رسالة الخطأ
  // ظاهرة مرتين في نفس اللحظة): عداد تكرار لنفس المفتاح خلال نافذة زمنية
  // قصيرة (DEDUPE_WINDOW_MS تحت)، عشان لو نفس العملية فشلت أكتر من مرة
  // ورا بعض تظهر كارت واحد بعداد "(×٣)" بدل ما تتكرر بصريًا.
  occurrenceCount?: number;
}

// ─── إيفنت التحديث الفوري ────────────────────────────────────────────────
// أي recordError/recordSuccess في أي ملف في التطبيق ينشر هذا الإيفنت،
// والصفحة الرئيسية مستمعة له فتحدّث البانر فورًا.
export const HEALTH_EVENT = 'sanad-health-changed';

function broadcastHealthChange() {
  try { window.dispatchEvent(new Event(HEALTH_EVENT)); } catch { /* ignore */ }
}

// ─── أسماء الخدمات المعروفة بالعربي ──────────────────────────────────────

const SERVICE_LABELS: Record<KnownServiceKey, string> = {
  telegram:          'إشعارات تيليجرام',
  db_cases:          'جلب القضايا',
  db_cases_search:   'البحث في القضايا',
  db_clients:        'جلب الموكلين',
  db_sessions:       'جلب الجلسات',
  db_reminders:      'جلب التذكيرات',
  db_dashboard:      'تحميل الرئيسية',
  db_fees:           'جلب الأتعاب',
  db_documents:      'تحميل الجلسات والمستندات',
  session_scheduler: 'جدولة الإشعارات التلقائية',
  office_login:      'تسجيل الدخول',
  app_general:       'النظام',
  db_case_parties:               'جلب أطراف القضية',
  db_case_by_id:                 'جلب بيانات القضية',
  db_sessions_by_case_ids:       'جلب جلسات القضايا',
  db_clients_by_id:              'جلب بيانات الموكل',
  db_cases_by_id:                'جلب القضايا المرتبطة',
  db_case_parties_by_client:     'جلب قضايا الموكل',
  db_cases_by_client_id:         'جلب قضايا الموكل',
  db_case_parties_by_client_ids: 'جلب قضايا الموكلين',
  db_document_generation:        'تحميل قوالب المستندات',
};

function isKnownKey(key: ServiceKey): key is KnownServiceKey {
  return Object.prototype.hasOwnProperty.call(SERVICE_LABELS, key);
}

function resolveLabel(key: ServiceKey, fallbackLabel?: string): string {
  if (isKnownKey(key)) return SERVICE_LABELS[key];
  return fallbackLabel || 'عملية في النظام';
}

// ─── رسائل الخطأ بلغة المستخدم (واضحة وبسيطة، من غير تفاصيل تقنية) ───────

const KNOWN_ERROR_MSGS: Record<KnownServiceKey, string> = {
  telegram:          'تعذّر إرسال إشعار تيليجرام. تحقق من إعدادات البوت أو الاتصال بالإنترنت.',
  db_cases:          'تعذّر تحميل قائمة القضايا. تحقق من الاتصال بالإنترنت.',
  db_cases_search:   'تعذّر البحث في القضايا. تحقق من الاتصال بالإنترنت.',
  db_clients:        'تعذّر تحميل قائمة الموكلين. تحقق من الاتصال بالإنترنت.',
  db_sessions:       'تعذّر تحميل الجلسات. تحقق من الاتصال بالإنترنت.',
  db_reminders:      'تعذّر تحميل التذكيرات. تحقق من الاتصال بالإنترنت.',
  db_dashboard:      'تعذّر تحميل بيانات الرئيسية. تحقق من الاتصال بالإنترنت.',
  db_fees:           'تعذّر تحميل بيانات الأتعاب. تحقق من الاتصال بالإنترنت.',
  db_documents:      'تعذّر تحميل جلسات/مستندات هذه القضية. تحقق من الاتصال بالإنترنت.',
  session_scheduler: 'توقف نظام الإشعارات التلقائية. أعد فتح التطبيق.',
  office_login:      'تعذّر تسجيل الدخول. تحقق من اتصال الإنترنت وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.',
  app_general:       'حصلت مشكلة في النظام. تحقق من اتصال الإنترنت أو حاول تاني.',
  db_case_parties:               'تعذّر تحميل بيانات أطراف القضية. تحقق من الاتصال بالإنترنت.',
  db_case_by_id:                 'تعذّر تحميل بيانات هذه القضية. تحقق من الاتصال بالإنترنت.',
  db_sessions_by_case_ids:       'تعذّر تحميل الجلسات المرتبطة بالقضايا. تحقق من الاتصال بالإنترنت.',
  db_clients_by_id:              'تعذّر تحميل بيانات الموكل. تحقق من الاتصال بالإنترنت.',
  db_cases_by_id:                'تعذّر تحميل القضايا المرتبطة. تحقق من الاتصال بالإنترنت.',
  db_case_parties_by_client:     'تعذّر تحميل قضايا هذا الموكل. تحقق من الاتصال بالإنترنت.',
  db_cases_by_client_id:         'تعذّر تحميل قضايا هذا الموكل. تحقق من الاتصال بالإنترنت.',
  db_case_parties_by_client_ids: 'تعذّر تحميل عدد قضايا الموكلين. تحقق من الاتصال بالإنترنت.',
  db_document_generation:        'تعذّر تحميل حقول القالب أو بيانات القضية. تحقق من الاتصال بالإنترنت.',
};

/** رسالة بسيطة بالعربي يفهمها صاحب المكتب، حتى لو المفتاح غير معروف */
export function friendlyError(key: ServiceKey, rawError?: string, fallbackMsg?: string): string {
  // 🔧 FIX (٤ سبتمبر ٢٠٢٦): قبل كده لو المفتاح معروف (زي app_general) كان
  // بيرجّع نص القاموس العام دايمًا، حتى لو الاستدعاء نفسه معاه رسالة أدق
  // ومحسوبة خصيصًا لسياق الخطأ ده (زي اللي بيحسبها installGlobalErrorWatcher
  // تحت — بتوصف العملية اللي فشلت فعليًا) — فالرسالة الأدق كانت بتتترمي
  // وتتستبدل بنص عام. دلوقتي أي رسالة صريحة ممررة مع الاستدعاء (fallbackMsg)
  // ليها الأولوية دايمًا، ورجوع لقاموس المفاتيح المعروفة بس لو مفيش رسالة
  // صريحة ممررة.
  if (fallbackMsg) return fallbackMsg;
  if (isKnownKey(key)) return KNOWN_ERROR_MSGS[key];
  // 🆕 تشخيص: أي مفتاح مش معروف ومفيش له رسالة صريحة بيوصل لرسالة عامة
  // غامضة للمستخدم — نسجّل في الـconsole اسم المفتاح بالظبط عشان نلاقي
  // مصدره بسهولة في المرة الجاية بدل التخمين (يتلقط تلقائيًا في أي
  // Playwright trace أو في الـconsole وقت الدعم عن بعد).
  console.warn(`[systemHealth] مفتاح غير معروف بلا رسالة مخصصة: "${key}" — رجع للرسالة العامة الافتراضية.`);
  return 'حصلت مشكلة في تنفيذ العملية دي. تحقق من اتصال الإنترنت أو حاول تاني.';
}

// ─── Storage ──────────────────────────────────────────────────────────────

const LS_KEY = 'sanad_health'; // تخزين محلي لحالة الخدمات

// نافذة تجميع التكرار: أي فشل لنفس المفتاح خلال ٣٠ ثانية من الفشل السابق
// يتحسب تكرار لنفس الحادثة (occurrenceCount)، مش حادثة جديدة منفصلة.
const DEDUPE_WINDOW_MS = 30_000;

function loadAll(): Record<string, ServiceStatus> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }

  // القيم الافتراضية للمفاتيح المعروفة بس — أي مفتاح مخصص بيتسجل أول ما يُستخدم
  const defaults = {} as Record<string, ServiceStatus>;
  (Object.keys(SERVICE_LABELS) as KnownServiceKey[]).forEach((key: KnownServiceKey) => {
    defaults[key] = {
      key,
      label: SERVICE_LABELS[key],
      status: 'unknown',
      lastSuccess: null,
      lastError: null,
      errorMsg: null,
      rawError: null,
    };
  });
  return defaults;
}

function saveAll(data: Record<string, ServiceStatus>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * سجّل نجاح عملية.
 * key: أي مفتاح معروف (db_cases, telegram...) أو نص مخصص لعملية جديدة.
 */
export function recordSuccess(key: ServiceKey, label?: string) {
  const all = loadAll();
  all[key] = {
    ...all[key],
    key,
    label: resolveLabel(key, label || all[key]?.label),
    status: 'ok',
    lastSuccess: new Date().toISOString(),
    errorMsg: null,
    rawError: null,
    occurrenceCount: 0,
  };
  saveAll(all);
  broadcastHealthChange();
}

/**
 * سجّل فشل عملية — هيظهر فورًا كبانر في الصفحة الرئيسية.
 * key: أي مفتاح معروف، أو نص مخصص يوصف العملية (مثلاً 'fees_save', 'reminder_delete').
 * rawError: رسالة الخطأ التقنية (تُستخدم فقط لو مفيش رسالة جاهزة للمفتاح).
 * label/message: لمفتاح مخصص، ممكن تمرر اسم وعرض بالعربي مفهومين لغير المبرمج.
 */
export function recordError(key: ServiceKey, rawError?: string, opts?: { label?: string; message?: string }) {
  // 🔎 FIX (تحليل لوجز E2E — 30 أغسطس 2026): rawError كان بيتسجل بس جوه
  // localStorage — متاح للمستخدم الحقيقي في المتصفح، لكن مافيش أي طريقة
  // يوصله بيها حد بيقرا لوجز CI بعد ما التشغيلة تخلص (زي فشل admin-backup.
  // spec.ts المتكرر: توست عام "تعذّر حفظ النسخة الاحتياطية" من غير أي
  // تفاصيل، والسبب الحقيقي — رفض RLS/قيد قاعدة بيانات/إلخ — ضايع تمامًا).
  // console.error بيتسجل تلقائيًا جوه trace.zip بتاع أي تست فاشل (playwright
  // بيلتقط console الصفحة في الـtrace من غير أي إعداد إضافي)، فيبقى ممكن
  // نشوف السبب الخام فعليًا بفتح الـtrace (npx playwright show-trace) بدل
  // ما يفضل مقفول جوه localStorage المتصفح بس.
  if (rawError) console.error(`[recordError:${key}] ${rawError}`);
  const all = loadAll();
  // 🆕 FIX (٤ سبتمبر ٢٠٢٦ — dedupe بصري لنفس المفتاح): لو نفس المفتاح فشل
  // تاني خلال نافذة قصيرة (DEDUPE_WINDOW_MS)، منزودش كارت جديد ولا نعتبره
  // حدث منفصل — بنزوّد عداد occurrenceCount بس، وبانر الداشبورد يعرضه
  // كـ"(×٣)" بدل ما يفضل يفتح كارت لكل تكرار.
  const prev = all[key];
  const prevErrorAt = prev?.lastError ? new Date(prev.lastError).getTime() : 0;
  const withinDedupeWindow = prev?.status === 'error' && (Date.now() - prevErrorAt) < DEDUPE_WINDOW_MS;
  all[key] = {
    ...prev,
    key,
    label: resolveLabel(key, opts?.label || prev?.label),
    status: 'error',
    lastError: new Date().toISOString(),
    errorMsg: friendlyError(key, rawError, opts?.message),
    rawError: rawError || null,
    occurrenceCount: withinDedupeWindow ? (prev?.occurrenceCount || 1) + 1 : 1,
  };
  saveAll(all);
  broadcastHealthChange();
}

/** جيب كل الخدمات اللي فيها خطأ */
export function getFailedServices(): ServiceStatus[] {
  const all = loadAll();
  return (Object.values(all) as ServiceStatus[]).filter((s: ServiceStatus) => s.status === 'error');
}

/** جيب حالة خدمة معينة */
export function getServiceStatus(key: ServiceKey): ServiceStatus {
  return loadAll()[key];
}

/** امسح خطأ خدمة (بعد ما المستخدم يعمل retry ناجح) */
export function clearError(key: ServiceKey) {
  recordSuccess(key);
}

// ─── تصنيف الأخطاء + Operation Lifecycle ──────────────────────────────────
// (خطة "تصنيف الرسائل ودورة حياة العمليات"، ٥ سبتمبر ٢٠٢٦ — قسم ١ + قسم ٢
// المرحلة أ فقط. لا تعديل على أي نقطة recordError/showErrorToast قائمة.)

export type ErrorClassification = 'session' | 'permission' | 'timeout' | 'network' | 'server';

/**
 * تصنيف سبب فشل عملية — evidence-first مش network-first: الدليل اللي جوه
 * الخطأ نفسه (session/permission/timeout) له أولوية دايمًا، وفحص الشبكة
 * اللحظي (navigator.onLine) يبقى آخر حاجة نلجأ لها كـfallback لو مفيش أي
 * دليل تاني — كونه أوفلاين لحظة كتابة الرسالة مش دليل إن ده كان السبب
 * الحقيقي وراء الفشل.
 */
export function classifyError(rawError: unknown): ErrorClassification {
  const err = rawError as { code?: string; message?: string } | null | undefined;
  const message = err?.message || '';

  if (/JWT|session|refresh_token/i.test(message)) return 'session';
  if (err?.code === '42501' || /permission denied|RLS/i.test(message)) return 'permission';
  // 🔧 تصحيح (فحص كود فعلي وقت التنفيذ): المسودة الأولى كانت بتفترض خاصية
  // `didTimeOut` على الخطأ نفسه — دي مش موجودة فعليًا في أي مكان بالمشروع.
  // النمط الحقيقي (createFetchGuard + didTimeOut() في offlineGuard.ts،
  // مستخدم في ~20 نقطة زي useDashboardFeed.ts/useAppData.ts/useRemindersTab.ts/
  // useFeesActions.ts وغيرهم) بيبني كائن خطأ صناعي `{ message: 'timeout' }`
  // بالحرف لما `guard.didTimeOut()` ترجع true، مش خاصية على الخطأ الأصلي.
  if (message === 'timeout') return 'timeout';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'network';
  return 'server';
}

/** سياق خطأ موحّد — يمنع كل مستهلك لاحق (Retry مستقبلي، عرض بانر عام،
 * observability) من إعادة تفكيك الـraw error بطريقته الخاصة. */
export interface NormalizedErrorContext {
  rawError: unknown;
  classification: ErrorClassification;
  safeMessage: string;
  operationKey: ServiceKey;
  operationLabel: string;
}

/**
 * استخراج نص الخطأ الحقيقي للتخزين — حسب شكل الخطأ فعليًا، مش `.message`
 * موحّد للكل. **ممنوع استخدام `(rawError as Error)?.message` كـfallback
 * عام** لأنه بيفشل مع FunctionsHttpError (رسالته الحقيقية جوه
 * context.json()/.text() بشكل async، مش في .message المباشر — نفس النص
 * العام "Edge Function returned a non-2xx status code" اللي كان بيتسرب
 * للمستخدم قبل إصلاحه في خطة "إعادة تصميم رسائل الأخطاء").
 */
async function extractSafeErrorText(rawError: unknown): Promise<string | undefined> {
  const asEdgeFnError = rawError as EdgeFunctionError | null | undefined;
  if (
    asEdgeFnError?.context &&
    (typeof asEdgeFnError.context.json === 'function' || typeof asEdgeFnError.context.text === 'function')
  ) {
    const extracted = await getEdgeFunctionErrorMessage(asEdgeFnError);
    if (extracted && looksArabicUserMessage(extracted)) return extracted;
  }
  // PostgrestError وError العادي عندهم .message مباشر ومفيد
  return (rawError as { message?: string } | null | undefined)?.message;
}

/**
 * يلف أي عملية (نجاح/فشل) ويضمن تسجيل دورة حياتها تلقائيًا في systemHealth
 * — مستحيل تنسى recordSuccess لأنها جوه الدالة نفسها. **قرار محسوم: مفيش
 * تحويل لأي نقطة recordError/showErrorToast قائمة (٦٩ نقطة) — الدالة دي
 * foundation للعمليات الجديدة بس، والتحويل التدريجي بيحصل مع أي لمسة
 * مستقبلية طبيعية لنفس الملف.**
 */
export async function runTrackedOperation<T>(
  key: ServiceKey,
  opts: { label: string; message: string },
  fn: () => Promise<T>
): Promise<{ ok: true; data: T } | { ok: false; failure: NormalizedErrorContext }> {
  try {
    const data = await fn();
    recordSuccess(key);
    return { ok: true, data };
  } catch (rawError) {
    const classification = classifyError(rawError);
    const safeErrorText = await extractSafeErrorText(rawError);
    recordError(key, safeErrorText, opts);
    return {
      ok: false,
      failure: {
        rawError,
        classification,
        safeMessage: opts.message,
        operationKey: key,
        operationLabel: opts.label,
      },
    };
  }
}

/**
 * شبكة أمان عامة: تمسك أي خطأ JS أو Promise مرفوض من غير catch في أي حتة
 * في التطبيق، وتسجّله كتنبيه عام في الصفحة الرئيسية. تتنادى مرة واحدة بس
 * عند بداية تشغيل التطبيق (main.tsx).
 */
// خاصية داخلية بتمنع تركيب الـ watcher أكتر من مرة — مش موجودة في نوع
// Window القياسي، فمحتاجة توسيع محلي هنا (نفس نمط __pwaInstallPrompt في main.tsx).
declare global {
  interface Window {
    __healthWatcherInstalled?: boolean;
  }
}

export function installGlobalErrorWatcher() {
  if (typeof window === 'undefined') return;
  if (window.__healthWatcherInstalled) return;
  window.__healthWatcherInstalled = true;

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason: unknown = event?.reason;
    // ⚠️ reason ممكن يكون أي حاجة (Error, نص، أو كائن مخصص) — كاست بسيط
    // زي نفس أسلوب (e as Error)?.message المستخدم في useTelegramAlerts.ts.
    const msg = (reason as { message?: string })?.message || (typeof reason === 'string' ? reason : 'خطأ غير متوقع');
    // 🆕 FIX (٤ سبتمبر ٢٠٢٦ — تشخيص دقيق بدل التخمين): لو الاستثناء عنده
    // stack trace بنسجله في الـconsole (بيتلقط تلقائيًا في أي trace.zip بتاع
    // Playwright أو في console وقت الدعم عن بعد) عشان لو نفس الخطأ ده اتكرر
    // نقدر نلاقي بالظبط مين الاستدعاء اللي فلت من غير try/catch مخصص، بدل
    // ما نفضل نخمن من نص الرسالة بس.
    const stack = (reason as { stack?: string })?.stack;
    if (stack) console.error('[installGlobalErrorWatcher:unhandledrejection] فلت من غير try/catch مخصص —\n', stack);
    // نحاول نستنتج العملية من رسالة الخطأ، ونشتق منها مفتاح تخزين مخصص
    // (مش 'app_general' ثابت دايمًا) — عشان أسباب مختلفة فعليًا تتسجل
    // كإدخالات منفصلة بدل ما تتكتب فوق بعض، وعشان الـdedupe في recordError
    // يشتغل صح على كل سبب لوحده.
    const category = msg.includes('fetch') || msg.includes('network') ? 'network'
      : msg.includes('cases') ? 'cases'
      : msg.includes('clients') ? 'clients'
      : msg.includes('sessions') ? 'sessions'
      : msg.includes('fees') ? 'fees'
      : msg.includes('reminders') ? 'reminders'
      : 'unknown';
    const label = category === 'network' ? 'الاتصال بالإنترنت'
      : category === 'cases' ? 'جلب القضايا'
      : category === 'clients' ? 'جلب الموكلين'
      : category === 'sessions' ? 'جلب الجلسات'
      : category === 'fees' ? 'جلب الأتعاب'
      : category === 'reminders' ? 'جلب التذكيرات'
      : 'عملية غير متوقعة';
    const message = category === 'network'
      ? 'تعذّر الاتصال بقاعدة البيانات. تحقق من الإنترنت وأعد المحاولة.'
      : `حصل خطأ غير متوقع في ${label}. أعد تحميل التطبيق أو تواصل مع الدعم.`;
    recordError(`app_general_${category}`, msg, { label, message });
  });

  window.addEventListener('error', (event: ErrorEvent) => {
    // نتجاهل أخطاء تحميل الموارد (صور/سكريبتات) عشان مايبقاش فيه ضوضاء
    if (event?.target && event.target !== window) return;
    if (event?.error?.stack) console.error('[installGlobalErrorWatcher:error] خطأ JS غير ملتقط —\n', event.error.stack);
    recordError('app_general_unknown', event?.message, {
      label: 'عملية غير متوقعة',
      message: 'حصل خطأ غير متوقع. أعد تحميل التطبيق، ولو المشكلة استمرت تواصل مع الدعم.',
    });
  });
}

/** فورمات التوقيت بالعربي */
export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1)   return 'منذ لحظات';
    if (diffMins < 60)  return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays === 1) return 'منذ يوم';
    return `منذ ${diffDays} يوم`;
  } catch { return '—'; }
}
