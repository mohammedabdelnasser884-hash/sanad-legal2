import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '../../../shared/lib/notifications';
import { I, COUNTRY_CONFIGS, loadOfficeSetting } from '../../../constants';
import { Inp } from '@/shared/ui/Inp';
import DeleteConfirmModal from '@/shared/modals/DeleteConfirmModal';
import { useModalPresentation } from '@/shared/hooks/useModalPresentation';
import { useFeesActions, resolveCaseFeeClient } from '../../fees/hooks/useFeesActions';
import { useInvoicePrinting } from '../../fees/hooks/useInvoicePrinting';
import FeeCard from '../../fees/FeeCard';
import InvoiceModal from '../../fees/InvoiceModal';
import type { ClientRow, ProfileRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';

// ─────────────────────────────────────────────────────────
// تاب "الأتعاب" جوه تفاصيل القضية (طلب المستخدم — 29 أغسطس 2026).
//
// ⚡ نفس مصدر البيانات بالحرف: بيستخدم useFeesActions (نفس الـhook
// المستخدم في FeesTab.tsx — تاب الأتعاب العام) بس مع caseScopeId
// = caseData.id، فبيقرا/يكتب على *نفس* جدولي case_fees/fee_payments —
// أي إضافة/تعديل/دفعة هنا تظهر فورًا في تاب الأتعاب العام (والعكس)،
// لأنهم نفس السجلات في الداتابيز مش نسخة منفصلة.
//
// ⚡ الفورم هنا مبسّط عمدًا (بدون اختيار قضية) لأن caseData ثابتة من
// السياق أصلاً — case_id بيتحقن تلقائي عند فتح الفورم.
//
// 🔒 الصلاحية: التاب نفسه بيظهر بس لو isAdminRole(profile) — بالظبط
// نفس شرط ظهور تاب "الأتعاب" الرئيسي في CommandDock.tsx — الفحص
// بيحصل في CaseDetailView.tsx (مكان تعريف قايمة التابات)، مش هنا.
// ─────────────────────────────────────────────────────────

interface FeesSectionProps {
  caseData: MappedCase;
  clients: ClientRow[];
  country?: string | null;
  profile?: ProfileRow | null;
  ensureClientsLoaded?: (ids: (string | null | undefined)[]) => void | Promise<void>;
}

function FeesSection({ caseData, clients, country, profile = null, ensureClientsLoaded }: FeesSectionProps) {
  // القضية دي بس — كافية لكل الـlookups جوه الـhook/FeeCard (resolveCaseFeeClient،
  // اسم/رقم/نوع القضية...) لأن كل الأتعاب المجلوبة هنا مرتبطة بنفس caseData.id.
  const casesForHook = React.useMemo(() => [caseData], [caseData]);

  const {
    fees, payments, expandedPayments, setExpandedPayments,
    loading, showForm, setShowForm, form, setForm, saving, editId, setEditId,
    addPaymentFor, setAddPaymentFor, payingFeeId, payAmount, setPayAmount, payDate, setPayDate,
    payNote, setPayNote, confirmDeletePay, setConfirmDeletePay,
    confirmDeleteFee, setConfirmDeleteFee, invoiceModal, setInvoiceModal,
    payReceiver, setPayReceiver, payClientName, setPayClientName,
    payClientNameText, setPayClientNameText,
    handleSave, handleAddPayment, handleDeletePayment, handleDelete, handlePermanentDeleteFee,
    fmt, fmtDate,
  } = useFeesActions(casesForHook, clients, country || undefined, profile, undefined, caseData.id);

  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [invoiceLoadingFor, setInvoiceLoadingFor] = useState<string | null>(null);
  const [officeBrand, setOfficeBrand] = useState({ name: '', logoUrl: '' });
  const modalPresentation = useModalPresentation();

  React.useEffect(() => {
    Promise.all([
      loadOfficeSetting('office_name'),
      loadOfficeSetting('office_logo'),
    ]).then(([officeName, officeLogo]: [string | null, string | null]) => {
      setOfficeBrand({ name: officeName || '', logoUrl: officeLogo || '' });
    });
  }, []);

  const currency = COUNTRY_CONFIGS[country || 'EG']?.currency || 'جنيه مصري';
  const { getOrCreateInvoice, printInvoice, printAllPayments } = useInvoicePrinting(casesForHook, clients, profile, currency);

  const resolvedFormClient = resolveCaseFeeClient(caseData, clients);

  const openAddForm = () => {
    setEditId(null);
    setForm({ case_id: caseData.id, client_id: caseData.client_id || '', receiver: '', total: '', paid: '', payment_date: '', notes: '' });
    setShowForm(true);
  };

  return React.createElement('div', { className: 'space-y-4 fade-in' },

    // ─ زر الإضافة ─
    React.createElement('button', {
      onClick: openAddForm,
      'data-testid': 'case-fee-add-button',
      className: 'w-full py-3 border border-dashed border-premium-gold/30 rounded-2xl flex items-center justify-center gap-2 text-premium-gold text-xs font-black hover:bg-premium-gold/5 transition-all active:scale-[0.98]'
    }, React.createElement(I.Plus), 'إضافة أتعاب لهذه القضية'),

    // ─ فورم الإضافة/التعديل (مبسّط — بدون اختيار قضية) ─
    showForm && createPortal(
      React.createElement('div', {
        className: `fixed inset-0 z-[70] flex ${modalPresentation.overlayAlignClassName} justify-center bg-black/80 backdrop-blur-sm`,
        onClick: (e: React.MouseEvent) => { if (e.target === e.currentTarget) { setShowForm(false); setEditId(null); } }
      },
        React.createElement('div', {
          className: `bg-premium-card w-full max-w-lg ${modalPresentation.isDesktop ? 'border border-premium-gold/20 rounded-3xl' : 'border-t border-premium-gold/20 rounded-t-3xl'} overflow-y-auto no-scrollbar p-5 space-y-3 shadow-2xl max-h-[90vh] ${modalPresentation.panelAnimationClassName}`,
          onClick: (e: React.MouseEvent) => e.stopPropagation()
        },
          React.createElement('div', { className: 'flex items-center justify-between mb-1' },
            React.createElement('h4', { className: 'text-xs font-black text-premium-gold' }, editId ? '✏️ تعديل الأتعاب' : '📋 إضافة أتعاب'),
            React.createElement('button', { onClick: () => { setShowForm(false); setEditId(null); }, 'data-testid': 'close-case-fee-form', className: 'w-7 h-7 rounded-lg bg-white/5 text-slate-400 text-xs active:scale-90' }, '✕')
          ),
          // اسم القضية — عرض ثابت بس (مقفول، محقون تلقائي من caseData)
          React.createElement('div', { className: 'space-y-1' },
            React.createElement('label', { className: 'text-[10px] text-slate-400 font-bold' }, 'القضية'),
            React.createElement('div', { className: 'w-full p-2.5 text-xs rounded-xl border border-white/10 bg-black/30 text-white min-h-[2.25rem] flex items-center' }, caseData.title || 'قضية بدون عنوان')
          ),
          React.createElement('div', { className: 'space-y-1' },
            React.createElement('label', { className: 'text-[10px] text-slate-400 font-bold' }, 'اسم الموكل', React.createElement('span', { className: 'text-rose-400 mr-1' }, '*')),
            React.createElement('div', {
              'data-testid': 'fee-client-locked',
              className: 'w-full p-2.5 text-xs rounded-xl border border-white/10 bg-black/30 text-white min-h-[2.25rem] flex items-center'
            },
              resolvedFormClient.displayLabel || React.createElement('span', { className: 'text-slate-500' },
                '⚠️ لا يوجد موكل مرتبط بهذه القضية — يرجى تحديد الموكل من بيانات القضية أولاً'
              )
            )
          ),
          React.createElement(Inp, { label: 'المستلم من المكتب', required: true, value: form.receiver, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, receiver: e.target.value })), placeholder: 'اسم المحامي أو الموظف المستلم', 'data-testid': 'fee-receiver' }),
          React.createElement(Inp, { label: 'إجمالي الأتعاب', required: true, type: 'number', value: form.total, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, total: e.target.value })), placeholder: '0', 'data-testid': 'fee-total' }),
          React.createElement(Inp, {
            label: editId ? 'المبلغ المدفوع (للتعديل، استخدم زر «تسجيل دفعة»)' : 'المبلغ المدفوع',
            required: !editId,
            type: 'number', value: form.paid,
            disabled: !!editId,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, paid: e.target.value })),
            placeholder: '0', 'data-testid': 'fee-paid',
            className: editId ? 'w-full p-3 text-xs rounded-xl border border-white/10 bg-white/5 text-slate-500 cursor-not-allowed' : undefined
          }),
          React.createElement('div', { className: 'space-y-1' },
            React.createElement('label', { className: 'text-[10px] text-slate-400 font-bold' }, 'تاريخ الدفعة', !editId && React.createElement('span', { className: 'text-rose-400 mr-1' }, '*')),
            React.createElement('input', {
              type: 'date', value: form.payment_date, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, payment_date: e.target.value })),
              className: 'w-full p-2.5 text-xs rounded-xl border border-white/10 bg-black/30 text-white',
              style: { fontFamily: 'Cairo,sans-serif', colorScheme: 'dark' },
              'data-testid': 'fee-payment-date'
            })
          ),
          React.createElement(Inp, { label: 'ملاحظات', value: form.notes, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, notes: e.target.value })), placeholder: 'أي ملاحظات...' }),
          React.createElement('div', { className: 'flex gap-2' },
            React.createElement('button', { onClick: handleSave, disabled: saving || !resolvedFormClient.displayLabel, 'data-testid': 'save-case-fee-button', className: 'flex-1 py-2.5 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95' },
              saving ? React.createElement(I.Spin) : React.createElement(I.Check), 'حفظ'),
            React.createElement('button', { onClick: () => { setShowForm(false); setEditId(null); }, className: 'px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95' }, 'إلغاء')
          )
        )
      ),
      document.body
    ),

    // ─ القائمة ─
    loading ? React.createElement('div', { className: 'flex items-center justify-center py-10 gap-2 text-slate-500 text-xs' }, React.createElement(I.Spin), 'جاري التحميل...')
      : fees.length === 0
        ? React.createElement('div', { className: 'bg-premium-card border border-white/5 rounded-xl p-10 text-center space-y-2' },
            React.createElement('div', { className: 'text-3xl' }, '💰'),
            React.createElement('p', { className: 'text-white/60 font-black text-sm' }, 'لا توجد أتعاب مسجّلة على هذه القضية بعد'),
            React.createElement('p', { className: 'text-slate-500 text-xs' }, 'اضغط "إضافة أتعاب لهذه القضية" فوق للبدء')
          )
        : React.createElement('div', { className: 'space-y-3' },
            fees.map((fee) => React.createElement(FeeCard, {
              key: fee.id, fee, cases: casesForHook, clients, currency, fmt, fmtDate, ensureClientsLoaded,
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

    // ─ مودال تأكيد حذف الأتعاب ─
    confirmDeleteFee && createPortal(React.createElement(DeleteConfirmModal, {
      title: 'حذف الأتعاب',
      itemName: caseData.title || 'قضية غير معروفة',
      itemType: 'الأتعاب',
      loading: false,
      choiceTestId: 'case-fee-archive-confirm-choice',
      inputTestId: 'case-fee-delete-confirm-input',
      confirmTestId: 'case-fee-delete-confirm-button',
      deleteConsequences: [
        'سيُحذف نهائيًا سجل الأتعاب وكل الدفعات المسجلة عليه.',
        'الفاتورة الصادرة (لو موجودة) تفضل محفوظة بسجلها المالي كامل — بس رابطها بالأتعاب بيتصفّر.',
        'لا يمكن التراجع عن هذا الإجراء.',
      ],
      onConfirmArchive: () => { handleDelete(confirmDeleteFee.id); setConfirmDeleteFee(null); },
      onConfirmDelete: () => { handlePermanentDeleteFee(confirmDeleteFee.id); setConfirmDeleteFee(null); },
      onCancel: () => setConfirmDeleteFee(null)
    }), document.body),

    // ─ مودال تأكيد حذف الدفعة ─
    confirmDeletePay && createPortal(React.createElement(DeleteConfirmModal, {
      title: 'حذف الدفعة',
      itemName: fmt(confirmDeletePay.amount) + ' - ' + fmtDate(confirmDeletePay.payDate),
      itemType: 'الدفعة',
      mode: 'delete',
      loading: false,
      inputTestId: 'case-fee-confirm-delete-payment-input',
      confirmTestId: 'case-fee-confirm-delete-payment-yes',
      cancelTestId: 'case-fee-confirm-delete-payment-cancel',
      onConfirm: () => { handleDeletePayment(confirmDeletePay.payId, confirmDeletePay.fee); setConfirmDeletePay(null); },
      onCancel: () => setConfirmDeletePay(null)
    }), document.body),

    // ─ مودال معاينة الفاتورة ─
    React.createElement(InvoiceModal, { invoiceModal, setInvoiceModal, setDetailsFor, officeBrand, currency, printInvoice })
  );
}

export default FeesSection;
