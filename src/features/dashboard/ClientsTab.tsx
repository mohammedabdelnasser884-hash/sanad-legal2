import React, { useState, useRef, useEffect } from 'react';
import { I } from '../../constants';
import type { MappedCase, MappedClient } from '../../hooks/useAppData';
import { db } from '../../supabaseClient';
import { recordError, recordSuccess } from '../../systemHealth';
// 🆕 (مرحلة D3 — خطة Desktop Experience، 14 أغسطس 2026): جدول الموكلين
// على الديسكتوب، بنفس نمط جدول القضايا (D1/D2). راجع تعليقات
// ClientTableRow.tsx لتفاصيل اختيار الأعمدة.
import ClientTableRow, { type ClientTableRowData } from './ClientTableRow';
// ⚡ NEW (خطة تفعيل الصلاحيات التفصيلية، مرحلة 3 — 16 أغسطس 2026): زرار
// "موكل جديد" محكوم بـcan_add_clients. الدفاع الحقيقي (handleSaveClient
// فى useClientActions.ts + RLS) موجود بالفعل — ده بس تجربة مستخدم
// (إخفاء الزرار) عشان لا يظهر أصلًا لمن ليس له صلاحية.
import { checkPermission, type PermissionBearing } from '../../shared/lib/permissions';

const PAGE_SIZE = 15; // ⚠️ لازم يطابق PAGE_SIZE الفعلي في useAppData.ts (fetchClients)
                       // — كان هنا 20 غلط، وده كان بيسبب اختفاء آخر موكلين لو
                       // العدد الكلي بين 16 و20 (زرار "التالي" ما كانش بيظهر
                       // أصلاً لأن الشرط clientsTotal>PAGE_SIZE كان بيتحقق غلط).

const SearchIcon = () => React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.2",stroke:"currentColor"},
  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z"})
);

// امتداد نوعي لـ window عشان مؤقت البحث المؤجّل (debounce) — نفس التقنية
// اللي الكود الأصلي كان بيعملها بـ `window as any`، بس هنا موثّقة بنوع صريح.
interface WindowWithClientSearchTimer extends Window {
  _clientSearchTimer?: ReturnType<typeof setTimeout>;
}

interface ClientsTabProps {
  cases: MappedCase[];
  clients: MappedClient[];
  clientSearch: string;
  setClientSearch: (v: string) => void;
  clientsPage: number;
  setClientsPage: (n: number) => void;
  clientsTotal: number;
  clientsLoading: boolean;
  fetchClients: (page?: number, search?: string) => void;
  setSelectedClient: (c: MappedClient) => void;
  setShowClientModal: (v: boolean) => void;
  profile?: PermissionBearing | null;
}

