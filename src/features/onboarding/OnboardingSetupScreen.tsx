import React, { useState } from 'react';
import { db } from '../../supabaseClient';
import { recordError, recordSuccess } from '../../systemHealth';
import { I, SanadMark } from '../../constants';
import { Inp } from '@/shared/ui/Inp';
import { getEdgeFunctionErrorMessage, looksArabicUserMessage, type EdgeFunctionError } from '@/shared/lib/edgeFunctionErrors';

// ─────────────────────────────────────────────────────────
//  OnboardingSetupScreen — مرحلة 4.2 (خطة onboarding مكتب جديد،
//  6 سبتمبر 2026). بتتعرض لما profile.onboarding_status يساوي
//  'pending_setup' (بعد تأكيد كود الإيميل، قبل أي دخول كامل
//  للتطبيق). بتجمع باسورد دائم + بيانات المكتب الأساسية في خطوة
//  واحدة، وبتبعتهم مع بعض لـonboarding-otp (action:complete).
//
//  ⚡ نسخة مبسّطة من OfficeSection.tsx (بدل إعادة استخدامه مباشرة)
//  — نفس القرار الموثّق في الخطة (القسم 3.3): OfficeSection متشابك
//  مع useAdminOffice (رفع الشعار لـSupabase Storage، تحميل/حفظ
//  منفصلين، تابات فرعية زي "الدولة"/"إشعارات تليجرام" مالهاش لازمة
//  هنا). هنا بس نفس whitelist الحقول اللي onboarding-otp/index.ts
//  (OFFICE_SETTINGS_FIELDS) بتقبلها فعليًا — بما فيها city/country
//  (موجودين في جدول office_settings بس مفيش لهم أي حقل في
//  OfficeSection.tsx الحالي أصلًا). الشعار (logo_url) اتسيب لشاشة
//  "إعدادات المكتب" العادية بعد كده — رفع ملف فعلي مش مناسب لخطوة
//  onboarding سريعة، ومفيش أي مانع من إضافته لاحقًا.
// ─────────────────────────────────────────────────────────

interface OfficeSetupForm {
    name: string;
    slogan: string;
    phone: string;
    phone2: string;
    email: string;
    website: string;
    whatsapp: string;
    address: string;
    city: string;
    country: string;
    facebook: string;
    instagram: string;
    brand_color: string;
    accent_color: string;
}

const EMPTY_FORM: OfficeSetupForm = {
    name: '', slogan: '', phone: '', phone2: '', email: '', website: '', whatsapp: '',
    address: '', city: '', country: '', facebook: '', instagram: '',
    brand_color: '#D4AF37', accent_color: '#1e3a5f',
};

interface FieldDef {
    key: keyof OfficeSetupForm;
    label: string;
    placeholder?: string;
    type?: string;
}

const CONTACT_FIELDS: FieldDef[] = [
    { key: 'phone', label: 'رقم الهاتف الرئيسي', placeholder: '+966500000000', type: 'tel' },
    { key: 'phone2', label: 'رقم هاتف إضافي', placeholder: '+966500000001', type: 'tel' },
    { key: 'whatsapp', label: 'واتساب', placeholder: '+966500000000', type: 'tel' },
    { key: 'email', label: 'البريد الإلكتروني', placeholder: 'office@law.com', type: 'email' },
    { key: 'website', label: 'الموقع الإلكتروني', placeholder: 'www.example-law.com', type: 'url' },
];

const LOCATION_FIELDS: FieldDef[] = [
    { key: 'address', label: 'العنوان', placeholder: 'الرياض، حي العليا، شارع ...' },
    { key: 'city', label: 'المدينة', placeholder: 'الرياض' },
    { key: 'country', label: 'الدولة', placeholder: 'المملكة العربية السعودية' },
];

const SOCIAL_FIELDS: FieldDef[] = [
    { key: 'facebook', label: 'فيسبوك', placeholder: 'facebook.com/...' },
    { key: 'instagram', label: 'إنستجرام', placeholder: 'instagram.com/...' },
];

