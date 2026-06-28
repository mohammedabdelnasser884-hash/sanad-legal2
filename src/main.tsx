import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { db } from './supabaseClient';
import { showOfflineBanner, hideOfflineBanner, showSyncIndicator, hideSyncIndicator, toast } from './utils';
import { installGlobalErrorWatcher } from './systemHealth';

// شبكة أمان: تمسك أي خطأ غير متوقع (JS error أو Promise مرفوض بلا catch)
// من أي مكان في التطبيق وتسجّله كتنبيه في الصفحة الرئيسية
installGlobalErrorWatcher();

// ══════════════════════════════════════════════════════════
//  Service Worker Registration
// ══════════════════════════════════════════════════════════
declare global {
  interface Window {
    __swReady: boolean;
    __swRegistration: ServiceWorkerRegistration | null;
    __offlineEnqueue: (op: object) => Promise<boolean>;
    __getOfflineQueue: () => Promise<any[]>;
    __getOfflineQueueCount: () => Promise<number>;
    __deleteOfflineItem: (id: number) => Promise<void>;
    __syncOfflineQueue: () => Promise<void>;
    __pendingSubscription: PushSubscription | null;
    __savePushSubscription: (sub: PushSubscription) => Promise<void>;
    __pwaInstallPrompt: BeforeInstallPromptEvent | null;
    __VAPID_PUBLIC_KEY: string;
    __dbWrite: (op: {
      type: 'INSERT' | 'UPDATE' | 'DELETE';
      table: string;
      data?: any;
      id?: any;
      knownUpdatedAt?: any;
      returning?: boolean;
    }) => Promise<{ error: any; offline?: boolean; queued?: boolean }>;
  }
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }
}

window.__swReady = false;
window.__swRegistration = null;

// ══════════════════════════════════════════════════════════
//  IndexedDB — Offline Queue
// ══════════════════════════════════════════════════════════
const DB_NAME    = 'sanad-offline';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

function openOfflineDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e: any) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
        req.onsuccess  = (e: any) => resolve(e.target.result);
        req.onerror    = (e: any) => reject(e.target.error);
    });
}

window.__offlineEnqueue = async (operation: object): Promise<boolean> => {
    try {
        const db    = await openOfflineDB();
        const tx    = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.add({ ...operation, timestamp: Date.now(), status: 'pending' });
        await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = rej; });
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
            await (reg as any).sync.register('sync-offline-queue');
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
        return new Promise<any[]>((res, rej) => { req.onsuccess = () => res(req.result || []); req.onerror = rej; });
    } catch { return []; }
};

window.__getOfflineQueueCount = async () => {
    const q = await window.__getOfflineQueue();
    return q.length;
};

window.__deleteOfflineItem = async (id: number) => {
    try {
        const db    = await openOfflineDB();
        const tx    = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        return new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = rej; });
    } catch (err) {
        console.error('[Offline] Failed to delete item:', err);
    }
};

// PWA Install prompt
window.__pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
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
            if (import.meta.env.DEV) console.log('[App] Service Worker registered ✓', reg.scope);

            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        window.dispatchEvent(new CustomEvent('sw-update-available'));
                    }
                });
            });

            navigator.serviceWorker.addEventListener('message', async (event) => {
                if (event.data?.type === 'SYNC_OFFLINE_QUEUE') {
                    await window.__syncOfflineQueue?.();
                }
            });
        } catch (err) {
            console.warn('[App] Service Worker registration failed:', err);
        }
    });
}

