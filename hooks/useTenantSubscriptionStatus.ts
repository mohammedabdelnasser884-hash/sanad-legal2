import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../supabaseClient';
import { recordSuccess, trackQueryOutcome } from '../systemHealth';
import type { ProfileRow } from '../types';
import type { Tables } from '../database.types';

// ─────────────────────────────────────────────────────────
//  useTenantSubscriptionStatus (E1+E4 ملف 3/? — خطة المرحلة 15،
//  8 سبتمبر 2026): هوك واحد بيقرا حالة اشتراك المكتب الحالي (تجربة/
//  باقة مدفوعة) عشان يغذّي بانر التذكير (E1) وشاشة القفل الكاملة (E4)
//  اللي لسه هيتبنوا فوقه. بيجمع 3 مصادر:
//    1) صف tenants الخام (status/subscription_plan/subscription_due_at/
//       trial_ends_at) — قراءته دلوقتي مسموحة حتى وقت القفل الكامل
//       (ميجريشن 15-11: tenants_select_own_regardless_of_lock).
//    2) tenant_subscription_status(p_tenant_id) — حالة الباقة المدفوعة
//       بس (active/grace/readonly/locked/n_a)، مبنية في 15-05.
//    3) tenant_lock_countdown_days(p_tenant_id) — العدّ التنازلي محسوب
//       من السيرفر بس (مش من ساعة جهاز المستخدم)، مبني في 15-12.
//
//  حالة التجربة (day 1-14 / مشاهدة 15-30 / قفل بعد 30) مش دالة منفصلة
//  في الداتابيز — بتتحسب هنا محليًا من trial_ends_at بنفس المنطق
//  بالظبط المستخدم جوه tenant_write_allowed()/tenant_lock_countdown_days
//  (15-05/15-12): يوم المشاهدة يبدأ من trial_ends_at - 16 يوم. أي تعديل
//  مستقبلي على الرقم ده (16) لازم يتغيّر في الداتابيز وهنا مع بعض.
// ─────────────────────────────────────────────────────────

export type TenantLockState =
    | 'active'       // شغال عادي: باقة مدفوعة سارية، أو تجربة يوم 1→14
    | 'trial_viewer' // تجربة – مشاهدة فقط (يوم 15→30)
    | 'grace'        // باقة مدفوعة – فترة سماح 7 أيام بعد فوات الاستحقاق
    | 'readonly'     // باقة مدفوعة – وضع مشاهدة فقط (بعد فترة السماح، لحد 60 يوم)
    | 'locked'       // مقفول تمامًا (تجربة خلصت 30 يوم / باقة فاتها 67 يوم من غير تأكيد دفع)
    | 'n_a';         // مفيش بيانات كافية (لسه بيحمّل، أو مفيش tenant_id أصلاً)

type TenantSubscriptionRow = Pick<
    Tables<'tenants'>,
    'id' | 'status' | 'subscription_plan' | 'subscription_due_at' | 'trial_ends_at'
>;

export interface TenantSubscriptionStatusResult {
    loading: boolean;
    tenant: TenantSubscriptionRow | null;
    lockState: TenantLockState;
    /** باقي كام يوم قبل أقرب نقطة قفل/تشديد جاية، أو null لو الحالة الحالية
     *  مش من ضمن حالات العدّ التنازلي (نشط عادي / تجربة يوم 1-14 / مقفول بالفعل). */
    countdownDays: number | null;
    /** إعادة تحميل يدوية (مثلاً بعد تأكيد دفع من مكان تاني، أو زرار "تحديث" في البانر). */
    refresh: () => void;
}

// يوم بداية "التجربة – مشاهدة فقط" قبل trial_ends_at — لازم يفضل
// مطابق حرفيًا للرقم المستخدم في 15-05 (tenant_write_allowed) و15-12
// (tenant_lock_countdown_days). أي تغيير هنا من غير تغييرهم هيسبب
// تعارض بين اللي البانر بيوريه واللي القفل الفعلي في الداتابيز بيطبّقه.
const TRIAL_VIEWER_WINDOW_DAYS = 16;

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 دقايق — كفاية عشان العدّ التنازلي بيتغيّر يوم بيوم بس

