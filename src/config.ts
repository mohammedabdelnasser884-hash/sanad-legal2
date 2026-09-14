export const siteConfig = {
  name: "سند",
  tagline: "منصة إدارة مكاتب المحاماة",
  description: "سند منصة متكاملة لإدارة مكاتب المحاماة تشمل إدارة القضايا والعملاء والجلسات والمستندات والأتعاب في بيئة آمنة وسهلة الاستخدام.",
  // إيميل نهائي مختار.
  email: "sanadnizam@gmail.com",
  whatsapp: "+201500682665",
  // رابط النظام الفعلي — مؤقتًا على Cloudflare Workers لحد ما يتحسم نطاق حقيقي.
  appUrl: "https://sanad.nizzam.workers.dev",
  facebook: "https://facebook.com/sanadnizam",
  // TODO: باقي حسابات السوشيال ميديا وهمية لحد دلوقتي (مش مستخدمة في
  // أي مكان في الموقع حاليًا). حدّثها بحساباتك الحقيقية قبل ما تظهرها.
  socialLinks: {
    twitter: "https://twitter.com/sanadapp",
    linkedin: "https://linkedin.com/company/sanadapp",
    instagram: "https://instagram.com/sanadapp",
  },
  stats: [
    { label: "دعم عربي كامل بالكامل", value: "100%", icon: "Languages" },
    { label: "تشفير للبيانات والملفات", value: "AES-256", icon: "Lock" },
    { label: "نسخ احتياطي للبيانات", value: "يومي", icon: "CloudUpload" },
  ],
  features: [
    {
      icon: "Briefcase",
      title: "إدارة القضايا",
      description: "تتبع كامل لكل قضية من الافتتاح حتى الإغلاق مع ربط المستندات والجلسات والأطراف.",
    },
    {
      icon: "Users",
      title: "إدارة العملاء",
      description: "سجل موحد لكل عميل يشمل بياناته ووثائقه وقضاياه وسجل التواصل معه.",
    },
    {
      icon: "CalendarCheck",
      title: "الجلسات والتنبيهات",
      description: "جدول جلسات احترافي مع تنبيهات تلقائية قبل كل موعد لك وللعميل.",
    },
    {
      icon: "Receipt",
      title: "الأتعاب والفواتير",
      description: "إصدار الفواتير وتتبع المدفوعات وإدارة حسابات الأتعاب بدقة واحترافية.",
    },
    {
      icon: "Archive",
      title: "الأرشيف الذكي",
      description: "تصنيف وحفظ جميع مستندات المكتب بشكل منظم مع إمكانية البحث الفوري.",
    },
    {
      icon: "Sparkles",
      title: "المساعد بالذكاء الاصطناعي (قريباً)",
      description: "مساعد قانوني ذكي يساعدك في صياغة المذكرات والبحث القانوني وتحليل الوثائق.",
    },
  ],
  whyReasons: [
    {
      title: "مصمم للمحامين العرب",
      description: "واجهة عربية 100% مبنية خصيصاً لبيئة العمل القانوني في المنطقة العربية.",
    },
    {
      title: "يوفر الوقت ويرفع الكفاءة",
      description: "أتمتة المهام الروتينية وتنظيم العمل تمنحك وقتاً أكبر للتركيز على قضاياك.",
    },
    {
      title: "كل أعمال المكتب في مكان واحد",
      description: "من أول يوم في القضية حتى تحصيل الأتعاب — كل شيء في منصة واحدة متكاملة.",
    },
    {
      title: "تنبيهات فورية على تليجرام",
      description: "جلساتك ومهامك بتوصلك تلقائياً على تليجرام كل يوم، من غير ما تفتح البرنامج.",
    },
  ],
  security: [
    { icon: "Lock", title: "تشفير البيانات", description: "جميع بياناتك مشفرة بمعايير AES-256 الأمريكية." },
    { icon: "CloudUpload", title: "نسخ احتياطي تلقائي", description: "نسخ احتياطية يومية تلقائية في مراكز بيانات موثوقة." },
    { icon: "Shield", title: "صلاحيات متقدمة", description: "تحكم دقيق في صلاحيات كل عضو في الفريق." },
    { icon: "FileKey", title: "حماية الملفات", description: "تشفير متطور لجميع الوثائق والمرفقات القانونية." },
    { icon: "Server", title: "بنية سحابية موثوقة", description: "استضافة على أفضل مزودي الخدمة السحابية عالمياً." },
  ],
  // فاضية عن قصد — استُبعدت شهادات كانت مفبركة (أسماء ومكاتب غير حقيقية).
  // لا تُضاف شهادات هنا إلا بموافقة صريحة وموثقة من عميل حقيقي.
  testimonials: [] as { name: string; role: string; text: string }[],
  // مصدر واحد للأسعار — مستخدم في PricingSection (الرئيسية) وPricing.tsx
  // (صفحة /pricing) معًا، عشان ميتكررش تناقض زي اللي كان موجود قبل كده.
  // كل باقة سعرها الشهري رقم (monthly) بس — السعر السنوي والتقسيط بيتحسبوا
  // منه بنفس منطق بوابة إدارة المكاتب (offices-portal.html) عبر الدوال
  // تحت (getAnnualPrice / getAnnualMonthlyEquivalent / getInstallmentPrice)
  // بدل ما الأرقام تتكرر يدويًا في أكتر من مكان.
  currency: "جنيه",
  pricing: [
    {
      id: "individual",
      name: "الفردية",
      monthly: 300,
      description: "مثالية للمحامين المستقلين",
      features: ["محامٍ واحد", "50 قضية نشطة", "إدارة العملاء والجلسات", "بوابة الموكل (10 حسابات)", "إدارة الأتعاب والمدفوعات", "استخدام بدون إعلانات"],
      cta: "ابدأ مجاناً",
      highlighted: false,
    },
    {
      id: "office",
      name: "المكتب",
      monthly: 450,
      description: "للمكاتب الصغيرة والمتوسطة",
      features: ["كل مميزات الفردية، وأيضاً:", "حتى 5 محامين", "قضايا غير محدودة", "بوابة الموكل (50 حساب)", "نسخ احتياطي تلقائي يومي", "الذكاء الاصطناعي (قريباً)", "تقارير المكتب الشاملة"],
      cta: "ابدأ تجربتك",
      highlighted: true,
    },
    {
      id: "enterprise",
      name: "المؤسسة",
      monthly: 1000,
      description: "للشركات والمكاتب الكبرى",
      features: [
        "كل مميزات المكتب، وأيضاً:",
        "حتى 15 محامٍ ضمن المكتب",
        "بوابة الموكل بحسابات غير محدودة",
        "صلاحيات دقيقة لكل عضو في الفريق — تحدد بنفسك مين يشوف الأتعاب، مين يعدّل القضايا، ومين يوصله الأرشيف",
        "ضبط سير العمل والأقسام الظاهرة حسب طبيعة تخصص مكتبك (مدني، جنائي، تجاري، عمالي...)",
        "مدير حساب مخصص يتابع معاك الإعداد والاستخدام أول بأول",
        "دعم أولوية (SLA) بوقت استجابة أسرع من الباقات التانية",
      ],
      cta: "طلب عرض",
      highlighted: false,
    },
  ],
  faqs: [
    { q: "هل توجد فترة تجريبية مجانية؟", a: "نعم، نقدم فترة تجريبية مجانية لمدة شهر كامل بدون بطاقة ائتمانية." },
    { q: "هل بياناتي آمنة؟", a: "جميع البيانات مشفرة AES-256 مع نسخ احتياطي يومي تلقائي." },
    { q: "هل يدعم اللغة العربية بالكامل؟", a: "سند مبني أصلاً للعربية مع دعم RTL كامل." },
    { q: "كيف أرقّي باقتي؟", a: "الترقية فورية من لوحة التحكم، والرسوم تُحسب بالتناسب." },
    { q: "هل يوجد تطبيق جوال؟", a: "نعم، يوجد تطبيق جوال لسند، بالإضافة لكونه يعمل كتطبيق ويب متجاوب على كل الأجهزة — موبايل وتابلت وكمبيوتر — من المتصفح مباشرة بدون تثبيت." },
    { q: "ما طرق الدفع المقبولة؟", a: "بطاقات الائتمان والخصم، فودافون كاش، وتحويل بنكي للعقود السنوية." },
  ],
};

// حساب السعر السنوي والتقسيط من السعر الشهري (monthly) — بنفس منطق
// updateSuggestedPaymentAmount() في offices-portal.html: سنوي = شهرين مجانًا
// (×10)، تقسيط دفعتين = القيمة الشهرية × 6 شهور، 4 دفعات = ×3 شهور، من غير
// أي خصم على التقسيط.
export const PRICING_MULTIPLIERS = {
  annualMonths: 10, // 12 شهر - شهرين مجانًا
  installments2Months: 6,
  installments4Months: 3,
} as const;

export function getAnnualPrice(monthly: number): number {
  return monthly * PRICING_MULTIPLIERS.annualMonths;
}

export function getAnnualMonthlyEquivalent(monthly: number): number {
  return Math.round(getAnnualPrice(monthly) / 12);
}

export function getInstallmentPrice(monthly: number, installments: 2 | 4): number {
  const months =
    installments === 2 ? PRICING_MULTIPLIERS.installments2Months : PRICING_MULTIPLIERS.installments4Months;
  return monthly * months;
}
