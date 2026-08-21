// ══════════════════════════════════════════════════════════════════
// أنواع وحدة توليد المستندات القانونية
// المرجع: Sanad_Document_Generation_Master_Plan.md (القسم 3.1)
// ممنوع إضافة/حذف حقل من أي interface هنا إلا بعد تحديث الخطة الموحّدة أولاً.
// ══════════════════════════════════════════════════════════════════

export type SourceMode = 'case_bound' | 'manual' | 'blank';
export type DocumentStatus = 'draft' | 'exported';
export type TemplateStatus = 'active' | 'draft' | 'archived';
export type FieldType = 'text' | 'date' | 'number' | 'select' | 'party_ref' | 'textarea';

// Document Type / Template = الهوية الثابتة (الاسم، التصنيف). لا تحتوي على نص القالب نفسه.
export interface DocumentTemplate {
  id: string;
  tenant_id: string | null; // null = قالب نظامي (is_system = true)
  category: string;
  name_ar: string;
  description: string | null;
  is_system: boolean;
  status: TemplateStatus;
  current_published_version_id: string | null; // آخر نسخة منشورة، يُستخدم للتوليد الافتراضي
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TemplateVersionStatus = 'draft' | 'published' | 'archived';

// Template Version = النص الفعلي القابل للتوليد منه، ومُصمم على إنه immutable بعد النشر
export interface TemplateVersion {
  id: string;
  template_id: string;
  version_number: number; // يبدأ من 1، يزيد تلقائياً مع كل نسخة جديدة لنفس template_id
  body_template: string;
  status: TemplateVersionStatus;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TemplateField {
  id: string;
  template_version_id: string; // ملحوظ: مربوط بالنسخة، مش بالـ template الأب مباشرة
  field_key: string;
  label_ar: string;
  field_type: FieldType;
  is_required: boolean;
  binding_source: string | null; // مثال: 'case.number' | 'party.name' | null
  sort_order: number;
}

export interface GeneratedDocument {
  id: string;
  tenant_id: string;
  template_id: string;         // نوع المستند (ثابت، للعرض/الفلترة)
  template_version_id: string; // النسخة الفعلية اللي اتولّد بيها المستند — إلزامي، لأغراض الـ audit trail
  case_id: string | null;
  source_mode: SourceMode;
  field_values_json: Record<string, string | number | null>;
  document_content_json: DocumentContentSection[];
  rendered_html: string | null;
  status: DocumentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// نموذج المحتوى المبسّط (بدون AST كامل) — مصفوفة أقسام بترتيب ثابت
export interface DocumentContentSection {
  type: 'header' | 'title' | 'intro' | 'facts' | 'legal_grounds' | 'requests' | 'signature';
  text: string; // نص جاهز بعد استبدال placeholders، HTML-safe
}

export interface CaseDocumentLink {
  id: string;
  case_id: string;
  generated_document_id: string;
  stored_file_id: string | null; // يشير فعليًا لـ case_documents.id (الاسم الفعلي بعد تصحيح فحص المرحلة 0)
  created_at: string;
}

// نتيجة دالة resolveCaseBindings — خريطة field_key → قيمة محلولة
export type ResolvedBindings = Record<string, string | number | null>;

// نتيجة التحقق من الحقول الناقصة
export interface ValidationResult {
  isValid: boolean;
  missingRequiredFields: string[]; // field_key لكل حقل مطلوب وناقص
}
