import React, { useState, useEffect, useRef } from 'react';
import { toast } from '../../shared/lib/notifications';
import { Inp } from '@/shared/ui/Inp';
import { CaseSearchSelect } from '@/shared/ui/CaseSearchSelect';
import { createPortal } from 'react-dom';
import { I, COUNTRY_CONFIGS, loadOfficeSetting } from '../../constants';
import { useFeesActions, resolveCaseFeeClient } from './hooks/useFeesActions';
import { useInvoicePrinting } from './hooks/useInvoicePrinting';
import DeleteConfirmModal from '@/shared/modals/DeleteConfirmModal';
import { useNestedModalBackButton } from '../../shared/lib/useNestedModalBackButton';
import SummaryModal from './SummaryModal';
import InvoiceModal from './InvoiceModal';
import FeeCard from './FeeCard';
import type { ClientRow, ProfileRow } from '../../types';
import type { MappedCase } from '../../hooks/useAppData';
import type { NavigationState } from '../../useNavigation';
import { useModalPresentation } from '@/shared/hooks/useModalPresentation';

// ⚠️ FIX (14 يوليو 2026): كان متوقع CaseRow[] (الشكل الخام من قاعدة البيانات)،
// لكن App.tsx بيبعت فعليًا `cases` المُطبَّعة (MappedCase[]) من useAppData —
// نفس الحقول المستخدمة هنا فعليًا (id/title) موجودة في MappedCase.
interface FeesTabProps {
    cases: MappedCase[];
    clients: ClientRow[];
    showSummaryModal: boolean;
    setShowSummaryModal: (v: boolean) => void;
    country?: string;
    profile?: ProfileRow | null;
    // ⚠️ FIX (19 يوليو 2026): زر الرجوع كان بيقفل تاب الأتعاب كله بدل ما
    // يقفل المودال المفتوح بس (راجع BUG-08 تحت). محتاجين nav عشان نسجّل
    // كل مودال في نظام التنقل المركزي، بالظبط زي باقي التابات.
    nav: NavigationState;
    // ⚡ NEW (8 أغسطس 2026 — البند 6 من تقرير حالة التنفيذ): دروب-داون
    // اختيار الموكل بقى بيبحث في الداتابيز مباشرة (ClientSearchSelect)
    // بدل ما يقتصر على أول صفحة محمّلة محليًا. لو الموكل المختار مش
    // موجود أصلًا في clientsWithExtras، بنستدعي ensureClientsLoaded
    // فورًا وقت الاختيار عشان .find(client_id) وقت الحفظ (جوه
    // useFeesActions.ts) يلاقيه أكيد ومايرجّعش اسم فاضي.
    ensureClientsLoaded?: (ids: (string | null | undefined)[]) => void;
    // 🔧 FIX (20 أغسطس 2026): نفس نمط externalRefreshSignal بتاع
    // SessionsCalendar.tsx — App.tsx بيزوّد الرقم ده كل ما زرار الريفرش
    // في الهيدر يتضغط، عشان تاب الأتعاب (بياناته منفصلة تمامًا عن
    // fetchCases) يعمل refetch فعلي بدل ما الزرار يبقى شكلي هنا.
    externalRefreshSignal?: number;
}

// شكل عناصر feesSections الثابتة (تابات محصّلة/غير محصّلة — بعد دمج
// "مؤجلة" و"مفتوحة" في 20 أغسطس 2026) — من useFeesActions
interface FeeSectionInfo {
    key: 'collected' | 'pending';
    label: string;
    emoji: string;
    desc: string;
    activeBg: string;
    activeText: string;
    countActiveBg: string;
}

