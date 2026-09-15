// بحث نصي عام (client-side) — تطبيع عربي + مطابقة بكذا كلمة. مشترك بين
// أي قسم بيعمل فلترة على مصفوفة محمّلة أصلاً في المتصفح (مفيش استعلام
// قاعدة بيانات هنا خالص، فمختلف عن imatchOrClause/buildArabicTolerantPattern
// في sanitize.ts اللي بيبنوا نمط regex للسيرفر). كل قسم بيستخدمها على
// بياناته هو بس — مفيش فهرس بحث مشترك بين الأقسام، وكل قسم بيفضل مستقل
// بذاته تمامًا عن بحث الأقسام التانية وعن البحث العام (useUniversalSearch).

import { normalizeArabicDigits } from './sanitize';

// ══════════════════════════════════════════════════════════════
//  normalizeArabicText — توحيد تنويعات الحروف العربية الشائعة (همزات
//  الألف، تاء مربوطة/هاء، ياء/ألف مقصورة) + شيل التشكيل (حركات) + توحيد
//  حالة الأحرف الإنجليزية + تطبيع الأرقام. الهدف: "الاستثمار" و"الإستثمار"،
//  أو "ضريبه" و"ضريبة"، يتطابقوا كأنهم نفس الكلمة وقت البحث، من غير ما
//  نغيّر النص المعروض للمستخدم أصلاً (التطبيع للمقارنة بس، مش للعرض).
//  ⚠️ نطاق محدود عمدًا (زي buildArabicTolerantPattern) — تنويعات إملائية
//  شائعة فعلاً، مش تصحيح أخطاء إملائية عامة.
// ══════════════════════════════════════════════════════════════
const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

export function normalizeArabicText(value: string): string {
    return normalizeArabicDigits(value)
        .replace(ARABIC_DIACRITICS, '')
        .replace(/[اأإآ]/g, 'ا')
        .replace(/[ةه]/g, 'ه')
        .replace(/[يى]/g, 'ي')
        .toLowerCase()
        .trim();
}

// ══════════════════════════════════════════════════════════════
//  matchesSearchWords — بيقسّم نص البحث لكلمات (فاصل: أي مسافات)، وبيرجع
//  true لو كل كلمة موجودة في haystack (مش بالضرورة جنب بعض، ومش بالضرورة
//  بنفس الترتيب) بعد تطبيع الاتنين. "ضرائب فاتورة" كده بتلاقي أي نص فيه
//  الكلمتين حتى لو مفصولين، بدل مطابقة العبارة حرفيًا زي `.includes()`
//  المباشرة. استعلام فاضي (بعد trim) بيرجع false دايمًا — مسؤولية الطرف
//  المنادي إنه يتحقق أول من isSearching قبل ما يستخدم النتيجة.
// ══════════════════════════════════════════════════════════════
export function matchesSearchWords(haystack: string, query: string): boolean {
    const words = query.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return false;
    const normalizedHaystack = normalizeArabicText(haystack);
    return words.every((word) => normalizedHaystack.includes(normalizeArabicText(word)));
}
