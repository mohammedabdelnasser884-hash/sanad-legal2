import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../supabaseClient';
import { recordError, recordSuccess } from '../../systemHealth';
import { I, SanadMark } from '../../constants';
import { Inp } from '@/shared/ui/Inp';
import { getEdgeFunctionErrorMessage, looksArabicUserMessage, type EdgeFunctionError } from '@/shared/lib/edgeFunctionErrors';

// ─────────────────────────────────────────────────────────
//  ResetPasswordScreen — Phase 3 (خطة استعادة/تغيير كلمة المرور،
//  2 سبتمبر 2026). بتتعرض بس لما useAuthProfile.isPasswordRecovery
//  يبقى true (المستخدم داس على لينك "نسيت كلمة المرور" الجاي
//  بالإيميل). نفس تخطيط LoginScreen.tsx بالظبط بصريًا، لكن بدل
//  إيميل+باسورد: باسورد جديد + تأكيد بس (المستخدم أصلًا معروف من
//  جلسة الـrecovery نفسها).
//
//  ⚡ NEW (Phase 4 — تحقق إضافي بعد اللينك، 2 سبتمبر 2026):
//  الدخول باللينك بس (recovery token) بيثبت إن المستخدم فتح
//  الإيميل لحظة الطلب — لكن لو اللينك اتحول/اتفتح من جهاز/متصفح
//  تاني بعد فترة، مفيش أي تأكيد إضافي وقت التغيير الفعلي. دلوقتي
//  أول ما الشاشة تفتح (isPasswordRecovery=true) بنبعت تلقائيًا كود
//  6 أرقام منفصل تمامًا على نفس إيميل المستخدم، ولازم يدخّله صح
//  قبل ما فورم الباسورد الجديد يظهر أصلاً.
//
//  ⚠️ تعديل عن الخطة الأصلية: كان المفروض نستخدم
//  db.auth.signInWithOtp/verifyOtp (آلية Supabase المدمجة)، لكن ده
//  بيتطلب تعديل قالب إيميل "Magic Link" عشان يعرض {{ .Token }} —
//  وده مقفول في لوحة Supabase على الخطة المجانية بدون توصيل Custom
//  SMTP. بدل ما نوقف على القيد ده، بنولّد الكود ونبعته إحنا بنفسنا
//  عن طريق إيدج فانكشن جديدة (password-reset-otp) بتستخدم Brevo
//  (HTTPS API مجاني، من غير حاجة لدومين ولا SMTP) وبتخزّن الـhash
//  بتاعه في جدول password_reset_otps —
//  مستقل تمامًا عن نظام إيميلات Supabase وقوالبه المقفولة. نفس
//  مدة الصلاحية (15 دقيقة) ونفس فكرة "تأكيدين مستقلّين لملكية
//  الإيميل" زي الخطة الأصلية بالظبط.
//
//  ⚠️ بعد نجاح db.auth.updateUser، بنعمل db.auth.signOut() فورًا —
//  ده بيطلق onAuthStateChange بـsession:null، واللي useAuthProfile
//  بيعامله كـlogout عادي (profile/authUser/isPasswordRecovery كلهم
//  بيرجعوا لحالتهم الافتراضية) — فـApp.tsx هيرجع تلقائيًا لبوابة
//  "!authUser || !profile" ويعرض LoginScreen العادية، من غير أي
//  props أو تنسيق إضافي مطلوب من الملف ده لـApp.tsx.
// ─────────────────────────────────────────────────────────

const RESEND_COOLDOWN_SECONDS = 45;

