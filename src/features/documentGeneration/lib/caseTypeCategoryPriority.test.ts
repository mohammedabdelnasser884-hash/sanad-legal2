// ══════════════════════════════════════════════════════════════════
// caseTypeCategoryPriority.test.ts — أولوية 4
// ══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { getCategoryPriorityForCaseType } from './caseTypeCategoryPriority';

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
