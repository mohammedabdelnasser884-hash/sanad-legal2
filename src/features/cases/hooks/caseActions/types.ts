// ⚡ REFACTOR (خطة تحسين الأداء — المرحلة 4، 7 سبتمبر 2026): الأنواع دي
// كانت متعرّفة جوه useCaseActions.ts نفسه (1355 سطر) — اتنقلت هنا كجزء
// من تفكيك الملف لملفات أصغر حسب المسؤولية، من غير أي تغيير في اسم أو
// شكل النوعين. useCaseActions.ts بيعمل لهم re-export عشان أي كود بره
// (App.tsx, AppModals.tsx, NewCaseModal.tsx, CaseDetailView.tsx,
// EditCaseModal.tsx) يفضل يستورد من نفس المسار القديم من غير أي تعديل.
import type { Dispatch, SetStateAction } from 'react';
import type { ClientRow, ProfileRow } from '../../../../types';
import type { NavigationState } from '../../../../useNavigation';
import type { MappedCase } from '../../../../hooks/useAppData';
import type { PartyFieldValue } from '../../../../shared/parties/partyTypes';

// شكل البيانات اللي بتوصل فعليًا من NewCaseModal/EditCaseModal لـ onSave —
// اتحقق من كل استخدام حقيقي في handleSaveCase/handleUpdateCase تحت، وبيغطي
// اتحاد الحقول اللي بيبعتها الفورمين (كل الحقول optional غير title، لأن
// EditCaseModal مثلاً مابيبعتش client_id خالص، وكل حقل تاني ممكن يوصل
// فاضي حسب حالة الفورم وقت الإرسال).
export interface CaseFormSubmitData {
    title: string;
    number?: string;
    caseNum?: string;
    caseYear?: string;
    court?: string;
    type?: string;
    status?: string;
    client_id?: string;
    plaintiff?: string;
    plaintiff_role?: string;
    defendant?: string;
    defendant_role?: string;
    court_level?: string;
    circuit_number?: string;
    date?: string;
    session_time?: string;
    court_floor?: string;
    court_hall?: string;
    session_hall?: string;
    secretary_hall?: string;
    secretary_name?: string;
    secretary_mobile?: string;
    plaintiff_national_id?: string;
    plaintiff_power_of_attorney?: string;
    defendant_national_id?: string;
    // ⚡ NEW (21 يوليو 2026): عنوان الموكل — راجع NewCaseModal/EditCaseModal.
    plaintiff_address?: string;
    // 🆕 (خطة "المسمى القانوني" — مرحلة 3، 23 يوليو 2026): المسمى الجامع
    // لكل جهة (usePartyFields().legalTitles) — بيوصل فاضي ('') من الفورم
    // لو الجهة فيها شخص واحد بس (نفس افتراضي validateParties).
    plaintiff_legal_title?: string;
    defendant_legal_title?: string;
    // ⚡ NEW (مرحلة 4.2 — خطة تعدد الأطراف، 22 يوليو 2026): array أطراف
    // الدعوى الكامل (usePartyFields().parties) — لو موجودة، handleSaveCase
    // بيكتب صف في case_parties لكل طرف (بالإضافة لمزامنة الأعمدة القديمة
    // فوق من "الطرف الأساسي" في كل جهة، اللي بتحصل زي ما هي بالظبط).
    // اختيارية عشان أي كود قديم/تستات بتبعت الشكل القديم من غيرها تفضل شغالة.
    parties?: PartyFieldValue[];
    // ⚡ NEW (مرحلة 5.2 — خطة تعدد الأطراف، 22 يوليو 2026): بس من
    // EditCaseModal — أرقام (ids) صفوف case_parties الحقيقية اللي كانت
    // موجودة فعلاً وقت فتح الفورم (existingPartyRows وقت الـ mount، شوف
    // مرحلة 5.1). handleUpdateCase بيستخدمها عشان يفرّق تعديل (id موجود
    // في القايمة دي) عن إضافة جديدة (id مؤقت `legacy-*`/`party-*` مش
    // موجود فيها)، وكمان عشان يحدد أي صف قديم اتشال من الفورم فيحذفه.
    // مفيش داعي نستعلم تاني من الداتابيز وقت الحفظ — النسخة اللي أُخذت
    // وقت الفتح كافية للمقارنة وبتشتغل حتى أوفلاين.
    existingPartyIds?: string[];
    // ⚡ NEW (سجل النشاط — تتبع التغييرات، مرحلة 4.4، 19 أغسطس 2026): نفس
    // existingPartyIds فوق بس بالبيانات الكاملة مش الـid بس — snapshot
    // من case_parties وقت فتح فورم التعديل (existingPartyRows في
    // EditCaseModal الخارجي)، قبل أي تعديل من المستخدم. handleUpdateCase
    // بيستخدمها كـ"قديم" لمقارنة كل طرف مع نظيره في parties (الجديد) —
    // بس من EditCaseModal (NewCaseModal مفيهاش "قديم" أصلاً، القضية
    // بتتعمل جديدة). اختيارية زي existingPartyIds، عشان أي كود قديم
    // بيبعت الشكل القديم من غيرها يفضل شغال (هيبقى بس من غير ديف أطراف).
    existingParties?: PartyFieldValue[];
}

