import React, { useState, useEffect } from 'react';
import { db } from '../../supabaseClient';
import { toast } from '../../utils';
import { I } from '../../constants';
import { exportSessionToGoogleCalendar, MONTHS_AR } from '../shared';
import { MONTHS_AR2, DAYS_FULL, DAYS_SHORT, WEEK_ORDER, WEEK_LABELS, toDateStr } from './constants';
import SessionCard from './SessionCard';
import TaskCard from './TaskCard';

function WeekTab({ cases, clients, onOpenCase, onOpenReminders, onOpenStandalone }: any) {
    const today    = new Date();
    const todayStr = toDateStr(today);

    const [weekOffset, setWeekOffset] = useState(0);
    const [sessions, setSessions]     = useState<any[]>([]);
    const [tasks,    setTasks]        = useState<any[]>([]); // disabled
    const [loading, setLoading]       = useState(true);
    const [selectedDay, setSelectedDay] = useState<string>(todayStr);

    const getWeekStart = (offset: number) => {
        const d = new Date(today);
        d.setDate(d.getDate() + offset * 7);
        return d;
    };

    const weekStart = getWeekStart(weekOffset);
    const weekDays  = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
    const weekEnd   = weekDays[weekDays.length - 1];

    useEffect(() => {
        setLoading(true);
        setSelectedDay(toDateStr(weekStart));
        const startStr = toDateStr(weekStart);
        const endStr   = toDateStr(weekEnd);
        db.from('case_sessions')
          .select('id,session_date,case_id,description,result,next_action,session_time,session_floor,session_hall,title,case_number,court,case_type,plaintiff,plaintiff_national_id,plaintiff_power_of_attorney,defendant,defendant_national_id')
          .gte('session_date', startStr)
          .lte('session_date', endStr)
          .then(({ data }: any) => {
              setSessions(data || []); setTasks([]); setLoading(false);
          });
    }, [weekOffset]);

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

    const selDaySess  = sessionsMap[selectedDay] || [];
    const selDayTasks = tasksMap[selectedDay] || [];
    const selDate     = new Date(selectedDay + 'T00:00:00');
    const selIsFriday = selDate.getDay() === 5;

    return React.createElement('div', { className: "space-y-3 fade-in" },

        // ── شريط رفيع: الشهر/السنة + عدد جلسات الأسبوع + رجوع لليوم ──
        React.createElement('div', { className: "flex items-center justify-between px-1" },
            React.createElement('p', { className: "text-[10px] font-bold text-slate-500" },
                (weekStart.getMonth() === weekEnd.getMonth()
                    ? MONTHS_AR2[weekStart.getMonth()]
                    : `${MONTHS_AR2[weekStart.getMonth()]} - ${MONTHS_AR2[weekEnd.getMonth()]}`) +
                ` ${weekStart.getFullYear()}` +
                (loading ? '' : ` · ${sessions.length} جلسة`)
            ),
            weekOffset !== 0 && React.createElement('button', {
                onClick: () => setWeekOffset(0),
                className: "text-[9px] font-black text-premium-gold active:scale-95 transition-all px-2 py-1 rounded-full",
                style: { background: 'rgba(212,175,55,0.08)' }
            }, "↩ اليوم")
        ),

        // ── ستريب التقويم: الأسهم + أيام الأسبوع في صف واحد ──
        React.createElement('div', { className: "flex items-center gap-0.5" },
            React.createElement('button', {
                onClick: () => setWeekOffset(w => w - 1),
                className: "w-6 h-9 shrink-0 flex items-center justify-center text-slate-500 active:scale-90 transition-all text-base"
            }, "‹"),
            React.createElement('div', { className: "flex-1 flex items-center justify-between" },
                weekDays.map((day: Date) => {
                    const dStr    = toDateStr(day);
                    const isToday = dStr === todayStr;
                    const isFri   = day.getDay() === 5;
                    const isSel   = dStr === selectedDay;
                    const count   = sessionsMap[dStr]?.length || 0;
                    const dotColor = isFri ? '#a78bfa' : count > 0 ? (isSel ? '#D4AF37' : '#94a3b8') : 'transparent';
                    return React.createElement('button', {
                        key: dStr,
                        onClick: () => setSelectedDay(dStr),
                        className: "flex flex-col items-center gap-1 shrink-0 py-0.5"
                    },
                        React.createElement('span', {
                            className: "text-[8px] font-bold",
                            style: { color: isSel ? '#D4AF37' : '#475569' }
                        }, DAYS_SHORT[day.getDay()]),
                        React.createElement('span', {
                            className: "w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-black transition-all",
                            style: {
                                background: isSel ? '#D4AF37' : 'transparent',
                                color: isSel ? '#0a0f1c' : isToday ? '#4ade80' : 'white',
                                border: !isSel && isToday ? '1.5px solid #4ade80' : '1.5px solid transparent',
                            }
                        }, day.getDate()),
                        React.createElement('span', {
                            className: "w-1 h-1 rounded-full",
                            style: { background: dotColor }
                        })
                    );
                })
            ),
            React.createElement('button', {
                onClick: () => setWeekOffset(w => w + 1),
                className: "w-6 h-9 shrink-0 flex items-center justify-center text-slate-500 active:scale-90 transition-all text-base"
            }, "›")
        ),

        // ── محتوى اليوم المختار ──
        loading
            ? React.createElement('div', { className: "flex items-center justify-center py-10 gap-2 text-slate-500 text-xs" },
                React.createElement(I.Spin), "جاري التحميل...")
            : React.createElement('div', { className: "space-y-2" },
                // خط رفيع شفاف لليوم المختار (بدل الهيدر الكبير)
                React.createElement('p', { className: "text-[10px] font-bold text-slate-500 px-1" },
                    `${DAYS_FULL[selDate.getDay()]} ${selDate.getDate()} ${MONTHS_AR2[selDate.getMonth()]}` +
                    (selectedDay === todayStr ? ' · اليوم' : selIsFriday ? ' · 🎉 إجازة رسمية' : '')
                ),

                // الجلسات
                selDaySess.length === 0 && selDayTasks.length === 0
                    ? React.createElement('div', {
                        className: "bg-premium-card border border-white/5 rounded-xl p-5 text-center",
                      },
                        React.createElement('p', { className: "text-2xl mb-1" }, selIsFriday ? "🌙" : "📭"),
                        React.createElement('p', { className: "text-[11px] font-black", style: { color: selIsFriday ? '#a78bfa' : '#475569' } },
                            selIsFriday ? "يوم الجمعة — إجازة أسبوعية" : "لا توجد جلسات في هذا اليوم"
                        )
                      )
                    : React.createElement(React.Fragment, null,
                        ...selDaySess.map((s: any) =>
                            React.createElement(SessionCard, { key: s.id, s, cases, clients, onOpenCase, onOpenStandalone, onGoogleExport: handleGoogleExport })
                        )
                    )
            )
    );
}

// ══════════════════════════════════════════
//  تاب الشهر — نظام كروت الأسابيع الأربعة
// ══════════════════════════════════════════

/** يرجع أسم اليوم بالعربي */

export default WeekTab;
