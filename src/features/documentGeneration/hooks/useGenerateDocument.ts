// ══════════════════════════════════════════════════════════════════
// useGenerateDocument.ts — state التوليد والمعاينة (القسم 2 + القسم 9.3)
// بيغلّف getPublishedTemplateFields + resolveCaseBindings + validateRequiredFields
// + generateDocument (كلها من المرحلتين 1/2، بدون أي تعديل عليهم).
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { getPublishedTemplateFields } from '../api/templatesApi';
import { resolveCaseBindings, validateRequiredFields, generateDocument } from '../api/generationApi';
import { loadOfficeSetting } from '../../../constants';
import { createFetchGuard } from '../../../shared/lib/offlineGuard';
import { recordError, recordSuccess } from '../../../systemHealth';
import type { TemplateField, ResolvedBindings, SourceMode, GeneratedDocument } from '../types';

interface UseGenerateDocumentParams {
  templateId: string | null;
  caseId: string | null;
  sourceMode: SourceMode | null;
}

interface UseGenerateDocumentResult {
  fields: TemplateField[];
  loadingFields: boolean;
  loadError: string | null;
  values: ResolvedBindings;
  setValue: (fieldKey: string, value: string | number | null) => void;
  missingRequiredFieldLabels: string[];
  isValid: boolean;
  generating: boolean;
  generateError: string | null;
  generate: () => Promise<GeneratedDocument | null>;
}

