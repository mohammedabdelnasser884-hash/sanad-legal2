import React, { useState } from 'react';
import { toast, logActivity } from '../../utils';
import { callAdminAction, db } from '../../supabaseClient';

export function useAdminUsers(fetchLawyers: () => void, profile?: any) {
  const _userName = profile?.full_name || null;
  const [editUser, setEditUser] = useState(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [changePassUser, setChangePassUser] = useState(null);
  const [confirmSignOut, setConfirmSignOut] = useState(null);
  const [confirmLock, setConfirmLock] = useState(null);
  const [securityMsg, setSecurityMsg] = useState(null);

  const handleEditUser = async (form) => {
    setSaving(true);
    const { error } = await db.from('profiles').update({
      full_name: form.full_name,
      role: form.role,
      is_active: form.is_active,
      permissions: form.permissions,
    }).eq('id', editUser.id);
    setSaving(false);
    if (error) { toast('❌ فشل الحفظ، يرجى المحاولة مرة أخرى', true); return; }
    toast('✅ تم تحديث بيانات المستخدم');
    logActivity(db, 'تعديل مستخدم', { userName: _userName, entity_type: 'user', entity_id: editUser.id, details: form.full_name || null });
    setEditUser(null);
    fetchLawyers();
  };

  // ── إضافة مستخدم جديد ──
  const handleAddUser = async (form) => {
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
      logActivity(db, 'إضافة مستخدم', { userName: _userName, entity_type: 'user', details: `${form.full_name} (${form.role || '—'})` });
      setShowAddUser(false);
      fetchLawyers();
    } catch (e) {
      toast('❌ فشل إنشاء الحساب، يرجى المحاولة مرة أخرى', true);
    }
    setSaving(false);
  };

  // ── حذف مستخدم ──
  const handleDeleteUser = async (user) => {
    setSaving(true);
    const { error } = await db.from('profiles').delete().eq('id', user.id);
    setSaving(false);
    if (error) { toast('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true); return; }
    toast('✅ تم حذف المستخدم');
    logActivity(db, 'حذف مستخدم', { userName: _userName, entity_type: 'user', entity_id: user.id, details: user.full_name || null });
    setConfirmDelete(null);
    fetchLawyers();
  };

  // ── تفعيل/تعطيل مستخدم سريع ──
  const toggleUserActive = async (user) => {
    const newState = user.is_active === false ? true : false;
    const { error } = await db.from('profiles').update({ is_active: newState }).eq('id', user.id);
    if (error) { toast('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true); return; }

    if (!newState && user.user_id) {
      try { await callAdminAction({ action: 'force_signout', user_id: user.user_id }); } catch(e) {}
    }

    toast(newState ? '✅ تم تفعيل الحساب' : '⚠️ تم تعطيل الحساب وإنهاء جلساته');
    logActivity(db, newState ? 'تفعيل مستخدم' : 'تعطيل مستخدم', { userName: _userName, entity_type: 'user', entity_id: user.id, details: user.full_name || null });
    fetchLawyers();
  };

  // ── تغيير كلمة مرور مستخدم (عبر Edge Function آمنة) ──
  const handleChangePassword = async ({ userId, newPassword, forceChange }) => {
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
  const handleSignOutAllDevices = async (user) => {
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
  const handleToggleLock = async (user) => {
    setSaving(true);
    const isLocked = user.is_locked === true;
    const { error } = await db.from('profiles').update({
      is_locked: !isLocked,
      failed_login_attempts: !isLocked ? user.failed_login_attempts : 0,
    }).eq('id', user.id);
    setSaving(false);
    if (error) { toast('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true); return; }
    toast(isLocked ? '🔓 تم فتح الحساب' : '🔒 تم قفل الحساب');
    logActivity(db, isLocked ? 'فتح حساب' : 'قفل حساب', { userName: _userName, entity_type: 'user', entity_id: user.id, details: user.full_name || null });
    setConfirmLock(null);
    fetchLawyers();
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
