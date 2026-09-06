# خطة التحويل — من "توليد المستندات" إلى "مكتبة نماذج قابلة للتحميل"

### تحويل معماري كامل لقسم "المستندات القانونية"، مبني على فحص فعلي للكود الحالي (مش افتراضات)

**التاريخ:** 4 سبتمبر 2026 (آخر تحديث: 6 سبتمبر 2026)
**الحالة:** مراحل 1-4 كود جاهز ومؤكَّد بـCI حقيقي (1178/1178 تست، build نضيف) + الماجريشن والباكت اتنفذوا فعليًا على الإنتاج. المتبقي: 3.3/4.3 (اختبار يدوي حقيقي، معلّق على مرحلة 5) ثم مرحلة 5 (تصميم/رفع 4 ملفات Word حقيقية — شغل Gemy) ثم مرحلة 6 (تنظيف الكود القديم).
**نطاق هذا المستند:** المعمارية والبيانات وتدفق الشاشات فقط. **محتوى/صياغة كل نموذج (ملفات Word نفسها) خارج نطاق هذه الخطة تمامًا** — شغل قانوني منفصل يقع عليك.

---

## 1. القرار المتفق عليه

قسم "المستندات القانونية" بيتحول من **محرك توليد نصوص** (فورم ديناميكي → نص مُركّب من الصفر → معاينة/تصدير) إلى **مكتبة مرجعية لملفات Word/PDF جاهزة**، بمسارين للمستخدم:

1. **تحميل كما هو** — الملف الأصلي زي ما هو بالظبط، صفر معالجة.
2. **تعبئة من بيانات قضية** — نفس ملف الـ Word الأصلي، بس بيانات معينة جواه (اسم الموكل، رقم القضية...) بتتبدّل تلقائيًا **داخل نفس الملف** (مش نص جديد بيتبني)، فالتصميم/الخط/الفورمات يفضلوا زي ما هما بالظبط.

**الفرق الجوهري عن الوضع الحالي:** النظام دلوقتي بيبني نص المستند من string واحد (`body_template`) ويحوّله لأقسام (`DocumentContentSection[]`) وبيصدّره بمكتبات رسم (`jsPDF` + `html2canvas` أو `docx`) — يعني بيعيد **بناء** تصميم المستند من الصفر في كل مرة. الخطة دي بتلغي إعادة البناء دي بالكامل، وتحل محلها استبدال قيم داخل الملف الأصلي نفسه.

---

## 2. الوضع الحالي (من فحص الكود الفعلي)

### تدفق الشاشات الحالي (`LegalDocumentsPage.tsx`)
```
CategoryPicker → TemplatePicker → SourceModeSelector → DynamicFieldsForm → DocumentPreviewEditor
```

### قاعدة البيانات الحالية (5 جداول، من `sql-migrations-phase7/01-document-generation-schema.sql`)
- `document_templates` — هوية القالب الثابتة (تصنيف، اسم، `is_system`/`tenant_id`)
- `template_versions` — **`body_template` (نص خام فيه placeholders) + `box_template` (اختياري)**، immutable بعد النشر
- `template_fields` — تعريف كل حقل (`field_key`, `label_ar`, `field_type`, `binding_source`)
- `generated_documents` — نتيجة كل توليد (`field_values_json` + `document_content_json`)
- `case_document_links` — ربط المستند المولّد بملف مُصدَّر في `case_documents`

### آلية التوليد الحالية (`generationApi.ts`)
`generateDocument()` بتجيب `body_template` (نص)، تستبدل `{{field_key}}` بقيم (`fillPlaceholders`)، تبني `DocumentContentSection[]` (مصفوفة أقسام نصية)، وتخزّنها كـ JSON. التصدير (`exportApi.ts`, `useDocumentExport.ts`) بعدين بيرسم المصفوفة دي كـ PDF (jsPDF+html2canvas) أو Word (docx.js) — **بناء بصري من الصفر، مش من ملف مصمَّم مسبقًا**.

### التخزين
مفيش ملفات Word حقيقية متخزنة حاليًا لأي قالب — كله نص في عمود DB. باكتس `case-docs`/`client-docs` الموجودة (خاصة، مسارات مبدوءة بـ `tenant_id`، روابط موقّعة عبر `resolveStorageUrl`/`getSignedUrl`) هي النمط اللي هنستخدمه للملفات الجديدة.

---

## 3. المعمارية الجديدة

### 3.1 قاعدة البيانات — تعديل بدل هدم

`document_templates` بيفضل زي ما هو (تصنيف/اسم/is_system/tenant_id — مفيش سبب لتغييره).

