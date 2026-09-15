import React, { useState } from 'react';
import type { ClientRow } from '../../../types';
import type { PortalAccessRow } from './hooks/useAdminPortal';

interface PortalSectionProps {
  clientSearch: string;
  setClientSearch: React.Dispatch<React.SetStateAction<string>>;
  filteredClients: ClientRow[];
  portalAccess: PortalAccessRow[];
  setPortalClient: React.Dispatch<React.SetStateAction<ClientRow | null>>;
  loading?: boolean;
}

type StatusTab = 'all' | 'active' | 'inactive';

function PortalSection({ clientSearch, setClientSearch, filteredClients, portalAccess, setPortalClient, loading }: PortalSectionProps) {
  const [statusTab, setStatusTab] = useState<StatusTab>('all');

  // ⚡ تصنيف موحّد لكل عميل: مفعّل = عنده وصول وهو شغال. غير مفعّل = أي
  // حالة تانية (معطّل صراحةً، أو لسه معملوش إعداد خالص) — الاتنين فعليًا
  // بيوديك لنفس المودال/الإجراء (فتح ClientPortalModal وحفظ)، فمفيش داعي
  // نفرّقهم بتاب منفصل، بس بنميّزهم بتلميح تحت الاسم جوه الكارت نفسه.
  const withStatus = filteredClients.map((client: ClientRow) => {
    const access = portalAccess.find((p: PortalAccessRow) => p.client_id === client.id);
    const hasAccess = !!access;
    const isActive = hasAccess && access?.is_active !== false;
    return { client, hasAccess, isActive };
  });

  const activeCount = withStatus.filter((r) => r.isActive).length;
  const inactiveCount = withStatus.length - activeCount;

  const visible = withStatus.filter((r) => {
    if (statusTab === 'active') return r.isActive;
    if (statusTab === 'inactive') return !r.isActive;
    return true;
  });

  const tabs: Array<{ key: StatusTab; label: string; count: number }> = [
    { key: 'all', label: 'جميع الموكلين', count: withStatus.length },
    { key: 'active', label: 'مفعّل', count: activeCount },
    { key: 'inactive', label: 'غير مفعّل', count: inactiveCount },
  ];

  return React.createElement('div',{className:"space-y-3"},
      // بحث
      React.createElement('div',{className:"relative"},
        React.createElement('input',{
          value:clientSearch,
          onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setClientSearch(e.target.value),
          maxLength:100,
          placeholder:"🔍 ابحث باسم الموكل...",
          'data-testid':'admin-portal-search',
          className:"w-full p-3 pr-4 text-xs rounded-xl border border-white/10 bg-premium-card text-white placeholder-slate-500",
          style:{fontFamily:'Cairo,sans-serif'}
        })
      ),

      // تابات الحالة
      React.createElement('div',{className:"flex items-center gap-2",'data-testid':'admin-portal-status-tabs'},
        tabs.map((t) => React.createElement('button',{
          key:t.key,
          onClick:()=>setStatusTab(t.key),
          'data-testid':`admin-portal-tab-${t.key}`,
          className:`px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all active:scale-95 ${
            statusTab===t.key
              ? 'bg-[#C9A84C]/20 border-[#C9A84C]/40 text-[#C9A84C]'
              : 'bg-white/5 border-white/10 text-slate-400'
          }`
        }, `${t.label} (${t.count})`))
      ),

      loading
        ? React.createElement('div',{className:"text-center text-slate-500 text-xs py-10",'data-testid':'admin-portal-loading'},"جاري تحميل الموكلين...")
        : visible.length === 0
        ? React.createElement('div',{className:"text-center text-slate-500 text-xs py-10",'data-testid':'admin-portal-empty'},"لا يوجد موكلون")
        : visible.map(({ client, hasAccess, isActive }) => {
            return React.createElement('div',{
              key:client.id,
              'data-testid':'admin-portal-card',
              className:"bg-premium-card border border-white/5 rounded-2xl p-3.5 flex items-center gap-3"
            },
              // أفاتار
              React.createElement('div',{className:"w-9 h-9 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center font-black text-sm text-[#C9A84C] flex-shrink-0"},
                (client.full_name||'م').charAt(0)),

              // بيانات
              React.createElement('div',{className:"flex-1 min-w-0"},
                React.createElement('p',{className:"text-xs font-black text-white truncate"},client.full_name),
                hasAccess
                  ? React.createElement('div',{className:"flex items-center gap-2 mt-0.5"},
                      React.createElement('span',{className:`text-[9px] font-bold px-2 py-0.5 rounded-full ${isActive?'bg-[#C9A84C]/15 text-[#C9A84C]':'bg-red-500/15 text-red-400'}`},
                        isActive?'✓ مفعّل':'✗ معطّل')
                    )
                  : React.createElement('p',{className:"text-[10px] text-slate-600 mt-0.5"},"لا يوجد وصول")
              ),

              // زر الإعداد
              React.createElement('button',{
                onClick:()=>setPortalClient(client),
                'data-testid':'admin-portal-setup-button',
                className:`px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all active:scale-95 ${hasAccess?'bg-[#C9A84C]/15 border-[#C9A84C]/30 text-[#C9A84C]':'bg-[#C9A84C]/15 border-[#C9A84C]/30 text-[#C9A84C]'}`
              }, hasAccess?'تعديل':'إعداد')
            );
          })
    );
}

export default PortalSection;
