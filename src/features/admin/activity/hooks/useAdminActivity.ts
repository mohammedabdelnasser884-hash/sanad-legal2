import { useState, useCallback } from 'react';
import { db } from '../../../../supabaseClient';
import { ilikeOrClause } from '../../../../shared/lib/sanitize';
import type { ActivityLogRow } from '../../../../types';

// شكل فلاتر سجل النشاط — نفس الحقول اللي كانت متعرّفة أصلاً في useState تحت،
// من غير أي إضافة أو حذف.
export interface ActivityFilters {
  search: string;
  user_id: string;
  action: string;
  from: string;
  to: string;
}

export function useAdminActivity() {
  const ACTIVITY_PAGE_SIZE = 30;
  const [activityLog, setActivityLog] = useState<ActivityLogRow[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activityPage, setActivityPage] = useState(0);
  const [activityFilters, setActivityFilters] = useState<ActivityFilters>({
    search: '', user_id: '', action: '', from: '', to: ''
  });

  const fetchActivity = useCallback(async (filters = activityFilters, page = activityPage) => {
    setLoadingActivity(true);
    try {
      // ══════════════════════════════════════════════════════════
      //  🔴 FIX (تشخيص PerfHud — استعلام سجل النشاط بياخد ٢.٦-٢.٨ ثانية
      //  باستمرار — 8 سبتمبر 2026): count: 'exact' بيخلّي بوستجريس يعدّ
      //  كل صف مطابق فعليًا (COUNT حقيقي) — مش بس الـ30 صف المعروضين —
      //  وده مكلّف جدًا على جدول activity_log بالذات لأنه بيكبر للأبد
      //  (بيسجّل كل عملية في النظام كله، أي حذف/تعديل/إضافة، ومن غير أي
      //  تنظيف/أرشفة). 'estimated' بيستخدم إحصائيات بوستجريس الجاهزة
      //  (planner stats) بدل عدّ حقيقي — أسرع بكتير، والفرق العملي إن
      //  رقم "إجمالي النتائج" المعروض للأدمن بيبقى تقريبي مش دقيق للرقم
      //  (شائع ومقبول في أي شاشة سجل/تدقيق بترقّم صفحات — مفيش حد محتاج
      //  يعرف الرقم بالظبط، بس يعرف إنه فيه صفحات كتير قدّامه).
      // ══════════════════════════════════════════════════════════
      let q = db.from('activity_log').select('*', { count: 'estimated' });

      // بحث حر على حقول النص
      if (filters.search?.trim()) {
        const s = filters.search.trim();
        // ⚠️ يعتمد على أعمدة client_name/case_name/case_type — لازم ميجريشن
        // activity-log-tags-migration.sql تكون اتنفذت في Supabase، وإلا
        // هيرمي خطأ من بوستجريس يخلي الاستعلام كله يفشل بصمت.
        // FIX: فاصلة أو قوس في نص البحث كان بيكسر صياغة فلتر .or()
        q = q.or([
          ilikeOrClause('action', s),
          ilikeOrClause('details', s),
          ilikeOrClause('user_name', s),
          ilikeOrClause('client_name', s),
          ilikeOrClause('case_name', s),
          ilikeOrClause('case_type', s),
        ].join(','));
      }

      // فلتر المستخدم بالـ id
      if (filters.user_id?.trim()) {
        q = q.eq('user_id', filters.user_id.trim());
      }

      // فلتر نوع الإجراء
      if (filters.action?.trim()) {
        q = q.ilike('action', `%${filters.action.trim()}%`);
      }

      // فلتر نطاق التاريخ
      if (filters.from) {
        q = q.gte('created_at', filters.from);
      }
      if (filters.to) {
        // نضيف يوم عشان يشمل نهاية يوم الـ to كاملاً
        const toDate = new Date(filters.to);
        toDate.setDate(toDate.getDate() + 1);
        q = q.lt('created_at', toDate.toISOString().slice(0, 10));
      }

      const from = page * ACTIVITY_PAGE_SIZE;
      q = q.order('created_at', { ascending: false })
           .range(from, from + ACTIVITY_PAGE_SIZE - 1);

      const { data, count } = await q;
      if (data) setActivityLog(data);
      if (count !== null) setActivityTotal(count);
    } catch(e) { /* جدول غير موجود بعد */ }
    setLoadingActivity(false);
  }, [activityFilters, activityPage]);

  return {
    activityLog, activityTotal, loadingActivity,
    activityPage, setActivityPage,
    activityFilters, setActivityFilters,
    ACTIVITY_PAGE_SIZE,
    fetchActivity
  };
}
