-- ══════════════════════════════════════════════════════════════════
-- Phase 7 / 02 — Document Generation: Seed القوالب الأربعة الأولى
-- المرجع: Sanad_Document_Generation_Master_Plan.md (القسم 5)
-- الأربعة فقط، بحقولهم المذكورة صراحة — ممنوع إضافة قالب خامس هنا.
--
-- body_template: نص مبدئي بسيط بصيغة {{field_key}} لكل حقل، كافي
-- عشان محرك التوليد (مرحلة 2) يشتغل عليه. الصياغة القانونية الكاملة
-- والنهائية لكل قالب مش جزء من هذه المرحلة (Backend + Schema فقط) —
-- لو احتجنا صياغة أدق، ده قرار محتوى منفصل بعدين، مش بلوكر لمرحلة 1.
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_template_id   uuid;
  v_version_id    uuid;
BEGIN

  -- ── 1) إنذار على يد محضر ──────────────────────────────────────
  INSERT INTO document_templates (category, name_ar, description, is_system, status)
  VALUES ('إنذارات', 'إنذار على يد محضر', 'إنذار رسمي موجّه لطرف عن طريق محضر', true, 'active')
  RETURNING id INTO v_template_id;

  INSERT INTO template_versions (template_id, version_number, body_template, status, published_at)
  VALUES (
    v_template_id, 1,
    E'إنذار على يد محضر\n\nإلى السيد/ة: {{addressee_name}}\n\nبناءً على طلب الموكل: {{client_name}}\nبخصوص القضية رقم: {{case_number}}\n\nموضوع الإنذار:\n{{warning_subject}}\n\nمكتب: {{office_name}}',
    'published', now()
  )
  RETURNING id INTO v_version_id;

  UPDATE document_templates SET current_published_version_id = v_version_id WHERE id = v_template_id;

  INSERT INTO template_fields (template_version_id, field_key, label_ar, field_type, is_required, binding_source, sort_order) VALUES
    (v_version_id, 'case_number',     'رقم القضية',        'text',     true,  'case.number',  1),
    (v_version_id, 'client_name',     'اسم الموكل',        'text',     true,  'party.name',   2),
    (v_version_id, 'office_name',     'اسم المكتب',        'text',     false, NULL,           3),
    (v_version_id, 'addressee_name',  'اسم المنذَر إليه',  'text',     true,  'party.name',   4),
    (v_version_id, 'warning_subject', 'موضوع الإنذار',     'textarea', true,  NULL,           5);

  -- ── 2) توكيل عام ───────────────────────────────────────────────
  INSERT INTO document_templates (category, name_ar, description, is_system, status)
  VALUES ('توكيلات', 'توكيل عام', 'توكيل عام للمحامي بالنيابة عن الموكل', true, 'active')
  RETURNING id INTO v_template_id;

  INSERT INTO template_versions (template_id, version_number, body_template, status, published_at)
  VALUES (
    v_template_id, 1,
    E'توكيل عام\n\nأنا الموكل: {{client_name}}\nبخصوص القضية رقم: {{case_number}}\n\nأوكل الأستاذ/ة: {{attorney_name}}\n\nنطاق التوكيل:\n{{poa_scope}}\n\nمكتب: {{office_name}}',
    'published', now()
  )
  RETURNING id INTO v_version_id;

  UPDATE document_templates SET current_published_version_id = v_version_id WHERE id = v_template_id;

  INSERT INTO template_fields (template_version_id, field_key, label_ar, field_type, is_required, binding_source, sort_order) VALUES
    (v_version_id, 'case_number',    'رقم القضية',     'text',     true,  'case.number', 1),
    (v_version_id, 'client_name',    'اسم الموكل',     'text',     true,  'party.name',  2),
    (v_version_id, 'office_name',    'اسم المكتب',     'text',     false, NULL,          3),
    (v_version_id, 'attorney_name',  'اسم المحامي الموكَّل', 'text', true, NULL,         4),
    (v_version_id, 'poa_scope',      'نطاق التوكيل',   'textarea', true,  NULL,          5);

  -- ── 3) صحيفة دعوى مبسطة ───────────────────────────────────────
  INSERT INTO document_templates (category, name_ar, description, is_system, status)
  VALUES ('عرائض', 'صحيفة دعوى مبسطة', 'صحيفة دعوى مبسطة بالوقائع والطلبات', true, 'active')
  RETURNING id INTO v_template_id;

  INSERT INTO template_versions (template_id, version_number, body_template, status, published_at)
  VALUES (
    v_template_id, 1,
    E'صحيفة دعوى\n\nأمام محكمة: {{court_name}}\n\nالمدعي (الموكل): {{client_name}}\nبخصوص القضية رقم: {{case_number}}\n\nالوقائع:\n{{case_facts}}\n\nالطلبات:\n{{case_requests}}\n\nمكتب: {{office_name}}',
    'published', now()
  )
  RETURNING id INTO v_version_id;

  UPDATE document_templates SET current_published_version_id = v_version_id WHERE id = v_template_id;

  INSERT INTO template_fields (template_version_id, field_key, label_ar, field_type, is_required, binding_source, sort_order) VALUES
    (v_version_id, 'case_number',    'رقم القضية',   'text',     true,  'case.number', 1),
    (v_version_id, 'client_name',    'اسم الموكل',   'text',     true,  'party.name',  2),
    (v_version_id, 'office_name',    'اسم المكتب',   'text',     false, NULL,          3),
    (v_version_id, 'court_name',     'اسم المحكمة',  'text',     true,  'case.court',  4),
    (v_version_id, 'case_facts',     'الوقائع',      'textarea', true,  NULL,          5),
    (v_version_id, 'case_requests',  'الطلبات',      'textarea', true,  NULL,          6);

  -- ── 4) طلب استعلام ────────────────────────────────────────────
  INSERT INTO document_templates (category, name_ar, description, is_system, status)
  VALUES ('طلبات', 'طلب استعلام', 'طلب استعلام رسمي', true, 'active')
  RETURNING id INTO v_template_id;

  INSERT INTO template_versions (template_id, version_number, body_template, status, published_at)
  VALUES (
    v_template_id, 1,
    E'طلب استعلام\n\nمقدم من: {{client_name}}\nبخصوص القضية رقم: {{case_number}}\n\nموضوع الاستعلام:\n{{inquiry_subject}}\n\nمكتب: {{office_name}}',
    'published', now()
  )
  RETURNING id INTO v_version_id;

  UPDATE document_templates SET current_published_version_id = v_version_id WHERE id = v_template_id;

  INSERT INTO template_fields (template_version_id, field_key, label_ar, field_type, is_required, binding_source, sort_order) VALUES
    (v_version_id, 'case_number',      'رقم القضية',       'text',     true,  'case.number', 1),
    (v_version_id, 'client_name',      'اسم الموكل',       'text',     true,  'party.name',  2),
    (v_version_id, 'office_name',      'اسم المكتب',       'text',     false, NULL,          3),
    (v_version_id, 'inquiry_subject',  'موضوع الاستعلام',  'textarea', true,  NULL,          4);

END $$;