`template_versions` بيتغيّر جوهريًا:

| العمود الحالي | يتحول إلى |
|---|---|
| `body_template` (text) | **يتشال** |
| `box_template` (text) | **يتشال** (كان جزء من نفس منطق البناء النصي) |
| — | **`master_file_path`** (text, NOT NULL) — مسار ملف الـ Word الأصلي في Storage |
| — | **`master_file_name`** (text) — اسم الملف الأصلي للعرض/التحميل |

`template_fields` بيفضل **زي ما هو تقريبًا** — لسه محتاجين نعرّف كل placeholder (`field_key`, `label_ar`, `field_type`, `binding_source`) عشان الفورم اللي بيملا القيم ونفس منطق `resolveCaseBindings` الموجود يشتغلوا من غير تغيير. الفرق الوحيد: الـ`field_key` دلوقتي لازم يطابق حرفيًا الـ tag اللي جوه ملف الـ Word (مثلاً `{client_name}` بصيغة docxtemplater) بدل ما يطابق مكان في نص مخزن في DB.

`generated_documents` **يتشال بالكامل** (قرار مقفول، القسم 8 بند 3) — مفيش سجل DB منفصل لعمليات التحميل/التعبئة. بدل منه، التسجيل بيتم عبر `logActivity` الموجود فعليًا، بنوع نشاط جديد ("تحميل مستند قانوني" / "تعبئة مستند قانوني") بنفس نمط الاستدعاء الحالي في `LegalDocumentsPage.tsx` — صفر جدول جديد، صفر migration إضافية لِـ`generated_documents`.

`case_document_links` — **يتشال هو كمان بالتبعية** (اكتشاف أثناء تفصيل الخطة، مش قرار منفصل): وظيفته الوحيدة كانت ربط `generated_documents.id` بملف مُصدَّر في `case_documents`؛ بما إن `generated_documents` بتتشال بالكامل، الجدول ده فقد أساسه بالكامل (الـFK `generated_document_id` مش هيبقى ليه معنى). لو حبيت مستقبلًا تربط نسخة مُحمَّلة من المكتبة بملف في أرشيف القضية، ده تصميم جديد منفصل وقت الحاجة الفعلية ليه — مش جزء من هذه الخطة.

### 3.2 التخزين (Supabase Storage)

باكت خاص جديد، بنفس نمط `case-docs` (خاص + روابط موقّعة)، لكن **أبسط**: بما إن مفيش قوالب خاصة بالمكاتب (قرار مقفول، القسم 8 بند 2)، مفيش داعي لعزل `tenant_id` على مستوى الملفات خالص:
- اسم مقترح: `legal-doc-templates`
- كل الملفات تحت مسار موحّد: `system/{template_id}/{version}.docx` — كل التنانتس بيشوفوا نفس المكتبة بالظبط
- الباكت **private**، الوصول عبر `getSignedUrl()` الموجودة فعلاً في `shared/lib/storage.ts` — صفر كود تخزين جديد، إعادة استخدام مباشرة

### 3.3 محرك التعبئة — الفرق الجوهري

بدل `fillPlaceholders()` النصية الحالية، هنستخدم **docxtemplater** (مكتبة JS خالصة، بتشتغل جوه أي بيئة JS بما فيها Deno — مفيش اعتماد على باينري خارجي زي LibreOffice للخطوة دي):

```
تحميل ملف master (.docx) من Storage
  → docxtemplater يفتحه كـ zip/XML، يستبدل الـ tags بالقيم
  → ملف .docx جديد، نفس بنية XML الأصلية بالكامل (فونط/تنسيق/جداول/لوجو زي ما هو)
```

ده بيتنفذ في **Edge Function جديدة** (مثلاً `fill-document-template`)، مش في المتصفح، للأسباب دي:
- ملف الـ master يفضل خاص (مايتنزلش كامل لجهاز المستخدم قبل التعبئة)
- تجهيز موحّد لخطوة PDF اللي جاية بعده (القسم 3.4)

### 3.4 تحويل PDF (بعد التعبئة) — **مؤجَّل، مش جزء من هذه المرحلة (قرار مقفول، القسم 8 بند 1)**

القسم ده موجود كتصميم مرجعي للمرحلة الجاية بس — **التنفيذ الحالي بالكامل Word فقط**، صفر اعتماد على Gotenberg دلوقتي. لما نوصل لمرحلة PDF بعد ما المكتبة تخلص وتستقر:

