-- ══════════════════════════════════════════════════════════════════
--  Migration: جدول إقرارات الشروط والأحكام (terms_acceptances)
--  الهدف: تسجيل موافقة كل مستخدم (فردياً، مش بالنيابة عن المكتب) على
--  نسخة محددة من شروط الاستخدام وإخلاء المسؤولية، قبل السماح له
--  بدخول التطبيق.
--  أسماء الجداول/الدوال المستخدمة هنا (profiles, tenants,
--  current_tenant_id()) اتأكدت من database.types.ts والمايجريشنز
--  الموجودة فعليًا (مثال: sql-migrations-phase7/01-document-generation-schema.sql).
--  profiles.user_id هو اللي بيساوي auth.uid() (مش profiles.id) — اتأكد
--  ده من عدة مايجريشنز قائمة (مثال: multi-tenant-office-settings-migration.sql).
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS terms_acceptances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL, -- = auth.uid() (نفس profiles.user_id)، عمدًا بدون FK لـauth.users من جوه schema عام
  tenant_id      uuid REFERENCES tenants(id) ON DELETE CASCADE,
  terms_version  varchar(20) NOT NULL,
  accepted_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, terms_version)
);

CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user ON terms_acceptances(user_id);

ALTER TABLE terms_acceptances ENABLE ROW LEVEL SECURITY;

-- كل مستخدم يقرا إقراراته هو بس (مفيش داعي يشوف إقرارات زملاءه)
CREATE POLICY terms_acceptances_select_own ON terms_acceptances
  FOR SELECT USING (user_id = auth.uid());

-- كل مستخدم يسجّل إقراره هو بس، وبـtenant_id بتاعه فعليًا (مش أي تينانت تاني)
CREATE POLICY terms_acceptances_insert_own ON terms_acceptances
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (tenant_id IS NULL OR tenant_id = current_tenant_id())
  );

-- عمدًا مفيش UPDATE/DELETE policy — السجل ثابت (immutable) بمجرد تسجيله،
-- وده مقصود لإثبات وقت الموافقة الفعلي.
