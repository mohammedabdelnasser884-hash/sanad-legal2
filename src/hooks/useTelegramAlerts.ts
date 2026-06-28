import React, { useEffect, useCallback, useRef } from 'react';
import { loadOfficeSetting } from '../constants';
import { escapeTelegramHtml, toast } from '../utils';
import { db } from '../supabaseClient';
import { recordError, recordSuccess, getFailedServices, HEALTH_EVENT } from '../systemHealth';

export function useTelegramAlerts(profile: any) {
    const tgRef = useRef({token:null, chat:null, loaded:false});

    const refreshHealth = useCallback(() => {
        window.dispatchEvent(new Event(HEALTH_EVENT));
    }, []);

    const loadTgConfig = useCallback(async () => {
        if(tgRef.current.loaded) return;
        const [t, c] = await Promise.all([
            loadOfficeSetting('tg_token'),
            loadOfficeSetting('tg_chat'),
        ]);
        tgRef.current = { token: t, chat: c, loaded: true };
    }, []);

    useEffect(()=>{ if(profile) loadTgConfig(); },[profile]);

    const sendTelegram = async (text) => {
        try {
            if(!tgRef.current.loaded) await loadTgConfig();
            const { token, chat } = tgRef.current;
            if(!token || !chat) return; // لا إرسال لو الإعدادات غير مضبوطة
            const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({chat_id: chat, text, parse_mode:'HTML'})
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                recordError('telegram', json?.description);
                refreshHealth();
            } else {
                recordSuccess('telegram');
                refreshHealth();
            }
        } catch(e: any) {
            console.error('Telegram error', e);
            recordError('telegram', e?.message);
            refreshHealth();
        }
    };

    useEffect(()=>{
        if(!profile) return;

        const fmt = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');

        const buildSessionMsg = (sessions, byId, label, emoji) => {
            // ⚠️ label وكل قيم القضية/الجلسة دول نص حر — لازم escapeTelegramHtml
            // قبل الدمج، وإلا < أو > غير متوازن جوه عنوان قضية أو ملاحظة هيخلي
            // تيليجرام يرفض الرسالة كلها (parse_mode: 'HTML').
            let msg=`${emoji} <b>${escapeTelegramHtml(label)}</b>\n\n`;
            sessions.forEach((s,i)=>{
                const c=byId[s.case_id]||{};
                msg+=`${i+1}. ⚖️ <b>${escapeTelegramHtml(c.title||'—')}</b>\n`;
                msg+=`   📋 رقم القيد: ${escapeTelegramHtml(c.case_number_official||'—')}\n`;
                msg+=`   🏛 المحكمة: ${escapeTelegramHtml(c.court_name||'—')}\n`;
                msg+=`   📆 تاريخ الجلسة: ${escapeTelegramHtml(s.session_date)}\n`;
                if(c.plaintiff) msg+=`   🟢 المدعي: ${escapeTelegramHtml(c.plaintiff)}\n`;
                if(c.defendant) msg+=`   🔴 المدعى عليه: ${escapeTelegramHtml(c.defendant)}\n`;
                if(s.description) msg+=`   📝 ${escapeTelegramHtml(s.description)}\n`;
                msg+='\n';
            });
            return msg;
        };

        const checkSessions = async () => {
            const now = new Date();
            const hour = now.getHours();
            const today = new Date();
            const after24 = new Date(today); after24.setDate(today.getDate()+1);
            const after48 = new Date(today); after48.setDate(today.getDate()+2);
            const todayStr=fmt(today), after24Str=fmt(after24), after48Str=fmt(after48);

            // ساعة 9 صباحاً — إشعارات اليوم والغد وبعد غد
            if(hour === 9){
                const {data:sessions}=await db.from('case_sessions').select('session_date,case_id,description').in('session_date',[todayStr,after24Str,after48Str]);
                if(sessions&&sessions.length>0){
                    const caseIds=[...new Set(sessions.map(s=>s.case_id))];
                    const {data:casesData}=await db.from('cases').select('id,title,case_number_official,court_name,plaintiff,defendant').in('id',caseIds);
                    const byId={};(casesData||[]).forEach(c=>byId[c.id]=c);
                    const todaySess=sessions.filter(s=>s.session_date===todayStr);
                    const tmrwSess =sessions.filter(s=>s.session_date===after24Str);
                    const day2Sess =sessions.filter(s=>s.session_date===after48Str);
                    if(todaySess.length>0) await sendTelegram(buildSessionMsg(todaySess,byId,`🔴 تنبيه — جلسات اليوم ${todayStr}`,'🔴'));
                    if(tmrwSess.length>0)  await sendTelegram(buildSessionMsg(tmrwSess, byId,`🟡 تذكير — جلسات الغد ${after24Str} (بعد 24 ساعة)`,'🟡'));
                    if(day2Sess.length>0)  await sendTelegram(buildSessionMsg(day2Sess, byId,`🔵 تذكير — جلسات بعد غد ${after48Str} (بعد 48 ساعة)`,'🔵'));
                }
            }

            // ساعة 7 مساءً — تذكير بتحديث الجلسات التي حدثت اليوم
            if(hour === 19){
                const {data:todaySessions}=await db.from('case_sessions').select('session_date,case_id,description,result').eq('session_date',todayStr);
                if(todaySessions&&todaySessions.length>0){
                    const caseIds=[...new Set(todaySessions.map(s=>s.case_id))];
                    const {data:casesData}=await db.from('cases').select('id,title,case_number_official,court_name,plaintiff,defendant').in('id',caseIds);
                    const byId={};(casesData||[]).forEach(c=>byId[c.id]=c);
                    let msg=`🔔 <b>تذكير — تحديث الجلسات</b>\n`;
                    msg+=`━━━━━━━━━━━━━━━━━━━━\n`;
                    msg+=`يرجى تحديث نتيجة الجلسات التالية التي انعقدت اليوم ${todayStr}:\n\n`;
                    todaySessions.forEach((s,i)=>{
                        const c=byId[s.case_id]||{};
                        msg+=`${i+1}. ⚖️ <b>${escapeTelegramHtml(c.title||'—')}</b>\n`;
                        msg+=`   📋 رقم القيد: ${escapeTelegramHtml(c.case_number_official||'—')}\n`;
                        msg+=`   🏛 المحكمة: ${escapeTelegramHtml(c.court_name||'—')}\n`;
                        if(c.plaintiff) msg+=`   🟢 المدعي: ${escapeTelegramHtml(c.plaintiff)}\n`;
                        if(c.defendant) msg+=`   🔴 المدعى عليه: ${escapeTelegramHtml(c.defendant)}\n`;
                        msg+=`   📝 النتيجة: ${escapeTelegramHtml(s.result||'⚠️ لم تُحدَّث بعد')}\n\n`;
                    });
                    msg+=`\n📲 افتح التطبيق وسجّل الإجراء الجديد لكل جلسة.`;
                    await sendTelegram(msg);
                }
            }
        };

        // فحص فوري عند فتح التطبيق (بغض النظر عن الساعة - مرة واحدة فقط)
        // فحص كل ساعة — يرسل فقط لو الساعة 9 أو 7 مساءً
        const wrappedCheck = async () => {
            try {
                await checkSessions();
                recordSuccess('session_scheduler');
                refreshHealth();
            } catch(e: any) {
                recordError('session_scheduler', e?.message);
                refreshHealth();
            }
        };
        wrappedCheck();
        const interval = setInterval(wrappedCheck, 60*60*1000);
        return()=>clearInterval(interval);
    },[profile,refreshHealth]);

    // ─ تسجيل الخروج ─

  return { sendTelegram };
}
