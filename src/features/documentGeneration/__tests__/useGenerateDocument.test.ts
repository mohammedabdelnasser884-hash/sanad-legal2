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
// 🆕 بند 4 (الأوفلاين): resolveTemplateVersion بقت بتتنادى أونلاين مع كل
// تحميل حقول ناجح (لبناء كاش offlineTemplateCache.ts) — لازم موك ليها
// وإلا كل تستات النجاح القديمة تفشل. renderDocumentContent (pure function)
// متغطية مباشرة في generationApi.test.ts، هنا بنستخدم نسخة حقيقية بسيطة.
const resolveTemplateVersion = vi.fn();
vi.mock('../api/generationApi', () => ({
  resolveCaseBindings: (...a: unknown[]) => (resolveCaseBindings as (...a: unknown[]) => unknown)(...a),
  generateDocument: (...a: unknown[]) => (generateDocument as (...a: unknown[]) => unknown)(...a),
  resolveTemplateVersion: (...a: unknown[]) => (resolveTemplateVersion as (...a: unknown[]) => unknown)(...a),
  renderDocumentContent: (bodyTemplate: string, fields: TemplateField[], values: ResolvedBindings) => {
    let text = bodyTemplate;
    for (const f of fields) {
      const v = values[f.field_key];
      text = text.split(`{{${f.field_key}}}`).join(v !== null && v !== undefined ? String(v) : '');
    }
    return [{ type: 'intro', text }];
  },
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
const getCurrentTenantId = vi.fn();
vi.mock('../../../constants', () => ({
  loadOfficeSetting: (...a: unknown[]) => (loadOfficeSetting as (...a: unknown[]) => unknown)(...a),
  getCurrentTenantId: (...a: unknown[]) => (getCurrentTenantId as (...a: unknown[]) => unknown)(...a),
}));

// 🆕 بند 4: __dbWrite (طابور الأوفلاين) بيتنادى بس لما generate() تتنفذ
// وإحنا أوفلاين — موك بسيط هنا، تفاصيل __dbWrite نفسه متغطية في
// offlineQueue tests الموجودة أصلاً.
const dbWrite = vi.fn();

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
  resolveTemplateVersion.mockResolvedValue({ id: 'v1', body_template: 'مرحبا {{client_name}}' });
  getCurrentTenantId.mockReturnValue('tenant-1');
  // 🆕 بند 4: كل تست بيبدأ من كاش فاضي (offlineTemplateCache.ts بيستخدم
  // sessionStorage) — من غيره تستات الأوفلاين ممكن تتأثر ببعض.
  sessionStorage.clear();
  (window as unknown as { __dbWrite: typeof dbWrite }).__dbWrite = dbWrite;
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
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

  // ══════════════════════════════════════════════════════════════════
  // 🆕 بند 4 — الأوفلاين (القسم 17.6، "خيار أ")
  // ══════════════════════════════════════════════════════════════════
  describe('الأوفلاين (بند 4)', () => {
    it('تحميل ناجح أونلاين بيبني كاش محلي — بعدين نفس الشاشة أوفلاين بتقرا منه', async () => {
      getPublishedTemplateFields.mockResolvedValue([makeField({ is_required: false, field_key: 'client_name' })]);
      resolveTemplateVersion.mockResolvedValue({ id: 'v9', body_template: 'مرحبا {{client_name}}' });
      const { result, unmount } = renderHook(() =>
        useGenerateDocument({ templateId: 't1', caseId: null, sourceMode: 'manual' })
      );
      await waitFor(() => expect(result.current.loadingFields).toBe(false));
      expect(result.current.usingOfflineCache).toBe(false);
      unmount();

      // رجوع لنفس الشاشة وإحنا أوفلاين
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      const { result: result2 } = renderHook(() =>
        useGenerateDocument({ templateId: 't1', caseId: null, sourceMode: 'manual' })
      );
      await waitFor(() => expect(result2.current.loadingFields).toBe(false));
      expect(result2.current.usingOfflineCache).toBe(true);
      expect(result2.current.loadError).toBeNull();
      expect(result2.current.fields).toHaveLength(1);
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });

    it('أوفلاين من غير أي كاش سابق: نفس رسالة الخطأ القديمة', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      const { result } = renderHook(() =>
        useGenerateDocument({ templateId: 'never-cached', caseId: null, sourceMode: 'manual' })
      );
      await waitFor(() => expect(result.current.loadingFields).toBe(false));
      expect(result.current.loadError).toBe('أنت أوف لاين — تعذّر تحميل حقول القالب. تحقق من الاتصال بالإنترنت.');
      expect(result.current.usingOfflineCache).toBe(false);
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });

    it('generate() أوفلاين مع كاش: بيبني المستند محليًا ويقيّده في __dbWrite بدل ما يرفض', async () => {
      getPublishedTemplateFields.mockResolvedValue([makeField({ is_required: false, field_key: 'client_name' })]);
      resolveTemplateVersion.mockResolvedValue({ id: 'v9', body_template: 'مرحبا {{client_name}}' });
      dbWrite.mockResolvedValue({ error: null, offline: true, queued: true });
      const { result } = renderHook(() =>
        useGenerateDocument({ templateId: 't1', caseId: null, sourceMode: 'manual' })
      );
      await waitFor(() => expect(result.current.loadingFields).toBe(false));

      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      let doc: GeneratedDocument | null = null;
      await act(async () => { doc = await result.current.generate(); });
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      expect(doc).not.toBeNull();
      expect(doc!.id.startsWith('offline-doc-')).toBe(true);
      expect(doc!.document_content_json).toEqual([{ type: 'intro', text: 'مرحبا ' }]);
      expect(dbWrite).toHaveBeenCalledWith(expect.objectContaining({ type: 'INSERT', table: 'generated_documents' }));
      expect(generateDocument).not.toHaveBeenCalled();
      expect(result.current.generateError).toBeNull();
    });

    it('generate() أوفلاين من غير كاش: بيرجع رسالة واضحة ومايناديش __dbWrite', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      const { result } = renderHook(() =>
        useGenerateDocument({ templateId: 'never-cached-2', caseId: null, sourceMode: 'manual' })
      );
      await waitFor(() => expect(result.current.loadingFields).toBe(false));
      let doc: GeneratedDocument | null = null;
      await act(async () => { doc = await result.current.generate(); });
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      expect(doc).toBeNull();
      expect(dbWrite).not.toHaveBeenCalled();
      expect(result.current.generateError).toContain('أوف لاين');
    });
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
