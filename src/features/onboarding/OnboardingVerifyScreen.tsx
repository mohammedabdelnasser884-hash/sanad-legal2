import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../supabaseClient';
import { recordError, recordSuccess } from '../../systemHealth';
import { I, SanadMark } from '../../constants';
import { Inp } from '@/shared/ui/Inp';
import { getEdgeFunctionErrorMessage, looksArabicUserMessage, type EdgeFunctionError } from '@/shared/lib/edgeFunctionErrors';

// ─────────────────────────────────────────────────────────
//  OnboardingVerifyScreen — مرحلة 4.1 (خطة onboarding مكتب جديد،
//  6 سبتمبر 2026). بتتعرض لما profile.onboarding_status يساوي
//  'pending_verification' (بعد أول دخول بالباسورد المؤقت، قبل ما
//  المكتب يقدر يكمل أي حاجة تانية). نفس تخطيط ResetPasswordScreen.tsx
//  بصريًا، لكن بتنادي onboarding-otp (send/verify) بدل password-reset-otp
//  — منطق cooldown/lockout مختلف بالكامل (تصعيدي، راجع القسم 2.4 من
//  الخطة)، والرسائل الجاهزة (قفل مؤقت/تجميد كامل) بتيجي عربي جاهزة من
//  السيرفر نفسه فبنعرضها زي ما هي من غير أي منطق عرض إضافي هنا.
//
//  ⚡ سلم العد التنازلي للـresend محلي بس لعرض العدّاد للمستخدم — مصدر
//  الحقيقة الفعلي دايمًا هو رفض السيرفر (429) لو المستخدم لأي سبب قدر
//  يدوس قبل ما العدّاد يخلص (تبويبين مفتوحين مثلًا)، السيرفر هو اللي
//  بيرفض فعليًا مش الواجهة.
// ─────────────────────────────────────────────────────────

// index = resend_stage اللي السيرفر رجّعه بعد إرسال ناجح؛ القيمة هي
// مدة الانتظار المطلوبة قبل الضغط على "إعادة إرسال" الجاية (نفس سلم
// RESEND_WAIT_SEC في onboarding-otp/index.ts). لو resend_stage=3، أي
// إعادة إرسال جاية هتتقفل من السيرفر (تصعيد دورة قفل)، فمفيش عدّاد
// محلي منطقي نعرضه هنا.
const NEXT_WAIT_AFTER_STAGE: Record<number, number> = { 0: 45, 1: 120, 2: 900 };

interface OnboardingVerifyScreenProps {
    onVerified: () => void;
}

