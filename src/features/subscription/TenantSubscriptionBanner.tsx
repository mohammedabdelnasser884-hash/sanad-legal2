import React from 'react';
import { I } from '../../constants';
import type { TenantLockState } from '../../hooks/useTenantSubscriptionStatus';

// ══════════════════════════════════════════════════════════════════
//  TenantSubscriptionBanner (E1 — خطة المرحلة 15، 8 سبتمبر 2026)
//  بانر ثابت أعلى الشاشة — نفس مبدأ #offline-banner الموجود (fixed،
//  full-width) لكن مكوّن React عادي مربوط بـlockState/countdownDays
//  من useTenantSubscriptionStatus، مش عنصر DOM ثابت بره React زيه.
//  بيتعرض للأدمن بس (القرار في App.tsx وقت الاستدعاء، مش هنا) في 3
//  حالات: trial_viewer / grace / readonly. active/locked/n_a → مفيش
//  بانر خالص (active مفيهوش داعي، locked بياخد شاشة كاملة E4 بدل
//  البانر، n_a يعني لسه بيحمّل أو مفيش tenant_id).
//
//  رابط "تواصل معانا"/"رقّي الباقة": صفحة التواصل في الموقع الرسمي
//  لسند (قرار المستخدم، 8 سبتمبر 2026) — بدون رقم واتساب/تليفون مباشر.
// ══════════════════════════════════════════════════════════════════

const CONTACT_URL = 'https://sanad-landing-orcin.vercel.app/#contact';

interface TenantSubscriptionBannerProps {
    lockState: TenantLockState;
    countdownDays: number | null;
}

// حالات مش من ضمن نطاق البانر — بيترندر null ليها. مفصولة برة الكومبوننت
// عشان تتقرا بسهولة من غير ما تتلف جوه الـJSX/createElement أدناه.
const BANNERLESS_STATES: ReadonlySet<TenantLockState> = new Set(['active', 'locked', 'n_a']);

function TenantSubscriptionBanner({ lockState, countdownDays }: TenantSubscriptionBannerProps) {
    if (BANNERLESS_STATES.has(lockState)) return null;

    const days = countdownDays !== null ? Math.max(0, countdownDays) : null;
    const daysSuffix = days !== null ? (days === 0 ? ' — اليوم الأخير' : ` — باقي ${days} يوم`) : '';

    // ⚡ ثلاث حالات فقط ممكن توصل هنا (البانرلس اتفلترت فوق) — تحويل مباشر
    // من lockState للمحتوى/الألوان، بدل fallback عام مبهم.
    const config = lockState === 'trial_viewer'
        ? {
            gradient: 'from-amber-500 to-amber-400',
            message: `التجربة بقت في وضع المشاهدة فقط${daysSuffix}. رقّي الباقة عشان تكمل شغلك من غير توقف`,
            cta: 'رقّي الباقة',
        }
        : lockState === 'grace'
        ? {
            gradient: 'from-red-400 to-red-300',
            message: `الاشتراك متأخر عن ميعاد التجديد${daysSuffix}. كلّم الإدارة لتأكيد الدفع قبل ما الحساب يتحول لمشاهدة فقط`,
            cta: 'تواصل معانا',
        }
        : { // readonly
            gradient: 'from-red-600 to-red-500',
            message: `الحساب في وضع مشاهدة فقط دلوقتي${daysSuffix} قبل القفل النهائي. كلّم الإدارة لتأكيد الدفع`,
            cta: 'تواصل معانا',
        };

    const handleContact = () => {
        window.open(CONTACT_URL, '_blank', 'noopener,noreferrer');
    };

    return React.createElement('div', {
        className: `fixed top-0 inset-x-0 z-[9999] bg-gradient-to-l ${config.gradient} text-white px-3 py-2 flex items-center justify-center gap-2 flex-wrap text-center shadow-md`,
        'data-testid': 'tenant-subscription-banner',
        'data-lock-state': lockState,
    },
        React.createElement(I.Bell, { className: 'w-3.5 h-3.5 shrink-0' }),
        React.createElement('span', { className: 'text-[11px] font-bold leading-snug' }, config.message),
        React.createElement('button', {
            onClick: handleContact,
            'data-testid': 'tenant-subscription-banner-cta',
            className: 'text-[11px] font-black underline underline-offset-2 shrink-0 active:opacity-70',
        }, config.cta)
    );
}

export default TenantSubscriptionBanner;
