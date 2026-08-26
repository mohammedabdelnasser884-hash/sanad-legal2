import React from 'react';
import { useResponsiveLayout } from '../../shared/hooks/useResponsiveLayout';
import DesktopSidebar from './DesktopSidebar';
import DesktopHeader from './DesktopHeader';
import TabletDrawer from './TabletDrawer';
import type { TabName } from '../../useNavigation';
import type { ProfileRow } from '../../types';

// ─────────────────────────────────────────────────────────
//  AppShell — الحاوية الجذرية الجديدة للتطبيق كله.
//
//  ⚠️ مرحلة A3: هيكلي بحت، **صفر تغيير بصري**. الهدف هنا إثبات إن
//  الـ wrapper الجديد بيرجّع بالظبط نفس الـ DOM اللي App.tsx بيرجّعه
//  حاليًا (نفس className، نفس data-testid، نفس ترتيب الأبناء) —
//  من غير ما يتلمس أي منطق (state/effects/navigation) خالص. المنطق
//  كله لسه في App.tsx زي ما هو، والدمج الفعلي (استبدال الـ div
//  الجذري في App.tsx باستخدام AppShell بدل ما يكون inline) مؤجل
//  لحد A4 عمدًا، عشان لو حصل أي مشكلة تظهر بعد الدمج، نعرف بالظبط
//  إنها بسبب "الدمج نفسه" مش بسبب هيكل AppShell.
//
//  ⚡ مرحلة B1 (14 أغسطس 2026): دلوقتي فعليًا أول استخدام لـ
//  useResponsiveLayout (A1) — بالظبط زي ما كان متوقع في تعليق A3
//  فوق: AppShell بقى مسؤول عن قرار عرض DesktopSidebar. لو `isDesktop`
//  و`tab`/`setTab` متوفرين (App.tsx بيبعتهم دلوقتي)، بيتعرض
//  DesktopSidebar **جنب** children مش بدالها — صفر تغيير على أي حاجة
//  من children (Header/main/CommandDock/AppModals) نفسها. لو حد
//  الـ nav props مش متبعت (استخدام مستقبلي محتمل للـ AppShell من غير
//  navigation)، السايدبار ببساطة ما بيتعرضش — مفيش كسر لأي استخدام
//  حالي أو مستقبلي بسيط للمكوّن.
//
//  ⚠️ CommandDock (الشريط السفلي) **مش بيتلمس هنا خالص** — لسه بيتعرض
//  زي ما هو من غير أي شرط `!isDesktop` (راجع تعليق Mobile Safety
//  المفصّل في DesktopSidebar.tsx نفسه لسبب التأجيل: الاختبارات الـ31
//  الحالية بتشتغل على فيوبورت Desktop Chrome وبتعتمد على أزرار
//  CommandDock مباشرة).
//
//  ⚠️ نمط الكتابة: React.createElement زي باقي ملفات src/app/*
//  (CommandDock.tsx, AppLoadingScreen.tsx, AppModals.tsx...) — كلها
//  اتنقلت حرفيًا من App.tsx اللي بيستخدم نفس النمط، فالحفاظ على نفس
//  الأسلوب هنا بيقلل الفروق البصرية أثناء المراجعة وقت الدمج (A4).
//
//  ⚡ مرحلة B3 (14 أغسطس 2026): نفس مبدأ B1 بالظبط لكن للهيدر —
//  AppShell بقى كمان بيقرر عرض DesktopHeader لو `isDesktop` وكل
//  props الهيدر (profile/setShowMenu/setShowSearch/fetchCases/
//  casesFilter/loadingCases) متوفرة. زي DesktopSidebar، بيتحط جوه
//  الـdiv الجذري **قبل** children (راجع ترتيب العناصر في الـreturn
//  تحت — DesktopHeader الأول، بعدين children، بعدين DesktopSidebar)
//  عشان يطابق مخطط قسم 7 من الخطة (الهيدر فوق، السايدبار جنب). صفر
//  تغيير على AppHeader.tsx نفسه أو على أي حاجة من children — راجع
//  تعليقات Mobile Safety المفصّلة في DesktopHeader.tsx لسبب تأجيل
//  إخفاء AppHeader الأصلي على الديسكتوب.
//
//  ⚡ مرحلة G1 (15 أغسطس 2026): نفس مبدأ B1 بالظبط لكن لنطاق Tablet
//  (768–1023px) بدل Desktop — AppShell بقى كمان بيقرر عرض TabletDrawer
//  لو `isTablet` وكل props التنقل (tab/setTab/isAdmin/onAIClick) نفسها
//  المستخدمة مع DesktopSidebar متوفرة (نفس شرط `canShowSidebar` تقريبًا
//  بس بـisTablet بدل isDesktop — الاتنين متبادلين الإقصاء دايمًا لأن
//  useResponsiveLayout بيرجّع mode واحد بس، فمفيش احتمال تعارض ظهور
//  التاني في نفس اللحظة). TabletDrawer بيتحط جنب children (بعد
//  DesktopSidebar في الـreturn) — ترتيبه مش مهم بصريًا لأنه overlay
//  كامل (`fixed`) مش عنصر layout عادي.
// ─────────────────────────────────────────────────────────

