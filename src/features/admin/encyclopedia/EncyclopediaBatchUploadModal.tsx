import React, { useState } from 'react';
import { I } from '../../../constants';
import { Sel } from '@/shared/ui/Sel';
import { useModalPresentation } from '@/shared/hooks/useModalPresentation';
import type { EncyclopediaCategoryRow } from '../../../types';
import type { EncyclopediaBatchFileResult } from './hooks/useAdminEncyclopedia';

// ══════════════════════════════════════════
//  مودال الرفع المتعدد — الموسوعة القانونية
//  مجلد واحد لكل الدفعة، اسم مقترح تلقائي قابل للتعديل لكل ملف،
//  رفع تسلسلي واحد واحد (نفس action='uploadForm' المستخدمة في
//  الرفع الفردي) — لو ملف فشل الباقي يكمل عادي وتوضح نتيجته.
// ══════════════════════════════════════════
interface BatchRow {
  id: string;
  file: File;
  title: string;
}

interface EncyclopediaBatchUploadModalProps {
  onClose: () => void;
  onUpload: (categoryId: string, items: { file: File; title: string }[]) => void;
  uploading: boolean;
  progress: { current: number; total: number } | null;
  results: EncyclopediaBatchFileResult[] | null;
  categories: EncyclopediaCategoryRow[];
  defaultCategoryId: string | null;
}

// بيشيل الامتداد ويستبدل _/- بمسافة — اقتراح مبدئي بس، المستخدم يقدر يعدّله بحرية
function suggestTitle(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^./]+$/, '');
  return withoutExt.replace(/[_-]+/g, ' ').trim() || fileName;
}

let rowIdCounter = 0;
function nextRowId() {
  rowIdCounter += 1;
  return `batch-row-${rowIdCounter}`;
}

