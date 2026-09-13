-- ══════════════════════════════════════════════════════
--  Migration 1/? (Phase 28): قسم "الموسوعة القانونية"
--  خطة قسم "الموسوعة القانونية" — مكتبة نماذج/صيغ جاهزة للتحميل
--  (مرحلة 1 من خطة التنفيذ: قاعدة البيانات والتخزين)
--
--  قرارات نهائية اتأكدت مع صاحب المشروع (11 سبتمبر 2026):
--   - عداد تحميلات لكل نموذج (download_count)                → مطلوب
--   - ترتيب النماذج/المجلدات                                  → أبجدي تلقائي (بدون sort_order)
--   - حذف مجلد فيه نماذج/مجلدات فرعية جواه                    → Cascade (يتحذف كل اللي جواه معاه)
--
--  بادئة الأسماء "encyclopedia_" مختلفة تمامًا عن legal_/document_/case_
--  الموجودة فعلاً، عشان صفر تلاقي تسمية (راجع القسم 1 في التقرير).
--
--  مافيش tenant_id على الجدولين — المكتبة عالمية واحدة لكل المكاتب،
--  زي laws/legal_categories بالظبط.
-- ══════════════════════════════════════════════════════

-- ── 1) جدول المجلدات (رئيسي + فرعي، مستويين بس) ──────────────────
CREATE TABLE IF NOT EXISTS public.encyclopedia_categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name_ar     text NOT NULL,
    parent_id   uuid NULL REFERENCES public.encyclopedia_categories(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_encyclopedia_categories_parent_id
    ON public.encyclopedia_categories(parent_id);

-- تريجر: منع مجلد فرعي من الإشارة لمجلد فرعي تاني (مستويين بس مسموحين).
-- Postgres مش بيدعم "عمق شجرة" كـCHECK عادي، فالفحص بيتم في منطق الإدراج/التعديل.
CREATE OR REPLACE FUNCTION public.encyclopedia_enforce_two_level_depth()
RETURNS trigger AS $$
DECLARE
    parent_has_parent boolean;
BEGIN
    IF NEW.parent_id IS NOT NULL THEN
        SELECT (parent_id IS NOT NULL) INTO parent_has_parent
        FROM public.encyclopedia_categories
        WHERE id = NEW.parent_id;

        IF parent_has_parent IS NULL THEN
            RAISE EXCEPTION 'المجلد الأب غير موجود';
        END IF;

        IF parent_has_parent THEN
            RAISE EXCEPTION 'غير مسموح بمستوى ثالث من المجلدات — المجلد الأب ده أصلاً مجلد فرعي';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_encyclopedia_categories_two_level ON public.encyclopedia_categories;
CREATE TRIGGER trg_encyclopedia_categories_two_level
    BEFORE INSERT OR UPDATE OF parent_id ON public.encyclopedia_categories
    FOR EACH ROW EXECUTE FUNCTION public.encyclopedia_enforce_two_level_depth();

-- تريجر updated_at (الجدولين الجداد بس — مش هيأثر على أي جدول تاني في المشروع)
CREATE OR REPLACE FUNCTION public.encyclopedia_set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_encyclopedia_categories_updated_at ON public.encyclopedia_categories;
CREATE TRIGGER trg_encyclopedia_categories_updated_at
    BEFORE UPDATE ON public.encyclopedia_categories
    FOR EACH ROW EXECUTE FUNCTION public.encyclopedia_set_updated_at();

-- ── 2) جدول النماذج (الملفات) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.encyclopedia_forms (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     uuid NOT NULL REFERENCES public.encyclopedia_categories(id) ON DELETE CASCADE,
    title           text NOT NULL,
    description     text NULL,
    file_path       text NOT NULL,
    file_name       text NOT NULL,
    file_type       text NOT NULL CHECK (file_type IN ('docx', 'pdf')),
    download_count  integer NOT NULL DEFAULT 0,
    created_by      uuid NULL REFERENCES public.profiles(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_encyclopedia_forms_category_id
    ON public.encyclopedia_forms(category_id);

DROP TRIGGER IF EXISTS trg_encyclopedia_forms_updated_at ON public.encyclopedia_forms;
CREATE TRIGGER trg_encyclopedia_forms_updated_at
    BEFORE UPDATE ON public.encyclopedia_forms
    FOR EACH ROW EXECUTE FUNCTION public.encyclopedia_set_updated_at();

-- ── 3) RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.encyclopedia_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encyclopedia_forms ENABLE ROW LEVEL SECURITY;

-- القراءة: أي مستخدم مسجّل دخول (من أي مكتب، أي role) يقدر يقرأ
DROP POLICY IF EXISTS encyclopedia_categories_read ON public.encyclopedia_categories;
CREATE POLICY encyclopedia_categories_read ON public.encyclopedia_categories
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS encyclopedia_forms_read ON public.encyclopedia_forms;
CREATE POLICY encyclopedia_forms_read ON public.encyclopedia_forms
    FOR SELECT TO authenticated USING (true);

-- الكتابة: سوبر أدمن بس — بنعيد استخدام is_super_admin() الموجودة
-- فعلاً ومستخدمة في عشرات السياسات التانية بالمشروع (بدل EXISTS يدوي).
DROP POLICY IF EXISTS encyclopedia_categories_write ON public.encyclopedia_categories;
CREATE POLICY encyclopedia_categories_write ON public.encyclopedia_categories
    FOR ALL TO authenticated
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS encyclopedia_forms_write ON public.encyclopedia_forms;
CREATE POLICY encyclopedia_forms_write ON public.encyclopedia_forms
    FOR ALL TO authenticated
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

-- ── خطوة تأكيد بعد التنفيذ ──
-- SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('encyclopedia_categories', 'encyclopedia_forms');
-- لازم relrowsecurity = true للجدولين.
--
-- SELECT policyname, cmd, roles FROM pg_policies
--   WHERE tablename IN ('encyclopedia_categories', 'encyclopedia_forms');
-- المتوقع: 4 سياسات (read + write لكل جدول).
