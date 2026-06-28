import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { I } from '../constants';
import { Inp, Sel } from './shared';

// ── رفع صورة ──
function FileUploadField({label, hint, onChange, preview}: any) {
    const ref = useRef<any>(null);
    return React.createElement('div', null,
        React.createElement('label', {className:"block text-[10px] font-bold text-slate-400 mb-1.5"}, label),
        React.createElement('div', {
            onClick: () => ref.current.click(),
            className:"w-full p-3 rounded-xl border border-dashed border-white/20 bg-premium-bg flex items-center gap-3 cursor-pointer hover:border-emerald-500/50 transition-colors"
        },
            preview
                ? React.createElement('img', {src:preview, className:"w-12 h-12 rounded-lg object-cover shrink-0"})
                : React.createElement('div', {className:"w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 shrink-0"},
                    React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
                        React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"})
                    )
                  ),
            React.createElement('div', null,
                React.createElement('p', {className:"text-xs text-slate-300 font-bold"}, preview ? 'تم الاختيار ✓' : 'اضغط للرفع'),
                React.createElement('p', {className:"text-[10px] text-slate-500"}, hint)
            )
        ),
        React.createElement('input', {ref, type:"file", accept:"image/*", className:"hidden", onChange: (e:any) => onChange(e.target.files[0])})
    );
}