function deriveLockState(
    tenant: TenantSubscriptionRow | null,
    subscriptionStatus: string | null,
): TenantLockState {
    if (!tenant) return 'n_a';

    if (tenant.status === 'trial') {
        // احتياطي: تجربة من غير trial_ends_at ماينفعش يحصل فعليًا بعد
        // فيكس المرحلة 14 (بيتحط تلقائيًا وقت الإنشاء)، بس لو حصل بأي
        // شكل نتعامل معاه كـ"نشط" بدل ما نقفل بيانات ناقصة بالغلط.
        if (!tenant.trial_ends_at) return 'active';
        const trialEndMs = new Date(tenant.trial_ends_at).getTime();
        if (Number.isNaN(trialEndMs)) return 'active';
        const viewerStartMs = trialEndMs - TRIAL_VIEWER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
        const nowMs = Date.now();
        if (nowMs < viewerStartMs) return 'active';
        if (nowMs < trialEndMs) return 'trial_viewer';
        // فعليًا current_tenant_id() بيمنع الدخول تمامًا قبل ما نوصل هنا
        // أصلاً (مفيش profile يتحمّل من الأساس) — موجودة للاكتمال بس.
        return 'locked';
    }

    switch (subscriptionStatus) {
        case 'active':   return 'active';
        case 'grace':    return 'grace';
        case 'readonly': return 'readonly';
        case 'locked':   return 'locked';
        default:         return 'n_a'; // يشمل 'n_a' الراجعة من الدالة نفسها (subscription_due_at لسه NULL)
    }
}

export function useTenantSubscriptionStatus(profile: ProfileRow | null): TenantSubscriptionStatusResult {
    const [loading, setLoading] = useState(true);
    const [tenant, setTenant] = useState<TenantSubscriptionRow | null>(null);
    const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
    const [countdownDays, setCountdownDays] = useState<number | null>(null);

    // 🔒 نفس فيكس الـrace condition المستخدم في useAuthProfile: لو تبديل
    // حساب/مكتب حصل بسرعة (تسجيل خروج ودخول تاني)، نداء قديم لسه معلّق
    // لازم يتجاهل نتيجته لما توصل بعد نداء أحدث.
    const latestRequestedTenantId = useRef<string | null>(null);

    const load = useCallback(async (tenantId: string | null) => {
        latestRequestedTenantId.current = tenantId;

        if (!tenantId) {
            setTenant(null);
            setSubscriptionStatus(null);
            setCountdownDays(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const [tenantRes, statusRes, countdownRes] = await Promise.all([
                db.from('tenants')
                    .select('id,status,subscription_plan,subscription_due_at,trial_ends_at')
                    .eq('id', tenantId)
                    .maybeSingle(),
                db.rpc('tenant_subscription_status', { p_tenant_id: tenantId }),
                db.rpc('tenant_lock_countdown_days', { p_tenant_id: tenantId }),
            ]);

            // نتيجة قديمة (اتطلبت لـtenant سابق) — اتجاهلها، نداء أحدث هو
            // اللي هيحدّث الحالة.
            if (latestRequestedTenantId.current !== tenantId) return;

            if (tenantRes.error) {
                // best-effort وصامت عمدًا (message فاضية): البانر/شاشة القفل
                // مش مسار حرج زي تحميل البروفايل — فشل هنا يعني بس إننا
                // مانعرفش نعرض حالة الاشتراك دلوقتي، مش إن التطبيق نفسه توقف.
                await trackQueryOutcome('tenant_subscription_status_load', tenantRes.error, {
                    label: 'تحميل حالة الاشتراك',
                    message: '',
                });
                setTenant(null);
                setSubscriptionStatus(null);
                setCountdownDays(null);
                return;
            }

            setTenant(tenantRes.data ?? null);
            // ⚠️ db.rpc() بقى مكتوب-النوع (Functions permissive) فبيرجّع
            // unknown بدل any — الدالتين هنا بترجعوا قيمة سكالار واحدة
            // (text/integer) مش صف/مصفوفة، فالcast هنا مباشر وآمن.
            setSubscriptionStatus(statusRes.error ? null : ((statusRes.data as string | null) ?? null));
            setCountdownDays(countdownRes.error ? null : ((countdownRes.data as number | null) ?? null));
            recordSuccess('tenant_subscription_status_load');
        } catch (err) {
            if (latestRequestedTenantId.current !== tenantId) return;
            await trackQueryOutcome('tenant_subscription_status_load', err, {
                label: 'تحميل حالة الاشتراك',
                message: '',
            });
            setTenant(null);
            setSubscriptionStatus(null);
            setCountdownDays(null);
        } finally {
            if (latestRequestedTenantId.current === tenantId) setLoading(false);
        }
    }, []);

    useEffect(() => {
        const tenantId = profile?.tenant_id ?? null;
        load(tenantId);
        if (!tenantId) return;

        // تحديث دوري + عند رجوع الاتصال/التركيز على التاب — العدّ التنازلي
        // والحالة لازم يفضلوا مطابقين للسيرفر (مش بيتحسبوا محليًا خالص).
        const interval = setInterval(() => load(tenantId), REFRESH_INTERVAL_MS);
        const handleRefocus = () => load(tenantId);
        window.addEventListener('focus', handleRefocus);
        window.addEventListener('online', handleRefocus);
        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', handleRefocus);
            window.removeEventListener('online', handleRefocus);
        };
    }, [profile?.tenant_id, load]);

    return {
        loading,
        tenant,
        lockState: deriveLockState(tenant, subscriptionStatus),
        countdownDays,
        refresh: () => load(profile?.tenant_id ?? null),
    };
}
