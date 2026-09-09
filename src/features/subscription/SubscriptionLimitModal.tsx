import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalPresentation } from '../../shared/hooks/useModalPresentation';
import { subscribeSubscriptionLimitModal, hideSubscriptionLimitModal } from '../../shared/lib/subscriptionLimitModal';

// ══════════════════════════════════════════════════════════════════
//  SubscriptionLimitModal — قرار تصميم UX جديد من بي (9 سبتمبر 2026،
//  آخر قسم في تقرير "إعادة ضبط باقات بوابة إدارة المكاتب") يلغي نهج
//  التوست العابر لحالتين:
//   1) P0001 — وصلت لحد الباقة (قضايا/حسابات/بوابة موكل).
//   2) E2 (42501/tenant_write_allowed) — قفل read-only بسبب حالة
//      الاشتراك (فترة سماح/مشاهدة فقط/مقفول).
//  بدل التوست: مودال فيه وصف واضح للمشكلة (نفس رسالة الـtrigger
//  العربية الجاهزة لـP0001، أو رسالة القفل الثابتة لـE2) + روابط
//  تواصل مع الدعم. مُركّب مرة واحدة في App.tsx، ومتحكم فيه عن طريق
//  showSubscriptionLimitModal()/hideSubscriptionLimitModal() —
//  errorReporting.ts (showErrorToast) هو المستدعي الرئيسي.
//
//  بيانات التواصل (اتأكدت من المستخدم، 9 سبتمبر 2026): فيسبوك +
//  إيميل الدعم + واتساب الدعم. الموقع الرسمي مؤجل مؤقتًا (رابط قسم
//  التواصل لسه مش نهائي) — مكانه في المصفوفة تحت جاهز، هيتفعّل لاحقًا
//  بإضافة سطر واحد من غير أي تعديل هيكلي في المكوّن.
// ══════════════════════════════════════════════════════════════════

const FACEBOOK_URL = 'https://facebook.com/sanadnizam';
const SUPPORT_EMAIL = 'sanadnizam@gmail.com';
const WHATSAPP_URL = 'https://wa.me/201500682665';
// const WEBSITE_URL = ''; // ⏳ مؤجل — هيتضاف هنا + سطر في CONTACT_OPTIONS لما يستقر

const WarningIcon = () =>
  React.createElement('svg', { className: 'w-7 h-7', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 2 },
    React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.75 16.126ZM12 15.75h.007v.008H12v-.008Z' })
  );

const WhatsAppIcon = () =>
  React.createElement('svg', { className: 'w-5 h-5', viewBox: '0 0 24 24', fill: 'currentColor' },
    React.createElement('path', { d: 'M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.303c-.087.087-.177.181-.076.354.101.173.449.741.964 1.201.663.591 1.222.774 1.394.86.173.087.274.072.376-.043.101-.116.433-.506.549-.68.116-.173.231-.144.39-.087.159.058 1.011.477 1.184.564.173.087.289.13.332.202.043.072.043.419-.101.824zM12.014 0C5.375 0 0 5.373 0 12.014c0 2.117.552 4.184 1.601 6.007L0 24l6.116-1.605c1.744.951 3.72 1.451 5.898 1.451 6.639 0 12.014-5.373 12.014-12.014C24.028 5.373 18.653 0 12.014 0z' })
  );

const FacebookIcon = () =>
  React.createElement('svg', { className: 'w-5 h-5', viewBox: '0 0 24 24', fill: 'currentColor' },
    React.createElement('path', { d: 'M22.675 0H1.325C.593 0 0 .593 0 1.326v21.348C0 23.407.593 24 1.325 24H12.82v-9.294H9.692V11.01h3.128V8.313c0-3.1 1.893-4.788 4.658-4.788 1.325 0 2.463.099 2.795.143v3.24h-1.918c-1.504 0-1.796.716-1.796 1.765v2.316h3.588l-.467 3.696h-3.121V24h6.116C23.407 24 24 23.407 24 22.674V1.326C24 .593 23.407 0 22.675 0z' })
  );

