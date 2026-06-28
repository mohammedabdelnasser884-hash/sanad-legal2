import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast, safeUpdate, logActivity } from '../utils';
import { recordError, recordSuccess } from '../systemHealth';
import { Inp } from './shared';
import DatePicker from './DatePicker';
import { createPortal } from 'react-dom';
import { db } from '../supabaseClient';
import { I, COUNTRY_CONFIGS } from '../constants';


function RemindersTab({initialFilter, profile=null}){
    const _userName = (profile as any)?.full_name || null;
    const [reminders, setReminders] = useState([]);
    const [loading, setLoading]     = useState(true);
    const [showForm, setShowForm]   = useState(false);
    const [form, setForm]           = useState({title:'', due_date:'', notes:''});
    const [saving, setSaving]       = useState(false);
    const [editTarget, setEditTarget]   = useState(null);
    const [editForm, setEditForm]       = useState({title:'', due_date:'', notes:''});
    const [editSaving, setEditSaving]   = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string|null>(null);  // BUG-15 FIX
    const [viewTarget, setViewTarget] = useState<any>(null);

    const PAGE_SIZE = 15;

    // ── state للـ pagination ──
    const [overdueList,   setOverdueList]   = useState<any[]>([]);
    const [overdueTotal,  setOverdueTotal]  = useState(0);
    const [overduePage,   setOverduePage]   = useState(0);
    const [overdueMore,   setOverdueMore]   = useState(false);

    const [doneList,      setDoneList]      = useState<any[]>([]);
    const [doneTotal,     setDoneTotal]     = useState(0);
    const [donePage,      setDonePage]      = useState(0);
    const [doneMore,      setDoneMore]      = useState(false);

    // ── جلب القادمة (كلها دفعة واحدة) ──
    const fetchUpcoming = useCallback(async () => {
        const today = new Date();
        const todayStr = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
        const {data, error} = await db.from('reminders')
            .select('*')
            .eq('done', false)
            .gte('due_date', todayStr)
            .order('due_date', {ascending: true});
        if(error){ recordError('db_reminders', error.message); }
        else { recordSuccess('db_reminders'); }
        return data || [];
    }, []);

    // ── جلب المتأخرة (paginated) ──
    const fetchOverdue = useCallback(async (page = 0, append = false) => {
        const today = new Date();
        const todayStr = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
        const from = page * PAGE_SIZE;
        const to   = from + PAGE_SIZE - 1;
        const {data, error, count} = await db.from('reminders')
            .select('*', {count: 'exact'})
            .eq('done', false)
            .lt('due_date', todayStr)
            .order('due_date', {ascending: false})
            .range(from, to);
        if(error){ recordError('db_reminders', error.message); return; }
        const list = data || [];
        if(append) setOverdueList(prev => [...prev, ...list]);
        else setOverdueList(list);
        setOverdueTotal(count || 0);
        setOverduePage(page);
        setOverdueMore((page + 1) * PAGE_SIZE < (count || 0));
    }, []);

    // ── جلب المنجزة (paginated) ──
    const fetchDone = useCallback(async (page = 0, append = false) => {
        const from = page * PAGE_SIZE;
        const to   = from + PAGE_SIZE - 1;
        const {data, error, count} = await db.from('reminders')
            .select('*', {count: 'exact'})
            .eq('done', true)
            .order('due_date', {ascending: false})
            .range(from, to);
        if(error){ recordError('db_reminders', error.message); return; }
        const list = data || [];
        if(append) setDoneList(prev => [...prev, ...list]);
        else setDoneList(list);
        setDoneTotal(count || 0);
        setDonePage(page);
        setDoneMore((page + 1) * PAGE_SIZE < (count || 0));
    }, []);

    // ── جلب كل البيانات عند الفتح ──
    const fetchReminders = useCallback(async () => {
        setLoading(true);
        const [upcomingData] = await Promise.all([
            fetchUpcoming(),
            fetchOverdue(0, false),
            fetchDone(0, false),
        ]);
        setReminders(upcomingData);
        setLoading(false);
    }, [fetchUpcoming, fetchOverdue, fetchDone]);

    useEffect(()=>{ if(profile) fetchReminders(); },[fetchReminders, profile]);

    const handleSave = async () => {
        if(!form.title||!form.due_date){ toast('يرجى إدخال العنوان والتاريخ',true); return; }
        setSaving(true);
        const {error} = await db.from('reminders').insert([{
            title: form.title.trim(),
            due_date: form.due_date,
            notes: form.notes||null,
            done: false
        }]);
        setSaving(false);
        if(error){
            recordError('reminder_save', error.message, {label:'حفظ التذكيرات', message:'تعذّر حفظ التذكير. تحقق من الاتصال بالإنترنت.'});
            toast('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true);
            return;
        }
        toast('✅ تم إضافة التذكير');
        logActivity(db, 'إضافة تذكير', { userName: _userName, entity_type: 'reminder', details: form.title.trim() });
        setShowForm(false); setForm({title:'',due_date:'',notes:''});
        fetchReminders(); // refresh كل الأقسام
    };

    const handleToggleDone = async (r) => {
        const nowISO = new Date().toISOString();
        const update = r.done
            ? { done: false,  completed_at: null }
            : { done: true,   completed_at: nowISO };
        const {success, error} = await safeUpdate(db, 'reminders', r.id, update, r.updated_at || null);
        if(!success){
            recordError('reminder_save', error?.message, {label:'حفظ التذكيرات', message:'تعذّر تحديث التذكير. تحقق من الاتصال بالإنترنت.'});
            toast('❌ تعذّر تحديث التذكير',true);
            return;
        }
        toast(r.done ? '↩️ تم إلغاء الإنجاز' : '✅ تم تسجيل الإنجاز');
        fetchReminders();
    };

    const handleDelete = async (id) => {
        const {error} = await db.from('reminders').delete().eq('id',id);
        if(error){
            recordError('reminder_save', error.message, {label:'حذف التذكيرات', message:'تعذّر حذف التذكير. تحقق من الاتصال بالإنترنت.'});
            toast('❌ تعذّر حذف التذكير',true);
            return;
        }
        toast('🗑 تم حذف التذكير');
        logActivity(db, 'حذف تذكير', { userName: _userName, entity_type: 'reminder', entity_id: id });
        fetchReminders();
    };

    const handleEdit = async () => {
        if(!editForm.title||!editForm.due_date){ toast('يرجى إدخال العنوان والتاريخ',true); return; }
        setEditSaving(true);
        const { success, conflict } = await safeUpdate(db, 'reminders', editTarget.id, {
            title: editForm.title.trim(),
            due_date: editForm.due_date,
            notes: editForm.notes||null,
        }, editTarget.updated_at || null);
        setEditSaving(false);
        if(conflict) return;
        if(!success){
            recordError('reminder_save', '', {label:'حفظ التذكيرات', message:'تعذّر تعديل المهمة. تحقق من الاتصال بالإنترنت.'});
            toast('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true);
            return;
        }
        toast('✅ تم تعديل المهمة');
        logActivity(db, 'تعديل تذكير', { userName: _userName, entity_type: 'reminder', entity_id: editTarget?.id, details: editForm.title.trim() });
        setEditTarget(null);
        fetchReminders();
    };

    const today = new Date();
    const todayStr = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');

    // القادمة: من reminders state (محملة كلها)
    const upcoming = reminders;

    const fmtCompletedAt = (iso: string) => {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleDateString('ar-EG', { day:'numeric', month:'long', year:'numeric' });
    };

    const ReminderCard = ({r}: any) => {
        const isOverdue = !r.done && r.due_date < todayStr;
        const isToday   = r.due_date === todayStr;
        return React.createElement('div',{
            className:`bg-premium-card border rounded-xl px-3 py-2.5 cursor-pointer active:scale-[0.99] transition-all ${r.done?'opacity-60 border-white/5':isOverdue?'border-rose-500/30':isToday?'border-amber-500/30':'border-white/5'}`,
            onClick: () => setViewTarget(r)
        },
            React.createElement('div',{className:"flex items-center gap-2.5"},
                // زر التأشير
                React.createElement('button',{
                    onClick: (e:any) => { e.stopPropagation(); handleToggleDone(r); },
                    className:`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${r.done?'bg-emerald-500 border-emerald-500 text-white':isOverdue?'border-rose-400 hover:bg-rose-400/20':'border-white/20 hover:border-premium-gold'}`
                }, r.done && React.createElement(I.Check,{className:"w-3 h-3"})),

                // المحتوى
                React.createElement('div',{className:"flex-1 min-w-0"},
                    React.createElement('p',{className:`text-[11px] font-black leading-tight truncate ${r.done?'line-through text-slate-500':'text-white'}`}, r.title),
                    React.createElement('div',{className:"flex items-center gap-1.5 mt-0.5 flex-wrap"},
                        React.createElement('span',{className:`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${r.done?'bg-white/5 text-slate-500':isOverdue?'bg-rose-500/15 text-rose-400':isToday?'bg-amber-500/15 text-amber-400':'bg-blue-500/10 text-blue-400'}`},
                            r.done ? '✅ منجز' : isOverdue ? '⚠️ متأخر' : isToday ? '🔔 اليوم' : '📅 '+r.due_date
                        ),
                        // تاريخ الإنجاز
                        r.done && r.completed_at && React.createElement('span',{className:"text-[9px] text-emerald-600"},
                            'أُنجز ' + fmtCompletedAt(r.completed_at)
                        ),
                        // ملاحظة مختصرة
                        !r.done && r.notes && React.createElement('span',{className:"text-[9px] text-slate-500 truncate max-w-[140px]"},r.notes)
                    )
                ),

                // أزرار
                React.createElement('div',{className:"flex items-center gap-1 shrink-0"},
                    React.createElement('button',{
                        onClick:(e:any)=>{ e.stopPropagation(); setEditTarget(r); setEditForm({title:r.title,due_date:r.due_date,notes:r.notes||''}); },
                        className:"w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 hover:text-premium-gold hover:bg-white/10 active:scale-90"
                    }, React.createElement(I.Edit,{className:"w-3 h-3"})),
                    React.createElement('button',{
                        onClick:(e:any)=>{ e.stopPropagation(); setConfirmDeleteId(r.id); },
                        className:"w-6 h-6 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 active:scale-90"
                    }, React.createElement(I.Trash,{className:"w-3 h-3"}))
                )
            )
        );
    };

    const [filter, setFilter] = useState(initialFilter || 'upcoming');

    // ── بحث server-side ──
    const [searchOpen,  setSearchOpen]  = useState(false);
    const [searchTerm,  setSearchTerm]  = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    // نتائج البحث (تظهر بدل العرض العادي لما فيه search term)
    const [searchResults,      setSearchResults]      = useState<any[]>([]);
    const [searchLoading,      setSearchLoading]      = useState(false);

    const handleSearchOpen = () => {
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
    };
    const handleSearchClear = () => {
        setSearchTerm('');
        setSearchResults([]);
        setSearchOpen(false);
    };

    // ── بحث في الـ DB على كل التابات ──
    const searchReminders = useCallback(async (term: string) => {
        if (!term.trim()) { setSearchResults([]); return; }
        setSearchLoading(true);
        const s = term.trim();
        const { data } = await db.from('reminders')
            .select('*')
            .or(`title.ilike.%${s}%,notes.ilike.%${s}%`)
            .order('due_date', { ascending: false })
            .limit(50);
        setSearchResults(data || []);
        setSearchLoading(false);
    }, []);

    const handleSearchChange = (val: string) => {
        setSearchTerm(val);
        searchReminders(val);
    };

    const pillSections = [
        {
            key: 'upcoming',
            label: 'قادمة',
            emoji: '📅',
            data: upcoming,
            total: upcoming.length,
            paginated: false,
            activeBg: 'bg-blue-500/20 border-blue-500/40',
            activeText: 'text-blue-300',
            countBg: 'bg-blue-500/30 text-blue-200',
            emptyMsg: 'لا توجد مهام قادمة',
            emptyNote: 'المهام التي لم يحن موعدها بعد ستظهر هنا',
            emptyEmoji: '📅',
        },
        {
            key: 'overdue',
            label: 'متأخرة',
            emoji: '⚠️',
            data: overdueList,
            total: overdueTotal,
            hasMore: overdueMore,
            loadMore: () => fetchOverdue(overduePage + 1, true),
            paginated: true,
            activeBg: 'bg-rose-500/20 border-rose-500/40',
            activeText: 'text-rose-300',
            countBg: 'bg-rose-500/30 text-rose-200',
            emptyMsg: 'لا توجد مهام متأخرة',
            emptyNote: 'أنت في الموعد — استمر هكذا!',
            emptyEmoji: '🎯',
        },
        {
            key: 'done',
            label: 'منجزة',
            emoji: '✅',
            data: doneList,
            total: doneTotal,
            hasMore: doneMore,
            loadMore: () => fetchDone(donePage + 1, true),
            paginated: true,
            activeBg: 'bg-emerald-500/20 border-emerald-500/40',
            activeText: 'text-emerald-300',
            countBg: 'bg-emerald-500/30 text-emerald-200',
            emptyMsg: 'لا توجد مهام منجزة بعد',
            emptyNote: 'المهام التي أتممتها ستُحفظ هنا',
            emptyEmoji: '✅',
        },
    ];

    const activeSection = pillSections.find(s => s.key === filter)!;

    // في وضع البحث نعرض searchResults، غير كده نعرض activeSection.data
    const filteredData = searchTerm.trim() ? searchResults : activeSection.data;

    // ── مودال عرض المهمة ──
    const ViewModal = viewTarget && React.createElement('div',{
        className:"fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm",
        onClick: () => setViewTarget(null)
    },
        React.createElement('div',{
            className:"bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 p-6 pb-10 shadow-2xl slide-up",
            onClick: (e:any) => e.stopPropagation()
        },
            // handle bar
            React.createElement('div',{className:"w-10 h-1 bg-white/20 rounded-full mx-auto mb-5"}),

            // هيدر
            React.createElement('div',{className:"flex items-start justify-between gap-3 mb-4"},
                React.createElement('div',{className:"flex items-center gap-2"},
                    React.createElement('span',{className:"w-1 h-4 bg-premium-gold rounded-full shrink-0"}),
                    React.createElement('h3',{className:`text-sm font-black leading-snug ${viewTarget.done ? 'line-through text-slate-400' : 'text-white'}`},
                        viewTarget.title
                    )
                ),
                React.createElement('button',{
                    onClick:()=>setViewTarget(null),
                    className:"w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 shrink-0"
                },"✕")
            ),

            // بيانات
            React.createElement('div',{className:"space-y-3"},

                // تاريخ الاستحقاق
                React.createElement('div',{className:"flex items-center gap-2 text-[11px]"},
                    React.createElement('span',{className:"text-slate-500"},"📅 الموعد:"),
                    React.createElement('span',{className:"text-white font-bold"}, viewTarget.due_date || '—')
                ),

                // حالة + تاريخ الإنجاز
                viewTarget.done
                    ? React.createElement('div',{className:"flex items-center gap-2 text-[11px]"},
                        React.createElement('span',{className:"text-emerald-400 font-bold"},"✅ منجزة"),
                        viewTarget.completed_at && React.createElement('span',{className:"text-slate-400"},
                            '· أُنجزت ' + new Date(viewTarget.completed_at).toLocaleDateString('ar-EG',{day:'numeric',month:'long',year:'numeric'})
                        )
                    )
                    : (() => {
                        const todStr = new Date().toISOString().split('T')[0];
                        const isOvd  = viewTarget.due_date < todStr;
                        const isTdy  = viewTarget.due_date === todStr;
                        return React.createElement('div',{className:"flex items-center gap-1.5 text-[11px]"},
                            React.createElement('span',{className: isOvd?'text-rose-400 font-bold': isTdy?'text-amber-400 font-bold':'text-blue-400'},
                                isOvd ? '⚠️ متأخرة' : isTdy ? '🔔 اليوم' : '🕐 قادمة'
                            )
                        );
                    })(),

                // الملاحظات
                viewTarget.notes && React.createElement('div',{
                    className:"bg-white/4 border border-white/8 rounded-xl p-3 text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap",
                    dir:"rtl"
                }, viewTarget.notes)
            ),

            // أزرار التحكم
            React.createElement('div',{className:"flex gap-2 mt-5"},
                // تأشير منجز / إلغاء
                React.createElement('button',{
                    onClick: () => { handleToggleDone(viewTarget); setViewTarget(null); },
                    className:`flex-1 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform ${viewTarget.done ? 'bg-white/8 text-slate-300' : 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'}`
                },
                    viewTarget.done
                        ? React.createElement(React.Fragment, null, "↩️ إلغاء الإنجاز")
                        : React.createElement(React.Fragment, null, React.createElement(I.Check,{className:"w-3.5 h-3.5"}), "تسجيل كمنجز")
                ),
                // تعديل
                React.createElement('button',{
                    onClick: () => { setViewTarget(null); setEditTarget(viewTarget); setEditForm({title:viewTarget.title,due_date:viewTarget.due_date,notes:viewTarget.notes||''}); },
                    className:"flex-1 py-2.5 bg-white/5 text-slate-300 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 active:scale-95"
                }, React.createElement(I.Edit,{className:"w-3.5 h-3.5"}), "تعديل"),
                // حذف
                React.createElement('button',{
                    onClick: () => { setViewTarget(null); setConfirmDeleteId(viewTarget.id); },
                    className:"w-10 py-2.5 bg-rose-500/10 text-rose-400 rounded-xl flex items-center justify-center active:scale-95"
                }, React.createElement(I.Trash,{className:"w-3.5 h-3.5"}))
            )
        )
    );

    // مودال تأكيد الحذف (BUG-15 FIX)
    const ConfirmDeleteModal = confirmDeleteId && React.createElement('div',{
        className:"fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4",
        onClick:()=>setConfirmDeleteId(null)
    },
        React.createElement('div',{
            className:"bg-premium-card border border-rose-500/20 rounded-2xl p-5 max-w-xs w-full space-y-4",
            onClick:e=>e.stopPropagation()
        },
            React.createElement('div',{className:"flex items-center gap-3"},
                React.createElement('div',{className:"w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-xl shrink-0"},"🗑"),
                React.createElement('div',null,
                    React.createElement('p',{className:"text-sm font-black text-white"},"حذف التذكير"),
                    React.createElement('p',{className:"text-[10px] text-slate-400 mt-0.5"},"لن يمكن التراجع عن هذا الإجراء.")
                )
            ),
            React.createElement('div',{className:"flex gap-2"},
                React.createElement('button',{
                    onClick:()=>{ handleDelete(confirmDeleteId); setConfirmDeleteId(null); },
                    className:"flex-1 py-2.5 bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-black active:scale-95"
                },"نعم، احذف"),
                React.createElement('button',{
                    onClick:()=>setConfirmDeleteId(null),
                    className:"flex-1 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"
                },"إلغاء")
            )
        )
    );

    // مودال التعديل
    const EditModal = editTarget && React.createElement('div',{
        className:"fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm",
        onClick:e=>{ if(e.target===e.currentTarget) setEditTarget(null); }
    },
        React.createElement('div',{className:"bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 p-6 pb-10 shadow-2xl slide-up"},
            React.createElement('div',{className:"w-10 h-1 bg-white/20 rounded-full mx-auto mb-5"}),
            React.createElement('div',{className:"flex items-center justify-between mb-4"},
                React.createElement('h3',{className:"text-sm font-black text-white flex items-center gap-2"},
                    React.createElement('span',{className:"w-1 h-4 bg-premium-gold rounded-full"}),
                    "تعديل المهمة"
                ),
                React.createElement('button',{onClick:()=>setEditTarget(null),className:"w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400"},"✕")
            ),
            React.createElement('div',{className:"space-y-3"},
                React.createElement(Inp,{label:"عنوان المهمة",value:editForm.title,onChange:e=>setEditForm(p=>({...p,title:e.target.value})),placeholder:"عنوان المهمة",required:true}),
                React.createElement(DatePicker,{label:"تاريخ المهمة",value:editForm.due_date,onChange:v=>setEditForm(p=>({...p,due_date:v})),required:true}),
                React.createElement(Inp,{label:"ملاحظات",value:editForm.notes,onChange:e=>setEditForm(p=>({...p,notes:e.target.value})),placeholder:"تفاصيل إضافية..."}),
                React.createElement('button',{
                    onClick:handleEdit, disabled:editSaving,
                    className:"w-full py-3 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-transform"
                }, editSaving?React.createElement(I.Spin):React.createElement(I.Check), "حفظ التعديلات")
            )
        )
    );

    return React.createElement(React.Fragment,null,
    ViewModal,
    ConfirmDeleteModal,
    EditModal,
    React.createElement('div',{className:"space-y-4 fade-in"},

        // ── هيدر: أيقونة + عنوان على اليمين، بحث + إضافة على الشمال ──
        React.createElement('div',{className:"flex items-center justify-between gap-2 overflow-hidden"},
            React.createElement('div',{className:"flex items-center gap-1 min-w-0"},React.createElement('span',{className:"text-sm shrink-0"},"🔔"),React.createElement('h3',{className:"text-xs font-black text-white truncate"},"المهام والتذكيرات المخصصة")),
            React.createElement('div',{className:"flex items-center gap-2"},

                // زرار / حقل بحث
                searchOpen
                    ? React.createElement('div',{
                        className:"flex items-center gap-1.5 flex-1 bg-white/8 border border-white/12 rounded-xl px-2.5 py-1.5",
                        style:{minWidth:0}
                    },
                        React.createElement('svg',{className:"w-3.5 h-3.5 text-amber-400 shrink-0",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                            React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"})
                        ),
                        React.createElement('input',{
                            ref: searchInputRef,
                            type:"text",
                            value:searchTerm,
                            onChange:(e:any)=>{ handleSearchChange(e.target.value); },
                            placeholder:"ابحث في كل المهام...",
                            dir:"rtl",
                            className:"flex-1 bg-transparent text-[11px] text-white placeholder-slate-500 outline-none min-w-0"
                        }),
                        React.createElement('button',{
                            onClick:handleSearchClear,
                            className:"text-slate-500 hover:text-slate-300 shrink-0 active:scale-90 transition-transform"
                        },
                            React.createElement('svg',{className:"w-3.5 h-3.5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                                React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M6 18 18 6M6 6l12 12"})
                            )
                        )
                    )
                    : React.createElement('button',{
                        onClick:handleSearchOpen,
                        className:"flex items-center gap-1 bg-white/8 border border-white/10 text-slate-300 px-2.5 py-2 rounded-xl text-[11px] font-black active:scale-95 transition-transform hover:border-amber-500/30 hover:text-amber-300",
                        title:"بحث في المهام"
                    },
                        React.createElement('svg',{className:"w-3.5 h-3.5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                            React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"})
                        ),
                        React.createElement('span',null,"بحث")
                    ),

                // زرار إضافة تذكير (ذهبي)
                React.createElement('button',{
                    onClick:()=>setShowForm(!showForm),
                    className:"flex items-center bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg px-2.5 py-1.5 rounded-xl text-[11px] font-black shadow-lg gap-1 active:scale-95 transition-transform shrink-0"
                }, React.createElement(I.Plus), "إضافة")
            )
        ),

        // فورم
        showForm && React.createElement('div',{className:"bg-premium-card border border-purple-500/20 rounded-2xl p-4 space-y-3 slide-up"},
            React.createElement('h4',{className:"text-xs font-black text-purple-400"},"🔔 تذكير جديد"),
            React.createElement(Inp,{label:"عنوان التذكير",value:form.title,onChange:e=>setForm(p=>({...p,title:e.target.value})),placeholder:"مثال: تقديم مذكرة دفاع...",required:true}),
            React.createElement(DatePicker,{label:"تاريخ التذكير",value:form.due_date,onChange:v=>setForm(p=>({...p,due_date:v})),required:true}),
            React.createElement(Inp,{label:"ملاحظات",value:form.notes,onChange:e=>setForm(p=>({...p,notes:e.target.value})),placeholder:"تفاصيل إضافية..."}),
            React.createElement('div',{className:"flex gap-2"},
                React.createElement('button',{onClick:handleSave,disabled:saving,className:"flex-1 py-2.5 bg-gradient-to-tr from-purple-600 to-purple-400 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"},
                    saving?React.createElement(I.Spin):React.createElement(I.Check),"حفظ"),
                React.createElement('button',{onClick:()=>setShowForm(false),className:"px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"},"إلغاء")
            )
        ),

        // Pill Selector
        React.createElement('div',{className:"flex items-center bg-white/5 rounded-2xl p-1 gap-1"},
            pillSections.map(s => {
                const isActive = filter === s.key;
                return React.createElement('button',{
                    key: s.key,
                    onClick: ()=>{setFilter(s.key);},
                    className:`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl transition-all active:scale-95 ${
                        isActive ? s.activeBg+' shadow-sm' : 'text-slate-500 hover:text-slate-300'
                    }`
                },
                    React.createElement('span',{className:"text-sm leading-none"},s.emoji),
                    React.createElement('span',{className:`text-[11px] font-black ${isActive?s.activeText:'text-slate-400'}`},s.label),
                    React.createElement('span',{
                        className:`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isActive?s.countBg:'bg-white/8 text-slate-500'}`
                    }, s.paginated ? s.total : s.data.length)
                );
            })
        ),

        // ── شريط نتيجة البحث ──
        searchTerm.trim() && React.createElement('div',{
            className:"flex items-center gap-2 px-2.5 py-1.5 bg-amber-500/8 border border-amber-500/15 rounded-xl"
        },
            React.createElement('svg',{className:"w-3 h-3 text-amber-400 shrink-0",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"})
            ),
            React.createElement('span',{className:"text-[10px] text-amber-300 flex-1"},
                searchLoading ? 'جاري البحث...' : `نتائج "${searchTerm}" · ${filteredData.length} مهمة من كل التابات`
            )
        ),

        // المحتوى
        loading
            ? React.createElement('div',{className:"flex items-center justify-center py-10 gap-2 text-slate-500 text-xs"},React.createElement(I.Spin))
            : filteredData.length === 0
                ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl px-5 py-10 text-center space-y-2"},
                    React.createElement('p',{className:"text-3xl mb-1"},searchTerm.trim() ? '🔍' : activeSection.emptyEmoji),
                    React.createElement('p',{className:`text-xs font-black ${activeSection.activeText}`},
                        searchTerm.trim() ? `لا توجد نتائج لـ "${searchTerm}"` : activeSection.emptyMsg
                    ),
                    React.createElement('p',{className:"text-[10px] text-slate-600 leading-relaxed mt-1"},
                        searchTerm.trim() ? 'جرّب كلمات مختلفة أو تحقق من التاب الصحيح' : activeSection.emptyNote
                    )
                  )
                : React.createElement('div',{className:"space-y-3"},
                    // القادمة: slice محلي — المتأخرة والمنجزة: كل المحملين
                    (searchTerm.trim() ? filteredData : activeSection.data).map((r:any)=>React.createElement(ReminderCard,{key:r.id,r})),

                    // زرار تحميل المزيد للتابات الـ paginated
                    !searchTerm.trim() && activeSection.paginated && activeSection.hasMore &&
                        React.createElement('button',{
                            onClick: activeSection.loadMore,
                            disabled: loading,
                            className:"w-full py-3 rounded-2xl text-xs font-black active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40",
                            style:{background:'rgba(167,139,250,0.06)',border:'1px solid rgba(167,139,250,0.18)',color:'#a78bfa'}
                        },
                            loading
                                ? React.createElement(I.Spin)
                                : React.createElement('span',{className:"text-base"},"⬇️"),
                            "تحميل المزيد",
                            React.createElement('span',{
                                className:"text-[9px] px-2 py-0.5 rounded-full font-black",
                                style:{background:'rgba(167,139,250,0.12)',color:'#a78bfa'}
                            }, `${activeSection.total - activeSection.data.length} تذكير`)
                        )
                  )
    ));
}


export default RemindersTab;
