-- ============================================================
-- 15-18 (خطة المدفوعات والفواتير — تعديل بعد ملاحظات جيمي، 10 سبتمبر 2026)
-- payment_date + transaction_details + تعميم طريقة الدفع + مدد 6/9 شهور
-- ============================================================
-- الهدف:
--  1) payment_date: تاريخ توثيق الدفعة الفعلي، منفصل تمامًا عن created_at
--     (وقت إدخال السجل في النظام) وعن period_start/period_end (المحسوبين
--     من منطق التجديد). ده بيسمح إن الدفعة تتسجل في النظام يوم/يومين بعد
--     ما الفلوس فعلاً دخلت، من غير ما يتلخبط أي حساب تجديد. قابل للتعديل
--     من الواجهة وقت تسجيل الدفعة، افتراضيًا النهارده لو متغيّرش.
--  2) transaction_details: حقل نصي حر اختياري لرقم العملية/تفاصيلها
--     (تحويل بنكي/محفظة إلكترونية عادةً بيكون ليهم رقم مرجعي، الكاش
--     غالبًا لأ — عشان كده الحقل اختياري مش إجباري).
--  3) طريقة الدفع: توسيع القيمة المسموحة من ('cash', 'vodafone_cash')
--     لـ ('cash', 'e_wallet', 'bank_transfer') — 'محفظة إلكترونية' بديل
--     عام لـ'فودافون كاش' (نفس المفهوم، مش مربوط بمزوّد خدمة بعينه)
--     + إضافة 'تحويل بنكي' كخيار جديد تمامًا. الصفوف القديمة المسجّلة
--     بقيمة 'vodafone_cash' بتتحول لـ'e_wallet' تلقائيًا (نفس المعنى).
--  4) subscription_months: مفيش تعديل مطلوب على العمود نفسه (integer
--     بدون CHECK قيود من الأساس — القيود كانت في الواجهة/Edge Function
--     بس، ALLOWED_SUBSCRIPTION_MONTHS)، فتوسيعه لـ [1,3,6,9,12] بيحصل
--     في الكود بس (index.ts)، من غير أي تغيير هنا.
-- ============================================================

-- ── (1) payment_date ──
-- بتتضاف الأول من غير NOT NULL/DEFAULT عشان نقدر نعمل backfill صحيح
-- للصفوف القديمة من created_at (تاريخ تسجيلها الفعلي وقتها) بدل ما
-- كل الصفوف القديمة تاخد تاريخ تشغيل الميجريشن نفسه غلط.
ALTER TABLE public.tenant_subscription_payments
  ADD COLUMN IF NOT EXISTS payment_date date;

UPDATE public.tenant_subscription_payments
  SET payment_date = created_at::date
  WHERE payment_date IS NULL;

ALTER TABLE public.tenant_subscription_payments
  ALTER COLUMN payment_date SET DEFAULT current_date;

ALTER TABLE public.tenant_subscription_payments
  ALTER COLUMN payment_date SET NOT NULL;

COMMENT ON COLUMN public.tenant_subscription_payments.payment_date IS
  'تاريخ توثيق الدفعة الفعلي (اليوم اللي الفلوس فيه دخلت فعلًا)، منفصل عن created_at (وقت تسجيل الصف في النظام) وعن period_start/period_end (تاريخ التجديد المحسوب). قابل للتعديل من الواجهة، افتراضيًا تاريخ اليوم. الصفوف القديمة (قبل هذا الميجريشن) اتعمّلها backfill من created_at::date، مش من تاريخ تشغيل الميجريشن.';

-- ── (2) transaction_details ──
ALTER TABLE public.tenant_subscription_payments
  ADD COLUMN IF NOT EXISTS transaction_details text;

COMMENT ON COLUMN public.tenant_subscription_payments.transaction_details IS
  'نص حر اختياري لرقم العملية/تفاصيلها (تحويل بنكي أو محفظة إلكترونية غالبًا بيكون ليهم مرجع، الكاش عادة لأ — الحقل اختياري عمدًا).';

-- ── (3) تعميم طريقة الدفع ──
-- تحويل الصفوف القديمة الأول قبل تغيير الـCHECK، عشان مفيش صف يقع
-- تحت القيد الجديد لحظة التبديل.
UPDATE public.tenant_subscription_payments
  SET payment_method = 'e_wallet'
  WHERE payment_method = 'vodafone_cash';

ALTER TABLE public.tenant_subscription_payments
  DROP CONSTRAINT IF EXISTS tenant_subscription_payments_payment_method_check;

ALTER TABLE public.tenant_subscription_payments
  ADD CONSTRAINT tenant_subscription_payments_payment_method_check
  CHECK (payment_method IN ('cash', 'e_wallet', 'bank_transfer'));
