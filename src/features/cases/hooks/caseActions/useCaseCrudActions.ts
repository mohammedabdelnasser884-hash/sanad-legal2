// ⚡ REFACTOR (خطة تحسين الأداء — المرحلة 4، 7 سبتمبر 2026): هذا الملف كان
// جزء من useCaseActions.ts (1355 سطر) — اتفصل هنا كـ"وحدة CRUD" (إنشاء/
// تعديل/حذف/أرشفة/استرجاع/تسجيل خروج) منفصلة عن وحدة ربط الموكل
// (useCaseClientLinking.ts). المنطق الداخلي لكل دالة نُقل حرفيًا من غير أي
// تغيير — النقل تم بالاستخراج المباشر (sed) من الملف الأصلي مش بإعادة
// الكتابة، تحديدًا عشان نتجنب أي خطأ نسخ يدوي في منطق حساس (القفل
// التفاؤلي/الأوفلاين/فحوصات التكرار). راجع useCaseActions.ts للتوقيع
// العام وطريقة تجميع الوحدتين مع بعض.
import { toast } from '../../../../shared/lib/notifications';
import { escapeTelegramHtml } from '../../../../shared/lib/sanitize';
import { logActivity, buildFieldDiff, buildAddSnapshot, buildDeleteSnapshot, type FieldDiffMap } from '../../../../shared/lib/dataAccess';
import { checkCaseNumberDuplicate } from '../../../../shared/lib/caseValidation';
import { showErrorToast } from '../../../../shared/lib/errorReporting';
import { runDuplicateCheckOfflineAware } from '../../../../shared/lib/offlineGuard';
import { db } from '../../../../supabaseClient';
import { withFkOfflineSentinel } from '../../../calendar/hooks/caseSessionLinkingShared';
import { validateParties } from '../../../../shared/lib/casePartiesValidation';
import { checkPermission } from '../../../../shared/lib/permissions';
import type { MappedCase } from '../../../../hooks/useAppData';
import type { CaseActionsParams, CaseFormSubmitData } from './types';
import { buildPartiesDiff } from './partiesDiff';
import type { createGetCaseRecord } from './caseRecordLookup';

// 🔒 FIX (دبل-كليك حقيقي على زرار حفظ القضية الجديدة/تعديلها):
// setSavingCase(true) بيجدول re-render، ومفيش ضمان إنه يخلص وي disabled
// يتفعّل قبل ما ثاني حدث click (دبل كليك سريع فعلي، مش React batching)
// ينفّذ نفس الـonClick تاني. النتيجة: قضيتين بنفس البيانات بيتسجلوا.
// ⚠️ متعرّفين هنا برّه الدالة (مش useRef جوّاها) عشان createCaseCrudActions
// بتتنادى كـfunction عادي مباشرة (في التستات وفي الاستخدام الفعلي —
// مش عن طريق renderHook)، فـuseRef هيدور على React render context مش
// موجود أصلاً. متغيّر على مستوى الملف بيفضل قيمته بين النداءات المتتالية
// من غير أي اعتماد على React، وده كافي هنا لأن التطبيق تبويب واحد لكل
// مستخدم (نفس فلسفة window.__dbWrite في offlineQueue.ts).
let creatingCaseGuard = false;
let updatingCaseGuard = false;

