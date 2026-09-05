import React, { useState } from 'react';
import { toast } from '../../../../shared/lib/notifications';
import { logActivity, buildFieldDiff, buildAddSnapshot, buildDeleteSnapshot, type FieldDiffMap } from '../../../../shared/lib/dataAccess';
import { callAdminAction, db } from '../../../../supabaseClient';
import { showErrorToast } from '../../../../shared/lib/errorReporting';
import { recordSuccess } from '../../../../systemHealth';
import type { PermissionsMap } from '../../../../shared/lib/permissions';
import type { ProfileRow } from '../../../../types';

// فورم تعديل مستخدم — نفس الحقول اللي بيبعتها EditUserModal.tsx
export interface EditUserForm {
  full_name: string;
  role: string;
  is_active: boolean;
  permissions: PermissionsMap;
}

// فورم إضافة مستخدم جديد — نفس الحقول اللي بيبعتها UserFormModal.tsx
export interface AddUserForm {
  full_name: string;
  email: string;
  password: string;
  role: string;
  permissions: PermissionsMap;
}

// Payload تغيير كلمة السر — نفس الشكل اللي بيبعته ChangePasswordModal.tsx
export interface ChangePasswordPayload {
  userId: string;
  newPassword: string;
  forceChange: boolean;
}

export function useAdminUsers(fetchLawyers: () => void, profile?: ProfileRow | null) {
  const _userName = profile?.full_name || null;
  const [editUser, setEditUser] = useState<ProfileRow | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ProfileRow | null>(null);
  const [changePassUser, setChangePassUser] = useState<ProfileRow | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState<ProfileRow | null>(null);
  const [confirmLock, setConfirmLock] = useState<ProfileRow | null>(null);
  const [securityMsg, setSecurityMsg] = useState<string | null>(null);

  // ⚠️ FIX (بند 4 من تقرير مراجعة الصلاحيات، 16 أغسطس 2026): كان بيعمل
  // db.from('profiles').update() مباشرة من المتصفح، معتمد بالكامل على RLS
  // + trigger منع التصعيد الذاتي كخط دفاع وحيد وبدون تسجيل موحّد. دلوقتي
  // بيمر عبر admin-actions (action: update_profile) بنفس نمط create_lawyer/
  // delete_user — تحقق صريح من هوية المستدعي وعزل tenant، ومنع صريح لتعديل
  // الدور/الحالة/الصلاحيات على حساب المستدعي نفسه (راجع migration 03).
  const handleEditUser = async (form: EditUserForm) => {
    setSaving(true);
    try {
      await callAdminAction({
        action: 'update_profile',
        profile_id: editUser!.id,
        user_id: editUser!.user_id || null,
        full_name: form.full_name,
        role: form.role,
        is_active: form.is_active,
        permissions: form.permissions,
      });
      toast('✅ تم تحديث بيانات المستخدم');
      // ⚡ NEW (سجل النشاط — تتبع التغييرات، مرحلة 4، 19 أغسطس 2026):
      // editUser هو ProfileRow خام محفوظ في الـstate من وقت فتح مودال
      // التعديل (قبل أي تغيير) — مقارنته مباشرة مع form آمنة. الصلاحيات
      // (permissions) JSON معقّد، فبنكتفي بعلم بسيط "اتغيرت" من غير تفصيل
      // كل صلاحية فرعية (تعقيد إضافي، مؤجل لمرحلة لاحقة لو احتجنا).
      const userFieldDiffMap: FieldDiffMap = {
        full_name: { label: 'الاسم' },
        role: { label: 'الدور' },
      };
      const userChanges = buildFieldDiff(
        editUser as unknown as Record<string, unknown>,
        { full_name: form.full_name, role: form.role } as Record<string, unknown>,
        userFieldDiffMap
      );
      const oldActive = editUser?.is_active !== false; // نفس المنطق المستخدم في toggleUserActive تحت
      if (oldActive !== form.is_active) {
        userChanges.push({ field: 'is_active', label: 'الحالة', old: oldActive ? 'مفعّل' : 'معطّل', new: form.is_active ? 'مفعّل' : 'معطّل' });
      }
      if (JSON.stringify(editUser?.permissions || {}) !== JSON.stringify(form.permissions || {})) {
        userChanges.push({ field: 'permissions', label: 'الصلاحيات', old: 'قديمة', new: 'محدّثة' });
      }
      logActivity(db, 'تعديل مستخدم', {
        userName: _userName, entity_type: 'user', entity_id: editUser!.id,
        details: form.full_name || null, changes: userChanges,
      });
      setEditUser(null);
      fetchLawyers();
      recordSuccess('admin_update_profile');
    } catch (e) {
      showErrorToast('admin_update_profile', e, 'تعذّر حفظ التعديلات. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'تعديل مستخدم');
    }
    setSaving(false);
  };

  // ── إضافة مستخدم جديد ──
  const handleAddUser = async (form: AddUserForm) => {
    setSaving(true);
    try {
      await callAdminAction({
        action: 'create_lawyer',
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        role: form.role,
        permissions: form.permissions,
      });
      toast('✅ تم إنشاء حساب ' + form.full_name);
      // ⚡ NEW (سجل النشاط — تغطية كاملة، 30 أغسطس 2026): تسجيل كل الحقول
      // اللي دخلها المستخدم وقت إنشاء الحساب، مش الاسم والدور بس.
      logActivity(db, 'إضافة مستخدم', {
        userName: _userName, entity_type: 'user', details: `${form.full_name} (${form.role || '—'})`,
        changes: buildAddSnapshot(form as unknown as Record<string, unknown>, {
          full_name: { label: 'الاسم' },
          email: { label: 'البريد الإلكتروني' },
          role: { label: 'الدور' },
        }),
      });
      setShowAddUser(false);
      fetchLawyers();
      recordSuccess('admin_create_user');
    } catch (e) {
      showErrorToast('admin_create_user', e, 'تعذّر إنشاء الحساب. تأكد من صحة البيانات وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'إنشاء مستخدم');
    }
    setSaving(false);
  };

  // ── حذف مستخدم ──
  // ⚠️ FIX: كان بيحذف صف profiles بس (db.from('profiles').delete()) وبيسيب
  // حساب auth.users معلّق ببيانات دخول شغالة. دلوقتي بيستدعي admin-actions
  // (action: delete_user) اللي بيحذف حساب Auth أولاً وبعدين صف البروفايل.
  const handleDeleteUser = async (user: ProfileRow) => {
    setSaving(true);
    try {
      await callAdminAction({
        action: 'delete_user',
        profile_id: user.id,
        user_id: user.user_id || null,
      });
      toast('✅ تم حذف المستخدم');
      logActivity(db, 'حذف مستخدم', {
        userName: _userName, entity_type: 'user', entity_id: user.id, details: user.full_name || null,
        changes: buildDeleteSnapshot(user as unknown as Record<string, unknown>, {
          full_name: { label: 'الاسم' },
          email: { label: 'البريد الإلكتروني' },
          role: { label: 'الدور' },
        }),
      });
      setConfirmDelete(null);
      fetchLawyers();
      recordSuccess('admin_delete_user');
    } catch (e) {
      // 🩺 TEMP DEBUG (30 يوليو 2026) — showErrorToast بتعرض رسالة عامة قصدًا
      // للمستخدم، فمخفية السبب الحقيقي حتى في لوجز CI النصية. السطر ده مؤقت
      // بس عشان نلقط رسالة admin-actions الحقيقية من نص console (رخيص —
      // مفيش داعي لـtrace.zip/screenshots). ينشال بعد ما نوصل للسبب الجذري.
      console.error('[DEBUG admin_delete_user]', e instanceof Error ? e.message : String(e));
      showErrorToast('admin_delete_user', e, 'تعذّر حذف المستخدم. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'حذف مستخدم');
    }
    setSaving(false);
  };

  // ── تفعيل/تعطيل مستخدم سريع ──
  // ⚠️ FIX (بند 4): بيمر دلوقتي عبر admin-actions (action: update_profile)
  // بدل db.from('profiles').update() المباشر — نفس سبب handleEditUser فوق.
  const toggleUserActive = async (user: ProfileRow) => {
    const newState = user.is_active === false ? true : false;
    try {
      await callAdminAction({
        action: 'update_profile',
        profile_id: user.id,
        user_id: user.user_id || null,
        is_active: newState,
      });
      recordSuccess('admin_update_profile');
    } catch (e) {
      showErrorToast('admin_update_profile', e, 'تعذّر تنفيذ العملية. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'تفعيل/تعطيل مستخدم');
      return;
    }

    let signoutFailed = false;
    if (!newState && user.user_id) {
      try {
        await callAdminAction({ action: 'force_signout', user_id: user.user_id });
      } catch (e) {
        // ⚠️ FIX: كان الكود بيبلع الخطأ بصمت وبيدّي رسالة نجاح مطلقة
        // ("تم تعطيل الحساب وإنهاء جلساته") حتى لو فشل إنهاء الجلسات
        // فعليًا. دلوقتي بنسجّل الخطأ ونوضّح للأدمن إن الحساب اتعطّل
        // بس الجلسات الحالية ممكن تكون لسه شغالة.
        console.error('[AdminUsers] فشل إنهاء جلسات المستخدم:', (e as Error)?.message || e);
        signoutFailed = true;
      }
    }

    toast(newState
      ? '✅ تم تفعيل الحساب'
      : (signoutFailed ? '⚠️ تم تعطيل الحساب، لكن تعذر إنهاء جلساته الحالية' : '⚠️ تم تعطيل الحساب وإنهاء جلساته')
    );
    logActivity(db, newState ? 'تفعيل مستخدم' : 'تعطيل مستخدم', { userName: _userName, entity_type: 'user', entity_id: user.id, details: user.full_name || null });
    fetchLawyers();
  };

  // ── تغيير كلمة مرور مستخدم (عبر Edge Function آمنة) ──
  const handleChangePassword = async ({ userId, newPassword, forceChange }: ChangePasswordPayload) => {
    setSaving(true);
    try {
      await callAdminAction({
        action: 'change_password',
        user_id: userId,
        new_password: newPassword,
        force_change: forceChange,
      });
      toast('✅ تم تحديث كلمة المرور بنجاح');
      logActivity(db, 'تغيير كلمة مرور مستخدم', { userName: _userName, entity_type: 'user', entity_id: userId });
      setChangePassUser(null);
    } catch(e) {
      toast('❌ فشل تحديث كلمة المرور', true);
    }
    setSaving(false);
  };

  // ── تسجيل خروج من جميع الأجهزة (عبر Edge Function آمنة) ──
  const handleSignOutAllDevices = async (user: ProfileRow) => {
    setSaving(true);
    try {
      await callAdminAction({
        action: 'force_signout',
        user_id: user.user_id || user.id,
      });
      toast('✅ تم تسجيل خروج '+user.full_name+' من جميع الأجهزة');
      logActivity(db, 'تسجيل خروج قسري', { userName: _userName, entity_type: 'user', entity_id: user.user_id || user.id, details: user.full_name || null });
      setConfirmSignOut(null);
    } catch(e) {
      toast('❌ فشل تسجيل الخروج', true);
    }
    setSaving(false);
  };

  // ── قفل/فتح الحساب بعد محاولات فاشلة ──
  // ⚠️ FIX (بند 4): بيمر دلوقتي عبر admin-actions (action: toggle_lock)
  // بدل db.from('profiles').update() المباشر — نفس سبب handleEditUser فوق.
  const handleToggleLock = async (user: ProfileRow) => {
    setSaving(true);
    const isLocked = user.is_locked === true;
    try {
      await callAdminAction({
        action: 'toggle_lock',
        profile_id: user.id,
        user_id: user.user_id || null,
        is_locked: !isLocked,
      });
      toast(isLocked ? '🔓 تم فتح الحساب' : '🔒 تم قفل الحساب');
      logActivity(db, isLocked ? 'فتح حساب' : 'قفل حساب', { userName: _userName, entity_type: 'user', entity_id: user.id, details: user.full_name || null });
      setConfirmLock(null);
      fetchLawyers();
      recordSuccess('admin_toggle_lock');
    } catch (e) {
      showErrorToast('admin_toggle_lock', e, 'تعذّر تنفيذ العملية. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'قفل/فتح حساب');
    }
    setSaving(false);
  };

  return {
    editUser, setEditUser,
    showAddUser, setShowAddUser,
    saving,
    confirmDelete, setConfirmDelete,
    changePassUser, setChangePassUser,
    confirmSignOut, setConfirmSignOut,
    confirmLock, setConfirmLock,
    securityMsg, setSecurityMsg,
    handleEditUser, handleAddUser, handleDeleteUser,
    toggleUserActive, handleChangePassword,
    handleSignOutAllDevices, handleToggleLock
  };
}
