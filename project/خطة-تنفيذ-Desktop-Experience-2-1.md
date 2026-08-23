# خطة تنفيذ — تجربة Desktop احترافية لـ"سَنَد" مع الحفاظ الكامل على Mobile

**تاريخ الفحص الأصلي:** 13 أغسطس 2026
**تاريخ تقسيم المراحل:** 14 أغسطس 2026 (نسخة 2 — نفس الفحص، بس المراحل A–G مقسّمة داخليًا لمراحل جزئية أصغر)
**نوع الملف:** خطة تنفيذ + تتبع حالة حي (Living Status Tracker) — هيتحدث بعد كل مرحلة جزئية.

---

## 0) طريقة العمل الجديدة (التسليم بعد كل مرحلة جزئية)

بدل ما التسليم يحصل بعد كل مرحلة كبيرة (A، B، C...)، هيحصل بعد **كل مرحلة فرعية** (A1، A2، B1، B2...). كل تسليم فيه:

1. **الزيب كامل محدث** — نفس نمط التسليم المعتاد (`sanad-project-updated-final-N.zip`)، فيه كل المشروع بعد آخر تعديل، مش بس الملفات اللي اتغيرت.
2. **نفس هذا التقرير محدّث** — قسم "0.1) حالة التنفيذ" تحت ده هيتحدث في كل تسليم: المرحلة الجزئية اللي خلصت بتتحط ✅ مع سطر يوصف اللي اتعمل فعليًا (مش المخطط بس)، والمرحلة الجزئية الجاية بتتحط 🔵 "التالية"، والباقي يفضل ⬜.

مفيش مرحلة جزئية بتتسلّم من غير الاتنين مع بعض (زيب + تقرير محدث) — ده عشان تقدر ترجع لأي نقطة زمنية وتعرف بالظبط الكود اتلمس فين والتقرير بيوثق إيه.

### 0.1) حالة التنفيذ (هتتحدث أول بأول)

