import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast, safeUpdate, escapeHtml, escapeTelegramHtml, validateUploadFile } from '../utils';
import { Inp, Sel } from './shared';
import DatePicker from './DatePicker';
import { createPortal } from 'react-dom';
import { db } from '../supabaseClient';
import { I, COUNTRY_CONFIGS, loadOfficeSetting } from '../constants';
import EditCaseModal from './EditCaseModal';
import SessionUpdateModal from './SessionUpdateModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import SessionsCalendar from './SessionsCalendar';
import PdfViewerModal from './PdfViewerModal';
import { useCaseDetailActions } from '../hooks/caseDetail/useCaseDetailActions';

function CaseDetailView({caseData, client, onClose, onUpdate, onDelete, onEdit, onNotify, initialTab='timeline', profile=null}){
    const [activeSection, setActiveSection] = useState(initialTab);
    const [showEditCase, setShowEditCase] = useState(false);
    const [confirmDeleteCase, setConfirmDeleteCase] = useState(false);
    const [showStatusPicker, setShowStatusPicker] = useState(false);
    const [docSearch, setDocSearch] = useState('');
    const [viewingDoc, setViewingDoc] = useState<any>(null);

    const actions = useCaseDetailActions(caseData, onUpdate, onDelete, onNotify, setShowStatusPicker, client, profile);
    const {
      sessions, notes, docs, loadingSessions,
      showAddSession, setShowAddSession,
      editingNoteId, setEditingNoteId, editingNoteText, setEditingNoteText,
      editingSession, setEditingSession,
      deletingSessionId, setDeletingSessionId,
      sessionUpdateTarget, setSessionUpdateTarget,
      deletingNoteId, setDeletingNoteId,
      showAddNote, setShowAddNote,
      uploadingDoc, docCategory, setDocCategory, docLabel, setDocLabel,
      showDocForm, setShowDocForm, pendingFile, setPendingFile,
      deletingDocId, setDeletingDocId, fileInputRef,
      savingSession, savingNote, changingStatus,
      sessionForm, setSessionForm, noteText, setNoteText,
      exportingPdf, showWhatsApp, setShowWhatsApp, officeWhatsAppName,
      confirmDeleteSession, setConfirmDeleteSession,
      confirmDeleteNote, setConfirmDeleteNote,
      confirmDeleteDoc, setConfirmDeleteDoc,
      fetchSessions, handleFileSelect, handleUploadDoc, handleDeleteDoc,
      handleExportPdf, handleAddSession, handleAddNote, handleDeleteNote,
      handleUpdateNote, handleDeleteSession, handleUpdateSession, handleChangeStatus,
    } = actions;

    const statuses = [
        {key:'نشطة', color:'emerald', icon:'⚡'},
        {key:'مؤجلة', color:'amber', icon:'⏸'},
        {key:'منتهية', color:'blue', icon:'✅'},
        {key:'مغلقة', color:'slate', icon:'🔒'},
    ];

    // جلب بيانات المكتب للواتساب
    useEffect(()=>{
        Promise.all([
            loadOfficeSetting('office_whatsapp'),
            loadOfficeSetting('office_name'),
        ]).then(([wa, name])=>{
            actions.setOfficeWhatsAppName?.(name||'مكتب المحاماة');
            // نحفظ رقم الواتساب في ref عشان نستخدمه في دوال الرسائل
            (window as any).__officeWA = wa||'';
        });
    },[]);

    const statusStyle = {
        'نشطة': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        'مؤجلة': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        'منتهية': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        'مغلقة': 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    };

    const typeColors = {
        'تجاري':'from-blue-600/30 to-blue-600/5 border-blue-500/20 text-blue-300',
        'عمالي':'from-purple-600/30 to-purple-600/5 border-purple-500/20 text-purple-300',
        'جنائي':'from-rose-600/30 to-rose-600/5 border-rose-500/20 text-rose-300',
        'إداري':'from-cyan-600/30 to-cyan-600/5 border-cyan-500/20 text-cyan-300',
        'مدني':'from-teal-600/30 to-teal-600/5 border-teal-500/20 text-teal-300',
    };

    const tColor = typeColors[caseData.type] || typeColors['تجاري'];

    return React.createElement('div', {className: "fixed inset-0 z-50 bg-premium-bg flex flex-col fade-in"},

        // ── SessionUpdateModal ──
        sessionUpdateTarget && React.createElement(SessionUpdateModal, {
            session: sessionUpdateTarget,
            caseData: caseData,
            db: db,
            onClose: () => setSessionUpdateTarget(null),
            onDone: () => fetchSessions(),
            onNotify: onNotify
        }),

        // ── عرض المستند ──
        viewingDoc && React.createElement(PdfViewerModal, {doc: viewingDoc, onClose: () => setViewingDoc(null)}),

        // ── مودال تأكيد الحذف ──
        confirmDeleteCase && React.createElement('div', {className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"},
            React.createElement('div', {className: "bg-premium-card border border-rose-500/20 rounded-3xl p-6 w-full max-w-sm slide-up shadow-2xl"},
                React.createElement('div', {className: "w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-2xl mx-auto mb-4"}, "🗑"),
                React.createElement('h3', {className: "text-sm font-black text-white text-center mb-2"}, "حذف القضية"),
                React.createElement('p', {className: "text-xs text-slate-400 text-center mb-5 leading-relaxed"}, "هل أنت متأكد من حذف \""+caseData.title+"\"؟\nلن يمكن التراجع عن هذا الإجراء."),
                React.createElement('div', {className: "flex gap-3"},
                    React.createElement('button', {
                        onClick: () => { onDelete && onDelete(caseData.id); },
                        className: "flex-1 py-3 bg-rose-500 text-white rounded-xl text-xs font-black active:scale-95 transition-all"
                    }, "نعم، احذف"),
                    React.createElement('button', {
                        onClick: () => setConfirmDeleteCase(false),
                        className: "flex-1 py-3 bg-white/5 text-slate-300 rounded-xl text-xs font-black active:scale-95 transition-all"
                    }, "إلغاء")
                )
            )
        ),

        // ── مودال تعديل القضية ──
        showEditCase && React.createElement('div', {className: "fixed inset-0 z-[60] flex items-end justify-center bg-black/80 backdrop-blur-sm"},
            React.createElement(EditCaseModal, {
                caseData,
                onClose: () => setShowEditCase(false),
                onSave: (form) => { onEdit && onEdit(caseData.id, form); setShowEditCase(false); }
            })
        ),

        // ── مودال واتساب ──
        showWhatsApp && (()=>{
            const waNum = ((window as any).__officeWA || '').replace(/\D/g,'');
            const clientPhone = (client?.phone||'').replace(/\D/g,'');
            const officeName = officeWhatsAppName || 'مكتب المحاماة';
            const caseTitle = caseData.title || '—';
            const caseNum = caseData.number && caseData.number!=='—' ? (()=>{const p=(caseData.number||'').split('/');return p.length===2?p[0]+' لسنة '+p[1]:caseData.number;})() : '';
            const nextDate = caseData.date && caseData.date!=='—' ? caseData.date : '';
            const clientName = client?.full_name || 'الموكل الكريم';
            const sig = `\n\nمع التقدير،\n${officeName}`;

            const messages = [
                {
                    label: '📅 تأجيل الجلسة',
                    icon: '📅',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nنحيطكم علماً بأنه تم تأجيل الجلسة،\nوسيتم إخطاركم بالموعد الجديد فور تحديده.${sig}`
                },
                {
                    label: '📋 طلب مستندات',
                    icon: '📋',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nتمهيداً للجلسة القادمة، نود إفادتكم بضرورة توفير المستندات التالية:\n- \n- \n\nيُرجى التواصل معنا في أسرع وقت ممكن.${sig}`
                },
                {
                    label: '🎉 صدور حكم لصالحكم',
                    icon: '🎉',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nيسعدنا إخطاركم بأن المحكمة قد أصدرت حكمها لصالحكم،\nوالحمد لله على هذا الفضل.${sig}`
                },
                {
                    label: '⚖️ تحديد جلسة جديدة',
                    icon: '⚖️',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nنفيدكم بأنه تم تحديد موعد الجلسة القادمة،\nوسيتم إخطاركم بالتفاصيل قريباً.${sig}`
                },
                {
                    label: '📎 تسليم صورة الحكم',
                    icon: '📎',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nنفيدكم بأن صورة الحكم أصبحت جاهزة للاستلام،\nيمكنكم التواصل معنا لتحديد موعد مناسب.${sig}`
                },
                {
                    label: '💰 تذكير بالأتعاب',
                    icon: '💰',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nتذكيراً ودياً، نرجو منكم إتمام سداد المستحقات المتفق عليها،\nوذلك حتى نتمكن من الاستمرار في تقديم أفضل خدمة قانونية لكم.${sig}`
                },
                {
                    label: '✅ انتهاء القضية',
                    icon: '✅',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nنسعد بإخطاركم بانتهاء إجراءات القضية،\nوقد كان شرفاً لنا خدمتكم، ونأمل أن نكون عند حسن ظنكم.${sig}`
                },
                {
                    label: '📞 طلب تواصل',
                    icon: '📞',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nنرجو التكرم بالتواصل معنا في أقرب وقت ممكن لمناقشة بعض المستجدات المتعلقة بقضيتكم.${sig}`
                },
            ];

            const sendWA = (text) => {
                if(!clientPhone){ toast('⚠️ لا يوجد رقم واتساب مسجل للموكل', true); return; }
                const url = `https://wa.me/${clientPhone}?text=${encodeURIComponent(text)}`;
                window.open(url, '_blank');
            };

            return React.createElement('div', {
                className: "fixed inset-0 z-[70] flex items-end justify-center bg-black/80 backdrop-blur-sm",
                onClick: e=>{ if(e.target===e.currentTarget) setShowWhatsApp(false); }
            },
                React.createElement('div', {className: "bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 shadow-2xl slide-up max-h-[85vh] flex flex-col"},
                    // Header
                    React.createElement('div', {className: "px-6 pt-5 pb-4 border-b border-white/5 shrink-0"},
                        React.createElement('div', {className: "w-10 h-1 bg-white/20 rounded-full mx-auto mb-4"}),
                        React.createElement('div', {className: "flex items-center justify-between"},
                            React.createElement('div', {className: "flex items-center gap-2.5"},
                                React.createElement('div', {className: "w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-lg"}, "💬"),
                                React.createElement('div', null,
                                    React.createElement('p', {className: "text-sm font-black text-white"}, "مراسلة الموكل"),
                                    React.createElement('p', {className: "text-[10px] text-slate-500"}, clientPhone ? `📱 ${client?.phone}` : "لا يوجد رقم واتساب مسجل للموكل")
                                )
                            ),
                            React.createElement('button', {onClick: ()=>setShowWhatsApp(false), className: "w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400"}, "✕")
                        )
                    ),
                    // رسائل
                    React.createElement('div', {className: "overflow-y-auto no-scrollbar p-4 space-y-2.5"},
                        messages.map((msg, i) =>
                            React.createElement('button', {
                                key: i,
                                onClick: () => sendWA(msg.text),
                                className: "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/3 border border-white/8 hover:bg-emerald-500/10 hover:border-emerald-500/20 active:scale-[0.98] transition-all text-right"
                            },
                                React.createElement('span', {className: "text-xl shrink-0"}, msg.icon),
                                React.createElement('div', {className: "flex-1"},
                                    React.createElement('p', {className: "text-xs font-black text-white"}, msg.label),
                                    React.createElement('p', {className: "text-[10px] text-slate-500 mt-0.5 line-clamp-1"},
                                        msg.text.split('\n').filter(l=>l.trim()&&!l.includes('السلام'))[0]||''
                                    )
                                ),
                                React.createElement('span', {className: "text-emerald-400 text-sm shrink-0"}, "↗")
                            )
                        )
                    )
                )
            );
        })(),

        // ── Hero Header ──
        React.createElement('div', {className: `relative bg-gradient-to-b ${tColor.split(' ').slice(0,2).join(' ')} border-b border-white/5 pb-0 overflow-hidden`},
            // خلفية زخرفية
            React.createElement('div', {className: "absolute inset-0 overflow-hidden pointer-events-none"},
                React.createElement('div', {className: "absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/3 blur-3xl"}),
                React.createElement('div', {className: "absolute top-10 left-10 w-32 h-32 rounded-full bg-premium-gold/5 blur-2xl"}),
                // خطوط زخرفية
                React.createElement('div', {style:{position:'absolute',top:0,right:0,width:'100%',height:'100%',backgroundImage:'repeating-linear-gradient(45deg, transparent, transparent 40px, rgba(255,255,255,0.01) 40px, rgba(255,255,255,0.01) 80px)', pointerEvents:'none'}})
            ),

            // شريط التنقل العلوي
            React.createElement('div', {className: "relative z-10 flex items-center justify-between px-4 pt-4 pb-3"},
                React.createElement('button', {
                    onClick: onClose,
                    className: "flex items-center gap-1.5 text-white/70 hover:text-white transition-colors active:scale-95"
                },
                    React.createElement(I.ChevronLeft),
                    React.createElement('span', {className: "text-xs font-bold"}, "القضايا")
                ),
                React.createElement('div', {className: "flex items-center gap-2"},
                    // زر تصدير PDF
                    React.createElement('button', {
                        onClick: handleExportPdf,
                        disabled: exportingPdf,
                        title: "تصدير PDF",
                        className: "w-8 h-8 rounded-xl bg-premium-gold/10 border border-premium-gold/20 flex items-center justify-center text-premium-gold hover:bg-premium-gold/20 active:scale-90 transition-all disabled:opacity-50"
                    }, exportingPdf ? React.createElement(I.Spin) : React.createElement('span',{className:"text-sm"},"📄")),
                    // زر واتساب
                    React.createElement('button', {
                        onClick: () => setShowWhatsApp(true),
                        title: "مراسلة الموكل واتساب",
                        className: "w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 active:scale-90 transition-all"
                    }, React.createElement('span', {className: "text-sm"}, "💬")),
                    // زر تعديل
                    React.createElement('button', {
                        onClick: () => setShowEditCase(true),
                        className: "w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-premium-gold hover:border-premium-gold/30 active:scale-90 transition-all"
                    }, React.createElement(I.Edit)),
                    // زر حذف
                    React.createElement('button', {
                        onClick: () => setConfirmDeleteCase(true),
                        className: "w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 active:scale-90 transition-all"
                    }, React.createElement(I.Trash)),
                    // زر تغيير الحالة
                    React.createElement('div', {className: "relative"},
                        React.createElement('button', {
                            onClick: () => setShowStatusPicker(!showStatusPicker),
                            className: `flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black transition-all ${statusStyle[caseData.status] || statusStyle['نشطة']}`
                        },
                            changingStatus ? React.createElement(I.Spin) : React.createElement('span', null, statuses.find(s=>s.key===caseData.status)?.icon || '⚡'),
                            React.createElement('span', null, caseData.status || 'نشطة'),
                            React.createElement('svg', {className: "w-3 h-3 opacity-60", fill: "none", viewBox: "0 0 24 24", strokeWidth: "2.5", stroke: "currentColor"},
                                React.createElement('path', {strokeLinecap: "round", strokeLinejoin: "round", d: "m19.5 8.25-7.5 7.5-7.5-7.5"})
                            )
                        ),
                        showStatusPicker && React.createElement('div', {className: "absolute top-full left-0 mt-2 bg-premium-card border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-20 min-w-[140px]"},
                            statuses.map(s =>
                                React.createElement('button', {
                                    key: s.key,
                                    onClick: () => handleChangeStatus(s.key),
                                    className: `w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-right transition-colors ${caseData.status === s.key ? 'bg-white/5 text-premium-gold' : 'text-slate-300 hover:bg-white/5'}`
                                },
                                    React.createElement('span', null, s.icon),
                                    React.createElement('span', null, s.key),
                                    caseData.status === s.key && React.createElement(I.Check)
                                )
                            )
                        )
                    )
                )
            ),

            // معلومات القضية الرئيسية
            React.createElement('div', {className: "relative z-10 px-5 pb-5"},
                // نوع القضية badge
                React.createElement('div', {className: "inline-flex items-center gap-1.5 mb-3"},
                    React.createElement('div', {className: `px-2.5 py-1 rounded-lg border text-[9px] font-black tracking-widest uppercase ${tColor.split(' ').slice(2).join(' ')}`},
                        React.createElement(I.Scale),
                    ),
                    React.createElement('span', {className: "text-[10px] font-black text-white/60 tracking-wider"}, caseData.type)
                ),

                React.createElement('h1', {className: "text-lg font-black text-white leading-tight mb-2 ml-2"}, caseData.title),

                // أسماء الخصوم
                (()=>{
                    const splitParty = (val) => {
                        if(!val) return {name:'—', capacity:''};
                        const m = val.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
                        return m ? {name:m[1].trim(), capacity:m[2].trim()} : {name:val, capacity:''};
                    };
                    const p = splitParty(caseData.plaintiff);
                    const d = splitParty(caseData.defendant);
                    return (caseData.plaintiff || caseData.defendant) && React.createElement('div',{className:"flex items-center gap-2 mb-3 flex-wrap"},
                        React.createElement('div',{className:"flex flex-col"},
                            React.createElement('span',{className:"text-[11px] font-black text-emerald-400 leading-tight"},p.name),
                            p.capacity && React.createElement('span',{className:"text-[9px] font-bold text-emerald-400/60 leading-tight"},p.capacity)
                        ),
                        React.createElement('span',{className:"text-[10px] font-black text-purple-400 px-1.5 py-0.5 rounded-md shrink-0",style:{background:'rgba(168,85,247,0.12)'}},"ضد"),
                        React.createElement('div',{className:"flex flex-col"},
                            React.createElement('span',{className:"text-[11px] font-black text-rose-400 leading-tight"},d.name),
                            d.capacity && React.createElement('span',{className:"text-[9px] font-bold text-rose-400/60 leading-tight"},d.capacity)
                        )
                    );
                })(),

                React.createElement('div', {className: "flex flex-wrap gap-x-4 gap-y-2"},
                    caseData.number !== '—' && React.createElement('div', {className: "flex items-center gap-1.5"},
                        React.createElement('span', {className: "text-[9px] text-white/40 font-bold"}, "رقم القيد"),
                        React.createElement('span', {className: "text-[10px] text-premium-gold font-black font-mono"},
                            (()=>{const p=(caseData.number||'').split('/');return p.length===2?p[0]+' لسنة '+p[1]:caseData.number;})()
                        )
                    ),
                    React.createElement('div', {className: "flex items-center gap-1.5"},
                        React.createElement('span', {className: "text-[9px] text-white/40 font-bold"}, "المحكمة"),
                        React.createElement('span', {className: "text-[10px] text-white/80 font-bold"}, caseData.court)
                    ),
                    client && React.createElement('div', {className: "flex items-center gap-1.5"},
                        React.createElement('span', {className: "text-[9px] text-white/40 font-bold"}, "الموكل"),
                        React.createElement('span', {className: "text-[10px] text-emerald-400 font-black"}, client.full_name),
                        client.phone && React.createElement('a',{href:`tel:${client.phone}`,className:"text-[9px] text-slate-500"},client.phone)
                    )
                )
            ),

            // Tabs
            React.createElement('div', {className: "relative z-10 flex border-t border-white/5"},
                [
                    {key:'timeline', label:'الجلسات', icon:'🗓'},
                    {key:'notes', label:'الملاحظات', icon:'📝'},
                    {key:'docs', label:'المستندات', icon:'📁'},
                    {key:'info', label:'البيانات', icon:'📋'},
                ].map(tab =>
                    React.createElement('button', {
                        key: tab.key,
                        onClick: () => setActiveSection(tab.key),
                        className: `flex-1 flex flex-col items-center gap-0.5 py-3 text-[9px] font-black transition-all ${activeSection === tab.key ? 'text-premium-gold border-b-2 border-premium-gold' : 'text-white/40 border-b-2 border-transparent'}`
                    },
                        React.createElement('span', {className: "text-base leading-none"}, tab.icon),
                        tab.label
                    )
                )
            )
        ),

        // ── المحتوى ──
        React.createElement('div', {className: "flex-1 overflow-y-auto no-scrollbar px-4 py-4 pb-28"},

            // ═══ Timeline الجلسات ═══
            activeSection === 'timeline' && React.createElement('div', {className: "space-y-4 fade-in"},
                // زر إضافة جلسة
                React.createElement('button', {
                    onClick: () => setShowAddSession(!showAddSession),
                    className: "w-full py-3 border border-dashed border-premium-gold/30 rounded-2xl flex items-center justify-center gap-2 text-premium-gold text-xs font-black hover:bg-premium-gold/5 transition-all active:scale-[0.98]"
                },
                    React.createElement(I.Plus),
                    "إضافة جلسة جديدة"
                ),

                // فورم إضافة جلسة
                showAddSession && React.createElement('div', {className: "bg-premium-card border border-premium-gold/20 rounded-2xl p-4 space-y-3 slide-up"},
                    React.createElement('h4', {className: "text-xs font-black text-premium-gold flex items-center gap-2"},
                        React.createElement('span', {className: "w-1 h-3 bg-premium-gold rounded-full"}),
                        "بيانات الجلسة"
                    ),
                    // التاريخ + الوقت
                    React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                        React.createElement(DatePicker, {label: "تاريخ الجلسة", value: sessionForm.date, onChange: v => setSessionForm(p=>({...p,date:v})), required: true}),
                        React.createElement('div',null,
                            React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"وقت الجلسة"),
                            React.createElement('div',{className:"flex gap-1"},
                                ['صباحي','مسائي'].map(t=>React.createElement('button',{
                                    key:t,
                                    onClick:()=>setSessionForm(p=>({...p,time_period:t})),
                                    className:`flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all active:scale-95 ${sessionForm.time_period===t?'bg-premium-gold text-premium-bg':'bg-white/5 border border-white/10 text-slate-400'}`
                                },t==='صباحي'?'🌅 صباحي':'🌆 مسائي'))
                            )
                        )
                    ),
                    React.createElement(Inp, {label: "ما جرى في الجلسة", value: sessionForm.description, onChange: e => setSessionForm(p=>({...p,description:e.target.value})), placeholder: "ملخص ما دار في الجلسة..."}),
                    React.createElement(Inp, {label: "النتيجة / القرار", value: sessionForm.result, onChange: e => setSessionForm(p=>({...p,result:e.target.value})), placeholder: "قرار المحكمة أو ما آلت إليه الجلسة..."}),
                    React.createElement(Inp, {label: "الإجراء القادم", value: sessionForm.next_action, onChange: e => setSessionForm(p=>({...p,next_action:e.target.value})), placeholder: "ما المطلوب تنفيذه قبل الجلسة القادمة؟"}),
                    React.createElement('div', {className: "flex gap-2"},
                        React.createElement('button', {
                            onClick: handleAddSession,
                            disabled: savingSession || !sessionForm.date,
                            className: "flex-1 py-2.5 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all"
                        }, savingSession ? React.createElement(I.Spin) : React.createElement(I.Check), "حفظ الجلسة"),
                        React.createElement('button', {onClick: () => setShowAddSession(false), className: "px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"}, "إلغاء")
                    )
                ),

                // Timeline
                loadingSessions
                    ? React.createElement('div', {className: "flex items-center justify-center py-16 gap-2 text-slate-500 text-xs"}, React.createElement(I.Spin), "جاري التحميل...")
                    : sessions.length === 0
                        ? React.createElement('div', {className: "text-center py-16 space-y-3"},
                            React.createElement('div', {className: "w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center text-3xl mx-auto"}, "🗓"),
                            React.createElement('p', {className: "text-white/60 font-black text-sm"}, "لا توجد جلسات مسجلة"),
                            React.createElement('p', {className: "text-slate-500 text-xs"}, "اضغط على إضافة جلسة لتسجيل أول جلسة")
                          )
                        : React.createElement('div', {className: "relative"},
                            // الخط الرأسي للـ timeline
                            React.createElement('div', {className: "absolute right-[27px] top-4 bottom-4 w-px bg-gradient-to-b from-premium-gold/40 via-white/10 to-transparent"}),
                            React.createElement('div', {className: "space-y-4"},
                                sessions.map((s, i) =>
                                    React.createElement('div', {key: s.id, className: "flex gap-4 items-start relative"},
                                        // نقطة الـ timeline
                                        React.createElement('div', {className: "shrink-0 w-14 flex flex-col items-center gap-1 relative z-10"},
                                            React.createElement('div', {className: `w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${i === 0 ? 'border-premium-gold bg-premium-gold/20 text-premium-gold' : 'border-white/15 bg-premium-bg text-slate-500'}`},
                                                sessions.length - i
                                            ),
                                            React.createElement('span', {className: "text-[8px] text-slate-500 font-bold text-center leading-tight"}, i === 0 ? 'الأخيرة' : '')
                                        ),
                                        // كارت الجلسة
                                        editingSession?.id === s.id
                                        ? React.createElement('div', {className: "flex-1 bg-premium-card border border-premium-gold/30 rounded-2xl p-4 space-y-3 slide-up"},
                                            React.createElement('h4', {className: "text-xs font-black text-premium-gold"}, "✏️ تعديل الجلسة"),
                                            React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                                                React.createElement(DatePicker, {label:"تاريخ الجلسة", value:editingSession.date, onChange:v=>setEditingSession(p=>({...p,date:v}))}),
                                                React.createElement('div',null,
                                                    React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"وقت الجلسة"),
                                                    React.createElement('div',{className:"flex gap-1"},
                                                        ['صباحي','مسائي'].map(t=>React.createElement('button',{
                                                            key:t,
                                                            onClick:()=>setEditingSession(p=>({...p,time_period:t})),
                                                            className:`flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all active:scale-95 ${editingSession.time_period===t?'bg-premium-gold text-premium-bg':'bg-white/5 border border-white/10 text-slate-400'}`
                                                        },t==='صباحي'?'🌅':'🌆'))
                                                    )
                                                )
                                            ),
                                            React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                                                React.createElement(Inp,{label:"الطابق",value:editingSession.location_floor,onChange:e=>setEditingSession(p=>({...p,location_floor:e.target.value})),placeholder:"الطابق"}),
                                                React.createElement(Inp,{label:"رقم القاعة",value:editingSession.location_hall,onChange:e=>setEditingSession(p=>({...p,location_hall:e.target.value})),placeholder:"القاعة"})
                                            ),
                                            React.createElement(Inp, {label:"ما جرى", value:editingSession.description, onChange:e=>setEditingSession(p=>({...p,description:e.target.value})), placeholder:"ملخص ما دار..."}),
                                            React.createElement(Inp, {label:"النتيجة", value:editingSession.result, onChange:e=>setEditingSession(p=>({...p,result:e.target.value})), placeholder:"قرار المحكمة..."}),
                                            React.createElement(Inp, {label:"الإجراء القادم", value:editingSession.next_action, onChange:e=>setEditingSession(p=>({...p,next_action:e.target.value})), placeholder:"ما المطلوب؟"}),
                                            React.createElement('div', {className: "flex gap-2"},
                                                React.createElement('button', {
                                                    onClick: () => { handleUpdateSession(s.id, editingSession); setEditingSession(null); },
                                                    className: "flex-1 py-2.5 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl text-xs font-black flex items-center justify-center gap-1 active:scale-95"
                                                }, React.createElement(I.Check), "حفظ"),
                                                React.createElement('button', {onClick:()=>setEditingSession(null), className:"px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"}, "إلغاء")
                                            )
                                          )
                                        : React.createElement('div', {
                                            className: `flex-1 bg-premium-card border rounded-2xl p-4 mb-1 transition-all cursor-pointer active:scale-[0.99] ${i === 0 ? 'border-premium-gold/25 shadow-neon-gold' : 'border-white/5'}`,
                                            onClick: () => i === 0 ? setSessionUpdateTarget(s) : null
                                          },
                                            // التاريخ + أزرار
                                            React.createElement('div', {className: "flex items-center justify-between mb-3"},
                                                React.createElement('div', {className: "flex items-center gap-2"},
                                                    React.createElement('div', {className: "p-1.5 bg-premium-gold/10 rounded-lg"},
                                                        React.createElement(I.CalGrid, {className: "w-4 h-4"})
                                                    ),
                                                    React.createElement('div',null,
                                                        React.createElement('span', {className: "text-[11px] font-black text-premium-gold"}, s.session_date),
                                                        s.session_time && React.createElement('span',{
                                                            className:"mr-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-black",
                                                            style:{background:s.session_time==='صباحي'?'rgba(251,191,36,0.15)':'rgba(99,102,241,0.15)',color:s.session_time==='صباحي'?'#fbbf24':'#818cf8'}
                                                        },s.session_time==='صباحي'?'🌅 صباحي':'🌆 مسائي')
                                                    )
                                                ),
                                                React.createElement('div', {className: "flex items-center gap-1.5"},
                                                    // الجلسة الأخيرة: badge + زر تحديث
                                                    i === 0 && React.createElement(React.Fragment, null,
                                                        React.createElement('span', {className: "text-[9px] px-2 py-0.5 bg-premium-gold/10 text-premium-gold rounded-full font-bold"}, "آخر جلسة"),
                                                        React.createElement('button', {
                                                            onClick: (e) => { e.stopPropagation(); setSessionUpdateTarget(s); },
                                                            className: "flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black active:scale-90 transition-all",
                                                            style: {background:'rgba(212,175,55,0.15)', color:'#D4AF37', border:'1px solid rgba(212,175,55,0.3)'}
                                                        }, "⚡ تحديث")
                                                    ),
                                                    // الجلسات القديمة: زر تعديل + حذف
                                                    i !== 0 && React.createElement(React.Fragment, null,
                                                        React.createElement('button', {
                                                            onClick: (e) => { e.stopPropagation(); setEditingSession({id:s.id, date:s.session_date||'', time_period:s.session_time||'صباحي', location_floor:s.session_floor||'', location_hall:s.session_hall||'', description:s.description||'', result:s.result||'', next_action:s.next_action||''}); },
                                                            className: "w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 hover:text-premium-gold active:scale-90 transition-all"
                                                        }, React.createElement(I.Edit)),
                                                        deletingSessionId === s.id
                                                        ? React.createElement('div', {className:"w-6 h-6 flex items-center justify-center"}, React.createElement(I.Spin))
                                                        : React.createElement('button', {
                                                            onClick: (e) => { e.stopPropagation(); setConfirmDeleteSession({id: s.id, date: s.session_date || '—'}); },
                                                            className: "w-6 h-6 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 active:scale-90 transition-all"
                                                        }, React.createElement(I.Trash))
                                                    )
                                                )
                                            ),
                                            // الموقع
                                            (s.session_floor||s.session_hall) && React.createElement('div',{
                                                className:"flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-xl text-[10px] font-bold",
                                                style:{background:'rgba(14,165,233,0.08)',border:'1px solid rgba(14,165,233,0.15)',color:'#38bdf8'}
                                            },
                                                React.createElement('span',null,"📍"),
                                                s.session_floor && React.createElement('span',null,"الطابق "+s.session_floor),
                                                s.session_floor && s.session_hall && React.createElement('span',{className:"text-slate-600 mx-1"},"·"),
                                                s.session_hall && React.createElement('span',null,"قاعة "+s.session_hall)
                                            ),
                                            s.description && React.createElement('div', {className: "mb-3"},
                                                React.createElement('p', {className: "text-[9px] font-black text-slate-500 mb-1"}, "ما جرى"),
                                                React.createElement('p', {className: "text-xs text-slate-200 leading-relaxed"}, s.description)
                                            ),
                                            // ما جرى في الجلسة
                                            s.result && React.createElement('div', {className: "bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3 mb-2"},
                                                React.createElement('p', {className: "text-[9px] font-black text-emerald-400 mb-1"}, "📌 النتيجة"),
                                                React.createElement('p', {className: "text-[11px] text-slate-200 font-bold leading-relaxed"}, s.result)
                                            ),
                                            // الإجراء القادم
                                            s.next_action && React.createElement('div', {className: "bg-amber-500/5 border border-amber-500/15 rounded-xl p-3"},
                                                React.createElement('p', {className: "text-[9px] font-black text-amber-400 mb-1"}, "⚡ الإجراء القادم"),
                                                React.createElement('p', {className: "text-[11px] text-slate-200 font-bold leading-relaxed"}, s.next_action)
                                            )
                                          )
                                    )
                                )
                            )
                          )
            ), // end sessions outer div

            // ═══ الملاحظات ═══
            activeSection === 'notes' && React.createElement('div', {className: "space-y-4 fade-in"},
                React.createElement('button', {
                    onClick: () => setShowAddNote(!showAddNote),
                    className: "w-full py-3 border border-dashed border-blue-500/30 rounded-2xl flex items-center justify-center gap-2 text-blue-400 text-xs font-black hover:bg-blue-500/5 transition-all active:scale-[0.98]"
                },
                    React.createElement(I.Plus), "إضافة ملاحظة"
                ),

                showAddNote && React.createElement('div', {className: "bg-premium-card border border-blue-500/20 rounded-2xl p-4 space-y-3 slide-up"},
                    React.createElement('textarea', {
                        value: noteText,
                        onChange: e => setNoteText(e.target.value),
                        placeholder: "اكتب ملاحظتك هنا...",
                        rows: 4,
                        className: "w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 resize-none leading-relaxed",
                        style: {fontFamily:'Cairo,sans-serif'}
                    }),
                    React.createElement('div', {className: "flex gap-2"},
                        React.createElement('button', {
                            onClick: handleAddNote,
                            disabled: savingNote || !noteText.trim(),
                            className: "flex-1 py-2.5 bg-gradient-to-tr from-blue-500 to-blue-400 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"
                        }, savingNote ? React.createElement(I.Spin) : React.createElement(I.Check), "حفظ الملاحظة"),
                        React.createElement('button', {onClick: () => setShowAddNote(false), className: "px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"}, "إلغاء")
                    )
                ),

                loadingSessions
                    ? React.createElement('div', {className: "flex items-center justify-center py-16 gap-2 text-slate-500 text-xs"}, React.createElement(I.Spin))
                    : notes.length === 0
                        ? React.createElement('div', {className: "text-center py-16 space-y-3"},
                            React.createElement('div', {className: "w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center text-3xl mx-auto"}, "📝"),
                            React.createElement('p', {className: "text-white/60 font-black text-sm"}, "لا توجد ملاحظات"),
                            React.createElement('p', {className: "text-slate-500 text-xs"}, "أضف ملاحظات خاصة بهذه القضية")
                          )
                        : React.createElement('div', {className: "space-y-3"},
                            notes.map((n, i) =>
                                React.createElement('div', {key: n.id, className: "bg-premium-card border border-white/5 rounded-2xl p-4"},
                                    editingNoteId === n.id
                                    ? React.createElement('div', {className: "space-y-3"},
                                        React.createElement('textarea', {
                                            value: editingNoteText,
                                            onChange: e => setEditingNoteText(e.target.value),
                                            rows: 4,
                                            className: "w-full p-3 text-xs rounded-xl border border-blue-500/30 bg-premium-bg text-white resize-none leading-relaxed",
                                            style: {fontFamily:'Cairo,sans-serif'}
                                        }),
                                        React.createElement('div', {className: "flex gap-2"},
                                            React.createElement('button', {
                                                onClick: () => { handleUpdateNote(n.id, editingNoteText); setEditingNoteId(null); },
                                                className: "flex-1 py-2 bg-gradient-to-tr from-blue-500 to-blue-400 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1 active:scale-95"
                                            }, React.createElement(I.Check), "حفظ"),
                                            React.createElement('button', {onClick:()=>setEditingNoteId(null), className:"px-4 py-2 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"}, "إلغاء")
                                        )
                                      )
                                    : React.createElement('div', {className: "flex items-start gap-3"},
                                        React.createElement('div', {className: "w-7 h-7 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0 mt-0.5"},
                                            React.createElement(I.Note)
                                        ),
                                        React.createElement('div', {className: "flex-1"},
                                            React.createElement('p', {className: "text-xs text-slate-200 leading-relaxed font-medium"}, n.content),
                                            React.createElement('p', {className: "text-[9px] text-slate-500 mt-2 font-bold"},
                                                new Date(n.created_at).toLocaleDateString('ar-SA', {year:'numeric', month:'long', day:'numeric'})
                                            )
                                        ),
                                        React.createElement('div', {className: "flex flex-col gap-1.5 shrink-0"},
                                            React.createElement('button', {
                                                onClick: () => { setEditingNoteId(n.id); setEditingNoteText(n.content); },
                                                className: "w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 hover:text-premium-gold active:scale-90 transition-all"
                                            }, React.createElement(I.Edit)),
                                            deletingNoteId === n.id
                                            ? React.createElement('div',{className:"w-6 h-6 flex items-center justify-center"}, React.createElement(I.Spin))
                                            : React.createElement('button', {
                                                onClick: () => { setConfirmDeleteNote({id: n.id, preview: (n.content||'').slice(0,40)}); },
                                                className: "w-6 h-6 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 active:scale-90 transition-all"
                                            }, React.createElement(I.Trash))
                                        )
                                    )
                                )
                            )
                          )
            ),

            // ═══ المستندات ═══
            activeSection === 'docs' && React.createElement('div', {className: "space-y-4 fade-in"},

                // hidden file input
                React.createElement('input', {
                    ref: fileInputRef,
                    type: 'file',
                    accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt',
                    onChange: handleFileSelect,
                    style: {display: 'none'}
                }),

                // زر الرفع
                !showDocForm && React.createElement('button', {
                    onClick: () => fileInputRef.current && fileInputRef.current.click(),
                    className: "w-full py-4 border-2 border-dashed border-purple-500/30 rounded-2xl flex flex-col items-center justify-center gap-2 text-purple-400 hover:bg-purple-500/5 transition-all active:scale-[0.98]"
                },
                    React.createElement('span', {className: "text-2xl"}, "📎"),
                    React.createElement('span', {className: "text-xs font-black"}, "رفع مستند جديد"),
                    React.createElement('span', {className: "text-[9px] text-slate-500"}, "صور · PDF · Word · Excel · PowerPoint")
                ),

                // فورم تصنيف المستند بعد اختيار الملف
                showDocForm && pendingFile && React.createElement('div', {className: "bg-premium-card border border-purple-500/20 rounded-2xl p-4 space-y-3 slide-up"},
                    // معاينة الملف
                    React.createElement('div', {className: "flex items-center gap-3 p-3 bg-premium-bg rounded-xl"},
                        React.createElement('div', {className: "w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 " + (
                            /\.(jpg|jpeg|png|gif|webp)$/i.test(pendingFile.name) ? 'bg-rose-500/10' :
                            /\.pdf$/i.test(pendingFile.name) ? 'bg-red-500/10' :
                            /\.(doc|docx)$/i.test(pendingFile.name) ? 'bg-blue-500/10' :
                            /\.(xls|xlsx)$/i.test(pendingFile.name) ? 'bg-emerald-500/10' : 'bg-white/5'
                        )},
                            /\.(jpg|jpeg|png|gif|webp)$/i.test(pendingFile.name) ? '🖼' :
                            /\.pdf$/i.test(pendingFile.name) ? '📄' :
                            /\.(doc|docx)$/i.test(pendingFile.name) ? '📝' :
                            /\.(xls|xlsx)$/i.test(pendingFile.name) ? '📊' : '📎'
                        ),
                        React.createElement('div', {className: "flex-1 min-w-0"},
                            React.createElement('p', {className: "text-xs font-bold text-white truncate"}, pendingFile.name),
                            React.createElement('p', {className: "text-[9px] text-slate-500"}, (pendingFile.size / 1024 / 1024).toFixed(2) + ' MB')
                        ),
                        React.createElement('button', {
                            onClick: () => { setShowDocForm(false); setPendingFile(null); if(fileInputRef.current) fileInputRef.current.value=''; },
                            className: "text-slate-500 hover:text-white text-sm"
                        }, "✕")
                    ),
                    // اسم المستند
                    React.createElement(Inp, {
                        label: "اسم / وصف المستند",
                        value: docLabel,
                        onChange: e => setDocLabel(e.target.value),
                        placeholder: "مثال: مذكرة الجلسة الأولى"
                    }),
                    // التصنيف
                    React.createElement(Sel, {
                        label: "تصنيف المستند",
                        value: docCategory,
                        onChange: e => setDocCategory(e.target.value),
                        options: ['مذكرة دفاع','صحيفة دعوى','حكم قضائي','عقد','توكيل','مستند رسمي','صورة','أخرى']
                    }),
                    React.createElement('div', {className: "flex gap-2"},
                        React.createElement('button', {
                            onClick: handleUploadDoc,
                            disabled: uploadingDoc,
                            className: "flex-1 py-2.5 bg-gradient-to-tr from-purple-600 to-purple-400 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all"
                        }, uploadingDoc
                            ? React.createElement(React.Fragment, null, React.createElement(I.Spin), "جاري الرفع...")
                            : React.createElement(React.Fragment, null, "☁️ رفع المستند")
                        ),
                        React.createElement('button', {
                            onClick: () => { setShowDocForm(false); setPendingFile(null); if(fileInputRef.current) fileInputRef.current.value=''; },
                            className: "px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"
                        }, "إلغاء")
                    )
                ),

                // ─ بحث في مستندات القضية ─
                docs.length > 0 && !showDocForm && React.createElement('div', {className: "relative"},
                    React.createElement('span', {className: "absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-xs"}, "🔍"),
                    React.createElement('input', {
                        type: "text", value: docSearch,
                        onChange: (e: any) => setDocSearch(e.target.value),
                        placeholder: "ابحث في مستندات هذه القضية...",
                        className: "w-full p-2.5 pr-9 text-xs rounded-xl border border-white/10 bg-premium-card text-white placeholder-slate-500 transition-colors",
                        style: {fontFamily: 'Cairo,sans-serif'}
                    }),
                    docSearch && React.createElement('button', {
                        onClick: () => setDocSearch(''),
                        className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                    }, "✕")
                ),

                // قائمة المستندات
                loadingSessions
                    ? React.createElement('div', {className: "flex items-center justify-center py-12 gap-2 text-slate-500 text-xs"}, React.createElement(I.Spin))
                    : docs.length === 0 && !showDocForm
                        ? React.createElement('div', {className: "text-center py-14 space-y-3"},
                            React.createElement('div', {className: "w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center text-3xl mx-auto"}, "📁"),
                            React.createElement('p', {className: "text-white/60 font-black text-sm"}, "لا توجد مستندات"),
                            React.createElement('p', {className: "text-slate-500 text-xs"}, "ارفع مستندات القضية من الزر أعلاه")
                          )
                        : React.createElement('div', {className: "space-y-3"},
                            (docSearch.trim()
                              ? docs.filter((d: any) => {
                                  const q = docSearch.trim().toLowerCase();
                                  return (d.file_name     || '').toLowerCase().includes(q)
                                      || (d.original_name || '').toLowerCase().includes(q)
                                      || (d.category      || '').toLowerCase().includes(q);
                                })
                              : docs
                            ).length === 0 && docSearch.trim()
                              ? React.createElement('div', {className: "text-center py-10 space-y-2"},
                                  React.createElement('p', {className: "text-slate-400 font-bold text-xs"}, `لا نتائج لـ "${docSearch}"`),
                                  React.createElement('button', {onClick: () => setDocSearch(''), className: "text-purple-400 text-xs font-bold"}, "مسح البحث")
                                )
                              : null,
                            (docSearch.trim()
                              ? docs.filter((d: any) => {
                                  const q = docSearch.trim().toLowerCase();
                                  return (d.file_name     || '').toLowerCase().includes(q)
                                      || (d.original_name || '').toLowerCase().includes(q)
                                      || (d.category      || '').toLowerCase().includes(q);
                                })
                              : docs
                            ).map(doc => {
                                const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.original_name || doc.file_name);
                                const isPdf = /\.pdf$/i.test(doc.original_name || doc.file_name);
                                const isWord = /\.(doc|docx)$/i.test(doc.original_name || doc.file_name);
                                const isExcel = /\.(xls|xlsx)$/i.test(doc.original_name || doc.file_name);
                                const isPpt = /\.(ppt|pptx)$/i.test(doc.original_name || doc.file_name);
                                const emoji = isImg ? '🖼' : isPdf ? '📄' : isWord ? '📝' : isExcel ? '📊' : isPpt ? '📑' : '📎';
                                const bgClass = isImg ? 'bg-rose-500/10 text-rose-400 border-rose-500/15'
                                    : isPdf ? 'bg-red-500/10 text-red-400 border-red-500/15'
                                    : isWord ? 'bg-blue-500/10 text-blue-400 border-blue-500/15'
                                    : isExcel ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15'
                                    : isPpt ? 'bg-orange-500/10 text-orange-400 border-orange-500/15'
                                    : 'bg-white/5 text-slate-400 border-white/10';
                                const catColor = {
                                    'حكم قضائي': 'text-premium-gold bg-premium-gold/10',
                                    'مذكرة دفاع': 'text-blue-400 bg-blue-500/10',
                                    'صحيفة دعوى': 'text-purple-400 bg-purple-500/10',
                                    'عقد': 'text-emerald-400 bg-emerald-500/10',
                                    'توكيل': 'text-cyan-400 bg-cyan-500/10',
                                }[doc.category] || 'text-slate-400 bg-white/5';

                                return React.createElement('div', {key: doc.id, className: "bg-premium-card border border-white/5 rounded-2xl overflow-hidden"},
                                    // معاينة الصورة لو كانت صورة
                                    isImg && React.createElement('div', {className: "relative"},
                                        React.createElement('img', {
                                            src: doc.file_url,
                                            className: "w-full h-36 object-cover",
                                            alt: doc.file_name
                                        }),
                                        React.createElement('div', {className: "absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"}),
                                        React.createElement('a', {
                                            href: doc.file_url, target: '_blank', rel: 'noreferrer',
                                            className: "absolute bottom-2 left-2 px-3 py-1.5 bg-white/15 backdrop-blur-sm text-white text-[10px] font-bold rounded-xl border border-white/20"
                                        }, "عرض كامل ↗")
                                    ),
                                    // بيانات المستند
                                    React.createElement('div', {className: "p-4 flex items-start gap-3"},
                                        !isImg && React.createElement('div', {className: `w-11 h-11 rounded-xl border flex items-center justify-center text-xl shrink-0 ${bgClass}`},
                                            emoji
                                        ),
                                        React.createElement('div', {className: "flex-1 min-w-0"},
                                            React.createElement('p', {className: "text-xs font-black text-white truncate"}, doc.file_name),
                                            React.createElement('div', {className: "flex items-center gap-2 mt-1.5"},
                                                React.createElement('span', {className: `text-[9px] font-bold px-2 py-0.5 rounded-full ${catColor}`}, doc.category),
                                                doc.file_size && React.createElement('span', {className: "text-[9px] text-slate-500"}, (doc.file_size/1024/1024).toFixed(2)+' MB')
                                            ),
                                            React.createElement('p', {className: "text-[9px] text-slate-600 mt-1"},
                                                new Date(doc.created_at).toLocaleDateString('ar-SA', {year:'numeric',month:'short',day:'numeric'})
                                            )
                                        ),
                                        React.createElement('div', {className: "flex flex-col gap-2"},
                                            // عرض
                                            React.createElement('button', {
                                                onClick: () => setViewingDoc(doc),
                                                className: "w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 hover:bg-purple-500/20 transition-all active:scale-90 text-sm"
                                            }, "👁"),
                                            // تحميل / فتح
                                            React.createElement('a', {
                                                href: doc.file_url, target: '_blank', rel: 'noreferrer',
                                                className: "w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all text-sm"
                                            }, "↗"),
                                            // حذف
                                            React.createElement('button', {
                                                onClick: () => setConfirmDeleteDoc({ id: doc.id, file_name: doc.file_name, storage_path: doc.storage_path }),
                                                disabled: deletingDocId === doc.id,
                                                className: "w-8 h-8 rounded-xl bg-rose-500/5 flex items-center justify-center text-rose-500/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all disabled:opacity-40"
                                            }, deletingDocId === doc.id ? React.createElement(I.Spin) : React.createElement(I.Trash))
                                        )
                                    )
                                );
                            })
                          )
            ),

            // ═══ البيانات ═══
            activeSection === 'info' && React.createElement('div', {className: "space-y-4 fade-in"},
                // بيانات القضية
                React.createElement('div', {className: "bg-premium-card border border-white/5 rounded-2xl p-4 space-y-0"},
                    React.createElement('p', {className: "text-[9px] font-black text-slate-500 mb-3 tracking-widest"}, "— بيانات القضية —"),
                    [
                        {label: 'موضوع الدعوى', value: caseData.title},
                        {label: 'نوع القضية', value: caseData.type},
                        {label: 'المحكمة', value: caseData.court},
                        {label: 'درجة التقاضي', value: caseData.court_level},
                        {label: 'رقم الدائرة', value: caseData.circuit_number},
                        {label: 'رقم القيد', value: (()=>{const p=(caseData.number||'').split('/');return p.length===2?p[0]+' لسنة '+p[1]:caseData.number;})()},
                        {label: 'أقرب جلسة', value: caseData.date},
                        {label: 'الحالة', value: caseData.status || 'نشطة'},
                    ].filter(r => r.value && r.value !== '—').map((row, i, arr) =>
                        React.createElement('div', {
                            key: row.label,
                            className: `flex items-start justify-between gap-4 py-3 ${i < arr.length - 1 ? 'border-b border-white/5' : ''}`
                        },
                            React.createElement('span', {className: "text-[10px] text-slate-400 font-bold shrink-0"}, row.label),
                            React.createElement('span', {className: "text-xs text-white font-black text-left max-w-[60%] text-right"}, row.value)
                        )
                    )
                ),

                // أسماء الخصوم
                (caseData.plaintiff || caseData.defendant) && React.createElement('div', {className: "bg-premium-card border border-white/5 rounded-2xl p-4"},
                    React.createElement('p', {className: "text-[9px] font-black text-slate-500 mb-3 tracking-widest"}, "— أطراف الدعوى —"),
                    React.createElement('div', {className: "space-y-3"},
                        caseData.plaintiff && React.createElement('div', {className: "flex items-center justify-between"},
                            React.createElement('span', {className: "text-[10px] text-slate-400 font-bold"}, "المدعي / الطاعن"),
                            React.createElement('span', {className: "text-[11px] font-black text-emerald-400"}, caseData.plaintiff)
                        ),
                        caseData.plaintiff && caseData.defendant && React.createElement('div', {className: "border-t border-white/5"}),
                        caseData.defendant && React.createElement('div', {className: "flex items-center justify-between"},
                            React.createElement('span', {className: "text-[10px] text-slate-400 font-bold"}, "المدعى عليه / المطعون ضده"),
                            React.createElement('span', {className: "text-[11px] font-black text-rose-400"}, caseData.defendant)
                        )
                    )
                ),

                // بيانات الموكل
                client && React.createElement('div', {className: "bg-premium-card border border-emerald-500/15 rounded-2xl p-4"},
                    React.createElement('p', {className: "text-[9px] font-black text-emerald-400/70 mb-3 tracking-widest"}, "— الموكل —"),
                    React.createElement('div', {className: "flex items-center gap-3"},
                        React.createElement('div', {className: "w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 font-black text-sm"},
                            (client.full_name || 'م').charAt(0)
                        ),
                        React.createElement('div', null,
                            React.createElement('p', {className: "text-sm font-black text-white"}, client.full_name),
                            React.createElement('p', {className: "text-[10px] text-emerald-400 font-bold"}, client.type || 'فرد'),
                            client.phone && React.createElement('a', {href:`tel:${client.phone}`, className: "text-[10px] text-slate-400 mt-0.5 block"}, '📞 '+client.phone)
                        )
                    )
                ),

                // إحصائيات سريعة
                React.createElement('div', {className: "grid grid-cols-3 gap-3"},
                    React.createElement('div', {className: "bg-premium-card border border-white/5 rounded-2xl p-4 text-center"},
                        React.createElement('p', {className: "text-3xl font-black text-premium-gold"}, sessions.length),
                        React.createElement('p', {className: "text-[9px] text-slate-400 font-bold mt-1"}, "الجلسات")
                    ),
                    React.createElement('div', {className: "bg-premium-card border border-white/5 rounded-2xl p-4 text-center"},
                        React.createElement('p', {className: "text-3xl font-black text-blue-400"}, notes.length),
                        React.createElement('p', {className: "text-[9px] text-slate-400 font-bold mt-1"}, "الملاحظات")
                    ),
                    React.createElement('div', {className: "bg-premium-card border border-white/5 rounded-2xl p-4 text-center"},
                        React.createElement('p', {className: "text-3xl font-black text-purple-400"}, docs.length),
                        React.createElement('p', {className: "text-[9px] text-slate-400 font-bold mt-1"}, "المستندات")
                    )
                )
            )
        ),

        // ── مودال تأكيد حذف الجلسة ──
        confirmDeleteSession && React.createElement('div', {className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"},
            React.createElement('div', {className: "bg-premium-card border border-rose-500/20 rounded-3xl p-6 w-full max-w-sm slide-up shadow-2xl"},
                React.createElement('div', {className: "w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-2xl mx-auto mb-4"}, "🗑"),
                React.createElement('h3', {className: "text-sm font-black text-white text-center mb-2"}, "حذف الجلسة"),
                React.createElement('p', {className: "text-xs text-slate-400 text-center mb-5 leading-relaxed"},
                    "هل أنت متأكد من حذف جلسة " + (confirmDeleteSession.date || '—') + "؟\nلن يمكن التراجع عن هذا الإجراء."
                ),
                React.createElement('div', {className: "flex gap-3"},
                    React.createElement('button', {
                        onClick: async () => {
                            const id = confirmDeleteSession.id;
                            setConfirmDeleteSession(null);
                            setDeletingSessionId(id);
                            await handleDeleteSession(id);
                            setDeletingSessionId(null);
                        },
                        className: "flex-1 py-3 bg-rose-500 text-white rounded-xl text-xs font-black active:scale-95 transition-all"
                    }, "نعم، احذف"),
                    React.createElement('button', {
                        onClick: () => setConfirmDeleteSession(null),
                        className: "flex-1 py-3 bg-white/5 text-slate-300 rounded-xl text-xs font-black active:scale-95 transition-all"
                    }, "إلغاء")
                )
            )
        ),

        // ── مودال تأكيد حذف الملاحظة ──
        confirmDeleteNote && React.createElement('div', {className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"},
            React.createElement('div', {className: "bg-premium-card border border-rose-500/20 rounded-3xl p-6 w-full max-w-sm slide-up shadow-2xl"},
                React.createElement('div', {className: "w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-2xl mx-auto mb-4"}, "🗑"),
                React.createElement('h3', {className: "text-sm font-black text-white text-center mb-2"}, "حذف الملاحظة"),
                React.createElement('p', {className: "text-xs text-slate-400 text-center mb-5 leading-relaxed"},
                    confirmDeleteNote.preview
                        ? "\"" + confirmDeleteNote.preview + (confirmDeleteNote.preview.length >= 40 ? "…" : "") + "\"\n\nهل أنت متأكد من الحذف؟ لن يمكن التراجع."
                        : "هل أنت متأكد من حذف الملاحظة؟ لن يمكن التراجع."
                ),
                React.createElement('div', {className: "flex gap-3"},
                    React.createElement('button', {
                        onClick: async () => {
                            const id = confirmDeleteNote.id;
                            setConfirmDeleteNote(null);
                            setDeletingNoteId(id);
                            await handleDeleteNote(id);
                            setDeletingNoteId(null);
                        },
                        className: "flex-1 py-3 bg-rose-500 text-white rounded-xl text-xs font-black active:scale-95 transition-all"
                    }, "نعم، احذف"),
                    React.createElement('button', {
                        onClick: () => setConfirmDeleteNote(null),
                        className: "flex-1 py-3 bg-white/5 text-slate-300 rounded-xl text-xs font-black active:scale-95 transition-all"
                    }, "إلغاء")
                )
            )
        ),

        // ── مودال تأكيد حذف المستند (BUG-14 FIX) ──
        confirmDeleteDoc && React.createElement('div', {className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"},
            React.createElement('div', {className: "bg-premium-card border border-rose-500/20 rounded-3xl p-6 w-full max-w-sm slide-up shadow-2xl"},
                React.createElement('div', {className: "w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-2xl mx-auto mb-4"}, "📄"),
                React.createElement('h3', {className: "text-sm font-black text-white text-center mb-2"}, "حذف المستند"),
                React.createElement('p', {className: "text-xs text-slate-400 text-center mb-5 leading-relaxed"},
                    "\"" + confirmDeleteDoc.file_name + "\"\n\nسيُحذف من التخزين وقاعدة البيانات ولا يمكن التراجع."
                ),
                React.createElement('div', {className: "flex gap-3"},
                    React.createElement('button', {
                        onClick: async () => {
                            const doc = confirmDeleteDoc;
                            setConfirmDeleteDoc(null);
                            await handleDeleteDoc(doc);
                        },
                        className: "flex-1 py-3 bg-rose-500 text-white rounded-xl text-xs font-black active:scale-95 transition-all"
                    }, "نعم، احذف"),
                    React.createElement('button', {
                        onClick: () => setConfirmDeleteDoc(null),
                        className: "flex-1 py-3 bg-white/5 text-slate-300 rounded-xl text-xs font-black active:scale-95 transition-all"
                    }, "إلغاء")
                )
            )
        )
    );
}

// ══════════════════════════════════════════
//  Modal إضافة قضية
// ══════════════════════════════════════════


export default CaseDetailView;
