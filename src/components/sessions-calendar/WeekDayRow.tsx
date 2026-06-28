import React, { useState } from 'react';
import { exportSessionToGoogleCalendar } from '../shared';
import { DAYS_FULL } from './constants';
import SessionCard from './SessionCard';
import TaskCard from './TaskCard';

function getDayName(dateStr: string) {
    return DAYS_FULL[new Date(dateStr + 'T00:00:00').getDay()];
}

/** بطاقة يوم واحد داخل كارت الأسبوع — تصميم مبسط موحد اللون */
function WeekDayRow({ dateStr, sessionsMap, tasksMap, cases, clients, onOpenCase, onOpenReminders, todayStr, handleGoogleExport }: any) {
    const daySess    = sessionsMap[dateStr] || [];
    const dayTasks   = tasksMap[dateStr]    || [];
    const dayNum     = parseInt(dateStr.split('-')[2]);
    const monthNum   = parseInt(dateStr.split('-')[1]);
    const dayName    = getDayName(dateStr);
    const isToday    = dateStr === todayStr;
    const isFriday   = new Date(dateStr + 'T00:00:00').getDay() === 5;
    const hasSess    = daySess.length > 0 || dayTasks.length > 0;
    const isConflict = daySess.length > 1;
    const total      = daySess.length + dayTasks.length;

    return React.createElement('div', {
        style: { borderTop: '1px solid rgba(56,189,248,0.15)' }
    },
        // ── شريط اليوم — لون سماوي موحد لكل الأيام ──
        React.createElement('div', {
            style: {
                background: isToday ? 'rgba(8,145,178,0.45)' : 'rgba(8,145,178,0.18)',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }
        },
            // يمين: badges
            React.createElement('div', { style: { minWidth: '70px', display: 'flex', gap: '4px' } },
                isToday && React.createElement('span', {
                    style: { fontSize: '8px', fontWeight: 900, padding: '2px 7px', borderRadius: '999px', background: 'rgba(56,189,248,0.3)', color: '#e0f2fe', border: '1px solid rgba(56,189,248,0.5)' }
                }, "اليوم"),
                isConflict && React.createElement('span', {
                    style: { fontSize: '8px', fontWeight: 900, padding: '2px 7px', borderRadius: '999px', background: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.4)' }
                }, "⚠️")
            ),

            // المنتصف: اسم اليوم + التاريخ
            React.createElement('div', { style: { flex: 1, textAlign: 'center' } },
                React.createElement('span', {
                    style: { fontSize: '14px', fontWeight: 900, color: '#e0f2fe' }
                }, dayName + '  '),
                React.createElement('span', {
                    style: { fontSize: '14px', fontWeight: 700, color: 'rgba(224,242,254,0.75)' }
                }, `${dayNum} / ${monthNum}`)
            ),

            // يسار: عدد الجلسات أو "لا توجد جلسات"
            React.createElement('div', { style: { minWidth: '70px', textAlign: 'left' } },
                React.createElement('span', {
                    style: hasSess
                        ? { fontSize: '9px', fontWeight: 900, padding: '2px 8px', borderRadius: '999px', background: 'rgba(56,189,248,0.25)', color: '#e0f2fe', border: '1px solid rgba(56,189,248,0.4)' }
                        : { fontSize: '9px', fontWeight: 600, color: 'rgba(148,163,184,0.5)' }
                }, hasSess ? `${total} جلسة` : 'لا توجد جلسات')
            )
        ),

        // ── الجلسات والمهام ──
        hasSess && React.createElement('div', { className: "space-y-1.5", style: { padding: '8px 12px' } },
            daySess.map((s: any) =>
                React.createElement(SessionCard, { key: s.id, s, cases, clients, onOpenCase, onGoogleExport: handleGoogleExport })
            ),
            dayTasks.map((r: any) =>
                React.createElement(TaskCard, { key: 'task-'+r.id, r, onOpenTab: onOpenReminders })
            )
        )
    );
}

/** كارت أسبوع قابل للطي/الفتح — هيدر بتصميم DayCard الذهبي */

export { getDayName };
export default WeekDayRow;