function ResetPasswordScreen() {
    // stage: 'loading' لحد ما نجيب إيميل المستخدم من جلسة الـrecovery
    // ونبعت أول كود، 'otp' لحد ما يتأكد الكود، 'password' بعد كده.
    const [stage, setStage] = useState<'loading' | 'otp' | 'password'>('loading');
    const [email, setEmail] = useState('');

    // ── OTP stage ──
    const [otpCode, setOtpCode] = useState('');
    const [otpErr, setOtpErr] = useState('');
    const [otpLoading, setOtpLoading] = useState(false);
    const [sendErr, setSendErr] = useState('');
    const [sendLoading, setSendLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const otpSentOnce = useRef(false);

    // ── Password stage ──
    const [newPass, setNewPass] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [done, setDone] = useState(false);

    const isValid = newPass.length >= 8 && newPass === confirmPass;

    // بعت كود 6 أرقام جديد (عبر إيدج فانكشن password-reset-otp، شوف
    // شرح الملاحظة فوق). بيتنادى مرة تلقائيًا لما الشاشة تفتح، وبعد
    // كده بس لما المستخدم يدوس "إعادة إرسال". targetEmail مستخدمة
    // هنا بس لعرضها في الرسالة — الإيميل الفعلي بيتاخد من الجلسة
    // نفسها جوه الفانكشن، مش من أي حاجة بنبعتها إحنا.
    const sendOtp = async (_targetEmail: string) => {
        setSendLoading(true);
        setSendErr('');
        const { data, error } = await db.functions.invoke('password-reset-otp', { body: { action: 'send' } });
        setSendLoading(false);
        if (error || data?.error) {
            if (data?.error) {
                setSendErr(data.error);
            } else {
                const serverMessage = await getEdgeFunctionErrorMessage(error as EdgeFunctionError);
                recordError('reset_password_otp_send', serverMessage as string);
                setSendErr(looksArabicUserMessage(serverMessage) ? (serverMessage as string) : 'تعذّر إرسال كود التحقق. تحقق من اتصال الإنترنت، أو اطلب لينك استعادة جديد.');
            }
            return;
        }
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        recordSuccess('reset_password_otp_send');
    };

    // أول ما الشاشة تفتح: هات إيميل المستخدم من جلسة الـrecovery
    // الحالية (متاح فعلاً من غير أي نداء تسجيل دخول إضافي) وابعت
    // أول كود تلقائيًا. useRef عشان مانبعتش الكود مرتين (React
    // StrictMode بينادي الـeffect مرتين في وضع التطوير).
    useEffect(() => {
        if (otpSentOnce.current) return;
        otpSentOnce.current = true;
        db.auth.getSession().then(({ data }) => {
            const em = data.session?.user?.email;
            if (!em) {
                setSendErr('تعذّر التعرّف على حسابك. اطلب لينك استعادة جديد من شاشة الدخول.');
                setStage('otp');
                return;
            }
            setEmail(em);
            setStage('otp');
            sendOtp(em);
        });
    }, []);

    // عدّاد إعادة الإرسال
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [resendCooldown]);

    const handleVerifyOtp = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (otpCode.length !== 6 || otpLoading) return;
        setOtpLoading(true);
        setOtpErr('');

        const { data, error } = await db.functions.invoke('password-reset-otp', { body: { action: 'verify', code: otpCode } });
        setOtpLoading(false);
        if (error || data?.error) {
            if (data?.error) {
                setOtpErr(data.error);
            } else {
                const serverMessage = await getEdgeFunctionErrorMessage(error as EdgeFunctionError);
                recordError('reset_password_otp_verify', serverMessage as string);
                setOtpErr(looksArabicUserMessage(serverMessage) ? (serverMessage as string) : 'الكود غير صحيح أو منتهي الصلاحية. تأكد من آخر كود وصلك، أو اطلب كود جديد.');
            }
            return;
        }
        setStage('password');
        recordSuccess('reset_password_otp_verify');
    };

    // ⚠️ FIX (2 سبتمبر 2026 — إغلاق ثغرة تخطي شاشة الكود): كان هنا
    // نداء مباشر لـdb.auth.updateUser من المتصفح — يعني مرحلة "تأكيد
    // الكود" كانت بتتحكم في الشاشة بس (stage==='password')، من غير ما
    // السيرفر يتأكد فعليًا إن الكود اتأكد قبل قبول تغيير الباسورد. أي
    // حد معاه جلسة الـrecovery (access token) كان يقدر يغيّر الباسورد
    // بنداء مباشر من غير ما يمر على الكود خالص. دلوقتي التغيير بيتم
    // فقط عن طريق password-reset-otp (action:set_password)، اللي
    // بيرفض تمامًا لو مفيش كود متأكَّد حديث لنفس المستخدم — شوف
    // actionSetPassword في الإيدج فانكشن.
    const handleSave = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (!isValid || loading) return;
        setLoading(true);
        setErr('');

        const { data, error } = await db.functions.invoke('password-reset-otp', { body: { action: 'set_password', password: newPass } });
        if (error || data?.error) {
            setLoading(false);
            if (data?.error) {
                setErr(data.error);
            } else {
                const serverMessage = await getEdgeFunctionErrorMessage(error as EdgeFunctionError);
                recordError('reset_password', serverMessage as string);
                setErr(looksArabicUserMessage(serverMessage) ? (serverMessage as string) : 'تعذّر تحديث كلمة المرور. تحقق من اتصال الإنترنت وحاول مرة أخرى، أو اطلب لينك استعادة جديد.');
            }
            return;
        }

        // نجحت — بنسيب رسالة النجاح تظهر لحظة قبل ما نسجّل خروج ونرجّع
        // المستخدم لشاشة الدخول العادية عشان يدخل بالباسورد الجديد.
        setDone(true);
        recordSuccess('reset_password');
        setTimeout(() => { db.auth.signOut(); }, 1500);
    };

    const otpStageContent = React.createElement(React.Fragment, null,
        React.createElement('div', { className: "flex items-center gap-2 mb-1" },
            React.createElement(I.Shield, { className: "w-4 h-4 text-premium-gold" }),
            React.createElement('h2', { className: "text-sm font-black text-white" }, "تأكيد هويتك")
        ),
        React.createElement('p', { className: "text-[11px] text-slate-400 leading-relaxed" },
            email
                ? `بعتنالك كود مكوّن من 6 أرقام على ${email}. أدخله هنا قبل ما تقدر تحط باسورد جديد.`
                : "جاري إرسال كود التحقق..."
        ),

        React.createElement(Inp, {
            label: "كود التحقق",
            type: "text",
            value: otpCode,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)),
            placeholder: "------",
            inputMode: "numeric",
            maxLength: 6,
            autoFocus: true,
            className: "w-full p-3 text-center text-lg tracking-[0.5em] rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
            'data-testid': 'reset-password-otp-input',
        }),

        otpErr && React.createElement('div', { className: "bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-[11px] text-rose-400 text-center", 'data-testid': 'reset-password-otp-error' }, otpErr),
        sendErr && React.createElement('div', { className: "bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-[11px] text-rose-400 text-center", 'data-testid': 'reset-password-otp-send-error' }, sendErr),

        React.createElement('button', {
            onClick: handleVerifyOtp,
            disabled: otpLoading || otpCode.length !== 6,
            className: "w-full py-3 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl font-black text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60",
            'data-testid': 'reset-password-otp-submit',
        },
            otpLoading ? React.createElement(I.Spin) : React.createElement(I.Shield),
            otpLoading ? 'جاري التأكيد...' : 'تأكيد الكود'
        ),

        React.createElement('button', {
            type: "button",
            onClick: () => email && resendCooldown === 0 && !sendLoading && sendOtp(email),
            disabled: resendCooldown > 0 || sendLoading || !email,
            className: "w-full text-center text-[11px] text-slate-400 hover:text-premium-gold transition-colors disabled:opacity-50 disabled:hover:text-slate-400",
            'data-testid': 'reset-password-otp-resend',
        },
            sendLoading ? 'جاري الإرسال...' : resendCooldown > 0 ? `إعادة الإرسال بعد ${resendCooldown} ثانية` : 'لم يصلك الكود؟ إعادة الإرسال'
        )
    );

    const passwordStageContent = React.createElement(React.Fragment, null,
        React.createElement(Inp, {
            label: "كلمة المرور الجديدة", type: showPass ? "text" : "password", value: newPass,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNewPass(e.target.value),
            placeholder: "8+ أحرف على الأقل", required: true, 'data-testid': 'reset-password-new'
        }),
        React.createElement('div', null,
            React.createElement('label', { className: "block text-[10px] font-bold text-slate-400 mb-1.5" }, "تأكيد كلمة المرور"),
            React.createElement('div', { className: "relative" },
                React.createElement('input', {
                    type: showPass ? 'text' : 'password',
                    value: confirmPass,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setConfirmPass(e.target.value),
                    placeholder: "أعد كتابة كلمة المرور الجديدة",
                    className: "w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 pl-10",
                    style: { fontFamily: 'Cairo,sans-serif' },
                    'data-testid': 'reset-password-confirm'
                }),
                React.createElement('button', {
                    type: "button",
                    onClick: () => setShowPass(!showPass),
                    className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-premium-gold transition-colors"
                }, React.createElement(I.Eye))
            ),
            confirmPass && newPass !== confirmPass && React.createElement('p', { className: "text-[9px] text-red-400 mt-1" }, "كلمتا المرور غير متطابقتين")
        ),

        err && React.createElement('div', { className: "bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-[11px] text-rose-400 text-center", 'data-testid': 'reset-password-error' }, err),

        React.createElement('button', {
            onClick: handleSave,
            disabled: loading || !isValid,
            className: "w-full py-3 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl font-black text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60",
            'data-testid': 'reset-password-submit'
        },
            loading ? React.createElement(I.Spin) : React.createElement(I.Lock),
            loading ? 'جاري التحديث...' : 'تحديث كلمة المرور'
        )
    );

    return React.createElement('div',{className:"h-full flex flex-col items-center justify-center px-6 bg-premium-bg relative overflow-hidden"},
        React.createElement('div',{className:"absolute top-0 left-0 w-64 h-64 rounded-full bg-amber-500/5 blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none"}),
        React.createElement('div',{className:"absolute bottom-0 right-0 w-64 h-64 rounded-full bg-blue-500/5 blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none"}),

        React.createElement('div',{className:"w-full max-w-sm slide-up"},
            // شعار
            React.createElement('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',gap:0,marginBottom:40}},
                React.createElement('div',{
                    style:{width:64,height:64,background:'#0B1320',borderRadius:16,display:'flex',
                      alignItems:'center',justifyContent:'center',
                      border:'1px solid rgba(212,175,55,0.18)',
                      boxShadow:'0 0 40px rgba(212,175,55,0.08)',marginBottom:20}
                },
                    React.createElement(SanadMark,{size:44})
                ),
                React.createElement('div',{style:{fontFamily:'Cairo,sans-serif',fontSize:36,fontWeight:900,
                  color:'var(--text-primary)',letterSpacing:'1px',lineHeight:1,marginBottom:10}},'سَنَد'),
                React.createElement('div',{style:{fontFamily:'Cairo,sans-serif',fontSize:11,fontWeight:600,
                  color:'rgba(212,175,55,0.6)',letterSpacing:'3px'}},'نظام التشغيل القانوني')
            ),

            React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-6 shadow-premium-shadow space-y-4"},
                stage === 'password' && React.createElement('h2',{className:"text-sm font-black text-white mb-2"},"تعيين كلمة مرور جديدة"),

                done
                    ? React.createElement('div',{className:"bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center",'data-testid':'reset-password-success'},
                        React.createElement('p',{className:"text-xs font-black text-emerald-400"},"✅ تم تحديث كلمة المرور بنجاح"),
                        React.createElement('p',{className:"text-[10px] text-slate-400 mt-1"},"جاري تحويلك لشاشة الدخول...")
                      )
                    : stage === 'otp'
                        ? otpStageContent
                        : passwordStageContent
            ),

            React.createElement('p',{className:"text-center text-[10px] text-slate-600 mt-6"},
                "🔒 سَنَد مؤمّنة — للمستخدمين المعتمدين فقط"
            )
        )
    );
}

export default ResetPasswordScreen;