| المرحلة | المرحلة الجزئية | الحالة | ملاحظات |
|---|---|---|---|
| A | A1 — `useResponsiveLayout.ts` | ✅ | تم إنشاء `src/shared/hooks/useResponsiveLayout.ts` — hook بنمط `useThemeMode.ts` (state + effect)، بيستخدم `matchMedia('(min-width:768px)')` و`(min-width:1024px)` مع `change` listener (بدون `resize` يدوي)، بيرجع `{mode, isDesktop, isTablet, isMobile}`. لسه **مش مستخدم في أي مكان** (مفيش استيراد له في أي ملف) — الهدف من A1 كان الـ hook نفسه بس وإثبات صحته بمعزل عن أي تغيير في الشجرة. تم التحقق بـ `node --experimental-strip-types --check`. |
| A | A2 — `navConfig.ts` | ✅ | تم إنشاء `src/app/shell/navConfig.ts`. يصدّر `NavItem` interface + 3 مصفوفات (`primaryNavItems` — الرئيسية/الجلسات/القضايا/المهام، `moreNavItems` — الموكلين/المستندات/الأتعاب/لوحة الإدارة [أدمن بس]، `desktopOnlyNavItems` — عنصر `team` الجديد [أدمن بس، أيقونة `I.Users`، `data-testid="desktop-nav-team"`] طبقًا لقرار قسم 14) + دالة `navItemsFor(isAdmin)` بترجّع القائمة الكاملة مفلترة. نفس الأيقونات/التسميات/الـ`data-testid` الأصلية من `CommandDock.tsx` بالحرف، بدون أي تغيير عليه. زرار AI اتسيب برّه القائمة عمدًا (بيفتح مودال مش تاب — منطقه مختلف). تم التحقق بـ `node --experimental-strip-types --check` وتأكيد إن الملف **لسه مش مستورد في أي مكان** (لا `CommandDock` ولا غيره) — نفس مبدأ A1: إثبات الملف بمعزل الأول. |
| A | A3 — `AppShell.tsx` هيكلي (بدون تغيير بصري) | ✅ | تم إنشاء `src/app/shell/AppShell.tsx`. مكوّن هيكلي بحت (`{children, className?}` بس) بيرجّع نفس الـ div الجذري الموجود حاليًا في `App.tsx:423` بالحرف: نفس `className` (`h-full flex flex-col bg-premium-bg`) ونفس `data-testid="app-shell"` (اتأكد إنه معتمد عليه فعليًا في `e2e/utils.ts` و`auth.spec.ts` و`universal-search.spec.ts` و`reminders-view.spec.ts` — محفوظ بالحرف). صفر منطق/state/effects — مجرد wrapper. `useResponsiveLayout` (A1) **لسه مش متستخدم هنا عمدًا** لأن مفيش حاجة تستهلك نتيجته لحد ما DesktopSidebar/DesktopHeader يتبنوا (بعد B). تم التحقق بـ`node --experimental-strip-types --check` (عبر نسخة `.ts` مؤقتة لتفادي قيد Node مع امتداد `.tsx`) وتأكيد إن الملف **لسه مش مستورد في أي مكان** — الدمج الفعلي في `App.tsx` مؤجل لـA4 عمدًا. |
| A | A4 — دمج `AppShell` في `App.tsx` | 🔵 | التالية — استبدال الـ div الجذري inline في `App.tsx` باستخدام `<AppShell>` فعليًا، مع تشغيل الـ E2E للتأكد إن `data-testid="app-shell"` والسلوك لسه سليمين 100%. |
| B | B1 — `DesktopSidebar.tsx` (موسّع بس، بدون طي) | ⬜ | |
| B | B2 — الطي + localStorage + Tooltips | ⬜ | |
| B | B3 — `DesktopHeader.tsx` | ⬜ | |
| B | B4 — نشر `--app-sidebar-w` + ربط `<main>` | ⬜ | |
| C | C1 — Padding/max-width متجاوب لـ `<main>` | ⬜ | |
| C | C2 — Dashboard stats grid (`lg:` تعديل مسافات) | ⬜ | |
| C | C3 — Dashboard قسم الجلسات/القضايا (عمودين) | ⬜ | |
| D | D1 — `CaseRow` + هيكل جدول القضايا | ⬜ | |
| D | D2 — ربط الجدول بالفلترة/البحث/الصفحات (تطابق مع الكروت) | ⬜ | |
| D | D3 — جدول الموكلين (نفس النمط) | ⬜ | |
| E | E1 — `CaseDetailView` عمودين (بيانات + إجراءات سريعة) | ⬜ | |
| E | E2 — `NewCaseModal`/`EditCaseModal` — Grid للحقول القصيرة | ⬜ | |
| E | E3 — باقي الفورمات الرئيسية (موكل، جلسة) | ⬜ | |
| F | F1 — `useModalPresentation` hook | ⬜ | |
| F | F2 — تطبيقه على أهم 3 مودالات | ⬜ | |
| F | F3 — تطبيقه على 3 مودالات تانية + `max-width` لكل واحد | ⬜ | |
| G | G1 — Drawer للـ Tablet | ⬜ | |
| G | G2 — aria-labels / A11y pass | ⬜ | |
| G | G3 — Playwright project لفيوبورت موبايل + سكريبت تحقق بصري | ⬜ | |
| G | G4 — تشغيل الـ 31 E2E الحالية + تقرير ختامي شامل | ⬜ | |

**مفتاح الحالة:** ⬜ لسه ماتعملش · 🔵 المرحلة الجزئية الجاية (التالية في الدور) · 🟡 شغال عليها دلوقتي · ✅ خلصت وتم التسليم (زيب + تقرير)

---

## 1) ملخص اللي لقيته فعليًا في الكود (Findings)

