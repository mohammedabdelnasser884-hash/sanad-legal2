-- ══════════════════════════════════════════════════════
--  Migration 1 (Phase 17): جدول محاولات فانكشن forgot-password-gate
--  (قفل استعادة كلمة المرور على أدمن المكتب فقط)
--
--  نفس نمط office_login_attempts بالظبط (راجع
--  sql-migrations-phase2/04-office-login-attempts-table.sql)، لكن
--  جدول منفصل عمدًا عشان محاولات "نسيت كلمة المرور" ميتخلطش مع
--  محاولات تسجيل الدخول العادي — دول مسارين مختلفين، وممكن حد يفضل
--  يجرب إيميلات كتير في الـgate من غير ما يكون بيحاول يسجل دخول
--  فعليًا، فمنطقي يكون ليه عداد لوحده.
--
--  بيُستخدم من إيدج فانكشن forgot-password-gate (شوفها في نفس
--  التسليم) — MAX_ATTEMPTS=5 / LOCKOUT_MINUTES=15، نفس قيم
--  office-login بالظبط عشان الاتساق (راجع القرارات النهائية، بند 3،
--  في sanad-forgot-password-gate-plan-2.md).
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS forgot_password_gate_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  ip_address  text NOT NULL,
  success     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forgot_password_gate_attempts_email_time
  ON forgot_password_gate_attempts(email, created_at);

CREATE INDEX IF NOT EXISTS idx_forgot_password_gate_attempts_ip_time
  ON forgot_password_gate_attempts(ip_address, created_at);

ALTER TABLE forgot_password_gate_attempts ENABLE ROW LEVEL SECURITY;
-- عمدًا مفيش أي policy — يعني ممنوع الوصول تمامًا إلا من service_role
-- (الفانكشن forgot-password-gate هي الوحيدة اللي بتكتب/تقرأ الجدول ده).

-- ── تنظيف دوري (اختياري لكن موصى بيه) ──
-- زي التعليق المماثل في office_login_attempts، تقدر تضيف جوب
-- pg_cron يمسح الصفوف الأقدم من أسبوع:
--   SELECT cron.schedule(
--     'cleanup-forgot-password-gate-attempts',
--     '0 4 * * *',
--     $$DELETE FROM forgot_password_gate_attempts WHERE created_at < now() - interval '7 days'$$
--   );
-- ده اختياري بحت — الجدول مش هيكبر بسرعة، وده تحسين مش إصلاح أمان.
