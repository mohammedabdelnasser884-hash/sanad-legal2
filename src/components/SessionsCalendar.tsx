import React, { useState, useEffect, useCallback } from 'react';
import { I } from '../constants';
import { toDateStr } from './sessions-calendar/constants';
import WeekTab from './sessions-calendar/WeekTab';
import MonthListTab from './sessions-calendar/MonthListTab';
import CalendarTab from './sessions-calendar/CalendarTab';
import MissedTab from './sessions-calendar/MissedTab';
import { db } from '../supabaseClient';
import StandaloneSessionDetailModal from './StandaloneSessionDetailModal';

function SessionsCalendar({ cases, clients, onOpenCase, onOpenReminders, initialTab }: any) {
    const [activeTab, setActiveTab] = useState<'week'|'month'|'calendar'|'missed'>(initialTab || 'week');
    const [missedCount, setMissedCount] = useState(0);
    const [standaloneTarget, setStandaloneTarget] = useState<any>(null);

    // جلب عدد الفائتة لعرضه على الـ badge
    const fetchMissedCount = useCallback(async () => {
        const todayStr = toDateStr(new Date());
        const [sessCnt, taskCnt] = await Promise.all([
            db.from('case_sessions')
              .select('id,result,next_action')
              .lt('session_date', todayStr)
              .then(({ data }: any) => (data || []).filter((s: any) => !s.result?.trim() && !s.next_action?.trim()).length),
            db.from('reminders')
              .select('id,done')
              .eq('done', false)
              .lt('due_date', todayStr)
              .then(({ data }: any) => (data || []).length)
        ]);
        setMissedCount(sessCnt + taskCnt);
    }, []);

    useEffect(() => {
        fetchMissedCount();

        // Realtime: أي تغيير في الجلسات أو التذكيرات يحدّث الـ badge فوراً
        const sessionsSub = db
            .channel('missed-badge-sessions')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'case_sessions' }, fetchMissedCount)
            .subscribe();

        const remindersSub = db
            .channel('missed-badge-reminders')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, fetchMissedCount)
            .subscribe();

        return () => {
            db.removeChannel(sessionsSub);
            db.removeChannel(remindersSub);
        };
    }, [fetchMissedCount]);

    const tabs = [
        { id: 'week',     label: 'الأسبوع', emoji: '📆' },
        { id: 'month',    label: 'الشهر',   emoji: '🗓' },
        { id: 'missed',   label: 'الفائتة', emoji: '⚠️', count: missedCount },
        { id: 'calendar', label: 'التقويم', emoji: '📅' },
    ] as const;

    return React.createElement(React.Fragment, null,
        standaloneTarget && React.createElement(StandaloneSessionDetailModal, {
            session: standaloneTarget,
            db,
            onClose: () => setStandaloneTarget(null),
            onDone: () => setStandaloneTarget(null),
        }),
        React.createElement('div', { className: "space-y-2 fade-in" },

        // ── التابس ──
        React.createElement('div', { className: "flex bg-white/5 border border-white/10 rounded-xl p-0.5 gap-0.5" },
            tabs.map((t: any) => React.createElement('button', {
                key: t.id,
                onClick: () => setActiveTab(t.id),
                className: `flex-1 flex items-center justify-center gap-0.5 px-1 py-2 rounded-lg text-[12px] font-black transition-all relative ${
                    activeTab === t.id
                        ? t.id === 'missed'
                            ? 'bg-rose-500/80 text-white shadow-md'
                            : 'bg-premium-gold text-premium-bg shadow-md'
                        : 'text-slate-400 hover:text-white'
                }`
            },
                React.createElement('span', null, t.emoji),
                t.label,
                // badge عدد الفائتة
                t.id === 'missed' && t.count > 0 && React.createElement('span', {
                    className: `absolute -top-1 -left-1 min-w-[16px] h-4 flex items-center justify-center text-[8px] font-black rounded-full px-1 ${
                        activeTab === 'missed' ? 'bg-white text-rose-600' : 'bg-rose-500 text-white'
                    }`
                }, t.count)
            ))
        ),
        activeTab === 'week'     && React.createElement(WeekTab,      { cases, clients, onOpenCase, onOpenReminders, onOpenStandalone: setStandaloneTarget }),
        activeTab === 'month'    && React.createElement(MonthListTab,  { cases, clients, onOpenCase, onOpenReminders, onOpenStandalone: setStandaloneTarget }),
        activeTab === 'calendar' && React.createElement(CalendarTab,   { cases, clients, onOpenCase, onOpenStandalone: setStandaloneTarget }),
        activeTab === 'missed'   && React.createElement(MissedTab,     { cases, clients, onOpenCase, onOpenReminders, onOpenStandalone: setStandaloneTarget })
        )
    );
}

export default SessionsCalendar;
