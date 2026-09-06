// ══════════════════════════════════════════════════════════════════
// useFillDocument.ts — [Sanad_Legal_Documents_Library_Transition_Plan.md
// — القسم 3.3 + 4، مرحلة 4.1]
//
// نسخة جديدة من state التعبئة توازي useGenerateDocument.ts القديمة، لكن
// بمصدر بيانات جديد بالكامل:
//   - تحميل الحقول: getPublishedTemplateFields (زي ما هي، صفر تغيير)
//   - حل القيم التلقائية: resolveCaseBindings + fallback office_name
//     (زي ما هما بالظبط في useGenerateDocument.ts)
//   - التحقق: validateRequiredFields (زي ما هي)
//   - التعبئة نفسها: fillDocumentTemplate (Edge Function، مرحلة 2.3) —
//     مش generateDocument()/body_template القديمة، وبترجع Blob مباشرة
//     مش GeneratedDocument.
//
// ⚡ فرق جوهري عن useGenerateDocument.ts: **مفيش كاش أوفلاين هنا خالص**
// (القسم 4 من الخطة — "التعبئة من بيانات قضية تتطلب اتصال إنترنت
// إلزاميًا"، بنفس قرار useCaseDocuments.ts لرفع مستندات الأرشيف). لو
// offline فعليًا، رسالة خطأ عربية واضحة بس، من غير أي محاولة كاش محلي.
// نفس السبب: offlineTemplateCache.ts (مبني على body_template النصي)
// معندوش أي استخدام هنا — القسم 6.3 هيحسم مصيره لاحقًا في مرحلة 6،
// مش قبل كده.
//
// نحتفظ كمان بـ master_file_name (من resolveTemplateVersion) عشان
// شاشة "تأكيد وتحميل" (مرحلة 4.2) تستخدمه كاسم افتراضي للملف المُحمَّل.
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { getPublishedTemplateFields } from '../api/templatesApi';
import { resolveCaseBindings, validateRequiredFields, resolveTemplateVersion } from '../api/generationApi';
import { fillDocumentTemplate } from '../api/templatesApi';
import { loadOfficeSetting } from '../../../constants';
import { createFetchGuard } from '../../../shared/lib/offlineGuard';
import { recordError, recordSuccess } from '../../../systemHealth';
import type { TemplateField, ResolvedBindings, SourceMode } from '../types';

interface UseFillDocumentParams {
  templateId: string | null;
  caseId: string | null;
  sourceMode: SourceMode | null;
}

interface UseFillDocumentResult {
  fields: TemplateField[];
  loadingFields: boolean;
  loadError: string | null;
  values: ResolvedBindings;
  setValue: (fieldKey: string, value: string | number | null) => void;
  missingRequiredFieldLabels: string[];
  isValid: boolean;
  /** اسم الملف الأصلي (master_file_name) — بيتحدّث مع تحميل الحقول، null لحد ما يتحمّل */
  masterFileName: string | null;
  filling: boolean;
  fillError: string | null;
  /** بينادي fillDocumentTemplate ويرجّع Blob جاهز للتحميل، أو null لو فشل/الحقول مش صالحة */
  fill: () => Promise<Blob | null>;
}

export function useFillDocument({ templateId, caseId, sourceMode }: UseFillDocumentParams): UseFillDocumentResult {
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<ResolvedBindings>({});
  const [masterFileName, setMasterFileName] = useState<string | null>(null);
  const [templateVersionId, setTemplateVersionId] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId || !sourceMode) return;
    let cancelled = false;
    setLoadingFields(true);
    setLoadError(null);

    // نفس نمط createFetchGuard المستخدم في useGenerateDocument.ts — بدون
    // أي محاولة كاش محلي هنا (القسم 4: التعبئة تتطلب إنترنت إلزاميًا).
    const guard = createFetchGuard();
    if (guard.offline) {
      recordError('db_document_generation', 'offline');
      setLoadError('أنت أوف لاين — التعبئة من بيانات قضية تتطلب اتصالاً بالإنترنت. تحقق من الاتصال وحاول تاني.');
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

          // office_name: نفس الحالة الخاصة الموثّقة في useGenerateDocument.ts —
          // بتتحل من office_settings دايمًا بغض النظر عن sourceMode.
          const officeNameField = templateFields.find((f) => f.field_key === 'office_name');
          if (officeNameField && (initialValues['office_name'] === null || initialValues['office_name'] === undefined)) {
            initialValues['office_name'] = await loadOfficeSetting('name');
          }

          const templateVersion = await resolveTemplateVersion(templateId);

          return { templateFields, initialValues, templateVersion };
        })();

        const { templateFields, initialValues, templateVersion } = await Promise.race([work, timeoutPromise]);
        if (cancelled) return;
        setFields(templateFields);
        setValues(initialValues);
        setMasterFileName(templateVersion.master_file_name);
        setTemplateVersionId(templateVersion.id);
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

  const fill = useCallback(async (): Promise<Blob | null> => {
    if (!templateVersionId) {
      setFillError('لسه بيانات القالب متحمّلتش، حاول تاني بعد لحظات');
      return null;
    }
    if (!validation.isValid) {
      setFillError('تعذّر تعبئة المستند، حقول مطلوبة ناقصة: ' + missingRequiredFieldLabels.join('، '));
      return null;
    }
    setFilling(true);
    setFillError(null);

    // نفس مبدأ التحقق من الأوفلاين فوق — التعبئة الفعلية (نداء Edge
    // Function) محتاجة اتصال زي تحميل الحقول بالظبط، بدون استثناء.
    const guard = createFetchGuard(20_000);
    if (guard.offline) {
      setFillError('أنت أوف لاين — تعبئة المستند تتطلب اتصالاً بالإنترنت. تحقق من الاتصال وحاول تاني.');
      setFilling(false);
      guard.cleanup();
      return null;
    }
    const timeoutPromise = new Promise<never>((_, reject) => {
      guard.controller.signal.addEventListener('abort', () => reject(new Error('timeout')));
    });

    try {
      const blob = await Promise.race([
        fillDocumentTemplate(templateVersionId, values),
        timeoutPromise,
      ]);
      return blob;
    } catch (e: unknown) {
      const timedOut = guard.didTimeOut();
      setFillError(
        timedOut
          ? 'انتهت مهلة تعبئة المستند. تحقق من الاتصال بالإنترنت وحاول تاني.'
          : (e instanceof Error ? e.message : 'تعذّر تعبئة المستند')
      );
      recordError('doc_fill_generate', timedOut ? 'timeout' : (e instanceof Error ? e.message : String(e)));
      return null;
    } finally {
      guard.cleanup();
      setFilling(false);
    }
  }, [templateVersionId, values, validation.isValid, missingRequiredFieldLabels]);

  return {
    fields, loadingFields, loadError, values, setValue,
    missingRequiredFieldLabels, isValid: validation.isValid,
    masterFileName, filling, fillError, fill,
  };
}
