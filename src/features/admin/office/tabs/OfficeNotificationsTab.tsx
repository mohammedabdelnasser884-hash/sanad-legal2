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
    // جوه accordion قابل للطي. النسخة دي (تعديل ثاني نفس اليوم) مبسّطة أكتر
    // بلغة عادية جدًا لمستخدم أول مرة يستخدم تليجرام غير الشات — كل خطوة
    // مقسّمة لحركات صغيرة (فين تدوس بالظبط)، وشيلنا البديل التقني (رابط
    // getUpdates) والاعتماد بالكامل على طريقة @getidsbot لأنها أسهل بصريًا.
    // السيناريو المشروح: بوت واحد فقط (نفس التوكن يتكرر في الحقلين)،
    // ومجموعتين منفصلتين (كل مجموعة Chat ID مختلف تمامًا).
    React.createElement('div', { className: "bg-[#25d366]/10 border border-[#25d366]/25 rounded-2xl p-4 space-y-3" },
      React.createElement('div', { className: "flex items-center gap-2" },
        React.createElement('span', { className: "text-base" }, '📘'),
        React.createElement('p', { className: "text-[11px] font-black text-white" }, "إزاي تشغّل إشعارات تليجرام؟")
      ),
      React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
        "عشان تستقبل إشعارات تليجرام (التذكيرات اليومية بالجلسات والمهام، والتنبيهات الفورية) لازم تملأ الحقول الأربعة تحت. من غير ما الحقول دي تتملأ، الإشعارات مش هتشتغل خالص. الدليل تحت يشرحلك كل حركة بالتفصيل حتى لو أول مرة تستخدم تليجرام في غير الشات العادي."
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
          React.createElement('p', { className: "text-[10px] font-black text-white" }, "1️⃣ اعمل \"بوت\" (حساب مخصوص يبعت الإشعارات)"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "البوت هو مجرد حساب على تليجرام زي أي شخص تتكلم معه بالشات، بس مهمته إنه يبعتلك الإشعارات تلقائي. اتبع الخطوات دي بالترتيب:"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• افتح تطبيق تليجرام"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• دوس على أيقونة البحث 🔍 فوق، واكتب:"
          ),
          React.createElement('p', { className: "text-[10px] text-emerald-300 leading-relaxed", style: { fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' } }, "BotFather"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• هيظهرلك حساب اسمه \"BotFather\" وجنبه علامة ✔ زرقاء — دوس عليه، وبعدين دوس على زرار \"Start\" لو ظهر"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• في خانة كتابة الرسالة تحت، اكتب الكلمة دي بالظبط وابعتها:"
          ),
          React.createElement('p', { className: "text-[10px] text-emerald-300", style: { fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' } }, "/newbot"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• هيسألك اسم للبوت — اكتب أي اسم يعجبك (مثلاً \"إشعارات مكتبي\") وابعته"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• هيسألك يوزر للبوت — لازم يكون حروف/أرقام إنجليزي وينتهي لازم بكلمة bot (مثلاً mkatby_bot) وابعته"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• لو اليوزر مقبول، هيبعتلك رسالة فيها سطر طويل شكله كده:"
          ),
          React.createElement('p', { className: "text-[9px] text-slate-500", style: { fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' } }, "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• السطر ده هو الـ Bot Token. اعمله نسخ (Copy) واحفظه لحد ما نحتاجه في خطوة 5. هتستخدم نفس البوت ده للمجموعتين، فمفيش داعي تعمل الخطوة دي تاني."
          )
        ),

        // خطوة 2: عمل مجموعتين
        React.createElement('div', { className: "space-y-1 pt-2 border-t border-white/5" },
          React.createElement('p', { className: "text-[10px] font-black text-white" }, "2️⃣ اعمل مجموعتين جديدتين"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "محتاج مجموعتين (Groups) منفصلتين — واحدة تستقبل فيها التذكيرات اليومية، والتانية تستقبل فيها التنبيهات الفورية. لو عندك تليجرام على الموبايل، اعمل الآتي مرتين (مرة لكل مجموعة):"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• دوس على أيقونة القلم ✏️ أو العلامة + العايمة (غالبًا تحت على يمين الشاشة)"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• اختار \"New Group\" (مجموعة جديدة)"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• تليجرام هيطلب تختار شخص واحد على الأقل تضيفه — اختار نفسك أو أي حد تحب يستقبل الإشعارات، ودوس السهم للتالي"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• اكتب اسم للمجموعة، مثلاً \"تذكيرات المكتب\" للمجموعة الأولى، و \"تنبيهات المكتب\" للمجموعة الثانية — وأكّد الإنشاء"
          )
        ),

        // خطوة 3: إضافة البوت
        React.createElement('div', { className: "space-y-1 pt-2 border-t border-white/5" },
          React.createElement('p', { className: "text-[10px] font-black text-white" }, "3️⃣ ضيف البوت جوه المجموعتين"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "لازم تضيف البوت اللي عملته في خطوة 1 كعضو داخل كل مجموعة من الاتنين (كرّر الخطوات دي مرتين):"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• افتح المجموعة، ودوس على اسمها فوق"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• دوس \"Add Members\" (إضافة أعضاء)"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• في خانة البحث، اكتب يوزر البوت اللي اختاره (اللي خلّص بـ bot)، دوس عليه لما يظهر، وأكّد الإضافة"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "مفيش داعي تخليه Admin، عضو عادي كافي."
          )
        ),

        // خطوة 4: جيب Chat ID
        React.createElement('div', { className: "space-y-1 pt-2 border-t border-white/5" },
          React.createElement('p', { className: "text-[10px] font-black text-white" }, "4️⃣ جيب رقم كل مجموعة (Chat ID)"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "كل مجموعة عندها رقم تعريف خاص بيها، لازم تجيبه لكل مجموعة على حدة. أسهل طريقة تضيف بوت جاهز اسمه:"
          ),
          React.createElement('p', { className: "text-[10px] text-emerald-300", style: { fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' } }, "@getidsbot"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "بنفس طريقة خطوة 3 بالظبط (بحث عن اليوزر ده وإضافته كعضو) — بس في هذه الحالة هتضيفه مؤقتًا فقط. اتبع كده:"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• ضيف @getidsbot عضو في المجموعة (زي خطوة 3)"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• على طول هيبعت رسالة تلقائية في المجموعة فيها أرقام، من ضمنها رقم قدامه كلمة \"id\" (ده هو Chat ID المطلوب)"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• انسخ الرقم ده كامل واحفظه (هيكون فيه علامة سالب في الأول)"
          ),
          React.createElement('p', { className: "text-[10px] text-rose-300 leading-relaxed" },
            "🔴 لازم يفضل فيه علامة السالب (-) في أول الرقم لما تنسخه، ده طبيعي وصحيح، سيبه زي ما هو من غير ما تشيله."
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• دلوقتي تقدر تشيل @getidsbot من المجموعة (مش هتحتاجه تاني)، من إعدادات المجموعة → الأعضاء → دوس عليه → Remove"
          ),
          React.createElement('p', { className: "text-[10px] text-amber-300 leading-relaxed" },
            "⚠️ كرّر الخطوة دي في المجموعة الثانية كمان عشان تجيب رقمها هي كمان (رقم مختلف تمامًا عن الأول)."
          )
        ),

        // خطوة 5: التسجيل في الحقول
        React.createElement('div', { className: "space-y-1 pt-2 border-t border-white/5" },
          React.createElement('p', { className: "text-[10px] font-black text-white" }, "5️⃣ حطّ البيانات في الحقول تحت"),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "دلوقتي معاك: توكن واحد (من خطوة 1)، ورقمين مختلفين (من خطوة 4، واحد لكل مجموعة). حطّهم كده:"
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• الصق نفس التوكن في خانة \"Bot Token\" تحت قسم \"بوت التذكيرات اليومية\""
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• الصق نفس التوكن (فعلاً نفسه بالحرف) في خانة \"Bot Token\" تحت قسم \"بوت التنبيهات الفورية\""
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• الصق رقم مجموعة \"التذكيرات\" في خانة \"Chat ID\" تحت قسم \"بوت التذكيرات اليومية\""
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• الصق رقم مجموعة \"التنبيهات\" في خانة \"Chat ID\" تحت قسم \"بوت التنبيهات الفورية\""
          ),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" },
            "• أخيرًا دوس زرار \"💾 حفظ إعدادات التليجرام\" تحت"
          )
        )
      ),

      React.createElement('p', { className: "text-[10px] text-slate-400 leading-relaxed pt-1 border-t border-white/10" },
        "لو حصلت أي لخبطة في أي خطوة أو مش لاقي حاجة زي ما هي متوصّفة، تواصل مع الدعم الفني وهيسعدهم يكملوا معاك الإعداد خطوة بخطوة لحد ما يشتغل تمام."
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
