import { useState, useEffect, useCallback } from 'react';
import { db } from '../../supabaseClient';
import { CURRENT_TERMS_VERSION } from './termsContent';
import type { ProfileRow } from '../../types';

// ══════════════════════════════════════════════════════════════════
//  useTermsAcceptance — بيتحقق هل المستخدم الحالي وافق على
//  CURRENT_TERMS_VERSION قبل كده ولا لأ، عن طريق قراءة terms_acceptances.
//  needsAcceptance:
//    null  → لسه بيتحقق (حالة تحميل)
//    true  → محتاج يوافق (لسه ماوفقش على النسخة الحالية)
//    false → موافق بالفعل، أو التحقق فشل وقررنا نسيبه يكمل (راجع catch)
// ══════════════════════════════════════════════════════════════════
export function useTermsAcceptance(profile: ProfileRow | null) {
  const [needsAcceptance, setNeedsAcceptance] = useState<boolean | null>(null);

  const check = useCallback(async () => {
    if (!profile?.user_id) { setNeedsAcceptance(false); return; }
    const { data, error } = await db
      .from('terms_acceptances')
      .select('id')
      .eq('user_id', profile.user_id)
      .eq('terms_version', CURRENT_TERMS_VERSION)
      .maybeSingle();
    if (error) {
      // ⚠️ قرار: لو التحقق فشل (مثلاً مشكلة شبكة/أوفلاين)، منمنعش المستخدم
      // من دخول التطبيق — نسيبه يكمل عادي بدل ما يتعلّق على شاشة الشروط
      // بسبب عطل مالوش علاقة بموافقته الفعلية. لو عايز سلوك مختلف (منع
      // الدخول لحد التأكد فعليًا)، قولي وأعدّلها.
      setNeedsAcceptance(false);
      return;
    }
    setNeedsAcceptance(!data);
  }, [profile?.user_id]);

  useEffect(() => { check(); }, [check]);

  const markAccepted = useCallback(() => setNeedsAcceptance(false), []);

  return { needsAcceptance, markAccepted };
}
