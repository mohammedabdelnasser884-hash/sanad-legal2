// ══════════════════════════════════════════════════════
//  ملف اختبار فقط (مش جزء من الفانكشنز المنشورة، ومش بديل حقيقي
//  لمكتبة 'docxtemplater' الفعلية) — بديل محلي بسيط بنفس شكل
//  الاستخدام اللي fill-document-template/index.ts محتاجه من
//  'npm:docxtemplater': `new Docxtemplater(zip, opts)`، `.render(data)`،
//  `.getZip().generate(opts)`.
//
//  السبب: 'docxtemplater' مش موجودة في package.json — نفس سبب
//  unpdfMock.ts/pizzipMock.ts بالحرف. alias في vitest.config.ts بيوجّه
//  'npm:docxtemplater' لهذا الملف، والتست الفعلي بيعمل
//  vi.mock('npm:docxtemplater', ...) بفاكتوري منفصل قابل للتحكم فيه
//  من كل تست (نفس نمط unpdf — راجع process-law-extract/index.test.ts).
// ══════════════════════════════════════════════════════

export interface DocxtemplaterOptions {
  paragraphLoop?: boolean;
  linebreaks?: boolean;
  nullGetter?: () => string;
}

export default class DocxtemplaterMock {
  zip: unknown;
  opts: DocxtemplaterOptions;
  lastRenderData: Record<string, unknown> | null = null;

  constructor(zip: unknown, opts: DocxtemplaterOptions) {
    this.zip = zip;
    this.opts = opts;
  }

  render(data: Record<string, unknown>) {
    this.lastRenderData = data;
  }

  getZip() {
    return {
      generate: (_opts: { type: string }) => new TextEncoder().encode('mock-filled-docx-bytes'),
    };
  }
}
