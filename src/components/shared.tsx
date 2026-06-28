import React from 'react';

// ── Shared Input Component ──
export const Inp = ({ label, type = "text", value, onChange, placeholder, required }: {
    label?: string; type?: string; value: string; onChange: (e: any) => void;
    placeholder?: string; required?: boolean;
}) =>
    React.createElement('div', null,
        label && React.createElement('label', { className: "block text-[10px] font-bold text-slate-400 mb-1.5" },
            label,
            required && React.createElement('span', { className: "text-rose-400 mr-1" }, "*")
        ),
        React.createElement('input', {
            type, value, onChange, placeholder,
            className: "w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 transition-colors",
            style: { fontFamily: 'Cairo,sans-serif' }
        })
    );

// ── Shared Select Component ──
export const Sel = ({ label, value, onChange, options }: {
    label?: string; value: string; onChange: (e: any) => void;
    options: Array<{ value: string; label: string } | string>;
}) =>
    React.createElement('div', null,
        label && React.createElement('label', { className: "block text-[10px] font-bold text-slate-400 mb-1.5" }, label),
        React.createElement('select', {
            value, onChange,
            className: "w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white transition-colors",
            style: { fontFamily: 'Cairo,sans-serif' }
        },
            (options as any[]).map((o: any) => React.createElement('option', { key: o.value ?? o, value: o.value ?? o }, o.label ?? o))
        )
    );

// ── Calendar Utilities ──
export function dateToICal(dateStr: string) {
    return dateStr ? dateStr.replace(/-/g, '') : '';
}

export function dateToGCal(dateStr: string) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
}

export function exportSessionToGoogleCalendar(session: any, caseTitle: string, courtName: string, clientName: string) {
    const title = encodeURIComponent(`جلسة: ${caseTitle}`);
    const details = encodeURIComponent(`موكل: ${clientName}\nمحكمة: ${courtName}`);
    const location = encodeURIComponent(courtName || '');
    const dates = encodeURIComponent(dateToGCal(session.session_date));
    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}/${dates}&details=${details}&location=${location}`, '_blank');
}

export function generateICalBlob(sessions: any[], cases: any[], clients: any[]) {
    const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SANAD//Legal OS//AR'];
    sessions.forEach(s => {
        const linkedCase = cases.find((c: any) => c.id === s.case_id);
        const linkedClient = linkedCase ? clients.find((cl: any) => cl.id === linkedCase.client_id) : null;
        const summary = linkedCase ? `جلسة: ${linkedCase.title}` : 'جلسة قانونية';
        lines.push('BEGIN:VEVENT', `DTSTART:${dateToICal(s.session_date)}`, `DTEND:${dateToICal(s.session_date)}`,
            `SUMMARY:${summary}`, `DESCRIPTION:${linkedClient?.name || ''}`, `LOCATION:${s.court || ''}`,
            `DTSTAMP:${now}`, `UID:session-${s.id}@sanadlegalos`, 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return new Blob([lines.join('\r\n')], { type: 'text/calendar' });
}

export function downloadICal(sessions: any[], cases: any[], clients: any[], filename: string) {
    const blob = generateICalBlob(sessions, cases, clients);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'sessions.ics'; a.click();
    URL.revokeObjectURL(url);
}

export const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
export const DAYS_AR   = ["أح","إث","ث","أر","خ","ج","س"];

// ── سطر الأطراف: المدعي ضد المدعى عليه (مع تباعد و"ضد" بلون مميز) ──
export function PartiesLine({ plaintiff, defendant, fallback, className = '' }: any) {
    if (plaintiff && defendant) {
        return React.createElement('p', { className: `truncate leading-tight ${className}` },
            React.createElement('span', null, plaintiff),
            React.createElement('span', { className: 'mx-1.5 font-black', style: { color: '#a78bfa' } }, 'ضد'),
            React.createElement('span', null, defendant)
        );
    }
    return React.createElement('p', { className: `truncate leading-tight ${className}` }, plaintiff || defendant || fallback);
}