function EncyclopediaBatchUploadModal({
  onClose, onUpload, uploading, progress, results, categories, defaultCategoryId,
}: EncyclopediaBatchUploadModalProps) {
  const modalPresentation = useModalPresentation();

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.parent_id ? `— ${c.name_ar}` : c.name_ar,
  }));

  const [categoryId, setCategoryId] = useState<string>(defaultCategoryId || (categories[0]?.id || ''));
  const [rows, setRows] = useState<BatchRow[]>([]);

  const canClose = !uploading;
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (canClose && e.target === e.currentTarget) onClose();
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setRows((prev) => [
      ...prev,
      ...files.map((file) => ({ id: nextRowId(), file, title: suggestTitle(file.name) })),
    ]);
    e.target.value = ''; // يسمح باختيار نفس الملف تاني لو اتشال بالغلط
  };

  const updateRowTitle = (id: string, title: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, title } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUploadAll = () => {
    if (!categoryId || rows.length === 0) return;
    onUpload(categoryId, rows.map((r) => ({ file: r.file, title: r.title })));
  };

  const doneUploading = !uploading && !!results;

  return React.createElement('div', {
    className: `fixed inset-0 z-50 flex ${modalPresentation.overlayAlignClassName} justify-center bg-black/70 backdrop-blur-sm`,
    onClick: handleBackdropClick,
  },
    React.createElement('div', { className: `bg-premium-card w-full max-w-lg ${modalPresentation.panelShapeClassName} p-6 pb-10 shadow-2xl ${modalPresentation.panelAnimationClassName} max-h-[88vh] overflow-y-auto no-scrollbar` },
      React.createElement('div', { className: 'w-10 h-1 bg-white/20 rounded-full mx-auto mb-5' }),
      React.createElement('h3', { className: 'text-sm font-black mb-5 text-white flex items-center gap-2' },
        React.createElement('span', { className: 'w-1 h-4 bg-teal-400 rounded-full' }),
        'رفع متعدد للنماذج'
      ),
      React.createElement('div', { className: 'space-y-4' },

        // ── اختيار المجلد (مرة واحدة لكل الدفعة) ──
        React.createElement(Sel, {
          label: 'المجلد (لكل الملفات)', value: categoryId,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setCategoryId(e.target.value),
          options: categoryOptions, disabled: uploading, testId: 'admin-encyclopedia-batch-category',
        }),

        // ── اختيار الملفات ──
        !doneUploading && React.createElement('div', null,
          React.createElement('label', { className: 'block text-[10px] font-bold text-slate-400 mb-1.5' }, 'الملفات (PDF أو Word)'),
          React.createElement('label', {
            className: `flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-dashed border-teal-400/30 bg-teal-400/5 text-teal-400 text-xs font-bold transition-transform ${uploading ? 'opacity-50' : 'cursor-pointer active:scale-95'}`,
          },
            React.createElement(I.Doc),
            React.createElement('span', null, 'اختر عدة ملفات PDF أو Word'),
            React.createElement('input', {
              type: 'file', multiple: true, disabled: uploading,
              accept: '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              className: 'hidden', 'data-testid': 'admin-encyclopedia-batch-file',
              onChange: handleFilesSelected,
            })
          )
        ),

        // ── قائمة المراجعة (قبل الرفع) ──
        !doneUploading && rows.length > 0 && React.createElement('div', { className: 'space-y-2', 'data-testid': 'admin-encyclopedia-batch-review-list' },
          React.createElement('p', { className: 'text-[10px] font-bold text-slate-400' }, `${rows.length} ملف جاهز للرفع`),
          rows.map((row) => React.createElement('div', {
            key: row.id, 'data-testid': 'admin-encyclopedia-batch-row',
            className: 'bg-premium-bg border border-white/5 rounded-xl p-2.5 space-y-1.5',
          },
            React.createElement('p', { className: 'text-[9.5px] text-slate-500 truncate' }, row.file.name),
            React.createElement('div', { className: 'flex items-center gap-2' },
              React.createElement('input', {
                type: 'text', value: row.title, disabled: uploading,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => updateRowTitle(row.id, e.target.value),
                placeholder: 'عنوان النموذج',
                className: 'flex-1 p-2 text-xs rounded-lg border border-white/10 bg-premium-card text-white placeholder-slate-600',
                style: { fontFamily: 'Cairo,sans-serif' },
              }),
              React.createElement('button', {
                onClick: () => removeRow(row.id), disabled: uploading,
                'data-testid': 'admin-encyclopedia-batch-row-remove',
                className: 'w-8 h-8 shrink-0 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50',
              }, React.createElement(I.Trash))
            )
          ))
        ),

        // ── شريط التقدّم أثناء الرفع ──
        uploading && progress && React.createElement('div', { className: 'space-y-1.5', 'data-testid': 'admin-encyclopedia-batch-progress' },
          React.createElement('p', { className: 'text-[11px] font-bold text-teal-400 flex items-center gap-1.5' },
            React.createElement(I.Spin), `جاري الرفع... ${progress.current} من ${progress.total}`
          ),
          React.createElement('div', { className: 'w-full h-1.5 rounded-full bg-white/5 overflow-hidden' },
            React.createElement('div', {
              className: 'h-full bg-teal-400 transition-all',
              style: { width: `${(progress.current / progress.total) * 100}%` },
            })
          )
        ),

        // ── نتائج الدفعة بعد الانتهاء ──
        doneUploading && React.createElement('div', { className: 'space-y-2', 'data-testid': 'admin-encyclopedia-batch-results' },
          React.createElement('p', { className: 'text-[10px] font-bold text-slate-400' },
            `تم رفع ${results!.filter((r) => r.status === 'success').length} من ${results!.length}`
          ),
          results!.map((r, idx) => React.createElement('div', {
            key: `${r.fileName}-${idx}`,
            className: `flex items-center gap-2 p-2.5 rounded-xl border text-[10.5px] ${r.status === 'success' ? 'bg-teal-500/5 border-teal-500/15 text-teal-300' : 'bg-red-500/5 border-red-500/15 text-red-300'}`,
          },
            React.createElement('span', { className: 'shrink-0' }, r.status === 'success' ? '✅' : '❌'),
            React.createElement('div', { className: 'min-w-0 flex-1' },
              React.createElement('p', { className: 'font-bold truncate' }, r.title),
              r.status === 'error' && React.createElement('p', { className: 'text-[9.5px] opacity-80 mt-0.5' }, r.error)
            )
          ))
        ),

        // ── أزرار الإجراء ──
        !doneUploading && React.createElement('button', {
          disabled: uploading || rows.length === 0 || !categoryId,
          onClick: handleUploadAll,
          'data-testid': 'admin-encyclopedia-batch-submit',
          className: 'w-full py-3.5 rounded-xl font-black text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform mt-2 text-white',
          style: { background: 'linear-gradient(135deg,#0d9488,#2dd4bf)' },
        }, uploading ? React.createElement(I.Spin) : null, uploading ? 'جاري الرفع...' : `رفع الكل (${rows.length})`),

        doneUploading && React.createElement('button', {
          onClick: onClose,
          'data-testid': 'admin-encyclopedia-batch-done',
          className: 'w-full py-3.5 rounded-xl font-black text-sm shadow-md flex items-center justify-center gap-2 active:scale-95 transition-transform mt-2 text-white',
          style: { background: 'linear-gradient(135deg,#0d9488,#2dd4bf)' },
        }, 'تمام')
      )
    )
  );
}

export default EncyclopediaBatchUploadModal;
