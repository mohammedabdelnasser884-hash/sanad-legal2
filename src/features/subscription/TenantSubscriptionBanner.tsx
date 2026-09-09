import React, { useState } from 'react';
import { I } from '../../constants';
import type { TenantLockState } from '../../hooks/useTenantSubscriptionStatus';
import ContactChooserModal from './ContactChooserModal';

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
//  زرار "تواصل معانا"/"رقّي الباقة": بيفتح ContactChooserModal، والمستخدم
//  يختار بنفسه هو عايز يتواصل ازاي (واتساب/فيسبوك/إيميل) — قرار
//  المستخدم، 8 سبتمبر 2026.
//
//  🔄 قابلية الطي (9 سبتمبر 2026، اختبار 4): البانر بقى قابل للطي —
//  زرار سهم صغير جنب زرار التواصل. الافتراضي مفتوح دايمًا كل ما
//  الكومبوننت يتركّب من جديد (refresh/دخول صفحة تانية) — الحالة local
//  state مش متخزّنة (مفيش persistence)، يعني القرار بالطي أو الفتح
//  بيرجع "مفتوح" تلقائيًا في أي تحميل جديد، والمستخدم هو اللي يطويه
//  بنفسه لو عايز. لما يتطوى، بيفضل شريط رفيع بنفس لون الحالة قابل
//  للضغط عشان يرجّع يفتحه تاني.
// ══════════════════════════════════════════════════════════════════

interface TenantSubscriptionBannerProps {
    lockState: TenantLockState;
    countdownDays: number | null;
}

// حالات مش من ضمن نطاق البانر — بيترندر null ليها. مفصولة برة الكومبوننت
// عشان تتقرا بسهولة من غير ما تتلف جوه الـJSX/createElement أدناه.
const BANNERLESS_STATES: ReadonlySet<TenantLockState> = new Set(['active', 'locked', 'n_a']);

function TenantSubscriptionBanner({ lockState, countdownDays }: TenantSubscriptionBannerProps) {
    const [isContactOpen, setIsContactOpen] = useState(false);
    // ⚡ الافتراضي دايمًا false (= مفتوح) — مقصود عدم القراءة من أي مكان
    // متخزّن (localStorage إلخ)، عشان كل تحميل جديد للصفحة يرجّع البانر
    // يظهر تاني من غير ما "يفتكر" إنه كان متطوي قبل كده.
    const [isCollapsed, setIsCollapsed] = useState(false);

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
            message: `الاشتراك متأخر عن ميعاد التجديد${daysSuffix} وسيتم تعليق حساب المكتب من معظم الخدمات. سارع بتجديد اشتراكك`,
            cta: 'تواصل معانا',
        }
        : { // readonly
            gradient: 'from-red-600 to-red-500',
            message: `الحساب في وضع مشاهدة فقط دلوقتي${daysSuffix} قبل القفل النهائي. كلّم الإدارة لتأكيد الدفع`,
            cta: 'تواصل معانا',
        };

    const handleContact = () => {
        setIsContactOpen(true);
    };

    // شريط رفيع بديل بيظهر بدل البانر الكامل لما المستخدم يطويه — نفس
    // لون التدرّج (السياق البصري للحالة فاضل واضح)، بس بارتفاع أصغر
    // بكتير وبدون النص/الزرار، وقابل للضغط في أي حتة فيه عشان يرجع يفتح.
    if (isCollapsed) {
        return React.createElement('button', {
            onClick: () => setIsCollapsed(false),
            className: `sticky top-0 z-[9999] w-full bg-gradient-to-l ${config.gradient} text-white px-3 py-1 flex items-center justify-center gap-1.5 shadow-md active:opacity-80`,
            'data-testid': 'tenant-subscription-banner-collapsed',
            'data-lock-state': lockState,
            'aria-label': 'إظهار تنبيه الاشتراك',
        },
            React.createElement(I.Bell, { className: 'w-3 h-3 shrink-0' }),
            React.createElement('svg', { className: 'w-3 h-3 shrink-0', fill: 'none', viewBox: '0 0 24 24', strokeWidth: '2.5', stroke: 'currentColor' },
                React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'm19.5 8.25-7.5 7.5-7.5-7.5' })
            )
        );
    }

    return React.createElement(React.Fragment, null,
    React.createElement('div', {
        // 🔒 FIX (ملاحظة اختبار يدوي — 9 سبتمبر 2026): كانت `fixed` (برّه
        // الـlayout flow تمامًا)، فلو النص اتلف لأكتر من سطر (زي رسالة
        // grace الطويلة) ارتفاع البانر يزيد من غير ما يحجز أي مساحة فعلية
        // فوق باقي الصفحة — فبيتراكب فوق التابات/الأزرار اللي تحته
        // (`AppShell` ماعندهوش أي padding-top ديناميكي بيتغيّر مع ارتفاع
        // البانر). `sticky` بدل `fixed`: البانر برّه AppShell كـsibling
        // أول عنصر فى الـFragment، يعني هو فعليًا أول شيء فى الـblock flow
        // — `sticky` بيحجز ارتفاعه الحقيقي (طول كان أو قصير) فى التخطيط
        // زي عنصر عادي، وبرضو يفضل ملتصق بأعلى الشاشة أثناء الاسكرول
        // بنفس شكل `fixed` بصريًا. `inset-x-0` مش لازمة (`sticky` مع
        // `w-full` بيمتد full-width تلقائيًا زي أي block-level div عادي).
        className: `sticky top-0 z-[9999] w-full bg-gradient-to-l ${config.gradient} text-white px-3 py-2 flex items-center justify-center gap-2 flex-wrap text-center shadow-md`,
        'data-testid': 'tenant-subscription-banner',
        'data-lock-state': lockState,
    },
        React.createElement(I.Bell, { className: 'w-3.5 h-3.5 shrink-0' }),
        React.createElement('span', { className: 'text-[11px] font-bold leading-snug' }, config.message),
        React.createElement('button', {
            onClick: handleContact,
            'data-testid': 'tenant-subscription-banner-cta',
            className: 'text-[11px] font-black underline underline-offset-2 shrink-0 active:opacity-70',
        }, config.cta),
        React.createElement('button', {
            onClick: () => setIsCollapsed(true),
            'data-testid': 'tenant-subscription-banner-collapse',
            'aria-label': 'طي التنبيه',
            className: 'w-5 h-5 rounded-full flex items-center justify-center shrink-0 active:opacity-70',
            style: { background: 'rgba(255,255,255,0.15)' },
        },
            React.createElement('svg', { className: 'w-3 h-3', fill: 'none', viewBox: '0 0 24 24', strokeWidth: '2.5', stroke: 'currentColor' },
                React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'm4.5 15.75 7.5-7.5 7.5 7.5' })
            )
        )
    ),
    React.createElement(ContactChooserModal, {
        isOpen: isContactOpen,
        onClose: () => setIsContactOpen(false),
    })
    );
}

export default TenantSubscriptionBanner;
