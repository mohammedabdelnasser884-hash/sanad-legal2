import React, { useState, useEffect, useCallback } from 'react';
import { toast, escapeHtml, safeUpdate, logActivity } from '../../utils';
import { COUNTRY_CONFIGS } from '../../constants';
import { db } from '../../supabaseClient';

const PAGE_SIZE = 15;

export function useFeesActions(cases: any[], clients: any[], country?: string, profile?: any) {
    const [fees, setFees] = useState([]);
    const [payments, setPayments] = useState({}); // keyed by fee_id
    const [expandedPayments, setExpandedPayments] = useState({});
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({case_id:'', client_name_manual:'', client_name_text:'', receiver:'', total:'', paid:'', payment_date:'', notes:''});
    const [saving, setSaving] = useState(false);
    const [editId, setEditId] = useState(null);
    const [addPaymentFor, setAddPaymentFor] = useState(null);
    const [payAmount, setPayAmount] = useState('');
    const [payDate, setPayDate] = useState('');
    const [payNote, setPayNote] = useState('');
    const [confirmDeletePay, setConfirmDeletePay] = useState(null);
    const [confirmDeleteFee, setConfirmDeleteFee] = useState(null);
    const [invoiceModal, setInvoiceModal] = useState(null);
    const [payReceiver, setPayReceiver] = useState('');
    const [payClientName, setPayClientName] = useState('');
    const [payClientNameText, setPayClientNameText] = useState('');
    const [feesSearch, setFeesSearch] = useState('');
    const [feesFilter, setFeesFilter] = useState<'collected'|'deferred'|'open'>('deferred');

    // ── pagination state ──
    const [feesPage, setFeesPage]   = useState(0);
    const [feesTotal, setFeesTotal] = useState(0);
    const [feesMore, setFeesMore]   = useState(false);

    // ── عملة الدولة المختارة ──
    const currency = COUNTRY_CONFIGS[country||'EG']?.currency || 'جنيه مصري';

    // ── جلب الأتعاب من DB (paginated + server-side search + status filter) ──
    const fetchFees = useCallback(async (page = 0, status = feesFilter, search = feesSearch, append = false) => {
        if (!profile) return;
        setLoading(true);
        const from = page * PAGE_SIZE;
        const to   = from + PAGE_SIZE - 1;

        let q = db.from('case_fees')
            .select('*', { count: 'exact' })
            .eq('status', status)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (search.trim()) {
            const s = search.trim();
            q = q.or(`client_name.ilike.%${s}%,notes.ilike.%${s}%`);
        }

        const { data, error, count } = await q;
        if (error) { setLoading(false); return; }

        const list = data || [];

        // جلب الدفعات للصفحة الحالية بس
        const feeIds = list.map((f: any) => f.id);
        let grouped = {};
        if (feeIds.length > 0) {
            const { data: pays } = await db.from('fee_payments')
                .select('*')
                .in('fee_id', feeIds)
                .order('payment_date', { ascending: false });
            (pays || []).forEach((p: any) => {
                if (!grouped[p.fee_id]) grouped[p.fee_id] = [];
                grouped[p.fee_id].push(p);
            });
        }

        if (append) {
            setFees((prev: any) => [...prev, ...list]);
            setPayments((prev: any) => ({ ...prev, ...grouped }));
        } else {
            setFees(list);
            setPayments(grouped);
        }

        setFeesTotal(count || 0);
        setFeesPage(page);
        setFeesMore((page + 1) * PAGE_SIZE < (count || 0));
        setLoading(false);
    }, [profile, feesFilter, feesSearch]);

    useEffect(() => { fetchFees(0, feesFilter, feesSearch, false); }, [fetchFees]);

    // ── عند تغيير التاب أو البحث ──
    const handleFilterChange = (newFilter: 'collected'|'deferred'|'open') => {
        setFeesFilter(newFilter);
        setFeesSearch('');
        fetchFees(0, newFilter, '', false);
    };

    const handleSearch = (term: string) => {
        setFeesSearch(term);
        fetchFees(0, feesFilter, term, false);
    };

    const handleSave = async () => {
        if(!form.case_id||!form.total){ toast('يرجى اختيار القضية وإدخال إجمالي الأتعاب',true); return; }
        setSaving(true);
        const clientName = form.client_name_manual === '__manual__'
            ? (form.client_name_text||null)
            : (form.client_name_manual||null);
        const payload = {
            case_id: form.case_id,
            client_name: clientName,
            receiver: form.receiver||null,
            total_fees: parseFloat(form.total)||0,
            notes: form.notes||null,
        };
        if(editId){
            const editFee = fees.find((f:any) => f.id === editId);
            const { conflict } = await safeUpdate(db, 'case_fees', editId, payload, editFee?.updated_at || null);
            if (conflict) { setSaving(false); return; }
            toast('✅ تم تحديث الأتعاب');
            logActivity(db, 'تعديل أتعاب', {
                entity_type: 'fee', entity_id: editId, details: clientName || form.case_id,
                client_name: clientName || null,
                case_name: cases.find((c: any) => c.id === form.case_id)?.title || null,
                case_type: cases.find((c: any) => c.id === form.case_id)?.type || null,
            });
        } else {
            const {data:inserted, error} = await db.from('case_fees')
                .insert([{...payload, paid_fees:0}]).select().single();
            if(error){ toast('❌ فشل حفظ الأتعاب الجديدة — تحقق من الاتصال وأعد المحاولة', true); setSaving(false); return; }
            if(inserted && parseFloat(form.paid)>0){
                await db.from('fee_payments').insert([{
                    fee_id: inserted.id,
                    amount: parseFloat(form.paid),
                    payment_date: form.payment_date||new Date().toISOString().slice(0,10),
                    notes: 'مقدم أتعاب',
                    received_by: form.receiver||null,
                    client_name: clientName
                }]);
                const {data:allPays} = await db.from('fee_payments').select('amount').eq('fee_id',inserted.id);
                const realPaid = (allPays||[]).reduce((s,p)=>s+(p.amount||0), 0);
                await db.from('case_fees').update({
                    paid_fees: realPaid,
                    last_payment_date: form.payment_date||new Date().toISOString().slice(0,10)
                }).eq('id',inserted.id);
            }
            toast('✅ تم إضافة الأتعاب');
            logActivity(db, 'إضافة أتعاب', {
                entity_type: 'fee', entity_id: inserted?.id, details: clientName || form.case_id,
                client_name: clientName || null,
                case_name: cases.find((c: any) => c.id === form.case_id)?.title || null,
                case_type: cases.find((c: any) => c.id === form.case_id)?.type || null,
            });
        }
        setSaving(false);
        setShowForm(false); setForm({case_id:'',client_name_manual:'',client_name_text:'',receiver:'',total:'',paid:'',payment_date:'',notes:''}); setEditId(null);
        fetchFees(0, feesFilter, feesSearch, false);
    };

    const handleAddPayment = async (fee) => {
        const amount = parseFloat(payAmount)||0;
        if(amount<=0){ toast('أدخل مبلغاً صحيحاً',true); return; }
        const remaining = (fee.total_fees || 0) - (fee.paid_fees || 0);
        if (fee.total_fees > 0 && amount > remaining) {
            toast(`⚠️ المبلغ (${amount.toLocaleString('ar-EG')}) يتجاوز المتبقي (${remaining.toLocaleString('ar-EG')} ${currency}). تأكد من الصحة.`, true);
        }
        const resolvedClient = payClientName==='__manual__' ? (payClientNameText||null) : (payClientName||fee.client_name||null);
        const { error: insertError } = await db.from('fee_payments').insert([{
            fee_id: fee.id,
            amount: amount,
            payment_date: payDate||new Date().toISOString().slice(0,10),
            notes: payNote||null,
            received_by: payReceiver||null,
            client_name: resolvedClient
        }]);
        if(insertError){ toast('❌ فشل تسجيل الدفعة، يرجى المحاولة مرة أخرى', true); return; }
        const {data:allPays} = await db.from('fee_payments').select('amount').eq('fee_id',fee.id);
        const realPaid = (allPays||[]).reduce((s,p)=>s+(p.amount||0), 0);
        const upd: Record<string, any> = {paid_fees: realPaid};
        if(resolvedClient) upd.client_name = resolvedClient;
        if(payDate) upd.last_payment_date = payDate;
        const { error: updateError } = await db.from('case_fees').update(upd).eq('id',fee.id);
        if(updateError){ toast('⚠️ تم تسجيل الدفعة لكن فشل تحديث إجمالي المدفوع، يرجى تحديث الصفحة', true); fetchFees(0, feesFilter, feesSearch, false); return; }
        toast('✅ تم تسجيل الدفعة');
        logActivity(db, 'تسجيل دفعة', {
            entity_type: 'fee', entity_id: fee.id,
            details: `${amount.toLocaleString('ar-EG')} ${currency} — ${resolvedClient || fee.client_name || ''}`,
            client_name: resolvedClient || fee.client_name || null,
            case_name: cases.find((c: any) => c.id === fee.case_id)?.title || null,
            case_type: cases.find((c: any) => c.id === fee.case_id)?.type || null,
        });
        setAddPaymentFor(null); setPayAmount(''); setPayDate(''); setPayNote(''); setPayReceiver(''); setPayClientName(''); setPayClientNameText('');
        fetchFees(0, feesFilter, feesSearch, false);
    };

    const handleDeletePayment = async (payId, fee) => {
        const { error: deleteError } = await db.from('fee_payments').delete().eq('id',payId);
        if(deleteError){ toast('❌ فشل حذف الدفعة، يرجى المحاولة مرة أخرى', true); return; }
        const {data:allPays} = await db.from('fee_payments').select('amount').eq('fee_id',fee.id);
        const realPaid = (allPays||[]).reduce((s,p)=>s+(p.amount||0), 0);
        const { error: updateError } = await db.from('case_fees').update({paid_fees: realPaid}).eq('id',fee.id);
        if(updateError){ toast('⚠️ تم حذف الدفعة لكن فشل تحديث إجمالي المدفوع، يرجى تحديث الصفحة', true); fetchFees(0, feesFilter, feesSearch, false); return; }
        toast('🗑 تم حذف الدفعة');
        logActivity(db, 'حذف دفعة', {
            entity_type: 'fee', entity_id: fee.id, details: fee.client_name || null,
            client_name: fee.client_name || null,
            case_name: cases.find((c: any) => c.id === fee.case_id)?.title || null,
            case_type: cases.find((c: any) => c.id === fee.case_id)?.type || null,
        });
        fetchFees(0, feesFilter, feesSearch, false);
    };

    const handleDelete = async (id) => {
        const targetFee = fees.find((f: any) => f.id === id);
        const { error: paymentsError } = await db.from('fee_payments').delete().eq('fee_id',id);
        if(paymentsError){ toast('❌ فشل حذف الأتعاب — تحقق من الاتصال وأعد المحاولة', true); return; }
        const { error: feeError } = await db.from('case_fees').delete().eq('id',id);
        if(feeError){ toast('❌ فشل حذف الأتعاب — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('🗑 تم الحذف');
        logActivity(db, 'حذف أتعاب', {
            entity_type: 'fee', entity_id: id,
            client_name: targetFee?.client_name || null,
            case_name: cases.find((c: any) => c.id === targetFee?.case_id)?.title || null,
            case_type: cases.find((c: any) => c.id === targetFee?.case_id)?.type || null,
        });
        fetchFees(0, feesFilter, feesSearch, false);
    };

    const fmt = n => n?.toLocaleString('ar-SA',{maximumFractionDigits:0})||'0';
    const fmtDate = d => d ? new Date(d).toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}) : '';

    // getFeeCategory تفيد في عرض الكارد بس (مش للتصنيف في DB)
    const getFeeCategory = (fee) => {
        const total = fee.total_fees || 0;
        const paid  = fee.paid_fees  || 0;
        if (total <= 0) return 'open';
        if (paid >= total) return 'collected';
        return 'deferred';
    };

    const feesSections = [
        {
            key: 'deferred' as const,
            label: 'مؤجلة',
            emoji: '⏳',
            desc: 'فلوس في الطريق',
            activeBg: 'bg-amber-500/20 border-amber-500/40',
            activeText: 'text-amber-300',
            countActiveBg: 'bg-amber-500/30 text-amber-200',
        },
        {
            key: 'open' as const,
            label: 'مفتوحة',
            emoji: '⚠️',
            desc: 'محتاجة تتحدد',
            activeBg: 'bg-rose-500/20 border-rose-500/40',
            activeText: 'text-rose-300',
            countActiveBg: 'bg-rose-500/30 text-rose-200',
        },
        {
            key: 'collected' as const,
            label: 'محصّلة',
            emoji: '✅',
            desc: 'أرباحك الفعلية',
            activeBg: 'bg-emerald-500/20 border-emerald-500/40',
            activeText: 'text-emerald-300',
            countActiveBg: 'bg-emerald-500/30 text-emerald-200',
        },
    ];

    // إجماليات الصفحة الحالية فقط
    const totalAll  = fees.reduce((s,f:any)=>s+(f.total_fees||0),0);
    const paidAll   = fees.reduce((s,f:any)=>s+(f.paid_fees||0),0);
    const remaining = totalAll - paidAll;

    // للتوافق مع FeesTab.tsx — filteredFees = fees (البحث صار server-side)
    const filteredFees = fees;
    const feesAfterCategoryFilter = fees;
    const feesByCategory = { collected: [], deferred: [], open: [] }; // deprecated

    const grandTotal     = totalAll;
    const grandPaid      = paidAll;
    const grandRemaining = remaining;

  return {
    fees, setFees, payments, setPayments, expandedPayments, setExpandedPayments,
    loading, showForm, setShowForm, form, setForm, saving, editId, setEditId,
    addPaymentFor, setAddPaymentFor, payAmount, setPayAmount, payDate, setPayDate,
    payNote, setPayNote, confirmDeletePay, setConfirmDeletePay,
    confirmDeleteFee, setConfirmDeleteFee, invoiceModal, setInvoiceModal,
    payReceiver, setPayReceiver, payClientName, setPayClientName,
    payClientNameText, setPayClientNameText, feesSearch, setFeesSearch,
    feesFilter, setFeesFilter,

    // pagination
    feesPage, feesTotal, feesMore,
    fetchFees, handleFilterChange, handleSearch,

    handleSave, handleAddPayment, handleDeletePayment, handleDelete,

    getFeeCategory,
    feesSections,
    feesByCategory,
    feesAfterCategoryFilter,
    filteredFees,

    totalAll, paidAll, remaining,
    grandTotal, grandPaid, grandRemaining,
    fmt, fmtDate,
  };
}