function EditClientModal({client: c, onClose, onSave}: any) {
    const [form, setForm] = useState({
        full_name:   c.full_name   || '',
        type:        c.client_type || c.type || 'individual',
        phone:       c.phone       || '',
        phone2:      c.phone2      || '',
        email:       c.email       || '',
        address:     c.address     || '',
        notes:       c.notes       || '',
        national_id: c.national_id || '',
        cr_number:   c.cr_number   || '',
        kin_name:    c.kin_name    || '',
        kin_phone:   c.kin_phone   || '',
    });

    // صور جديدة (اختيارية — لو مش اختار يبقى null ومش بيتغير الموجود)
    const [idFile,    setIdFile]    = useState<any>(null);
    const [idPreview, setIdPreview] = useState<string|null>(
        c.contact_info?.id_url || null
    );
    const [poaFile,    setPoaFile]    = useState<any>(null);
    const [poaPreview, setPoaPreview] = useState<string|null>(
        c.contact_info?.poa_url || null
    );

    const s = (k: string, v: any) => setForm(p => ({...p, [k]: v}));

    const pickId  = (file: any) => { if(!file) return; setIdFile(file);  setIdPreview(URL.createObjectURL(file)); };
    const pickPoa = (file: any) => { if(!file) return; setPoaFile(file); setPoaPreview(URL.createObjectURL(file)); };

    return createPortal(
        React.createElement('div', {
            className:"fixed inset-0 z-[70] flex items-end justify-center bg-black/80 backdrop-blur-sm",
            onClick: (e: any) => { if(e.target===e.currentTarget) onClose(); }
        },
        React.createElement('div', {className:"bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 p-6 pb-10 shadow-2xl slide-up max-h-[90vh] overflow-y-auto no-scrollbar"},
            React.createElement('div', {className:"w-10 h-1 bg-white/20 rounded-full mx-auto mb-5"}),
            React.createElement('div', {className:"flex items-center justify-between mb-5"},
                React.createElement('h3', {className:"text-sm font-black text-white flex items-center gap-2"},
                    React.createElement('span', {className:"w-1 h-4 bg-emerald-400 rounded-full"}),
                    "تعديل بيانات الموكل"
                ),
                React.createElement('button', {onClick:onClose, className:"w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400"}, "✕")
            ),
            React.createElement('div', {className:"space-y-4"},
                // الاسم ونوع الموكل
                React.createElement(Inp, {label:"الاسم الكامل", value:form.full_name, onChange:(e:any)=>s('full_name',e.target.value), placeholder:"اسم الموكل", required:true}),
                React.createElement('div', {className:"grid grid-cols-2 gap-3"},
                    React.createElement(Sel, {label:"نوع الموكل", value:form.type, onChange:(e:any)=>s('type',e.target.value), options:[
                        {value:'individual', label:'فرد'},
                        {value:'company',    label:'شركة'},
                        {value:'government', label:'جهة حكومية'},
                    ]}),
                    React.createElement(Inp, {label:"رقم الهاتف", value:form.phone, onChange:(e:any)=>s('phone',e.target.value), placeholder:"05xxxxxxxx"})
                ),
                React.createElement('div', {className:"grid grid-cols-2 gap-3"},
                    React.createElement(Inp, {label:"رقم هاتف ثاني", value:form.phone2, onChange:(e:any)=>s('phone2',e.target.value), placeholder:"رقم بديل"}),
                    React.createElement(Inp, {label:"العنوان", value:form.address, onChange:(e:any)=>s('address',e.target.value), placeholder:"العنوان التفصيلي"})
                ),
                React.createElement(Inp, {label:"البريد الإلكتروني", type:"email", value:form.email, onChange:(e:any)=>s('email',e.target.value), placeholder:"client@email.com"}),

                // الرقم القومي ورقم التوكيل
                React.createElement('div', {className:"grid grid-cols-2 gap-3"},
                    React.createElement(Inp, {label:"الرقم القومي", value:form.national_id, onChange:(e:any)=>s('national_id',e.target.value), placeholder:"14 رقم"}),
                    React.createElement(Inp, {label:"رقم التوكيل", value:form.cr_number, onChange:(e:any)=>s('cr_number',e.target.value), placeholder:"2024/أ/1234"})
                ),

                // فاصل قريب الدرجة الأولى
                React.createElement('div', {className:"border-t border-white/5 pt-2"},
                    React.createElement('p', {className:"text-[10px] font-black text-blue-400/80 mb-3"}, "— قريب الدرجة الأولى —")
                ),
                React.createElement('div', {className:"grid grid-cols-2 gap-3"},
                    React.createElement(Inp, {label:"اسم القريب",  value:form.kin_name,  onChange:(e:any)=>s('kin_name',e.target.value),  placeholder:"الاسم الكامل"}),
                    React.createElement(Inp, {label:"هاتف القريب", value:form.kin_phone, onChange:(e:any)=>s('kin_phone',e.target.value), placeholder:"05xxxxxxxx"})
                ),

                // فاصل المستندات
                React.createElement('div', {className:"border-t border-white/5 pt-2"},
                    React.createElement('p', {className:"text-[10px] font-black text-slate-500 mb-3"}, "— المستندات الرسمية —")
                ),
                React.createElement(FileUploadField, {
                    label:"صورة البطاقة الشخصية",
                    hint:"JPG أو PNG — حجم أقصى 5MB",
                    onChange: pickId,
                    preview: idPreview
                }),
                React.createElement(FileUploadField, {
                    label:"صورة التوكيل",
                    hint:"JPG أو PNG — حجم أقصى 5MB",
                    onChange: pickPoa,
                    preview: poaPreview
                }),

                // ملاحظات
                React.createElement('div', null,
                    React.createElement('label', {className:"block text-[10px] font-bold text-slate-400 mb-1.5"}, "ملاحظات"),
                    React.createElement('textarea', {
                        value:form.notes, onChange:(e:any)=>s('notes',e.target.value),
                        placeholder:"ملاحظات إضافية...", rows:3,
                        className:"w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 resize-none transition-colors",
                        style:{fontFamily:'Cairo,sans-serif'}
                    })
                ),

                // زر الحفظ
                React.createElement('button', {
                    onClick: () => { if(!form.full_name) return; onSave(form, idFile, poaFile); },
                    className:"w-full py-3.5 bg-gradient-to-tr from-emerald-500 to-emerald-400 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform mt-2"
                }, React.createElement(I.Check), "حفظ التعديلات")
            )
        )),
        document.body
    );
}

export default EditClientModal;
