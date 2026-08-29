import React, { useState, useRef, useEffect, useCallback } from 'react';
import { db } from '../../supabaseClient';
import { ilikeOrClause } from '../lib/sanitize';
import { mapCaseRow, fetchPartiesMapByCaseIds, type MappedCase } from '../../hooks/useAppData';
import type { CaseRow } from '../../types';

// ══════════════════════════════════════════════════════════════
// CaseSearchSelect — دروب-داون قضية ببحث حي في الداتابيز مباشرة، بنفس
// بنية ClientSearchSelect.tsx بالحرف (نفس نمط الـopen/term/debounce/
// results). الفرق الجوهري عن أي فلتر JS محلي: النتايج جاية من
// db.from('cases') مباشرة، مش من مصفوفة `cases` المُصفَّحة (paginated،
// PAGE_SIZE=15) الواصلة كـ prop لـ FeesTab — فبحث عن قضية برة الصفحة
// المحمّلة حاليًا بيرجّعها عادي زي أي قضية تانية (نفس فئة مشكلة
// "Array.find() على مصفوفة مُصفَّحة" اللي اتصلحت قبل كده في
// useAppData.ts/useCaseActions.ts عن طريق extraCases/ensureCasesLoaded).
//
// ⚠️ خلافًا لـClientSearchSelect، مفيش "manualOption" هنا — القضية
// لازم تتختار من نتيجة حقيقية، مفيش نص حر ممكن.
//
// ⚠️ النتيجة المرجعة (onSelect) شكلها MappedCase كامل (مش id/title بس)
// عشان resolveCaseFeeClient يقدر يشتغل فورًا لحظة الاختيار من غير ما
// يستنى تحميل/مطابقة تانية للقضية من مكان تاني — بنعيد استخدام
// mapCaseRow/fetchPartiesMapByCaseIds المُصدَّرين من useAppData.ts
// (نفس منطق التطبيع بالحرف المستخدم في fetchCases/searchCases هناك)
// بدل ما نبني نسخة تانية من نفس المنطق هنا.
// ══════════════════════════════════════════════════════════════

interface CaseSearchSelectProps {
    label?: string;
    // عنوان القضية المختارة حاليًا (لو موجودة) — الأب مسؤول عن حسابه.
    selectedLabel: string;
    onSelect: (c: MappedCase) => void;
    placeholder?: string;
    testId?: string;
    required?: boolean;
}

export function CaseSearchSelect({
    label, selectedLabel, onSelect, placeholder, testId, required,
}: CaseSearchSelectProps) {
    const [open, setOpen] = useState(false);
    const [term, setTerm] = useState('');
    const [results, setResults] = useState<MappedCase[]>([]);
    const [searching, setSearching] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const onClickOutside = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    const runSearch = useCallback(async (q: string) => {
        setSearching(true);
        try {
            let query = db.from('cases')
                .select('*')
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(15);
            if (q.trim()) {
                const s = q.trim();
                // نفس حقول البحث المستخدمة في searchCases (useAppData.ts):
                // عنوان الدعوى + رقم الدعوى الرسمي.
                query = query.or([ilikeOrClause('title', s), ilikeOrClause('case_number_official', s)].join(','));
            }
            const { data, error } = await query;
            if (!error) {
                const rows = (data || []) as CaseRow[];
                const caseIds = rows.map((r) => r.id);
                // مفيش داعي لخريطة أقرب جلسة هنا (مش معروضة في نتائج
                // البحث دي) — sessionsMap فاضية، partiesMap فعلية عشان
                // resolveCaseFeeClient يحتاجها.
                const partiesMap = await fetchPartiesMapByCaseIds(caseIds);
                setResults(rows.map((r) => mapCaseRow(r, {}, partiesMap)));
            }
        } finally {
            setSearching(false);
        }
    }, []);

    // ── أول ما القايمة تتفتح، اعرض أحدث 15 قضية فورًا قبل ما المستخدم يكتب ──
    const handleFocus = () => {
        setOpen(true);
        if (results.length === 0 && !term) runSearch('');
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setTerm(v);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => runSearch(v), 300);
    };

    const pick = (c: MappedCase) => {
        onSelect(c);
        setTerm('');
        setOpen(false);
    };

    const displayValue = open ? term : selectedLabel;

    return React.createElement('div', { className: 'relative', ref: rootRef },
        label && React.createElement('label', { className: 'block text-[10px] font-bold text-slate-400 mb-1.5' },
            label,
            required && React.createElement('span', { className: 'text-rose-400 mr-1' }, '*')
        ),
        React.createElement('input', {
            type: 'text',
            value: displayValue,
            onFocus: handleFocus,
            onChange: handleChange,
            placeholder: placeholder || 'ابحث بعنوان القضية أو رقمها...',
            'data-testid': testId,
            className: 'w-full p-2.5 text-xs rounded-xl border border-white/10 bg-black/30 text-white placeholder-slate-600',
            style: { fontFamily: 'Cairo,sans-serif', colorScheme: 'dark' },
            autoComplete: 'off',
        }),
        open && React.createElement('div', {
            className: 'absolute z-[80] mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-premium-bg shadow-2xl',
        },
            searching && React.createElement('div', { className: 'p-3 text-[10px] text-slate-500 text-center' }, 'جاري البحث...'),
            !searching && results.length === 0 && React.createElement('div', { className: 'p-3 text-[10px] text-slate-500 text-center' }, 'لا توجد نتائج'),
            !searching && results.map((c) => React.createElement('button', {
                key: c.id,
                type: 'button',
                'data-testid': testId ? `${testId}-option` : undefined,
                onClick: () => pick(c),
                className: 'w-full text-right p-2.5 text-xs text-white hover:bg-white/5 active:bg-white/10 border-b border-white/5 last:border-b-0',
                style: { fontFamily: 'Cairo,sans-serif' },
            }, c.title || '—', c.number && c.number !== '—' && React.createElement('span', { className: 'text-slate-500 text-[10px] mr-2' }, '# ' + c.number)))
        )
    );
}

export default CaseSearchSelect;
