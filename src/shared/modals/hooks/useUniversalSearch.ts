import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../../supabaseClient';
import { imatchOrClause, normalizeArabicDigits } from '../../lib/sanitize';
import type { Json } from '../../../database.types';

// ── مدة الانتظار قبل ما نبعت الـ query للـ DB (ms) ──
export const DEBOUNCE_MS = 350;
// ── حد أدنى لعدد الحروف قبل ما نبدأ البحث في DB ──
export const MIN_CHARS = 2;
// ── عدد النتائج لكل نوع ──
export const LIMIT = 20;

// شكل نتيجة البحث في القضايا بعد التطبيع المحلي — نفس الحقول اللي بترجع
// فعليًا من الـ .map() على نتيجة select القضايا.
export interface SearchCaseResult {
    id: string;
    title: string;
    number: string;
    court: string;
    type: string;
    status: string;
    date: string;
    client_id: string | null;
    court_floor: string | null;
    court_hall: string | null;
    session_hall: string | null;
    secretary_hall: string | null;
    secretary_name: string | null;
    court_level: string | null;
    circuit_number: string | null;
    updated_at: string | null;
}

// شكل نتيجة بحث الموكلين — نفس الأعمدة المُختارة فعليًا في
// db.from('clients').select('id,full_name,phone,email,national_id,contact_info,cr_number,notes,type').
// ⚠️ contact_info/cr_number/notes/type اتضافوا هنا عشان يقفلوا فجوة بيانات
// حقيقية: ClientDetailModal.tsx بيقرا الحقول دي فعليًا، وكانت بتبان فاضية
// لو الموكل اتفتح من نتيجة البحث السريع (مش من قائمة الموكلين العادية).
export interface SearchClientResult {
    id: string;
    full_name: string | null;
    phone: string | null;
    email: string | null;
    national_id: string | null;
    contact_info: Json | null;
    cr_number: string | null;
    notes: string | null;
    type: string | null;
}

// شكل نتيجة بحث المستندات — نفس الأعمدة المُختارة فعليًا في
// db.from('case_documents').select('id,case_id,file_name,category,created_at').
// ⚠️ ملحوظة (بدون تغيير سلوك): الكود تحت بيقرا doc.original_name كمحاولة أولى
// قبل doc.file_name، لكن original_name مش من ضمن الأعمدة المُختارة هنا (عمود
// حقيقي في case_documents بس مش داخل الـ select ده تحديدًا) — قيمتها دايمًا
// undefined وقت التشغيل، فبيقع الكود دايمًا على file_name. نفس فصيلة باگ
// next_session/case_type المكتشف قبل كده في ملفات تانية. الحقل هنا optional
// بس عشان يوصف نفس السلوك الحالي من غير أي تغيير.
export interface SearchDocResult {
    id: string;
    case_id: string | null;
    file_name: string | null;
    category: string | null;
    created_at: string | null;
    original_name?: string | null;
}

// شكل نتيجة بحث الجلسات — نفس الأعمدة المُختارة فعليًا في
// db.from('case_sessions').select('id,case_id,session_date,description,result,next_action').
export interface SearchSessionResult {
    id: string;
    case_id: string | null;
    session_date: string | null;
    description: string | null;
    result: string | null;
    next_action: string | null;
}

// شكل نتيجة بحث الملاحظات — نفس الأعمدة المُختارة فعليًا في
// db.from('case_notes').select('id,case_id,content,created_at').
export interface SearchNoteResult {
    id: string;
    case_id: string | null;
    content: string | null;
    created_at: string | null;
}

// شكل نتيجة بحث الأتعاب — نفس الأعمدة المُختارة فعليًا في
// db.from('case_fees').select('id,case_id,case_title,client_name,notes,receiver,total_fees,paid_fees,status').
// (مرحلة 1 — توسيع البحث الشامل ليغطي الأتعاب، سبتمبر 2026)
export interface SearchFeeResult {
    id: string;
    case_id: string | null;
    case_title: string | null;
    client_name: string | null;
    notes: string | null;
    receiver: string | null;
    total_fees: number | null;
    paid_fees: number | null;
    status: string | null;
}

// شكل نتيجة بحث التذكيرات — نفس الأعمدة المُختارة فعليًا في
// db.from('reminders').select('id,title,notes,due_date,done').
// (مرحلة 1 — توسيع البحث الشامل ليغطي التذكيرات، سبتمبر 2026)
export interface SearchReminderResult {
    id: string;
    title: string | null;
    notes: string | null;
    due_date: string | null;
    done: boolean | null;
}

// شكل عنصر الفلتر السريع (الكل/القضايا/الموكلين/الجلسات/الملاحظات/المستندات/الأتعاب/التذكيرات)
export interface QuickFilter {
    key: string;
    label: string;
    count: number;
}

