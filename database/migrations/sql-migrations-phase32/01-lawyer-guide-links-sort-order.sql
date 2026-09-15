-- ══════════════════════════════════════════════════════
--  Migration (Phase 32): ترتيب يدوي لروابط "دليل المحامي"
--
--  حسم قرار #1 المفتوح في خطة "إعادة هيكلة الموسوعة القانونية إلى
--  الموارد القانونية" — الأهم يفضل فوق (ترتيب يدوي من الأدمن)، بدل
--  الترتيب الأبجدي التلقائي المُطبَّق مبدئيًا في مرحلة 3.
--
--  إضافة عمود sort_order لجدول lawyer_guide_links فقط — نفس فكرة
--  العمود الموجود بالفعل في lawyer_guide_categories، بنفس القيمة
--  الافتراضية (0) ونفس أسلوب الفرز (ASC، الأصغر يفضل فوق).
-- ══════════════════════════════════════════════════════

ALTER TABLE public.lawyer_guide_links
    ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_lawyer_guide_links_sort_order
    ON public.lawyer_guide_links(category_id, sort_order);

-- ── خطوة تأكيد بعد التنفيذ ──
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'lawyer_guide_links' AND column_name = 'sort_order';
-- المتوقع: صف واحد (العمود موجود).
