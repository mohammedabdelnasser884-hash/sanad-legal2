import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { siteConfig } from "@/config";
import { Check, Minus } from "lucide-react";
import FAQSection from "@/components/sections/FAQSection";

const comparisonFeatures = [
  { name: "عدد المحامين", individual: "1", office: "حتى 5", enterprise: "حتى 15" },
  { name: "القضايا النشطة", individual: "50", office: "غير محدود", enterprise: "غير محدود" },
  { name: "إدارة العملاء", individual: true, office: true, enterprise: true },
  { name: "التقويم والتنبيهات", individual: true, office: true, enterprise: true },
  { name: "التقارير", individual: "أساسية", office: "متقدمة", enterprise: "مخصصة" },
  { name: "نسخ احتياطي تلقائي يومي", individual: false, office: true, enterprise: true },
  { name: "يعمل على كل الأجهزة (ويب)", individual: true, office: true, enterprise: true },
  { name: "الأرشفة الذكية", individual: false, office: true, enterprise: true },
  { name: "المساعد بالذكاء الاصطناعي (قريباً)", individual: false, office: true, enterprise: true },
  { name: "إدارة الصلاحيات والفريق", individual: false, office: true, enterprise: true },
  { name: "دعم فني", individual: "أساسي", office: "أولوي", enterprise: "مدير حساب مخصص" },
  { name: "API مفتوح", individual: false, office: false, enterprise: true },
];

export default function Pricing() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />
      <main className="flex-grow pt-32 pb-16">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h1 className="text-4xl md:text-5xl font-bold mb-6 text-[#1E293B]">باقات تناسب حجم مكتبك</h1>
            <p className="text-lg text-[#64748B]">اختر الباقة الأنسب لاحتياجاتك الحالية، ويمكنك الترقية في أي وقت.</p>
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
                <div className="flex items-end gap-1 mb-8">
                  <span className="text-5xl font-bold text-[#1E293B]">{plan.monthly}</span>
                  <span className="text-sm text-[#64748B] pb-1">{siteConfig.currency} / شهرياً</span>
                </div>
                
                <ul className="flex-grow space-y-3 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-[#C8A75D] shrink-0" />
                      <span className="text-sm text-[#64748B]">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <a href="/#contact" className={`w-full py-3 rounded-lg text-sm font-semibold text-center transition-colors ${
                  plan.highlighted ? 'bg-[#C8A75D] hover:bg-[#B38E3D] text-[#1E293B]' : 'border border-[#E2E8F0] hover:border-[#C8A75D] text-[#1E293B] bg-white'
                }`}>
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>

          {/* Comparison Table */}
          <div className="max-w-5xl mx-auto mb-24">
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