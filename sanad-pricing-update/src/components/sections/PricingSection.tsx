import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef, useState } from "react";
import { Check, ShieldCheck, Send, Activity, Archive, Scale } from "lucide-react";
import SectionHeading from "@/components/SectionHeading";
import PaymentModeToggle, { type PaymentMode } from "@/components/PaymentModeToggle";
import { siteConfig, getAnnualPrice, getAnnualMonthlyEquivalent } from "@/config";

const ease = [0.22, 1, 0.36, 1] as const;

// نفس الباقات المستخدمة في صفحة /pricing (siteConfig.pricing) — مصدر
// واحد للأسعار عشان ميتكررش تناقض الأرقام/العملة بين الصفحتين.
const plans = siteConfig.pricing;

const sharedFeatures = [
  { icon: Send, label: "تنبيهات تليجرام الفورية + اليومية" },
  { icon: Activity, label: "سجل النشاطات" },
  { icon: Archive, label: "الأرشيف الرقمي" },
  { icon: Scale, label: "الموارد القانونية" },
];

export default function PricingSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  // افتراضي = شهري (قرار جيمي — نظام التقسيط اتشال بالكامل، شهري وسنوي بس).
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("monthly");

  return (
    <section id="pricing" ref={ref} className="py-12 px-6 bg-[#FAFAF8]">
      <div className="max-w-5xl mx-auto">

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease }}
          className="mb-6"
        >
          <SectionHeading
            eyebrow="الباقات"
            title="خطط واضحة وبسيطة"
          />
        </motion.div>

        {/* Frame 1 — pill badge, free-trial message */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease, delay: 0.1 }}
          className="mb-4"
        >
          <span
            className="inline-flex items-center gap-2 rounded-full border border-[#C8A75D]/40 bg-[#C8A75D]/[0.08] text-[#8A6D2F] font-semibold px-4 py-2"
            style={{ fontSize: 13.5 }}
          >
            <ShieldCheck size={16} className="text-[#C8A75D]" strokeWidth={2.2} />
            شهر مجاناً — لا بطاقة ائتمانية
          </span>
        </motion.div>

        {/* Frame 2 — bordered card, shared-features chip row */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease, delay: 0.18 }}
          className="rounded-2xl border border-[#1E293B]/10 bg-white px-5 py-4 mb-6 flex flex-wrap items-center gap-x-6 gap-y-3"
        >
          <span className="font-bold text-[#1E293B]" style={{ fontSize: 13 }}>
            في كل الباقات:
          </span>
          {sharedFeatures.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 text-[#475569]"
              style={{ fontSize: 13 }}
            >
              <f.icon size={15} className="text-[#C8A75D]" strokeWidth={1.8} />
              {f.label}
            </span>
          ))}
        </motion.div>

        {/* Frame 2.5 — payment-mode toggle (شهري / سنوي) */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease, delay: 0.24 }}
          className="mb-8"
        >
          <PaymentModeToggle mode={paymentMode} onChange={setPaymentMode} />
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.08, duration: 0.5, ease }}
              className={`relative rounded-2xl p-6 flex flex-col gap-5 ${
                plan.highlighted ? "bg-[#1E293B]" : "bg-white"
              }`}
              style={plan.highlighted ? undefined : { border: "1px solid #EAECF0" }}
              data-testid={`plan-${plan.id}`}
            >
              {plan.highlighted && (
                <span
                  className="absolute top-5 left-5 bg-[#C8A75D] text-[#1E293B] font-bold rounded-full px-2.5 py-0.5"
                  style={{ fontSize: 10, letterSpacing: "0.05em" }}
                >
                  الأكثر شيوعاً
                </span>
              )}

              <div>
                <p
                  className={`font-medium mb-2 uppercase tracking-wider ${
                    plan.highlighted ? "text-slate-400" : "text-[#94A3B8]"
                  }`}
                  style={{ fontSize: 11 }}
                >
                  {plan.name}
                </p>
                {(() => {
                  const subTextClass = plan.highlighted ? "text-slate-400" : "text-[#94A3B8]";
                  const noteTextClass = plan.highlighted ? "text-slate-300" : "text-[#8A6D2F]";

                  if (paymentMode === "annual") {
                    const annualPrice = getAnnualPrice(plan.monthly);
                    const monthlyEquivalent = getAnnualMonthlyEquivalent(plan.monthly);
                    return (
                      <>
                        <div className="flex items-end gap-1.5">
                          <span
                            className={`font-black leading-none ${
                              plan.highlighted ? "text-white" : "text-[#1E293B]"
                            }`}
                            style={{ fontSize: "2.75rem" }}
                          >
                            {annualPrice.toLocaleString("ar-EG")}
                          </span>
                          <span className={`pb-1.5 ${subTextClass}`} style={{ fontSize: 12 }}>
                            {siteConfig.currency} / سنوياً
                          </span>
                        </div>
                        <p className={`mt-1.5 font-medium ${noteTextClass}`} style={{ fontSize: 12 }}>
                          بمعدل {monthlyEquivalent.toLocaleString("ar-EG")} {siteConfig.currency} بس في الشهر
                        </p>
                      </>
                    );
                  }

                  return (
                    <div className="flex items-end gap-1.5">
                      <span
                        className={`font-black leading-none ${
                          plan.highlighted ? "text-white" : "text-[#1E293B]"
                        }`}
                        style={{ fontSize: "2.75rem" }}
                      >
                        {plan.monthly}
                      </span>
                      <span className={`pb-1.5 ${subTextClass}`} style={{ fontSize: 12 }}>
                        {siteConfig.currency} / شهرياً
                      </span>
                    </div>
                  );
                })()}
              </div>

              <ul className="flex flex-col gap-2.5 flex-1">
                {plan.features.map((f, fi) => (
                  <li
                    key={fi}
                    className={`flex items-center gap-2.5 ${
                      plan.highlighted ? "text-slate-300" : "text-[#64748B]"
                    }`}
                    style={{ fontSize: 14 }}
                  >
                    <Check size={11} className="text-[#C8A75D] flex-shrink-0" strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href={`https://wa.me/${siteConfig.whatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                  `مرحباً، أنا مهتم بباقة ${plan.name} في سند`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`button-plan-${plan.id}`}
                className={`w-full py-3.5 rounded-xl text-sm font-semibold text-center transition-colors ${
                  plan.highlighted
                    ? "bg-[#C8A75D] hover:bg-[#B8902A] text-[#1E293B]"
                    : "bg-[#1E293B] hover:bg-[#0F172A] text-white"
                }`}
              >
                {plan.cta}
              </a>
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <a
            href="/pricing#comparison"
            className="text-sm font-semibold text-[#1E293B] underline decoration-[#C8A75D] decoration-2 underline-offset-4 hover:text-[#8A6D2F] transition-colors"
          >
            شوف مقارنة تفصيلية كاملة بين كل الباقات
          </a>
        </div>
      </div>
    </section>
  );
}
