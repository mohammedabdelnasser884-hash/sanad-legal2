import React from 'react';
import { I, SanadMark } from '../../constants';
import type { ProfileRow } from '../../types';

// ─────────────────────────────────────────────────────────
//  DesktopHeader — مرحلة B3: هيدر علوي بتصميم Desktop، نفس الـ
//  actions الموجودة فعليًا في AppHeader.tsx (بحث، تحديث بيانات
//  القضايا، فتح قائمة الحساب) لكن بشكل أفقي أوسع يناسب شاشة كبيرة،
//  بدل الصف الضيق المصمم أصلًا لعرض موبايل.
//
//  ⚠️ Mobile Safety — نفس مبدأ B1/B2 بالظبط مع DesktopSidebar/
//  CommandDock: **صفر تغيير على AppHeader.tsx** — بيفضل زي ما هو
//  100%، مستخدم في نفس مكانه في App.tsx من غير أي شرط `!isDesktop`.
//  السبب: `header-search-open` (data-testid بتاع AppHeader) مستخدم
//  فعليًا في `e2e/universal-search.spec.ts` واللي بيشتغل على فيوبورت
//  Desktop Chrome (زي كل الـ31 اختبار الحالية) — إخفاء AppHeader
//  دلوقتي هيكسّر الاختبار ده فورًا. يعني مؤقتًا (لحد ما يبقى فيه
//  تغطية Playwright بفيوبورت موبايل في G3، بالظبط زي قرار تأجيل
//  إخفاء CommandDock) هيظهر الهيدرين فوق بعض على الديسكتوب —
//  AppHeader (الأصلي) فوق DesktopHeader (الجديد) مباشرة. مش الشكل
//  النهائي المقصود، لكنه القرار الأكثر أمانًا لإثبات صحة DesktopHeader
//  بمعزل عن أي تغيير في AppHeader، بنفس فلسفة كل مرحلة جزئية سابقة
//  في الخطة (بند 12 — Mobile Safety Strategy). الدمج/الإخفاء الفعلي
//  لـAppHeader على الديسكتوب مؤجل لوقت لاحق يتحدد صراحةً (زي CommandDock).
//
//  ⚠️ data-testid: كل عنصر تفاعلي هنا بياخد `desktop-header-*` مستقل
//  تمامًا عن `header-search-open`/أي id موبايل — نفس سبب `desktop-nav-*`
//  في DesktopSidebar (تفادي strict-mode violation لما العنصرين
//  يبقوا ظاهرين في نفس اللحظة على نفس الصفحة).
//
//  ⚠️ `--app-header-h`: DesktopHeader **لا ينشر** أي قيمة لـCSS
//  variable ده — النشر ده لسه مسؤولية AppHeader.tsx فقط (عبر
//  ResizeObserver بتاعه، بدون أي تعديل هنا) عشان نتجنب تعارض قيمتين
//  بيكتبوا لنفس الـvariable من مكونين مختلفين. أي مكان في المشروع
//  بيعتمد على `var(--app-header-h)` هيفضل شغال زي ما هو بالظبط.
//
//  ⚠️ التموضع: `sticky top-0` (مش `fixed`) — بيلزق أعلى الـ `<div
//  data-testid="app-shell">` (نفس الـscroll container الجذري) زي ما
//  موضّح في مخطط قسم 7 من الخطة، وبيمتد بعرض الشاشة كامل (فوق الـ
//  Sidebar وفوق الـ main مع بعض).
//  ⚡ مرحلة B4 (14 أغسطس 2026): `--app-sidebar-w` بقى منشور فعليًا
//  (عبر useSidebarWidthVar جوه DesktopSidebar.tsx)، لكن **قصدًا مفيش
//  أي `padding`/`margin` هنا بيعتمد عليه** — الهيدر (`z-40`) أعلى من
//  السايدبار (`z-30`) فبيمتد بعرض الشاشة كامل ويغطي بصريًا الشريط
//  العلوي من السايدبار، بالظبط زي مخطط قسم 7 (الهيدر فوق الاتنين).
//  الاستهلاك الفعلي لـ`--app-sidebar-w` محصور في `<main>` (App.tsx)
//  بس، اللي محتاج فعليًا يحجز مساحة يمينه عشان محتواه ميتخبيش تحت
//  السايدبار.
//
//  ⚠️ زرار "القائمة": بيستخدم نفس `setShowMenu`/`HeaderMenu.tsx`
//  الموجودين فعلًا (نفس دالة `handlePwaInstall`/`toggleTheme`/
//  `handleLogout` من App.tsx، من غير أي تعديل عليهم) — بدل ما نبني
//  dropdown جديد، بنعيد استخدام نفس المكوّن اللي AppHeader بيفتحه،
//  فسلوك القائمة (الثيم/تثبيت التطبيق/تسجيل الخروج) هيفضل واحد
//  ومتطابق تمامًا بين الموبايل والديسكتوب من أول يوم.
//
//  ⚡ مرحلة G2 (15 أغسطس 2026): A11y pass — أضفت `aria-label="ترويسة
//  سطح المكتب"` على الـ`<header>` الجذري نفسه، عشان يتميّز واضح عن
//  `<header>` بتاع AppHeader.tsx الأصلي (الاتنين لسه ظاهرين فوق بعض
//  على الديسكتوب، راجع تعليق Mobile Safety فوق) لو قارئ شاشة استعرض
//  قائمة الـlandmarks — من غير التمييز ده كانوا هيبانوا كـ"header"
//  مكرر بدون فرق واضح. زرار `desktop-header-refresh` كان أصلاً بياخد
//  `aria-label` من B3، بس غيّرت النص لـ"تحديث بيانات القضايا" (بدل
//  "تحديث البيانات" العام) عشان يكون أوضح ومحدد أكتر. زرار البحث
//  وزرار قائمة الحساب مالهمش تغيير (عندهم اسم إمكاني واضح بالفعل —
//  نص مرئي "بحث" في الأول، و`aria-label="قائمة الحساب"` في التاني).
//  صفر تغيير على أي منطق/data-testid موجود.
// ─────────────────────────────────────────────────────────

