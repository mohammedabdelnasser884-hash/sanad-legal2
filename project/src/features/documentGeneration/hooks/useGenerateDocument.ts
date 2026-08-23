// ══════════════════════════════════════════════════════════════════
// useGenerateDocument.ts — state التوليد والمعاينة (القسم 2 + القسم 9.3)
// بيغلّف getPublishedTemplateFields + resolveCaseBindings + validateRequiredFields
// + generateDocument (كلها من المرحلتين 1/2، بدون أي تعديل عليهم).
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { getPublishedTemplateFields } from '../api/templatesApi';
import { resolveCaseBindings, validateRequiredFields, generateDocument } from '../api/generationApi';
import { loadOfficeSetting } from '../../../constants';
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

    (async () => {
      try {
        const templateFields = await getPublishedTemplateFields(templateId);
        if (cancelled) return;

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

        if (cancelled) return;
        setFields(templateFields);
        setValues(initialValues);
      } catch (e: unknown) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'تعذّر تحميل حقول القالب');
      } finally {
        if (!cancelled) setLoadingFields(false);
      }
    })();

    return () => { cancelled = true; };
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
    try {
      const doc = await generateDocument({
        templateId,
        caseId: caseId ?? null,
        sourceMode,
        manualValues: values,
      });
      return doc;
    } catch (e: unknown) {
      setGenerateError(e instanceof Error ? e.message : 'تعذّر توليد المستند، تحقق من البيانات المطلوبة');
      return null;
    } finally {
      setGenerating(false);
    }
  }, [templateId, caseId, sourceMode, values]);

  return {
    fields, loadingFields, loadError, values, setValue,
    missingRequiredFieldLabels, isValid: validation.isValid,
    generating, generateError, generate,
  };
}
