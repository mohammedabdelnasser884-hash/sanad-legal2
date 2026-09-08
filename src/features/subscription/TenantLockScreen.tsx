import React from 'react';
import { I } from '../../constants';
import type { TenantSubscriptionRow } from '../../hooks/useTenantSubscriptionStatus';

// ══════════════════════════════════════════════════════════════════
//  TenantLockScreen (E4 — خطة المرحلة 15، 8 سبتمبر 2026)
//  بوابة كاملة الشاشة (نفس فلسفة TermsAcceptanceScreen) بتتعرض بدل
//  التطبيق بالكامل لما lockState === 'locked': إما تجربة خلصت 30 يوم،
//  أو باقة مدفوعة فاتت 60 يوم read-only من غير تأكيد دفع. current_tenant_id()
//  بترجع NULL في الحالتين (منع دخول تمامًا على مستوى الداتابيز)، فمفيش
//  بيانات تتعرض أصلاً — الشاشة دي بس بتفسّر السبب وتدّي وسيلة تواصل،
//  بدل ما المستخدم يشوف تطبيق فاضي بلا تفسير.
//
//  رابط "تواصل معانا": صفحة التواصل في الموقع الرسمي لسند (قرار
//  المستخدم، 8 سبتمبر 2026) — مفيش رقم واتساب/تليفون مباشر دلوقتي.
// ══════════════════════════════════════════════════════════════════

const CONTACT_URL = 'https://sanad-landing-orcin.vercel.app/#contact';

interface TenantLockScreenProps {
    /** status الخام من صف tenants — بيحدد نص السبب بس (trial vs باقة مدفوعة متأخرة). */
    tenantStatus: TenantSubscriptionRow['status'];
    onLogout: () => void;
}

function TenantLockScreen({ tenantStatus, onLogout }: TenantLockScreenProps) {
    const isTrialLock = tenantStatus === 'trial';

    const title = isTrialLock ? 'التجربة المجانية انتهت' : 'الاشتراك متوقف';
    const body = isTrialLock
        ? 'التجربة المجانية لمدة شهر خلصت. لازم تفعّل باقة مدفوعة عشان تكمل استخدام الحساب.'
        : 'الاشتراك اتأخر عن ميعاد التجديد وفترة السماح خلصت. لازم تأكيد الدفع عشان الحساب يشتغل تاني.';

    const handleContact = () => {
        window.open(CONTACT_URL, '_blank', 'noopener,noreferrer');
    };

    return React.createElement('div', {
        className: 'fixed inset-0 z-50 flex items-center justify-center p-4',
        style: { background: '#0a1626' },
    },
        React.createElement('div', {
            className: 'w-full max-w-md rounded-3xl flex flex-col items-center text-center p-7',
            style: { background: '#0d1a2e', border: '1px solid rgba(239,68,68,0.2)' },
        },
            // ⚡ I.Lock/I.Phone (constants.ts) ما بيقبلوش prop className أصلاً
            // (بعكس I.Bell/I.Shield) — أحجامهم وألوانهم (currentColor) بتتورّث
            // من الـwrapper بس، فمفيش داعي تمرير className ليهم هنا.
            React.createElement('div', { className: 'w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4 text-red-400' },
                React.createElement(I.Lock)
            ),
            React.createElement('h2', { className: 'text-base font-black text-white mb-2' }, title),
            React.createElement('p', { className: 'text-xs leading-relaxed text-slate-400 mb-6' }, body),

            React.createElement('button', {
                onClick: handleContact,
                'data-testid': 'tenant-lock-contact-button',
                className: 'w-full py-3 rounded-xl text-xs font-black text-white bg-gradient-to-tr from-red-500 to-red-400 shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 mb-3',
            },
                React.createElement(I.Phone),
                'تواصل معانا'
            ),

            React.createElement('button', {
                onClick: onLogout,
                'data-testid': 'tenant-lock-logout-button',
                className: 'w-full py-2.5 rounded-xl text-[11px] font-bold text-slate-400 border border-white/10 active:scale-95 transition-transform',
            }, 'تسجيل خروج')
        )
    );
}

export default TenantLockScreen;
