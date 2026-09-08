import { recordError, recordSuccess } from '../../systemHealth';
import { toast } from './notifications';
import type { ServiceKey } from '../../systemHealth';

// ─────────────────────────────────────────────────────────────────────────
// 🆕 E2 + E3 (خطة المرحلة 15 — قفل الاشتراك/حدود الباقات، 8 سبتمبر 2026)
// ─────────────────────────────────────────────────────────────────────────
// مصدرين مختلفين لرفض عملية كتابة بسبب حالة الاشتراك، ولازم رسالة عربية
// واضحة للمستخدم في الاتنين بدل الرسالة العامة (opts.errorMessage) اللي
// كل نقطة نداء بتبعتها حاليًا:
//
//  1) E3 — حد الباقة (Triggers B1-B3/B4-B6، 15-04-usage-limit-triggers.sql):
//     الـtrigger نفسه بيعمل RAISE EXCEPTION برسالة عربية جاهزة ومفهومة
//     ("وصلت للحد الأقصى لعدد القضايا النشطة (50) في باقتك الحالية...").
//     الكود PostgREST بيرجعها زي ما هي في error.message، لكن showErrorToast
//     كانت بتعرض opts.errorMessage الثابت بدل ما تعرضها — يعني الرسالة
//     الجيدة دي كانت بتتشال وتتستبدل برسالة عامة. الحل: لو error.code
//     === 'P0001' (كود RAISE EXCEPTION العادي في Postgres) نعرض
//     error.message نفسها زي ما هي (مفيش تخمين على نصها).
//
//  2) E2 — رفض كتابة بسبب القفل (RESTRICTIVE policies من C3،
//     tenant_write_allowed_*): الرفض ده Postgres RLS violation خام
//     (كود 42501)، رسالته تقنية مش مفهومة للمستخدم العادي. الحل: لو
//     الكود 42501 ورسالة الخطأ فيها اسم سياساتنا (بادئة
//     "tenant_write_allowed") — يعني الرفض ده تحديدًا بسبب حالة
//     الاشتراك مش أي RLS تانية — نستبدلها برسالة عربية ثابتة.
//
// الاتنين اختياريين تمامًا (best-effort): لو الرسالة مش من الحالتين دول،
// opts.errorMessage الأصلية بتتعرض زي ما كانت بالظبط — صفر تغيير سلوك
// لأي خطأ تاني غير مرتبط بالاشتراك.
function getSubscriptionAwareMessage(rawError: unknown): string | null {
  if (rawError == null || typeof rawError !== 'object') return null;
  const err = rawError as { message?: unknown; code?: unknown };
  const message = typeof err.message === 'string' ? err.message : '';
  const code = typeof err.code === 'string' ? err.code : '';

  // E3 — رسالة حد الباقة من الـtrigger نفسها (جاهزة، مفيش داعي نصيغها تاني)
  if (code === 'P0001' && message) return message;

  // E2 — رفض كتابة بسبب read-only (فترة سماح/تجربة مشاهدة/60 يوم)
  if (code === '42501' && message.includes('tenant_write_allowed')) {
    return 'الحساب في وضع مشاهدة فقط دلوقتي (الاشتراك محتاج تجديد، أو التجربة في مرحلة المشاهدة) — التعديل مش متاح. كلّم الإدارة لتأكيد الدفع أو ترقية الباقة.';
  }

  return null;
}

/**
 * دالة موحدة لعرض رسالة خطأ للمستخدم وتسجيل التفصيل الخام داخليًا في نفس الوقت.
 * تختصر التكرار اليدوي لنمط: استخراج رسالة الخطأ الخام → recordError → toast،
 * اللي كان متكرر نصًا واحدًا في كل الأماكن اللي فيها معالجة أخطاء بعد التوحيد.
 *
 * rawError: أي قيمة استثناء (Error، نص، أو أي شيء تاني) — بيتحول لنص خام
 *           ويتسجل بس عن طريق recordError (console/localStorage)، ومبيتعرضش للمستخدم خالص.
 * message:  الرسالة العربية الجاهزة والآمنة اللي يشوفها المستخدم في التوست
 *           وفي بانر صحة النظام لو رجع نفس الخطأ تاني — إلا لو rawError طلعت
 *           من حالة اشتراك معروفة (E2/E3 فوق)، وقتها بتتستبدل تلقائيًا.
 * key:      مفتاح الخدمة (زي 'case_document_upload') يتسجل بيه في نظام صحة الخدمات.
 * label:    اسم الخدمة بالعربي، يظهر في بانر الصحة لو الـ key مش من المفاتيح المعروفة مسبقًا.
 */
