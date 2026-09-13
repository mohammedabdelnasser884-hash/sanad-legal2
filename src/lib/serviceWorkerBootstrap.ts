// ══════════════════════════════════════════════════════════
//  Service Worker Registration + PWA Install Prompt
//  منقول من main.tsx (اتفصل بتاريخ 15 يوليو 2026 كجزء من خطة
//  تخفيف main.tsx).
// ══════════════════════════════════════════════════════════

// لازم export واحد على الأقل عشان تيبسكريبت يعامل الملف كموديول
// (لا سكريبت عام)، وإلا `declare global` تحت بيبقى غير صالح (TS2669).
export {};

declare global {
  interface Window {
    __swReady: boolean;
    __swRegistration: ServiceWorkerRegistration | null;
    __pendingSubscription: PushSubscription | null;
    __savePushSubscription: (sub: PushSubscription) => Promise<void>;
    __pwaInstallPrompt: BeforeInstallPromptEvent | null;
    __VAPID_PUBLIC_KEY: string;
  }
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }
}

window.__swReady = false;
window.__swRegistration = null;

// PWA Install prompt
window.__pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    window.__pwaInstallPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent('pwa-installable'));
});
window.addEventListener('appinstalled', () => {
    window.__pwaInstallPrompt = null;
    window.dispatchEvent(new CustomEvent('pwa-installed'));
});

// Service Worker registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            window.__swRegistration = reg;
            window.__swReady = true;
            // 🔒 FIX (24 أغسطس 2026 — بند 6 من تقرير الأمان، تنضيف اختياري):
            // شيل console.log هنا كان محاط أصلاً بـ if(DEV) وبيتشال تلقائيًا
            // في build الإنتاج (Vite بيشيل بلوكات import.meta.env.DEV غير
            // القابلة للتحقق) — شيل السطر بالكامل استجابة لملاحظة التقرير.

            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        window.dispatchEvent(new CustomEvent('sw-update-available'));
                    }
                });
            });

            // 🗑️ المرحلة 2 (إلغاء الأوفلاين في الكتابة، 13 سبتمبر 2026): مستمع
            // رسالة SYNC_OFFLINE_QUEUE من الـService Worker اتشال — كان بينادي
            // window.__syncOfflineQueue (اللي اتشالت بالكامل من offlineQueue.ts
            // بعد حذف طابور الأوفلاين). الـService Worker (sw.js) نفسه بقى
            // مبعتش الرسالة دي أصلاً بعد حذف Background Sync منه.
        } catch (err) {
            console.warn('[App] Service Worker registration failed:', err);
        }
    });
}
