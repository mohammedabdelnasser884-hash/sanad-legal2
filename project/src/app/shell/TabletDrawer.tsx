import React, { useState, useEffect, useCallback } from 'react';
import { I } from '../../constants';
import type { TabName } from '../../useNavigation';
import { primaryNavItems, moreNavItems, desktopOnlyNavItems } from './navConfig';
import type { NavItem } from './navConfig';

// ─────────────────────────────────────────────────────────
//  TabletDrawer — مرحلة G1: تجربة تنقل مخصصة لوضع Tablet
//  (768px–1023px، `md:` بدون `lg:`) — بين شريط CommandDock السفلي
//  (موبايل) والسايدبار الثابت DesktopSidebar (ديسكتوب، B1/B2).
//
//  ⚠️ ليه Drawer مش سايدبار ثابت؟ طبقًا لاستراتيجية الـ Breakpoints
//  (قسم 2 من الخطة): "Tablet: Sidebar → Drawer، أعمدة أقل" — على
//  عرض تابلت، مفيش مساحة كافية لحجز 260px بشكل دائم بجانب المحتوى
//  زي الديسكتوب (كان هيضغط المحتوى بشكل غير مريح)، فبدل كده بيظهر
//  زرار عائم صغير بيفتح درج (Drawer) فوق المحتوى مؤقتًا، بدل ما ياخد
//  مساحة دائمة.
//
//  ⚠️ إعادة استخدام navConfig.ts (A2) بالحرف — نفس العناصر/الأيقونات/
//  الترتيب المستخدم في DesktopSidebar (B1) بالظبط، تقليل تكرار منطق
//  التنقل لمصدر واحد. الفرق الوحيد هنا: مفيش طي (Collapse) ولا
//  Tooltips — الدرج بيفتح بعرضه الكامل دايمًا لأنه عنصر مؤقت (overlay)
//  مش مساحة دائمة زي DesktopSidebar، فمفيش داعي لتوفير مساحة بالطي.
//
//  ⚠️ data-testid: `tablet-*` مستقل تمامًا عن `nav-*` (موبايل/
//  CommandDock) و`desktop-nav-*` (DesktopSidebar) — نفس مبدأ B1 بالظبط
//  (تفادي strict-mode violation لو أكتر من عنصر تنقل ظاهر في نفس
//  اللحظة على نفس الصفحة أثناء انتقال الفيوبورت بين النطاقات).
//
//  ⚠️ Mobile/Desktop Safety: صفر تغيير على CommandDock.tsx أو
//  AppHeader.tsx أو DesktopSidebar.tsx — الدرج ده إضافة مستقلة
//  بالكامل، بيتفعّل بس في AppShell.tsx لما `isTablet === true` (نطاق
//  768–1023px)، فمالوش أي تأثير على أي فيوبورت تاني (موبايل <768
//  أو ديسكتوب >=1024) ولا على أي اختبار E2E حالي (كلها بتشتغل على
//  `Desktop Chrome` >=1024px حيث `isTablet === false` دايمًا).
//  CommandDock بيفضل ظاهر كمان على التابلت (زي ما هو مقرر مؤجل
//  لحد G3 مع كل قرارات الإخفاء التانية) — الدرج ده إضافة بديل أسرع
//  للوصول لكل عناصر التنقل (بما فيها "المزيد"/`team` اللي مالهاش
//  زرار مباشر في CommandDock) من غير ما يشيل الشريط السفلي.
//
//  ⚠️ التموضع: زرار الفتح `fixed` تحت الهيدر مباشرة (`top:
//  calc(var(--app-header-h) + 12px)`) عشان يفضل بعيد تمامًا عن أزرار
//  AppHeader.tsx (بحث/تحديث/هامبرغر القائمة) بدل ما يتراكب فوقها —
//  AppHeader نفسه صفر تغيير. الجنب الفيزيائي المُختار: يسار (`left-3`)
//  — عكس مكان DesktopSidebar (يمين، قسم 7 من الخطة) عمدًا، عشان
//  المستخدم يتعوّد على نفس المكان الفيزيائي تقريبًا لو الشاشة كبرت
//  لاحقًا لديسكتوب (هيلاقي نفس المنطقة العامة فيها إجراءات تنقل).
//  اللوحة (Panel) نفسها بتنزلق من اليمين الفيزيائي (`right-0`) —
//  نفس جنب DesktopSidebar بالظبط، اتساق بصري لو المستخدم بيبدّل بين
//  المقاسين.
//
//  ⚠️ الأنيميشن: `translate-x-full`/`translate-x-0` + `transition-
//  transform` (كلاسات Tailwind بس) — بدل إضافة `@keyframes` جديدة في
//  index.css، تقليل نطاق اللمسة على ملفات مشتركة. اللوحة والخلفية
//  فضلين متصلين بالـDOM دايمًا (مش mount/unmount شرطي) عشان أنيميشن
//  الإغلاق (مش بس الفتح) يشتغل صح.
//
//  ⚡ مرحلة G2 (15 أغسطس 2026): A11y pass — زرار الفتح بقى بياخد
//  `aria-expanded`/`aria-controls="tablet-drawer-panel"` عشان يوضّح
//  حالة الدرج (مفتوح/مقفول) برمجيًا. اللوحة نفسها بقت `id="tablet-
//  drawer-panel"` + `role="navigation"` + `aria-label="قائمة التنقل"`
//  + `aria-hidden` بتتبدّل مع `open` (عشان قارئ الشاشة ميحاولش يقرا
//  محتوى لوحة متحركة برّه حدود الشاشة وقت الإغلاق — مفيش focus trap
//  فعلي هنا، ده تبسيط متعمّد لأن الدرج بيتقفل بالكامل بالـEscape
//  أصلاً وليه زرار إغلاق واضح، فمفيش حاجة تستدعي trap صارم زي مودال
//  حقيقي؛ استخدمت `role="navigation"` مش `role="dialog"` عمدًا عشان
//  مانضللش قارئ الشاشة بسيمانتيك "مودال" من غير ما يكون فيه focus
//  trap فعلي وراه). `TabletDrawerButton` بقى بياخد `aria-current=
//  "page"` على العنصر النشط (نص الزرار نفسه مرئي دايمًا هنا، عكس
//  DesktopSidebar وقت الطي، فمحتاجش `aria-label` إضافي). صفر تغيير
//  على أي منطق/state/data-testid موجود.
// ─────────────────────────────────────────────────────────

