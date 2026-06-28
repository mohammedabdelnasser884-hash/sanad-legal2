// DOM utility functions used across components

// ══════════════════════════════════════════════════════════════
//  escapeHtml — تهريب نص قبل إدراجه في HTML (innerHTML / document.write)
//  أي قيمة بيكتبها المستخدم (اسم عميل، ملاحظة، اسم قضية...) ولازم
//  تتعرض جوه HTML خام، لازم تعدي على الدالة دي أولاً — وإلا ممكن
//  حد يحقن <script> أو onerror= وينفّذ كود في متصفح أي مستخدم تاني
//  بيفتح الطباعة (Stored XSS).
// ══════════════════════════════════════════════════════════════
export function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] as string));
}

// ══════════════════════════════════════════════════════════════
//  escapeTelegramHtml — تهريب نص قبل دمجه في رسالة Telegram بصيغة
//  parse_mode: 'HTML'. تيليجرام بيدعم مجموعة محدودة من التاجز
//  (<b>, <i>, <a>...) وبيرفض الرسالة كلها لو فيه < أو > أو & غير
//  متوازن/غير معروف — فلازم نهرّب أي نص حر (عنوان قضية، اسم موكل،
//  ملاحظة) قبل وضعه جوه الرسالة، عشان:
//  ١) ما يكسرش صيغة HTML ويفشل إرسال الإشعار كله.
//  ٢) ما يسمحش لحد يحقن تاجز زي <a href="..."> ويغيّر شكل/سلوك
//     الرسالة (مثلاً يحوّل رابط داخلها لرابط تصيّد).
//  ⚠️ لا تستخدم escapeHtml العادية هنا — هي بتهرّب " و ' كمان وده
//  مش لازم لتيليجرام، والأهم إننا محتاجين الدالة دي منفصلة عشان
//  تفضل تتطبّق على كل نص حر يدخل رسالة تيليجرام مهما كانت الكلاسات
//  اللي حواليها في HTML العادي.
// ══════════════════════════════════════════════════════════════
export function escapeTelegramHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>]/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
    }[c] as string));
}

// ══════════════════════════════════════════════════════════════
//  validateUploadFile — فحص نوع وحجم الملف قبل رفعه على Storage
//
//  ⚠️ المشكلة: كان أي مستخدم يقدر يرفع ملف بأي امتداد (حتى .html
//  أو .svg) على باكتس عامة (case-docs / client-docs)، وبعد كده
//  الرابط (getPublicUrl) بيُفتح مباشرة في تاب جديد (target=_blank)
//  من غير ما يتحمّل كملف. لو الملف .html أو .svg فيه <script>،
//  الكود بيتنفذ فورًا في متصفح أي حد فاتح اللينك — حتى لو مش
//  مسجّل دخول في النظام، لأن الرابط عام (Stored XSS via upload).
//
//  الحل: قائمة بيضاء (whitelist) لامتدادات مستندات قانونية فعلية
//  فقط، وحد أقصى لحجم الملف. لازم تُستخدم في كل مكان بيرفع ملف
//  حر من المستخدم قبل استدعاء storage.upload().
//
//  @returns null لو الملف سليم، أو رسالة خطأ بالعربي توضّح للمستخدم
//  ليه الملف مرفوض.
// ══════════════════════════════════════════════════════════════
const ALLOWED_UPLOAD_EXTENSIONS = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'jpg', 'jpeg', 'png', 'gif', 'webp',
];
const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export function validateUploadFile(file: { name: string; size: number }): string | null {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) {
        return `صيغة الملف ".${ext}" غير مسموحة. الصيغ المسموحة: PDF، Word، Excel، PowerPoint، أو صورة (jpg/png/gif/webp).`;
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        return 'حجم الملف أكبر من المسموح (20 ميجابايت كحد أقصى).';
    }
    return null;
}

export function toast(msg: string, isErr = false) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    (el as HTMLElement).style.borderColor = isErr ? '#f87171' : '#D4AF37';
    (el as HTMLElement).style.color = isErr ? '#f87171' : '#D4AF37';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3400);
}

export function showOfflineBanner(pendingCount = 0) {
    const banner = document.getElementById('offline-banner');
    const badge  = document.getElementById('offline-queue-badge');
    if (!banner) return;
    banner.classList.add('visible');
    if (badge) {
        if (pendingCount > 0) { badge.textContent = `${pendingCount} معلّق`; (badge as HTMLElement).style.display = 'inline'; }
        else (badge as HTMLElement).style.display = 'none';
    }
}

