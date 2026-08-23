-- إضافة عمود changes (JSONB) لجدول activity_log
-- بيخزّن قايمة الحقول اللي اتغيرت فعليًا عند التعديل، بالشكل:
-- [{ "field": "court", "label": "المحكمة", "old": "محكمة الجيزة", "new": "محكمة القاهرة" }, ...]
--
-- عمود عادي في جدول موجود، السياسات الحالية (admins_can_read_activity)
-- شغالة على مستوى الصف مش العمود — مفيش تعديل RLS مطلوب.

ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS changes jsonb;

COMMENT ON COLUMN activity_log.changes IS
  'قايمة التغييرات (من ← إلى) لكل حقل اتعدّل فعليًا في العملية دي. NULL لو مفيش تعديل حقول (إضافة/حذف) أو لو مفيش تغيير فعلي.';
