import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useGenerateDocument } from '../hooks/useGenerateDocument';
import type { TemplateField, ResolvedBindings, GeneratedDocument } from '../types';

// ══════════════════════════════════════════════════════════════════
// Mock مباشر لـtemplatesApi.ts + generationApi.ts + loadOfficeSetting —
// بدل موك db متعدد الطبقات، لأن useGenerateDocument.ts بينادي الدوال دي
// مباشرة (getPublishedTemplateFields/resolveCaseBindings/
// validateRequiredFields/generateDocument/loadOfficeSetting) وكلها
// موثّقة/مقفولة توقيعاتها فعليًا في المرحلتين 1/2 — الموك هنا بيغطي
// الـcontract بينها وبين الهوك بس، مش تفاصيل db الداخلية (متغطية في
// generationApi.test.ts أصلاً).
// ══════════════════════════════════════════════════════════════════

const getPublishedTemplateFields = vi.fn();
vi.mock('../api/templatesApi', () => ({
  getPublishedTemplateFields: (...a: unknown[]) => (getPublishedTemplateFields as (...a: unknown[]) => unknown)(...a),
}));

const resolveCaseBindings = vi.fn();
const generateDocument = vi.fn();
vi.mock('../api/generationApi', () => ({
  resolveCaseBindings: (...a: unknown[]) => (resolveCaseBindings as (...a: unknown[]) => unknown)(...a),
  generateDocument: (...a: unknown[]) => (generateDocument as (...a: unknown[]) => unknown)(...a),
  // validateRequiredFields منطق حتمي بسيط (فلترة is_required) — نستخدم
  // نسخة حقيقية مش موك، عشان نختبر تكامله الفعلي مع الهوك.
  validateRequiredFields: (fields: TemplateField[], values: ResolvedBindings) => {
    const missingRequiredFields = fields
      .filter((f) => f.is_required && (values[f.field_key] === null || values[f.field_key] === undefined || values[f.field_key] === ''))
      .map((f) => f.field_key);
    return { isValid: missingRequiredFields.length === 0, missingRequiredFields };
  },
}));

const loadOfficeSetting = vi.fn();
vi.mock('../../../constants', () => ({
  loadOfficeSetting: (...a: unknown[]) => (loadOfficeSetting as (...a: unknown[]) => unknown)(...a),
}));

function makeField(overrides: Partial<TemplateField> = {}): TemplateField {
  return {
    id: overrides.id ?? 'f1',
    template_version_id: 'v1',
    field_key: overrides.field_key ?? 'client_name',
    label_ar: overrides.label_ar ?? 'اسم الموكل',
    field_type: overrides.field_type ?? 'text',
    is_required: overrides.is_required ?? true,
    binding_source: overrides.binding_source ?? null,
    sort_order: overrides.sort_order ?? 0,
    ...overrides,
  } as TemplateField;
}

beforeEach(() => {
  vi.clearAllMocks();
  loadOfficeSetting.mockResolvedValue('مكتب تجريبي');
});

