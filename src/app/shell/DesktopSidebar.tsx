import React from 'react';
import { I } from '../../constants';
import type { TabName } from '../../useNavigation';
import { primaryNavItems, moreNavItems, desktopOnlyNavItems } from './navConfig';
import type { NavItem } from './navConfig';
import { useSidebarCollapsed } from '../../shared/hooks/useSidebarCollapsed';
import { useSidebarWidthVar } from '../../shared/hooks/useSidebarWidthVar';

// ─────────────────────────────────────────────────────────
//  DesktopSidebar — مرحلة B1: السايدبار في وضعه الموسّع بس
//  (260px)، بدون طي، بدون tooltips. الهدف إثبات إن الـ layout
//  والـ navigation شغالين صح الأول قبل ما نضيف الطي (B2).
//
//  ⚡ مرحلة B2 (14 أغسطس 2026): أضفت الطي الفعلي —
//  useSidebarCollapsed (localStorage key `sanad_sidebar_collapsed`،
//  نفس نمط useThemeMode.ts، افتراضي false/موسّعة حسب قرار قسم 14.3)
//  + زرار طي أعلى السايدبار + Tooltips لما يكون مطوي (كل زرار بيبقى
//  أيقونة بس 72px، والاسم بيظهر كـtooltip عند الـhover بدل الـlabel
//  الجنبي). صفر تغيير على منطق B1 (navConfig/AI button/CommandDock
//  Mobile Safety notes) — كلها لسه زي ما هي بالحرف تحت.
//
//  ⚠️ Mobile Safety: صفر تغيير على CommandDock.tsx — الكومبوننت ده
//  بيتضاف *جنب* الشريط السفلي مش بدله. سبب مهم لتأجيل إخفاء
//  CommandDock على الديسكتوب (بند 12.2 من الخطة): playwright.config.ts
//  بيشغّل الاختبارات الـ31 على `devices['Desktop Chrome']` (فيوبورت
//  ≥1024px، يعني `isDesktop` صح فعليًا وقت التستات)، ومفيش مشروع
//  Playwright بفيوبورت موبايل لحد مرحلة G3. لو خفينا CommandDock دلوقتي
//  هتفشل كل الاختبارات الحالية فورًا لأنها بتدوّر على
//  `nav-dashboard`/`nav-cases`/... جوه CommandDock. الإخفاء الفعلي
//  (`!isDesktop`) مؤجل لحد ما يبقى فيه تغطية Playwright بفيوبورت موبايل
//  (G3) تضمن استمرار اختبار الشريط السفلي بعد إخفاءه على الديسكتوب.
//
//  ⚠️ data-testid: كل زرار هنا بياخد `desktop-nav-*` مستقل (مش
//  `item.testId` بتاع navConfig اللي هو الـid الأصلي بتاع CommandDock/
//  الموبايل) — عشان في نفس اللحظة اللي الاتنين ظاهرين فيها (فيوبورت
//  Desktop Chrome)، مايبقاش فيه عنصرين بنفس الـdata-testid على نفس
//  الصفحة. زرار الطي نفسه data-testid="desktop-sidebar-toggle" (جديد،
//  مفيهوش أي تعارض مع أي id موبايل موجود).
//
//  ⚠️ التموضع: `fixed ... right-0` (فيزيائي، مش `end-0` منطقي) —
//  اخترت القيمة الفيزيائية عمدًا هنا عشان أضمن إن السايدبار يفضل على
//  يمين الشاشة زي ما هو محسوم في قسم 7 من الخطة ("Sidebar (يمين،
//  RTL)")، بغض النظر عن ترتيب الـDOM جوه أي flex container أبوه.
//  الـTooltips (جديد في B2) بتتحط بـstyle.right فيزيائي كمان (مش
//  className منطقي) لنفس السبب — `right: 100%` بيحطها فعليًا على يسار
//  الزرار البصري بغض النظر عن `dir="rtl"` لأن خاصية CSS `right` فيزيائية
//  دايمًا في inline style (مش logical property).
//  ⚠️ ملاحظة لازم تتاخد في الاعتبار وقت B4: مع `dir="rtl"` (index.html)،
//  `padding-inline-end` (`pe-`) بتترجم لـ`padding-left` فعليًا، مش
//  `padding-right`. يعني لو `<main>` هيحجز مساحة لسايدبار على
//  *يمينه* الفيزيائي (زي هنا)، الكلاس الصح هو `ps-` (padding-inline-
//  start ⇒ padding-right في RTL) مش `pe-` زي ما مكتوب في نص الخطة
//  الحالي (قسم 7) — علّمتها هنا كتصحيح مطلوب وقت تنفيذ B4 نفسها.
//  ⚠️ عرض السايدبار (260px موسّع / 72px مطوي) **لسه مش منشور** كـ
//  CSS variable (`--app-sidebar-w`) — النشر ده مؤجل عمدًا لـB4 زي ما
//  محدد في جدول 0.1 وقسم 14.4 ("B4 لازم قبل C1 عشان ينشر المتغير").
//  دلوقتي B2 بيغيّر عرض السايدبار نفسه بس، من غير ما يأثر على `<main>`.
//
//  ⚡ مرحلة B4 (14 أغسطس 2026): نشرت `--app-sidebar-w` فعليًا عبر
//  useSidebarWidthVar (hook جديد بنفس مبدأ useNavbarHeightVar.ts) —
//  بتتحدث تلقائيًا كل ما `collapsed` يتغيّر (260px ↔ 72px)، و`<main>`
//  في App.tsx بقى بيستخدمها فعليًا (`lg:ps-[var(--app-sidebar-w)]`)
//  عشان المحتوى ميتخبيش تحت السايدبار على الديسكتوب. صفر تغيير على
//  أي منطق تاني هنا (navConfig/AI button/الطي نفسه/CommandDock Mobile
//  Safety notes) — كلها لسه زي ما هي بالحرف.
//
//  ⚡ مرحلة G2 (15 أغسطس 2026): A11y pass — أضفت `role="navigation"` +
//  `aria-label="التنقل الرئيسي"` على الـ`<aside>` الجذري (كان بدون أي
//  دور دلالي صريح)، و`id="desktop-sidebar-nav"` عشان زرار الطي يقدر
//  يربطها بـ`aria-controls`. كل `SidebarButton` بقى بياخد `aria-label`
//  (نفس `item.label` النصي) **دايمًا** — مش بس وقت الطي — عشان الاسم
//  الإمكاني (accessible name) يفضل ثابت بغض النظر عن حالة الطي: قبل
//  كده وقت الطي (B2) النص المرئي بيتخفي فيزيائيًا فمكنش فيه أي بديل
//  نصي إمكاني (الـTooltip البصري `group-hover` مش مقروء لقارئ الشاشة
//  أصلاً)، + `aria-current="page"` على العنصر النشط حاليًا (نفس مبدأ
//  التنقل القياسي). زرار الطي بقى بياخد `aria-expanded`/`aria-controls`
//  (بالإضافة لـ`aria-label` الموجود من B2) عشان يوضّح حالة السايدبار
//  الحالية برمجيًا مش بس بصريًا. زرار الـAI بقى بياخد `aria-label=
//  "المساعد الذكي"` (نفس منطق SidebarButton). صفر تغيير على أي منطق/
//  state/data-testid موجود — إضافة سمات aria بس.
// ─────────────────────────────────────────────────────────