Gotenberg self-hosted (Docker container منفصل، مش جوه Supabase) — الـEdge Function بتاعة التعبئة بتبعت الملف المُعبّى لـGotenberg عبر HTTP وتستقبل PDF. **تفصيلة لازم تتحل قبل التنفيذ:** بناء Docker image مخصص فوق `gotenberg/gotenberg:8-libreoffice` بالخطوط العربية الفعلية المستخدمة في القوالب (IBM Plex Sans Arabic/Almarai)، وإلا التحويل لـPDF هيستبدلها بخطوط بديلة ويكسر بالظبط الشرط اللي احنا بنحققه.

### 3.5 تدفق الشاشات الجديد

```
CategoryPicker (زي ما هو، صفر تغيير)
  → TemplatePicker (زي ما هو، صفر تغيير — بيعرض نفس الكاردز)
    → شاشة القالب المفرد (جديدة، تحل محل SourceModeSelector+DynamicFieldsForm+DocumentPreviewEditor):
        - زرار "تحميل كما هو" (Word أو PDF) → فوري، من غير أي فورم
        - زرار "تعبئة من بيانات قضية" → SourceModeSelector (زي ما هو) → DynamicFieldsForm (زي ما هو تقريبًا، نفس مبدأ resolveCaseBindings) → زرار "تحميل" (Word أو PDF) بدل شاشة "المعاينة" الحالية
```

**`DocumentPreviewEditor.tsx` الحالي (المعاينة/التعديل النصي داخل الواجهة) بيتشال بالكامل** — مفيش داعي له لأن مفيش نص بيتبني نقدر نعرضه/نعدله في المتصفح؛ التعديل بعد كده بيحصل في Word نفسه بعد التحميل، زي ما اتفقنا في أول النقاش.

---

## 4. حالة الأوفلاين — نقطة قرار جديدة لازم تتحسم

الوضع الحالي (`offlineTemplateCache.ts`) بيخزن نص القالب في `sessionStorage` عشان التوليد يشتغل أوفلاين. مع ملفات Word حقيقية (أحيانًا عدة ميجابايت)، تخزين نسخة أوفلاين من كل قالب مكلف وغير مضمون.

**اقتراحي (يتبع نفس السابقة الموجودة فعليًا في المشروع):** التعبئة من بيانات قضية تتطلب اتصال إنترنت إلزاميًا — بالظبط نفس القرار المتخذ فعليًا لرفع مستندات الأرشيف (`case-docs`) في `useCaseDocuments.ts` ("رفع مستند يتطلب اتصالاً بالإنترنت"). "التحميل كما هو" ممكن يتخطى القيد ده لاحقًا لو حبيت (كاش الملفات الأكثر استخدامًا)، لكن ده تحسين مؤجل مش شرط أساسي.

---

## 5. الكود اللي بيتشال بالكامل

- `DocumentContentSection` (type) + `renderDocumentContent`/`fillPlaceholders` النصية
- `DocumentPreviewEditor.tsx`
- منطق `jsPDF`+`html2canvas` في `exportApi.ts` (تصدير PDF من رسم بصري) — يتستبدل بمسار Gotenberg
- `document_content_json`/`rendered_html` من `generated_documents`

## 6. الكود اللي بيتعاد استخدامه زي ما هو تقريبًا

- `CategoryPicker.tsx`, `TemplatePicker.tsx`, `useDocumentTemplates.ts` (فلترة/بحث) — صفر تغيير
- `SourceModeSelector.tsx`, `resolveCaseBindings()` (جلب بيانات القضية) — صفر تغيير في المنطق
- `DynamicFieldsForm.tsx` — نفس الفكرة، مصدر البيانات بس بيتغيّر (مش هيتخزن كنص، هيتبعت مباشرة لـEdge Function التعبئة)
- نمط الـStorage الخاص + الروابط الموقّعة (`storage.ts`) بالكامل

---

## 7. خطة التنفيذ — مراحل جزئية مرتّبة

الترتيب هنا مبني على التبعيات الفعلية (كل مرحلة محتاجة اللي قبلها تكون جاهزة)، مقسّم لخطوات صغيرة قابلة للتنفيذ والاختبار كل واحدة لوحدها. **نطاق كل المراحل من 1 لـ6 دلوقتي: Word فقط، صفر Gotenberg** (المرحلة 7 مؤجَّلة ومنفصلة).

