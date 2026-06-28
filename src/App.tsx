import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { db, SUPA_URL, SUPA_KEY } from './supabaseClient';
import { I, COUNTRY_CONFIGS, SanadMark, loadOfficeSetting, setCurrentTenantId } from './constants';
import { toast } from './utils';
import { useNavigation } from './useNavigation';
import LoginScreen from './components/LoginScreen';
import FeesTab from './components/FeesTab';
import SessionsCalendar from './components/SessionsCalendar';
import RemindersTab from './components/RemindersTab';
import ArchiveTab from './components/ArchiveTab';
import CaseDetailView from './components/CaseDetailView';
import NewCaseModal from './components/NewCaseModal';
import NewClientModal from './components/NewClientModal';
import NewLawyerModal from './components/NewLawyerModal';
import ClientDetailModal from './components/ClientDetailModal';
import UniversalSearchModal from './components/UniversalSearchModal';
import AILegalAssistant from './components/AILegalAssistant';
import SettingsPage from './components/SettingsPage';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import AdminPanel from './components/AdminPanel';
import NewStandaloneSessionModal from './components/NewStandaloneSessionModal';

// ─── Dashboard Components ─────────────────
import AppHeader from './components/dashboard/AppHeader';
import DashboardTab from './components/dashboard/DashboardTab';
import CasesTab from './components/dashboard/CasesTab';
import TeamTab from './components/dashboard/TeamTab';
import ClientsTab from './components/dashboard/ClientsTab';

// ─── Hooks ───────────────────────────────
import { useHealthMonitor } from './hooks/useHealthMonitor';
import { usePwaInstall } from './hooks/usePwaInstall';
import { useDashboardFeed } from './hooks/useDashboardFeed';
import { useAppData } from './hooks/useAppData';
import { useTelegramAlerts } from './hooks/useTelegramAlerts';
import { useCaseActions } from './hooks/useCaseActions';
import { useClientActions } from './hooks/useClientActions';
import { useAutoLogout } from './hooks/useAutoLogout';

