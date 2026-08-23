// ══════════════════════════════════════════════════════════════════
// DynamicFieldsForm.tsx — القسم 9.3
// ══════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { I } from '../../../constants';
import { Inp } from '@/shared/ui/Inp';
import DatePicker from '@/shared/ui/DatePicker';
import { db } from '../../../supabaseClient';
import type { TemplateField, ResolvedBindings, SourceMode } from '../types';

interface PartyOption { id: string; name: string | null }

interface DynamicFieldsFormProps {
  templateName: string;
  fields: TemplateField[];
  values: ResolvedBindings;
  setValue: (fieldKey: string, value: string | number | null) => void;
  loadingFields: boolean;
  loadError: string | null;
  missingRequiredFieldLabels: string[];
  isValid: boolean;
  generating: boolean;
  generateError: string | null;
  sourceMode: SourceMode;
  caseId: string | null;
  onSubmit: () => void;
  onBack: () => void;
}

export default function DynamicFieldsForm({
  templateName, fields, values, setValue, loadingFields, loadError,
  missingRequiredFieldLabels, isValid, generating, generateError,
  sourceMode, caseId, onSubmit, onBack,
}: DynamicFieldsFormProps) {
  const [touched, setTouched] = useState(false);
  const [partyOptions, setPartyOptions] = useState<PartyOption[]>([]);

  useEffect(() => {
    if (sourceMode !== 'case_bound' || !caseId) { setPartyOptions([]); return; }
    db.from('case_parties').select('id, name').eq('case_id', caseId)
      .then(({ data }) => setPartyOptions((data ?? []) as PartyOption[]));
  }, [sourceMode, caseId]);

  const isAutoFilled = (field: TemplateField) => field.binding_source !== null && sourceMode === 'case_bound';

  const handleSubmit = () => {
    setTouched(true);
    if (!isValid) return;
    onSubmit();
  };

  if (loadingFields) {
    return <div className="py-10 text-center text-xs text-slate-500">جارِ تحميل الحقول...</div>;
  }
  if (loadError) {
    return <div className="py-10 text-center text-xs text-rose-400 font-bold">{loadError}</div>;
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} data-testid="doc-gen-back-btn" className="flex items-center gap-1 text-slate-400 text-xs font-bold">
        <I.ChevronRight className="w-4 h-4" /> رجوع
      </button>
      <div>
        <h3 className="text-sm font-black text-white">{templateName}</h3>
        <p className="text-[10px] text-slate-500 mt-1">الخطوة 2 من 3</p>
      </div>

      <div className="space-y-3">
        {[...fields].sort((a, b) => a.sort_order - b.sort_order).map((field) => {
          const value = values[field.field_key];
          const showError = touched && field.is_required && (value === null || value === undefined || value === '');
          const autoFilled = isAutoFilled(field);
          const wrapperClass = autoFilled ? 'bg-purple-500/5 rounded-xl p-1' : '';
          const autoBadge = autoFilled && (
            <span className="text-[8px] text-purple-400 font-black mr-1">auto</span>
          );

          if (field.field_type === 'textarea') {
            return (
              <div key={field.id} className={wrapperClass}>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5">
                  {field.label_ar}{field.is_required && <span className="text-rose-400 mr-1">*</span>}{autoBadge}
                </label>
                <textarea
                  data-testid={`doc-gen-field-${field.field_key}`}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(e) => setValue(field.field_key, e.target.value)}
                  rows={4}
                  className={`w-full p-3 text-xs rounded-xl border bg-premium-bg text-white placeholder-slate-600 transition-colors ${showError ? 'border-rose-500/60' : 'border-white/10'}`}
                  style={{ fontFamily: 'Cairo,sans-serif' }}
                />
              </div>
            );
          }

          if (field.field_type === 'date') {
            return (
              <div key={field.id} className={wrapperClass}>
                <DatePicker
                  label={autoFilled ? `${field.label_ar} (تلقائي)` : field.label_ar}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(v) => setValue(field.field_key, v)}
                  required={field.is_required}
                  testId={`doc-gen-field-${field.field_key}`}
                />
              </div>
            );
          }

          if (field.field_type === 'party_ref') {
            const disabled = sourceMode !== 'case_bound';
            return (
              <div key={field.id} className={wrapperClass}>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5">
                  {field.label_ar}{field.is_required && <span className="text-rose-400 mr-1">*</span>}{autoBadge}
                </label>
                <select
                  data-testid={`doc-gen-field-${field.field_key}`}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(e) => setValue(field.field_key, e.target.value)}
                  disabled={disabled}
                  className={`w-full p-3 text-xs rounded-xl border bg-premium-bg text-white transition-colors disabled:opacity-40 ${showError ? 'border-rose-500/60' : 'border-white/10'}`}
                  style={{ fontFamily: 'Cairo,sans-serif' }}
                >
                  <option value="">— اختر —</option>
                  {partyOptions.map((p) => (
                    <option key={p.id} value={p.name ?? ''}>{p.name ?? '—'}</option>
                  ))}
                </select>
              </div>
            );
          }

          return (
            <div key={field.id} className={wrapperClass}>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5">
                {field.label_ar}{field.is_required && <span className="text-rose-400 mr-1">*</span>}{autoBadge}
              </label>
              <Inp
                required={field.is_required}
                type={field.field_type === 'number' ? 'number' : 'text'}
                value={value !== null && value !== undefined ? String(value) : ''}
                onChange={(e) => setValue(field.field_key, field.field_type === 'number' ? Number(e.target.value) : e.target.value)}
                data-testid={`doc-gen-field-${field.field_key}`}
                className={`w-full p-3 text-xs rounded-xl border bg-premium-bg text-white placeholder-slate-600 transition-colors ${showError ? 'border-rose-500/60' : 'border-white/10'}`}
              />
            </div>
          );
        })}
      </div>

      {touched && !isValid && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-300">
          تعذّر توليد المستند، تحقق من البيانات المطلوبة: {missingRequiredFieldLabels.join('، ')}
        </div>
      )}
      {generateError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-300">
          {generateError}
        </div>
      )}

      <button
        data-testid="doc-gen-submit-btn"
        onClick={handleSubmit}
        disabled={(touched && !isValid) || generating}
        className="w-full py-3.5 rounded-xl text-xs font-black text-premium-bg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: 'linear-gradient(135deg,#d4af37,#f0c040)' }}
      >
        {generating ? <><I.Spin /> جارِ التوليد...</> : 'توليد المستند'}
      </button>
    </div>
  );
}
