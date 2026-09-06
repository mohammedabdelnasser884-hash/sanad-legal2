-- Migration 1.1 — Onboarding: profiles columns
-- مرحلة 10، خطوة 1.1 من Sanad_Office_Onboarding_Plan.md
-- Default 'completed' عشان كل المستخدمين الحاليين ميتأثروش

ALTER TABLE profiles ADD COLUMN onboarding_status text NOT NULL DEFAULT 'completed' CHECK (onboarding_status IN ('pending_verification', 'pending_setup', 'completed')), ADD COLUMN onboarding_lockout_tier int NOT NULL DEFAULT 0, ADD COLUMN onboarding_locked_until timestamptz, ADD COLUMN onboarding_frozen boolean NOT NULL DEFAULT false;
