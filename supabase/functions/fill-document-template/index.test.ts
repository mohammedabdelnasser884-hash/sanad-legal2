import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubDeno, createRoutedFetch, jsonRequest, type EdgeHandler } from '../_shared/edgeTestUtils';
import { createSupabaseMock, type SupabaseMock } from '../_shared/supabaseClientMock';

// ── mock لـ supabase-js نفسه (بعد alias 'npm:@supabase/supabase-js@2' في
// vitest.config.ts) — نفس نمط process-law-extract/index.test.ts بالحرف. ──
let supabaseMock: SupabaseMock;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => supabaseMock.client,
}));

// ── mock لـ pizzip/docxtemplater (بعد alias في vitest.config.ts) — نفس
// أسلوب unpdf في process-law-extract/index.test.ts: vi.mock بفاكتوري
// بيقرا متغيّرات `let` خارجية وقت النداء الفعلي، عشان يتفادى مشكلة
// vi.resetModules() الموثّقة هناك بالتفصيل. ──────────────────────────
interface DocxState {
  renderShouldThrow: boolean;
  renderErrorMessage: string;
  outputText: string;
  lastRenderData: Record<string, unknown> | null;
  lastConstructedBuffer: Uint8Array | null;
}
function freshDocxState(): DocxState {
  return {
    renderShouldThrow: false,
    renderErrorMessage: 'docxtemplater: tag غير معروف',
    outputText: 'mock-filled-docx-bytes',
    lastRenderData: null,
    lastConstructedBuffer: null,
  };
}
let docxState: DocxState = freshDocxState();

vi.mock('npm:pizzip@3.1.7', () => ({
  default: class PizZipMock {
    buffer: Uint8Array;
    constructor(buffer: Uint8Array) {
      this.buffer = buffer;
      docxState.lastConstructedBuffer = buffer;
    }
  },
}));

vi.mock('npm:docxtemplater@3.62.2', () => ({
  default: class DocxtemplaterMock {
    render(data: Record<string, unknown>) {
      if (docxState.renderShouldThrow) throw new Error(docxState.renderErrorMessage);
      docxState.lastRenderData = data;
    }
    getZip() {
      return { generate: () => new TextEncoder().encode(docxState.outputText) };
    }
  },
}));

const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

interface FetchState {
  authUserOk: boolean;
  authUserBody: unknown;
  profileStatus: number;
  profileRows: unknown[];
}
function freshState(): FetchState {
  return {
    authUserOk: true,
    authUserBody: { id: 'user-1' },
    profileStatus: 200,
    profileRows: [{ user_id: 'user-1', tenant_id: 'tenant-1', is_active: true }],
  };
}

function buildFetchMock(state: FetchState) {
  return createRoutedFetch([
    {
      match: (url) => new URL(url).pathname === '/auth/v1/user',
      respond: () => (state.authUserOk
        ? { status: 200, body: state.authUserBody }
        : { status: 401, body: { message: 'الجلسة منتهية' } }),
    },
    {
      match: (url) => new URL(url).pathname === '/rest/v1/profiles',
      respond: () => (state.profileStatus === 200
        ? { status: 200, body: state.profileRows }
        : { status: state.profileStatus, body: {} }),
    },
  ]);
}

let handler: EdgeHandler;
let state: FetchState;

