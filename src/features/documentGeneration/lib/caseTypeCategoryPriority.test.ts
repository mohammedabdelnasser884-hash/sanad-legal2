// ══════════════════════════════════════════════════════════════════
// caseTypeCategoryPriority.test.ts — أولوية 4
// ══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';
import { getCategoryPriorityForCaseType } from './caseTypeCategoryPriority';

// ⚠️ آخر تست تحت بيعمل dynamic import لـ useDocumentTemplates (عشان
// DOCUMENT_CATEGORIES الحقيقية)، وده بيجرّ templatesApi.ts اللي بيستورد
// `db` من supabaseClient.ts — والملف ده بينادي createClient() على مستوى
// الموديول نفسه، فبيفشل بـ"supabaseUrl is required" في بيئة التست (مفيش
// VITE_SUPABASE_URL/ANON_KEY متسجلين). التست ده مش محتاج db فعليًا (بس
// محتاج الثابت DOCUMENT_CATEGORIES)، فبنعمل موك خفيف لمنع نداء createClient
// الحقيقي — نفس أسلوب باقي التستات اللي بتلمس supabaseClient (راجع
// generationApi.test.ts).
vi.mock('../../../supabaseClient', () => ({ db: {} }));

describe('getCategoryPriorityForCaseType', () => {
  it('case_type فاضي أو null → array فاضية (مفيش ترتيب مقترح)', () => {
    expect(getCategoryPriorityForCaseType(null)).toEqual([]);
    expect(getCategoryPriorityForCaseType(undefined)).toEqual([]);
    expect(getCategoryPriorityForCaseType('')).toEqual([]);
    expect(getCategoryPriorityForCaseType('   ')).toEqual([]);
  });

  it('case_type مش متطابق مع أي كلمة مفتاحية → array فاضية (فولباك للترتيب الافتراضي)', () => {
    expect(getCategoryPriorityForCaseType('نوع غريب مش متوقع')).toEqual([]);
  });

  it('نفقة/أحوال شخصية → عرائض أول التصنيفات المقترحة', () => {
    const result = getCategoryPriorityForCaseType('نفقة زوجية');
    expect(result[0]).toBe('عرائض');
  });

  it('مطابقة substring مش تطابق حرفي كامل (case_type نص حر)', () => {
    // "دعوى نفقة وحضانة" فيها "نفقة" كـsubstring، مش تطابق حرفي كامل
    const result = getCategoryPriorityForCaseType('دعوى نفقة وحضانة');
    expect(result.length).toBeGreaterThan(0);
  });

  it('جنائي/جنح → "جنح مباشرة" أول القايمة', () => {
    expect(getCategoryPriorityForCaseType('جنائي')[0]).toBe('جنح مباشرة');
  });

  it('الترتيب المقترح دايمًا subset من DOCUMENT_CATEGORIES الحقيقية (مفيش تصنيف وهمي)', async () => {
    const { DOCUMENT_CATEGORIES } = await import('../hooks/useDocumentTemplates');
    const allCaseTypeSamples = ['نفقة', 'عمالي', 'تجاري', 'إيجار', 'جنائي', 'إداري', 'مدني'];
    for (const t of allCaseTypeSamples) {
      const result = getCategoryPriorityForCaseType(t);
      for (const cat of result) {
        expect(DOCUMENT_CATEGORIES).toContain(cat);
      }
    }
  });
});