export function createCaseCrudActions(
    params: CaseActionsParams,
    getCaseRecord: ReturnType<typeof createGetCaseRecord>
) {
    const {
        sendTelegram, fetchCases, cases, clients, selectedCase,
        setCases, setLawyers, setClients, setProfile, setAuthUser,
        setSelectedCase, setDeleteConfirm, setSavingCase, setShowCaseModal,
        casesFilter, nav, profile,
    } = params;
    const _userName = profile?.full_name || null;

    // ─ تسجيل خروج ─
    const handleLogout = async () => {
        // نسجّل الخروج قبل signOut عشان الـ session لسه شغّالة
        logActivity(db, 'تسجيل خروج', { userName: _userName, entity_type: 'user', details: profile?.email || null });
        await db.auth.signOut();
        setCases([]); setLawyers([]); setClients([]); setProfile(null); setAuthUser(null);
    };

    // ─ حفظ قضية ─
    // شكل form بقى موصوف بـ CaseFormSubmitData (شوف تعريفه فوق) بدل
    // Record<string, any> — بيغطي بالظبط الحقول اللي NewCaseModal بيبعتها،
    // وكل استخدام لعمود DB حقيقي (زي payload تحت) موصول بنوع الجدول الحقيقي
    // من database.types.ts.
    // 🔒 FIX (قرارات مفتوحة — خطة حفظ المسودات، 3 أغسطس 2026): بترجع
    // Promise<boolean> دلوقتي (كانت من غير return صريح، يعني undefined في
    // كل الحالات) — عشان NewCaseModal.tsx يعرف فعليًا نجح الحفظ ولا لأ،
    // ويمسح المسودة بس لو نجح (نفس فلسفة handleUpdateCase تحت اللي كانت
    // بترجع boolean من الأول).
    const handleSaveCase = async (form: CaseFormSubmitData): Promise<boolean> => {
        // 🔒 فحص متزامن أولًا — قبل أي setState أو await — عشان يمنع دخول
        // ثاني نداء لو دبل-كليك سريع حصل فعليًا قبل ما disabled يتفعّل.
        if (creatingCaseGuard) return false;
        // 🔒 NEW (خطة تفعيل الصلاحيات التفصيلية، مرحلة 3): can_add_cases —
        // نفس فحص has_permission('can_add_cases') على القاعدة (RLS INSERT
        // على cases)، هنا بس كتجربة مستخدم أسرع من الاستنى فشل السيرفر.
        if (!checkPermission(profile, 'can_add_cases')) {
            toast('❌ ليس لديك صلاحية إضافة قضايا جديدة', true);
            return false;
        }
        if (!form.title || !form.title.trim()) {
            toast('❌ حقل "موضوع ومسمى الدعوى" مطلوب', true);
            return false;
        }
        creatingCaseGuard = true;
        setSavingCase(true);
        // 🔒 FIX (تقرير الموثوقية — نتيجة 2، مُصحَّحة): فحص تكرار رقم القيد
        // الرسمي — نفس نمط checkClientDuplicate بالظبط (زرار مقفول قبل
        // الفحص، راجع نتيجة 0)، بيرفض الحفظ لو نفس الرقم مسجل بالفعل لقضية
        // بنفس المحكمة ونفس نوع الدعوى. رقم القيد لوحده مش كفاية — اتباعت
        // court_level/type كمان (راجع caseValidation.ts) عشان رقمين قضية
        // منفصلتين تمامًا يتصادفوا بنفس الرقم في محكمة أو نوع مختلف
        // ميترفضوش بالغلط كتكرار. مفيش فحص لو الرقم فاضي أصلاً
        // (caseValidation.ts بيرجع duplicate:false).
        // 🔒 FIX (تقرير فحص أعطال الأوف لاين — 13 أغسطس 2026): أوف لاين أو
        // تايم آوت (8 ثواني) بيأجّلوا الفحص (skipped:true) بدل ما يوقفوا
        // الحفظ بالكامل — السيرفر هيرفض التكرار وقت المزامنة الفعلية على أي
        // حال عن طريق الـUNIQUE index. أي خطأ حقيقي تاني لسه بيوقف الحفظ
        // زي الأول بالظبط.
        let caseDup: { duplicate: boolean; message?: string } = { duplicate: false };
        try {
            const check = await runDuplicateCheckOfflineAware((signal) =>
                checkCaseNumberDuplicate(db, form.number, form.court_level, form.type, undefined, signal)
            );
            if (check.skipped) toast('⚠️ أوف لاين — فحص تكرار رقم القيد هيتأجل لحد المزامنة', false);
            else caseDup = check.result!;
        } catch (e) {
            showErrorToast('case_number_duplicate_check', e, 'تعذّر التحقق من رقم القيد. حاول مرة أخرى.', 'إضافة قضية');
            creatingCaseGuard = false;
            setSavingCase(false);
            return false;
        }
        if (caseDup.duplicate) { toast(caseDup.message!, true); creatingCaseGuard = false; setSavingCase(false); return false; }
        // 🔒 FIX (تتبع زر "إضافة قضية" — 18 يوليو 2026): معرّف مؤقت client-side
        // فريد لكل عملية إضافة قضية أوفلاين. بيتبعت مع القضية نفسها (وبيتشال
        // قبل أي INSERT حقيقي — شوف stripOfflineSentinels في offlineQueue.ts)،
        // وبيتبعت تاني مع الجلسة الأولى بتاعتها كـ _offlineCaseTempId. وقت
        // المزامنة، الجلسة بتتربط بالـ id الحقيقي للقضية عن طريق مطابقة
        // المعرّف المؤقت ده (مطابقة مضمونة 100%) بدل البحث بالعنوان (اللي كان
        // ممكن يربط غلط لو فيه قضيتين اتضافوا أوفلاين بنفس العنوان بالظبط).
        // العنوان لسه متبعت (fallback) للحالة النادرة اللي القضية بتاعتها
        // اتزامنت في تشغيلة سابقة قبل ما الجلسة توصلها الدور.
        const offlineTempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const payload = {
            case_number_official: form.number || null,
            title: form.title,
            court_name: form.court,
            case_type: form.type,
            status: 'نشطة',
            client_id: form.client_id || null,
            court_level: form.court_level || null,
            circuit_number: form.circuit_number || null,
            next_hearing: form.date || null,
            session_hall: form.session_hall || null,
            secretary_hall: form.secretary_hall || null,
            secretary_name: form.secretary_name || null,
            secretary_mobile: form.secretary_mobile || null,
            // ⚡ CHANGED (خطة تفكيك legacy columns — Phase F.1، 6 أغسطس 2026):
            // وقّفنا كتابة plaintiff/defendant/*_role/*_national_id/
            // *_power_of_attorney/*_address هنا خالص — كل أطراف الدعوى
            // بتتسجل في case_parties بس (insertCaseParties تحت)، وكل شاشات
            // العرض بقت بتقرا من هناك (مراحل B.1-B.4).
            // 🔒 FIX (تحليل لوجز E2E — 8 أغسطس 2026): plaintiff_legal_title/
            // defendant_legal_title اترجعوا هنا — كانوا اتشالوا مع باقي
            // الأعمدة القديمة فوق غلط. عمودي المسمى القانوني مش بديل عنهم
            // case_parties — دول عمودين على مستوى القضية نفسها (لكل الجهة،
            // مش لكل شخص) ولسه مصدر البيانات الوحيد اللي بتقرا منه شاشات
            // كتير فعليًا (ChecklistSection.tsx وInfoSection.tsx وCaseDetailView.tsx
            // وCasesTab.tsx وCaseSummary.tsx/CaseDataExtract.tsx/AILegalAssistant.tsx).
            // كانوا بيتبعتوا كمدخل فاليديشن بس (validateParties) من غير ما
            // يتكتبوا فعليًا على أي عمود — يعني أي مسمى قانوني بيكتبه
            // المستخدم كان بيتفقد صامتًا فور الحفظ (باج فقدان بيانات حقيقي،
            // مش مجرد تنظيف كود).
            plaintiff_legal_title: form.plaintiff_legal_title || null,
            defendant_legal_title: form.defendant_legal_title || null,
            // 🔒 FIX (تقرير الموثوقية — نتيجة 3، ٦.٢): تحسين احتياطي —
            // التريجر trg_tenant_id_cases (set_tenant_id_from_profile) بيملّ
            // tenant_id تلقائيًا من current_tenant_id() لو الحقل جاي فاضي،
            // وده كافي لأي INSERT جاي من التطبيق (فيه auth.uid() سليم). إضافة
            // القيمة هنا صراحةً مش إصلاح باج — هي طبقة حماية إضافية لو حصل
            // مستقبلًا استدعاء INSERT من سياق مفيهوش auth.uid() سليم.
            tenant_id: profile?.tenant_id || null,
            _offlineTempId: offlineTempId,
        };
        const offlineId = 'offline-' + Date.now();

        // ⚡ NEW (مرحلة 4.2 — خطة تعدد الأطراف): بيكتب صف في case_parties لكل
        // طرف في form.parties، بنداءات __dbWrite منفصلة (قرار قسم 8 — خيار أ:
        // نتنازل عن الذرّية الكاملة مقابل التوافق مع الأوفلاين). لو القضية
        // نفسها لسه في الطابور (offline&&queued)، كل صف طرف بياخد
        // _offlineFkTempId (نفس آلية caseSessionLinkingShared.ts) عشان يتربط
        // بالـ case_id الحقيقي وقت المزامنة بدل ما ننتظر id حقيقي دلوقتي.
        // النتيجة بترجع سبب الفشل صراحةً (بدل boolean بس) عشان مكان النداء
        // يقدر يختار الرسالة المناسبة من غير ما نعرض توست مزدوج (واحد من
        // جوه الدالة وواحد تاني من بره) لنفس المشكلة.
        type InsertPartiesResult = { ok: true } | { ok: false; reason: 'validation'; message: string } | { ok: false; reason: 'write' };
        const insertCaseParties = async (caseId: string | null, isOffline: boolean, isQueued: boolean): Promise<InsertPartiesResult> => {
            const parties = form.parties;
            if (!parties || parties.length === 0) return { ok: true };
            // 🔒 NEW (خطوة 4.3 — خطة تعدد الأطراف، قسم 7-ج): فاليديشن سيرفر
            // مكرر — نفس قواعد casePartiesValidation.ts (اسم/صفة إجباريين،
            // رقم قومي 14 رقم لموكل المكتب، طرف is_client واحد على الأقل،
            // منع تكرار الرقم القومي...) بتتفحص تاني هنا قبل أي INSERT حقيقي،
            // مش بس فاليديشن الفورم (usePartyFields.ts). ده خط دفاع تاني —
            // فورم NewCaseModal.tsx بيمنع الحفظ أصلاً لو الفاليديشن فشلت، فمن
            // المفروض الحالة دي متوصلش هنا عمليًا، لكن لو مصدر حفظ تاني ظهر
            // مستقبلًا (أو state الفورم اتلاعب فيه برمجيًا قبل onSave)، بنرفض
            // كتابة أي صف بدل ما نسيب بيانات غير صالحة توصل case_parties —
            // ومفيش أي INSERT بيتبعت خالص لو الفحص فشل (رفض كامل قبل أول نداء).
            // 🆕 (خطة "المسمى القانوني" — مرحلة 3): بنبعت legalTitles من
            // form هنا كمان، وإلا الفحص السيرفري مش هيطبّق قاعدة 6 (إلزامية
            // المسمى القانوني عند ≥٢ أشخاص) خالص، حتى لو فورم الحفظ نفسه
            // بيطبّقها (فاليديشن الفورم بس مش كافي — نفس فلسفة باقي القواعد).
            const serverCheck = validateParties(parties, {
                plaintiff: form.plaintiff_legal_title || '',
                defendant: form.defendant_legal_title || '',
            });
            if (!serverCheck.valid) {
                return { ok: false, reason: 'validation', message: serverCheck.message || '⚠️ بيانات أطراف الدعوى غير مكتملة أو غير صحيحة' };
            }
            let allOk = true;
            for (let i = 0; i < parties.length; i++) {
                const p = parties[i];
                const rowData: Record<string, unknown> = {
                    case_id: caseId,
                    side: p.side,
                    is_client: p.is_client,
                    name: p.name,
                    capacity: p.capacity,
                    national_id: p.national_id || null,
                    address: p.address || null,
                    power_of_attorney: p.power_of_attorney || null,
                    client_id: p.client_id || null,
                    sort_order: i,
                };
                const finalData = withFkOfflineSentinel(isOffline, isQueued, 'case_id', offlineTempId, 'cases', form.title, rowData);
                const partyResult = await window.__dbWrite({ type: 'INSERT', table: 'case_parties', data: finalData });
                if (partyResult.error) allOk = false;
            }
            return allOk ? { ok: true } : { ok: false, reason: 'write' };
        };

        const { error, offline, queued, data: insertedCase } = await window.__dbWrite({
            type: 'INSERT', table: 'cases', data: payload, returning: true
        });
        if (offline && queued) {
            // BUG-20 FIX: لو فيه تاريخ جلسة، نحفظها في الـ queue مع _offlineCaseTempId
            // (+ _offlineCaseTitle كـ fallback) عشان الـ sync handler يقدر يربطها
            // بالـ id الحقيقي بعد ما القضية تتزامن
            if (form.date) {
                await window.__dbWrite({
                    type: 'INSERT',
                    table: 'case_sessions',
                    data: {
                        _offlineCaseTempId: offlineTempId, // مطابقة أساسية دقيقة
                        _offlineCaseTitle: form.title,     // fallback لو التشغيلة مختلفة
                        case_id: null,                   // هيتملى وقت المزامنة
                        session_date: form.date,
                        session_time: form.session_time || 'صباحي',
                        // 🔒 FIX (باگ "قاعة الجلسة الأولى بتتسجل فاضية" — 12
                        // أغسطس 2026): كان بيتكتب هنا form.court_floor/
                        // form.court_hall — حقول قديمة اتلغت من الواجهة
                        // تمامًا وقت "توحيد منطق مكان الجلسة" (session_hall
                        // بقى المصدر الوحيد في الفورم)، فكانت دايمًا فاضية
                        // ('') مهما كتب المستخدم في "الطابق وقاعة الجلسة" —
                        // الجلسة الأولى كانت بتتسجل بقاعة فاضية دايمًا رغم
                        // إن cases.session_hall نفسه كان بيتكتب صح.
                        session_floor: null,
                        session_hall: form.session_hall || null,
                        description: 'الجلسة الأولى',
                        result: null,
                        next_action: null,
                    },
                });
            }
            toast('📥 محفوظة محلياً — ستُضاف فور عودة الإنترنت');
            // الأطراف بتتقيّد هي كمان في نفس طابور الأوفلاين — بتتحل تلقائيًا
            // بالـ case_id الحقيقي وقت المزامنة (_offlineFkTempId فوق).
            const offlinePartiesResult = await insertCaseParties(null, true, true);
            // ⚡ NEW (4.3): القضية نفسها اتقيّدت أوفلاين بنجاح (توست فوق)،
            // لكن لو فحص الأطراف فشل (نادر جدًا — يعني state الفورم اتلاعب
            // فيه برمجيًا بعد فاليديشن الفورم)، لازم نعلم المستخدم إن أطراف
            // الدعوى مانضافتش رغم إن القضية اتقيّدت، بدل ما نسكت عن الفشل.
            if (!offlinePartiesResult.ok) {
                toast(
                    offlinePartiesResult.reason === 'validation'
                        ? offlinePartiesResult.message
                        : '⚠️ القضية اتقيّدت محليًا، لكن حصل خطأ في حفظ بعض أطراف الدعوى الإضافية — راجعها بعد المزامنة',
                    true
                );
            }
            setCases((prev) => [{ ...payload, id: offlineId, ...form, status: 'نشطة', date: form.date || '—' } as unknown as MappedCase, ...prev]);
        } else if (error) {
            // 🔒 FIX (تقرير الموثوقية — نتيجة 3): خط دفاع أخير — راجع
            // التعليق المماثل في useClientActions.ts.
            if ((error as { code?: string }).code === '23505') {
                toast('⚠️ رقم القيد ده مسجل بالفعل لقضية موجودة', true);
            } else {
                // 🐛 FIX (بلاغ اختبار حد الباقة — 9 سبتمبر 2026): كان هنا
                // toast() ثابت بيتجاهل رسالة الـtrigger الحقيقية (B1،
                // ERRCODE=P0001/HINT=PLAN_LIMIT_CASES) لما القضايا النشطة
                // توصل لحد الباقة — المستخدم كان يشوف "تحقق من الاتصال"
                // رغم إن الاتصال شغال 100% والمشكلة إنه وصل لحد باقته.
                // showErrorToast (مستخدمة فعلاً فوق لفحص رقم القيد المكرر)
                // بتكتشف P0001 تلقائيًا وتعرض رسالة الـtrigger العربية
                // الجاهزة زي ما هي بدل الرسالة العامة.
                showErrorToast('case_save', error, 'فشل تسجيل القضية الجديدة — تحقق من الاتصال وأعد المحاولة', 'إضافة قضية');
            }
            creatingCaseGuard = false;
            setSavingCase(false);
            return false;
        } else {
            // ── تسجيل الجلسة الأولى في case_sessions لو فيه تاريخ ──
            // بناخد id القضية مباشرة من نتيجة الإدراج (بدل التخمين
            // بإعادة استعلام بالعنوان — كان بيسبب ربط غلط لو فيه قضيتين
            // بنفس العنوان اتسجلوا في نفس اللحظة تقريبًا)
            const newCaseId: string | null = insertedCase?.id || null;
            if (form.date && newCaseId) {
                // 🔒 FIX (المرحلة 6 — تنبيه عند فشل تسجيل الجلسة الأولى):
                // الإدراج ده كان بينفّذ من غير أي فحص لنتيجته — لو فشل (مشكلة
                // شبكة/RLS/أي سبب تاني)، القضية كانت بتتسجل عادي والمستخدم
                // ياخد "✅ تم الحفظ في نظام سند!" وكأن كل حاجة تمام، بينما
                // الجلسة الأولى ضاعت بصمت تمامًا من غير أي أثر. دلوقتي بنلقط
                // { error } ونظهر نفس تنبيه "الجلسة الأولى محتاجة تتضاف يدويًا"
                // المستخدم فعليًا فى حالة newCaseId المفقود تحت — نفس الرسالة،
                // نفس القناة، السبب مختلف بس النتيجة للمستخدم واحدة.
                const { error: sessionError } = await db.from('case_sessions').insert([{
                    case_id: newCaseId,
                    session_date: form.date,
                    session_time: form.session_time || 'صباحي',
                    // 🔒 FIX (باگ "قاعة الجلسة الأولى بتتسجل فاضية" — 12
                    // أغسطس 2026): راجع تعليق الفيكس فوق (مسار الأوفلاين) —
                    // نفس السبب بالظبط.
                    session_floor: null,
                    session_hall: form.session_hall || null,
                    description: 'الجلسة الأولى',
                    result: null,
                    next_action: null,
                }]);
                if (sessionError) {
                    toast('⚠️ القضية اتسجلت، بس فشل تسجيل الجلسة الأولى — أضفها يدويًا من صفحة القضية', true);
                }
            } else if (form.date && !newCaseId) {
                // حالة نادرة: القضية اتسجلت بنجاح لكن السيرفر معادش الصف
                // المُدرج (مثلاً سياسة RLS بتمنع SELECT بعد INSERT) — القضية
                // موجودة فعليًا، بس الجلسة الأولى محتاجة تتضاف يدويًا.
                toast('⚠️ القضية اتسجلت، بس الجلسة الأولى محتاجة تتضاف يدويًا من صفحة القضية', true);
            }
            // ⚡ NEW (مرحلة 4.2): تسجيل كل أطراف الدعوى في case_parties — أونلاين
            // بالـ id الحقيقي مباشرة (مفيش داعي لسنتينل هنا).
            if (newCaseId) {
                const partiesResult = await insertCaseParties(newCaseId, false, false);
                if (!partiesResult.ok) {
                    // 🔒 (4.3): فشل الفاليديشن بيتعرض برسالته المحدّدة (نفس
                    // رسالة usePartyFields.ts)، وفشل الكتابة بيتعرض برسالة
                    // عامة — توست واحد بس في الحالتين، مش توست مزدوج.
                    toast(
                        partiesResult.reason === 'validation'
                            ? partiesResult.message
                            : '⚠️ القضية اتسجلت، لكن حصل خطأ في حفظ بعض أطراف الدعوى الإضافية — راجعها من تفاصيل القضية',
                        true
                    );
                }
            }
            toast('✅ تم الحفظ في نظام سند!');
            // إشعار تليجرام
            const caseNumLabel = form.caseNum && form.caseYear
                ? `${form.caseNum} لسنة ${form.caseYear}`
                : (form.number || '—');
            // ⚡ NEW (سجل النشاط — بيان مميز عند الإضافة، مرحلة 2): نضيف
            // الطرفين لو موجودين، بدل ما نكتفي بالعنوان ورقم القيد بس.
            const caseAddPartiesLabel = [
                form.plaintiff ? `المدعي: ${form.plaintiff}` : null,
                form.defendant ? `المدعى عليه: ${form.defendant}` : null,
            ].filter(Boolean).join(' — ');
            logActivity(db, 'إضافة قضية', {
                userName: _userName,
                entity_type: 'case', entity_id: newCaseId,
                details: `${form.title} — رقم القيد: ${caseNumLabel}${caseAddPartiesLabel ? ' — ' + caseAddPartiesLabel : ''}`,
                case_name: form.title || null,
                case_type: form.type || null,
                client_name: clients.find((cl) => cl.id === form.client_id)?.full_name || null,
                changes: buildAddSnapshot(form as unknown as Record<string, unknown>, {
                    title: { label: 'العنوان' },
                    type: { label: 'التصنيف' },
                    court: { label: 'المحكمة' },
                    number: { label: 'رقم القيد' },
                }),
            });
            let caseMsg = `⚖️ <b>قضية جديدة تم تقييدها</b>\n`;
            caseMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
            caseMsg += `📋 <b>رقم القيد:</b> ${escapeTelegramHtml(caseNumLabel)}\n`;
            caseMsg += `📌 <b>الموضوع:</b> ${escapeTelegramHtml(form.title)}\n`;
            caseMsg += `🏛 <b>المحكمة:</b> ${escapeTelegramHtml(form.court || '—')}\n`;
            caseMsg += `📂 <b>التصنيف:</b> ${escapeTelegramHtml(form.type || '—')}\n`;
            // ⚡ CHANGED (Phase F.1، 6 أغسطس 2026): كانت بتقرا form.plaintiff/
            // form.defendant (الأعمدة القديمة، بقت مش بتتبعت من الفورم خالص).
            // دلوقتي بتشتق أول طرف في كل جهة من form.parties (case_parties)
            // مباشرة — نفس مصدر البيانات الحقيقي الوحيد دلوقتي.
            const msgPlaintiff = form.parties?.find((p) => p.side === 'plaintiff');
            const msgDefendant = form.parties?.find((p) => p.side === 'defendant');
            if (msgPlaintiff?.name) caseMsg += `🟢 <b>الطرف الأول:</b> ${escapeTelegramHtml(msgPlaintiff.name)}${msgPlaintiff.capacity ? ' — ' + escapeTelegramHtml(msgPlaintiff.capacity) : ''}\n`;
            if (msgDefendant?.name) caseMsg += `🔴 <b>الطرف الثاني:</b> ${escapeTelegramHtml(msgDefendant.name)}${msgDefendant.capacity ? ' — ' + escapeTelegramHtml(msgDefendant.capacity) : ''}\n`;
            if (form.date) caseMsg += `📆 <b>أقرب جلسة:</b> ${escapeTelegramHtml(form.date)}\n`;
            sendTelegram(caseMsg);
            fetchCases(0, casesFilter);
        }
        creatingCaseGuard = false;
        setSavingCase(false);
        setShowCaseModal(false);
        return true;
    };

    // ─ حذف قضية نهائيًا من قاعدة البيانات (مرحلة 2 — كاسكيد كامل، ومرحلة 3 — M-3: عكس الترتيب) ─
    // ⚠️ النطاق مبني على القرار المحسوم فى الخطة (18 يوليو 2026) بعد تحقق فعلي
    // من delete_rule الحقيقي لكل الـ FKs فى الداتابيز الحية:
    //   - case_sessions / case_events → CASCADE تلقائي مع حذف صف القضية (مفيش كود مطلوب)
    //   - case_documents (سجل DB) → CASCADE تلقائي كمان، لكن الملفات الفعلية فى
    //     Storage (bucket 'case-docs') لازم تتحذف يدويًا، فبنجيب storage_path بتاعتها
    //     الأول (SELECT بلا أي أثر جانبي) قبل ما صفوفها تتحذف تلقائيًا من الداتابيز.
    //   - case_fees / fee_payments / invoices → SET NULL تلقائي، مايتحذفوش خالص
    //     (القرار الصريح: حذف قضية ميحذفش الأتعاب المرتبطة بيها) — مفيش كود مطلوب هنا.
    // ⚠️ [مرحلة 3 — M-3] الترتيب بين حذف صف القضية وتنضيف Storage اتعكس عمدًا: حذف
    // صف القضية (DB) بقى أولًا، وتنضيف الـ Storage بقى تانيًا. لو حصل انقطاع بعد
    // الخطوة 1 (SELECT) وقبل حذف الصف، مفيش حاجة اتغيرت خالص (آمن). لو حصل انقطاع
    // بعد نجاح حذف الصف وقبل تنضيف الـ Storage، أسوأ حالة هي ملفات يتيمة فى bucket
    // 'case-docs' (تسرب تخزين بسيط) — مش روابط مكسورة أو صف قضية عالق زي ما كان
    // ممكن يحصل مع الترتيب القديم (Storage الأول، DB تاني).
    const handlePermanentDeleteCase = async (caseId: string) => {
        const c = await getCaseRecord(caseId);

        // ─ خطوة 1: جلب storage_path لمستندات القضية (قبل ما صفوفها تتحذف تلقائيًا) ─
        const { data: docs, error: docsFetchError } = await db.from('case_documents')
            .select('storage_path').eq('case_id', caseId);
        if (docsFetchError) {
            toast('❌ فشل التحقق من مستندات القضية — تحقق من الاتصال وأعد المحاولة', true);
            return;
        }
        const paths = (docs || []).map((d) => d.storage_path).filter((p): p is string => !!p);

        // ─ خطوة 2: حذف صف القضية أولًا — الداتابيز بتكمل الباقي تلقائيًا (CASCADE/SET NULL) ─
        const { error } = await db.from('cases').delete().eq('id', caseId);
        if (error) {
            nav.closeModal('delete');
            setDeleteConfirm(null);
            showErrorToast('case_permanent_delete', error, 'فشل حذف القضية نهائياً — تحقق من الاتصال وأعد المحاولة', 'حذف قضية نهائيًا');
            return;
        }

        // ─ خطوة 3: تنضيف ملفات Storage — بعد التأكد إن صف القضية اتمسح فعليًا ─
        if (paths.length > 0) {
            const { error: storageErr } = await db.storage.from('case-docs').remove(paths);
            // ⚠️ فشل حذف الملفات مش سبب لإيقاف/إلغاء حذف القضية (اتحذفت خلاص) —
            // بنحذّر المستخدم إنه يراجع bucket 'case-docs' يدويًا لو فيه ملفات يتيمة.
            if (storageErr) toast('⚠️ تعذّر حذف بعض ملفات المستندات من التخزين — راجع bucket المستندات يدويًا', true);
        }

        nav.closeModal('delete');
        setDeleteConfirm(null);
        toast('🗑️ تم حذف القضية نهائياً');
        logActivity(db, 'حذف قضية نهائياً', {
            userName: _userName,
            entity_type: 'case', entity_id: caseId, details: c?.title || null,
            case_name: c?.title || null,
            case_type: c?.type || null,
            client_name: clients.find((cl) => cl.id === c?.client_id)?.full_name || null,
            changes: buildDeleteSnapshot(c as unknown as Record<string, unknown>, {
                title: { label: 'العنوان' },
                type: { label: 'التصنيف' },
                status: { label: 'الحالة' },
                number: { label: 'رقم القيد' },
            }),
        });
        setSelectedCase(null);
        setCases((prev) => prev.filter((cs) => cs.id !== caseId));
    };

    // ─ حذف قضية: يعرض اختيار (أرشفة/حذف نهائي) عن طريق DeleteConfirmModal ─
    const handleDeleteCase = async (caseId: string) => {
        // 🔒 FIX (8 أغسطس 2026): fallback فوري من `cases` المحلية (بدون تأخير
        // فتح مودال التأكيد)، ومكمّل بعدها بـ getCaseRecord لو القضية مش
        // كانت محمّلة أصلًا (بدل ما يفضل اسمها "القضية" الافتراضي غلط).
        // 🔒 NEW (خطة تفعيل الصلاحيات التفصيلية، مرحلة 3): can_delete_cases —
        // بيغطي مسار الأرشفة (UPDATE deleted_at) والحذف النهائي مع بعض،
        // زي زرار "حذف القضية" الوحيد اللي بيفتح المودال ده أصلًا. الحذف
        // النهائي الفعلي محكوم كمان على مستوى RLS بنفس المفتاح (DELETE
        // على cases)، والأرشفة (UPDATE) محكومة هناك بـcan_edit_cases —
        // القفل هنا أوسع شوية بقصد (بساطة نقطة دخول واحدة بدل تقسيمها).
        if (!checkPermission(profile, 'can_delete_cases')) {
            toast('❌ ليس لديك صلاحية حذف القضايا', true);
            return;
        }
        const localCase = cases.find((x) => x.id === caseId);
        const c = localCase || (await getCaseRecord(caseId));
        setDeleteConfirm({
            type: 'case', id: caseId,
            name: c?.title || 'القضية',
            itemType: 'القضية',
            title: 'حذف القضية',
            onConfirmArchive: async () => {
                const { error } = await db.from('cases').update({ deleted_at: new Date().toISOString() }).eq('id', caseId);
                nav.closeModal('delete');
                setDeleteConfirm(null);
                if (error) { showErrorToast('case_archive', error, 'فشل أرشفة القضية — تحقق من الاتصال وأعد المحاولة', 'أرشفة قضية'); return; }
                toast('📦 تم نقل القضية للأرشيف');
                // ⚠️ FIX (2 من 14 يوليو 2026 — اكتشاف تاني عن طريق التحقق من الأنواع):
                // كان الكود بيقرأ c?.case_type. الفيكس السابق (الأقدم) كان افترض إن
                // `c` (جاي من متغيّر `cases` بارامتر الهوك) نوعه CaseRow الخام (فيه
                // case_type)، لكن الداتا الفعلية وقت التشغيل هي MappedCase (النوع
                // المُطبَّع من useAppData.ts) اللي اسم الحقل فيها `type` مش `case_type`.
                // يعني c?.case_type كانت بترجع undefined دايمًا فعليًا، والحقل كان
                // بيتسجل null دايمًا في سجل النشاط لكل عملية أرشفة قضية — نفس فصيلة
                // الباگ القديم بالظبط لكن بالاتجاه العكسي. اتصلح دلوقتي بعد ما اتغيّر
                // نوع `cases`/`selectedCase` فعليًا لـ MappedCase[]/MappedCase|null.
                logActivity(db, 'أرشفة قضية', {
                    userName: _userName,
                    entity_type: 'case', entity_id: caseId, details: c?.title || null,
                    case_name: c?.title || null,
                    case_type: c?.type || null,
                    client_name: clients.find((cl) => cl.id === c?.client_id)?.full_name || null,
                });
                setSelectedCase(null);
                setCases((prev) => prev.filter((cs) => cs.id !== caseId));
            },
            onConfirmDelete: () => handlePermanentDeleteCase(caseId),
            deleteConsequences: [
                'سيُحذف نهائيًا: بيانات القضية، الجلسات، المستندات المرفوعة (والملفات الفعلية)، وأي عناصر أخرى تابعة للقضية فقط.',
                'الأتعاب والفواتير المرتبطة بالقضية تفضل محفوظة بالكامل — بس رابطها بالقضية بيتصفّر.',
                'لا يمكن التراجع عن هذا الإجراء.',
            ],
        });
    };

    // ─ استرجاع قضية من الأرشيف ─
    const handleRestoreCase = async (caseId: string) => {
        const { error } = await db.from('cases').update({ deleted_at: null }).eq('id', caseId);
        // 🐛 FIX (نفس فحص handleSaveCase فوق — 9 سبتمبر 2026): استرجاع
        // قضية مؤرشفة بيرجّعها "نشطة" فعليًا، فبيخضع لنفس تريجر حد
        // القضايا (B4، PLAN_LIMIT_CASES) لو المكتب أصلاً على حد باقته —
        // showErrorToast بتعرض رسالة الـtrigger الحقيقية بدل رسالة
        // اتصال عامة مضلّلة.
        if (error) { showErrorToast('case_restore', error, 'فشل استرجاع القضية — تحقق من الاتصال وأعد المحاولة', 'استرجاع قضية'); return; }
        toast('✅ تم استرجاع القضية');
        logActivity(db, 'استرجاع قضية من الأرشيف', { userName: _userName, entity_type: 'case', entity_id: caseId });
        fetchCases(0, casesFilter);
    };

    // ─ تعديل قضية ─
    // 🔒 FIX (تشخيص لوجز E2E — 29 يوليو 2026): بترجع boolean دلوقتي (true =
    // اتحدثت فعلاً، false = فشل التحديث لأي سبب) بدل void — نفس فيكس
    // handleUpdateClient فوق بالحرف. CaseDetailView.tsx كان بيقفل مودال
    // التعديل فورًا بمجرد الضغط على "حفظ التعديلات" من غير ما ينتظر النتيجة
    // الأسينك، فحتى لو فشل الحفظ (تكرار رقم قيد مثلاً)، المودال كان يقفل
    // برضو والمستخدم يشوف توست الخطأ بس من غير فرصة يصحح البيانات.
    const handleUpdateCase = async (caseId: string, form: CaseFormSubmitData): Promise<boolean> => {
        // 🔒 نفس فحص handleSaveCase المتزامن — قبل أي setState أو await.
        if (updatingCaseGuard) return false;
        // 🔒 NEW (خطة تفعيل الصلاحيات التفصيلية، مرحلة 3): can_edit_cases —
        // نفس فحص has_permission('can_edit_cases') على القاعدة (RLS UPDATE
        // على cases).
        if (!checkPermission(profile, 'can_edit_cases')) {
            toast('❌ ليس لديك صلاحية تعديل القضايا', true);
            return false;
        }
        if (!form.title || !form.title.trim()) {
            toast('❌ حقل "موضوع ومسمى الدعوى" مطلوب', true);
            return false;
        }
        // 🔒 FIX (تقرير الموثوقية — نتيجة 1): الدالة دي ما كانش فيها أي
        // حماية دبل كليك خالص (بعكس handleSaveCase اللي فيها setSavingCase).
        // بنستخدم نفس savingCase state عشان EditCaseModal يقدر يقفل زراره.
        updatingCaseGuard = true;
        setSavingCase(true);
        try {
            // 🔒 FIX (تقرير الموثوقية — نتيجة 2، مُصحَّحة): نفس فحص تكرار
            // رقم القيد (رقم + محكمة + نوع مع بعض) المستخدم في
            // handleSaveCase، بس هنا بنستبعد القضية نفسها من المقارنة
            // (excludeCaseId) عشان تعديل قضية بنفس رقمها الحالي (من غير
            // تغيير) ميترفضش بالغلط كـ"تكرار مع نفسها".
            // 🔒 FIX (تقرير فحص أعطال الأوف لاين — 13 أغسطس 2026): نفس فيكس
            // handleSaveCase — أوف لاين/تايم آوت بيأجّلوا الفحص بدل ما يوقفوا
            // التعديل بالكامل.
            let caseDup: { duplicate: boolean; message?: string } = { duplicate: false };
            try {
                const check = await runDuplicateCheckOfflineAware((signal) =>
                    checkCaseNumberDuplicate(db, form.number, form.court_level, form.type, caseId, signal)
                );
                if (check.skipped) toast('⚠️ أوف لاين — فحص تكرار رقم القيد هيتأجل لحد المزامنة', false);
                else caseDup = check.result!;
            } catch (e) {
                showErrorToast('case_number_duplicate_check', e, 'تعذّر التحقق من رقم القيد. حاول مرة أخرى.', 'تعديل قضية');
                updatingCaseGuard = false;
                setSavingCase(false);
                return false;
            }
            if (caseDup.duplicate) { toast(caseDup.message!, true); updatingCaseGuard = false; setSavingCase(false); return false; }

            // ⚡ NEW (مرحلة 5.2 — خطة تعدد الأطراف، 22 يوليو 2026): نفس فلسفة
            // insertCaseParties في handleSaveCase (فاليديشن سيرفر مكرر أولاً،
            // رفض كامل قبل أي كتابة لو فشلت — راجع 4.3)، بس هنا upsert-by-id
            // بدل INSERT بس: id موجود في existingPartyIds (اللي جت من
            // EditCaseModal وقت فتح الفورم) = تعديل، id مؤقت (`legacy-*`/
            // `party-*`) أو أي id تاني مش في القايمة = إضافة جديدة، وأي id
            // كان في existingPartyIds واتشال من form.parties دلوقتي = حذف.
            // بنداءات __dbWrite منفصلة (زي 4.2 بالظبط — بدون ذرّية كاملة)،
            // ومفيش حاجة لـ _offlineFkTempId هنا (بعكس 4.2) لأن caseId هنا
            // حقيقي دايمًا (القضية أصلاً موجودة قبل التعديل)، أونلاين أو
            // أوفلاين — window.__dbWrite بيتعامل مع الأوفلاين لوحده لكل نداء.
            // ⚡ NEW (خطة توحيد "ربط طرف بموكل موجود" — مرحلة 4، 6 أغسطس 2026):
            // 'conflict' بقت reason مستقلة عن 'write' — بتحمل أسماء الأطراف
            // اللي حصل فيها تعارض فعلي (conflictNames) عشان الرسالة توضح
            // "مين بالظبط" بدل رسالة "فشل كتابة" عامة. كانت الفجوة الموثّقة
            // في تقرير المرحلة 2 (قسم 6) و3 (قسم 5) — التعارض هنا (loop
            // واحد بيعالج كذا طرف مع بعض) كان بيتعامل معاه كأي فشل كتابة
            // تاني، من غير أي تمييز.
            type SyncPartiesResult = { ok: true } | { ok: false; reason: 'validation'; message: string } | { ok: false; reason: 'write' } | { ok: false; reason: 'conflict'; conflictNames: string[] };
            const syncCaseParties = async (targetCaseId: string): Promise<SyncPartiesResult> => {
                const parties = form.parties;
                if (!parties) return { ok: true };
                // 🆕 (خطة "المسمى القانوني" — مرحلة 3): نفس منطق insertCaseParties فوق.
                const serverCheck = validateParties(parties, {
                    plaintiff: form.plaintiff_legal_title || '',
                    defendant: form.defendant_legal_title || '',
                });
                if (!serverCheck.valid) {
                    return { ok: false, reason: 'validation', message: serverCheck.message || '⚠️ بيانات أطراف الدعوى غير مكتملة أو غير صحيحة' };
                }
                const existingIds = form.existingPartyIds || [];
                const currentIds = new Set(parties.map((p) => p.id));
                let allOk = true;
                const conflictNames: string[] = [];
                // 1) حذف أي صف كان موجود فعلاً وقت فتح الفورم واتشال منها دلوقتي
                for (const oldId of existingIds) {
                    if (!currentIds.has(oldId)) {
                        const delResult = await window.__dbWrite({ type: 'DELETE', table: 'case_parties', id: oldId });
                        if (delResult.error) allOk = false;
                    }
                }
                // 2) upsert لكل طرف موجود في الفورم دلوقتي — تعديل لو الـ id
                // حقيقي وموجود في existingIds، إضافة جديدة لو مش موجود فيها
                // (id مؤقت من usePartyFields أو fallback القديم).
                for (let i = 0; i < parties.length; i++) {
                    const p = parties[i];
                    const rowData: Record<string, unknown> = {
                        case_id: targetCaseId,
                        side: p.side,
                        is_client: p.is_client,
                        name: p.name,
                        capacity: p.capacity,
                        national_id: p.national_id || null,
                        address: p.address || null,
                        power_of_attorney: p.power_of_attorney || null,
                        client_id: p.client_id || null,
                        sort_order: i,
                    };
                    const result = existingIds.includes(p.id)
                        ? await window.__dbWrite({ type: 'UPDATE', table: 'case_parties', data: rowData, id: p.id, knownUpdatedAt: p.updated_at || null })
                        : await window.__dbWrite({ type: 'INSERT', table: 'case_parties', data: rowData });
                    // ⚡ CHANGED (مرحلة 4، 6 أغسطس 2026): تعارض (حد تاني عدّل نفس
                    // الطرف بعد ما الفورم اتفتح) بقى بيتجمّع في conflictNames
                    // منفصل عن allOk العام — لو كل الأخطاء تعارض (مفيش fetch/
                    // network error حقيقي)، الرسالة النهائية بتسمي الأطراف
                    // بالظبط بدل "فشل كتابة" عامة.
                    if (result.conflict) {
                        conflictNames.push(p.name?.trim() || `طرف رقم ${i + 1}`);
                        allOk = false;
                    } else if (result.error) {
                        allOk = false;
                    }
                }
                if (allOk) return { ok: true };
                if (conflictNames.length > 0) return { ok: false, reason: 'conflict', conflictNames };
                return { ok: false, reason: 'write' };
            };

            // 🔒 FIX (فيكس فئة "اليتيم الوهمي" على القضايا — 8 أغسطس 2026):
            // existingCase كانت بتتجاب بـ cases.find(id) على القايمة
            // المقيّدة بالصفحة/الفلتر — لو القضية دي مش محمّلة محليًا وقت
            // التعديل (مثلاً اتفتحت من نتيجة بحث/رابط مباشر)، كان
            // client_id fallback تحت بيرجع null بصمت (ممكن يمسح ربط
            // الموكل)، وknownUpdatedAt تحت كان بيتعطّل (قفل تفاؤلي معطّل
            // بصمت). getCaseRecord بتضمن جلب الصف الحقيقي من الداتابيز
            // لو مش موجود محليًا.
            const existingCaseRecord = await getCaseRecord(caseId);
            // ⚡ NEW (سجل النشاط — تتبع التغييرات، مرحلة 2، 19 أغسطس 2026):
            // existingCaseRecord فوق بيحمل بس 4 حقول (updated_at/client_id/
            // title/type) — مش كافي لمقارنة باقي الحقول (court_name، status،
            // next_hearing...). بنجيب snapshot خام من الداتابيز بنفس أسماء
            // أعمدتها الحقيقية (مطابقة لـpayload تحت بالظبط) هنا — *قبل*
            // __dbWrite تحت مباشرة — عشان نضمن إن القيمة "القديمة" فعلاً قديمة.
            const { data: oldRowForDiff } = await db
                .from('cases')
                .select('case_number_official,title,court_name,case_type,status,client_id,court_level,circuit_number,next_hearing,session_hall,secretary_hall,secretary_name,secretary_mobile,plaintiff_legal_title,defendant_legal_title')
                .eq('id', caseId)
                .maybeSingle();
            const payload = {
                case_number_official: form.number || null,
                title: form.title,
                court_name: form.court || null,
                case_type: form.type || null,
                status: form.status || undefined,
                client_id: (form.client_id !== undefined ? form.client_id : existingCaseRecord?.client_id) || null,
                court_level: form.court_level || null,
                circuit_number: form.circuit_number || null,
                next_hearing: form.date || null,
                session_hall: form.session_hall || null,
                secretary_hall: form.secretary_hall || null,
                secretary_name: form.secretary_name || null,
                secretary_mobile: form.secretary_mobile || null,
                // ⚡ CHANGED (Phase F.1، 6 أغسطس 2026): نفس تعديل handleSaveCase
                // فوق بالحرف — وقّفنا كتابة الأعمدة القديمة هنا برضه.
                // 🔒 FIX (تحليل لوجز E2E — 8 أغسطس 2026): نفس فيكس handleSaveCase
                // فوق — plaintiff_legal_title/defendant_legal_title اترجعوا،
                // كانوا بيتفقدوا صامتًا عند كل تعديل قضية.
                plaintiff_legal_title: form.plaintiff_legal_title || null,
                defendant_legal_title: form.defendant_legal_title || null,
            };
            // FIX: Optimistic Locking لتعديل القضايا — كان `updated_at` بيتجاب
            // ويتخزّن في الـ state (شوف useAppData.ts) خصيصًا للاستخدام هنا، بس
            // مكانش بيتبعت فعليًا لـ __dbWrite، فحماية "تعارض التعديل" كانت
            // معطّلة تمامًا لتعديل القضايا (بعكس الأتعاب/الموكلين/الجلسات).
            const knownUpdatedAt = existingCaseRecord?.updated_at
                || (selectedCase?.id === caseId ? selectedCase?.updated_at : null)
                || null;

            const { error, offline, queued, conflict, data: writtenRow } = await window.__dbWrite({
                type: 'UPDATE', table: 'cases', data: payload, id: caseId, knownUpdatedAt
            });
            if (offline && queued) {
                toast('📥 التعديل محفوظ محلياً — سيُزامن عند عودة الإنترنت');
                // تحديث فوري في الـ state المحلي
                setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, ...form } : c));
                if (selectedCase?.id === caseId) setSelectedCase((p) => p ? { ...p, ...form } : p);
                // ⚡ NEW (5.2): القضية اتقيّدت أوفلاين — نفس مبدأ 4.3، نزامن
                // أطراف الدعوى (حذف/تعديل/إضافة) في نفس الطابور، ونعلم
                // المستخدم لو فيه فشل فاليديشن/كتابة من غير ما نمنع نجاح
                // تعديل القضية نفسها.
                const offlinePartiesResult = await syncCaseParties(caseId);
                if (!offlinePartiesResult.ok) {
                    toast(
                        offlinePartiesResult.reason === 'validation'
                            ? offlinePartiesResult.message
                            : offlinePartiesResult.reason === 'conflict'
                            ? `⚠️ الأطراف التالية عدّلها شخص آخر بعد ما فتحت القضية: ${offlinePartiesResult.conflictNames.join('، ')} — راجعها بعد المزامنة`
                            : '⚠️ التعديل اتحفظ محليًا، لكن حصل خطأ في مزامنة بعض أطراف الدعوى — راجعها بعد المزامنة',
                        true
                    );
                }
            } else if (conflict) {
                // 💥 حد تاني عدّل نفس القضية بعد ما إحنا فتحناها — منرفضش نكتب
                // فوق تعديله بصمت. بنسيب البيانات المعروضة زي ما هي ونطلب من
                // المستخدم يفتح القضية تاني عشان يشوف آخر نسخة قبل ما يعدّل.
                toast('⚠️ هذه القضية عدّلها شخص آخر بعد ما فتحتها — أعد فتحها وحاول التعديل مرة أخرى', true);
                updatingCaseGuard = false;
                setSavingCase(false);
                return false;
            } else if (error) {
                if ((error as { code?: string }).code === '23505') {
                    toast('⚠️ رقم القيد ده مسجل بالفعل لقضية موجودة', true);
                } else {
                    showErrorToast('case_update', error, 'فشل تعديل بيانات القضية — تحقق من الاتصال وأعد المحاولة', 'تعديل قضية');
                }
                updatingCaseGuard = false;
                setSavingCase(false);
                return false;
            } else {
                // ── تسجيل جلسة جديدة لو تاريخ الجلسة تغيّر ──
                if (form.date) {
                    const oldDate = (selectedCase?.date === '—' ? '' : selectedCase?.date) || '';
                    if (form.date !== oldDate) {
                        const { data: existing } = await db.from('case_sessions')
                            .select('id')
                            .eq('case_id', caseId)
                            .eq('session_date', form.date)
                            .maybeSingle();
                        if (!existing) {
                            // 🔒 FIX (المرحلة 6 — امتداد): نفس بگ handleSaveCase بالظبط
                            // (الإدراج كان بينفّذ من غير فحص نتيجته) — لو فشل هنا، التعديل
                            // على القضية نفسه كان بينجح والمستخدم مايعرفش إن الجلسة
                            // الجديدة ضاعت بصمت. نفس التنبيه ونفس فلسفة الاستمرار.
                            const { error: sessionError } = await db.from('case_sessions').insert([{
                                case_id: caseId,
                                session_date: form.date,
                                session_time: form.session_time || 'صباحي',
                                // 🔒 FIX (باگ "قاعة الجلسة الجديدة بتتسجل
                                // فاضية بعد تعديل قضية" — 12 أغسطس 2026):
                                // راجع تعليق الفيكس في handleSaveCase فوق —
                                // نفس السبب بالظبط (form.court_floor/
                                // form.court_hall مفعّرين ودايمًا فاضيين).
                                session_floor: null,
                                session_hall: form.session_hall || null,
                                description: 'جلسة محددة',
                                result: null,
                                next_action: null,
                            }]);
                            if (sessionError) {
                                toast('⚠️ التعديل اتحفظ، بس فشل تسجيل الجلسة الجديدة — أضفها يدويًا من صفحة القضية', true);
                            }
                        }
                    }
                }
                // ⚡ NEW (5.2): مزامنة أطراف الدعوى الفعلية أونلاين — بالـ id
                // الحقيقي مباشرة (مفيش داعي لسنتينل، caseId حقيقي أصلاً).
                const partiesResult = await syncCaseParties(caseId);
                if (!partiesResult.ok) {
                    // 🔒 نفس مبدأ 4.3: توست واحد بس، برسالة الفاليديشن
                    // المحددة لو ده السبب، أو رسالة تعارض تسمي الأطراف
                    // بالظبط (مرحلة 4)، أو رسالة عامة لو فشل الكتابة.
                    toast(
                        partiesResult.reason === 'validation'
                            ? partiesResult.message
                            : partiesResult.reason === 'conflict'
                            ? `⚠️ تم تحديث القضية، لكن الأطراف التالية عدّلها شخص آخر بعد ما فتحت الفورم: ${partiesResult.conflictNames.join('، ')} — راجعها من تفاصيل القضية`
                            : '⚠️ تم تحديث القضية، لكن حصل خطأ في مزامنة بعض أطراف الدعوى — راجعها من تفاصيل القضية',
                        true
                    );
                }
                toast('✅ تم تحديث القضية');
                // ⚡ NEW (سجل النشاط — تتبع التغييرات، مرحلة 2، 19 أغسطس 2026):
                // مقارنة oldRowForDiff (اتلقط قبل __dbWrite فوق — راجع التعليق
                // هناك) مع payload (اللي فعلاً اتكتب). client_id بيتحوّل لاسم
                // الموكل قبل التخزين.
                const caseFieldDiffMap: FieldDiffMap = {
                    case_number_official: { label: 'رقم القيد' },
                    title: { label: 'الموضوع' },
                    court_name: { label: 'المحكمة' },
                    case_type: { label: 'نوع القضية' },
                    status: { label: 'الحالة' },
                    client_id: {
                        label: 'الموكل',
                        format: (v) => clients.find((cl) => cl.id === v)?.full_name || '',
                    },
                    court_level: { label: 'درجة التقاضي' },
                    circuit_number: { label: 'رقم الدائرة' },
                    next_hearing: { label: 'تاريخ الجلسة القادمة' },
                    session_hall: { label: 'قاعة الجلسة' },
                    secretary_hall: { label: 'قاعة أمين السر' },
                    secretary_name: { label: 'اسم أمين السر' },
                    secretary_mobile: { label: 'موبايل أمين السر' },
                    plaintiff_legal_title: { label: 'الصفة القانونية للمدعي' },
                    defendant_legal_title: { label: 'الصفة القانونية للمدعى عليه' },
                };
                // ⚠️ payload.status ممكن تكون `undefined` حرفيًا (form.status ||
                // undefined) — ده معناه "متبعتش في التحديث خالص" مش "اتمسحت"،
                // فمنستبعدهاش من المقارنة إلا لو فعلاً اتبعتت قيمة جديدة.
                let caseChanges = buildFieldDiff(
                    oldRowForDiff as unknown as Record<string, unknown>,
                    payload as unknown as Record<string, unknown>,
                    caseFieldDiffMap
                );
                if (payload.status === undefined) {
                    caseChanges = caseChanges.filter((c) => c.field !== 'status');
                }
                // ⚡ NEW (سجل النشاط — تتبع التغييرات، مرحلة 4.4، 19 أغسطس
                // 2026): ديف أطراف الدعوى — form.existingParties (القديم،
                // من EditCaseModal وقت الفتح) مقابل form.parties (الجديد).
                // form.existingParties اختيارية (شوف تعليقها في
                // CaseFormSubmitData فوق) — لو مش موجودة (كود قديم/تستات)
                // بترجع array فاضية من غير أي تأثير على باقي caseChanges.
                const partiesDiff = buildPartiesDiff(
                    form.existingParties,
                    form.parties,
                    form.existingPartyIds || [],
                    clients
                );
                if (partiesDiff.length > 0) caseChanges = [...caseChanges, ...partiesDiff];
                logActivity(db, 'تعديل قضية', {
                    userName: _userName,
                    entity_type: 'case', entity_id: caseId, details: form.title || null,
                    case_name: form.title || null,
                    case_type: form.type || existingCaseRecord?.type || null,
                    client_name: clients.find((cl) => cl.id === payload.client_id)?.full_name || null,
                    changes: caseChanges,
                });
                // تحديث فوري للحالة المحلية — عشان الشاشة المفتوحة (CaseDetailView) تعرض القيم الجديدة فورًا
                // ⚠️ بنحدّث updated_at كمان من قيمة السيرفر الفعلية بعد الكتابة (writtenRow) —
                // من غيرها، أي تعديل تاني على نفس القضية بعد التعديل ده مباشرة كان
                // هيتكشف غلط كـ"تعارض" مع نفسه (لأن آخر updated_at محفوظة محليًا
                // كانت هتفضل القديمة من قبل الحفظ، مش الجديدة بعده).
                const freshFields = writtenRow?.updated_at ? { updated_at: writtenRow.updated_at } : {};
                setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, ...form, ...freshFields } : c));
                if (selectedCase?.id === caseId) setSelectedCase((p) => p ? { ...p, ...form, ...freshFields } : p);
                // إشعار تليجرام - تعديل قضية
                let updMsg = `✏️ <b>تم تعديل بيانات قضية</b>\n`;
                updMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
                updMsg += `📋 <b>رقم القيد:</b> ${escapeTelegramHtml(form.number || '—')}\n`;
                updMsg += `📌 <b>الموضوع:</b> ${escapeTelegramHtml(form.title)}\n`;
                updMsg += `🏛 <b>المحكمة:</b> ${escapeTelegramHtml(form.court || '—')}\n`;
                if (form.plaintiff) updMsg += `🟢 <b>الطرف الأول:</b> ${escapeTelegramHtml(form.plaintiff)}${form.plaintiff_role ? ' — ' + escapeTelegramHtml(form.plaintiff_role) : ''}\n`;
                if (form.defendant) updMsg += `🔴 <b>الطرف الثاني:</b> ${escapeTelegramHtml(form.defendant)}${form.defendant_role ? ' — ' + escapeTelegramHtml(form.defendant_role) : ''}\n`;
                if (form.date) updMsg += `📆 <b>الجلسة القادمة:</b> ${escapeTelegramHtml(form.date)}\n`;
                sendTelegram(updMsg);
                fetchCases(0, casesFilter);
            }
            updatingCaseGuard = false;
            setSavingCase(false);
            return true;
        } catch (e) {
            toast('❌ خطأ في الاتصال، تحقق من الإنترنت وأعد المحاولة', true);
            updatingCaseGuard = false;
            setSavingCase(false);
            return false;
        }
    };

    return { handleLogout, handleSaveCase, handleDeleteCase, handlePermanentDeleteCase, handleRestoreCase, handleUpdateCase };
}
