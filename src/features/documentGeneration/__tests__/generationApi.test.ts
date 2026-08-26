import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TemplateField, TemplateVersion } from '../types';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي سلسلتي الاستدعاء الفعليتين في
// generationApi.ts (اتأكدت منهم بقراءة الكود، مفيش تخمين):
//   db.from('cases').select('case_number_official, court').eq('id', v).maybeSingle()
//   db.from('case_parties').select('name, is_client').eq('case_id', v)   [ترجع array]
// نفس أسلوب makeMockDb المستخدم فعليًا في useAdminActivity.test.ts، بس
// بمسار استيراد '../../../supabaseClient' المطابق للموقع الجديد لهذا الملف.
//
// [إضافة المرحلة 2] الموك اتوسّع عشان يغطي سلاسل generateDocument:
//   document_templates: select(...).eq(id).maybeSingle()  +  update(...).eq(id)
//   template_versions:  select('*').eq(id)[.eq(template_id)].maybeSingle()
//   template_fields:    select('*').eq(template_version_id).order(...)  [array]
//   generated_documents: insert(...).select('*').single()
// كل جدول من دول عنده "طابور" نتائج (queue) بيتاستهلك بالترتيب لكل نداء
// terminal (maybeSingle/single/then) — كافي لأن كل جدول بينادى مرة واحدة
// أو اتنين بالظبط في مسار تنفيذ generateDocument الواحد.
// ══════════════════════════════════════════════════════════════════

type TableResult = { data?: unknown; error?: unknown };

function makeMockDb() {
  const queues: Record<string, TableResult[]> = {};
  const staticResults: Record<string, TableResult> = {
    cases: { data: null },
    case_parties: { data: [] },
  };

  const setResult = (table: string, result: TableResult) => {
    staticResults[table] = result;
  };
  // بيضيف نتيجة لطابور الجدول — بتتستهلك بالترتيب مع كل نداء terminal جديد
  const queueResult = (table: string, result: TableResult) => {
    if (!queues[table]) queues[table] = [];
    queues[table].push(result);
  };
  const nextResult = (table: string): TableResult => {
    const q = queues[table];
    if (q && q.length > 0) return q.shift() as TableResult;
    return staticResults[table] ?? { data: null };
  };

  const insertCalls: Record<string, unknown[]> = {};

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      update: vi.fn(() => builder),
      insert: vi.fn((payload: unknown) => {
        if (!insertCalls[table]) insertCalls[table] = [];
        insertCalls[table].push(payload);
        return builder;
      }),
      maybeSingle: vi.fn(() => Promise.resolve(nextResult(table))),
      single: vi.fn(() => Promise.resolve(nextResult(table))),
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
        const r = nextResult(table);
        if (r.error) return Promise.reject(r.error).catch(reject);
        return Promise.resolve(r).then(resolve);
      },
    };
    return builder;
  });

  return { from, setResult, queueResult, insertCalls };
}

let mockDb = makeMockDb();
vi.mock('../../../supabaseClient', () => ({
  db: { from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a) },
}));

// [إضافة المرحلة 2] office_name (القسم 5) بيتحل من office_settings مباشرة
// عن طريق loadOfficeSetting('name') — مش عمود مربوط بالقضية، فبيتعمله موك منفصل
// بدل ما نموّك جدول office_settings كامل جوه makeMockDb (نطاق generationApi.ts
// الفعلي بيستخدم الدالة الجاهزة من constants.ts مباشرة، مش استعلام خام).
const loadOfficeSettingMock = vi.fn(async (_key: string) => 'مكتب المحامي أحمد عبدالله');
const getCurrentTenantIdMock = vi.fn<() => string | null>(() => 'tenant-1');
vi.mock('../../../constants', () => ({
  loadOfficeSetting: (...a: Parameters<typeof loadOfficeSettingMock>) => loadOfficeSettingMock(...a),
  getCurrentTenantId: (...a: Parameters<typeof getCurrentTenantIdMock>) => getCurrentTenantIdMock(...a),
}));

