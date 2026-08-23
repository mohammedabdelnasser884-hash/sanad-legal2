import { db } from '../supabaseClient';

// ══════════════════════════════════════════════════════════
//  Last Seen Heartbeat — يحدّث آخر نشاط كل 2 دقيقة
//  ويُسجّل الجهاز والمتصفح مرة واحدة عند الدخول
//  منقول من main.tsx (اتفصل بتاريخ 15 يوليو 2026 كجزء من خطة
//  تخفيف main.tsx)
//
//  ── FIX (تقرير تشخيص الديسكتوب، Phase 4، بند 3 — 15 أغسطس 2026):
//  كان هنا import ديناميكي لـ supabaseClient بهدف إخراجه في chunk
//  منفصل، لكن عشرات الملفات التانية في المشروع بتعمله import استاتيكي
//  عادي أصلًا — فالنتيجة كانت Vite بيدمجه في الـ bundle الرئيسي زي ما
//  هو (الـ dynamic import هنا كان بلا أي فايدة فعلية) + تحذير build عن
//  "استيراد مزدوج" لنفس الملف. اتحول لـ import عادي زي باقي المشروع؛
//  التصرف الوظيفي هنا لم يتغيّر لأن dbRef كان دايمًا بيتحل فورًا عمليًا
//  (المستخدم لازم يكون مسجّل دخول عشان الصفحة تتحمّل أصلًا). ──
(function initLastSeenHeartbeat() {
    const dbRef = db;

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
        // FIX (1.1): لو الأعمدة دي مش موجودة في القاعدة، كان الخطأ بيختفي
        // بصمت تمامًا. دلوقتي بنسجّله في الكونسول على الأقل عشان يبان
        // فورًا بدل ما يتكرر بصمت كل heartbeat.
        const { error } = await dbRef.from('profiles').update({
            last_seen_at: new Date().toISOString(),
            last_seen_browser: browser,
            last_seen_device: /Mobi|Android/i.test(navigator.userAgent) ? 'هاتف محمول 📱' : 'جهاز سطح مكتب 💻',
        }).eq('user_id', session.user.id);
        if (error) console.error('[Heartbeat] فشل تحديث last_seen — تأكد من وجود الأعمدة في profiles:', error.message);
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
