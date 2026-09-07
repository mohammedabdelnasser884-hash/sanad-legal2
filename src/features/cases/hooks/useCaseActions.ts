// ⚡ REFACTOR (خطة تحسين الأداء — المرحلة 4، 7 سبتمبر 2026): هذا الملف كان
// 1355 سطر (كل منطق إدارة القضايا في مكان واحد). اتفكّك لـ5 ملفات أصغر
// حسب المسؤولية، جوه مجلد caseActions/:
//   - caseActions/types.ts            → CaseFormSubmitData, DeleteConfirmState, CaseActionsParams
//   - caseActions/partiesDiff.ts      → buildPartiesDiff (ديف أطراف الدعوى لسجل النشاط)
//   - caseActions/caseRecordLookup.ts → getCaseRecord (factory مشتركة بين الوحدتين تحت)
//   - caseActions/useCaseCrudActions.ts    → إنشاء/تعديل/حذف/أرشفة/استرجاع/تسجيل خروج
//   - caseActions/useCaseClientLinking.ts  → ربط/فك ربط الموكل (قضية كاملة أو طرف بعينه)
// هذا الملف بقى orchestrator رفيع بس: بيبني getCaseRecord مرة واحدة
// (بالظبط زي ما كان بيحصل قبل التفكيك — نفس عدد المرات، نفس القيمة)
// ويمررها للوحدتين، ويجمع نتيجتهم في نفس شكل الـreturn القديم بالحرف.
// التوقيع العام لـuseCaseActions(params) ونتيجته (كل أسماء الدوال
// المُرجعة) **لم يتغيّروا خالص** — أي كود بيستدعيها (App.tsx) مايحتاجش
// أي تعديل. الأنواع (CaseFormSubmitData, DeleteConfirmState) بتتصدّر من
// هنا بالـre-export عشان أي كود بيستوردهم من المسار القديم
// ('@/features/cases/hooks/useCaseActions') يفضل شغال من غير تعديل.
//
// ⚠️ النقل تم بالاستخراج المباشر (sed) من الملف الأصلي مش بإعادة الكتابة
// اليدوية، تحديدًا عشان نتجنب أي خطأ نسخ يدوي في منطق حساس (القفل
// التفاؤلي optimistic locking، طابور الأوفلاين، فحوصات تكرار رقم القيد).
// النسخة الأصلية الكاملة قبل التفكيك محفوظة كمرجع تاريخي — لو احتجنا
// نقارن أي سلوك بعد التفكيك بالأصل، أو Phase 4 عايزة تراجع.
export type { CaseFormSubmitData, DeleteConfirmState, CaseActionsParams } from './caseActions/types';

import type { CaseActionsParams } from './caseActions/types';
import { createGetCaseRecord } from './caseActions/caseRecordLookup';
import { createCaseCrudActions } from './caseActions/useCaseCrudActions';
import { createCaseClientLinking } from './caseActions/useCaseClientLinking';

export function useCaseActions(params: CaseActionsParams) {
    // نفس getCaseRecord بالظبط اللي كانت متعرّفة جوه الهوك قبل التفكيك —
    // بتتبنى مرة واحدة بس لكل نداء لـuseCaseActions (يعني لكل render في
    // App.tsx)، وبتتمرر للوحدتين عشان الاتنين يستخدموا نفس النسخة (بدل
    // ما كل وحدة تبني نسختها الخاصة من غير داعي).
    const getCaseRecord = createGetCaseRecord(params.cases);

    const crud = createCaseCrudActions(params, getCaseRecord);
    const linking = createCaseClientLinking(params, getCaseRecord);

    // نفس شكل الـreturn الأصلي بالحرف — نفس الترتيب، نفس الأسماء.
    return {
        handleLogout: crud.handleLogout,
        handleSaveCase: crud.handleSaveCase,
        handleDeleteCase: crud.handleDeleteCase,
        handlePermanentDeleteCase: crud.handlePermanentDeleteCase,
        handleRestoreCase: crud.handleRestoreCase,
        handleUpdateCase: crud.handleUpdateCase,
        handleLinkClient: linking.handleLinkClient,
        handleLinkClientForParty: linking.handleLinkClientForParty,
        handleUnlinkClient: linking.handleUnlinkClient,
        handleUnlinkClientForParty: linking.handleUnlinkClientForParty,
    };
}
