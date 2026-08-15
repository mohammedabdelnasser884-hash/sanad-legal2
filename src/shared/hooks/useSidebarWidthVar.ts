import { useEffect } from 'react';

// ─────────────────────────────────────────────────────────
//  useSidebarWidthVar — مرحلة B4.
//
//  بنفس مبدأ useNavbarHeightVar.ts (نشر حيّز مركزي كـCSS variable
//  بدل ما أي مكان تاني يفترض رقم ثابت)، لكن أبسط منه: عرض
//  DesktopSidebar (260px موسّع / 72px مطوي) قيمة معروفة مسبقًا من
//  الثوابت (EXPANDED_WIDTH/COLLAPSED_WIDTH في DesktopSidebar.tsx)،
//  مش محتاجة قياس فعلي بـgetBoundingClientRect زي ارتفاع الـnavbar
//  (اللي بيتغيّر حسب المحتوى/الشاشة). فالـhook هنا بياخد `widthPx`
//  جاهزة وبينشرها، بدل ما يقيس بنفسه.
//
//  ⚠️ الاستهلاك: `<main>` في App.tsx بيستخدم
//  `lg:ps-[var(--app-sidebar-w)]` (ps- مش pe- — راجع تصحيح RTL
//  الموثّق في تعليقات DesktopSidebar.tsx B2) عشان يحجز مساحة يمين
//  المحتوى تساوي عرض السايدبار الفعلي، بدل ما يفترض رقم ثابت.
//
//  ⚠️ الـcleanup: لما DesktopSidebar يتشال من الشجرة (رجوع لموبايل/
//  تابلت، AppShell بيوقف عرضه لو isDesktop بقت false)، بيرجّع المتغير
//  لـ0px عشان `<main>` ميفضلش شايل padding زيادة لسايدبار مش ظاهر —
//  حتى لو كلاس `lg:` نفسه مش هيتفعّل أصلاً تحت 1024px، ده تنظيف
//  احترازي (نفس مبدأ الـcleanup في useNavbarHeightVar.ts).
// ─────────────────────────────────────────────────────────
export function useSidebarWidthVar(widthPx: number) {
    useEffect(() => {
        document.documentElement.style.setProperty('--app-sidebar-w', `${widthPx}px`);
        return () => {
            document.documentElement.style.setProperty('--app-sidebar-w', '0px');
        };
    }, [widthPx]);
}
