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
  const [showSetupGuide, setShowSetupGuide] = useState(false);

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

    // ═══ دليل الاستخدام ═══
    // 📘 UPDATED (19 أغسطس 2026): كان الصندوق ده بيوجّه المستخدم للدعم الفني
    // بس من غير ما يشرحله حقيقي. دلوقتي بقى فيه دليل تفصيلي كامل خطوة بخطوة
    // (إنشاء بوت، عمل مجموعتين، جيب التوكن والـ Chat ID) جوه accordion قابل
    // للطي عشان ميكسّرش شكل الصفحة. السيناريو المشروح هو الأبسط والمقصود:
    // بوت واحد فقط (نفس التوكن يتكرر في حقلي "بوت التذكيرات" و"بوت
    // التنبيهات")، ومجموعتين منفصلتين (كل مجموعة لها Chat ID مختلف تمامًا
    // عن التانية — الـ Chat ID خاص بالمجموعة نفسها مش بالبوت).
    React.createElement('div', { className: "bg-[#25d366]/10 border border-[#25d366]/25 rounded-2xl p-4 space-y-3" },
      React.createElement('div', { className: "flex items-center gap-2" },
        React.createElement('span', { className: "text-base" }, '📘'),
        React.createElement('p', { className: "text-[11px] font-black text-white" }, "إزاي تشغّل إشعارات تليجرام؟")
      ),
      React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
        "عشان تستقبل إشعارات تليجرام (التذكيرات اليومية بالجلسات والمهام، والتنبيهات الفورية) لازم تملأ الحقول الأربعة تحت (Bot Token و Chat ID لكل بوت من البوتين). من غير ما الحقول دي تتملأ، الإشعارات مش هتشتغل خالص."
      ),

      // زرار فتح/قفل الدليل التفصيلي
      React.createElement('button', {
        onClick: () => setShowSetupGuide((v: boolean) => !v),
        className: "w-full flex items-center justify-between gap-2 py-2 px-1 -mx-1 rounded-lg active:bg-white/5"
      },
        React.createElement('span', { className: "text-[10px] font-black text-white flex items-center gap-1.5" }, '📖', "دليل الإعداد خطوة بخطوة"),
        React.createElement('span', {
          style: { transform: showSetupGuide ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' },
          className: "text-slate-400"
        }, React.createElement(I.ChevronRight))
      ),

      showSetupGuide && React.createElement('div', { className: "space-y-3 pt-1 border-t border-white/10" },

        // خطوة 1: إنشاء البوت
        React.createElement('div', { className: "space-y-1 pt-2" },
          React.createElement('p', { className: "text-[10px] font-black text-white" }, "1️⃣ اعمل بوت على تليجرام"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "افتح تطبيق تليجرام وابحث عن الحساب "),
          React.createElement('p', { className: "text-[10px] text-emerald-300 leading-relaxed", style: { fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' } }, "@BotFather"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "ابعتله الأمر:"),
          React.createElement('p', { className: "text-[10px] text-emerald-300", style: { fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' } }, "/newbot"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "هيطلب منك اسم للبوت (أي حاجة)، وبعدها يوزر لازم يخلّص بكلمة bot. في الآخر هيبعتلك رسالة فيها Bot Token — رقم وحروف طويلة زي:"),
          React.createElement('p', { className: "text-[9px] text-slate-500", style: { fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' } }, "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "احفظ التوكن ده هتحتاجه بعدين. هتستخدم نفس البوت (نفس التوكن) للمجموعتين — مفيش حاجة تانية مطلوبة من BotFather.")
        ),

        // خطوة 2: عمل مجموعتين
        React.createElement('div', { className: "space-y-1 pt-2 border-t border-white/5" },
          React.createElement('p', { className: "text-[10px] font-black text-white" }, "2️⃣ اعمل مجموعتين (Groups)"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "من تليجرام اعمل مجموعة جديدة (New Group) باسم مثلاً \"تذكيرات المكتب\" للتذكيرات اليومية، ومجموعة تانية منفصلة باسم مثلاً \"تنبيهات المكتب\" للتنبيهات الفورية. تقدر تضيف نفسك بس فيهم، أو أي زملاء عايز يستقبلوا الإشعارات."
          )
        ),

        // خطوة 3: إضافة البوت
        React.createElement('div', { className: "space-y-1 pt-2 border-t border-white/5" },
          React.createElement('p', { className: "text-[10px] font-black text-white" }, "3️⃣ ضيف البوت في المجموعتين"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "في كل مجموعة من الاتنين: افتح إعدادات المجموعة → Add Member → دوّر بيوزر البوت اللي عملته وضيفه كعضو عادي (مفيش داعي تعمله admin)."
          )
        ),

        // خطوة 4: جيب Chat ID
        React.createElement('div', { className: "space-y-1 pt-2 border-t border-white/5" },
          React.createElement('p', { className: "text-[10px] font-black text-white" }, "4️⃣ جيب Chat ID لكل مجموعة"),
          React.createElement('p', { className: "text-[10px] text-amber-300 leading-relaxed" },
            "⚠️ مهم: ابعت أي رسالة عادية في المجموعة الأول (زي \"تمام\") قبل ما تحاول تجيب الـ Chat ID — تليجرام مبيسجّلش المجموعة إلا بعد أول رسالة فيها."
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "أسهل طريقة: ضيف بوت اسمه"),
          React.createElement('p', { className: "text-[10px] text-emerald-300", style: { fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' } }, "@getidsbot"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "مؤقتًا لنفس المجموعة، وهيبعت لك رسالة فيها Chat ID المجموعة على طول — بعد ما تاخده تقدر تشيله من المجموعة تاني."
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "أو بديل تاني: افتح الرابط ده في المتصفح (بعد ما تستبدل TOKEN بالـ Bot Token بتاعك):"
          ),
          React.createElement('p', { className: "text-[9px] text-slate-500 break-all", style: { fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' } }, "https://api.telegram.org/bot<TOKEN>/getUpdates"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "وهتلاقي الـ Chat ID جوه القيمة اللي مكتوب جنبها"),
          React.createElement('span', { className: "text-[10px] text-emerald-300", style: { fontFamily: 'monospace', direction: 'ltr' } }, '"chat":{"id":'),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "كرّر الخطوة دي لكل مجموعة على حدة عشان تجيب رقمها الخاص."
          ),
          React.createElement('p', { className: "text-[10px] text-rose-300 leading-relaxed" },
            "🔴 لاحظ إن Chat ID المجموعات بيبدأ بعلامة سالب (-)، وده طبيعي خليه زي ما هو."
          )
        ),

        // خطوة 5: التسجيل في الحقول
        React.createElement('div', { className: "space-y-1 pt-2 border-t border-white/5" },
          React.createElement('p', { className: "text-[10px] font-black text-white" }, "5️⃣ سجّل البيانات تحت"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "حطّ نفس الـ Bot Token في حقل \"بوت التذكيرات اليومية\" وحقل \"بوت التنبيهات الفورية\" الاتنين (لأنه نفس البوت). وحطّ Chat ID مجموعة \"التذكيرات\" في خانتها، و Chat ID مجموعة \"التنبيهات\" في خانتها — كل واحد في مكانه لأنهم مختلفين. بعد كده دوس \"حفظ إعدادات التليجرام\"."
          )
        )
      ),

      React.createElement('p', { className: "text-[10px] text-slate-400 leading-relaxed pt-1 border-t border-white/10" },
        "لو حصلت أي لخبطة في أي خطوة أو مش لاقي حاجة زي ما هي متوصّفة، تواصل مع الدعم الفني وهيسعدهم يكملوا معاك الإعداد step by step لحد ما يشتغل تمام."
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