// الاستيراد لازم يكون بعد vi.mock (hoisting) — نفس ترتيب الملفات المشابهة في المشروع
const { resolveCaseBindings, validateRequiredFields, generateDocument } = await import('../api/generationApi');

// حقول تمثيلية مطابقة لقالب "إنذار على يد محضر" (القسم 5 من الخطة)
const fields: TemplateField[] = [
  { id: 'f1', template_version_id: 'v1', field_key: 'case_number', label_ar: 'رقم القضية', field_type: 'text', is_required: true, binding_source: 'case.number', sort_order: 1 },
  { id: 'f2', template_version_id: 'v1', field_key: 'client_name', label_ar: 'اسم الموكل', field_type: 'text', is_required: true, binding_source: 'party.name', sort_order: 2 },
  { id: 'f3', template_version_id: 'v1', field_key: 'office_name', label_ar: 'اسم المكتب', field_type: 'text', is_required: false, binding_source: null, sort_order: 3 },
  { id: 'f4', template_version_id: 'v1', field_key: 'addressee_name', label_ar: 'اسم المنذَر إليه', field_type: 'text', is_required: true, binding_source: 'party.name', sort_order: 4 },
  { id: 'f5', template_version_id: 'v1', field_key: 'warning_subject', label_ar: 'موضوع الإنذار', field_type: 'textarea', is_required: true, binding_source: null, sort_order: 5 },
];

beforeEach(() => {
  mockDb = makeMockDb();
  loadOfficeSettingMock.mockClear();
  loadOfficeSettingMock.mockResolvedValue('مكتب المحامي أحمد عبدالله');
  getCurrentTenantIdMock.mockClear();
  getCurrentTenantIdMock.mockReturnValue('tenant-1');
});

describe('resolveCaseBindings', () => {
  it('يحل بيانات كاملة: رقم القضية + اسم الموكل + اسم الطرف الآخر، ويسيب الحقول اليدوية null', async () => {
    mockDb.setResult('cases', { data: { case_number_official: '123 لسنة 2026', court: 'محكمة الجيزة الابتدائية' } });
    mockDb.setResult('case_parties', {
      data: [
        { name: 'أحمد محمد', is_client: true },
        { name: 'شركة النور', is_client: false },
      ],
    });

    const result = await resolveCaseBindings('case-1', fields);

    expect(result.case_number).toBe('123 لسنة 2026');
    expect(result.client_name).toBe('أحمد محمد');
    expect(result.addressee_name).toBe('شركة النور');
    expect(result.office_name).toBeNull();
    expect(result.warning_subject).toBeNull();
  });

  it('بيانات ناقصة: القضية موجودة بدون أطراف مسجّلة → أسماء الأطراف null بدون رمي خطأ', async () => {
    mockDb.setResult('cases', { data: { case_number_official: '55 لسنة 2026', court: null } });
    mockDb.setResult('case_parties', { data: [] });

    const result = await resolveCaseBindings('case-2', fields);

    expect(result.case_number).toBe('55 لسنة 2026');
    expect(result.client_name).toBeNull();
    expect(result.addressee_name).toBeNull();
  });

  it('case_id غير موجود أصلاً (القضية اتمسحت أو رقم غلط) → maybeSingle ترجع null، كل bindings الخاصة بالقضية null', async () => {
    mockDb.setResult('cases', { data: null });
    mockDb.setResult('case_parties', { data: [] });

    const result = await resolveCaseBindings('non-existent-case', fields);

    expect(result.case_number).toBeNull();
    expect(result.client_name).toBeNull();
    expect(result.addressee_name).toBeNull();
  });

  it('لو مفيش أي حقل بينه binding_source، ما بيعملش أي نداء لقاعدة البيانات', async () => {
    const manualFields: TemplateField[] = [
      { id: 'm1', template_version_id: 'v1', field_key: 'inquiry_subject', label_ar: 'موضوع الاستعلام', field_type: 'textarea', is_required: true, binding_source: null, sort_order: 1 },
    ];

    const result = await resolveCaseBindings('case-3', manualFields);

    expect(result.inquiry_subject).toBeNull();
    expect(mockDb.from).not.toHaveBeenCalled();
  });
});

