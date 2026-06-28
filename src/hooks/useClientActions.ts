import { toast, validateUploadFile, escapeTelegramHtml, safeUpdate, logActivity } from '../utils';
import { callAdminAction, db } from '../supabaseClient';

export function useClientActions(params: {
    sendTelegram: any;
    fetchClients: any;
    fetchLawyers: any;
    clients: any[];
    clientSearch: any;
    setClients: any;
    setSelectedClient: any;
    setDeleteConfirm: any;
    setSavingClient: any;
    setSavingLawyer: any;
    setShowClientModal: any;
    setShowLawyerModal: any;
    nav: any;
    profile?: any;
}) {
    const {
        sendTelegram, fetchClients, fetchLawyers, clients, clientSearch,
        setClients, setSelectedClient, setDeleteConfirm, setSavingClient,
        setSavingLawyer, setShowClientModal, setShowLawyerModal, nav, profile,
    } = params;
    const _userName = profile?.full_name || null;

    // ─ حفظ موكل ─
    const handleSaveClient = async (form: any, idFile: any, poaFile: any) => {
        setSavingClient(true);
        // رفع الصور على Storage (يحتاج نت — مش بنحفظه offline)
        let idUrl = null, poaUrl = null;
        if (navigator.onLine) {
            const uploadFile = async (file: any, prefix: string) => {
                // ⚠️ فحص نوع وحجم الملف قبل الرفع — راجع validateUploadFile في utils.ts.
                const validationError = validateUploadFile(file);
                if (validationError) { toast('❌ ' + validationError, true); return null; }
                const ext = file.name.split('.').pop();
                const path = `${prefix}_${Date.now()}.${ext}`;
                const { error } = await db.storage.from('client-docs').upload(path, file, { upsert: true });
                if (error) return null;
                const { data } = db.storage.from('client-docs').getPublicUrl(path);
                return data.publicUrl;
            };
            if (idFile) idUrl = await uploadFile(idFile, 'id');
            if (poaFile) poaUrl = await uploadFile(poaFile, 'poa');
        }

        const payload = {
            client_name: form.full_name,
            client_type: form.type || 'individual',
            phone: form.phone || null,
            email: form.email || null,
            notes: form.notes || null,
            national_id: form.national_id || null,
            cr_number: form.cr_number || null,
            contact_info: { id_url: idUrl, poa_url: poaUrl }
        };

        const { error, offline, queued } = await window.__dbWrite({
            type: 'INSERT', table: 'clients', data: payload
        });
        setSavingClient(false);

        if (offline && queued) {
            toast('📥 الموكل محفوظ محلياً — سيُضاف فور عودة الإنترنت');
            // إضافة مؤقتة في الـ state المحلي
            setClients((prev: any[]) => [{ ...payload, id: 'offline-' + Date.now(), full_name: form.full_name }, ...prev]);
        } else if (error) {
            toast('❌ فشل حفظ بيانات الموكل — تحقق من الاتصال وأعد المحاولة', true);
            return;
        } else {
            toast('✅ تم إضافة الموكل بنجاح!');
            logActivity(db, 'إضافة موكل', { userName: _userName, entity_type: 'client', details: form.full_name || null, client_name: form.full_name || null });
            // إشعار تليجرام - موكل جديد
            const typeLabel = form.type === 'company' ? 'شركة' : form.type === 'government' ? 'جهة حكومية' : 'فرد';
            let clientMsg = `👤 <b>موكل جديد تمت إضافته</b>\n`;
            clientMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
            clientMsg += `👤 <b>الاسم:</b> ${escapeTelegramHtml(form.full_name)}\n`;
            clientMsg += `🏷 <b>النوع:</b> ${typeLabel}\n`;
            if (form.phone) clientMsg += `📞 <b>الهاتف:</b> ${escapeTelegramHtml(form.phone)}\n`;
            if (form.email) clientMsg += `📧 <b>الإيميل:</b> ${escapeTelegramHtml(form.email)}\n`;
            if (form.national_id) clientMsg += `🪪 <b>الرقم القومي:</b> ${escapeTelegramHtml(form.national_id)}\n`;
            if (form.cr_number) clientMsg += `🏢 <b>السجل التجاري:</b> ${escapeTelegramHtml(form.cr_number)}\n`;
            if (form.notes) clientMsg += `📝 <b>ملاحظات:</b> ${escapeTelegramHtml(form.notes)}\n`;
            sendTelegram(clientMsg);
            fetchClients(0, clientSearch);
        }
        setShowClientModal(false);
    };

    // ─ حذف موكل — آمن ─
    const handleDeleteClient = async (clientId: any) => {
        const cl = clients.find((x: any) => x.id === clientId);
        setDeleteConfirm({
            type: 'client', id: clientId,
            name: cl?.full_name || 'الموكل',
            itemType: 'الموكل',
            title: 'حذف الموكل نهائياً',
            onConfirm: async () => {
                const { error } = await db.from('clients').delete().eq('id', clientId);
                nav.closeModal('delete'); setDeleteConfirm(null);
                if (error) { toast('❌ فشل حذف الموكل — تحقق من الاتصال وأعد المحاولة', true); return; }
                toast('🗑 تم حذف الموكل نهائياً');
                logActivity(db, 'حذف موكل', { userName: _userName, entity_type: 'client', entity_id: clientId, details: cl?.full_name || null, client_name: cl?.full_name || null });
                setSelectedClient(null);
                setClients((prev: any[]) => prev.filter((c: any) => c.id !== clientId));
            }
        });
    };

    // ─ تعديل موكل ─
    const handleUpdateClient = async (clientId: any, form: any, idFile?: any, poaFile?: any) => {
        const client = clients.find((c: any) => c.id === clientId);

        // رفع صور جديدة لو اتحددت
        const uploadFile = async (file: any, prefix: string) => {
            const validationError = validateUploadFile(file);
            if (validationError) { toast('❌ ' + validationError, true); return null; }
            const ext = file.name.split('.').pop();
            const path = `${prefix}_${Date.now()}.${ext}`;
            const { error } = await db.storage.from('client-docs').upload(path, file, { upsert: true });
            if (error) return null;
            const { data } = db.storage.from('client-docs').getPublicUrl(path);
            return data.publicUrl;
        };

        let idUrl  = client?.contact_info?.id_url  || null;
        let poaUrl = client?.contact_info?.poa_url || null;
        if (navigator.onLine) {
            if (idFile)  idUrl  = await uploadFile(idFile,  'id')  ?? idUrl;
            if (poaFile) poaUrl = await uploadFile(poaFile, 'poa') ?? poaUrl;
        }

        const { success, conflict } = await safeUpdate(db, 'clients', clientId, {
            client_name:  form.full_name,
            client_type:  form.type || 'individual',
            phone:        form.phone        || null,
            phone2:       form.phone2       || null,
            email:        form.email        || null,
            address:      form.address      || null,
            notes:        form.notes        || null,
            national_id:  form.national_id  || null,
            cr_number:    form.cr_number    || null,
            kin_name:     form.kin_name     || null,
            kin_phone:    form.kin_phone    || null,
            contact_info: { id_url: idUrl, poa_url: poaUrl },
        }, client?.updated_at || null);
        if (conflict) return;
        if (!success) { toast('❌ فشل تعديل بيانات الموكل — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('✅ تم تحديث بيانات الموكل');
        logActivity(db, 'تعديل موكل', { userName: _userName, entity_type: 'client', entity_id: clientId, details: form.full_name || null, client_name: form.full_name || null });
        fetchClients(0, clientSearch);
        nav.closeModal('clientDetail'); setSelectedClient(null);
    };

    // ─ إنشاء محامي جديد ─
    // إنشاء محامي جديد (عبر Edge Function — لا يؤثر على جلسة الأدمن الحالية)
    const handleSaveLawyer = async (form: any) => {
        setSavingLawyer(true);
        try {
            await callAdminAction({
                action: 'create_lawyer',
                email: form.email,
                password: form.password,
                full_name: form.full_name,
                role: form.role,
            });
            toast('✅ تم إنشاء حساب ' + form.full_name + ' بنجاح!');
            logActivity(db, 'إضافة مستخدم', { userName: _userName, entity_type: 'user', details: `${form.full_name} (${form.role || '—'})` });
            setShowLawyerModal(false); fetchLawyers();
        } catch (e) {
            toast('❌ فشل إنشاء حساب بوابة الموكل — تحقق من الاتصال وأعد المحاولة', true);
        }
        setSavingLawyer(false);
    };

    return { handleSaveClient, handleDeleteClient, handleUpdateClient, handleSaveLawyer };
}
