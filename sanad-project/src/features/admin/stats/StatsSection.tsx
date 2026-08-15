import React from 'react';
import { formatArNumber, formatArTime } from '../../../shared/ui/arabicLocale';
import { COUNTRY_CONFIGS } from '../../../constants';
import type { MonthlyTrendPoint, CaseStatusBreakdown } from './hooks/useAdminStats';

interface StatsSectionProps {
  casesTotal: number;
  clientsTotal: number;
  grandTotal: number;
  grandPaid: number;
  grandRemaining: number;
  collectedRate: number;
  loadingFeesStats: boolean;
  country: string;
  monthlyTrend: MonthlyTrendPoint[];
  sessionsThisWeek: number;
  overdueReminders: number;
  overdueSessions: number;
  caseStatusBreakdown: CaseStatusBreakdown;
  lastUpdatedAt: number | null;
  isStale: boolean;
}

const fmt = (n: number) => formatArNumber(n, { maximumFractionDigits: 0 });

// ─────────────────────────────────────────────────────────
//  Design tokens موحّدة للقسم كله — 3 أحجام خط بس (بدل الأرقام
//  العشوائية اللي كانت متكررة بقيم قريبة من بعض: 10.5/9.5/9/8.5px).
//  أي كارت جديد يتضاف هنا يستخدم من الـ3 دول، مش يخترع حجم جديد.
// ─────────────────────────────────────────────────────────
const LABEL_SIZE = '10px';     // عناوين الكروت الصغيرة
const VALUE_PRIMARY = '28px';  // الأرقام الرئيسية (هيرو + إجمالي الأتعاب)
const VALUE_SECONDARY = '18px';// أرقام الكروت التشغيلية

// لون شريط نسبة التحصيل بيتغيّر حسب القيمة — أحمر تحذيري للنسب الضعيفة،
// أصفر للمتوسطة، أخضر بس لو فعلاً كويسة. قبل كده كان أخضر ثابت دايمًا
// حتى لو النسبة 15%، وده بيفقد الشريط قيمته كمؤشر بصري.
function rateColors(rate: number) {
  if (rate < 40) return { from: '#f87171', to: '#ef4444', glow: 'rgba(248,113,113,0.6)', text: '#f87171' };
  if (rate < 70) return { from: '#fbbf24', to: '#f59e0b', glow: 'rgba(251,191,36,0.6)',  text: '#fbbf24' };
  return { from: '#4ade80', to: '#22c55e', glow: 'rgba(74,222,128,0.6)', text: '#4ade80' };
}

// خط علوي متوهج — نفس النمط في كل الكروت بدون استثناء (كان قسم "تقسيم
// القضايا" الوحيد اللي مستثنى، بقى موحّد دلوقتي).
function GlowTopLine({ color, glow, inset = '14px' }: { color: string; glow: string; inset?: string }) {
  return React.createElement('div', {
    style: {
      position: 'absolute', top: 0, right: inset, left: inset,
      height: '2px', borderRadius: '0 0 4px 4px',
      background: color, boxShadow: `0 0 10px ${glow}`,
    },
  });
}

// عنوان مجموعة موحّد — يُستخدم فوق كل مجموعة كروت (نظرة عامة / الأتعاب /
// تشغيل) بنفس الحجم واللون بالضبط، بدل ما كل قسم يكتب نفس الفكرة بحجم
// وألوان مختلفة شوية عن التاني.
function GroupHeader({ title }: { title: string }) {
  return React.createElement('p', {
    className: 'font-black tracking-widest px-1',
    style: { fontSize: LABEL_SIZE, color: '#64748b' },
  }, title);
}