export interface DesktopHeaderProps {
    profile: ProfileRow | null;
    setShowMenu: (v: boolean) => void;
    setShowSearch: (v: boolean) => void;
    isAdmin: boolean;
    fetchCases: (page?: number, filter?: string) => void | Promise<void>;
    casesFilter: string;
    loadingCases: boolean;
}

function DesktopHeader({ profile, setShowMenu, setShowSearch, isAdmin, fetchCases, casesFilter, loadingCases }: DesktopHeaderProps) {
    return React.createElement('header', {
        'data-testid': 'desktop-header',
        'aria-label': 'ترويسة سطح المكتب',
        className: 'hidden lg:flex w-full items-center gap-4 px-6 sticky top-0 z-40 shrink-0',
        style: {
            height: 64,
            background: 'rgba(15,25,50,0.97)',
            backdropFilter: 'blur(28px) saturate(180%)',
            borderBottom: '1px solid rgba(212,175,55,0.18)',
        },
    },
        // ── شعار + اسم المكتب/المستخدم + الدور ──
        React.createElement('div', { className: 'flex items-center gap-3 min-w-0' },
            React.createElement('div', {
                style: {
                    width: 36, height: 36, background: '#0B1320', borderRadius: 10, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    border: '1px solid rgba(212,175,55,0.22)',
                    boxShadow: '0 0 12px rgba(212,175,55,0.10)', flexShrink: 0,
                },
            }, React.createElement(SanadMark, { size: 24 })),
            React.createElement('div', { className: 'flex flex-col min-w-0' },
                React.createElement('h1', { className: 'text-sm font-black tracking-tight text-white leading-tight truncate' },
                    profile?.full_name || 'سَنَد'),
                React.createElement('p', { className: 'text-[11px] font-bold flex items-center gap-1', style: { color: isAdmin ? '#60a5fa' : '#D4AF37' } },
                    React.createElement('span', { className: `inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isAdmin ? 'bg-blue-400' : 'bg-premium-gold'}` }),
                    React.createElement('span', { className: 'truncate' }, isAdmin ? 'مدير المكتب' : 'محامي')
                )
            )
        ),

        // ── مساحة فاصلة تدفع الأزرار لليسار (آخر الصف في RTL) ──
        React.createElement('div', { className: 'flex-1' }),

        // ── أزرار الإجراءات: بحث / تحديث / قائمة الحساب ──
        React.createElement('div', { className: 'flex items-center gap-2 shrink-0' },
            React.createElement('button', {
                onClick: () => setShowSearch(true),
                'data-testid': 'desktop-header-search-open',
                className: 'h-10 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2 px-3.5 active:scale-95 transition-transform text-slate-300 text-sm font-bold hover:bg-white/10',
            },
                React.createElement(I.Search),
                React.createElement('span', null, 'بحث')
            ),
            React.createElement('button', {
                onClick: () => fetchCases(0, casesFilter),
                'data-testid': 'desktop-header-refresh',
                'aria-label': 'تحديث بيانات القضايا',
                className: 'w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-95 transition-transform hover:bg-white/10',
            },
                loadingCases
                    ? React.createElement(I.Spin)
                    : React.createElement('svg', { className: 'w-4 h-4 text-premium-gold', fill: 'none', viewBox: '0 0 24 24', strokeWidth: '2', stroke: 'currentColor' },
                        React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99' })
                    )
            ),
            React.createElement('button', {
                onClick: () => (setShowMenu as unknown as (updater: (prev: boolean) => boolean) => void)((p: boolean) => !p),
                'data-testid': 'desktop-header-menu-toggle',
                'aria-label': 'قائمة الحساب',
                className: 'w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-[5px] active:scale-95 transition-transform hover:bg-white/10',
            },
                React.createElement('span', { className: 'block w-4 h-0.5 bg-premium-gold rounded-full' }),
                React.createElement('span', { className: 'block w-4 h-0.5 bg-premium-gold rounded-full' }),
                React.createElement('span', { className: 'block w-4 h-0.5 bg-premium-gold rounded-full' })
            )
        )
    );
}

export default DesktopHeader;