describe('validateRequiredFields', () => {
  it('كل الحقول المطلوبة متوفرة → isValid true وقائمة فاضية', () => {
    const values = {
      case_number: '123 لسنة 2026',
      client_name: 'أحمد محمد',
      office_name: null, // مش required، مينفعش يأثر
      addressee_name: 'شركة النور',
      warning_subject: 'تنبيه بسداد المستحقات',
    };

    const result = validateRequiredFields(fields, values);

    expect(result.isValid).toBe(true);
    expect(result.missingRequiredFields).toEqual([]);
  });

  it('حقل مطلوب ناقص (null) → isValid false ومذكور بالاسم', () => {
    const values = {
      case_number: '123 لسنة 2026',
      client_name: null,
      office_name: null,
      addressee_name: 'شركة النور',
      warning_subject: 'تنبيه بسداد المستحقات',
    };

    const result = validateRequiredFields(fields, values);

    expect(result.isValid).toBe(false);
    expect(result.missingRequiredFields).toEqual(['client_name']);
  });

  it('حقل مطلوب فاضي كنص (مسافات فقط) بيتحسب ناقص برضه', () => {
    const values = {
      case_number: '123 لسنة 2026',
      client_name: 'أحمد محمد',
      office_name: null,
      addressee_name: 'شركة النور',
      warning_subject: '   ',
    };

    const result = validateRequiredFields(fields, values);

    expect(result.isValid).toBe(false);
    expect(result.missingRequiredFields).toEqual(['warning_subject']);
  });

  it('أكتر من حقل مطلوب ناقص في نفس الوقت → القائمة بترجع كلهم', () => {
    const values = {
      case_number: null,
      client_name: null,
      office_name: null,
      addressee_name: 'شركة النور',
      warning_subject: null,
    };

    const result = validateRequiredFields(fields, values);

    expect(result.isValid).toBe(false);
    expect(result.missingRequiredFields).toEqual(['case_number', 'client_name', 'warning_subject']);
  });
});

// ══════════════════════════════════════════════════════════════════
// المرحلة 2 — generateDocument()
// تغطية القوالب الأربعة (القسم 5) × 3 أوضاع (case_bound/manual/blank):
//   - case_bound: caseId موجود، case_number/client_name بيتحلوا من القضية/الأطراف
//     تلقائيًا، والحقول اليدوية (زي warning_subject) لازم توصل عبر manualValues
//     برضه لأنها مش مربوطة بالقضية أصلًا (binding_source = null في القسم 5)
//   - manual: كل شيء عبر manualValues، بدون caseId
//   - blank: بدون caseId وبدون manualValues → نجاح متوقع بس لو القالب مالوش
//     حقول يدوية إلزامية غير الأساسية، وإلا فشل بحقول ناقصة — ده اللي بيغطي
//     "حالة الفشل" (لا توليد جزئي) لكل قالب بشكل طبيعي بدل ما نخترع سيناريو تاني
// ══════════════════════════════════════════════════════════════════

type TemplateFixture = {
  templateId: string;
  versionId: string;
  bodyTemplate: string;
  fields: TemplateField[];
  requiredManualKeys: string[]; // حقول is_required=true وbinding_source=null (لازم تتبعت يدوي حتى في case_bound)
};

function makeVersion(fixture: TemplateFixture): TemplateVersion {
  return {
    id: fixture.versionId,
    template_id: fixture.templateId,
    version_number: 1,
    body_template: fixture.bodyTemplate,
    box_template: null,
    status: 'published',
    published_at: '2026-08-16T00:00:00Z',
    created_by: null,
    created_at: '2026-08-16T00:00:00Z',
  };
}

