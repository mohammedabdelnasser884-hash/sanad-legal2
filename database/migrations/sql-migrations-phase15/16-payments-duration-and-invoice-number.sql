-- ============================================================
-- 15-16 (خطة المدفوعات والفواتير — المرحلة A، 10 سبتمبر 2026)
-- subscription_months + invoice_number + sequence ترقيم الفواتير
-- ============================================================
-- الهدف: توسيع tenant_subscription_payments عشان يستحمل (1) مدة
-- اشتراك متغيرة لكل دفعة (شهر/3 شهور/سنة، مش شهر ثابت زي دلوقتي)،
-- و(2) رقم فاتورة اختياري بيتولّد أول مرة بس عند الطباعة الفعلية
-- (get-or-create — نفس فلسفة getOrCreateInvoice الموجودة فعليًا في
-- useInvoicePrinting.ts لفواتير الأتعاب الداخلية) عشان دفعة اتعملها
-- Undo قبل ما تتطبع فاتورتها متاخدش رقم من السلسلة من غير داعي.
--
-- subscription_months: NOT NULL DEFAULT 1 — الصفوف القديمة (كل
-- الدفعات المسجّلة لحد دلوقتي كانت شهر ثابت بالكود، addOneMonth)
-- بتاخد القيمة الصحيحة تلقائيًا من غير أي backfill يدوي.
--
-- invoice_number: قابل للـNULL عمدًا (لحد أول طباعة)، UNIQUE عشان
-- نضمن عدم التكرار البرمجي كمان (مش بس الاعتماد على منطق التطبيق).
--
-- الـsequence عام واحد لكل النظام (مش لكل مكتب زي invoice_number
-- بتاع الأتعاب الداخلي) — لأن الفواتير دي كلها صادرة من جهة واحدة
-- (جيمي/سَند كمزوّد خدمة)، مش من كل مكتب لعملائه.
-- ============================================================

ALTER TABLE public.tenant_subscription_payments
  ADD COLUMN IF NOT EXISTS subscription_months integer NOT NULL DEFAULT 1;

ALTER TABLE public.tenant_subscription_payments
  ADD COLUMN IF NOT EXISTS invoice_number text UNIQUE;

COMMENT ON COLUMN public.tenant_subscription_payments.subscription_months IS
  'مدة الاشتراك المسجّلة في هذه الدفعة بالشهور (1/3/12 حاليًا من الواجهة، لكن العمود مش مقيّد بقيم بعينها). الصفوف القديمة قبل هذا الميجريشن = 1 (كانت شهر ثابت بالكود).';

COMMENT ON COLUMN public.tenant_subscription_payments.invoice_number IS
  'رقم فاتورة تسلسلي عام (INV-0001, INV-0002, ...)، NULL لحد أول ضغطة "طباعة فاتورة" فعلية (get-or-create في actionIssueInvoice) — عشان دفعة اتعملها Undo قبل الطباعة متحجزش رقم من السلسلة.';

CREATE SEQUENCE IF NOT EXISTS public.tenant_invoice_number_seq START 1;
