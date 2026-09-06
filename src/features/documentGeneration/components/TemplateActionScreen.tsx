// ══════════════════════════════════════════════════════════════════
// TemplateActionScreen.tsx — [Sanad_Legal_Documents_Library_Transition_Plan.md
// — القسم 3.5 + 7 (مرحلة 3.1/3.2)]
//
// الشاشة الجديدة اللي بتحل محل نقطة الدخول القديمة لـSourceModeSelector
// مباشرة بعد اختيار قالب (من TemplatePicker أو بحث CategoryPicker
// الموحّد) — القسم 3.5:
//
//   TemplatePicker → شاشة القالب المفرد (هنا) → إما:
//     - "تحميل كما هو" → رابط تحميل موقّع لملف الـWord الأصلي
//       (getMasterFileUrl، القسم 3.3) + logActivity — فوري، الشاشة
//       نفسها متتغيرش، صفر انتقال خطوة.
//     - "تعبئة من بيانات قضية" → onChooseFill بيحوّل الأب
//       (LegalDocumentsPage) لخطوة 'sourceMode' — نفس المسار القديم
//       زي ما هو بالظبط (مرحلة 4 لسه هي اللي هتغيّر آخره من
//       DocumentPreviewEditor لشاشة "تأكيد وتحميل").
//
// ⚠️ زرار "تحميل كما هو" بيتفعّل دايمًا (مفيش طريقة نعرف مقدمًا من
// DocumentTemplate وحده لو النسخة المنشورة عندها master_file_path
// فعلاً — القوالب الأربعة الحالية لسه من غيره لحد مرحلة 5). لو حصل
// خطأ (مفيش نسخة منشورة/مفيش ملف مرفوع بعد/فشل توليد رابط)،
// getMasterFileUrl (templatesApi.ts) بترجع رسالة عربية واضحة بتتعرض
// هنا زي ما هي.
// ══════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { I } from '../../../constants';
import { db } from '../../../supabaseClient';
import { logActivity } from '../../../shared/lib/dataAccess';
import { getMasterFileUrl } from '../api/templatesApi';
import type { DocumentTemplate } from '../types';

interface TemplateActionScreenProps {
  template: DocumentTemplate;
  onBack: () => void;
  onChooseFill: () => void;
}

export default function TemplateActionScreen({ template, onBack, onChooseFill }: TemplateActionScreenProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownloadAsIs = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      if (!template.current_published_version_id) {
        throw new Error('هذا القالب معندوش نسخة منشورة بعد');
      }
      const { url, fileName } = await getMasterFileUrl(template.current_published_version_id);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.target = '_blank';
      a.rel = 'noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // القسم 8 بند 3: مفيش جدول generated_documents — التسجيل عبر
      // logActivity الموجود فعليًا، بنفس نمط "توليد مستند قانوني" في
      // LegalDocumentsPage.tsx بس بنوع نشاط جديد مخصّص لمسار التحميل.
      logActivity(db, 'تحميل مستند قانوني', {
        entity_type: 'document',
        entity_id: template.id,
        details: template.name_ar,
      });
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'تعذّر تحميل المستند. حاول تاني.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="doc-gen-template-action-screen">
      <button onClick={onBack} data-testid="doc-gen-back-btn" className="flex items-center gap-1 text-slate-400 text-xs font-bold">
        <I.ChevronRight className="w-4 h-4" /> رجوع
      </button>

      <div>
        <h3 className="text-sm font-black text-white">{template.name_ar}</h3>
        {template.description && (
          <p className="text-[10px] text-slate-500 mt-1">{template.description}</p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          data-testid="doc-gen-download-as-is-btn"
          onClick={handleDownloadAsIs}
          disabled={downloading}
          className="flex-1 p-4 rounded-2xl bg-premium-card border border-white/10 hover:border-purple-500/30 transition-all active:scale-[0.98] disabled:opacity-50 flex flex-col items-center gap-2 text-center"
        >
          {downloading ? <I.Spin /> : <I.Download />}
          <span className="text-xs font-black text-white">تحميل كما هو</span>
          <span className="text-[10px] text-slate-500">الملف الأصلي زي ما هو، صفر تعبئة</span>
        </button>

        <button
          data-testid="doc-gen-choose-fill-btn"
          onClick={onChooseFill}
          className="flex-1 p-4 rounded-2xl bg-premium-card border border-white/10 hover:border-purple-500/30 transition-all active:scale-[0.98] flex flex-col items-center gap-2 text-center"
        >
          <I.Edit />
          <span className="text-xs font-black text-white">تعبئة من بيانات قضية</span>
          <span className="text-[10px] text-slate-500">نفس الملف، بياناته اتعبّت تلقائيًا</span>
        </button>
      </div>

      {downloadError && (
        <div data-testid="doc-gen-download-error" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-300">
          {downloadError}
        </div>
      )}
    </div>
  );
}
