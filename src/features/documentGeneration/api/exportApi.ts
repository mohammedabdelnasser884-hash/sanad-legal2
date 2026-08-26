// ══════════════════════════════════════════════════════════════════
// exportApi.ts — القسم 3 (توقيعات مقفولة) + القسم 6/المرحلة 4
//
// ⚠️ [قرار مُتَّخذ بموافقة صريحة من جيمي — 22 أغسطس 2026] فحص
// useCaseDetailActions.ts أثبت إن "نمط PDF الموجود فعليًا" في سند هو
// window.open()+window.print() بس — مفيش Blob بيتولّد برمجيًا نقدر
// نرفعه لـcase_documents، فالبند الحرفي "استخدم نفس المكتبة/بدون مكتبة
// جديدة" كان مستحيل التنفيذ فعليًا مع معيار القبول "الملف ظاهر تلقائيًا
// في قسم المستندات". اتعرض التعارض بالتفصيل، واتقرر صراحة: `jsPDF` +
// `html2canvas` لـPDF (بيلتقطوا نفس الـHTML/الستايل بتاع تقرير القضية
// الموجود، فبصريًا نفس الهوية بالظبط، بس كـBlob حقيقي)، و`docx` لـWord.
// التقييم المكتوب الكامل (الحجم/السبب) في:
// docs/DOCX-PDF-Library-Evaluation-Phase4-1.md (شرط صريح مذكور في
// الخطة نفسها لمكتبة DOCX، اتطبّق هنا على الاتنين بنفس المنطق).
// ══════════════════════════════════════════════════════════════════

// 🔒 FIX (24 أغسطس 2026 — بند 1 من تقرير الأداء/الأمان): jsPDF/html2canvas/docx
// كانوا مستوردين static هنا، يعني ~400KB+ بيتحملوا مع الـbundle الرئيسي لكل
// مستخدم حتى لو محدش فتح شاشة توليد/تصدير مستند خالص. الاستيرادات اتحولت
// لـimport() ديناميكي جوه exportToPdf/exportToDocx نفسهم — بيتحمّلوا بس أول
// مرة حد يضغط "تصدير PDF"/"تصدير Word" فعليًا.
import { db } from '../../../supabaseClient';
import { getCurrentTenantId, loadOfficeSetting } from '../../../constants';
import { resolveStorageUrl } from '../../../shared/lib/storage';
import { escapeHtml } from '../../../shared/lib/sanitize';
import { PDF_FONT_LINK } from '../../../shared/lib/pdf';
import type { GeneratedDocument, DocumentContentSection } from '../types';

interface ExportResult {
  storedFileId: string;
  url: string;
}

interface ExportContext {
  document: GeneratedDocument;
  templateName: string;
  officeName: string | null;
  officeLogoUrl: string | null;
  officePhone: string | null;
  officeAddress: string | null;
}

async function loadExportContext(documentId: string): Promise<ExportContext> {
  const { data: doc, error: docError } = await db
    .from('generated_documents')
    .select('*')
    .eq('id', documentId)
    .maybeSingle();
  if (docError) throw docError;
  if (!doc) throw new Error('المستند غير موجود');

  const { data: template, error: templateError } = await db
    .from('document_templates')
    .select('name_ar')
    .eq('id', doc.template_id)
    .maybeSingle();
  if (templateError) throw templateError;

  const [officeName, officeLogoUrl, officePhone, officeAddress] = await Promise.all([
    loadOfficeSetting('office_name'),
    loadOfficeSetting('office_logo'),
    loadOfficeSetting('office_phone'),
    loadOfficeSetting('office_address'),
  ]);

  return {
    document: doc as unknown as GeneratedDocument,
    templateName: template?.name_ar ?? 'مستند قانوني',
    officeName,
    officeLogoUrl,
    officePhone,
    officeAddress,
  };
}

function sectionsToPlainText(sections: DocumentContentSection[]): string {
  return sections.map((s) => s.text).join('\n\n');
}

