import React, { useState, useEffect, useCallback } from 'react';
import { I, COUNTRY_CONFIGS, loadOfficeSetting } from './constants';
import { useNavigation } from './useNavigation';
import type { TabName } from './useNavigation';
import { isAdminRole, checkPermission } from './shared/lib/permissions';
import type { DeleteConfirmState } from '@/features/cases/hooks/useCaseActions';
import type { MappedCase, MappedClient } from './hooks/useAppData';
import LoginScreen from './pages/Login/LoginScreen';
import HeaderMenu from './app/HeaderMenu';
import ExitConfirmModal from './app/ExitConfirmModal';
import CommandDock from './app/CommandDock';
import AppLoadingScreen from './app/AppLoadingScreen';
import AppModals from './app/AppModals';
// ⚡ NEW (A4 — 14 أغسطس 2026، خطة Desktop Experience): استبدال الـ div
// الجذري inline بـ AppShell (اتبنى هيكليًا في A3) — نفس className ونفس
// data-testid="app-shell" بالحرف، صفر تغيير بصري.
// ⚡ B1 (14 أغسطس 2026): AppShell بقى كمان بيستقبل tab/setTab/isAdmin/
// onAIClick ويعرض DesktopSidebar الجديد على الديسكتوب جنب باقي children.
// راجع shell/AppShell.tsx وshell/DesktopSidebar.tsx.
import AppShell from './app/shell/AppShell';
import FeesTab from './features/fees/FeesTab';
import SessionsCalendar from '@/features/calendar/sessions-calendar/SessionsCalendar';
import RemindersTab from './features/reminders/RemindersTab';
import ArchiveTab from './features/dashboard/ArchiveTab';
// ⚡ FIX (تقرير تشخيص الديسكتوب، Phase 4، بند 4 — تقسيم حزمة الـ JS، 15
// أغسطس 2026): AdminPanel وكل الأقسام الإدارية التسعة اللي بيستوردها
// (~9000 سطر تقريبًا) كانوا بيتحملوا statically ضمن الـ bundle الرئيسي
// لكل المستخدمين، مع إنهم مقصورين على الأدمن بس وما بيتفتحوش غالبًا إلا
// لما المستخدم يدوس على تاب "الإدارة" فعليًا. اتحول لـ React.lazy عشان
// Vite يطلعه في chunk منفصل يتحمّل عند الحاجة بس (راجع الاستخدام تحت مع
// React.Suspense في مكان الرندر).
const AdminPanel = React.lazy(() => import('./features/admin/AdminPanel'));

// ─── Dashboard Components ─────────────────
import AppHeader from './features/dashboard/AppHeader';
import DashboardTab from './features/dashboard/DashboardTab';
import CasesTab from './features/dashboard/CasesTab';
import TeamTab from './features/dashboard/TeamTab';
import ClientsTab from './features/dashboard/ClientsTab';

// ─── Hooks ───────────────────────────────
import { useHealthMonitor } from './hooks/useHealthMonitor';
import { usePwaInstall } from './hooks/usePwaInstall';
import { useDashboardFeed } from '@/shared/hooks/useDashboardFeed';
import { useAppData } from './hooks/useAppData';
import { useTelegramAlerts } from './hooks/useTelegramAlerts';
import { useCaseActions } from '@/features/cases/hooks/useCaseActions';
import { useClientActions } from '@/features/clients/hooks/useClientActions';
import type { ClientModalContext } from '@/features/clients/hooks/useClientActions';
import type { OpenCreateClientForParty, OpenCreateClientForSessionParty } from '@/features/calendar/hooks/useClientLinking';
import { useAutoLogout } from './hooks/useAutoLogout';
import { useAuthProfile } from './hooks/useAuthProfile';
import { useThemeMode } from './hooks/useThemeMode';
import { useNavbarHeightVar } from './hooks/useNavbarHeightVar';
import { useDbConnectivity } from './hooks/useDbConnectivity';
import { useInitialDataSync } from './hooks/useInitialDataSync';

