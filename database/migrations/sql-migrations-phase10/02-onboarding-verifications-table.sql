-- Migration 1.2 — Onboarding: onboarding_verifications table
-- مرحلة 10، خطوة 1.2 من Sanad_Office_Onboarding_Plan.md
-- منفصل تمامًا عن password_reset_otps — منطق cooldown مختلف
-- RLS: مفيش وصول مباشر لأي مستخدم، كل التعامل عبر service_role في الـEdge Function

CREATE TABLE onboarding_verifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, email text NOT NULL, code_hash text NOT NULL, expires_at timestamptz NOT NULL, attempts int NOT NULL DEFAULT 0, resend_stage int NOT NULL DEFAULT 0, locked_until timestamptz, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());

CREATE INDEX idx_onboarding_verifications_user ON onboarding_verifications(user_id, created_at DESC);

ALTER TABLE onboarding_verifications ENABLE ROW LEVEL SECURITY;
