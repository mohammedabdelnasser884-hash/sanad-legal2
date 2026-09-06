# خطة — تدفق انضمام مكتب جديد (Onboarding)

### من إنشاء المكتب يدويًا من لوحة السوبر أدمن، لحد أول دخول كامل ومفعّل للمكتب

**التاريخ:** 6 سبتمبر 2026
**آخر تحديث تنفيذ:** 6 سبتمبر 2026
**الحالة العامة:** ✅ **مراحل 1-4 اكتملت بالكامل كود** (مرحلة 1: المستخدم شغّل الـSQL، مرحلة 2: نُشرت الفانكشنز فعليًا، مرحلة 3: رقم الهاتف بقى إجباري في `offices-portal.html`، مرحلة 4: شاشتي الـonboarding + التوجيه في `App.tsx` مُسلَّمين) + ✅ **البند المؤجّل (زرار فك القفل) اتنفّذ كمان** (راجع القسم 3.4 الجديد) — باقي بس **مرحلة 5 (الاختبار اليدوي الشامل)**. مبني على فحص فعلي للكود الحالي (`saas-admin`, `office-login`, `password-reset-otp`, `offices-portal.html`, `OfficeSection.tsx`) — كل بنود الخطة اتفحصت واتأكدت مطابقة للكود الفعلي قبل البدء.

---

## 1. المشكلة الحالية (من فحص الكود)

الوضع دلوقتي: `actionCreateOffice` في `saas-admin/index.ts` بتاخد كل بيانات المكتب كاملة وقت الإنشاء (اسم، إيميل، اسم أدمن، تليفون، باقة، حالة، تاريخ انتهاء تجريبي، ملاحظات) وبتحاول تعلّم `profiles.force_password_change = true` — **عمود مش موجود أصلًا في الـschema** (الاسم الحقيقي الموجود وشغّال فعليًا في مكان تاني من المشروع هو `must_change_password`، مستخدم في `admin-actions/index.ts` و`SecuritySection.tsx`). يعني نية "إجبار تغيير الباسورد أول دخول" كانت متضمّنة في التصميم من الأول بس اتنفذت بعمود غلط، وبالتالي مش شغّالة فعليًا — المستخدم الجديد بيدخل بالباسورد المؤقت ويستخدم النظام عادي من غير أي إجبار.

مفيش أي تحقق من الإيميل، ومفيش أي شاشة "أكمل بيانات مكتبك" — المكتب بيدخل على التطبيق كامل على طول بعد أول لوجين ناجح.

---

## 2. القرار المتفق عليه (من النقاش)

### 2.1 إنشاء المكتب (من عندك، لوحة `offices-portal.html`)
بتدخل: **اسم المكتب/صاحبه، البريد الإلكتروني، رقم الموبايل، الباقة** (تجريبي أو واحدة من الباقات الثلاث الأساسية) — دول إجباريين. **الحالة وتاريخ انتهاء الفترة التجريبية يفضلوا موجودين في الفورم بس اختياريين** (مش إجباريين — لو الباقة "تجريبي" ومفيش تاريخ محدد، تفضل بلا تاريخ انتهاء لحد ما تحدده بعدين من نفس اللوحة).

### 2.2 أول دخول للمكتب
1. يدخل بالباسورد المؤقت (زي ما هو حاليًا، عبر `office-login`)
2. النظام يطلب **تحقق من الإيميل بكود عبر Brevo** (إعادة استخدام نفس آلية `password-reset-otp` الموجودة، لكن لغرض جديد: تفعيل حساب، مش استعادة باسورد)
3. بعد التحقق، شاشة إجبارية فيها **حاجتين مع بعض:** تعيين باسورد جديد دائم + ملء بيانات المكتب (**نفس حقول تاب "بيانات المكتب" الموجود بالظبط** — `OfficeSection.tsx` الحالي، بنفس الحقول: الاسم، الشعار، تليفون، تليفون 2، إيميل، موقع، واتساب، عنوان، مدينة، دولة، فيسبوك، إنستجرام، ألوان البراند، إلخ)
4. بعد إكمال الاتنين → دخول عادي كامل على التطبيق

### 2.3 استمرارية التقدّم (Resumability)
لو المستخدم اتحقق من الكود وخرج قبل ما يكمل الباسورد/البيانات، ولما يرجع يسجّل دخول تاني **يرجعله يكمل من نفس النقطة** (شاشة "أكمل بياناتك" مباشرة، مش هيتطلب منه كود تاني). ده معناه إن حالة التقدّم لازم تتخزّن في الداتابيز (`profiles`)، مش في الـsession/المتصفح.