### مرحلة 1 — البنية التحتية (بدون أي تغيير في الواجهة)
> ⚡ **تعديل تسلسل اتّخذ أثناء التنفيذ (4 سبتمبر 2026):** المرحلة دي بقت **إضافة بس (additive-only)** بدل حذف+إضافة. حذف `body_template`/`box_template`/`generated_documents`/`case_document_links` القديمة اتنقل لمرحلة 6 — لأن حذفهم دلوقتي هيكسر الفيتشر الحالي فورًا قبل ما المسار الجديد (مراحل 3/4) يبقى جاهز كبديل. راجع الملاحظة في `01-legal-doc-library-columns.sql`.
- **1.1** ✅ Migration: إضافة `master_file_path`/`master_file_name` (nullable) على `template_versions` — **بدون** حذف `body_template`/`box_template` دلوقتي (`sql-migrations-phase12/01-legal-doc-library-columns.sql`)
- **1.2** ✅ إنشاء باكت `legal-doc-templates` (private، يدويًا من Dashboard) + policy قراءة بس للمستخدمين المسجلين (`sql-migrations-phase12/02-legal-doc-library-storage-bucket.sql`) — **محتاج منك تشغّل الملفين فعليًا على الإنتاج + تنشئ الباكت من الـDashboard قبل كده**
- **1.3** ✅ تحديث `types.ts`: إضافة `master_file_path`/`master_file_name` لـ`TemplateVersion`، وسم `body_template`/`box_template` بـ`@deprecated` (صفر حذف — التوافق مع الكود القديم لسه شغال)

### مرحلة 2 — محرك التعبئة (Backend فقط، بدون واجهة)
- **2.1** إضافة `docxtemplater` كـdependency، كتابة Edge Function `fill-document-template` (تاخد `template_version_id` + خريطة قيم → ترجع ملف `.docx` معبّى)
- **2.2** اختبار الـEdge Function منفردة بملف Word تجريبي واحد فيه tags وهمية (خارج أي واجهة، عبر curl/Postman)
- **2.3** دالة API جديدة في `templatesApi.ts` (`getMasterFileUrl`) + دالة تنادي الـEdge Function — تحل محل `generateDocument()`/`renderDocumentContent()` القديمة

### مرحلة 3 — واجهة "تحميل كما هو" (أبسط مسار، أول حاجة يشوفها المستخدم)
- **3.1** شاشة "القالب المفرد" الجديدة (تحل محل نقطة الدخول لـSourceModeSelector) بزرارين: "تحميل كما هو" / "تعبئة من بيانات قضية"
- **3.2** تفعيل زرار "تحميل كما هو" فقط: رابط موقّع مباشر لملف الـmaster + `logActivity` ("تحميل مستند قانوني")
- **3.3** اختبار يدوي: قالب واحد وهمي من أول لآخر (تحميل بس، من غير تعبئة)

### مرحلة 4 — واجهة "تعبئة من بيانات قضية"
- **4.1** توصيل `SourceModeSelector`+`DynamicFieldsForm` الموجودين (بدون تعديل منطقهم الداخلي) بمصدر بيانات القالب الجديد
- **4.2** شاشة "تأكيد وتحميل" جديدة (تحل محل `DocumentPreviewEditor`): بتنادي Edge Function التعبئة (مرحلة 2)، تنزّل الملف الناتج، `logActivity` ("تعبئة مستند قانوني")
- **4.3** اختبار يدوي: نفس القالب الوهمي، المسارين التلاتة لـ`sourceMode` (من قضية/يدوي/فاضي)

### مرحلة 5 — ترحيل القوالب الأربعة الحقيقية (شغل قانوني/تصميمي منك، مش كود)
- **5.1** تصميم 4 ملفات Word حقيقية (إنذارات/عرائض/طلبات + الرابع) بنفس الـfield_keys الموجودة كـtags
- **5.2** رفع الملفات على Storage + تحديث صفوف `template_versions` بمسار كل ملف
- **5.3** اختبار يدوي شامل للأربعة قوالب (تحميل + تعبئة لكل واحد)

