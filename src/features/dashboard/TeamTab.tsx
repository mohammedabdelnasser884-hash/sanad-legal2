import React from 'react';
import { I } from '../../constants';
import type { ProfileRow } from '../../types';

interface TeamTabProps {
    lawyers: ProfileRow[];
    setShowLawyerModal: (v: boolean) => void;
}

function TeamTab({ lawyers, setShowLawyerModal }: TeamTabProps) {
  return React.createElement(React.Fragment, null,
        React.createElement('div',{className:"flex items-center justify-between"},
            React.createElement('h3',{className:"text-sm font-black text-white"},"إدارة فريق المحامين"),
            React.createElement('button',{onClick:()=>setShowLawyerModal(true),className:"flex items-center bg-gradient-to-tr from-blue-500 to-blue-400 text-white px-3 py-2 rounded-xl text-xs font-black shadow-lg gap-1 active:scale-95 transition-transform"},
                React.createElement(I.Plus),"إضافة مستخدم")
        ),
        lawyers.length===0
            ?React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-8 text-center text-slate-500 text-xs"},"لا يوجد مستخدمون مضافون بعد")
            :React.createElement('div',{className:"space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 xl:grid-cols-3"},
                // 🆕 Phase 3 (تقرير تشخيص تجربة سطح المكتب — 15 أغسطس): نفس
                // نمط FeesTab/RemindersTab — كارت العضو بلا width ثابت ولا
                // حالة داخلية، فبيتوزع في شبكة على الديسكتوب بدل عمود واحد
                // ممتد. الموبايل صفر تغيير.
                lawyers.map((l: ProfileRow)=>
                    React.createElement('div',{key:l.id,className:"bg-premium-card border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-3"},
                        React.createElement('div',{className:"flex items-center gap-3"},
                            React.createElement('div',{className:`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${l.role==='admin'?'bg-blue-500/20 text-blue-400':'bg-amber-500/10 text-premium-gold'}`},
                                (l.full_name||'م').charAt(0)
                            ),
                            React.createElement('div',null,
                                React.createElement('p',{className:"text-xs font-black text-white"},l.full_name),
                                React.createElement('p',{className:"text-[10px] text-slate-500"},l.email||'')
                            )
                        ),
                        React.createElement('span',{className:`text-[9px] font-bold px-2 py-1 rounded-full ${l.role==='admin'?'bg-blue-500/10 text-blue-400':'bg-amber-500/10 text-premium-gold'}`},
                            l.role==='admin'?'مدير مكتب':'محامي'
                        )
                    )
                )
              )
  );
}
export default TeamTab;
