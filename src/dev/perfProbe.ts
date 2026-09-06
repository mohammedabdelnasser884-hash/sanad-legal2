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
// ⚠️ الأداة دي بالكامل مؤقتة وهتتشال بعد إغلاق المرحلة 0. الزرار
// العائم (⏱️) بيظهر دايمًا تلقائي — مفيش أي رابط أو flag محتاج تفعيله،
// عشان تفادي مشكلة الـURL bar بتاع المتصفح على الموبايل (بيدّي وهم
// "بيحولني" لما التطبيق يعمل history.replaceState('/') عند التحميل).
// ══════════════════════════════════════════════════════════════

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

export function setPaused(v: boolean) {
    paused = v;
}
export function isPaused() {
    return paused;
}

/** توقيع React.Profiler's onRender بالظبط — تُمرَّر مباشرة كـonRender. */
export function onRenderPerf(id: string, phase: PerfPhase, actualDuration: number, baseDuration: number) {
    if (paused) return;
    records.push({ id, phase, actualDuration, baseDuration, ts: Date.now() });
    if (records.length > MAX_RECORDS) records = records.slice(-MAX_RECORDS);
    notify();
}

/** علامة يدوية لسبب مش React.Profiler قادر يميّزه لوحده (زي self-render
 * جاي من setState داخل hook مستقل). */
export function logMark(id: string, note: string) {
    if (paused) return;
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
