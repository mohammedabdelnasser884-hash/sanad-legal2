# تقرير حالة — تحصين خطة استعادة كلمة المرور (Phase 4: كود تحقق + تقليل مدة صلاحية اللينك)
تاريخ: 2 سبتمبر 2026

## الخلاصة
خطة استعادة الباسورد (Phase 3) كانت شغالة بس الاعتماد فيها كان على
حاجة واحدة بس للتحقق من الهوية: الدخول على اللينك الجاي بالإيميل.
اتراجعت نقطتين أمان:

1. **مدة صلاحية اللينك** كانت على الإعداد الافتراضي في Supabase
   (Email OTP Expiration) — غالبًا طويلة جدًا لعملية حساسة زي تغيير
   باسورد.
2. **مفيش تحقق تاني وقت التغيير الفعلي** — لو حد قدر يوصل للينك
   بطريقة غير متوقعة (اتحول، اتفتح من جهاز تاني، إلخ) بعد وقت من
   إرساله، مفيش أي حاجز إضافي قبل ما يقدر يغيّر الباسورد فعليًا.

## اللي اتعمل

### 1. إعداد Supabase (Dashboard — خارج الكود)
- `Authentication → Providers → Email → Email OTP Expiration` اتحطت
  على **900 ثانية (15 دقيقة)** بدل الإعداد الافتراضي الطويل. الإعداد
  ده بيحكم صلاحية لينك الاستعادة **وكمان** كود الـ6 أرقام الجديد
  (بند 2) في نفس الوقت، لأن الاتنين بيمروا على نفس آلية OTP في
  Supabase.
- اتفعّل **Leaked Password Protection** من نفس صفحة الإعدادات —
  بيرفض أي باسورد جديد معروف إنه اتسرب في تسريبات بيانات سابقة.
- ⚠️ خطوة متبقية عند حضرتك: التأكد إن قالب إيميل "Magic Link"
  (`Authentication → Email Templates → Magic Link`) فيه المتغيّر
  `{{ .Token }}` ظاهر في نص الرسالة، عشان المستخدم يشوف الكود
  المكوّن من 6 أرقام فعليًا جوه الإيميل اللي هيوصله.

### 2. `ResetPasswordScreen.tsx` — خطوة تحقق جديدة (Phase 4)
الشاشة بقى ليها 3 مراحل بدل مرحلة واحدة:

```
loading → otp → password
```

- **`loading`**: لحظة فتح الشاشة، بتاخد إيميل المستخدم من جلسة
  الـrecovery الحالية (`db.auth.getSession()` — متاحة فعلاً من غير
  أي نداء إضافي) وتبعت تلقائيًا كود 6 أرقام منفصل تمامًا عبر
  `db.auth.signInWithOtp({ email, options:{shouldCreateUser:false} })`.
  القناة دي (Magic Link/Email OTP) مختلفة تمامًا عن قناة الـrecovery
  اللي اتستهلكت بالفعل بمجرد الدخول باللينك — يعني ده تأكيد تاني
  ومستقل، مش نفس التوكن بشكل تاني.
- **`otp`**: المستخدم بيدخّل الكود، بيتأكد بـ
  `db.auth.verifyOtp({ email, token, type:'email' })`. فيه:
  - رسالة خطأ واضحة لو الكود غلط/منتهي.
  - زرار "إعادة الإرسال" بعدّاد **45 ثانية** (هامش أمان تحت الـ60
    ثانية اللي Supabase بيفرضها كـrate limit على طلبات OTP).
  - `data-testid`: `reset-password-otp-input` / `-submit` /
    `-resend` / `-error` / `-send-error`.
- **`password`**: نفس فورم الباسورد الجديد + التأكيد اللي كان
  موجود في Phase 3 من غير أي تغيير في منطقه (نفس `isValid`،
  نفس `handleSave`، نفس الـsign-out التلقائي بعد النجاح).

النتيجة: تأكيدين مستقلّين لملكية نفس صندوق الإيميل (كليك على اللينك
+ كود منفصل) قبل ما يتسمح بتغيير الباسورد، بدل تأكيد واحد بس.

## الفحص
- توازن الأقواس (`(){}` `[]`) في الملف اتفحص برمجيًا — متطابق تمامًا.
- منطق الـuseRef (`otpSentOnce`) بيمنع إرسال الكود مرتين في React
  StrictMode (dev double-invoke).
- عدّاد إعادة الإرسال بيرجع صفر تلقائيًا كل ثانية عن طريق
  `setTimeout` جوه `useEffect` (مفيش تسريب interval).
- مفيش أي تغيير في `App.tsx` أو `useAuthProfile.ts` مطلوب — الشاشة
  لسه بتتفعّل بنفس الشرط (`isPasswordRecovery`) وبترجع لنفس مسار
  الخروج (`signOut` → `onAuthStateChange(null)`).

## تحديث (فشل CI — نفس اليوم)
الـ build فشل في GitHub Actions (`npm run lint && tsc --noEmit && vite
build`، الـlint شغّال بـ`--max-warnings=0`) بتحذير واحد بس:

```
ResetPasswordScreen.tsx
  100:9  warning  Unused eslint-disable directive
                  (no problems were reported from 'react-hooks/exhaustive-deps')
✖ 1 problem (0 errors, 1 warning)
```