| # | الملاحظة | الدليل |
|---|---|---|
| 1 | **صفر** استخدام لأي responsive prefix من Tailwind (`sm:` `md:` `lg:` `xl:` `2xl:`) في كل المشروع (95 ملف `.tsx`). | `grep -rho "\(sm\|md\|lg\|xl\|2xl\):" src/` → 0 نتيجة |
| 2 | مفيش أي `<table>` HTML في المشروع كله. القضايا/الموكلين بيتعرضوا كـ **كروت عمودية واحدة تحت التانية** (`space-y-2`) — `CasesTab.tsx:139` (`renderCaseCard`) و`ClientsTab.tsx`. | `grep -rl "<table" src/features` → لا يوجد |
| 3 | `tailwind.config.js` مفيهوش breakpoints مخصصة → يبقى الافتراضي: `sm:640 md:768 lg:1024 xl:1280 2xl:1536`. مفيش تعارض لو استخدمناها. | `tailwind.config.js` |
| 4 | جذر التطبيق (`App.tsx:423`) مفيهوش أي `max-width` — يعني على شاشة كبيرة، الـ `<main>` بياخد العرض كامل فعليًا، لكن كل المحتوى جواه (كروت/فورمات بـ`max-w-sm`/`max-w-lg`) بيفضل ضيق وسط فراغ. ده بالظبط سبب شكل "الموبايل المكبّر". | `App.tsx:423-434` |
| 5 | التنقل الأساسي حاليًا **شريط سفلي عائم** (`CommandDock.tsx`) — عناصره: 🏠 الرئيسية، 📅 الجلسات، 🤖 AI (وسط)، ⚖️ القضايا، 🔔 تذكيرات، + زر "المزيد" بيفتح شبكة (👥 الموكلين، 📁 المستندات، 💰 الأتعاب، 🛡 لوحة الإدارة [أدمن بس]). | `CommandDock.tsx` سطور 81-140 و`data-testid="nav-*"` |
| 6 | `useNavigation.ts` (Custom History API navigation، **مفيش react-router** في المشروع) بيعرّف 9 تابات: `dashboard, cases, clients, calendar, fees, reminders, team, documents, admin`. تاب `team` معرّف وشغال (`App.tsx:474`) لكن **مالوش زرار تنقل مباشر**. | `useNavigation.ts` سطور 30-46 |
| 7 | الـ Modals كلها (39+ مودال) بتستخدم نمط "Bottom Sheet" — 22 ملف بنمط `items-end justify-center`، و9 ملفات confirm dialogs بنمط `items-center`. أقصى عرض مستخدم `max-w-lg` (512px). | `grep "items-end justify-center"` → 22 |
| 8 | فيه CSS variables جاهزة ومركزية (Design Tokens): `--bg --card --gold --border --text-primary ...` في `index.css`، وكمان `--app-header-h` و`--app-navbar-h` بيتم نشرهم ديناميكيًا من `useNavbarHeightVar.ts` و`AppHeader.tsx`. | `index.css:52-75`, `useNavbarHeightVar.ts` |
| 9 | `body`/`html` عندهم `h-full overflow-hidden`، والـ scroll الفعلي جوه `<main class="flex-1 overflow-y-auto no-scrollbar">`. أي Shell جديد لازم يحافظ على نفس نمط الـ scroll container. | `index.html:24,26-31`, `App.tsx:423-434` |
| 10 | فيه بالفعل `src/app/` فيه `AppModals.tsx`، `CommandDock.tsx`، `HeaderMenu.tsx`، `AppLoadingScreen.tsx`، `ExitConfirmModal.tsx` — مكان الـ Shell الجديد الطبيعي هو `src/app/shell/...`. | `ls src/app` |
| 11 | `AppModals.tsx` فعليًا بياخد ~40 prop (تأكيد العدّ من `App.tsx:501-528`). | `App.tsx:501-528` |
| 12 | فيه grid ثنائي/رباعي مستخدم بس على مستوى الموبايل (`grid-cols-4` في `DashboardTab.tsx:310`، `grid-cols-2` في `NewCaseModal.tsx`) — ثابت مش Responsive. | `DashboardTab.tsx:310`, `NewCaseModal.tsx` |
| 13 | مفيش أي hook لـ media query حاليًا. أقرب مرجع: `useThemeMode.ts`، `useNavbarHeightVar.ts`. | `src/hooks/` |
| 14 | `package.json`: `react` + `react-dom` + `@supabase/supabase-js` بس — مفيش UI library خارجية ولا router. | `package.json` |
| 15 | `playwright.config.ts` بيشغّل على `devices['Desktop Chrome']` — الاختبارات الحالية مش خط دفاع كافي ضد كسر شكل الموبايل بصريًا، لازم فحص بصري إضافي. | `playwright.config.ts` |

