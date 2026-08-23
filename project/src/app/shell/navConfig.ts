import { I } from '../../constants';
import type { TabName } from '../../useNavigation';

// ─────────────────────────────────────────────────────────
//  navConfig — مصدر واحد مشترك لعناصر التنقل الأساسية، مستخرج من
//  CommandDock.tsx (الشريط السفلي، موبايل) وuseNavigation.ts
//  (تعريف الـ TabName الكامل).
//
//  ⚠️ الهدف: DesktopSidebar (مرحلة B1/B2) هيستهلك نفس المصفوفة دي
//  بدل ما يعيد تعريف نفس الأيقونات/الألوان/الـ testids تاني —
//  تقليل تكرار وتقليل احتمال اختلاف طفيف بين الموبايل والديسكتوب
//  مع مرور الوقت.
//
//  ⚠️ صفر تغيير على CommandDock.tsx نفسه في المرحلة دي — لسه
//  بيعرّف عناصره الأربعة + المزيد بشكل مستقل زي ما هو، الملف ده
//  مجرد وصف موازي متوافق معاه، مش استبدال ليه. أي دمج فعلي مؤجل
//  لحد ما DesktopSidebar يتبني فعليًا (B1) ونتأكد إن مفيش أي فرق
//  في السلوك.
//
//  ⚠️ لماذا AI معزول عن navItems: زرار AI في CommandDock بيفتح
//  مودال (setShowAI) مش تاب (navigateTo) — منطقه مختلف جوهريًا عن
//  باقي العناصر، فمحطوش هنا كـ NavItem عادي عشان مايتلخبطش مع
//  عناصر الـ navigateTo(tab) البسيطة. DesktopSidebar (B1) هيتعامل
//  معاه بشكل منفصل زي ما CommandDock بيعمل بالظبط.
// ─────────────────────────────────────────────────────────

export interface NavItem {
    /** التاب اللي الزرار ده بينقل له عبر navigateTo(tab) */
    tab: TabName;
    /** الأيقونة (من src/constants.ts — I.*) */
    icon: (props: { className?: string }) => JSX.Element;
    /** التسمية النصية زي ما هي معروضة في الموبايل */
    label: string;
    /** data-testid الأصلي المستخدم في CommandDock.tsx (موبايل) — بدون تغيير */
    testId: string;
    /** لو true، العنصر ده يظهر بس للأدمن (isAdmin) */
    adminOnly?: boolean;
}

// العناصر الأساسية الأربعة الظاهرة دايمًا في شريط الموبايل السفلي
// (بترتيبها الفعلي في CommandDock.tsx: الرئيسية، الجلسات، [AI منفصل]، القضايا، المهام)
export const primaryNavItems: NavItem[] = [
    { tab: 'dashboard', icon: I.Home,    label: 'الرئيسية', testId: 'nav-dashboard' },
    { tab: 'calendar',  icon: I.CalGrid, label: 'الجلسات',   testId: 'nav-calendar' },
    { tab: 'cases',     icon: I.Brief,   label: 'القضايا',   testId: 'nav-cases' },
    { tab: 'reminders', icon: I.Bell,    label: 'المهام',    testId: 'nav-reminders' },
];

// عناصر "المزيد" — الشبكة اللي بتفتح من زرار nav-more-toggle في الموبايل
// (بنفس الترتيب والـ testids الموجودين في CommandDock.tsx بالظبط)
// ⚡ NEW (خطة تفعيل الصلاحيات التفصيلية، مرحلة 3 — 16 أغسطس 2026):
// 'fees' بقى adminOnly زي 'admin' بالظبط — can_view_fees مقفول بلا
// استثناء لغير admin (قرار 2.1 من الخطة)، يعني عمليًا نفس isAdmin
// دايمًا. راجع نفس التعديل فى CommandDock.tsx (اللي بيبني قائمته
// الخاصة بشكل مستقل، مش عن طريق المصفوفة دي).
export const moreNavItems: NavItem[] = [
    { tab: 'clients',   icon: I.Person, label: 'الموكلين',    testId: 'nav-more-clients' },
    { tab: 'documents', icon: I.Folder, label: 'المستندات',   testId: 'nav-more-documents' },
    { tab: 'legalDocs', icon: I.Doc,    label: 'المستندات القانونية', testId: 'nav-more-legalDocs' },
    { tab: 'fees',      icon: I.Money,  label: 'الأتعاب',     testId: 'nav-more-fees', adminOnly: true },
    { tab: 'admin',     icon: I.Shield, label: 'لوحة الإدارة', testId: 'nav-more-admin', adminOnly: true },
];

// ─────────────────────────────────────────────────────────
//  team — 🆕 عنصر جديد مالوش زرار تنقل حاليًا في أي مكان (لا
//  CommandDock ولا "المزيد") رغم إنه معرّف وشغال في useNavigation.ts
//  وApp.tsx:474. طبقًا لقرار قسم 14 في خطة التنفيذ (14 أغسطس 2026):
//  هيتضاف للسايدبار الجديد بس (أدمن بس، زي admin) — مفيش أي تغيير
//  على CommandDock.tsx أو شريط الموبايل السفلي، ده عنصر Desktop-only.
//  استخدام I.Users (متاحة بالفعل في constants.ts) لأنها الأقرب
//  دلاليًا لمعنى "الفريق" ومفيش تعارض مع I.Person (الموكلين).
// ─────────────────────────────────────────────────────────
export const desktopOnlyNavItems: NavItem[] = [
    { tab: 'team', icon: I.Users, label: 'الفريق', testId: 'desktop-nav-team', adminOnly: true },
];

/**
 * navItemsFor — يرجّع القائمة الكاملة المستحقة للعرض (بعد فلترة adminOnly)،
 * بنفس الترتيب المنطقي: الأساسية أولاً، بعدين المزيد، بعدين عناصر
 * الديسكتوب فقط. مخصص لاستهلاك DesktopSidebar (B1) — CommandDock.tsx
 * نفسه لسه بيبني قوائمه الخاصة بشكل مستقل ومش بيستدعي الدالة دي.
 */
export function navItemsFor(isAdmin: boolean): NavItem[] {
    return [...primaryNavItems, ...moreNavItems, ...desktopOnlyNavItems].filter(
        (item) => !item.adminOnly || isAdmin
    );
}