// بطاقة "هيرو" كبيرة (عدد القضايا / عدد الموكلين) — رقم ضخم في المنتصف
// وأيقونة خلفية شبحية شفافة، بديل عن مربع الإحصائيات الصغير التقليدي.
function HeroCountCard({
  label, value, icon, accent, glow,
}: { label: string; value: number; icon: React.ReactNode; accent: string; glow: string }) {
  return React.createElement('div', {
    style: {
      background: `linear-gradient(160deg, ${accent}14, ${accent}05)`,
      border: `1px solid ${accent}2e`,
      borderRadius: '18px',
      padding: '16px',
      position: 'relative',
      overflow: 'hidden',
      minHeight: '108px',
    },
  },
    // أيقونة خلفية كبيرة شفافة
    React.createElement('div', {
      style: {
        position: 'absolute', left: '-6px', bottom: '-10px',
        width: '64px', height: '64px', color: accent, opacity: 0.12,
      },
    }, icon),
    React.createElement(GlowTopLine, { color: accent, glow }),
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', color: accent } },
      React.createElement('div', { className: 'w-4 h-4' }, icon),
      React.createElement('p', { className: 'font-black tracking-wide', style: { fontSize: LABEL_SIZE } }, label)
    ),
    React.createElement('p', {
      className: 'font-black',
      style: { color: '#f1f5f9', fontSize: VALUE_PRIMARY, lineHeight: 1, marginTop: '14px', direction: 'ltr', textAlign: 'right' },
    }, fmt(value))
  );
}

// ─────────────────────────────────────────────────────────
//  أيقونات SVG محلية موحّدة — نفس النمط (viewBox 24x24، stroke،
//  strokeWidth 1.5) لكل أيقونة في القسم، مش SVG هنا وإيموجي هناك.
// ─────────────────────────────────────────────────────────
const CasesGlyph = () => React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5' },
  React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M12 3v18M5 7l-2.5 5A3 3 0 0 0 5 15a3 3 0 0 0 2.5-3L5 7Zm14 0l-2.5 5A3 3 0 0 0 19 15a3 3 0 0 0 2.5-3L19 7ZM5 7h14M9 21h6' }));
const ClientsGlyph = () => React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5' },
  React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z' }));
const CalendarGlyph = () => React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5' },
  React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M6.75 3v2.25M17.25 3v2.25M3.75 7.5h16.5M4.5 6h15a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75h-15a.75.75 0 0 1-.75-.75V6.75A.75.75 0 0 1 4.5 6ZM7.5 12h3v3h-3v-3Z' }));
const BellGlyph = () => React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5' },
  React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M14.857 17.082a23.85 23.85 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022 23.847 23.847 0 0 0 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0' }));

// رسم بياني بسيط (أعمدة مزدوجة) لمقارنة "المستحق" بـ"المحصّل" شهريًا آخر
// 6 شهور — SVG يدوي بنفس نمط باقي الملف، من غير أي مكتبة رسم بياني خارجية.
const TREND_VB_W = 300, TREND_VB_H = 112, TREND_PLOT_H = 74, TREND_PLOT_TOP = 8;

function TrendChart({ data }: { data: MonthlyTrendPoint[] }) {
  const maxVal = Math.max(1, ...data.flatMap((d) => [d.total, d.paid]));
  const hasAnyData = data.some((d) => d.total > 0 || d.paid > 0);
  const groupW = TREND_VB_W / data.length;
  const barGap = 3;
  const barW = (groupW - barGap * 3) / 2;

  const bars = data.flatMap((m, i) => {
    const x0 = i * groupW + barGap;
    const totalH = (m.total / maxVal) * TREND_PLOT_H;
    const paidH  = (m.paid  / maxVal) * TREND_PLOT_H;
    return [
      React.createElement('rect', {
        key: `t-${m.key}`, x: x0, y: TREND_PLOT_TOP + (TREND_PLOT_H - totalH),
        width: barW, height: Math.max(totalH, 0.5), rx: 2,
        fill: 'rgba(148,163,184,0.35)',
      }),
      React.createElement('rect', {
        key: `p-${m.key}`, x: x0 + barW + barGap, y: TREND_PLOT_TOP + (TREND_PLOT_H - paidH),
        width: barW, height: Math.max(paidH, 0.5), rx: 2,
        fill: '#C9A84C',
      }),
      React.createElement('text', {
        key: `l-${m.key}`, x: x0 + barW + barGap / 2, y: TREND_PLOT_TOP + TREND_PLOT_H + 14,
        fontSize: '7.5', fill: '#64748b', fontWeight: 700, textAnchor: 'middle',
      }, m.label),
    ];
  });

  return React.createElement('div', { style: { marginTop: '14px' } },
    // ── عنوان صريح لمدى الرسم — عشان يتفصل بصريًا عن رقم "كل الوقت" فوقه ──
    React.createElement('p', { className: 'font-bold text-slate-500 mb-2', style: { fontSize: '9px' } }, 'اتجاه التحصيل — آخر 6 شهور'),
    // ── Legend ──
    React.createElement('div', { className: 'flex items-center gap-3 mb-2' },
      React.createElement('div', { className: 'flex items-center gap-1' },
        React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: 'rgba(148,163,184,0.35)', display: 'inline-block' } }),
        React.createElement('span', { className: 'text-[9px] font-bold text-slate-500' }, 'مستحق')
      ),
      React.createElement('div', { className: 'flex items-center gap-1' },
        React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: '#C9A84C', display: 'inline-block' } }),
        React.createElement('span', { className: 'text-[9px] font-bold', style: { color: '#C9A84C' } }, 'محصّل')
      )
    ),
    hasAnyData
      ? React.createElement('svg', { viewBox: `0 0 ${TREND_VB_W} ${TREND_VB_H}`, style: { width: '100%', height: '108px' } }, ...bars)
      : React.createElement('p', { className: 'text-[10px] font-bold text-slate-600 text-center py-6' }, 'لا توجد بيانات كافية آخر 6 شهور')
  );
}

