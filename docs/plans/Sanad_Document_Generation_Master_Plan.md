# خطة تنفيذية صارمة (Locked Spec) — المصدر الموحّد
## وحدة توليد المستندات القانونية — مشروع سند (Sanad)

**النسخة:** v4 — Merged / Living Document (الخطة الأصلية + نتائج فحص المرحلة 0 + المرحلة 1 + المرحلة 2 مدموجة في مكانها)
**آخر تحديث:** 21 أغسطس 2026
**حالة الخطة الآن:** المراحل 0، 1، 2 **نُفِّذت كود-يًا**. الـ migration اتشغلت فعليًا والبناء نجح على Vercel. **بموافقة صريحة من الشخص**، باقي بنود التحقق (تشغيل `vitest`/`tsc --noEmit` فعليًا، اختبار RLS بحساب tenant مختلف، اختبار `idx_one_published_version_per_template`) **مؤجلة للمرحلة 6** (الاختبار الشامل) بدل ما تتحقق مرحلة بمرحلة — مفيش تنازل عن أي بند منها، مجرد تأجيل زمني. المرحلة 3 (الواجهة) هي التالية.

> **ملحوظة على النسخة دي:** من دلوقتي، **هذا الملف هو المصدر الوحيد**. مفيش تقرير منفصل لكل مرحلة يُقرأ بمعزل عن الباقي — أي نتيجة فحص، قرار، أو إنجاز في أي مرحلة قادمة **يُدمج هنا مباشرة** في القسم المناسب + سطر جديد في سجل التحديثات تحت. التقرير القديم `sanad-doc-gen-phase0-report.md` بقى غير مُعتمد (superseded) — محتواه كله دُمج هنا.

---

## 📋 سجل التحديثات (Changelog) — يُحدَّث بعد كل مرحلة، لا يُستبدل

| التاريخ | الحدث |
|---|---|
| أغسطس 2026 | إنشاء الخطة v2 (Implementation-Locked) |
| 21 أغسطس 2026 | **المرحلة 0 اكتملت** (فحص ثابت على الكود، مش queries حية — الشبكة مقفولة في بيئة التنفيذ). كل الأسماء المفترضة في v2 اتأكدت أو اتصححت (تفاصيل في القسم 1 تحت). دُمج تقرير المرحلة 0 في هذا الملف كمصدر موحد. **6 قرارات مفتوحة تحتاج موافقتك** — قائمة كاملة في القسم 1.3. |
| 21 أغسطس 2026 | **القرارات 1–5 اتحسمت** — الشخص فوّض الاختيار، فاتّخذت الاقتراحات المكتوبة في القسم 1.3 كقرار نهائي (تفاصيل الحسم في القسم 1.3 المحدَّث تحت). القرار #6 (عيّنة `laws`) فضل اختياري ومفتوح لحد ما يتيسر تشغيله. **الخطة جاهزة للبدء في المرحلة 1 بمجرد تأكيد أخير.** |
| 21 أغسطس 2026 | **المرحلة 1 (Backend + Schema) نُفِّذت.** الملفات: migration الجداول الخمسة + RLS (القسم 4)، migration بذر القوالب الأربعة (القسم 5)، `types.ts` (القسم 3.1)، `generationApi.ts` بـ `resolveCaseBindings`/`validateRequiredFields`، و13 اختبار في `generationApi.test.ts`. **⚠️ لم يتم تشغيل الاختبارات فعليًا ولا `tsc` ولا الـ migration على قاعدة حية** — بيئة التنفيذ بلا اتصال إنترنت (نفس قيد المرحلة 0)، فمفيش `node_modules` ومقدرش أنفّذ `npm install`/`vitest`/`tsc --noEmit` ولا أوصل لـ Supabase. اتعمل بدل كده فحص تركيبي يدوي (تطابق الأقواس/الأقواس المعقوفة) فقط. **لازم تشغّل فعليًا على جهازك/CI قبل ما نعتبر معايير القبول محققة** — التفاصيل والاكتشافين الإضافيين (تصحيح عمود رقم القضية + سياسات RLS للكتابة الناقصة من نص الخطة الأصلي) موثّقين في القسم 6 (المرحلة 1) والقسم 4 تحت. |
| 21 أغسطس 2026 | **المرحلة 1 — تشغيل فعلي جزئي مؤكد من الشخص:** الـ migration اتشغلت والبناء نجح على Vercel. **الشخص طلب صراحة تأجيل باقي بنود التحقق** (تشغيل `vitest`/`tsc --noEmit` فعليًا، تأكيد الـ 4 قوالب في Supabase، اختبار RLS بحساب tenant مختلف، اختبار `idx_one_published_version_per_template`) **لمرحلة الاختبار الشامل (المرحلة 6)** بدل ما تتحقق دلوقتي. ✅ **قرار مُتَّخذ:** الاستمرار في التنفيذ (المرحلة 2) بالتوازي، على أساس إن كل بنود التحقق المؤجلة هذه لازم تتحقق بالكامل في المرحلة 6 قبل أي دمج نهائي — مفيش تنازل عنها، بس مؤجلة زمنيًا فقط. |
| 21 أغسطس 2026 | **المرحلة 2 (محرك التوليد) نُفِّذت.** أُضيف لـ `generationApi.ts`: `resolveTemplateVersion`، `createTemplateVersion`، `publishTemplateVersion`، و`generateDocument` (كل التوقيعات مطابقة حرفيًا للقسم 3.2). **قرار تصميم واحد اتّخذ بموافقة صريحة من الشخص أثناء التنفيذ** (تفاصيله الكاملة في القسم 3.2 تحت، فقرة "قرار مُتَّخذ أثناء المرحلة 2"): بما إن نص القالب (`body_template`) في القوالب الأربعة كتلة واحدة متصلة مش مقسّمة لأقسام مُصنَّفة، فـ `document_content_json` بيتبني كقسم واحد بنوع `'intro'` يلف النص كله بعد استبدال الـ placeholders — بدل اختراع تقسيم مالوش أساس في البيانات الفعلية. **اكتشاف إضافي موثّق في كود `generateDocument` نفسه:** توقيع الدالة (القسم 3.2) مفيهوش parameter لـ `created_by`، ومفيش getter على مستوى الموديول لـ profile id الحالي (بعكس `getCurrentTenantId()` الجاهزة لـ tenant_id) — فـ `created_by` بيتسجل `null` عند الإدراج، التزامًا بالتوقيع المُقفل حرفيًا (العمود nullable في الـ schema، مفيش كسر). أُضيفت 8 حالات اختبار جديدة في `generationApi.test.ts` (القوالب الأربعة × 3 أوضاع + حالات إضافية: caseId ناقص في case_bound، templateVersionId صريح، غياب tenant_id) — **إجمالي الملف بقى 21 حالة اختبار (13 من المرحلة 1 + 8 من المرحلة 2)**. **⚠️ نفس قيد بيئة التنفيذ بلا اتصال إنترنت** — الاختبارات دي **متسقة تركيبيًا** (فحص يدوي لتطابق الأقواس بعد استثناء التعليقات/النصوص) لكن **لسه محتاجة تشغيل فعلي فعلي بـ `vitest`** ضمن بنود التحقق المؤجلة للمرحلة 6. |

---

## 0. قواعد الالتزام — لازم تُقرأ قبل أي سطر كود

هذه الخطة **مُلزِمة وليست استرشادية**. أي نموذج ذكاء اصطناعي أو مطوّر ينفّذها يلتزم بالآتي حرفياً:

1. **ممنوع ابتكار أسماء جداول/أعمدة/دوال/مكوّنات غير المذكورة في هذا المستند.** لو احتجت اسم جديد لأي سبب، توقف واطلب توضيح — لا تفترض وتكمل.
2. **ممنوع تغيير ترتيب المراحل.** كل مرحلة تعتمد على اللي قبلها. الانتقال للمرحلة التالية ممنوع قبل استيفاء "معايير القبول" (Acceptance Criteria) المذكورة في نهاية كل مرحلة بالكامل.
3. **ممنوع إنشاء أي جدول جديد قبل استكمال المرحلة 0 (الفحص) وتوثيق نتائجها.** لا استثناءات. *(✅ مكتملة — القسم 1 تحت)*
4. **ممنوع تعديل schema أو كود أي جدول موجود حالياً** (`cases`, `case_parties`, `clients`, `office_settings`, `case_documents`, `profiles`) — التعامل معها Read-only إلا لو نُص صراحة على إضافة عمود في هذا المستند.
   > 🔍 **[تحديث المرحلة 0]** الأسماء الأصلية في v2 كانت `stored_files` و`app_users` — دول مش موجودين فعليًا. الاسمين الصحيحين المؤكدين من الكود هما **`case_documents`** و**`profiles`** على التوالي، واتحدثوا هنا وفي كل الملف.
