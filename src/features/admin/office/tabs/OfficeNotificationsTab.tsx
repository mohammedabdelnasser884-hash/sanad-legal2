import React, { useState, useEffect } from 'react';
import { toast } from '../../../../shared/lib/notifications';
import { I, loadOfficeSetting, saveOfficeSetting } from '../../../../constants';
import { db } from '../../../../supabaseClient';
import type { ProfileRow } from '../../../../types';

// ── تاب "الإشعارات (تليجرام)" داخل قسم إعدادات المكتب ──
// منقول من src/pages/Settings/SettingsPage.tsx (section === 'notifications')
// — المرحلة 4 من خطة نقل الإعدادات، وهي الأكثر حساسية لأنها Vault-backed.
// ⚠️ التوكنات (tg_daily_token / tg_instant_token) مخزّنين في Supabase Vault
// ومبيوصلوش للمتصفح إطلاقاً — راجع 09-telegram-token-vault-migration.sql.
// فبدل ما نحمّل القيمة الحقيقية، بنحمّل بس "هل فيه توكن مضبوط ولا لأ"
// (has*Token)، وأي كتابة في حقل التوكن معناها "توكن جديد عايز تحفظه" مش
// تعديل قيمة موجودة. الـ Chat ID (مش سرّي) فضل بيتحمّل/يتحفظ بشكل عادي.
// منطق الحفظ (استدعاء office-secrets Edge Function) نُقل بالحرف بدون أي
// تغيير — فقط تغيّر مكان الاستدعاء (تاب فرعي بدل شاشة إعدادات مستقلة).

interface OfficeNotificationsTabProps {
  profile: ProfileRow | null;
}

interface TgSecretIdsRow {
  tg_daily_token_secret_id: string | null;
  tg_instant_token_secret_id: string | null;
}