const EXPANDED_WIDTH = 260;
const COLLAPSED_WIDTH = 72;

export interface DesktopSidebarProps {
    tab: TabName;
    setTab: (tab: TabName) => void;
    isAdmin: boolean;
    /** ⚡ NEW (سجل قرارات تقرير المستندات القانونية، بند 6 — 26 أغسطس
     *  2026): checkPermission(profile, 'can_generate_documents') من
     *  App.tsx — بيتحكم في ظهور عنصر "المستندات القانونية" بس (نفس
     *  نمط isAdmin مع 'fees'/'admin'). */
    canGenerateDocuments: boolean;
    /** نفس handleAIButtonClick الممرّرة لـCommandDock — بتتولى منطق
     *  قفل القسم لغير السوبر أدمن بنفسها، السايدبار مش محتاج يعرف التفاصيل. */
    onAIClick: (v: boolean) => void;
}

function SidebarButton({
    item, active, collapsed, onClick,
}: { item: NavItem; active: boolean; collapsed: boolean; onClick: () => void }) {
    return React.createElement('button', {
        onClick,
        'data-testid': `desktop-nav-${item.tab}`,
        'aria-label': item.label,
        'aria-current': active ? 'page' : undefined,
        className: `group relative w-full h-11 rounded-xl flex items-center transition-all active:scale-[0.98] text-sm font-bold ${collapsed ? 'justify-center px-0' : 'gap-3 px-3.5'}`,
        style: active
            ? { background: 'rgba(212,175,55,0.14)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.3)' }
            : { background: 'transparent', color: 'rgba(255,255,255,0.75)', border: '1px solid transparent' },
    },
        React.createElement(item.icon, { className: 'w-5 h-5 flex-shrink-0' }),
        !collapsed && React.createElement('span', { className: 'truncate' }, item.label),
        collapsed && React.createElement(SidebarTooltip, { label: item.label })
    );
}

