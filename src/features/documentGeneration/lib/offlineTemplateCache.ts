// ══════════════════════════════════════════════════════════════════
// offlineTemplateCache.ts — بند 4 (الأوفلاين) من سجل القرارات، خطوة 1
// المرجع: Sanad_Legal_Documents_Master_Report.md، القسم 17.6 ("خيار أ")
//
// Cache محلي بسيط (sessionStorage) لنسخة القالب المنشورة + حقولها +
// القيم المحلولة تلقائيًا (initialValues)، بيتخزن أول ما المحامي يفتح
// شاشة التوليد وهو أونلاين. لو رجع لنفس الشاشة (نفس templateId/caseId/
// sourceMode) وهو أوفلاين، useGenerateDocument.ts بيقرا من هنا بدل ما
// يرفض التحميل فورًا برسالة "أنت أوف لاين".
//
// ⚠️ sessionStorage مقصودة (مش localStorage): الكاش ده تحسين مؤقت لجلسة
// الاستخدام الحالية بس، مش أرشيف دائم — لو المستخدم قفل التاب/التطبيق
// وفتحه تاني، من المفروض يبقى أونلاين عادةً وقتها فيحمّل نسخة حديثة من
// السيرفر تاني بدل ما يعتمد على كاش ممكن يبقى قديم.
// ══════════════════════════════════════════════════════════════════

import type { TemplateField, ResolvedBindings, SourceMode } from '../types';

interface CachedTemplateData {
  templateVersionId: string;
  bodyTemplate: string;
  fields: TemplateField[];
  initialValues: ResolvedBindings;
  cachedAt: number;
}

const CACHE_KEY_PREFIX = 'sanad_doc_gen_offline_cache';

function cacheKey(templateId: string, caseId: string | null, sourceMode: SourceMode): string {
  return `${CACHE_KEY_PREFIX}:${templateId}:${caseId ?? 'none'}:${sourceMode}`;
}

/** بيتنادى بعد نجاح تحميل الحقول أونلاين — بيحفظ نسخة محلية لاستخدامها لو رجع المستخدم أوفلاين */
export function saveOfflineTemplateCache(
  templateId: string,
  caseId: string | null,
  sourceMode: SourceMode,
  data: Omit<CachedTemplateData, 'cachedAt'>
): void {
  try {
    sessionStorage.setItem(
      cacheKey(templateId, caseId, sourceMode),
      JSON.stringify({ ...data, cachedAt: Date.now() })
    );
  } catch {
    // sessionStorage ممكن يفشل (وضع تصفح خفي، مساحة ممتلئة) — الكاش
    // تحسين اختياري بس، مفيش داعي نكسر أي حاجة لو الحفظ فشل.
  }
}

export function loadOfflineTemplateCache(
  templateId: string,
  caseId: string | null,
  sourceMode: SourceMode
): CachedTemplateData | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(templateId, caseId, sourceMode));
    if (!raw) return null;
    return JSON.parse(raw) as CachedTemplateData;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────
// مستند اتولّد أوفلاين (خطوة 3) بياخد id محلي مؤقت (زي offlineTempId في
// useCaseActions.ts بالظبط) — مش صف حقيقي في generated_documents لحد ما
// الطابور يتزامن، فمفيش id حقيقي متاح وقت التوليد نفسه. باقي الكود
// (شاشة المعاينة، خطوة 4) بيميّز المستند ده عن طريق البادئة دي بدل ما
// نضيف حقل جديد لـGeneratedDocument (types.ts ممنوع فيه إضافة حقول من
// غير تحديث الخطة الموحّدة الأصلية أولاً).
// ──────────────────────────────────────────────────────────────────
export const OFFLINE_GENERATED_DOC_ID_PREFIX = 'offline-doc-';

export function makeOfflineGeneratedDocId(): string {
  return `${OFFLINE_GENERATED_DOC_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isOfflineGeneratedDocId(id: string): boolean {
  return id.startsWith(OFFLINE_GENERATED_DOC_ID_PREFIX);
}