---

## 2) استراتيجية الـ Breakpoints

| الاسم | العرض | الاستخدام |
|---|---|---|
| Mobile | `< 768px` (بدون prefix) | نفس التصميم الحالي 100% |
| Tablet | `768px – 1023px` (`md:`) | Sidebar → Drawer، أعمدة أقل |
| Desktop | `>= 1024px` (`lg:`) | Shell كامل: Sidebar ثابت + Header + عدة أعمدة |
| Desktop كبير | `>= 1536px` (`2xl:`) اختياري | زيادة max-width الداخلي بس |

---

## 3) الـ Architecture المقترحة

```
src/
├── app/
│   ├── shell/                        ← 🆕
│   │   ├── AppShell.tsx              ← 🆕 (A3, A4)
│   │   ├── DesktopSidebar.tsx        ← 🆕 (B1, B2)
│   │   ├── DesktopHeader.tsx         ← 🆕 (B3)
│   │   └── navConfig.ts              ← 🆕 (A2)
│   ├── AppModals.tsx                 ← تعديل طفيف
│   ├── CommandDock.tsx               ← بدون تغيير منطقي
│   └── HeaderMenu.tsx / ExitConfirmModal.tsx / AppLoadingScreen.tsx  ← بدون تغيير
│
├── shared/
│   ├── hooks/
│   │   └── useResponsiveLayout.ts    ← 🆕 (A1)
│   └── ui/
│       └── ModalShell.tsx            ← 🆕 اختياري (F1)
```

---

## 4) `useResponsiveLayout` (مرحلة A1)

```ts
// src/shared/hooks/useResponsiveLayout.ts
export type LayoutMode = 'mobile' | 'tablet' | 'desktop';

export function useResponsiveLayout(): { mode: LayoutMode; isDesktop: boolean; isMobile: boolean } {
  // matchMedia فقط — بدون resize listener يدوي
}
```
- بنمط `useThemeMode.ts` بالظبط.
- `window.matchMedia('(min-width: 1024px)')` و`(min-width: 768px)` — `change` event بس.
- بيتستخدم في **مكان واحد بس**: `AppShell.tsx`.

---

## 5) `AppShell.tsx` (مراحل A3–A4)

**A3 — هيكلي بس:** إنشاء المكوّن، يستقبل نفس الـ props اللي `App.tsx` بيحسبها حاليًا (Header, Dashboard, tab contents) لكن من غير أي فرع `isDesktop` فعلي لسه — الهدف إثبات إن اللف نفسه (wrapping) ما بيكسرش حاجة قبل ما نضيف أي منطق جديد.

**A4 — الدمج الفعلي:** لف الجزء من `<div data-testid="app-shell">` في `App.tsx` بمكوّن `AppShell` بدل الـ`<div>` الخام. التغيير محصور في آخر ~15 سطر من `App.tsx`. بعد A4، شكل الموبايل والديسكتوب لسه **زي بعض تمامًا** (مفيش Sidebar/Header ديسكتوب لسه) — الهدف إثبات صحة إعادة الهيكلة قبل إضافة أي شكل جديد.

**تقليل الـ Prop Drilling:** `navConfig.ts` (A2) هيشيل تكرار تعريف عناصر التنقل بين `CommandDock` و`DesktopSidebar`. أي تحسين أعمق لـ `AppModals` props هيتطرح كتوصية مستقبلية منفصلة، مش جزء من هذه الخطة.

---

## 6) Desktop Sidebar (مراحل B1–B2)

