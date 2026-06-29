import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast, validateUploadFile } from '../utils';
import { I, COUNTRY_CONFIGS } from '../constants';
import { createPortal } from 'react-dom';
import { db } from '../supabaseClient';
import { loadOfficeSetting, saveOfficeSetting } from "../constants";
import CountrySettings from './CountrySettings';

function SettingsPage({profile, isAdmin, country, onCountryChange, onClose}){
  const [section, setSection]=useState('country');
  const cfg=COUNTRY_CONFIGS[country||'SA'];

  // ── Telegram settings state ──
  const [tgToken, setTgToken] = useState('');
  const [tgChat,  setTgChat]  = useState('');
  const [tgLoaded, setTgLoaded] = useState(false);
  const [tgSaving, setTgSaving] = useState(false);
  const [showTgToken, setShowTgToken] = useState(false);

  // ── Office settings state ──
  const [officeName,    setOfficeName]    = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [officePhone,   setOfficePhone]   = useState('');
  const [officeEmail,   setOfficeEmail]   = useState('');
  const [officeBar,     setOfficeBar]     = useState('');
  const [officeLogo,    setOfficeLogo]    = useState(''); // الشعار المحفوظ فعليًا (رابط Storage)
  const [logoFile,      setLogoFile]      = useState<File|null>(null); // ملف جديد لسه متختار، لحد ما يتم الحفظ
  const [logoPreview,   setLogoPreview]   = useState(''); // معاينة فورية محليّة فقط (Data URL)
  const [logoRemoved,   setLogoRemoved]   = useState(false); // المستخدم دوس "حذف الشعار"
  const [officeLoaded,  setOfficeLoaded]  = useState(false);
  const [officeSaving,  setOfficeSaving]  = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(()=>{
    if(section==='notifications' && !tgLoaded){
      Promise.all([loadOfficeSetting('tg_token'), loadOfficeSetting('tg_chat')])
        .then(([t,c])=>{ setTgToken(t||''); setTgChat(c||''); setTgLoaded(true); });
    }
    if(section==='office' && !officeLoaded){
      Promise.all([
        loadOfficeSetting('office_name'),
        loadOfficeSetting('office_address'),
        loadOfficeSetting('office_phone'),
        loadOfficeSetting('office_email'),
        loadOfficeSetting('office_bar'),
        loadOfficeSetting('office_logo'),
      ]).then(([n,a,p,e,b,l])=>{
        setOfficeName(n||''); setOfficeAddress(a||''); setOfficePhone(p||'');
        setOfficeEmail(e||''); setOfficeBar(b||''); setOfficeLogo(l||'');
        setOfficeLoaded(true);
      });
    }
  },[section]);

  const saveTg = async () => {
    setTgSaving(true);
    try {
      await Promise.all([
        saveOfficeSetting('tg_token', tgToken.trim()),
        saveOfficeSetting('tg_chat',  tgChat.trim()),
      ]);
      toast('✅ تم حفظ إعدادات التليجرام بأمان في السحابة');
    } catch (err) {
      console.error('saveTg failed:', err);
      toast('❌ فشل حفظ إعدادات التليجرام، حاول مرة أخرى');
    } finally {
      setTgSaving(false);
    }
  };

  const saveOffice = async () => {
    setOfficeSaving(true);
    try {
      // ⚠️ كان الكود قبل كده بيخزن الشعار كـ Data URL (base64) كامل جوه
      // عمود نصي في قاعدة البيانات. لأي صورة حقيقية (صورة من الموبايل
      // مثلاً) ده بيبقى نص ضخم (ميجابايتات)، والـ request بتاع التحديث
      // كان بيفشل صامت (Promise.all بترفض، الحقول الصغيرة التانية زي
      // الاسم بتكون خلصت حفظها بالفعل قبل ما تفشل، فيبان إن الاسم
      // محفوظ والشعار لأ). الحل: نرفع الملف على Storage ونخزن رابط
      // صغير فقط، نفس الطريقة المستخدمة في لوحة التحكم (useAdminOffice).
      let logoUrl = officeLogo;
      if (logoFile) {
        const validationError = validateUploadFile(logoFile);
        if (validationError) {
          toast('❌ ' + validationError, true);
          setOfficeSaving(false);
          return;
        }
        const ext = logoFile.name.split('.').pop();
        const path = `office/logo.${ext}`;
        const { error: upErr } = await db.storage.from('client-docs').upload(path, logoFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = db.storage.from('client-docs').getPublicUrl(path);
        // كسر كاش المتصفح/الـ CDN عشان الشعار الجديد يظهر فورًا
        logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      } else if (logoRemoved) {
        logoUrl = '';
      }
      await Promise.all([
        saveOfficeSetting('office_name',    officeName.trim()),
        saveOfficeSetting('office_address', officeAddress.trim()),
        saveOfficeSetting('office_phone',   officePhone.trim()),
        saveOfficeSetting('office_email',   officeEmail.trim()),
        saveOfficeSetting('office_bar',     officeBar.trim()),
        saveOfficeSetting('office_logo',    logoUrl),
      ]);
      setOfficeLogo(logoUrl);
      setLogoFile(null);
      setLogoPreview('');
      setLogoRemoved(false);
      toast('✅ تم حفظ بيانات المكتب بنجاح');
    } catch (err) {
      console.error('saveOffice failed:', err);
      toast('❌ فشل حفظ بيانات المكتب، حاول مرة أخرى');
    } finally {
      setOfficeSaving(false);
    }
  };

  const handleLogoUpload = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateUploadFile(file);
    if (validationError) { toast('❌ ' + validationError, true); return; }
    setLogoFile(file);
    setLogoRemoved(false);
    // معاينة فورية فقط على الشاشة — القيمة دي مش اللي بتُحفظ في قاعدة البيانات
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const sections=[
    {id:'country', label:'الدولة', icon:'🌍'},
    ...(isAdmin ? [{id:'office', label:'المكتب', icon:'🏛️'}] : []),
    {id:'legal', label:'المرجع القانوني', icon:'⚖️'},
    ...(isAdmin ? [{id:'notifications', label:'الإشعارات', icon:'🔔'}] : []),
  ];

  return React.createElement('div',{className:"fixed inset-0 z-50 flex flex-col bg-premium-bg fade-in"},
    // هيدر
    React.createElement('div',{className:"shrink-0 px-4 pt-4 pb-3 border-b border-white/5 bg-premium-card/90 backdrop-blur-lg flex items-center justify-between"},
      React.createElement('div',{className:"flex items-center gap-3"},
        React.createElement('button',{onClick:onClose,className:"w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 active:scale-95"},
          React.createElement(I.ChevronLeft)
        ),
        React.createElement('div',null,
          React.createElement('h2',{className:"text-sm font-black text-white"},"إعدادات سَنَد"),
          React.createElement('p',{className:"text-[10px] text-slate-500 flex items-center gap-1"},
            React.createElement('span',null,cfg?.flag),cfg?.name
          )
        )
      ),
      React.createElement('div',{className:"w-9 h-9 rounded-xl flex items-center justify-center text-lg",style:{background:'rgba(212,175,55,0.1)'}},
        '⚙️'
      )
    ),

    // تبويبات
    React.createElement('div',{className:"shrink-0 px-4 py-3 flex gap-2 border-b border-white/5 overflow-x-auto no-scrollbar"},
      sections.map(s=>
        React.createElement('button',{
          key:s.id,
          onClick:()=>setSection(s.id),
          className:`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition-all ${section===s.id?'bg-premium-gold/15 text-premium-gold border border-premium-gold/30':'bg-white/3 text-slate-400 border border-white/5'}`
        },
          React.createElement('span',null,s.icon), s.label
        )
      )
    ),

    // المحتوى
    React.createElement('div',{className:"flex-1 overflow-y-auto no-scrollbar px-4 py-4 pb-10"},
      section==='country'&&React.createElement(CountrySettings,{currentCountry:country,onCountryChange}),

      section==='office'&&React.createElement('div',{className:"space-y-4 fade-in"},

        // بيانات المحامي الحالي
        React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 flex items-center gap-3"},
          React.createElement('div',{className:"w-12 h-12 rounded-2xl flex items-center justify-center text-premium-bg font-black text-xl shrink-0",style:{background:'linear-gradient(135deg,#D4AF37,#E8C84A)'}},
            (profile?.full_name||'م').charAt(0)
          ),
          React.createElement('div',null,
            React.createElement('p',{className:"text-sm font-black text-white"},profile?.full_name||'—'),
            React.createElement('p',{className:"text-[10px] text-premium-gold font-bold"},profile?.role==='admin'?'مدير المكتب':'محامي'),
            React.createElement('p',{className:"text-[10px] text-slate-500"},profile?.email||'')
          )
        ),

        // شعار المكتب
        React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4"},
          React.createElement('p',{className:"text-[10px] font-black text-slate-400 mb-3"},"🖼 شعار المكتب"),
          React.createElement('div',{className:"flex items-center gap-3"},
            (logoPreview || officeLogo)
              ? React.createElement('img',{src:logoPreview || officeLogo,className:"w-16 h-16 rounded-xl object-contain border border-white/10 bg-white/5"})
              : React.createElement('div',{className:"w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl"},"🏛️"),
            React.createElement('div',{className:"flex-1 space-y-2"},
              React.createElement('button',{
                onClick:()=>logoRef.current?.click(),
                className:"w-full py-2 rounded-xl text-[10px] font-black text-slate-300 border border-white/10 bg-white/5 active:scale-95 transition-all"
              }, (logoPreview || officeLogo) ? "تغيير الشعار" : "رفع شعار المكتب"),
              (logoPreview || officeLogo) && React.createElement('button',{
                onClick:()=>{ setLogoFile(null); setLogoPreview(''); setOfficeLogo(''); setLogoRemoved(true); },
                className:"w-full py-2 rounded-xl text-[10px] font-black text-rose-400 border border-rose-500/20 bg-rose-500/5 active:scale-95 transition-all"
              },"حذف الشعار"),
              React.createElement('input',{ref:logoRef,type:"file",accept:"image/*",className:"hidden",onChange:handleLogoUpload})
            )
          )
        ),

        // حقول بيانات المكتب
        React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3"},
          React.createElement('p',{className:"text-[10px] font-black text-slate-400 mb-1"},"📋 بيانات المكتب الرسمية"),
          ...[
            {label:'اسم المكتب / مكتب المحاماة', value:officeName, set:setOfficeName, placeholder:'مثال: مكتب الأستاذ أحمد للمحاماة'},
            {label:'العنوان', value:officeAddress, set:setOfficeAddress, placeholder:'مثال: القاهرة، مصر الجديدة، ش...'},
            {label:'تليفون المكتب', value:officePhone, set:setOfficePhone, placeholder:'مثال: 01234567890'},
            {label:'البريد الإلكتروني', value:officeEmail, set:setOfficeEmail, placeholder:'مثال: office@example.com'},
          ].map(({label,value,set,placeholder})=>
            React.createElement('div',{key:label},
              React.createElement('label',{className:"block text-[9px] font-black text-slate-500 mb-1"},label),
              React.createElement('input',{
                value,
                onChange:(e:any)=>set(e.target.value),
                placeholder,
                className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-700 font-bold"
              })
            )
          ),

          // زر الحفظ
          React.createElement('button',{
            onClick:saveOffice,
            disabled:officeSaving,
            className:"w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 mt-2 text-premium-bg",
            style:{background:'linear-gradient(135deg,#D4AF37,#E8C84A)'}
          },
            officeSaving
              ? React.createElement(React.Fragment,null,React.createElement(I.Spin),"جاري الحفظ...")
              : React.createElement(React.Fragment,null,'💾',' حفظ بيانات المكتب')
          )
        ),

        // معلومات النظام
        React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-2"},
          React.createElement('p',{className:"text-[10px] font-black text-slate-400 mb-2"},"⚙️ معلومات النظام الحالي"),
          [
            {l:'الدولة المحددة', v:`${cfg?.flag} ${cfg?.name}`},
            {l:'العملة', v:`${cfg?.currency} (${cfg?.currencyCode})`},
            {l:'النظام القانوني', v:cfg?.legalSystem},
            {l:'نظام التاريخ', v:cfg?.calendarNote},
          ].map(({l,v})=>
            React.createElement('div',{key:l,className:"flex items-start gap-2"},
              React.createElement('span',{className:"text-[9px] text-slate-500 w-24 shrink-0 pt-0.5"},l),
              React.createElement('span',{className:"text-[9px] text-slate-300 flex-1 leading-relaxed"},v)
            )
          )
        )
      ),

      section==='legal'&&React.createElement('div',{className:"space-y-4 fade-in"},
        React.createElement('div',{className:"flex items-center gap-3 pb-2 border-b border-white/5"},
          React.createElement('div',{className:"w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center"},'⚖️'),
          React.createElement('div',null,
            React.createElement('h3',{className:"text-sm font-black text-white"},"المراجع القانونية"),
            React.createElement('p',{className:"text-[10px] text-slate-500"},`المستخدمة في ${cfg?.name}`)
          )
        ),
        React.createElement('div',{className:"bg-premium-card border border-purple-500/10 rounded-2xl p-4 space-y-3"},
          React.createElement('p',{className:"text-[10px] font-black text-purple-400 mb-2"},"📚 النص المرجعي الأساسي"),
          React.createElement('p',{className:"text-xs text-white font-bold leading-relaxed"},cfg?.referenceCode)
        ),
        React.createElement('div',{className:"space-y-2.5"},
          React.createElement('p',{className:"text-[10px] font-black text-slate-400"},"🔗 روابط الاستشهاد حسب نوع القضية"),
          Object.entries(cfg?.legalRefs||{}).map(([type,ref])=>{
            const typeNames={civil:'مدني',labor:'عمالي',commercial:'تجاري',criminal:'جزائي'};
            return React.createElement('div',{key:type,className:"bg-premium-card border border-white/5 rounded-xl p-3"},
              React.createElement('p',{className:"text-[9px] font-black text-slate-400 mb-1"},typeNames[type]||type),
              React.createElement('p',{className:"text-[10px] text-slate-300 leading-relaxed"},String(ref||'').replace('{{n}}','[رقم المادة]'))
            );
          })
        ),
        React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4"},
          React.createElement('p',{className:"text-[9px] font-black text-slate-400 mb-2"},"🏛️ قائمة المحاكم الكاملة"),
          React.createElement('div',{className:"space-y-1"},
            (cfg?.courts||[]).map((c,i)=>
              React.createElement('div',{key:c,className:"flex items-center gap-2 py-1"},
                React.createElement('span',{className:"w-5 h-5 rounded-full bg-premium-gold/10 text-premium-gold text-[8px] font-black flex items-center justify-center shrink-0"},i+1),
                React.createElement('span',{className:"text-[10px] text-slate-300"},c)
              )
            )
          )
        )
      ),

      section==='notifications'&&isAdmin&&React.createElement('div',{className:"space-y-4 fade-in"},
        React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-4"},
          React.createElement('div',null,
            React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1.5"},"🤖 Bot Token"),
            React.createElement('div',{className:"relative"},
              React.createElement('input',{
                type:showTgToken?"text":"password", value:tgToken,
                onChange:(e:any)=>setTgToken(e.target.value),
                placeholder:"123456789:ABCdefGHIjklMNOpqrSTUvwxYZ",
                className:"w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
                style:{fontFamily:'monospace',direction:'ltr',textAlign:'left'}
              }),
              React.createElement('button',{onClick:()=>setShowTgToken(v=>!v),className:"absolute left-3 top-3 text-slate-500 text-xs"},showTgToken?'🙈':'👁')
            )
          ),
          React.createElement('div',null,
            React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1.5"},"💬 Chat ID"),
            React.createElement('input',{
              type:"text", value:tgChat,
              onChange:(e:any)=>setTgChat(e.target.value),
              placeholder:"-1001234567890",
              className:"w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
              style:{fontFamily:'monospace',direction:'ltr',textAlign:'left'}
            })
          ),
          React.createElement('button',{
            onClick:saveTg, disabled:tgSaving||(!tgToken.trim()&&!tgChat.trim()),
            className:"w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40",
            style:{background:'linear-gradient(135deg,#25d366,#128c7e)',color:'white'}
          }, tgSaving?React.createElement(React.Fragment,null,React.createElement(I.Spin),"جاري..."):React.createElement(React.Fragment,null,'💾 حفظ تيليجرام'))
        ),
        tgLoaded&&React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-2"},
          React.createElement('div',{className:"flex items-center gap-2"},
            React.createElement('span',{className:`w-2 h-2 rounded-full ${tgToken?'bg-emerald-400':'bg-rose-400'}`}),
            React.createElement('span',{className:"text-[10px] text-slate-300"},tgToken?'Bot Token: محفوظ ✓':'غير مضبوط')
          ),
          React.createElement('div',{className:"flex items-center gap-2"},
            React.createElement('span',{className:`w-2 h-2 rounded-full ${tgChat?'bg-emerald-400':'bg-rose-400'}`}),
            React.createElement('span',{className:"text-[10px] text-slate-300"},tgChat?'Chat ID: محفوظ ✓':'غير مضبوط')
          )
        )
      )
    )
  );
}

export default SettingsPage;