### 2.4 سياسة إعادة إرسال الكود (Escalating Cooldown)

| المحاولة | الانتظار المطلوب قبلها |
|---|---|
| الإرسال الأول | فوري (أول ما المستخدم يوصل للشاشة) |
| إعادة إرسال 1 | 45 ثانية |
| إعادة إرسال 2 | دقيقتين |
| إعادة إرسال 3 | ربع ساعة |
| إعادة إرسال 4 (أي محاولة بعد كده) | **مرفوضة تمامًا** — قفل 24 ساعة، رسالة "تواصل مع الدعم" |

**قرار نهائي (تصعيد صارم، وله سقف واضح — مش عمر مفتوح):** كل مرة المستخدم يوصل لآخر السلم (3 محاولات إعادة إرسال) ويتقفل، رقم القفل ده بيتسجّل كـ"دورة قفل" منفصلة. مدة القفل نفسها بتتصاعد مع كل دورة:

| دورة القفل | مدتها |
|---|---|
| الأولى | 24 ساعة |
| الثانية | 72 ساعة (3 أيام) |
| الثالثة | 7 أيام |
| الرابعة فأي محاولة بعدها | **تجميد كامل للحساب** — مفيش عداد وقت خالص، الحساب ميقدرش يطلب أو يتحقق من أي كود تاني إلا بعد **تدخل يدوي منك** (زرار "فك القفل" جديد في `offices-portal.html`، بيصفّر دورة القفل بالكامل ويرجّعها للبداية) |

يعني السلم مش هيفضل يكبر لما لا نهاية — عنده سقف واضح (3 دورات قفل مؤقتة، وبعدين تجميد يحتاج تدخلك إنت شخصيًا). ده بيمنع أي استغلال (تجربة إيميلات عشوائية بشكل متكرر) من غير ما يترك الحساب معلّق لأبد بدون حل.

الكود نفسه بيفضل صالح لمدة 15 دقيقة من وقت إرساله (زي `password-reset-otp` الحالي)، وليه حد أقصى 5 محاولات إدخال خاطئة قبل ما يترفض ويطلب كود جديد (نفس `MAX_VERIFY_ATTEMPTS` الحالي).

---

## 3. المعمارية

### 3.1 قاعدة البيانات — ✅ مُسلَّمة (بانتظار تشغيلها فعليًا على الداتابيز)

**تعديل `profiles`:**
```sql
ALTER TABLE profiles
  ADD COLUMN onboarding_status text NOT NULL DEFAULT 'completed'
    CHECK (onboarding_status IN ('pending_verification', 'pending_setup', 'completed')),
  ADD COLUMN onboarding_lockout_tier int NOT NULL DEFAULT 0,   -- عدد دورات القفل الكاملة اللي حصلت (0-3)
  ADD COLUMN onboarding_locked_until timestamptz,               -- وقت انتهاء القفل الحالي (لو في دورة 1-3)
  ADD COLUMN onboarding_frozen boolean NOT NULL DEFAULT false;  -- true = تجميد كامل، محتاج فك يدوي منك
```
- `onboarding_lockout_tier`/`onboarding_locked_until`/`onboarding_frozen` على مستوى الـprofile (مش على مستوى صف الكود نفسه) عشان تدوير الأسطر في `onboarding_verifications` (كود جديد كل مرة) ميصفّرش عداد دورات القفل بالغلط.
- `DEFAULT 'completed'` عشان كل المستخدمين الموجودين حاليًا (اللي دخلوا وكملوا فعلاً) ميتأثروش ولا يتوقفوا فجأة عند أول لوجين بعد الـmigration.
- المكتب الجديد بيتعمل بـ`onboarding_status = 'pending_verification'` صراحة من `actionCreateOffice`.
- بعد تأكيد الكود → `pending_setup`.
- بعد إكمال الباسورد+البيانات → `completed`.

