import React, { useState } from 'react';
import { db } from '../../supabaseClient';
import { recordError } from '../../systemHealth';
import { I, SanadMark } from '../../constants';
import { Inp } from '@/shared/ui/Inp';

// ─────────────────────────────────────────────────────────
//  ResetPasswordScreen — Phase 3 (خطة استعادة/تغيير كلمة المرور،
//  2 سبتمبر 2026). بتتعرض بس لما useAuthProfile.isPasswordRecovery
//  يبقى true (المستخدم داس على لينك "نسيت كلمة المرور" الجاي
//  بالإيميل). نفس تخطيط LoginScreen.tsx بالظبط بصريًا، لكن بدل
//  إيميل+باسورد: باسورد جديد + تأكيد بس (المستخدم أصلًا معروف من
//  جلسة الـrecovery نفسها).
//
//  ⚠️ بعد نجاح db.auth.updateUser، بنعمل db.auth.signOut() فورًا —
//  ده بيطلق onAuthStateChange بـsession:null، واللي useAuthProfile
//  بيعامله كـlogout عادي (profile/authUser/isPasswordRecovery كلهم
//  بيرجعوا لحالتهم الافتراضية) — فـApp.tsx هيرجع تلقائيًا لبوابة
//  "!authUser || !profile" ويعرض LoginScreen العادية، من غير أي
//  props أو تنسيق إضافي مطلوب من الملف ده لـApp.tsx.
// ─────────────────────────────────────────────────────────

function ResetPasswordScreen() {
    const [newPass, setNewPass] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [done, setDone] = useState(false);

    const isValid = newPass.length >= 8 && newPass === confirmPass;

    const handleSave = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (!isValid || loading) return;
        setLoading(true);
        setErr('');

        const { error } = await db.auth.updateUser({ password: newPass });
        if (error) {
            setLoading(false);
            recordError('reset_password', error.message);
            setErr('تعذّر تحديث كلمة المرور. تحقق من اتصال الإنترنت وحاول مرة أخرى، أو اطلب لينك استعادة جديد.');
            return;
        }

        // نجحت — بنسيب رسالة النجاح تظهر لحظة قبل ما نسجّل خروج ونرجّع
        // المستخدم لشاشة الدخول العادية عشان يدخل بالباسورد الجديد.
        setDone(true);
        setTimeout(() => { db.auth.signOut(); }, 1500);
    };

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
                React.createElement('h2',{className:"text-sm font-black text-white mb-2"},"تعيين كلمة مرور جديدة"),

                done
                    ? React.createElement('div',{className:"bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center",'data-testid':'reset-password-success'},
                        React.createElement('p',{className:"text-xs font-black text-emerald-400"},"✅ تم تحديث كلمة المرور بنجاح"),
                        React.createElement('p',{className:"text-[10px] text-slate-400 mt-1"},"جاري تحويلك لشاشة الدخول...")
                      )
                    : React.createElement(React.Fragment, null,
                        React.createElement(Inp,{
                            label:"كلمة المرور الجديدة",type:showPass?"text":"password",value:newPass,
                            onChange:(e: React.ChangeEvent<HTMLInputElement>)=>setNewPass(e.target.value),
                            placeholder:"8+ أحرف على الأقل",required:true,'data-testid':'reset-password-new'
                        }),
                        React.createElement('div',null,
                            React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"تأكيد كلمة المرور"),
                            React.createElement('div',{className:"relative"},
                                React.createElement('input',{
                                    type:showPass?'text':'password',
                                    value:confirmPass,
                                    onChange:(e: React.ChangeEvent<HTMLInputElement>)=>setConfirmPass(e.target.value),
                                    placeholder:"أعد كتابة كلمة المرور الجديدة",
                                    className:"w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 pl-10",
                                    style:{fontFamily:'Cairo,sans-serif'},
                                    'data-testid':'reset-password-confirm'
                                }),
                                React.createElement('button',{
                                    type:"button",
                                    onClick:()=>setShowPass(!showPass),
                                    className:"absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-premium-gold transition-colors"
                                },React.createElement(I.Eye))
                            ),
                            confirmPass && newPass!==confirmPass && React.createElement('p',{className:"text-[9px] text-red-400 mt-1"},"كلمتا المرور غير متطابقتين")
                        ),

                        err&&React.createElement('div',{className:"bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-[11px] text-rose-400 text-center",'data-testid':'reset-password-error'},err),

                        React.createElement('button',{
                            onClick:handleSave,
                            disabled:loading||!isValid,
                            className:"w-full py-3 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl font-black text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60",
                            'data-testid':'reset-password-submit'
                        },
                            loading?React.createElement(I.Spin):React.createElement(I.Lock),
                            loading?'جاري التحديث...':'تحديث كلمة المرور'
                        )
                      )
            ),

            React.createElement('p',{className:"text-center text-[10px] text-slate-600 mt-6"},
                "🔒 سَنَد مؤمّنة — للمستخدمين المعتمدين فقط"
            )
        )
    );
}

export default ResetPasswordScreen;
