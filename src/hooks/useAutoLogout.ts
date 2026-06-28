import React, { useEffect } from 'react';
import { db } from '../supabaseClient';
import { toast, logActivity } from '../utils';

export function useAutoLogout(
  profile: any,
  onLogout: () => void
) {
  useEffect(()=>{
    if(!profile) return;
    const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 دقيقة
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        logActivity(db, 'تسجيل خروج تلقائي', { entity_type: 'user', details: 'خروج تلقائي بعد 30 دقيقة عدم نشاط' });
        await db.auth.signOut();
        onLogout();
        toast('⏱ تم تسجيل الخروج تلقائياً بسبب عدم النشاط', true);
      }, IDLE_TIMEOUT);
    };
    const events = ['mousedown','mousemove','keydown','touchstart','scroll','click'];
    events.forEach(e => window.addEventListener(e, resetTimer, {passive:true}));
    resetTimer();
    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  },[profile, onLogout]);
}