const TEMPLATES: Record<string, TemplateFixture> = {
  warning: {
    templateId: 'tpl-warning',
    versionId: 'ver-warning',
    bodyTemplate: 'إنذار\nإلى: {{addressee_name}}\nمن: {{client_name}}\nرقم القضية: {{case_number}}\n{{warning_subject}}\nمكتب: {{office_name}}',
    fields: [
      { id: 'f1', template_version_id: 'ver-warning', field_key: 'case_number', label_ar: 'رقم القضية', field_type: 'text', is_required: true, binding_source: 'case.number', sort_order: 1 },
      { id: 'f2', template_version_id: 'ver-warning', field_key: 'client_name', label_ar: 'اسم الموكل', field_type: 'text', is_required: true, binding_source: 'party.name', sort_order: 2 },
      { id: 'f3', template_version_id: 'ver-warning', field_key: 'office_name', label_ar: 'اسم المكتب', field_type: 'text', is_required: false, binding_source: null, sort_order: 3 },
      { id: 'f4', template_version_id: 'ver-warning', field_key: 'addressee_name', label_ar: 'اسم المنذَر إليه', field_type: 'text', is_required: true, binding_source: 'party.name', sort_order: 4 },
      { id: 'f5', template_version_id: 'ver-warning', field_key: 'warning_subject', label_ar: 'موضوع الإنذار', field_type: 'textarea', is_required: true, binding_source: null, sort_order: 5 },
    ],
    requiredManualKeys: ['warning_subject'],
  },
  poa: {
    templateId: 'tpl-poa',
    versionId: 'ver-poa',
    bodyTemplate: 'توكيل عام\nالموكل: {{client_name}}\nرقم القضية: {{case_number}}\nالمحامي: {{attorney_name}}\nالنطاق: {{poa_scope}}\nمكتب: {{office_name}}',
    fields: [
      { id: 'f1', template_version_id: 'ver-poa', field_key: 'case_number', label_ar: 'رقم القضية', field_type: 'text', is_required: true, binding_source: 'case.number', sort_order: 1 },
      { id: 'f2', template_version_id: 'ver-poa', field_key: 'client_name', label_ar: 'اسم الموكل', field_type: 'text', is_required: true, binding_source: 'party.name', sort_order: 2 },
      { id: 'f3', template_version_id: 'ver-poa', field_key: 'office_name', label_ar: 'اسم المكتب', field_type: 'text', is_required: false, binding_source: null, sort_order: 3 },
      { id: 'f4', template_version_id: 'ver-poa', field_key: 'attorney_name', label_ar: 'اسم المحامي الموكَّل', field_type: 'text', is_required: true, binding_source: null, sort_order: 4 },
      { id: 'f5', template_version_id: 'ver-poa', field_key: 'poa_scope', label_ar: 'نطاق التوكيل', field_type: 'textarea', is_required: true, binding_source: null, sort_order: 5 },
    ],
    requiredManualKeys: ['attorney_name', 'poa_scope'],
  },
  lawsuit: {
    templateId: 'tpl-lawsuit',
    versionId: 'ver-lawsuit',
    bodyTemplate: 'صحيفة دعوى\nالمحكمة: {{court_name}}\nالمدعي: {{client_name}}\nرقم القضية: {{case_number}}\nالوقائع: {{case_facts}}\nالطلبات: {{case_requests}}\nمكتب: {{office_name}}',
    fields: [
      { id: 'f1', template_version_id: 'ver-lawsuit', field_key: 'case_number', label_ar: 'رقم القضية', field_type: 'text', is_required: true, binding_source: 'case.number', sort_order: 1 },
      { id: 'f2', template_version_id: 'ver-lawsuit', field_key: 'client_name', label_ar: 'اسم الموكل', field_type: 'text', is_required: true, binding_source: 'party.name', sort_order: 2 },
      { id: 'f3', template_version_id: 'ver-lawsuit', field_key: 'office_name', label_ar: 'اسم المكتب', field_type: 'text', is_required: false, binding_source: null, sort_order: 3 },
      { id: 'f4', template_version_id: 'ver-lawsuit', field_key: 'court_name', label_ar: 'اسم المحكمة', field_type: 'text', is_required: true, binding_source: 'case.court', sort_order: 4 },
      { id: 'f5', template_version_id: 'ver-lawsuit', field_key: 'case_facts', label_ar: 'الوقائع', field_type: 'textarea', is_required: true, binding_source: null, sort_order: 5 },
      { id: 'f6', template_version_id: 'ver-lawsuit', field_key: 'case_requests', label_ar: 'الطلبات', field_type: 'textarea', is_required: true, binding_source: null, sort_order: 6 },
    ],
    requiredManualKeys: ['case_facts', 'case_requests'],
  },
  inquiry: {
    templateId: 'tpl-inquiry',
    versionId: 'ver-inquiry',
    bodyTemplate: 'طلب استعلام\nمقدم من: {{client_name}}\nرقم القضية: {{case_number}}\nالموضوع: {{inquiry_subject}}\nمكتب: {{office_name}}',
    fields: [
      { id: 'f1', template_version_id: 'ver-inquiry', field_key: 'case_number', label_ar: 'رقم القضية', field_type: 'text', is_required: true, binding_source: 'case.number', sort_order: 1 },
      { id: 'f2', template_version_id: 'ver-inquiry', field_key: 'client_name', label_ar: 'اسم الموكل', field_type: 'text', is_required: true, binding_source: 'party.name', sort_order: 2 },
      { id: 'f3', template_version_id: 'ver-inquiry', field_key: 'office_name', label_ar: 'اسم المكتب', field_type: 'text', is_required: false, binding_source: null, sort_order: 3 },
      { id: 'f4', template_version_id: 'ver-inquiry', field_key: 'inquiry_subject', label_ar: 'موضوع الاستعلام', field_type: 'textarea', is_required: true, binding_source: null, sort_order: 4 },
    ],
    requiredManualKeys: ['inquiry_subject'],
  },
};

