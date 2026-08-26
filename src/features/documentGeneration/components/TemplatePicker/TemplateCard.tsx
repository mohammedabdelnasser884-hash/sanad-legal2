// ══════════════════════════════════════════════════════════════════
// TemplateCard.tsx — القسم 9.1 بند 3
// ══════════════════════════════════════════════════════════════════

import React from 'react';
import type { DocumentTemplate } from '../../types';

const CATEGORY_BADGE_STYLE: Record<string, string> = {
  'إنذارات':    'bg-rose-500/15 text-rose-300',
  'عرائض':      'bg-amber-500/15 text-amber-300',
  'طلبات':      'bg-emerald-500/15 text-emerald-300',
  'إعلانات':    'bg-purple-500/15 text-purple-300',
  'أشكال':      'bg-cyan-500/15 text-cyan-300',
  'تظلمات':     'bg-orange-500/15 text-orange-300',
  'جنح مباشرة': 'bg-red-500/15 text-red-300',
  'عقود':       'bg-indigo-500/15 text-indigo-300',
};

interface TemplateCardProps {
  template: DocumentTemplate;
  onClick: () => void;
}

export default function TemplateCard({ template, onClick }: TemplateCardProps) {
  const badgeStyle = CATEGORY_BADGE_STYLE[template.category] ?? 'bg-white/10 text-slate-300';
  return (
    <button
      data-testid={`doc-gen-template-card-${template.id}`}
      onClick={onClick}
      className="text-right p-4 rounded-2xl bg-premium-card border border-white/10 hover:border-purple-500/30 transition-all active:scale-[0.98] flex flex-col gap-2"
    >
      <span className={`self-start px-2 py-0.5 rounded-full text-[9px] font-black ${badgeStyle}`}>
        {template.category}
      </span>
      <span className="text-xs font-black text-white leading-snug">{template.name_ar}</span>
      {template.description && (
        <span className="text-[10px] text-slate-500 truncate">{template.description}</span>
      )}
    </button>
  );
}