describe('useGenerateDocument', () => {
  it('لا يحمّل أي حقول لو templateId أو sourceMode فاضيين', () => {
    const { result } = renderHook(() => useGenerateDocument({ templateId: null, caseId: null, sourceMode: null }));
    expect(result.current.fields).toEqual([]);
    expect(getPublishedTemplateFields).not.toHaveBeenCalled();
  });

  it('وضع manual: بيحمّل الحقول بقيم فاضية (بدون resolveCaseBindings)', async () => {
    getPublishedTemplateFields.mockResolvedValue([makeField()]);
    const { result } = renderHook(() =>
      useGenerateDocument({ templateId: 't1', caseId: null, sourceMode: 'manual' })
    );
    await waitFor(() => expect(result.current.loadingFields).toBe(false));
    expect(resolveCaseBindings).not.toHaveBeenCalled();
    expect(result.current.values.client_name).toBeNull();
    expect(result.current.fields).toHaveLength(1);
  });

  it('وضع case_bound: بيحمّل القيم من resolveCaseBindings', async () => {
    getPublishedTemplateFields.mockResolvedValue([makeField({ binding_source: 'case.client_name' })]);
    resolveCaseBindings.mockResolvedValue({ client_name: 'أحمد علي' });
    const { result } = renderHook(() =>
      useGenerateDocument({ templateId: 't1', caseId: 'c1', sourceMode: 'case_bound' })
    );
    await waitFor(() => expect(result.current.loadingFields).toBe(false));
    expect(resolveCaseBindings).toHaveBeenCalledWith('c1', expect.any(Array));
    expect(result.current.values.client_name).toBe('أحمد علي');
  });

  it('missingRequiredFieldLabels بيرجع تسميات الحقول الناقصة فقط', async () => {
    getPublishedTemplateFields.mockResolvedValue([
      makeField({ id: 'f1', field_key: 'a', label_ar: 'حقل أ', is_required: true }),
      makeField({ id: 'f2', field_key: 'b', label_ar: 'حقل ب', is_required: false }),
    ]);
    const { result } = renderHook(() =>
      useGenerateDocument({ templateId: 't1', caseId: null, sourceMode: 'manual' })
    );
    await waitFor(() => expect(result.current.loadingFields).toBe(false));
    expect(result.current.isValid).toBe(false);
    expect(result.current.missingRequiredFieldLabels).toEqual(['حقل أ']);
  });

  it('generate() بيرجع null ومايستدعيش generateDocument لو templateId أو sourceMode فاضيين', async () => {
    const { result } = renderHook(() => useGenerateDocument({ templateId: null, caseId: null, sourceMode: null }));
    let doc: GeneratedDocument | null = null;
    await act(async () => { doc = await result.current.generate(); });
    expect(doc).toBeNull();
    expect(generateDocument).not.toHaveBeenCalled();
  });

  it('generate() بينجح ويرجع المستند لما كل شيء متوفر', async () => {
    getPublishedTemplateFields.mockResolvedValue([makeField({ is_required: false })]);
    const fakeDoc = { id: 'd1', status: 'draft', document_content_json: [] } as unknown as GeneratedDocument;
    generateDocument.mockResolvedValue(fakeDoc);
    const { result } = renderHook(() =>
      useGenerateDocument({ templateId: 't1', caseId: null, sourceMode: 'manual' })
    );
    await waitFor(() => expect(result.current.loadingFields).toBe(false));
    let doc: GeneratedDocument | null = null;
    await act(async () => { doc = await result.current.generate(); });
    expect(doc).toEqual(fakeDoc);
    expect(result.current.generateError).toBeNull();
  });

  it('generate() بيسجّل رسالة خطأ واضحة لو generateDocument رفض (حقول مطلوبة ناقصة)', async () => {
    getPublishedTemplateFields.mockResolvedValue([makeField({ is_required: false })]);
    generateDocument.mockRejectedValue(new Error('missing required fields'));
    const { result } = renderHook(() =>
      useGenerateDocument({ templateId: 't1', caseId: null, sourceMode: 'manual' })
    );
    await waitFor(() => expect(result.current.loadingFields).toBe(false));
    await act(async () => { await result.current.generate(); });
    expect(result.current.generateError).toBe('missing required fields');
  });

  it('setValue بيحدّث القيمة المطلوبة بس', async () => {
    getPublishedTemplateFields.mockResolvedValue([makeField({ id: 'f1', field_key: 'a' }), makeField({ id: 'f2', field_key: 'b' })]);
    const { result } = renderHook(() =>
      useGenerateDocument({ templateId: 't1', caseId: null, sourceMode: 'manual' })
    );
    await waitFor(() => expect(result.current.loadingFields).toBe(false));
    act(() => result.current.setValue('a', 'قيمة جديدة'));
    expect(result.current.values.a).toBe('قيمة جديدة');
    expect(result.current.values.b).toBeNull();
  });
});
