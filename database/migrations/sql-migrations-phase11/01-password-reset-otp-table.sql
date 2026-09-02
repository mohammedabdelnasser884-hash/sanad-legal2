-- ══════════════════════════════════════════════════════
--  Migration 1/1 (Phase 11): جدول أكواد التحقق الإضافية
--  (6 أرقام) لخطوة "تأكيد الهوية" في خطة استعادة كلمة المرور
--  (Phase 4 من ResetPasswordScreen.tsx).
--
--  السياق: قالب إيميل "Magic Link" في Supabase مقفول التعديل على
--  الخطة المجانية بدون Custom SMTP، فمش قادرين نستخدم آلية
--  signInWithOtp/verifyOtp المدمجة في Supabase عشان نوري الكود
--  للمستخدم جوه الإيميل. الحل: نولّد الكود ونبعته إحنا بنفسنا
--  (عبر Gmail SMTP، شوف supabase/functions/password-reset-otp) ونخزّن
--  الـhash بتاعه هنا للتحقق لاحقًا — من غير أي اعتماد على قوالب
--  إيميل Supabase نفسها.
--
--  ⚠️ بيتخزّن الـhash فقط (SHA-256) مش الكود نفسه، بنفس منطق
--  pin-hash-migration.sql الموجود بالفعل في المشروع لأكواد الدخول
--  التانية (بوابة الموكل).
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS password_reset_otps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  code_hash   text NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_user_time
  ON password_reset_otps(user_id, created_at DESC);

ALTER TABLE password_reset_otps ENABLE ROW LEVEL SECURITY;
-- عمدًا مفيش أي policy — ممنوع الوصول تمامًا إلا من service_role
-- (الإيدج فانكشن password-reset-otp هي الوحيدة اللي بتكتب/تقرأ
-- الجدول ده)، بنفس نمط office_login_attempts.

-- ── تنظيف دوري (اختياري) ──
-- الصفوف بتنتهي صلاحيتها بعد 15 دقيقة أصلًا وبتتفحص دايمًا مع
-- expires_at، فمش لازم تنظيف فوري. لو حابب توفير مساحة على المدى
-- الطويل، ممكن تضيف job شبيه بـcleanup-portal-pin-attempts الموجود
-- بالفعل في pg_cron عندك:
--   SELECT cron.schedule(
--     'cleanup-password-reset-otps',
--     '0 4 * * *',
--     $$DELETE FROM password_reset_otps WHERE created_at < now() - interval '7 days'$$
--   );
