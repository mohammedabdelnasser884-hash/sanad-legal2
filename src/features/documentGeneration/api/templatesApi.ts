// ══════════════════════════════════════════════════════════════════
// templatesApi.ts — CRUD على document_templates + template_fields
// المرجع: Sanad_Document_Generation_Master_Plan.md (القسم 2 — بنية الملفات)
//
// ⚠️ [قرار أثناء المرحلة 3] القسم 3.2 من الخطة قفل توقيعات generationApi.ts
// وexportApi.ts فقط — مفيش توقيعات مقفولة لـ templatesApi.ts، لأن المرحلة 3
// (الواجهة) هي أول مكان محتاج قراءة قوالب فعليًا. الدوال تحت هي أقل مجموعة
// لازمة لتشغيل شاشات القسم 9 (LegalDocumentsPage + TemplatePicker) —
// عمليات قراءة بس (list/getById)، بدون أي CRUD كتابة (إنشاء/تعديل قوالب
// نفسها خارج نطاق المرحلة 3 بالكامل، ومفيش شاشة لإدارة القوالب في هذه
// الخطة إطلاقًا).
// ══════════════════════════════════════════════════════════════════

import { db } from '../../../supabaseClient';
import { getSignedUrl } from '../../../shared/lib/storage';
import { getEdgeFunctionErrorMessage, type EdgeFunctionError } from '../../../shared/lib/edgeFunctionErrors';
import type { DocumentTemplate, TemplateField, TemplateVersion } from '../types';

/**
 * يجيب كل القوالب المتاحة للـ tenant الحالي (نظامية + خاصة بالمكتب، عبر RLS)
 * بحالة 'active' فقط — التصفية/البحث (القسم 9.1) بيحصل client-side بعد كده.
 */
export async function getActiveTemplates(): Promise<DocumentTemplate[]> {
  const { data, error } = await db
    .from('document_templates')
    .select('*')
    .eq('status', 'active')
    .order('category', { ascending: true })
    .order('name_ar', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as DocumentTemplate[];
}

/** يجيب حقول النسخة المنشورة الحالية لقالب معيّن، مرتبة بـ sort_order (القسم 9.3) */
export async function getPublishedTemplateFields(templateId: string): Promise<TemplateField[]> {
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
    .from('template_fields')
    .select('*')
    .eq('template_version_id', template.current_published_version_id)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TemplateField[];
}

// ══════════════════════════════════════════════════════════════════
// [Sanad_Legal_Documents_Library_Transition_Plan.md — القسم 3.3، مرحلة 2.3]
// الدالتين تحت بيمثلوا الواجهة الجديدة (master_file_path + Edge Function
// fill-document-template) اللي بتحل محل generateDocument()/
// renderDocumentContent() النصيين القديمين في generationApi.ts. القديمين
// لسه موجودين بدون حذف (زي ما هو موثّق في types.ts — @deprecated بس مش
// متشالين، هيتشالوا فعليًا في مرحلة 6) — الاستبدال الفعلي في الواجهة
// (ربط الزرارين "تحميل كما هو"/"تعبئة") مؤجَّل لمرحلة 3/4، مش جزء من
// هذه المرحلة (2 — Backend فقط، بدون واجهة).
//
// ⚠️ select('*') بدل تحديد الأعمدة صراحة في getMasterFileUrl: عمودَا
// master_file_path/master_file_name مضافين فعليًا في DB (migration
// 01-legal-doc-library-columns.sql) لكن database.types.ts المولّد
// (src/database.types.ts) لسه بيعكس الشكل القديم — بيتحدّث تلقائيًا
// بعد تشغيل الـmigration على الإنتاج وإعادة توليد الأنواع (خطوة يدوية
// منك، خارج نطاق أي مرحلة كود). تحديد الأعمدة دي بالاسم في select()
// هيفشل compile-time لحد ما ده يحصل — نفس أسلوب resolveTemplateVersion
// في generationApi.ts (select('*') ثم cast لـTemplateVersion).
// ══════════════════════════════════════════════════════════════════

const TEMPLATES_STORAGE_BUCKET = 'legal-doc-templates';

/**
 * يجيب رابط تحميل موقّع (signed URL) لملف الـWord الأصلي لنسخة قالب
 * معيّنة — مسار "تحميل كما هو" (القسم 3.5). صفر تعبئة/استبدال tags،
 * مجرّد رابط تحميل مباشر لملف الـmaster زي ما هو.
 *
 * يرمي خطأ عربي واضح لو نسخة القالب مش موجودة، أو موجودة بس معندهاش
 * ملف Word مرفوع بعد (master_file_path لسه null — الحالة الافتراضية
 * لكل القوالب الأربعة الحالية لحد ما مرحلة 5 تضيف الملفات الحقيقية).
 */
export async function getMasterFileUrl(
  templateVersionId: string
): Promise<{ url: string; fileName: string }> {
  const { data, error } = await db
    .from('template_versions')
    .select('*')
    .eq('id', templateVersionId)
    .maybeSingle();
  if (error) throw error;
  const version = data as unknown as TemplateVersion | null;
  if (!version) throw new Error(`Template version ${templateVersionId} not found`);
  if (!version.master_file_path) {
    throw new Error('هذا القالب لسه معندوش ملف Word مرفوع');
  }

  const url = await getSignedUrl(TEMPLATES_STORAGE_BUCKET, version.master_file_path);
  if (!url) throw new Error('تعذّر توليد رابط تحميل لملف القالب');

  return { url, fileName: version.master_file_name || `${version.id}.docx` };
}

/**
 * ينادي Edge Function `fill-document-template` (مرحلة 2.1) — بيرجع
 * ملف .docx معبّى بالقيم المُمرَّرة كـBlob جاهز للتحميل مباشرة في
 * المتصفح. التحقق من اكتمال الحقول المطلوبة (validateRequiredFields)
 * وحل قيم القضية (resolveCaseBindings) لسه مسؤولية الكولر (زي ما هما
 * دلوقتي في generationApi.ts) — مش مكررين هنا، ونفس المبدأ الموثّق في
 * الفانكشن نفسها.
 */
export async function fillDocumentTemplate(
  templateVersionId: string,
  values: Record<string, string | number | null>
): Promise<Blob> {
  const { data, error } = await db.functions.invoke('fill-document-template', {
    body: { template_version_id: templateVersionId, values },
  });
  if (error) {
    const message = await getEdgeFunctionErrorMessage(error as EdgeFunctionError);
    throw new Error(message || 'تعذّر تعبئة المستند. حاول تاني، ولو تكررت المشكلة تواصل مع الدعم.');
  }
  if (!(data instanceof Blob)) {
    throw new Error('رد غير متوقع من خدمة تعبئة المستندات');
  }
  return data;
}