export function useGenerateDocument({ templateId, caseId, sourceMode }: UseGenerateDocumentParams): UseGenerateDocumentResult {
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<ResolvedBindings>({});
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId || !sourceMode) return;
    let cancelled = false;
    setLoadingFields(true);
    setLoadError(null);

    // ⚡ FIX (23 أغسطس 2026): زي كل شاشات جلب البيانات التانية في المشروع
    // (docs/fees/dashboard...) بعد باج الأوفلاين بتاع 9 أغسطس — الفورم ده
    // كان الاستثناء الوحيد اللي بينادي getPublishedTemplateFields/
    // resolveCaseBindings/loadOfficeSetting من غير أي guard/timeout، فلو
    // فيه تعليق شبكة حقيقي كانت شاشة "جارِ تحميل الحقول..." بتفضل معلّقة
    // للأبد من غير أي خطأ يبان للمستخدم (أول CI run حقيقي للميزة دي وقف
    // بالظبط على العرض ده). توقيعات getPublishedTemplateFields/
    // resolveCaseBindings مقفولة (القسم 3.2)، فمفيش تمرير abortSignal ليهم
    // مباشرة — بدل كده بنستخدم Promise.race مع مهلة createFetchGuard حوالين
    // النداء كله، بنفس فلسفة الـ8 ثواني المستخدمة في كل مكان تاني.
    const guard = createFetchGuard();
    if (guard.offline) {
      recordError('db_document_generation', 'offline');
      setLoadError('أنت أوف لاين — تعذّر تحميل حقول القالب. تحقق من الاتصال بالإنترنت.');
      setLoadingFields(false);
      return;
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      guard.controller.signal.addEventListener('abort', () => reject(new Error('timeout')));
    });

    (async () => {
      try {
        const work = (async () => {
          const templateFields = await getPublishedTemplateFields(templateId);

          let initialValues: ResolvedBindings;
          if (sourceMode === 'case_bound' && caseId) {
            initialValues = await resolveCaseBindings(caseId, templateFields);
          } else {
            initialValues = {};
            for (const f of templateFields) initialValues[f.field_key] = null;
          }

          // office_name: نفس الحالة الخاصة الموثّقة في generationApi.ts —
          // بتتحل من office_settings دايمًا بغض النظر عن sourceMode، عشان
          // تظهر معبّأة في الفورم من قبل الضغط على "توليد مستند".
          const officeNameField = templateFields.find((f) => f.field_key === 'office_name');
          if (officeNameField && (initialValues['office_name'] === null || initialValues['office_name'] === undefined)) {
            initialValues['office_name'] = await loadOfficeSetting('name');
          }

          return { templateFields, initialValues };
        })();

        const { templateFields, initialValues } = await Promise.race([work, timeoutPromise]);
        if (cancelled) return;
        setFields(templateFields);
        setValues(initialValues);
        recordSuccess('db_document_generation');
      } catch (e: unknown) {
        if (!cancelled) {
          const timedOut = guard.didTimeOut();
          const msg = timedOut
            ? 'انتهت مهلة تحميل حقول القالب. تحقق من الاتصال بالإنترنت وحاول تاني.'
            : (e instanceof Error ? e.message : 'تعذّر تحميل حقول القالب');
          setLoadError(msg);
          recordError('db_document_generation', timedOut ? 'timeout' : msg);
        }
      } finally {
        guard.cleanup();
        if (!cancelled) setLoadingFields(false);
      }
    })();

    return () => { cancelled = true; guard.cleanup(); };
  }, [templateId, caseId, sourceMode]);

  const setValue = useCallback((fieldKey: string, value: string | number | null) => {
    setValues((prev) => ({ ...prev, [fieldKey]: value }));
  }, []);

  const validation = validateRequiredFields(fields, values);
  const missingRequiredFieldLabels = fields
    .filter((f) => validation.missingRequiredFields.includes(f.field_key))
    .map((f) => f.label_ar);

  const generate = useCallback(async (): Promise<GeneratedDocument | null> => {
    if (!templateId || !sourceMode) return null;
    setGenerating(true);
    setGenerateError(null);

    // ⚡ FIX (23 أغسطس 2026، تكملة الفيكس فوق): generateDocument() نفسها —
    // اللي بتتنفذ عند الضغط على "توليد مستند" — عندها نفس المشكلة بالظبط
    // اللي كانت في useEffect جلب الحقول: عدة نداءات db.from(...) متتالية
    // (resolveTemplateVersion، template_fields، resolveCaseBindings،
    // loadOfficeSetting، الـ insert) من غير أي guard/timeout. لو أي واحدة
    // فيهم علّقت، generating كانت هتفضل true للأبد وزرار "توليد المستند"
    // هيفضل معلّق من غير أي خطأ يبان (CI هنا وقع بالظبط على انتظار زرار
    // "تصدير PDF" اللي مستحيل يظهر لحد ما generate() ترجع). نفس نمط
    // Promise.race + createFetchGuard المستخدم فوق بالظبط — توقيع
    // generateDocument() مقفول زي ما هو (مفيش abortSignal تمريره ليها مباشرة).
    //
    // 🔒 FIX (24 أغسطس 2026): الـ8 ثواني الافتراضية (نفس سقف كل استعلام
    // مفرد في المشروع) مش كافية هنا — generateDocument() سلسلة متتالية من
    // حتى 5-6 رحلات شبكة (resolveTemplateVersion لوحدها ممكن تبقى
    // استعلامين، + template_fields + resolveCaseBindings (حتى استعلامين
    // تانيين) + loadOfficeSetting + الـinsert النهائي)، مش استعلام واحد
    // زي باقي أماكن استخدام createFetchGuard() في المشروع. CI run فعلي
    // (24 أغسطس) فشل بالظبط هنا — الاختبار وقف ينتظر زرار "تصدير PDF"
    // لحد 15 ثانية وماظهرش، يعني الأرجح إن الـ8 ثواني كانت بتقفل قبل ما
    // السلسلة الحقيقية تخلص فعليًا (مش هانج حقيقي، تايم آوت مبكر جدًا على
    // عملية متعددة الخطوات). رفعتها لـ20 ثانية (نفس السقف المستخدم فعليًا
    // لعملية التصدير المشابهة في e2e/document-generation.spec.ts). الحل
    // الأصح طويل المدى هو تقليل عدد الرحلات نفسها، مش بند لهذه الجلسة.
    const guard = createFetchGuard(20_000);
    if (guard.offline) {
      setGenerateError('أنت أوف لاين — تعذّر توليد المستند. تحقق من الاتصال بالإنترنت.');
      setGenerating(false);
      return null;
    }
    const timeoutPromise = new Promise<never>((_, reject) => {
      guard.controller.signal.addEventListener('abort', () => reject(new Error('timeout')));
    });

    try {
      const doc = await Promise.race([
        generateDocument({
          templateId,
          caseId: caseId ?? null,
          sourceMode,
          manualValues: values,
        }),
        timeoutPromise,
      ]);
      return doc;
    } catch (e: unknown) {
      const timedOut = guard.didTimeOut();
      setGenerateError(
        timedOut
          ? 'انتهت مهلة توليد المستند. تحقق من الاتصال بالإنترنت وحاول تاني.'
          : (e instanceof Error ? e.message : 'تعذّر توليد المستند، تحقق من البيانات المطلوبة')
      );
      recordError('doc_generation_generate', timedOut ? 'timeout' : (e instanceof Error ? e.message : String(e)));
      return null;
    } finally {
      guard.cleanup();
      setGenerating(false);
    }
  }, [templateId, caseId, sourceMode, values]);

  return {
    fields, loadingFields, loadError, values, setValue,
    missingRequiredFieldLabels, isValid: validation.isValid,
    generating, generateError, generate,
  };
}
