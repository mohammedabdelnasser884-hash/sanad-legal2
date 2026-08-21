// ══════════════════════════════════════════════════════════════════
// generationApi.ts — نطاق المرحلة 1: resolveCaseBindings + validateRequiredFields
// (generateDocument نفسها مؤجلة للمرحلة 2 — محرك التوليد — حسب خطة المراحل)
// المرجع: Sanad_Document_Generation_Master_Plan.md (القسم 3.2)
// ══════════════════════════════════════════════════════════════════

import { db } from '../../../supabaseClient';
import type { TemplateField, ResolvedBindings, ValidationResult } from '../types';

// ──────────────────────────────────────────────────────────────────
// binding_source المدعومة فعليًا في القوالب الأربعة (القسم 5 من الخطة):
//   'case.number' → عمود cases.case_number_official
//     ⚠️ [اكتشاف أثناء تنفيذ المرحلة 1]: جدول cases فيه عمودين لرقم
//     القضية (case_number و case_number_official). فحصت الاستخدام
//     الفعلي في src/hooks/useAppData.ts (بند "number: r.case_number_official")
//     وده العمود المعروض فعليًا كـ"رقم القضية" في كل الواجهة —
//     case_number القديم مش مستخدم في العرض. فبنقرأ case_number_official.
//   'case.court'  → عمود cases.court (المحكمة المختصة المُدخلة يدويًا في
//     نماذج القضية — مش court_name المُستخدم بس في عرض الجلسات)
//   'party.name'  → case_parties.name، مع تمييز الطرف حسب field_key:
//     - أي field_key غير 'addressee_name' → الطرف اللي is_client = true
//     - field_key === 'addressee_name' → أول طرف تاني (is_client = false)
//     التمييز ده ضروري لأن القوالب الأربعة كلهم بيستخدموا نفس القيمة
//     الحرفية 'party.name' في binding_source لحقلين مختلفين المعنى
//     (الموكل في كل القوالب، والمنذَر إليه في "إنذار على يد محضر" تحديدًا)
//   binding_source = null (زي office_name والحقول اليدوية) → مش بيتحل
//     هنا إطلاقًا، بيفضل null في الخريجة الراجعة من الدالة دي.
// ──────────────────────────────────────────────────────────────────

interface CaseBindingRow {
  case_number_official: string | null;
  court: string | null;
}

interface PartyBindingRow {
  name: string | null;
  is_client: boolean | null;
}

/**
 * يجيب بيانات القضية والأطراف من الجداول الموجودة فعلاً (read-only)
 * ويحلّها لقيم فعلية حسب binding_source بتاع كل حقل من حقول القالب.
 * حقول binding_source = null بترجع null في الخريطة الناتجة (تُملأ يدويًا لاحقًا).
 */
export async function resolveCaseBindings(
  caseId: string,
  templateFields: TemplateField[]
): Promise<ResolvedBindings> {
  const bindings: ResolvedBindings = {};

  const boundFields = templateFields.filter((f) => f.binding_source !== null);
  if (boundFields.length === 0) {
    for (const field of templateFields) bindings[field.field_key] = null;
    return bindings;
  }

  const needsCase = boundFields.some((f) => f.binding_source?.startsWith('case.'));
  const needsParty = boundFields.some((f) => f.binding_source === 'party.name');

  let caseRow: CaseBindingRow | null = null;
  if (needsCase) {
    const { data, error } = await db
      .from('cases')
      .select('case_number_official, court')
      .eq('id', caseId)
      .maybeSingle();
    if (error) throw error;
    caseRow = data;
  }

  let parties: PartyBindingRow[] = [];
  if (needsParty) {
    const { data, error } = await db
      .from('case_parties')
      .select('name, is_client')
      .eq('case_id', caseId);
    if (error) throw error;
    parties = data ?? [];
  }

  const clientParty = parties.find((p) => p.is_client === true);
  const otherParty = parties.find((p) => p.is_client !== true);

  for (const field of templateFields) {
    if (field.binding_source === null) {
      bindings[field.field_key] = null;
      continue;
    }
    switch (field.binding_source) {
      case 'case.number':
        bindings[field.field_key] = caseRow?.case_number_official ?? null;
        break;
      case 'case.court':
        bindings[field.field_key] = caseRow?.court ?? null;
        break;
      case 'party.name':
        bindings[field.field_key] =
          (field.field_key === 'addressee_name' ? otherParty?.name : clientParty?.name) ?? null;
        break;
      default:
        // binding_source غير معروف — لا نفترض، نرجّع null بدل ما نخترع سلوك
        bindings[field.field_key] = null;
    }
  }

  return bindings;
}

/** يتحقق من اكتمال الحقول المطلوبة قبل التوليد */
export function validateRequiredFields(
  fields: TemplateField[],
  values: ResolvedBindings
): ValidationResult {
  const missingRequiredFields = fields
    .filter((f) => f.is_required)
    .filter((f) => {
      const v = values[f.field_key];
      return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
    })
    .map((f) => f.field_key);

  return { isValid: missingRequiredFields.length === 0, missingRequiredFields };
}
