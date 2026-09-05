import { createClient } from '@supabase/supabase-js';
import { recordSuccess, trackQueryOutcome } from './systemHealth';
import { getEdgeFunctionErrorMessage, looksArabicUserMessage, type EdgeFunctionError } from './shared/lib/edgeFunctionErrors';
import type { PermissionsMap } from './shared/lib/permissions';
import type { Database } from './database.types';

export const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPA_URL || !SUPA_KEY) {
  console.error('[Supabase] Missing environment variables: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

// تمرير <Database> هنا هو اللي بيخلي db.from('cases').select('...') يتحقق
// من أسماء الجداول والأعمدة وقت الكتابة (compile-time)، بدل ما يكتشف أي
// اسم عمود غلط بس وقت التشغيل الفعلي.
export const db = createClient<Database>(SUPA_URL, SUPA_KEY);

// شكل الـ payload الحقيقي لكل نوع عملية إدارية بيتبعت لـ Edge Function
// admin-actions — اتحقق من كل نداء فعلي في useAdminSessions.ts/useAdminUsers.ts/
// useClientActions.ts. لو نوع عملية جديد يتضاف مستقبلاً، يتضاف هنا كعضو جديد
// في الـ union بدل ما يترجع الباب مفتوح لـ Record<string, any>.
export type AdminActionPayload =
  | { action: 'force_signout'; user_id: string }
  | { action: 'change_password'; user_id: string; new_password: string; force_change: boolean }
  | { action: 'create_lawyer'; email: string; password: string; full_name: string; role?: string; permissions?: PermissionsMap }
  | { action: 'delete_user'; profile_id: string; user_id: string | null }
  | { action: 'update_profile'; profile_id: string; user_id: string | null; full_name?: string; role?: string; is_active?: boolean; permissions?: PermissionsMap }
  | { action: 'toggle_lock'; profile_id: string; user_id: string | null; is_locked: boolean };

// استدعاء Edge Function للعمليات الإدارية (تسجيل خروج قسري، تغيير باسورد، إنشاء محامي...)
// الدالة تُرمي Error عند الفشل، عشان الكولرز تستخدم try/catch
const GENERIC_OPERATION_MSG = 'حصلت مشكلة أثناء تنفيذ العملية. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.';

export async function callAdminAction(payload: AdminActionPayload) {
  const { data, error } = await db.functions.invoke('admin-actions', { body: payload });
  if (error) {
    // 🆕 إصلاح: admin-actions بترجّع رسائلها العربية المقصودة (زي "الجلسة
    // منتهية، سجّل الدخول من جديد" أو "الحساب معطّل") بـHTTP status غير
    // 2xx لحالات auth تحديدًا (401/403) — قبل كده كانت الرسالتين دول
    // ضايعتين دايمًا خلف GENERIC_OPERATION_MSG. نجرّب نستخرج الرسالة
    // الحقيقية، ونعرضها بس لو فعلاً عربية (مش نص تقني خام زي فشل شبكة).
    const serverMessage = await getEdgeFunctionErrorMessage(error as EdgeFunctionError);
    // ⚡ FIX (خطة "تصنيف الرسائل" — دفعة ٤، فحص نقطة نقطة): error.context هنا
    // Response حقيقي، وجسمه اتقرا بالفعل جوه getEdgeFunctionErrorMessage
    // فوق (سطر واحد قبل كده). لو مررنا error الخام زي ما هو لـtrackQueryOutcome،
    // extractSafeErrorText جوّاها هيحاول يقرا نفس الـcontext تاني
    // (json()/text()) وده بيفشل بصمت (stream already read في الـfetch Response)
    // فهيرجع rawError فاضي بدل النص التقني — تراجع فعلي عن السلوك الحالي،
    // مش تحسين. الحل: نمرر نسخة بـ.message/.code بس من غير .context —
    // classifyError محتاجة .message/.code بس أصلاً (مبتلمسش context خالص)،
    // وextractSafeErrorText هترجع .message مباشرة من غير أي محاولة قراءة
    // تانية للـstream.
    const errorForTracking = {
      message: (error as { message?: string })?.message,
      code: (error as { code?: string })?.code,
    };
    if (looksArabicUserMessage(serverMessage)) {
      await trackQueryOutcome('generic_operation', errorForTracking, {
        label: 'عملية إدارية',
        message: serverMessage as string,
      });
      throw new Error(serverMessage as string);
    }
    await trackQueryOutcome('generic_operation', errorForTracking, {
      label: 'عملية إدارية',
      message: GENERIC_OPERATION_MSG,
    });
    throw new Error(GENERIC_OPERATION_MSG);
  }
  // data?.error يرجع من الفانكشن نفسها — إما رسالة مقصودة (KnownError) أو
  // رسالة عامة ثابتة بالفعل (بعد إصلاح المرحلة 2)، مفيهاش e.message خام.
  if (data?.error) throw new Error(data.error);
  recordSuccess('generic_operation');
  return data;
}
