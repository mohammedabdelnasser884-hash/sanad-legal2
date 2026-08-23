# تقرير: إصلاح خطأ الـlint في build step (16 أغسطس 2026)

## الوضع
اللوج الجديد (`logs_86680423989`) فيه خبر كويس وخبر لازم يتصلح:
- ✅ **خطوة `Run unit tests` بقت 100% نضيفة**: `Test Files 52 passed (52)` / `Tests 1006 passed (1006)`. فيكسات الـ50 تست + `EditUserModal.test.tsx` من قبل كده اتأكدت.
- ❌ **خطوة جديدة اسمها `Build (lint + type-check + vite build)` فشلت** — `npm run build` = `eslint . --max-warnings=0 && tsc --noEmit && vite build`، وeslint وقف العملية بـ9 أخطاء قبل ما توصل حتى لـtsc.

## السبب
`usePermission()` (في `permissions.ts`) دالة عادية 100% — مفيش `useState`/`useEffect`/ولا أي React hook تاني جواها، مجرد فحص منطقي بياخد `profile` كـargument ويرجّع `boolean`. المشكلة إن اسمها بادئته `use` — وده بالظبط الشرط اللي `eslint-plugin-react-hooks` بيستخدمه عشان يقرر إن الدالة دي "hook" ويطبّق عليها Rules of Hooks. النتيجة: أي استدعاء ليها **جوه** دالة مش component ومش hook (زي `handleSaveCase`/`handleDeleteCase`/`handleUpdateCase`/`handleSaveClient` — دول event handlers جوه custom hook تاني) اتحسب مخالفة، وكمان استدعاءاتها جوه `for` loop في `permissions.test.ts` (بتلف على `PERMISSION_KEYS`) اتحسبت "ممكن تتنفذ أكتر من مرة بترتيب مختلف".

مهم أوضح: **الكود شغّال صح فعليًا** — مفيش باگ وظيفي حقيقي، لأن الدالة مش hook أصلًا فمفيش أي state/order اعتماد عليه. المشكلة كانت في التسمية بس، لكن `--max-warnings=0` بيخلي أي مخالفة lint (حتى لو false positive بسبب الاسم) توقف الـbuild بالكامل.

## الفيكس
Rename بحت، صفر تغيير في المنطق: `usePermission` → `checkPermission` في كل الملفات اللي بتستخدمها (11 ملف، 48 استدعاء إجمالاً):
- `src/shared/lib/permissions.ts` (التعريف + تعليق التوضيح فوقه)
- `src/shared/lib/permissions.test.ts`
- `src/features/cases/hooks/useCaseActions.ts` + `.test.ts`
- `src/features/clients/hooks/useClientActions.ts` + `.test.ts`
- `src/features/admin/users/EditUserModal.tsx`
- `src/App.tsx`, `src/features/cases/CaseDetailView.tsx`, `src/features/dashboard/ClientsTab.tsx`, `src/features/dashboard/CasesTab.tsx` (دول كانوا بينادوها من جوه component مباشر، فمكنش عندهم مشكلة lint من الأساس، لكن لازم يتحدّثوا عشان الاسم يفضل متطابق في كل حتة).

## التحقق
- عددت الاستدعاءات قبل وبعد الـrename في كل ملف — نفس العدد بالظبط في كل ملف (48 مرة إجمالاً)، يعني الاستبدال كان دقيق ومفيش أي استدعاء اتفوت أو اتكرر.
- دورت على أي `usePermission` متبقي في المشروع كله (`grep -rn`) — صفر نتيجة.
- الأداة اللي استخدمتها (`sed` بديل نصي على الكلمة كاملة `\busePermission\b`) مبتلمسش أقواس/براكيتس خالص، فمستحيل تكون سببت أي خطأ syntax جديد.
- مفيش عندي هنا `node_modules`/شبكة عشان أشغّل `eslint`/`tsc`/`vite build` فعليًا (نفس القيد المعروف من الجلسات اللي فاتت) — محتاج تأكيد نهائي منك بعد الـpush.

## ملاحظة
خطوة الـbuild الجديدة (lint+type-check+vite build) لسه محدش شافها تنجح كاملة في اللوجز اللي وصلتني لحد دلوقتي — وقفت عند eslint. لو بعد الفيكس ده طلعت أخطاء تانية من `tsc --noEmit` أو `vite build`، ابعتلي اللوج التالي وهكمله.