من `CommandDock.tsx` + `useNavigation.ts`:

| الأيقونة | التاب | مصدره |
|---|---|---|
| 🏠 | `dashboard` | `nav-dashboard` |
| ⚖️ | `cases` | `nav-cases` |
| 👥 | `clients` | `nav-more-clients` |
| 📅 | `calendar` | `nav-calendar` |
| 💰 | `fees` | `nav-more-fees` |
| 🔔 | `reminders` | `nav-reminders` |
| 📁 | `documents` | `nav-more-documents` |
| 🤖 | AI (مودال) | `nav-ai-center` — مقفول لغير السوبر أدمن حاليًا |
| 🛡 | `admin` (أدمن بس) | `nav-more-admin` |
| — | `team` | معرّف بلا زرار — ✅ **قرار محسوم:** هيتضاف (أدمن بس)، راجع قسم 14 |

**B1:** السايدبار في وضعه الموسّع بس (260px)، بدون طي، بدون tooltips — هدفها إثبات إن الـ layout والـ navigation شغالين صح الأول.
**B2:** إضافة الطي (`sanad_sidebar_collapsed` في localStorage، بنمط `sanad_theme`) + tooltips على الأيقونات في وضع الطي.

كل الأزرار هتحافظ على نفس `data-testid` الموجودة، وهضيف `data-testid="desktop-nav-*"` مستقل.

---

## 7) الترتيب المكاني (RTL) والـ CSS Variables (مرحلة B3–B4)

```
┌─────────────────────────────────────────────────────────┐
│                     DesktopHeader (sticky top-0)         │
├──────────────────────────────────────────┬───────────────┤
│              <main> المحتوى               │  Sidebar      │
│              flex:1 min-width:0           │  (يمين، RTL)  │
└────────────────────────────────────────────┴───────────────┘
```
- `dir="rtl"` مضبوطة من `index.html:2`، فالـ Sidebar هيتحط في DOM order **بعد** المحتوى عشان RTL الطبيعي يحطه يمين تلقائيًا.
- **B3:** بناء `DesktopHeader.tsx` بنفس الـ actions الموجودة في `AppHeader.tsx` بتصميم Desktop.
- **B4:** نشر `--app-sidebar-w` (260px موسّع / 76px مطوي) بنفس نمط `useNavbarHeightVar.ts`، و`<main>` يستخدمها بس على `lg:` (`lg:pe-[var(--app-sidebar-w)]` — `pe-` مش `pr-`).

---

## 8) الـ Modals على Desktop (مراحل F1–F3)

22 مودال Bottom-Sheet، 9 Centered — كل واحد بيكتب wrapper بنفسه.

- **F1:** إنشاء `useModalPresentation()` hook بيرجع الـ className المناسب (`items-end` موبايل / `items-center` ديسكتوب) + `rounded` المناسب — بدون تطبيقه على أي مودال لسه (الهدف اختبار الـ hook لوحده).
- **F2:** تطبيقه على أهم 3 مودالات (قضية جديدة، موكل جديد، تفاصيل القضية).
- **F3:** تطبيقه على 3 مودالات تانية (تفاصيل الجلسة + 2 حسب الأولوية وقت التنفيذ) + تحديد `max-width` لكل مودال حسب محتواه (`lg:max-w-2xl` للفورمات الكبيرة، `max-w-sm` لمودالات التأكيد). باقي المودالات (30+) هتفضل زي ما هي — مقبولة بصريًا لأنها أصلاً صغيرة.

---

## 9) الجداول (مراحل D1–D3)

مفيش جدول موجود أصلاً (نقطة 2) — بناء جديد بالكامل، جنب الكروت مش بدالها.

