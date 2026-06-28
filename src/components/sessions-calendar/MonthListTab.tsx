import React, { useState, useEffect } from 'react';
import { db } from '../../supabaseClient';
import { toast } from '../../utils';
import { I } from '../../constants';
import { exportSessionToGoogleCalendar } from '../shared';
import { MONTHS_AR2, WEEK_LABELS, toDateStr } from './constants';
import DayCard from './DayCard';
import { getDayName } from './WeekDayRow';
import MonthWeekView from './MonthWeekView';

function MonthListTab({ cases, clients, onOpenCase, onOpenReminders, onOpenStandalone }: any) {
    const today    = new Date();
    const todayStr = toDateStr(today);

    const [viewYear,  setViewYear]  = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [sessions, setSessions]   = useState<any[]>([]);
    const [tasks,    setTasks]      = useState<any[]>([]);
    const [loading, setLoading]     = useState(true);

    useEffect(() => {
        setLoading(true);
        const mm   = String(viewMonth + 1).padStart(2, '0');
        const last = new Date(viewYear, viewMonth + 1, 0).getDate();
        const startStr = `${viewYear}-${mm}-01`;
        const endStr   = `${viewYear}-${mm}-${String(last).padStart(2,'0')}`;
        db.from('case_sessions')
          .select('id,session_date,case_id,description,result,next_action,session_time,session_floor,session_hall,title,case_number,court,case_type,plaintiff,plaintiff_national_id,plaintiff_power_of_attorney,defendant,defendant_national_id')
          .gte('session_date', startStr)
          .lte('session_date', endStr)
          .order('session_date', { ascending: true })
          .then(({ data }: any) => {
              setSessions(data || []); setTasks([]); setLoading(false);
          });
    }, [viewYear, viewMonth]);

    const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); } else setViewMonth(m => m-1); };
    const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); } else setViewMonth(m => m+1); };

    const sessionsMap: Record<string, any[]> = {};
    sessions.forEach((s: any) => {
        if (!sessionsMap[s.session_date]) sessionsMap[s.session_date] = [];
        sessionsMap[s.session_date].push(s);
    });
    const tasksMap: Record<string, any[]> = {};
    tasks.forEach((r: any) => {
        if (!tasksMap[r.due_date]) tasksMap[r.due_date] = [];
        tasksMap[r.due_date].push(r);
    });

    const handleGoogleExport = (s: any, e: any) => {
        e.stopPropagation();
        const linkedCase   = cases.find((c: any) => c.id === s.case_id);
        const linkedClient = linkedCase ? clients.find((cl: any) => cl.id === linkedCase.client_id) : null;
        exportSessionToGoogleCalendar(s, linkedCase?.title || 'جلسة قانونية', linkedCase?.court || '', linkedClient?.full_name || '');
        toast('🗓 جاري الفتح في Google Calendar...');
    };

    // ── بناء الأسابيع الأربعة ──
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const mm = String(viewMonth + 1).padStart(2, '0');
    const buildDateStr = (d: number) => `${viewYear}-${mm}-${String(d).padStart(2,'0')}`;

    // حدود الأسابيع: 1-7 / 8-14 / 15-21 / 22-نهاية
    const weekBounds = [
        { start: 1,  end: 7             },
        { start: 8,  end: 14            },
        { start: 15, end: 21            },
        { start: 22, end: daysInMonth   },
    ];
    const weekLabels = ['الأسبوع الأول', 'الأسبوع الثاني', 'الأسبوع الثالث', 'الأسبوع الرابع'];

    const weeks = weekBounds.map((wb, idx) => {
        const days: string[] = [];
        for (let d = wb.start; d <= wb.end; d++) days.push(buildDateStr(d));
        const start = buildDateStr(wb.start);
        const end   = buildDateStr(wb.end);
        const startDay = wb.start;
        const endDay   = wb.end;
        const startDayName = getDayName(start);
        const endDayName   = getDayName(end);
        return {
            idx,
            label: weekLabels[idx],
            dateRange: `${startDay} (${startDayName}) — ${endDay} (${endDayName})`,
            days,
        };
    });

    return React.createElement('div', { className: "space-y-3 fade-in" },

        // ── شريط رفيع: الشهر/السنة + عدد الجلسات + رجوع للشهر الحالي ──
        React.createElement('div', { className: "flex items-center justify-between px-1" },
            React.createElement('p', { className: "text-[10px] font-bold text-slate-500" },
                `${MONTHS_AR2[viewMonth]} ${viewYear}` + (loading ? '' : ` · ${sessions.length} جلسة`)
            ),
            (viewYear !== today.getFullYear() || viewMonth !== today.getMonth()) && React.createElement('button', {
                onClick: () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); },
                className: "text-[9px] font-black text-premium-gold active:scale-95 transition-all px-2 py-1 rounded-full",
                style: { background: 'rgba(212,175,55,0.08)' }
            }, "↩ الشهر الحالي")
        ),

        loading
            ? React.createElement('div', { className: "flex items-center justify-center py-16 gap-2 text-slate-500 text-xs" },
                React.createElement(I.Spin), "جاري التحميل...")

            : React.createElement(MonthWeekView, {
                weeks, sessionsMap, tasksMap, cases, clients,
                onOpenCase, onOpenReminders, onOpenStandalone, todayStr, handleGoogleExport,
                prevMonth, nextMonth
            })
    );
}

// ── عرض الشهر: أزرار 4 أسابيع + قائمة الأيام ──

export default MonthListTab;