**جدول جديد `onboarding_verifications`** (منفصل عن `password_reset_otps` الموجود، عشان منطق الـescalating cooldown مختلف تمامًا ومنعزل — تعديل الجدول القديم كان هيأثر على استعادة الباسورد العادية):
```sql
CREATE TABLE onboarding_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  resend_stage int NOT NULL DEFAULT 0,      -- 0..3، بيحدد مدة الانتظار الجاية
  locked_until timestamptz,                  -- لو مليان، يبقى في قفل الـ24 ساعة
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_onboarding_verifications_user ON onboarding_verifications(user_id, created_at DESC);
```
RLS: مفيش وصول مباشر من أي مستخدم — كل التعامل عبر Edge Function بصلاحية service_role بس.

**تسليم فعلي:** `01-onboarding-status-column.sql` + `02-onboarding-verifications-table.sql` في `database/migrations/sql-migrations-phase10/`. **باقي عليك:** تشغيلهم على الداتابيز (SQL Editor) — الكود الجاي معتمد عليهم.

**`tenants`/`office_settings`:** صفر تغيير في الأعمدة — موجودين فعلاً بكل الحقول المطلوبة.

### 3.2 Edge Functions — ✅ مُسلَّمة بالكامل

**تعديل `saas-admin/actionCreateOffice`** — ✅ مُسلَّم:
- حذف السطر الغلط `force_password_change: true`
- إضافة `onboarding_status: 'pending_verification'` في الـinsert بتاع `profiles`
- الفورم بيبعت `tenant.status`/`tenant.trial_ends_at` بس لو المستخدم (انت) حددهم فعليًا، وإلا يتسابوا فاضيين (null) — مفيش تغيير في منطق الفانكشن نفسه غير حذف أي `required` validation عليهم لو موجودة (مش موجودة أصلًا حسب الفحص، القيد ده كان بس في الواجهة `f-status`/`f-expires` مش الفانكشن)

**تعديل `saas-admin`: إضافة `action: resetOnboardingLock`** — ✅ مُسلَّم (نُفّذ مع 3.2 نفسها بدل ما يتأجّل، طالما نفس الملف كان متفتوح فعلاً): بياخد `userId`، يصفّر `onboarding_lockout_tier=0, onboarding_locked_until=null, onboarding_frozen=false` — الزرار الوحيد اللي بيفك التجميد الكامل، ومحدود بتوكن السوبر أدمن زي باقي الـactions.

**Edge Function جديدة `onboarding-otp`** — ✅ مُسلَّمة (self-contained، نفس نمط `password-reset-otp` تمامًا لكن بمنطق cooldown/lockout مختلف). **مفيش تستات لها** — بقرار صريح منك. مسار الملف: `supabase/functions/onboarding-otp/index.ts` — فانكشن جديدة، لسه محتاجة تتعمل يدويًا وتتنشر في Supabase Dashboard:
- `action: send` —
  1. لو `profiles.onboarding_frozen = true` → رفض فورًا برسالة الدعم (القسم 2.5)
  2. لو `profiles.onboarding_locked_until` لسه في المستقبل → رفض برسالة القفل المؤقت (فيها الوقت المتبقي)
  3. لو `onboarding_locked_until` عدّى (أو مفيش قفل خالص) → تحسب `resend_stage` من آخر صف `onboarding_verifications`، تتأكد إن مدة الانتظار المطلوبة عدّت (45 ثانية/دقيقتين/ربع ساعة)، وتبعت كود جديد
  4. لو المستخدم عدّى المرحلة التالتة (يعني هيطلب إعادة إرسال رابعة) → بدل ما تبعت كود، تزوّد `onboarding_lockout_tier` بواحد، تحسب مدة القفل الجديدة من الجدول (24س/72س/7أيام)، تحطها في `onboarding_locked_until`، ولو `onboarding_lockout_tier` وصلت 4 → تعلّم `onboarding_frozen = true` بدل ما تحط تاريخ قفل
- `action: verify` — تتحقق من الكود، تعلّم `consumed_at`، وتحدّث `profiles.onboarding_status = 'pending_setup'` (وتصفّر `onboarding_lockout_tier` لصفر لأن التحقق نجح فعليًا)
- `action: complete` — تتأكد إن `onboarding_status = 'pending_setup'` (**بدون قيد وقت**)، تاخد الباسورد الجديد + حقول `office_settings` (whitelist: الهوية/التواصل الأساسية فقط — الاسم، الشعار، تليفون×2، إيميل، موقع، واتساب، عنوان، مدينة، دولة، فيسبوك، إنستجرام، ألوان البراند)، تعمل PUT على Admin API للباسورد و`UPSERT` على `office_settings`، وتحدّث `profiles.onboarding_status = 'completed'`

