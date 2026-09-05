// ══════════════════════════════════════════════════════════════
//  offlineGuard — نفس نمط الحماية المستخدم في useDbConnectivity.ts
//  و useAuthProfile.ts (فحص navigator.onLine أولاً + سقف 8 ثواني
//  AbortController)، مستخرج هنا كمكان مشترك عشان يتطبق على شاشات
//  القراءة (القضايا/الموكلين/التذكيرات/الجلسات) من غير تكرار نفس
//  الكود 5 مرات.
//
//  ⚡ NEW (فيكس "تأخير محسوس عند التنقل بين الأقسام أوف لاين" —
//  9 أغسطس 2026): قبل كده كل شاشة/تاب كانت بتنادي db.from(...)
//  مباشرة من غير أي فحص أو سقف زمني — لو النت ضعيف/متقطع (مش أوف
//  لاين بالكامل بحيث navigator.onLine يبقى false)، الطلب كان بيفضل
//  معلّق لحد ما يفشل من نفسه (وقت غير محدد حسب المتصفح/الشبكة) قبل
//  ما يرجع للكاش. دلوقتي: 1) لو navigator.onLine=false من الأساس،
//  منحاولش نتصل بالسيرفر خالص ونروح للكاش فورًا، 2) لو هنحاول
//  الاتصال فعلاً، بنقفله بعد 8 ثواني كحد أقصى.
// ══════════════════════════════════════════════════════════════

import { classifyError } from '../../systemHealth';

export interface FetchGuard {
    /** true لو navigator.onLine=false من الأساس (مفيش داعي نحاول نتصل خالص) */
    offline: boolean;
    /** AbortController جاهز — مرّره لـ .abortSignal(guard.controller.signal) */
    controller: AbortController;
    /** استخدمها بعد ما catch تمسك خطأ، عشان تعرف السبب كان timeout ولا لأ */
    didTimeOut: () => boolean;
    /** لازم تتنادى في finally عشان تلغي الـ setTimeout لو الطلب خلص قبل الوقت */
    cleanup: () => void;
}

export function createFetchGuard(timeoutMs = 8000): FetchGuard {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = offline ? null : setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    return {
        offline,
        controller,
        didTimeOut: () => timedOut,
        cleanup: () => { if (timeoutId) clearTimeout(timeoutId); },
    };
}

// ══════════════════════════════════════════════════════════════
//  🔒 NEW (تقرير فحص أعطال الأوف لاين — 13 أغسطس 2026): فحوصات التكرار
//  (رقم قيد القضية / بيانات الموكل) بتتنفذ *قبل* أي INSERT/UPDATE فعلي في
//  5 دوال حفظ، وكانت بتنادي db.from(...) مباشرة من غير أي وعي بحالة
//  الاتصال — يعني أوف لاين، الفحص نفسه بيفشل (مفيش نت يوصله للسيرفر)،
//  والـ catch حوله كان بيعرض توست خطأ ويوقف العملية بالكامل (return false)
//  من غير ما توصل خالص لـ window.__dbWrite (المكان الوحيد اللي فيه منطق
//  التقييد في طابور الأوفلاين).
//
//  runDuplicateCheckOfflineAware بتلف نداء فحص التكرار بنفس منطق
//  createFetchGuard: لو أوف لاين من الأساس أو الفحص عدّى الـ8 ثواني
//  (تايم آوت)، بترجع skipped:true (يعني "أجّل الفحص، السيرفر هيرفض
//  التكرار وقت المزامنة الفعلية على أي حال عن طريق الـUNIQUE index") بدل
//  ما توقف الحفظ. أي خطأ حقيقي تاني (مش أوف لاين ولا تايم آوت) بيتعاد
//  رميه زي ما هو عشان المنادي يفضل يعامله بنفس الأسلوب القديم (توست خطأ +
//  إيقاف الحفظ).
// ══════════════════════════════════════════════════════════════

export interface DuplicateCheckOutcome<T> {
    /** true = الفحص اتأجل (أوف لاين أو تايم آوت) — مفيش نتيجة فعلية، كمّل الحفظ عادي */
    skipped: boolean;
    result?: T;
}

export async function runDuplicateCheckOfflineAware<T>(
    checkFn: (signal: AbortSignal) => Promise<T>,
    timeoutMs = 8000
): Promise<DuplicateCheckOutcome<T>> {
    const guard = createFetchGuard(timeoutMs);
    if (guard.offline) return { skipped: true };
    try {
        const result = await checkFn(guard.controller.signal);
        return { skipped: false, result };
    } catch (e) {
        if (guard.didTimeOut()) return { skipped: true };
        throw e;
    } finally {
        guard.cleanup();
    }
}

