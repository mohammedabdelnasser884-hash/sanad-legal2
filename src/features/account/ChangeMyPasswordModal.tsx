import React, { useState } from 'react';
import { db } from '../../supabaseClient';
import { I } from '../../constants';
import { toast } from '@/shared/lib/notifications';
import { recordSuccess, trackQueryOutcome } from '../../systemHealth';
import { useModalPresentation } from '@/shared/hooks/useModalPresentation';
import type { ProfileRow } from '../../types';

// ─────────────────────────────────────────────────────────
//  ChangeMyPasswordModal — Phase B (Phase 1 من خطة استعادة/تغيير
//  كلمة المرور، 2 سبتمبر 2026). نفس الستايل البصري بالظبط زي
//  ChangePasswordModal.tsx (features/admin/security) اللي بيستخدمه
//  الأدمن لتغيير باسورد مستخدم تاني — الفرق الجوهري هنا إن المستخدم
//  بيغيّر باسورده هو نفسه، فمحتاجين نتأكد إنه فعلاً صاحب الحساب
//  عن طريق طلب الباسورد الحالي والتحقق منه أولاً (signInWithPassword)
//  قبل أي تحديث. الميزة دي مستقلة تمامًا عن useAuthProfile.ts ومفيش
//  أي لمسة لمنطق الـauth الحساس هناك (راجع Phase A في الخطة).
// ─────────────────────────────────────────────────────────

interface ChangeMyPasswordModalProps {
  profile: ProfileRow;
  onClose: () => void;
}

