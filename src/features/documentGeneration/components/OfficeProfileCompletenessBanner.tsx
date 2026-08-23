// ══════════════════════════════════════════════════════════════════
// OfficeProfileCompletenessBanner.tsx — القسم 9.4 بند 4
//
// ⚠️ [قرار أثناء المرحلة 3] النص المرجعي في القسم 9.4 بيربط الرسالة
// بعمود "الختم/التوقيع" تحديدًا (القسم 1.1 بند 3)، لكن العمود ده لسه
// مش موجود فعليًا في office_settings — هيُضاف في المرحلة 5 (لسه ماتنفذتش،
// قاعدة "ممنوع تنفيذ مرحلتين في نفس الرد"). بدل ما نفترض اسم عمود
// لسه مش موجود (ممنوع بقاعدة #1)، البانر دلوقتي بيتحقق من الحقول
// الموجودة فعليًا في office_settings بس (الاسم/الشعار/الهاتف/البريد/العنوان
// — القسم 1.1 بند 3). لازم تحديث صريح هنا في المرحلة 5 لإضافة فحص
// الختم/التوقيع بمجرد ما اسم العمود يتأكد.
// ══════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { loadOfficeSetting } from '../../../constants';

interface OfficeProfileCompletenessBannerProps {
  onOpenSettings: () => void;
}

const CHECKED_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'office_name',    label: 'اسم المكتب' },
  { key: 'office_logo',    label: 'الشعار' },
  { key: 'office_phone',   label: 'الهاتف' },
  { key: 'office_email',   label: 'البريد الإلكتروني' },
  { key: 'office_address', label: 'العنوان' },
];

export default function OfficeProfileCompletenessBanner({ onOpenSettings }: OfficeProfileCompletenessBannerProps) {
  const [missingLabels, setMissingLabels] = useState<string[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const missing: string[] = [];
      for (const f of CHECKED_FIELDS) {
        const v = await loadOfficeSetting(f.key);
        if (!v) missing.push(f.label);
      }
      if (!cancelled) setMissingLabels(missing);
    })();
    return () => { cancelled = true; };
  }, []);

  if (dismissed || !missingLabels || missingLabels.length === 0) return null;

  return (
    <div data-testid="doc-gen-office-completeness-banner" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col gap-2">
      <span className="text-[10px] text-amber-300 font-bold">
        بيانات مكتبك غير مكتملة ({missingLabels.join('، ')} غير موجودة)
      </span>
      <div className="flex items-center gap-2">
        <button
          data-testid="doc-gen-office-completeness-fix-btn"
          onClick={onOpenSettings}
          className="px-3 py-1.5 rounded-lg text-[10px] font-black text-amber-300 border border-amber-500/30"
        >
          استكمال الآن
        </button>
        <button
          data-testid="doc-gen-office-completeness-skip-btn"
          onClick={() => setDismissed(true)}
          className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-500"
        >
          تخطي
        </button>
      </div>
    </div>
  );
}
