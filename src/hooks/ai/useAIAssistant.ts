import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db } from '../../supabaseClient';
import { loadOfficeSetting, COUNTRY_CONFIGS } from '../../constants';
import { toast, escapeHtml } from '../../utils';

// النماذج المتاحة — يجب أن تطابق ALLOWED_MODELS في edge function ai-chat
const GROQ_MODELS = [
    { id: 'llama-3.3-70b-versatile',  label: 'Llama 3.3 · 70B (موصى به)' },
    { id: 'llama-3.1-70b-versatile',  label: 'Llama 3.1 · 70B' },
    { id: 'llama-3.1-8b-instant',     label: 'Llama 3.1 · 8B (سريع)' },
    { id: 'mixtral-8x7b-32768',       label: 'Mixtral · 8x7B' },
];

export function useAIAssistant(cases: any[], clients: any[], profile: any, country: string) {
    const [mode, setMode] = useState('chat');
    const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
    // ملحوظة أمان: مفتاح Groq بقى مخزّن على السيرفر فقط ولا يوصل للمتصفح إطلاقاً.
    // الفرونت إند بقى بس يعرف "فيه مفتاح مضبوط ولا لأ" (hasKey)، عشان يقرر
    // يعرض شاشة "ضبط المفتاح" أو لأ — مش هو اللي بيستخدم المفتاح في النداء.
    const [hasKey, setHasKey] = useState(null); // null = لسه بنتحقق
    const [keyLoading, setKeyLoading] = useState(true);
    const [showKeyInput, setShowKeyInput] = useState(false);

    // ── نتحقق إن في مفتاح مضبوط للمكتب (من غير ما نجيب قيمته) ──
    useEffect(() => {
        let cancelled = false;
        const tenantId = profile?.tenant_id ?? null;
        const checkKey = async () => {
            setKeyLoading(true);
            if (!tenantId) { if (!cancelled) { setHasKey(false); setKeyLoading(false); } return; }
            try {
                const { data } = await db.from('office_settings').select('id').eq('tenant_id', tenantId).not('groq_key', 'is', null).limit(1).maybeSingle();
                if (!cancelled) setHasKey(!!data?.id);
            } catch(e) {
                if (!cancelled) setHasKey(false);
            } finally {
                if (!cancelled) setKeyLoading(false);
            }
        };
        checkKey();
        return () => { cancelled = true; };
    }, [profile?.tenant_id]);


    // ── Topics persisted in localStorage — مفتاح مخصص لكل مستخدم ──
    // ⚠️ لو المفتاح ثابت، محامي تاني على نفس الجهاز يشوف محادثات زميله
    const userId = profile?.id || profile?.user_id || 'guest';
    const TOPICS_KEY = `sanad_ai_topics_v2_${userId}`;
    const loadTopics = () => { try { return JSON.parse(localStorage.getItem(TOPICS_KEY)||'[]'); } catch(e){ return []; } };
    const saveTopics = (t) => { try { localStorage.setItem(TOPICS_KEY, JSON.stringify(t)); } catch(e){} };

    const [topics, setTopics] = useState(() => loadTopics());
    const [activeTopicId, setActiveTopicId] = useState(() => { const t = loadTopics(); return t.length > 0 ? t[0].id : null; });
    const [showTopics, setShowTopics] = useState(false);

    const activeCfgEarly = COUNTRY_CONFIGS[country||'SA'];
    const welcomeMsg = {role:'assistant', text:'مرحباً ⚖️ أنا مستشارك القانوني المتخصص في قانون '+activeCfgEarly.name+'.\n\nفي كل رد سأقدم لك:\n📋 التكييف القانوني الدقيق\n⚖️ نصوص المواد حرفياً مع أرقامها\n📚 مصدر القانون ورقمه وسنته\n🏛️ أحكام المحاكم ذات الصلة\n💡 التطبيق العملي الواقعي\n⚠️ تنبيهات إجرائية مهمة\n\nاسألني في أي مسألة قانونية.'};

    const activeMessages = useMemo(() => {
        const t = topics.find(t => t.id === activeTopicId);
        return t ? t.messages : [welcomeMsg];
    }, [topics, activeTopicId]);

    const setMessages = (msgs) => {
        setTopics(prev => {
            let updated;
            const resolvedMsgs = typeof msgs === 'function' ? msgs(activeMessages) : msgs;
            if (!activeTopicId) {
                const newId = 'topic_' + Date.now();
                const firstUser = resolvedMsgs.find(m => m.role === 'user');
                const title = firstUser ? firstUser.text.replace(/\[سياق.*?\]/g,'').trim().substring(0, 35) : 'موضوع جديد';
                updated = [{ id: newId, title, createdAt: Date.now(), messages: resolvedMsgs }, ...prev];
                setActiveTopicId(newId);
            } else {
                updated = prev.map(t => t.id === activeTopicId ? { ...t, messages: resolvedMsgs } : t);
            }
            saveTopics(updated);
            return updated;
        });
    };

    const messages = activeMessages;

    const newTopic = () => { setActiveTopicId(null); setShowTopics(false); };
    const deleteTopic = (id) => {
        setTopics(prev => {
            const updated = prev.filter(t => t.id !== id);
            saveTopics(updated);
            if (activeTopicId === id) setActiveTopicId(updated.length > 0 ? updated[0].id : null);
            return updated;
        });
    };
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedCase, setSelectedCase] = useState(null);
    const [docType, setDocType] = useState('مذكرة_دفاع');
    const [docFields, setDocFields] = useState({
        plaintiff:'', plaintiffRole:'', defendant:'', defendantRole:'', caseNumber:'', court:'', subject:'', facts:'', claims:'', lawyerName: profile?.full_name||''
    });
    const [generatedDoc, setGeneratedDoc] = useState('');
    const [generatingDoc, setGeneratingDoc] = useState(false);
    const [copied, setCopied] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const today = new Date().toLocaleDateString('ar-SA-u-nu-latn', {year:'numeric',month:'long',day:'numeric'});

    useEffect(()=>{
        messagesEndRef.current?.scrollIntoView({behavior:'smooth'});
    },[messages, loading]);

    const activeCfg = COUNTRY_CONFIGS[country||'SA'];
    const DOC_TEMPLATES = {
        'مذكرة_دفاع': {label:'مذكرة دفاع', icon:'⚖️', color:'blue'},
        'صحيفة_دعوى': {label:'صحيفة دعوى', icon:'📋', color:'purple'},
        'توكيل_رسمي': {label:'توكيل رسمي', icon:'📜', color:'amber'},
        'عقد_اتفاق': {label:'عقد اتفاق', icon:'🤝', color:'emerald'},
    };

    const SYSTEM_PROMPT = `أنت مستشار قانوني متخصص في قوانين ${activeCfg.name}، تعمل لصالح سَنَد.
المحامي: ${profile?.full_name||'المحامي'} | التاريخ: ${today}

في كل رد اتبع هذا الهيكل:
**📋 التكييف القانوني** — طبيعة المسألة وفرعها.
**⚖️ النصوص القانونية** — نص المادة حرفياً مع رقمها واسم قانونها.
**📚 المصادر** — اسم القانون ورقمه وسنته.
**🏛️ أحكام المحاكم** — إن وجدت.
**💡 التطبيق العملي** — الرأي الواقعي والإجراء الأنسب.
**⚠️ تنبيهات إجرائية** — مواعيد التقادم والشروط الحاسمة.

قواعد: اكتب النصوص حرفياً، الرد بالعربية الفصحى، اذكر الخلاف الفقهي إن وجد.
• المحاكم المختصة: ${activeCfg.courts.join('، ')}`;

    // ══════════════════════════════════════════
    //  Legal RAG: بناء كتلة السياق القانوني من المواد المسترجعة
    // ══════════════════════════════════════════
    const buildLegalContextBlock = (articles, forDocument = false) => {
        const confidenceLine = forDocument
            ? ''
            : '\nاختم ردك دائماً بسطر مستقل بصيغة: "مستوى الثقة: [مرتفع/متوسط/منخفض]" حسب مدى ارتباط هذه المواد المسترجعة بالسؤال المطروح.';

        if (!articles || articles.length === 0) {
            return `

═══ قاعدة المعرفة القانونية الداخلية ═══
لم يتم العثور على مواد قانونية ذات صلة بهذا السؤال داخل قاعدة القوانين المخزنة في النظام.
أجب بناءً على معرفتك القانونية العامة فقط، ووضّح بصراحة أن الإجابة استرشادية وتعتمد على المعرفة العامة فقط ولم يتم العثور على نصوص مطابقة في قاعدة القوانين المخزنة.${forDocument ? '' : '\nاختم ردك دائماً بسطر مستقل بصيغة: "مستوى الثقة: منخفض (لا توجد مواد مسترجعة من قاعدة المعرفة)".'}`;
        }
        const list = articles.map(a =>
            `• ${a.law_title}${a.law_number ? ` رقم ${a.law_number}` : ''}${a.law_year ? ` لسنة ${a.law_year}` : ''} — المادة ${a.article_number}:
"${(a.article_text||'').slice(0,300)}"`
        ).join('\n\n');

        return `

═══ مواد قانونية مسترجعة من قاعدة المعرفة الداخلية (اعتمد عليها كمصدر أساسي) ═══
${list}

تعليمات صارمة بشأن المواد أعلاه:
- اعتمد على هذه المواد كمصدر أساسي عند الإجابة، واذكر اسم القانون ورقم المادة بدقة عند الاستناد إلى أي منها.
- لا تخترع مطلقاً مواد قانونية أو أرقام مواد أو أحكام غير موجودة في هذه القائمة أو في معرفتك الموثوقة.
- إذا لم تكن هذه المواد كافية وحدها للإجابة الكاملة على السؤال، وضّح ذلك صراحةً واستكمل بمعرفتك العامة مع التنبيه إلى ذلك.${confidenceLine}`;
    };

    // ══════════════════════════════════════════
    //  Legal RAG: البحث النصي عن المواد القانونية (Full-Text Search)
    // ══════════════════════════════════════════
    const MIN_RANK = 0.01;
    const retrieveLegalArticles = async (query) => {
        try {
            const { data: matches, error } = await db.rpc('search_law_articles', {
                query_text: query,
                match_count: 3,
            });
            if (error) {
                toast('❌ حدث خطأ في البحث القانوني', true);
                return [];
            }
            if (!matches) return [];
            return matches.filter(a => a.rank >= MIN_RANK);
        } catch (e) {
            toast('❌ حدث خطأ في البحث القانوني', true);
            return [];
        }
    };

    const saveKey = async (k) => {
        const tenantId = profile?.tenant_id ?? null;
        if (!tenantId) { toast('❌ تعذر تحديد المكتب الحالي', true); return; }
        try {
            const { data: existing } = await db.from('office_settings').select('id').eq('tenant_id', tenantId).limit(1).maybeSingle();
            if (existing?.id) {
                await db.from('office_settings').update({ groq_key: k }).eq('id', existing.id);
            } else {
                await db.from('office_settings').insert({ groq_key: k, tenant_id: tenantId });
            }
            setHasKey(true);
            setShowKeyInput(false);
            toast('✅ تم حفظ API Key بأمان على السيرفر');
        } catch(e) {
            toast('❌ فشل حفظ API Key', true);
        }
    };

    // ── نداء المساعد القانوني عبر الإيدج فانكشن ai-chat (المفتاح يفضل على السيرفر) ──
    const callAI = async (prompt, history, legalContextBlock = '') => {
        const chatMessages = history
            ? history.map(m=>({role: m.role==='assistant'?'assistant':'user', content: m.text}))
            : [{role:'user', content: prompt}];
        const { data, error } = await db.functions.invoke('ai-chat', {
            body: {
                messages: chatMessages,
                system_prompt: SYSTEM_PROMPT + legalContextBlock,
                max_tokens: 1500,
                temperature: 0.3,
                model: selectedModel,
            },
        });
        if (error) throw new Error(error.message || 'تعذر الاتصال بالمساعد القانوني');
        if (data?.error) throw new Error(data.error);
        return data?.content || 'لم يتم الحصول على رد.';
    };

    const MAX_HISTORY_MESSAGES = 16; // آخر 8 أسئلة + 8 ردود

    const sendMessage = async () => {
        const text = input.trim();
        if (!text || loading || keyLoading) return;
        if (!hasKey) { setShowKeyInput(true); return; }
        setInput('');
        const caseContext = selectedCase
            ? ` [سياق القضية: ${selectedCase.title} | النوع: ${selectedCase.type||selectedCase.case_type} | المحكمة: ${selectedCase.court_name} | الحالة: ${selectedCase.status}]`
            : '';
        const newMessages = [...messages, {role:'user', text: text + caseContext}];
        setMessages(prev=>[...prev, {role:'user', text}]);
        setLoading(true);
        try {
            const retrieved = await retrieveLegalArticles(text);
            const legalContextBlock = buildLegalContextBlock(retrieved);
            // قطّع التاريخ قبل الإرسال لتجنب تجاوز context window
            const trimmedMessages = newMessages.slice(-MAX_HISTORY_MESSAGES);
            const reply = await callAI(null, trimmedMessages, legalContextBlock);
            setMessages(p=>[...p,{role:'assistant',text:reply, references: retrieved}]);
        } catch(e) {
            const msg = e.message?.includes('401')||e.message?.includes('invalid')||e.message?.includes('key') ? '🔑 API Key غير صحيح. اضغط زر المفتاح لتحديثه.' : '⚠️ تعذر الاتصال: '+e.message;
            setMessages(p=>[...p,{role:'assistant',text:msg}]);
        }
        setLoading(false);
    };

    const generateDocument = async () => {
        if (!hasKey) { setShowKeyInput(true); return; }
        setGeneratingDoc(true);
        setGeneratedDoc('');
        const caseInfo = selectedCase
            ? `القضية: ${selectedCase.title}\nالمحكمة: ${selectedCase.court_name}\nالنوع: ${selectedCase.type||selectedCase.case_type}`
            : '';
        const isMemo = docType === 'مذكرة_دفاع';
        const memoHeader = `سَنَد
المحامي: ${docFields.lawyerName||profile?.full_name||'المحامي'}
────────────────────────────
مذكرة دفاع
────────────────────────────
مقدمة من: ${docFields.plaintiff}${docFields.plaintiffRole?' — بصفته: '+docFields.plaintiffRole:''}
ضـد: ${docFields.defendant}${docFields.defendantRole?' — بصفته: '+docFields.defendantRole:''}
رقم الدعوى: ${docFields.caseNumber||selectedCase?.case_number_official||'—'}
المحكمة المختصة: ${docFields.court||selectedCase?.court_name||activeCfg.courts[0]}
الجلسة المحددة: ${today}
الموضوع: ${docFields.subject}
────────────────────────────`;

        const prompt = isMemo ? `أنت محامٍ خبير في قوانين ${activeCfg.name}. الترويسة وبيانات القضية جاهزة أدناه — المطلوب منك فقط أن تكمل المذكرة بعدها مباشرةً بالأقسام الآتية بالترتيب، بلغة قانونية رسمية رصينة، بدون أي تعليق أو شرح خارج نص المذكرة:

${memoHeader}

اكتب بعد هذا السطر مباشرةً:

أولاً — الوقائع:
[فقرة وقائع مفصلة ومنظمة بناءً على: ${docFields.facts}]

ثانياً — الدفوع القانونية:
[دفوع موضوعية وشكلية مرقّمة (أولاً، ثانياً، ثالثاً، رابعاً...) تشمل: الدفع الرئيسي، الدفع الاحتياطي، أي دفع شكلي أو إجرائي — بصياغة قانونية رصينة]

ثالثاً — الأسانيد القانونية:
[استشهاد صريح بمواد ${activeCfg.referenceCode} وأحكام محكمة النقض/التمييز ذات الصلة بالنزاع، مرقّمة بنفس الترتيب]

رابعاً — بناءً عليه:
بناءً على ما تقدم، يلتمس الحاضر عن موكله الحكم بـ:
[الطلبات الختامية بناءً على: ${docFields.claims}]

${activeCfg.closing}
المحامي / ${docFields.lawyerName||profile?.full_name||'المحامي'}
التاريخ: ${today}
${caseInfo}

تعليمات الصياغة: لا تُعد كتابة الترويسة أو بيانات القضية — ابدأ من "أولاً — الوقائع:" مباشرةً. لا تضع عناوين بين ** **. العناوين تُكتب هكذا: "أولاً — الوقائع:" فقط.`
        : ('أنشئ '+(DOC_TEMPLATES[docType]?.label||'')+' قانونية كاملة ورسمية باللغة العربية بالصياغة الرسمية المعتمدة في '+activeCfg.name+' وفق '+activeCfg.legalSystem+'\n\nترويسة المستند:\n'+activeCfg.docHeader+'\n'+activeCfg.greeting+'\n\nبيانات المستند:\n'+(docType==='توكيل_رسمي'?('الموكِّل: '+docFields.plaintiff+'\nالموكَّل (المحامي): '+(docFields.lawyerName||profile?.full_name||'المحامي')+'\nموضوع التوكيل: '+docFields.subject+'\nرقم القضية: '+(docFields.caseNumber||'—')+'\nالمحكمة: '+(docFields.court||selectedCase?.court_name||'—')):('الموكل: '+docFields.plaintiff+(docFields.plaintiffRole?' (بصفته: '+docFields.plaintiffRole+')':'')+'\nالخصم: '+docFields.defendant+(docFields.defendantRole?' (بصفته: '+docFields.defendantRole+')':'')+'\nرقم القضية: '+(docFields.caseNumber||selectedCase?.case_number_official||'—')+'\nالمحكمة: '+(docFields.court||selectedCase?.court_name||activeCfg.courts[0]||'—')+'\nموضوع '+(DOC_TEMPLATES[docType]?.label||'')+': '+docFields.subject+'\nالوقائع والأسانيد: '+docFields.facts+'\nالطلبات: '+docFields.claims))+'\n\n'+caseInfo+'\n\nتعليمات الصياغة القانونية الاحترافية:\n١. ابدأ بـ '+(activeCfg.name==='المملكة العربية السعودية'?'البسملة ثم ':'')+'المقدمة الرسمية المعتمدة في '+activeCfg.name+'\n٢. في صلب الوثيقة، استشهد صراحةً بنصوص المواد القانونية حرفياً مع ذكر: اسم القانون + رقمه + سنته\n٣. أضف أي إسناد قضائي ذي صلة من محاكم '+activeCfg.name+' مع: رقم الطعن والسنة والمبدأ\n٤. الطلبات الختامية تكون محددة وقانونية\n٥. اختم بـ "'+activeCfg.closing+'" ثم توقيع المحامي والتاريخ\n٦. اكتب الوثيقة فقط — لا تضف أي شرح أو تعليق خارجها');
        try {
            const retrievalQuery = [docFields.subject, docFields.facts, docFields.claims].filter(Boolean).join(' — ');
            const retrieved = retrievalQuery ? await retrieveLegalArticles(retrievalQuery) : [];
            const legalContextBlock = buildLegalContextBlock(retrieved, true);
            const reply = await callAI(prompt, null, legalContextBlock);
            setGeneratedDoc(isMemo ? memoHeader + '\n\n' + reply : reply);
        } catch(e) {
            setGeneratedDoc('⚠️ حدث خطأ أثناء توليد المستند، يرجى المحاولة مرة أخرى');
        }
        setGeneratingDoc(false);
    };

    const copyDoc = () => {
        navigator.clipboard?.writeText(generatedDoc).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2500);});
    };

    const printDoc = () => {
        const w = window.open('','_blank');
        // ⚠️ generatedDoc نص حر (من مدخلات المستخدم ورد الـ AI) ولازم يتهرّب
        // قبل الدمج في HTML خام، وإلا ممكن ينفّذ كود في نافذة الطباعة (XSS).
        w.document.write(`<html dir="rtl"><head><meta charset="UTF-8"><title>مستند قانوني</title><link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap" rel="stylesheet"><style>body{font-family:'Amiri','Cairo',serif;padding:40px;line-height:2.2;font-size:13px;color:#111;direction:rtl;text-align:right;}pre{white-space:pre-wrap;font-family:'Amiri','Cairo',serif;}@page{margin:2cm;}</style></head><body><pre>${escapeHtml(generatedDoc)}</pre></body></html>`);
        w.document.close();
        w.document.fonts.ready.then(() => { setTimeout(() => { w.focus(); w.print(); }, 300); });
    };

    const downloadPDF = () => {
        try {
            const docLabel = escapeHtml(DOC_TEMPLATES[docType]?.label || 'مستند قانوني');
            const officeName = 'سَنَد'; // ثابت — لا يحتاج تهريب
            const lawyerName = escapeHtml(docFields.lawyerName || profile?.full_name || 'المحامي');

            // تحويل النص لـ HTML مع تمييز العناوين
            const lines = generatedDoc.split('\n');
            let htmlContent = '';
            lines.forEach(line => {
                const t = line.trim();
                if (!t) { htmlContent += '<div style="height:10px"></div>'; return; }
                const isHeading = t.length < 70 && (
                    t.match(/^(أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|بناءً|الوقائع|الدفاع|الطلبات|مقدمة|خاتمة|بسم الله|التوقيع|الاستشهاد)/) ||
                    t.endsWith(':') || t.startsWith('────')
                );
                const isDivider = t.startsWith('────');
                // ⚠️ t نص حر (من رد الـ AI/مدخلات المستخدم) — لازم escapeHtml
                // قبل إدراجه في HTML خام، وإلا ممكن ينفّذ كود في نافذة الطباعة.
                const safeT = escapeHtml(t);
                if (isDivider) {
                    htmlContent += `<hr style="border:none;border-top:1.5px solid #c8a84b;margin:14px 0;">`;
                } else if (isHeading) {
                    htmlContent += `<p style="font-weight:700;font-size:13px;color:#8b5e05;margin:14px 0 5px;border-bottom:1px solid #e8d5a0;padding-bottom:3px;">${safeT}</p>`;
                } else {
                    htmlContent += `<p style="margin:4px 0;font-size:12px;color:#1a1a1a;line-height:2;">${safeT}</p>`;
                }
            });

            const printHTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${docLabel}</title>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Amiri', 'Cairo', serif;
    direction: rtl;
    text-align: right;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #1a1a1a;
    font-size: 13px;
    line-height: 2;
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 20mm 18mm 18mm 18mm;
    background: #fff;
    position: relative;
  }
  .header-box {
    text-align: center;
    border-bottom: 2.5px solid #c8a84b;
    padding-bottom: 14px;
    margin-bottom: 18px;
  }
  .office-name {
    font-size: 20px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: 0.5px;
  }
  .lawyer-name {
    font-size: 14px;
    color: #555;
    margin-top: 4px;
  }
  .doc-type-badge {
    display: inline-block;
    background: #c8a84b;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 14px;
    border-radius: 20px;
    margin-top: 8px;
    letter-spacing: 0.5px;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 20px;
    background: #fdf8ee;
    border: 1px solid #e8d5a0;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 18px;
    font-size: 11.5px;
  }
  .meta-row { display: flex; gap: 6px; }
  .meta-label { color: #8b5e05; font-weight: 700; white-space: nowrap; }
  .meta-value { color: #1a1a1a; }
  .body-content { margin-top: 6px; }
  .footer {
    position: fixed;
    bottom: 14mm;
    left: 18mm;
    right: 18mm;
    text-align: center;
    font-size: 9px;
    color: #aaa;
    border-top: 0.5px solid #ddd;
    padding-top: 6px;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { margin: 0; padding: 15mm 14mm 14mm 14mm; }
    .footer { position: fixed; bottom: 8mm; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header-box">
    <div class="office-name">${officeName}</div>
    <div class="lawyer-name">المحامي / ${lawyerName}</div>
    <div class="doc-type-badge">${docLabel}</div>
  </div>

  <div class="meta-grid">
    <div class="meta-row"><span class="meta-label">المدعي:</span><span class="meta-value">${escapeHtml(docFields.plaintiff || '—')}</span></div>
    <div class="meta-row"><span class="meta-label">المدعى عليه:</span><span class="meta-value">${escapeHtml(docFields.defendant || '—')}</span></div>
    <div class="meta-row"><span class="meta-label">رقم الدعوى:</span><span class="meta-value">${escapeHtml(docFields.caseNumber || selectedCase?.case_number_official || '—')}</span></div>
    <div class="meta-row"><span class="meta-label">المحكمة:</span><span class="meta-value">${escapeHtml(docFields.court || selectedCase?.court_name || activeCfg?.courts?.[0] || '—')}</span></div>
    <div class="meta-row"><span class="meta-label">تاريخ الجلسة:</span><span class="meta-value">${escapeHtml(today)}</span></div>
    <div class="meta-row"><span class="meta-label">الموضوع:</span><span class="meta-value">${escapeHtml(docFields.subject || '—')}</span></div>
  </div>

  <div class="body-content">
    ${htmlContent}
  </div>

  <div class="footer">⚖️ سَنَد — نظام التشغيل القانوني — وثيقة سرية | ${today}</div>
</div>
<${'script'}>
  // انتظر تحميل الخط ثم اطبع
  document.fonts.ready.then(() => {
    setTimeout(() => { window.print(); }, 400);
  });
  window.onafterprint = () => window.close();
</${'script'}>
</body>
</html>`;

            const w = window.open('', '_blank');
            if (!w) { toast('❌ السماح بالنوافذ المنبثقة مطلوب', true); return; }
            w.document.write(printHTML);
            w.document.close();
            toast('📥 جاري فتح نافذة الطباعة/الحفظ...');
        } catch(err) {
            toast('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true);
        }
    };

    const sf=(k,v)=>setDocFields(p=>({...p,[k]:v}));
    const colorMap = {blue:'from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-300', purple:'from-purple-500/20 to-purple-500/5 border-purple-500/30 text-purple-300', amber:'from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-300', emerald:'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-300'};


  return {
    mode, setMode,
    selectedModel, setSelectedModel, GROQ_MODELS,
    hasKey, keyLoading, showKeyInput, setShowKeyInput, saveKey,
    messages, setMessages, input, setInput, loading, setLoading,
    topics, setTopics, activeTopicId, setActiveTopicId,
    showTopics, setShowTopics, newTopic, deleteTopic,
    selectedCase, setSelectedCase,
    docType, setDocType, docFields, sf,
    generatedDoc, setGeneratedDoc, generatingDoc,
    copied, copyDoc, printDoc, downloadPDF, generateDocument,
    sendMessage, inputRef, messagesEndRef,
    today, activeCfg, DOC_TEMPLATES, colorMap,
  };
}
