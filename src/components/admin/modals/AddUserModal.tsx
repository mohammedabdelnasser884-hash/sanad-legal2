import React, { useState } from 'react';
import { I } from '../../../constants';
import { ROLE_CONFIG, PERMISSION_LABELS } from '../icons';

function AddUserModal({ onSave, onClose, saving }) {
  const [form, setForm] = useState({
    full_name:'', email:'', password:'', role:'lawyer',
    permissions:{}, is_active:true
  });
  const [showPass, setShowPass] = useState(false);

  return React.createElement('div',{
    className:"fixed inset-0 z-50 flex items-end justify-center",
    style:{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)'}
  },
    React.createElement('div',{
      className:"w-full max-w-sm rounded-t-3xl p-5 space-y-4",
      style:{background:'#0d1a2e',border:'1px solid rgba(212,175,55,0.15)',borderBottom:'none',maxHeight:'90vh',overflowY:'auto'}
    },
      React.createElement('div',{className:"flex items-center justify-between"},
        React.createElement('h3',{className:"text-sm font-black text-white"},"إضافة مستخدم جديد"),
        React.createElement('button',{onClick:onClose,className:"w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-slate-400"},
          React.createElement(I.X))
      ),

      ...[
        {key:'full_name',label:'الاسم الكامل',type:'text',placeholder:'محمد أحمد'},
        {key:'email',label:'البريد الإلكتروني',type:'email',placeholder:'user@example.com'},
      ].map(f=>React.createElement('div',{key:f.key},
        React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},f.label),
        React.createElement('input',{
          type:f.type, value:form[f.key], placeholder:f.placeholder,
          onChange:e=>setForm(p=>({...p,[f.key]:e.target.value})),
          className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
          style:{fontFamily:'Cairo,sans-serif'}
        })
      )),

      // كلمة المرور
      React.createElement('div',null,
        React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},"كلمة المرور"),
        React.createElement('div',{className:"relative"},
          React.createElement('input',{
            type:showPass?'text':'password', value:form.password,
            onChange:e=>setForm(p=>({...p,password:e.target.value})),
            placeholder:"6+ حروف",
            className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
            style:{fontFamily:'Cairo,sans-serif'}
          }),
          React.createElement('button',{
            type:'button', onClick:()=>setShowPass(s=>!s),
            className:"absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
          }, React.createElement(I.Eye))
        )
      ),

      // الدور
      React.createElement('div',null,
        React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-2"},"الدور"),
        React.createElement('div',{className:"grid grid-cols-3 gap-2"},
          ['admin','lawyer','viewer'].map(role=>{
            const rc = ROLE_CONFIG[role];
            return React.createElement('button',{
              key:role, onClick:()=>setForm(f=>({...f,role})),
              className:`py-2 rounded-xl text-[10px] font-black border transition-all ${form.role===role?`${rc.bg} ${rc.color} ${rc.border}`:'bg-white/5 text-slate-500 border-white/10'}`
            }, rc.label);
          })
        )
      ),

      React.createElement('button',{
        onClick:()=>onSave(form),
        disabled:saving||!form.full_name.trim()||!form.email.trim()||form.password.length<6,
        className:"w-full py-3 rounded-xl text-xs font-black text-premium-bg bg-gradient-to-tr from-premium-gold to-[#E8C97A] shadow-lg active:scale-95 transition-transform disabled:opacity-50"
      },saving?'جاري الإنشاء...':'إنشاء الحساب')
    )
  );
}

// ─────────────────────────────────────────
//  مودال تغيير كلمة المرور
// ─────────────────────────────────────────

export default AddUserModal;