// ── بحث أخير محفوظ محليًا (مرحلة 1) ──
// مفيش أي استدعاء DB هنا — localStorage بس، آخر 5 عمليات بحث ناجحة (نتيجة
// واحدة على الأقل) لكل جهاز/متصفح، عشان يبانوا كاقتراحات سريعة في حالة
// الشاشة الفاضية قبل ما المستخدم يكتب أي حاجة.
const RECENT_SEARCHES_KEY = 'sanad:recentSearches';
const MAX_RECENT_SEARCHES = 5;

function loadRecentSearches(): string[] {
    try {
        const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
    } catch {
        return [];
    }
}

function saveRecentSearch(term: string, current: string[]): string[] {
    const trimmed = term.trim();
    if (!trimmed) return current;
    const next = [trimmed, ...current.filter(s => s !== trimmed)].slice(0, MAX_RECENT_SEARCHES);
    try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)); } catch { /* localStorage غير متاح — تجاهل */ }
    return next;
}

// شكل الصف الخام اللي بيرجع من db.from('case_parties').select('case_id')
// (نتيجة البحث عن تطابق اسم أي طرف من أطراف الدعوى، مش بس الطرف الأساسي
// المخزّن في cases.plaintiff/defendant).
interface RawPartySearchRow {
    case_id: string | null;
}

// شكل الصف الخام اللي بيرجع من db.from('cases').select(...) (نتيجة البحث
// المباشر في قاعدة البيانات) قبل التطبيع لـ SearchCaseResult.
interface RawCaseSearchRow {
    id: string;
    title: string | null;
    case_number_official: string | null;
    court_name: string | null;
    case_type: string | null;
    status: string | null;
    client_id: string | null;
    next_hearing: string | null;
    court_floor: string | null;
    court_hall: string | null;
    session_hall: string | null;
    secretary_hall: string | null;
    secretary_name: string | null;
    court_level: string | null;
    circuit_number: string | null;
    updated_at: string | null;
}