/** Tooltip بسيط بـCSS group-hover بحت (بدون state/JS إضافي) — بيظهر
 *  بس لما الزرار الأب يبقى مطوي (collapsed) ومحتاج الـlabel. */
function SidebarTooltip({ label }: { label: string }) {
    return React.createElement('span', {
        role: 'tooltip',
        className: 'pointer-events-none absolute z-40 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-bold opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100',
        style: {
            right: 'calc(100% + 10px)',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(15,25,50,0.97)',
            color: '#F1F5F9',
            border: '1px solid rgba(212,175,55,0.25)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        },
    }, label);
}

function DesktopSidebar({ tab, setTab, isAdmin, canGenerateDocuments, onAIClick }: DesktopSidebarProps) {
    const { collapsed, toggleCollapsed } = useSidebarCollapsed();
    useSidebarWidthVar(collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH);

    const isVisible = (item: NavItem) =>
        (!item.adminOnly || isAdmin) && (!item.requiresCanGenerateDocuments || canGenerateDocuments);
    const visiblePrimary = primaryNavItems.filter(isVisible);
    const visibleMore = moreNavItems.filter(isVisible);
    const visibleDesktopOnly = desktopOnlyNavItems.filter(isVisible);

    return React.createElement('aside', {
        'data-testid': 'desktop-sidebar',
        id: 'desktop-sidebar-nav',
        role: 'navigation',
        'aria-label': 'التنقل الرئيسي',
        className: `fixed top-0 bottom-0 right-0 z-30 hidden lg:flex flex-col px-3 py-4 gap-1 overflow-y-auto no-scrollbar transition-[width] duration-200`,
        style: {
            width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
            background: 'rgba(15,25,50,0.97)',
            backdropFilter: 'blur(28px) saturate(180%)',
            borderLeft: '1px solid rgba(212,175,55,0.18)',
        },
    },
        // زرار الطي — أعلى السايدبار، قبل أي عنصر تنقل.
        React.createElement('button', {
            onClick: toggleCollapsed,
            'data-testid': 'desktop-sidebar-toggle',
            'aria-label': collapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية',
            'aria-expanded': !collapsed,
            'aria-controls': 'desktop-sidebar-nav',
            className: `w-full h-9 rounded-lg flex items-center justify-center mb-2 transition-all active:scale-[0.98]`,
            style: { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' },
        },
            React.createElement(collapsed ? I.ChevronLeft : I.ChevronRight, { className: 'w-4 h-4' })
        ),

        ...visiblePrimary.map((item) => React.createElement(SidebarButton, {
            key: item.tab, item, active: tab === item.tab, collapsed,
            onClick: () => setTab(item.tab),
        })),

        // AI — نفس منطق CommandDock بالظبط (مودال، مش تاب)، معزول عن
        // navConfig عمدًا (راجع تعليقات navConfig.ts).
        React.createElement('button', {
            onClick: () => onAIClick(true),
            'data-testid': 'desktop-nav-ai-center',
            'aria-label': 'المساعد الذكي',
            className: `group relative w-full h-11 rounded-xl flex items-center transition-all active:scale-[0.98] text-sm font-black ${collapsed ? 'justify-center px-0' : 'gap-3 px-3.5'}`,
            style: { background: 'linear-gradient(135deg,rgba(201,146,42,0.18),rgba(212,175,55,0.18))', color: '#E8C84A', border: '1px solid rgba(212,175,55,0.3)' },
        },
            React.createElement(I.AI, { cls: 'w-5 h-5 flex-shrink-0' }),
            !collapsed && React.createElement('span', null, 'المساعد الذكي'),
            collapsed && React.createElement(SidebarTooltip, { label: 'المساعد الذكي' })
        ),

        React.createElement('div', { className: 'h-px bg-white/10 my-1.5' }),

        ...visibleMore.map((item) => React.createElement(SidebarButton, {
            key: item.tab, item, active: tab === item.tab, collapsed,
            onClick: () => setTab(item.tab),
        })),

        visibleDesktopOnly.length > 0 && React.createElement('div', { className: 'h-px bg-white/10 my-1.5' }),
        ...visibleDesktopOnly.map((item) => React.createElement(SidebarButton, {
            key: item.tab, item, active: tab === item.tab, collapsed,
            onClick: () => setTab(item.tab),
        }))
    );
}

export default DesktopSidebar;