**تعديل `office-login`** — ✅ مُسلَّم: الاستعلام بقى يجيب `onboarding_status`، والرد بعد نجاح الدخول بقى يتضمّنه، عشان الفرونت إند يعرف يوجّه المستخدم للشاشة الصح من غير استعلام إضافي.

### 3.3 الواجهة — ✅ مُنفَّذة (6 سبتمبر 2026)

**⚠️ تصحيح على فرض القسم 1:** الفحص الفعلي لـ`offices-portal.html` (الفورم نفسه + منطق `saveTenant()`) طلع عكس الفرض الأصلي جزئيًا:
- "الحالة" و"تاريخ انتهاء الفترة التجريبية" **اختياريين بالفعل حاليًا** — مفيش `*` ومفيش أي validation فعلي عليهم في الكود. مش محتاجين أي تعديل خالص.
- "رقم الهاتف" **مش إجباري فعليًا حاليًا** (مفيش `*` ومفيش validation) — وده عكس المطلوب في القسم 2.1 (الهاتف من ضمن الحقول الإجبارية).
- حقل الموبايل أصلًا بيتبعت دايمًا مع الإنشاء (`tenantPayload.phone`) — مش محتاج ربط جديد، الجزء ده من 3.1 منفّذ بالفعل.

**يبقى الشغل الحقيقي المطلوب في 3.1 هو عكس المكتوب أصلًا:** إضافة إجبارية رقم الهاتف بس (label بعلامة `*` + validation في `saveTenant()` بنفس أسلوب فحص الإيميل الموجود) — والحالة/التاريخ يفضلوا زي ما هم من غير أي لمس.

**`offices-portal.html`** — ✅ مُسلَّم: label "رقم الهاتف" بقى عليه علامة `*`، و`saveTenant()` (مسار إنشاء مكتب جديد بس) بقى برفض الحفظ برسالة "رقم الهاتف مطلوب" لو الحقل فاضي — قبل ما يبعت أي حاجة للفانكشن. "الحالة" و"تاريخ الانتهاء" فضلوا زي ما هما بلا أي لمس (اختياريين، مفيش `*`).

**شاشتين جديدتين (`src/features/onboarding/`)** — ✅ مُسلَّمتين:
1. `OnboardingVerifyScreen.tsx` — تظهر لو `onboarding_status === 'pending_verification'`. بتبعت الكود تلقائيًا أول ما تفتح، حقل إدخال 6 أرقام، زرار "إعادة إرسال" بعداد تنازلي محلي يعكس المرحلة الحالية (45 ثانية/دقيقتين/ربع ساعة حسب `resend_stage` الراجع من السيرفر)، ورسائل القفل المؤقت/التجميد الكامل بتتعرض زي ما السيرفر رجّعها بالظبط (السيرفر هو مصدر الحقيقة الفعلي، مش العدّاد المحلي).
2. `OnboardingSetupScreen.tsx` — تظهر لو `onboarding_status === 'pending_setup'`. باسورد جديد (زي `ChangeMyPasswordModal` بس بدون طلب الباسورد القديم) + فورم بيانات مكتب.
   ⚠️ **قرار تنفيذي أثناء البناء:** الكومبوننت الأصلي `OfficeSection.tsx` طلع متشابك فعليًا مع `useAdminOffice` (رفع الشعار لـSupabase Storage، تحميل/حفظ منفصلين، تابات فرعية "الدولة"/"إشعارات تليجرام" مالهاش لازمة هنا) — فاتنفذت **نسخة مبسطة مستقلة** بنفس حقول whitelist اللي `onboarding-otp/index.ts` (`OFFICE_SETTINGS_FIELDS`) بتقبلها فعليًا: الاسم، السلوجن، تليفون×2، إيميل، موقع، واتساب، عنوان، مدينة، دولة، فيسبوك، إنستجرام، ألوان البراند. **الشعار (رفع ملف) اتسيب عمدًا لشاشة "إعدادات المكتب" العادية بعد كده** — رفع ملف فعلي مش مناسب لخطوة onboarding سريعة، ومفيش أي مانع يتضاف لاحقًا لو احتجت.

