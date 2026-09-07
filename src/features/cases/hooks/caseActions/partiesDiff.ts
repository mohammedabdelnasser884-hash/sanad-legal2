// ⚡ REFACTOR (خطة تحسين الأداء — المرحلة 4، 7 سبتمبر 2026): نُقلت من
// useCaseActions.ts (كانت هناك function عادية على مستوى الملف، مش جوه
// الهوك) من غير أي تغيير في المنطق — بتُستخدم في handleUpdateCase بس
// (useCaseCrudActions.ts) حاليًا.
import { buildFieldDiff, type FieldDiffMap, type FieldDiffEntry } from '../../../../shared/lib/dataAccess';
import type { ClientRow } from '../../../../types';
import type { PartyFieldValue } from '../../../../shared/parties/partyTypes';

// ⚡ NEW (سجل النشاط — تتبع التغييرات، مرحلة 4.4، 19 أغسطس 2026): ديف
// أطراف الدعوى (case_parties) — منفصل عن caseFieldDiffMap/buildFieldDiff
// اللي بيقارنوا كائن واحد بحقول ثابتة، لأن هنا عندنا *array* أطراف ممكن
// تتغيّر (تعديل طرف موجود) أو يتضاف/يتشال منها طرف كامل. بيرجّع نفس شكل
// FieldDiffEntry[] بالظبط (عشان ActivitySection.tsx يعرضهم من غير أي
// تعديل في الواجهة — نفس صف "🏷 label: قديم ← جديد" الموجود بالفعل).
//
// المنطق:
// - طرف اتشال (id كان في existingIds ومش موجود في parties الجديدة):
//   صف واحد "{مدعي/مدعى عليه} محذوف: اسمه ← —".
// - طرف جديد (id مش في existingIds): صف واحد "{مدعي/مدعى عليه} جديد: — ← اسمه".
// - طرف موجود اتعدّل: buildFieldDiff عادي بين القديم والجديد على 5 حقول
//   نصية + is_client (بولين، بيتحوّل "نعم"/"لا") + client_id (بيتحوّل
//   لاسم الموكل زي caseFieldDiffMap فوق بالظبط) — بادئة label برقم/جهة
//   الطرف (زي "مدعي 1: الاسم") عشان يبين مين بالظبط اتغيّر لو أكتر من طرف.
//   field بيتبدأ بـ party_{id}_ عشان يفضل unique (React key في الواجهة).
export function buildPartiesDiff(
    oldParties: PartyFieldValue[] | undefined,
    newParties: PartyFieldValue[] | undefined,
    existingIds: string[],
    clients: ClientRow[]
): FieldDiffEntry[] {
    if (!newParties || !oldParties) return [];
    const oldById = new Map(oldParties.map((p) => [p.id, p]));
    const newIds = new Set(newParties.map((p) => p.id));
    const sideLabel = (side: PartyFieldValue['side']) => (side === 'plaintiff' ? 'مدعي' : 'مدعى عليه');
    const entries: FieldDiffEntry[] = [];

    // 1) أطراف اتشالت من الفورم
    for (const oldId of existingIds) {
        if (newIds.has(oldId)) continue;
        const old = oldById.get(oldId);
        if (!old) continue;
        entries.push({
            field: `party_${oldId}_removed`,
            label: `${sideLabel(old.side)} محذوف`,
            old: old.name?.trim() || 'بدون اسم',
            new: '—',
        });
    }

    // 2) أطراف جديدة/معدّلة، بترتيب ظهورها الحالي (نفس ترتيب sort_order)
    const sideCounters: Record<string, number> = {};
    for (const p of newParties) {
        sideCounters[p.side] = (sideCounters[p.side] || 0) + 1;
        const partyLabel = `${sideLabel(p.side)} ${sideCounters[p.side]}`;
        if (!existingIds.includes(p.id)) {
            entries.push({
                field: `party_${p.id}_added`,
                label: `${partyLabel} (جديد)`,
                old: '—',
                new: p.name?.trim() || 'بدون اسم',
            });
            continue;
        }
        const old = oldById.get(p.id);
        if (!old) continue;
        const partyFieldMap: FieldDiffMap = {
            name: { label: `${partyLabel}: الاسم` },
            capacity: { label: `${partyLabel}: الصفة` },
            national_id: { label: `${partyLabel}: الرقم القومي` },
            address: { label: `${partyLabel}: العنوان` },
            power_of_attorney: { label: `${partyLabel}: التوكيل` },
            is_client: { label: `${partyLabel}: موكل المكتب؟`, format: (v) => (v ? 'نعم' : 'لا') },
            client_id: {
                label: `${partyLabel}: مرتبط بموكل`,
                format: (v) => clients.find((cl) => cl.id === v)?.full_name || '',
            },
        };
        const partyDiffs = buildFieldDiff(
            old as unknown as Record<string, unknown>,
            p as unknown as Record<string, unknown>,
            partyFieldMap
        );
        for (const d of partyDiffs) {
            entries.push({ ...d, field: `party_${p.id}_${d.field}` });
        }
    }

    return entries;
}