### مرحلة 6 — تنظيف الكود القديم
- **6.1** Migration: حذف `body_template`/`box_template` من `template_versions` (بعد ما `master_file_path` يبقى NOT NULL فعليًا لكل صف — مرحلة 5) + حذف `generated_documents` و`case_document_links` بالكامل (منقولة من المرحلة 1 الأصلية — القسم 3.1)
- **6.2** حذف `DocumentPreviewEditor.tsx`، `DocumentContentSection`، `renderDocumentContent`/`fillPlaceholders`، مسار `jsPDF`+`html2canvas` في `exportApi.ts`
- **6.3** حذف/إعادة تصميم `offlineTemplateCache.ts` (مبني كله على `body_template` النصي، ومش هنستخدمه أصلًا بعد قرار "التعبئة تتطلب إنترنت" — القسم 4)
- **6.4** تحديث/حذف التستات المرتبطة بالمنطق القديم (`useGenerateDocument.test.ts`, `LegalDocumentsPage.test.tsx`, `e2e/document-generation.spec.ts`)
- **6.5** تشغيل `npm run build` + `npm test` كاملين، تأكيد صفر كسر
- **6.6** ✅ **(الخطوة الختامية للنطاق الحالي 1→6)** استخراج كامل الملفات الجديدة/المعدَّلة عبر كل المراحل (1 لـ6) في زيب واحد جاهز للنشر دفعة واحدة — شامل: كل ملفات الكود المتأثرة (`types.ts` وأي ملفات مراحل 2-6)، وكل ملفات الـmigrations/SQL بترتيبها الرقمي (`sql-migrations-phase12/01-...`, `02-...`, وأي أرقام تالية تتضاف من مراحل 2-6)، وهذا الملف نفسه كمرجع. الهدف إن النشر يحصل **مرة واحدة** في نهاية النطاق الحالي، مش دفعة لكل مرحلة فرعية — الـmigrations لسه لازم تتشغّل يدويًا بالترتيب الرقمي على الإنتاج زي أي مرحلة سابقة (القسم 9 بيوضّح إيه اللي اتشغّل فعليًا واللي لسه محتاج تدخل يدوي).

### مرحلة 7 — مؤجَّلة ومنفصلة (بعد استقرار كل ما سبق)
دعم PDF عبر Gotenberg (القسم 3.4) — مش جزء من التتبع تحت لحد ما نبدأها فعليًا.

---

## 8. قرارات مقفولة (4 سبتمبر 2026)

1. **PDF مؤجَّل مؤقتًا — قرار مرحلي، مش نهائي.** المرحلة الأولى (كل التنفيذ في هذه الخطة) هتدعم **Word فقط** للمسارين (تحميل كما هو + تعبئة من بيانات قضية) — صفر اعتماد على Gotenberg في هذه المرحلة. دعم PDF (وبالتالي بناء وتشغيل Gotenberg بالكامل، القسم 3.4) بيتأجل كمرحلة منفصلة **بعد** ما المكتبة بكامل نطاقها الحالي (كل الشاشات + كل القوالب المُرحَّلة) تخلص وتشتغل وتتأكد. القسم 3.4 (Gotenberg) بيفضل موجود في هذه الخطة كتصميم مرجعي للمرحلة الجاية، لكنه **مش جزء من التنفيذ الحالي**.
2. **مفيش قوالب خاصة بالمكاتب — قوالب نظامية بس، إنت اللي بتديرها.** الباكت والمسارات (القسم 3.2) اتبسّطت بالتبعية: كل الملفات تحت `system/{template_id}/{version}.docx` بس، **بدون** أي مسار `{tenant_id}/...` للقوالب — العزل متعدد المكاتب (tenant isolation) مش مطلوب على مستوى الملفات نفسها أصلًا، بما إن كل تنانت بيشوف نفس المكتبة بالظبط.
3. **`generated_documents` كجدول منفصل — يتشال.** بدل جدول DB جديد بأعمدة خاصة، التسجيل بيتم عبر `logActivity` الموجود فعليًا (نفس نمط "توليد مستند قانوني" الحالي في `LegalDocumentsPage.tsx`، بس بنوع نشاط جديد زي "تحميل مستند قانوني" / "تعبئة مستند قانوني"). القسم 3.1 يتحدّث: `generated_documents` بالكامل يتشال من التصميم، مش بس أعمدة `document_content_json`/`rendered_html`.

---

## 9. سجل التنفيذ الفعلي

*بيتحدّث بعد كل خطوة تتنفذ فعليًا — الحالة الافتراضية لكل خطوة "لم يبدأ" لحد ما تتنفذ.*

