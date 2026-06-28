import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from '../utils';
import { createPortal } from 'react-dom';
import { db } from '../supabaseClient';
import { I, COUNTRY_CONFIGS } from '../constants';
import { Inp, Sel } from './shared';

function NewLawyerModal({onClose,onSave,loading}){
    const [form,setForm]=useState({full_name:'',email:'',password:'',role:'lawyer'});
    const s=(k,v)=>setForm(p=>({...p,[k]:v}));
    const [showPass,setShowPass]=useState(false);

    return React.createElement('div',{className:"fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm",onClick:e=>{if(e.target===e.currentTarget)onClose();}},
        React.createElement('div',{className:"bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 p-6 pb-10 shadow-2xl slide-up"},
            React.createElement('div',{className:"w-10 h-1 bg-white/20 rounded-full mx-auto mb-5"}),
            React.createElement('h3',{className:"text-sm font-black mb-5 text-white flex items-center gap-2"},
                React.createElement('span',{className:"w-1 h-4 bg-blue-400 rounded-full"}),
                "إضافة مستخدم جديد لسَنَد"
            ),
            React.createElement('div',{className:"space-y-4"},
                React.createElement(Inp,{label:"الاسم الكامل",value:form.full_name,onChange:e=>s('full_name',e.target.value),placeholder:"الأستاذ / محمد أحمد",required:true}),
                React.createElement(Inp,{label:"البريد الإلكتروني",type:"email",value:form.email,onChange:e=>s('email',e.target.value),placeholder:"lawyer@firm.com",required:true}),
                React.createElement('div',null,
                    React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"كلمة السر المؤقتة",React.createElement('span',{className:"text-rose-400 mr-1"},"*")),
                    React.createElement('div',{className:"relative"},
                        React.createElement('input',{type:showPass?'text':'password',value:form.password,onChange:e=>s('password',e.target.value),placeholder:"8 أحرف على الأقل",className:"w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 pl-10",style:{fontFamily:'Cairo,sans-serif'}}),
                        React.createElement('button',{type:"button",onClick:()=>setShowPass(!showPass),className:"absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-premium-gold transition-colors"},React.createElement(I.Eye))
                    )
                ),
                React.createElement(Sel,{
                    label:"الصلاحية",value:form.role,onChange:e=>s('role',e.target.value),
                    options:[{value:'lawyer',label:'محامي — يرى قضاياه فقط'},{value:'admin',label:'مدير مكتب — يرى كل شيء'}]
                }),
                React.createElement('button',{
                    disabled:loading,
                    onClick:()=>{
                        if(!form.full_name||!form.email||!form.password){toast('يرجى تعبئة كل الحقول',true);return;}
                        if(form.password.length<6){toast('كلمة السر 6 أحرف على الأقل',true);return;}
                        onSave(form);
                    },
                    className:"w-full py-3.5 bg-gradient-to-tr from-blue-500 to-blue-400 text-white rounded-xl font-black text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform mt-2"
                },loading?React.createElement(I.Spin):React.createElement(I.Users),loading?'جاري الإنشاء...':'إنشاء الحساب وإضافته لسَنَد')
            )
        )
    );
}

// ══════════════════════════════════════════
//  كارت تفاصيل الموكل
// ══════════════════════════════════════════

export default NewLawyerModal;
