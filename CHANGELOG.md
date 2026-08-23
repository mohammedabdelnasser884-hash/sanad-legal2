# سجل التغييرات (Changelog)

كل التغييرات المهمة في المشروع هتتسجل هنا.
الصيغة مبنية على [Keep a Changelog](https://keepachangelog.com/ar/1.0.0/)،
والمشروع بيتبع [Semantic Versioning](https://semver.org/lang/ar/).

> ⚠️ **ملاحظة عن البداية:** الريبو مفيهوش سجل Git متاح وقت إنشاء الملف ده،
> فالسجل بيبدأ من هنا فورًا (24 أغسطس 2026) بدل إعادة بناء تاريخ كامل من
> تقارير `docs/reports/`. لو حد يحب يرجع يوثّق تاريخ الإصدارات السابقة
> رجوعًا للورا، ينقل الملخصات من `docs/reports/phases/` و`docs/audits/`
> هنا يدويًا بترتيب زمني.

## [غير مُصدر / Unreleased]

### أُصلح (Fixed)
- **توليد المستندات القانونية (`LegalDocumentsPage`):** `hasCaseContext` كان
  بيتحسب من `initialCaseId` (الـprop الحي) بدل ما يتجمّد زي `caseId`، فبمجرد
  ما `onInitialCaseConsumed` بيرجّع `initialCaseId` لـ`null` في الـparent
  (بيحصل فورًا بعد أول render)، كان بيخلي المستخدم الجاي من قضية مفتوحة
  يشوف `SourceModeSelector` بدل التخطي المباشر لـ`DynamicFieldsForm`
  (مخالف لتصميم القسم 9.5). الفيكس: تجميد `hasCaseContext` بـ`useState`
  زي `caseId` بالظبط.

### أُضيف (Added)
- اختبار ريجريشن (`src/pages/LegalDocumentsPage.test.tsx`) بيغطي: تخطي
  `SourceModeSelector` لما جاي من قضية، السلوك الطبيعي لما مفيش سياق قضية،
  واختفاء زرار "+ مستند جديد" في مسار القضية.
- `README.md` في الـroot — دليل بدء سريع للمطورين الجدد.
- `docs/README.md` — فهرس تنظيم التوثيق الداخلي.
- هذا الملف (`CHANGELOG.md`).

### تغيير تنظيمي (Changed)
- نُقل 47 ملف Markdown كانوا متناثرين في جذر الريبو إلى `docs/` مقسّمين
  حسب النوع: `docs/plans/`، `docs/reports/phases/`، `docs/reports/features/`،
  `docs/audits/`. راجع [docs/README.md](docs/README.md) لقاعدة التصنيف
  الكاملة.

---

## [1.0.0] — الإصدار الأساسي

أول إصدار موثّق. يغطي: إدارة القضايا والموكلين والجلسات، نظام الأتعاب،
لوحة تحكم الأدمن، توليد المستندات القانونية، مساعد الذكاء الاصطناعي، دعم
Offline كامل عبر Service Worker، ونظام صلاحيات متعدد المستويات.

تفاصيل كل مرحلة تطوير موثّقة في `docs/reports/phases/` و`docs/plans/`.