5. **كل مرحلة = تسليم zip + تحديث هذا الملف الموحّد + توقف كامل بانتظار موافقة صريحة.** ممنوع تنفيذ مرحلتين في نفس الرد.
6. **كل قرار تصميم مفتوح في التقرير الأصلي (v1) اتحسم هنا نهائياً.** لو ظهر أي تعارض بين هذا المستند ونسخة أقدم، **هذا المستند (v3) هو المرجع الحاكم** ولا رجوع لأي نسخة قبله.
7. **ممنوع إضافة أي مكتبة/dependency جديدة** غير المذكورة صراحة في القسم 7 (التصدير) من غير موافقة صريحة مسبقة — بما إن سند بيتحقق من الـ build عبر رفع zip لـ Vercel من الموبايل، وأي مكتبة تكسر الـ build مكلفة.
8. **لا حرية في التسمية.** كل اسم متغير/عمود/دالة/مكوّن مذكور هنا هو الاسم النهائي، بالحروف والحالة (casing) بالظبط كما هو مكتوب.
9. **Template Versioning إلزامي من المرحلة 1، مش تحسين مؤجل.** أي تعديل على نص قالب منشور لازم يُنشئ نسخة جديدة (`template_versions`)، وممنوع تعديل نسخة `published` مباشرة تحت أي ظرف (تفاصيل كاملة في القسم 3.1 والقسم 4).
10. **هذا الملف مصدر موحّد يُحدَّث لا يُستبدل.** أي مرحلة جديدة تضيف نتائجها في مكانها الصحيح جوه الأقسام + سطر في سجل التحديثات فوق — مش ملف منفصل بجانبه.

---

## 1. الفحص الإلزامي (المرحلة 0) ✅ — النتائج الموثّقة

> **طريقة الفحص الفعلية:** بيئة التنفيذ بلا اتصال إنترنت، فمتقدرش أشغّل الـ 4 queries المطلوبة حرفيًا على Supabase الحي. بدلها فحصت `src/database.types.ts` (schema حقيقي متولّد آليًا من آخر `db pull`) + الكود الفعلي بالكامل. كل بند مؤكد **إلا** عيّنة محتوى `laws` (بند 1.1.2) اللي محتاجة تشغيل مباشر منك.

### 1.1 نتائج الفحص (الترتيب زي ما طُلب أصلًا)

**1) أعمدة `laws`:**
```
id, title, law_number, law_year, category_id, file_path, file_name,
status, processing_error, articles_count, created_at, updated_at
```

**2) طبيعة محتوى `laws` (استنتاج من الكود، مش عيّنة بيانات فعلية — ⚠️ يحتاج تأكيدك بتشغيل `SELECT * FROM laws LIMIT 5;`):**
جدول `laws` هو **مكتبة تشريعات** يديرها الأدمن من `src/features/admin/legal-library/` (`useAdminLegalLibrary.ts`): رفع ملف قانون → معالجة (`status`, `processing_error`) → تفكيك لمواد (`articles_count` + جدول منفصل `law_articles` مربوط بـ `law_id`) → تصنيف عبر `legal_categories`. **مش** بنود/قوالب جاهزة للاستخدام في مستندات.

➡️ **القرار النهائي:** ✅ **`legal_clauses` جدول منفصل تمامًا عن `laws`** — لا دمج ولا إعادة استخدام. الموضوعان مختلفان جذريًا (تشريعات عامة vs بنود صياغة قوالب) وأي دمج هيكسر مكتبة القوانين الحالية. *(هذا القرار نهائي ولا يحتاج نقاش إضافي — البند الوحيد المتبقي هو تأكيدك للعيّنة كإجراء تحقق إضافي، مش لأنه هيغيّر القرار.)*

**3) أعمدة `office_settings` الفعلية:**
```
id, name, slogan, phone, phone2, email, website, whatsapp, address,
facebook, instagram, brand_color, accent_color, invoice_prefix,
invoice_footer, tax_number, license_number, logo_url, updated_at,
city, bank_name, bank_iban, tg_token, tg_chat, groq_key, tenant_id,
country, tg_daily_token, tg_daily_chat, tg_instant_token, tg_instant_chat,
groq_key_secret_id, invoice_counter, tg_daily_token_secret_id, tg_instant_token_secret_id
```

| المطلوب | موجود؟ | العمود |
|---|---|---|
| اسم المكتب | ✅ | `name` |
| الشعار | ✅ | `logo_url` |
| الهاتف | ✅ | `phone` (+ `phone2`) |
| البريد | ✅ | `email` |
| العنوان | ✅ | `address` |
| **الختم/التوقيع** | ❌ **عمود مفقود، هيُضاف في مرحلة 5** | — |

**4) اسم عمود الـ tenant:**
✅ **مؤكد: `tenant_id`** — نفس الاسم المستخدم في v2 بالفعل، **بدون أي تغيير مطلوب** في أي مكان بالملف. موجود على `office_settings`, `cases`, `clients`, `case_documents`, وكل الجداول الرئيسية.

**5) دالة/آلية عزل الـ tenant — مستويين مختلفين (v2 ذكرت واحد بس):**

- **على مستوى القاعدة (RLS) — الاسم الصحيح للاستخدام في migrations القسم 4:** `current_tenant_id()` ✅ (مطابق تمامًا لما كان مفترض في v2، **بدون تغيير**):
  ```sql
  CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$ select p.tenant_id from public.profiles p
       join public.tenants t on t.id = p.tenant_id
       where p.user_id = auth.uid() and p.is_active = true
       and (t.status is null or t.status <> 'suspended') ... $$;
  ```
  جدول `tenants` المرجعي في الـ FK (القسم 4) **مؤكد صحيح** أيضًا.

- **على مستوى الفرونت إند (منفصل تمامًا، مش نفس الحاجة):** `setCurrentTenantId(tenantId: string | null)` في `src/constants.ts` — كاش محلي (مش دالة عزل حقيقية) بيتنادى مرة من `useAuthProfile.ts` لما البروفايل يتحمّل. **لا يُستخدم في أي migration أو RLS policy** — استخدامه الوحيد بناء مسارات ملفات محلية.

**6) أعمدة `case_documents` (الاسم الصحيح بدل `stored_files` غير الموجود):**
```
id, case_id (nullable ✅), file_name, file_type, file_url, storage_path,
category, original_name, file_size, created_at, tenant_id
```
الحد الأدنى لربط ملف PDF/DOCX ناتج: `file_name`, `file_url`/`storage_path`, `category` (اقتراح قيمة ثابتة: `'generated_document'`), `tenant_id`. **`case_id` nullable بالفعل** — يدعم ربط مستندات "يدوي"/"فاضي" من غير قضية بدون أي تعديل schema.

**7) `CaseDetailView.tsx` — مكان زرار "توليد مستند":**
- الملف كله بـ `React.createElement` **بدون JSX إطلاقًا** (نفس أسلوب باقي ملفات سند القديمة).
- تبويبات الشاشة فعليًا: `timeline`، `notes`، `docs` (المستندات)، `info`، `checklist`. **مفيش تبويب "أتعاب" في نفس الشاشة** — الأتعاب فيتشر منفصل بالكامل على مستوى الناف الرئيسي.
- الزرار الوحيد الموجود فعليًا المشابه هو "☁️ رفع مستند جديد" جوه تبويب `docs` (component: `DocsSection.tsx`)، زرار مستقل مش جزء من شريط مشترك مع "أتعاب".
- ➡️ **القرار #3 (محسوم):** يتحط جوه تبويب `docs` — تفاصيل في القسم 9.5.

**8) الـ routing (`useNavigation.ts`):**
`TabName` عندها بالفعل قيمة **`'documents'`** بمسار `/documents` مربوطة بـ `ArchiveTab` (أرشيف قضايا/موكلين، شيء مختلف تمامًا). ✅ **مفيش تعارض فعلي مع الخطة** لأن القسم 8 (جدول المسارات) أصلًا استخدم `/legal-documents` مش `/documents` — الاسم ده **صحيح ومؤكد الآن**. اسم `TabName` الجديد في الكود محسوم: **`legalDocs`** (قرار #1).

**9) اكتشاف إضافي (مش في القائمة الأصلية، بيؤثر على القسم 9 بالكامل):**
مفيش design system بمكوّنات `Button`/`Card`/`Badge` بمتغيرات (`variant`) في سند. فحصت `src/shared/ui/` (فيها `Inp.tsx`, `Sel.tsx`, `DatePicker.tsx`, `ClientSearchSelect.tsx`, `PoaInput.tsx`, `FileUploadField.tsx` فقط) وبحثت عن نمط `variant="primary"` في كل المشروع — صفر نتائج. الأزرار كلها `<button>` بـ Tailwind classes مباشرة. ➡️ **القرار #4 (محسوم):** Tailwind classes مباشرة، بدون design system جديد — تفاصيل في القسم 9.

