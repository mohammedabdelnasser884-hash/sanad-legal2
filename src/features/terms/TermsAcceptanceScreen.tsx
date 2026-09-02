import React, { useState } from 'react';
import { db } from '../../supabaseClient';
import { toast } from '../../shared/lib/notifications';
import { I } from '../../constants';
import { CURRENT_TERMS_VERSION, TERMS_SECTIONS } from './termsContent';
import type { ProfileRow } from '../../types';

// ══════════════════════════════════════════════════════════════════
//  TermsAcceptanceScreen — بوابة كاملة الشاشة (زي LoginScreen بالظبط)
//  بتتعرض لأي مستخدم عنده profile لكن لسه ماوافقش على CURRENT_TERMS_VERSION.
//  ⚠️ الكومبوننت ده لسه مش متربط بـApp.tsx (Phase 3 لسه) — تسليمه ده
//  بس الشاشة نفسها + منطق التسجيل في قاعدة البيانات.
// ══════════════════════════════════════════════════════════════════

interface TermsAcceptanceScreenProps {
  profile: ProfileRow;
  onAccepted: () => void;
}

function TermsAcceptanceScreen({ profile, onAccepted }: TermsAcceptanceScreenProps) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleConfirm = async () => {
    if (!agreed || saving) return;
    setSaving(true);
    setErr('');
    const { error } = await db.from('terms_acceptances').insert({
      user_id: profile.user_id,
      tenant_id: profile.tenant_id,
      terms_version: CURRENT_TERMS_VERSION,
    });
    setSaving(false);
    if (error) {
      // لو الصف موجود بالفعل (نفس user_id+terms_version) UNIQUE هيرفض
      // الإدراج — نعتبرها حالة "متسجّلة أصلاً" ونكمّل عادي بدل ما نعلّق
      // المستخدم على رسالة خطأ مالهاش لازمة.
      if (error.code === '23505') { onAccepted(); return; }
      setErr('حصل خطأ أثناء تسجيل الموافقة، حاول تاني.');
      toast('تعذر تسجيل الموافقة على الشروط', true);
      return;
    }
    onAccepted();
  };

  return React.createElement('div', {
    className: 'fixed inset-0 z-50 flex items-center justify-center p-4',
    style: { background: '#0a1626' },
  },
    React.createElement('div', {
      className: 'w-full max-w-lg rounded-3xl flex flex-col',
      style: { background: '#0d1a2e', border: '1px solid rgba(212,175,55,0.15)', maxHeight: '90vh' },
    },
      // هيدر
      React.createElement('div', { className: 'flex items-center gap-2 p-5 pb-3' },
        React.createElement('div', { className: 'w-9 h-9 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0' },
          React.createElement(I.Shield, { className: 'w-4 h-4 text-[#C9A84C]' })
        ),
        React.createElement('div', null,
          React.createElement('h2', { className: 'text-sm font-black text-white' }, 'شروط الاستخدام وإخلاء المسؤولية'),
          React.createElement('p', { className: 'text-[10px] text-slate-500' }, 'قبل الاستمرار، لازم تقرأ الشروط دي وتوافق عليها')
        )
      ),

      // النص القابل للتمرير
      React.createElement('div', {
        className: 'flex-1 overflow-y-auto px-5 space-y-4',
        style: { fontFamily: 'Cairo,sans-serif' },
      },
        TERMS_SECTIONS.map((section) =>
          React.createElement('div', { key: section.title },
            React.createElement('h3', { className: 'text-xs font-black text-[#C9A84C] mb-1' }, section.title),
            React.createElement('p', { className: 'text-[11px] leading-relaxed text-slate-300' }, section.body)
          )
        )
      ),

      // فوتر: checkbox + زرار
      React.createElement('div', { className: 'p-5 pt-4 space-y-3' },
        React.createElement('label', { className: 'flex items-start gap-2.5 cursor-pointer' },
          React.createElement('button', {
            type: 'button',
            onClick: () => setAgreed((a: boolean) => !a),
            'data-testid': 'terms-agree-checkbox',
            className: `w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center border transition-all ${agreed ? 'bg-[#C9A84C] border-[#C9A84C]' : 'border-white/20 bg-white/5'}`,
          }, agreed && React.createElement(I.Check, { className: 'w-3.5 h-3.5 text-premium-bg' })),
          React.createElement('span', { className: 'text-[11px] text-slate-300 leading-relaxed' },
            'قرأت الشروط والأحكام وإخلاء المسؤولية أعلاه بالكامل، وأوافق عليها.')
        ),
        err && React.createElement('p', { className: 'text-[10px] text-red-400' }, err),
        React.createElement('button', {
          onClick: handleConfirm,
          disabled: !agreed || saving,
          'data-testid': 'terms-confirm-button',
          className: 'w-full py-3 rounded-xl text-xs font-black text-premium-bg bg-gradient-to-tr from-[#C9A84C] to-[#E8C97A] shadow-lg active:scale-95 transition-transform disabled:opacity-40',
        }, saving ? 'جاري التسجيل...' : 'أوافق وأكمل')
      )
    )
  );
}

export default TermsAcceptanceScreen;
