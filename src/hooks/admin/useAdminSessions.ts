import React, { useState, useEffect, useCallback } from 'react';
import { toast, detectDevice, logActivity } from '../../utils';
import { callAdminAction, db } from '../../supabaseClient';

export function useAdminSessions(section: string | null, profile: any) {
  const _userName = profile?.full_name || null;
  const [activeSessions, setActiveSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [terminatingSession, setTerminatingSession] = useState(null);
  const [terminatingAll, setTerminatingAll] = useState(false);
  const [confirmTerminateAll, setConfirmTerminateAll] = useState(false);
  const [sessionsLastRefresh, setSessionsLastRefresh] = useState(null);
  const [sessionsAutoRefresh, setSessionsAutoRefresh] = useState(true);

  const fetchActiveSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      // نجيب كل المستخدمين من profiles مع آخر نشاطهم
      const { data: profiles } = await db.from('profiles').select('id,user_id,full_name,email,role,last_seen_at,last_seen_device,last_seen_browser,last_seen_ip,is_active').order('last_seen_at', { ascending: false });
      // نحوّل لـ sessions objects
      const now = Date.now();
      const H24 = 24 * 60 * 60 * 1000; // 24 ساعة بالميلي ثانية
      const sessions = (profiles || [])
        .filter(p => p.last_seen_at && (now - new Date(p.last_seen_at).getTime()) <= H24) // فقط آخر 24 ساعة
        .map(p => {
          const lastMs = new Date(p.last_seen_at).getTime();
          const diffMin = Math.round((now - lastMs) / 60000);
          const isOnline = diffMin < 5; // نعتبره أونلاين لو آخر نشاط أقل من 5 دقائق
          return {
            id: p.user_id || p.id,
            profileId: p.id,
            userId: p.user_id,
            name: p.full_name || '—',
            email: p.email || '',
            role: p.role || 'lawyer',
            device: p.last_seen_device || detectDevice(p.last_seen_browser || ''),
            browser: p.last_seen_browser || 'متصفح غير معروف',
            ip: p.last_seen_ip || '—',
            lastSeenAt: p.last_seen_at,
            diffMin,
            isOnline,
            isActive: p.is_active !== false,
          };
        });
      setActiveSessions(sessions);
      setSessionsLastRefresh(new Date());
    } catch(e) {
      console.error('fetchActiveSessions error', e);
    }
    setLoadingSessions(false);
  }, [db]);

  // ── إنهاء جلسة مستخدم بعينه (عبر Edge Function آمنة) ──
  const handleTerminateSession = async (sess) => {
    setTerminatingSession(sess.id);
    try {
      if (sess.userId) {
        await callAdminAction({ action: 'force_signout', user_id: sess.userId });
      }
      toast('✅ تم إنهاء جلسة ' + sess.name);
      logActivity(db, 'إنهاء جلسة مستخدم', { userName: _userName, entity_type: 'user', entity_id: sess.userId, details: sess.name });
      fetchActiveSessions();
    } catch(e) {
      toast('❌ فشل إنهاء الجلسة', true);
    }
    setTerminatingSession(null);
  };

  // ── إنهاء جميع الجلسات (ماعدا المدير الحالي) — عبر Edge Function آمنة ──
  const handleTerminateAllSessions = async () => {
    setTerminatingAll(true);
    let count = 0;
    let failed = 0;
    for (const sess of activeSessions) {
      if (sess.profileId === profile?.id) continue; // لا ننهي جلسة نفسنا
      if (!sess.userId) continue;
      try {
        await callAdminAction({ action: 'force_signout', user_id: sess.userId });
        count++;
      } catch(e) {
        failed++;
      }
    }
    setTerminatingAll(false);
    setConfirmTerminateAll(false);
    toast(failed > 0 ? `✅ تم إنهاء ${count} جلسة، فشل ${failed}` : `✅ تم إنهاء ${count} جلسة`);
    logActivity(db, 'إنهاء جميع الجلسات', { userName: _userName, entity_type: 'user', details: `${count} جلسة` });
    fetchActiveSessions();
  };

  // auto-refresh كل 30 ثانية لو القسم مفتوح
  useEffect(() => {
    if (section !== 'sessions' || !sessionsAutoRefresh) return;
    fetchActiveSessions();
    const interval = setInterval(fetchActiveSessions, 30000);
    return () => clearInterval(interval);
  }, [section, sessionsAutoRefresh]);

  return {
    activeSessions, loadingSessions,
    terminatingSession, terminatingAll, setTerminatingAll,
    confirmTerminateAll, setConfirmTerminateAll,
    sessionsLastRefresh, sessionsAutoRefresh, setSessionsAutoRefresh,
    fetchActiveSessions, handleTerminateSession, handleTerminateAllSessions
  };
}