// 🆕 [قسم 20.1] صندوق "الموضوع" الجانبي — لو موجود، بيتفصل عن باقي
// الأقسام (مش بيتحسب جزء من المتن العادي) عشان يترندر بشكله المستقل
// (بطاقة مبروزة) في كل من PDF وWord. التوافق الرجعي كامل: القوالب
// القديمة (بدون subject_box) بترجع boxSection = null وbodyText زي ما هو بالظبط.
function splitBoxSection(sections: DocumentContentSection[]): { boxSection: DocumentContentSection | null; bodyText: string } {
  const boxSection = sections.find((s) => s.type === 'subject_box') ?? null;
  const bodySections = sections.filter((s) => s.type !== 'subject_box');
  return { boxSection, bodyText: sectionsToPlainText(bodySections) };
}

/** يرفع Blob جاهز لـcase-docs storage + يسجّل صف case_documents، وبيربط
 *  case_document_links لو case_id موجود — نفس نمط useCaseDocuments.ts
 *  بالظبط (bucket 'case-docs'، مسار tenant_id/case_...). */
async function uploadExportedFile(params: {
  blob: Blob;
  ext: 'pdf' | 'docx';
  fileType: string;
  caseId: string | null;
  generatedDocumentId: string;
  fileNameLabel: string;
}): Promise<ExportResult> {
  const tenantId = getCurrentTenantId();
  if (!tenantId) throw new Error('لا يوجد tenant_id حالي — تأكد من تسجيل الدخول قبل التصدير');

  const safeName = `${tenantId}/${params.caseId ? `case_${params.caseId}` : 'doc'}_${Date.now()}.${params.ext}`;
  const { error: upErr } = await db.storage.from('case-docs').upload(safeName, params.blob, { upsert: true });
  if (upErr) throw upErr;

  const fileUrl = await resolveStorageUrl('case-docs', safeName);

  const { data: inserted, error: dbErr } = await db
    .from('case_documents')
    .insert([{
      case_id: params.caseId,
      file_name: params.fileNameLabel,
      file_type: params.fileType,
      file_url: fileUrl,
      storage_path: safeName,
      category: 'generated_document',
      original_name: params.fileNameLabel,
      file_size: params.blob.size,
    }])
    .select('id')
    .single();
  if (dbErr) throw dbErr;

  // ربط عبر case_document_links فقط لو case_id موجود (القسم 3، بند 3)
  if (params.caseId) {
    const { error: linkErr } = await db
      .from('case_document_links')
      .insert([{
        case_id: params.caseId,
        generated_document_id: params.generatedDocumentId,
        stored_file_id: inserted.id,
      }]);
    if (linkErr) throw linkErr;
  }

  return { storedFileId: inserted.id as string, url: fileUrl ?? '' };
}

async function markExported(documentId: string): Promise<void> {
  await db.from('generated_documents').update({ status: 'exported', updated_at: new Date().toISOString() }).eq('id', documentId);
}