/** بيجهّز الموك عشان generateDocument تلاقي template_versions + document_templates + template_fields */
function primeTemplateLookup(fixture: TemplateFixture, explicitVersion: boolean) {
  if (!explicitVersion) {
    mockDb.queueResult('document_templates', { data: { current_published_version_id: fixture.versionId } });
  }
  mockDb.queueResult('template_versions', { data: makeVersion(fixture) });
  mockDb.queueResult('template_fields', { data: fixture.fields });
}

/** قيم يدوية دنيا كافية لنجاح التوليد (تغطي الحقول is_required بـ binding_source=null) */
function fullManualValues(fixture: TemplateFixture, extra: Record<string, string> = {}): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of fixture.requiredManualKeys) values[key] = `قيمة تجريبية لـ ${key}`;
  return { ...values, ...extra };
}

/**
 * زي fullManualValues، لكن لوضع manual (من غير caseId): مفيش أي بيانات
 * قضية/أطراف تتحل تلقائيًا، فكل حقل is_required — حتى لو binding_source
 * != null (زي addressee_name/court_name) — لازم قيمة يدوية، مش بس
 * requiredManualKeys (اللي بتغطي بس binding_source=null).
 */
function fullManualValuesForManualMode(fixture: TemplateFixture, extra: Record<string, string> = {}): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of fixture.fields) {
    if (f.is_required) values[f.field_key] = `قيمة تجريبية لـ ${f.field_key}`;
  }
  return { ...values, ...extra };
}