export interface TabletDrawerProps {
    tab: TabName;
    setTab: (tab: TabName) => void;
    isAdmin: boolean;
    /** نفس handleAIButtonClick الممرّرة لـDesktopSidebar وCommandDock. */
    onAIClick: (v: boolean) => void;
}

function TabletDrawerButton({
    item, active, onClick,
}: { item: NavItem; active: boolean; onClick: () => void }) {
    return React.createElement('button', {
        onClick,
        'data-testid': `tablet-nav-${item.tab}`,
        'aria-current': active ? 'page' : undefined,
        className: 'w-full h-12 rounded-xl flex items-center gap-3 px-4 transition-all active:scale-[0.98] text-sm font-bold',
        style: active
            ? { background: 'rgba(212,175,55,0.14)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.3)' }
            : { background: 'transparent', color: 'rgba(255,255,255,0.75)', border: '1px solid transparent' },
    },
        React.createElement(item.icon, { className: 'w-5 h-5 flex-shrink-0' }),
        React.createElement('span', { className: 'truncate' }, item.label)
    );
}

function TabletDrawer({ tab, setTab, isAdmin, onAIClick }: TabletDrawerProps) {
    const [open, setOpen] = useState(false);

    const close = useCallback(() => setOpen(false), []);

    // إغلاق بمفتاح Escape — نفس التوقع المعتاد لأي overlay/drawer.
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, close]);

    const visiblePrimary = primaryNavItems.filter((item) => !item.adminOnly || isAdmin);
    const visibleMore = moreNavItems.filter((item) => !item.adminOnly || isAdmin);
    const visibleDesktopOnly = desktopOnlyNavItems.filter((item) => !item.adminOnly || isAdmin);

    const selectTab = (t: TabName) => {
        setTab(t);
        close();
    };

    return React.createElement(React.Fragment, null,
        // ── زرار الفتح العائم ──
        React.createElement('button', {
            onClick: () => setOpen(true),
            'data-testid': 'tablet-drawer-toggle',
            'aria-label': 'فتح قائمة التنقل',
            'aria-expanded': open,
            'aria-controls': 'tablet-drawer-panel',
            className: 'hidden md:flex lg:hidden fixed z-[45] left-3 w-11 h-11 rounded-xl flex-col items-center justify-center gap-[5px] active:scale-95 transition-transform',
            style: {
                top: 'calc(var(--app-header-h, 56px) + 12px)',
                background: 'rgba(15,25,50,0.97)',
                border: '1px solid rgba(212,175,55,0.3)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            },
        },
            React.createElement('span', { className: 'block w-4 h-0.5 bg-premium-gold rounded-full' }),
            React.createElement('span', { className: 'block w-4 h-0.5 bg-premium-gold rounded-full' }),
            React.createElement('span', { className: 'block w-4 h-0.5 bg-premium-gold rounded-full' })
        ),

        // ── الخلفية (Backdrop) ──
        React.createElement('div', {
            onClick: close,
            'data-testid': 'tablet-drawer-overlay',
            'aria-hidden': !open,
            className: `hidden md:block lg:hidden fixed inset-0 z-[69] bg-black/70 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`,
        }),

        // ── اللوحة (Panel) — بتنزلق من اليمين الفيزيائي ──
        React.createElement('aside', {
            'data-testid': 'tablet-drawer-panel',
            id: 'tablet-drawer-panel',
            role: 'navigation',
            'aria-label': 'قائمة التنقل',
            'aria-hidden': !open,
            className: `hidden md:flex lg:hidden fixed top-0 bottom-0 right-0 z-[70] w-[280px] max-w-[85vw] flex-col px-3 py-4 gap-1 overflow-y-auto no-scrollbar transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`,
            style: {
                background: 'rgba(15,25,50,0.97)',
                backdropFilter: 'blur(28px) saturate(180%)',
                borderLeft: '1px solid rgba(212,175,55,0.18)',
            },
        },
            // زرار إغلاق أعلى اللوحة
            React.createElement('button', {
                onClick: close,
                'data-testid': 'tablet-drawer-close',
                'aria-label': 'إغلاق قائمة التنقل',
                className: 'w-full h-9 rounded-lg flex items-center justify-center mb-2 transition-all active:scale-[0.98]',
                style: { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' },
            }, React.createElement(I.X)),

            ...visiblePrimary.map((item) => React.createElement(TabletDrawerButton, {
                key: item.tab, item, active: tab === item.tab,
                onClick: () => selectTab(item.tab),
            })),

            // AI — نفس منطق DesktopSidebar/CommandDock بالظبط (مودال، مش تاب).
            React.createElement('button', {
                onClick: () => { onAIClick(true); close(); },
                'data-testid': 'tablet-nav-ai-center',
                className: 'w-full h-12 rounded-xl flex items-center gap-3 px-4 transition-all active:scale-[0.98] text-sm font-black',
                style: { background: 'linear-gradient(135deg,rgba(201,146,42,0.18),rgba(212,175,55,0.18))', color: '#E8C84A', border: '1px solid rgba(212,175,55,0.3)' },
            },
                React.createElement(I.AI, { cls: 'w-5 h-5 flex-shrink-0' }),
                React.createElement('span', null, 'المساعد الذكي')
            ),

            React.createElement('div', { className: 'h-px bg-white/10 my-1.5' }),

            ...visibleMore.map((item) => React.createElement(TabletDrawerButton, {
                key: item.tab, item, active: tab === item.tab,
                onClick: () => selectTab(item.tab),
            })),

            visibleDesktopOnly.length > 0 && React.createElement('div', { className: 'h-px bg-white/10 my-1.5' }),
            ...visibleDesktopOnly.map((item) => React.createElement(TabletDrawerButton, {
                key: item.tab, item, active: tab === item.tab,
                onClick: () => selectTab(item.tab),
            }))
        )
    );
}

export default TabletDrawer;
