import { useState, useCallback } from 'react';
import { db } from '../supabaseClient';

export function useDashboardFeed(profile: any) {
    const [todaySessions,    setTodaySessions]    = useState([]);  // جلسات اليوم فقط
    const [upcomingSessions, setUpcomingSessions] = useState([]);  // بكره + 6 أيام
    const [missedSessions,   setMissedSessions]   = useState([]);  // فائتة بدون تحديث
    const [loadingUrgent,    setLoadingUrgent]    = useState(false);

    // ── المهام (reminders) ──
    const [upcomingTasks,     setUpcomingTasks]     = useState([]); // due_date >= اليوم، غير منجزة
    const [missedTasks,       setMissedTasks]       = useState([]); // due_date < اليوم، غير منجزة
    const [upcomingTasksOpen, setUpcomingTasksOpen] = useState(false);
    const [todayOpen,         setTodayOpen]         = useState(true);
    const [upcomingOpen,      setUpcomingOpen]      = useState(true);

    // ── ملاحظة: فحص dbOnline + الـ event listeners موجودين في App.tsx فقط ──
    // تم حذف النسخة المكررة من هنا لتجنب إرسال طلبين لـ Supabase كل 30 ثانية
    // وتجنب تراكم event listeners على window

    // ── helper: date formatter ──
    const fmtDate = (d: Date) =>
        d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');

    // ── جلب جلسات اليوم ──
    const fetchTodaySessions = useCallback(async () => {
        if (!profile) return;
        setLoadingUrgent(true);
        const todayStr = fmtDate(new Date());
        const { data } = await db.from('case_sessions')
            .select('id, session_date, session_time, session_floor, session_hall, description, case_id, result, next_action, title, case_number, court, case_type, circuit_number, plaintiff, plaintiff_role, defendant, defendant_role')
            .eq('session_date', todayStr)
            .order('session_date', { ascending: true });
        setTodaySessions(data || []);
        setLoadingUrgent(false);
    }, [profile]);

    // ── جلب جلسات الأسبوع القادم (بكره + 6 أيام) ──
    const fetchUpcomingSessions = useCallback(async () => {
        if (!profile) return;
        const today    = new Date();
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const endDay   = new Date(today); endDay.setDate(today.getDate() + 7);
        const { data } = await db.from('case_sessions')
            .select('id, session_date, session_time, session_floor, session_hall, description, case_id, result, next_action, title, case_number, court, case_type, circuit_number, plaintiff, plaintiff_role, defendant, defendant_role')
            .gte('session_date', fmtDate(tomorrow))
            .lte('session_date', fmtDate(endDay))
            .order('session_date', { ascending: true });
        setUpcomingSessions(data || []);
    }, [profile]);

    // ── جلب الجلسات الفائتة ──
    // جلسة فائتة = آخر جلسة في قضيتها وتاريخها قبل اليوم ومافيش جلسة جديدة مجدولة بعدها
    // ⚠️ الإصلاح: أزلنا limit(200) اللي كانت تفوّت قضايا قديمة — دلوقتي بنجيب
    //    أحدث جلسة لكل قضية عبر فلترة server-side أدق
    const fetchMissedSessions = useCallback(async () => {
        if (!profile) return;
        const todayStr = fmtDate(new Date());

        // 1. كل الـ case_ids اللي عندها جلسة مستقبلية (اليوم أو بعده)
        const { data: futureData } = await db.from('case_sessions')
            .select('case_id')
            .gte('session_date', todayStr);
        const caseIdsWithFuture = new Set((futureData || []).map((s: any) => s.case_id));

        // 2. جيب أحدث جلسة فائتة لكل قضية (بدون limit — RLS بتحمي الحجم)
        const { data: pastData } = await db.from('case_sessions')
            .select('id, session_date, session_time, description, case_id, result, next_action, title, case_number, court, case_type, circuit_number, plaintiff, plaintiff_role, defendant, defendant_role')
            .lt('session_date', todayStr)
            .order('session_date', { ascending: false });

        // 3. فلتر: قضايا مفيهاش جلسة مستقبلية + خد جلسة واحدة (الأحدث) لكل قضية
        const seenCases = new Set();
        const uniqueMissed = (pastData || []).filter((s: any) => {
            if (caseIdsWithFuture.has(s.case_id)) return false;
            if (seenCases.has(s.case_id)) return false;
            seenCases.add(s.case_id);
            return true;
        });
        setMissedSessions(uniqueMissed);
    }, [profile]);

    // ── جلب المهام ──
    const fetchTasks = useCallback(async () => {
        if (!profile) return;
        const todayStr = fmtDate(new Date());
        const { data } = await db.from('reminders')
            .select('id,title,due_date,notes,done')
            .eq('done', false)
            .order('due_date', { ascending: true });
        const all = data || [];
        setUpcomingTasks(all.filter((r: any) => r.due_date >= todayStr));
        setMissedTasks(all.filter((r: any) => r.due_date < todayStr));
    }, [profile]);

    return {
        todaySessions,    setTodaySessions,
        upcomingSessions, setUpcomingSessions,
        missedSessions,   setMissedSessions,
        upcomingTasks,    setUpcomingTasks,
        missedTasks,      setMissedTasks,
        loadingUrgent,
        upcomingTasksOpen, setUpcomingTasksOpen,
        todayOpen,         setTodayOpen,
        upcomingOpen,      setUpcomingOpen,
        fetchTodaySessions, fetchUpcomingSessions, fetchMissedSessions, fetchTasks,
    };
}
