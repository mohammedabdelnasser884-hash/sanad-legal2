// ══════════════════════════════════════════════════════════════════
//  subscriptionLimitModal — بديل الـtoast لرسائل P0001 (حد الباقة) و
//  E2 (قفل read-only بسبب حالة الاشتراك) — قرار تصميم UX جديد من بي
//  (9 سبتمبر 2026، آخر قسم في تقرير "إعادة ضبط باقات بوابة إدارة
//  المكاتب"): بدل توست عابر، مودال مخصص فيه وصف المشكلة + روابط تواصل
//  (فيسبوك/إيميل/واتساب — الموقع الرسمي هيتضاف لاحقًا).
//
//  نفس فلسفة toast()/showOfflineBanner() في notifications.ts: دالة
//  عادية قابلة للنداء من أي هوك عميق (useCaseCrudActions،
//  useAdminUsers، useAdminPortal...) من غير ما تحتاج تكون جوه شجرة
//  React عندها access لـstate المودال. الفرق إن محتوى المودال ديناميكي
//  (نص + أزرار)، فمينفعش نتعامل مع DOM element ثابت زي #toast — لازم
//  React state فعلي، فاستخدمنا pub/sub بسيط بدل useState محلي: أي
//  مكوّن (هنا SubscriptionLimitModal واحد بس، مُركّب مرة واحدة في
//  App.tsx) يقدر يعمل subscribe ويعيد الرندر لما الرسالة تتغيّر.
// ══════════════════════════════════════════════════════════════════

type Listener = (message: string | null) => void;

let currentMessage: string | null = null;
const listeners = new Set<Listener>();

/** يفتح المودال برسالة معينة (نص الـtrigger P0001 الجاهز، أو رسالة القفل الثابتة E2). */
export function showSubscriptionLimitModal(message: string): void {
  currentMessage = message;
  listeners.forEach((l) => l(currentMessage));
}

/** يقفل المودال (بعد ما المستخدم يدوس "فهمت"/زرار التواصل، أو من برّه المودال). */
export function hideSubscriptionLimitModal(): void {
  currentMessage = null;
  listeners.forEach((l) => l(currentMessage));
}

/** يشترك في تغييرات الرسالة الحالية. بيرجع دالة unsubscribe (نمط useEffect عادي). */
export function subscribeSubscriptionLimitModal(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentMessage);
  return () => {
    listeners.delete(listener);
  };
}
