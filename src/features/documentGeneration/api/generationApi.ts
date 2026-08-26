// ══════════════════════════════════════════════════════════════════
// generationApi.ts — نطاق المرحلة 1: resolveCaseBindings + validateRequiredFields
// (generateDocument نفسها مؤجلة للمرحلة 2 — محرك التوليد — حسب خطة المراحل)
// المرجع: Sanad_Document_Generation_Master_Plan.md (القسم 3.2)
// ══════════════════════════════════════════════════════════════════

import { db } from '../../../supabaseClient';
import { getCurrentTenantId, loadOfficeSetting } from '../../../constants';
import type {
  TemplateField,
  TemplateVersion,
  ResolvedBindings,
  ValidationResult,
  SourceMode,
  GeneratedDocument,
  DocumentContentSection,
} from '../types';
import type { Json } from '../../../database.types';

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

// ══════════════════════════════════════════════════════════════════
// المرحلة 2 — محرك التوليد
// المرجع: Sanad_Document_Generation_Master_Plan.md (القسم 3.2)
// ══════════════════════════════════════════════════════════════════

/**
 * يجيب النسخة المنشورة الحالية لقالب معيّن (current_published_version_id)،
 * أو نسخة محددة صراحة لو اتبعتت explicitVersionId.
 */
export async function resolveTemplateVersion(
  templateId: string,
  explicitVersionId?: string
): Promise<TemplateVersion> {
  if (explicitVersionId) {
    const { data, error } = await db
      .from('template_versions')
      .select('*')
      .eq('id', explicitVersionId)
      .eq('template_id', templateId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Template version ${explicitVersionId} not found for template ${templateId}`);
    return data as TemplateVersion;
  }

  const { data: template, error: templateError } = await db
    .from('document_templates')
    .select('current_published_version_id')
    .eq('id', templateId)
    .maybeSingle();
  if (templateError) throw templateError;
  if (!template?.current_published_version_id) {
    throw new Error(`Template ${templateId} has no published version`);
  }

  const { data, error } = await db
    .from('template_versions')
    .select('*')
    .eq('id', template.current_published_version_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Published version ${template.current_published_version_id} not found`);
  return data as TemplateVersion;
}

/**
 * ينشئ نسخة جديدة draft لقالب موجود — لا يعدّل أي نسخة منشورة سابقة إطلاقاً.
 * version_number = أعلى version_number موجود لنفس template_id + 1.
 */
export async function createTemplateVersion(
  templateId: string,
  bodyTemplate: string,
  fields: Omit<TemplateField, 'id' | 'template_version_id'>[]
): Promise<TemplateVersion> {
  const { data: existingVersions, error: versionsError } = await db
    .from('template_versions')
    .select('version_number')
    .eq('template_id', templateId)
    .order('version_number', { ascending: false })
    .limit(1);
  if (versionsError) throw versionsError;

  const nextVersionNumber = (existingVersions?.[0]?.version_number ?? 0) + 1;

  const { data: newVersion, error: insertError } = await db
    .from('template_versions')
    .insert({
      template_id: templateId,
      version_number: nextVersionNumber,
      body_template: bodyTemplate,
      status: 'draft',
    })
    .select('*')
    .single();
  if (insertError) throw insertError;

  if (fields.length > 0) {
    const { error: fieldsError } = await db.from('template_fields').insert(
      fields.map((f) => ({ ...f, template_version_id: newVersion.id }))
    );
    if (fieldsError) throw fieldsError;
  }

  return newVersion as TemplateVersion;
}

/**
 * ينشر نسخة draft (status → published) ويحدّث document_templates.current_published_version_id.
 * idx_one_published_version_per_template بيمنع وجود أكتر من نسخة منشورة لنفس template في نفس الوقت —
 * لو موجودة نسخة منشورة سابقة، هذه العملية لازم تفشل على مستوى الـ DB (unique index)، مفيش unpublish ضمني هنا.
 */
export async function publishTemplateVersion(templateVersionId: string): Promise<void> {
  const { data: version, error: versionError } = await db
    .from('template_versions')
    .select('id, template_id, status')
    .eq('id', templateVersionId)
    .maybeSingle();
  if (versionError) throw versionError;
  if (!version) throw new Error(`Template version ${templateVersionId} not found`);
  if (version.status !== 'draft') {
    throw new Error(`Cannot publish version with status "${version.status}" — only draft versions can be published`);
  }

  const { error: publishError } = await db
    .from('template_versions')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', templateVersionId);
  if (publishError) throw publishError;

  const { error: updateTemplateError } = await db
    .from('document_templates')
    .update({ current_published_version_id: templateVersionId, updated_at: new Date().toISOString() })
    .eq('id', version.template_id);
  if (updateTemplateError) throw updateTemplateError;
}

// ──────────────────────────────────────────────────────────────────
// [قرار مُتَّخذ أثناء المرحلة 2 — بموافقتك]
// نص القالب (body_template) في القوالب الأربعة كتلة واحدة متصلة، مش
// مقسّمة لأقسام مُصنَّفة. تحويلها لـ DocumentContentSection[] بيتم
// بقسم واحد فقط من النوع 'intro' يلف النص كله بعد استبدال placeholders
// — بدل اختراع تقسيم وهمي مالوش أساس في البيانات الفعلية. تحسين
// مستقبلي محتمل (تقسيم أدق) يحتاج تعديل شكل body_template نفسه أولاً،
// مش جزء من هذه المرحلة.
//
// [اكتشاف أثناء التنفيذ] توقيع generateDocument (القسم 3.2) مفيهوش
// parameter لـ created_by/profileId، ومفيش getter على مستوى الموديول
// لـ profile id الحالي (بعكس tenant_id اللي عنده getCurrentTenantId()
// جاهزة في constants.ts). العمود created_by nullable في الـ schema
// (بدون NOT NULL)، فبيتسجل null هنا التزامًا بالـ signature المُقفلة
// حرفيًا زي ما هي — تمرير created_by من الطبقة اللي فوق (hook/component
// في المرحلة 3 اللي عندها وصول لـ profile.id عبر useAuthProfile) محتاج
// تعديل صريح للـ signature ده، مش قرار يُتخذ هنا بمعزل.
// ──────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────
// 🆕 (بند 4 — الأوفلاين، خطوة 3، القسم 17.6): استبدال placeholders كان
// جزء مطبوخ جوه generateDocument() مباشرة (خطوة 5 القديمة تحت)، مبني
// على استعلامات شبكة سابقة عليه (resolveTemplateVersion + template_fields).
// استخرجناها هنا كدالة pure منفصلة عشان useGenerateDocument.ts يقدر
// يعيد استخدامها لبناء document_content_json من غير شبكة، لما يكون فيه
// نسخة قالب + حقول محفوظين في offlineTemplateCache.ts بالفعل. صفر تغيير
// سلوكي — نفس منطق الاستبدال بالظبط، منقول بس.
// ──────────────────────────────────────────────────────────────────
export function renderDocumentContent(
  bodyTemplate: string,
  templateFields: TemplateField[],
  values: ResolvedBindings
): DocumentContentSection[] {
  let renderedText = bodyTemplate;
  for (const field of templateFields) {
    const value = values[field.field_key];
    renderedText = renderedText.split(`{{${field.field_key}}}`).join(value !== null && value !== undefined ? String(value) : '');
  }
  return [{ type: 'intro', text: renderedText }];
}

/**
 * الدالة الرئيسية — تبني document_content_json وتحفظ generated_documents
 * بحالة draft، مربوطة بنسخة قالب محددة.
 */
export async function generateDocument(params: {
  templateId: string;
  templateVersionId?: string;
  caseId: string | null;
  sourceMode: SourceMode;
  manualValues?: Record<string, string | number | null>;
}): Promise<GeneratedDocument> {
  const version = await resolveTemplateVersion(params.templateId, params.templateVersionId);

  const { data: fieldsData, error: fieldsError } = await db
    .from('template_fields')
    .select('*')
    .eq('template_version_id', version.id)
    .order('sort_order', { ascending: true });
  if (fieldsError) throw fieldsError;
  const templateFields = (fieldsData ?? []) as TemplateField[];

  // 1) القيم الأوتوماتيكية: من القضية لو case_bound، وإلا null لكل الحقول
  let values: ResolvedBindings;
  if (params.sourceMode === 'case_bound') {
    if (!params.caseId) {
      throw new Error('caseId مطلوب لما sourceMode يكون "case_bound"');
    }
    values = await resolveCaseBindings(params.caseId, templateFields);
  } else {
    values = {};
    for (const field of templateFields) values[field.field_key] = null;
  }

  // 2) تعديلات/تعبئة يدوية من المستخدم — بتغلب القيم الأوتوماتيكية (القسم 9.3:
  //    الحقول المحلولة تلقائيًا تفضل قابلة للتعديل، مش read-only)
  if (params.manualValues) {
    for (const [key, val] of Object.entries(params.manualValues)) {
      values[key] = val;
    }
  }

  // 3) office_name: حالة خاصة موثّقة صراحة في القسم 5 — "من office_settings
  //    مباشرة، مش field يدوي" — بتتحل دايمًا من إعدادات المكتب بغض النظر عن
  //    sourceMode، إلا لو المستخدم بعت قيمة صريحة ليها في manualValues (تعديله يُحترم)
  const hasOfficeNameField = templateFields.some((f) => f.field_key === 'office_name');
  if (hasOfficeNameField && (values['office_name'] === null || values['office_name'] === undefined)) {
    values['office_name'] = await loadOfficeSetting('name');
  }

  // 4) التحقق — ممنوع التوليد الجزئي (القسم 6، المرحلة 2 بند 3)
  const validation = validateRequiredFields(templateFields, values);
  if (!validation.isValid) {
    const missingLabels = templateFields
      .filter((f) => validation.missingRequiredFields.includes(f.field_key))
      .map((f) => f.label_ar);
    throw new Error(`تعذّر توليد المستند، حقول مطلوبة ناقصة: ${missingLabels.join('، ')}`);
  }

  // 5) استبدال placeholders في نص القالب — دلوقتي عبر renderDocumentContent
  //    (خُلعت pure function فوق، بند 4 — الأوفلاين، صفر تغيير سلوكي)
  const documentContentJson: DocumentContentSection[] = renderDocumentContent(version.body_template, templateFields, values);

  const tenantId = getCurrentTenantId();
  if (!tenantId) {
    throw new Error('لا يوجد tenant_id حالي — تأكد من تسجيل الدخول قبل توليد المستند');
  }

  const { data: inserted, error: insertError } = await db
    .from('generated_documents')
    .insert({
      tenant_id: tenantId,
      template_id: params.templateId,
      template_version_id: version.id,
      case_id: params.caseId,
      source_mode: params.sourceMode,
      field_values_json: values,
      document_content_json: documentContentJson as unknown as Json,
      rendered_html: null,
      status: 'draft',
      created_by: null,
    })
    .select('*')
    .single();
  if (insertError) throw insertError;

  return inserted as unknown as GeneratedDocument;
}
