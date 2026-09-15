import React, { useState } from 'react';
import { I, SanadMark } from '../../constants';
import { verifyLocalUnlockPassword } from '../../lib/localAuthLock';

// ══════════════════════════════════════════════════════════════════
//  LockScreen (خطة قفل الشاشة بدل تسجيل الخروج التلقائي، 15 سبتمبر
//  2026) — بوابة كاملة الشاشة بتتعرض بدل التطبيق لما useAutoLogout
//  يقفل بسبب 30 دقيقة عدم نشاط. التحقق هنا محلي بالكامل (راجع
//  lib/localAuthLock.ts) — بيشتغل حتى وهو أوف لاين، وده أصل المشكلة
//  اللي الخطة دي بتحلها (تسجيل الدخول العادي محتاج نت، القفل ده لأ).
//
//  الـsession الحقيقي (Supabase) فاضل زي ما هو طول وقت القفل — مفيش
//  signOut هنا خالص، القفل واجهة بس فوق نفس الجلسة الشغالة.
// ══════════════════════════════════════════════════════════════════

interface LockScreenProps {
    userId: string;
    /** بيتعرض تحت اسم المستخدم فوق فورم الباسورد */
    email?: string | null;
    onUnlock: () => void;
    /** تسجيل خروج حقيقي (لو نسي الباسورد أو عايز يبدّل حساب) */
    onLogout: () => void;
}

function LockScreen({ userId, email, onUnlock, onLogout }: LockScreenProps) {
    const [pass, setPass] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');

    const handleUnlock = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (!pass) { setErr('يرجى إدخال كلمة السر'); return; }
        setLoading(true);
        setErr('');

        const result = await verifyLocalUnlockPassword(userId, pass);
        setLoading(false);

        if (result.ok) {
            onUnlock();
            return;
        }

        if (result.reason === 'locked_out') {
            setErr(`محاولات كتير غلط — حاول تاني بعد ${result.lockoutMinutes} دقيقة، أو سجّل خروج`);
        } else if (result.reason === 'no_record') {
            // نادرة جدًا (مثلاً أول قفل بعد نشر هذا التحديث من غير تسجيل
            // دخول جديد) — مفيش هاش نتحقق منه أصلًا، فمفيش طريقة تانية
            // غير تسجيل الخروج الحقيقي.
            setErr('محتاج تسجيل دخول عادي مرة واحدة الأول عشان القفل يشتغل — سجّل خروج وادخل تاني');
        } else {
            setErr('كلمة السر غلط');
        }
        setPass('');
    };

    return React.createElement('div', {
        className: 'h-full flex flex-col items-center justify-center px-6 bg-premium-bg relative overflow-hidden',
    },
        React.createElement('div', { className: 'absolute top-0 left-0 w-64 h-64 rounded-full bg-amber-500/5 blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none' }),

        React.createElement('div', { className: 'w-full max-w-sm relative z-10' },
            React.createElement('div', { className: 'flex flex-col items-center mb-8' },
                React.createElement(SanadMark, { size: 44 }),
                React.createElement('div', { className: 'w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mt-4 mb-2 text-premium-gold' },
                    React.createElement(I.Lock)
                ),
                React.createElement('h1', { className: 'text-sm font-black text-white text-center' }, 'الشاشة مقفولة'),
                React.createElement('p', { className: 'text-[11px] text-slate-500 text-center mt-1' },
                    'اتقفلت تلقائيًا بسبب عدم النشاط' + (email ? ` — ${email}` : '')
                )
            ),

            React.createElement('div', { className: 'space-y-4' },
                React.createElement('div', null,
                    React.createElement('label', { className: 'block text-[10px] font-bold text-slate-400 mb-1.5' }, 'كلمة السر'),
                    React.createElement('div', { className: 'relative' },
                        React.createElement('input', {
                            type: showPass ? 'text' : 'password',
                            value: pass,
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPass(e.target.value),
                            placeholder: '••••••••',
                            autoFocus: true,
                            className: 'w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 pl-10',
                            style: { fontFamily: 'Cairo,sans-serif' },
                            'data-testid': 'lock-screen-password',
                        }),
                        React.createElement('button', {
                            type: 'button',
                            onClick: () => setShowPass(!showPass),
                            className: 'absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-premium-gold transition-colors',
                        }, React.createElement(I.Eye))
                    )
                ),

                err && React.createElement('div', {
                    className: 'bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-[11px] text-rose-400 text-center',
                    'data-testid': 'lock-screen-error',
                }, err),

                React.createElement('button', {
                    onClick: handleUnlock,
                    disabled: loading,
                    className: 'w-full py-3 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl font-black text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60',
                    'data-testid': 'lock-screen-unlock',
                },
                    loading ? React.createElement(I.Spin) : React.createElement(I.Lock),
                    loading ? 'جاري التحقق...' : 'فتح القفل'
                ),

                React.createElement('button', {
                    type: 'button',
                    onClick: onLogout,
                    'data-testid': 'lock-screen-logout',
                    className: 'w-full py-2.5 rounded-xl text-[11px] font-bold text-slate-400 border border-white/10 active:scale-95 transition-transform',
                }, 'مش أنا؟ تسجيل خروج')
            ),

            React.createElement('p', { className: 'text-center text-[10px] text-slate-600 mt-6' },
                '🔒 التحقق هنا محلي على الجهاز — يشتغل حتى من غير إنترنت'
            )
        )
    );
}

export default LockScreen;