// شريط تقسيم القضايا حسب الحالة (نشطة/مؤجلة/منتهية/غير مصنّفة) — شريط أفقي
// واحد متعدد الألوان بدل دونات، أوضح وأسهل قراءة على شاشة موبايل ضيقة.
function CaseStatusBar({ data, casesTotal }: { data: CaseStatusBreakdown; casesTotal: number }) {
  const segments = [
    { key: 'active',   label: 'نشطة',   value: data.active,   color: '#60a5fa' },
    { key: 'deferred', label: 'مؤجلة',  value: data.deferred, color: '#fbbf24' },
    { key: 'closed',   label: 'منتهية', value: data.closed,   color: '#94a3b8' },
    ...(data.other > 0 ? [{ key: 'other', label: 'غير مصنّفة', value: data.other, color: '#475569' }] : []),
  ].filter((s) => s.value > 0);

  const total = Math.max(1, casesTotal);

  if (segments.length === 0) {
    return React.createElement('p', { className: 'text-[10px] font-bold text-slate-600 text-center py-3' }, 'لا توجد قضايا بعد');
  }

  return React.createElement('div', { style: { marginTop: '10px' } },
    React.createElement('div', {
      style: { display: 'flex', height: '10px', borderRadius: '999px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)' },
    },
      segments.map((s) => React.createElement('div', {
        key: s.key,
        style: { width: `${(s.value / total) * 100}%`, background: s.color, transition: 'width 0.4s ease' },
      }))
    ),
    React.createElement('div', { className: 'flex flex-wrap items-center gap-x-3 gap-y-1 mt-2' },
      segments.map((s) => React.createElement('div', { key: s.key, className: 'flex items-center gap-1' },
        React.createElement('span', { style: { width: '7px', height: '7px', borderRadius: '2px', background: s.color, display: 'inline-block' } }),
        React.createElement('span', { className: 'text-[9px] font-bold text-slate-500' }, `${s.label} ${fmt(s.value)}`)
      ))
    )
  );
}

// كارت تشغيلي صغير (جلسات الأسبوع / تذكيرات متأخرة) — نفس تركيب
// HeroCountCard (خط متوهج + أيقونة SVG + label + رقم) بحجم أصغر، بدل
// النمط المختلف اللي كان يستخدم إيموجي جوه فقرة نص عادية.
function OpsStatCard({
  label, value, icon, color, bg, border,
}: { label: string; value: number; icon: React.ReactNode; color: string; bg: string; border: string }) {
  return React.createElement('div', {
    style: { background: bg, border: `1px solid ${border}`, borderRadius: '13px', padding: '12px 10px', position: 'relative', overflow: 'hidden' },
  },
    React.createElement(GlowTopLine, { color, glow: `${color}99`, inset: '12px' }),
    React.createElement('div', { className: 'flex items-center gap-1.5', style: { color } },
      React.createElement('div', { className: 'w-3.5 h-3.5' }, icon),
      React.createElement('p', { className: 'font-bold text-slate-500', style: { fontSize: LABEL_SIZE } }, label)
    ),
    React.createElement('p', { className: 'font-black mt-1', style: { color, fontSize: VALUE_SECONDARY } }, fmt(value))
  );
}

