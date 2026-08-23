// ══════════════════════════════════════════════════════════════════
// useDocumentExport.ts — state التصدير (القسم 2)
// [تحديث المرحلة 4] بعد موافقة جيمي الصريحة على jsPDF+html2canvas/docx
// (راجع تعليق exportApi.ts) بقى بينادي الدوال الحقيقية بدل الـstub.
// ══════════════════════════════════════════════════════════════════

import { useState, useCallback } from 'react';
import { exportToPdf, exportToDocx } from '../api/exportApi';

interface UseDocumentExportResult {
  exportingPdf: boolean;
  exportingDocx: boolean;
  exportPdf: (documentId: string) => Promise<void>;
  exportDocx: (documentId: string) => Promise<void>;
}

export function useDocumentExport(): UseDocumentExportResult {
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);

  const exportPdf = useCallback(async (documentId: string) => {
    setExportingPdf(true);
    try {
      await exportToPdf(documentId);
    } finally {
      setExportingPdf(false);
    }
  }, []);

  const exportDocx = useCallback(async (documentId: string) => {
    setExportingDocx(true);
    try {
      await exportToDocx(documentId);
    } finally {
      setExportingDocx(false);
    }
  }, []);

  return { exportingPdf, exportingDocx, exportPdf, exportDocx };
}