- **D1:** إنشاء `CaseRow` component + هيكل `<table>` فاضي/ستاتيك جنب `renderCaseCard` — الأعمدة: رقم القضية | الموكل | المحكمة | الحالة | الجلسة القادمة | الإجراءات. من غير ربط فعلي بالبيانات لسه (مجرد هيكل + بيانات وهمية للتأكد من الشكل).
- **D2:** ربط الجدول الفعلي بنفس الـ `MappedCase` object ونفس الـ handlers (`setSelectedCase`...) ونفس منطق الفلترة/البحث/الصفحات — الـ container: `< lg` يعرض الكروت زي ما هو 100%، `>= lg` يعرض الجدول.
- **D3:** نفس المبدأ بالظبط لـ `ClientsTab.tsx`.

---

## 10) Dashboard / Case Detail / Forms (مراحل C2–C3, E1–E3)

- **C2:** `grid-cols-4` الموجودة في `DashboardTab.tsx:310` تفضل زي ما هي على موبايل، `lg:` تعديل مسافات/أحجام خط بس.
- **C3:** قسم الجلسات القادمة/القضايا الأخيرة (عمودي حاليًا) ياخد `lg:grid-cols-[2fr_1fr]`.
- **E1:** `CaseDetailView.tsx` — الـ Tabs تفضل زي ما هي بالظبط، بس قسم "بيانات القضية + الإجراءات السريعة" ياخد `lg:grid-cols-[2fr_1fr]`.
- **E2:** `NewCaseModal`/`EditCaseModal` — الحقول القصيرة المتجاورة منطقيًا (اسم+رقم قومي، هاتف+بريد) تاخد `lg:grid-cols-2`، الحقول الطويلة تفضل `lg:col-span-2`.
- **E3:** نفس المبدأ على باقي الفورمات الرئيسية (موكل، جلسة مستقلة) حسب طبيعة حقول كل فورم.

---

## 11) جدول المراحل الكبير → الجزئي (مرجع سريع)

| المرحلة | المحتوى العام | المراحل الجزئية |
|---|---|---|
| **A — الأساس** | هيكل بدون تغيير بصري | A1 hook → A2 navConfig → A3 AppShell هيكلي → A4 دمج فعلي |
| **B — Header + Sidebar** | عناصر Desktop الأساسية | B1 Sidebar موسّع → B2 طي+Tooltips → B3 DesktopHeader → B4 نشر المتغير + ربط main |
| **C — Content + Dashboard** | تجاوب المساحة الرئيسية | C1 Padding/max-width → C2 Dashboard stats → C3 Dashboard عمودين |
| **D — الجداول** | بناء جديد بالكامل | D1 هيكل CaseRow → D2 ربط فعلي بالبيانات → D3 جدول الموكلين |
| **E — Case Detail + Forms** | تخطيط عمودين | E1 CaseDetailView → E2 فورم القضية → E3 باقي الفورمات |
| **F — Modals** | عرض متوسط للمودالات | F1 hook → F2 أهم 3 مودالات → F3 3 مودالات تانية + max-width |
| **G — Tablet + A11y + تحقق نهائي** | إغلاق وتحقق شامل | G1 Drawer تابلت → G2 A11y → G3 Playwright موبايل + سكريبت بصري → G4 تشغيل E2E + تقرير ختامي |

كل مرحلة جزئية قابلة للتسليم والاختبار **لوحدها** من غير ما تكسر اللي قبلها، ومفيش مرحلة بتلمس Database/Supabase/Auth/Offline Queue/Health Monitoring إطلاقًا.

---

## 12) ضمان عدم كسر Mobile (Mobile Safety Strategy)

1. **لا حذف ولا تعديل** على أي className موجود إلا بالإضافة (`lg:`/`md:` جديدة).
2. `CommandDock.tsx` هيتحط جواه شرط عرض بسيط (`!isDesktop`) بدل ما يتشال أو يتعدل.
3. أي مكوّن جديد (`CaseRow`, `DesktopSidebar`, إلخ) بيتضاف **جنب** الكود الحالي مش بدله — قابل للتعطيل بسطر واحد.
4. فحص بصري يدوي (screenshots) على 320/360/390/414px بعد **كل مرحلة جزئية**، مش بس بعد كل مرحلة كبيرة.
5. الاختبارات الحالية (31 E2E spec) هتتشغل زي ما هي بعد كل مرحلة جزئية — أي فشل إشارة مباشرة لتأثر Mobile flow.

