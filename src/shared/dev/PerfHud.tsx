// ══════════════════════════════════════════════════════════════
//  PerfHud — أداة تشخيص أداء داخل التطبيق نفسه، بلا كمبيوتر ولا DevTools.
//  (7 سبتمبر 2026 — طلب جيمي: حاسس ببطء بعد خطة تحسين الأداء الكاملة،
//  ومسافر لمدة شهر بلا لابتوب.)
//
//  الفكرة: بدل ما نحتاج Chrome DevTools على كمبيوتر عشان نعرف الوقت
//  راح فين، بنجمع نفس المعلومات من الـPerformance API الموجودة أصلاً
//  جوه المتصفح، ونعرضها في panel صغير جوه التطبيق نفسه — زرار واحد
//  ينسخ تقرير نصي كامل تقدر تلزقه هنا في المحادثة على طول.
//
//  بيقيس 4 حاجات مختلفة (كل واحدة بتستبعد احتمال مختلف):
//  1) Long Tasks — أي حاجة في الـJavaScript قافلة الـmain thread أكتر
//     من 50ms (لو الرقم ده عالي/متكرر → المشكلة لسه في الكود/الرندر).
//  2) Network — توقيت نداءات Supabase الفعلية (لو بطيئة → المشكلة في
//     الشبكة/الاتصال، مش في التطبيق نفسه).
//  3) Paint — FCP/LCP (أول حاجة تتشاف / أكبر حاجة تتشاف) — لو بطيئة
//     رغم إن JS والشبكة سريعين، المشكلة غالبًا رسم/CSS (backdrop-blur،
//     gradients، إلخ) مش React.
//  4) معلومات الاتصال نفسه (navigator.connection) — عشان نفرّق بطء
//     الشبكة الحقيقي عن بطء إحساسي وقت التنقل بين بلاد/شبكات.
//
//  ⚠️ dev-only بالتصميم: بيتفعّل بس لو isAdmin (يعني جيمي)، ومفيش أي
//  تأثير على أداء باقي المستخدمين — الـobservers بتتسجل مرة واحدة بس
//  لما الـpanel يتفتح لأول مرة، ومفيش أي polling إضافي.
// ══════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState } from 'react';

interface LongTaskEntry {
    time: string;
    duration: number;
}

interface NetworkEntry {
    path: string;
    duration: number;
    transferKb: number;
    startedAt: string;
}

interface PaintInfo {
    fcp: number | null;
    lcp: number | null;
}

interface ConnectionInfo {
    effectiveType?: string;
    downlinkMbps?: number;
    rttMs?: number;
    saveData?: boolean;
}

const MAX_ENTRIES = 25;

function getConnectionInfo(): ConnectionInfo {
    // navigator.connection مش معرّفة في TS lib.dom الافتراضية — كاست آمن.
    const nav = navigator as unknown as { connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } };
    const c = nav.connection;
    if (!c) return {};
    return { effectiveType: c.effectiveType, downlinkMbps: c.downlink, rttMs: c.rtt, saveData: c.saveData };
}

function shortenSupabasePath(url: string): string {
    try {
        const u = new URL(url);
        // بنقصّر لمسار + أول query param بس (اسم الجدول/الدالة) — بلا مفاتيح/توكنز.
        return u.pathname.replace('/rest/v1/', '').replace('/functions/v1/', 'fn:').replace('/auth/v1/', 'auth:');
    } catch {
        return url.slice(0, 60);
    }
}