### 1.2 معايير القبول للمرحلة 0
- [x] توثيق كامل لنتائج الفحص (بديل الـ 4 queries الحية، عبر `database.types.ts` + كود فعلي)
- [x] قرار نهائي مكتوب صراحة: **`legal_clauses` جدول منفصل تمامًا** (مش إعادة استخدام لـ `laws`)
- [x] تأكيد اسم عمود الـ tenant: **`tenant_id`**
- [x] لا كود، لا migration اتكتب في هذه المرحلة

### 1.3 القرارات — محسومة (الشخص فوّض الاختيار في 21 أغسطس 2026)

| # | القرار | القرار النهائي | الحالة |
|---|---|---|---|
| 1 | تسمية `TabName`/المسار الجديد في الكود | ✅ **`legalDocs`** (المسار `/legal-documents` مؤكد من القسم 8) | **محسوم** |
| 2 | أسلوب كتابة الملفات الجديدة | ✅ **JSX عادي** — الفيتشر في مجلد منفصل `documentGeneration/`، فمفيش داعي نلتزم بـ `React.createElement` القديم. الملفات القائمة (`CaseDetailView.tsx` وغيرها) تفضل زي ما هي، من غير أي تحويل لها | **محسوم** |
| 3 | مكان زرار "توليد مستند" | ✅ **جوه تبويب `docs` في `CaseDetailView`**، جنب زرار "☁️ رفع مستند جديد" الموجود، بنفس الحجم/الستايل | **محسوم** |
| 4 | أسلوب الأزرار/variants | ✅ **Tailwind classes مباشرة** بنفس ألوان/أحجام الأزرار المشابهة الموجودة فعليًا (زي زرار "رفع مستند جديد" وأزرار الحفظ في المودالات) — بدون تأسيس مكوّنات UI أساسية جديدة | **محسوم** |
| 5 | مسار ملف الـ migration الجديد | ✅ **`database/migrations/sql-migrations-phase7/01-document-generation-schema.sql`** | **محسوم** |
| 6 | تأكيد عيّنة `laws` الفعلية | فضل اختياري — القرار النهائي في 1.1.2 (`legal_clauses` منفصل) **لا يتغيّر** حتى لو اتأجل | **مفتوح، غير حاجب (non-blocking)** |

**كل القرارات الحاجبة (1–5) محسومة. الخطة جاهزة للبدء في المرحلة 1.**

---

## 2. بنية الملفات (Folder Structure) — إلزامية بالحرف

كل ملف جديد يُنشأ **بالضبط** في المسار ده:

```
src/
  features/
    documentGeneration/
      types.ts                          -- كل الـ TypeScript interfaces (قسم 3 تحت)
      api/
        templatesApi.ts                 -- CRUD على document_templates + template_fields
        generationApi.ts                -- generateDocument() + resolveCaseBindings()
        exportApi.ts                    -- exportToPdf() + exportToDocx()
      hooks/
        useDocumentTemplates.ts         -- جلب/فلترة القوالب
        useGenerateDocument.ts          -- state التوليد والمعاينة
        useDocumentExport.ts            -- state التصدير
      components/
        TemplatePicker/
          TemplatePicker.tsx
          TemplateCard.tsx
        SourceModeSelector.tsx          -- 3 خيارات: Case-bound / Manual / Blank
        DynamicFieldsForm.tsx           -- لوضع Manual
        DocumentPreviewEditor.tsx       -- المعاينة RTL + تحرير
        OfficeProfileCompletenessBanner.tsx
        GenerateDocumentButton.tsx      -- الزرار اللي هيتحط جوه CaseDetailView
      __tests__/
        generationApi.test.ts
        useGenerateDocument.test.ts
  pages/
    LegalDocumentsPage.tsx              -- القسم الرئيسي في الناف
e2e/
  document-generation.spec.ts
database/
  migrations/
    sql-migrations-phase7/
      01-document-generation-schema.sql
```

