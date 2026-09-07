// ⚡ REFACTOR (خطة تحسين الأداء — المرحلة 4، 7 سبتمبر 2026): getCaseRecord
// كانت مُعرَّفة جوه useCaseActions.ts نفسه، وبتُستخدم من الاتنين
// (useCaseCrudActions.ts وuseCaseClientLinking.ts) — نُقلت هنا كـfactory
// عشان الاتنين يقدروا يستخدموها من غير تكرار الكود. المنطق نفسه حرفيًا،
// نفس تعليق الفيكس الأصلي (فيكس فئة "اليتيم الوهمي" — 8 أغسطس 2026):
// cases فوق مقيّدة بالصفحة (PAGE_SIZE=15) وبالفلتر — قضية بحالة مختلفة
// عن الفلتر المفتوح حاليًا (أو خارج الصفحة الأولى) مش هتكون موجودة في
// cases أصلًا، فبنرجع نجيبها مباشرة من الداتابيز لو مش لاقينها محليًا.
import { db } from '../../../../supabaseClient';
import type { MappedCase } from '../../../../hooks/useAppData';

export type CaseRecordLookupResult = { updated_at: string | null; client_id: string | null; title: string | null; type: string | null } | null;

export function createGetCaseRecord(cases: MappedCase[]) {
    return async function getCaseRecord(caseId: string): Promise<CaseRecordLookupResult> {
        const local = cases.find((c) => c.id === caseId);
        if (local) return { updated_at: local.updated_at, client_id: local.client_id, title: local.title, type: local.type };
        const { data, error } = await db
            .from('cases')
            .select('id,updated_at,client_id,title,case_type')
            .eq('id', caseId)
            .maybeSingle();
        if (error || !data) return null;
        return {
            updated_at: data.updated_at || null,
            client_id: data.client_id || null,
            title: data.title || null,
            type: (data as unknown as { case_type: string | null }).case_type || null,
        };
    };
}