function ClientsTab({ cases, clients, clientSearch, setClientSearch, clientsPage, setClientsPage, clientsTotal, clientsLoading, fetchClients, setSelectedClient, setShowClientModal, profile }: ClientsTabProps) {
  const [searchOpen, setSearchOpen]   = useState(false);
  const [activeTab,  setActiveTab]    = useState<'individual'|'entity'>('individual');
  const searchRef = useRef<HTMLInputElement>(null);
  const canAddClients = checkPermission(profile, 'can_add_clients');

  // ── لما يتضاف موكل جديد، روح للتاب الصح تلقائي ──
  const prevLengthRef = useRef(clients.length);
  useEffect(() => {
    if (clients.length > prevLengthRef.current && clients.length > 0) {
      const newest = clients[0]; // المضاف الجديد دايمًا أول واحد (order by created_at desc)
      const isEntity = newest.type === 'company' || newest.type === 'government';
      setActiveTab(isEntity ? 'entity' : 'individual');
    }
    prevLengthRef.current = clients.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients.length]);

  useEffect(() => {
    if (searchOpen && searchRef.current) searchRef.current.focus();
  }, [searchOpen]);

  const isEntity = (c: MappedClient) => c.type === 'company' || c.type === 'government';
  const filtered  = clients.filter((c: MappedClient) => activeTab === 'individual' ? !isEntity(c) : isEntity(c));
  const indCount  = clients.filter((c: MappedClient) => !isEntity(c)).length;
  const entCount  = clients.filter((c: MappedClient) =>  isEntity(c)).length;

  // ⚡ FIX (باگ "قضية X" ناقصة في كارت الموكل لأطراف ثانويين — 9 أغسطس
  // 2026): كارت القائمة هنا كان بيحسب caseCount بس من
  // `cases.filter(ca => ca.client_id===c.id)` — عمود cases.client_id
  // القديم بياخد موكل واحد أساسي بس للقضية، فموكل تاني مربوط فعليًا عن
  // طريق case_parties (طرف/ورثة إلخ) كان بيطلع بادج القضايا مختفي خالص
  // في القائمة، رغم إن كارت تفاصيل الموكل (ClientDetailModal عن طريق
  // selectedClientCases في AppModals.tsx) بيعرضها صح لأنه بيسأل قاعدة
  // البيانات مباشرة على case_parties.client_id. هنا بنعمل نفس الفكرة —
  // استعلام واحد مجمّع لكل موكلين الصفحة الحالية (مش استعلام لكل كارت
  // لوحده) بيرجّع كل case_id مرتبط بيهم عن طريق case_parties، ونضمّه
  // لعمود client_id القديم وقت حساب caseCount تحت.
  const [partyCaseIdsByClient, setPartyCaseIdsByClient] = useState<Record<string, string[]>>({});
  useEffect(() => {
    const clientIds = clients.map((c: MappedClient) => c.id);
    if (clientIds.length === 0) { setPartyCaseIdsByClient({}); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await db.from('case_parties').select('client_id, case_id').in('client_id', clientIds);
      if (error) { recordError('db_case_parties_by_client_ids', error.message); return; }
      recordSuccess('db_case_parties_by_client_ids');
      if (cancelled) return;
      const grouped: Record<string, string[]> = {};
      (data || []).forEach((row: { client_id: string | null; case_id: string | null }) => {
        if (!row.client_id || !row.case_id) return;
        (grouped[row.client_id] ||= []).push(row.case_id);
      });
      setPartyCaseIdsByClient(grouped);
    })();
    return () => { cancelled = true; };
  }, [clients]);

  // اتحاد case_id من العمود القديم (cases.client_id) + case_parties،
  // من غير عدّ مكرر لو نفس القضية موجودة في المصدرين مع بعض.
  const caseCountFor = (clientId: string) => {
    const idSet = new Set<string>();
    cases.forEach((ca: MappedCase) => { if (ca.client_id === clientId) idSet.add(ca.id); });
    (partyCaseIdsByClient[clientId] || []).forEach((id) => idSet.add(id));
    return idSet.size;
  };

  // ─────────────────────────────────────────────────────────
  //  مرحلة D3 (14 أغسطس 2026) — بناء صف جدول الموكلين من بيانات
  //  حقيقية. نفس caseCountFor/isEntity المستخدمة أصلاً مع الكروت
  //  (تحت) — صفر منطق جديد أو استعلام إضافي، مجرد تجميع نفس القيم
  //  المحسوبة بالفعل في شكل صف جدول.
  // ─────────────────────────────────────────────────────────
  const buildClientTableRowData = (c: MappedClient): ClientTableRowData => ({
    id: c.id,
    name: c.full_name || '—',
    typeLabel: c.type === 'company' ? 'شركة' : c.type === 'government' ? 'جهة حكومية' : 'فرد',
    phone: c.phone || '',
    nationalId: c.national_id || '',
    caseCount: caseCountFor(c.id),
  });

  // ── تحميل تلقائي للصفحة التالية لو التاب الحالي (أفراد/شركات) فاضي ──
  // محليًا بس لسه فيه موكلين متحمّلينش (fetchClients بتجيب الأنواع مع بعض
  // بترتيب تاريخ الإضافة، من غير فلترة نوع في الاستعلام نفسه — فممكن كل
  // الشركات مثلاً تكون متأخرة في صفحات لسه محملتش). بنعتمد بالكامل على
  // fetchClients الموجودة أصلاً (نفس اللي زرار "التالي" بينادّيها) وبننادّيها
  // تلقائي بدل انتظار ضغطة يدوية — من غير أي كويري أو تعديل في السيرفر.
  // سقف أمان (MAX_AUTO_PAGES) عشان ميدخلش في تحميل متكرر لا نهائي لو فعلاً
  // مفيش عناصر من النوع ده خالص.
  const autoLoadAttemptsRef = useRef(0);
  useEffect(() => {
    autoLoadAttemptsRef.current = 0; // نصفّر العداد كل ما التاب أو البحث يتغيّر
  }, [activeTab, clientSearch]);
  useEffect(() => {
    const MAX_AUTO_PAGES = 10; // ~150 موكل إضافي كحد أقصى قبل ما نوقف ونسيب المستخدم يبحث بالاسم
    const hasMoreToLoad = clients.length < clientsTotal;
    if (filtered.length === 0 && hasMoreToLoad && !clientsLoading && autoLoadAttemptsRef.current < MAX_AUTO_PAGES) {
      autoLoadAttemptsRef.current += 1;
      fetchClients(clientsPage + 1, clientSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, clients.length, clientsTotal, clientsLoading, activeTab]);

  // هل احنا لسه بنبحث عن عناصر من النوع الحالي في صفحات جاية (سبينر بدل "لا يوجد")
  const stillSearchingForType = filtered.length === 0 && clientsLoading && clients.length < clientsTotal;
  // هل وصلنا لسقف الأمان وفيه احتمال يكون فيه عناصر أبعد من كده
  const hitAutoLoadCap = filtered.length === 0 && !clientsLoading && clients.length < clientsTotal && autoLoadAttemptsRef.current >= 10;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setClientSearch(val);
    const win = window as unknown as WindowWithClientSearchTimer;
    clearTimeout(win._clientSearchTimer);
    win._clientSearchTimer = setTimeout(() => fetchClients(0, val), 500);
  };

  const handleClearSearch = () => {
    setClientSearch('');
    fetchClients(0, '');
    if (searchRef.current) searchRef.current.focus();
  };

  const handleToggleSearch = () => {
    if (searchOpen) { setClientSearch(''); fetchClients(0, ''); }
    setSearchOpen((s: boolean) => !s);
  };

  return React.createElement('div', { className: "space-y-4 fade-in" },

    // ── هيدر ──
    React.createElement('div', {className:"flex items-center justify-between"},
      React.createElement('h3', {className:"text-sm font-black text-white"}, "سجل الموكلين"),
      React.createElement('div', {className:"flex items-center gap-2"},
        React.createElement('button', {
          onClick: handleToggleSearch,
          title: "بحث",
          className: `w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-95 ${
            searchOpen
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-white/5 text-slate-400 border border-white/10 hover:text-white'
          }`
        }, React.createElement(SearchIcon)),
        // ⚡ NEW (مرحلة 3 خطة الصلاحيات): can_add_clients — الزرار بيختفي
        // كليًا (مش بس disabled) لمن ليس له صلاحية، زي نمط "لوحة الإدارة"
        // فى CommandDock.
        canAddClients && React.createElement('button', {
          onClick: () => setShowClientModal(true),
          'data-testid': 'new-client-button',
          className:"flex items-center bg-gradient-to-tr from-emerald-500 to-emerald-400 text-white px-3 py-2 rounded-xl text-xs font-black shadow-lg gap-1 active:scale-95 transition-transform"
        }, React.createElement(I.Plus), "موكل جديد")
      )
    ),

    // ── حقل البحث ──
    searchOpen && React.createElement('div', {className:"relative"},
      React.createElement('input', {
        ref: searchRef,
        type:"text", value:clientSearch,
        onChange: handleSearchChange,
        maxLength:100,
        placeholder:"🔍 ابحث بالاسم أو الموبايل أو الرقم القومي...",
        className:"w-full p-3 pr-4 text-xs rounded-xl border border-white/10 bg-premium-card text-white placeholder-slate-500 transition-colors",
        style:{fontFamily:'Cairo,sans-serif'}
      }),
      clientSearch && React.createElement('button', {
        onClick: handleClearSearch,
        className:"absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
      }, "✕")
    ),

    // ── التابين ──
    React.createElement('div', {
      className:"flex gap-2 p-1 rounded-2xl",
      style:{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}
    },
      // أفراد
      React.createElement('button', {
        onClick: () => setActiveTab('individual'),
        className:`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black transition-all ${
          activeTab==='individual'
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'text-slate-500 hover:text-slate-300 border border-transparent'
        }`
      },
        React.createElement(I.Suit,{className:`w-[18px] h-[18px] ${activeTab==='individual'?'text-emerald-400':'text-slate-500'}`}),
        "أفراد",
        indCount > 0 && React.createElement('span',{
          className:`text-[9px] font-black px-1.5 py-0.5 rounded-full ${activeTab==='individual'?'bg-emerald-500/30 text-emerald-300':'bg-white/5 text-slate-500'}`
        }, indCount)
      ),
      // شركات
      React.createElement('button', {
        onClick: () => setActiveTab('entity'),
        className:`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black transition-all ${
          activeTab==='entity'
            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            : 'text-slate-500 hover:text-slate-300 border border-transparent'
        }`
      },
        React.createElement('span',{className:"text-xl leading-none"},"🏢"),
        "شركات",
        entCount > 0 && React.createElement('span',{
          className:`text-[9px] font-black px-1.5 py-0.5 rounded-full ${activeTab==='entity'?'bg-blue-500/30 text-blue-300':'bg-white/5 text-slate-500'}`
        }, entCount)
      )
    ),

    // ── القائمة ──
    (clientsLoading && clients.length===0) || stillSearchingForType
      ? React.createElement('div',{className:"flex items-center justify-center py-16 gap-2 text-slate-500 text-xs"},
          React.createElement(I.Spin),"جاري الجلب..."
        )
      : filtered.length===0
      ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-10 text-center space-y-3"},
          React.createElement('div',{
            className:`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-2 ${activeTab==='individual'?'bg-emerald-500/10 text-emerald-400':'bg-blue-500/10 text-blue-400'}`
          },
            activeTab==='individual'
              ? React.createElement(I.Person)
              : React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
                  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"})
                )
          ),
          React.createElement('p',{className:`font-black ${activeTab==='individual'?'text-emerald-400':'text-blue-400'}`},
            clientSearch ? `لا توجد نتائج لـ "${clientSearch}"` : activeTab==='individual' ? "لا يوجد أفراد بعد" : "لا توجد شركات بعد"
          ),
          React.createElement('p',{className:"text-slate-500 text-xs"},
            clientSearch
              ? "جرب كلمة بحث مختلفة"
              : hitAutoLoadCap
                ? "قد يوجد المزيد ضمن سجل كبير من الموكلين — جرّب البحث بالاسم للوصول لهم مباشرة"
                : "اضغط على موكل جديد للإضافة."
          )
        )
      // ⚡ H3 (16 أغسطس 2026): `lg:hidden` — نفس التطبيق في CasesTab.tsx.
      // الكروت بقت مقصورة على موبايل/تابلت، والجدول (D3) بس على الديسكتوب.
      : React.createElement('div',{className:"space-y-2 lg:hidden"},
          filtered.map((c: MappedClient) => {
            const caseCount = caseCountFor(c.id);
            const ent = isEntity(c);
            const typeLabel = c.type==='company'?'شركة':c.type==='government'?'جهة حكومية':'فرد';
            return React.createElement('div',{
              key:c.id,
              onClick:()=>setSelectedClient(c),
              'data-testid': 'client-card',
              className:"bg-premium-card border border-white/5 rounded-xl px-3 py-2.5 active:scale-[0.98] transition-all cursor-pointer"
            },
              React.createElement('div',{className:"flex items-center gap-2.5"},
                React.createElement('div',{
                  className:`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${ent?'bg-blue-500/10 text-blue-400':'bg-emerald-500/10 text-emerald-400'}`
                },
                  ent
                    ? React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},
                        React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"})
                      )
                    : (c.full_name||'م').charAt(0)
                ),
                React.createElement('div',{className:"flex-1 min-w-0"},
                  React.createElement('p',{className:"text-[12px] font-black text-white truncate"},c.full_name),
                  React.createElement('div',{className:"flex items-center gap-2 mt-0.5 flex-wrap"},
                    React.createElement('span',{
                      className:`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${ent?'bg-blue-500/10 text-blue-400':'bg-emerald-500/10 text-emerald-400'}`
                    }, typeLabel),
                    c.phone&&React.createElement('span',{className:"text-[9px] text-slate-500"},c.phone),
                    caseCount>0&&React.createElement('span',{
                      className:"text-[8px] font-black px-1.5 py-0.5 rounded-full",
                      style:{background:'rgba(212,175,55,0.1)',color:'#D4AF37'}
                    }, caseCount+' قضية')
                  )
                ),
                React.createElement('svg',{className:"w-3.5 h-3.5 text-slate-600 shrink-0",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M15.75 19.5 8.25 12l7.5-7.5"})
                )
              )
            );
          }),
          clientsTotal>PAGE_SIZE&&React.createElement('div',{className:"flex items-center justify-between gap-2 pt-1"},
            React.createElement('button',{
              onClick:()=>{const p=clientsPage-1;setClientsPage(p);fetchClients(p,clientSearch);},
              disabled:clientsPage===0||clientsLoading,
              className:"flex-1 py-2.5 rounded-xl text-xs font-black active:scale-[0.98] transition-all disabled:opacity-30",
              style:{background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.18)',color:'#34d399'}
            },"→ السابق"),
            React.createElement('span',{className:"text-[10px] text-slate-500 font-black whitespace-nowrap"},
              `${clientsPage*PAGE_SIZE+1}–${Math.min((clientsPage+1)*PAGE_SIZE,clientsTotal)} / ${clientsTotal}`
            ),
            React.createElement('button',{
              onClick:()=>{const p=clientsPage+1;setClientsPage(p);fetchClients(p,clientSearch);},
              disabled:(clientsPage+1)*PAGE_SIZE>=clientsTotal||clientsLoading,
              className:"flex-1 py-2.5 rounded-xl text-xs font-black active:scale-[0.98] transition-all disabled:opacity-30",
              style:{background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.18)',color:'#34d399'}
            },"التالي ←")
          )
        ),

    // ── الجدول (ديسكتوب) — مرحلة D3: نفس النمط المتبع في D1/D2 لجدول
    // القضايا. نفس سبب التأجيل الموثّق هناك (بند 12.5 من الخطة، وقرار
    // B1/B3/D2): الكروت (`data-testid="client-card"`) مستخدمة مباشرة
    // في e2e/clients.spec.ts وe2e/validation.spec.ts وe2e/utils.ts على
    // فيوبورت Desktop Chrome (فوق حد 1024px، يعني `lg:` فعّالة وقت
    // التستات) — فإخفاؤها الآن (`lg:hidden`) هيكسّرهم فورًا. فالكروت
    // تفضل ظاهرة دايمًا (صفر تغيير عليها)، والجدول بيظهر *جنب*ها على
    // الديسكتوب فقط (`hidden lg:block`) لحد ما تبقى فيه تغطية Playwright
    // بفيوبورت موبايل (G3) تسمح بالإخفاء الفعلي من غير كسر أي تست.
    // الجدول بيعرض نفس `filtered` (نفس التاب أفراد/شركات المُختار
    // حاليًا) — صفر بيانات وهمية، ربط مباشر من أول تسليم (بخلاف D1
    // الأصلية اللي بدأت بـmock).
    // ⚡ G2 (15 أغسطس 2026): A11y — نفس تعديل CasesTab.tsx بالحرف:
    // `aria-label="جدول الموكلين"` على `<table>` + `scope: 'col'` على
    // كل `<th>`.
    filtered.length > 0 && React.createElement('div', {
      className: 'hidden lg:block bg-premium-card border border-white/5 rounded-2xl overflow-hidden',
      'data-testid': 'clients-desktop-table',
    },
      React.createElement('table', { className: 'w-full text-right', 'aria-label': 'جدول الموكلين' },
        React.createElement('thead', null,
          React.createElement('tr', { className: 'border-b border-white/10 bg-white/[0.02]' },
            ['الاسم', 'النوع', 'الهاتف', 'الرقم القومي/السجل', 'عدد القضايا', 'الإجراءات'].map((label, i) =>
              React.createElement('th', {
                key: label,
                scope: 'col',
                className: `px-3 py-2.5 text-[10px] font-black text-slate-500 whitespace-nowrap ${i === 5 ? 'text-left' : ''}`,
              }, label)
            )
          )
        ),
        React.createElement('tbody', null,
          filtered.map((c: MappedClient) => React.createElement(ClientTableRow, {
            key: c.id,
            data: buildClientTableRowData(c),
            onOpen: () => setSelectedClient(c),
          }))
        )
      ),
      clientsTotal > PAGE_SIZE && React.createElement('div', {
        className: 'border-t border-white/5 px-3 py-2.5 flex items-center justify-between gap-2',
      },
        React.createElement('button', {
          onClick: () => { const p = clientsPage - 1; setClientsPage(p); fetchClients(p, clientSearch); },
          disabled: clientsPage === 0 || clientsLoading,
          className: 'flex items-center gap-1 text-[11px] font-black disabled:opacity-30',
          style: { color: '#34d399' },
        }, '→ السابق'),
        React.createElement('span', { className: 'text-[10px] text-slate-500 font-black whitespace-nowrap' },
          `${clientsPage * PAGE_SIZE + 1}–${Math.min((clientsPage + 1) * PAGE_SIZE, clientsTotal)} / ${clientsTotal}`
        ),
        React.createElement('button', {
          onClick: () => { const p = clientsPage + 1; setClientsPage(p); fetchClients(p, clientSearch); },
          disabled: (clientsPage + 1) * PAGE_SIZE >= clientsTotal || clientsLoading,
          className: 'flex items-center gap-1 text-[11px] font-black disabled:opacity-30',
          style: { color: '#34d399' },
        }, 'التالي ←')
      )
    )
  );
}

export default ClientsTab;
