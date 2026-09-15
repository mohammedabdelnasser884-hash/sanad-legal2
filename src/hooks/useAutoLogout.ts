import React, { useEffect } from 'react';
import { db } from '../supabaseClient';
import { toast } from '../shared/lib/notifications';
import { logActivity } from '../shared/lib/dataAccess';
import type { ProfileRow } from '../types';

// ══════════════════════════════════════════════════════════════
//  🔒 FIX (خطة قفل الشاشة بدل تسجيل الخروج التلقائي، 15 سبتمبر 2026):
//  كان بيعمل db.auth.signOut() حقيقي بعد 30 دقيقة عدم نشاط، وده كان
//  بيسيب المستخدم عالق لو كان أوف لاين وقتها — تسجيل الدخول تاني
//  محتاج نت (office-login إيدج فانكشن)، فيتقفل بره النظام لحد ما
//  يرجع أونلاين. الحل: بدل تسجيل الخروج الحقيقي، بننادي onLock —
//  App.tsx بيعرض LockScreen (تحقق محلي بالكامل، lib/localAuthLock.ts)
//  بدل التطبيق، والـsession الحقيقي فاضل زي ما هو محفوظ. onLogout
//  القديم فضل موجود بس مش بينادى من هنا تاني — زر "تسجيل خروج" جوه
//  LockScreen نفسه بينادي handleLogout الحقيقي من App.tsx مباشرة.
// ══════════════════════════════════════════════════════════════
export function useAutoLogout(
  profile: ProfileRow | null,
  onLock: () => void
) {
  useEffect(()=>{
    if(!profile) return;
    const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 دقيقة
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // logActivity بتبلع أخطاءها داخليًا (راجع dataAccess.ts) — آمنة
        // تتنادى حتى وهو أوف لاين، هتفشل بصمت وتتسجل في console بس.
        logActivity(db, 'قفل تلقائي', { entity_type: 'user', details: 'قفل الشاشة تلقائيًا بعد 30 دقيقة عدم نشاط' });
        onLock();
        toast('🔒 اتقفلت الشاشة بسبب عدم النشاط — ادخل كلمة السر للمتابعة', true);
      }, IDLE_TIMEOUT);
    };
    const events: string[] = ['mousedown','mousemove','keydown','touchstart','scroll','click'];
    events.forEach((e: string) => window.addEventListener(e, resetTimer, {passive:true}));
    resetTimer();
    return () => {
      clearTimeout(timer);
      events.forEach((e: string) => window.removeEventListener(e, resetTimer));
    };
  },[profile, onLock]);
}