// شكل بيانات مودال تأكيد الحذف/الأرشفة (زي ما بيتبنى في handleDeleteCase تحت)
// مُصدَّرة عشان App.tsx يقدر يحدد نوع state الـ deleteConfirm بيها بدل any.
export interface DeleteConfirmState {
    type: string;
    id: string;
    name: string;
    itemType: string;
    title: string;
    // mode/onConfirm: تفضل شغالة لأي استخدام قديم بيثبّت وضع واحد (زي الموكلين حاليًا).
    // لما mode متبعتش، المودال بيعرض شاشة اختيار (أرشفة/حذف نهائي) وينده
    // onConfirmArchive أو onConfirmDelete حسب اختيار المستخدم (شوف handleDeleteCase تحت).
    mode?: 'archive' | 'delete';
    onConfirm?: () => void | Promise<void>;
    onConfirmArchive?: () => void | Promise<void>;
    onConfirmDelete?: () => void | Promise<void>;
    // نقاط تحذير مخصصة لحالة الحذف النهائي (شوف نفس الحقل فى DeleteConfirmModalProps) —
    // بتوضح للمستخدم بالظبط إيه اللي هيتحذف فعليًا وإيه اللي هيفضل موجود بربط مصفّر.
    deleteConsequences?: string[];
}

// ⚡ REFACTOR (المرحلة 4، 7 سبتمبر 2026): نفس شكل باراميتر useCaseActions
// الأصلي بالحرف — منقول هنا كنوع مُسمّى (CaseActionsParams) عشان
// useCaseCrudActions.ts وuseCaseClientLinking.ts يقدروا يستخدموه مع بعض
// من غير تكرار تعريفه، والملف المنسّق (useCaseActions.ts) يفضل بنفس
// التوقيع العام تمامًا زي ما كان.
export interface CaseActionsParams {
    sendTelegram: (text: string) => void | Promise<void>;
    fetchCases: (page?: number, filter?: string) => void | Promise<void>;
    cases: MappedCase[];
    lawyers: ProfileRow[];
    clients: ClientRow[];
    selectedCase: MappedCase | null;
    setCases: Dispatch<SetStateAction<MappedCase[]>>;
    setLawyers: Dispatch<SetStateAction<ProfileRow[]>>;
    setClients: Dispatch<SetStateAction<ClientRow[]>>;
    setProfile: Dispatch<SetStateAction<ProfileRow | null>>;
    setAuthUser: (user: { id: string; email?: string | null } | null) => void;
    setSelectedCase: Dispatch<SetStateAction<MappedCase | null>>;
    setDeleteConfirm: (v: DeleteConfirmState | null) => void;
    setSavingCase: Dispatch<SetStateAction<boolean>>;
    // ⚠️ مش Dispatch حقيقي — دي دالة مخصصة في App.tsx بتنادي nav.openModal/
    // closeModal، مش useState setter. اتحقق من الشكل الفعلي في App.tsx
    // (BUILD FIX: كانت متعرّفة غلط كـ Dispatch<SetStateAction<boolean>>
    // وده كسر build حقيقي على Vercel).
    setShowCaseModal: (v: boolean) => void;
    casesFilter: string;
    nav: NavigationState;
    profile?: ProfileRow | null;
}
