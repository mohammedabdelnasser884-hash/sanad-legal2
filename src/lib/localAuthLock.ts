// ══════════════════════════════════════════════════════════════
//  localAuthLock.ts (خطة قفل الشاشة بدل تسجيل الخروج التلقائي،
//  15 سبتمبر 2026)
//
//  المشكلة اللي الملف ده بيحلها: useAutoLogout.ts كان بيعمل
//  db.auth.signOut() حقيقي بعد 30 دقيقة عدم نشاط — لو المستخدم أوف
//  لاين وقتها، بيترمي على شاشة تسجيل الدخول اللي بدورها محتاجة نت
//  (office-login إيدج فانكشن)، فيتقفل بره النظام لحد ما يرجع أونلاين.
//
//  الحل: بدل تسجيل الخروج الحقيقي، نعمل "قفل شاشة" محلي (زي قفل شاشة
//  الموبايل) — بيتحقق من نفس الباسورد بمقارنة هاش مخزّن جوه الجهاز
//  (localStorage)، من غير أي نداء شبكة خالص. الباسورد الحقيقي مبيتخزنش
//  أبدًا — بس هاش (PBKDF2 + salt عشوائي) محدّش يقدر يرجّعه للأصل.
//
//  ⚠️ تنويه أمان مهم: ده تحقق "مستوى الجهاز" مش بديل عن الـauth
//  الحقيقي بتاع Supabase — أمانه معتمد على إن الجهاز نفسه في إيد
//  صاحبه أصلًا (بالظبط زي قفل شاشة الموبايل). الـsession الحقيقي
//  (JWT بتاع Supabase) فاضل زي ما هو محفوظ محليًا طول الوقت، القفل ده
//  بس واجهة إضافية فوقه وقت عدم النشاط.
// ══════════════════════════════════════════════════════════════

const STORAGE_PREFIX = 'sanad_lock_v1_';
const ATTEMPTS_PREFIX = 'sanad_lock_attempts_v1_';
const PBKDF2_ITERATIONS = 150_000;
const HASH_BYTE_LENGTH = 32;

// نفس نمط الحماية من brute-force المستخدم في office_login_attempts
// على السيرفر (5 محاولات / 15 دقيقة) — هنا بس محلي على الجهاز.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

interface StoredHash {
    salt: string; // hex
    hash: string; // hex
    iterations: number;
}

interface AttemptsState {
    count: number;
    lockedUntil: number | null; // epoch ms
}

function bufToHex(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return bytes;
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number): Promise<string> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
        keyMaterial,
        HASH_BYTE_LENGTH * 8
    );
    return bufToHex(bits);
}

/** تُنادى مرة واحدة بعد كل تسجيل دخول ناجح (LoginScreen.tsx) — بتخزّن
 *  هاش الباسورد الحالي جوه الجهاز. لو فشلت (خطأ localStorage/crypto
 *  نادر)، بتتجاهل بصمت — أسوأ حالة إن القفل المحلي هيفضل معطّل
 *  والمستخدم هيتطلب منه تسجيل خروج حقيقي بدل القفل (شوف
 *  hasLocalUnlockPassword)، مش أي كسر لتسجيل الدخول نفسه. */
export async function saveLocalUnlockPassword(userId: string, password: string): Promise<void> {
    try {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const hash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS);
        const record: StoredHash = { salt: bufToHex(salt), hash, iterations: PBKDF2_ITERATIONS };
        localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(record));
        resetLocalUnlockAttempts(userId);
    } catch (e) {
        console.error('[localAuthLock] فشل تخزين هاش القفل المحلي (تم تجاهله):', e);
    }
}

/** بتتنادى وقت تسجيل الخروج الحقيقي — بتمسح هاش الباسورد المخزّن
 *  لهذا المستخدم من الجهاز، عشان مايفضلش هاش قديم سايح لو جهاز
 *  مشترك بين أكتر من حد. */
export function clearLocalUnlockPassword(userId: string | null | undefined): void {
    if (!userId) return;
    localStorage.removeItem(STORAGE_PREFIX + userId);
    localStorage.removeItem(ATTEMPTS_PREFIX + userId);
}

/** بيستخدمها الكود اللي بيقرر يعمل قفل شاشة ولا تسجيل خروج حقيقي —
 *  لو معندناش هاش محفوظ (مثلاً أول مرة بعد نشر هذا التحديث، قبل ما
 *  المستخدم يعمل تسجيل دخول جديد مرة واحدة)، لازم تسجيل خروج حقيقي
 *  بدل قفل بلا أي مرجع للتحقق منه. */
export function hasLocalUnlockPassword(userId: string | null | undefined): boolean {
    if (!userId) return false;
    return localStorage.getItem(STORAGE_PREFIX + userId) !== null;
}

function readAttempts(userId: string): AttemptsState {
    try {
        const raw = localStorage.getItem(ATTEMPTS_PREFIX + userId);
        if (!raw) return { count: 0, lockedUntil: null };
        return JSON.parse(raw) as AttemptsState;
    } catch {
        return { count: 0, lockedUntil: null };
    }
}

function writeAttempts(userId: string, state: AttemptsState): void {
    localStorage.setItem(ATTEMPTS_PREFIX + userId, JSON.stringify(state));
}

export function resetLocalUnlockAttempts(userId: string): void {
    localStorage.removeItem(ATTEMPTS_PREFIX + userId);
}

/** > 0 يعني القفل المحلي مقفول مؤقتًا بسبب محاولات غلط كتير — الرقم
 *  المرجع هو عدد الدقايق المتبقية. */
export function getLocalUnlockLockoutMinutesRemaining(userId: string): number {
    const { lockedUntil } = readAttempts(userId);
    if (!lockedUntil) return 0;
    const remainingMs = lockedUntil - Date.now();
    return remainingMs > 0 ? Math.ceil(remainingMs / 60000) : 0;
}

export type LocalUnlockResult =
    | { ok: true }
    | { ok: false; reason: 'no_record' | 'wrong_password' | 'locked_out'; lockoutMinutes?: number };

/** التحقق الفعلي من باسورد فك القفل — مقارنة هاش محلي بس، مفيش أي
 *  نداء شبكة هنا خالص، فبتشتغل حتى وهي أوف لاين بالكامل. */
export async function verifyLocalUnlockPassword(userId: string, password: string): Promise<LocalUnlockResult> {
    const lockoutRemaining = getLocalUnlockLockoutMinutesRemaining(userId);
    if (lockoutRemaining > 0) {
        return { ok: false, reason: 'locked_out', lockoutMinutes: lockoutRemaining };
    }

    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    if (!raw) return { ok: false, reason: 'no_record' };

    let record: StoredHash;
    try {
        record = JSON.parse(raw) as StoredHash;
    } catch {
        return { ok: false, reason: 'no_record' };
    }

    const salt = hexToBuf(record.salt);
    const attemptHash = await derivePasswordHash(password, salt, record.iterations);

    if (attemptHash === record.hash) {
        resetLocalUnlockAttempts(userId);
        return { ok: true };
    }

    const attempts = readAttempts(userId);
    const newCount = attempts.count + 1;
    if (newCount >= MAX_ATTEMPTS) {
        writeAttempts(userId, { count: 0, lockedUntil: Date.now() + LOCKOUT_MINUTES * 60000 });
        return { ok: false, reason: 'locked_out', lockoutMinutes: LOCKOUT_MINUTES };
    }
    writeAttempts(userId, { count: newCount, lockedUntil: null });
    return { ok: false, reason: 'wrong_password' };
}
