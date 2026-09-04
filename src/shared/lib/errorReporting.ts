import { recordError, recordSuccess } from '../../systemHealth';
import { toast } from './notifications';
import type { ServiceKey } from '../../systemHealth';

/**
 * دالة موحدة لعرض رسالة خطأ للمستخدم وتسجيل التفصيل الخام داخليًا في نفس الوقت.
 * تختصر التكرار اليدوي لنمط: استخراج رسالة الخطأ الخام → recordError → toast،
 * اللي كان متكرر نصًا واحدًا في كل الأماكن اللي فيها معالجة أخطاء بعد التوحيد.
 *
 * rawError: أي قيمة استثناء (Error، نص، أو أي شيء تاني) — بيتحول لنص خام
 *           ويتسجل بس عن طريق recordError (console/localStorage)، ومبيتعرضش للمستخدم خالص.
 * message:  الرسالة العربية الجاهزة والآمنة اللي يشوفها المستخدم في التوست
 *           وفي بانر صحة النظام لو رجع نفس الخطأ تاني.
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
  // غير كده هيا هترجع "[object Object]" ويضيع النص الخام المهم للتسجيل.
  const rawMessage =
    rawError == null ? ''
    : typeof rawError === 'string' ? rawError
    : (typeof rawError === 'object' && 'message' in rawError && typeof (rawError as { message?: unknown }).message === 'string')
      ? (rawError as { message: string }).message
      : String(rawError);
  recordError(key, rawMessage, { label, message });
  toast('❌ ' + message, true);
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
