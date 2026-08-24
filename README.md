# سَنَد — نظام التشغيل القانوني

منصة SaaS لإدارة مكاتب المحاماة: قضايا، موكلين، جلسات، أتعاب، مستندات
قانونية، ومساعد ذكاء اصطناعي — مبنية بـReact + Supabase.

## التقنيات

| الطبقة | التقنية |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| التنسيق | Tailwind CSS |
| Backend | Supabase (Postgres + Auth + Edge Functions + Storage) |
| الاختبارات | Vitest (وحدة) + Playwright (E2E) |
| PWA | Service Worker + دعم Offline |

## البدء السريع

```bash
npm install
cp .env.example .env   # لو موجود — واملأ متغيرات Supabase
npm run dev             # يشغّل على vite dev server
```

المتغيرات المطلوبة في `.env` (أو بيئة الـdeployment):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## الأوامر الأساسية

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | تشغيل بيئة التطوير |
| `npm run build` | lint + type-check + بناء نسخة الإنتاج |
| `npm run type-check` | فحص TypeScript فقط (بدون بناء) |
| `npm run lint` | ESLint (`--max-warnings=0`، أي `any` أو مشكلة hooks بتوقف الأمر) |
| `npm test` | تشغيل اختبارات الوحدة (Vitest) مرة واحدة |
| `npm run test:watch` | اختبارات الوحدة في وضع المراقبة |
| `npm run test:e2e` | اختبارات Playwright الشاملة |
| `npm run preview` | معاينة نسخة الإنتاج المبنية محليًا |
| `npm run build:analyze` | بناء الإنتاج + توليد `dist/stats.html` (خريطة حجم الـbundle لكل مكتبة/chunk) |
| `npm run test:visual` | Visual regression (Playwright `toHaveScreenshot()`) — 3 breakpoints × 5 شاشات، مقارنة ضد baseline محفوظة |
| `npm run test:visual:update` | تحديث baseline اللقطات البصرية (شغّلها بعد أي تغيير تصميم مقصود، وراجع الفروقات بالعين قبل الـcommit) |

## بنية المشروع

```
src/
├── app/            — قشرة التطبيق (navigation shell، modals عامة، header)
├── features/        — كل ميزة في مجلد مستقل (admin, ai, cases, clients,
│                       dashboard, documentGeneration, fees, reminders...)
├── pages/           — صفحات مستوى أعلى (login، legal documents...)
├── shared/           — مكوّنات/منطق مشترك بين الميزات (ui, modals, hooks, lib)
├── hooks/            — hooks عامة على مستوى التطبيق
├── lib/              — منطق أساسي (offline queue، إلخ)
├── supabaseClient.ts — عميل Supabase الوحيد في المشروع
└── constants.ts      — أيقونات، إعدادات الدول، إعدادات المكتب

supabase/functions/  — Edge Functions (admin-actions, ai-chat, embed-batch,
                         office-login, saas-admin, telegram-send...)
database/migrations/  — كل SQL migrations بالترتيب الزمني
e2e/                   — اختبارات Playwright الشاملة
docs/                  — توثيق داخلي (خطط، تقارير، مراجعات) — راجع
                         docs/README.md للفهرس الكامل
```

## قواعد أساسية قبل أي Pull Request

- `npm run build` لازم يعدّي كامل (lint + type-check + build) قبل أي دمج.
- المشروع بيمنع `any` تمامًا (`@typescript-eslint/no-explicit-any: error`) —
  استخدم النوع الصريح دايمًا.
- اختبارات RTL محتاجة `afterEach(() => cleanup())` يدوي (الإعداد بـ
  `globals: false` في `vitest.config.ts`، فمفيش auto-cleanup).
- المشروع مفيهوش `@testing-library/jest-dom` — استخدم matchers فانيلا
  (`toBeTruthy`, `toBeNull`, `toContain`) بدل `toBeInTheDocument`.

## التوثيق

- **`docs/`** — الأرشيف الكامل للخطط والتقارير والمراجعات. ابدأ من
  [docs/README.md](docs/README.md) للفهرس.
- **[CHANGELOG.md](CHANGELOG.md)** — سجل التغييرات حسب الإصدار.