> 🔍 **[تحديث المرحلة 0]** بنية `features/documentGeneration/` بمجلدات `api/`/`components/` أوسع شوية من النمط الفعلي الحالي في سند (features تانية زي `fees`/`clients` مفيهاش `api/` منفصل، والملفات أحيانًا مباشرة جوه الفيتشر). هنلتزم بالبنية دي زي ما هي لأنها أوضح. مسار الـ migration اتصحح فوق (`sql-migrations-phase7/01-...` بدل `XX-...` المباشر — قرار #5، محسوم).

**ملاحظة إلزامية:** لو أي مسار من دول احتاج تغيير أثناء التنفيذ الفعلي، **يُوقَف التنفيذ ويُطلب توضيح قبل إنشاء أي ملف** — ممنوع الارتجال.

---

## 3. العقود البرمجية الكاملة (TypeScript Interfaces) — نهائية وملزمة

### 3.1 `src/features/documentGeneration/types.ts`

```typescript
export type SourceMode = 'case_bound' | 'manual' | 'blank';
export type DocumentStatus = 'draft' | 'exported';
export type TemplateStatus = 'active' | 'draft' | 'archived';
export type FieldType = 'text' | 'date' | 'number' | 'select' | 'party_ref' | 'textarea';

// Document Type / Template = الهوية الثابتة (الاسم، التصنيف). لا تحتوي على نص القالب نفسه.
export interface DocumentTemplate {
  id: string;
  tenant_id: string | null; // null = قالب نظامي (is_system = true)
  category: string;
  name_ar: string;
  description: string | null;
  is_system: boolean;
  status: TemplateStatus;
  current_published_version_id: string | null; // آخر نسخة منشورة، يُستخدم للتوليد الافتراضي
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TemplateVersionStatus = 'draft' | 'published' | 'archived';

// Template Version = النص الفعلي القابل للتوليد منه، ومُصمم على إنه immutable بعد النشر
export interface TemplateVersion {
  id: string;
  template_id: string;
  version_number: number; // يبدأ من 1، يزيد تلقائياً مع كل نسخة جديدة لنفس template_id
  body_template: string;
  status: TemplateVersionStatus;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TemplateField {
  id: string;
  template_version_id: string; // ملحوظ: مربوط بالنسخة، مش بالـ template الأب مباشرة
  field_key: string;
  label_ar: string;
  field_type: FieldType;
  is_required: boolean;
  binding_source: string | null; // مثال: 'case.number' | 'party.name' | null
  sort_order: number;
}

export interface GeneratedDocument {
  id: string;
  tenant_id: string;
  template_id: string;         // نوع المستند (ثابت، للعرض/الفلترة)
  template_version_id: string; // النسخة الفعلية اللي اتولّد بيها المستند — إلزامي، لأغراض الـ audit trail
  case_id: string | null;
  source_mode: SourceMode;
  field_values_json: Record<string, string | number | null>;
  document_content_json: DocumentContentSection[];
  rendered_html: string | null;
  status: DocumentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// نموذج المحتوى المبسّط (بدون AST كامل) — مصفوفة أقسام بترتيب ثابت
export interface DocumentContentSection {
  type: 'header' | 'title' | 'intro' | 'facts' | 'legal_grounds' | 'requests' | 'signature';
  text: string; // نص جاهز بعد استبدال placeholders، HTML-safe
}

export interface CaseDocumentLink {
  id: string;
  case_id: string;
  generated_document_id: string;
  stored_file_id: string | null; // ⚠️ راجع تحديث القسم 4: يشير فعليًا لـ case_documents.id
  created_at: string;
}

// نتيجة دالة resolveCaseBindings — خريطة field_key → قيمة محلولة
export type ResolvedBindings = Record<string, string | number | null>;

// نتيجة التحقق من الحقول الناقصة
export interface ValidationResult {
  isValid: boolean;
  missingRequiredFields: string[]; // field_key لكل حقل مطلوب وناقص
}
```

**ممنوع** إضافة أي حقل لأي interface من دول أو حذف حقل موجود، إلا بعد تحديث هذا المستند نفسه أولاً.

**قاعدة الـ Versioning الإلزامية (لا استثناء):**
- `template_versions` سجل **immutable** بعد ما `status` يبقى `published` — أي تعديل على نص قالب منشور **ممنوع** يعدّل نفس الصف، لازم إنشاء صف جديد بـ `version_number` أعلى بواحد وحالة `draft` ثم `published`
- `document_templates.current_published_version_id` هو الوحيد اللي بيتحدّث عند نشر نسخة جديدة — بيأشر على آخر نسخة منشورة فقط
- التوليد (`generateDocument`) بيستخدم دايماً `current_published_version_id` بتاع الـ template إلا لو اتحدد `template_version_id` صراحة (مفيدة لإعادة توليد مستند بنفس نسخة قديمة تحديداً)
- `generated_documents.template_version_id` **إلزامي ولا يتغيّر بعد الحفظ** — ده اللي بيضمن إن مستند قديم يفضل مرتبط بالنص اللي اتولّد بيه فعلياً حتى لو القالب اتعدّل بعد كده

### 3.2 توقيعات الدوال الإلزامية

```typescript
// api/generationApi.ts

/** يجيب بيانات القضية والأطراف والموكل من الجداول الموجودة فعلاً (read-only) */
async function resolveCaseBindings(caseId: string, templateFields: TemplateField[]): Promise<ResolvedBindings>;

/** يتحقق من اكتمال الحقول المطلوبة قبل التوليد */
function validateRequiredFields(fields: TemplateField[], values: ResolvedBindings): ValidationResult;

/** يجيب النسخة المنشورة الحالية لقالب معيّن (current_published_version_id)، أو نسخة محددة لو اتبعتت */
async function resolveTemplateVersion(templateId: string, explicitVersionId?: string): Promise<TemplateVersion>;

/** ينشئ نسخة جديدة draft لقالب موجود — لا يعدّل أي نسخة منشورة سابقة إطلاقاً */
async function createTemplateVersion(templateId: string, bodyTemplate: string, fields: Omit<TemplateField, 'id' | 'template_version_id'>[]): Promise<TemplateVersion>;

/** ينشر نسخة draft (status → published) ويحدّث document_templates.current_published_version_id */
async function publishTemplateVersion(templateVersionId: string): Promise<void>;

/** الدالة الرئيسية — تبني document_content_json وتحفظ generated_documents بحالة draft، مربوطة بنسخة قالب محددة */
async function generateDocument(params: {
  templateId: string;
  templateVersionId?: string; // لو مش موجودة، يُستخدم current_published_version_id تلقائياً
  caseId: string | null;
  sourceMode: SourceMode;
  manualValues?: Record<string, string | number | null>;
}): Promise<GeneratedDocument>;

// api/exportApi.ts

/** يحوّل document_content_json + office_settings إلى PDF، يرفعه لـ case_documents، يرجّع storedFileId */
async function exportToPdf(documentId: string): Promise<{ storedFileId: string; url: string }>;

/** نفس الشيء لـ DOCX */
async function exportToDocx(documentId: string): Promise<{ storedFileId: string; url: string }>;
```

> 🔍 **[تحديث المرحلة 0]** التوقيعين `exportToPdf`/`exportToDocx` كانوا بيشيروا لـ `stored_files` — اتصححوا لـ **`case_documents`** (الاسم الفعلي، تفاصيل الأعمدة في القسم 1.1 بند 6).

> 🔍 **[قرار مُتَّخذ أثناء المرحلة 2 — بموافقتك]** الخطة عرّفت `DocumentContentSection[]` بأنواع أقسام مصنّفة (`header/title/intro/.../signature`)، لكن `body_template` لكل القوالب الأربعة (القسم 5) نص متصل واحد بـ`{{placeholders}}` من غير أي وسم لكل جزء بنوعه — الخطة نفسها ما حددتش آلية تحويل. اتعرضت 3 خيارات وتم الاختيار: **`generateDocument` بتبني قسم واحد بس بنوع `'intro'` يلف النص كله بعد استبدال الـ placeholders**، بدل اختراع تقسيم مالوش أساس في البيانات الفعلية. أي تقسيم أدق مستقبلًا محتاج تعديل شكل `body_template` نفسه أولاً (قرار محتوى منفصل، مش جزء من هذه المرحلة).
>
> 🔍 **[اكتشاف أثناء تنفيذ المرحلة 2]** توقيع `generateDocument` (تحت) مفيهوش parameter لـ `created_by`/profile id، ومفيش getter جاهز على مستوى الموديول لـ profile الحالي (بعكس `getCurrentTenantId()` الجاهزة لـ tenant_id في `constants.ts`). بما إن العمود `created_by` nullable في الـ schema (القسم 4) وبما إن التوقيع مُقفل حرفيًا، بيتسجل `null` عند الإدراج. لو حبينا نعبّيه لاحقًا، محتاج تعديل صريح للتوقيع (parameter جديد) في المرحلة 3 لما يبقى فيه وصول لـ `profile.id` عبر `useAuthProfile` من الطبقة اللي فوق — قرار يحتاج موافقة صريحة وقتها، مش افتراض يُتخذ هنا بمعزل.

**لا حرية في اختيار async/sync ولا في أسماء الـ parameters ولا في شكل الـ return type.** أي تغيير هنا لازم يتوثق ويُوافق عليه قبل التنفيذ.

---

## 4. Database Migration — SQL نهائي جاهز للتنفيذ

> ✅ **كل الأسماء تحت اتأكدت من المرحلة 0 — `tenant_id`, `current_tenant_id()`, `tenants`, `profiles` كلهم صحيحين بدون أي تعديل.** التعديل الوحيد كان استبدال كل ظهور لـ `stored_files`/`app_users` بـ `case_documents`/`profiles`.
> **مسار الملف الفعلي (قرار #5، محسوم):** `database/migrations/sql-migrations-phase7/01-document-generation-schema.sql`

```sql
-- database/migrations/sql-migrations-phase7/01-document-generation-schema.sql

-- 4.1 الهوية الثابتة للقالب (بدون نص القالب نفسه)
CREATE TABLE document_templates (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = قالب نظامي
  category                    varchar(100) NOT NULL,
  name_ar                     varchar(255) NOT NULL,
  description                 text,
  is_system                   boolean NOT NULL DEFAULT false,
  status                      varchar(30) NOT NULL DEFAULT 'active',
  current_published_version_id uuid, -- FK مؤجل، يُضاف بعد إنشاء template_versions (انظر ALTER تحت)
  created_by                  uuid REFERENCES profiles(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_status CHECK (status IN ('active','draft','archived'))
);

-- 4.2 نسخ القالب — immutable بعد النشر
CREATE TABLE template_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     uuid NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  version_number  int NOT NULL,
  body_template   text NOT NULL,
  status          varchar(20) NOT NULL DEFAULT 'draft',
  published_at    timestamptz,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_number),
  CONSTRAINT chk_version_status CHECK (status IN ('draft','published','archived'))
);

-- ربط الـ FK المؤجل بعد إنشاء الجدولين
ALTER TABLE document_templates
  ADD CONSTRAINT fk_current_published_version
  FOREIGN KEY (current_published_version_id) REFERENCES template_versions(id);

-- يضمن نسخة منشورة واحدة بالظبط لكل template في نفس الوقت
CREATE UNIQUE INDEX idx_one_published_version_per_template
  ON template_versions (template_id)
  WHERE status = 'published';

CREATE TABLE template_fields (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id  uuid NOT NULL REFERENCES template_versions(id) ON DELETE CASCADE,
  field_key             varchar(100) NOT NULL,
  label_ar              varchar(255) NOT NULL,
  field_type            varchar(30) NOT NULL,
  is_required           boolean NOT NULL DEFAULT false,
  binding_source        varchar(50),
  sort_order             int NOT NULL DEFAULT 0,
  UNIQUE (template_version_id, field_key),
  CONSTRAINT chk_field_type CHECK (field_type IN ('text','date','number','select','party_ref','textarea'))
);

CREATE TABLE generated_documents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id           uuid NOT NULL REFERENCES document_templates(id),
  template_version_id  uuid NOT NULL REFERENCES template_versions(id), -- إلزامي، بدون NULL — audit trail
  case_id               uuid REFERENCES cases(id) ON DELETE SET NULL,
  source_mode           varchar(20) NOT NULL,
  field_values_json     jsonb NOT NULL DEFAULT '{}',
  document_content_json jsonb NOT NULL,
  rendered_html         text,
  status                varchar(20) NOT NULL DEFAULT 'draft',
  created_by            uuid REFERENCES profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_source_mode CHECK (source_mode IN ('case_bound','manual','blank')),
  CONSTRAINT chk_doc_status CHECK (status IN ('draft','exported'))
);

CREATE TABLE case_document_links (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  generated_document_id  uuid NOT NULL REFERENCES generated_documents(id) ON DELETE CASCADE,
  stored_file_id         uuid REFERENCES case_documents(id),
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- RLS: نفس نمط باقي الجداول التشغيلية في سند
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_document_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_templates ON document_templates
  USING (tenant_id IS NULL OR tenant_id = current_tenant_id());

CREATE POLICY template_versions_via_template ON template_versions
  USING (template_id IN (SELECT id FROM document_templates WHERE tenant_id IS NULL OR tenant_id = current_tenant_id()));

CREATE POLICY tenant_isolation_generated_docs ON generated_documents
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_case_links ON case_document_links
  USING (case_id IN (SELECT id FROM cases WHERE tenant_id = current_tenant_id()));

-- template_fields يتبع template_version_id، مفيش عمود tenant مباشر عليه
CREATE POLICY template_fields_via_template_version ON template_fields
  USING (template_version_id IN (
    SELECT tv.id FROM template_versions tv
    JOIN document_templates dt ON dt.id = tv.template_id
    WHERE dt.tenant_id IS NULL OR dt.tenant_id = current_tenant_id()
  ));
```

**ترتيب التنفيذ داخل نفس migration إلزامي بالضبط كما هو مكتوب فوق** (document_templates → template_versions → ALTER FK → unique index → template_fields → generated_documents → case_document_links → RLS) — لأن كل جدول بيعتمد على اللي قبله.

> 🔍 **[اكتشاف أثناء تنفيذ المرحلة 1]** الـ SQL الأصلي فوق كان فيه سياسات RLS للقراءة (`USING`) بس، بدون أي `WITH CHECK` للكتابة. من غير سياسات كتابة صريحة، الافتراضي في Postgres بيرفض كل `INSERT`/`UPDATE` تلقائيًا حتى لو القراءة مسموحة — يعني الفيتشر مكانش هيقدر يحفظ أي مستند مولّد من المرحلة 2 لغاية ما نكتشف المشكلة وقتها. اتضافت سياسات كتابة إضافية (`tenant_write_*`/`tenant_update_*`) بنفس شرط الـ tenant isolation بالظبط، في ملف `01-document-generation-schema.sql` الفعلي (مش تغيير في التصميم، استكمال تقني ضروري لنفس القواعد المكتوبة هنا).

> 🔍 **[اكتشاف أثناء تنفيذ المرحلة 1]** عمود "رقم القضية" الفعلي المُستخدم في كل الواجهة هو `cases.case_number_official` (مؤكد من `src/hooks/useAppData.ts`) — عمود `cases.case_number` القديم غير مستخدم في العرض. الـ SQL فوق نفسه مش متأثر (مفيش `case_number` مذكور في الـ migration)، لكن `resolveCaseBindings` (القسم 3.2) بيقرأ `case_number_official` تحديدًا عشان binding_source المنطقي `'case.number'` — موثّق بالتفصيل في تعليقات `generationApi.ts` نفسه.

---

## 5. القوالب الأربعة الأولى — محتوى نهائي، بدون ابتكار

القوالب دول **فقط** هيتم seed لهم في المرحلة 1. **ممنوع إضافة قالب خامس** في هذه المرحلة حتى لو بدا "سهل":

1. `إنذار على يد محضر` (category: `إنذارات`)
2. `توكيل عام` (category: `توكيلات`)
3. `صحيفة دعوى مبسطة` (category: `عرائض`)
4. `طلب استعلام` (category: `طلبات`)

**خطوات الـ seed الإلزامية لكل قالب من الأربعة (بالترتيب):**
1. إدخال صف في `document_templates` (بدون `current_published_version_id` مبدئياً — يفضل NULL)
2. إدخال صف في `template_versions` بـ `version_number = 1`, `status = 'published'`, `published_at = now()`
3. تحديث `document_templates.current_published_version_id` بمعرّف النسخة اللي اتعملت في الخطوة 2
4. إدخال صفوف `template_fields` مربوطة بـ `template_version_id` (النسخة، مش الـ template الأب)

لكل قالب، الحقول الدنيا الإلزامية (binding_source مذكور صراحة، أي حقل مش في القائمة دي ممنوع إضافته في هذه المرحلة):

| القالب | field_key | binding_source | is_required |
|---|---|---|---|
| كل القوالب الأربعة | `case_number` | `case.number` | true (لو case_bound) |
| كل القوالب الأربعة | `client_name` | `party.name` (الطرف صاحب ⭐ client) | true |
| كل القوالب الأربعة | `office_name` | من `office_settings` مباشرة، مش field يدوي | — |
| إنذار على يد محضر | `addressee_name` | `party.name` (الطرف التاني) | true |
| إنذار على يد محضر | `warning_subject` | null (يدوي) | true |
| توكيل عام | `attorney_name` | null (يدوي) | true |
| توكيل عام | `poa_scope` | null (يدوي) | true |
| صحيفة دعوى مبسطة | `court_name` | `case.court` | true |
| صحيفة دعوى مبسطة | `case_facts` | null (يدوي) | true |
| صحيفة دعوى مبسطة | `case_requests` | null (يدوي) | true |
| طلب استعلام | `inquiry_subject` | null (يدوي) | true |

---

## 6. خطة المراحل (معايير قبول صريحة لكل مرحلة)

### المرحلة 0 — الفحص ✅ **مكتملة** (تفاصيلها كاملة في القسم 1 أعلاه، سجل التحديثات في الأعلى)

### المرحلة 1 — Backend + Schema ⚙️ **الكود جاهز، التشغيل الفعلي معلّق عليك**
**المطلوب حرفياً:**
1. تشغيل الـ migration في القسم 4 (المسار والأسماء مؤكدين بالفعل من المرحلة 0)
2. Seed القوالب الأربعة في القسم 5 بالضبط، بحقولها المذكورة فقط
3. إنشاء `src/features/documentGeneration/types.ts` بمحتوى القسم 3.1 حرفياً
4. إنشاء `resolveCaseBindings` بتوقيع القسم 3.2 حرفياً — تجيب من `cases`/`case_parties`/`clients` فقط، بدون أي جدول تاني
5. `__tests__/generationApi.test.ts`: اختبارات لـ `resolveCaseBindings` (بيانات كاملة / بيانات ناقصة / case_id غير موجود) و`validateRequiredFields`

> ⚠️ **حالة التنفيذ الفعلي (21 أغسطس 2026):** الملفات الخمسة اتكتبت بالكامل (2 migration + `types.ts` + `generationApi.ts` + `generationApi.test.ts`، 13 حالة اختبار). **بيئة التنفيذ بلا اتصال إنترنت** (نفس قيد المرحلة 0) — مفيش `node_modules` محلي، فمقدرش أشغّل `npm install`/`vitest`/`tsc --noEmit` فعليًا، ومقدرش أوصل لـ Supabase لتشغيل الـ migration. اتعمل بدل كده فحص تركيبي يدوي بسيط (تطابق الأقواس) على كل ملف كإجراء احترازي، لكنه **مش بديل** لتشغيل حقيقي. **الخطوات المطلوبة منك قبل ما نعتبر المرحلة دي مكتملة فعليًا:**
> 1. فك ضغط `sanad-doc-gen-phase1.zip` فوق مجلد المشروع (الملفات في مساراتها الصح جاهزة للنسخ المباشر)
> 2. `npm install` (لو فيه أي تحديث)، وبعدين `npm run type-check` — لازم يطلع نظيف
> 3. `npx vitest run src/features/documentGeneration` — لازم الـ 13 اختبار كلهم ينجحوا
> 4. تشغيل الـ migration فعليًا على Supabase (staging الأول لو متاح) بالترتيب: `01-document-generation-schema.sql` ثم `02-document-generation-seed.sql`
> 5. تأكيد يدوي إن RLS شغال (محاولة قراءة `generated_documents` بحساب tenant مختلف ترجع صفر نتائج)
>
> لو أي خطوة من دول فشلت أو طلع خطأ، ابعتلي الرسالة كاملة وهصلّحها فورًا قبل ما نكمل للمرحلة 2.

**معايير القبول (لازم كلها تتحقق قبل المرحلة 2):**
- [ ] الـ migration اتشغل بدون أخطاء و**5 الجداول** ظاهرة في Supabase (document_templates, template_versions, template_fields, generated_documents, case_document_links)
- [ ] RLS مفعّل ومتحقق منه بـ query حقيقي (مش مراجعة كود) — محاولة قراءة بـ tenant مختلف لازم ترجع صفر نتائج
- [ ] 4 القوالب موجودين في `document_templates`، وكل واحد منهم عنده نسخة واحدة بالظبط في `template_versions` بـ `version_number = 1` و`status = 'published'`، و`current_published_version_id` بيشاور عليها صح
- [ ] `idx_one_published_version_per_template` موجود ومتحقق منه (محاولة نشر نسخة تانية لنفس template وهي أصلاً عندها نسخة منشورة لازم تفشل)
- [ ] كل الاختبارات في `generationApi.test.ts` ناجحة **(مكتوبة، لسه محتاجة تشغيل فعلي منك)**
- [ ] `tsc --noEmit` نظيف على كل ملف جديد **(لسه محتاج تشغيل فعلي منك)**
- [x] تحديث سجل التحديثات في هذا الملف
- [ ] توقف كامل بانتظار موافقة (بانتظار نتيجة التشغيل الفعلي منك قبل المرحلة 2)

### المرحلة 2 — محرك التوليد ⚙️ **الكود جاهز، التشغيل الفعلي مؤجل للمرحلة 6 (بموافقتك)**
**المطلوب حرفياً:**
1. `generateDocument()` بالتوقيع المذكور في القسم 3.2 بالضبط
2. بناء `document_content_json` كمصفوفة من `DocumentContentSection[]` فقط — **ممنوع أي بنية تانية** (لا AST، لا nested blocks)
3. لو `validateRequiredFields` رجّعت `isValid: false`، الدالة ترمي error بالحقول الناقصة بالاسم — **ممنوع التوليد الجزئي**
4. اختبارات: كل القوالب الأربعة × 3 أوضاع (case_bound/manual/blank) = تغطية شاملة لحالات النجاح والفشل

> ✅ **[تنفيذ فعلي]** `resolveTemplateVersion`، `createTemplateVersion`، `publishTemplateVersion`، و`generateDocument` اتكتبوا كلهم في `generationApi.ts` (التوقيعات مطابقة حرفيًا للقسم 3.2). 8 حالات اختبار جديدة أُضيفت (القوالب الأربعة × 3 أوضاع + 3 حالات إضافية: caseId ناقص، templateVersionId صريح، غياب tenant_id) — إجمالي الملف 21 حالة. فحص تركيبي يدوي (تطابق أقواس بعد استثناء التعليقات/النصوص) نظيف على الملفين. **لسه محتاج تشغيل فعلي بـ `vitest`** — مؤجل بموافقتك للمرحلة 6 مع باقي بنود المرحلة 1 المؤجلة.

**معايير القبول:**
- [ ] كل الاختبارات ناجحة لكل قالب في كل وضع **(مكتوبة، تشغيل فعلي مؤجل للمرحلة 6)**
- [ ] لا توليد بدون `is_required` fields كاملة (مؤكد باختبار صريح — مكتوب، تشغيل فعلي مؤجل)
- [x] تحديث سجل التحديثات في هذا الملف
- [ ] توقف كامل بانتظار موافقة صريحة على البدء في المرحلة 3 (لسه ماتسألتش)

### المرحلة 3 — الواجهة
**المطلوب حرفياً (بنفس أسماء الملفات في القسم 2، بدون أي ملف إضافي):**
1. `GenerateDocumentButton.tsx` يُضاف داخل `CaseDetailView` في المكان المحدد في نتيجة فحص المرحلة 0 (بند 1.1 رقم 7 + القرار #3، محسوم) — **بدون** تعديل أي منطق موجود في `CaseDetailView`
2. `LegalDocumentsPage.tsx` كصفحة مستقلة، مسار `/legal-documents` (مؤكد من فحص المرحلة 0 بند 8)
3. `TemplatePicker` → `SourceModeSelector` → (`DynamicFieldsForm` لو manual) → `DocumentPreviewEditor` — **بهذا الترتيب بالظبط**، بدون دمج أو حذف خطوة
4. `OfficeProfileCompletenessBanner`: يقرأ من `office_settings` فقط، يعرض نسبة الاكتمال + الحقول الناقصة (الأعمدة المؤكدة من فحص المرحلة 0 بند 3)، مع زرين فقط: "استكمال الآن" (يفتح شاشة إعدادات المكتب الموجودة أصلاً) و"تخطي"
5. **data-testid إلزامي على كل عنصر تفاعلي** بنفس نمط التسمية المستخدم في e2e الحالي (kebab-case، بادئة تصف القسم — مثال: `doc-gen-template-card`, `doc-gen-source-mode-case`, `doc-gen-export-pdf-btn`)

**معايير القبول:**
- [ ] الرحلة الكاملة (اختيار قالب → مصدر بيانات → معاينة) شغالة يدوياً بدون أخطاء console
- [ ] زر "توليد مستند" داخل `CaseDetailView` بيفتح على وضع case_bound مباشرة بدون خطوة اختيار قضية
- [ ] كل عنصر تفاعلي جديد عليه data-testid
- [ ] تحديث سجل التحديثات في هذا الملف + توقف بانتظار موافقة

### المرحلة 4 — التصدير
**المطلوب حرفياً:**
1. `exportToPdf()`: يستخدم **نفس** مكتبة/نمط توليد PDF المستخدم فعلياً في `useCaseDetailActions.ts` (تقرير القضية) — **ممنوع إدخال مكتبة PDF جديدة**. نفس خط Amiri للمستندات القانونية (قرار سند القائم بالفعل)
2. `exportToDocx()`: يحتاج تقييم صريح ومكتوب لحجم أي مكتبة DOCX قبل إضافتها، وموافقة صريحة قبل التنفيذ (بند 7 في قواعد الالتزام)
3. حفظ الناتج في `case_documents` بالحقول الفعلية المؤكدة من فحص المرحلة 0 (بند 6)، وربط عبر `case_document_links` لو `case_id` موجود
4. e2e test: `document-generation.spec.ts` — توليد → معاينة → تصدير PDF → التأكد إنه ظاهر في `DocsSection.tsx` الموجود بالفعل

**معايير القبول:**
- [ ] PDF ناتج فعلياً قابل للفتح، فيه بصمة المكتب
- [ ] الملف ظاهر في قسم مستندات القضية الموجود بدون أي تعديل على `DocsSection.tsx` نفسه
- [ ] e2e test ناجح
- [ ] تحديث سجل التحديثات في هذا الملف + توقف بانتظار موافقة

### المرحلة 5 — بصمة المكتب
**المطلوب حرفياً:**
- ✅ **مؤكد من المرحلة 0 (بند 3): عمود الختم/التوقيع مفقود فعليًا** — هيُضاف حصراً (لا جدول جديد)، migration منفصل صغير
- (البند الأصلي كان شرطي "لو ظهر إن فيه أعمدة ناقصة" — اتأكد إن فيه عمود واحد ناقص فعلاً، فالمرحلة دي **مطلوبة** ومش هتتلغى)

### المرحلة 6 — اختبار شامل قبل الدمج
**المطلوب حرفياً:**
1. تشغيل CI الكامل: lint → tsc → vite build → unit tests → E2E (نفس الـ workflow الموجود بالضبط، بدون تعديل عليه)
2. Manual testing checklist من 9 بنود (بنفس نمط باقي مراحل سند): install/build/test محلي، توليد لكل قالب من الأربعة، تصدير PDF، تصدير DOCX، اختبار RLS بحساب tenant مختلف، اختبار الحقول الناقصة، اختبار وضع Manual، اختبار وضع Blank، التأكد من ظهور الملف في القضية
3. مراجعة RLS بـ query حقيقي (مش مراجعة كود فقط) — إلزامي بسبب سابقة `laws`

**معايير القبول النهائية:**
- [ ] CI بالكامل أخضر
- [ ] الـ 9 بنود اليدوية كلها ناجحة
- [ ] لا نتائج متسربة عبر tenant مختلف في اختبار RLS

---

## 7. المؤجَّل بالكامل (ممنوع البدء فيه تحت أي ظرف في هذه الخطة)

| العنصر | لو ظهر طلب لتنفيذه أثناء أي مرحلة |
|---|---|
| Clause Library (`legal_clauses`, `template_clause_links`) | يُرفض وتذكر إنه مرحلة منفصلة بعد قرار المرحلة 0 حول `laws` (القرار اتحسم: جدول منفصل — لكن التنفيذ نفسه مؤجل ومش جزء من هذه الخطة) |
| Offline generation sessions | يُرفض، الميزة online-only في هذه الخطة بالكامل |
| AI Assistance Layer | يُرفض، غير موجود في نطاق هذه الخطة إطلاقاً |
| `case_events` جدول | يُرفض، لا استخدام مؤكد له |
| Template Rules الشرطية (visibility expressions) | يُرفض، `is_required` البسيط يكفي |
| Approval Workflow / Revision History | يُرفض |
| أي قالب خامس أو أكتر في المرحلة 1 | يُرفض، القائمة في القسم 5 مغلقة |

**لو نموذج التنفيذ واجه موقف مش مغطى في هذا المستند، القرار الصحيح الوحيد هو التوقف والسؤال — مش الافتراض والاستكمال.**

---

## 8. جدول المسارات (Routes) — نهائي

| المسار | المكوّن | الوصول |
|---|---|---|
| `/legal-documents` | `LegalDocumentsPage.tsx` | من الناف الرئيسي، تبويب مستقل (`TabName` جديد: `legalDocs` — قرار #1، محسوم) |
| `/legal-documents/new` | `LegalDocumentsPage.tsx` بـ query param `?mode=blank` | من زرار "مستند جديد" داخل نفس الصفحة |
| `/cases/:caseId` (موجود بالفعل) | `CaseDetailView.tsx` + `GenerateDocumentButton` مضاف جواه | من `CaseDetailView` مباشرة، بدون route جديد |
| `/legal-documents/:documentId` | `DocumentPreviewEditor.tsx` (كصفحة كاملة، مش modal) | بعد التوليد، أو من فتح مسودة سابقة |

> ✅ **[تحديث المرحلة 0]** مسار `/legal-documents` **مؤكد بلا تعارض** — الاسم `documents` (بدون `legal-`) محجوز فعليًا لتبويب أرشيف مختلف تمامًا في `useNavigation.ts`، لكن الخطة أصلًا استخدمت `/legal-documents` فمفيش تصادم حقيقي. اسم `TabName` الجديد محسوم: `legalDocs` (قرار #1).

**قاعدة تسمية الـ params:** كله بـ camelCase في الكود، kebab-case في الـ URL نفسه — `/legal-documents` هيبقى أول مسار بشرطة (kebab) في مسارات سند (باقي المسارات كلمة واحدة زي `/cases`, `/fees`) — مش مشكلة تقنية، مجرد ملاحظة.

---

## 9. مواصفات كل شاشة ومكوّن بالتفصيل — بدون حرية تصميم

> **قاعدة عامة إلزامية (مُعدَّلة بعد فحص المرحلة 0):** الأصل كان "استخدام مكوّنات design system موجودة فعلاً (Button/Card/Badge بـ variants)" — **✅ [تحديث المرحلة 0]: مفيش design system بمتغيرات (variants) في سند فعليًا.** الأزرار كلها Tailwind classes مباشرة بدون مكوّن مشترك. القاعدة المعدَّلة (محسومة — قرار #4): كل الأزرار والمكوّنات تُبنى بـ Tailwind classes مباشرة بنفس ألوان/أحجام أزرار مشابهة موجودة فعليًا في سند — **لسه ممنوع إنشاء مكوّن UI أساسي جديد من الصفر** (زرار عام، كارت عام) إلا المكوّنات المركّبة المذكورة صراحة في القسم 2. كل إشارة لـ `variant: primary/secondary/outline/ghost` تحت **تُقرأ كـ "نمط بصري مكافئ بـ Tailwind" مش اسم prop فعلي لمكوّن Button جاهز.**

### 9.1 `LegalDocumentsPage.tsx` — الصفحة الرئيسية

**البنية من أعلى لتحت (ترتيب إلزامي):**

1. **Header الصفحة:**
   - العنوان: "المستندات القانونية" (H1، نفس نمط عناوين باقي الصفحات في سند)
   - زرار "+ مستند جديد" أعلى يمين الشاشة (RTL: يبقى فعلياً أقصى اليسار البصري لأن الاتجاه RTL — التأكيد: يظهر في نفس موضع زر "+ إضافة" المستخدم في صفحات تانية زي القضايا/الموكلين لضمان الاتساق)، نمط بصري: primary (نفس ستايل الأزرار الأساسية الموجودة)، data-testid: `doc-gen-new-document-btn`
   - عند الضغط: يفتح `SourceModeSelector` مباشرة (مش TemplatePicker) لأن اختيار المصدر (قضية/يدوي/فاضي) بيحدد بعدين هل نعرض قوائم القضايا ولا لأ

2. **شريط الفلترة (تحت الـ Header مباشرة):**
   - حقل بحث نصي (placeholder: "ابحث باسم القالب...")، data-testid: `doc-gen-search-input`
   - Dropdown تصنيف (خيارات: الكل / إنذارات / توكيلات / عرائض / طلبات — **فقط** التصنيفات الأربعة من القسم 5، بدون إضافة أي تصنيف تاني)، data-testid: `doc-gen-category-filter`
   - الفلترة تحصل client-side على القوالب المحمّلة بالفعل (مفيش استدعاء API جديد لكل حرف يتكتب) — debounce 300ms على حقل البحث

3. **شبكة القوالب (Grid، 2 عمود على الموبايل، 3-4 على الشاشات الأكبر — نفس breakpoints المستخدمة في باقي شبكات سند):**
   - كل قالب = `TemplateCard`:
     - عنوان القالب (`name_ar`)
     - وصف مختصر سطر واحد (`description`، مقصوص بـ `truncate` لو طويل)
     - Badge للتصنيف (`category`) — نمط بصري مكافئ لأي badge موجود فعلاً في سند (Tailwind pill/chip، بدون مكوّن Badge عام جديد)
     - عند الضغط على الكارت بالكامل (مش على زرار داخلي): ينتقل لـ `SourceModeSelector` مع `templateId` محفوظ
     - data-testid: `doc-gen-template-card-{template_id}`

4. **حالة القائمة الفارغة (Empty State):**
   - لو مفيش قوالب تطابق البحث/الفلتر: أيقونة + نص "مفيش قوالب مطابقة" + زرار "امسح الفلاتر" (نمط ثانوي/خفيف)
   - **ليست** حالة "لا توجد قوالب إطلاقاً" لأن الـ 4 قوالب دايماً موجودين (system templates)، فالـ Empty State هنا فقط نتيجة فلترة

### 9.2 `SourceModeSelector.tsx`

**العرض:** 3 كروت أفقية (تتكدس عمودي على الموبايل) بنفس ارتفاع، كل واحد فيه أيقونة + عنوان + سطر وصف:

| الخيار | الأيقونة (من نفس مكتبة الأيقونات المستخدمة في سند) | العنوان | الوصف | data-testid |
|---|---|---|---|---|
| قضية موجودة | `folder-open` أو المكافئ المتاح | "من قضية مفتوحة" | "تعبئة تلقائية من بيانات قضية موجودة" | `doc-gen-source-mode-case` |
| يدوي | `edit-3` أو المكافئ | "إدخال يدوي" | "تعبئة البيانات يدوياً بدون قضية" | `doc-gen-source-mode-manual` |
| فاضي | `file` أو المكافئ | "نموذج فاضي" | "للطباعة والتعبئة بخط اليد" | `doc-gen-source-mode-blank` |

**السلوك عند اختيار "من قضية مفتوحة":**
- لو الشاشة اتفتحت أصلاً من جوه `CaseDetailView` (يعني فيه `caseId` جاهز من السياق): يتخطى أي اختيار قضية ويروح على `DynamicFieldsForm` مباشرة بالبيانات المحلولة من `resolveCaseBindings`
- لو اتفتحت من `LegalDocumentsPage` العامة (مفيش `caseId`): يظهر مكوّن بحث/اختيار قضية (نفس مكوّن اختيار القضية المستخدم في أي مكان تاني بسند بيربط بقضية — **إعادة استخدام**، مش بناء مكوّن اختيار جديد)

**السلوك عند اختيار "يدوي" أو "فاضي":** ينتقل مباشرة لـ `DynamicFieldsForm` (فاضي في حالة "فاضي")

**زرار الرجوع:** أعلى يسار الشاشة (بصرياً أقصى اليمين في RTL)، أيقونة سهم، data-testid: `doc-gen-back-btn` — يظهر في كل شاشات الرحلة بعد دي بنفس المكان والسلوك (يرجع خطوة واحدة للخلف، مش للصفحة الرئيسية)

### 9.3 `DynamicFieldsForm.tsx`

**البنية:**
- عنوان الشاشة: اسم القالب المختار
- Progress indicator بسيط (نص: "الخطوة 2 من 3" أو مكافئه المرئي — نفس نمط أي multi-step form موجود في سند لو فيه واحد، وإلا نص بسيط بدون مكوّن بصري جديد)
- الحقول تُعرض بترتيب `sort_order` بالضبط، كل حقل حسب `field_type`:
  - `text` → `<Input type="text">` (مكوّن `Inp.tsx` الموجود فعلاً في `src/shared/ui/`)
  - `date` → `<DatePicker>` الموجود بالفعل في `src/shared/ui/DatePicker.tsx` (نفس المستخدم في تواريخ الجلسات)
  - `number` → `<Input type="number">`
  - `select` → مكوّن `Sel.tsx` الموجود، بخيارات من `template_field_options` (لو موجودة) — **ملاحظة: جدول `template_field_options` غير مذكور في migration القسم 4 لأنه مش مطلوب للـ 4 قوالب الأولى (مفيش أي حقل select فيهم حسب القسم 5) — لو ظهرت حاجة له لاحقاً، يُضاف كجدول منفصل وقتها فقط، مش الآن**
  - `party_ref` → Dropdown بأسماء أطراف القضية (من `case_parties` المحلولة)، مُعطّل (disabled) في وضع manual/blank لأنه مفيدش بدون قضية
  - `textarea` → عنصر `<textarea>` بـ 4 سطور افتراضية، قابل للتمدد
- كل حقل `is_required = true`: علامة `*` حمراء جنب الـ label، وحدود حمراء (نفس نمط الـ validation error styling الموجود في سند) لو اتسيب فاضي وحاول يكمل
- **الحقول اللي جاية من `binding_source` (يعني اتحلت أوتوماتيك من القضية):** تظهر مُعبّأة بالفعل لكن **قابلة للتعديل** (مش read-only) — لأن المحامي ممكن يحتاج يعدّل صياغة قبل التوليد. تظهر بخلفية مختلفة شوية (نفس نمط "auto-filled" لو موجود في سند، وإلا لون خلفية فاتح مميز) + أيقونة صغيرة "auto" جنب الحقل

**زرار أسفل الشاشة:** "توليد المستند" (نمط بصري primary، عرض كامل على الموبايل)، data-testid: `doc-gen-submit-btn`
- **معطّل (disabled)** طول ما فيه حقل required فاضي — التحقق live مع كل تغيير، مش بس عند الضغط
- عند الضغط وكله سليم: استدعاء `generateDocument()`، عرض Loading state على الزرار نفسه (spinner + النص يتغير لـ "جارِ التوليد...")، الزرار يتعطل أثناء التحميل لمنع الضغط المزدوج

**رسالة الخطأ لو فشل التوليد:** Toast/Alert بنفس مكوّن الأخطاء المستخدم في باقي سند، نص: "تعذّر توليد المستند، تحقق من البيانات المطلوبة" + قائمة بأسماء الحقول الناقصة (`label_ar` مش `field_key`)

### 9.4 `DocumentPreviewEditor.tsx`

**البنية (شاشة كاملة، مش modal):**
1. **Header الشاشة:** زرار رجوع + اسم القالب + Badge حالة (`مسودة` بلون رمادي / `تم التصدير` بلون أخضر — نفس ألوان حالات القضايا المستخدمة فعلاً)
2. **منطقة المعاينة:** مستطيل أبيض بمقاس صفحة A4 تقريبي (scaled للموبايل)، خلفية رمادي فاتح حواليها (نفس نمط "print preview" لو موجود مكافئ في سند)، اتجاه RTL، خط المستندات (Amiri) من نفس القرار المستخدم في تقرير القضية
   - المحتوى يُعرض بترتيب `document_content_json` بالضبط (header → title → intro → facts → legal_grounds → requests → signature) — **بدون أي إعادة ترتيب**
   - كل قسم `contenteditable` مباشر على النص (تحرير inline بسيط بدون toolbar تنسيق معقد في MVP — bold/italic فقط لو الوقت سمح، وإلا نص عادي قابل للتحرير فقط)
   - التعديل يُحفظ في state محلي فوراً، وبيتبعت لـ Supabase بـ debounce 2 ثانية بعد آخر تعديل (auto-save، بدون زرار "حفظ" منفصل) — تحديث `document_content_json` و`updated_at` فقط
3. **شريط أزرار أسفل الشاشة (Sticky، ثابت وقت الscroll):**
   - "تصدير PDF" (نمط primary)، data-testid: `doc-gen-export-pdf-btn`
   - "تصدير Word" (نمط ثانوي/secondary)، data-testid: `doc-gen-export-docx-btn`
   - كل زرار عند الضغط: Loading state على نفسه فقط (مش الشاشة كلها)، بعد النجاح: Toast نجاح + تنزيل تلقائي للملف (نفس سلوك تنزيل تقرير القضية الموجود بالفعل) + تحديث حالة المستند لـ `exported`
4. **`OfficeProfileCompletenessBanner`:** يظهر أعلى منطقة المعاينة (مش أسفلها) **فقط** لو فيه حقول ناقصة في `office_settings`:
   - نص: "بيانات مكتبك غير مكتملة (الختم/التوقيع غير موجود)" — الحقول المذكورة بالاسم فعلياً الناقصة، مش نص عام (راجع القسم 1.1 بند 3: الختم/التوقيع هو العمود المفقود المؤكد)
   - زرارين جنب بعض: "استكمال الآن" (نمط outline، بيفتح شاشة إعدادات المكتب الموجودة في تبويب/route جديد، مش يغلق شاشة التحرير الحالية) و"تخطي" (نمط ghost، بيقفل الـ banner لباقي الجلسة فقط عبر state محلي، مش تفضيل دائم)
   - لو `office_settings` كامل: الـ banner مش بيظهر إطلاقاً (مفيش مساحة فاضية محجوزة له)

### 9.5 `GenerateDocumentButton.tsx` (داخل `CaseDetailView`)

> ✅ **[تحديث المرحلة 0 — القرار #3، محسوم]** النص الأصلي تحت افترض وجود "صف أزرار مشترك مع إضافة أتعاب/إضافة مستند" — **الفحص أثبت إن مفيش تبويب أتعاب في نفس شاشة `CaseDetailView` أصلًا** (الأتعاب فيتشر منفصل على مستوى الناف). المكان النهائي: **جوه تبويب `docs`، جنب زرار "☁️ رفع مستند جديد" الموجود**.

- زرار واحد بسيط، نمط ثانوي/secondary، النص: "توليد مستند"، أيقونة `file-plus` أو المكافئ، يتحط جوه تبويب `docs` في `CaseDetailView`، جنب زرار "رفع مستند جديد" الموجود فعلياً (بنفس الحجم والستايل، مش زرار منفصل بستايل مختلف)
- عند الضغط: ينتقل مباشرة لـ `TemplatePicker` (مش `SourceModeSelector`) لأن `caseId` موجود بالفعل من السياق — اختيار القالب هو أول خطوة فعلية، وبعد اختيار القالب يتخطى `SourceModeSelector` بالكامل ويروح على `DynamicFieldsForm` بوضع `case_bound` مباشرة تلقائياً
- data-testid: `case-detail-generate-document-btn`

### 9.6 حالات التحميل والأخطاء العامة (تنطبق على كل الشاشات فوق)

| الحالة | السلوك |
|---|---|
| تحميل القوالب لأول مرة | Skeleton cards (نمط بصري مكافئ لأي حالة تحميل موجودة في سند) بدل الشبكة، مش spinner كامل الشاشة |
| فشل تحميل القوالب (خطأ شبكة) | رسالة خطأ + زرار "إعادة المحاولة"، **بدون** أي fallback بيانات وهمية |
| فقدان الاتصال أثناء التحرير في `DocumentPreviewEditor` | التحرير يفضل شغال محلياً (state محلي)، الـ auto-save بس بيفشل بصمت مع أيقونة صغيرة "لم يُحفظ بعد" جنب حالة المستند — **بدون** أي محاولة sync/offline queue معقدة (متوافق مع قرار "Online-first" في قسم 0) |
| نجاح التصدير | Toast أخضر لمدة 3 ثواني + اختفاء تلقائي، **بدون** إعادة توجيه (المستخدم يفضل في نفس الشاشة عشان يقدر يصدّر بالصيغة التانية كمان) |

---

**نهاية الملف الموحّد — v3**
