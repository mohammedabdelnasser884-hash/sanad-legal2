// ══════════════════════════════════════════════════════
//  ملف اختبار فقط (مش جزء من الفانكشنز المنشورة، ومش بديل حقيقي
//  لمكتبة 'pizzip' الفعلية) — بديل محلي بسيط بنفس شكل الاستخدام
//  اللي fill-document-template/index.ts محتاجه من 'npm:pizzip'
//  (`new PizZip(buffer)`، أي حاجة تانية مش مستخدمة فعليًا هنا).
//
//  السبب: 'pizzip' مش موجودة في package.json (بعكس supabase-js
//  اللي ليها alias لباكدج حقيقي مثبّت) — نفس سبب unpdfMock.ts
//  بالحرف. alias في vitest.config.ts بيوجّه 'npm:pizzip' لهذا الملف،
//  والتست الفعلي بيعمل vi.mock('npm:pizzip', ...) بفاكتوري منفصل
//  (زي unpdf) عشان يتفادى مشكلة vi.resetModules() الموثّقة في
//  process-law-extract/index.test.ts.
// ══════════════════════════════════════════════════════

export default class PizZipMock {
  buffer: Uint8Array;
  constructor(buffer: Uint8Array) {
    this.buffer = buffer;
  }
}
