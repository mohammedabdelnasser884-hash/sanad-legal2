import { db } from '../supabaseClient';
import type { Database } from '../database.types';
import { lockErrorIfNoRowsAffected } from '../shared/lib/errorReporting';

// ══════════════════════════════════════════════════════════
//  __dbWrite — منقول من main.tsx (اتفصل بتاريخ 15 يوليو 2026 كجزء من خطة
//  تخفيف main.tsx)
//
//  🗑️ المرحلة 2 (إلغاء الأوفلاين في الكتابة، 13 سبتمبر 2026): كل بنية
//  الطابور المحلي (IndexedDB) + Background Sync + المزامنة التلقائية اتشالت
//  من هنا بالكامل (كانت في offlineSync.ts المحذوف + الجزء التحتاني من الملف
//  ده). الكتابة بقت تتطلب اتصال دايمًا (شوف تعليق المرحلة 1 جوه __dbWrite
//  تحت) — مفيش أي طابور يتقيّد فيه أصلاً. الباقي هنا (dbFrom،
//  stripOfflineSentinels، __dbWrite) هو بس اللي فضل مطلوب فعليًا.
// ══════════════════════════════════════════════════════════

// ⚠️ الجداول الحقيقية اللي ممكن توصل لـ __dbWrite — اتأكدت من كل نداء فعلي
// في المشروع كله (useCaseActions.ts، useClientActions.ts، useRemindersTab.ts).
export type DbWriteTable = 'clients' | 'cases' | 'case_sessions' | 'reminders' | 'case_fees' | 'fee_payments' | 'case_notes' | 'case_parties';

// ⚠️ قيد معروف في supabase-js + TypeScript: تسلسل .insert()/.update()/.delete()
// ثم .select()/.eq() على db.from(table) لما `table` يكون Generic (T extends
// DbWriteTable) بدل literal واحد ثابت بيخلي المكتبة تحاول تحل النوع على
// مستوى الـ schema كله (كل الجداول) بدل التلات جداول المسموحة بس، فبترجع
// أخطاء ضخمة (RejectExcessProperties/keyof) وقت البناء — نفس المشكلة ظهرت
// في useAdminBackup.ts مع دالة dynFrom لكن على نطاق أوسع هنا بسبب السلسلة
// الأطول (insert().select().single()، update().eq().select().single()).
// الحل: نأكد لـ TypeScript إن الجدول واحد من التلات المعروفين فعلاً (بنستخدم
// 'cases' كممثل — عنده نفس أعمدة id/updated_at المشتركة بين التلات جداول)
// وقت بناء الـ query builder بس. التحقق الحقيقي من اسم الجدول وقت الكتابة
// لسه قائم عن طريق `table: DbWriteTable` في توقيع الدالة الخارجية — الكاست
// هنا بيأثر بس على شكل الـ builder وقت الـ type-check، مش على اسم الجدول
// أو البيانات الفعلية وقت التشغيل.
export function dbFrom(table: DbWriteTable) {
  return db.from(table as 'cases');
}

// ══════════════════════════════════════════════════════════
//  حقول الـ sentinel المؤقتة (_offlineTempId، _offlineCaseTitle،
//  _offlineCaseTempId، إلخ) مش أعمدة حقيقية في أي جدول. لازم تتشال قبل أي
//  INSERT/UPDATE حقيقي في القاعدة، وإلا Supabase هيرفض العملية بخطأ
//  "column does not exist". (نقاط توليدها الفعلية في كود النداء لسه موجودة
//  — تنظيفها هي موضوع المرحلة 3 من الخطة، مش هنا.)
// ══════════════════════════════════════════════════════════
export function stripOfflineSentinels<T extends Record<string, unknown> | undefined>(data: T): T {
    if (!data) return data;
    const cleaned: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
        if (!key.startsWith('_offline')) cleaned[key] = (data as Record<string, unknown>)[key];
    }
    return cleaned as T;
}

declare global {
  interface Window {
    // ⚠️ `table` بقى Generic (T extends DbWriteTable) بدل `string` — بيتحقق
    // وقت الكتابة إن اسم الجدول حقيقي وموجود في database.types.ts (كان ده
    // أصل الـ `any` القديم، زي نفس نمط dynFrom في useAdminBackup.ts).
    // `data` فضلت Record<string, unknown> عن قصد (مش Insert/Update الحقيقي
    // بتاع الجدول): بعض النداءات بتبعت حقول sentinel مؤقتة (_offline...) مش
    // أعمدة DB حقيقية — بتتشال قبل أي كتابة فعلية عن طريق stripOfflineSentinels.
    // `data` المرجعة بقت `Partial<Row>` (مش `Row` الكامل) لأن مسار
    // UPDATE بيرجّع بس `updated_at` من `.select('updated_at')`، مش الصف
    // كامل — Partial بتغطي الحالتين (INSERT بيرجّع صف كامل، UPDATE بيرجّع
    // عمود واحد بس) من غير ما تدّعي شكل مش حقيقي.
    __dbWrite: <T extends DbWriteTable>(op: {
      type: 'INSERT' | 'UPDATE' | 'DELETE';
      table: T;
      data?: Record<string, unknown>;
      id?: string;
      knownUpdatedAt?: string | null;
      returning?: boolean;
    }) => Promise<{
      error: unknown;
      offline?: boolean;
      queued?: boolean;
      data?: Partial<Database['public']['Tables'][T]['Row']> | null;
      conflict?: boolean;
    }>;
  }
}