function App() {
    const [profile,    setProfile]    = useState<any>(null);
    const [authUser,   setAuthUser]   = useState<any>(null);
    const [authLoading,setAuthLoading]= useState(true);

    // ── Auth ──────────────────────────────────────────────────
    const loadProfile = useCallback(async (user: any) => {
        if (!user) { setProfile(null); setAuthUser(null); return; }
        setAuthUser(user);
        const { data } = await db.from('profiles').select('*').eq('user_id', user.id).single();
        setProfile(data || null);
    }, []);

    useEffect(() => {
        db.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) loadProfile(session.user);
            else setAuthLoading(false);
        });
        const { data: listener } = db.auth.onAuthStateChange((_event, session) => {
            if (session?.user) loadProfile(session.user);
            else { setProfile(null); setAuthUser(null); }
        });
        return () => listener.subscription.unsubscribe();
    }, [loadProfile]);

    // ── ضبط tenant_id الحالي لكل قراءات/كتابات office_settings —
    // لازم يحصل قبل أي نداء لـ loadOfficeSetting/saveOfficeSetting، وكمان
    // عند تسجيل الخروج (profile=null) عشان منفضلش شايلين tenant قديم في
    // الكاش لمستخدم بعده على نفس الجهاز. ──
    useEffect(() => {
        setCurrentTenantId(profile?.tenant_id ?? null);
    }, [profile]);

    useEffect(() => {
        if (profile !== null) setAuthLoading(false);
    }, [profile]);

    // ── Navigation ────────────────────────────────────────────
    const nav = useNavigation();
    const tab = nav.tab;
    const setTab = useCallback((newTab: string) => nav.navigateTo(newTab as any), [nav]);

    const showCaseModal   = nav.isOpen('newCase');
    const showLawyerModal = nav.isOpen('newLawyer');
    const showClientModal = nav.isOpen('newClient');
    const showSearch      = nav.isOpen('search');
    const showAI          = nav.isOpen('ai');
    const showSettings    = nav.isOpen('settings');

    const setShowCaseModal   = useCallback((v: boolean) => v ? nav.openModal('newCase')    : nav.closeModal('newCase'),    [nav]);
    const setShowLawyerModal = useCallback((v: boolean) => v ? nav.openModal('newLawyer')  : nav.closeModal('newLawyer'),  [nav]);
    const setShowClientModal = useCallback((v: boolean) => v ? nav.openModal('newClient')  : nav.closeModal('newClient'),  [nav]);
    const setShowSearch      = useCallback((v: boolean) => v ? nav.openModal('search')     : nav.closeModal('search'),     [nav]);
    const setShowAI          = useCallback((v: boolean) => v ? nav.openModal('ai')         : nav.closeModal('ai'),         [nav]);
    const setShowSettings    = useCallback((v: boolean) => v ? nav.openModal('settings')   : nav.closeModal('settings'),   [nav]);
    const showNewSessionModal    = nav.isOpen('newSession');
    const setShowNewSessionModal = useCallback((v: boolean) => v ? nav.openModal('newSession') : nav.closeModal('newSession'), [nav]);

    // ── Local UI state ────────────────────────────────────────
    const [showMore,       setShowMore]       = useState(false);
    const [showHeaderMenu, setShowHeaderMenu] = useState(false);
    const [showFeesSummary,setShowFeesSummary]= useState(false);
    const [clientSearch,   setClientSearch]   = useState('');
    const [savingCase,     setSavingCase]     = useState(false);
    const [savingLawyer,   setSavingLawyer]   = useState(false);
    const [savingClient,   setSavingClient]   = useState(false);
    const [sessionsInitialTab,      setSessionsInitialTab]      = useState<string|null>(null);
    const [remindersInitialFilter,  setRemindersInitialFilter]  = useState<string|null>(null);

    const [selectedCase,      _setSelectedCase]  = useState<any>(null);
    const [selectedCaseInitialTab, setSelectedCaseInitialTab] = useState('timeline');
    const [selectedClient,    _setSelectedClient]= useState<any>(null);
    const [deleteConfirm,     _setDeleteConfirm] = useState<any>(null);

    const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('sanad_theme');
        if (saved) return saved === 'dark';
        return true;
    });
    const [country, setCountry] = useState('EG');
    const [dbOnline, setDbOnline] = useState<boolean|null>(null);

    // ── تحميل الدولة من office_settings بعد ما الـ profile يتحمّل ──
    useEffect(() => {
        if (!profile) return;
        loadOfficeSetting('country').then(saved => {
            if (saved && COUNTRY_CONFIGS[saved]) setCountry(saved);
        }).catch(() => {/* استخدم SA كافتراضي */});
    }, [profile]);

    // ── Hooks ─────────────────────────────────────────────────
    const { healthErrors, setHealthErrors }                     = useHealthMonitor(profile);
    const { handlePwaInstall }                          = usePwaInstall();
    const feed                                          = useDashboardFeed(profile);
    const {
        todaySessions, upcomingSessions, missedSessions,
        upcomingTasks, missedTasks, loadingUrgent,
        upcomingTasksOpen, setUpcomingTasksOpen,
        todayOpen,     setTodayOpen,
        upcomingOpen,  setUpcomingOpen,
        fetchTodaySessions, fetchUpcomingSessions, fetchMissedSessions, fetchTasks,
    } = feed;
    const data = useAppData(profile);
    const {
        cases,    setCases,
        casesFilter, setCasesFilter, casesPage, setCasesPage, casesTotal, casesLoading, dbError,
        casesSearch, setCasesSearch,
        clients,  setClients,
        clientsPage, setClientsPage, clientsTotal, clientsLoading,
        lawyers,  setLawyers,
        fetchCases, fetchLawyers, fetchClients, searchCases,
    } = data;
    const { sendTelegram }                                      = useTelegramAlerts(profile);

    // ── Modal helpers ─────────────────────────────────────────
    const setSelectedCase = useCallback((caseOrUpdater: any, initialTab: string = 'timeline') => {
        if (typeof caseOrUpdater === 'function') { _setSelectedCase(caseOrUpdater); return; }
        if (caseOrUpdater) {
            _setSelectedCase(caseOrUpdater);
            setSelectedCaseInitialTab(initialTab);
            nav.openModal('caseDetail');
        } else { _setSelectedCase(null); }
    }, [nav]);

    const setSelectedClient = useCallback((clientOrNull: any) => {
        if (clientOrNull) { _setSelectedClient(clientOrNull); nav.openModal('clientDetail'); }
        else              { _setSelectedClient(null); }
    }, [nav]);

    const setDeleteConfirm = useCallback((v: any) => {
        if (v) { _setDeleteConfirm(v); nav.openModal('delete'); }
        else   { _setDeleteConfirm(null); }
    }, [nav]);

    const { handleLogout, handleSaveCase, handleDeleteCase, handleUpdateCase } = useCaseActions({
        sendTelegram, fetchCases, cases, lawyers, clients, selectedCase,
        setCases, setLawyers, setClients, setProfile, setAuthUser,
        setSelectedCase, setDeleteConfirm, setSavingCase, setShowCaseModal,
        casesFilter, nav, profile,
    });
    const { handleSaveClient, handleDeleteClient, handleUpdateClient, handleSaveLawyer } = useClientActions({
        sendTelegram, fetchClients, fetchLawyers, clients, clientSearch,
        setClients, setSelectedClient, setDeleteConfirm, setSavingClient,
        setSavingLawyer, setShowClientModal, setShowLawyerModal, nav, profile,
    });

    const handleAutoLogout = useCallback(() => {
        setCases([]); setLawyers([]); setClients([]);
        setProfile(null); setAuthUser(null);
    }, []);
    useAutoLogout(profile, handleAutoLogout);

    const isAdmin = profile?.role === 'admin';

    // ── Theme ─────────────────────────────────────────────────
    useEffect(() => {
        const html = document.documentElement;
        if (darkMode) { html.classList.remove('light'); localStorage.setItem('sanad_theme', 'dark'); }
        else          { html.classList.add('light');    localStorage.setItem('sanad_theme', 'light'); }
    }, [darkMode]);
    const toggleTheme = () => setDarkMode(p => !p);

    // ── DB connectivity check ─────────────────────────────────
    useEffect(() => {
        if (!profile) return;
        const check = async () => {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) { setDbOnline(false); return; }
            const controller = new AbortController();
            const timeoutId  = setTimeout(() => controller.abort(), 8000);
            try {
                const { data: sessionData } = await db.auth.getSession();
                const token = sessionData?.session?.access_token || SUPA_KEY;
                const res = await fetch(`${SUPA_URL}/rest/v1/profiles?select=id&limit=1`, {
                    method: 'GET', cache: 'no-store', signal: controller.signal,
                    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}`, 'X-Health-Check': '1' },
                });
                setDbOnline(res.ok);
            } catch { setDbOnline(false); }
            finally { clearTimeout(timeoutId); }
        };
        // named handlers عشان removeEventListener يشتغل صح —
        // arrow function جديدة في كل مرة مش بتتشال بـ removeEventListener
        const handleOffline = () => setDbOnline(false);
        check();
        const interval = setInterval(check, 30000);
        window.addEventListener('online',  check);
        window.addEventListener('offline', handleOffline);
        return () => {
            clearInterval(interval);
            window.removeEventListener('online',  check);
            window.removeEventListener('offline', handleOffline);
        };
    }, [profile]);

    // ── Initial data fetch ────────────────────────────────────
    useEffect(() => {
        if (!profile) return;
        // Priority 1 — dashboard-critical (today's sessions, missed, tasks)
        Promise.all([fetchTodaySessions(), fetchMissedSessions(), fetchTasks()]);
        // Priority 2 — secondary data
        Promise.all([fetchCases(0, casesFilter), fetchClients(0, clientSearch), fetchUpcomingSessions(), fetchLawyers()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile]);

    // ── إعادة تحميل القوائم بعد ما المزامنة الأوفلاين تخلص ──────
    // العمليات اللي كانت محفوظة محلياً بتتزامن مع السيرفر في الخلفية،
    // وبدون هذا المستمع، القوائم المعروضة تفضل قديمة (تبدو كإن البيانات
    // "اختفت") لحد ما المستخدم يعمل ريفريش تاني بنفسه.
    useEffect(() => {
        if (!profile) return;
        const onSyncComplete = () => {
            Promise.all([
                fetchCases(0, casesFilter),
                fetchClients(0, clientSearch),
                fetchUpcomingSessions(),
                fetchTodaySessions(),
                fetchMissedSessions(),
            ]);
        };
        window.addEventListener('offline-sync-complete', onSyncComplete);
        return () => window.removeEventListener('offline-sync-complete', onSyncComplete);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile]);

    // ─────────────────────────────────────────────────────────
    //  Loading screen
    // ─────────────────────────────────────────────────────────
    if (authLoading) return React.createElement('div', {
        className: 'h-full flex flex-col items-center justify-center bg-premium-bg',
        style: { gap: 0 }
    },
        React.createElement('div', {
            style: {
                width: 72, height: 72, background: '#0B1320', borderRadius: 17,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid rgba(212,175,55,0.2)',
                boxShadow: '0 0 30px rgba(212,175,55,0.10)', marginBottom: 20,
            }
        }, React.createElement(SanadMark, { size: 50 })),
        React.createElement('div', { style: { fontFamily: 'Cairo,sans-serif', fontSize: 28, fontWeight: 900, color: 'white', letterSpacing: '1px', marginBottom: 8 } }, 'سَنَد'),
        React.createElement('div', { style: { fontFamily: 'Cairo,sans-serif', fontSize: 10, fontWeight: 700, color: 'rgba(212,175,55,0.6)', letterSpacing: '2px', marginBottom: 32 } }, 'نظام التشغيل القانوني'),
        React.createElement(I.Spin)
    );

    if (!authUser || !profile) return React.createElement(LoginScreen, { onLogin: (u: any) => loadProfile(u) });

    // ─────────────────────────────────────────────────────────
    //  Render
    // ─────────────────────────────────────────────────────────
    const Header      = React.createElement(AppHeader, { profile, setShowMenu: (v: boolean) => setShowHeaderMenu(v), setShowSearch, isAdmin, fetchCases, casesFilter, loadingCases: casesLoading });
    const Dashboard   = React.createElement(DashboardTab, {
        profile, cases, clients,
        todaySessions, upcomingSessions, missedSessions,
        upcomingTasks, missedTasks, loadingUrgent,
        todayOpen, setTodayOpen, upcomingOpen, setUpcomingOpen,
        upcomingTasksOpen, setUpcomingTasksOpen,
        setSelectedCase, setShowCaseModal, setShowClientModal, setShowNewSessionModal,
        setTab, setRemindersInitialFilter, setSessionsInitialTab,
        dbOnline, healthErrors, setHealthErrors,
        fetchTodaySessions, fetchUpcomingSessions, fetchMissedSessions,
    });
    const CasesTabContent   = React.createElement(CasesTab, {
        cases, casesFilter, setCasesFilter, casesPage, setCasesPage,
        casesTotal, casesLoading, fetchCases, searchCases, casesSearch, setCasesSearch,
        setShowCaseModal, setSelectedCase,
        loadingCases: casesLoading, dbError,
    });
    const TeamTabContent    = React.createElement(TeamTab,    { lawyers, setShowLawyerModal });
    const ClientsTabContent = React.createElement(ClientsTab, {
        cases, clients, clientSearch, setClientSearch,
        clientsPage, setClientsPage, clientsTotal, clientsLoading,
        fetchClients, setSelectedClient, setShowClientModal,
    });
    const DocsTab = React.createElement(ArchiveTab, { cases, clients });

    const showMenu = showHeaderMenu;

    return React.createElement('div', { className: 'h-full flex flex-col bg-premium-bg' },

        React.createElement('div', {
            style: showMenu ? { filter: 'blur(3px) brightness(0.4)', transition: 'filter 0.2s ease', pointerEvents: 'none' } : { transition: 'filter 0.2s ease' }
        }, Header),

        // ── Dropdown menu ──
        showMenu && createPortal(
            React.createElement(React.Fragment, null,
                React.createElement('div', {
                    onClick: () => setShowHeaderMenu(false),
                    className: 'fixed inset-0 cursor-default',
                    style: { zIndex: 9998, background: 'rgba(0,0,0,0.6)' }
                }),
                React.createElement('div', {
                    className: 'fixed right-0 left-0 border-b border-white/10 px-4 py-3 flex flex-col gap-2 shadow-2xl',
                    style: { top: '52px', zIndex: 9999, background: darkMode ? '#0d1a2e' : '#ffffff' }
                },
                    React.createElement('button', {
                        onClick: () => { toggleTheme(); setShowHeaderMenu(false); },
                        className: 'w-full h-10 rounded-xl flex items-center gap-3 px-3 active:scale-[0.98] transition-all text-sm font-bold',
                        style: darkMode
                            ? { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: '#E8C84A' }
                            : { background: 'rgba(184,134,11,0.10)',  border: '1px solid rgba(184,134,11,0.28)', color: '#92650a' }
                    },
                        React.createElement('span', { className: 'text-base' }, darkMode ? '☀️' : '🌙'),
                        React.createElement('span', null, darkMode ? 'التحويل للوضع النهاري' : 'التحويل للوضع الليلي')
                    ),
                    (typeof Notification !== 'undefined' && Notification.permission !== 'granted') && React.createElement('button', {
                        onClick: async () => {
                            if ((window as any).__requestPushPermission) {
                                const ok = await (window as any).__requestPushPermission();
                                if (ok) toast('✅ سيتم تنبيهك بالجلسات القادمة');
                                else    toast('لم يُمنح إذن الإشعارات', true);
                            } else {
                                Notification.requestPermission().then(p => { if (p === 'granted') toast('✅ تفعّلت الإشعارات'); });
                            }
                            setShowHeaderMenu(false);
                        },
                        className: 'w-full h-10 rounded-xl border flex items-center gap-3 px-3 active:scale-[0.98] transition-all text-sm font-bold',
                        style: { background: 'rgba(251,191,36,0.10)', borderColor: 'rgba(251,191,36,0.30)', color: '#fbbf24' }
                    }, React.createElement('span', { className: 'text-base' }, '🔔'), React.createElement('span', null, 'تفعيل إشعارات الجلسات')),
                    React.createElement('button', {
                        onClick: () => { handlePwaInstall(); setShowHeaderMenu(false); },
                        className: 'w-full h-10 rounded-xl border flex items-center gap-3 px-3 active:scale-[0.98] transition-all text-sm font-bold',
                        style: { background: 'rgba(212,175,55,0.12)', borderColor: 'rgba(212,175,55,0.35)', color: '#D4AF37' }
                    }, React.createElement('span', { className: 'text-base' }, '📲'), React.createElement('span', null, 'تثبيت التطبيق')),
                    React.createElement('button', {
                        onClick: () => { setShowSettings(true); setShowHeaderMenu(false); },
                        className: 'w-full h-10 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3 px-3 active:scale-[0.98] transition-transform text-sm font-bold text-slate-200'
                    },
                        React.createElement('span', { className: 'text-base' }, COUNTRY_CONFIGS[country]?.flag || '🌍'),
                        React.createElement('span', null, 'إعدادات الدولة')
                    ),
                    React.createElement('div', { className: 'h-px bg-white/10 my-0.5' }),
                    React.createElement('button', {
                        onClick: () => { handleLogout(); setShowHeaderMenu(false); },
                        className: 'w-full h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3 px-3 active:scale-[0.98] transition-transform text-sm font-bold text-rose-400'
                    }, React.createElement(I.Logout), React.createElement('span', null, 'تسجيل الخروج'))
                )
            ),
            document.body
        ),

        React.createElement('main', {
            className: `flex-1 overflow-y-auto no-scrollbar ${tab === 'admin' ? '' : 'px-4 py-4 pb-32'}`,
            style: showMenu ? { filter: 'blur(3px) brightness(0.4)', transition: 'filter 0.2s ease', pointerEvents: 'none' } : { transition: 'filter 0.2s ease' }
        },
            tab === 'dashboard'  && Dashboard,
            tab === 'cases'      && CasesTabContent,
            tab === 'clients'    && ClientsTabContent,
            tab === 'calendar'   && React.createElement('div', { className: 'space-y-4 fade-in' },
                React.createElement('div', { className: 'flex items-center justify-between' },
                    React.createElement('h3', { className: 'text-xl font-black text-white' }, '📅 الجلسات'),
                    React.createElement('button', {
                        onClick: () => setShowNewSessionModal(true),
                        className: 'flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-black text-premium-bg transition-all active:scale-95',
                        style: { background: 'linear-gradient(135deg,#d4af37,#f0c040)' }
                    }, React.createElement('span', { className: 'text-sm' }, '⚡'), 'إضافة جلسة')
                ),
                React.createElement(SessionsCalendar, {
                    cases, clients,
                    onOpenCase: (c: any) => { setSelectedCase(c, 'timeline'); },
                    onOpenReminders: () => { setRemindersInitialFilter('overdue'); setTab('reminders'); },
                    onNotify: sendTelegram,
                    onSessionAdded: () => { fetchTodaySessions(); fetchUpcomingSessions(); fetchCases(0, casesFilter); },
                    initialTab: sessionsInitialTab,
                })
            ),
            tab === 'fees' && React.createElement(FeesTab, { cases, clients, showSummaryModal: showFeesSummary, setShowSummaryModal: setShowFeesSummary, country, profile }),
            tab === 'reminders' && React.createElement('div', { className: 'space-y-4 fade-in' },
                React.createElement(RemindersTab, { initialFilter: remindersInitialFilter, profile })
            ),
            tab === 'team' && (isAdmin
                ? TeamTabContent
                : React.createElement('div', { className: 'text-center text-slate-500 text-xs pt-20' }, 'غير مصرح لك بهذا القسم')
            ),
            tab === 'documents' && DocsTab,
            tab === 'admin' && (isAdmin
                ? React.createElement(AdminPanel, { profile, lawyers, clients, fetchLawyers })
                : React.createElement('div', { className: 'flex flex-col items-center justify-center pt-24 gap-3' },
                    React.createElement('div', { className: 'w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center' },
                        React.createElement(I.Shield, { className: 'w-7 h-7 text-red-400' })
                    ),
                    React.createElement('p', { className: 'text-xs font-bold text-slate-400' }, 'هذا القسم للمديرين فقط')
                )
            )
        ),

        // ── COMMAND DOCK ──────────────────────────────────────────────────────
        React.createElement('div', { className: 'fixed bottom-0 inset-x-0 z-50 flex flex-col items-center pb-3 px-3 pointer-events-none' },

            showMore && React.createElement('div', {
                className: 'pointer-events-auto w-full max-w-sm mb-2 rounded-2xl overflow-hidden relative z-50',
                style: { background: 'rgba(6,12,26,0.97)', border: '1px solid rgba(212,175,55,0.18)', backdropFilter: 'blur(24px)', boxShadow: '0 -8px 40px rgba(0,0,0,0.7)', animation: 'slideUp 0.22s ease' }
            },
                React.createElement('div', { className: 'px-3 pt-3 pb-1' },
                    React.createElement('p', { className: 'text-[10px] font-black text-slate-500 mb-2 text-right' }, 'أقسام إضافية')
                ),
                React.createElement('div', { className: 'grid grid-cols-4 gap-2 px-3 pb-4' },
                    ...[
                        { tab: 'clients',   icon: I.Person, label: 'الموكلين',    color: 'text-emerald-400', inactiveBg: 'bg-emerald-500/15', inactiveColor: 'text-emerald-300', activeBg: 'bg-emerald-500/25' },
                        { tab: 'documents', icon: I.Folder, label: 'المستندات',   color: 'text-purple-400',  inactiveBg: 'bg-purple-500/15',  inactiveColor: 'text-purple-300',  activeBg: 'bg-purple-500/25' },
                        { tab: 'fees',      icon: I.Money,  label: 'الأتعاب',     color: 'text-amber-300',   inactiveBg: 'bg-amber-500/15',   inactiveColor: 'text-amber-300',   activeBg: 'bg-amber-500/25' },
                        ...(isAdmin ? [{ tab: 'admin', icon: I.Shield, label: 'لوحة الإدارة', color: 'text-red-400', inactiveBg: 'bg-red-500/15', inactiveColor: 'text-red-300', activeBg: 'bg-red-500/25' }] : []),
                    ].map(item => React.createElement('button', {
                        key: item.tab,
                        onClick: () => { setTab(item.tab); setShowMore(false); },
                        className: `flex flex-col items-center gap-2 py-3.5 rounded-xl transition-all active:scale-95 ${tab === item.tab ? 'bg-white/8 ring-1 ring-white/10' : ''}`,
                    },
                        React.createElement('div', { className: `w-12 h-12 rounded-2xl flex items-center justify-center ${tab === item.tab ? item.activeBg : item.inactiveBg}` },
                            React.createElement(item.icon, { className: `w-6 h-6 ${tab === item.tab ? item.color : item.inactiveColor}` })
                        ),
                        React.createElement('span', { className: `text-[10px] font-bold ${tab === item.tab ? item.color : item.inactiveColor}` }, item.label)
                    ))
                )
            ),

            showMore && React.createElement('div', {
                className: 'pointer-events-auto fixed inset-0 z-40',
                style: { background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' },
                onClick: () => setShowMore(false)
            }),

            React.createElement('nav', {
                className: 'pointer-events-auto w-full max-w-sm h-[62px] flex items-center px-2 gap-0',
                style: {
                    background: 'rgba(15,25,50,0.97)', backdropFilter: 'blur(28px) saturate(180%)',
                    border: '1px solid rgba(212,175,55,0.25)', borderRadius: '24px',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset, 0 -4px 24px rgba(212,175,55,0.08), 0 20px 60px rgba(0,0,0,0.9)',
                }
            },
                // الرئيسية
                React.createElement('button', {
                    onClick: () => { setTab('dashboard'); setShowMore(false); },
                    className: 'flex flex-col items-center justify-center gap-[3px] flex-1 h-[50px] rounded-[18px] transition-all duration-200 active:scale-90 relative',
                    style: tab === 'dashboard' ? { background: 'rgba(212,175,55,0.1)' } : {}
                },
                    React.createElement(I.Home, { className: `w-6 h-6 transition-all duration-200 ${tab === 'dashboard' ? 'text-premium-gold -translate-y-[1px]' : 'text-white/80'}` }),
                    React.createElement('span', { className: `text-[9.5px] font-bold transition-colors duration-200 ${tab === 'dashboard' ? 'text-premium-gold' : 'text-white/70'}` }, 'الرئيسية'),
                    tab === 'dashboard' && React.createElement('div', { className: 'absolute bottom-[5px] left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full', style: { background: '#D4AF37', boxShadow: '0 0 10px 3px rgba(212,175,55,0.5)', animation: 'glowPulse 2.5s ease-in-out infinite' } })
                ),
                // الجلسات
                React.createElement('button', {
                    onClick: () => { setSessionsInitialTab(null); setTab('calendar'); setShowMore(false); },
                    className: 'flex flex-col items-center justify-center gap-[3px] flex-1 h-[50px] rounded-[18px] transition-all duration-200 active:scale-90 relative',
                    style: tab === 'calendar' ? { background: 'rgba(212,175,55,0.1)' } : {}
                },
                    React.createElement(I.CalGrid, { className: `w-6 h-6 transition-all duration-200 ${tab === 'calendar' ? 'text-premium-gold -translate-y-[1px]' : 'text-white/80'}` }),
                    React.createElement('span', { className: `text-[9.5px] font-bold transition-colors duration-200 ${tab === 'calendar' ? 'text-premium-gold' : 'text-white/70'}` }, 'الجلسات'),
                    tab === 'calendar' && React.createElement('div', { className: 'absolute bottom-[5px] left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full', style: { background: '#D4AF37', boxShadow: '0 0 10px 3px rgba(212,175,55,0.5)', animation: 'glowPulse 2.5s ease-in-out infinite' } })
                ),
                // AI
                React.createElement('div', { className: 'relative flex flex-col items-center justify-center px-2 flex-shrink-0' },
                    React.createElement('button', {
                        onClick: () => { setShowAI(true); setShowMore(false); },
                        className: 'w-[48px] h-[48px] rounded-[16px] flex items-center justify-center active:scale-90 transition-transform relative overflow-hidden',
                        style: { background: 'linear-gradient(135deg,#c9922a,#D4AF37,#E8C84A)', boxShadow: '0 4px 24px rgba(212,175,55,0.55), 0 0 0 1px rgba(212,175,55,0.3)', animation: 'pulseGlow 3s ease-in-out infinite' }
                    }, React.createElement(I.AI, { cls: 'w-6 h-6 text-[#070d1a]' })),
                    React.createElement('span', { className: 'text-[7.5px] font-black text-premium-gold mt-[2px] leading-none' }, 'AI')
                ),
                // القضايا
                React.createElement('button', {
                    onClick: () => { setTab('cases'); setShowMore(false); },
                    className: 'flex flex-col items-center justify-center gap-[3px] flex-1 h-[50px] rounded-[18px] transition-all duration-200 active:scale-90 relative',
                    style: tab === 'cases' ? { background: 'rgba(212,175,55,0.1)' } : {}
                },
                    React.createElement(I.Brief, { className: `w-6 h-6 transition-all duration-200 ${tab === 'cases' ? 'text-premium-gold -translate-y-[1px]' : 'text-white/80'}` }),
                    React.createElement('span', { className: `text-[9.5px] font-bold transition-colors duration-200 ${tab === 'cases' ? 'text-premium-gold' : 'text-white/70'}` }, 'القضايا'),
                    tab === 'cases' && React.createElement('div', { className: 'absolute bottom-[5px] left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full', style: { background: '#D4AF37', boxShadow: '0 0 10px 3px rgba(212,175,55,0.5)', animation: 'glowPulse 2.5s ease-in-out infinite' } })
                ),
                // المهام
                React.createElement('button', {
                    onClick: () => { setRemindersInitialFilter(null); setTab('reminders'); setShowMore(false); },
                    className: 'flex flex-col items-center justify-center gap-[3px] flex-1 h-[50px] rounded-[18px] transition-all duration-200 active:scale-90 relative',
                    style: tab === 'reminders' ? { background: 'rgba(212,175,55,0.1)' } : {}
                },
                    React.createElement(I.Bell, { className: `w-6 h-6 transition-all duration-200 ${tab === 'reminders' ? 'text-premium-gold -translate-y-[1px]' : 'text-white/80'}` }),
                    React.createElement('span', { className: `text-[9.5px] font-bold transition-colors duration-200 ${tab === 'reminders' ? 'text-premium-gold' : 'text-white/70'}` }, 'المهام'),
                    tab === 'reminders' && React.createElement('div', { className: 'absolute bottom-[5px] left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full', style: { background: '#D4AF37', boxShadow: '0 0 10px 3px rgba(212,175,55,0.5)', animation: 'glowPulse 2.5s ease-in-out infinite' } })
                ),
                // المزيد
                React.createElement('button', {
                    onClick: () => setShowMore(v => !v),
                    className: 'flex flex-col items-center justify-center gap-[3px] flex-1 h-[50px] rounded-[18px] transition-all duration-200 active:scale-90 relative',
                    style: (showMore || ['clients', 'fees', 'documents', 'admin'].includes(tab)) ? { background: 'rgba(212,175,55,0.1)' } : {}
                },
                    React.createElement('svg', {
                        className: `w-6 h-6 transition-all duration-200 ${(showMore || ['clients', 'fees', 'documents', 'admin'].includes(tab)) ? 'text-premium-gold -translate-y-[1px]' : 'text-white/80'}`,
                        fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: '2'
                    },
                        React.createElement('circle', { cx: '5',  cy: '12', r: '1.5', fill: 'currentColor' }),
                        React.createElement('circle', { cx: '12', cy: '12', r: '1.5', fill: 'currentColor' }),
                        React.createElement('circle', { cx: '19', cy: '12', r: '1.5', fill: 'currentColor' })
                    ),
                    React.createElement('span', { className: `text-[9.5px] font-bold transition-colors duration-200 ${(showMore || ['clients', 'fees', 'documents', 'admin'].includes(tab)) ? 'text-premium-gold' : 'text-white/70'}` }, 'المزيد'),
                    (showMore || ['clients', 'fees', 'documents', 'admin'].includes(tab)) && React.createElement('div', { className: 'absolute bottom-[5px] left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full', style: { background: '#D4AF37', boxShadow: '0 0 10px 3px rgba(212,175,55,0.5)', animation: 'glowPulse 2.5s ease-in-out infinite' } })
                )
            )
        ),

        // ── Modals ────────────────────────────────────────────
        showSearch && React.createElement(UniversalSearchModal, {
            cases, clients,
            onClose: () => setShowSearch(false),
            onOpenCase: (c: any) => { setSelectedCase(c, 'timeline'); },
            onOpenClient: (c: any) => { setSelectedClient(c); setTab('clients'); }
        }),
        showAI && createPortal(React.createElement(AILegalAssistant, { onClose: () => setShowAI(false), cases, clients, profile, country }), document.body),
        showSettings && createPortal(React.createElement(SettingsPage, { profile, isAdmin, country, onCountryChange: (c: string) => { setCountry(c); }, onClose: () => setShowSettings(false) }), document.body),
        deleteConfirm && nav.isOpen('delete') && createPortal(React.createElement(DeleteConfirmModal, {
            title: deleteConfirm.title, itemName: deleteConfirm.name, itemType: deleteConfirm.itemType,
            onConfirm: deleteConfirm.onConfirm,
            onCancel: () => { nav.closeModal('delete'); _setDeleteConfirm(null); },
            loading: false,
        }), document.body),
        showCaseModal && React.createElement(NewCaseModal, {
            onClose: () => setShowCaseModal(false), onSave: handleSaveCase, loading: savingCase,
            lawyers, isAdmin, clients,
            countryCourts: COUNTRY_CONFIGS[country]?.courts,
            countryCaseTypes: COUNTRY_CONFIGS[country]?.caseTypes,
        }),
        showNewSessionModal && React.createElement(NewStandaloneSessionModal, {
            onClose: () => setShowNewSessionModal(false),
            onSaved: () => { fetchTodaySessions(); fetchUpcomingSessions(); fetchCases(0, casesFilter); },
            onNotify: sendTelegram,
        }),
        showLawyerModal && React.createElement(NewLawyerModal, { onClose: () => setShowLawyerModal(false), onSave: handleSaveLawyer, loading: savingLawyer }),
        showClientModal && React.createElement(NewClientModal, { onClose: () => setShowClientModal(false), onSave: handleSaveClient, loading: savingClient }),
        selectedClient && nav.isOpen('clientDetail') && React.createElement(ClientDetailModal, {
            client: selectedClient,
            cases: cases.filter((c: any) => c.client_id === selectedClient.id),
            onClose: () => { nav.closeModal('clientDetail'); _setSelectedClient(null); },
            onDelete: handleDeleteClient, onEdit: handleUpdateClient,
            onOpenCase: (ca: any) => { nav.closeModal('clientDetail'); _setSelectedClient(null); setSelectedCase(ca); }
        }),
        selectedCase && nav.isOpen('caseDetail') && React.createElement(CaseDetailView, {
            caseData: selectedCase,
            client: clients.find((cl: any) => cl.id === selectedCase.client_id) || null,
            initialTab: selectedCaseInitialTab,
            onClose: () => { nav.closeModal('caseDetail'); _setSelectedCase(null); },
            onUpdate: (newStatus: string) => {
                setSelectedCase((p: any) => ({ ...p, status: newStatus }));
                setCases((prev: any[]) => prev.map(c => c.id === selectedCase.id ? { ...c, status: newStatus } : c));
                setCasesFilter(newStatus); setCasesPage(0); fetchCases(0, newStatus);
            },
            onDelete: handleDeleteCase, onEdit: handleUpdateCase, onNotify: sendTelegram, profile,
        }),

        // ── Exit Confirm ──
        nav.showExitConfirm && createPortal(
            React.createElement('div', {
                className: 'fixed inset-0 z-[9999] flex items-end justify-center',
                style: { background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' },
                onClick: nav.cancelExit
            },
                React.createElement('div', {
                    className: 'w-full max-w-sm mx-4 mb-8 rounded-3xl overflow-hidden',
                    style: { background: '#0d1f35', border: '1px solid rgba(255,255,255,0.08)' },
                    onClick: (e: any) => e.stopPropagation()
                },
                    React.createElement('div', { className: 'px-6 pt-6 pb-2 text-center' },
                        React.createElement('div', {
                            className: 'w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4',
                            style: { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }
                        },
                            React.createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', className: 'w-7 h-7 text-rose-400', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 2 },
                                React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1' })
                            )
                        ),
                        React.createElement('h3', { className: 'text-base font-black text-white mb-1' }, 'الخروج من التطبيق'),
                        React.createElement('p',  { className: 'text-xs text-slate-400 font-medium' }, 'هل تريد الخروج من سند؟')
                    ),
                    React.createElement('div', { className: 'grid grid-cols-2 gap-3 p-4' },
                        React.createElement('button', { onClick: nav.cancelExit,  className: 'py-3 rounded-2xl text-sm font-black text-white active:scale-95 transition-all', style: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' } }, 'إلغاء'),
                        React.createElement('button', { onClick: nav.confirmExit, className: 'py-3 rounded-2xl text-sm font-black text-white active:scale-95 transition-all', style: { background: 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: '0 4px 15px rgba(239,68,68,0.3)' } }, 'خروج')
                    )
                )
            ),
            document.body
        )
    );
}

export default App;