interface OnboardingSetupScreenProps {
    onCompleted: () => void;
}

function OnboardingSetupScreen({ onCompleted }: OnboardingSetupScreenProps) {
    const [newPass, setNewPass] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [form, setForm] = useState<OfficeSetupForm>(EMPTY_FORM);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');

    const setField = (key: keyof OfficeSetupForm, value: string) => setForm((s) => ({ ...s, [key]: value }));

    const isValid = newPass.length >= 8 && newPass === confirmPass && form.name.trim().length > 0;

    const handleSubmit = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (!isValid || loading) return;
        setLoading(true);
        setErr('');

        const officeSettings: Record<string, string> = {};
        Object.entries(form).forEach(([k, v]) => { if (v.trim()) officeSettings[k] = v.trim(); });

        const { data, error } = await db.functions.invoke('onboarding-otp', {
            body: { action: 'complete', password: newPass, officeSettings },
        });
        setLoading(false);
        if (error || data?.error) {
            if (data?.error) {
                setErr(data.error);
            } else {
                const serverMessage = await getEdgeFunctionErrorMessage(error as EdgeFunctionError);
                recordError('onboarding_otp_complete', serverMessage as string);
                setErr(looksArabicUserMessage(serverMessage) ? (serverMessage as string) : 'تعذّر إكمال الإعداد. تحقق من اتصال الإنترنت وحاول مرة أخرى.');
            }
            return;
        }
        recordSuccess('onboarding_otp_complete');
        onCompleted();
    };

    const renderField = (f: FieldDef) => React.createElement('div', { key: f.key },
        React.createElement('label', { className: "text-[10px] font-bold text-slate-400 block mb-1" }, f.label),
        React.createElement('input', {
            value: form[f.key],
            type: f.type || 'text',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setField(f.key, e.target.value),
            placeholder: f.placeholder,
            'data-testid': 'onboarding-setup-field-' + f.key,
            className: "w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
            style: { fontFamily: 'Cairo,sans-serif', direction: f.type === 'url' || f.type === 'email' || f.type === 'tel' ? 'ltr' : 'rtl' },
        })
    );

    return React.createElement('div', { className: "h-full overflow-y-auto no-scrollbar bg-premium-bg px-6 py-8" },
        React.createElement('div', { className: "w-full max-w-sm mx-auto slide-up space-y-5" },

            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, marginBottom: 12 } },
                React.createElement('div', {
                    style: {
                        width: 56, height: 56, background: '#0B1320', borderRadius: 14, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        border: '1px solid rgba(212,175,55,0.18)',
                        boxShadow: '0 0 40px rgba(212,175,55,0.08)', marginBottom: 16,
                    },
                }, React.createElement(SanadMark, { size: 38 })),
                React.createElement('div', {
                    style: { fontFamily: 'Cairo,sans-serif', fontSize: 28, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1px', lineHeight: 1, marginBottom: 8 },
                }, 'سَنَد'),
                React.createElement('div', {
                    style: { fontFamily: 'Cairo,sans-serif', fontSize: 11, fontWeight: 600, color: 'rgba(212,175,55,0.6)', letterSpacing: '2px', textAlign: 'center' },
                }, 'خطوة أخيرة — أكمل إعداد مكتبك')
            ),

            // ── كلمة المرور الدائمة ──
            React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3" },
                React.createElement('p', { className: "text-xs font-black text-white" }, "🔑 كلمة مرور دائمة"),
                React.createElement(Inp, {
                    label: "كلمة المرور الجديدة", type: showPass ? 'text' : 'password', value: newPass,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNewPass(e.target.value),
                    placeholder: "8+ أحرف على الأقل", required: true, 'data-testid': 'onboarding-setup-password',
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
                            'data-testid': 'onboarding-setup-password-confirm',
                        }),
                        React.createElement('button', {
                            type: "button",
                            onClick: () => setShowPass(!showPass),
                            className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-premium-gold transition-colors",
                        }, React.createElement(I.Eye))
                    ),
                    confirmPass && newPass !== confirmPass && React.createElement('p', { className: "text-[9px] text-red-400 mt-1" }, "كلمتا المرور غير متطابقتين")
                )
            ),

            // ── بيانات المكتب ──
            React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3" },
                React.createElement('p', { className: "text-xs font-black text-white" }, "🏛 بيانات المكتب"),
                React.createElement('div', null,
                    React.createElement('label', { className: "text-[10px] font-bold text-slate-400 block mb-1" }, "اسم المكتب", React.createElement('span', { className: "text-rose-400 mr-1" }, "*")),
                    React.createElement('input', {
                        value: form.name,
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setField('name', e.target.value),
                        placeholder: "سَنَد",
                        'data-testid': 'onboarding-setup-field-name',
                        className: "w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
                        style: { fontFamily: 'Cairo,sans-serif' },
                    })
                ),
                React.createElement('div', null,
                    React.createElement('label', { className: "text-[10px] font-bold text-slate-400 block mb-1" }, "الشعار النصي / السلوجن"),
                    React.createElement('input', {
                        value: form.slogan,
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setField('slogan', e.target.value),
                        placeholder: "العدالة أمانة",
                        className: "w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
                        style: { fontFamily: 'Cairo,sans-serif' },
                    })
                )
            ),

            // ── بيانات التواصل ──
            React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3" },
                React.createElement('p', { className: "text-xs font-black text-white" }, "📞 بيانات التواصل"),
                ...CONTACT_FIELDS.map(renderField)
            ),

            // ── الموقع ──
            React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3" },
                React.createElement('p', { className: "text-xs font-black text-white" }, "📍 الموقع"),
                ...LOCATION_FIELDS.map(renderField)
            ),

            // ── السوشيال ميديا ──
            React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3" },
                React.createElement('p', { className: "text-xs font-black text-white" }, "🌐 السوشيال ميديا"),
                React.createElement('div', { className: "grid grid-cols-2 gap-2" }, ...SOCIAL_FIELDS.map(renderField))
            ),

            // ── ألوان البراند ──
            React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3" },
                React.createElement('p', { className: "text-xs font-black text-white" }, "🎨 ألوان البراند"),
                React.createElement('div', { className: "grid grid-cols-2 gap-3" },
                    [
                        { key: 'brand_color' as const, label: 'اللون الرئيسي' },
                        { key: 'accent_color' as const, label: 'اللون الثانوي' },
                    ].map((f) => React.createElement('div', { key: f.key, className: "space-y-2" },
                        React.createElement('label', { className: "text-[10px] font-bold text-slate-400 block" }, f.label),
                        React.createElement('input', {
                            type: "color",
                            value: form[f.key],
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setField(f.key, e.target.value),
                            className: "w-10 h-10 rounded-xl border border-white/10 cursor-pointer bg-transparent",
                            style: { padding: '2px' },
                        })
                    ))
                )
            ),

            err && React.createElement('div', { className: "bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-[11px] text-rose-400 text-center", 'data-testid': 'onboarding-setup-error' }, err),

            React.createElement('button', {
                onClick: handleSubmit,
                disabled: loading || !isValid,
                'data-testid': 'onboarding-setup-submit',
                className: "w-full py-3.5 rounded-xl text-sm font-black text-premium-bg bg-gradient-to-tr from-[#C9A84C] to-[#E8C97A] shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2",
            },
                loading ? React.createElement(React.Fragment, null, React.createElement(I.Spin), "جاري الإعداد...") : React.createElement(React.Fragment, null, React.createElement(I.Check), "إكمال الإعداد والدخول")
            ),

            React.createElement('p', { className: "text-center text-[10px] text-slate-600" },
                "🔒 سَنَد مؤمّنة — للمستخدمين المعتمدين فقط"
            )
        )
    );
}

export default OnboardingSetupScreen;
