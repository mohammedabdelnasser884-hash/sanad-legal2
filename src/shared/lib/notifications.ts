// إشعارات الواجهة: toast
// 🔒 FIX (تشخيص لوجز E2E — 1 أغسطس 2026): كل نداء لـtoast() كان بيجدول
// setTimeout منفصل لإزالة كلاس 'show' بعد 3.4 ثانية، من غير إلغاء أي
// setTimeout سابق لسه شغّال. لو توستان حصلوا في وقت قريب من بعض (مثلاً:
// رفع مستند ثم حذفه بعد أقل من 3.4 ثانية)، الـtimeout الأول كان بيمسح
// 'show' بدري وهو لسه المفروض يعرض رسالة التوست الثاني — يعني التوست
// التاني بيختفي بصريًا (أو بيبقى غير مرئي لـPlaywright) قبل مدته الطبيعية.
// الحل: نحتفظ بمعرّف الـtimeout الحالي ونلغيه قبل ما نجدول واحد جديد.
let toastHideTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(msg: string, isErr = false) {
    const el = document.getElementById('toast');
    if (!el) return;
    if (toastHideTimer !== null) clearTimeout(toastHideTimer);
    el.textContent = msg;
    (el as HTMLElement).style.borderColor = isErr ? '#f87171' : '#D4AF37';
    (el as HTMLElement).style.color = isErr ? '#f87171' : '#D4AF37';
    el.classList.add('show');
    toastHideTimer = setTimeout(() => { el.classList.remove('show'); toastHideTimer = null; }, 3400);
}

// 🗑️ المرحلة 2 (إلغاء الأوفلاين في الكتابة، 13 سبتمبر 2026):
// showOfflineBanner/hideOfflineBanner/showSyncIndicator/hideSyncIndicator
// اتشالوا — كانوا مستخدمين فقط من offlineQueue.ts/offlineSync.ts (المحذوفين)
// وتستاتهم، لتنبيه المستخدم بحالة طابور الكتابة الأوفلاين اللي بقى مش موجود.

export async function flushPendingSubscription() {
    if (window.__pendingSubscription) {
        await window.__savePushSubscription(window.__pendingSubscription);
        window.__pendingSubscription = null;
    }
}
