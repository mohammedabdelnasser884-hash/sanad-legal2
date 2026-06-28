import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../supabaseClient';
import { I } from '../constants';
import PdfViewerModal from './PdfViewerModal';

// ── مدة الانتظار قبل ما نبعت الـ query للـ DB (ms) ──
const DEBOUNCE_MS = 350;
// ── حد أدنى لعدد الحروف قبل ما نبدأ البحث في DB ──
const MIN_CHARS = 2;
// ── عدد النتائج لكل نوع ──
const LIMIT = 20;

function UniversalSearchModal({ cases, clients, onClose, onOpenCase, onOpenClient }) {
    const [q, setQ]                     = useState('');
    const [dbDocs, setDbDocs]           = useState([]);
    const [dbSessions, setDbSessions]   = useState([]);
    const [dbNotes, setDbNotes]         = useState([]);
    const [searching, setSearching]     = useState(false);
    const [searched, setSearched]       = useState(false); // هل اتعمل search واحد على الأقل؟
    const [viewingDoc, setViewingDoc]   = useState(null);
    const [activeFilter, setActiveFilter] = useState('all');
    const inputRef  = useRef(null);
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
                const [{ data: docs }, { data: sessions }, { data: notes }] = await Promise.all([
                    db.from('case_documents')
                        .select('id,case_id,file_name,category,created_at')
                        .ilike('file_name', pattern)
                        .order('created_at', { ascending: false })
                        .limit(LIMIT),
                    db.from('case_sessions')
                        .select('id,case_id,session_date,description,result,next_action')
                        .or(`description.ilike.${pattern},result.ilike.${pattern},next_action.ilike.${pattern}`)
                        .order('session_date', { ascending: false })
                        .limit(LIMIT),
                    db.from('case_notes')
                        .select('id,case_id,content,created_at')
                        .ilike('content', pattern)
                        .order('created_at', { ascending: false })
                        .limit(LIMIT),
                ]);
                setDbDocs(docs || []);
                setDbSessions(sessions || []);
                setDbNotes(notes || []);
                setSearched(true);
            } catch (e) {
                console.error('[Search]', e);
            } finally {
                setSearching(false);
            }
        }, DEBOUNCE_MS);

        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [q]);

    const query = q.trim().toLowerCase();

    // ── فلترة القضايا والموكلين (محلية لأنهم جايين كـ props) ──
    const fmtNum = (num: string) => {
        if (!num) return '';
        const p = num.split('/');
        return p.length === 2 ? `${p[0]} لسنة ${p[1]}` : num;
    };

    const matchedCases = query.length >= MIN_CHARS ? cases.filter(c =>
        (c.title     || '').toLowerCase().includes(query) ||
        (c.number    || '').toLowerCase().includes(query) ||
        fmtNum(c.number || '').toLowerCase().includes(query) ||
        (c.court     || '').toLowerCase().includes(query) ||
        (c.type      || '').toLowerCase().includes(query) ||
        (c.plaintiff || '').toLowerCase().includes(query) ||
        (c.defendant || '').toLowerCase().includes(query)
    ) : [];

    const matchedClients = query.length >= MIN_CHARS ? clients.filter(c =>
        (c.full_name  || '').toLowerCase().includes(query) ||
        (c.phone      || '').toLowerCase().includes(query) ||
        (c.email      || '').toLowerCase().includes(query) ||
        (c.national_id|| '').toLowerCase().includes(query)
    ) : [];

    // ── فلتر النوع ──
    const show = {
        cases:    activeFilter === 'all' || activeFilter === 'cases',
        clients:  activeFilter === 'all' || activeFilter === 'clients',
        sessions: activeFilter === 'all' || activeFilter === 'sessions',
        notes:    activeFilter === 'all' || activeFilter === 'notes',
        docs:     activeFilter === 'all' || activeFilter === 'docs',
    };

    const totalResults =
        (show.cases    ? matchedCases.length    : 0) +
        (show.clients  ? matchedClients.length  : 0) +
        (show.sessions ? dbSessions.length      : 0) +
        (show.notes    ? dbNotes.length         : 0) +
        (show.docs     ? dbDocs.length          : 0);

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

    return React.createElement('div', { className: 'fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex flex-col fade-in' },
        viewingDoc && React.createElement(PdfViewerModal, { doc: viewingDoc, onClose: () => setViewingDoc(null) }),

        // ── شريط البحث ──
        React.createElement('div', { className: 'px-4 pt-safe pt-4 pb-3 border-b border-white/10 bg-premium-card/80 backdrop-blur-lg shrink-0' },
            React.createElement('div', { className: 'flex items-center gap-3' },
                React.createElement('div', { className: 'relative flex-1' },
                    React.createElement('span', { className: 'absolute right-3 top-1/2 -translate-y-1/2 text-premium-gold' },
                        searching
                            ? React.createElement(I.Spin)
                            : React.createElement(I.Search)
                    ),
                    React.createElement('input', {
                        ref: inputRef,
                        type: 'text', value: q,
                        onChange: e => { setQ(e.target.value); setActiveFilter('all'); },
                        placeholder: 'ابحث في كل شيء — قضايا، جلسات، ملاحظات...',
                        className: 'w-full p-3 pr-10 text-xs rounded-2xl border border-premium-gold/20 bg-premium-bg text-white placeholder-slate-500 transition-colors',
                        style: { fontFamily: 'Cairo,sans-serif' }
                    })
                ),
                React.createElement('button', {
                    onClick: onClose,
                    className: 'w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white shrink-0 active:scale-90'
                }, React.createElement(I.X))
            ),

            // ── فلاتر سريعة ──
            query.length >= MIN_CHARS && searched && React.createElement('div', { className: 'flex gap-1.5 mt-3 overflow-x-auto no-scrollbar pb-0.5' },
                [
                    { key: 'all',      label: 'الكل',        count: totalResults },
                    { key: 'cases',    label: '⚖️ القضايا',   count: matchedCases.length },
                    { key: 'clients',  label: '👤 الموكلين',  count: matchedClients.length },
                    { key: 'sessions', label: '🗓 الجلسات',   count: dbSessions.length },
                    { key: 'notes',    label: '📝 الملاحظات', count: dbNotes.length },
                    { key: 'docs',     label: '📁 المستندات', count: dbDocs.length },
                ].map(f => (f.count > 0 || f.key === 'all') && React.createElement('button', {
                    key: f.key,
                    onClick: () => setActiveFilter(f.key),
                    className: `shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all ${activeFilter === f.key ? 'bg-premium-gold/20 text-premium-gold border border-premium-gold/40' : 'bg-white/5 text-slate-400 border border-white/5'}`
                }, f.label + (f.count > 0 ? ' (' + f.count + ')' : '')))
            )
        ),

        // ── النتائج ──
        React.createElement('div', { className: 'flex-1 overflow-y-auto no-scrollbar p-4 space-y-5' },

            // حالة البداية
            query.length < MIN_CHARS && React.createElement('div', { className: 'text-center py-16 space-y-4' },
                React.createElement('div', { className: 'text-5xl' }, '🔍'),
                React.createElement('p', { className: 'text-white font-black' }, 'البحث الشامل'),
                React.createElement('p', { className: 'text-slate-500 text-xs leading-relaxed' },
                    'اكتب حرفين أو أكثر للبحث في القضايا والجلسات والملاحظات والمستندات'
                ),
                React.createElement('div', { className: 'flex justify-center gap-2 flex-wrap mt-4' },
                    ['رقم القضية', 'اسم الموكل', 'اسم المحكمة', 'نوع القضية', 'وصف جلسة'].map(hint =>
                        React.createElement('button', {
                            key: hint, onClick: () => setQ(hint),
                            className: 'text-[10px] px-3 py-1.5 bg-white/5 border border-white/10 text-slate-400 rounded-xl hover:bg-white/10 active:scale-95'
                        }, hint)
                    )
                )
            ),

            // جاري البحث
            searching && React.createElement('div', { className: 'text-center py-8' },
                React.createElement('p', { className: 'text-slate-500 text-xs' }, '⏳ جاري البحث...')
            ),

            // القضايا
            !searching && show.cases && matchedCases.length > 0 && React.createElement('div', { className: 'space-y-1.5' },
                React.createElement('div', { className: 'flex items-center gap-2 mb-2' },
                    React.createElement('span', { className: 'w-1 h-3 bg-premium-gold rounded-full' }),
                    React.createElement('p', { className: 'text-[10px] font-black text-premium-gold' }, 'القضايا'),
                    React.createElement('span', { className: 'text-[9px] text-slate-500' }, matchedCases.length + ' نتيجة')
                ),
                matchedCases.map(c =>
                    React.createElement('div', {
                        key: c.id,
                        onClick: () => { onOpenCase(c); onClose(); },
                        className: 'bg-premium-card border border-white/5 rounded-xl px-3 py-2.5 active:scale-[0.98] transition-all cursor-pointer hover:border-premium-gold/20'
                    },
                        React.createElement('div', { className: 'flex items-center gap-2' },
                            React.createElement('span', { className: 'text-base shrink-0' }, '⚖️'),
                            React.createElement('div', { className: 'flex-1 min-w-0' },
                                React.createElement('p', { className: 'text-[11px] font-black text-white truncate' }, highlight(c.title)),
                                React.createElement('div', { className: 'flex items-center gap-2 mt-0.5 flex-wrap' },
                                    c.number && c.number !== '—' && React.createElement('span', { className: 'text-[9px] font-mono', style: { color: '#D4AF37' } }, fmtNum(c.number)),
                                    c.court && React.createElement('span', { className: 'text-[9px] text-slate-500' }, c.court),
                                    (c.plaintiff || c.defendant) && React.createElement('span', { className: 'text-[9px] text-slate-500 truncate' },
                                        highlight(c.plaintiff || '') + (c.plaintiff && c.defendant ? ' ضد ' : '') + highlight(c.defendant || '')
                                    )
                                )
                            ),
                            React.createElement('span', { className: 'text-slate-600 text-xs shrink-0' }, '›')
                        )
                    )
                )
            ),

            // الموكلون
            !searching && show.clients && matchedClients.length > 0 && React.createElement('div', { className: 'space-y-3' },
                React.createElement('div', { className: 'flex items-center gap-2' },
                    React.createElement('span', { className: 'w-1 h-3 bg-emerald-400 rounded-full' }),
                    React.createElement('p', { className: 'text-[10px] font-black text-emerald-400' }, 'الموكلون'),
                    React.createElement('span', { className: 'text-[9px] text-slate-500' }, matchedClients.length + ' نتيجة')
                ),
                matchedClients.map(c =>
                    React.createElement('div', {
                        key: c.id,
                        onClick: () => { onOpenClient(c); onClose(); },
                        className: 'bg-premium-card border border-white/5 rounded-2xl p-4 active:scale-[0.98] transition-all cursor-pointer hover:border-emerald-500/20'
                    },
                        React.createElement('div', { className: 'flex items-center gap-3' },
                            React.createElement('div', { className: 'w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 font-black text-sm shrink-0' },
                                (c.full_name || 'م').charAt(0)
                            ),
                            React.createElement('div', null,
                                React.createElement('p', { className: 'text-xs font-black text-white' }, highlight(c.full_name)),
                                c.phone && React.createElement('p', { className: 'text-[10px] text-slate-400' }, highlight(c.phone)),
                                React.createElement('p', { className: 'text-[9px] text-slate-500 mt-0.5' },
                                    cases.filter(cs => cs.client_id === c.id).length + ' قضية'
                                )
                            )
                        )
                    )
                )
            ),

            // الجلسات
            !searching && show.sessions && dbSessions.length > 0 && React.createElement('div', { className: 'space-y-3' },
                React.createElement('div', { className: 'flex items-center gap-2' },
                    React.createElement('span', { className: 'w-1 h-3 bg-amber-400 rounded-full' }),
                    React.createElement('p', { className: 'text-[10px] font-black text-amber-400' }, 'الجلسات'),
                    React.createElement('span', { className: 'text-[9px] text-slate-500' }, dbSessions.length + ' نتيجة')
                ),
                dbSessions.map(s => {
                    const linkedCase = cases.find(c => c.id === s.case_id);
                    return React.createElement('div', {
                        key: s.id,
                        onClick: () => { if (linkedCase) { onOpenCase(linkedCase); onClose(); } },
                        className: 'bg-premium-card border border-white/5 rounded-2xl p-4 active:scale-[0.98] transition-all cursor-pointer hover:border-amber-500/20'
                    },
                        React.createElement('div', { className: 'flex items-center gap-2 mb-2' },
                            React.createElement('div', { className: 'w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0' }, '🗓'),
                            React.createElement('span', { className: 'text-[11px] font-black text-amber-400' }, s.session_date),
                            linkedCase && React.createElement('span', { className: 'text-[9px] text-slate-500 truncate' }, '— ' + linkedCase.title)
                        ),
                        s.description && React.createElement('p', { className: 'text-[10px] text-slate-300 leading-relaxed line-clamp-2' }, highlight(s.description)),
                        s.result && React.createElement('p', { className: 'text-[10px] text-emerald-400 mt-1' }, '📌 ' + highlight(s.result)),
                        s.next_action && React.createElement('p', { className: 'text-[10px] text-amber-300 mt-0.5' }, '⚡ ' + highlight(s.next_action))
                    );
                })
            ),

            // الملاحظات
            !searching && show.notes && dbNotes.length > 0 && React.createElement('div', { className: 'space-y-3' },
                React.createElement('div', { className: 'flex items-center gap-2' },
                    React.createElement('span', { className: 'w-1 h-3 bg-blue-400 rounded-full' }),
                    React.createElement('p', { className: 'text-[10px] font-black text-blue-400' }, 'الملاحظات'),
                    React.createElement('span', { className: 'text-[9px] text-slate-500' }, dbNotes.length + ' نتيجة')
                ),
                dbNotes.map(n => {
                    const linkedCase = cases.find(c => c.id === n.case_id);
                    return React.createElement('div', {
                        key: n.id,
                        onClick: () => { if (linkedCase) { onOpenCase(linkedCase); onClose(); } },
                        className: 'bg-premium-card border border-white/5 rounded-2xl p-4 active:scale-[0.98] transition-all cursor-pointer hover:border-blue-500/20'
                    },
                        React.createElement('div', { className: 'flex items-start gap-3' },
                            React.createElement('div', { className: 'w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0 mt-0.5' }, '📝'),
                            React.createElement('div', { className: 'flex-1 min-w-0' },
                                React.createElement('p', { className: 'text-[10px] text-slate-300 leading-relaxed line-clamp-3' }, highlight(n.content)),
                                linkedCase && React.createElement('p', { className: 'text-[9px] text-premium-gold mt-1.5' }, '⚖️ ' + linkedCase.title),
                                React.createElement('p', { className: 'text-[9px] text-slate-600 mt-0.5' },
                                    new Date(n.created_at).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
                                )
                            )
                        )
                    );
                })
            ),

            // المستندات
            !searching && show.docs && dbDocs.length > 0 && React.createElement('div', { className: 'space-y-3' },
                React.createElement('div', { className: 'flex items-center gap-2' },
                    React.createElement('span', { className: 'w-1 h-3 bg-purple-400 rounded-full' }),
                    React.createElement('p', { className: 'text-[10px] font-black text-purple-400' }, 'المستندات'),
                    React.createElement('span', { className: 'text-[9px] text-slate-500' }, dbDocs.length + ' نتيجة')
                ),
                dbDocs.map(doc => {
                    const isPdf = /\.pdf$/i.test(doc.original_name || doc.file_name || '');
                    const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.original_name || doc.file_name || '');
                    const canPreview = isPdf || isImg;
                    const emoji = isPdf ? '📄' : isImg ? '🖼' : /\.(doc|docx)$/i.test(doc.original_name || '') ? '📝' : /\.(xls|xlsx)$/i.test(doc.original_name || '') ? '📊' : '📎';
                    const linkedCase = cases.find(c => c.id === doc.case_id);
                    return React.createElement('div', {
                        key: doc.id,
                        className: 'bg-premium-card border border-white/5 rounded-2xl p-4 hover:border-purple-500/20 transition-all'
                    },
                        React.createElement('div', { className: 'flex items-start gap-3' },
                            React.createElement('div', { className: 'w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-xl shrink-0' }, emoji),
                            React.createElement('div', { className: 'flex-1 min-w-0' },
                                React.createElement('p', { className: 'text-xs font-black text-white truncate' }, highlight(doc.file_name)),
                                React.createElement('p', { className: 'text-[9px] text-slate-400 mt-0.5' }, doc.category),
                                linkedCase && React.createElement('p', { className: 'text-[9px] text-premium-gold mt-0.5' }, '⚖️ ' + linkedCase.title)
                            ),
                            canPreview && React.createElement('button', {
                                onClick: () => setViewingDoc(doc),
                                className: 'w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 text-sm active:scale-90'
                            }, '👁')
                        )
                    );
                })
            ),

            // لا نتائج
            !searching && searched && query.length >= MIN_CHARS && !hasResults &&
            React.createElement('div', { className: 'text-center py-16 space-y-3' },
                React.createElement('div', { className: 'text-4xl' }, '🔎'),
                React.createElement('p', { className: 'text-white font-black text-sm' }, 'لا توجد نتائج'),
                React.createElement('p', { className: 'text-slate-500 text-xs' }, 'لم نجد شيئاً يطابق "' + q + '"')
            )
        )
    );
}

export default UniversalSearchModal;
