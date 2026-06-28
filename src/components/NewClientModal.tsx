import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast, validatePhone, validateEmail } from '../utils';
import { createPortal } from 'react-dom';
import { db } from '../supabaseClient';
import { I, COUNTRY_CONFIGS } from '../constants';
import { Inp, Sel } from './shared';

// ── حقل تحذير صغير تحت أي input ──
function WarnHint({msg}){
    if(!msg) return null;
    return React.createElement('p',{className:"text-[9px] text-amber-400 mt-1 mr-1"},"⚠️ "+msg);
}

function FileUploadField({label,hint,onChange,preview}){
    const ref=useRef(null);
    return React.createElement('div',null,
        React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},label),
        React.createElement('div',{
            onClick:()=>ref.current.click(),
            className:"w-full p-3 rounded-xl border border-dashed border-white/20 bg-premium-bg flex items-center gap-3 cursor-pointer hover:border-emerald-500/50 transition-colors"
        },
            preview
                ?React.createElement('img',{src:preview,className:"w-12 h-12 rounded-lg object-cover shrink-0"})
                :React.createElement('div',{className:"w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 shrink-0"},
                    React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
                        React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"})
                    )
                ),
            React.createElement('div',null,
                React.createElement('p',{className:"text-xs text-slate-300 font-bold"},preview?'تم الاختيار ✓':'اضغط للرفع'),
                React.createElement('p',{className:"text-[10px] text-slate-500"},hint)
            )
        ),
        React.createElement('input',{ref,type:"file",accept:"image/*",className:"hidden",onChange:e=>onChange(e.target.files[0])})
    );
}

