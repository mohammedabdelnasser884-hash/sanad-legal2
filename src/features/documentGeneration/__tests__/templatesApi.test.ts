import { describe, it, expect, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════
// [Sanad_Legal_Documents_Library_Transition_Plan.md — مرحلة 2.3]
// تستات getMasterFileUrl + fillDocumentTemplate — الدالتين الجديدتين
// المبنيتين على master_file_path + Edge Function fill-document-template.
// نفس أسلوب makeMockDb المستخدم فعليًا في generationApi.test.ts، موسّع
// هنا بـ`functions.invoke` (بدل insert/update — templatesApi.ts الجديد
// مش بيعمل أي كتابة، قراءة بس + نداء edge function).
// ══════════════════════════════════════════════════════════════════

type TableResult = { data?: unknown; error?: unknown };

function makeMockDb() {
  const queues: Record<string, TableResult[]> = {};
  const nextResult = (table: string): TableResult => {
    const q = queues[table];
    if (q && q.length > 0) return q.shift() as TableResult;
    return { data: null };
  };
  const queueResult = (table: string, result: TableResult) => {
    if (!queues[table]) queues[table] = [];
    queues[table].push(result);
  };

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve(nextResult(table))),
    };
    return builder;
  });

  const invoke = vi.fn();

  return { from, invoke, queueResult };
}

let mockDb = makeMockDb();
vi.mock('../../../supabaseClient', () => ({
  db: {
    from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a),
    functions: { invoke: (...a: unknown[]) => mockDb.invoke(...a) },
  },
}));

const mockGetSignedUrl = vi.fn();
vi.mock('../../../shared/lib/storage', () => ({
  getSignedUrl: (...a: unknown[]) => mockGetSignedUrl(...a),
}));

import { getMasterFileUrl, fillDocumentTemplate } from '../api/templatesApi';

beforeEach(() => {
  mockDb = makeMockDb();
  mockGetSignedUrl.mockReset();
});

function queueVersion(result: TableResult) {
  mockDb.queueResult('template_versions', result);
}

describe('getMasterFileUrl', () => {
  it('نسخة قالب غير موجودة → يرمي خطأ واضح', async () => {
    queueVersion({ data: null, error: null });
    await expect(getMasterFileUrl('missing-version')).rejects.toThrow(
      'Template version missing-version not found'
    );
  });

  it('خطأ من الاستعلام نفسه → يترمى زي ما هو', async () => {
    const dbError = new Error('db down');
    queueVersion({ data: null, error: dbError });
    await expect(getMasterFileUrl('v1')).rejects.toThrow('db down');
  });

  it('master_file_path لسه null (قبل مرحلة 5) → رسالة عربية واضحة، صفر نداء لـgetSignedUrl', async () => {
    queueVersion({ data: { id: 'v1', master_file_path: null, master_file_name: null }, error: null });
    await expect(getMasterFileUrl('v1')).rejects.toThrow('هذا القالب لسه معندوش ملف Word مرفوع');
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('getSignedUrl بترجع null (فشل توليد الرابط) → خطأ واضح', async () => {
    queueVersion({
      data: { id: 'v1', master_file_path: 'system/t1/1.docx', master_file_name: 'قالب.docx' },
      error: null,
    });
    mockGetSignedUrl.mockResolvedValue(null);
    await expect(getMasterFileUrl('v1')).rejects.toThrow('تعذّر توليد رابط تحميل لملف القالب');
  });

  it('نجاح: بينادي getSignedUrl بالباكت والمسار الصح، ويرجّع url+fileName', async () => {
    queueVersion({
      data: { id: 'v1', master_file_path: 'system/t1/1.docx', master_file_name: 'إنذار.docx' },
      error: null,
    });
    mockGetSignedUrl.mockResolvedValue('https://signed.example/system/t1/1.docx?token=x');

    const result = await getMasterFileUrl('v1');

    expect(mockGetSignedUrl).toHaveBeenCalledWith('legal-doc-templates', 'system/t1/1.docx');
    expect(result).toEqual({
      url: 'https://signed.example/system/t1/1.docx?token=x',
      fileName: 'إنذار.docx',
    });
  });

  it('master_file_name فاضي → fallback لاسم مبني على id', async () => {
    queueVersion({
      data: { id: 'v1', master_file_path: 'system/t1/1.docx', master_file_name: null },
      error: null,
    });
    mockGetSignedUrl.mockResolvedValue('https://signed.example/x');

    const result = await getMasterFileUrl('v1');
    expect(result.fileName).toBe('v1.docx');
  });
});

describe('fillDocumentTemplate', () => {
  it('نجاح: بينادي functions.invoke بالاسم والبودي الصح، ويرجّع الـBlob زي ما هو', async () => {
    const fakeBlob = new Blob(['fake-docx-bytes']);
    mockDb.invoke.mockResolvedValue({ data: fakeBlob, error: null });

    const values = { client_name: 'أحمد' };
    const result = await fillDocumentTemplate('v1', values);

    expect(mockDb.invoke).toHaveBeenCalledWith('fill-document-template', {
      body: { template_version_id: 'v1', values },
    });
    expect(result).toBe(fakeBlob);
  });

  it('error راجع من invoke بدون context قابل للاستخراج → رسالة fallback عامة', async () => {
    mockDb.invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code' } });
    await expect(fillDocumentTemplate('v1', {})).rejects.toThrow(
      'تعذّر تعبئة المستند. حاول تاني، ولو تكررت المشكلة تواصل مع الدعم.'
    );
  });

  it('error فيه context.json برسالة عربية مقصودة → بترجع هي (مش الرسالة العامة)', async () => {
    mockDb.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'non-2xx',
        context: { json: async () => ({ error: 'هذا القالب لسه معندوش ملف Word مرفوع' }) },
      },
    });
    await expect(fillDocumentTemplate('v1', {})).rejects.toThrow(
      'هذا القالب لسه معندوش ملف Word مرفوع'
    );
  });

  it('data راجعة مش Blob (رد غير متوقع) → خطأ واضح', async () => {
    mockDb.invoke.mockResolvedValue({ data: { unexpected: true }, error: null });
    await expect(fillDocumentTemplate('v1', {})).rejects.toThrow(
      'رد غير متوقع من خدمة تعبئة المستندات'
    );
  });
});