function OfficeNotificationsTab({ profile }: OfficeNotificationsTabProps) {
  const [hasTgDailyToken, setHasTgDailyToken] = useState(false);
  const [hasTgInstantToken, setHasTgInstantToken] = useState(false);
  const [tgDailyTokenInput, setTgDailyTokenInput] = useState('');
  const [tgInstantTokenInput, setTgInstantTokenInput] = useState('');
  const [tgDailyChat, setTgDailyChat] = useState('');
  const [tgInstantChat, setTgInstantChat] = useState('');
  const [tgLoaded, setTgLoaded] = useState(false);
  const [tgSaving, setTgSaving] = useState(false);
  const [showTgDailyToken, setShowTgDailyToken] = useState(false);
  const [showTgInstantToken, setShowTgInstantToken] = useState(false);

  // تحميل حالة الإعدادات مرة واحدة عند فتح التاب (بديل شرط
  // section==='notifications' && !tgLoaded القديم — هنا التاب نفسه
  // ما بيتركّبش (mount) غير لما يبقى فعليًا هو المعروض).
  useEffect(() => {
    if (tgLoaded) return;
    const tenantId = profile?.tenant_id ?? null;
    Promise.all([
      loadOfficeSetting('tg_daily_chat'),
      loadOfficeSetting('tg_instant_chat'),
      tenantId
        ? db.from('office_settings').select('tg_daily_token_secret_id,tg_instant_token_secret_id').eq('tenant_id', tenantId).limit(1).maybeSingle()
        : Promise.resolve({ data: null as TgSecretIdsRow | null }),
    ]).then(([dc, ic, secRes]: [string | null, string | null, { data: TgSecretIdsRow | null }]) => {
      setTgDailyChat(dc || ''); setTgInstantChat(ic || '');
      setHasTgDailyToken(!!secRes?.data?.tg_daily_token_secret_id);
      setHasTgInstantToken(!!secRes?.data?.tg_instant_token_secret_id);
      setTgLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (service_role → Vault) بدل الكتابة المباشرة كنص صريح عبر
  // saveOfficeSetting — عشان القيمة الحساسة متعديش على الفرونت إند
  // ولا تتخزن كنص عادي في الجدول. الـ Chat ID فضل بيتحفظ عادي.
  const saveTg = async () => {
    setTgSaving(true);
    try {
      const tasks: Promise<void>[] = [
        saveOfficeSetting('tg_daily_chat', tgDailyChat.trim()),
        saveOfficeSetting('tg_instant_chat', tgInstantChat.trim()),
      ];

      if (tgDailyTokenInput.trim()) {
        tasks.push(
          db.functions.invoke('office-secrets', { body: { action: 'saveTgDailyToken', tg_daily_token: tgDailyTokenInput.trim() } })
            .then(({ data, error }) => {
              if (error || data?.error) throw new Error(data?.error || error?.message);
              setHasTgDailyToken(true);
              setTgDailyTokenInput('');
            })
        );
      }
      if (tgInstantTokenInput.trim()) {
        tasks.push(
          db.functions.invoke('office-secrets', { body: { action: 'saveTgInstantToken', tg_instant_token: tgInstantTokenInput.trim() } })
            .then(({ data, error }) => {
              if (error || data?.error) throw new Error(data?.error || error?.message);
              setHasTgInstantToken(true);
              setTgInstantTokenInput('');
            })
        );
      }

      await Promise.all(tasks);
      toast('✅ تم حفظ إعدادات التليجرام بأمان على السيرفر');
    } catch (err) {
      console.error('saveTg failed:', err);
      toast('❌ فشل حفظ إعدادات التليجرام، حاول مرة أخرى');
    } finally {
      setTgSaving(false);
    }
  };

  return React.createElement('div', { className: "space-y-4 fade-in" },

    // ═══ زرار دليل الإعداد (صفحة HTML، مش PDF) ═══
    // 📘 UPDATED (20 أغسطس 2026، تعديل خامس): جُرِّب PDF مبني بـ Playwright/
    // Chromium مرتين (نسخة مفصّلة غامقة، ثم نسخة أبسط فاتحة بـ pictograms) —
    // اتقفلوا الاتنين لأن سيرفر التوليد مفيهوش خط عربي حقيقي مثبّت (كل خطوط
    // النظام بترجع لنفس fallback ضعيف)، فالـ PDF المُصدَّر كان بخط سيء دايمًا
    // مهما اتغيّر التصميم. الحل: دليل HTML عادي (`telegram-setup-guide.html`
    // في public/docs/) بيتفتح في تاب جديد؛ متصفح المستخدم نفسه هو اللي
    // بيرندر الخط (font-family عادي بدون خط مضمّن)، فبيطلع بخط الموبايل
    // الأصلي بتاعه تلقائيًا. صفحة واحدة تتمرر (مش مقسّمة صفحات PDF)، وشرح كل
    // خطوة أوسع من نسخة الـ PDF التانية (مش مختصر جدًا زي ما كان).
    // 🐛 باگ اتلقّط بعد كده: فتح الملف كان بيرجّع لصفحة لوحة الإدارة بدل ما
    // يفتح الدليل — السبب مش هنا خالص، كان في `vercel.json` (rewrite شامل
    // `/(.*)` بيلقف أي مسار حتى لو ملف ثابت حقيقي زي الـ HTML ده ويحوّله لـ
    // index.html). اتصلح هناك بإضافة negative lookahead يستثني أي مسار له
    // امتداد ملف من الـ rewrite، فالملفات الثابتة في public/ (بما فيها الدليل
    // ده) بقت بتتقدَّم على أي إعادة توجيه.
    React.createElement('div', { className: "bg-[#25d366]/10 border border-[#25d366]/25 rounded-2xl p-4 space-y-3" },
      React.createElement('div', { className: "flex items-center gap-2" },
        React.createElement('span', { className: "text-base" }, '📘'),
        React.createElement('p', { className: "text-[11px] font-black text-white" }, "إزاي تشغّل إشعارات تليجرام؟")
      ),
      React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
        "عشان تستقبل إشعارات تليجرام (التذكيرات اليومية بالجلسات والمهام، والتنبيهات الفورية) لازم تملأ الحقول الأربعة تحت. من غير ما الحقول دي تتملأ، الإشعارات مش هتشتغل خالص."
      ),
      React.createElement('button', {
        onClick: () => window.open('/docs/telegram-setup-guide.html', '_blank'),
        className: "w-full flex items-center justify-between gap-2 py-3 px-3 rounded-xl bg-[#25d366]/15 border border-[#25d366]/40 active:bg-[#25d366]/25"
      },
        React.createElement('span', { className: "text-[10px] font-black text-white flex items-center gap-1.5" }, '📖', "دليل تفعيل إشعارات وتنبيهات تليجرام"),
        React.createElement('span', { className: "text-[9px] text-emerald-300 font-bold" }, "فتح ↗")
      ),
      React.createElement('p', { className: "text-[9px] text-slate-500 leading-relaxed" },
        "الدليل فيه شرح كل خطوة بالتفصيل مع رسومات توضيحية — إنشاء البوت، عمل مجموعتين، وجيب البيانات المطلوبة."
      )
    ),

    // ═══ بوت التذكيرات اليومية ═══
    React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-2xl p-4 space-y-4" },
      React.createElement('div', { className: "flex items-center gap-2 mb-1" },
        React.createElement('span', { className: "text-base" }, '🌅'),
        React.createElement('div', null,
          React.createElement('p', { className: "text-[11px] font-black text-white" }, "بوت التذكيرات اليومية"),
          React.createElement('p', { className: "text-[9px] text-slate-500" }, "رسائل ٨ صباحاً و ٥ مساءاً — جلسات ومهام الغد وبعد غد والفائتة")
        )
      ),
      React.createElement('div', null,
        React.createElement('label', { className: "block text-[10px] font-black text-slate-400 mb-1.5" }, "🤖 Bot Token"),
        React.createElement('div', { className: "relative" },
          React.createElement('input', {
            type: showTgDailyToken ? "text" : "password", value: tgDailyTokenInput,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setTgDailyTokenInput(e.target.value),
            placeholder: hasTgDailyToken ? "•••••••••• (محفوظ — اكتب توكن جديد للتغيير)" : "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ",
            className: "w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
            style: { fontFamily: 'monospace', direction: 'ltr', textAlign: 'left' }
          }),
          React.createElement('button', { onClick: () => setShowTgDailyToken((v: boolean) => !v), className: "absolute left-3 top-3 text-slate-500 text-xs" }, showTgDailyToken ? '🙈' : '👁')
        )
      ),
      React.createElement('div', null,
        React.createElement('label', { className: "block text-[10px] font-black text-slate-400 mb-1.5" }, "💬 Chat ID"),
        React.createElement('input', {
          type: "text", value: tgDailyChat,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setTgDailyChat(e.target.value),
          placeholder: "-1001234567890",
          className: "w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
          style: { fontFamily: 'monospace', direction: 'ltr', textAlign: 'left' }
        })
      )
    ),

    // ═══ بوت التنبيهات الفورية ═══
    React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-2xl p-4 space-y-4" },
      React.createElement('div', { className: "flex items-center gap-2 mb-1" },
        React.createElement('span', { className: "text-base" }, '⚡'),
        React.createElement('div', null,
          React.createElement('p', { className: "text-[11px] font-black text-white" }, "بوت التنبيهات الفورية"),
          React.createElement('p', { className: "text-[9px] text-slate-500" }, "إشعار لحظي عند إضافة/تعديل/حذف قضية أو موكل أو جلسة")
        )
      ),
      React.createElement('div', null,
        React.createElement('label', { className: "block text-[10px] font-black text-slate-400 mb-1.5" }, "🤖 Bot Token"),
        React.createElement('div', { className: "relative" },
          React.createElement('input', {
            type: showTgInstantToken ? "text" : "password", value: tgInstantTokenInput,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setTgInstantTokenInput(e.target.value),
            placeholder: hasTgInstantToken ? "•••••••••• (محفوظ — اكتب توكن جديد للتغيير)" : "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ",
            className: "w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
            style: { fontFamily: 'monospace', direction: 'ltr', textAlign: 'left' }
          }),
          React.createElement('button', { onClick: () => setShowTgInstantToken((v: boolean) => !v), className: "absolute left-3 top-3 text-slate-500 text-xs" }, showTgInstantToken ? '🙈' : '👁')
        )
      ),
      React.createElement('div', null,
        React.createElement('label', { className: "block text-[10px] font-black text-slate-400 mb-1.5" }, "💬 Chat ID"),
        React.createElement('input', {
          type: "text", value: tgInstantChat,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setTgInstantChat(e.target.value),
          placeholder: "-1001234567890",
          className: "w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
          style: { fontFamily: 'monospace', direction: 'ltr', textAlign: 'left' }
        })
      )
    ),

    // زر الحفظ المشترك
    React.createElement('button', {
      onClick: saveTg, disabled: tgSaving,
      className: "w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40",
      style: { background: 'linear-gradient(135deg,#25d366,#128c7e)', color: 'white' }
    }, tgSaving ? React.createElement(React.Fragment, null, React.createElement(I.Spin), "جاري...") : React.createElement(React.Fragment, null, '💾 حفظ إعدادات التليجرام')),

    // حالة الإعدادات
    tgLoaded && React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3" },
      React.createElement('div', { className: "space-y-1.5" },
        React.createElement('p', { className: "text-[9px] font-black text-slate-500" }, "🌅 التذكيرات اليومية"),
        React.createElement('div', { className: "flex items-center gap-2" },
          React.createElement('span', { className: `w-2 h-2 rounded-full ${hasTgDailyToken ? 'bg-emerald-400' : 'bg-rose-400'}` }),
          React.createElement('span', { className: "text-[10px] text-slate-300" }, hasTgDailyToken ? 'Bot Token: محفوظ ✓' : 'غير مضبوط')
        ),
        React.createElement('div', { className: "flex items-center gap-2" },
          React.createElement('span', { className: `w-2 h-2 rounded-full ${tgDailyChat ? 'bg-emerald-400' : 'bg-rose-400'}` }),
          React.createElement('span', { className: "text-[10px] text-slate-300" }, tgDailyChat ? 'Chat ID: محفوظ ✓' : 'غير مضبوط')
        )
      ),
      React.createElement('div', { className: "space-y-1.5 pt-2 border-t border-white/5" },
        React.createElement('p', { className: "text-[9px] font-black text-slate-500" }, "⚡ التنبيهات الفورية"),
        React.createElement('div', { className: "flex items-center gap-2" },
          React.createElement('span', { className: `w-2 h-2 rounded-full ${hasTgInstantToken ? 'bg-emerald-400' : 'bg-rose-400'}` }),
          React.createElement('span', { className: "text-[10px] text-slate-300" }, hasTgInstantToken ? 'Bot Token: محفوظ ✓' : 'غير مضبوط')
        ),
        React.createElement('div', { className: "flex items-center gap-2" },
          React.createElement('span', { className: `w-2 h-2 rounded-full ${tgInstantChat ? 'bg-emerald-400' : 'bg-rose-400'}` }),
          React.createElement('span', { className: "text-[10px] text-slate-300" }, tgInstantChat ? 'Chat ID: محفوظ ✓' : 'غير مضبوط')
        )
      )
    )
  );
}

export default OfficeNotificationsTab;
