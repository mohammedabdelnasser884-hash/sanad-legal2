import { describe, it, expect } from 'vitest';
import { normalizeArabicText, matchesSearchWords } from './textSearch';

describe('normalizeArabicText', () => {
    it('همزات الألف المختلفة → توحّد لألف عادية', () => {
        expect(normalizeArabicText('الإستثمار')).toBe(normalizeArabicText('الاستثمار'));
        expect(normalizeArabicText('آخر')).toBe(normalizeArabicText('اخر'));
    });

    it('تاء مربوطة وهاء آخر الكلمة → تتطابق', () => {
        expect(normalizeArabicText('ضريبة')).toBe(normalizeArabicText('ضريبه'));
    });

    it('ياء وألف مقصورة → تتطابق', () => {
        expect(normalizeArabicText('الشهر العقاري')).toBe(normalizeArabicText('الشهر العقارى'));
    });

    it('التشكيل (حركات) → يتشال قبل المقارنة', () => {
        expect(normalizeArabicText('الْقَضِيَّة')).toBe(normalizeArabicText('القضية'));
    });

    it('أرقام عربية شرقية → تتحول لإنجليزية زي normalizeArabicDigits', () => {
        expect(normalizeArabicText('مادة ٢٥')).toBe('ماده 25');
    });

    it('حروف إنجليزية → حالة الأحرف بتتوحّد (case-insensitive)', () => {
        expect(normalizeArabicText('PDF')).toBe(normalizeArabicText('pdf'));
    });

    it('مسافات فاضية أول/آخر النص → تتشال', () => {
        expect(normalizeArabicText('  نص  ')).toBe('نص');
    });
});

describe('matchesSearchWords', () => {
    it('كلمة واحدة موجودة في النص → true', () => {
        expect(matchesSearchWords('عقد إيجار تجاري', 'إيجار')).toBe(true);
    });

    it('كلمة واحدة مش موجودة → false', () => {
        expect(matchesSearchWords('عقد إيجار تجاري', 'بيع')).toBe(false);
    });

    it('كذا كلمة منفصلة في النص (مش عبارة متجاورة) → كلها لازم تتطابق', () => {
        expect(matchesSearchWords('إقرار ضريبي عن قيمة الفاتورة', 'ضرائب فاتورة')).toBe(false);
        // ⚠️ "ضرائب" بصيغة الجمع مش نفس "ضريبي" — الاختبار ده بيوضح إن
        // المطابقة substring بسيطة، مش اشتقاق/جذر الكلمة (out of scope).
        expect(matchesSearchWords('ضرائب على فاتورة الاستيراد', 'ضرائب فاتورة')).toBe(true);
    });

    it('كذا كلمة، وحدة مفقودة → false', () => {
        expect(matchesSearchWords('ضرائب على المرتبات', 'ضرائب فاتورة')).toBe(false);
    });

    it('كلمة بإملاء مختلف عن النص المخزّن (همزة/تاء مربوطة) → لسه بتتطابق', () => {
        expect(matchesSearchWords('الإستثمار الأجنبي', 'الاستثمار')).toBe(true);
        expect(matchesSearchWords('نموذج توكيل عام', 'التوكيله')).toBe(false); // كلمة مختلفة فعليًا، مش تنويع إملائي
    });

    it('ترتيب الكلمات في الاستعلام معكوس عن النص → لسه بيتطابق (مش عبارة متجاورة)', () => {
        expect(matchesSearchWords('نموذج إقرار ضريبي', 'ضريبي نموذج')).toBe(true);
    });

    it('استعلام فاضي أو مسافات بس → false', () => {
        expect(matchesSearchWords('أي نص', '')).toBe(false);
        expect(matchesSearchWords('أي نص', '   ')).toBe(false);
    });

    it('مسافات متعددة بين الكلمات في الاستعلام → بتتعامل زي فاصل واحد', () => {
        expect(matchesSearchWords('عقد إيجار تجاري', 'عقد   تجاري')).toBe(true);
    });
});
