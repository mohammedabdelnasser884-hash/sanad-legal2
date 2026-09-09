// ⚡ REFACTOR (خطة تحسين الأداء — المرحلة 4، 7 سبتمبر 2026): هذا الملف كان
// جزء من useCaseActions.ts (1355 سطر) — اتفصل هنا كـ"وحدة ربط/فك ربط
// الموكل" (على مستوى القضية كلها أو طرف بعينه) منفصلة عن وحدة CRUD
// (useCaseCrudActions.ts). المنطق الداخلي لكل دالة نُقل حرفيًا من غير أي
// تغيير — نفس أسلوب النقل بالاستخراج المباشر (sed) لتجنب أي خطأ نسخ يدوي.
// راجع useCaseActions.ts للتوقيع العام وطريقة تجميع الوحدتين مع بعض.
import { toast } from '../../../../shared/lib/notifications';
import { logActivity } from '../../../../shared/lib/dataAccess';
import { showErrorToast } from '../../../../shared/lib/errorReporting';
import { recordSuccess } from '../../../../systemHealth';
import { db } from '../../../../supabaseClient';
import { linkClientToParty, unlinkClientFromParty } from '../../../calendar/hooks/caseSessionLinkingShared';
import type { CaseActionsParams } from './types';
import type { createGetCaseRecord } from './caseRecordLookup';

