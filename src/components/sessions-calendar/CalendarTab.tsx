import React, { useState, useEffect } from 'react';
import { db } from '../../supabaseClient';
import { toast } from '../../utils';
import { exportSessionToGoogleCalendar } from '../shared';
import { MONTHS_AR2, DAYS_FULL, WEEK_ORDER, toDateStr } from './constants';
import SessionCard from './SessionCard';
import UpcomingWidget from './UpcomingWidget';

function CalendarTab({ cases, clients, onOpenCase, onOpenStandalone }: any) {
    const today = new Date();
    const [viewYear,  setViewYear]  = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [allSessions, setAllSessions] = useState<any[]>([]);
    const [loading, setLoading]         = useState(true);
    const [selectedDay, setSelectedDay] = useState<number|null>(null);

    const todayStr = toDateStr(today);

    const YEARS = Array.from({ length: 21 }, (_, i) => 2020 + i); // 2020 → 2040

    useEffect(() => {
        setLoading(true);
        const mm   = String(viewMonth+1).padStart(2,'0');
        const last = new Date(viewYear, viewMonth+1, 0).getDate();
        db.from('case_sessions')
          .select('id,session_date,case_id,description,result,next_action,session_time,session_floor,session_hall,title,case_number,court,case_type,plaintiff,plaintiff_national_id,plaintiff_power_of_attorney,defendant,defendant_national_id')
          .gte('session_date', `${viewYear}-${mm}-01`)
          .lte('session_date', `${viewYear}-${mm}-${String(last).padStart(2,'0')}`)
          .then(({ data }: any) => {
              setAllSessions(data || []); setLoading(false); setSelectedDay(null);
          });
    }, [viewYear, viewMonth]);

    const firstDay  = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMon = new Date(viewYear, viewMonth+1, 0).getDate();

    const sessionsMap: Record<string, any[]> = {};
    allSessions.forEach((s: any) => {
        if (!sessionsMap[s.session_date]) sessionsMap[s.session_date] = [];
        sessionsMap[s.session_date].push(s);
    });
    const conflictDays = new Set(Object.keys(sessionsMap).filter(d => sessionsMap[d].length > 1));

    const selectedDateStr = selectedDay
        ? `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`
        : null;
    const daysSessions = selectedDateStr ? (sessionsMap[selectedDateStr]||[]) : [];

    const handleExportToGoogle = (s: any, e: any) => {
        e.stopPropagation();
        const lc = cases.find((c: any) => c.id === s.case_id);
        const lcl = lc ? clients.find((cl: any) => cl.id === lc.client_id) : null;
        exportSessionToGoogleCalendar(s, lc?.title||'جلسة قانونية', lc?.court||'', lcl?.full_name||'');
        toast('🗓 جاري الفتح في Google Calendar...');
    };

    return React.createElement('div', { className: "space-y-2 fade-in" },

        // ── هيدر: فلتر السنة والشهر + أيقونة تقويم ──
        React.createElement('div', { className: "flex items-center gap-2" },
            // dropdown الشهر
            React.createElement('select', {
                value: viewMonth,
                onChange: (e: any) => { setViewMonth(Number(e.target.value)); setSelectedDay(null); },
                className: "flex-1 text-[10px] font-black rounded-xl px-2 py-2 border",
                style: { background: '#0a1220', borderColor: 'rgba(255,255,255,0.1)', color: '#D4AF37' }
            }, MONTHS_AR2.map((m: string, i: number) => React.createElement('option', { key: i, value: i }, m))),
            // dropdown السنة
            React.createElement('select', {
                value: viewYear,
                onChange: (e: any) => { setViewYear(Number(e.target.value)); setSelectedDay(null); },
                className: "text-[10px] font-black rounded-xl px-2 py-2 border",
                style: { background: '#0a1220', borderColor: 'rgba(255,255,255,0.1)', color: '#D4AF37', minWidth: '68px' }
            }, YEARS.map((y: number) => React.createElement('option', { key: y, value: y }, y))),
            // أيقونة الربط بتقويم الهاتف
            React.createElement('button', {
                onClick: () => {
                    db.from('case_sessions').select('id,session_date,case_id,description,result,next_action,title,case_number,court,case_type,plaintiff,defendant')
                      .then(({ data }: any) => {
                          if (!data?.length) { toast('لا توجد جلسات', true); return; }
                          const up = data.filter((s: any) => s.session_date >= todayStr).sort((a: any,b: any) => a.session_date.localeCompare(b.session_date));
                          if (!up.length) { toast('لا توجد جلسات قادمة', true); return; }
                          const lc = cases.find((c: any) => c.id === up[0].case_id);
                          const lcl = lc ? clients.find((cl: any) => cl.id === lc.client_id) : null;
                          exportSessionToGoogleCalendar(up[0], lc?.title||'جلسة', lc?.court||'', lcl?.full_name||'');
                          toast('🗓 تم فتح أقرب جلسة في Google Calendar');
                      });
                },
                title: "أضف أقرب جلسة لتقويم الهاتف",
                className: "w-9 h-9 shrink-0 flex items-center justify-center rounded-xl text-base active:scale-90 transition-all",
                style: { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }
            }, "🗓")
        ),

        // عدد الجلسات
        React.createElement('p', { className: "text-[9px] text-slate-500 px-1" },
            loading ? "جاري التحميل..." : `${allSessions.length} جلسة — ${MONTHS_AR2[viewMonth]} ${viewYear}`
        ),

        // شبكة التقويم
        React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-2xl overflow-hidden shadow-premium-shadow" },
            React.createElement('div', { className: "grid grid-cols-7 border-b border-white/5" },
                DAYS_FULL.map(d => React.createElement('div', { key: d, className: "py-2 text-center text-[8px] font-black text-slate-500" }, d))
            ),
            React.createElement('div', { className: "grid grid-cols-7" },
                Array.from({ length: firstDay }).map((_,i) => React.createElement('div', { key:'e'+i, className:"aspect-square" })),
                Array.from({ length: daysInMon }, (_,i) => i+1).map(d => {
                    const dStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                    const hasSess    = sessionsMap[dStr]?.length > 0;
                    const isConflict = conflictDays.has(dStr);
                    const isToday    = dStr === todayStr;
                    const isSel      = selectedDay === d;
                    return React.createElement('button', {
                        key: d, onClick: () => setSelectedDay(isSel ? null : d),
                        className: `relative aspect-square flex flex-col items-center justify-center gap-0.5 transition-all active:scale-90 ${isSel?'bg-premium-gold/15':'hover:bg-white/5'} ${isConflict?'ring-1 ring-inset ring-red-500/50':''}`
                    },
                        isConflict && React.createElement('div', { className: "absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" }),
                        React.createElement('span', { className: `text-[11px] font-black ${isConflict?'text-red-400':isToday?'text-premium-gold':isSel?'text-premium-gold':'text-slate-300'}` }, d),
                        hasSess && React.createElement('div', { className: "flex gap-0.5 justify-center" },
                            sessionsMap[dStr].slice(0,3).map((_: any,i: number) =>
                                React.createElement('div', { key:i, className:`w-1 h-1 rounded-full ${isConflict?'bg-red-400':'bg-premium-gold'}` })
                            )
                        ),
                        isToday && !hasSess && React.createElement('div', { className: "w-1 h-1 rounded-full bg-premium-gold/50" })
                    );
                })
            )
        ),

        // تفاصيل اليوم المختار
        selectedDay && React.createElement('div', { className: "space-y-2 fade-in" },
            React.createElement('div', { className: "flex items-center gap-2 px-1" },
                React.createElement('span', { className: "w-1 h-3 bg-premium-gold rounded-full" }),
                React.createElement('p', { className: "text-xs font-black text-white" }, `جلسات ${selectedDay} ${MONTHS_AR2[viewMonth]} ${viewYear}`),
                React.createElement('span', { className: "text-[9px] text-slate-500" }, `${daysSessions.length} جلسة`),
                daysSessions.length > 1 && React.createElement('span', {
                    className: "text-[8px] px-1.5 py-0.5 rounded-full font-black",
                    style: { background: 'rgba(239,68,68,0.15)', color: '#f87171' }
                }, "⚠️ تعارض")
            ),
            daysSessions.length === 0
                ? React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-xl p-4 text-center text-slate-500 text-xs" }, "لا توجد جلسات في هذا اليوم")
                : daysSessions.map((s: any) =>
                    React.createElement(SessionCard, { key: s.id, s, cases, clients, onOpenCase, onOpenStandalone, onGoogleExport: handleExportToGoogle })
                )
        )
    );
}

// ══════════════════════════════════════════
//  تبويب الجلسات الفائتة
// ══════════════════════════════════════════

export default CalendarTab;