beforeEach(async () => {
  state = freshState();
  vi.stubGlobal('fetch', buildFetchMock(state));
  supabaseMock = createSupabaseMock();
  docxState = freshDocxState();
  const box = stubDeno(ENV);
  vi.resetModules();
  await import('./index.ts'); // سطر حرفي — لازم يفضل هنا (شوف تعليق stubDeno في edgeTestUtils.ts)
  if (!box.handler) throw new Error('index.ts ما نداش على Deno.serve وقت الاستيراد');
  handler = box.handler;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function req(body: unknown, headers: Record<string, string> = { Authorization: 'Bearer valid-token' }) {
  return jsonRequest(body, headers);
}

function fakeBlob(text = 'fake-master-docx-bytes') {
  return { arrayBuffer: async () => new TextEncoder().encode(text).buffer };
}

function queueVersionFound(overrides: Record<string, unknown> = {}) {
  supabaseMock.queueTable('template_versions', {
    data: {
      id: 'version-1',
      master_file_path: 'system/template-1/1.docx',
      master_file_name: 'إنذار على يد محضر.docx',
      ...overrides,
    },
    error: null,
  });
}

describe('fill-document-template — CORS preflight', () => {
  it('OPTIONS بيرجع 200 بهيدرز CORS من غير ما يدخل منطق الطلب', async () => {
    const res = await handler(new Request('https://edge-function.local/', { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('fill-document-template — الطريقة والتحقق من هوية الطالب', () => {
  it('GET بترجع 405', async () => {
    const res = await handler(new Request('https://edge-function.local/', { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('من غير Authorization header → 401', async () => {
    const res = await handler(jsonRequest({ template_version_id: 'v1' }, {}));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('الجلسة مطلوبة، سجّل الدخول من جديد');
  });

  it('auth/v1/user بيرجع غير ok → 401 "الجلسة منتهية"', async () => {
    state.authUserOk = false;
    const res = await handler(req({ template_version_id: 'v1' }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain('الجلسة منتهية');
  });

  it('مفيش profile مطابق → 403 "حساب غير معروف"', async () => {
    state.profileRows = [];
    const res = await handler(req({ template_version_id: 'v1' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('حساب غير معروف');
  });

  it('حساب معطّل (is_active: false) → 403 "الحساب معطّل"', async () => {
    state.profileRows = [{ user_id: 'user-1', tenant_id: 'tenant-1', is_active: false }];
    const res = await handler(req({ template_version_id: 'v1' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('الحساب معطّل');
  });
});

describe('fill-document-template — التحقق من المدخلات', () => {
  it('من غير template_version_id → 400', async () => {
    const res = await handler(req({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('template_version_id مطلوب');
  });

  it('نسخة القالب غير موجودة (maybeSingle بيرجع null) → 400 "نسخة القالب غير موجودة"', async () => {
    supabaseMock.queueTable('template_versions', { data: null, error: null });
    const res = await handler(req({ template_version_id: 'missing-version' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('نسخة القالب غير موجودة');
  });

  it('master_file_path فاضي (null — قبل مرحلة 5) → 400 برسالة واضحة', async () => {
    queueVersionFound({ master_file_path: null });
    const res = await handler(req({ template_version_id: 'version-1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('هذا القالب لسه معندوش ملف Word مرفوع');
  });
});

describe('fill-document-template — التحميل من Storage والتعبئة', () => {
  it('فشل تحميل الملف من Storage → 400 "فشل تحميل ملف القالب من التخزين"', async () => {
    queueVersionFound();
    supabaseMock.queueStorageDownload('legal-doc-templates', { data: null, error: new Error('not found') });
    const res = await handler(req({ template_version_id: 'version-1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('فشل تحميل ملف القالب من التخزين');
  });

  it('نجاح كامل: بيرجع binary docx بـContent-Type/Content-Disposition صح، ويمرّر القيم لـdocxtemplater.render صح', async () => {
    queueVersionFound();
    supabaseMock.queueStorageDownload('legal-doc-templates', { data: fakeBlob(), error: null });

    const values = { client_name: 'أحمد محمد', case_number: '2026/123' };
    const res = await handler(req({ template_version_id: 'version-1', values }));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    expect(res.headers.get('Content-Disposition')).toContain(encodeURIComponent('إنذار على يد محضر.docx'));

    // القيم المُمرَّرة لازم توصل زي ما هي لـdoc.render (صفر تحويل/فلترة هنا)
    expect(docxState.lastRenderData).toEqual(values);

    // محتوى الاستجابة هو فعليًا الـbytes الراجعة من getZip().generate()
    const resultBytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(resultBytes)).toBe('mock-filled-docx-bytes');
  });

  it('values مش ممرّرة أصلًا في الـbody → بتتحول لـobject فاضي، مش تعذّر بالغلط', async () => {
    queueVersionFound();
    supabaseMock.queueStorageDownload('legal-doc-templates', { data: fakeBlob(), error: null });
    const res = await handler(req({ template_version_id: 'version-1' }));
    expect(res.status).toBe(200);
    expect(docxState.lastRenderData).toEqual({});
  });

  it('خطأ من docxtemplater.render() (tag غير معروف مثلاً) → 400 برسالة عربية عامة، صفر تسريب تفاصيل XML', async () => {
    queueVersionFound();
    supabaseMock.queueStorageDownload('legal-doc-templates', { data: fakeBlob(), error: null });
    docxState.renderShouldThrow = true;
    docxState.renderErrorMessage = 'Multi error — unopened tag {foo';

    const res = await handler(req({ template_version_id: 'version-1' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('تعذّر تعبئة القالب — تأكد إن الملف الأصلي سليم وغير تالف');
    expect(body.error).not.toContain('unopened tag');
  });

  it('اسم الملف الأصلي (master_file_name) فاضي → fallback لاسم افتراضي "مستند.docx"', async () => {
    queueVersionFound({ master_file_name: null });
    supabaseMock.queueStorageDownload('legal-doc-templates', { data: fakeBlob(), error: null });
    const res = await handler(req({ template_version_id: 'version-1' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain(encodeURIComponent('مستند.docx'));
  });
});