export function createCaseClientLinking(
    params: CaseActionsParams,
    getCaseRecord: ReturnType<typeof createGetCaseRecord>
) {
    const {
        fetchCases, clients, selectedCase,
        setCases, setSelectedCase,
        casesFilter, profile,
    } = params;
    const _userName = profile?.full_name || null;

    // ─ ربط قضية بموكل ─
    // ⚡ NEW (19 يوليو 2026): قبل كده مافيش أي طريقة تربط قضية بموكل بعد
    // إنشائها (NewCaseModal بس هو اللي بيحدد client_id وقت الإنشاء، و
    // EditCaseModal مابيبعتش client_id خالص — شوف تعليق CaseFormSubmitData
    // فوق). الدالة دي بتحدّث عمود client_id بس، من غير ما تلمس أي حقل تاني
    // في القضية (بعكس handleUpdateCase اللي بيعيد كتابة كل الحقول من الـ form).
    const handleLinkClient = async (caseId: string, clientId: string) => {
        // 🔒 FIX (8 أغسطس 2026): getCaseRecord بدل cases.find(id) الخام —
        // شوف تعليق getCaseRecord فوق، نفس الأسباب.
        const existingCase = await getCaseRecord(caseId);
        const linkedClient = clients.find((cl) => cl.id === clientId);
        const knownUpdatedAt = existingCase?.updated_at
            || (selectedCase?.id === caseId ? selectedCase?.updated_at : null)
            || null;
        // ⚡ CHANGED (خطة تفكيك legacy columns — Phase F.1، 6 أغسطس 2026):
        // كانت هنا مزامنة plaintiff/plaintiff_national_id/
        // plaintiff_power_of_attorney/plaintiff_address من ملف الموكل —
        // مصدر كتابة تاني للأعمدة القديمة (مرحلة "توحيد مصدر بيانات
        // الموكل" السابقة). دلوقتي بنحدّث client_id بس؛ لا يوجد أي مكان
        // في الواجهة بيعرض الأعمدة دي مباشرة بعد مراحل B.1-B.4 (كلها
        // بتقرا من case_parties)، فمفيش داعي نكتبها هنا خالص.
        const { error, offline, queued, conflict, data: writtenRow } = await window.__dbWrite({
            type: 'UPDATE', table: 'cases', data: { client_id: clientId }, id: caseId, knownUpdatedAt
        });
        if (offline && queued) {
            toast('📥 الربط محفوظ محلياً — سيُزامن عند عودة الإنترنت');
            setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, client_id: clientId } : c));
            if (selectedCase?.id === caseId) setSelectedCase((p) => p ? { ...p, client_id: clientId } : p);
            return;
        }
        if (conflict) {
            toast('⚠️ هذه القضية عدّلها شخص آخر بعد ما فتحتها — أعد فتحها وحاول الربط مرة أخرى', true);
            return;
        }
        if (error) {
            showErrorToast('case_client_link', error, 'فشل ربط القضية بالموكل — تحقق من الاتصال وأعد المحاولة', 'ربط قضية بموكل');
            return;
        }
        const clientName = linkedClient?.full_name || null;
        toast('✅ تم ربط القضية بالموكل');
        logActivity(db, 'ربط قضية بموكل', {
            userName: _userName,
            entity_type: 'case', entity_id: caseId, details: existingCase?.title || null,
            case_name: existingCase?.title || null,
            client_name: clientName,
        });
        const freshFields = writtenRow?.updated_at ? { updated_at: writtenRow.updated_at } : {};
        setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, client_id: clientId, ...freshFields } : c));
        if (selectedCase?.id === caseId) setSelectedCase((p) => p ? { ...p, client_id: clientId, ...freshFields } : p);
        fetchCases(0, casesFilter);
    };

    // ─ ربط طرف بعينه (case_parties) بموكل موجود ─ (خطة توحيد منطق إنشاء/
    // ربط الموكل، Phase 3 — 4 أغسطس 2026)
    // ⚡ NEW: نفس فكرة handleLinkClient فوق، بس بيستخدم linkClientToParty
    // المشتركة (case_parties.client_id للطرف ده بس + cases.client_id لو
    // الطرف أساسي فقط) بدل ما يحدّث القضية كلها زي موكل واحد — بيسمح بربط
    // موكل موجود لأي طرف من أطراف القضية (مش بس أول طرف)، بنفس فلسفة
    // onCreateAndLinkClientForParty (إنشاء موكل جديد لطرف بعينه) الموجودة
    // بالفعل. caseId لازم يكون id حقيقي دايمًا (الزرار بيظهر بس جوه
    // InfoSection.tsx لقضية محفوظة بالفعل). onAfterLink بتتنادى بعد نجاح
    // الربط عشان caseParties تتحدّث فورًا (نفس نمط onCreateAndLinkClientForParty
    // في CaseDetailView.tsx).
    // ⚡ NEW (خطة توحيد "ربط طرف بموكل موجود" — مرحلة 2، 6 أغسطس 2026):
    // باراميتر سادس جديد `knownUpdatedAt` — case_parties.updated_at اللي
    // InfoSection.tsx شايفها وقت عرض الطرف (من caseParties prop)، بتتبعت
    // لـlinkClientToParty عشان تفعّل القفل التفاؤلي. تعارض بيرجّع رسالة
    // مخصصة (نفس نمط handleLinkClient لمستوى القضية كلها) بدل رسالة فشل
    // عامة.
    // ⚡ NEW (خطة توحيد "ربط طرف بموكل موجود" — مرحلة 3، 6 أغسطس 2026):
    // knownCaseUpdatedAt بيتحسب هنا بنفس طريقة handleLinkClient فوق بالحرف
    // (existingCase?.updated_at، أو selectedCase لو هو نفس القضية المفتوحة)
    // ويتبعت لـlinkClientToParty عشان يفعّل القفل التفاؤلي على cases.client_id
    // كمان (كان الفجوة الموثّقة في قسم 3/6 من تقرير المرحلة 2) — قبل كده
    // كان بس case_parties.client_id (الطرف نفسه) محمي، وcases.client_id
    // (لو الطرف أساسي) بيتكتب فوق أي تعديل تاني حصل على القضية نفسها من
    // غير أي تنبيه. result.conflictScope بيفرّق الرسالة: 'party' (زي قبل
    // كده) أو 'case' (جديد) — الطرف اتربط بنجاح فعلاً في حالة 'case'،
    // فالرسالة بتوضح إن القضية الأساسية هي اللي اتعدلت مش الطرف.
    const handleLinkClientForParty = async (caseId: string, partyId: string, clientId: string, isPrimaryParty: boolean, knownUpdatedAt: string | null, onAfterLink: () => void) => {
        // 🔒 FIX (8 أغسطس 2026): getCaseRecord بدل cases.find(id) الخام.
        const existingCase = await getCaseRecord(caseId);
        const linkedClient = clients.find((cl) => cl.id === clientId);
        const knownCaseUpdatedAt = existingCase?.updated_at
            || (selectedCase?.id === caseId ? selectedCase?.updated_at : null)
            || null;
        // ⚡ NEW (خطة توحيد "ربط طرف بموكل موجود" — مرحلة 1، فقرة 6 من
        // التقرير): كانت الدالة دي بتحدّث client_id بس، وتسيب اسم/رقم
        // قومي/توكيل/عنوان الطرف زي ما هي (بيانات حرة قديمة ممكن تختلف
        // عن ملف الموكل) — وأخطر حاجة إن syncCaseParties كان بيعيد كتابة
        // نفس القيم القديمة تاني عند أي حفظ عادي بعد كده. دلوقتي بنزامن
        // الحقول دي من ملف الموكل في نفس عملية الربط، بنفس فلسفة
        // handleLinkClient فوق بالظبط (InfoSection.tsx هي اللي بتعرض
        // تأكيد التعارض قبل ما توصل هنا لو فيه قيم حرة مختلفة).
        const syncFields = linkedClient ? {
            name: linkedClient.full_name || '',
            national_id: linkedClient.national_id || '',
            power_of_attorney: linkedClient.cr_number || '',
            address: linkedClient.address || '',
        } : undefined;
        const result = await linkClientToParty(partyId, clientId, isPrimaryParty, caseId, existingCase?.title || undefined, undefined, syncFields, knownUpdatedAt, knownCaseUpdatedAt);
        if (result.conflict) {
            if (result.conflictScope === 'case') {
                toast('⚠️ الطرف اترّبط، لكن القضية نفسها عدّلها شخص آخر — أعد فتحها لمراجعة بيانات الموكل الأساسي', true);
            } else {
                toast('⚠️ هذا الطرف عدّله شخص آخر بعد ما فتحت القضية — أعد فتحها وحاول الربط مرة أخرى', true);
            }
            return;
        }
        if (!result.ok) {
            showErrorToast('party_client_link', new Error('link party to existing client failed'), 'تعذّر ربط الموكل بهذا الطرف. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'ربط طرف بموكل');
            return;
        }
        recordSuccess('party_client_link');
        toast('✅ تم ربط الطرف بالموكل' + (linkedClient?.full_name ? ` "${linkedClient.full_name}"` : ''));
        logActivity(db, 'ربط طرف بموكل', {
            userName: _userName,
            entity_type: 'case', entity_id: caseId, details: existingCase?.title || null,
            case_name: existingCase?.title || null,
            client_name: linkedClient?.full_name || null,
        });
        // ⚡ لو الطرف أساسي، cases.client_id اتحدّث كمان جوه linkClientToParty —
        // بنعمل fetchCases عشان أي مكان تاني بيعرض القضية (زي الليستة) يتحدّث،
        // بنفس فلسفة handleLinkClient فوق.
        if (isPrimaryParty) fetchCases(0, casesFilter);
        onAfterLink();
    };

    // ─ فك ربط قضية عن موكلها ─
    // ⚡ NEW (خطة توحيد مصدر بيانات الموكل، مرحلة 4): عكس handleLinkClient
    // بالظبط — بتصفّر عمود client_id بس (ترجعه NULL) من غير ما تلمس أي
    // حقل تاني في القضية (الاسم/الرقم القومي/التوكيل/العنوان بتاعت
    // القضية بتفضل زي ما هي كانت آخر مرة، بس دلوقتي بقت بيانات حرة قابلة
    // للتعديل بدل ما تتقرا من ملف الموكل — نفس آلية EditCaseModal.tsx
    // اللي بتحدد isLinked من client_id).
    // 🔒 FIX (توحيد فك ربط الطرف الأساسي — 8 أغسطس 2026): الدالة دي كانت
    // بتصفّر cases.client_id بس، من غير ما تلمس صف case_parties المطابق
    // للطرف الأساسي — لو القضية فيها بيانات أطراف (case_parties)، الصف
    // ده يفضل شايل client_id قديم، فـgetPartyState يصنّفه "طرف ثانوي
    // مربوط" لسه بدل حر رغم إن cases.client_id بقى null. syncPrimaryParty
    // تحت best-effort ومنفصلة تمامًا عن نجاح/فشل العملية الأساسية —
    // فشلها (تعارض أو خطأ شبكة) بيطلع تنبيه إضافي بس، ومش بيرجّع تصفير
    // cases.client_id للخلف ولا يمنع نجاح التوست الأساسي (نفس فلسفة
    // partiesResult/identitySyncResult في StandaloneSessionDetailModal.tsx).
    // القضايا القديمة اللي مالهاش case_parties أصلًا (fallback الشرط
    // `matchedParty` تحت) — صفر تغيير سلوك، بترجع بالظبط لما كانت عليه.
    const syncUnlinkedPrimaryParty = async (caseId: string, unlinkedClientId: string | null) => {
        if (!unlinkedClientId) return;
        try {
            const { data: matchedParty } = await db.from('case_parties')
                .select('id,updated_at')
                .eq('case_id', caseId)
                .eq('client_id', unlinkedClientId)
                .eq('is_client', true)
                .limit(1)
                .maybeSingle();
            if (!matchedParty) return;
            const partyResult = await window.__dbWrite({
                type: 'UPDATE', table: 'case_parties', id: matchedParty.id,
                data: { client_id: null }, knownUpdatedAt: matchedParty.updated_at ?? null,
            });
            if (partyResult.conflict) {
                toast('⚠️ فُك ربط القضية، لكن بيانات الطرف الأساسي عدّلها شخص آخر — راجعها من تاب الأطراف', true);
                return;
            }
            if (partyResult.error) {
                toast('⚠️ فُك ربط القضية، لكن حصل خطأ في مزامنة بيانات الطرف الأساسي — راجعها من تاب الأطراف', true);
            }
        } catch {
            // best-effort — أي خطأ غير متوقع هنا مبيأثرش على نجاح فك ربط القضية نفسه.
        }
    };

    const handleUnlinkClient = async (caseId: string) => {
        // 🔒 FIX (8 أغسطس 2026): getCaseRecord بدل cases.find(id) الخام.
        const existingCase = await getCaseRecord(caseId);
        const knownUpdatedAt = existingCase?.updated_at
            || (selectedCase?.id === caseId ? selectedCase?.updated_at : null)
            || null;
        const unlinkedClientId = existingCase?.client_id
            || (selectedCase?.id === caseId ? selectedCase?.client_id : null)
            || null;
        const { error, offline, queued, conflict, data: writtenRow } = await window.__dbWrite({
            type: 'UPDATE', table: 'cases', data: { client_id: null }, id: caseId, knownUpdatedAt
        });
        if (offline && queued) {
            toast('📥 فك الربط محفوظ محلياً — سيُزامن عند عودة الإنترنت');
            setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, client_id: null } : c));
            if (selectedCase?.id === caseId) setSelectedCase((p) => p ? { ...p, client_id: null } : p);
            await syncUnlinkedPrimaryParty(caseId, unlinkedClientId);
            return;
        }
        if (conflict) {
            toast('⚠️ هذه القضية عدّلها شخص آخر بعد ما فتحتها — أعد فتحها وحاول فك الربط مرة أخرى', true);
            return;
        }
        if (error) {
            showErrorToast('case_client_unlink', error, 'فشل فك ربط القضية عن الموكل — تحقق من الاتصال وأعد المحاولة', 'فك ربط قضية عن موكل');
            return;
        }
        toast('✅ تم فك الربط — بيانات الموكل في القضية بقت قابلة للتعديل الحر');
        logActivity(db, 'فك ربط قضية عن موكل', {
            userName: _userName,
            entity_type: 'case', entity_id: caseId, details: existingCase?.title || null,
            case_name: existingCase?.title || null,
        });
        const freshFields = writtenRow?.updated_at ? { updated_at: writtenRow.updated_at } : {};
        setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, client_id: null, ...freshFields } : c));
        if (selectedCase?.id === caseId) setSelectedCase((p) => p ? { ...p, client_id: null, ...freshFields } : p);
        fetchCases(0, casesFilter);
        await syncUnlinkedPrimaryParty(caseId, unlinkedClientId);
    };

    // ─ فك ربط طرف بعينه (case_parties) عن موكله ─ (خطة توحيد مصدر بيانات
    // الموكل، "إصلاح 5" — 5 أغسطس 2026)
    // ⚡ NEW: عكس handleLinkClientForParty فوق بالظبط — بتصفّر
    // case_parties.client_id للطرف ده بس (+ cases.client_id لو الطرف
    // أساسي) عبر unlinkClientFromParty المشتركة، من غير ما تلمس أي حقل
    // تاني (اسم/رقم قومي/توكيل/عنوان الطرف بتفضل زي ما هي — بيانات حرة
    // قابلة للتعديل، نفس فلسفة handleUnlinkClient لمستوى القضية كلها).
    // caseId لازم يكون id حقيقي دايمًا (الزرار بيظهر بس جوه InfoSection.tsx
    // لقضية محفوظة بالفعل). onAfterLink بتتنادى بعد نجاح فك الربط عشان
    // caseParties تتحدّث فورًا (نفس نمط handleLinkClientForParty).
    // ⚡ NEW (خطة توحيد "ربط طرف بموكل موجود" — مرحلة 2، 6 أغسطس 2026):
    // نفس إضافة knownUpdatedAt في handleLinkClientForParty فوق بالحرف.
    // ⚡ NEW (مرحلة 3، 6 أغسطس 2026): نفس إضافة knownCaseUpdatedAt +
    // تفريق conflictScope في handleLinkClientForParty فوق بالحرف.
    const handleUnlinkClientForParty = async (caseId: string, partyId: string, isPrimaryParty: boolean, knownUpdatedAt: string | null, onAfterLink: () => void) => {
        // 🔒 FIX (8 أغسطس 2026): getCaseRecord بدل cases.find(id) الخام.
        const existingCase = await getCaseRecord(caseId);
        const knownCaseUpdatedAt = existingCase?.updated_at
            || (selectedCase?.id === caseId ? selectedCase?.updated_at : null)
            || null;
        const result = await unlinkClientFromParty(partyId, isPrimaryParty, caseId, knownUpdatedAt, knownCaseUpdatedAt);
        if (result.conflict) {
            if (result.conflictScope === 'case') {
                toast('⚠️ فُك الربط عن الطرف، لكن القضية نفسها عدّلها شخص آخر — أعد فتحها لمراجعة بيانات الموكل الأساسي', true);
            } else {
                toast('⚠️ هذا الطرف عدّله شخص آخر بعد ما فتحت القضية — أعد فتحها وحاول فك الربط مرة أخرى', true);
            }
            return;
        }
        if (!result.ok) {
            showErrorToast('party_client_unlink', new Error('unlink party from client failed'), 'تعذّر فك ربط الطرف عن الموكل. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'فك ربط طرف عن موكل');
            return;
        }
        recordSuccess('party_client_unlink');
        toast('✅ تم فك ربط الطرف عن الموكل — بياناته بقت قابلة للتعديل الحر');
        logActivity(db, 'فك ربط طرف عن موكل', {
            userName: _userName,
            entity_type: 'case', entity_id: caseId, details: existingCase?.title || null,
            case_name: existingCase?.title || null,
        });
        // ⚡ لو الطرف أساسي، cases.client_id اتصفّر كمان جوه unlinkClientFromParty —
        // بنعمل fetchCases عشان أي مكان تاني بيعرض القضية (زي الليستة) يتحدّث،
        // بنفس فلسفة handleUnlinkClient فوق.
        if (isPrimaryParty) fetchCases(0, casesFilter);
        onAfterLink();
    };

    return { handleLinkClient, handleLinkClientForParty, handleUnlinkClient, handleUnlinkClientForParty };
}
