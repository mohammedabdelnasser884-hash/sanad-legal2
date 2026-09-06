// ══════════════════════════════════════════════════════════════════
// DocumentFillConfirmScreen.tsx — [Sanad_Legal_Documents_Library_Transition_Plan.md
// — القسم 3.5 + 7، مرحلة 4.2]
//
// شاشة "تأكيد وتحميل" الجديدة اللي بتحل محل DocumentPreviewEditor.tsx
// القديمة (المعاينة/التعديل النصي) في مسار "تعبئة من بيانات قضية"
// (القسم 3.5). مفيش نص بيتبني نعرضه/نعدله في المتصفح — التعديل بعد
// كده بيحصل في Word نفسه بعد التحميل، زي ما القسم 3.5 بيوضّح:
//
//   DynamicFieldsForm (زرار "توليد المستند" فيها بقى بيودّي هنا بدل
//   ما يعرض preview) → هنا: زرار "تأكيد وتحميل" واحد بينادي
//   fillDocumentTemplate (عبر useFillDocument.fill، مرحلة 4.1) →
//   تحميل الملف الناتج (.docx معبّى) مباشرة + logActivity
//   ("تعبئة مستند قانوني")، بنفس نمط useAdminBackup.ts::handleDownloadBackup
//   (Blob → URL.createObjectURL → <a download> → revokeObjectURL).
//
// ⚠️ زي TemplateActionScreen.tsx بالظبط — الشاشة دي مالهاش أي state
// منفصل خاص بيها للحقول/القيم، هي بس بتستهلك نتيجة useFillDocument
// (اللي الأب LegalDocumentsPage.tsx بيمررها) وبتعرض ملخص + زرار تأكيد.
// ══════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { I } from '../../../constants';
import { db } from '../../../supabaseClient';
import { logActivity } from '../../../shared/lib/dataAccess';
import OfficeProfileCompletenessBanner from './OfficeProfileCompletenessBanner';
import type { SourceMode } from '../types';

interface DocumentFillConfirmScreenProps {
  templateName: string;
  /** اسم الملف الأصلي (master_file_name) — بيُستخدم كاسم افتراضي للملف المُحمَّل */
  masterFileName: string | null;
  sourceMode: SourceMode;
  filling: boolean;
  fillError: string | null;
  /** بترجع Blob جاهز للتحميل، أو null لو فشلت (fillError هيتحدّث تلقائيًا داخل الهوك) */
  onFill: () => Promise<Blob | null>;
  /** بينادى بعد نجاح التحميل فعليًا (بعد logActivity) — الأب بيستخدمها لإشعار تيليجرام الاختياري بس */
  onFillSuccess?: () => void;
  onBack: () => void;
  onOpenSettings: () => void;
}

const SOURCE_MODE_LABEL: Record<SourceMode, string> = {
  case_bound: 'من قضية مفتوحة',
  manual: 'إدخال يدوي',
  blank: 'نموذج فاضي',
};

export default function DocumentFillConfirmScreen({
  templateName, masterFileName, sourceMode, filling, fillError, onFill, onFillSuccess, onBack, onOpenSettings,
}: DocumentFillConfirmScreenProps) {
  const [downloaded, setDownloaded] = useState(false);

  const handleConfirm = async () => {
    const blob = await onFill();
    if (!blob) return;

    const fileName = masterFileName || `${templateName}.docx`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);

    // القسم 8 بند 3: مفيش جدول generated_documents — التسجيل عبر
    // logActivity بنفس نمط "تحميل مستند قانوني" في TemplateActionScreen.tsx،
    // بس بنوع نشاط مخصّص لمسار التعبئة.
    logActivity(db, 'تعبئة مستند قانوني', {
      entity_type: 'document',
      entity_id: null,
      details: `${templateName} — ${SOURCE_MODE_LABEL[sourceMode]}`,
    });
    onFillSuccess?.();
  };

  return (
    <div className="space-y-4" data-testid="doc-gen-fill-confirm-screen">
      <button onClick={onBack} data-testid="doc-gen-back-btn" className="flex items-center gap-1 text-slate-400 text-xs font-bold">
        <I.ChevronRight className="w-4 h-4" /> رجوع
      </button>

      <div>
        <h3 className="text-sm font-black text-white">{templateName}</h3>
        <p className="text-[10px] text-slate-500 mt-1">
          تأكيد وتحميل — {SOURCE_MODE_LABEL[sourceMode]}
        </p>
      </div>

      <OfficeProfileCompletenessBanner onOpenSettings={onOpenSettings} />

      <div className="p-4 rounded-2xl bg-premium-card border border-white/10 flex items-center gap-3">
        <I.Doc className="w-8 h-8 text-purple-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-black text-white truncate">{masterFileName || 'ملف Word'}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            نفس الملف الأصلي، بالبيانات اللي دخّلتها — التصميم والفورمات زي ما هما
          </p>
        </div>
      </div>

      {downloaded && !fillError && (
        <div data-testid="doc-gen-fill-success" className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300 font-bold">
          ✅ اتحمّل المستند بنجاح
        </div>
      )}
      {fillError && (
        <div data-testid="doc-gen-fill-error" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-300">
          {fillError}
        </div>
      )}

      <button
        data-testid="doc-gen-confirm-fill-btn"
        onClick={handleConfirm}
        disabled={filling}
        className="w-full py-3.5 rounded-xl text-xs font-black text-premium-bg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: 'linear-gradient(135deg,#d4af37,#f0c040)' }}
      >
        {filling ? <><I.Spin /> جارِ التعبئة...</> : <><I.Download /> تأكيد وتحميل</>}
      </button>
    </div>
  );
}