function ChangeMyPasswordModal({ profile, onClose }: ChangeMyPasswordModalProps) {
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const isValid = currentPass.length > 0 && newPass.length >= 8 && newPass === confirmPass;
  const strength = newPass.length === 0 ? 0 : newPass.length < 8 ? 1 : newPass.length < 12 ? 2 : 3;
  const strengthLabel = ['', 'ضعيفة', 'متوسطة', 'قوية'];
  const strengthColor = ['', 'text-red-400', 'text-[#C9A84C]', 'text-[#C9A84C]'];
  const strengthBg   = ['bg-slate-700', 'bg-red-500', 'bg-[#C9A84C]', 'bg-[#C9A84C]'];
  // نفس نمط useModalPresentation المُطبَّق في NewCaseModal.tsx / ChangePasswordModal.tsx.
  const modalPresentation = useModalPresentation();

  const handleSave = async () => {
    if (!isValid || saving) return;
    if (!profile.email) {
      setErr('لا يوجد بريد إلكتروني مرتبط بحسابك — تواصل مع مدير المكتب');
      return;
    }
    setSaving(true);
    setErr('');

    // 1) التحقق من الباسورد الحالي فعليًا (مش بس شكليًا) — عن طريق
    // محاولة تسجيل دخول حقيقية بنفس الإيميل. لو فشلت، يبقى الباسورد
    // الحالي غلط ومنكملش تحديث خالص.
    const { error: verifyError } = await db.auth.signInWithPassword({
      email: profile.email,
      password: currentPass,
    });
    if (verifyError) {
      setSaving(false);
      setErr('كلمة المرور الحالية غير صحيحة');
      return;
    }

    // 2) الباسورد الحالي صح — دلوقتي حدّث للباسورد الجديد.
    const { error: updateError } = await db.auth.updateUser({ password: newPass });
    setSaving(false);
    if (updateError) {
      // ⚡ FIX (خطة "تصنيف الرسائل" — دفعة ٥ من ٢-ج-٣، ٥ سبتمبر 2026):
      // تحويل لـtrackQueryOutcome بدل recordError(msg) المباشر.
      // change_my_password مش مفتاح معروف، فبنمرر label/message صريحين.
      // updateError الخام (من db.auth.updateUser) بيتمرر كما هو بدل
      // .message المستخرج مسبقًا. الرسالة المعروضة للمستخدم (setErr)
      // متلمستش خالص.
      await trackQueryOutcome('change_my_password', updateError, {
        label: 'تغيير كلمة المرور',
        message: 'تعذّر تحديث كلمة المرور. تحقق من الاتصال بالإنترنت.',
      });
      setErr('تعذّر تحديث كلمة المرور. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.');
      return;
    }

    toast('✅ تم تحديث كلمة المرور بنجاح');
    recordSuccess('change_my_password');
    onClose();
  };

  return React.createElement('div',{
    className:`fixed inset-0 z-50 flex ${modalPresentation.overlayAlignClassName} justify-center`,
    style:{background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)'}
  },
    React.createElement('div',{
      className:`w-full max-w-sm ${modalPresentation.isDesktop ? 'rounded-3xl' : 'rounded-t-3xl'} p-5 space-y-4 ${modalPresentation.panelAnimationClassName}`,
      style:{background:'#0d1a2e',border:'1px solid rgba(212,175,55,0.15)',borderBottom: modalPresentation.isDesktop ? '1px solid rgba(212,175,55,0.15)' : 'none',maxHeight:'85vh',overflowY:'auto'}
    },
      // هيدر
      React.createElement('div',{className:"flex items-center justify-between"},
        React.createElement('div',{className:"flex items-center gap-2"},
          React.createElement('div',{className:"w-8 h-8 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center"},
            React.createElement(I.Lock,{className:"w-4 h-4 text-[#C9A84C]"})
          ),
          React.createElement('div',null,
            React.createElement('h3',{className:"text-sm font-black text-white"},"تغيير كلمة المرور"),
            React.createElement('p',{className:"text-[9px] text-slate-500"},profile.full_name)
          )
        ),
        React.createElement('button',{onClick:onClose,className:"w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-slate-400 hover:text-white",'data-testid':'my-changepass-close'},
          React.createElement(I.X))
      ),

      // كلمة المرور الحالية
      React.createElement('div',null,
        React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},"كلمة المرور الحالية"),
        React.createElement('input',{
          type:showPass?'text':'password',
          value:currentPass,
          onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setCurrentPass(e.target.value),
          placeholder:"أدخل كلمة المرور الحالية",
          className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
          style:{fontFamily:'Cairo,sans-serif'},
          'data-testid':'my-changepass-current'
        })
      ),

      // كلمة المرور الجديدة
      React.createElement('div',null,
        React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},"كلمة المرور الجديدة"),
        React.createElement('div',{className:"relative"},
          React.createElement('input',{
            type:showPass?'text':'password',
            value:newPass,
            onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setNewPass(e.target.value),
            placeholder:"8+ أحرف على الأقل",
            className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
            style:{fontFamily:'Cairo,sans-serif'},
            'data-testid':'my-changepass-new'
          }),
          React.createElement('button',{
            type:'button', onClick:()=>setShowPass((s: boolean) =>!s),
            className:"absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
          }, React.createElement(I.Eye))
        ),
        // مؤشر القوة
        newPass.length > 0 && React.createElement('div',{className:"mt-2 space-y-1"},
          React.createElement('div',{className:"flex gap-1"},
            [1,2,3].map((i: number) =>React.createElement('div',{
              key:i,
              className:`h-1 flex-1 rounded-full transition-all ${i<=strength?strengthBg[strength]:'bg-slate-700'}`
            }))
          ),
          React.createElement('p',{className:`text-[9px] font-bold ${strengthColor[strength]}`},
            "قوة الكلمة: "+strengthLabel[strength])
        )
      ),

      // تأكيد كلمة المرور
      React.createElement('div',null,
        React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},"تأكيد كلمة المرور الجديدة"),
        React.createElement('input',{
          type:showPass?'text':'password',
          value:confirmPass,
          onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setConfirmPass(e.target.value),
          placeholder:"أعد كتابة كلمة المرور الجديدة",
          className:`w-full p-2.5 text-xs rounded-xl border bg-white/5 text-white placeholder-slate-600 ${confirmPass&&newPass!==confirmPass?'border-red-500/50':'border-white/10'}`,
          style:{fontFamily:'Cairo,sans-serif'},
          'data-testid':'my-changepass-confirm'
        }),
        confirmPass && newPass!==confirmPass && React.createElement('p',{className:"text-[9px] text-red-400 mt-1"},"كلمتا المرور غير متطابقتين")
      ),

      err && React.createElement('div',{className:"bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-[11px] text-rose-400 text-center",'data-testid':'my-changepass-error'},err),

      // زر الحفظ
      React.createElement('button',{
        onClick:handleSave,
        disabled:saving||!isValid,
        'data-testid':'my-changepass-save',
        className:"w-full py-3 rounded-xl text-xs font-black text-premium-bg bg-gradient-to-tr from-[#C9A84C] to-[#E8C97A] shadow-lg active:scale-95 transition-transform disabled:opacity-50"
      },saving?'جاري التحديث...':'تحديث كلمة المرور')
    )
  );
}

export default ChangeMyPasswordModal;