function FeesTab({cases, clients, showSummaryModal, setShowSummaryModal, country, profile=null, nav, ensureClientsLoaded, externalRefreshSignal}: FeesTabProps){
    const {
      fees, payments, expandedPayments, setExpandedPayments,
      loading, showForm: showFormRaw, setShowForm: setShowFormRaw, form, setForm, saving, editId, setEditId,
      markNewFeeFormOpened, markNewFeeFormClosed,
      addPaymentFor, setAddPaymentFor, payingFeeId, payAmount, setPayAmount, payDate, setPayDate,
      payNote, setPayNote, confirmDeletePay: confirmDeletePayRaw, setConfirmDeletePay: setConfirmDeletePayRaw,
      confirmDeleteFee: confirmDeleteFeeRaw, setConfirmDeleteFee: setConfirmDeleteFeeRaw, invoiceModal: invoiceModalRaw, setInvoiceModal: setInvoiceModalRaw,
      payReceiver, setPayReceiver, payClientName, setPayClientName,
      payClientNameText, setPayClientNameText, feesSearch, setFeesSearch,
      feesFilter, setFeesFilter,
      fetchFees, handleSave, handleAddPayment, handleDeletePayment, handleDelete, handlePermanentDeleteFee,
      // 🔴 FIX (باج #1): feesPage/feesTotal/feesMore كانت متصدّرة من الـhook
      // من غير أي استهلاك في الواجهة — دلوقتي بتغذّي زر "تحميل المزيد".
      feesPage, feesTotal, feesMore,
      // ── قيم محسوبة من الـ hook (مركزية — لا تُعاد هنا) ──
      fmt, fmtDate,
      feesSections, feesAfterCategoryFilter, filteredFees,
      grandTotal, grandPaid, grandRemaining, loadingSummary,
      statusCounts,
    } = useFeesActions(cases, clients, country, profile, externalRefreshSignal);

    const [detailsForRaw, setDetailsForRaw] = useState<string | null>(null); // معرف بطاقة الأتعاب المفتوحة تفاصيلها
    const detailsFor = nav.isOpen('feeDetail') ? detailsForRaw : null;
    // 🆕 (دفعة 2.1 — تقرير تشخيص تجربة سطح المكتب): نفس نمط useModalPresentation
    // المُطبَّق في NewCaseModal.tsx، لمودال فورم الأتعاب الداخلي جوه هذا التاب.
    const modalPresentation = useModalPresentation();

    // ⚠️ BUG-08 FIX (19 يوليو 2026): كل مودالات الأتعاب (الفورم، تفاصيل
    // البطاقة، تأكيد الحذف، الفاتورة) كانت React state محلي بحت، مش مسجّلة
    // في useNavigation. زر الرجوع كان بيتعامل معاها كأنها مش موجودة أصلاً،
    // فبيقفز فوق تاب "الأتعاب" بالكامل ويرجّع الداشبورد. دلوقتي كل مودال
    // بيسجّل نفسه في nav.activeModal (بالظبط زي newCase/caseDetail/delete
    // في App.tsx)، فزر الرجوع بيقفل المودال المفتوح بس ويفضل واقف في تاب
    // الأتعاب — نفس سلوك باقي التابات.
    //
    // 🔒 FIX (26 يوليو 2026): nav.activeModal بيتتبع مودال واحد نشط بس.
    // فورم تعديل سجل أتعاب وتأكيد حذف دفعة/سجل بيتفتحوا **جوه** مودال
    // تفاصيل الأتعاب (feeDetail) المفتوح بالفعل — فنداء nav.openModal لأي
    // منهم كان بيحوّل activeModal ليهم، وبالتبعية nav.isOpen('feeDetail')
    // يرجع false ومودال التفاصيل يختفي كامل من تحت المستخدم (والمعلومات
    // اللي جواه زي fee-remaining-value تختفي معاه). زر "إضافة أتعاب" هو
    // الاستخدام الوحيد لفورم الأتعاب **بره** مودال التفاصيل (مفيش feeDetail
    // مفتوح وقته) — فده لسه بيسجّل نفسه في nav.activeModal زي ما هو. أما
    // التعديل/الحذف المتداخلين جوه feeDetail، بقوا حالة محلية بحتة +
    // useNestedModalBackButton (نفس الأداة المستخدمة فعلاً لنموذج طرف
    // الدعوى الفرعي جوه NewCaseModal) عشان زر الرجوع يقفلهم هم بس، من غير
    // ما يلمس nav.activeModal (اللي فاضل 'feeDetail' طول الوقت).
    const showForm = detailsFor ? showFormRaw : (nav.isOpen('feeForm') ? showFormRaw : false);
    const setShowForm = (v: boolean) => {
        setShowFormRaw(v);
        if (detailsFor) return; // نموذج فرعي جوه مودال تفاصيل مفتوح بالفعل — nav.activeModal يفضل 'feeDetail'
        if (v) nav.openModal('feeForm'); else nav.closeModal('feeForm');
    };
    const setDetailsFor = (v: string | null) => { setDetailsForRaw(v); if (v) nav.openModal('feeDetail'); else nav.closeModal('feeDetail'); };
    const confirmDeleteFee = confirmDeleteFeeRaw;
    const confirmDeletePay = confirmDeletePayRaw;
    const invoiceModal = nav.isOpen('feeInvoice') ? invoiceModalRaw : null;
    const setConfirmDeleteFee = (v: typeof confirmDeleteFeeRaw) => { setConfirmDeleteFeeRaw(v); };
    const setConfirmDeletePay = (v: typeof confirmDeletePayRaw) => { setConfirmDeletePayRaw(v); };
    const setInvoiceModal = (v: typeof invoiceModalRaw) => { setInvoiceModalRaw(v); if (v) nav.openModal('feeInvoice'); else nav.closeModal('feeInvoice'); };
    useNestedModalBackButton(!!showFormRaw && !!detailsFor, () => setShowFormRaw(false));
    useNestedModalBackButton(!!confirmDeleteFeeRaw, () => setConfirmDeleteFeeRaw(null));
    useNestedModalBackButton(!!confirmDeletePayRaw, () => setConfirmDeletePayRaw(null));

    const [invoiceLoadingFor, setInvoiceLoadingFor] = useState<string | null>(null); // معرف الدفعة اللي بيتصدر لها فاتورة دلوقتي
    // ── بيانات المكتب (الاسم/الشعار) لعرضها في معاينة الفاتورة على الشاشة ──
    const [officeBrand, setOfficeBrand] = useState({ name: '', logoUrl: '' });
    useEffect(() => {
        Promise.all([
            loadOfficeSetting('office_name'),
            loadOfficeSetting('office_logo'),
        ]).then(([officeName, officeLogo]: [string | null, string | null]) => {
            setOfficeBrand({ name: officeName || '', logoUrl: officeLogo || '' });
        });
    }, []);
    // ── حالة أيقونة البحث القابلة للفتح في الهيدر ──
    const [searchOpen, setSearchOpen] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    // ── FIX (تصحيح لملاحظة سابقة كانت غلط): البحث هنا كان بيبعت طلب لقاعدة
    // البيانات مع كل حرف بدون أي debounce فعلي — الـ setTimeout الوحيد
    // الموجود قبل كده كان بس لعمل focus على الخانة، مش لتأخير البحث.
    // دلوقتي فيه state محلي للعرض الفوري (searchInput) بينفصل عن feesSearch
    // (اللي فعليًا بيشغّل الاستعلام جوه useFeesActions)، وبنأخر تحديث
    // feesSearch بـ 300ms بعد آخر حرف.
    const [searchInput, setSearchInput] = useState(feesSearch);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
    }, []);
    const handleSearchInputChange = (val: string) => {
        setSearchInput(val);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => setFeesSearch(val), 300);
    };
    const handleSearchOpen = () => { setSearchOpen(true); setTimeout(()=>searchInputRef.current?.focus(), 50); };
    const handleSearchClose = () => {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        setSearchInput(''); setFeesSearch(''); setSearchOpen(false);
    };
    // ── عملة الدولة المختارة في الإعدادات (افتراضي جنيه مصري) ──
    const currency = COUNTRY_CONFIGS[country||'EG']?.currency || 'جنيه مصري';

    const { getOrCreateInvoice, printInvoice, printAllPayments } = useInvoicePrinting(cases, clients, profile, currency);

    // ── المتغيرات المحسوبة تأتي من useFeesActions مباشرة ──

    // 🔒 NEW (طلب المستخدم — 29 أغسطس 2026): محسوبة مرة واحدة هنا لاستخدامها
    // في عرض الموكل المقفول (فوق) وفي تعطيل زر "حفظ" (تحت) معًا — نفس
    // resolveCaseFeeClient المستخدمة في handleSave (useFeesActions.ts).
    const selectedCaseForForm = cases.find((c) => c.id === form.case_id);
    const resolvedFormClient = resolveCaseFeeClient(selectedCaseForForm, clients);

    return React.createElement('div',{className:"space-y-4 fade-in"},

        // ── هيدر القسم: العنوان + زر الملخص المالي + أيقونة البحث ──
        // 🔀 FIX (20 أغسطس 2026 — طلب المستخدم): زر "الملخص المالي" اتنقل من
        // الصف التاني (كان جمب زر الإضافة) لهنا، جمب زر البحث في الهيدر —
        // حجم مضغوط (أيقونة بس على الموبايل، أيقونة+نص من sm: لفوق) بدل
        // الزرار الطويل الأصلي. بيختفي وقت فتح صندوق البحث عشان يدّي مساحة
        // كاملة لخانة الكتابة (نفس فلسفة اختفاء زر "بحث" الأصلي وقتها) —
        // نفس السلوك على الموبايل والديسكتوب، مفيش فرق breakpoint هنا.
        React.createElement('div',{className:"flex items-center justify-between gap-2"},
            React.createElement('h3',{className:"text-sm font-black text-white shrink-0"},"💰 نظام الأتعاب"),
            searchOpen
                ? React.createElement('div',{
                    className:"flex items-center gap-1.5 flex-1 bg-white/8 border border-white/12 rounded-xl px-2.5 py-1.5",
                    style:{minWidth:0}
                },
                    React.createElement('svg',{className:"w-3.5 h-3.5 text-amber-400 shrink-0",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                        React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"})
                    ),
                    React.createElement('input',{
                        ref:searchInputRef,
                        type:"text",
                        value:searchInput,
                        onChange:(e: React.ChangeEvent<HTMLInputElement>) =>handleSearchInputChange(e.target.value),
                        maxLength:100,
                        placeholder:"اسم الموكل أو القضية...",
                        dir:"rtl",
                        className:"flex-1 bg-transparent text-[11px] text-white placeholder-slate-500 outline-none min-w-0"
                    }),
                    React.createElement('button',{
                        onClick:handleSearchClose,
                        className:"text-slate-500 hover:text-slate-300 shrink-0 active:scale-90 transition-transform"
                    },
                        React.createElement('svg',{className:"w-3.5 h-3.5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                            React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M6 18 18 6M6 6l12 12"})
                        )
                    )
                )
                : React.createElement('div',{className:"flex items-center gap-1.5 shrink-0"},
                    // ─ زر الملخص المالي (نقل هنا) ─
                    React.createElement('button',{
                        onClick:()=>setShowSummaryModal(true),
                        'data-testid':'fees-summary-open',
                        className:"flex items-center gap-1 bg-premium-gold/10 border border-premium-gold/25 text-premium-gold px-2.5 py-2 rounded-xl text-[11px] font-black active:scale-95 transition-transform hover:bg-premium-gold/15",
                        title:"الملخص المالي الإجمالي"
                    },
                        React.createElement('span',{className:"text-sm leading-none"},"📊"),
                        React.createElement('span',{className:"hidden sm:inline"},"الملخص المالي")
                    ),
                    // ─ زر البحث ─
                    React.createElement('button',{
                        onClick:handleSearchOpen,
                        className:"flex items-center gap-1 bg-white/8 border border-white/10 text-slate-300 px-2.5 py-2 rounded-xl text-[11px] font-black active:scale-95 transition-transform hover:border-amber-500/30 hover:text-amber-300",
                        title:"بحث في الأتعاب"
                    },
                        React.createElement('svg',{className:"w-3.5 h-3.5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                            React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"})
                        ),
                        React.createElement('span',{className:"hidden sm:inline"},"بحث")
                    )
                )
        ),

        // ── Modal الملخص المالي الإجمالي ──
        React.createElement(SummaryModal, { showSummaryModal, setShowSummaryModal, loadingSummary, fmt, grandTotal, grandPaid, grandRemaining, statusCounts }),

        // ── Pill Selector — أتعاب محصلة / غير محصلة (دمج مؤجلة+مفتوحة) ──
        React.createElement('div',{className:"flex items-center bg-white/5 rounded-2xl p-1 gap-1"},
            feesSections.map((s: FeeSectionInfo) => {
                const count = statusCounts[s.key] ?? 0;
                const isActive = feesFilter === s.key;
                return React.createElement('button',{
                    key: s.key,
                    onClick: () => setFeesFilter(s.key),
                    className: `flex-1 flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl transition-all active:scale-95 ${
                        isActive
                            ? s.activeBg + ' shadow-sm'
                            : 'text-slate-500 hover:text-slate-300'
                    }`
                },
                    React.createElement('span',{className:"text-sm leading-none"}, s.emoji),
                    React.createElement('span',{className:`text-[10px] font-black ${isActive ? s.activeText : 'text-slate-400'}`}, s.label),
                    React.createElement('span',{
                        className: `text-[9px] font-black px-1.5 py-0.5 rounded-full ${isActive ? s.countActiveBg : 'bg-white/8 text-slate-500'}`
                    }, count)
                );
            })
        ),

        // ─ زر الإضافة (بعد ما زر الملخص المالي اتنقل للهيدر فوق، بقى الزرار
        // الوحيد في الصف ده — عرض كامل ثابت على الموبايل والديسكتوب) ─
        React.createElement('button',{
            onClick:()=>{
                // 🆕 (٣-د): بيتولّد مفتاح idempotency جديد بس وقت الفتح
                // الفعلي (مش وقت القفل لو الزرار ده بقى بيقفل فورم مفتوح).
                const opening = !showForm;
                setShowForm(opening);setEditId(null);setForm({case_id:'',client_id:'',receiver:'',total:'',paid:'',payment_date:'',notes:''});
                if (opening) markNewFeeFormOpened(); else markNewFeeFormClosed();
            },
            'data-testid':'add-fee-button',
            className:"w-full py-3 border border-dashed border-premium-gold/30 rounded-2xl flex items-center justify-center gap-2 text-premium-gold text-xs font-black hover:bg-premium-gold/5 transition-all active:scale-[0.98]"
        }, React.createElement(I.Plus), "إضافة أتعاب قضية"),

        // ─ فورم الإضافة/التعديل (modal) ─
        showForm && createPortal(
            React.createElement('div',{
                className:`fixed inset-0 z-[70] flex ${modalPresentation.overlayAlignClassName} justify-center bg-black/80 backdrop-blur-sm`,
                onClick:(e: React.MouseEvent) => { if(e.target===e.currentTarget) { setShowForm(false); setEditId(null); markNewFeeFormClosed(); } }
            },
            React.createElement('div',{
                className:`bg-premium-card w-full max-w-lg ${modalPresentation.isDesktop ? 'border border-premium-gold/20 rounded-3xl' : 'border-t border-premium-gold/20 rounded-t-3xl'} overflow-y-auto no-scrollbar p-5 space-y-3 shadow-2xl max-h-[90vh] ${modalPresentation.panelAnimationClassName}`,
                onClick:(e: React.MouseEvent) =>e.stopPropagation()
            },
                    React.createElement('div',{className:"flex items-center justify-between mb-1"},
                        React.createElement('h4',{className:"text-xs font-black text-premium-gold"},editId ? "✏️ تعديل الأتعاب" : "📋 إضافة أتعاب"),
                        // 🆕 (المرحلة 8 — E2E): data-testid مُضاف عشان تستات إغلاق/إلغاء
                        // فورم الأتعاب (زي سيناريو "فك ربط موكل بعد إنشاء سجل") تقدر تقفل
                        // الفورم بدقة، بدل الاعتماد على نص "✕" اللي ممكن يتكرر في عناصر
                        // تانية (مودال تفاصيل الأتعاب تحته، مودال الفاتورة، ...إلخ) ويسبب
                        // strict-mode violation في Playwright. صفر تغيير في السلوك/الشكل.
                        React.createElement('button',{onClick:()=>{setShowForm(false);setEditId(null);markNewFeeFormClosed();},'data-testid':'close-fee-form',className:"w-7 h-7 rounded-lg bg-white/5 text-slate-400 text-xs active:scale-90"},"✕")
                    ),
                    // 🔒 CHANGED (طلب المستخدم — 29 أغسطس 2026): دروب-داون قضية عادي
                    // بقى CaseSearchSelect (بحث حي في الداتابيز، بنفس نمط
                    // ClientSearchSelect) بدل <select> محدود بالقضايا المحمّلة محليًا.
                    React.createElement(CaseSearchSelect,{
                        label:"القضية",
                        required:true,
                        testId:'fee-case-select',
                        selectedLabel: cases.find((c) => c.id === form.case_id)?.title || '',
                        onSelect:(c) => {
                            ensureClientsLoaded?.(c.client_id ? [c.client_id] : []);
                            setForm((p) =>({...p, case_id:c.id, client_id: c.client_id || ''}));
                        },
                        placeholder:'ابحث بعنوان القضية أو رقمها...',
                    }),
                    // 🔒 CHANGED (طلب المستخدم — 29 أغسطس 2026): اسم الموكل بقى عرض
                    // مقفول تمامًا، مُشتق تلقائيًا من القضية المختارة فوق عبر
                    // resolveCaseFeeClient — نفس نمط pay-client-locked في FeeCard.tsx
                    // بالحرف. مفيش اختيار يدوي ولا نص حر بعد دلوقتي.
                    React.createElement('div',{className:"space-y-1"},
                        React.createElement('label',{className:"text-[10px] text-slate-400 font-bold"},"اسم الموكل",React.createElement('span',{className:"text-rose-400 mr-1"},"*")),
                        React.createElement('div',{
                            'data-testid':'fee-client-locked',
                            className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-black/30 text-white min-h-[2.25rem] flex items-center"
                        },
                            resolvedFormClient.displayLabel || React.createElement('span', { className: "text-slate-500" },
                                '⚠️ لا يوجد موكل مرتبط بهذه القضية — يرجى تحديد الموكل من بيانات القضية أولاً'
                            )
                        )
                    ),
                    // 🆕 (إصلاح CI بعد تشغيل فعلي — 29 أغسطس 2026): "المستلم من
                    // المكتب" و"تاريخ الدفعة" حقلين إجباريين فعليًا في handleSave
                    // من زمان (راجع التعليق فوق useFeesActions.ts:~389) لكن مكانش
                    // عندهم data-testid خالص — كان مستحيل تقنيًا لأي تست e2e إنه
                    // يستهدفهم. اتضافلهم 'fee-receiver' و'fee-payment-date' بس،
                    // صفر تغيير في الشكل/السلوك.
                    React.createElement(Inp,{label:"المستلم من المكتب",required:true,value:form.receiver,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setForm((p) =>({...p,receiver:e.target.value})),placeholder:"اسم المحامي أو الموظف المستلم",'data-testid':'fee-receiver'}),
                    React.createElement(Inp,{label:"إجمالي الأتعاب",required:true,type:"number",value:form.total,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setForm((p) =>({...p,total:e.target.value})),placeholder:"0",'data-testid':'fee-total'}),
                    // 🔴 FIX (29 أغسطس 2026 — باج #2): حقل "المبلغ المدفوع" في فورم
                    // التعديل كان بيقبل كتابة لكن handleSave (مسار editId) كان
                    // بيتجاهله تمامًا بصمت — يبان "✅ تم تحديث الأتعاب" بينما
                    // التعديل الفعلي مش بيحصل (فشل صامت + تأكيد كاذب). القيمة
                    // الحقيقية للمدفوع بتتغيّر فقط عبر مسار "تسجيل دفعة" المخصص
                    // (RPC معاملات حقيقية + سجل fee_payments)، مش من هنا. الحقل
                    // دلوقتي للعرض بس في وضع التعديل (disabled)، وبيفضل قابل
                    // للكتابة زي ما هو في وضع الإضافة (فيه بيتحول فعليًا لدفعة
                    // مقدّمة أولى عبر create_fee_with_advance).
                    React.createElement(Inp,{
                        label: editId ? "المبلغ المدفوع (للتعديل، استخدم زر «تسجيل دفعة»)" : "المبلغ المدفوع",
                        required: !editId,
                        type:"number",value:form.paid,
                        disabled: !!editId,
                        onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setForm((p) =>({...p,paid:e.target.value})),
                        placeholder:"0",'data-testid':'fee-paid',
                        className: editId ? "w-full p-3 text-xs rounded-xl border border-white/10 bg-white/5 text-slate-500 cursor-not-allowed" : undefined
                    }),
                    React.createElement('div',{className:"space-y-1"},
                        React.createElement('label',{className:"text-[10px] text-slate-400 font-bold"},"تاريخ الدفعة", !editId && React.createElement('span',{className:"text-rose-400 mr-1"},"*")),
                        React.createElement('input',{
                            type:"date",value:form.payment_date,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setForm((p) =>({...p,payment_date:e.target.value})),
                            className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-black/30 text-white",
                            style:{fontFamily:'Cairo,sans-serif',colorScheme:'dark'},
                            'data-testid':'fee-payment-date'
                        })
                    ),
                    React.createElement(Inp,{label:"ملاحظات",value:form.notes,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setForm((p) =>({...p,notes:e.target.value})),placeholder:"أي ملاحظات..."}),
                    React.createElement('div',{className:"flex gap-2"},
                        React.createElement('button',{onClick:handleSave,disabled:saving || !resolvedFormClient.displayLabel,'data-testid':'save-fee-button',className:"flex-1 py-2.5 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"},
                            saving?React.createElement(I.Spin):React.createElement(I.Check),"حفظ"),
                        React.createElement('button',{onClick:()=>{setShowForm(false);setEditId(null);markNewFeeFormClosed();},className:"px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"},"إلغاء")
                    )
                )
            )
            ,
            document.body
        ),

        // ─ قائمة الأتعاب ─
        loading ? React.createElement('div',{className:"flex items-center justify-center py-10 gap-2 text-slate-500 text-xs"},React.createElement(I.Spin),"جاري التحميل...")
        : feesAfterCategoryFilter.length===0
            ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-10 text-center space-y-2"},
                React.createElement('div',{className:"text-3xl"},
                    feesFilter==='collected' ? '✅' : '⏳'
                ),
                React.createElement('p',{className:"text-white/60 font-black text-sm"},
                    feesFilter==='collected' ? 'لا توجد أتعاب محصّلة بعد' : 'لا توجد أتعاب غير محصّلة'
                ),
                React.createElement('p',{className:"text-slate-500 text-xs"},
                    feesFilter==='collected' ? 'الأتعاب المدفوعة بالكامل ستظهر هنا'
                    : 'الأتعاب المتفق عليها وغير المسددة بالكامل، وكمان القضايا اللي لسه من غير مبلغ متفق عليه، هتظهر هنا'
                )
              )
            : filteredFees.length===0
            ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-8 text-center space-y-2"},
                React.createElement('div',{className:"text-2xl"},"🔍"),
                React.createElement('p',{className:"text-white/60 font-black text-sm"},"لا توجد نتائج"),
                React.createElement('p',{className:"text-slate-500 text-xs"},'جرب كلمة بحث مختلفة')
              )
            // 🆕 Phase 3 (تقرير تشخيص تجربة سطح المكتب — 15 أغسطس): على
            // الديسكتوب (lg:) الكروت المضغوطة (FeeCard) بتتوزع في شبكة
            // عمودين (٣ أعمدة على شاشات أعرض xl:) بدل عمود واحد ممتد
            // بعرض الشاشة كله. الكارت نفسه (بلا width ثابت، بيفتح تفاصيله
            // في مودال مركزي أصلًا من دفعة 2.1) صالح للشبكة من غير أي
            // تعديل داخلي. `lg:space-y-0` عشان `space-y-3` (margin-top
            // بين العناصر) ميتعارضش مع `lg:gap-3` جوه الشبكة.
            : React.createElement(React.Fragment, null,
              React.createElement('div',{className:"space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start xl:grid-cols-3"},
                filteredFees.map((fee) => React.createElement(FeeCard, {
                    key: fee.id, fee, cases, clients, currency, fmt, fmtDate, ensureClientsLoaded,
                    detailsFor, setDetailsFor,
                    expandedPayments, setExpandedPayments,
                    invoiceLoadingFor, setInvoiceLoadingFor, getOrCreateInvoice, setInvoiceModal, toast,
                    printAllPayments, setConfirmDeletePay,
                    addPaymentFor, setAddPaymentFor, payingFeeId,
                    payClientName, setPayClientName, payClientNameText, setPayClientNameText,
                    payAmount, setPayAmount, payDate, setPayDate, payReceiver, setPayReceiver, payNote, setPayNote,
                    handleAddPayment, setEditId, setForm, setShowForm, setConfirmDeleteFee,
                    payments,
                }))
              ),
              // 🔴 FIX (29 أغسطس 2026 — باج #1): زر "تحميل المزيد" كان مفقود
              // تمامًا رغم إن الـbackend (useFeesActions) مبني بالكامل على
              // pagination (PAGE_SIZE=15) — أي تاب فيه أكتر من 15 سجل كان
              // بيخفي الباقي بصمت من غير أي مؤشر. نفس نمط CasesTab.tsx
              // (feesTotal بيشمل فلتر الحالة والبحث الحاليين أصلاً، فمفيش
              // داعي شرط إضافي عليهم).
              feesMore && React.createElement('button', {
                  onClick: () => fetchFees(feesPage + 1, feesFilter, feesSearch, true),
                  disabled: loading,
                  'data-testid': 'fees-load-more',
                  className: "w-full py-3 rounded-2xl text-xs font-black active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40",
                  style: { background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.18)', color: '#D4AF37' }
              },
                  loading
                      ? React.createElement(I.Spin)
                      : React.createElement('span', { className: "text-base" }, "⬇️"),
                  "تحميل المزيد",
                  React.createElement('span', {
                      className: "text-[9px] px-2 py-0.5 rounded-full font-black",
                      style: { background: 'rgba(212,175,55,0.12)', color: '#D4AF37' }
                  }, `${feesTotal - fees.length} سجل`)
              )
              ),

        // ─ مودال تأكيد حذف الأتعاب الرئيسية ─
        confirmDeleteFee && createPortal(React.createElement(DeleteConfirmModal,{
            title:"حذف الأتعاب",
            itemName: cases.find((c) =>c.id===confirmDeleteFee.case_id)?.title || fees.find((f) =>f.id===confirmDeleteFee.id)?.case_title || 'غير معروفة',
            itemType:"الأتعاب",
            loading:false,
            choiceTestId:"archive-confirm-choice",
            inputTestId:"fee-delete-confirm-input",
            confirmTestId:"fee-delete-confirm-button",
            deleteConsequences: [
                'سيُحذف نهائيًا سجل الأتعاب وكل الدفعات المسجلة عليه.',
                'الفاتورة الصادرة (لو موجودة) تفضل محفوظة بسجلها المالي كامل — بس رابطها بالأتعاب بيتصفّر.',
                'لا يمكن التراجع عن هذا الإجراء.',
            ],
            onConfirmArchive:()=>{ handleDelete(confirmDeleteFee.id); setConfirmDeleteFee(null); },
            onConfirmDelete:()=>{ handlePermanentDeleteFee(confirmDeleteFee.id); setConfirmDeleteFee(null); },
            onCancel:()=>setConfirmDeleteFee(null)
        }), document.body),

        // ─ مودال تأكيد حذف الدفعة ─
        confirmDeletePay && createPortal(React.createElement(DeleteConfirmModal,{
            title:"حذف الدفعة",
            itemName: fmt(confirmDeletePay.amount) + ' - ' + fmtDate(confirmDeletePay.payDate),
            itemType:"الدفعة",
            mode:"delete",
            loading:false,
            inputTestId:"confirm-delete-payment-input",
            confirmTestId:"confirm-delete-payment-yes",
            cancelTestId:"confirm-delete-payment-cancel",
            onConfirm:()=>{ handleDeletePayment(confirmDeletePay.payId, confirmDeletePay.fee); setConfirmDeletePay(null); },
            onCancel:()=>setConfirmDeletePay(null)
        }), document.body),

        // ─ مودال معاينة الفاتورة (bottom sheet مضغوط) ─
        React.createElement(InvoiceModal, { invoiceModal, setInvoiceModal, setDetailsFor, officeBrand, currency, printInvoice })
    );
}

export default FeesTab;
