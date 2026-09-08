import React from 'react';

// ══════════════════════════════════════════════════════════════════
//  ContactChooserModal (قرار المستخدم، 8 سبتمبر 2026)
//  بدل ما زرار "تواصل معانا"/"رقّي الباقة" يفتح رابط واحد تلقائي، بيفتح
//  النافذة دي وتدّي المستخدم 3 خيارات يختار منهم هو عايز يتواصل ازاي:
//  الموقع الرسمي (صفحة التواصل)، صفحة فيسبوك، أو واتساب مباشر.
//  مستخدمة من TenantLockScreen و TenantSubscriptionBanner الاتنين.
// ══════════════════════════════════════════════════════════════════

const WEBSITE_URL = 'https://sanad-landing-orcin.vercel.app/#contact';
const FACEBOOK_URL = 'https://facebook.com/sanadnizam';
const WHATSAPP_URL = 'https://wa.me/201500682665';

const GlobeIcon = () => React.createElement('svg', { className: 'w-5 h-5', fill: 'none', viewBox: '0 0 24 24', strokeWidth: '1.5', stroke: 'currentColor' },
    React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418' })
);

const FacebookIcon = () => React.createElement('svg', { className: 'w-5 h-5', viewBox: '0 0 24 24', fill: 'currentColor' },
    React.createElement('path', { d: 'M22.675 0H1.325C.593 0 0 .593 0 1.326v21.348C0 23.407.593 24 1.325 24H12.82v-9.294H9.692V11.01h3.128V8.313c0-3.1 1.893-4.788 4.658-4.788 1.325 0 2.463.099 2.795.143v3.24h-1.918c-1.504 0-1.796.716-1.796 1.765v2.316h3.588l-.467 3.696h-3.121V24h6.116C23.407 24 24 23.407 24 22.674V1.326C24 .593 23.407 0 22.675 0z' })
);

const WhatsAppIcon = () => React.createElement('svg', { className: 'w-5 h-5', viewBox: '0 0 24 24', fill: 'currentColor' },
    React.createElement('path', { d: 'M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.303c-.087.087-.177.181-.076.354.101.173.449.741.964 1.201.663.591 1.222.774 1.394.86.173.087.274.072.376-.043.101-.116.433-.506.549-.68.116-.173.231-.144.39-.087.159.058 1.011.477 1.184.564.173.087.289.13.332.202.043.072.043.419-.101.824zM12.014 0C5.375 0 0 5.373 0 12.014c0 2.117.552 4.184 1.601 6.007L0 24l6.116-1.605c1.744.951 3.72 1.451 5.898 1.451 6.639 0 12.014-5.373 12.014-12.014C24.028 5.373 18.653 0 12.014 0z' })
);

interface ContactOption {
    key: string;
    label: string;
    hint: string;
    url: string;
    icon: () => React.ReactElement;
    iconWrapClass: string;
}

const OPTIONS: ContactOption[] = [
    { key: 'whatsapp', label: 'واتساب', hint: 'رسالة مباشرة على واتساب', url: WHATSAPP_URL, icon: WhatsAppIcon, iconWrapClass: 'bg-emerald-500/10 text-emerald-400' },
    { key: 'facebook', label: 'فيسبوك', hint: 'صفحتنا الرسمية على فيسبوك', url: FACEBOOK_URL, icon: FacebookIcon, iconWrapClass: 'bg-blue-500/10 text-blue-400' },
    { key: 'website', label: 'الموقع الرسمي', hint: 'صفحة التواصل في موقع سند', url: WEBSITE_URL, icon: GlobeIcon, iconWrapClass: 'bg-slate-500/10 text-slate-300' },
];

interface ContactChooserModalProps {
    isOpen: boolean;
    onClose: () => void;
}

function ContactChooserModal({ isOpen, onClose }: ContactChooserModalProps) {
    if (!isOpen) return null;

    const handlePick = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        onClose();
    };

    return React.createElement('div', {
        className: 'fixed inset-0 z-[10000] flex items-center justify-center p-4',
        style: { background: 'rgba(10,22,38,0.7)' },
        onClick: onClose,
        'data-testid': 'contact-chooser-backdrop',
    },
        React.createElement('div', {
            className: 'w-full max-w-sm rounded-3xl p-6',
            style: { background: '#0d1a2e', border: '1px solid rgba(255,255,255,0.1)' },
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
            'data-testid': 'contact-chooser-modal',
        },
            React.createElement('div', { className: 'flex items-center justify-between mb-4' },
                React.createElement('h3', { className: 'text-sm font-black text-white' }, 'تواصل معانا'),
                React.createElement('button', {
                    onClick: onClose,
                    className: 'w-7 h-7 rounded-full flex items-center justify-center text-slate-400 active:scale-95 transition-transform',
                    style: { background: 'rgba(255,255,255,0.06)' },
                    'aria-label': 'إغلاق',
                    'data-testid': 'contact-chooser-close',
                },
                    React.createElement('svg', { className: 'w-3.5 h-3.5', fill: 'none', viewBox: '0 0 24 24', strokeWidth: '2', stroke: 'currentColor' },
                        React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M6 18 18 6M6 6l12 12' })
                    )
                )
            ),
            React.createElement('p', { className: 'text-xs text-slate-400 mb-4 leading-relaxed' }, 'اختار الطريقة الأنسب لك للتواصل مع فريق سند:'),
            React.createElement('div', { className: 'flex flex-col gap-2' },
                ...OPTIONS.map((opt) =>
                    React.createElement('button', {
                        key: opt.key,
                        onClick: () => handlePick(opt.url),
                        'data-testid': `contact-chooser-${opt.key}`,
                        className: 'w-full flex items-center gap-3 p-3 rounded-2xl text-right active:scale-95 transition-transform',
                        style: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' },
                    },
                        React.createElement('div', { className: `w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${opt.iconWrapClass}` },
                            React.createElement(opt.icon)
                        ),
                        React.createElement('div', { className: 'flex-1 min-w-0' },
                            React.createElement('div', { className: 'text-xs font-black text-white' }, opt.label),
                            React.createElement('div', { className: 'text-[10px] text-slate-400 mt-0.5' }, opt.hint)
                        )
                    )
                )
            )
        )
    );
}

export default ContactChooserModal;