export default function PerfHud() {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [longTasks, setLongTasks] = useState<LongTaskEntry[]>([]);
    const [network, setNetwork] = useState<NetworkEntry[]>([]);
    const [paint, setPaint] = useState<PaintInfo>({ fcp: null, lcp: null });
    const [connection, setConnection] = useState<ConnectionInfo>({});
    const observersStarted = useRef(false);

    // الـobservers بتتسجل مرة واحدة بس (أول ما الـpanel يتفتح)، ومش
    // بتتفك بعد كده — عشان نلقط أي long task يحصل طول الرحلة كلها
    // مش بس وقت الفتح. تكلفتها لما تكون شغالة قليلة جدًا (event-based
    // مش polling).
    useEffect(() => {
        if (!open || observersStarted.current) return;
        observersStarted.current = true;

        try {
            const longTaskObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries().map((e) => ({
                    time: new Date().toLocaleTimeString('ar-EG', { hour12: false }),
                    duration: Math.round(e.duration),
                }));
                setLongTasks((prev) => [...entries, ...prev].slice(0, MAX_ENTRIES));
            });
            longTaskObserver.observe({ type: 'longtask', buffered: true });
        } catch {
            // longtask مش مدعومة على كل المتصفحات (خصوصًا Safari) — تجاهل بهدوء.
        }

        try {
            const paintObserver = new PerformanceObserver((list) => {
                for (const e of list.getEntries()) {
                    if (e.name === 'first-contentful-paint') {
                        setPaint((p) => ({ ...p, fcp: Math.round(e.startTime) }));
                    }
                }
            });
            paintObserver.observe({ type: 'paint', buffered: true });

            const lcpObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const last = entries[entries.length - 1];
                if (last) setPaint((p) => ({ ...p, lcp: Math.round(last.startTime) }));
            });
            lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
        } catch {
            // تجاهل لو مش مدعومة.
        }

        setConnection(getConnectionInfo());
    }, [open]);

    // نداءات الشبكة بتتحدّث كل مرة الـpanel يتفتح (مش observer مستمر —
    // performance.getEntriesByType('resource') بترجع كل حاجة حصلت من
    // أول ما الصفحة اتحمّلت، فبنفلترها لحظة الطلب بس).
    const refreshNetwork = () => {
        const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const relevant = entries
            .filter((e) => e.name.includes('supabase.co'))
            .slice(-MAX_ENTRIES)
            .reverse()
            .map((e) => ({
                path: shortenSupabasePath(e.name),
                duration: Math.round(e.duration),
                transferKb: Math.round((e.transferSize || 0) / 1024 * 10) / 10,
                startedAt: new Date(performance.timeOrigin + e.startTime).toLocaleTimeString('ar-EG', { hour12: false }),
            }));
        setNetwork(relevant);
        setConnection(getConnectionInfo());
    };

    useEffect(() => {
        if (open) refreshNetwork();
    }, [open]);

    const buildReport = (): string => {
        const lines: string[] = [];
        lines.push(`تقرير أداء Sanad — ${new Date().toLocaleString('ar-EG')}`);
        lines.push('');
        lines.push(`الاتصال: ${connection.effectiveType || '?'} | downlink=${connection.downlinkMbps ?? '?'}Mbps | rtt=${connection.rttMs ?? '?'}ms | saveData=${connection.saveData ?? '?'}`);
        lines.push('');
        lines.push(`Paint: FCP=${paint.fcp ?? '—'}ms | LCP=${paint.lcp ?? '—'}ms`);
        lines.push('');
        lines.push(`Long Tasks (آخر ${longTasks.length}, أكتر من 50ms بتقفل الشاشة):`);
        if (longTasks.length === 0) lines.push('  (مفيش لسه — استخدم التطبيق شوية والـpanel مفتوح، بعدين ارجع افتحه)');
        longTasks.forEach((t) => lines.push(`  ${t.time} — ${t.duration}ms`));
        lines.push('');
        lines.push(`Network إلى Supabase (آخر ${network.length}):`);
        if (network.length === 0) lines.push('  (مفيش نداءات اتسجلت — اعمل رفريش للـpanel بعد ما تستخدم التطبيق)');
        network.forEach((n) => lines.push(`  ${n.startedAt} — ${n.duration}ms — ${n.transferKb}KB — ${n.path}`));
        return lines.join('\n');
    };

    const handleCopy = async () => {
        refreshNetwork();
        const report = buildReport();
        try {
            await navigator.clipboard.writeText(report);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // clipboard API ممكن ترفض لو مش HTTPS/permission — fallback بسيط.
            window.prompt('انسخ التقرير ده يدويًا:', report);
        }
    };

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                data-testid="perf-hud-toggle"
                style={{
                    position: 'fixed', bottom: 90, insetInlineStart: 12, zIndex: 999,
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)', color: '#d4af37',
                    border: '1px solid rgba(212,175,55,0.4)', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                aria-label="أداة تشخيص الأداء"
            >
                ⚡
            </button>
        );
    }

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.85)',
                color: '#e5e5e5', fontSize: 11, fontFamily: 'monospace',
                overflowY: 'auto', padding: 14, direction: 'ltr', textAlign: 'left',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <strong style={{ color: '#d4af37' }}>⚡ Perf HUD</strong>
                <button type="button" onClick={() => setOpen(false)} style={{ color: '#e5e5e5', background: 'none', border: '1px solid #555', borderRadius: 6, padding: '2px 10px' }}>✕ إغلاق</button>
            </div>

            <div style={{ marginBottom: 10, padding: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
                <div>connection: {connection.effectiveType || '?'} | downlink: {connection.downlinkMbps ?? '?'}Mbps | rtt: {connection.rttMs ?? '?'}ms | saveData: {String(connection.saveData ?? '?')}</div>
                <div>paint: FCP={paint.fcp ?? '—'}ms | LCP={paint.lcp ?? '—'}ms</div>
            </div>

            <div style={{ marginBottom: 10 }}>
                <div style={{ color: '#d4af37', marginBottom: 4 }}>Long Tasks ({longTasks.length}):</div>
                {longTasks.length === 0 && <div style={{ opacity: 0.6 }}>مفيش لسه — استخدم التطبيق والـpanel مفتوح</div>}
                {longTasks.map((t, i) => (
                    <div key={i} style={{ color: t.duration > 200 ? '#f87171' : t.duration > 100 ? '#fbbf24' : '#e5e5e5' }}>
                        {t.time} — {t.duration}ms
                    </div>
                ))}
            </div>

            <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ color: '#d4af37' }}>Network → Supabase ({network.length}):</span>
                    <button type="button" onClick={refreshNetwork} style={{ color: '#e5e5e5', background: 'none', border: '1px solid #555', borderRadius: 6, padding: '1px 8px', fontSize: 10 }}>↻ رفريش</button>
                </div>
                {network.length === 0 && <div style={{ opacity: 0.6 }}>مفيش نداءات اتسجلت — اعمل رفريش بعد الاستخدام</div>}
                {network.map((n, i) => (
                    <div key={i} style={{ color: n.duration > 1000 ? '#f87171' : n.duration > 400 ? '#fbbf24' : '#e5e5e5' }}>
                        {n.startedAt} — {n.duration}ms — {n.transferKb}KB — {n.path}
                    </div>
                ))}
            </div>

            <button
                type="button"
                onClick={handleCopy}
                data-testid="perf-hud-copy"
                style={{
                    width: '100%', padding: 12, borderRadius: 10, border: 'none',
                    background: copied ? '#22c55e' : '#d4af37', color: '#000', fontWeight: 700,
                }}
            >
                {copied ? '✓ اتنسخ' : '📋 انسخ التقرير كامل'}
            </button>
        </div>
    );
}