describe.each(Object.entries(TEMPLATES))('generateDocument — قالب %s', (_name, fixture) => {
  it('وضع case_bound: بيانات القضية/الأطراف بتتحل تلقائيًا + الحقول اليدوية عبر manualValues → نجاح', async () => {
    primeTemplateLookup(fixture, false);
    mockDb.setResult('cases', { data: { case_number_official: '10 لسنة 2026', court: 'محكمة بني سويف الابتدائية' } });
    mockDb.setResult('case_parties', {
      data: [
        { name: 'محمد علي', is_client: true },
        { name: 'الطرف الآخر', is_client: false },
      ],
    });
    mockDb.queueResult('generated_documents', {
      data: { id: 'doc-1', tenant_id: 'tenant-1', status: 'draft' },
    });

    const result = await generateDocument({
      templateId: fixture.templateId,
      caseId: 'case-1',
      sourceMode: 'case_bound',
      manualValues: fullManualValues(fixture),
    });

    expect(result.id).toBe('doc-1');
    const insertPayload = mockDb.insertCalls['generated_documents']?.[0] as Record<string, unknown>;
    expect(insertPayload.tenant_id).toBe('tenant-1');
    expect(insertPayload.source_mode).toBe('case_bound');
    expect(insertPayload.status).toBe('draft');
    const values = insertPayload.field_values_json as Record<string, unknown>;
    expect(values.case_number).toBe('10 لسنة 2026');
    expect(values.client_name).toBe('محمد علي');
    expect(values.office_name).toBe('مكتب المحامي أحمد عبدالله');
  });

  it('وضع manual: كل القيم عبر manualValues بدون caseId → نجاح', async () => {
    primeTemplateLookup(fixture, false);
    mockDb.queueResult('generated_documents', {
      data: { id: 'doc-2', tenant_id: 'tenant-1', status: 'draft' },
    });

    const result = await generateDocument({
      templateId: fixture.templateId,
      caseId: null,
      sourceMode: 'manual',
      manualValues: fullManualValuesForManualMode(fixture, { case_number: '20 لسنة 2026', client_name: 'موكل يدوي' }),
    });

    expect(result.id).toBe('doc-2');
    const insertPayload = mockDb.insertCalls['generated_documents']?.[0] as Record<string, unknown>;
    expect(insertPayload.source_mode).toBe('manual');
    const values = insertPayload.field_values_json as Record<string, unknown>;
    expect(values.client_name).toBe('موكل يدوي');
  });

  it('وضع blank بدون أي قيم → فشل برسالة توضّح الحقول الناقصة، بدون توليد جزئي', async () => {
    primeTemplateLookup(fixture, false);

    await expect(
      generateDocument({
        templateId: fixture.templateId,
        caseId: null,
        sourceMode: 'blank',
      })
    ).rejects.toThrow(/حقول مطلوبة ناقصة/);

    // مفيش أي محاولة إدراج حصلت — التوليد الجزئي ممنوع (القسم 6، المرحلة 2)
    expect(mockDb.insertCalls['generated_documents']).toBeUndefined();
  });
});

describe('generateDocument — حالات إضافية', () => {
  it('case_bound بدون caseId → يرمي خطأ واضح قبل أي استعلام قضية', async () => {
    primeTemplateLookup(TEMPLATES.inquiry, false);

    await expect(
      generateDocument({
        templateId: TEMPLATES.inquiry.templateId,
        caseId: null,
        sourceMode: 'case_bound',
      })
    ).rejects.toThrow(/caseId مطلوب/);
  });

  it('templateVersionId صريح → بيتخطى استعلام current_published_version_id ويستخدم النسخة المحددة مباشرة', async () => {
    const fixture = TEMPLATES.warning;
    mockDb.queueResult('template_versions', { data: makeVersion(fixture) });
    mockDb.queueResult('template_fields', { data: fixture.fields });
    mockDb.setResult('cases', { data: { case_number_official: '99 لسنة 2026', court: null } });
    mockDb.setResult('case_parties', { data: [{ name: 'عميل', is_client: true }] });
    mockDb.queueResult('generated_documents', { data: { id: 'doc-3', tenant_id: 'tenant-1', status: 'draft' } });

    const result = await generateDocument({
      templateId: fixture.templateId,
      templateVersionId: fixture.versionId,
      caseId: 'case-9',
      sourceMode: 'case_bound',
      manualValues: fullManualValues(fixture, { addressee_name: 'خصم' }),
    });

    expect(result.id).toBe('doc-3');
    const insertPayload = mockDb.insertCalls['generated_documents']?.[0] as Record<string, unknown>;
    expect(insertPayload.template_version_id).toBe(fixture.versionId);
  });

  it('مفيش tenant_id حالي (مستخدم مش مسجّل دخول) → يرمي خطأ ومفيش أي محاولة إدراج', async () => {
    getCurrentTenantIdMock.mockReturnValue(null);
    const fixture = TEMPLATES.inquiry;
    primeTemplateLookup(fixture, false);

    await expect(
      generateDocument({
        templateId: fixture.templateId,
        caseId: null,
        sourceMode: 'manual',
        manualValues: fullManualValues(fixture, { case_number: '1', client_name: 'ك' }),
      })
    ).rejects.toThrow(/tenant_id/);

    expect(mockDb.insertCalls['generated_documents']).toBeUndefined();
  });
});