| # | الخطوة | الحالة | تاريخ الإنجاز | ملاحظات |
|---|---|---|---|---|
| 1.1 | Migration: إضافة `master_file_path`/`master_file_name` (additive-only) | ✅ نُفِّذ فعليًا على الإنتاج | 6 سبتمبر 2026 | `sql-migrations-phase12/01-legal-doc-library-columns.sql` — شغّله Gemy فعليًا |
| 1.2 | إنشاء باكت `legal-doc-templates` + RLS قراءة | ✅ نُفِّذ فعليًا على الإنتاج | 6 سبتمبر 2026 | الباكت اتعمل من Dashboard (Private) + `sql-migrations-phase12/02-legal-doc-library-storage-bucket.sql` اتشغّل بعده — شغّلهم Gemy فعليًا |
| 1.3 | تحديث `types.ts` | ✅ مكتمل | 4 سبتمبر 2026 | `body_template`/`box_template` اتوسموا `@deprecated`، مش متشالين |
| 2.1 | Edge Function `fill-document-template` | ✅ الكود جاهز | 4 سبتمبر 2026 | `docxtemplater@3.62.2`/`pizzip@3.1.7` عبر `npm:` مباشر جوه الفانكشن (بدون تبعية جديدة في `package.json` — نفس نمط `npm:unpdf` في `process-law-extract`). ملف قائم بذاته (self-contained، CORS+auth منسوخين محليًا) زي باقي الفانكشنز — لوحة النشر مش بتدعم مجلدات مشتركة |
| 2.2 | اختبار منفرد للـEdge Function | ✅ مؤكَّد بـCI حقيقي | 4 سبتمبر 2026 (تأكيد 6 سبتمبر) | `fill-document-template/index.test.ts` (14 حالة: CORS، هوية الطالب، تحقق مدخلات، تحميل Storage، نجاح التعبئة، خطأ docxtemplater). Mocks جديدة لـ`pizzip`/`docxtemplater` (`_shared/pizzipMock.ts`/`docxtemplaterMock.ts` + alias في `vitest.config.ts`) بنفس نمط `unpdfMock.ts`. ✅ CI حقيقي (6 سبتمبر) أكّد نجاح الـ14 حالة كلها |
| 2.3 | تحديث `templatesApi.ts` | ✅ مؤكَّد بـCI حقيقي | 4 سبتمبر 2026 (تأكيد 6 سبتمبر) | `getMasterFileUrl` (رابط موقّع لملف الـmaster) + `fillDocumentTemplate` (نداء الـEdge Function، بيرجّع Blob) — إضافة بس، صفر حذف لـ`generationApi.ts` القديم. تست وحدة `__tests__/templatesApi.test.ts` (10 حالات) — ✅ CI حقيقي (6 سبتمبر) أكّد نجاح الـ10 حالة كلها |
| 3.1 | شاشة "القالب المفرد" (`TemplateActionScreen.tsx`) | ✅ الكود جاهز | 4 سبتمبر 2026 | خطوة `action` جديدة في `LegalDocumentsPage.tsx` بين `templates`/`sourceMode` (Stepper بقى 6 خطوات: +"الإجراء"). زرار "تعبئة من بيانات قضية" يكمّل المسار القديم زي ما هو بالظبط (`onChooseFill` → `sourceMode`) — صفر تغيير في `SourceModeSelector`/`DynamicFieldsForm`/`DocumentPreviewEditor` |
| 3.2 | تفعيل "تحميل كما هو" | ✅ الكود جاهز | 4 سبتمبر 2026 | زرار داخل `TemplateActionScreen.tsx` بينادي `getMasterFileUrl` (مرحلة 2.3) + تحميل مباشر (`<a download>`) + `logActivity` بنوع "تحميل مستند قانوني" (`entity_type: 'document'`, `entity_id: template.id`) — فوري، من غير أي انتقال خطوة. رسالة خطأ عربية واضحة لو مفيش نسخة منشورة/ملف مرفوع بعد |
| 3.3 | اختبار يدوي — تحميل بس | لم يبدأ | — | ⚠️ محتاج منك تشغّله فعليًا (قالب وهمي بـmaster_file_path حقيقي مرفوع على `legal-doc-templates`) — بيئة التنفيذ دي من غير `node_modules`/اتصال إنترنت، فمقدرش أشغّل `npm test`/`npm run build` على التعديلات دي. حدّثت `LegalDocumentsPage.test.tsx` (تستات آلة الحالات) و`e2e/document-generation.spec.ts` (خطوة جديدة قبل `doc-gen-source-mode-case`) يدويًا لتعكس الخطوة الجديدة، لكن لسه محتاجين تشغيل فعلي للتأكيد |
| 4.1 | توصيل SourceModeSelector/DynamicFieldsForm | ✅ الكود جاهز | 4 سبتمبر 2026 | `SourceModeSelector.tsx`/`DynamicFieldsForm.tsx` **صفر تعديل داخلي** (زي ما الخطة بتشترط) — هوك جديد `useFillDocument.ts` بيوازي `useGenerateDocument.ts` القديمة بنفس منطق تحميل الحقول/حل قيم القضية (`getPublishedTemplateFields`+`resolveCaseBindings`+fallback `office_name`، بدون تغيير)، لكن **بدون أي كاش أوفلاين خالص** (القسم 4: التعبئة تتطلب اتصالاً إلزاميًا) وبيرجّع `templateVersionId`/`masterFileName` الجديدين بدل `bodyTemplate`/`boxTemplate`. `LegalDocumentsPage.tsx` بقى بيستخدمه بدل `useGenerateDocument` في خطوة 'fields' |
| 4.2 | شاشة "تأكيد وتحميل" | ✅ الكود جاهز | 4 سبتمبر 2026 | `DocumentFillConfirmScreen.tsx` (جديد) — بتحل محل `DocumentPreviewEditor.tsx` في خطوة 'preview': زرار واحد "تأكيد وتحميل" بينادي `useFillDocument.fill()` (Edge Function `fill-document-template`، مرحلة 2)، ينزّل الـBlob الناتج مباشرة (`.docx`، نفس نمط `useAdminBackup.ts::handleDownloadBackup`) + `logActivity('تعبئة مستند قانوني'، entity_type:'document')`. `LegalDocumentsPage.tsx`: زرار "توليد" جوه `DynamicFieldsForm` بقى بينقل لخطوة 'preview' فورًا (صفر نداء شبكة في خطوة البيانات نفسها) — التعبئة الفعلية اتأجّلت للشاشة الجديدة. إشعار تيليجرام الاختياري بقى بينادى بعد نجاح التحميل فعليًا (`onFillSuccess`)، مش بعد `generate()` القديمة |
| 4.3 | اختبار يدوي — تعبئة كاملة | لم يبدأ | — | ⚠️ محتاج منك تشغّله فعليًا (نفس سبب 3.3 — بيئة بلا `node_modules`/إنترنت). حدّثت `LegalDocumentsPage.test.tsx` (موك `useFillDocument`+`DocumentFillConfirmScreen` بدل القديمَين، تستات آلة الحالات + تيليجرام) و`e2e/document-generation.spec.ts` (الخطوة الأخيرة بقت تحميل `.docx` مباشرة — `page.waitForEvent('download')` — بدل معاينة/تصدير PDF؛ السيناريو لسه `test.skip` لحد مرحلة 5) يدويًا، لكن لسه محتاجين تشغيل فعلي للتأكيد |
| 5.1 | تصميم 4 ملفات Word الحقيقية | لم يبدأ | — | — |
| 5.2 | رفع الملفات + تحديث الصفوف | لم يبدأ | — | — |
| 5.3 | اختبار يدوي شامل — 4 قوالب | لم يبدأ | — | — |
| 6.1 | حذف `body_template`/`box_template`/`generated_documents`/`case_document_links` فعليًا | لم يبدأ | — | منقولة من المرحلة 1 الأصلية |
| 6.2 | حذف كود العرض/التصدير القديم | لم يبدأ | — | `DocumentPreviewEditor.tsx` بقى غير مستخدم من `LegalDocumentsPage.tsx` (استبدلته `DocumentFillConfirmScreen.tsx` في مرحلة 4.2)، لكن الملف نفسه **لسه موجود** — الحذف الفعلي (+`useDocumentExport.ts`/مسار jsPDF+html2canvas في `exportApi.ts`) مؤجَّل لهذه الخطوة زي ما الخطة بتنص، مش قبل كده |
| 6.3 | حذف/إعادة تصميم offline cache | لم يبدأ | — | `useFillDocument.ts` الجديدة (مرحلة 4.1) أصلًا **مابتستخدمش** `offlineTemplateCache.ts` خالص — لسه مستخدمة بس من `useGenerateDocument.ts` القديمة (اللي هي نفسها بقت غير مستخدمة من الصفحة بعد مرحلة 4.1، لكن لسه موجودة كملف لحد 6.4) |
| 6.4 | تحديث/حذف التستات القديمة | لم يبدأ | — | `useGenerateDocument.test.ts`/`generationApi.test.ts` لسه موجودين زي ما هما (بيغطّوا كود لسه موجود بالملف، مجرد غير مستخدم من الصفحة) — الحذف الفعلي هنا زي ما الخطة بتنص |
| 6.5 | build + test كامل نهائي | لم يبدأ | — | — |
| 6.6 | استخراج كامل الملفات الجديدة/المعدَّلة (كل المراحل 1-6 + كل الـmigrations/SQL) في زيب واحد للنشر دفعة واحدة | ✅ مكتمل (جزئيًا — لغاية مرحلة 4 حاليًا) | 4 سبتمبر 2026 | `sanad-legal2-main-updated-phase1-4.zip` — إضافة على زيب المراحل 1-3 السابق: `useFillDocument.ts` (جديد)، `DocumentFillConfirmScreen.tsx` (جديد)، `LegalDocumentsPage.tsx`/`.test.tsx` (معدَّلين تاني)، `e2e/document-generation.spec.ts` (معدَّل تاني)، وهذا الملف نفسه محدَّث. هيتحدّث الزيب نفسه تراكميًا كل ما مرحلة جديدة تخلص |
| — | دمج ملفات المراحل 1-4 فوق المشروع الحالي الفعلي (اللي فيه شغل تاني موازي غير متعلق بالخطة دي) + أول CI حقيقي كامل | ✅ نجح بالكامل | 6 سبتمبر 2026 | Gemy رفع زيب المشروع الحالي الحقيقي (فيه تحديثات موازية زي fee RPC idempotency وsystemHealth trackQueryOutcome مش موجودة في الزيب اللي كنا شغالين عليه أصلًا) — اتعمل دمج مستهدف (16 ملف بس اتغيروا/اتضافوا، تأكيد بـ`diff -rq`) بدل استبدال شامل كان هيضيع الشغل التاني. أول CI حقيقي كامل بعد كده كشف خطأين tsc: (1) `generationApi.test.ts`'s `makeVersion()` fixture ناقصة `master_file_path`/`master_file_name` (نفس نوع غلطة `box_template` القديمة في 26 أغسطس) — اتصلحت بإضافتهم كـnull؛ (2) `DocumentFillConfirmScreen.tsx` بعت `className` غلط لأيقونة `I.Download` (صفر-props) — اتصلحت بشيل الـprop. بعد الإصلاحين: CI ثاني كامل نجح 100% (1178/1178 تست، build/lint/tsc/vite كله نضيف) |