window.__dbWrite = async function <T extends DbWriteTable>({ type, table, data, id, knownUpdatedAt, returning }: {
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    table: T;
    data?: Record<string, unknown>;
    id?: string;
    knownUpdatedAt?: string | null;
    returning?: boolean;
}) {
    // 🗑️ المرحلة 1 (إلغاء الأوفلاين في الكتابة، 13 سبتمبر 2026): الشرط القديم
    // كان `if (navigator.onLine && !forceQueueForSelfTempId && !forceQueue)`
    // — أي كتابة كانت بتتقيّد في طابور IndexedDB لو النت مقطوع (أو
    // forceQueue/forceQueueForSelfTempId مضبوطة). القرار المرجعي الجديد:
    // الكتابة تتطلب اتصال دايمًا، الأوفلاين يفضل للقراءة بس. دلوقتي بنحاول
    // التنفيذ المباشر دايمًا — مفيش فرع بديل ولا تقييد محلي خالص.
    try {
        let error = null;
        let insertedRow: Partial<Database['public']['Tables'][T]['Row']> | null = null;
        let updatedRow: Partial<Database['public']['Tables'][T]['Row']> | null = null;
        if (type === 'INSERT') {
            // 🔒 FIX: `data` ممكن يحمل حقول sentinel مؤقتة (_offlineTempId...)
            // مش أعمدة حقيقية، فلازم تتشال هنا قبل أي INSERT حقيقي وإلا
            // Supabase هيرفض العملية بخطأ "column does not exist".
            const cleanData = stripOfflineSentinels(data);
            if (returning) {
                // بنرجّع الصف المُدرج فعليًا (بدل ما نسيب الكولر يخمّن الـ id
                // بإعادة استعلام بالعنوان/التاريخ — ده كان بيسبب ربط غلط
                // في حالات نادرة زي إدخال قضيتين بنفس العنوان في نفس اللحظة)
                const res = await dbFrom(table).insert([cleanData as Database['public']['Tables']['cases']['Insert']]).select().single();
                error = res.error;
                insertedRow = res.data as unknown as Partial<Database['public']['Tables'][T]['Row']> | null;
            } else {
                ({ error } = await dbFrom(table).insert([cleanData as Database['public']['Tables']['cases']['Insert']]));
            }
        } else if (type === 'UPDATE') {
            // Optimistic Locking — online
            if (knownUpdatedAt) {
                const { data: current, error: fetchErr } = await dbFrom(table).select('updated_at').eq('id', id as string).single();

                if (!fetchErr && current && current.updated_at) {
                    const serverTime = new Date(current.updated_at).getTime();
                    const clientTime = new Date(knownUpdatedAt).getTime();
                    if (serverTime > clientTime) {
                        return { error: { message: 'conflict' }, conflict: true, offline: false };
                    }
                }
            }
            // FIX: بنرجّع updated_at الجديد بعد التحديث (بدل ما نسيب الكولر
            // فاكر updated_at القديم اللي جابها هو). من غير ده، أي تعديل
            // تاني على نفس السجل بعد التعديل الأول مباشرة كان هيتكشف غلط
            // كـ"تعارض" مع نفسه (لأن آخر updated_at محفوظة عنده محليًا
            // هتفضل أقدم من اللي فعليًا في السيرفر بعد أول تعديل ناجح).
            // 🔒 FIX (اختبار F1 اليدوي — 10 سبتمبر 2026): كان بينادي
            // .select('updated_at').single() — لو RESTRICTIVE RLS
            // (tenant_write_allowed_*) رفضت الصف بصمت (مكتب readonly)،
            // .single() بيرمي خطأ "no rows returned" (PGRST116) — نص
            // تقني عام مالوش أي علاقة بـtenant_write_allowed، فمودال
            // القفل المخصص معندهوش حاجة يكتشفها ويظهر توست عام مضلّل
            // بدل رسالة القفل الصح. الحل: .select() array بدل .single()،
            // وlockErrorIfNoRowsAffected بتحوّل "صفر صفوف" لرسالة
            // مكتشفة (بدل الاعتماد على نص PostgREST الخام).
            const cleanUpdateData = stripOfflineSentinels(data);
            const res = await dbFrom(table).update(cleanUpdateData as Database['public']['Tables']['cases']['Update']).eq('id', id as string).select('updated_at');
            error = lockErrorIfNoRowsAffected(res.error, res.data) as typeof res.error;
            updatedRow = (res.data?.[0] as unknown as Partial<Database['public']['Tables'][T]['Row']> | undefined) ?? null;
        } else if (type === 'DELETE') {
            // 🔒 FIX (نفس فيكس UPDATE فوق بالحرف — 10 سبتمبر 2026):
            // بدون .select()، DELETE مرفوضة بصمت من RESTRICTIVE RLS
            // كانت بترجع نجاح (صفر صفوف، صفر error) — أي كولر لـ
            // __dbWrite (جلسات، أطراف دعوى، إلخ) كان بيفتكر إن الحذف
            // نجح فعلاً وهو ماحصلش خالص.
            const res = await dbFrom(table).delete().eq('id', id as string).select('id');
            error = lockErrorIfNoRowsAffected(res.error, res.data) as typeof res.error;
        }
        return { error, offline: false, data: insertedRow || updatedRow };
    } catch {
        // 🗑️ المرحلة 1: قبل كده، فشل الطلب هنا (النت "شكله" متاح بس الطلب
        // فشل فعليًا) كان بيتقيّد في IndexedDB. دلوقتي بيرجّع خطأ واضح
        // للمستخدم بدل ما يختفي بصمت في طابور محلي.
        return { error: { message: 'تعذّر الاتصال بالسيرفر، يرجى التأكد من الاتصال بالإنترنت والمحاولة مرة أخرى' }, offline: false };
    }
};
