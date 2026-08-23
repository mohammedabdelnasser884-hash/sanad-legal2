import { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────
//  useResponsiveLayout — Hook وحيد وخفيف لتحديد نوع الشاشة الحالي
//  (mobile / tablet / desktop) عشان Desktop Shell الجديد (AppShell,
//  DesktopSidebar, DesktopHeader) يقدر يقرر يعرض إيه من غير ما يلمس
//  أي شاشة تانية في المشروع.
//
//  ⚠️ بنمط useThemeMode.ts بالظبط: state + useEffect بسيط، بدون أي
//  تعقيد زيادة.
//
//  ⚠️ ليه matchMedia مش resize listener يدوي:
//  الـ MediaQueryList نفسه بيبعت 'change' event بس لما الشرط
//  (min-width) يتغيّر فعليًا من true لـ false أو العكس — يعني الـ
//  state بيتحدث مرة واحدة بس عند عبور نقطة التحويل (768px / 1024px)،
//  مش مع كل بكسل تغيّر أثناء سحب حجم الشاشة زي ما كان هيحصل مع
//  'resize' listener عادي. ده أخف على الأداء وبيمنع re-render زيادة
//  (مطابق لملاحظة الأداء في خطة التنفيذ، بند 21).
//
//  ⚠️ Breakpoints: نفس Tailwind الافتراضية المستخدمة بالفعل في
//  الخطة (md=768، lg=1024) — بدون اختراع نظام جديد.
//
//  ⚠️ SSR: مش موجود أصلاً في المشروع (Vite SPA)، فمفيش مشكلة
//  الوصول لـ window وقت أول render.
//
//  ⚠️ الاستخدام: مكان واحد بس — AppShell.tsx (مرحلة A3/A4) — عشان
//  نتجنب "JS-per-component" غير ضروري ونسيب باقي الشاشات على CSS
//  media queries (lg: classes) عادية.
// ─────────────────────────────────────────────────────────

export type LayoutMode = 'mobile' | 'tablet' | 'desktop';

const TABLET_QUERY = '(min-width: 768px)';
const DESKTOP_QUERY = '(min-width: 1024px)';

function computeMode(isTabletUp: boolean, isDesktopUp: boolean): LayoutMode {
    if (isDesktopUp) return 'desktop';
    if (isTabletUp) return 'tablet';
    return 'mobile';
}

export function useResponsiveLayout(): { mode: LayoutMode; isDesktop: boolean; isTablet: boolean; isMobile: boolean } {
    const [mode, setMode] = useState<LayoutMode>(() => {
        // لو matchMedia مش متاح لأي سبب (بيئة غير متوقعة)، الافتراضي mobile
        // — أكثر وضع آمن لأنه الأصل اللي كل الشاشات مبنية عليه فعليًا.
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return 'mobile';
        }
        const isTabletUp = window.matchMedia(TABLET_QUERY).matches;
        const isDesktopUp = window.matchMedia(DESKTOP_QUERY).matches;
        return computeMode(isTabletUp, isDesktopUp);
    });

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

        const tabletMql = window.matchMedia(TABLET_QUERY);
        const desktopMql = window.matchMedia(DESKTOP_QUERY);

        const publish = () => {
            setMode((prev) => {
                const next = computeMode(tabletMql.matches, desktopMql.matches);
                // تحديث الـ state بس لو الوضع اتغيّر فعليًا — يمنع re-render
                // زيادة لو نفس القيمة اتنادى عليها أكتر من مرة.
                return next === prev ? prev : next;
            });
        };

        // نشر القيمة الحالية فورًا (تحسبًا لأي تغيير حصل بين أول render
        // واستدعاء الـ effect ده).
        publish();

        tabletMql.addEventListener('change', publish);
        desktopMql.addEventListener('change', publish);

        return () => {
            tabletMql.removeEventListener('change', publish);
            desktopMql.removeEventListener('change', publish);
        };
    }, []);

    return {
        mode,
        isDesktop: mode === 'desktop',
        isTablet: mode === 'tablet',
        isMobile: mode === 'mobile',
    };
}