function App() {
    const { profile, setProfile, authUser, setAuthUser, authLoading, loadProfile } = useAuthProfile();

    // ── Navigation ────────────────────────────────────────────
    const nav = useNavigation();
    const tab = nav.tab;
    const setTab = useCallback((newTab: TabName) => nav.navigateTo(newTab), [nav]);

    const showCaseModal   = nav.isOpen('newCase');
    const showLawyerModal = nav.isOpen('newLawyer');
    const showClientModal = nav.isOpen('newClient');
    const showSearch      = nav.isOpen('search');
    const showAI          = nav.isOpen('ai');
    const showAIComingSoon = nav.isOpen('aiComingSoon');

    const setShowCaseModal   = useCallback((v: boolean) => v ? nav.openModal('newCase')    : nav.closeModal('newCase'),    [nav]);
    const setShowLawyerModal = useCallback((v: boolean) => v ? nav.openModal('newLawyer')  : nav.closeModal('newLawyer'),  [nav]);
    // ⚡ NEW: سياق فتح موديل "إنشاء موكل جديد" (بيانات مبدئية + هدف ربط
    // تلقائي + كول-باك بعد الربط) — بيتصفّر عند أي فتح/إغلاق مباشر للموديل
    // من غير سياق (زرار "إضافة موكل" العادي في لوحة التحكم/قسم الموكلين)،
    // عشان مايفضلش شايل هدف ربط قديم غلط.
    const [clientModalContext, setClientModalContext] = useState<ClientModalContext | null>(null);
    const setShowClientModal = useCallback((v: boolean) => {
        if (v) { setClientModalContext(null); nav.openModal('newClient'); }
        else   { nav.closeModal('newClient'); setClientModalContext(null); }
    }, [nav]);
    // ⚡ NEW: بتُستخدم في Phase 1/2/3 لفتح نفس موديل "إضافة موكل جديد" من
    // جوه قضية/جلسة، مليان ببياناتها ومربوط بيها تلقائيًا بعد الحفظ.
    const openNewClientModal = useCallback((ctx: ClientModalContext) => {
        setClientModalContext(ctx);
        nav.openModal('newClient');
    }, [nav]);
    const setShowSearch      = useCallback((v: boolean) => v ? nav.openModal('search')     : nav.closeModal('search'),     [nav]);
    const setShowAI          = useCallback((v: boolean) => v ? nav.openModal('ai')         : nav.closeModal('ai'),         [nav]);
    const setShowAIComingSoon = useCallback((v: boolean) => v ? nav.openModal('aiComingSoon') : nav.closeModal('aiComingSoon'), [nav]);
    // ⚡ NEW (قفل قسم الـAI مؤقتًا — 12 أغسطس 2026): قسم المساعد الذكي مقفول
    // دلوقتي لكل المستخدمين، وبيتفتح بدل منه مودال "قريبًا" — ما عدا حساب
    // السوبر أدمن الوحيد (m.gemy4231@gmail.com) اللي بيفتح القسم الحقيقي
    // عادي زي ما هو. نفس نمط SUPER_ADMIN_EMAIL الموجود في AdminPanel.tsx.
    const AI_SUPER_ADMIN_EMAIL = 'm.gemy4231@gmail.com';
    const isAISuperAdmin = (profile?.email || '').trim().toLowerCase() === AI_SUPER_ADMIN_EMAIL;
    // بيتبعت لـCommandDock بدل setShowAI الحقيقي: بيسمح بفتح القسم الفعلي
    // للسوبر أدمن بس، ولأي حد تاني بيفتح مودال "قريبًا". setShowAI الحقيقي
    // فاضل زي ما هو وبيتبعت لـAppModals عادي (onClose بتاع AILegalAssistant
    // لسه محتاجاه، وبرضو ممكن يتفتح مباشرة لو احتجنا مستقبلًا).
    const handleAIButtonClick = useCallback((v: boolean) => {
        if (v && !isAISuperAdmin) { setShowAIComingSoon(true); return; }
        setShowAI(v);
    }, [isAISuperAdmin, setShowAI, setShowAIComingSoon]);
    const showNewSessionModal    = nav.isOpen('newSession');
    const setShowNewSessionModal = useCallback((v: boolean) => v ? nav.openModal('newSession') : nav.closeModal('newSession'), [nav]);
    // ⚡ [جديد] بيتزوّد بعد حفظ جلسة مستقلة جديدة، عشان SessionsCalendar
    // (اللي عنده refreshKey داخلي منفصل) يعمل refetch فوري لبيانات
    // التقويم — قبل كده كان بيفضل شايف بيانات قديمة لحد ما تتغيّر
    // الشهر يدويًا. راجع SessionsCalendar.tsx / AppModals.tsx.
    const [sessionsRefreshSignal, setSessionsRefreshSignal] = useState(0);
    const bumpSessionsRefreshSignal = useCallback(() => setSessionsRefreshSignal((k) => k + 1), []);
    const showFeesSummary    = nav.isOpen('feeSummary');
    const setShowFeesSummary = useCallback((v: boolean) => v ? nav.openModal('feeSummary') : nav.closeModal('feeSummary'), [nav]);

    // ── Local UI state ────────────────────────────────────────
    const [showMore,       setShowMore]       = useState(false);
    const [showHeaderMenu, setShowHeaderMenu] = useState(false);

    const { navRef } = useNavbarHeightVar();

    const [clientSearch,   setClientSearch]   = useState('');
    const [savingCase,     setSavingCase]     = useState(false);
    const [savingLawyer,   setSavingLawyer]   = useState(false);
    const [savingClient,   setSavingClient]   = useState(false);
    const [sessionsInitialTab,      setSessionsInitialTab]      = useState<'month'|'calendar'|'missed'|null>(null);
    const [remindersInitialFilter,  setRemindersInitialFilter]  = useState<string|null>(null);

    const [selectedCase,      _setSelectedCase]  = useState<MappedCase | null>(null);
    const [selectedCaseInitialTab, setSelectedCaseInitialTab] = useState('timeline');
    const [selectedClient,    _setSelectedClient]= useState<MappedClient | null>(null);
    // ⚡ NEW (بيانات الموكل مش قابلة للتعديل من داخل القضية/الجلسة): لما
    // زرار "✏️ عدّل من ملف الموكل" يتضغط جوه فورم تعديل قضية/جلسة، عايزين
    // نفتح تفاصيل الموكل بفورم التعديل شغال على طول (مش شاشة تفاصيل بس
    // محتاجة ضغطة تانية).
    const [selectedClientEditMode, setSelectedClientEditMode] = useState(false);
    const [deleteConfirm,     _setDeleteConfirm] = useState<DeleteConfirmState | null>(null);

    const { darkMode, toggleTheme } = useThemeMode();
    const [country, setCountry] = useState('EG');
    const { dbOnline } = useDbConnectivity(profile);

    // ── تحميل الدولة من office_settings بعد ما الـ profile يتحمّل ──
    useEffect(() => {
        if (!profile) return;
        loadOfficeSetting('country').then((saved) => {
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
        // ⚡ FIX (باگ "الموكل محذوف" غلط لما القضية فيها موكل مش من ضمن
        // أول 15 المحمّلين): clientsWithExtras بديل clients لأي بحث عن
        // موكل بعينه (مش عرض قايمة)، وensureClientsLoaded بيجيب أي موكل
        // بالـid مباشرة لو مش محمّل.
        clientsWithExtras, ensureClientsLoaded,
        // ⚡ NEW (8 أغسطس 2026 — البند 4 من تقرير حالة التنفيذ): نفس فيكس
        // clientsWithExtras بالظبط، بس للقضايا — تاب الأتعاب محتاج قضايا
        // خارج أول صفحة محمّلة (snapshot اسم/نوع القضية عند حفظ/حذف أتعاب).
        casesWithExtras, ensureCasesLoaded,
        lawyers,  setLawyers,
        fetchCases, fetchLawyers, fetchClients, searchCases,
    } = data;
    const { sendTelegram }                                      = useTelegramAlerts(profile);

    // ── Modal helpers ─────────────────────────────────────────
    const setSelectedCase = useCallback((caseOrUpdater: React.SetStateAction<MappedCase | null>, initialTab: string = 'timeline') => {
        if (typeof caseOrUpdater === 'function') { _setSelectedCase(caseOrUpdater); return; }
        if (caseOrUpdater) {
            _setSelectedCase(caseOrUpdater);
            setSelectedCaseInitialTab(initialTab);
            nav.openModal('caseDetail');
            // ⚡ FIX (باگ "الموكل محذوف" غلط): نتأكد إن الموكل الأساسي
            // وموكلين الأطراف بتوع القضية دي متاحين فعليًا (مش بس ضمن
            // أول 15 موكل محمّلين في الذاكرة) وقت ما القضية بتتفتح.
            ensureClientsLoaded([
                caseOrUpdater.client_id,
                ...(caseOrUpdater.parties || []).map((p) => p.client_id),
            ]);
        } else { _setSelectedCase(null); }
    }, [nav, ensureClientsLoaded]);

    const setSelectedClient = useCallback((clientOrNull: MappedClient | null, openInEditMode: boolean = false) => {
        if (clientOrNull) { _setSelectedClient(clientOrNull); setSelectedClientEditMode(openInEditMode); nav.openModal('clientDetail'); }
        else              { _setSelectedClient(null); setSelectedClientEditMode(false); }
    }, [nav]);

    const setDeleteConfirm = useCallback((v: DeleteConfirmState | null) => {
        if (v) { _setDeleteConfirm(v); nav.openModal('delete'); }
        else   { _setDeleteConfirm(null); }
    }, [nav]);

    const { handleLogout, handleSaveCase, handleDeleteCase, handleUpdateCase, handleLinkClient, handleLinkClientForParty, handleUnlinkClient, handleUnlinkClientForParty } = useCaseActions({
        // ⚡ FIX (8 أغسطس 2026): clientsWithExtras بدل clients الخام — كانت
        // useCaseActions بتدوّر بـ clients.find(id) على القايمة المقيّدة
        // بالصفحة (15 موكل)، فممكن تسجّل client_name فاضي في اللوج لموكل
        // موجود فعليًا بس مش من ضمن أول صفحة محمّلة. راجع تعليق useAppData.ts.
        sendTelegram, fetchCases, cases, lawyers, clients: clientsWithExtras, selectedCase,
        setCases, setLawyers, setClients, setProfile, setAuthUser,
        setSelectedCase, setDeleteConfirm, setSavingCase, setShowCaseModal,
        casesFilter, nav, profile,
    });
    const { handleSaveClient, handleDeleteClient, handleUpdateClient, handleSaveLawyer } = useClientActions({
        // ⚡ FIX (8 أغسطس 2026): نفس فيكس useCaseActions فوق بالظبط.
        sendTelegram, fetchClients, fetchLawyers, clients: clientsWithExtras, clientSearch,
        setClients, setSelectedClient, setDeleteConfirm, setSavingClient,
        setSavingLawyer, setShowClientModal, setShowLawyerModal, nav, profile,
        clientLinkTarget: clientModalContext?.linkTarget ?? null,
        onClientLinked: clientModalContext?.onLinked,
    });

    // ⚡ NEW (خطة توحيد إنشاء الموكل، Phase 1): زرار "➕ إنشاء موكل جديد"
    // في تفاصيل القضية (InfoSection) بقى بيفتح NewClientModal الكامل —
    // نفس موديل قسم الموكلين — مليان ببيانات المدعي من القضية، بدل ما
    // يعمل INSERT مباشر بحقول ناقصة (اسم + رقم قومي بس).
    const handleOpenCreateClientForCase = useCallback((
        caseId: string, plaintiffName: string, plaintiffNationalId?: string | null, plaintiffPoa?: string | null,
        // ⚡ NEW (21 يوليو 2026): عنوان الموكل — لو القضية عندها عنوان مسجل
        // بالفعل (plaintiff_address)، بيتملى تلقائيًا هنا بدل ما يتكتب من
        // تاني، عشان عنوان الموكل الجديد ميختلفش عن اللي مسجل في القضية.
        plaintiffAddress?: string | null,
        // ⚡ NEW (Phase 2): لو القضية المستهدفة نفسها لسه معرّف مؤقت أوفلاين
        // (تم إنشاؤها من جلسة مستقلة ولسه ما اتزامنتش) — شوف
        // handleAddAndLinkClient في useClientLinking.ts. فاضي دايمًا لمسار
        // Phase 1 (قضية محفوظة بالفعل ليها id حقيقي).
        caseOfflineInfo?: { isOfflineTemp: boolean; fallbackTitle?: string },
    ) => {
        openNewClientModal({
            initialData: {
                full_name: plaintiffName || '',
                national_id: plaintiffNationalId || '',
                cr_number: plaintiffPoa || '',
                address: plaintiffAddress || '',
            },
            linkTarget: {
                type: 'case', caseId,
                caseIsOfflineTemp: caseOfflineInfo?.isOfflineTemp,
                caseFallbackTitle: caseOfflineInfo?.fallbackTitle,
            },
            contextLabel: 'هيتربط الموكل تلقائيًا بهذه القضية بعد الحفظ',
            onLinked: (target, clientId) => {
                if (target.type !== 'case') return;
                setCases((prev) => prev.map((c) => (c.id === target.caseId ? { ...c, client_id: clientId } : c)));
                setSelectedCase((prev) => (prev && prev.id === target.caseId ? { ...prev, client_id: clientId } : prev));
                fetchCases(casesPage, casesFilter);
                fetchClients(0, clientSearch);
            },
        });
    }, [openNewClientModal, fetchCases, casesPage, casesFilter, fetchClients, clientSearch, setSelectedCase, setCases]);

    // ⚡ NEW (خطة تعدد الأطراف، 7.2 جزء 2 بند 2.3 — 23 يوليو 2026): نفس
    // فكرة handleOpenCreateClientForCase فوق بالظبط، بس لطرف بعينه وسط
    // wizard "طرف واحد في المرة" (useClientLinking.ts) بدل "الموكل
    // الأساسي" بس — linkTarget نوعه 'party' (partyId+caseId+isPrimaryParty)
    // بدل 'case' مباشرة، عشان useClientActions.ts يربط case_parties.client_id
    // بتاع الطرف ده بس (+ cases.client_id لو الطرف أساسي، عبر linkClientToParty
    // المشتركة). onAfterLink بتتنادى هنا (جوه onLinked، بعد نجاح الربط
    // الفعلي) عشان الـ wizard في useClientLinking.ts ينتقل للطرف الجاي —
    // شوف تعليق OpenCreateClientForParty في useClientLinking.ts لتفاصيل
    // السبب المعماري.
    const handleOpenCreateClientForParty: OpenCreateClientForParty = useCallback((
        partyId, caseId, isPrimaryParty, partyName, partyNationalId, partyPoa, partyAddress,
        caseOfflineInfo, onAfterLink,
    ) => {
        openNewClientModal({
            initialData: {
                full_name: partyName || '',
                national_id: partyNationalId || '',
                cr_number: partyPoa || '',
                address: partyAddress || '',
            },
            linkTarget: {
                type: 'party', partyId, caseId, isPrimaryParty,
                caseIsOfflineTemp: caseOfflineInfo?.isOfflineTemp,
                caseFallbackTitle: caseOfflineInfo?.fallbackTitle,
            },
            contextLabel: 'هيتربط الموكل تلقائيًا بهذا الطرف بعد الحفظ',
            onLinked: (target, clientId) => {
                if (target.type !== 'party') return;
                // ⚡ cases.client_id مبيتحدّثش هنا مباشرة إلا لو الطرف أساسي —
                // linkClientToParty (المستخدمة جوه handleSaveClient) هي اللي
                // بتقرر ده فعليًا؛ هنا بس بنعكس نفس القرار في الـ state
                // المحلي (setCases/setSelectedCase) عشان الواجهة تتحدّث فورًا
                // من غير استنى fetchCases.
                if (target.isPrimaryParty) {
                    setCases((prev) => prev.map((c) => (c.id === target.caseId ? { ...c, client_id: clientId } : c)));
                    setSelectedCase((prev) => (prev && prev.id === target.caseId ? { ...prev, client_id: clientId } : prev));
                }
                fetchCases(casesPage, casesFilter);
                fetchClients(0, clientSearch);
                onAfterLink();
            },
        });
    }, [openNewClientModal, fetchCases, casesPage, casesFilter, fetchClients, clientSearch, setSelectedCase, setCases]);
    // الموكلين فقط" (جلسة مستقلة بعد حفظها) بقى بيفتح NewClientModal
    // الكامل — بدل INSERT مباشر بحقلين بس (اسم + رقم قومي)، مليان ببيانات
    // المدعي من الجلسة. لو sessionId فاضي (الجلسة لسه ما اتحفظتش أونلاين)
    // بنفتح الموديل من غير target ربط، زي السلوك القديم بالظبط.
    const handleOpenCreateClientForSession = useCallback((
        sessionId: string | null, plaintiffName: string, plaintiffNationalId?: string | null, plaintiffPoa?: string | null,
    ) => {
        openNewClientModal({
            initialData: {
                full_name: plaintiffName || '',
                national_id: plaintiffNationalId || '',
                cr_number: plaintiffPoa || '',
            },
            linkTarget: sessionId ? { type: 'session', sessionId } : undefined,
            contextLabel: sessionId ? 'هيتربط الموكل تلقائيًا بالجلسة الحالية' : undefined,
            onLinked: (target) => {
                if (target.type !== 'session') return;
                fetchTodaySessions();
                fetchUpcomingSessions();
                fetchClients(0, clientSearch);
            },
        });
    }, [openNewClientModal, fetchTodaySessions, fetchUpcomingSessions, fetchClients, clientSearch]);

    // ⚡ NEW (خطة تعدد الأطراف، مرحلة 13 جزء 2 — 23 يوليو 2026): مرآة لـ
    // handleOpenCreateClientForParty فوق، بس لطرف تابع لجلسة مستقلة لسه
    // ما اتحوّلتش لقضية (خطوة "idle" في NewStandaloneSessionModal — زرار
    // "إضافة الموكل لقائمة الموكلين فقط"). linkTarget نوعه 'sessionParty'
    // (partyId+sessionId+isPrimaryParty) بدل 'party' — عشان useClientActions.ts
    // يستخدم linkClientToSessionParty (case_parties.client_id + مزامنة
    // case_sessions.client_id لو الطرف أساسي، مفيش cases.client_id هنا
    // أصلًا). onAfterLink بتتنادى من useClientLinking.ts (مش wizard — كل
    // زرار مستقل، بيتشال من idlePartyList لوحده بعد نجاح الربط).
    const handleOpenCreateClientForSessionPartyOnly: OpenCreateClientForSessionParty = useCallback((
        partyId, sessionId, isPrimaryParty, partyName, partyNationalId, partyPoa, partyAddress, onAfterLink,
    ) => {
        openNewClientModal({
            initialData: {
                full_name: partyName || '',
                national_id: partyNationalId || '',
                cr_number: partyPoa || '',
                address: partyAddress || '',
            },
            linkTarget: { type: 'sessionParty', partyId, sessionId, isPrimaryParty },
            contextLabel: 'هيتربط الموكل تلقائيًا بهذا الطرف بعد الحفظ',
            onLinked: (target) => {
                if (target.type !== 'sessionParty') return;
                fetchTodaySessions();
                fetchUpcomingSessions();
                fetchClients(0, clientSearch);
                onAfterLink();
            },
        });
    }, [openNewClientModal, fetchTodaySessions, fetchUpcomingSessions, fetchClients, clientSearch]);

    const handleAutoLogout = useCallback(() => {
        setCases([]); setLawyers([]); setClients([]);
        setProfile(null); setAuthUser(null);
    }, [setCases, setLawyers, setClients, setProfile, setAuthUser]);
    useAutoLogout(profile, handleAutoLogout);

    // 🆕 (بند 6) — بدل التكرار الحرفي؛ نفس المنطق في useAppData.ts الآن
    // مستورد من مصدر واحد (shared/lib/permissions.ts).
    const isAdmin = isAdminRole(profile);
    // ⚡ NEW (خطة تفعيل الصلاحيات التفصيلية، مرحلة 3 — 16 أغسطس 2026):
    // can_view_fees مقفول بلا استثناء لغير admin (قرار 2.1 من الخطة —
    // مفيش أي استثناء صريح ممكن يفتحه)، فعمليًا هو نفس isAdmin دايمًا،
    // لكن بنستخدم checkPermission() صراحةً هنا (مش isAdmin مباشرة) عشان
    // يفضل متوافق تلقائيًا لو القرار ده اتغيّر يومًا ما (has_permission()
    // على القاعدة هو المرجع الحقيقي دايمًا).
    const canViewFees = checkPermission(profile, 'can_view_fees');

    // ── Initial data fetch + إعادة تحميل بعد المزامنة الأوفلاين ──
    useInitialDataSync({
        profile, casesFilter, clientSearch,
        fetchTodaySessions, fetchMissedSessions, fetchTasks,
        fetchCases, fetchClients, fetchUpcomingSessions, fetchLawyers,
    });

    // ─────────────────────────────────────────────────────────
    //  Loading screen
    // ─────────────────────────────────────────────────────────
    if (authLoading) return React.createElement(AppLoadingScreen);

    if (!authUser || !profile) return React.createElement(LoginScreen, { onLogin: (u) => loadProfile(u) });

    // ─────────────────────────────────────────────────────────
    //  Render
    // ─────────────────────────────────────────────────────────
    const Header      = React.createElement(AppHeader, { profile, setShowMenu: (v: boolean) => setShowHeaderMenu(v), setShowSearch, isAdmin, fetchCases, casesFilter, loadingCases: casesLoading });
    const Dashboard   = React.createElement(DashboardTab, {
        profile, cases, clients: clientsWithExtras,
        todaySessions, upcomingSessions, missedSessions,
        upcomingTasks, missedTasks, loadingUrgent,
        todayOpen, setTodayOpen, upcomingOpen, setUpcomingOpen,
        upcomingTasksOpen, setUpcomingTasksOpen,
        setSelectedCase, setShowCaseModal, setShowClientModal, setShowNewSessionModal,
        setTab, setRemindersInitialFilter, setSessionsInitialTab,
        dbOnline, healthErrors, setHealthErrors,
        fetchTodaySessions, fetchUpcomingSessions, fetchMissedSessions,
        // ⚡ NEW (خطة توحيد مصدر بيانات الموكل، مرحلة 3): زرار "عدّل من ملف
        // الموكل" جوه EditStandaloneModal — نفس آلية فتح تفاصيل الموكل.
        onOpenClientProfile: (c) => setSelectedClient(c as MappedClient, true),
        // 🔒 FIX (نفس باگ CaseDetailView.tsx — 12 أغسطس 2026): nav متاحة
        // هنا فعلًا (استُخدمت أصلًا لـArchiveTab تحت)، فبنمررها جاهزة
        // لـDashboardTab اللي مالوش وصول مباشر لـnav.
        clientProfileOpen: nav.isOpen('clientDetail'),
        // ⚡ NEW (توحيد "المحكمة"/"نوع القضية" مع فورمي القضية — 12 أغسطس
        // 2026): نفس props بالظبط اللي AppModals.tsx بيبعتها لـNewCaseModal.
        countryCourts: COUNTRY_CONFIGS[country]?.courts,
        countryCaseTypes: COUNTRY_CONFIGS[country]?.caseTypes,
    });
    const CasesTabContent   = React.createElement(CasesTab, {
        cases, casesFilter, setCasesFilter, casesPage, setCasesPage,
        casesTotal, casesLoading, fetchCases, searchCases, casesSearch, setCasesSearch,
        setShowCaseModal, setSelectedCase,
        loadingCases: casesLoading, dbError,
        // 🆕 (بند 1.2 — 6 أغسطس 2026): بادج "موكل محذوف" على كارت القضية.
        // ⚡ FIX (8 أغسطس 2026): clientsWithExtras بدل clients الخام —
        // كان بيوهم إن الموكل محذوف لمجرد إنه مش من ضمن أول 15 محمّلين.
        clients: clientsWithExtras,
        profile, // ⚡ NEW (مرحلة 3 خطة الصلاحيات): لزرار "تقييد قضية" — can_add_cases
    });
    const TeamTabContent    = React.createElement(TeamTab,    { lawyers, setShowLawyerModal });
    const ClientsTabContent = React.createElement(ClientsTab, {
        cases, clients, clientSearch, setClientSearch,
        clientsPage, setClientsPage, clientsTotal, clientsLoading,
        fetchClients, setSelectedClient, setShowClientModal,
        profile, // ⚡ NEW (مرحلة 3 خطة الصلاحيات): لزرار "موكل جديد" — can_add_clients
    });
    const DocsTab = React.createElement(ArchiveTab, { cases, clients: clientsWithExtras, nav });

    const showMenu = showHeaderMenu;

    // ⚡ A4: كان `React.createElement('div', { className: 'h-full flex flex-col
    // bg-premium-bg', 'data-testid': 'app-shell' }, ...)` — بقى AppShell بدل
    // الـ div الجذري inline. AppShell.tsx (A3) بيرجّع بالظبط نفس الـ
    // className/data-testid، فمفيش أي فرق في الـ DOM الناتج.
    // ⚡ B1 (14 أغسطس 2026): تمرير props التنقل لـAppShell عشان يقدر
    // يقرر عرض DesktopSidebar على الديسكتوب — نفس isAdmin وhandleAIButtonClick
    // المستخدمين فعليًا مع CommandDock تحت، بدون أي تعديل على منطقهم.
    // ⚡ B3 (14 أغسطس 2026): نفس المبدأ لكن لـDesktopHeader — بتبعتله
    // بالظبط نفس الـprops اللي بتتبعت لـAppHeader تحت (profile،
    // setShowMenu عبر setShowHeaderMenu، setShowSearch، fetchCases،
    // casesFilter، loadingCases: casesLoading) من غير أي تعديل عليهم.
    return React.createElement(AppShell, {
        tab, setTab, isAdmin, onAIClick: handleAIButtonClick,
        profile, setShowMenu: (v: boolean) => setShowHeaderMenu(v), setShowSearch,
        fetchCases, casesFilter, loadingCases: casesLoading,
    },

        // ⚡ H2 (16 أغسطس 2026): AppHeader القديم بقى `lg:hidden` — كان
        // ظاهر مؤقتًا فوق DesktopHeader (B3) لحد ما تتوفر تغطية اختبار
        // موبايل بديلة (G3، مُسلَّمة فعليًا) تسمح بالإخفاء الآمن. زرار
        // `header-search-open` (مستخدم في universal-search.spec.ts) لسه
        // موجود بالكامل تحت 1024px — الاختبارات الحالية (chromium project)
        // بقت تستخدم `desktop-header-search-open` بدل منه (راجع e2e/utils.ts).
        React.createElement('div', {
            className: 'lg:hidden',
            style: showMenu ? { filter: 'blur(3px) brightness(0.4)', transition: 'filter 0.2s ease', pointerEvents: 'none' } : { transition: 'filter 0.2s ease' }
        }, Header),

        // ── Dropdown menu ──
        React.createElement(HeaderMenu, { showMenu, setShowHeaderMenu, darkMode, toggleTheme, handlePwaInstall, handleLogout }),

        // ⚡ B4 (14 أغسطس 2026): أضفت `lg:ps-[var(--app-sidebar-w)]` —
        // `ps-` (padding-inline-start) مش `pe-` (تصحيح موثّق في تعليقات
        // DesktopSidebar.tsx B2: مع dir="rtl"، `ps-` هي اللي بتترجم فعليًا
        // لـpadding-right، يعني بتحجز مساحة يمين المحتوى تساوي عرض
        // السايدبار الحقيقي فعليًا — القيمة بتتحدث ديناميكيًا (260px
        // موسّع / 72px مطوي) عبر useSidebarWidthVar جوه DesktopSidebar.tsx
        // نفسه. `lg:` بس عشان القيمة دي ملهاش أي تأثير تحت 1024px (نفس
        // فيوبورت ظهور DesktopSidebar نفسه). `lg:transition-[padding]`
        // بنفس مدة انتقال عرض السايدبار (200ms) عشان الحركتين تتزامنوا
        // بصريًا وقت الطي/الفرد. صفر تغيير على أي كلاس تاني موجود.
        // ⚡ C1 (14 أغسطس 2026): زودت padding أفقي/رأسي على `lg:`/`xl:` بس
        // (px-4 py-4 الأصلية بتفضل زي ما هي تمامًا تحت 1024px) — على
        // الديسكتوب المحتوى كان ملاصق بنفس مسافات الموبايل الضيقة رغم
        // المساحة الأكبر (الملاحظة رقم 4 في تحليل الفحص). صفر تغيير على
        // pb-32 (لسه محتاجينها لمسافة CommandDock اللي لسه ظاهر على
        // الديسكتوب مؤقتًا زي ما اتوثق في B1).
        React.createElement('main', {
            // 🔒 FIX (فحص لوجز E2E — 15 أغسطس 2026): كان `lg:px-8`/`xl:px-12`
            // بيحطوا padding-right فيزيائي صريح على نفس الحافة اللي
            // `lg:ps-[var(--app-sidebar-w)]` بيحجزها منطقيًا (padding-
            // inline-start ⇒ padding-right في RTL)، والاتنين بيتنافسوا على
            // نفس الخاصية الفيزيائية النهائية — فكان أحيانًا padding-right
            // الفيزيائي بيكسب الـcascade ويصفّر مساحة السايدبار المحجوزة،
            // فمحتوى الديسكتوب (زي كارت "اليوم" في عمود الـgrid الضيق يمين)
            // كان بيتمد تحت DesktopSidebar فعليًا ويصير غير قابل للنقر
            // (سبب فشل dashboard-tab.spec.ts في CI). الحل: مفيش أي padding
            // فيزيائي على نفس الحافة خالص — `lg:pe-*`/`xl:pe-*` (نهاية
            // منطقية ⇒ يسار فيزيائي في RTL، حافة تانية تمامًا) للمسافة
            // البصرية، وقيمة ps محسوبة واحدة بس بتجمع مساحة السايدبار +
            // المسافة البصرية المطلوبة لنفس الحافة، فمفيش تعارض ممكن يحصل
            // بغض النظر عن ترتيب الـcascade.
            //
            // 🔒 FIX (تشخيص لوجز CI — 15 أغسطس 2026، تاني): نفس فئة الباج
            // فوق بالظبط لكن على `padding-bottom` بدل `padding-right`.
            // `lg:py-6` (اللي C1 ضافته) هي shorthand بتحط `padding-top`
            // *و* `padding-bottom` مع بعض. عند ≥1024px، الاتنين (`pb-32`
            // و`lg:py-6`) بيستهدفوا نفس الخاصية الفيزيائية على نفس
            // العنصر بنفس الـspecificity — وقاعدة `lg:py-6` (جوه
            // `@media`) بتيجي بعد قاعدة `pb-32` (من غير media query) في
            // stylesheet Tailwind المولّد، فبتكسب الـcascade وتصفّر
            // مسافة الـ8rem (128px) المحجوزة لـCommandDock لـ1.5rem
            // (24px) بس — أقل بكتير من ارتفاع الدوك الفعلي (~74px)،
            // فمحتوى الديسكتوب (زي كارت "اليوم"/كروت الكالندر) بيتمد
            // تحت أزرار الدوك ويصير غير قابل للنقر (سبب فشل
            // dashboard-tab.spec.ts وsession-update.spec.ts
            // وstandalone-sessions.spec.ts في CI — كلهم بس على مشروع
            // chromium/Desktop Chrome، أبدًا على mobile، لأن `lg:` مالهاش
            // تأثير تحت 1024px). الحل: `lg:pt-6` بدل `lg:py-6` — بيدي
            // نفس تحسين المسافة العلوية اللي C1 قصدها بالظبط، من غير ما
            // يلمس `padding-bottom` خالص، فـ`pb-32` (غير الـprefixed،
            // بتفضل سارية على كل الأحجام) بترجع تحكم فعليًا.
            // ⚡ H2 (16 أغسطس 2026): زودت `lg:pb-6` — بعد إخفاء CommandDock
            // فعليًا على الديسكتوب (`lg:hidden` فوق)، مسافة الأمان `pb-32`
            // (128px، لسه لازمة على الموبايل) بقت بلا داعي على `lg:` وبتسيب
            // فراغ فاضي كبير تحت المحتوى. `lg:pb-6` (نفس قيمة `lg:pt-6`
            // تناظريًا) بتكسب الـcascade بنفس آلية fix الـ`padding-bottom`
            // الموثقة فوق (قاعدة `lg:` جوه `@media` بتيجي بعد `pb-32` في
            // stylesheet Tailwind المولّد).
            className: `flex-1 overflow-y-auto no-scrollbar lg:transition-[padding] lg:duration-200 ${tab === 'admin' ? 'lg:ps-[var(--app-sidebar-w)]' : 'px-4 py-4 pb-32 lg:ps-[calc(var(--app-sidebar-w)+2rem)] lg:pe-8 lg:pt-6 lg:pb-6 xl:ps-[calc(var(--app-sidebar-w)+3rem)] xl:pe-12'}`,
            style: showMenu ? { filter: 'blur(3px) brightness(0.4)', transition: 'filter 0.2s ease', pointerEvents: 'none' } : { transition: 'filter 0.2s ease' }
        },
            // ⚡ C1: `max-width` + توسيط اتحط على **wrapper جوّه `<main>`**
            // مش على `<main>` نفسه عمدًا. لو اتحط على `<main>` مباشرة، الـ
            // `lg:ps-[var(--app-sidebar-w)]` (مساحة السايدبار المحجوزة)
            // كانت هتبقى جزء من الصندوق اللي بيتوسّط، وعلى شاشات أعرض من
            // 1600px+هوامش التوسيط، ده كان هيزحزح المساحة المحجوزة عن
          // مكان `DesktopSidebar.tsx` الفعلي (اللي `fixed` وثابت فعليًا
            // في أقصى يمين الـviewport) ويسبب تداخل بصري. التوسيط هنا
            // بيحصل **بعد** ما `<main>` يحجز مساحة السايدبار، يعني بيتوسط
            // جوّه المساحة المتبقية فعليًا مش جوّه الـviewport كله.
            // `w-full` عشان الـwrapper ياخد نفس عرض `<main>` تحت 1024px
            // (صفر تأثير على الموبايل).
            React.createElement('div', { className: 'w-full lg:max-w-[1600px] lg:mx-auto' },
            tab === 'dashboard'  && Dashboard,
            tab === 'cases'      && CasesTabContent,
            tab === 'clients'    && ClientsTabContent,
            tab === 'calendar'   && React.createElement('div', { className: 'space-y-4 fade-in' },
                React.createElement('div', { className: 'flex items-center justify-between' },
                    React.createElement('h3', { className: 'text-xl font-black text-white' }, '📅 الجلسات'),
                    React.createElement('button', {
                        onClick: () => setShowNewSessionModal(true),
                        'data-testid': 'calendar-new-session-button',
                        className: 'flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-black text-premium-bg transition-all active:scale-95',
                        style: { background: 'linear-gradient(135deg,#d4af37,#f0c040)' }
                    }, React.createElement('span', { className: 'text-sm' }, '⚡'), 'إضافة جلسة')
                ),
                React.createElement(SessionsCalendar, {
                    cases, clients: clientsWithExtras,
                    onOpenCase: (c) => { setSelectedCase(c, 'timeline'); },
                    onOpenReminders: () => { setRemindersInitialFilter('overdue'); setTab('reminders'); },
                    onClientAdded: () => { fetchClients(0, clientSearch); },
                    initialTab: sessionsInitialTab ?? undefined,
                    externalRefreshSignal: sessionsRefreshSignal,
                    nav,
                    onOpenClientProfile: (c) => setSelectedClient(c as MappedClient, true),
                    // ⚡ NEW (توحيد "المحكمة"/"نوع القضية" مع فورمي القضية —
                    // 12 أغسطس 2026): نفس props بالظبط اللي AppModals.tsx
                    // بيبعتها لـNewCaseModal.
                    countryCourts: COUNTRY_CONFIGS[country]?.courts,
                    countryCaseTypes: COUNTRY_CONFIGS[country]?.caseTypes,
                })
            ),
            // ⚡ FIX (8 أغسطس 2026 — البند 4 من تقرير حالة التنفيذ): casesWithExtras
            // بدل cases الخام — useFeesActions/useInvoicePrinting/FeeCard كانوا
            // بيدوّروا بـ cases.find(id) على القايمة المقيّدة بالصفحة، فممكن
            // يسجّلوا case_name/case_type فاضيين في اللوج/الفاتورة لقضية موجودة
            // فعليًا بس مش من ضمن أول صفحة محمّلة (نفس فئة باگ "اليتيم الوهمي").
            // ⚡ NEW (خطة تفعيل الصلاحيات التفصيلية، مرحلة 3): تاب الأتعاب
            // بالكامل محكوم بـcan_view_fees — دفاع فعلي هنا (مش بس إخفاء
            // زرار التنقل) لأن التاب ممكن يتوصله برضو عن طريق رابط مباشر
            // (PATH_TABS فى useNavigation.ts بيدعم deep linking بالـURL)،
            // مش بس عن طريق الضغط على زرار "الأتعاب". نفس نمط تاب 'team'
            // فوق بالظبط.
            tab === 'fees' && (canViewFees
                ? React.createElement(FeesTab, { cases: casesWithExtras, clients: clientsWithExtras, showSummaryModal: showFeesSummary, setShowSummaryModal: setShowFeesSummary, country, profile, nav, ensureClientsLoaded })
                : React.createElement('div', { className: 'text-center text-slate-500 text-xs pt-20' }, 'غير مصرح لك بهذا القسم')
            ),
            tab === 'reminders' && React.createElement('div', { className: 'space-y-4 fade-in' },
                React.createElement(RemindersTab, { initialFilter: remindersInitialFilter, profile, nav })
            ),
            tab === 'team' && (isAdmin
                ? TeamTabContent
                : React.createElement('div', { className: 'text-center text-slate-500 text-xs pt-20' }, 'غير مصرح لك بهذا القسم')
            ),
            tab === 'documents' && DocsTab,
            tab === 'admin' && (isAdmin
                // ⚡ FIX (8 أغسطس 2026 — البند 5 من تقرير حالة التنفيذ): clientsWithExtras
                // بدل clients الخام — useAdminArchive بيدوّر بـ clients.find(id) عشان
                // client_name في سجل موكل مؤرشف، فممكن يرجع فاضي لموكل مش من ضمن
                // أول صفحة محمّلة.
                // ⚡ Suspense مطلوب هنا لأن AdminPanel بقى React.lazy (بند 4 فوق) —
                // الـ fallback بسيط (سبينر) وبيبان لحظيًا بس أول ما الـ chunk
                // يتحمّل (أغلب الوقت من الكاش بعد أول زيارة)، صفر تغيير على شكل
                // AdminPanel نفسه بعد التحميل.
                ? React.createElement(React.Suspense, {
                      fallback: React.createElement('div', { className: 'flex items-center justify-center pt-24' },
                          React.createElement(I.Spin)
                      )
                  },
                      React.createElement(AdminPanel, { profile, lawyers, clients: clientsWithExtras, fetchLawyers, country, onCountryChange: (c: string) => { setCountry(c); }, nav, casesTotal, clientsTotal })
                  )
                : React.createElement('div', { className: 'flex flex-col items-center justify-center pt-24 gap-3' },
                    React.createElement('div', { className: 'w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center' },
                        React.createElement(I.Shield, { className: 'w-7 h-7 text-red-400' })
                    ),
                    React.createElement('p', { className: 'text-xs font-bold text-slate-400' }, 'هذا القسم للمديرين فقط')
                )
            )
            )
        ),

        // ── COMMAND DOCK ──────────────────────────────────────────────────────
        // ⚡ H2 (16 أغسطس 2026): اتلف بـ`div.lg:hidden` بدل تعديل
        // CommandDock.tsx نفسه (نفس مبدأ "صفر تعديل" المتبع من B1) —
        // بما إن جذر CommandDock نفسه `fixed`، والأب لو `display:none`
        // (نتيجة `lg:hidden`) بيمنع رندر أي عنصر جواه بغض النظر عن
        // `position`، فده كافٍ لإخفائه بالكامل على الديسكتوب من غير
        // أي لمس لملفه. التنقل على الديسكتوب بقى عبر DesktopSidebar
        // (B1) بس، والاختبارات بقت تستخدم `desktop-nav-*` بدل `nav-*`
        // (راجع e2e/utils.ts).
        React.createElement('div', { className: 'lg:hidden' },
            React.createElement(CommandDock, {
                tab, setTab, showMore, setShowMore, isAdmin, navRef,
                setShowAI: handleAIButtonClick, setSessionsInitialTab, setRemindersInitialFilter,
            })
        ),

        // ── Modals ────────────────────────────────────────────
        React.createElement(AppModals, {
            // ⚡ FIX (8 أغسطس 2026): clientsWithExtras بدل clients الخام —
            // راجع تعليق useAppData.ts/setSelectedCase فوق.
            cases, casesWithExtras, ensureCasesLoaded, clients: clientsWithExtras, ensureClientsLoaded, lawyers, profile, country, isAdmin, casesFilter, nav,
            showSearch, showAI, showAIComingSoon, showCaseModal, showNewSessionModal,
            showLawyerModal, showClientModal, savingCase, savingLawyer, savingClient,
            deleteConfirm, selectedClient, selectedClientEditMode, selectedCase, selectedCaseInitialTab,
            clientModalContext, openNewClientModal,
            setShowSearch, setShowAI, setShowAIComingSoon, setShowCaseModal, setShowNewSessionModal,
            setShowLawyerModal, setShowClientModal, setTab,
            setSelectedCase, setSelectedClient,
            _setDeleteConfirm, _setSelectedClient, _setSelectedCase,
            setCases, setCasesFilter, setCasesPage,
            fetchCases, fetchTodaySessions, fetchUpcomingSessions, fetchMissedSessions,
            onStandaloneSessionSaved: bumpSessionsRefreshSignal,
            fetchClients, clientSearch,
            handleSaveCase, handleDeleteCase, handleUpdateCase, handleLinkClient, handleLinkClientForParty, handleUnlinkClient, handleUnlinkClientForParty, handleCreateAndLinkClient: handleOpenCreateClientForCase,
            handleOpenCreateClientForSession, handleOpenCreateClientForSessionCase: handleOpenCreateClientForCase,
            handleOpenCreateClientForSessionParty: handleOpenCreateClientForParty,
            handleOpenCreateClientForSessionPartyOnly,
            // ⚡ NEW (خطة تعدد الأطراف، مرحلة 13.1 — 23 يوليو 2026): نفس دالة
            // handleOpenCreateClientForParty بالظبط، ممرّرة كمان لـ CaseDetailView
            // (زرار "إنشاء موكل" لكل طرف في تفاصيل القضية، مش بس وسط wizard
            // الجلسة المستقلة) — شوف AppModals.tsx/InfoSection.tsx.
            handleOpenCreateClientForCaseParty: handleOpenCreateClientForParty,
            handleSaveClient, handleDeleteClient, handleUpdateClient, handleSaveLawyer,
            sendTelegram,
        }),

        // ── Exit Confirm ──
        React.createElement(ExitConfirmModal, { nav })
    );
}

export default App;
