-- ══════════════════════════════════════════════════════════════════
-- Phase 8 / 03 — Document Generation Content: تصنيف "إعلانات"
-- النموذج الأول (المرجعي): "إعلان بأصل الصحيفة"
-- المرجع: Sanad_Legal_Documents_Master_Report قسم 20.1 (التقسيمة
-- البصرية: صندوق "الموضوع" + متن رسمي) وقسم 20.3/20.4 (الحقول
-- المشتركة والنموذج المرجعي نفسه).
--
-- ⚠️ محتاج عمود box_template (ميجريشن 02 من نفس الجلسة) قبل التشغيل.
-- ⚠️ الحقول الحرة الخاصة بمضمون كل إعلان (نص "وأعلنته بالآتي") سايبينها
-- textarea حرة يملاها المحامي — النماذج الخمسة الباقية (20.5-20.9) ليها
-- نص متن مختلف جزئيًا، هتتضاف كقوالب منفصلة لاحقًا بنفس النمط.
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_template_id   uuid;
  v_version_id    uuid;
BEGIN

  INSERT INTO document_templates (category, name_ar, description, is_system, status)
  VALUES ('إعلانات', 'إعلان بأصل الصحيفة', 'إعلان قضائي رسمي على يد محضر — النموذج المرجعي الأساسي لتصنيف الإعلانات', true, 'active')
  RETURNING id INTO v_template_id;

  INSERT INTO template_versions (template_id, version_number, box_template, body_template, status, published_at)
  VALUES (
    v_template_id, 1,
    -- ── صندوق "الموضوع" (قسم 20.1) ──────────────────────────────
    E'مكتب الأستاذ/ {{attorney_name}}\n\nالموضوع: إعلان بأصل الصحيفة في الدعوى رقم {{case_number}} لسنة {{case_year}} {{case_type}}\n\nوذلك لجلسة {{next_session_date}}\n\nوكيل الطالب/ المحامي',
    -- ── المتن الرسمي (قسم 20.1) ──────────────────────────────────
    E'إنه في يوم {{huissier_date}} الموافق ..../..../.......٢٠ الساعة {{huissier_time}} بناحية {{huissier_location}}\n\nبناء على طلب السيد/ {{applicant_name}} {{applicant_capacity}} المقيم {{applicant_address}}، ومحله المختار مكتب الأستاذ/ {{attorney_name}}\n\nأنا محضر محكمة {{court_name}} قد انتقلت وأعلنت:\n\nالسيد/ {{addressee_name}} {{addressee_capacity}} المقيم {{addressee_address}}\n\nمخاطبًا مع: {{delivery_recipient}}\n\nوأعلنته بالآتي:\n{{announcement_content}}\n\nبناء عليه\nيُكلَّف المعلن إليه بالحضور أمام {{court_name}} وذلك بجلسة {{next_session_date}} الساعة {{next_session_time}}، وذلك في الدعوى رقم {{case_number}} لسنة {{case_year}} {{case_type}}.\n\nولأجل العلم /\n\nمكتب: {{office_name}}',
    'published', now()
  )
  RETURNING id INTO v_version_id;

  UPDATE document_templates SET current_published_version_id = v_version_id WHERE id = v_template_id;

  INSERT INTO template_fields (template_version_id, field_key, label_ar, field_type, is_required, binding_source, sort_order) VALUES
    -- الطالب (قسم 20.3، بند 1)
    (v_version_id, 'applicant_name',       'اسم الطالب',              'text',     true,  'party.name', 1),
    (v_version_id, 'applicant_capacity',   'صفة الطالب',              'text',     false, NULL,          2),
    (v_version_id, 'applicant_address',    'عنوان الطالب',            'text',     true,  NULL,          3),
    (v_version_id, 'attorney_name',        'اسم المحامي/الوكيل',      'text',     true,  NULL,          4),
    -- الخصم/المعلن إليه (قسم 20.3، بند 2) — addressee_name بيتحل تلقائيًا
    -- للطرف التاني (غير الموكل) حسب المنطق الموجود فعليًا في resolveCaseBindings
    (v_version_id, 'addressee_name',       'اسم المعلن إليه',         'text',     true,  'party.name', 5),
    (v_version_id, 'addressee_capacity',   'صفة المعلن إليه',         'text',     false, NULL,          6),
    (v_version_id, 'addressee_address',    'عنوان المعلن إليه',       'text',     true,  NULL,          7),
    -- رقم القضية المركّب (قسم 20.3، بند 3)
    (v_version_id, 'case_number',          'رقم القضية',              'text',     true,  'case.number', 8),
    (v_version_id, 'case_year',            'لسنة',                    'text',     true,  NULL,          9),
    (v_version_id, 'case_type',            'نوع القضية',              'text',     true,  NULL,          10),
    (v_version_id, 'court_name',           'المحكمة',                 'text',     true,  'case.court',  11),
    -- الجلسات (قسم 20.3، بند 4/5)
    (v_version_id, 'previous_session_date','تاريخ الجلسة السابقة',    'date',     false, NULL,          12),
    (v_version_id, 'next_session_date',    'تاريخ الجلسة القادمة',    'date',     true,  NULL,          13),
    (v_version_id, 'next_session_time',    'ساعة الجلسة القادمة',     'text',     false, NULL,          14),
    -- بيانات انتقال المحضر (الديباجة)
    (v_version_id, 'huissier_date',        'تاريخ الانتقال',          'date',     true,  NULL,          15),
    (v_version_id, 'huissier_time',        'ساعة الانتقال',           'text',     false, NULL,          16),
    (v_version_id, 'huissier_location',    'الناحية (مكان الانتقال)', 'text',     false, NULL,          17),
    (v_version_id, 'delivery_recipient',   'مخاطبًا مع',              'text',     false, NULL,          18),
    -- مضمون الإعلان الحر (يختلف حسب نوع الإعلان — هنا العام/المرجعي)
    (v_version_id, 'announcement_content', 'نص الإعلان (وأعلنته بالآتي)', 'textarea', true, NULL,       19),
    (v_version_id, 'office_name',          'اسم المكتب',              'text',     false, NULL,          20);

END $$;