// ══════════════════════════════════════════════════════════
//  Error Boundary
// ══════════════════════════════════════════════════════════
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {err: Error | null, showDetails: boolean}> {
    constructor(p: any) { super(p); this.state = { err: null, showDetails: false }; }
    static getDerivedStateFromError(e: Error) { return { err: e }; }
    render() {
        if (this.state.err) {
            return React.createElement('div', {
                style: {
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    minHeight: '100vh', padding: '32px 24px', fontFamily: 'Cairo,sans-serif',
                    direction: 'rtl', background: '#070d1a', textAlign: 'center'
                }
            },
                // أيقونة
                React.createElement('div', {
                    style: { width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', marginBottom: '24px' }
                }, '⚠️'),

                // العنوان
                React.createElement('p', {
                    style: { fontSize: '18px', fontWeight: '900', color: '#f1f5f9', marginBottom: '8px' }
                }, 'حدث خطأ غير متوقع'),

                // الرسالة
                React.createElement('p', {
                    style: { fontSize: '13px', color: '#94a3b8', marginBottom: '32px', maxWidth: '280px', lineHeight: '1.7' }
                }, 'نأسف على هذا الإزعاج. يمكنك إعادة تحميل التطبيق وستعود بياناتك كما هي.'),

                // زر إعادة التحميل
                React.createElement('button', {
                    onClick: () => window.location.reload(),
                    style: {
                        padding: '14px 32px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                        fontSize: '14px', fontWeight: '900', fontFamily: 'Cairo,sans-serif',
                        background: 'linear-gradient(135deg,#D4AF37,#E8C84A)', color: '#070d1a',
                        marginBottom: '24px', boxShadow: '0 4px 20px rgba(212,175,55,0.3)'
                    }
                }, '🔄 إعادة تحميل التطبيق'),

                // تفاصيل الخطأ للمطور — مخفية افتراضياً
                React.createElement('button', {
                    onClick: () => this.setState(s => ({ showDetails: !s.showDetails })),
                    style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#475569', fontFamily: 'Cairo,sans-serif' }
                }, this.state.showDetails ? '▲ إخفاء التفاصيل' : '▼ تفاصيل تقنية'),

                this.state.showDetails && React.createElement('pre', {
                    style: {
                        marginTop: '12px', fontSize: '10px', whiteSpace: 'pre-wrap', color: '#fca5a5',
                        background: 'rgba(239,68,68,0.08)', padding: '12px', borderRadius: '8px',
                        border: '1px solid rgba(239,68,68,0.2)', textAlign: 'left', direction: 'ltr',
                        maxWidth: '100%', overflowX: 'auto'
                    }
                }, String(this.state.err?.message || this.state.err))
            );
        }
        return this.props.children;
    }
}

// ══════════════════════════════════════════════════════════
//  Offline Sync Queue — DB Write Wrapper
// ══════════════════════════════════════════════════════════
let __syncQueueRunning = false;
window.__syncOfflineQueue = async function() {
    // BUG FIX: القفل ده كان موجود فقط في __runOfflineSyncIfNeeded، لكن
    // Service Worker بينده على __syncOfflineQueue مباشرة عند Background Sync
    // (تحت)، فكان ممكن العمليتين تتنفذوا في نفس الوقت وتعمل INSERT مكرر
    // لنفس القضية. دلوقتي القفل بقى جوه الدالة نفسها فيغطي كل المصادر.
    if (__syncQueueRunning) return;
    __syncQueueRunning = true;
    try {
    const queue = await window.__getOfflineQueue?.() || [];
    if (queue.length === 0) return;
    showSyncIndicator(`جاري مزامنة ${queue.length} عملية...`);
    let successCount = 0, failCount = 0;
    for (const op of queue) {
        try {
            let error = null;
            let conflict = false;

            if (op.type === 'INSERT') {
                // BUG-20 FIX: جلسة مرتبطة بقضية أوفلاين — نجيب الـ id الحقيقي أولاً
                if (op.table === 'case_sessions' && op.data._offlineCaseTitle) {
                    const { data: caseRow } = await db
                        .from('cases')
                        .select('id')
                        .eq('title', op.data._offlineCaseTitle)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    if (!caseRow) {
                        // القضية لسه مش اتزامنت — نفضل في الـ queue ونكمل
                        failCount++;
                        continue;
                    }
                    op.data = { ...op.data, case_id: caseRow.id };
                    delete op.data._offlineCaseTitle;
                }
                ({ error } = await db.from(op.table).insert([op.data]));
            } else if (op.type === 'UPDATE') {
                // Optimistic Locking — نتحقق إن السجل مش اتعدل من حد تاني
                if (op.knownUpdatedAt) {
                    const { data: current, error: fetchErr } = await db
                        .from(op.table).select('updated_at').eq('id', op.id).single();

                    if (!fetchErr && current) {
                        const serverTime = new Date(current.updated_at).getTime();
                        const clientTime = new Date(op.knownUpdatedAt).getTime();
                        if (serverTime > clientTime) {
                            // تعارض — مش هنكتب فوق تعديل حد تاني
                            conflict = true;
                        }
                    }
                }
                if (!conflict) {
                    ({ error } = await db.from(op.table).update(op.data).eq('id', op.id));
                }
            } else if (op.type === 'DELETE') {
                ({ error } = await db.from(op.table).delete().eq('id', op.id));
            }

            if (conflict) {
                // نحذف العملية من الـ Queue ونعدّ كـ conflict
                await window.__deleteOfflineItem(op.id);
                failCount++;
            } else if (!error) {
                await window.__deleteOfflineItem(op.id);
                successCount++;
            } else {
                // BUG FIX: كان بيتجاهل تفاصيل الخطأ تمامًا، فمستحيل تعرف ليه
                // عملية معينة فاضلة عالقة في الـ queue ومش بتتزامن أبدًا
                // (مثلاً قيمة مفقودة مطلوبة، أو RLS بترفض الإدراج).
                console.error('[Offline Sync] فشلت عملية', op.type, op.table, '—', error?.message || error);
                failCount++;
            }
        } catch (err) {
            console.error('[Offline Sync] استثناء غير متوقع في عملية', op.type, op.table, '—', err);
            failCount++;
        }
    }
    if (successCount > 0 && failCount === 0) {
        hideSyncIndicator(`✅ تمت المزامنة — ${successCount} عملية`);
        toast(`✅ تمت المزامنة (${successCount} عملية)`);
    } else if (failCount > 0) {
        hideSyncIndicator(`⚠️ تمت جزئياً (${successCount}/${successCount + failCount})`);
    } else { hideSyncIndicator(); }
    window.dispatchEvent(new CustomEvent('offline-sync-complete'));
    } finally {
        __syncQueueRunning = false;
    }
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

(window as any).__dbWrite = async function({ type, table, data, id, knownUpdatedAt }: any) {
    if (navigator.onLine) {
        try {
            let error = null;
            if (type === 'INSERT') {
                ({ error } = await db.from(table).insert([data]));
            } else if (type === 'UPDATE') {
                // Optimistic Locking — online
                if (knownUpdatedAt) {
                    const { data: current, error: fetchErr } = await db
                        .from(table).select('updated_at').eq('id', id).single();

                    if (!fetchErr && current) {
                        const serverTime = new Date(current.updated_at).getTime();
                        const clientTime = new Date(knownUpdatedAt).getTime();
                        if (serverTime > clientTime) {
                            return { error: { message: 'conflict' }, conflict: true, offline: false };
                        }
                    }
                }
                ({ error } = await db.from(table).update(data).eq('id', id));
            } else if (type === 'DELETE') {
                ({ error } = await db.from(table).delete().eq('id', id));
            }
            return { error, offline: false };
        } catch {
            // الشبكة بتقول أونلاين بس الطلب فشل فعليًا — نحاول نحفظ محليًا
            const saved = await window.__offlineEnqueue({ type, table, data, id, knownUpdatedAt });
            if (!saved) {
                // BUG FIX: قبل كان بيرجع queued:true دايمًا حتى لو فشل الحفظ في
                // IndexedDB، فالمستخدم يشوف "محفوظة محلياً" والبيانات ضايعة فعليًا.
                return { error: { message: 'فشل الاتصال بالسيرفر، وفشل الحفظ المحلي أيضاً — يرجى المحاولة مرة أخرى' }, offline: true, queued: false };
            }
            return { error: null, offline: true, queued: true };
        }
    } else {
        // نحفظ knownUpdatedAt في الـ Queue عشان نستخدمه وقت المزامنة
        const saved = await window.__offlineEnqueue({ type, table, data, id, knownUpdatedAt });
        if (!saved) {
            // BUG FIX: نفس المشكلة — هنا كانت أوضح، لأن المستخدم فعليًا offline
            // وملوش طريقة تانية يحفظ بيها، فلو IndexedDB فشلت (مساحة تخزين ممتلئة،
            // متصفح Private/Incognito، أو خطأ غير متوقع) كانت البيانات تتفقد بصمت
            // والمستخدم يفتكر إنها "محفوظة محلياً" زي ما الرسالة كانت بتقوله.
            return { error: { message: 'فشل الحفظ محلياً — تأكد من توفر مساحة تخزين كافية في المتصفح، أو إنك مش في وضع التصفح الخفي (Private/Incognito)' }, offline: true, queued: false };
        }
        const count = await window.__getOfflineQueueCount?.() || 0;
        showOfflineBanner(count);
        return { error: null, offline: true, queued: true };
    }
};

// ══════════════════════════════════════════════════════════
//  Last Seen Heartbeat — يحدّث آخر نشاط كل 2 دقيقة
//  ويُسجّل الجهاز والمتصفح مرة واحدة عند الدخول
// ══════════════════════════════════════════════════════════
(async function initLastSeenHeartbeat() {
    let dbRef: any = null;
    try { dbRef = (await import('./supabaseClient')).db; } catch(e){ return; }

    const detectBrowser = () => {
        const ua = navigator.userAgent;
        if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
        if (ua.includes('Edg')) return 'Edge';
        return 'متصفح غير معروف';
    };
    const detectOS = () => {
        const ua = navigator.userAgent;
        if (/Android/i.test(ua)) return 'Android';
        if (/iPhone|iPad/i.test(ua)) return 'iOS';
        if (/Windows/i.test(ua)) return 'Windows';
        if (/Mac/i.test(ua)) return 'Mac';
        if (/Linux/i.test(ua)) return 'Linux';
        return 'غير معروف';
    };

    const updateLastSeen = async () => {
        const { data: { session } } = await dbRef.auth.getSession();
        if (!session?.user) return;
        const browser = detectBrowser() + ' - ' + detectOS();
        // جلب IP من Supabase auth metadata (متاح في session)
        const ipAddr = (session as any)?.user?.last_sign_in_at ? null : null; // placeholder
        await dbRef.from('profiles').update({
            last_seen_at: new Date().toISOString(),
            last_seen_browser: browser,
            last_seen_device: /Mobi|Android/i.test(navigator.userAgent) ? 'هاتف محمول 📱' : 'جهاز سطح مكتب 💻',
        }).eq('user_id', session.user.id);
    };

    // تحديث فوري عند الفتح
    setTimeout(updateLastSeen, 3000);
    // heartbeat كل 5 دقايق
    setInterval(updateLastSeen, 300000);
    // تحديث عند أي نشاط (click/keydown)
    let lastActivity = 0;
    const onActivity = () => {
        const now = Date.now();
        if (now - lastActivity > 60000) { lastActivity = now; updateLastSeen(); }
    };
    document.addEventListener('click', onActivity, { passive: true });
    document.addEventListener('keydown', onActivity, { passive: true });
})();

window.addEventListener('network-offline', async () => {
    const count = await window.__getOfflineQueueCount?.() || 0;
    showOfflineBanner(count);
});
window.addEventListener('network-online', () => {
    hideOfflineBanner();
    showSyncIndicator('جاري المزامنة...');
});
(async () => {
    if (!navigator.onLine) {
        const count = await window.__getOfflineQueueCount?.() || 0;
        showOfflineBanner(count);
    }
})();

// ══════════════════════════════════════════════════════════
//  Mount — بعد تعريف كل الـ globals عشان Service Worker
//  يلاقيها جاهزة لو طلب sync قبل أو أثناء أول render
// ══════════════════════════════════════════════════════════
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);