**تعديل `App.tsx`** — ✅ مُسلَّم: بوابتين جداد مُضافتين بعد بوابة `!authUser || !profile` مباشرة وقبل بوابة إقرار الشروط والأحكام — لو `profile.onboarding_status === 'pending_verification'` تعرض `OnboardingVerifyScreen`، ولو `'pending_setup'` تعرض `OnboardingSetupScreen` (بديل كامل لهيكل التطبيق، نفس مبدأ `LoginScreen`/`ResetPasswordScreen` بالظبط). بعد نجاح verify/complete، بيتحدّث `profile.onboarding_status` محليًا فورًا (`setProfile` متفائل) من غير راوند تريب إضافي لأن السيرفر أكّد الحالة الجديدة فعليًا.

**إضافة ضرورية مش مذكورة صراحة في الخطة الأصلية:** `src/database.types.ts` اتعدّل لإضافة أعمدة `onboarding_status`/`onboarding_lockout_tier`/`onboarding_locked_until`/`onboarding_frozen` لجدول `profiles` (Row/Insert/Update) — من غيرها TypeScript كان هيرفض أي وصول لـ`profile.onboarding_status` في الكود كله.

### 3.4 زرار فك قفل/تجميد الـ Onboarding — ✅ مُسلَّم (6 سبتمبر 2026، بند مؤجّل اتنفّذ)

القرار الأمني: **مفيش توسيع لـ`ALLOWED_TABLES` ليشمل `profiles`** (كان هيفتح proxy عام (GET/POST/PATCH بأي فلتر) على جدول حساس بالكامل من الواجهة، مش بس أعمدة الـonboarding). بدل كده اتنفّذ البديل اللي الخطة نفسها اقترحته:

**`saas-admin/index.ts`:**
- `actionResetOnboardingLock` بقت تاخد `tenantId` بدل `userId` — بتدوّر داخليًا (service_role) على `profiles?tenant_id=eq...&role=eq.admin` عشان تلاقي الأدمن المرتبط، من غير ما الواجهة تحتاج تعرف `user_id` أصلًا.
- action جديدة `getOnboardingStatuses` — بترجّع بس 5 أعمدة ضيّقة (`tenant_id`, `onboarding_status`, `onboarding_frozen`, `onboarding_locked_until`, `onboarding_lockout_tier`) لكل حسابات الأدمن، مش وصول عام للجدول.

**`offices-portal.html`:**
- `loadTenants()` بقى بيستدعي `loadOnboardingStatuses()` كمان ويربط حالة كل مكتب (`t._onboarding`) بالـ`tenant_id`.
- عمود "الحالة" بقى بيعرض شارة إضافية: 🔒 "Onboarding مجمّد" (لو `onboarding_frozen`) أو ⏳ "Onboarding مقفول" (لو في قفل مؤقت سارٍ).
- عمود "إجراءات" بقى فيه زرار فك قفل إضافي (بيظهر بس لو المكتب مقفول/مجمّد فعليًا) — بيستدعي `resetOnboardingLock` بعد تأكيد (`confirm`)، وبيحدّث الحالة محليًا فورًا من غير إعادة تحميل الجدول كله.
- helper جديد `callAdminAction(action, extra)` — لأي action غير `query` (بديل عن تكرار نفس منطق `sbFetch` لكل action جديدة مستقبلًا).

**غير مطلوب تشغيل أي SQL جديد** — الأعمدة دي موجودة بالفعل من مرحلة 1.

**تغطية اختبارات (6 سبتمبر 2026، بعد سؤال مباشر عن تأثير التعديلات على التستات):** راجعت كل التستات (unit + E2E) في المشروع مقابل خطة الـonboarding كاملة — مفيش أي تست موجود اتكسر (خصوصًا تست الـwhitelist في `saas-admin/index.test.ts` اللي بيتأكد إن `profiles` مرفوضة من `action=query`، ولسه صحيح لأننا ما لمسناهاش)، ومفيش أي E2E spec بيمر بتدفق onboarding أو بـ`offices-portal.html` أصلًا (حسابات التست ثابتة ومعمولة يدويًا بـ`onboarding_status = 'completed'`). الفجوة الوحيدة اللي كانت موجودة: صفر تغطية لـ`resetOnboardingLock`/`getOnboardingStatuses` — اتقفلت بإضافة 7 تستات جديدة في `saas-admin/index.test.ts` (4 لـ`resetOnboardingLock`: من غير token، من غير `tenantId`، مفيش أدمن مرتبط، ومسار النجاح بالتأكد من الـPATCH وبياناته؛ و3 لـ`getOnboardingStatuses`: من غير token، إرجاع الصفوف، ومصفوفة فاضية). **باقي عليك:** تشغيل `npm run test` محليًا للتأكد (الشبكة كانت مقفولة في السيشن اللي كتبتهم فيه فمقدرتش أشغّلهم فعليًا، راجعتهم يدويًا بس).

