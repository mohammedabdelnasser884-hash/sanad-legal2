import React, { useState } from 'react';
import { exportSessionToGoogleCalendar } from '../shared';
import WeekDayRow from './WeekDayRow';

function WeekCard({ weekIndex, weekLabel, dateRange, days, sessionsMap, tasksMap, cases, clients, onOpenCase, onOpenReminders, todayStr, handleGoogleExport }: any) {
    const containsToday = days.some((d: string) => d === todayStr);
    const [open, setOpen] = useState<boolean>(false);

    // احسب عدد الجلسات في الأسبوع
    const totalSess  = days.reduce((acc: number, d: string) => acc + (sessionsMap[d]?.length || 0), 0);
    const totalTasks = days.reduce((acc: number, d: string) => acc + (tasksMap[d]?.length || 0), 0);
    const total      = totalSess + totalTasks;

    // خط ذهبي مثل DayCard
    const goldColor = containsToday ? 'rgba(212,175,55,0.9)' : 'rgba(212,175,55,0.4)';
    const lineStyle = {
        position: 'absolute' as const,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '40%',
        height: '2px',
        background: `linear-gradient(to right, transparent, ${goldColor}, transparent)`,
        borderRadius: '999px',
    };

    return React.createElement('div', { className: "mb-2" },
        // ── هيدر بتصميم DayCard الذهبي ──
        React.createElement('button', {
            onClick: () => setOpen((o: boolean) => !o),
            className: "w-full flex items-center justify-between px-4 py-3 rounded-xl overflow-visible relative active:scale-[0.98] transition-all",
            style: {
                background: containsToday
                    ? 'linear-gradient(135deg, rgba(42,31,0,0.9), rgba(61,46,0,0.9))'
                    : 'linear-gradient(135deg, rgba(15,18,32,0.95), rgba(20,24,42,0.95))',
                borderTop:    '1px solid rgba(255,255,255,0.06)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                borderRight: containsToday ? '3px solid #D4AF37' : '3px solid rgba(212,175,55,0.35)',
                borderLeft:  containsToday ? '3px solid #D4AF37' : '3px solid rgba(212,175,55,0.35)',
                boxShadow: containsToday
                    ? '0 2px 20px rgba(212,175,55,0.12), inset 0 0 30px rgba(212,175,55,0.04)'
                    : '0 2px 10px rgba(0,0,0,0.3)',
            }
        },
            // خط ذهبي فوق
            React.createElement('div', { style: { ...lineStyle, top: '-3px' } }),
            // خط ذهبي تحت
            React.createElement('div', { style: { ...lineStyle, bottom: '-3px' } }),

            // المنتصف: اسم الأسبوع + النطاق
            React.createElement('div', { className: "flex-1 flex items-center justify-center gap-2" },
                React.createElement('span', {
                    className: "font-black text-[14px]",
                    style: { color: containsToday ? '#D4AF37' : '#D4AF37' }
                }, weekLabel),
                React.createElement('span', {
                    className: "text-[11px] font-semibold",
                    style: { color: containsToday ? 'rgba(212,175,55,0.75)' : 'rgba(212,175,55,0.5)' }
                }, dateRange),
                containsToday && React.createElement('span', {
                    className: "text-[8px] font-black px-2 py-0.5 rounded-full",
                    style: { background: 'rgba(212,175,55,0.15)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.3)' }
                }, "الحالي")
            ),

            // يمين: عدد الجلسات + سهم
            React.createElement('div', { className: "flex items-center gap-1.5 shrink-0" },
                React.createElement('span', {
                    className: "text-[10px] font-bold px-2.5 py-1 rounded-lg",
                    style: {
                        background: containsToday ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.06)',
                        color: containsToday ? '#D4AF37' : '#475569',
                        border: containsToday ? '1px solid rgba(212,175,55,0.25)' : '1px solid rgba(255,255,255,0.07)'
                    }
                }, `${total} جلسة`),
                React.createElement('span', {
                    className: "text-[11px] text-slate-500 transition-transform",
                    style: { display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none' }
                }, "⌄")
            )
        ),

        // ── محتوى الأيام (يظهر كلها دفعة واحدة عند الفتح) ──
        open && React.createElement('div', {
            className: "mt-1 rounded-xl overflow-hidden",
            style: { border: '1px solid rgba(56,189,248,0.15)', background: 'rgba(15,18,32,0.6)' }
        },
            days.map((dateStr: string) =>
                React.createElement(WeekDayRow, {
                    key: dateStr,
                    dateStr, sessionsMap, tasksMap, cases, clients,
                    onOpenCase, onOpenReminders, todayStr, handleGoogleExport
                })
            )
        )
    );
}

export default WeekCard;
