-- ============================================================
-- 30-01 — تحديث أسعار الباقات في plan_limits (٢٥٠/٤٠٠/١٠٠٠ →
-- ٣٠٠/٤٥٠/١٠٠٠) لمطابقة PLANS array الجديدة في offices-portal.html.
-- ملحوظة: عمود monthly_price_egp مش مقروء من أي trigger أو edge
-- function دلوقتي (مصدر السعر الفعلي وقت الدفع هو PLANS array في
-- offices-portal.html + updateSuggestedPaymentAmount())، لكن العمود
-- ده بيفضل "نسخة توثيقية" لازم تتزامن يدويًا مع أي تعديل سعر مستقبلي
-- عشان محدش يتلخبط لو بص على القاعدة مباشرة.
-- ============================================================

UPDATE public.plan_limits SET monthly_price_egp = 300, updated_at = now() WHERE plan_key = 'lawyer';
UPDATE public.plan_limits SET monthly_price_egp = 450, updated_at = now() WHERE plan_key = 'office';
-- enterprise فضل 1000 — من غير تغيير، مذكور هنا للتوثيق بس.
