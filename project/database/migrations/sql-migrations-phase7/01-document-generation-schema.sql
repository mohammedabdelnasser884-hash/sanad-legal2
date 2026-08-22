-- ══════════════════════════════════════════════════════════════════
-- Phase 7 / 01 — Document Generation: Schema
-- المرجع: Sanad_Document_Generation_Master_Plan.md (القسم 4)
-- كل أسماء الجداول/الدوال المستخدمة هنا (tenants, current_tenant_id(),
-- profiles, cases, case_documents) اتأكدت فعليًا من database.types.ts
-- في فحص المرحلة 0 — بدون أي اسم مُخترَع.
-- ══════════════════════════════════════════════════════════════════

-- 4.1 الهوية الثابتة للقالب (بدون نص القالب نفسه)
CREATE TABLE document_templates (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     uuid REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = قالب نظامي
  category                      varchar(100) NOT NULL,
  name_ar                       varchar(255) NOT NULL,
  description                   text,
  is_system                     boolean NOT NULL DEFAULT false,
  status                        varchar(30) NOT NULL DEFAULT 'active',
  current_published_version_id  uuid, -- FK مؤجل، يُضاف بعد إنشاء template_versions تحت
  created_by                    uuid REFERENCES profiles(id),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_status CHECK (status IN ('active','draft','archived'))
);

-- 4.2 نسخ القالب — immutable بعد النشر
CREATE TABLE template_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     uuid NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  version_number  int NOT NULL,
  body_template   text NOT NULL,
  status          varchar(20) NOT NULL DEFAULT 'draft',
  published_at    timestamptz,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_number),
  CONSTRAINT chk_version_status CHECK (status IN ('draft','published','archived'))
);

-- ربط الـ FK المؤجل بعد إنشاء الجدولين
ALTER TABLE document_templates
  ADD CONSTRAINT fk_current_published_version
  FOREIGN KEY (current_published_version_id) REFERENCES template_versions(id);

-- يضمن نسخة منشورة واحدة بالظبط لكل template في نفس الوقت
CREATE UNIQUE INDEX idx_one_published_version_per_template
  ON template_versions (template_id)
  WHERE status = 'published';

-- 4.3 حقول القالب — مربوطة بالنسخة (template_version_id) مش بالـ template الأب مباشرة
CREATE TABLE template_fields (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id  uuid NOT NULL REFERENCES template_versions(id) ON DELETE CASCADE,
  field_key             varchar(100) NOT NULL,
  label_ar              varchar(255) NOT NULL,
  field_type            varchar(30) NOT NULL,
  is_required           boolean NOT NULL DEFAULT false,
  binding_source        varchar(50),
  sort_order             int NOT NULL DEFAULT 0,
  UNIQUE (template_version_id, field_key),
  CONSTRAINT chk_field_type CHECK (field_type IN ('text','date','number','select','party_ref','textarea'))
);

-- 4.4 المستندات المولّدة
CREATE TABLE generated_documents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id           uuid NOT NULL REFERENCES document_templates(id),
  template_version_id  uuid NOT NULL REFERENCES template_versions(id), -- إلزامي — audit trail
  case_id               uuid REFERENCES cases(id) ON DELETE SET NULL,
  source_mode           varchar(20) NOT NULL,
  field_values_json     jsonb NOT NULL DEFAULT '{}',
  document_content_json jsonb NOT NULL,
  rendered_html         text,
  status                varchar(20) NOT NULL DEFAULT 'draft',
  created_by            uuid REFERENCES profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_source_mode CHECK (source_mode IN ('case_bound','manual','blank')),
  CONSTRAINT chk_doc_status CHECK (status IN ('draft','exported'))
);

-- 4.5 ربط المستند المولّد بملف مُصدَّر فعليًا في case_documents (بعد التصدير، مرحلة 4)
CREATE TABLE case_document_links (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  generated_document_id  uuid NOT NULL REFERENCES generated_documents(id) ON DELETE CASCADE,
  stored_file_id         uuid REFERENCES case_documents(id),
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════
-- RLS — نفس نمط باقي الجداول التشغيلية في سند (current_tenant_id() مؤكدة من فحص المرحلة 0)
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_document_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_templates ON document_templates
  USING (tenant_id IS NULL OR tenant_id = current_tenant_id());

CREATE POLICY template_versions_via_template ON template_versions
  USING (template_id IN (
    SELECT id FROM document_templates
    WHERE tenant_id IS NULL OR tenant_id = current_tenant_id()
  ));

-- template_fields يتبع template_version_id، مفيش عمود tenant مباشر عليه
CREATE POLICY template_fields_via_template_version ON template_fields
  USING (template_version_id IN (
    SELECT tv.id FROM template_versions tv
    JOIN document_templates dt ON dt.id = tv.template_id
    WHERE dt.tenant_id IS NULL OR dt.tenant_id = current_tenant_id()
  ));

CREATE POLICY tenant_isolation_generated_docs ON generated_documents
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_case_links ON case_document_links
  USING (case_id IN (SELECT id FROM cases WHERE tenant_id = current_tenant_id()));

-- ══════════════════════════════════════════════════════════════════
-- WRITE POLICIES
-- الخطة (القسم 4) وثّقت سياسات القراءة (USING) فقط بدون ذكر صريح
-- لسياسات WITH CHECK للكتابة. بما إن كل الجداول دي RLS-enabled بدون
-- أي policy تسمح بالكتابة، الافتراضي في Postgres هو رفض كل INSERT/
-- UPDATE/DELETE تلقائيًا حتى لو القراءة مسموحة — يعني بدون السطور
-- دي، مفيش أي مستخدم (حتى العادي داخل نفس الـ tenant) هيقدر يحفظ
-- مستند مولّد أو ينشئ قالب. مفيش ذكر لده في القسم 4 من الخطة، لكنه
-- ضروري تقنيًا عشان الفيتشر يشتغل أصلًا من المرحلة 2 (التوليد نفسه)
-- — مش قرار تصميمي إضافي، ده استكمال إلزامي لنفس نمط RLS المستخدم.
-- نفس شرط الـ USING بالظبط (tenant isolation)، بدون أي صلاحية إضافية.
-- ══════════════════════════════════════════════════════════════════
CREATE POLICY tenant_write_generated_docs ON generated_documents
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY tenant_update_generated_docs ON generated_documents
  FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_write_case_links ON case_document_links
  FOR INSERT WITH CHECK (case_id IN (SELECT id FROM cases WHERE tenant_id = current_tenant_id()));

-- قوالب المستخدم الخاصة بالـ tenant فقط قابلة للكتابة من نفس الـ tenant
-- (القوالب النظامية tenant_id IS NULL بتتضاف فقط عن طريق seed/migration، مش من الواجهة)
CREATE POLICY tenant_write_templates ON document_templates
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY tenant_update_templates ON document_templates
  FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_write_template_versions ON template_versions
  FOR INSERT WITH CHECK (template_id IN (SELECT id FROM document_templates WHERE tenant_id = current_tenant_id()));
CREATE POLICY tenant_update_template_versions ON template_versions
  FOR UPDATE USING (template_id IN (SELECT id FROM document_templates WHERE tenant_id = current_tenant_id()))
  WITH CHECK (template_id IN (SELECT id FROM document_templates WHERE tenant_id = current_tenant_id()));

CREATE POLICY tenant_write_template_fields ON template_fields
  FOR INSERT WITH CHECK (template_version_id IN (
    SELECT tv.id FROM template_versions tv
    JOIN document_templates dt ON dt.id = tv.template_id
    WHERE dt.tenant_id = current_tenant_id()
  ));