export function hideOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    if (banner) banner.classList.remove('visible');
}

export function showSyncIndicator(text = 'جاري المزامنة...') {
    const el = document.getElementById('sync-indicator');
    const tx = document.getElementById('sync-text');
    if (el) el.classList.add('visible');
    if (tx) tx.textContent = text;
}

export function hideSyncIndicator(successText: string | null = null) {
    const el = document.getElementById('sync-indicator');
    const tx = document.getElementById('sync-text');
    if (successText && tx) {
        tx.textContent = successText;
        setTimeout(() => { if (el) el.classList.remove('visible'); }, 2000);
    } else {
        if (el) el.classList.remove('visible');
    }
}

export async function flushPendingSubscription() {
    if (window.__pendingSubscription) {
        await (window as any).__savePushSubscription(window.__pendingSubscription);
        (window as any).__pendingSubscription = null;
    }
}

// ══════════════════════════════════════════════════════════════
//  دوال التحقق من صحة البيانات (Validation)
//  ── مرنة: بترجع رسالة تحذير بس، مفيش منع للحفظ ──
// ══════════════════════════════════════════════════════════════

/**
 * يتحقق من رقم الهاتف (مصر + دول الخليج)
 * يقبل: مسافات / شرطات / + في البداية — بيشيلهم قبل الفحص
 * @returns null لو الرقم سليم، أو رسالة تحذير بالعربي لو فيه مشكلة
 */
export function validatePhone(phone: string): string | null {
    if (!phone || !phone.trim()) return null; // حقل اختياري — مفيش تحذير لو فاضي

    const cleaned = phone.replace(/[\s\-]/g, '');

    // مصر: 01[0125]xxxxxxxx (11 رقم) — مع أو بدون +20 / 0020
    const egyptPattern = /^(\+20|0020|0)?1[0125]\d{8}$/;

    // دول الخليج: +966/+971/+965/+973/+974/+968 + رقم محلي
    // (نطاق طول مرن 7-9 أرقام بعد كود الدولة لاختلاف الأنظمة بين الدول)
    const gulfPattern = /^(\+966|00966|\+971|00971|\+965|00965|\+973|00973|\+974|00974|\+968|00968)\d{7,9}$/;

    if (egyptPattern.test(cleaned) || gulfPattern.test(cleaned)) return null;

    return 'رقم الهاتف غير معتاد لمصر أو دول الخليج — تأكد منه';
}

/**
 * يتحقق من صيغة البريد الإلكتروني (فحص عام بسيط)
 * @returns null لو سليم، أو رسالة تحذير
 */
export function validateEmail(email: string): string | null {
    if (!email || !email.trim()) return null; // حقل اختياري

    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (pattern.test(email.trim())) return null;

    return 'صيغة البريد الإلكتروني غير صحيحة';
}


// ══════════════════════════════════════════════════════════════
//  safeUpdate — Optimistic Locking
//  بيتحقق إن السجل مش اتعدل من حد تاني قبل ما يكتب
// ══════════════════════════════════════════════════════════════
/**
 * @param db         - Supabase client
 * @param table      - اسم الجدول
 * @param id         - id السجل
 * @param data       - البيانات الجديدة
 * @param knownUpdatedAt - قيمة updated_at اللي أنت شايفها (جبتها مع السجل)
 *
 * @returns { success, conflict, error }
 *   success  = true  → اتحفظ تمام
 *   conflict = true  → حد تاني عدّل السجل ده قبلك
 *   error           → خطأ من Supabase
 */
// ── تحديد نوع الجهاز من User-Agent string ──
export function detectDevice(ua: string): string {
    if (!ua) return 'جهاز غير معروف 💻';
    const u = ua.toLowerCase();
    if (u.includes('iphone') || u.includes('android') || u.includes('mobile')) return 'هاتف محمول 📱';
    if (u.includes('ipad') || u.includes('tablet')) return 'تابلت 📲';
    if (u.includes('mac'))     return 'Mac 💻';
    if (u.includes('windows')) return 'Windows 🖥';
    if (u.includes('linux'))   return 'Linux 🐧';
    return 'جهاز غير معروف 💻';
}

