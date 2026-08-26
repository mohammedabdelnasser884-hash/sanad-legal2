// ══════════════════════════════════════════════════════════════════
// DocumentPreviewEditor.tsx — القسم 9.4
// ══════════════════════════════════════════════════════════════════

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { I } from '../../../constants';
import { db } from '../../../supabaseClient';
import { toast } from '@/shared/lib/notifications';
import OfficeProfileCompletenessBanner from './OfficeProfileCompletenessBanner';
import { useDocumentExport } from '../hooks/useDocumentExport';
import { isOfflineGeneratedDocId } from '../lib/offlineTemplateCache';
import type { GeneratedDocument, DocumentContentSection } from '../types';

const STATUS_STYLE: Record<string, string> = {
  draft:    'bg-slate-500/15 text-slate-300',
  exported: 'bg-emerald-500/15 text-emerald-300',
};
const STATUS_LABEL: Record<string, string> = { draft: 'مسودة', exported: 'تم التصدير' };

interface DocumentPreviewEditorProps {
  document: GeneratedDocument;
  templateName: string;
  onBack: () => void;
  onOpenSettings: () => void;
}

export default function DocumentPreviewEditor({ document: doc, templateName, onBack, onOpenSettings }: DocumentPreviewEditorProps) {
  const [sections, setSections] = useState<DocumentContentSection[]>(doc.document_content_json);
  const [status, setStatus] = useState(doc.status);
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { exportingPdf, exportingDocx, exportPdf, exportDocx } = useDocumentExport();

  // 🆕 بند 4 (الأوفلاين، القسم 17.6، خطوة 4): المستند ده اتولّد أوفلاين
  // (لسه في طابور المزامنة، مفيش id حقيقي في generated_documents لحد
  // دلوقتي) — بنميّزه من بادئة الـid المحلي (offlineTemplateCache.ts)
  // بدل ما نضيف حقل جديد لـGeneratedDocument (types.ts مقفول عن قصد).
  const isOfflineDraft = isOfflineGeneratedDocId(doc.id);

  const scheduleSave = useCallback((next: DocumentContentSection[]) => {
    // مستند أوفلاين: doc.id محلي مؤقت، مش صف حقيقي في السيرفر لحد ما
    // يتزامن — أي محاولة UPDATE بيه مضمون تفشل، فمفيش داعي نحاول شبكة
    // من الأساس (بدل ما نستنى فشلها زي القديم).
    if (isOfflineDraft) { setSaved(false); return; }
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await db.from('generated_documents')
          .update({ document_content_json: next as unknown as never, updated_at: new Date().toISOString() })
          .eq('id', doc.id);
        setSaved(true);
      } catch {
        // فقدان الاتصال أثناء التحرير (القسم 9.6): التحرير يفضل شغال محلياً،
        // auto-save بس بيفشل بصمت مع أيقونة "لم يُحفظ بعد" — بدون أي محاولة
        // sync/offline queue معقدة.
        setSaved(false);
      }
    }, 2000);
  }, [doc.id, isOfflineDraft]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const updateSectionText = (index: number, text: string) => {
    const next = sections.map((s, i) => (i === index ? { ...s, text } : s));
    setSections(next);
    scheduleSave(next);
  };

  const handleExport = async (kind: 'pdf' | 'docx') => {
    try {
      if (kind === 'pdf') await exportPdf(doc.id); else await exportDocx(doc.id);
      setStatus('exported');
      toast('تم التصدير بنجاح');
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'تعذّر التصدير', true);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <button onClick={onBack} data-testid="doc-gen-back-btn" className="flex items-center gap-1 text-slate-400 text-xs font-bold">
          <I.ChevronRight className="w-4 h-4" /> رجوع
        </button>
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${STATUS_STYLE[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <h3 className="text-sm font-black text-white">{templateName}</h3>

      <OfficeProfileCompletenessBanner onOpenSettings={onOpenSettings} />

      <div className="bg-slate-800/40 rounded-2xl p-4">
        <div
          className="bg-white text-black mx-auto rounded shadow-lg p-6 space-y-4"
          style={{ maxWidth: '480px', minHeight: '600px', direction: 'rtl', fontFamily: 'Amiri, serif' }}
        >
          {sections.map((section, i) => (
            <div
              key={i}
              data-testid={`doc-gen-preview-section-${section.type}`}
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => updateSectionText(i, e.currentTarget.textContent || '')}
              // 🆕 [قسم 20.1] صندوق "الموضوع" — بطاقة مبروزة بحدود واضحة،
              // محاذية لليمين (RTL)، بدل نص عادي متصل زي باقي الأقسام.
              className={
                section.type === 'subject_box'
                  ? 'text-sm leading-relaxed outline-none whitespace-pre-wrap border border-black/70 rounded px-3 py-2 mr-auto max-w-[70%] text-right'
                  : 'text-sm leading-relaxed outline-none whitespace-pre-wrap'
              }
            >
              {section.text}
            </div>
          ))}
        </div>
        {!saved && !isOfflineDraft && (
          <div className="flex items-center gap-1 justify-center mt-2 text-[9px] text-amber-400">
            <span>●</span> لم يُحفظ بعد
          </div>
        )}
      </div>

      {isOfflineDraft && (
        <div data-testid="doc-gen-offline-draft-banner" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 font-bold">
          ⚠️ المستند ده اتولّد أوفلاين ومحفوظ محليًا — هيتزامن تلقائيًا أول ما
          الإنترنت يرجع. تصدير PDF/Word محتاج اتصال بالإنترنت؛ هتقدر تصدّره من
          حافظة القضية بعد ما يتزامن.
        </div>
      )}

      <div className="fixed bottom-[70px] lg:bottom-4 inset-x-0 px-3 flex gap-2 max-w-sm mx-auto">
        <button
          data-testid="doc-gen-export-pdf-btn"
          onClick={() => handleExport('pdf')}
          disabled={exportingPdf || isOfflineDraft}
          title={isOfflineDraft ? 'محتاج اتصال بالإنترنت للتصدير' : undefined}
          className="flex-1 py-3 rounded-xl text-xs font-black text-premium-bg transition-all active:scale-95 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#d4af37,#f0c040)' }}
        >
          {exportingPdf ? 'جارِ التصدير...' : 'تصدير PDF'}
        </button>
        <button
          data-testid="doc-gen-export-docx-btn"
          onClick={() => handleExport('docx')}
          disabled={exportingDocx || isOfflineDraft}
          title={isOfflineDraft ? 'محتاج اتصال بالإنترنت للتصدير' : undefined}
          className="flex-1 py-3 rounded-xl text-xs font-black text-slate-300 bg-white/5 border border-white/10 transition-all active:scale-95 disabled:opacity-50"
        >
          {exportingDocx ? 'جارِ التصدير...' : 'تصدير Word'}
        </button>
      </div>
    </div>
  );
}
