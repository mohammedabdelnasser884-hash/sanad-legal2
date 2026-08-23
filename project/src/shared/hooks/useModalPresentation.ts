import { useResponsiveLayout } from './useResponsiveLayout';

// ─────────────────────────────────────────────────────────
//  useModalPresentation — مرحلة F1. Hook وحيد وخفيف بيرجع أجزاء
//  الـ className اللي بتحدد "شكل عرض" المودال حسب نوع الشاشة، من
//  غير ما يتطبق على أي مودال فعلي لسه (الهدف: اختبار الـ hook لوحده
//  بمعزل، بنفس مبدأ A1/A2/A3 — إثبات الوحدة الأول قبل الدمج).
//
//  ⚠️ ليه مبني فوق useResponsiveLayout (A1) مش matchMedia مباشر:
//  useResponsiveLayout هو المصدر الوحيد لمعرفة "إحنا على Desktop
//  ولا لأ" في المشروع كله (نفس المصدر اللي AppShell/DesktopSidebar/
//  DesktopHeader بيعتمدوا عليه) — إعادة تعريف matchMedia هنا تاني
//  كانت هتبقى مصدر تكرار وتضارب محتمل لو الـ breakpoints اتغيّرت
//  يومًا.
//
//  ⚠️ نطاق الـ hook (مقصود، مطابق لنص الخطة قسم 8/F1):
//  بيرجع بس "أجزاء" className قابلة للتركيب مع الكلاسات الموجودة
//  فعليًا في كل مودال (22 Bottom-Sheet + 9 Centered) — مش بيرجع
//  className كامل جاهز، عشان كل مودال يقدر يحتفظ بـ z-index/خلفية/
//  padding الخاصة بيه زي ما هي وقت التطبيق الفعلي (F2/F3)، ويستبدل
//  بس الجزء الخاص بالـ"شكل" (المحاذاة + الحواف + الأنيميشن).
//
//  الأجزاء الثلاثة اللي بترجع:
//  1) overlayAlignClassName — يحل محل "items-end" في الـ wrapper
//     الخارجي (`fixed inset-0 ... flex {هنا} justify-center ...`).
//     موبايل/تابلت = items-end (Bottom Sheet زي ما هو حاليًا 100%)،
//     ديسكتوب = items-center (المودال يفضل في نص الشاشة بدل ما يلزق
//     تحت — مطابق للوصف في قسم 8 من الخطة).
//  2) panelShapeClassName — يحل محل "rounded-t-3xl border-t
//     border-white/10" في الـ panel الداخلي. على الموبايل الشكل
//     الحالي بالحرف (حواف مدوّرة من فوق بس + خط علوي، لأن المودال
//     ملزوق بأسفل الشاشة). على الديسكتوب، بما إن المودال بقى عائم
//     في النص مش ملزوق بحافة، الحواف لازم تتدور بالكامل (rounded-3xl)
//     والحدود تحيط بيه من كل الاتجاهات (border بدل border-t) —
//     وإلا هيبان القطع العلوي "مقصوص" بلا داعي.
//  3) panelAnimationClassName — يحل محل "slide-up" (كلاس أنيميشن
//     موجود بالفعل في index.css، مصمم لحركة "طلوع من تحت" مناسبة
//     لـBottom Sheet بس). على الديسكتوب سيبتها فاضية عمدًا (مش
//     '') fade-in جديد — قرار مقصود لتقليل نطاق F1: اختيار/بناء
//     أنيميشن مناسب لمودال مركزي (fade+scale مثلًا) قرار بصري
//     محتاج مراجعة، الأنسب يتاخد وقت التطبيق الفعلي في F2 مش هنا.
//
//  ⚠️ صفر تغيير على أي مودال فعلي — الملف ده بمعزلة تمامًا، ومش
//  مستورد في أي مكان لحد F2.
// ─────────────────────────────────────────────────────────

export interface ModalPresentation {
    isDesktop: boolean;
    overlayAlignClassName: string;
    panelShapeClassName: string;
    panelAnimationClassName: string;
}

export function useModalPresentation(): ModalPresentation {
    const { isDesktop } = useResponsiveLayout();

    return {
        isDesktop,
        overlayAlignClassName: isDesktop ? 'items-center' : 'items-end',
        panelShapeClassName: isDesktop
            ? 'rounded-3xl border border-white/10'
            : 'rounded-t-3xl border-t border-white/10',
        panelAnimationClassName: isDesktop ? '' : 'slide-up',
    };
}
