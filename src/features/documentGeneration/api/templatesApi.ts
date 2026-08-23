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
import type { DocumentTemplate, TemplateField } from '../types';

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
