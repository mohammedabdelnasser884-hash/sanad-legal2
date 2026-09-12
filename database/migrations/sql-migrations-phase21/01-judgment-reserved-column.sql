-- ══════════════════════════════════════════════════════════════════
-- Phase 21 / 01 — عمود "محجوزة للحكم" على case_sessions
--
-- جزء من خطة "إعادة تصميم إغلاق سلسلة الجلسات" (12 سبتمبر 2026):
-- بيتحكم في وقت ظهور زرار "🏛️ الحكم النهائي" في TimelineSection.tsx —
-- الزرار بيظهر بس لو آخر جلسة في القضية عليها is_judgment_reserved = true.
--
-- بسيطة، بلا كسر لأي بيانات قائمة (كل الصفوف الحالية هتاخد false تلقائي).
-- الملف Idempotent (IF NOT EXISTS)، آمن يتشغل أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE case_sessions
  ADD COLUMN IF NOT EXISTS is_judgment_reserved boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN case_sessions.is_judgment_reserved IS
  'محجوزة للحكم — لو true على آخر جلسة في القضية، زرار "الحكم النهائي" يظهر في شاشة القضية. يُكتب من SessionUpdateModal (toggle) عند إنشاء الجلسة الجديدة، مع Pre-check تلقائي لو الجلسة الحالية كانت أصلاً محجوزة (سيناريو مد الأجل).';
