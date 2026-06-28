import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../supabaseClient';
import { I, COUNTRY_CONFIGS } from '../constants';
import EditClientModal from './EditClientModal';


function ClientDetailModal({client:c, cases, onClose, onDelete, onEdit, onOpenCase}){
    const typeLabel=c.type==='individual'?'فرد':c.type==='company'?'شركة':c.type==='government'?'جهة حكومية':c.type||'فرد';
    const [imgViewer,setImgViewer]=useState(null);
    const [confirmDeleteClient, setConfirmDeleteClient]=useState(false);
    const [showEditClient, setShowEditClient]=useState(false);

    return React.createElement('div',{className:"fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm",onClick:e=>{if(e.target===e.currentTarget)onClose();}},
        // عارض الصورة
        imgViewer&&React.createElement('div',{
            className:"fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4",
            onClick:()=>setImgViewer(null)
        },
            React.createElement('img',{src:imgViewer,className:"max-w-full max-h-full rounded-2xl object-contain"}),
            React.createElement('button',{className:"absolute top-6 left-6 text-white text-2xl font-black",onClick:()=>setImgViewer(null)},"✕")
        ),

        React.createElement('div',{className:"bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 shadow-2xl slide-up max-h-[92vh] overflow-y-auto no-scrollbar"},
            // هيدر الكارت
            React.createElement('div',{className:"relative p-6 pb-4"},
                React.createElement('div',{className:"w-10 h-1 bg-white/20 rounded-full mx-auto mb-5"}),
                React.createElement('div',{className:"flex items-center justify-between mb-4"},
                    React.createElement('button',{onClick:onClose,className:"w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors"},"✕"),
                    React.createElement('div',{className:"flex items-center gap-2"},
                        React.createElement('button',{
                            onClick:()=>setShowEditClient(true),
                            className:"w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-premium-gold hover:border-premium-gold/30 active:scale-90 transition-all"
                        },React.createElement(I.Edit)),
                        React.createElement('button',{
                            onClick:()=>setConfirmDeleteClient(true),
                            className:"w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 active:scale-90 transition-all"
                        },React.createElement(I.Trash))
                    )
                ),
                React.createElement('div',{className:"flex items-center gap-4"},
                    React.createElement('div',{className:"w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center text-emerald-400 font-black text-2xl border border-emerald-500/20"},
                        (c.full_name||'م').charAt(0)
                    ),
                    React.createElement('div',null,
                        React.createElement('h2',{className:"text-base font-black text-white"},c.full_name),
                        React.createElement('span',{className:"text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400"},typeLabel),
                        cases.length > 0 && React.createElement('span',{
                            className:"text-[10px] font-bold px-2 py-0.5 rounded-full mr-1",
                            style:{background:'rgba(212,175,55,0.1)',color:'#D4AF37'}
                        }, cases.length + ' قضية')
                    )
                )
            ),

            // مودال تأكيد الحذف
            confirmDeleteClient && React.createElement('div',{className:"fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"},
                React.createElement('div',{className:"bg-premium-card border border-rose-500/20 rounded-3xl p-6 w-full max-w-sm slide-up shadow-2xl"},
                    React.createElement('div',{className:"w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-2xl mx-auto mb-4"},"🗑"),
                    React.createElement('h3',{className:"text-sm font-black text-white text-center mb-2"},"حذف الموكل"),
                    React.createElement('p',{className:"text-xs text-slate-400 text-center mb-5 leading-relaxed"},'هل أنت متأكد من حذف "'+c.full_name+'"؟\nسيتم إزالته من قاعدة البيانات نهائياً.'),
                    React.createElement('div',{className:"flex gap-3"},
                        React.createElement('button',{
                            onClick:()=>{ onDelete && onDelete(c.id); },
                            className:"flex-1 py-3 bg-rose-500 text-white rounded-xl text-xs font-black active:scale-95 transition-all"
                        },"نعم، احذف"),
                        React.createElement('button',{
                            onClick:()=>setConfirmDeleteClient(false),
                            className:"flex-1 py-3 bg-white/5 text-slate-300 rounded-xl text-xs font-black active:scale-95 transition-all"
                        },"إلغاء")
                    )
                )
            ),

            // مودال تعديل الموكل
            showEditClient && React.createElement(EditClientModal,{
                client:c,
                onClose:()=>setShowEditClient(false),
                onSave:(form,idFile,poaFile)=>{ onEdit && onEdit(c.id, form, idFile, poaFile); setShowEditClient(false); }
            }),

            React.createElement('div',{className:"px-6 pb-10 space-y-4"},

                // بيانات التواصل
                React.createElement('div',{className:"bg-premium-bg rounded-2xl p-4 space-y-3"},
                    React.createElement('p',{className:"text-[10px] font-black text-slate-500"},"— بيانات التواصل —"),
                    c.phone&&React.createElement('div',{className:"flex items-center justify-between"},
                        React.createElement('span',{className:"text-[10px] text-slate-400"},"الهاتف"),
                        React.createElement('div',{className:"flex items-center gap-2"},
                            React.createElement('a',{
                                href:`tel:${c.phone}`,
                                onClick:e=>e.stopPropagation(),
                                className:"text-xs font-bold text-white"
                            },c.phone),
                            React.createElement('a',{
                                href:`https://wa.me/${c.phone?.replace(/[^0-9]/g,'')}`,
                                target:"_blank",
                                onClick:e=>e.stopPropagation(),
                                className:"w-7 h-7 rounded-lg flex items-center justify-center text-sm active:scale-90 transition-all",
                                style:{background:'rgba(37,211,102,0.15)',color:'#25d366'}
                            },"💬"),
                            React.createElement('a',{
                                href:`tel:${c.phone}`,
                                onClick:e=>e.stopPropagation(),
                                className:"w-7 h-7 rounded-lg flex items-center justify-center text-sm active:scale-90 transition-all",
                                style:{background:'rgba(52,211,153,0.15)',color:'#34d399'}
                            },"📞")
                        )
                    ),
                    c.email&&React.createElement('div',{className:"flex items-center justify-between"},
                        React.createElement('span',{className:"text-[10px] text-slate-400"},"البريد"),
                        React.createElement('a',{
                            href:`mailto:${c.email}`,
                            onClick:e=>e.stopPropagation(),
                            className:"text-xs font-bold text-white truncate max-w-[60%]"
                        },c.email)
                    ),
                    !c.phone&&!c.email&&React.createElement('p',{className:"text-[10px] text-slate-600 text-center"},"لا توجد بيانات تواصل")
                ),

                // المستندات الرسمية
                (c.national_id||c.cr_number)&&React.createElement('div',{className:"bg-premium-bg rounded-2xl p-4 space-y-3"},
                    React.createElement('p',{className:"text-[10px] font-black text-slate-500"},"— المستندات الرسمية —"),
                    c.national_id&&React.createElement('div',{className:"flex items-center justify-between"},
                        React.createElement('span',{className:"text-[10px] text-slate-400"},"الرقم القومي"),
                        React.createElement('span',{className:"text-xs font-bold text-white font-mono"},c.national_id)
                    ),
                    c.cr_number&&React.createElement('div',{className:"flex items-center justify-between"},
                        React.createElement('span',{className:"text-[10px] text-slate-400"},"رقم التوكيل"),
                        React.createElement('span',{className:"text-xs font-bold text-white"},c.cr_number)
                    )
                ),

                // صور المستندات
                c.contact_info&&(c.contact_info.id_url||c.contact_info.poa_url)&&React.createElement('div',{className:"space-y-2"},
                    React.createElement('p',{className:"text-[10px] font-black text-slate-500"},"— صور المستندات —"),
                    React.createElement('div',{className:"grid grid-cols-2 gap-3"},
                        c.contact_info.id_url&&React.createElement('div',{className:"space-y-1"},
                            React.createElement('p',{className:"text-[9px] text-slate-500 text-center"},"البطاقة الشخصية"),
                            React.createElement('img',{
                                src:c.contact_info.id_url,
                                onClick:()=>setImgViewer(c.contact_info.id_url),
                                className:"w-full h-28 object-cover rounded-xl border border-white/10 cursor-pointer hover:border-emerald-500/50 transition-colors",
                                alt:"البطاقة"
                            })
                        ),
                        c.contact_info.poa_url&&React.createElement('div',{className:"space-y-1"},
                            React.createElement('p',{className:"text-[9px] text-slate-500 text-center"},"التوكيل"),
                            React.createElement('img',{
                                src:c.contact_info.poa_url,
                                onClick:()=>setImgViewer(c.contact_info.poa_url),
                                className:"w-full h-28 object-cover rounded-xl border border-white/10 cursor-pointer hover:border-emerald-500/50 transition-colors",
                                alt:"التوكيل"
                            })
                        )
                    )
                ),

                // القضايا المرتبطة — قابلة للضغط
                React.createElement('div',{className:"space-y-2"},
                    React.createElement('p',{className:"text-[10px] font-black text-slate-500"},"— القضايا المرتبطة ("+cases.length+") —"),
                    cases.length===0
                        ?React.createElement('div',{className:"bg-premium-bg rounded-xl p-4 text-center text-[10px] text-slate-600"},"لا توجد قضايا مرتبطة بهذا الموكل")
                        :React.createElement('div',{className:"space-y-2"},
                            cases.map(ca=>{
                                const numFmt = (()=>{const p=(ca.number||ca.case_number_official||'').split('/');return p.length===2?p[0]+' لسنة '+p[1]:p[0]||'—';})();
                                const statusColor = ca.status==='نشطة'?'#4ade80':ca.status==='مؤجلة'?'#fbbf24':ca.status==='منتهية'?'#60a5fa':'#94a3b8';
                                return React.createElement('div',{
                                    key:ca.id,
                                    onClick:()=>{ onClose(); onOpenCase && onOpenCase(ca); },
                                    className:"bg-premium-bg rounded-xl p-3 flex items-center justify-between gap-2 cursor-pointer active:scale-[0.98] transition-all border border-white/5 hover:border-premium-gold/20"
                                },
                                    React.createElement('div',{className:"min-w-0 flex-1"},
                                        React.createElement('p',{className:"text-xs font-bold text-white truncate"},ca.title),
                                        React.createElement('div',{className:"flex items-center gap-2 mt-0.5"},
                                            numFmt!=='—'&&React.createElement('span',{className:"text-[9px] font-mono",style:{color:'#D4AF37'}},numFmt),
                                            ca.court&&React.createElement('span',{className:"text-[9px] text-slate-500"},ca.court)
                                        )
                                    ),
                                    React.createElement('div',{className:"flex items-center gap-1.5 shrink-0"},
                                        React.createElement('span',{className:"text-[8px] font-bold px-2 py-1 rounded bg-premium-gold/10 text-premium-gold"},ca.type||ca.case_type),
                                        React.createElement('span',{
                                            className:"text-[8px] font-black px-2 py-1 rounded-full",
                                            style:{background:statusColor+'22',color:statusColor}
                                        },ca.status||'نشطة'),
                                        React.createElement('span',{className:"text-slate-600 text-xs"},"›")
                                    )
                                );
                            })
                        )
                ),

                // ملاحظات
                c.notes&&React.createElement('div',{className:"bg-premium-bg rounded-2xl p-4"},
                    React.createElement('p',{className:"text-[10px] font-black text-slate-500 mb-2"},"— ملاحظات —"),
                    React.createElement('p',{className:"text-xs text-slate-300 leading-relaxed"},c.notes)
                )
            )
        )
    );
}

export default ClientDetailModal;