// ══════════════════════════════════════════════════════════════
//  🔁 runReadWithRetry — خطة "تصنيف الرسائل ودورة حياة العمليات"،
//  بند ٣-ج (٥ سبتمبر ٢٠٢٦، بعد قرار ٣-ب: Retry تلقائي للقراءة بس).
//
//  ليه هنا مش في systemHealth.ts: القراءة الفعلية في المشروع (db_cases/
//  db_dashboard/...) بتستخدم نمط Supabase {data, error} (createFetchGuard
//  فوق بالظبط)، مش throw-based، فـ`runTrackedOperation` (systemHealth.ts)
//  مش الشكل المناسب هنا. الأداة دي بتلف *نفس* نمط createFetchGuard
//  الموجود فعلاً في كل نقطة قراءة، وبتضيف إعادة محاولة تلقائية بس لما
//  يكون فيه دليل إن الفشل عابر (transient) — التصنيف بيتحدد بنفس
//  `classifyError` المستخدم في systemHealth.ts، عشان معيار واحد بس في
//  المشروع كله لتحديد "هل الخطأ ده يستاهل إعادة محاولة".
//
//  ✅ بترجّع retry بس لو التصنيف `timeout` أو `network` (الاتنين transient
//     فعلاً، وأكتر احتمال يزول لوحده). أي تصنيف تاني (`session`/
//     `permission`/`server`) بيرجع فورًا من غير إعادة محاولة — إعادة
//     محاولة خطأ منطقي/صلاحية/سيرفر حقيقي مش هتغيّر النتيجة.
//  ✅ لو `navigator.onLine === false` وقت أي محاولة، بترجع فورًا من غير
//     إعادة محاولة تانية — بالظبط نفس فلسفة `createFetchGuard.offline`.
//  ✅ Opt-in بحتة: أي نقطة قراءة قديمة تفضل زي ما هي (صفر تغيير) لحد ما
//     تتحول بنفسها لاستخدام الدالة دي.
// ══════════════════════════════════════════════════════════════

export interface ReadRetryOptions {
    /** إجمالي عدد المحاولات (شاملة الأولى). افتراضي: 2 (يعني محاولة إضافية واحدة بس). */
    maxAttempts?: number;
    /** مدة الانتظار قبل أول إعادة محاولة، بالميلي ثانية. كل محاولة تالية تتضاعف (backoff بسيط). افتراضي: 800ms. */
    baseDelayMs?: number;
    /**
     * بينادَى قبل كل إعادة محاولة (مش قبل المحاولة الأولى) — استخدمها لعرض
     * مؤشر بسيط للمستخدم (زي toast('جارِ إعادة المحاولة...')). attempt هو
     * رقم المحاولة الجاية (2 يعني "بنعمل المحاولة التانية دلوقتي").
     */
    onRetry?: (attempt: number, maxAttempts: number) => void;
}

export interface ReadAttemptOutcome<T> {
    error: unknown;
    /** لازم تتحط بس لو مفيش error — أي شكل بيانات يحتاجه المنادي (data/count/إلخ). */
    result?: T;
}

export interface ReadRetryResult<T> extends ReadAttemptOutcome<T> {
    /** عدد المحاولات اللي فعليًا اتنفذت (1 يعني نجحت أو فشلت من غير إعادة محاولة). */
    attempts: number;
}

/**
 * ينفّذ `attemptFn` مرة، ولو فشلت بخطأ transient (timeout/network) وفيه
 * محاولات باقية وإحنا أونلاين، يعيد المحاولة تلقائيًا. `attemptFn` مسؤولة
 * عن فحص `guard.offline` بنفسها وبناء الـerror المناسب (بالظبط زي أي نقطة
 * قراءة موجودة حاليًا) — الدالة دي بس بتوفّر guard جديد لكل محاولة
 * وتقرر هل تعيد المحاولة ولا لأ.
 */
export async function runReadWithRetry<T>(
    attemptFn: (guard: FetchGuard) => Promise<ReadAttemptOutcome<T>>,
    opts: ReadRetryOptions = {}
): Promise<ReadRetryResult<T>> {
    const maxAttempts = Math.max(1, opts.maxAttempts ?? 2);
    const baseDelayMs = opts.baseDelayMs ?? 800;
    let outcome: ReadAttemptOutcome<T> = { error: null };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const guard = createFetchGuard();
        try {
            outcome = await attemptFn(guard);
        } catch (err) {
            outcome = { error: guard.didTimeOut() ? { message: 'timeout' } : err };
        } finally {
            guard.cleanup();
        }

        if (!outcome.error) return { ...outcome, attempts: attempt };

        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        const classification = classifyError(outcome.error);
        const isTransient = classification === 'timeout' || classification === 'network';
        const attemptsLeft = attempt < maxAttempts;

        if (isOffline || !isTransient || !attemptsLeft) return { ...outcome, attempts: attempt };

        opts.onRetry?.(attempt + 1, maxAttempts);
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }

    return { ...outcome, attempts: maxAttempts };
}
