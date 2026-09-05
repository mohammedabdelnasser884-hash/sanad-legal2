import { useCallback } from 'react';
import { db } from '../supabaseClient';
import { recordError, recordSuccess, HEALTH_EVENT } from '../systemHealth';
import { getEdgeFunctionErrorMessage, looksArabicUserMessage, type EdgeFunctionError } from '../shared/lib/edgeFunctionErrors';
import type { ProfileRow } from '../types';

// ⚠️ التوكن (tg_instant_token) بقى مخزّن في Supabase Vault ومبيوصلش
// للمتصفح إطلاقاً — راجع 09-telegram-token-vault-migration.sql.
// كان قبل كده بيتجاب بـ loadOfficeSetting كنص صريح وبيتستخدم في fetch
// مباشر لـ api.telegram.org من هنا، يعني أي مستخدم مسجل دخول (مهما
// كان دوره) كان يقدر يشوفه كامل في Network tab. دلوقتي الإرسال نفسه
// بيحصل على السيرفر عن طريق edge function telegram-send.
export function useTelegramAlerts(profile: ProfileRow | null) {
    const refreshHealth = useCallback(() => {
        window.dispatchEvent(new Event(HEALTH_EVENT));
    }, []);

    const sendTelegram = async (text: string) => {
        try {
            const { data, error } = await db.functions.invoke('telegram-send', {
                body: { text },
            });
            if (error || data?.error) {
                // 🐛 FIX (٥ سبتمبر ٢٠٢٦ — الملاحظة المؤجلة من خطة "تصنيف الرسائل
                // ودورة حياة العمليات"، بند ٣-هـ): كان الفولباك هنا error?.message
                // مباشر — نفس النمط الأخف خطورة من باج ResetPasswordScreen.tsx
                // (اتصلح فى نفس الخطة). لو الفانكشن ردت بـstatus غير 2xx برسالة
                // عربية حقيقية جوه الجسم، error?.message كان بيرجّع النص العام
                // "Edge Function returned a non-2xx status code" بدل الرسالة
                // الحقيقية اللي كانت متاحة فعليًا جوه error.context. دلوقتي
                // بنحاول نستخرجها أولاً (نفس مرجع supabaseClient.ts::callAdminAction)،
                // ونستخدمها فى حقل rawError التشخيصي بس لو فعلاً عربية — الرسالة
                // الودودة المعروضة للمستخدم (KNOWN_ERROR_MSGS.telegram) متأثرة
                // مش عليه أصلاً، فده تحسين لدقة التشخيص الداخلي بس.
                const extracted = error ? await getEdgeFunctionErrorMessage(error as EdgeFunctionError) : null;
                const rawMsg = data?.error || (looksArabicUserMessage(extracted) ? extracted : null) || error?.message;
                recordError('telegram', rawMsg);
                refreshHealth();
                return;
            }
            // data?.skipped === true يعني المكتب ده أصلاً مش ضابط بوت
            // التنبيهات الفورية — مش خطأ، فمنسجّلش لا نجاح ولا فشل.
            if (!data?.skipped) {
                recordSuccess('telegram');
                refreshHealth();
            }
        } catch (e) {
            console.error('Telegram error', e);
            recordError('telegram', (e as Error)?.message);
            refreshHealth();
        }
    };

    return { sendTelegram };
}
