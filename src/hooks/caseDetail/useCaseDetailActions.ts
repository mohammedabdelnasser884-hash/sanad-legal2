import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../../supabaseClient';
import { toast, validateUploadFile, escapeHtml, escapeTelegramHtml, safeUpdate, logActivity } from '../../utils';
import { loadOfficeSetting } from '../../constants';

export function useCaseDetailActions(caseData: any, onUpdate: any, onDelete: any, onNotify: any, setShowStatusPicker?: (v: boolean) => void, client?: any, profile?: any) {
  const [sessions, setSessions] = useState([]);
  const [notes, setNotes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [showAddSession, setShowAddSession] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [editingSession, setEditingSession] = useState(null);
  const [deletingSessionId, setDeletingSessionId] = useState(null);
  const [sessionUpdateTarget, setSessionUpdateTarget] = useState(null);
  const [deletingNoteId, setDeletingNoteId] = useState(null);
  const [showAddNote, setShowAddNote] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docCategory, setDocCategory] = useState('مذكرة دفاع');
  const [docLabel, setDocLabel] = useState('');
  const [showDocForm, setShowDocForm] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [deletingDocId, setDeletingDocId] = useState(null);
  const fileInputRef = useRef(null);
  const [savingSession, setSavingSession] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [sessionForm, setSessionForm] = useState({date:'', time_period:'صباحي', location_floor:'', location_hall:'', description:'', result:'', next_action:''});
  const [noteText, setNoteText] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [officeWhatsAppName, setOfficeWhatsAppName] = useState('');
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<{id:string, date:string}|null>(null);
  const [confirmDeleteNote, setConfirmDeleteNote] = useState<{id:string, preview:string}|null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<{id:string, file_name:string, storage_path:string}|null>(null);

    const fetchSessions = useCallback(async () => {
        setLoadingSessions(true);
        const {data} = await db.from('case_sessions').select('*').eq('case_id', caseData.id).order('session_date', {ascending: false});
        setSessions(data || []);
        const {data: nd} = await db.from('case_notes').select('*').eq('case_id', caseData.id).order('created_at', {ascending: false});
        setNotes(nd || []);
        const {data: dd} = await db.from('case_documents').select('*').eq('case_id', caseData.id).order('created_at', {ascending: false});
        setDocs(dd || []);
        setLoadingSessions(false);
    }, [caseData.id]);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        // ⚠️ فحص نوع وحجم الملف قبل القبول — يمنع رفع .html/.svg أو ملفات
        // ضخمة على باكت عام بيُفتح رابطه مباشرة لأي حد (راجع validateUploadFile).
        const validationError = validateUploadFile(file);
        if (validationError) { toast('❌ ' + validationError, true); e.target.value = ''; return; }
        setPendingFile(file);
        setDocLabel(file.name.replace(/\.[^/.]+$/, ''));
        setShowDocForm(true);
    };

    const handleUploadDoc = async () => {
        if (!pendingFile) return;
        // فحص دفاعي ثاني قبل الرفع الفعلي (في حالة تغيّرت pendingFile بأي طريقة
        // غير handleFileSelect) — راجع validateUploadFile في utils.ts.
        const validationError = validateUploadFile(pendingFile);
        if (validationError) { toast('❌ ' + validationError, true); return; }
        setUploadingDoc(true);
        const ext = pendingFile.name.split('.').pop().toLowerCase();
        const safeName = `case_${caseData.id}_${Date.now()}.${ext}`;
        const {error: upErr} = await db.storage.from('case-docs').upload(safeName, pendingFile, {upsert: true});
        if (upErr) { setUploadingDoc(false); toast('❌ فشل الرفع: ' + upErr.message, true); return; }
        const {data: urlData} = db.storage.from('case-docs').getPublicUrl(safeName);
        const {error: dbErr} = await db.from('case_documents').insert([{
            case_id: caseData.id,
            file_name: docLabel.trim() || pendingFile.name,
            file_type: ext,
            file_url: urlData.publicUrl,
            storage_path: safeName,
            category: docCategory,
            original_name: pendingFile.name,
            file_size: pendingFile.size,
        }]);
        setUploadingDoc(false);
        if (dbErr) { toast('❌ ' + dbErr.message, true); return; }
        toast('✅ تم رفع المستند بنجاح');
        logActivity(db, 'رفع مستند', {
            entity_type: 'document', details: `${caseData.title} — ${docLabel.trim() || pendingFile.name}`,
            case_name: caseData.title || null, case_type: caseData.type || null,
            client_name: client?.full_name || null,
            userName: profile?.full_name || null,
        });
        setShowDocForm(false); setPendingFile(null); setDocLabel(''); setDocCategory('مذكرة دفاع');
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchSessions();
    };

    const handleDeleteDoc = async (doc) => {
        setDeletingDocId(doc.id);
        const { error: storageErr } = await db.storage.from('case-docs').remove([doc.storage_path]);
        if (storageErr) {
            setDeletingDocId(null);
            toast('❌ فشل حذف الملف، حاول مرة أخرى', true);
            return;
        }
        const { error: dbErr } = await db.from('case_documents').delete().eq('id', doc.id);
        setDeletingDocId(null);
        if (dbErr) { toast('❌ حُذف الملف لكن فشل تحديث السجل', true); return; }
        toast('🗑 تم حذف المستند');
        logActivity(db, 'حذف مستند', {
            entity_type: 'document', entity_id: doc.id, details: `${caseData.title} — ${doc.file_name}`,
            case_name: caseData.title || null, case_type: caseData.type || null,
            client_name: client?.full_name || null,
            userName: profile?.full_name || null,
        });
        fetchSessions();
    };

    useEffect(() => { fetchSessions(); }, [fetchSessions]);

    const handleExportPdf = async () => {
        setExportingPdf(true);
        const MONTHS_FULL=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
        const now = new Date();
        const dateStr = now.getDate()+' '+MONTHS_FULL[now.getMonth()]+' '+now.getFullYear();

        // جلب بيانات المكتب
        const [officeName, officeAddress, officePhone, officeEmail, officeLogo] = await Promise.all([
            loadOfficeSetting('office_name'),
            loadOfficeSetting('office_address'),
            loadOfficeSetting('office_phone'),
            loadOfficeSetting('office_email'),
            loadOfficeSetting('office_logo'),
        ]);
        const name    = escapeHtml(officeName    || '');
        const address = escapeHtml(officeAddress || '');
        const phone   = escapeHtml(officePhone   || '');
        const email   = escapeHtml(officeEmail   || '');
        const contactLine = [address, phone, email].filter(Boolean).join(' | ');

        // شعار سند الرسمي SVG (يُستخدم لما مفيش شعار مكتب)
        const sanadSvg = `<svg width="32" height="32" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <line x1="6" y1="13" x2="34" y2="13" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="9.5" y1="21" x2="34" y2="21" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="13" y1="29" x2="34" y2="29" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="6" y1="13" x2="6" y2="32" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round"/>
          <circle cx="6" cy="13" r="4.5" fill="#D4AF37"/>
          <circle cx="6" cy="33" r="3" fill="#D4AF37" opacity="0.38"/>
        </svg>`;

        const logoHtml = officeLogo
            ? `<img src="${officeLogo}" style="width:56px;height:56px;object-fit:contain;border-radius:8px;border:1px solid rgba(255,255,255,0.2);" />`
            : `<div style="width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,#0d1a2e,#0B1320);border:1px solid rgba(212,175,55,0.25);display:flex;align-items:center;justify-content:center;">${sanadSvg}</div>`;

        const displayName = name || 'سَنَد'; // name متهرّبة فعلًا أعلى الدالة
        const displaySub  = name ? '' : 'نظام التشغيل القانوني';

        // تنسيق رقم القيد
        const caseNum = (()=>{ const p=(caseData.number||'').split('/'); return p.length===2?p[0]+' لسنة '+p[1]:caseData.number||'—'; })();

        // ⚠️ تهريب كل قيمة جاية من المستخدم (عنوان قضية، خصوم، جلسات، ملاحظات،
        // أسماء ملفات...) قبل دمجها في HTML خام — وإلا ممكن أي حقل من دول
        // يحمل كود (مثلاً <img onerror=...>) ويتنفذ في نافذة الطباعة (XSS مخزّنة).
        const safeCaseTitle  = escapeHtml(caseData.title);
        const safeCaseStatus = escapeHtml(caseData.status || 'نشطة');
        const safeCaseNum    = escapeHtml(caseNum);
        const safeCaseType   = escapeHtml(caseData.type || '—');
        const safeCaseCourt  = escapeHtml(caseData.court || '—');
        const safeClientName = escapeHtml(client?.full_name || '—');
        const safePlaintiff  = escapeHtml(caseData.plaintiff || '');
        const safeDefendant  = escapeHtml(caseData.defendant || '');

        const win = window.open('','_blank');
        if(!win){ setExportingPdf(false); return; }

        const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><title>ملف القضية - ${safeCaseTitle}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#f8f9fa;color:#1a1a2e;padding:20px;}
  .page{max-width:800px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);}
  .header{background:linear-gradient(135deg,#1a1a2e,#16213e);color:#D4AF37;padding:28px 32px;}
  .header-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
  .office-info{display:flex;align-items:center;gap:12px;}
  .office-name{font-size:16px;font-weight:900;color:#D4AF37;}
  .office-contact{font-size:10px;color:rgba(212,175,55,0.6);margin-top:2px;}
  .case-title{font-size:20px;font-weight:900;color:#fff;text-align:center;}
  .case-sub{font-size:11px;color:rgba(212,175,55,0.7);text-align:center;margin-top:6px;}
  .badge{display:inline-block;padding:4px 14px;border-radius:20px;border:1px solid #D4AF37;color:#D4AF37;font-size:11px;margin-top:8px;}
  .gold-bar{height:3px;background:linear-gradient(90deg,#D4AF37,#E8C84A,#D4AF37);}
  .section{padding:20px 24px;border-bottom:1px solid #f0f0f0;}
  .section h2{font-size:13px;font-weight:900;color:#1a1a2e;margin-bottom:14px;padding-bottom:6px;border-bottom:2px solid #D4AF37;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .field{background:#f8f9fa;border-radius:8px;padding:10px 12px;}
  .field label{font-size:9px;color:#888;display:block;margin-bottom:3px;font-weight:700;}
  .field span{font-size:12px;font-weight:700;color:#1a1a2e;}
  .session-card{border:1px solid #e8e8e8;border-right:4px solid #D4AF37;border-radius:8px;padding:12px;margin-bottom:8px;}
  .session-date{font-size:12px;font-weight:900;color:#D4AF37;margin-bottom:6px;}
  .session-label{font-size:9px;color:#888;font-weight:700;margin-top:6px;}
  .session-val{font-size:11px;color:#333;margin-top:2px;line-height:1.6;}
  .doc-row{display:flex;align-items:center;gap:10px;padding:8px;border:1px solid #eee;border-radius:8px;margin-bottom:5px;}
  .doc-name{font-size:11px;font-weight:700;color:#1a1a2e;}
  .doc-cat{font-size:9px;color:#888;}
  .note-card{background:#f8f9fa;border-radius:8px;padding:10px;margin-bottom:6px;border-right:3px solid #94a3b8;}
  .note-text{font-size:11px;color:#333;line-height:1.7;}
  .note-date{font-size:9px;color:#888;margin-top:4px;}
  .footer{background:#f8f9fa;padding:14px 24px;text-align:center;font-size:9px;color:#888;}
  @media print{body{padding:0;}.page{box-shadow:none;border-radius:0;}}
</style></head><body>
<div class="page">
  <div class="header">
    <div class="header-top">
      <div class="office-info">
        ${logoHtml}
        <div>
          <div class="office-name">${displayName}</div>
          ${displaySub?`<div style="font-size:9px;color:rgba(212,175,55,0.5);margin-top:1px;">${displaySub}</div>`:''}
          ${contactLine?`<div class="office-contact">${contactLine}</div>`:''}
        </div>
      </div>
      <div style="text-align:left">
        <div style="font-size:10px;color:rgba(212,175,55,0.6);">تاريخ الإصدار</div>
        <div style="font-size:12px;font-weight:700;color:#D4AF37;">${dateStr}</div>
      </div>
    </div>
    <div style="border-top:1px solid rgba(212,175,55,0.2);padding-top:16px;text-align:center;">
      <div class="case-title">⚖️ ${safeCaseTitle}</div>
      <div class="case-sub">ملف القضية الكامل</div>
      <div class="badge">${safeCaseStatus}</div>
    </div>
  </div>
  <div class="gold-bar"></div>

  <div class="section">
    <h2>📋 بيانات القضية</h2>
    <div class="grid2">
      <div class="field"><label>رقم القيد</label><span>${safeCaseNum}</span></div>
      <div class="field"><label>نوع القضية</label><span>${safeCaseType}</span></div>
      <div class="field"><label>المحكمة</label><span>${safeCaseCourt}</span></div>
      <div class="field"><label>الموكل</label><span>${safeClientName}</span></div>
      ${safePlaintiff?`<div class="field"><label>المدعي / الطاعن</label><span>${safePlaintiff}</span></div>`:''}
      ${safeDefendant?`<div class="field"><label>المدعى عليه / المطعون ضده</label><span>${safeDefendant}</span></div>`:''}
    </div>
  </div>

  ${sessions.length>0?`
  <div class="section">
    <h2>🗓 الجلسات (${sessions.length})</h2>
    ${sessions.map(s=>`
    <div class="session-card">
      <div class="session-date">📅 ${escapeHtml(s.session_date)}</div>
      ${s.description?`<div class="session-label">ما جرى</div><div class="session-val">${escapeHtml(s.description)}</div>`:''}
      ${s.result?`<div class="session-label">النتيجة</div><div class="session-val">${escapeHtml(s.result)}</div>`:''}
      ${s.next_action?`<div class="session-label">الإجراء القادم</div><div class="session-val">${escapeHtml(s.next_action)}</div>`:''}
    </div>`).join('')}
  </div>`:''}

  ${notes.length>0?`
  <div class="section">
    <h2>📝 الملاحظات (${notes.length})</h2>
    ${notes.map(n=>`
    <div class="note-card">
      <div class="note-text">${escapeHtml(n.content)}</div>
      <div class="note-date">${new Date(n.created_at).toLocaleDateString('ar-SA')}</div>
    </div>`).join('')}
  </div>`:''}

  ${docs.length>0?`
  <div class="section">
    <h2>📁 المستندات (${docs.length})</h2>
    ${docs.map(d=>`
    <div class="doc-row">
      <div style="font-size:20px">${/\.pdf$/i.test(d.original_name||'')?'📄':/\.(jpg|jpeg|png|gif|webp)$/i.test(d.original_name||'')?'🖼':/\.(doc|docx)$/i.test(d.original_name||'')?'📝':'📎'}</div>
      <div><div class="doc-name">${escapeHtml(d.file_name)}</div><div class="doc-cat">${escapeHtml(d.category || 'مستند')}</div></div>
    </div>`).join('')}
  </div>`:''}

  <div class="footer">🔒 ملف سري — ${displayName}${contactLine?' | '+contactLine:''} | تاريخ الإصدار: ${dateStr}</div>
</div>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`;
        win.document.write(html);
        win.document.close();
        setExportingPdf(false);
        toast('📄 جاري فتح ملف الطباعة...');
    };

    const handleAddSession = async () => {
        if (!sessionForm.date) return;
        setSavingSession(true);
        const {error} = await db.from('case_sessions').insert([{
            case_id: caseData.id,
            session_date: sessionForm.date,
            session_time: sessionForm.time_period || null,
            session_floor: sessionForm.location_floor || null,
            session_hall: sessionForm.location_hall || null,
            description: sessionForm.description || null,
            result: sessionForm.result || null,
            next_action: sessionForm.next_action || null,
        }]);
        if (!error) {
            // تحديث أقرب جلسة في جدول القضايا
            await db.from('cases').update({ next_hearing: sessionForm.date }).eq('id', caseData.id);
        }
        setSavingSession(false);
        if (error) { toast('❌ فشل إضافة الجلسة — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('✅ تمت إضافة الجلسة');
        logActivity(db, 'إضافة جلسة', {
            entity_type: 'session', details: `${caseData.title} — ${sessionForm.date}`,
            case_name: caseData.title || null, case_type: caseData.type || null,
            client_name: client?.full_name || null,
            userName: profile?.full_name || null,
        });
        if(onNotify){
            let msg=`📅 <b>جلسة جديدة</b>\n\n`;
            msg+=`⚖️ <b>${escapeTelegramHtml(caseData.title||'—')}</b>\n`;
            msg+=`📋 رقم القيد: ${escapeTelegramHtml(caseData.number||'—')}\n`;
            msg+=`🏛 المحكمة: ${escapeTelegramHtml(caseData.court||'—')}\n`;
            msg+=`📆 تاريخ الجلسة: ${escapeTelegramHtml(sessionForm.date)}`;
            if(sessionForm.time_period) msg+=` (${escapeTelegramHtml(sessionForm.time_period)})`;
            msg+=`\n`;
            if(sessionForm.location_floor||sessionForm.location_hall) msg+=`📍 ${sessionForm.location_floor?'الطابق '+escapeTelegramHtml(sessionForm.location_floor)+' ':''} ${sessionForm.location_hall?'قاعة '+escapeTelegramHtml(sessionForm.location_hall):''}\n`;
            if(sessionForm.description) msg+=`📝 ${escapeTelegramHtml(sessionForm.description)}\n`;
            onNotify(msg);
        }
        setSessionForm({date:'', time_period:'صباحي', location_floor:'', location_hall:'', description:'', result:'', next_action:''});
        setShowAddSession(false);
        fetchSessions();
    };

    const handleAddNote = async () => {
        if (!noteText.trim()) return;
        setSavingNote(true);
        const {error} = await db.from('case_notes').insert([{
            case_id: caseData.id,
            content: noteText.trim(),
        }]);
        setSavingNote(false);
        if (error) { toast('❌ فشل إضافة الملاحظة — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('✅ تمت إضافة الملاحظة');
        logActivity(db, 'إضافة ملاحظة', {
            entity_type: 'note', details: caseData.title || null,
            case_name: caseData.title || null, case_type: caseData.type || null,
            client_name: client?.full_name || null,
            userName: profile?.full_name || null,
        });
        setNoteText('');
        setShowAddNote(false);
        fetchSessions();
    };

    const handleDeleteNote = async (noteId) => {
        const { error } = await db.from('case_notes').delete().eq('id', noteId);
        if (error) { toast('❌ فشل حذف الملاحظة، حاول مرة أخرى', true); return; }
        toast('🗑 تم حذف الملاحظة');
        logActivity(db, 'حذف ملاحظة', {
            entity_type: 'note', entity_id: noteId, details: caseData.title || null,
            case_name: caseData.title || null, case_type: caseData.type || null,
            client_name: client?.full_name || null,
            userName: profile?.full_name || null,
        });
        fetchSessions();
    };

    const handleUpdateNote = async (noteId, content) => {
        // نجيب updated_at الحالي من الـ notes المحفوظة في state
        const note = notes.find((n: any) => n.id === noteId);
        const { success, conflict } = await safeUpdate(db, 'case_notes', noteId, { content }, note?.updated_at || null);
        if (conflict) return; // safeUpdate بيعرض الـ toast تلقائياً
        if (!success) { toast('❌ فشل تعديل الملاحظة — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('✅ تم تعديل الملاحظة');
        logActivity(db, 'تعديل ملاحظة', {
            entity_type: 'note', entity_id: noteId, details: caseData.title || null,
            case_name: caseData.title || null, case_type: caseData.type || null,
            client_name: client?.full_name || null,
            userName: profile?.full_name || null,
        });
        fetchSessions();
    };

    const handleDeleteSession = async (sessionId) => {
        const { error } = await db.from('case_sessions').delete().eq('id', sessionId);
        if (error) { toast('❌ فشل حذف الجلسة، حاول مرة أخرى', true); return; }
        toast('🗑 تم حذف الجلسة');
        logActivity(db, 'حذف جلسة', {
            entity_type: 'session', entity_id: sessionId, details: caseData.title || null,
            case_name: caseData.title || null, case_type: caseData.type || null,
            client_name: client?.full_name || null,
            userName: profile?.full_name || null,
        });
        fetchSessions();
    };

    const handleUpdateSession = async (sessionId, form) => {
        const session = sessions.find((s: any) => s.id === sessionId);
        const { success, conflict } = await safeUpdate(db, 'case_sessions', sessionId, {
            session_date: form.date,
            session_time: form.time_period || null,
            session_floor: form.location_floor || null,
            session_hall: form.location_hall || null,
            description: form.description || null,
            result: form.result || null,
            next_action: form.next_action || null,
        }, session?.updated_at || null);
        if (conflict) return;
        if (!success) { toast('❌ فشل تعديل بيانات الجلسة — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('✅ تم تعديل الجلسة');
        logActivity(db, 'تعديل جلسة', {
            entity_type: 'session', entity_id: sessionId, details: `${caseData.title} — ${form.date}`,
            case_name: caseData.title || null, case_type: caseData.type || null,
            client_name: client?.full_name || null,
            userName: profile?.full_name || null,
        });
        if(onNotify){
            let msg=`✏️ <b>تم تعديل جلسة</b>\n`;
            msg+=`━━━━━━━━━━━━━━━━━━━━\n`;
            msg+=`⚖️ <b>${escapeTelegramHtml(caseData.title||'—')}</b>\n`;
            msg+=`📋 رقم القيد: ${escapeTelegramHtml(caseData.number||'—')}\n`;
            msg+=`🏛 المحكمة: ${escapeTelegramHtml(caseData.court||'—')}\n`;
            msg+=`📆 <b>التاريخ الجديد:</b> ${escapeTelegramHtml(form.date)}`;
            if(form.time_period) msg+=` (${escapeTelegramHtml(form.time_period)})`;
            msg+=`\n`;
            if(form.description) msg+=`📝 ${escapeTelegramHtml(form.description)}\n`;
            onNotify(msg);
        }
        fetchSessions();
    };

    const handleChangeStatus = async (newStatus) => {
        setChangingStatus(true);
        setShowStatusPicker?.(false);
        const { success, conflict } = await safeUpdate(db, 'cases', caseData.id, { status: newStatus }, caseData.updated_at || null);
        setChangingStatus(false);
        if (conflict) return;
        if (!success) { toast('❌ فشل تغيير الحالة', true); return; }
        toast('✅ تم تحديث حالة القضية');
        logActivity(db, 'تغيير حالة قضية', {
            entity_type: 'case', entity_id: caseData.id, details: `${caseData.title} — ${newStatus}`,
            case_name: caseData.title || null, case_type: caseData.type || null,
            client_name: client?.full_name || null,
            userName: profile?.full_name || null,
        });
        onUpdate && onUpdate(newStatus);
    };


  return {
    sessions, setSessions, notes, setNotes, docs, setDocs,
    loadingSessions, showAddSession, setShowAddSession,
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
    exportingPdf, showWhatsApp, setShowWhatsApp, officeWhatsAppName, setOfficeWhatsAppName,
    confirmDeleteSession, setConfirmDeleteSession,
    confirmDeleteNote, setConfirmDeleteNote,
    confirmDeleteDoc, setConfirmDeleteDoc,
    fetchSessions, handleFileSelect, handleUploadDoc, handleDeleteDoc,
    handleExportPdf, handleAddSession, handleAddNote, handleDeleteNote,
    handleUpdateNote, handleDeleteSession, handleUpdateSession, handleChangeStatus,
  };
}
