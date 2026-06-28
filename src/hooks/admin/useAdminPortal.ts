import React, { useState, useCallback } from 'react';
import { toast, logActivity } from '../../utils';
import { db } from '../../supabaseClient';

export function useAdminPortal(profile?: any) {
  const _userName = profile?.full_name || null;
  const [portalAccess, setPortalAccess] = useState([]);
  const [portalClient, setPortalClient] = useState(null);
  const [clientSearch, setClientSearch] = useState('');
  const [showAddPortalUser, setShowAddPortalUser] = useState(false);
  const [savingPortal, setSaving] = useState(false);

  const fetchPortalAccess = useCallback(async () => {
    const { data } = await db.from('client_portal_pins').select('*');
    if (data) setPortalAccess(data);
  }, []);

  // ── جلب إعدادات المكتب ──
  const handleSavePortal = async (data) => {
    setSaving(true);
    const { error } = await db.from('client_portal_pins').upsert([{
      client_id: data.client_id,
      pin: data.pin,
      is_active: data.is_active,
      client_name: data.client_name,
      email: data.email,
    }], { onConflict: 'client_id' });
    setSaving(false);
    if (error) { toast('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true); return; }
    toast('✅ تم حفظ إعدادات بوابة ' + data.client_name);
    logActivity(db, 'حفظ بوابة موكل', {
        userName: _userName,
        entity_type: 'portal', entity_id: data.client_id,
        details: `${data.client_name} — ${data.is_active ? 'مفعّلة' : 'معطّلة'}`,
        client_name: data.client_name || null,
    });
    setPortalClient(null);
    fetchPortalAccess();
  };


  return {
    portalAccess, portalClient, setPortalClient,
    clientSearch, setClientSearch,
    showAddPortalUser, setShowAddPortalUser,
    savingPortal,
    fetchPortalAccess, handleSavePortal
  };
}