function StatsSection({
  casesTotal, clientsTotal, grandTotal, grandPaid, grandRemaining, collectedRate, loadingFeesStats, country, monthlyTrend,
  sessionsThisWeek, overdueReminders, overdueSessions, caseStatusBreakdown, lastUpdatedAt, isStale,
}: StatsSectionProps) {
  const currency = COUNTRY_CONFIGS[country || 'EG']?.currency || 'جنيه مصري';
  const rc = rateColors(collectedRate);

  return React.createElement('div', { className: 'space-y-5' },

    // ══════════════════════════════════════════
    //  مجموعة 1: نظرة عامة — القضايا والموكلين
    // ══════════════════════════════════════════
    React.createElement('div', { className: 'space-y-2.5' },
      React.createElement(GroupHeader, { title: 'نظرة عامة' }),

      React.createElement('div', { className: 'grid grid-cols-2 gap-2.5' },
        React.createElement(HeroCountCard, {
          label: 'عدد القضايا', value: casesTotal,
          icon: React.createElement(CasesGlyph), accent: '#60a5fa', glow: 'rgba(96,165,250,0.6)',
        }),
        React.createElement(HeroCountCard, {
          label: 'عدد الموكلين', value: clientsTotal,
          icon: React.createElement(ClientsGlyph), accent: '#a78bfa', glow: 'rgba(167,139,250,0.6)',
        })
      ),

      React.createElement('div', {
        style: {
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '16px', padding: '14px', position: 'relative', overflow: 'hidden',
        },
      },
        React.createElement(GlowTopLine, { color: '#94a3b8', glow: 'rgba(148,163,184,0.5)' }),
        React.createElement('p', { className: 'font-black text-slate-500 tracking-wide', style: { fontSize: LABEL_SIZE } }, 'تقسيم القضايا حسب الحالة'),
        React.createElement(CaseStatusBar, { data: caseStatusBreakdown, casesTotal })
      )
    ),

    // ══════════════════════════════════════════
    //  مجموعة 2: الأتعاب
    // ══════════════════════════════════════════
    React.createElement('div', { className: 'space-y-2.5' },
      React.createElement(GroupHeader, { title: 'الأتعاب' }),

      React.createElement('div', {
        'data-testid': 'admin-stats-fees-card',
        style: {
          background: 'linear-gradient(160deg, rgba(201,168,76,0.10), rgba(201,168,76,0.02))',
          border: '1px solid rgba(201,168,76,0.22)',
          borderRadius: '18px', padding: '16px', position: 'relative', overflow: 'hidden',
        },
      },
        React.createElement(GlowTopLine, { color: '#C9A84C', glow: 'rgba(201,168,76,0.6)' }),
        React.createElement('div', { className: 'flex items-center justify-between' },
          React.createElement('p', { className: 'font-black tracking-wide', style: { fontSize: LABEL_SIZE, color: '#C9A84C' } }, 'إجمالي الأتعاب — كل الوقت'),
          loadingFeesStats
            ? React.createElement('span', { className: 'text-[9.5px] text-slate-500 font-medium' }, 'بيتحدّث...')
            : lastUpdatedAt && React.createElement('span', { className: 'text-[9px] font-medium', style: { color: isStale ? '#fb7185' : '#64748b' } },
                isStale ? `⚠️ بيانات محفوظة — ${formatArTime(lastUpdatedAt)}` : `آخر تحديث ${formatArTime(lastUpdatedAt)}`)
        ),
        React.createElement('p', {
          className: 'font-black', style: { color: '#f1f5f9', fontSize: VALUE_PRIMARY, lineHeight: 1, marginTop: '8px', direction: 'ltr', textAlign: 'right' },
        }, `${fmt(grandTotal)} ${currency}`),

        // شريط التحصيل
        React.createElement('div', { style: { marginTop: '14px' } },
          React.createElement('div', {
            style: { height: '8px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative' },
          },
            React.createElement('div', {
              style: {
                height: '100%', width: `${Math.min(100, Math.max(0, collectedRate))}%`,
                background: `linear-gradient(90deg,${rc.from},${rc.to})`,
                boxShadow: `0 0 8px ${rc.glow}`,
                borderRadius: '999px', transition: 'width 0.4s ease, background 0.4s ease',
              },
            })
          ),
          React.createElement('div', { className: 'flex items-center justify-between mt-1.5' },
            React.createElement('span', { className: 'font-bold', style: { fontSize: '9.5px', color: rc.text } }, `نسبة التحصيل ${collectedRate}%`)
          )
        ),

        // محصّل / متبقي
        React.createElement('div', { className: 'grid grid-cols-2 gap-2 mt-3' },
          React.createElement('div', {
            style: { background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: '13px', padding: '10px 6px 9px', textAlign: 'center' },
          },
            React.createElement('p', { className: 'font-bold text-slate-500', style: { fontSize: LABEL_SIZE } }, 'محصّل'),
            React.createElement('p', { className: 'font-black mt-0.5', style: { color: '#4ade80', fontSize: '14px', direction: 'ltr' } }, fmt(grandPaid))
          ),
          React.createElement('div', {
            style: { background: 'rgba(251,113,133,0.06)', border: '1px solid rgba(251,113,133,0.15)', borderRadius: '13px', padding: '10px 6px 9px', textAlign: 'center' },
          },
            React.createElement('p', { className: 'font-bold text-slate-500', style: { fontSize: LABEL_SIZE } }, 'متبقي'),
            React.createElement('p', { className: 'font-black mt-0.5', style: { color: '#fb7185', fontSize: '14px', direction: 'ltr' } }, fmt(grandRemaining))
          )
        ),

        // اتجاه التحصيل آخر 6 شهور
        React.createElement(TrendChart, { data: monthlyTrend })
      )
    ),

    // ══════════════════════════════════════════
    //  مجموعة 3: تشغيل — جلسات وتذكيرات
    // ══════════════════════════════════════════
    React.createElement('div', { className: 'space-y-2.5' },
      React.createElement(GroupHeader, { title: 'تشغيل' }),
      // جلسات الأسبوع الجاي — بمفردها فوق (نظرة عامة على الأسبوع القادم)
      React.createElement(OpsStatCard, {
        label: 'جلسات الأسبوع الجاي', value: sessionsThisWeek,
        icon: React.createElement(CalendarGlyph), color: '#60a5fa',
        bg: 'rgba(96,165,250,0.06)', border: 'rgba(96,165,250,0.15)',
      }),
      // جلسات متأخرة + تذكيرات متأخرة — جنب بعض تحت، الاتنين "محتاجين تدخل"
      React.createElement('div', { className: 'grid grid-cols-2 gap-2.5' },
        React.createElement(OpsStatCard, {
          label: overdueSessions > 0 ? 'جلسات متأخرة' : 'لا توجد جلسات متأخرة',
          value: overdueSessions,
          icon: React.createElement(CalendarGlyph),
          color: overdueSessions > 0 ? '#fb7185' : '#4ade80',
          bg: overdueSessions > 0 ? 'rgba(251,113,133,0.08)' : 'rgba(74,222,128,0.06)',
          border: overdueSessions > 0 ? 'rgba(251,113,133,0.2)' : 'rgba(74,222,128,0.15)',
        }),
        React.createElement(OpsStatCard, {
          label: overdueReminders > 0 ? 'تذكيرات متأخرة' : 'لا توجد تذكيرات متأخرة',
          value: overdueReminders,
          icon: React.createElement(BellGlyph),
          color: overdueReminders > 0 ? '#fb7185' : '#4ade80',
          bg: overdueReminders > 0 ? 'rgba(251,113,133,0.08)' : 'rgba(74,222,128,0.06)',
          border: overdueReminders > 0 ? 'rgba(251,113,133,0.2)' : 'rgba(74,222,128,0.15)',
        })
      )
    )
  );
}

export default StatsSection;