---

## 13) حدود صريحة (Out of Scope)

مش هتغيّر أبدًا: Supabase queries، RLS، migrations، Authentication، Multi-tenancy، Offline Queue (`window.__dbWrite`, `offlineQueue.ts`)، `systemHealth.ts`، PWA manifest/service worker، Telegram alerts، أي business rule موجودة. لو اكتشفت أثناء التنفيذ إن حاجة من دول لازم تتلمس، هوقف وأقولك السبب قبل أي تعديل.

---

## 14) إجابات الأسئلة (اتحسمت بتاريخ 14 أغسطس 2026)

1. **تاب `team`:** ✅ **هيتضاف** للسايدبار الجديد (أدمن بس، زي `admin`) بنفس الـ `data-testid="desktop-nav-team"` الجديد — هيتحط في B1 مع باقي عناصر السايدبار.
2. **الـ AI section:** ✅ **نفس السلوك بالظبط** — لسه مقفولة لغير السوبر أدمن، وبتفتح "مودال قريبًا" عبر نفس `handleAIButtonClick` الموجودة، من غير أي تغيير في منطق الصلاحيات. السايدبار هيستدعي نفس الدالة زي ما هي.
3. **الحالة الافتراضية للسايدبار:** ✅ **موسّعة (Expanded)** أول مرة يفتح المستخدم Desktop — `sanad_sidebar_collapsed` هيبدأ بـ `false` لو مفيش قيمة محفوظة في localStorage من قبل. هتتنفذ فعليًا في B2.
4. **ترتيب البدء:** الترتيب A→B→C→D→E→F→G **صح ومقصود** ومفيش داعي نغيره — كل مرحلة معتمدة على اللي قبلها فعليًا مش ترتيب اعتباطي:
   - **A** لازم أول واحدة لأن `AppShell` هو اللي هيستضيف كل حاجة جاية بعده (Sidebar، Header) — من غيره مفيش مكان نحط فيه B.
   - **B** لازم قبل C لأن `--app-sidebar-w` (اللي B4 بينشرها) هي اللي C1 محتاجها عشان يحسب padding الـ `<main>` صح.
   - **C** قبل D/E منطقي لأنها بتظبط الـ container العام (Dashboard) اللي D وE بيتحطوا جواه، لكن من الناحية التقنية D وE مستقلين عن بعض فعليًا لو حبيت تبدّل ترتيبهم — مفيش تعارض تقني، بس هسيبهم بالترتيب الحالي لأن الجداول (D) أعلى مخاطرة (بناء جديد بالكامل، بند 9) والأفضل نثبّتها الأول قبل ما نضيف طبقة تانية من التغييرات في E.
   - **F (المودالات)** بعد E عمدًا — لأن بعض المودالات المستهدفة في F2/F3 (زي مودال "قضية جديدة") هي نفسها اللي E2 بيعدّل حقولها الداخلية، فالأفضل نخلص شكل الفورم جوه المودال (E) قبل ما نغيّر إطار عرض المودال نفسه (F) — تقليل تعارض التعديلات على نفس الملفات في نفس الوقت.
   - **G** آخر واحدة دايمًا لأنها التحقق الشامل النهائي (Tablet + A11y + فحص بصري + E2E) وبتحتاج كل حاجة قبلها تكون خلصت عشان تبقى ذات معنى.

   يعني الترتيب المحدد سليم تقنيًا ومفيش داعي لتبديل أي مرحلة مكان التانية. البدء الفعلي هيكون بـ **A1**.

---

**الخلاصة:** نفس تحليل الفحص الأصلي بالكامل (مفيش تغيير في الفهم أو الاستراتيجية)، لكن الـ 7 مراحل الكبيرة (A–G) بقت 24 مرحلة جزئية، وكل مرحلة جزئية بتتسلّم بزيب محدث + هذا التقرير محدّث موثّق فيه اللي خلص واللي باقي.