**ملاحظة مهمة:** CI الأخضر ده بيأكد **صحة الكود** (unit tests + build) بس — مش بديل عن 3.3/4.3 (الاختبار اليدوي الفعلي بحساب حقيقي على قالب حقيقي مرفوع على `legal-doc-templates`)، اللي لسه معلّق على وجود قالب وملف Word حقيقي (مرحلة 5) — السيناريوهين e2e لسه `test.skip` لنفس السبب.

---

## 10. الماجريشن المطلوب تشغيلها يدويًا على الإنتاج (بالترتيب، خاص بهذه الخطة فقط)

✅ **الاتنين دول اتنفذوا فعليًا على الإنتاج (6 سبتمبر 2026)** — مفيش حاجة متبقية من البند ده حاليًا:

1. ✅ **`database/migrations/sql-migrations-phase12/01-legal-doc-library-columns.sql`** — نُفِّذ.
2. ✅ **الباكت `legal-doc-templates`** — اتعمل من الـDashboard (Private).
3. ✅ **`database/migrations/sql-migrations-phase12/02-legal-doc-library-storage-bucket.sql`** — نُفِّذ بعد الباكت مباشرة.

بعد ما القوالب الأربعة الحقيقية تترحّل (مرحلة 5)، هيبقى فيه ماجريشن إضافي واحد بس (تحديث صفوف `template_versions` بمسارات الملفات — مش عندنا ملف SQL جاهز له لسه، هيتكتب وقتها) — ومرحلة 6 (حذف `body_template`/`box_template`/`generated_documents`/`case_document_links`) هيكون ليها ماجريشن تاني بعد كده.

---

## 11. ملفات كانت في المشروع أصبحت غير صالحة (خطة box_template الملغاة، 26 أغسطس) — تم حذفها

✅ **تم حذفهم فعليًا من الريبو (6 سبتمبر 2026):**
- ~~`database/migrations/sql-migrations-phase8/02-document-box-template-column.sql`~~
- ~~`database/migrations/sql-migrations-phase8/03-elanat-asl-saheefa-seed.sql`~~

كانوا مبنيين على المحرك النصي القديم (`box_template`/`body_template`) اللي قرار 4 سبتمبر لغاه تمامًا لصالح ملفات Word حقيقية — ومفيش أعمدة كانت اتضافت في DB منهم أصلًا، فالحذف كان بلا أي أثر جانبي.

`sql-migrations-phase8/01-remove-tawkilat-category.sql` في نفس المجلد **فضل زي ما هو** — قرار مستقل (أرشفة تصنيف "توكيلات") مش له علاقة بمحرك التوليد، لسه صالح ومحتاج تشغيله وقتك المناسب لو لسه متشغّلش.
