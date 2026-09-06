import { defineConfig } from '@playwright/test';

// job "e2e-cleanup" في .github/workflows/e2e.yml — بيتشغل مرة واحدة بس
// بعد ما الـ4 shards (job "e2e") يخلصوا كلهم، وبيشغل نفس
// e2e/global-teardown.ts الحقيقي (من غير SKIP_GLOBAL_TEARDOWN) عشان يمسح
// بيانات E2E المعلَّمة من التينانت — مرة واحدة، مش 4 مرات متزامنة.
// راجع تعليق "FIX (Sharding — 6 سبتمبر 2026)" في global-teardown.ts للسبب.
//
// testDir محصور في e2e/cleanup (تست فاضي واحد بس، noop.spec.ts) — لازم
// Playwright يشغّل test واحد على الأقل عشان ينفذ globalTeardown، لكن مفيش
// أي داعي لتشغيل الـsuite الحقيقي (31 spec) أو webServer أو تثبيت أي
// browser في الـjob ده، فبيفضل سريع جدًا (ثواني، مش دقايق).
export default defineConfig({
  testDir: './e2e/cleanup',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 10_000,
  reporter: [['list']],
  globalTeardown: './e2e/global-teardown',
});
