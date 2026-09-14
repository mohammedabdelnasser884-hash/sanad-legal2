-- ══════════════════════════════════════════════════════
--  Migration 1/? (Phase 31): "دليل المحامي"
--  (مرحلة 1 من خطة "إعادة هيكلة الموسوعة القانونية إلى الموارد القانونية")
--
--  دليل خدمات رسمية قابل للبحث والتصنيف (وزارة العدل، الشهر العقاري،
--  الضرائب... إلخ) — قسم شقيق لـ"الصيغ والنماذج" تحت الأب الجديد
--  "الموارد القانونية". مبني من الصفر، بدون tenant_id (مكتبة عامة
--  زي laws/encyclopedia_forms بالظبط).
--
--  الصلاحيات: نفس نموذج جداول الموسوعة (encyclopedia_*) —
--  قراءة مفتوحة لأي authenticated، كتابة مقصورة على is_super_admin().
--
--  المفضلة ⭐ مؤجلة عمدًا (مرحلة 7 في الخطة) — جدول مستقل
--  (user_favorite_links) هيتضاف وقتها، مش جزء من هذا الملف.
-- ══════════════════════════════════════════════════════

-- ── 1) جدول التصنيفات ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lawyer_guide_categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name_ar     text NOT NULL,
    icon        text NULL,
    sort_order  integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lawyer_guide_categories_sort_order
    ON public.lawyer_guide_categories(sort_order);

-- تريجر updated_at (نفس نمط encyclopedia_set_updated_at — بس دالة
-- مستقلة بادئتها lawyer_guide_ عشان صفر تشابك تسمية مع أي دالة تانية)
CREATE OR REPLACE FUNCTION public.lawyer_guide_set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_lawyer_guide_categories_updated_at ON public.lawyer_guide_categories;
CREATE TRIGGER trg_lawyer_guide_categories_updated_at
    BEFORE UPDATE ON public.lawyer_guide_categories
    FOR EACH ROW EXECUTE FUNCTION public.lawyer_guide_set_updated_at();

-- ── 2) جدول الروابط ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lawyer_guide_links (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id      uuid NOT NULL REFERENCES public.lawyer_guide_categories(id) ON DELETE CASCADE,
    title            text NOT NULL,
    url              text NOT NULL,
    description      text NULL,
    entity_type      text NULL,
    last_verified_at date NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lawyer_guide_links_category_id
    ON public.lawyer_guide_links(category_id);

DROP TRIGGER IF EXISTS trg_lawyer_guide_links_updated_at ON public.lawyer_guide_links;
CREATE TRIGGER trg_lawyer_guide_links_updated_at
    BEFORE UPDATE ON public.lawyer_guide_links
    FOR EACH ROW EXECUTE FUNCTION public.lawyer_guide_set_updated_at();

-- ── 3) RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.lawyer_guide_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lawyer_guide_links ENABLE ROW LEVEL SECURITY;

-- القراءة: أي مستخدم مسجّل دخول (من أي مكتب، أي role) يقدر يقرأ
DROP POLICY IF EXISTS lawyer_guide_categories_read ON public.lawyer_guide_categories;
CREATE POLICY lawyer_guide_categories_read ON public.lawyer_guide_categories
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS lawyer_guide_links_read ON public.lawyer_guide_links;
CREATE POLICY lawyer_guide_links_read ON public.lawyer_guide_links
    FOR SELECT TO authenticated USING (true);

-- الكتابة: سوبر أدمن بس — نفس is_super_admin() المستخدمة فعليًا في
-- عشرات السياسات التانية بالمشروع (وفي جداول الموسوعة بالتحديد).
DROP POLICY IF EXISTS lawyer_guide_categories_write ON public.lawyer_guide_categories;
CREATE POLICY lawyer_guide_categories_write ON public.lawyer_guide_categories
    FOR ALL TO authenticated
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS lawyer_guide_links_write ON public.lawyer_guide_links;
CREATE POLICY lawyer_guide_links_write ON public.lawyer_guide_links
    FOR ALL TO authenticated
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

-- ── خطوة تأكيد بعد التنفيذ ──
-- SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('lawyer_guide_categories', 'lawyer_guide_links');
-- لازم relrowsecurity = true للجدولين.
--
-- SELECT policyname, cmd, roles FROM pg_policies
--   WHERE tablename IN ('lawyer_guide_categories', 'lawyer_guide_links');
-- المتوقع: 4 سياسات (read + write لكل جدول).