export async function safeUpdate(
    db: any,
    table: string,
    id: string | number,
    data: Record<string, any>,
    knownUpdatedAt: string | null
): Promise<{ success: boolean; conflict: boolean; error: any }> {

    // لو مفيش updated_at محفوظ — نعمل UPDATE عادي بدون check (للبيانات القديمة)
    if (!knownUpdatedAt) {
        const { error } = await db.from(table).update(data).eq('id', id);
        return { success: !error, conflict: false, error };
    }

    // 1. اتحقق إن updated_at مش اتغير من لما جبت السجل
    const { data: current, error: fetchErr } = await db
        .from(table)
        .select('updated_at')
        .eq('id', id)
        .single();

    if (fetchErr) {
        return { success: false, conflict: false, error: fetchErr };
    }

    // 2. قارن الـ timestamps
    const serverTime  = new Date(current.updated_at).getTime();
    const clientTime  = new Date(knownUpdatedAt).getTime();

    if (serverTime > clientTime) {
        // 💥 Conflict — حد تاني عدّل السجل ده
        toast('⚠️ هذا السجل عدّله شخص آخر — يُرجى فتحه من جديد', true);
        return { success: false, conflict: true, error: null };
    }

    // 3. آمن — نكتب
    const { error } = await db.from(table).update(data).eq('id', id);
    return { success: !error, conflict: false, error };
}

// ══════════════════════════════════════════════════════════════
//  logActivity — تسجيل نشاط في activity_log (لوحة الإدارة)
//  ⚠️ مصممة عشان متعطلش أي عملية أساسية:
//  - لو المستخدم مش عامل لوجين (نادرًا) → بترجع بصمت
//  - لو فشل الكتابة في activity_log لأي سبب (الجدول لسه متعمل،
//    مشكلة شبكة، RLS...) → بتعمل console.error بس وما بترميش error
//  - بتُستخدم بدون await في الأماكن اللي بتنادي عليها (fire-and-forget)
//    عشان تسجيل النشاط ما يأخرش استجابة الشاشة للمستخدم.
//
//  @param db          - Supabase client (نفس النمط المستخدم في safeUpdate)
//  @param action      - وصف الإجراء بالعربي، مثلاً 'إضافة قضية'
//  @param opts.details      - تفاصيل إضافية (اسم القضية/الموكل...)
//  @param opts.entity_type  - 'case' | 'client' | 'user' | 'portal' | 'fee' | 'session' | 'note' | 'document'
//  @param opts.entity_id    - id السجل المرتبط (لو موجود)
//  @param opts.userName     - اسم المستخدم المنفِّذ — لو اتبعت من profile يُستخدم مباشرةً
//                             ويُوفَّر query على جدول profiles لكل استدعاء (N+1 fix)
//  @param opts.client_name  - اسم الموكل المرتبط (لعرضه كشارة في لوحة الإدارة)
//  @param opts.case_name    - عنوان/اسم القضية المرتبطة (لعرضها كشارة)
//  @param opts.case_type    - نوع القضية المرتبطة (لعرضه كشارة)
// ══════════════════════════════════════════════════════════════
export async function logActivity(
    db: any,
    action: string,
    opts?: {
        details?: string | null;
        entity_type?: string | null;
        entity_id?: string | number | null;
        userName?: string | null;
        client_name?: string | null;
        case_name?: string | null;
        case_type?: string | null;
    }
): Promise<void> {
    try {
        const { data: sessionData } = await db.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) return;

        // لو المستدعي بعت userName جاهز (من profile state) نستخدمه مباشرةً
        // ونوفّر query إضافي على profiles في كل استدعاء
        let userName: string | null = opts?.userName ?? null;
        let tenantId: string | null = null;
        if (!userName) {
            // fallback: نجيب الاسم والـ tenant_id من DB
            userName = user.email || null;
            const { data: prof } = await db.from('profiles').select('full_name,tenant_id').eq('user_id', user.id).maybeSingle();
            if (prof?.full_name) userName = prof.full_name;
            if (prof?.tenant_id) tenantId = prof.tenant_id;
        } else {
            // لو عندنا userName جاهز، نجيب tenant_id بس
            const { data: prof } = await db.from('profiles').select('tenant_id').eq('user_id', user.id).maybeSingle();
            if (prof?.tenant_id) tenantId = prof.tenant_id;
        }

        await db.from('activity_log').insert([{
            user_id: user.id,
            user_name: userName,
            tenant_id: tenantId,
            action,
            details: opts?.details ?? null,
            entity_type: opts?.entity_type ?? null,
            entity_id: opts?.entity_id ?? null,
            client_name: opts?.client_name ?? null,
            case_name: opts?.case_name ?? null,
            case_type: opts?.case_type ?? null,
        }]);
    } catch (e) {
        console.error('[activityLog] فشل تسجيل النشاط (تم تجاهله، العملية الأساسية لم تتأثر):', e);
    }
}