export interface AppShellProps {
    /** كل أبناء الـ shell الجذري — نفس الأبناء الموجودين حاليًا داخل
     *  الـ div الجذري في App.tsx (Header + HeaderMenu + main + CommandDock
     *  + AppModals + ExitConfirmModal)، ممرّرين زي ما هم من غير أي تعديل. */
    children?: React.ReactNode;
    /** أي className إضافي (اختياري) — يتضاف بعد الافتراضي، بدون استبداله. */
    className?: string;
    /** التاب الحالي — لو متوفر مع setTab، AppShell بيقرر عرض DesktopSidebar
     *  (مرحلة B1). اختياري عشان الـ prop لا يكسر أي استخدام مستقبلي بسيط. */
    tab?: TabName;
    setTab?: (tab: TabName) => void;
    isAdmin?: boolean;
    /** ⚡ NEW (سجل قرارات تقرير المستندات القانونية، بند 6 — 26 أغسطس
     *  2026): checkPermission(profile, 'can_generate_documents') من
     *  App.tsx — بتتمرر لـDesktopSidebar/TabletDrawer نفس تمرير isAdmin،
     *  عشان يقدروا يفلتروا عنصر "المستندات القانونية". اختياري زي باقي
     *  props التنقل هنا — لو مش متبعت، السايدبار/الدرج ببساطة مايعرضوش
     *  العنصر ده (نفس فلسفة `!!isAdmin` تحت). */
    canGenerateDocuments?: boolean;
    /** نفس handleAIButtonClick بتاعة App.tsx — بتتمرر لـDesktopSidebar
     *  زي ما هي من غير أي تعديل على منطق قفل قسم الـAI. */
    onAIClick?: (v: boolean) => void;
    // ⚡ B3 — نفس الـprops اللي App.tsx بيبعتها فعليًا لـAppHeader
    // حاليًا (سطر 387 في App.tsx)، بتتمرر زي ما هي من غير أي تعديل
    // على منطقها لـDesktopHeader الجديد. كلها اختياري لنفس سبب باقي
    // props التنقل فوق — عشان لا تكسر أي استخدام مستقبلي بسيط للمكوّن.
    profile?: ProfileRow | null;
    setShowMenu?: (v: boolean) => void;
    setShowSearch?: (v: boolean) => void;
    fetchCases?: (page?: number, filter?: string) => void | Promise<void>;
    casesFilter?: string;
    loadingCases?: boolean;
}

function AppShell({
    children, className, tab, setTab, isAdmin, canGenerateDocuments, onAIClick,
    profile, setShowMenu, setShowSearch, fetchCases, casesFilter, loadingCases,
}: AppShellProps) {
    // ⚠️ نفس className ونفس data-testid الموجودين بالظبط حاليًا في
    // App.tsx (`h-full flex flex-col bg-premium-bg` + `data-testid="app-shell"`)
    // — أي اختبار E2E حاليًا بيعتمد على `data-testid="app-shell"` هيفضل
    // شغال بعد الدمج في A4 من غير أي تعديل.
    const combinedClassName = className
        ? `h-full flex flex-col bg-premium-bg ${className}`
        : 'h-full flex flex-col bg-premium-bg';

    const { isDesktop, isTablet } = useResponsiveLayout();
    const canShowSidebar = isDesktop && !!tab && !!setTab && !!onAIClick;
    const canShowHeader = isDesktop && !!setShowMenu && !!setShowSearch && !!fetchCases
        && casesFilter !== undefined && loadingCases !== undefined;
    // ⚡ G1 — نفس شروط canShowSidebar بالظبط بس لنطاق isTablet.
    const canShowTabletDrawer = isTablet && !!tab && !!setTab && !!onAIClick;

    return React.createElement(
        'div',
        { className: combinedClassName, 'data-testid': 'app-shell' },
        canShowHeader && React.createElement(DesktopHeader, {
            profile: profile ?? null,
            setShowMenu: setShowMenu as (v: boolean) => void,
            setShowSearch: setShowSearch as (v: boolean) => void,
            isAdmin: !!isAdmin,
            fetchCases: fetchCases as (page?: number, filter?: string) => void | Promise<void>,
            casesFilter: casesFilter as string,
            loadingCases: loadingCases as boolean,
        }),
        children,
        canShowSidebar && React.createElement(DesktopSidebar, {
            tab: tab as TabName,
            setTab: setTab as (tab: TabName) => void,
            isAdmin: !!isAdmin,
            canGenerateDocuments: !!canGenerateDocuments,
            onAIClick: onAIClick as (v: boolean) => void,
        }),
        canShowTabletDrawer && React.createElement(TabletDrawer, {
            tab: tab as TabName,
            setTab: setTab as (tab: TabName) => void,
            isAdmin: !!isAdmin,
            canGenerateDocuments: !!canGenerateDocuments,
            onAIClick: onAIClick as (v: boolean) => void,
        })
    );
}

export default AppShell;