function NewClientModal({onClose,onSave,loading}){
    const [form,setForm]=useState({full_name:'',type:'individual',phone:'',phone2:'',email:'',address:'',notes:'',national_id:'',cr_number:'',kin_name:'',kin_phone:''});
    const [idFile,setIdFile]=useState(null);
    const [idPreview,setIdPreview]=useState(null);
    const [poaFile,setPoaFile]=useState(null);
    const [poaPreview,setPoaPreview]=useState(null);
    const s=(k,v)=>setForm(p=>({...p,[k]:v}));

    const phoneWarn = useMemo(()=>validatePhone(form.phone), [form.phone]);
    const phoneWarn2 = useMemo(()=>validatePhone(form.phone2), [form.phone2]);
    const emailWarn = useMemo(()=>validateEmail(form.email), [form.email]);

    const pickId=(file)=>{
        if(!file)return;
        setIdFile(file);
        setIdPreview(URL.createObjectURL(file));
    };
    const pickPoa=(file)=>{
        if(!file)return;
        setPoaFile(file);
        setPoaPreview(URL.createObjectURL(file));
    };

    return React.createElement('div',{className:"fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm",onClick:e=>{if(e.target===e.currentTarget)onClose();}},
        React.createElement('div',{className:"bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 p-6 pb-10 shadow-2xl slide-up max-h-[90vh] overflow-y-auto no-scrollbar"},
            React.createElement('div',{className:"w-10 h-1 bg-white/20 rounded-full mx-auto mb-5"}),
            React.createElement('div',{className:"flex items-center justify-between mb-5"},
                React.createElement('h3',{className:"text-sm font-black text-white flex items-center gap-2"},
                    React.createElement('span',{className:"w-1 h-4 bg-emerald-400 rounded-full"}),
                    "إضافة موكل جديد"
                ),
                React.createElement('button',{onClick:onClose,className:"w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white active:scale-90 transition-all"},"✕")
            ),
            React.createElement('div',{className:"space-y-4"},
                // بيانات أساسية
                React.createElement(Inp,{label:"الاسم الكامل",value:form.full_name,onChange:e=>s('full_name',e.target.value),placeholder:"مثال: محمد أحمد علي",required:true}),
                React.createElement('div',{className:"grid grid-cols-2 gap-3"},
                    React.createElement(Sel,{label:"نوع الموكل",value:form.type,onChange:e=>s('type',e.target.value),options:[
                        {value:'individual',label:'فرد'},
                        {value:'company',label:'شركة'},
                        {value:'government',label:'جهة حكومية'}
                    ]}),
                    React.createElement('div',null,
                        React.createElement(Inp,{label:"رقم الهاتف",value:form.phone,onChange:e=>s('phone',e.target.value),placeholder:"05xxxxxxxx"}),
                        React.createElement(WarnHint,{msg:phoneWarn})
                    )
                ),
                React.createElement('div',{className:"grid grid-cols-2 gap-3"},
                    React.createElement('div',null,
                        React.createElement(Inp,{label:"رقم هاتف ثاني",value:form.phone2,onChange:e=>s('phone2',e.target.value),placeholder:"رقم بديل"}),
                        React.createElement(WarnHint,{msg:phoneWarn2})
                    ),
                    React.createElement(Inp,{label:"العنوان",value:form.address,onChange:e=>s('address',e.target.value),placeholder:"العنوان التفصيلي"})
                ),
                React.createElement('div',null,
                    React.createElement(Inp,{label:"البريد الإلكتروني",type:"email",value:form.email,onChange:e=>s('email',e.target.value),placeholder:"client@email.com"}),
                    React.createElement(WarnHint,{msg:emailWarn})
                ),

                // فاصل قريب الدرجة الأولى
                React.createElement('div',{className:"border-t border-white/5 pt-2"},
                    React.createElement('p',{className:"text-[10px] font-black text-blue-400/80 mb-3"},"— قريب الدرجة الأولى —")
                ),
                React.createElement('div',{className:"grid grid-cols-2 gap-3"},
                    React.createElement(Inp,{label:"اسم القريب",value:form.kin_name,onChange:e=>s('kin_name',e.target.value),placeholder:"الاسم الكامل"}),
                    React.createElement('div',null,
                        React.createElement(Inp,{label:"هاتف القريب",value:form.kin_phone,onChange:e=>s('kin_phone',e.target.value),placeholder:"05xxxxxxxx"}),
                        React.createElement(WarnHint,{msg:validatePhone(form.kin_phone)})
                    )
                ),

                // فاصل
                React.createElement('div',{className:"border-t border-white/5 pt-2"},
                    React.createElement('p',{className:"text-[10px] font-black text-slate-500 mb-3"},"— المستندات الرسمية —")
                ),

                // الرقم القومي ورقم التوكيل
                React.createElement('div',{className:"grid grid-cols-2 gap-3"},
                    React.createElement(Inp,{label:"الرقم القومي",value:form.national_id,onChange:e=>s('national_id',e.target.value),placeholder:"14 رقم"}),
                    React.createElement(Inp,{label:"رقم التوكيل",value:form.cr_number,onChange:e=>s('cr_number',e.target.value),placeholder:"مثال: 2024/أ/1234"})
                ),

                // رفع الصور
                React.createElement(FileUploadField,{
                    label:"صورة البطاقة الشخصية",
                    hint:"JPG أو PNG — حجم أقصى 5MB",
                    onChange:pickId,
                    preview:idPreview
                }),
                React.createElement(FileUploadField,{
                    label:"صورة التوكيل",
                    hint:"JPG أو PNG — حجم أقصى 5MB",
                    onChange:pickPoa,
                    preview:poaPreview
                }),

                // ملاحظات
                React.createElement('div',null,
                    React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"ملاحظات"),
                    React.createElement('textarea',{
                        value:form.notes,onChange:e=>s('notes',e.target.value),
                        placeholder:"أي معلومات إضافية عن الموكل...",rows:3,
                        className:"w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 resize-none transition-colors",
                        style:{fontFamily:'Cairo,sans-serif'}
                    })
                ),

                React.createElement('button',{
                    disabled:loading,
                    onClick:()=>{
                        if(!form.full_name){toast('يرجى إدخال اسم الموكل',true);return;}
                        const warnings = [phoneWarn, phoneWarn2, emailWarn].filter(Boolean);
                        if(warnings.length>0) toast('⚠️ تنبيه: '+warnings[0]+' — تم الحفظ رغم ذلك');
                        onSave(form,idFile,poaFile);
                    },
                    className:"w-full py-3.5 bg-gradient-to-tr from-emerald-500 to-emerald-400 text-white rounded-xl font-black text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform mt-2"
                },loading?React.createElement(I.Spin):React.createElement(I.Person),loading?'جاري الرفع والحفظ...':'حفظ الموكل ☁️')
            )
        )
    );
}


// ══════════════════════════════════════════
//  PDF Viewer Modal
// ══════════════════════════════════════════

export default NewClientModal;
