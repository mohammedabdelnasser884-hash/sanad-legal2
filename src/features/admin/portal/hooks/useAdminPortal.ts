import React, { useState, useCallback } from 'react';
import { toast } from '../../../../shared/lib/notifications';
import { logActivity } from '../../../../shared/lib/dataAccess';
import { db } from '../../../../supabaseClient';
import { recordSuccess } from '../../../../systemHealth';
import { showErrorToast } from '../../../../shared/lib/errorReporting';
import type { ProfileRow, ClientRow } from '../../../../types';

// شكل الصف الفعلي اللي بيترجع من select('client_id,is_active,client_name,email')
// على جدول client_portal_pins — عمدًا من غير pin/pin_hash (مش متجابين أصلاً).
export type PortalAccessRow = {
  client_id: string | null;
  is_active: boolean | null;
  client_name: string | null;
  email: string | null;
};

// شكل البيانات الفعلي اللي بتبعته AddPortalUserModal.tsx / ClientPortalModal.tsx لـ onSave
export interface PortalSaveForm {
  client_id: string;
  pin: string;
  is_active: boolean;
  client_name: string;
  email: string | null;
}

export function useAdminPortal(profile?: ProfileRow | null) {
  const _userName = profile?.full_name || null;
  const [portalAccess, setPortalAccess] = useState<PortalAccessRow[]>([]);
  const [portalClient, setPortalClient] = useState<ClientRow | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [showAddPortalUser, setShowAddPortalUser] = useState(false);
  const [savingPortal, setSaving] = useState(false);

  const fetchPortalAccess = useCallback(async () => {
    // ملحوظة: لا نجيب pin ولا pin_hash هنا — الـ PIN مخزّن مُشفّر (hash)
    // ومفيش داعي نعرضه أصلاً، اللوحة بس بتحتاج تعرف مفعّل ولا لأ.
    const { data } = await db.from('client_portal_pins').select('client_id,is_active,client_name,email');
    if (data) setPortalAccess(data);
  }, []);

  // ── جلب إعدادات المكتب ──
  // الـ PIN بيتشفّر (hash) جوه قاعدة البيانات عن طريق set_portal_pin()
  // بدل ما يتخزن كنص صريح من المتصفح مباشرة.
  const handleSavePortal = async (data: PortalSaveForm) => {
    setSaving(true);
    const { error } = await db.rpc('set_portal_pin', {
      p_client_id: data.client_id,
      p_pin: data.pin,
      p_is_active: data.is_active,
      p_client_name: data.client_name,
      p_email: data.email,
    });
    setSaving(false);
    if (error) {
      // 🐛 FIX (٦ سبتمبر ٢٠٢٦ — تحقيق فشل e2e/admin-portal.spec.ts فى CI):
      // كان الكود هنا بيبلع الخطأ الحقيقي بالكامل — مفيش console.error
      // ولا أي تسجيل فى systemHealth — فأي فشل لـset_portal_pin كان بيظهر
      // للمستخدم/فى لوجات الـCI كتوست عام "❌ حدث خطأ" من غير أي أثر
      // تشخيصي يوضح السبب الحقيقي (مثلًا: فشل تحقق الصلاحية جوه الدالة
      // "غير مصرح بتعديل بوابة عميل خارج مكتبك"، أو أي سبب تاني).
      //
      // 🆕 FIX (٩ سبتمبر ٢٠٢٦ — تحقيق B3/B6 فى تقرير المرحلة 15): نفس
      // نمط handleSaveCase/handleRestoreCase فى useCaseCrudActions.ts —
      // استخدام showErrorToast (بدل recordWriteFailure + toast يدوي)
      // بيخلي حد بوابة الموكل (P0001) وقفل read-only (E2) يظهروا
      // برسالتهم الحقيقية (مودال مخصص دلوقتي، مش توست عام) بدل
      // "❌ حدث خطأ" الثابتة اللي كانت بتضيّع الرسالتين دول تمامًا.
      showErrorToast('portal_write', error, 'حدث خطأ، يرجى المحاولة مرة أخرى', 'حفظ بوابة الموكل');
      return;
    }
    recordSuccess('portal_write');
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
