import { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────
//  useSidebarCollapsed — مرحلة B2. نفس نمط useThemeMode.ts
//  (localStorage + state + effect) بالحرف — لا resize listener
//  ولا منطق زيادة، القيمة بتتقرأ مرة واحدة عند أول render وبعدين
//  بتتسجل في localStorage كل ما تتغير.
//
//  ⚠️ القرار المحسوم في قسم 14.3 من الخطة: الحالة الافتراضية أول
//  مرة (مفيش قيمة محفوظة قبل كده) = false (موسّعة/Expanded)، مش true.
// ─────────────────────────────────────────────────────────

const STORAGE_KEY = 'sanad_sidebar_collapsed';

export function useSidebarCollapsed() {
    const [collapsed, setCollapsed] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return saved === 'true';
        return false;
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, collapsed ? 'true' : 'false');
    }, [collapsed]);

    const toggleCollapsed = () => setCollapsed((p) => !p);

    return { collapsed, toggleCollapsed };
}