export function showErrorToast(
  key: ServiceKey,
  rawError: unknown,
  message: string,
  label?: string,
): void {
  // ⚠️ مهم: أخطاء Supabase (PostgrestError، StorageError...) كائنات عادية فيها
  // .message لكنها مش instanceof Error، فمينفعش نعتمد على instanceof بس —
  // غير كده هيا هترجع \"[object Object]\" ويضيع النص الخام المهم للتسجيل.
  const rawMessage =
    rawError == null ? ''
    : typeof rawError === 'string' ? rawError
    : (typeof rawError === 'object' && 'message' in rawError && typeof (rawError as { message?: unknown }).message === 'string')
      ? (rawError as { message: string }).message
      : String(rawError);
  const finalMessage = getSubscriptionAwareMessage(rawError) ?? message;
  recordError(key, rawMessage, { label, message: finalMessage });
  toast('❌ ' + finalMessage, true);
}

// ─────────────────────────────────────────────────────────────────────────
// 🆕 Operation Lifecycle (خطة إعادة تصميم رسائل الأخطاء، P1 — ٤ سبتمبر ٢٠٢٦)
// ─────────────────────────────────────────────────────────────────────────
// المشكلة اللي دي بتحلها: ٦٧ من ٦٩ مفتاح `recordError` في الكود ملهم نظير
// `recordSuccess` مقابل — يعني لو عملية فشلت مرة، البانر بتاعها يفضل معلّق
// للأبد حتى لو نجحت بعد كده، لحد ما المستخدم يقفله يدوي. الحل التكتيكي
// اللي كان موجود (إضافة `recordSuccess(key)` يدويًا بعد كل نجاح، زي ما
// حصل لـ`session_save`/`session_delete`) بيحل المشكلة لمفتاحين بس، لكنه
// نمط بيعتمد على إن كل مطوّر يفتكر يضيفه في كل نقطة نجاح جديدة — ده أثبت
// إنه بيعيد إنتاج نفس الفجوة مع أي Feature جديدة.
//
// الحل الجذري هنا: مسح الخطأ عند النجاح بقى **جزء تلقائي من استدعاء واحد**
// بدل استدعائين منفصلين (واحد للنجاح، واحد للفشل) ممكن يتنسوا أو يتفصلوا
// عن بعض بمرور الوقت. فيه شكلين بيغطوا نمطين الاستخدام الفعليين في الكود:
//
// 1) `reportOperationResult` — لعمليات بترجع `{ error }` (زي `window.__dbWrite`،
//    أو أي نتيجة Supabase مباشرة) بدل ما ترمي استثناء. استدعاء واحد بيقرر
//    نجاح/فشل ويسجّل الحالة المناسبة تلقائيًا، ويرجع boolean للتحكم في
//    تدفق الكود (return لو فشلت).
// 2) `runTracked` — لعمليات بتترمي استثناء (نمط try/catch العادي اللي
//    بيغطي أغلب استخدامات `showErrorToast` الحالية). بيلف الدالة الأصلية،
//    ويسجّل نجاح/فشل تلقائيًا حسب نتيجتها.
//
// ملحوظة تبني: الشكلين دول إضافة جنب `showErrorToast`/`recordError`
// الحاليين، مش استبدال لهم — أي كود قديم لسه شغال زي ما هو. الترحيل
// (migration) لباقي المفاتيح الـ٦٧ بيحصل تدريجيًا ملف بملف، مش دفعة واحدة،
// عشان كل نقطة تتراجع بعناية (تأكيد إن لحظة "النجاح" الفعلية في الكود هي
// نفسها لحظة استدعاء recordSuccess القديم، مش قبلها أو بعدها بخطوة).

/**
 * لعمليات بترجع `{ error }` بدل ما ترمي استثناء (زي `window.__dbWrite`).
 * استدعاء واحد بيغطي الحالتين: لو `error` موجودة بيعمل toast + recordError
 * (زي showErrorToast بالظبط) ويرجع false؛ لو مفيش error بيعمل recordSuccess
 * تلقائيًا ويرجع true. الكولر بيستخدم القيمة المرجعة للتحكم في التدفق
 * (زي `if (!reportOperationResult(...)) return;`).
 */
export function reportOperationResult(
  key: ServiceKey,
  error: unknown | null | undefined,
  opts: { errorMessage: string; label?: string },
): boolean {
  if (error) {
    showErrorToast(key, error, opts.errorMessage, opts.label);
    return false;
  }
  recordSuccess(key, opts.label);
  return true;
}

/**
 * لعمليات بترجع Promise وبترمي استثناء عند الفشل (نمط try/catch العادي).
 * بيلف `fn`: لو نجحت بيعمل recordSuccess تلقائيًا ويرجع نتيجتها؛ لو فشلت
 * بيعمل toast + recordError (زي showErrorToast) ويرجع `undefined` بدل ما
 * يرمي الاستثناء تاني (الكولر يتحقق من `undefined` للتمييز بين نجاح
 * برجعة فاضية ونجاح حقيقي حسب طبيعة `fn` عنده).
 */
export async function runTracked<T>(
  key: ServiceKey,
  fn: () => Promise<T>,
  opts: { errorMessage: string; label?: string },
): Promise<T | undefined> {
  try {
    const result = await fn();
    recordSuccess(key, opts.label);
    return result;
  } catch (e) {
    showErrorToast(key, e, opts.errorMessage, opts.label);
    return undefined;
  }
}
