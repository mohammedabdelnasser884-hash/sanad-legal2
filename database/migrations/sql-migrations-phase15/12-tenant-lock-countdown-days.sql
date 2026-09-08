-- ============================================================
-- 15-12 — دالة العدّ التنازلي (باقي كام يوم قبل القفل)، محسوبة
-- من السيرفر بس (now())، مش من ساعة جهاز المستخدم — مطلوبة لبانر E1.
-- ============================================================
-- بترجع رقم صحيح (أيام متبقية، مقرّبة لأعلى) أو NULL لو الحالة
-- مش من ضمن الحالات اللي فيها عدّ تنازلي أصلاً (نشط عادي / تجربة
-- يوم 1-14 / مقفول تمامًا بالفعل / n_a).
--
-- الحالتين اللي بيرجع فيهم رقم:
--   1) تجربة – مرحلة "مشاهدة فقط" (يوم 15→30): العدّ لحد القفل
--      الكامل بعد انتهاء التجربة (trial_ends_at).
--   2) باقة مدفوعة:
--      - فترة سماح (grace): العدّ لحد ما يتحول لـ read-only
--        (subscription_due_at + 7 أيام).
--      - read-only (بعد فوات فترة السماح): العدّ لحد القفل الكامل
--        النهائي (subscription_due_at + 7 أيام + 60 يوم).
--
-- مبني فوق نفس منطق tenant_subscription_status() (ميجريشن 15-05)
-- بالظبط — نفس الحدود الزمنية، صفر تغيير في تعريف الحالات نفسها.
-- ============================================================

CREATE OR REPLACE FUNCTION public.tenant_lock_countdown_days(p_tenant_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    -- مصدر 1: تجربة في مرحلة المشاهدة فقط (يوم 15→30)
    WHEN t.status = 'trial'
         AND t.trial_ends_at IS NOT NULL
         AND now() >= t.trial_ends_at - interval '16 days'
         AND now() < t.trial_ends_at
      THEN CEIL(EXTRACT(EPOCH FROM (t.trial_ends_at - now())) / 86400)::integer

    -- مصدر 2: باقة مدفوعة — فترة سماح (العدّ لحد read-only)
    WHEN t.status <> 'trial'
         AND public.tenant_subscription_status(t.id) = 'grace'
      THEN CEIL(EXTRACT(EPOCH FROM (
             (t.subscription_due_at + interval '7 days') - now()
           )) / 86400)::integer

    -- مصدر 2: باقة مدفوعة — read-only (العدّ لحد القفل الكامل النهائي)
    WHEN t.status <> 'trial'
         AND public.tenant_subscription_status(t.id) = 'readonly'
      THEN CEIL(EXTRACT(EPOCH FROM (
             (t.subscription_due_at + interval '7 days' + interval '60 days') - now()
           )) / 86400)::integer

    ELSE NULL
  END
  FROM public.tenants t
  WHERE t.id = p_tenant_id;
$$;

-- ============================================================
-- للتجربة اليدوية بعد التشغيل (مش لازم تتنفذ، بس للتأكد لو حابب):
-- SELECT tenant_subscription_status(id), tenant_lock_countdown_days(id), status, trial_ends_at, subscription_due_at FROM tenants WHERE id = '<TENANT_ID>';
-- ============================================================
