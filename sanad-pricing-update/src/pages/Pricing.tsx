import { useState } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { siteConfig, getAnnualPrice, getAnnualMonthlyEquivalent } from "@/config";
import { Check, Minus, Send, Activity, Archive, Scale } from "lucide-react";
import FAQSection from "@/components/sections/FAQSection";
import PaymentModeToggle, { type PaymentMode } from "@/components/PaymentModeToggle";

// نفس الشريط الموجود في PricingSection (الرئيسية) — مرحلة 3.4.
const sharedFeatures = [
  { icon: Send, label: "تنبيهات تليجرام الفورية + اليومية" },
  { icon: Activity, label: "سجل النشاطات" },
  { icon: Archive, label: "الأرشيف الرقمي" },
  { icon: Scale, label: "الموارد القانونية" },
];

const comparisonFeatures = [
  { name: "عدد المحامين", individual: "1", office: "حتى 5", enterprise: "حتى 15" },
  { name: "القضايا النشطة", individual: "50", office: "غير محدود", enterprise: "غير محدود" },
  { name: "بوابة الموكل (حسابات)", individual: "10", office: "50", enterprise: "غير محدود" },
  { name: "إدارة العملاء", individual: true, office: true, enterprise: true },
  { name: "التقويم والتنبيهات (الجلسات والمهام)", individual: true, office: true, enterprise: true },
  { name: "تعدد أطراف القضية", individual: true, office: true, enterprise: true },
  { name: "الحكم النهائي وإقفال القضية تلقائياً", individual: true, office: true, enterprise: true },
  { name: "تنبيهات وتقرير يومي على تليجرام", individual: true, office: true, enterprise: true },
  { name: "الأرشيف الذكي والبحث فيه", individual: true, office: true, enterprise: true },
  { name: "المكتبة القانونية الجاهزة (نماذج وصيغ ودليل المحامي)", individual: true, office: true, enterprise: true },
  { name: "بحث موحد يغطي كل أقسام النظام", individual: true, office: true, enterprise: true },
  { name: "يعمل بدون إنترنت ويتزامن تلقائياً", individual: true, office: true, enterprise: true },
  { name: "تثبيت التطبيق على الشاشة الرئيسية (PWA)", individual: true, office: true, enterprise: true },
  { name: "دفعات مقدمة وتقسيط الأتعاب", individual: true, office: true, enterprise: true },
  { name: "عزل تام لبيانات المكتب (خصوصية وأمان)", individual: true, office: true, enterprise: true },
  { name: "سجل تدقيق كامل (من عمل إيه وإمتى)", individual: true, office: true, enterprise: true },
  { name: "نسخ احتياطي تلقائي يومي", individual: true, office: true, enterprise: true },
  { name: "يعمل على كل الأجهزة (ويب)", individual: true, office: true, enterprise: true },
  { name: "التقارير", individual: "أساسية", office: "متقدمة", enterprise: "مخصصة" },
  { name: "إدارة الصلاحيات والفريق", individual: false, office: true, enterprise: true },
  { name: "نظام يتشكّل حسب تخصص مكتبك (مدني، جنائي، تجاري، عمالي...)", individual: false, office: true, enterprise: true },
  { name: "المساعد بالذكاء الاصطناعي (قريباً)", individual: false, office: true, enterprise: true },
  { name: "دعم فني", individual: "أساسي", office: "أولوي", enterprise: "مدير حساب مخصص" },
  { name: "API مفتوح", individual: false, office: false, enterprise: true },
];

