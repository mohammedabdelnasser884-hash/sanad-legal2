import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TemplateField } from '../types';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي سلسلتي الاستدعاء الفعليتين في
// generationApi.ts (اتأكدت منهم بقراءة الكود، مفيش تخمين):
//   db.from('cases').select('case_number_official, court').eq('id', v).maybeSingle()
//   db.from('case_parties').select('name, is_client').eq('case_id', v)   [ترجع array]
// نفس أسلوب makeMockDb المستخدم فعليًا في useAdminActivity.test.ts، بس
// بمسار استيراد '../../../supabaseClient' المطابق للموقع الجديد لهذا الملف.
// ══════════════════════════════════════════════════════════════════

type TableResult = { data?: unknown; error?: unknown };

function makeMockDb() {
  const results: Record<string, TableResult> = {
    cases: { data: null },
    case_parties: { data: [] },
  };
  const setResult = (table: string, result: TableResult) => {
    results[table] = result;
  };

  const from = vi.fn((table: string) => ({
    select: vi.fn(() => {
      const builder: Record<string, unknown> = {
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(() => Promise.resolve(results[table] ?? { data: null })),
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          const r = results[table] ?? { data: [] };
          if (r.error) return Promise.reject(r.error).catch(reject);
          return Promise.resolve(r).then(resolve);
        },
      };
      return builder;
    }),
  }));

  return { from, setResult };
}

let mockDb = makeMockDb();
vi.mock('../../../supabaseClient', () => ({
  db: { from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a) },
}));

// الاستيراد لازم يكون بعد vi.mock (hoisting) — نفس ترتيب الملفات المشابهة في المشروع
const { resolveCaseBindings, validateRequiredFields } = await import('../api/generationApi');

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
