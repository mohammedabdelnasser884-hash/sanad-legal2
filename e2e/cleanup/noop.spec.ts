import { test, expect } from '@playwright/test';

// job "e2e-cleanup" (شوف .github/workflows/e2e.yml وplaywright.cleanup.config.ts)
// محتاج playwright test بتشغل حاجة عشان globalTeardown يتنفذ — Playwright
// مبينفذش global(Setup|Teardown) من غير أي test يتشغل فعليًا. التست ده مقصود
// يكون فاضي وسريع (مفيهوش `page` fixture، فمفيش browser أصلاً بيتفتح ولا
// حاجة من webServer بتتشغل) — الغرض الوحيد بتاعه إنه يخلي Playwright يشغّل
// globalTeardown من playwright.cleanup.config.ts بعد ما الـ4 shards يخلصوا.
test('noop — يشغّل globalTeardown بس', async () => {
  expect(true).toBe(true);
});
