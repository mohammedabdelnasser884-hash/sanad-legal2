// ══════════════════════════════════════════════════════════════════
// SourceModeSelector.tsx — القسم 9.2
//
// ⚠️ [اكتشاف أثناء المرحلة 3] القسم 9.2 افترض وجود "مكوّن بحث/اختيار
// قضية... مستخدم في أي مكان تاني بسند بيربط بقضية — إعادة استخدام".
// فحصت الكود: أقرب مكوّن كان `linkMode:'existing'` جوه
// NewStandaloneSessionModal.tsx، لكنه اتشال بالكامل في خطة "إلغاء
// ربط/إنشاء موكل من الجلسة المستقلة" (9 أغسطس 2026، موثّق في
// areas/sanad.md). مفيش مكوّن بحث-عن-قضية قائم فعليًا نقدر نعيد استخدامه.
// بدل ما نخترع مكوّن UI أساسي جديد (ممنوع بقرار #4)، اتبنى بحث بسيط
// inline هنا بـ<input> عادي + استعلام مباشر على جدول cases (فلترة
// deleted_at IS NULL + tenant عبر RLS تلقائيًا) — مش مكوّن مشترك جديد،
// جزء داخلي من هذه الشاشة بس. يحتاج مراجعتك.
// ══════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { I } from '../../../constants';
import { db } from '../../../supabaseClient';
import type { SourceMode } from '../types';

interface CaseSearchResult {
  id: string;
  title: string | null;
  case_number_official: string | null;
}

interface SourceModeSelectorProps {
  onSelectMode: (mode: SourceMode, caseId: string | null) => void;
  onBack: () => void;
}

const OPTIONS: Array<{ mode: SourceMode; icon: keyof typeof I; title: string; desc: string; testId: string }> = [
  { mode: 'case_bound', icon: 'Folder', title: 'من قضية مفتوحة', desc: 'تعبئة تلقائية من بيانات قضية موجودة', testId: 'doc-gen-source-mode-case' },
  { mode: 'manual',     icon: 'Edit',   title: 'إدخال يدوي',      desc: 'تعبئة البيانات يدوياً بدون قضية',     testId: 'doc-gen-source-mode-manual' },
  { mode: 'blank',      icon: 'Doc',    title: 'نموذج فاضي',      desc: 'للطباعة والتعبئة بخط اليد',           testId: 'doc-gen-source-mode-blank' },
];

export default function SourceModeSelector({ onSelectMode, onBack }: SourceModeSelectorProps) {
  const [pickingCase, setPickingCase] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CaseSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!pickingCase) return;
    const q = search.trim();
    if (q === '') { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      db.from('cases')
        .select('id, title, case_number_official')
        .is('deleted_at', null)
        .or(`title.ilike.%${q}%,case_number_official.ilike.%${q}%`)
        .limit(15)
        .then(({ data }) => { if (!cancelled) setResults((data ?? []) as CaseSearchResult[]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, pickingCase]);

  const handleSelect = (mode: SourceMode) => {
    if (mode === 'case_bound') {
      setPickingCase(true);
      return;
    }
    onSelectMode(mode, null);
  };

  if (pickingCase) {
    return (
      <div className="space-y-3">
        <button
          data-testid="doc-gen-back-btn"
          onClick={() => setPickingCase(false)}
          className="flex items-center gap-1 text-slate-400 text-xs font-bold"
        >
          <I.ChevronRight className="w-4 h-4" /> رجوع
        </button>
        <input
          data-testid="doc-gen-case-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث برقم القضية أو اسمها..."
          className="w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600"
          style={{ fontFamily: 'Cairo,sans-serif' }}
          autoFocus
        />
        {searching && <div className="text-[10px] text-slate-500 text-center py-4">جارِ البحث...</div>}
        {!searching && search.trim() !== '' && results.length === 0 && (
          <div className="text-[10px] text-slate-500 text-center py-4">مفيش قضايا مطابقة</div>
        )}
        <div className="space-y-2">
          {results.map((c) => (
            <button
              key={c.id}
              data-testid={`doc-gen-case-result-${c.id}`}
              onClick={() => onSelectMode('case_bound', c.id)}
              className="w-full text-right p-3 rounded-xl bg-premium-card border border-white/10 hover:border-purple-500/30 transition-all"
            >
              <div className="text-xs font-black text-white">{c.title || '—'}</div>
              <div className="text-[10px] text-slate-500">{c.case_number_official || '—'}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        data-testid="doc-gen-back-btn"
        onClick={onBack}
        className="flex items-center gap-1 text-slate-400 text-xs font-bold"
      >
        <I.ChevronRight className="w-4 h-4" /> رجوع
      </button>
      <div className="flex flex-col sm:flex-row gap-3">
        {OPTIONS.map((opt) => {
          const Icon = I[opt.icon] as (props: { className?: string }) => JSX.Element;
          return (
            <button
              key={opt.mode}
              data-testid={opt.testId}
              onClick={() => handleSelect(opt.mode)}
              className="flex-1 p-4 rounded-2xl bg-premium-card border border-white/10 hover:border-purple-500/30 transition-all active:scale-[0.98] flex flex-col items-center gap-2 text-center"
            >
              <Icon className="w-6 h-6 text-purple-400" />
              <span className="text-xs font-black text-white">{opt.title}</span>
              <span className="text-[10px] text-slate-500">{opt.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