السبب: سطر `// eslint-disable-next-line react-hooks/exhaustive-deps`
اللي اتحط احتياطًا فوق الـ`useEffect` بتاع الإرسال التلقائي للكود،
بس الـeffect أصلاً مكانش هيطلع منه أي تحذير (الدوال اللي بتتنادى
جواه — `sendOtp`, `setStage`, `setEmail`, `setSendErr` — كلها ستيبل
ومحتاجاش تتدرج في الـdeps)، فقاعدة ESLint اللي بتمنع
"eslint-disable" غير مستخدم فعليًا هي اللي طلّعت التحذير. اتشال
السطر الزيادة ده، والملف فحصته تاني بحساب توازن الأقواس — لسه
متطابق (140/140 قوسين عاديين، 64/64 أقواس معقوفة، 26/26 قوسين
مربعين).

## تحديث (استبدال آلية إرسال الكود بالكامل — نفس اليوم)
اتضح إن قالب إيميل "Magic Link" مقفول التعديل في لوحة Supabase على
الخطة المجانية بدون توصيل Custom SMTP، وده هيمنع أي محاولة نضيف
`{{ .Token }}` للقالب. بدل ما نوقف على القيد ده أو نطلب من المكتب
توصيل SMTP كامل، استبدلنا آلية الكود بالكامل عشان تبقى مستقلة تمامًا
عن نظام إيميلات Supabase وقوالبه:

### 1. جدول جديد — `password_reset_otps`
`database/migrations/sql-migrations-phase11/01-password-reset-otp-table.sql`.
بيخزّن الـSHA-256 hash بتاع الكود (مش الكود نفسه) + `user_id` +
`email` + `expires_at` + عداد `attempts` — بنفس منطق `pin-hash-migration.sql`
الموجود بالفعل للأكواد التانية في المشروع. RLS مفعّلة من غير أي
policy (service_role بس).

### 2. إيدج فانكشن جديدة — `password-reset-otp`
ملف واحد self-contained (`supabase/functions/password-reset-otp/index.ts`)
بنفس نمط `office-login`:
- `action: 'send'` — بيتحقق من هوية الطالب عبر `/auth/v1/user`
  (نفس جلسة الـrecovery، مفيش أي إيميل بييجي من الفرونت إند مباشرة)،
  بيولّد كود عشوائي (`crypto.getRandomValues`)، يخزّن الـhash بتاعه،
  ويبعته عن طريق **Resend** مباشرة (API خارجي، مش عن طريق Supabase
  SMTP خالص). فيه cooldown 45 ثانية بين الطلبات، ولو الإرسال فشل
  فعليًا بيمسح الصف عشان الـcooldown مايمنعش محاولة تانية فورية.
- `action: 'verify' { code }` — بيقارن الـhash، بحد أقصى 5 محاولات
  فاشلة لكل كود، وبيتأكد من `expires_at` (15 دقيقة، نفس القيمة
  المتفق عليها).

### 3. `ResetPasswordScreen.tsx`
`sendOtp`/`handleVerifyOtp` بقوا بينادوا على
`db.functions.invoke('password-reset-otp', {...})` بدل
`db.auth.signInWithOtp`/`verifyOtp`، بنفس نمط معالجة الأخطاء
المستخدم بالفعل في `LoginScreen.tsx` (`getEdgeFunctionErrorMessage`
+ `looksArabicUserMessage` من `src/shared/lib/edgeFunctionErrors.ts`)
عشان لو الفانكشن رجّعت رسالة عربية واضحة تتعرض زي ما هي، ولو رجعت
خطأ شبكة/تقني تتعرض رسالة موحّدة بدله. باقي منطق الشاشة (المراحل
الثلاث، عداد إعادة الإرسال، فورم الباسورد) زي ما هو من غير تغيير.

## الخطوات المتبقية عندك (خارج الكود)
1. **شغّل ملف الـSQL الجديد** (`01-password-reset-otp-table.sql`) من
   `Supabase Dashboard → SQL Editor` — لصق المحتوى ودوس Run.
2. **انشر الإيدج فانكشن الجديدة** (`password-reset-otp`) من
   `Supabase Dashboard → Edge Functions → Deploy a new function` —
   انسخ محتوى `index.ts` كامل والصقه.
3. **ضيف الـsecrets** من `Supabase Dashboard → Edge Functions →
   Secrets` (أو `Manage secrets`):
   - `RESEND_API_KEY` = المفتاح اللي عملته على Resend.
   - (اختياري) `RESEND_FROM_EMAIL` — لو وثّقت دومين بتاعك في Resend
     لاحقًا. من غيره، هيستخدم الإيميل التجريبي الافتراضي
     `onboarding@resend.dev` وده كافي للتجربة.
4. **مدة الصلاحية (15 دقيقة)** لسه محتاج تتظبط زي ما اتفقنا في
   `Authentication → Providers → Email → Email OTP Expiration = 900` —
   ده لسه بيتحكم في لينك الاستعادة نفسه (منفصل تمامًا عن الكود
   الجديد اللي بقى مستقل بالكامل).

⚠️ **مفتاح Resend اللي اتبعت في الشات**: المفتاح مش بنفس خطورة كلمة
سر قاعدة بيانات، بس طالما اتبعت في نص عادي، الأفضل إنك تعمله
**Rotate** (تلغيه وتعمل واحد جديد) من لوحة Resend بعد ما تخلص ربطه،
وتستخدم الجديد بدله في الـsecret.

## الخطوة الجاية
لو حابب نجرب الفلو كامل بعد تنفيذ الخطوات التمانية فوق: طلب استعادة
من `LoginScreen` → فتح الإيميل → الدخول باللينك → إدخال كود الـ6
أرقام (هيوصل من Resend مباشرة) → تعيين باسورد جديد.
