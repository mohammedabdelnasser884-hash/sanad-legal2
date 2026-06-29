import React, { useState, useEffect, useRef } from 'react';
import { toast, escapeHtml } from '../utils';
import { Inp, Sel } from './shared';
import { createPortal } from 'react-dom';
import { I, COUNTRY_CONFIGS, loadOfficeSetting, SanadMark } from '../constants';
import { db } from '../supabaseClient';
import { useFeesActions } from '../hooks/fees/useFeesActions';

function FeesTab({cases, clients, showSummaryModal, setShowSummaryModal, country, profile=null}){
    const {
      fees, payments, expandedPayments, setExpandedPayments,
      loading, showForm, setShowForm, form, setForm, saving, editId, setEditId,
      addPaymentFor, setAddPaymentFor, payAmount, setPayAmount, payDate, setPayDate,
      payNote, setPayNote, confirmDeletePay, setConfirmDeletePay,
      confirmDeleteFee, setConfirmDeleteFee, invoiceModal, setInvoiceModal,
      payReceiver, setPayReceiver, payClientName, setPayClientName,
      payClientNameText, setPayClientNameText, feesSearch, setFeesSearch,
      feesFilter, setFeesFilter,
      fetchFees, handleSave, handleAddPayment, handleDeletePayment, handleDelete,
      // ── قيم محسوبة من الـ hook (مركزية — لا تُعاد هنا) ──
      fmt, fmtDate,
      feesByCategory, feesSections, feesAfterCategoryFilter, filteredFees,
      grandTotal, grandPaid, grandRemaining,
    } = useFeesActions(cases, clients, country, profile);

    const [detailsFor, setDetailsFor] = useState(null); // معرف بطاقة الأتعاب المفتوحة تفاصيلها
    // ── حالة أيقونة البحث القابلة للفتح في الهيدر ──
    const [searchOpen, setSearchOpen] = useState(false);
    const searchInputRef = useRef(null);
    const handleSearchOpen = () => { setSearchOpen(true); setTimeout(()=>searchInputRef.current?.focus(), 50); };
    const handleSearchClose = () => { setFeesSearch(''); setSearchOpen(false); };
    // ── عملة الدولة المختارة في الإعدادات (افتراضي جنيه مصري) ──
    const currency = COUNTRY_CONFIGS[country||'EG']?.currency || 'جنيه مصري';

    // ── توليد رقم فاتورة تسلسلي ──
    const genInvoiceNumber = (allPayments, paymentId) => {
        // جمع كل الدفعات مرتبة بالتاريخ
        const allPays = [];
        (Object.values(allPayments) as any[]).forEach(arr => (arr as any[]).forEach((p:any) => allPays.push(p)));
        allPays.sort((a:any,b:any)=> new Date(a.payment_date||a.created_at).getTime() - new Date(b.payment_date||b.created_at).getTime());
        const idx = allPays.findIndex(p=>p.id===paymentId);
        const num = idx>=0 ? idx+1 : allPays.length+1;
        const year = new Date().getFullYear();
        return `INV-${year}-${String(num).padStart(4,'0')}`;
    };

    // ══════════════════════════════════════════
    //  دوال مشتركة بين كل عمليات الطباعة
    //  (لتقليل التكرار بين printInvoice و printAllPayments)
    // ══════════════════════════════════════════

    // ── جلب بيانات المكتب (الاسم/العنوان/الهاتف/الإيميل/الشعار) ──
    const loadOfficeInfo = async () => {
        const [officeName, officeAddress, officePhone, officeEmail, officeLogo] = await Promise.all([
            loadOfficeSetting('office_name'),
            loadOfficeSetting('office_address'),
            loadOfficeSetting('office_phone'),
            loadOfficeSetting('office_email'),
            loadOfficeSetting('office_logo'),
        ]);
        const name    = escapeHtml(officeName    || 'مكتب المحاماة');
        const address = escapeHtml(officeAddress || '');
        const phone   = escapeHtml(officePhone   || '');
        const email   = escapeHtml(officeEmail   || '');
        // ⚠️ officeLogo بيُستخدم كـ src مباشرة (Data URL أو رابط)، فمينفعش
        // يتعمل له escapeHtml (هيكسر الـ Data URL) — لكنه قيمة إعدادات مكتب
        // مش نص حر مكتوب من مستخدم تالت، فمخاطره محدودة هنا.
        const logoHtml = officeLogo
            ? `<img src="${officeLogo}" style="width:64px;height:64px;object-fit:contain;border-radius:10px;" />`
            : officeLogoSvg(64);
        const contactLine = [address, phone, email].filter(Boolean).join(' | ');
        return { name, address, phone, email, logoHtml, contactLine };
    };

    // ── شعار سند الافتراضي (SVG) بمقاس مرن ──
    const officeLogoSvg = (size=64) => `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style="width:${size}px;height:${size}px;">
                <rect width="80" height="80" rx="16" fill="#0B1320"/>
                <line x1="16" y1="26" x2="64" y2="26" stroke="#D4AF37" stroke-width="8" stroke-linecap="round"/>
                <line x1="22" y1="40" x2="64" y2="40" stroke="#D4AF37" stroke-width="8" stroke-linecap="round"/>
                <line x1="28" y1="54" x2="64" y2="54" stroke="#D4AF37" stroke-width="8" stroke-linecap="round"/>
                <line x1="16" y1="26" x2="16" y2="60" stroke="#D4AF37" stroke-width="8" stroke-linecap="round"/>
                <circle cx="16" cy="26" r="8" fill="#D4AF37"/>
                <circle cx="16" cy="61" r="5" fill="#D4AF37" opacity="0.38"/>
               </svg>`;

    // ── صف التواقيع المشترك بين كل المطبوعات ──
    const sigRowHtml = '<div class="sig-row">'
        +'<div class="sig-box"><div class="sig-line">توقيع المحامي / المكتب</div></div>'
        +'<div class="sig-box"><div class="sig-line">توقيع واستلام الموكل</div></div>'
        +'</div>';

    // ── سكريبت الطباعة التلقائية عند تحميل الصفحة ──
    const autoPrintScript = '<scr'+'ipt>window.onload=function(){window.print();}<'+'/scr'+'ipt>';

    // ── فتح نافذة جديدة جاهزة للطباعة بمقاس A4 ──
    const openPrintWindow = () => window.open('','_blank','width=794,height=1123');

    // ── كتابة الـHTML النهائي وتشغيل الطباعة ──
    const writeAndPrint = (w, html) => {
        if(!w) return;
        w.document.write(html);
        w.document.close();
    };

    // ── طباعة الفاتورة ──
    const printInvoice = async (inv) => {
        // جلب بيانات المكتب من الإعدادات
        const { name, contactLine, logoHtml } = await loadOfficeInfo();

        const w = openPrintWindow();
        if(!w) return;
        const statusBadge = inv.remaining==='0'
            ? '<span class="status-badge status-paid">مسدد بالكامل</span>'
            : '<span class="status-badge" style="background:#fef3c7;color:#92400e">جزئي</span>';
        const notesHtml = inv.notes
            ? '<div class="notes-box">ملاحظة: '+escapeHtml(inv.notes)+'</div>'
            : '';
        const invoiceNum = escapeHtml(inv.invoiceNum);
        const clientName = escapeHtml(inv.clientName || '—');
        const caseName   = escapeHtml(inv.caseName);
        const receivedBy = escapeHtml(inv.receivedBy || '—');
        const issueDate  = escapeHtml(inv.issueDate);
        const amount     = escapeHtml(inv.amount);
        const payDate    = escapeHtml(inv.payDate);
        const css = [
            '*{margin:0;padding:0;box-sizing:border-box;}',
            'body{font-family:Cairo,sans-serif;background:#fff;color:#1a1208;direction:rtl;print-color-adjust:exact;-webkit-print-color-adjust:exact;}',
            '.page{width:794px;min-height:1123px;padding:40px 50px;background:#fff;position:relative;}',
            '.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:24px;border-bottom:3px solid #D4AF37;margin-bottom:28px;}',
            '.logo-box{display:flex;align-items:center;gap:14px;}',
            '.logo-svg{width:64px;height:64px;}',
            '.office-name{font-size:22px;font-weight:900;color:#070d1a;line-height:1.2;}',
            '.office-sub{font-size:10px;color:#7a6b52;margin-top:2px;}',
            '.invoice-badge{text-align:left;}',
            '.invoice-title{font-size:13px;font-weight:700;color:#7a6b52;letter-spacing:1px;}',
            '.invoice-num{font-size:26px;font-weight:900;color:#070d1a;}',
            '.invoice-date{font-size:11px;color:#7a6b52;margin-top:4px;}',
            '.gold-bar{height:4px;background:linear-gradient(90deg,#D4AF37,#E8C84A,#D4AF37);border-radius:2px;margin-bottom:28px;}',
            '.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px;}',
            '.info-box{background:#faf7f2;border:1px solid #e8e0d0;border-radius:10px;padding:14px 16px;}',
            '.info-label{font-size:10px;color:#7a6b52;font-weight:600;margin-bottom:4px;}',
            '.info-value{font-size:13px;font-weight:700;color:#1a1208;}',
            '.section-title{font-size:11px;font-weight:700;color:#7a6b52;margin-bottom:8px;}',
            '.amount-section{background:linear-gradient(135deg,#070d1a,#0d1a2e);border-radius:14px;padding:24px 28px;margin-bottom:28px;color:#fff;}',
            '.amount-label{font-size:12px;color:#D4AF37;font-weight:700;margin-bottom:6px;}',
            '.amount-value{font-size:36px;font-weight:900;color:#fff;}',
            '.amount-sub{font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px;}',
            '.tbl{width:100%;border-collapse:collapse;margin-bottom:28px;}',
            '.tbl th{background:#070d1a;color:#D4AF37;font-size:11px;font-weight:700;padding:10px 14px;text-align:right;}',
            '.tbl td{padding:10px 14px;font-size:12px;border-bottom:1px solid #e8e0d0;color:#1a1208;}',
            '.tbl tr:nth-child(even) td{background:#faf7f2;}',
            '.status-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;}',
            '.status-paid{background:#d1fae5;color:#065f46;}',
            '.notes-box{background:#faf7f2;border:1px solid #e8e0d0;border-right:3px solid #D4AF37;border-radius:8px;padding:12px 16px;margin-bottom:28px;font-size:11px;color:#4a3f2a;line-height:1.7;}',
            '.sig-row{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:36px;}',
            '.sig-box{text-align:center;}',
            '.sig-line{border-top:1.5px solid #1a1208;margin-top:44px;padding-top:8px;font-size:11px;color:#7a6b52;font-weight:600;}',
            '.footer{position:absolute;bottom:28px;left:50px;right:50px;text-align:center;font-size:10px;color:#c4b89a;border-top:1px solid #e8e0d0;padding-top:10px;}',
            '@media print{body{margin:0;}.page{padding:30px 40px;}}'
        ].join('\n');

        const html = '<!DOCTYPE html>'
            +'<html lang="ar" dir="rtl"><head><meta charset="UTF-8">'
            +'<title>فاتورة '+invoiceNum+'</title>'
            +'<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&display=swap" rel="stylesheet">'
            +'<style>'+css+'</style></head><body>'
            +'<div class="page">'
            +'<div class="header">'
            +'<div class="logo-box">'
            +logoHtml
            +'<div><div class="office-name">'+name+'</div>'
            +(contactLine?'<div class="office-sub">'+contactLine+'</div>':'')
            +'</div></div>'
            +'<div class="invoice-badge">'
            +'<div class="invoice-title">فاتورة أتعاب</div>'
            +'<div class="invoice-num">'+invoiceNum+'</div>'
            +'<div class="invoice-date">تاريخ الإصدار: '+issueDate+'</div>'
            +'</div></div>'
            +'<div class="gold-bar"></div>'
            +'<div class="info-grid">'
            +'<div class="info-box"><div class="section-title">بيانات الموكل</div>'
            +'<div class="info-label">اسم الموكل</div>'
            +'<div class="info-value">'+clientName+'</div></div>'
            +'<div class="info-box"><div class="section-title">بيانات القضية</div>'
            +'<div class="info-label">عنوان القضية</div>'
            +'<div class="info-value">'+caseName+'</div></div>'
            +'</div>'
            +'<div class="info-grid" style="margin-top:-16px">'
            +'<div class="info-box"><div class="info-label">استلم المبلغ</div>'
            +'<div class="info-value" style="color:#6d28d9">'+receivedBy+'</div></div>'
            +'<div class="info-box"><div class="info-label">تاريخ الإصدار</div>'
            +'<div class="info-value">'+issueDate+'</div></div>'
            +'</div>'
            +'<div class="amount-section">'
            +'<div class="amount-label">مبلغ هذه الدفعة</div>'
            +'<div class="amount-value">'+amount+' '+currency+'</div>'
            +'<div class="amount-sub">تاريخ الدفع: '+payDate+'</div>'
            +'</div>'
            +notesHtml
            +sigRowHtml
            +'<div class="footer">'+name+(contactLine?' — '+contactLine:'')+'</div>'
            +'</div>'
            +autoPrintScript
            +'</body></html>';

        writeAndPrint(w, html);
    };
    const printAllPayments = (fee, feePayments, caseName, clientName) => {
        const w = openPrintWindow();
        if(!w) return;
        const year = new Date().getFullYear();
        const css = [
            '*{margin:0;padding:0;box-sizing:border-box;}',
            'body{font-family:Cairo,sans-serif;background:#fff;color:#1a1208;direction:rtl;print-color-adjust:exact;-webkit-print-color-adjust:exact;}',
            '.page{width:794px;padding:36px 48px;background:#fff;}',
            '.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:3px solid #D4AF37;margin-bottom:24px;}',
            '.logo-box{display:flex;align-items:center;gap:12px;}',
            '.logo-svg{width:56px;height:56px;}',
            '.office-name{font-size:20px;font-weight:900;color:#070d1a;}',
            '.office-sub{font-size:10px;color:#7a6b52;margin-top:2px;}',
            '.report-title{font-size:14px;font-weight:900;color:#070d1a;text-align:left;}',
            '.report-sub{font-size:10px;color:#7a6b52;text-align:left;margin-top:3px;}',
            '.gold-bar{height:4px;background:linear-gradient(90deg,#D4AF37,#E8C84A,#D4AF37);border-radius:2px;margin-bottom:22px;}',
            '.info-row{display:flex;gap:16px;margin-bottom:20px;}',
            '.info-box{flex:1;background:#faf7f2;border:1px solid #e8e0d0;border-radius:10px;padding:12px 14px;}',
            '.info-label{font-size:9px;color:#7a6b52;font-weight:600;margin-bottom:3px;}',
            '.info-value{font-size:12px;font-weight:700;color:#1a1208;}',
            '.tbl{width:100%;border-collapse:collapse;margin-bottom:24px;}',
            '.tbl th{background:#070d1a;color:#D4AF37;font-size:10px;font-weight:700;padding:9px 12px;text-align:right;}',
            '.tbl td{padding:9px 12px;font-size:11px;border-bottom:1px solid #e8e0d0;color:#1a1208;}',
            '.tbl tr:nth-child(even) td{background:#faf7f2;}',
            '.total-row td{background:linear-gradient(135deg,#070d1a,#0d1a2e)!important;color:#D4AF37!important;font-weight:900;font-size:12px;}',
            '.sig-row{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:32px;}',
            '.sig-box{text-align:center;}',
            '.sig-line{border-top:1.5px solid #1a1208;margin-top:44px;padding-top:8px;font-size:11px;color:#7a6b52;font-weight:600;}',
            '.footer{margin-top:28px;text-align:center;font-size:9px;color:#c4b89a;border-top:1px solid #e8e0d0;padding-top:10px;}',
            '@media print{body{margin:0;}.page{padding:28px 38px;}}'
        ].join('\n');

        let rows = '';
        feePayments.forEach((p,i)=>{
            const num = 'INV-'+year+'-'+String(i+1).padStart(4,'0');
            const d = p.payment_date ? new Date(p.payment_date).toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}) : '—';
            const recv = escapeHtml(p.received_by || '—');
            const amt = (p.amount||0).toLocaleString('ar-SA',{maximumFractionDigits:0});
            const note = escapeHtml(p.notes || '—');
            rows += '<tr>'
                +'<td>'+num+'</td>'
                +'<td>'+d+'</td>'
                +'<td>'+amt+' '+currency+'</td>'
                +'<td>'+recv+'</td>'
                +'<td>'+note+'</td>'
                +'</tr>';
        });
        const totalPaid = (fee.paid_fees||0).toLocaleString('ar-SA',{maximumFractionDigits:0});
        rows += '<tr class="total-row"><td colspan="2">\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0645\u062f\u0641\u0648\u0639</td><td>'+totalPaid+' '+currency+'</td><td colspan="2"></td></tr>';

        const safeCaseName = escapeHtml(caseName);
        const safeClientName = escapeHtml(clientName || '—');

        const html = '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">'
            +'<title>\u0643\u0634\u0641 \u062f\u0641\u0639\u0627\u062a '+safeCaseName+'</title>'
            +'<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&display=swap" rel="stylesheet">'
            +'<style>'+css+'</style></head><body>'
            +'<div class="page">'
            +'<div class="header">'
            +'<div class="logo-box">'
            +officeLogoSvg(56)
            +'<div><div class="office-name">\u0633\u064e\u0646\u064e\u062f</div>'
            +'<div class="office-sub">\u0646\u0638\u0627\u0645 \u0627\u0644\u062a\u0634\u0639\u064a\u0644 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064a</div></div></div>'
            +'<div><div class="report-title">\u0643\u0634\u0641 \u062c\u0645\u064a\u0639 \u0627\u0644\u062f\u0641\u0639\u0627\u062a</div>'
            +'<div class="report-sub">\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0637\u0628\u0627\u0639\u0629: '+new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'})+'</div></div>'
            +'</div>'
            +'<div class="gold-bar"></div>'
            +'<div class="info-row">'
            +'<div class="info-box"><div class="info-label">\u0627\u0644\u0642\u0636\u064a\u0629</div><div class="info-value">'+safeCaseName+'</div></div>'
            +'<div class="info-box"><div class="info-label">\u0627\u0644\u0645\u0648\u0643\u0644</div><div class="info-value">'+safeClientName+'</div></div>'
            +'<div class="info-box"><div class="info-label">\u0639\u062f\u062f \u0627\u0644\u062f\u0641\u0639\u0627\u062a</div><div class="info-value">'+feePayments.length+'</div></div>'
            +'</div>'
            +'<table class="tbl"><thead><tr>'
            +'<th>\u0631\u0642\u0645 \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629</th>'
            +'<th>\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062f\u0641\u0639</th>'
            +'<th>\u0627\u0644\u0645\u0628\u0644\u063a</th>'
            +'<th>\u0627\u0644\u0645\u0633\u062a\u0644\u0645</th>'
            +'<th>\u0645\u0644\u0627\u062d\u0638\u0627\u062a</th>'
            +'</tr></thead><tbody>'+rows+'</tbody></table>'
            +sigRowHtml
            +'<div class="footer">\u0633\u064e\u0646\u064e\u062f \u2014 \u0646\u0638\u0627\u0645 \u0627\u0644\u062a\u0634\u0639\u064a\u0644 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064a</div>'
            +'</div>'
            +autoPrintScript
            +'</body></html>';
        writeAndPrint(w, html);
    };

    // ── المتغيرات المحسوبة تأتي من useFeesActions مباشرة ──

    return React.createElement('div',{className:"space-y-4 fade-in"},

        // ── هيدر القسم: العنوان + أيقونة البحث ──
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
                        value:feesSearch,
                        onChange:e=>setFeesSearch(e.target.value),
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
                : React.createElement('button',{
                    onClick:handleSearchOpen,
                    className:"flex items-center gap-1 bg-white/8 border border-white/10 text-slate-300 px-2.5 py-2 rounded-xl text-[11px] font-black active:scale-95 transition-transform hover:border-amber-500/30 hover:text-amber-300",
                    title:"بحث في الأتعاب"
                },
                    React.createElement('svg',{className:"w-3.5 h-3.5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                        React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"})
                    ),
                    React.createElement('span',null,"بحث")
                )
        ),

        // ── Modal الملخص المالي الإجمالي ──
        showSummaryModal && React.createElement('div',{
            className:"fixed z-50 bg-premium-card border-t border-premium-gold/20 rounded-t-3xl overflow-y-auto no-scrollbar shadow-2xl",
            style:{
                top:'calc(64px + env(safe-area-inset-top, 0px))',
                bottom:'calc(80px + env(safe-area-inset-bottom, 0px))',
                left:0, right:0,
            },
            onClick:e=>e.stopPropagation()
        },
            React.createElement('div',{className:"p-5 space-y-4"},
                // رأس المودال
                React.createElement('div',{className:"flex items-center justify-between"},
                    React.createElement('p',{className:"text-sm font-black text-premium-gold"},"💰 الملخص المالي الإجمالي"),
                    React.createElement('button',{onClick:()=>setShowSummaryModal(false),className:"w-7 h-7 rounded-lg bg-white/5 text-slate-400 text-xs active:scale-90"},"✕")
                ),
                // الأرقام الكبيرة
                React.createElement('div',{className:"grid grid-cols-3 gap-3 text-center"},
                    React.createElement('div',{className:"bg-white/5 rounded-2xl p-3"},
                        React.createElement('p',{className:"text-[15px] font-black text-white leading-tight"},fmt(grandTotal)),
                        React.createElement('p',{className:"text-[8px] text-slate-500 mt-0.5 font-bold"},"إجمالي الاتفاقات")
                    ),
                    React.createElement('div',{className:"bg-emerald-500/10 rounded-2xl p-3"},
                        React.createElement('p',{className:"text-[15px] font-black text-emerald-400 leading-tight"},fmt(grandPaid)),
                        React.createElement('p',{className:"text-[8px] text-slate-500 mt-0.5 font-bold"},"المحصّل فعلياً")
                    ),
                    React.createElement('div',{className:"bg-rose-500/10 rounded-2xl p-3"},
                        React.createElement('p',{className:"text-[15px] font-black text-rose-400 leading-tight"},fmt(grandRemaining)),
                        React.createElement('p',{className:"text-[8px] text-slate-500 mt-0.5 font-bold"},"المتبقي")
                    )
                ),
                // شريط نسبة التحصيل
                grandTotal > 0 && React.createElement('div',null,
                    React.createElement('div',{className:"flex items-center justify-between mb-1"},
                        React.createElement('span',{className:"text-[9px] text-slate-500"},"نسبة التحصيل"),
                        React.createElement('span',{className:"text-[9px] font-black text-emerald-400"},Math.round((grandPaid/grandTotal)*100)+'%')
                    ),
                    React.createElement('div',{className:"h-2 rounded-full bg-white/5 overflow-hidden"},
                        React.createElement('div',{
                            className:"h-full rounded-full transition-all",
                            style:{width:Math.round((grandPaid/grandTotal)*100)+'%',background:'linear-gradient(90deg,#10b981,#34d399)'}
                        })
                    )
                ),
                // توزيع القضايا
                React.createElement('div',null,
                    React.createElement('p',{className:"text-[9px] font-black text-slate-500 mb-2 tracking-widest"},"— توزيع القضايا —"),
                    React.createElement('div',{className:"grid grid-cols-3 gap-2 text-center"},
                        [
                            {label:'محصّلة', value: feesByCategory.collected.length, color:'text-emerald-400', bg:'bg-emerald-500/10'},
                            {label:'مؤجلة',  value: feesByCategory.deferred.length,  color:'text-amber-400',   bg:'bg-amber-500/10'},
                            {label:'مفتوحة', value: feesByCategory.open.length,      color:'text-rose-400',    bg:'bg-rose-500/10'},
                        ].map(s=>React.createElement('div',{key:s.label,className:`${s.bg} rounded-xl p-2.5`},
                            React.createElement('p',{className:`text-base font-black ${s.color}`},s.value),
                            React.createElement('p',{className:"text-[8px] text-slate-500 mt-0.5"},s.label)
                        ))
                    )
                ),
                React.createElement('button',{
                    onClick:()=>setShowSummaryModal(false),
                    className:"w-full py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"
                },"إغلاق")
            )
        ),

        // ── Pill Selector — أتعاب محصلة / مؤجلة / مفتوحة ──
        React.createElement('div',{className:"flex items-center bg-white/5 rounded-2xl p-1 gap-1"},
            feesSections.map(s => {
                const count = feesByCategory[s.key].length;
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

        // ─ زر الملخص المالي (بقى هنا مكان شريط البحث القديم) ─
        React.createElement('button',{
            onClick:()=>setShowSummaryModal(true),
            className:"w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-premium-gold/10 border border-premium-gold/25 text-premium-gold text-xs font-black active:scale-95 transition-all hover:bg-premium-gold/15"
        },"📊 الملخص المالي الإجمالي"),

        // ─ زر الإضافة ─
        React.createElement('button',{
            onClick:()=>{setShowForm(!showForm);setEditId(null);setForm({case_id:'',client_name_manual:'',client_name_text:'',receiver:'',total:'',paid:'',payment_date:'',notes:''}); },
            className:"w-full py-3 border border-dashed border-premium-gold/30 rounded-2xl flex items-center justify-center gap-2 text-premium-gold text-xs font-black hover:bg-premium-gold/5 transition-all active:scale-[0.98]"
        }, React.createElement(I.Plus), "إضافة أتعاب قضية"),

        // ─ فورم الإضافة/التعديل (modal) ─
        showForm && createPortal(
            React.createElement('div',{
                className:"fixed z-[70] bg-premium-card border-t border-premium-gold/20 rounded-t-3xl overflow-y-auto no-scrollbar p-5 space-y-3 shadow-2xl",
                style:{
                    top:'calc(64px + env(safe-area-inset-top, 0px))',
                    bottom:'calc(80px + env(safe-area-inset-bottom, 0px))',
                    left:0, right:0,
                },
                onClick:e=>e.stopPropagation()
            },
                    React.createElement('div',{className:"flex items-center justify-between mb-1"},
                        React.createElement('h4',{className:"text-xs font-black text-premium-gold"},editId ? "✏️ تعديل الأتعاب" : "📋 إضافة أتعاب"),
                        React.createElement('button',{onClick:()=>{setShowForm(false);setEditId(null);},className:"w-7 h-7 rounded-lg bg-white/5 text-slate-400 text-xs active:scale-90"},"✕")
                    ),
                    React.createElement(Sel,{
                        label:"القضية",value:form.case_id,
                        onChange:e=>{
                            const cid = e.target.value;
                            const lc = cases.find(c=>c.id===cid);
                            const lcl = lc ? clients.find(cl=>cl.id===lc.client_id) : null;
                            setForm(p=>({...p, case_id:cid, client_name_manual: lcl ? '' : p.client_name_manual}));
                        },
                        options:[{value:'',label:'اختر القضية...'}, ...cases.map(c=>({value:c.id,label:c.title}))]
                    }),
                    React.createElement('div',{className:"space-y-1.5"},
                        React.createElement('label',{className:"text-[10px] text-slate-400 font-bold"},"اسم الموكل"),
                        React.createElement('select',{
                            value: form.client_name_manual === '__manual__' ? '__manual__'
                                : (clients.find(cl=>cl.full_name===form.client_name_manual) ? form.client_name_manual : (form.client_name_manual ? '__manual__' : '')),
                            onChange:e=>{
                                const v = e.target.value;
                                if(v==='__manual__') setForm(p=>({...p, client_name_manual:'__manual__'}));
                                else setForm(p=>({...p, client_name_manual: v}));
                            },
                            className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-black/30 text-white",
                            style:{fontFamily:'Cairo,sans-serif',colorScheme:'dark'}
                        },
                            React.createElement('option',{value:''},'اختر موكل...'),
                            clients.map(cl=>React.createElement('option',{key:cl.id, value:cl.full_name}, cl.full_name)),
                            React.createElement('option',{value:'__manual__'},'➕ آخر (اكتب يدوي)')
                        ),
                        form.client_name_manual==='__manual__' && React.createElement('input',{
                            type:"text",
                            value:form.client_name_text||'',
                            onChange:e=>setForm(p=>({...p, client_name_text:e.target.value})),
                            placeholder:"اكتب اسم الموكل...",
                            className:"w-full p-2.5 text-xs rounded-xl border border-premium-gold/30 bg-black/30 text-white placeholder-slate-600",
                            style:{fontFamily:'Cairo,sans-serif'},
                            autoFocus:true
                        })
                    ),
                    React.createElement(Inp,{label:"المستلم من المكتب",value:form.receiver,onChange:e=>setForm(p=>({...p,receiver:e.target.value})),placeholder:"اسم المحامي أو الموظف المستلم"}),
                    React.createElement(Inp,{label:"إجمالي الأتعاب",type:"number",value:form.total,onChange:e=>setForm(p=>({...p,total:e.target.value})),placeholder:"0"}),
                    React.createElement(Inp,{label:"المبلغ المدفوع",type:"number",value:form.paid,onChange:e=>setForm(p=>({...p,paid:e.target.value})),placeholder:"0"}),
                    React.createElement('div',{className:"space-y-1"},
                        React.createElement('label',{className:"text-[10px] text-slate-400 font-bold"},"تاريخ الدفعة"),
                        React.createElement('input',{
                            type:"date",value:form.payment_date,onChange:e=>setForm(p=>({...p,payment_date:e.target.value})),
                            className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-black/30 text-white",
                            style:{fontFamily:'Cairo,sans-serif',colorScheme:'dark'}
                        })
                    ),
                    React.createElement(Inp,{label:"ملاحظات",value:form.notes,onChange:e=>setForm(p=>({...p,notes:e.target.value})),placeholder:"أي ملاحظات..."}),
                    React.createElement('div',{className:"flex gap-2"},
                        React.createElement('button',{onClick:handleSave,disabled:saving,className:"flex-1 py-2.5 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"},
                            saving?React.createElement(I.Spin):React.createElement(I.Check),"حفظ"),
                        React.createElement('button',{onClick:()=>{setShowForm(false);setEditId(null);},className:"px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"},"إلغاء")
                    )
                )
            ),
            document.body
        ),

        // ─ قائمة الأتعاب ─
        loading ? React.createElement('div',{className:"flex items-center justify-center py-10 gap-2 text-slate-500 text-xs"},React.createElement(I.Spin),"جاري التحميل...")
        : feesAfterCategoryFilter.length===0
            ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-10 text-center space-y-2"},
                React.createElement('div',{className:"text-3xl"},
                    feesFilter==='collected' ? '✅' : feesFilter==='deferred' ? '⏳' : '⚠️'
                ),
                React.createElement('p',{className:"text-white/60 font-black text-sm"},
                    feesFilter==='collected' ? 'لا توجد أتعاب محصّلة بعد'
                    : feesFilter==='deferred' ? 'لا توجد أتعاب مؤجلة'
                    : 'لا توجد أتعاب مفتوحة'
                ),
                React.createElement('p',{className:"text-slate-500 text-xs"},
                    feesFilter==='collected' ? 'الأتعاب المدفوعة بالكامل ستظهر هنا'
                    : feesFilter==='deferred' ? 'الأتعاب المتفق عليها وغير المسددة بالكامل ستظهر هنا'
                    : 'القضايا التي بدون اتفاق على مبلغ الأتعاب ستظهر هنا'
                )
              )
            : filteredFees.length===0
            ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-8 text-center space-y-2"},
                React.createElement('div',{className:"text-2xl"},"🔍"),
                React.createElement('p',{className:"text-white/60 font-black text-sm"},"لا توجد نتائج"),
                React.createElement('p',{className:"text-slate-500 text-xs"},'جرب كلمة بحث مختلفة')
              )
            : React.createElement('div',{className:"space-y-3"},
                filteredFees.map(fee=>{
                    const linkedCase = cases.find(c=>c.id===fee.case_id);
                    const linkedClient = linkedCase ? clients.find(cl=>cl.id===linkedCase.client_id) : null;
                    const pct = fee.total_fees>0 ? Math.round((fee.paid_fees/fee.total_fees)*100) : 0;
                    const rem = (fee.total_fees||0)-(fee.paid_fees||0);
                    const isFullyPaid = rem <= 0;
                    const feePayments = payments[fee.id]||[];
                    const showPays = expandedPayments[fee.id];

                    return React.createElement(React.Fragment,{key:fee.id},
                        // ─ الكارت المضغوط ─
                        React.createElement('div',{
                            onClick:()=>setDetailsFor(fee.id),
                            className:"bg-premium-card border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-3 cursor-pointer active:scale-95 transition-transform"
                        },
                            React.createElement('div',{className:"flex-1 min-w-0"},
                                React.createElement('p',{className:"text-xs font-black text-white truncate"}, linkedCase?.title||'قضية غير معروفة'),
                                React.createElement('div',{className:"flex items-center gap-2 mt-1.5 flex-wrap"},
                                    (fee.client_name||linkedClient?.full_name) && React.createElement('span',{className:"text-[9px] text-emerald-400 font-bold"},"👤 "+(fee.client_name||linkedClient?.full_name)),
                                    linkedCase?.number && React.createElement('span',{className:"text-[9px] text-blue-400 font-bold"},"# "+linkedCase.number),
                                    linkedCase?.type && React.createElement('span',{className:"text-[9px] text-purple-400 font-bold"},"⚖️ "+linkedCase.type)
                                )
                            ),
                            React.createElement('span',{className:`text-[9px] font-black px-2 py-1 rounded-full shrink-0 ${isFullyPaid?'bg-emerald-500/15 text-emerald-400':'bg-amber-500/15 text-amber-400'}`}, isFullyPaid ? '✅ مسدد' : pct+'%')
                        ),
                        // ─ مودال التفاصيل الكاملة ─
                        detailsFor===fee.id && React.createElement('div',{
                            className:"fixed z-50 bg-premium-card border-t border-white/10 rounded-t-3xl shadow-2xl overflow-y-auto",
                            style:{
                                top:'calc(64px + env(safe-area-inset-top, 0px))',
                                bottom:'calc(80px + env(safe-area-inset-bottom, 0px))',
                                left:0, right:0,
                            },
                            onClick:e=>e.stopPropagation()
                        },
                                React.createElement('div',{className:"px-4 pt-4 pb-2"},
                                    React.createElement('div',{className:"flex items-center justify-between"},
                                        React.createElement('p',{className:"text-[10px] text-slate-500 font-black"},"📋 تفاصيل الأتعاب"),
                                        React.createElement('button',{onClick:()=>setDetailsFor(null),className:"w-7 h-7 rounded-lg bg-white/5 text-slate-400 text-xs active:scale-90"},"✕")
                                    )
                                ),
                                React.createElement('div',{className:"pb-4"},
                        // شريط التقدم
                        React.createElement('div',{className:"h-1 w-full bg-white/5"},
                            React.createElement('div',{className:`h-full transition-all ${isFullyPaid?'bg-emerald-400':'bg-premium-gold'}`,style:{width:pct+'%'}})
                        ),
                        React.createElement('div',{className:"p-4 space-y-3"},
                            // اسم القضية
                            React.createElement('div',{className:"flex items-start justify-between gap-2"},
                                React.createElement('div',{className:"flex-1"},
                                    React.createElement('p',{className:"text-xs font-black text-white leading-tight"},linkedCase?.title||'قضية غير معروفة'),
                                    (fee.client_name||linkedClient?.full_name) && React.createElement('p',{className:"text-[9px] text-emerald-400 mt-0.5"},"👤 "+(fee.client_name||linkedClient?.full_name)),
                                    fee.receiver && React.createElement('p',{className:"text-[9px] text-purple-400 mt-0.5"},"🏛 المستلم: "+fee.receiver),
                                    fee.last_payment_date && React.createElement('p',{className:"text-[9px] text-slate-500 mt-0.5"},"📅 "+fmtDate(fee.last_payment_date))
                                ),
                                React.createElement('span',{className:`text-[9px] font-black px-2 py-1 rounded-full ${isFullyPaid?'bg-emerald-500/15 text-emerald-400':'bg-amber-500/15 text-amber-400'}`},
                                    isFullyPaid ? '✅ مسدد' : pct+'%'
                                )
                            ),
                            // الأرقام
                            React.createElement('div',{className:"grid grid-cols-3 gap-2 text-center"},
                                React.createElement('div',{className:"bg-white/3 rounded-xl p-2"},
                                    React.createElement('p',{className:"text-[10px] font-black text-white"},fmt(fee.total_fees)),
                                    React.createElement('p',{className:"text-[8px] text-slate-500"},"الإجمالي")
                                ),
                                React.createElement('div',{className:"bg-emerald-500/8 rounded-xl p-2"},
                                    React.createElement('p',{className:"text-[10px] font-black text-emerald-400"},fmt(fee.paid_fees)),
                                    React.createElement('p',{className:"text-[8px] text-slate-500"},"المدفوع")
                                ),
                                React.createElement('div',{className:"bg-rose-500/8 rounded-xl p-2"},
                                    React.createElement('p',{className:`text-[10px] font-black ${rem>0?'text-rose-400':'text-emerald-400'}`},fmt(rem)),
                                    React.createElement('p',{className:"text-[8px] text-slate-500"},"المتبقي")
                                )
                            ),
                            // ملاحظات القضية
                            fee.notes && React.createElement('p',{className:"text-[10px] text-slate-400 bg-white/3 rounded-xl px-3 py-2"},"📝 "+fee.notes),

                            // ─ سجل الدفعات ─
                            feePayments.length>0 && React.createElement('div',{className:"space-y-1"},
                                React.createElement('div',{className:"flex gap-1"},
                                    React.createElement('button',{
                                        onClick:()=>setExpandedPayments(p=>({...p,[fee.id]:!p[fee.id]})),
                                        className:"flex-1 flex items-center justify-between text-[10px] font-black text-blue-400 bg-blue-500/8 border border-blue-500/15 rounded-xl px-3 py-2 active:scale-98"
                                    },
                                        React.createElement('span',null,"🗓 سجل الدفعات ("+feePayments.length+")"),
                                        React.createElement('span',null, showPays ? '▲' : '▼')
                                    ),
                                    React.createElement('button',{
                                        title:"طباعة كل الدفعات",
                                        onClick:()=>printAllPayments(fee, feePayments, linkedCase?.title||'غير معروفة', linkedClient?.full_name||''),
                                        className:"w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-400 text-base active:scale-90 shrink-0"
                                    },"🖨️")
                                ),
                                showPays && React.createElement('div',{className:"space-y-1 pt-1"},
                                    feePayments.map((p,i)=>
                                        React.createElement('div',{key:p.id,className:"flex items-center justify-between bg-white/3 rounded-xl px-3 py-2 gap-2"},
                                            React.createElement('div',{className:"flex-1"},
                                                React.createElement('p',{className:"text-[10px] font-black text-emerald-400"},fmt(p.amount)+" "+currency),
                                                React.createElement('p',{className:"text-[9px] text-slate-500"},fmtDate(p.payment_date)),
                                                p.received_by && React.createElement('p',{className:"text-[9px] text-blue-400 mt-0.5"},"👤 استلم: "+p.received_by),
                                                p.notes && React.createElement('p',{className:"text-[9px] text-slate-400 mt-0.5"},"📝 "+p.notes)
                                            ),
                                            React.createElement('div',{className:"flex items-center gap-1 shrink-0"},
                                                React.createElement('button',{
                                                    title:"معاينة وطباعة الفاتورة",
                                                    onClick:()=>{
                                                        const invNum = genInvoiceNumber(payments, p.id);
                                                        const rem = Math.max(0,(fee.total_fees||0)-(fee.paid_fees||0));
                                                        setInvoiceModal({
                                                            payment:p, fee,
                                                            invoiceNum: invNum,
                                                            caseName: linkedCase?.title||'غير معروفة',
                                                            clientName: linkedClient?.full_name||'',
                                                            receivedBy: p.received_by||'',
                                                            amount: fmt(p.amount),
                                                            payDate: fmtDate(p.payment_date),
                                                            issueDate: fmtDate(new Date().toISOString().slice(0,10)),
                                                            totalFees: fmt(fee.total_fees),
                                                            paidFees: fmt(fee.paid_fees),
                                                            remaining: fmt(rem),
                                                            notes: p.notes||fee.notes||''
                                                        });
                                                    },
                                                    className:"w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 text-sm active:scale-90"
                                                },"🧾"),
                                                React.createElement('button',{
                                                    onClick:()=>setConfirmDeletePay({payId:p.id,fee}),
                                                    className:"w-6 h-6 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 text-[10px] active:scale-90"
                                                },"✕")
                                            )
                                        )
                                    )
                                )
                            ),

                            // زر تسجيل دفعة + تعديل + حذف
                            !isFullyPaid && addPaymentFor===fee.id
                                ? React.createElement('div',{className:"space-y-2 slide-up"},
                                    // اسم الموكل — dropdown
                                    React.createElement('div',{className:"space-y-1.5"},
                                        React.createElement('label',{className:"text-[10px] text-slate-400 font-bold"},"اسم الموكل"),
                                        React.createElement('select',{
                                            value: payClientName==='__manual__' ? '__manual__' : (payClientName||''),
                                            onChange:e=>setPayClientName(e.target.value),
                                            className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white",
                                            style:{fontFamily:'Cairo,sans-serif',colorScheme:'dark'}
                                        },
                                            React.createElement('option',{value:''},'اختر موكل...'),
                                            clients.map(cl=>React.createElement('option',{key:cl.id,value:cl.full_name},cl.full_name)),
                                            React.createElement('option',{value:'__manual__'},'➕ آخر (اكتب يدوي)')
                                        ),
                                        payClientName==='__manual__' && React.createElement('input',{
                                            type:"text",
                                            value:payClientNameText||'',
                                            onChange:e=>setPayClientNameText(e.target.value),
                                            placeholder:"اكتب اسم الموكل...",
                                            className:"w-full p-2.5 text-xs rounded-xl border border-premium-gold/30 bg-premium-bg text-white placeholder-slate-600",
                                            style:{fontFamily:'Cairo,sans-serif'},
                                            autoFocus:true
                                        })
                                    ),
                                    React.createElement('input',{
                                        type:"number",value:payAmount,onChange:e=>setPayAmount(e.target.value),
                                        placeholder:"المبلغ...",
                                        className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
                                        style:{fontFamily:'Cairo,sans-serif'}
                                    }),
                                    React.createElement('input',{
                                        type:"date",value:payDate,onChange:e=>setPayDate(e.target.value),
                                        className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white",
                                        style:{fontFamily:'Cairo,sans-serif',colorScheme:'dark'}
                                    }),
                                    React.createElement('input',{
                                        type:"text",value:payReceiver,onChange:e=>setPayReceiver(e.target.value),
                                        placeholder:"اسم المستلم من المكتب...",
                                        className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
                                        style:{fontFamily:'Cairo,sans-serif'}
                                    }),
                                    React.createElement('textarea',{
                                        value:payNote,onChange:e=>setPayNote(e.target.value),
                                        placeholder:"ملاحظات الدفعة...",rows:2,
                                        className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 resize-none",
                                        style:{fontFamily:'Cairo,sans-serif'}
                                    }),
                                    React.createElement('div',{className:"flex gap-2"},
                                        React.createElement('button',{onClick:()=>handleAddPayment(fee),className:"flex-1 py-2 bg-emerald-500 text-white rounded-xl text-xs font-black active:scale-95"},"✅ تسجيل"),
                                        React.createElement('button',{onClick:()=>{setAddPaymentFor(null);setPayDate('');setPayAmount('');setPayNote('');setPayReceiver('');setPayClientName('');setPayClientNameText('');},className:"px-3 py-2 bg-white/5 text-slate-400 rounded-xl text-xs active:scale-95"},"✕")
                                    )
                                  )
                                : React.createElement('div',{className:"flex gap-2"},
                                    !isFullyPaid && React.createElement('button',{
                                        onClick:()=>{setAddPaymentFor(fee.id);setPayAmount('');},
                                        className:"flex-1 py-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-black flex items-center justify-center gap-1 active:scale-95"
                                    },"➕ تسجيل دفعة"),
                                    React.createElement('button',{
                                        onClick:()=>{
                                            const isRegistered = clients.find(cl=>cl.full_name===fee.client_name);
                                            setEditId(fee.id);
                                            setForm({
                                                case_id:fee.case_id,
                                                client_name_manual: isRegistered ? fee.client_name : (fee.client_name ? '__manual__' : ''),
                                                client_name_text: isRegistered ? '' : (fee.client_name||''),
                                                receiver:fee.receiver||'',
                                                total:fee.total_fees,
                                                paid:fee.paid_fees,
                                                payment_date:fee.last_payment_date||'',
                                                notes:fee.notes||''
                                            });
                                            setShowForm(true);
                                        },
                                        className:"w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-500 hover:text-premium-gold active:scale-90"
                                    },React.createElement(I.Edit)),
                                    React.createElement('button',{
                                        onClick:()=>setConfirmDeleteFee(fee),
                                        className:"w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 active:scale-90"
                                    },React.createElement(I.Trash))
                                  )
                        )
                    )
                    );
                })
              ),

        // ─ مودال تأكيد حذف الأتعاب الرئيسية ─
        confirmDeleteFee && React.createElement('div',{
            className:"fixed z-50",
            style:{top:'calc(64px + env(safe-area-inset-top, 0px))', bottom:'calc(80px + env(safe-area-inset-bottom, 0px))', left:0, right:0, background:'rgba(0,0,0,0.7)'},
            onClick:()=>setConfirmDeleteFee(null)
        },
            React.createElement('div',{
                className:"absolute inset-0 bg-premium-card border-t border-rose-500/30 rounded-t-2xl p-5 space-y-4",
                onClick:e=>e.stopPropagation()
            },
                React.createElement('div',{className:"text-center space-y-1"},
                    React.createElement('div',{className:"text-3xl"},"⚠️"),
                    React.createElement('p',{className:"text-sm font-black text-white"},"حذف الأتعاب"),
                    React.createElement('p',{className:"text-xs text-slate-400 leading-relaxed"},
                        "سيتم حذف أتعاب قضية \"" + (cases.find(c=>c.id===confirmDeleteFee.case_id)?.title||'غير معروفة') + "\" وكل سجل الدفعات المرتبط بها نهائياً."
                    )
                ),
                React.createElement('div',{className:"flex gap-3"},
                    React.createElement('button',{
                        onClick:()=>{ handleDelete(confirmDeleteFee.id); setConfirmDeleteFee(null); },
                        className:"flex-1 py-2.5 bg-rose-500 text-white rounded-xl text-xs font-black active:scale-95"
                    },"نعم، احذف"),
                    React.createElement('button',{
                        onClick:()=>setConfirmDeleteFee(null),
                        className:"flex-1 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"
                    },"إلغاء")
                )
            )
        ),

        // ─ مودال تأكيد حذف الدفعة ─
        confirmDeletePay && React.createElement('div',{
            className:"fixed z-50",
            style:{top:'calc(64px + env(safe-area-inset-top, 0px))', bottom:'calc(80px + env(safe-area-inset-bottom, 0px))', left:0, right:0, background:'rgba(0,0,0,0.7)'},
            onClick:()=>setConfirmDeletePay(null)
        },
            React.createElement('div',{
                className:"absolute inset-0 bg-premium-card border-t border-rose-500/30 rounded-t-2xl p-5 space-y-4",
                onClick:e=>e.stopPropagation()
            },
                React.createElement('div',{className:"text-center space-y-1"},
                    React.createElement('div',{className:"text-3xl"},"🗑"),
                    React.createElement('p',{className:"text-sm font-black text-white"},"حذف الدفعة"),
                    React.createElement('p',{className:"text-xs text-slate-400"},"هل أنت متأكد؟ لا يمكن التراجع عن هذا الإجراء")
                ),
                React.createElement('div',{className:"flex gap-3"},
                    React.createElement('button',{
                        onClick:()=>{ handleDeletePayment(confirmDeletePay.payId, confirmDeletePay.fee); setConfirmDeletePay(null); },
                        className:"flex-1 py-2.5 bg-rose-500 text-white rounded-xl text-xs font-black active:scale-95"
                    },"نعم، احذف"),
                    React.createElement('button',{
                        onClick:()=>setConfirmDeletePay(null),
                        className:"flex-1 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"
                    },"إلغاء")
                )
            )
        ),

        // ─ مودال معاينة الفاتورة ─
        invoiceModal && React.createElement('div',{
            className:"fixed z-50",
            style:{top:'calc(64px + env(safe-area-inset-top, 0px))', bottom:'calc(80px + env(safe-area-inset-bottom, 0px))', left:0, right:0, background:'rgba(0,0,0,0.85)'},
            onClick:()=>setInvoiceModal(null)
        },
            React.createElement('div',{
                className:"absolute inset-0 bg-premium-card border-t border-premium-gold/30 rounded-t-2xl overflow-y-auto",
                onClick:e=>e.stopPropagation()
            },
                // ─ رأس المودال ─
                React.createElement('div',{className:"bg-gradient-to-l from-yellow-900/30 to-amber-800/20 border-b border-premium-gold/20 px-4 py-3 flex items-center justify-between"},
                    React.createElement('div',{className:"flex items-center gap-2"},
                        React.createElement('div',{className:"w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center text-base"},"🧾"),
                        React.createElement('div',null,
                            React.createElement('p',{className:"text-xs font-black text-premium-gold"},"فاتورة أتعاب"),
                            React.createElement('p',{className:"text-[10px] text-slate-400"},invoiceModal.invoiceNum)
                        )
                    ),
                    React.createElement('button',{onClick:()=>setInvoiceModal(null),className:"w-7 h-7 rounded-lg bg-white/5 text-slate-400 text-xs active:scale-90"},"✕")
                ),
                // ─ بيانات الفاتورة ─
                React.createElement('div',{className:"p-4 space-y-3"},
                    // شعار المكتب مصغّر
                    React.createElement('div',{className:"flex items-center gap-3 bg-white/3 rounded-xl p-3 border border-white/5"},
                        React.createElement('div',{style:{width:40,height:40,borderRadius:10,background:'#0B1320',
                            border:'1px solid rgba(212,175,55,0.2)',display:'flex',alignItems:'center',
                            justifyContent:'center',flexShrink:0}},
                            React.createElement(SanadMark,{size:26})
                        ),
                        React.createElement('div',null,
                            React.createElement('p',{className:"text-xs font-black text-white"},"سَنَد"),
                            React.createElement('p',{className:"text-[9px] text-slate-500"},"نظام التشغيل القانوني")
                        )
                    ),
                    // بطاقات البيانات
                    React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                        [
                            {label:"القضية", value: invoiceModal.caseName, cls:"text-white"},
                            {label:"الموكل", value: invoiceModal.clientName||"—", cls:"text-emerald-400"},
                            {label:"تاريخ الدفع", value: invoiceModal.payDate, cls:"text-blue-400"},
                            {label:"المستلم", value: invoiceModal.receivedBy||"—", cls:"text-purple-400"},
                        ].map(item=>
                            React.createElement('div',{key:item.label,className:"bg-white/3 rounded-xl p-2.5 border border-white/5"},
                                React.createElement('p',{className:"text-[8px] text-slate-500 mb-1"},item.label),
                                React.createElement('p',{className:`text-[10px] font-black ${item.cls} leading-tight`},item.value)
                            )
                        )
                    ),
                    // مبلغ الدفعة (بارز)
                    React.createElement('div',{className:"bg-gradient-to-l from-amber-900/40 to-yellow-900/20 border border-premium-gold/25 rounded-xl p-3 text-center"},
                        React.createElement('p',{className:"text-[9px] text-premium-gold/70 mb-1"},"💰 مبلغ هذه الدفعة"),
                        React.createElement('p',{className:"text-2xl font-black text-premium-gold"},invoiceModal.amount+" "+currency)
                    ),
                    // جدول الإجماليات
                    React.createElement('div',{className:"grid grid-cols-3 gap-1.5"},
                        [
                            {label:"الإجمالي", value:invoiceModal.totalFees, cls:"text-white"},
                            {label:"المدفوع", value:invoiceModal.paidFees, cls:"text-emerald-400"},
                            {label:"المتبقي", value:invoiceModal.remaining, cls: invoiceModal.remaining==="0"?"text-emerald-400":"text-rose-400"},
                        ].map(item=>
                            React.createElement('div',{key:item.label,className:"bg-white/3 rounded-xl p-2 text-center border border-white/5"},
                                React.createElement('p',{className:`text-[10px] font-black ${item.cls}`},item.value),
                                React.createElement('p',{className:"text-[8px] text-slate-500 mt-0.5"},item.label)
                            )
                        )
                    ),
                    invoiceModal.notes && React.createElement('div',{className:"bg-white/3 rounded-xl p-2.5 border-r-2 border-premium-gold/50 border border-white/5"},
                        React.createElement('p',{className:"text-[9px] text-slate-400"},"📝 "+invoiceModal.notes)
                    ),
                    // أزرار
                    React.createElement('div',{className:"flex gap-2 pt-1"},
                        React.createElement('button',{
                            onClick:()=>printInvoice(invoiceModal),
                            className:"flex-1 py-2.5 bg-premium-gold text-premium-bg rounded-xl text-xs font-black flex items-center justify-center gap-1.5 active:scale-95"
                        },"🖨️ طباعة الفاتورة"),
                        React.createElement('button',{
                            onClick:()=>setInvoiceModal(null),
                            className:"px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs active:scale-95"
                        },"إغلاق")
                    )
                )
            )
        )
    );
}

// ══════════════════════════════════════════
//  التذكيرات المخصصة
// ══════════════════════════════════════════

export default FeesTab;