function OnboardingVerifyScreen({ onVerified }: OnboardingVerifyScreenProps) {
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [verifyErr, setVerifyErr] = useState('');
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [sendErr, setSendErr] = useState('');
    const [sendLoading, setSendLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [initialSendDone, setInitialSendDone] = useState(false);
    const sentOnce = useRef(false);

    const sendCode = async () => {
        setSendLoading(true);
        setSendErr('');
        const { data, error } = await db.functions.invoke('onboarding-otp', { body: { action: 'send' } });
        setSendLoading(false);
        if (error || data?.error) {
            if (data?.error) {
                // رسالة جاهزة من السيرفر (قفل مؤقت/تجميد كامل/عدّاد انتظار) — تُعرض كما هي.
                setSendErr(data.error);
            } else {
                const serverMessage = await getEdgeFunctionErrorMessage(error as EdgeFunctionError);
                recordError('onboarding_otp_send', serverMessage as string);
                setSendErr(looksArabicUserMessage(serverMessage) ? (serverMessage as string) : 'تعذّر إرسال كود التحقق. تحقق من اتصال الإنترنت وحاول مرة أخرى.');
            }
            return;
        }
        const stage = typeof data?.resend_stage === 'number' ? data.resend_stage : 0;
        setResendCooldown(NEXT_WAIT_AFTER_STAGE[stage] ?? 0);
        recordSuccess('onboarding_otp_send');
    };

    // أول ما الشاشة تفتح: هات إيميل المستخدم من الجلسة الحالية (عشان
    // نعرضه بس، الإيميل الفعلي بيتاخد من الجلسة جوه الفانكشن) وابعت
    // أول كود تلقائيًا. useRef عشان مانبعتش الكود مرتين (React
    // StrictMode بينادي الـeffect مرتين في وضع التطوير).
    useEffect(() => {
        if (sentOnce.current) return;
        sentOnce.current = true;
        db.auth.getSession().then(({ data }) => {
            setEmail(data.session?.user?.email || '');
            setInitialSendDone(true);
            sendCode();
        });
    }, []);

    // عدّاد إعادة الإرسال
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [resendCooldown]);

    const handleVerify = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (code.length !== 6 || verifyLoading) return;
        setVerifyLoading(true);
        setVerifyErr('');

        const { data, error } = await db.functions.invoke('onboarding-otp', { body: { action: 'verify', code } });
        setVerifyLoading(false);
        if (error || data?.error) {
            if (data?.error) {
                setVerifyErr(data.error);
            } else {
                const serverMessage = await getEdgeFunctionErrorMessage(error as EdgeFunctionError);
                recordError('onboarding_otp_verify', serverMessage as string);
                setVerifyErr(looksArabicUserMessage(serverMessage) ? (serverMessage as string) : 'تعذّر تأكيد الكود. تحقق من اتصال الإنترنت وحاول مرة أخرى.');
            }
            return;
        }
        recordSuccess('onboarding_otp_verify');
        onVerified();
    };

    return React.createElement('div', { className: "h-full flex flex-col items-center justify-center px-6 bg-premium-bg relative overflow-hidden" },
        React.createElement('div', { className: "absolute top-0 left-0 w-64 h-64 rounded-full bg-amber-500/5 blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" }),
        React.createElement('div', { className: "absolute bottom-0 right-0 w-64 h-64 rounded-full bg-blue-500/5 blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none" }),

        React.createElement('div', { className: "w-full max-w-sm slide-up" },
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, marginBottom: 40 } },
                React.createElement('div', {
                    style: {
                        width: 64, height: 64, background: '#0B1320', borderRadius: 16, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        border: '1px solid rgba(212,175,55,0.18)',
                        boxShadow: '0 0 40px rgba(212,175,55,0.08)', marginBottom: 20,
                    },
                }, React.createElement(SanadMark, { size: 44 })),
                React.createElement('div', {
                    style: {
                        fontFamily: 'Cairo,sans-serif', fontSize: 36, fontWeight: 900,
                        color: 'var(--text-primary)', letterSpacing: '1px', lineHeight: 1, marginBottom: 10,
                    },
                }, 'سَنَد'),
                React.createElement('div', {
                    style: { fontFamily: 'Cairo,sans-serif', fontSize: 11, fontWeight: 600, color: 'rgba(212,175,55,0.6)', letterSpacing: '3px' },
                }, 'تفعيل حساب المكتب')
            ),

            React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-2xl p-6 shadow-premium-shadow space-y-4" },
                React.createElement('div', { className: "flex items-center gap-2 mb-1" },
                    React.createElement(I.Shield, { className: "w-4 h-4 text-premium-gold" }),
                    React.createElement('h2', { className: "text-sm font-black text-white" }, "تأكيد بريدك الإلكتروني")
                ),
                React.createElement('p', { className: "text-[11px] text-slate-400 leading-relaxed" },
                    !initialSendDone
                        ? "جاري إرسال كود التحقق..."
                        : email
                            ? `بعتنالك كود مكوّن من 6 أرقام على ${email}. أدخله هنا لتفعيل حساب مكتبك.`
                            : "بعتنالك كود مكوّن من 6 أرقام على بريدك الإلكتروني."
                ),

                React.createElement(Inp, {
                    label: "كود التحقق",
                    type: "text",
                    value: code,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6)),
                    placeholder: "------",
                    inputMode: "numeric",
                    maxLength: 6,
                    autoFocus: true,
                    className: "w-full p-3 text-center text-lg tracking-[0.5em] rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
                    'data-testid': 'onboarding-verify-otp-input',
                }),

                verifyErr && React.createElement('div', { className: "bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-[11px] text-rose-400 text-center", 'data-testid': 'onboarding-verify-otp-error' }, verifyErr),
                sendErr && React.createElement('div', { className: "bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-[11px] text-rose-400 text-center", 'data-testid': 'onboarding-verify-send-error' }, sendErr),

                React.createElement('button', {
                    onClick: handleVerify,
                    disabled: verifyLoading || code.length !== 6,
                    className: "w-full py-3 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl font-black text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60",
                    'data-testid': 'onboarding-verify-submit',
                },
                    verifyLoading ? React.createElement(I.Spin) : React.createElement(I.Shield),
                    verifyLoading ? 'جاري التأكيد...' : 'تأكيد الكود'
                ),

                React.createElement('button', {
                    type: "button",
                    onClick: () => resendCooldown === 0 && !sendLoading && sendCode(),
                    disabled: resendCooldown > 0 || sendLoading,
                    className: "w-full text-center text-[11px] text-slate-400 hover:text-premium-gold transition-colors disabled:opacity-50 disabled:hover:text-slate-400",
                    'data-testid': 'onboarding-verify-resend',
                },
                    sendLoading ? 'جاري الإرسال...' : resendCooldown > 0 ? `إعادة الإرسال بعد ${resendCooldown} ثانية` : 'لم يصلك الكود؟ إعادة الإرسال'
                )
            ),

            React.createElement('p', { className: "text-center text-[10px] text-slate-600 mt-6" },
                "🔒 سَنَد مؤمّنة — للمستخدمين المعتمدين فقط"
            )
        )
    );
}

export default OnboardingVerifyScreen;