/** يحوّل document_content_json + office_settings إلى PDF، يرفعه لـcase_documents، يرجّع storedFileId */
export async function exportToPdf(documentId: string): Promise<{ storedFileId: string; url: string }> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  const ctx = await loadExportContext(documentId);
  const sections = ctx.document.document_content_json;
  const { boxSection, bodyText } = splitBoxSection(sections);

  // نفس نمط بناء صفحة الطباعة في useCaseDetailActions.ts (خط Amiri، RTL)،
  // بس هنا بتتولّد جوه <iframe> مخفي بدل نافذة جديدة، عشان html2canvas
  // يقدر يلتقطها كـcanvas بدل ما تعتمد على window.print() اليدوي.
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-99999px';
  container.style.left = '-99999px';
  container.style.width = '794px'; // A4 عند 96dpi تقريبًا
  container.style.background = '#fff';
  container.style.padding = '48px';
  container.style.direction = 'rtl';
  container.style.fontFamily = "'Amiri','Cairo',serif";
  container.innerHTML = `
    ${PDF_FONT_LINK}
    <div style="text-align:center;border-bottom:2px solid #D4AF37;padding-bottom:16px;margin-bottom:24px;">
      ${ctx.officeLogoUrl ? `<img src="${ctx.officeLogoUrl}" style="height:56px;margin-bottom:8px;" crossorigin="anonymous" />` : ''}
      <div style="font-size:18px;font-weight:900;color:#1a1a2e;">${escapeHtml(ctx.officeName || '')}</div>
      <div style="font-size:11px;color:#888;margin-top:4px;">${escapeHtml([ctx.officePhone, ctx.officeAddress].filter(Boolean).join(' — '))}</div>
    </div>
    <div style="text-align:center;font-size:16px;font-weight:900;margin-bottom:20px;">${escapeHtml(ctx.templateName)}</div>
    ${boxSection ? `<div style="border:1.5px solid #1a1a2e;border-radius:4px;padding:10px 14px;margin:0 0 20px auto;width:55%;font-size:12px;line-height:1.9;white-space:pre-wrap;text-align:right;color:#1a1a2e;">${escapeHtml(boxSection.text)}</div><div style="clear:both;"></div>` : ''}
    <div style="font-size:14px;line-height:2;white-space:pre-wrap;color:#1a1a2e;">${escapeHtml(bodyText)}</div>
  `;
  document.body.appendChild(container);

  let blob: Blob;
  try {
    // انتظار تحميل الخط قبل الالتقاط عشان الحروف العربية متتشوهش
    await new Promise((resolve) => setTimeout(resolve, 400));
    const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/png');

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    blob = pdf.output('blob');
  } finally {
    document.body.removeChild(container);
  }

  const result = await uploadExportedFile({
    blob,
    ext: 'pdf',
    fileType: 'pdf',
    caseId: ctx.document.case_id,
    generatedDocumentId: documentId,
    fileNameLabel: `${ctx.templateName}.pdf`,
  });
  await markExported(documentId);
  return result;
}

/** نفس الشيء لـDOCX */
export async function exportToDocx(documentId: string): Promise<{ storedFileId: string; url: string }> {
  const {
    Document: DocxDocument, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, BorderStyle,
  } = await import('docx');

  const ctx = await loadExportContext(documentId);
  const sections = ctx.document.document_content_json;
  const { boxSection, bodyText } = splitBoxSection(sections);

  const bodyParagraphs = bodyText.split('\n').map((line) =>
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      children: [new TextRun({ text: line, font: 'Amiri', size: 24 })],
    })
  );

  // 🆕 [قسم 20.1] صندوق "الموضوع" — نفس فكرة PDF (بوردر حول فقرات
  // الصندوق)، هنا كـborder على كل Paragraph لأن docx مفهوش "بطاقة" جاهزة.
  const boxBorder = { style: BorderStyle.SINGLE, size: 6, color: '1a1a2e' } as const;
  const boxParagraphs = boxSection
    ? boxSection.text.split('\n').map((line, i, arr) =>
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          indent: { left: 2400 },
          spacing: { after: i === arr.length - 1 ? 300 : 0 },
          border: {
            top: i === 0 ? boxBorder : undefined,
            bottom: i === arr.length - 1 ? boxBorder : undefined,
            left: boxBorder,
            right: boxBorder,
          },
          children: [new TextRun({ text: line || ' ', font: 'Amiri', size: 22 })],
        })
      )
    : [];

  const docxDocument = new DocxDocument({
    sections: [{
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          bidirectional: true,
          children: [new TextRun({ text: ctx.officeName || '', bold: true, size: 28, font: 'Amiri' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          bidirectional: true,
          children: [new TextRun({ text: [ctx.officePhone, ctx.officeAddress].filter(Boolean).join(' — '), size: 18, font: 'Amiri' })],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          bidirectional: true,
          children: [new TextRun({ text: ctx.templateName, bold: true, size: 32, font: 'Amiri' })],
        }),
        new Paragraph({ text: '' }),
        ...boxParagraphs,
        ...bodyParagraphs,
      ],
    }],
  });

  const blob = await Packer.toBlob(docxDocument);

  const result = await uploadExportedFile({
    blob,
    ext: 'docx',
    fileType: 'docx',
    caseId: ctx.document.case_id,
    generatedDocumentId: documentId,
    fileNameLabel: `${ctx.templateName}.docx`,
  });
  await markExported(documentId);
  return result;
}
