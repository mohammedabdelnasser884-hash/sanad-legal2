import { createClient } from '@supabase/supabase-js';

export const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPA_URL || !SUPA_KEY) {
  console.error('[Supabase] Missing environment variables: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const db = createClient(SUPA_URL, SUPA_KEY);

// استدعاء Edge Function للعمليات الإدارية (تسجيل خروج قسري، تغيير باسورد، إنشاء محامي...)
// الدالة تُرمي Error عند الفشل، عشان الكولرز تستخدم try/catch
export async function callAdminAction(payload: Record<string, any>) {
  const { data, error } = await db.functions.invoke('admin-actions', { body: payload });
  if (error) throw new Error(error.message || 'فشل تنفيذ العملية');
  if (data?.error) throw new Error(data.error);
  return data;
}
