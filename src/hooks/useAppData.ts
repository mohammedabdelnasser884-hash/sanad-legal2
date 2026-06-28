import React, { useState, useCallback } from 'react';
import { db } from '../supabaseClient';
import { recordError, recordSuccess } from '../systemHealth';

export function useAppData(profile: any) {
    const isAdmin = profile?.role === 'admin';
    const PAGE_SIZE = 15;

    // ── State ──────────────────────────────────────────────
    const [cases,        setCases]        = useState<any[]>([]);
    const [clients,      setClients]      = useState<any[]>([]);
    const [lawyers,      setLawyers]      = useState<any[]>([]);

    const [casesFilter,  setCasesFilter]  = useState('نشطة');
    const [casesPage,    setCasesPage]    = useState(0);
    const [casesTotal,   setCasesTotal]   = useState(0);
    const [casesLoading, setCasesLoading] = useState(false);
    const [dbError,      setDbError]      = useState<string|null>(null);
    const [casesSearch,  setCasesSearch]  = useState('');

    const [clientsPage,    setClientsPage]    = useState(0);
    const [clientsTotal,   setClientsTotal]   = useState(0);
    const [clientsLoading, setClientsLoading] = useState(false);

    // ── fetchCases ──────────────────────────────────────────
    const fetchCases = useCallback(async (page = 0, filter = casesFilter) => {
        if (!profile) return;
        setCasesLoading(true);
        setDbError(null);

        const from = page * PAGE_SIZE;
        const to   = from + PAGE_SIZE - 1;

        const { data, error, count } = await db
            .from('cases')
            .select('*', { count: 'exact' })
            .eq('status', filter)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) {
            setDbError('فشل تحميل القضايا — تحقق من الاتصال وأعد المحاولة');
            setCasesLoading(false);
            recordError('db_cases', error.message);
            return;
        }

        // جلب أقرب جلسة للقضايا المحملة فقط
        const caseIds = (data || []).map((r: any) => r.id);
        let sessionsMap: { [k: string]: string } = {};
        if (caseIds.length > 0) {
            const { data: sessionsData, error: sessErr } = await db
                .from('case_sessions')
                .select('case_id,session_date')
                .in('case_id', caseIds)
                .order('session_date', { ascending: false });

            if (sessErr) {
                recordError('db_sessions', sessErr.message);
            } else {
                (sessionsData || []).forEach((s: any) => {
                    if (!sessionsMap[s.case_id]) sessionsMap[s.case_id] = s.session_date;
                });
                recordSuccess('db_sessions');
            }
        }

        const mapped = (data || []).map((r: any) => ({
            id:             r.id,
            number:         r.case_number_official || '—',
            title:          r.title || '—',
            court:          r.court_name || '—',
            type:           r.case_type || 'عام',
            court_level:    r.court_level || null,
            circuit_number: r.circuit_number || null,
            status:         r.status || 'نشطة',
            date:           sessionsMap[r.id] || r.next_hearing || r.next_session || '—',
            client_id:      r.client_id,
            plaintiff:      r.plaintiff || null,
            defendant:      r.defendant || null,
            year:           r.created_at ? new Date(r.created_at).getFullYear() : new Date().getFullYear(),
            updated_at:     r.updated_at || null,  // BUG-19: محتاجينه لـ knownUpdatedAt في handleUpdateCase
        }));

        if (page === 0) setCases(mapped);
        else setCases(prev => [...prev, ...mapped]);

        setCasesTotal(count || 0);
        setCasesPage(page);
        recordSuccess('db_cases');
        setCasesLoading(false);
    }, [profile, isAdmin, casesFilter]);

    // ── searchCases (بحث داخل قسم القضايا كله — مش مقيد بتاب) ──
    const searchCases = useCallback(async (term: string, filter = casesFilter) => {
        if (!profile) return;
        if (!term.trim()) {
            // عند مسح البحث، ارجع للـ listing العادي
            fetchCases(0, filter);
            return;
        }
        setCasesLoading(true);
        setDbError(null);

        const q = term.trim();

        // البحث في: عنوان الدعوى، رقم الدعوى، المدعي، المدعى عليه، موضوع الدعوى — في كل الحالات
        const { data, error, count } = await db
            .from('cases')
            .select('*', { count: 'exact' })
            .or(
                `title.ilike.%${q}%,` +
                `case_number_official.ilike.%${q}%,` +
                `plaintiff.ilike.%${q}%,` +
                `defendant.ilike.%${q}%`
            )
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            setDbError('فشل البحث في القضايا — تحقق من الاتصال وأعد المحاولة');
            setCasesLoading(false);
            recordError('db_cases_search', error.message);
            return;
        }

        // جلب جلسات للنتائج
        const caseIds = (data || []).map((r: any) => r.id);
        let sessionsMap: { [k: string]: string } = {};
        if (caseIds.length > 0) {
            const { data: sessionsData } = await db
                .from('case_sessions')
                .select('case_id,session_date')
                .in('case_id', caseIds)
                .order('session_date', { ascending: false });
            (sessionsData || []).forEach((s: any) => {
                if (!sessionsMap[s.case_id]) sessionsMap[s.case_id] = s.session_date;
            });
        }

        const mapped = (data || []).map((r: any) => ({
            id:             r.id,
            number:         r.case_number_official || '—',
            title:          r.title || '—',
            court:          r.court_name || '—',
            type:           r.case_type || 'عام',
            court_level:    r.court_level || null,
            circuit_number: r.circuit_number || null,
            status:         r.status || 'نشطة',
            date:           sessionsMap[r.id] || r.next_hearing || r.next_session || '—',
            client_id:      r.client_id,
            plaintiff:      r.plaintiff || null,
            defendant:      r.defendant || null,
            year:           r.created_at ? new Date(r.created_at).getFullYear() : new Date().getFullYear(),
            updated_at:     r.updated_at || null,
        }));

        setCases(mapped);
        setCasesTotal(count || 0);
        setCasesPage(0);
        recordSuccess('db_cases_search');
        setCasesLoading(false);
    }, [profile, casesFilter]);
    const fetchLawyers = useCallback(async () => {
        if (!isAdmin) return;
        const { data } = await db
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: true });
        setLawyers(data || []);
    }, [isAdmin]);

    // ── fetchClients ────────────────────────────────────────
    const fetchClients = useCallback(async (page = 0, search = '') => {
        if (!profile) return;
        setClientsLoading(true);

        const from = page * PAGE_SIZE;
        const to   = from + PAGE_SIZE - 1;

        let query = db
            .from('clients')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);

        if (search.trim()) {
            const s = search.trim();
            query = query.or(
                `client_name.ilike.%${s}%,phone.ilike.%${s}%,national_id.ilike.%${s}%`
            );
        }

        const { data, error, count } = await query;

        if (error) {
            recordError('db_clients', error.message);
        } else {
            const mapped = (data || []).map((c: any) => ({
                ...c,
                full_name: c.client_name || '—',
                type: c.client_type || 'individual',
            }));
            if (page === 0) setClients(mapped);
            else setClients(prev => [...prev, ...mapped]);
            setClientsTotal(count || 0);
            setClientsPage(page);
            recordSuccess('db_clients');
        }
        setClientsLoading(false);
    }, [profile]);

    return {
        cases,       setCases,
        casesFilter, setCasesFilter,
        casesPage,   setCasesPage,   casesTotal,   casesLoading,
        casesSearch, setCasesSearch,
        dbError,
        clients,     setClients,
        clientsPage, setClientsPage, clientsTotal, clientsLoading,
        lawyers,     setLawyers,
        fetchCases,  fetchLawyers,   fetchClients,  searchCases,
    };
}