export function useUniversalSearch() {
    const [q, setQ]                     = useState('');
    const [dbDocs, setDbDocs]           = useState<SearchDocResult[]>([]);
    const [dbSessions, setDbSessions]   = useState<SearchSessionResult[]>([]);
    const [dbNotes, setDbNotes]         = useState<SearchNoteResult[]>([]);
    const [dbCases, setDbCases]         = useState<SearchCaseResult[]>([]);
    const [dbClients, setDbClients]     = useState<SearchClientResult[]>([]);
    const [dbFees, setDbFees]           = useState<SearchFeeResult[]>([]);
    const [dbReminders, setDbReminders] = useState<SearchReminderResult[]>([]);
    const [searching, setSearching]     = useState(false);
    const [searched, setSearched]       = useState(false); // هل اتعمل search واحد على الأقل؟
    const [viewingDoc, setViewingDoc]   = useState<SearchDocResult | null>(null);
    const [activeFilter, setActiveFilter] = useState('all');
    const [recentSearches, setRecentSearches] = useState<string[]>(() => loadRecentSearches());
    const inputRef  = useRef<HTMLInputElement>(null);
    const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Focus على الـ input عند الفتح ──
    useEffect(() => { inputRef.current?.focus(); }, []);

    // ── Debounced DB search ──
    useEffect(() => {
        const trimmed = q.trim();

        // مسّح النتائج القديمة لو المستخدم مسح الـ input
        if (trimmed.length < MIN_CHARS) {
            setDbDocs([]);
            setDbSessions([]);
            setDbNotes([]);
            setDbCases([]);
            setDbClients([]);
            setDbFees([]);
            setDbReminders([]);
            setSearched(false);
            setSearching(false);
            if (timerRef.current) clearTimeout(timerRef.current);
            return;
        }

        // ابدأ العداد
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            setSearching(true);
            try {
                const pattern = `%${trimmed}%`;
                const [{ data: docs }, { data: sessions }, { data: notes }, { data: casesRes }, { data: clientsRes }, { data: partyMatches }, { data: feesRes }, { data: remindersRes }] = await Promise.all([
                    db.from('case_documents')
                        .select('id,case_id,file_name,category,created_at')
                        .ilike('file_name', pattern)
                        .order('created_at', { ascending: false })
                        .limit(LIMIT),
                    db.from('case_sessions')
                        .select('id,case_id,session_date,description,result,next_action')
                        // مرحلة 1 (سبتمبر 2026): imatchOrClause بدل ilikeOrClause — تسامح مع
                        // تنويعات الحروف العربية الشائعة (همزات/تاء مربوطة/ألف مقصورة)، مش
                        // بس تطابق حرفي. نفس فكرة الفصل الآمن للفاصلة/الأقواس زي قبل كده.
                        .or([
                            imatchOrClause('description', trimmed),
                            imatchOrClause('result', trimmed),
                            imatchOrClause('next_action', trimmed),
                        ].join(','))
                        .order('session_date', { ascending: false })
                        .limit(LIMIT),
                    db.from('case_notes')
                        .select('id,case_id,content,created_at')
                        .ilike('content', pattern)
                        .order('created_at', { ascending: false })
                        .limit(LIMIT),
                    // البحث في كل القضايا بقاعدة البيانات مباشرة (مش مقيد بالـ 20 سجل المحمّلين في الشاشة)
                    db.from('cases')
                        .select('id,title,case_number_official,court_name,case_type,status,client_id,next_hearing,court_floor,court_hall,session_hall,secretary_hall,secretary_name,court_level,circuit_number,updated_at')
                        .or([
                            imatchOrClause('title', trimmed),
                            imatchOrClause('case_number_official', trimmed),
                            imatchOrClause('court_name', trimmed),
                            imatchOrClause('case_type', trimmed),
                        ].join(','))
                        .order('created_at', { ascending: false })
                        .limit(LIMIT),
                    // نفس الفكرة للموكلين
                    db.from('clients')
                        .select('id,full_name,phone,email,national_id,contact_info,cr_number,notes,type')
                        .or([
                            imatchOrClause('full_name', trimmed),
                            imatchOrClause('phone', trimmed),
                            imatchOrClause('email', trimmed),
                            imatchOrClause('national_id', trimmed),
                        ].join(','))
                        .order('created_at', { ascending: false })
                        .limit(LIMIT),
                    // مرحلة 9: بحث عن تطابق اسم أي طرف من أطراف الدعوى (case_parties.name) —
                    // مش بس الطرف الأساسي المخزّن في cases.plaintiff/defendant. بنرجّع
                    // case_id بس هنا؛ القضايا الفعلية بتتجاب في خطوة تانية تحت لو لقينا
                    // معرّفات قضايا جديدة مش موجودة أصلًا في casesRes فوق (تجنّبًا لتكرار الجلب).
                    db.from('case_parties')
                        .select('case_id')
                        .ilike('name', pattern)
                        .not('case_id', 'is', null)
                        .limit(LIMIT),
                    // مرحلة 1 (سبتمبر 2026): تغطية الأتعاب — عنوان القضية/اسم الموكل/
                    // اسم المستلم/الملاحظات المخزّنة على سجل الأتعاب نفسه.
                    db.from('case_fees')
                        .select('id,case_id,case_title,client_name,notes,receiver,total_fees,paid_fees,status')
                        .is('deleted_at', null)
                        .or([
                            imatchOrClause('case_title', trimmed),
                            imatchOrClause('client_name', trimmed),
                            imatchOrClause('receiver', trimmed),
                            imatchOrClause('notes', trimmed),
                        ].join(','))
                        .order('created_at', { ascending: false })
                        .limit(LIMIT),
                    // مرحلة 1 (سبتمبر 2026): تغطية التذكيرات — العنوان والملاحظات.
                    db.from('reminders')
                        .select('id,title,notes,due_date,done')
                        .or([
                            imatchOrClause('title', trimmed),
                            imatchOrClause('notes', trimmed),
                        ].join(','))
                        .order('due_date', { ascending: false })
                        .limit(LIMIT),
                ]);
                // مرحلة 9 (تكملة): معرّفات القضايا اللي طابق اسم طرف فيها البحث، ومش
                // موجودة أصلًا ضمن casesRes (اللي جاية من تطابق title/court/plaintiff/defendant
                // مباشرة) — من غير ده هتتكرر بيانات القضية نفسها مرتين في النتيجة.
                const existingCaseIds = new Set((casesRes || []).map((r: RawCaseSearchRow) => r.id));
                const extraCaseIds = Array.from(new Set(
                    ((partyMatches || []) as RawPartySearchRow[])
                        .map(p => p.case_id)
                        .filter((id): id is string => !!id && !existingCaseIds.has(id))
                ));

                let extraCasesRes: RawCaseSearchRow[] = [];
                if (extraCaseIds.length > 0) {
                    const { data: extraData } = await db.from('cases')
                        .select('id,title,case_number_official,court_name,case_type,status,client_id,next_hearing,court_floor,court_hall,session_hall,secretary_hall,secretary_name,court_level,circuit_number,updated_at')
                        .in('id', extraCaseIds)
                        .limit(LIMIT);
                    extraCasesRes = extraData || [];
                }

                setDbDocs(docs || []);
                setDbSessions(sessions || []);
                setDbNotes(notes || []);
                setDbCases([...(casesRes || []), ...extraCasesRes].map((r: RawCaseSearchRow) => ({
                    id: r.id,
                    title: r.title || '—',
                    number: r.case_number_official || '—',
                    court: r.court_name || '—',
                    type: r.case_type || 'عام',
                    status: r.status || 'نشطة',
                    date: r.next_hearing || '—',
                    client_id: r.client_id,
                    court_floor: r.court_floor || null,
                    court_hall: r.court_hall || null,
                    session_hall: r.session_hall || null,
                    secretary_hall: r.secretary_hall || null,
                    secretary_name: r.secretary_name || null,
                    court_level: r.court_level || null,
                    circuit_number: r.circuit_number || null,
                    updated_at: r.updated_at || null,
                })));
                setDbClients(clientsRes || []);
                setDbFees(feesRes || []);
                setDbReminders(remindersRes || []);
                setSearched(true);

                // ── بحث أخير محفوظ (مرحلة 1) ──
                // بنحفظ العبارة بس لما فعلاً في نتيجة واحدة على الأقل — مفيش فايدة
                // من اقتراح بحث قبلي كان "لا توجد نتائج".
                const anyResults = (docs?.length || 0) + (sessions?.length || 0) + (notes?.length || 0)
                    + (casesRes?.length || 0) + (extraCasesRes.length || 0) + (clientsRes?.length || 0)
                    + (feesRes?.length || 0) + (remindersRes?.length || 0) > 0;
                if (anyResults) {
                    setRecentSearches(prev => saveRecentSearch(trimmed, prev));
                }
            } catch (e) {
                console.error('[Search]', e);
            } finally {
                setSearching(false);
            }
        }, DEBOUNCE_MS);

        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [q]);

    // 🔢 FIX (تطبيع الأرقام العربية في البحث — 8 أغسطس 2026): بحث الـDB
    // نفسه (ilikeOrClause) بقى بيطبّع تلقائيًا. لازم نطبّع query هنا كمان
    // عشان highlight() تحت تلاقي المطابقة صح جوه النص الراجع من الـDB
    // (اللي دايمًا أرقام إنجليزية عادية).
    const query = normalizeArabicDigits(q.trim()).toLowerCase();

    // ── فلترة القضايا والموكلين (محلية لأنهم جايين كـ props) ──
    const fmtNum = (num: string) => {
        if (!num) return '';
        const p = num.split('/');
        return p.length === 2 ? `${p[0]} لسنة ${p[1]}` : num;
    };

    const matchedCases = query.length >= MIN_CHARS ? dbCases : [];

    const matchedClients = query.length >= MIN_CHARS ? dbClients : [];

    // ── فلتر النوع ──
    const show = {
        cases:     activeFilter === 'all' || activeFilter === 'cases',
        clients:   activeFilter === 'all' || activeFilter === 'clients',
        sessions:  activeFilter === 'all' || activeFilter === 'sessions',
        notes:     activeFilter === 'all' || activeFilter === 'notes',
        docs:      activeFilter === 'all' || activeFilter === 'docs',
        fees:      activeFilter === 'all' || activeFilter === 'fees',
        reminders: activeFilter === 'all' || activeFilter === 'reminders',
    };

    const totalResults =
        (show.cases     ? matchedCases.length    : 0) +
        (show.clients   ? matchedClients.length  : 0) +
        (show.sessions  ? dbSessions.length      : 0) +
        (show.notes     ? dbNotes.length         : 0) +
        (show.docs      ? dbDocs.length          : 0) +
        (show.fees      ? dbFees.length          : 0) +
        (show.reminders ? dbReminders.length     : 0);

    const hasResults = totalResults > 0;

    // ── Highlight النص المطابق ──
    const highlight = (text: string) => {
        if (!query || !text) return text;
        const idx = text.toLowerCase().indexOf(query);
        if (idx === -1) return text;
        return React.createElement(React.Fragment, null,
            text.slice(0, idx),
            React.createElement('mark', { className: 'bg-purple-500/30 text-white rounded px-0.5' }, text.slice(idx, idx + query.length)),
            text.slice(idx + query.length)
        );
    };

    // ── مسح البحث الأخير المحفوظ (localStorage) ──
    const clearRecentSearches = () => {
        try { localStorage.removeItem(RECENT_SEARCHES_KEY); } catch { /* تجاهل */ }
        setRecentSearches([]);
    };

    return {
        q, setQ,
        dbDocs, dbSessions, dbNotes, dbCases, dbClients, dbFees, dbReminders,
        searching, searched,
        viewingDoc, setViewingDoc,
        activeFilter, setActiveFilter,
        inputRef,
        query, matchedCases, matchedClients,
        show, totalResults, hasResults,
        highlight, fmtNum,
        recentSearches, clearRecentSearches,
    };
}
