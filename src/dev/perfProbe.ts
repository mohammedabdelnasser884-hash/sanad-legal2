// ══════════════════════════════════════════════════════════════
// 🧪 أداة قياس مؤقتة — المرحلة 0 من خطة تحسين الأداء
// (docs/plans/Sanad_Performance_Improvement_Plan.md)
//
// بديل عن React DevTools Profiler لأن التنفيذ بيتم من الموبايل بدون
// جهاز يدعم إضافات المتصفح. بتسجّل كل render لمكونات محددة (Header/
// DashboardTab/CasesTab/ClientsTab) عبر React.Profiler الرسمي، بالإضافة
// لعلامات يدوية (logMark) بتفرّق re-render الجاي من الأب عن re-render
// ذاتي من hook داخلي زي useSessionsPartiesMap.
//
// ⚠️ الأداة دي بالكامل مؤقتة وهتتشال بعد إغلاق المرحلة 0. مقفولة
// بالكامل افتراضيًا (صفر تأثير على أي مستخدم) — بتتفعّل بس عن طريق
// ?perf=1 في الرابط (بتتخزن في localStorage لحد ما تتقفل بـ?perf=0).
// ══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'sanad_perf_overlay';
const MAX_RECORDS = 400;

export type PerfPhase = 'mount' | 'update' | 'nested-update' | 'self';

export interface PerfRenderRecord {
    id: string;
    phase: PerfPhase;
    actualDuration: number;
    baseDuration: number;
    ts: number;
    note?: string;
}

let records: PerfRenderRecord[] = [];
let listeners: Array<() => void> = [];
let paused = false;

function notify() {
    listeners.forEach((l) => l());
}

/** بيتأكد هل الأوفرلاي مفعّل (عبر ?perf=1/0 في الرابط أو localStorage). */
export function isPerfOverlayEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.has('perf')) {
            const v = params.get('perf');
            if (v === '0') {
                window.localStorage.removeItem(STORAGE_KEY);
                return false;
            }
            if (v === '1') {
                window.localStorage.setItem(STORAGE_KEY, '1');
                return true;
            }
        }
        return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

export function setPaused(v: boolean) {
    paused = v;
}
export function isPaused() {
    return paused;
}

/** توقيع React.Profiler's onRender بالظبط — تُمرَّر مباشرة كـonRender. */
export function onRenderPerf(id: string, phase: PerfPhase, actualDuration: number, baseDuration: number) {
    if (paused || !isPerfOverlayEnabled()) return;
    records.push({ id, phase, actualDuration, baseDuration, ts: Date.now() });
    if (records.length > MAX_RECORDS) records = records.slice(-MAX_RECORDS);
    notify();
}

/** علامة يدوية لسبب مش React.Profiler قادر يميّزه لوحده (زي self-render
 * جاي من setState داخل hook مستقل). */
export function logMark(id: string, note: string) {
    if (paused || !isPerfOverlayEnabled()) return;
    records.push({ id, phase: 'self', actualDuration: 0, baseDuration: 0, ts: Date.now(), note });
    if (records.length > MAX_RECORDS) records = records.slice(-MAX_RECORDS);
    notify();
}

export function getRecords(): PerfRenderRecord[] {
    return records;
}

export function clearRecords() {
    records = [];
    notify();
}

export function subscribe(listener: () => void): () => void {
    listeners.push(listener);
    return () => {
        listeners = listeners.filter((l) => l !== listener);
    };
}