const EmailIcon = () =>
  React.createElement('svg', { className: 'w-5 h-5', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M2.25 6.75c0-.621.504-1.125 1.125-1.125h17.25c.621 0 1.125.504 1.125 1.125v10.5c0 .621-.504 1.125-1.125 1.125H3.375A1.125 1.125 0 0 1 2.25 17.25V6.75Zm0 0 9.75 6.75 9.75-6.75' })
  );

interface ContactOption {
  key: string;
  label: string;
  hint: string;
  url: string;
  icon: () => React.ReactElement;
  iconWrapClass: string;
}

const CONTACT_OPTIONS: ContactOption[] = [
  { key: 'whatsapp', label: 'واتساب', hint: 'رسالة مباشرة على واتساب', url: WHATSAPP_URL, icon: WhatsAppIcon, iconWrapClass: 'bg-emerald-500/10 text-emerald-400' },
  { key: 'facebook', label: 'فيسبوك', hint: 'صفحتنا الرسمية على فيسبوك', url: FACEBOOK_URL, icon: FacebookIcon, iconWrapClass: 'bg-blue-500/10 text-blue-400' },
  { key: 'email', label: 'إيميل الدعم', hint: SUPPORT_EMAIL, url: `mailto:${SUPPORT_EMAIL}`, icon: EmailIcon, iconWrapClass: 'bg-amber-500/10 text-amber-400' },
];

function SubscriptionLimitModal() {
  const [message, setMessage] = useState<string | null>(null);
  const modalPresentation = useModalPresentation();

  useEffect(() => subscribeSubscriptionLimitModal(setMessage), []);

  if (!message) return null;

  const handleClose = () => hideSubscriptionLimitModal();
  const handlePick = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    handleClose();
  };

  return createPortal(
    React.createElement('div', {
      className: `fixed inset-0 z-[10000] flex ${modalPresentation.overlayAlignClassName} justify-center p-4`,
      style: { background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' },
      onClick: handleClose,
      'data-testid': 'subscription-limit-modal-backdrop',
    },
      React.createElement('div', {
        className: `w-full max-w-sm mx-4 ${modalPresentation.isDesktop ? '' : 'mb-8'} rounded-3xl overflow-hidden`,
        style: { background: '#0d1a2e', border: '1px solid rgba(245,158,11,0.2)' },
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        'data-testid': 'subscription-limit-modal',
      },
        React.createElement('div', { className: 'px-6 pt-6 pb-4 text-center' },
          React.createElement('div', {
            className: 'w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-400',
            style: { background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' },
          },
            React.createElement(WarningIcon)
          ),
          React.createElement('h3', { className: 'text-base font-black text-white mb-2' }, 'محتاج ترقية الباقة'),
          React.createElement('p', { className: 'text-xs leading-relaxed text-slate-300', 'data-testid': 'subscription-limit-modal-message' }, message)
        ),
        React.createElement('div', { className: 'px-4 pb-2' },
          React.createElement('p', { className: 'text-[10px] text-slate-500 mb-2 px-2' }, 'تواصل مع فريق سند:'),
          React.createElement('div', { className: 'flex flex-col gap-2' },
            ...CONTACT_OPTIONS.map((opt) =>
              React.createElement('button', {
                key: opt.key,
                onClick: () => handlePick(opt.url),
                'data-testid': `subscription-limit-modal-${opt.key}`,
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
        ),
        React.createElement('div', { className: 'p-4 pt-2' },
          React.createElement('button', {
            onClick: handleClose,
            'data-testid': 'subscription-limit-modal-dismiss',
            className: 'w-full py-3 rounded-2xl text-sm font-black text-white active:scale-95 transition-all',
            style: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' },
          }, 'فهمت')
        )
      )
    ),
    document.body
  );
}

export default SubscriptionLimitModal;
