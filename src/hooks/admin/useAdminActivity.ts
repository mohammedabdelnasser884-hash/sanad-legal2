import { useState, useCallback } from 'react';
import { db } from '../../supabaseClient';

export function useAdminActivity() {
  const ACTIVITY_PAGE_SIZE = 30;
  const [activityLog, setActivityLog] = useState([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activityPage, setActivityPage] = useState(0);
  const [activityFilters, setActivityFilters] = useState({
    search: '', user_id: '', action: '', from: '', to: ''
  });

  const fetchActivity = useCallback(async (filters = activityFilters, page = activityPage) => {
    setLoadingActivity(true);
    try {
      let q = db.from('activity_log').select('*', { count: 'exact' });

      // بحث حر على حقول النص
      if (filters.search?.trim()) {
        const s = '%' + filters.search.trim() + '%';
        // ⚠️ يعتمد على أعمدة client_name/case_name/case_type — لازم ميجريشن
        // activity-log-tags-migration.sql تكون اتنفذت في Supabase، وإلا
        // هيرمي خطأ من بوستجريس يخلي الاستعلام كله يفشل بصمت.
        q = q.or(`action.ilike.${s},details.ilike.${s},user_name.ilike.${s},client_name.ilike.${s},case_name.ilike.${s},case_type.ilike.${s}`);
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
