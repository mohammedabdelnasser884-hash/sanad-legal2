// ══════════════════════════════════════════════════════════════
// 🧪 Overlay مؤقت — المرحلة 0 من خطة تحسين الأداء. يعرض جدول renders
// حي على الشاشة نفسها بدل flame graph (بديل لعدم توفر React DevTools
// من الموبايل). اتشيل بعد إغلاق المرحلة 0.
// ══════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import { getRecords, subscribe, clearRecords, setPaused, isPaused, type PerfRenderRecord } from './perfProbe';

const PANEL_W = 320;

interface Summary {
    id: string;
    count: number;
    avg: number;
    last: number;
    lastPhase: string;
}

function summarize(recs: PerfRenderRecord[]): Summary[] {
    const map = new Map<string, { count: number; total: number; last: number; lastPhase: string }>();
    recs.forEach((r) => {
        const cur = map.get(r.id) || { count: 0, total: 0, last: 0, lastPhase: r.phase };
        cur.count += 1;
        cur.total += r.actualDuration;
        cur.last = r.actualDuration;
        cur.lastPhase = r.phase;
        map.set(r.id, cur);
    });
    return Array.from(map.entries()).map(([id, v]) => ({
        id,
        count: v.count,
        avg: v.total / v.count,
        last: v.last,
        lastPhase: v.lastPhase,
    }));
}

const btnStyle: React.CSSProperties = {
    fontSize: 10,
    padding: '3px 6px',
    background: '#1c1c1c',
    color: '#e5e5e5',
    border: '1px solid #333',
    borderRadius: 6,
};

export default function PerfOverlay() {
    const [open, setOpen] = useState(false);
    const [, forceTick] = useState(0);
    const [pausedLocal, setPausedLocal] = useState(isPaused());

    useEffect(() => subscribe(() => forceTick((n) => n + 1)), []);

    const records = getRecords();
    const summary = summarize(records);
    const log = records.slice(-40).reverse();

    const togglePause = () => {
        const next = !pausedLocal;
        setPaused(next);
        setPausedLocal(next);
    };

    const copySummary = () => {
        const text = summary
            .map((s) => `${s.id}: ×${s.count} · آخر ${s.last.toFixed(1)}ms · متوسط ${s.avg.toFixed(1)}ms · آخر نوع ${s.lastPhase}`)
            .join('\n');
        try {
            navigator.clipboard?.writeText(text);
        } catch {
            /* تجاهل — الأداة مؤقتة، الفشل هنا مش مهم */
        }
    };

    return (
        <div style={{ position: 'fixed', bottom: 90, left: 12, zIndex: 99999, fontFamily: 'sans-serif', direction: 'rtl' }}>
            <button
                onClick={() => setOpen((o) => !o)}
                style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: '#111',
                    color: '#0f0',
                    border: '2px solid #0f0',
                    fontSize: 18,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                }}
            >
                ⏱️
            </button>

            {open && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 52,
                        left: 0,
                        width: PANEL_W,
                        maxHeight: 420,
                        background: '#0d0d0d',
                        color: '#e5e5e5',
                        borderRadius: 10,
                        border: '1px solid #333',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid #333', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <strong style={{ fontSize: 12 }}>مراقب الـrenders (مؤقت)</strong>
                        <div style={{ display: 'flex', gap: 6, marginInlineStart: 'auto' }}>
                            <button onClick={togglePause} style={btnStyle}>
                                {pausedLocal ? '▶️ استئناف' : '⏸️ إيقاف'}
                            </button>
                            <button onClick={clearRecords} style={btnStyle}>
                                🗑️ مسح
                            </button>
                            <button onClick={copySummary} style={btnStyle}>
                                📋 نسخ
                            </button>
                        </div>
                    </div>

                    <div style={{ padding: 8, overflowY: 'auto', maxHeight: 140, borderBottom: '1px solid #333' }}>
                        {summary.length === 0 && <div style={{ fontSize: 11, opacity: 0.6 }}>لسه مفيش بيانات — ابدأ تفاعل مع التطبيق (بحث، فتح مودال، تنقّل بين التابات)</div>}
                        {summary.map((s) => (
                            <div key={s.id} style={{ fontSize: 11, marginBottom: 4, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                                <span>{s.id}</span>
                                <span style={{ opacity: 0.8 }}>
                                    ×{s.count} · آخر {s.last.toFixed(1)}ms · متوسط {s.avg.toFixed(1)}ms
                                </span>
                            </div>
                        ))}
                    </div>

                    <div style={{ padding: 8, overflowY: 'auto', flex: 1, fontSize: 10, lineHeight: 1.5 }}>
                        {log.map((r, i) => (
                            <div key={i} style={{ opacity: r.phase === 'self' ? 1 : 0.75, color: r.phase === 'self' ? '#f0c040' : '#e5e5e5' }}>
                                [{new Date(r.ts).toLocaleTimeString('ar-EG')}] {r.id} — {r.phase}
                                {r.phase !== 'self' && ` — ${r.actualDuration.toFixed(1)}ms`}
                                {r.note ? ` (${r.note})` : ''}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