export default function Pricing() {
  // نفس افتراضي PricingSection (شهري) — نظام التقسيط اتشال بالكامل.
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("monthly");

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />
      <main className="flex-grow pt-32 pb-16">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-6 text-[#1E293B]">باقات تناسب حجم مكتبك</h1>
            <p className="text-lg text-[#64748B]">اختر الباقة الأنسب لاحتياجاتك الحالية، ويمكنك الترقية في أي وقت.</p>
          </div>

          {/* شريط "في كل الباقات" — نفس شريط الرئيسية (مرحلة 3.4) */}
          <div className="max-w-4xl mx-auto mb-8 rounded-2xl border border-[#1E293B]/10 bg-white px-5 py-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <span className="font-bold text-[#1E293B]" style={{ fontSize: 13 }}>
              في كل الباقات:
            </span>
            {sharedFeatures.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-[#475569]" style={{ fontSize: 13 }}>
                <f.icon size={15} className="text-[#C8A75D]" strokeWidth={1.8} />
                {f.label}
              </span>
            ))}
          </div>

          {/* توجل طريقة الدفع (شهري/سنوي) */}
          <div className="mb-10">
            <PaymentModeToggle mode={paymentMode} onChange={setPaymentMode} />
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-24">
            {siteConfig.pricing.map((plan) => (
              <div 
                key={plan.id}
                className={`relative rounded-2xl p-8 flex flex-col ${
                  plan.highlighted 
                    ? 'border border-[#C8A75D] shadow-md bg-white' 
                    : 'border border-[#E2E8F0] bg-white'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#C8A75D] text-[#1E293B] px-3 py-1 rounded-full text-xs font-bold">
                    الأكثر شيوعاً
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-xl font-bold mb-2 text-[#1E293B]">{plan.name}</h3>
                  <p className="text-sm text-[#64748B]">{plan.description}</p>
                </div>

                {/* بلوك السعر — متوصّل بالتوجل (مرحلة 3.2/3.3) */}
                <div className="mb-8">
                  {paymentMode === "annual" && (
                    <>
                      <div className="flex items-end gap-1 mb-1">
                        <span className="text-5xl font-bold text-[#1E293B]">
                          {getAnnualPrice(plan.monthly).toLocaleString("ar-EG")}
                        </span>
                        <span className="text-sm text-[#64748B] pb-1">{siteConfig.currency} / سنوياً</span>
                      </div>
                      <p className="text-xs font-medium text-[#8A6D2F]">
                        بمعدل {getAnnualMonthlyEquivalent(plan.monthly).toLocaleString("ar-EG")} {siteConfig.currency} بس في الشهر
                      </p>
                    </>
                  )}

                  {paymentMode === "monthly" && (
                    <div className="flex items-end gap-1">
                      <span className="text-5xl font-bold text-[#1E293B]">{plan.monthly}</span>
                      <span className="text-sm text-[#64748B] pb-1">{siteConfig.currency} / شهرياً</span>
                    </div>
                  )}
                </div>
                
                <ul className="flex-grow space-y-3 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-[#C8A75D] shrink-0" />
                      <span className="text-sm text-[#64748B]">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <a
                  href={`https://wa.me/${siteConfig.whatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                    `مرحباً، أنا مهتم بباقة ${plan.name} في سند`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-full py-3 rounded-lg text-sm font-semibold text-center transition-colors ${
                    plan.highlighted ? 'bg-[#C8A75D] hover:bg-[#B38E3D] text-[#1E293B]' : 'border border-[#E2E8F0] hover:border-[#C8A75D] text-[#1E293B] bg-white'
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>

          {/* Comparison Table */}
          <div id="comparison" className="max-w-5xl mx-auto mb-24 scroll-mt-24">
            <h2 className="text-2xl font-bold text-center mb-8 text-[#1E293B]">مقارنة تفصيلية للمميزات</h2>
            <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
              <table className="w-full text-right border-collapse bg-white">
                <thead>
                  <tr className="bg-[#F8F9FA]">
                    <th className="p-4 border-b border-[#E2E8F0] w-1/4 text-sm font-semibold text-[#1E293B]">الميزة</th>
                    <th className="p-4 border-b border-[#E2E8F0] w-1/4 text-center text-sm font-semibold text-[#1E293B]">الفردية</th>
                    <th className="p-4 border-b border-[#E2E8F0] w-1/4 text-center text-[#C8A75D] font-bold text-sm">المكتب</th>
                    <th className="p-4 border-b border-[#E2E8F0] w-1/4 text-center text-sm font-semibold text-[#1E293B]">المؤسسة</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonFeatures.map((feat, idx) => (
                    <tr key={idx} className="border-b border-[#E2E8F0] hover:bg-[#F8F9FA]">
                      <td className="p-4 text-sm text-[#1E293B]">{feat.name}</td>
                      <td className="p-4 text-center text-sm text-[#64748B]">
                        {typeof feat.individual === 'boolean' 
                          ? (feat.individual ? <Check className="w-5 h-5 text-[#C8A75D] mx-auto" /> : <Minus className="w-5 h-5 text-[#E2E8F0] mx-auto" />)
                          : feat.individual}
                      </td>
                      <td className="p-4 text-center text-sm text-[#1E293B] font-medium bg-[#F8F9FA]/50">
                        {typeof feat.office === 'boolean' 
                          ? (feat.office ? <Check className="w-5 h-5 text-[#C8A75D] mx-auto" /> : <Minus className="w-5 h-5 text-[#E2E8F0] mx-auto" />)
                          : feat.office}
                      </td>
                      <td className="p-4 text-center text-sm text-[#64748B]">
                        {typeof feat.enterprise === 'boolean' 
                          ? (feat.enterprise ? <Check className="w-5 h-5 text-[#C8A75D] mx-auto" /> : <Minus className="w-5 h-5 text-[#E2E8F0] mx-auto" />)
                          : feat.enterprise}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <FAQSection />
        </div>
      </main>
      <Footer />
    </div>
  );
}