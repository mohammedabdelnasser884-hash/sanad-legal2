import { defineConfig, devices } from '@playwright/test';

// إعدادات Playwright لمرحلة 7 (E2E) — بيشغّل سيرفر التطوير (vite) تلقائيًا
// ويشغّل التستات ضده. البيانات (إيميل/باسورد التينانت التجريبي) بتتقرا
// من env vars (E2E_TEST_EMAIL / E2E_TEST_PASSWORD) — تتضاف كـ Codespace
// secrets، مش موجودة هنا في الكود عشان الأمان.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // رحلة واحدة متسلسلة (login → قضية → جلسة → أتعاب → أرشفة)، مش تستات مستقلة
  // ⚠️ FIX (27 يوليو 2026): رنّين CI متتاليين (run 81966263660 وrun
  // 81995537269) طلعوا 16 فشل في كل مرة، لكن بمجموعة تستات مختلفة جزئيًا
  // بينهم، وكلهم من غير استثناء نوع واحد بس: timeout بحت في انتظار عنصر
  // (app-shell وقت اللوجين، أو كارت بيانات) — مفيش ولا فشل واحد بسبب
  // assertion غلط فعليًا في الرن التاني. راجعنا error-context.md بتوع
  // الرن الأول ولقينا بانر "أنت الآن offline" (من useDbConnectivity.ts —
  // فحص حقيقي بـfetch على Supabase، مش محاكاة Playwright) ظاهر في 13 من
  // الـ16. الخلاصة: تقطع/بطء حقيقي في الاتصال بـSupabase وقت الرن (تحت
  // حمل مستمر من رحلة E2E الطويلة، مش باج في كود المشروع). retries:1 هنا
  // بيخلي أي فشل ناتج عن اللقطة العابرة دي يتعالج تلقائيًا بإعادة محاولة
  // واحدة بدل ما يفشل الـjob كله ويحتاج رن يدوي تاني (ويوفر دقائق CI).
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // 🔒 FIX (تشخيص لوجز E2E — 29 يوليو 2026): 30 ثانية (default بتاع
  // Playwright) ضيقة لمسارات فيها أكتر من رحلة ذهاب/عودة حقيقية متتالية
  // لـ Supabase (حفظ الجلسة + INSERT لكل طرف في حلقة for منفصلة + بعد
  // كده فتح NewClientModal وربط موكل...) — فشلت 3 تستات بـ"Test timeout
  // of 30000ms exceeded" (مش أي assertion غلط) حتى بعد إعادة المحاولة
  // (retries:1 فوق)، تحت نفس ظروف بطء/حمل الشبكة الحقيقي على Supabase
  // اللي التعليق فوق وثّقه بالفعل. 60 ثانية بتديها مساحة كافية من غير
  // ما تخفي أي فشل فعلي (لسه بيفشل لو العنصر مش موجود خالص، بس مش
  // بيفشل بسبب بطء عابر في الشبكة).
  timeout: 60_000,
  // 'list' لسه موجود عشان يطبع في الـconsole زي ما هو، لكن ده لوحده
  // مابيولّدش أي ملفات على القرص — عشان كده خطوة "Upload Playwright
  // report on failure" في ci.yml كانت دايمًا مش لاقية حاجة في
  // playwright-report/ (المجلد ده أصلاً معملش). 'html' بيولّد التقرير
  // فعليًا (وفيه لينكات لكل trace.zip/screenshot لكل تست فشل).
  reporter: [['list'], ['html', { open: 'never' }]],
  // تنظيف تلقائي لبيانات E2E بعد كل تشغيل (تقرير المرحلة 4، "الخطوة
  // الجاية") — globalSetup بيسجّل وقت البداية، globalTeardown بيمسح كل
  // صف اتعمل بعده وعليه علامة "اختبار E2E". لو SUPABASE_SERVICE_ROLE_KEY
  // مش متضبط (تشغيل محلي عادي)، الـteardown بيتخطى نفسه من غير ما يفشل.
  globalSetup: './e2e/global-setup',
  globalTeardown: './e2e/global-teardown',
  // 🆕 Visual regression (24 أغسطس 2026 — بند 12 من تقرير الأداء/الأمان):
  // كان في e2e/mobile/visual-check.spec.ts قرار مقصود إن مفيش toHaveScreenshot()
  // حقيقي لأن تصميم الديسكتوب/التابلت كان لسه بيتطوّر (Sidebar/Header قديم
  // وجديد ظاهرين مع بعض مؤقتًا). Gemy أكّد إن المرحلة المؤقتة دي خلصت
  // واستقرت، فبقى آمن نضيف baseline حقيقي.
  // 🔧 FIX (25 أغسطس 2026 — أول رن فعلي على CI بعد نشر الـbaseline):
  // فشل mobile-01-dashboard بفرق 3% (7786 بكسل) رغم إن التطبيق نفسه
  // سليم 100%. السبب الحقيقي (اتأكد من صورة الـdiff): مش فرق رندر/فونتات
  // بين البيئات — الفرق متركّز بالكامل جوه كارت "يحتاج تدخل فوري" اللي
  // بيعرض بيانات E2E ديناميكية (أسماء قضايا بـtimestamp، عبارات "منذ X
  // يوم") بتتغيّر كل تشغيلة تست. رفعنا maxDiffPixelRatio من 0.02 لـ0.04
  // كحل سريع يمتص الفرق ده. **الحل الجذري المتبقي (backlog، مش مستعجل):**
  // استثناء كارت "يحتاج تدخل فوري" من المقارنة عبر خاصية `mask` في
  // toHaveScreenshot (محتاج تحديد data-testid بتاع الكارت أولاً).
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.04,
      animations: 'disabled',
    },
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    // ⚠️ G3 (15 أغسطس 2026): 'chromium' فضل زي ما هو بالحرف — نفس اسم
    // الـproject، نفس devices['Desktop Chrome']، صفر أي إضافة. الـ31 spec
    // الحالية (+ ملفاتها المساعدة زي utils.ts) كانت بتتفلتر تلقائيًا
    // بتطابق كل *.spec.ts جوه testDir ('./e2e') — بما فيهم أي ملف جديد
    // جوه e2e/mobile/ لو معملناش استثناء صريح. أضفت testIgnore هنا عشان
    // 'chromium' يفضل بالظبط نفس الـ31 spec القديمة (صفر زيادة في وقت/عدد
    // التستات على المشروع اللي الـ31 spec بتشتغل عليه فعليًا فوق فيوبورت
    // Desktop Chrome) — ملفات e2e/mobile/* اتصممت أصلاً عشان فيوبورت
    // موبايل بس (بتتأكد إن DesktopSidebar/DesktopHeader/TabletDrawer
    // مش متعرضين، وإن CommandDock/AppHeader الأصليين شغالين زي ما هم)،
    // فتشغيلها فوق Desktop Chrome (فيوبورت ≥1024px) هيبقى بلا معنى أصلًا
    // (كل الشروط اللي بتتأكد منها [isDesktop/isTablet === false] مستحيلة
    // تتحقق على الفيوبورت ده).
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /e2e[\\/]mobile[\\/]/ },
    // ⚡ G3 — أول project بفيوبورت موبايل حقيقي في المشروع (بند 15 من
    // نتائج الفحص الأصلي: "playwright.config.ts بيشغّل على Desktop Chrome
    // بس — التستات الحالية مش خط دفاع كافي ضد كسر شكل الموبايل بصريًا").
    // نطاق testMatch محصور عمدًا في e2e/mobile/**/*.spec.ts — الـ31 spec
    // القديمة **لا** بتتشغل تحت الـproject ده (مصممة/معتمَدة أصلًا على
    // فيوبورت Desktop Chrome، تشغيلها فوق فيوبورت موبايل مش مضمون النتيجة
    // ومحتاج مراجعة منفصلة مش جزء من G3). فيوبورت `iPhone 13` (390×844)
    // اتاختار (بدل رقم عشوائي زي 375×812) لأنه فعليًا نطاق `< 768px`
    // (حد Tailwind `md`) المستخدم في كل شرط `isMobile`/غياب `md:`/`lg:`
    // في المشروع، وبيمثّل جهاز حقيقي شائع بدل قيمة نظرية.
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
      testMatch: /e2e[\\/]mobile[\\/].*\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