---

## 4. خطة التنفيذ — مراحل

### مرحلة 1 — قاعدة البيانات — ✅ مُسلَّمة (بانتظار تنفيذك الفعلي على الداتابيز)
- [x] 1.1 Migration: `onboarding_status` على `profiles` — `01-onboarding-status-column.sql`
- [x] 1.2 Migration: جدول `onboarding_verifications` + RLS — `02-onboarding-verifications-table.sql`

### مرحلة 2 — Backend — ✅ اكتملت بالكامل
- [x] 2.1 تعديل `saas-admin/actionCreateOffice` + `action: resetOnboardingLock` الجديد — `saas-admin-index.ts`
- [x] 2.2 Edge Function جديدة `onboarding-otp` (send/verify/complete) — من غير تستات (بقرارك) — `onboarding-otp-index.ts`
- [x] 2.3 تعديل `office-login`: إرجاع `onboarding_status` في الرد — `office-login-index.ts`

**باقي عليك:** نشر فانكشن `onboarding-otp` الجديدة يدويًا في Supabase Dashboard (Create new function باسم `onboarding-otp`)، وإعادة نشر `saas-admin` و`office-login` بعد استبدال الكود.

### مرحلة 3 — واجهة الإنشاء (لوحتك) — ✅ اكتملت (6 سبتمبر 2026)
- [x] 3.1 إجبارية رقم الهاتف فقط (label + validation) — `offices-portal.html`

### مرحلة 4 — واجهة الـonboarding (المكتب الجديد) — ✅ اكتملت (6 سبتمبر 2026)
- [x] 4.1 `OnboardingVerifyScreen.tsx`
- [x] 4.2 `OnboardingSetupScreen.tsx` (نسخة مبسطة مستقلة — راجع ⚠️ في القسم 3.3)
- [x] 4.3 تعديل `App.tsx` للتوجيه حسب `onboarding_status` (+ تحديث `database.types.ts`)

### مرحلة 4.5 — زرار فك قفل الـ Onboarding (بند مؤجّل) — ✅ اكتملت (6 سبتمبر 2026)
- [x] 4.4 تعديل `resetOnboardingLock` لتاخد `tenantId` + action جديدة `getOnboardingStatuses` — `saas-admin-index.ts`
- [x] 4.5 شارة الحالة + زرار الفك في `offices-portal.html`
- [x] 4.6 تستات لـ`resetOnboardingLock`/`getOnboardingStatuses` (7 تستات جديدة) — `saas-admin-index.test.ts` — **محتاجة تشغيل محلي للتأكيد (`npm run test`)**

### مرحلة 5 — اختبار يدوي شامل — ⏳ لسه (الوحيدة المتبقية)
- إنشاء مكتب تجريبي كامل من الصفر لحد الدخول الكامل على التطبيق، بما فيها تجربة القفل بعد 3 محاولات إعادة إرسال
- تجربة زرار فك القفل الجديد بعد الوصول لقفل مؤقت/تجميد كامل
- **باقي عليك قبل التجربة:** رفع/نشر الملفات المُسلَّمة (`App.tsx`, `database.types.ts`, `OnboardingVerifyScreen.tsx`, `OnboardingSetupScreen.tsx`, `offices-portal.html`, `saas-admin/index.ts`) على GitHub/Vercel + **إعادة نشر `saas-admin` في Supabase Dashboard** (تعديل جديد في الفانكشن)

---

## 2.5 رسالة "تواصل مع الدعم" (تظهر عند القفل المؤقت والتجميد الكامل)

هتحتوي على:
- الموقع الرسمي: `https://sanad-nizam-site.vercel.app/`
- صفحة الفيسبوك: `facebook.com/sanadnizam`
- الإيميل: `sanadnizam@gmail.com`
- رقم التواصل: **لسه مش جاهز** — هيتضاف لاحقًا لما يتحدد؛ الرسالة تتبنى دلوقتي بالتلاتة عناصر فوق بس، ومكان الرقم مايتعرضش خالص لحد ما يتحدد.
