import { useState } from 'react';
import { db } from '../../../supabaseClient';
import { toast } from '../../../shared/lib/notifications';
import { showErrorToast } from '../../../shared/lib/errorReporting';
import { escapeTelegramHtml } from '../../../shared/lib/sanitize';
import { logActivity, recalcNextHearing as recalcNextHearingShared, buildFieldDiff, buildDeleteSnapshot, type FieldDiffMap } from '../../../shared/lib/dataAccess';
import type { ClientRow, ProfileRow, CaseSessionRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';
import type { EditingSessionForm } from '../case-detail/TimelineSection';

/**
 * منطق جلسات القضية (إضافة/تعديل/حذف + إعادة حساب next_hearing) — منقول
 * حرفيًا من useCaseDetailActions.ts (نفس المنطق تمامًا، صفر تغيير سلوك).
 * بعد أي إضافة/تعديل/حذف بينادي refetchAll() اللي هي fetchSessions المجمّعة
 * (سيشنز+ملاحظات+مستندات) بالظبط زي الأصل.
 */
export function useCaseSessions(
  caseData: MappedCase,
  client: ClientRow | null | undefined,
  profile: ProfileRow | null | undefined,
  onNotify: ((msg: string) => void | Promise<void>) | undefined,
  refetchAll: () => Promise<void> | void,
  // 🔧 FIX (طلب جيمي، 12 سبتمبر 2026): handleFinalJudgment/
  // handleDeleteFinalJudgment تحت بيحدّثوا cases.status فعليًا، لكن كانوا
  // مبيندوش onUpdate — بعكس handleChangeStatus في useCaseDetailActions.ts
  // اللي بينادي onUpdate?.(newStatus) بعد كل نجاح. onUpdate هي اللي بتحدّث
  // state القضايا في AppModals.tsx (selectedCase + قائمة cases + إعادة
  // فلترة/جلب القضايا)، فمن غيرها القضية كانت بتفضل في القسم القديم
  // (متداولة/منتهية) في الشاشة لحد ما المستخدم يخرج من ملف القضية ويعمل
  // ريفريش يدوي — رغم إن الداتابيز نفسها كانت متحدّثة صح من أول لحظة.
  onUpdate: ((newStatus: string) => void) | undefined
) {
  const [sessions, setSessions] = useState<CaseSessionRow[]>([]);
  // ⚠️ FIX (14 يوليو 2026): كان متوقع CaseSessionRow (شكل صف قاعدة البيانات
  // الخام)، لكن القيمة الفعلية اللي بتتحط هنا (في TimelineSection.tsx عند
  // بدء التعديل) شكلها EditingSessionForm المُطبَّع (date/location_floor/
  // location_hall...) مش (session_date/session_floor/session_hall...).
  const [editingSession, setEditingSession] = useState<EditingSessionForm | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [sessionUpdateTarget, setSessionUpdateTarget] = useState<CaseSessionRow | null>(null);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<{ id: string; date: string } | null>(null);
  // 🆕 (خطة إعادة تصميم إغلاق سلسلة الجلسات، مرحلة 4، 12 سبتمبر 2026):
  // الجلسة اللي المستخدم ضاغط عليها زرار "🏛️ الحكم النهائي" — بيفتح
  // `FinalJudgmentModal` (مرحلة 5) عليها. نفس نمط `sessionUpdateTarget`
  // بالظبط.
  const [finalJudgmentTarget, setFinalJudgmentTarget] = useState<CaseSessionRow | null>(null);
  // 🆕 (طلب "تعديل/حذف الحكم النهائي"، 12 سبتمبر 2026): تأكيد حذف/إلغاء
  // الحكم النهائي — نفس شكل confirmDeleteSession فوق ({id, date}), بس
  // بيستهدف إلغاء الحكم (مش حذف الجلسة نفسها).
  const [confirmDeleteJudgment, setConfirmDeleteJudgment] = useState<{ id: string; date: string } | null>(null);
  const [deletingJudgment, setDeletingJudgment] = useState(false);
  // 🆕 (طلب "إلغاء حجز النطق بالحكم قبل تسجيل أي حكم"، 12 سبتمبر 2026):
  // نفس نمط deletingSessionId (id بدل boolean عام) — عشان لو في أكتر من
  // زرار على الشاشة (نظريًا مش متوقع هنا لأنه بيظهر بس على آخر جلسة، لكن
  // بيفضل النمط متسق مع باقي الملف).
  const [cancelingReservationId, setCancelingReservationId] = useState<string | null>(null);

  // ── FIX (2.3): إعادة حساب next_hearing بشكل صحيح ──
  // ⚠️ قبل الإصلاح ده، next_hearing كان بيتحط عليه تاريخ أي جلسة تتضاف
  // مباشرة من غير أي مقارنة — لو المحامي سجّل جلسة قديمة بأثر رجعي
  // (لتوثيق نتيجة جلسة فاتت مثلاً)، next_hearing كان بيتلخبط ويصير
  // تاريخ ماضي رغم وجود جلسة قادمة فعلية مسجّلة قبل كده. كمان تعديل
  // أو حذف جلسة مكانش بيحدّث next_hearing إطلاقًا.
  // دلوقتي: بعد أي إضافة/تعديل/حذف جلسة، بنجيب كل جلسات القضية
  // ونحسب أقرب تاريخ فعلي >= اليوم، ونحدّث next_hearing بيه (أو null
  // لو مفيش جلسات قادمة خالص).
  const recalcNextHearing = (caseId: string) => recalcNextHearingShared(db, caseId);

  // 🗑️ FIX (خطة إعادة تصميم إغلاق سلسلة الجلسات، مرحلة 1، 12 سبتمبر 2026):
  // handleAddSession اتشالت نهائي من هنا — كانت بتنشئ جلسة جديدة INSERT
  // مباشر من غير أي ربط بالجلسة اللي قبلها (نتيجة/إجراء قادم اختياريين)،
  // بعكس handleUpdateSession/SessionUpdateModal اللي بيجبروا تسجيل نتيجة
  // الجلسة الحالية كجزء من نفس عملية إنشاء التالية. الطريقة الوحيدة
  // المتبقية لإنشاء جلسة جديدة على قضية هي "⚡ تحديث" (SessionUpdateModal).

  const handleDeleteSession = async (sessionId: string) => {
    // 🆕 المرحلة 6.5: __dbWrite بدل db.from(...).delete() المباشر.
    // `_offlineSessionCaseId` sentinel (بيتحذف قبل أي كتابة حقيقية، زي أي
    // sentinel تاني في offlineQueue.ts — DELETE أصلاً مبيستخدمش `data` في
    // التنفيذ الفعلي): غرضه الوحيد إن offlineQueue.ts يعرف بعد المزامنة
    // الفعلية إن next_hearing للقضية دي محتاج إعادة حساب (راجع
    // caseSessionCaseIdsToRecalc هناك).
    // ⚡ NEW (سجل النشاط — تغطية كاملة، 30 أغسطس 2026): بنلقط بيانات الجلسة
    // قبل الحذف — وبنبعتها كمان جوه data مع __dbWrite عشان لو الحذف اتقيّد
    // أوفلاين، تفضل متاحة وقت المزامنة (offlineSync.ts).
    const deletedSession = sessions.find((s) => s.id === sessionId);
    const { error, offline, queued } = await window.__dbWrite({
      type: 'DELETE', table: 'case_sessions', id: sessionId,
      data: {
        _offlineSessionCaseId: caseData.id,
        session_date: deletedSession?.session_date,
        session_hall: deletedSession?.session_hall,
      }
    });
    if (offline && queued) {
      toast('📥 الحذف محفوظ محلياً — سيُزامن عند عودة الإنترنت');
      return;
    }
    if (error) { showErrorToast('session_delete', error, 'فشل حذف الجلسة، حاول مرة أخرى', 'حذف جلسة قضية'); return; }
    // FIX (2.3): لو الجلسة المحذوفة كانت هي الأقرب، لازم next_hearing يتحدّث
    await recalcNextHearing(caseData.id);
    toast('🗑 تم حذف الجلسة');
    logActivity(db, 'حذف جلسة', {
      entity_type: 'session', entity_id: sessionId, details: caseData.title || null,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
      changes: buildDeleteSnapshot(deletedSession as unknown as Record<string, unknown>, {
        session_date: { label: 'تاريخ الجلسة' },
        session_hall: { label: 'القاعة' },
      }),
    });
    refetchAll();
  };

  const handleUpdateSession = async (sessionId: string, form: { date: string; time_period?: string; location_floor?: string; location_hall?: string; description?: string; result?: string; next_action?: string }) => {
    const session = sessions.find((s) => s.id === sessionId);
    // 🆕 المرحلة 6.5: __dbWrite بدل safeUpdate — بيحافظ على نفس فحص
    // التعارض (knownUpdatedAt) أونلاين، وكمان بيقيّد في طابور الأوفلاين لو
    // النت مقطوع (بعكس safeUpdate اللي كانت بترجع فشل صريح بس). نفس
    // `_offlineSessionCaseId` sentinel اللي في handleDeleteSession فوق —
    // بيتحذف قبل أي UPDATE حقيقي (stripOfflineSentinels)، غرضه بس تتبّع
    // القضية لإعادة حساب next_hearing بعد المزامنة.
    // ⚠️ تحسين إضافي عن السلوك القديم: safeUpdate كانت بترجع conflict من
    // غير أي toast خالص (سكوت تام). دلوقتي بقى فيه رسالة واضحة، بنفس نمط
    // handleUpdateNote في useCaseDetailActions.ts.
    const { error, offline, queued, conflict } = await window.__dbWrite({
      type: 'UPDATE', table: 'case_sessions', id: sessionId,
      data: {
        session_date: form.date,
        session_time: form.time_period || null,
        session_floor: form.location_floor || null,
        session_hall: form.location_hall || null,
        description: form.description || null,
        result: form.result || null,
        next_action: form.next_action || null,
        _offlineSessionCaseId: caseData.id,
      },
      knownUpdatedAt: session?.updated_at || null,
    });
    if (offline && queued) {
      toast('📥 التعديل محفوظ محلياً — سيُزامن عند عودة الإنترنت');
      return;
    }
    if (conflict) { toast('⚠️ هذه الجلسة عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة', true); return; }
    if (error) { showErrorToast('session_update', error, 'فشل تعديل بيانات الجلسة — تحقق من الاتصال وأعد المحاولة', 'تعديل جلسة قضية'); return; }
    // FIX (2.3): تاريخ الجلسة ممكن يكون اتغيّر، فلازم next_hearing يتحدّث معاه
    await recalcNextHearing(caseData.id);
    toast('✅ تم تعديل الجلسة');
    // ⚡ NEW (سجل النشاط — تتبع التغييرات، مرحلة 2، 19 أغسطس 2026):
    // مقارنة `session` (الكائن القديم، اتلقط فوق قبل __dbWrite) مع الحقول
    // الجديدة اللي فعلاً اتكتبت.
    const sessionFieldDiffMap: FieldDiffMap = {
      session_date: { label: 'تاريخ الجلسة' },
      session_time: { label: 'الفترة' },
      session_floor: { label: 'الطابق' },
      session_hall: { label: 'القاعة' },
      description: { label: 'الوصف' },
      result: { label: 'النتيجة' },
      next_action: { label: 'الإجراء التالي' },
    };
    const sessionChanges = buildFieldDiff(
      session as unknown as Record<string, unknown>,
      {
        session_date: form.date,
        session_time: form.time_period || null,
        session_floor: form.location_floor || null,
        session_hall: form.location_hall || null,
        description: form.description || null,
        result: form.result || null,
        next_action: form.next_action || null,
      },
      sessionFieldDiffMap
    );
    logActivity(db, 'تعديل جلسة', {
      entity_type: 'session', entity_id: sessionId, details: `${caseData.title} — ${form.date}`,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
      changes: sessionChanges,
    });
    if (onNotify) {
      let msg = `✏️ <b>تم تعديل جلسة</b>\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `⚖️ <b>${escapeTelegramHtml(caseData.title || '—')}</b>\n`;
      msg += `📋 رقم القيد: ${escapeTelegramHtml(caseData.number || '—')}\n`;
      msg += `🏛 المحكمة: ${escapeTelegramHtml(caseData.court || '—')}\n`;
      msg += `📆 <b>التاريخ الجديد:</b> ${escapeTelegramHtml(form.date)}`;
      if (form.time_period) msg += ` (${escapeTelegramHtml(form.time_period)})`;
      msg += `\n`;
      if (form.description) msg += `📝 ${escapeTelegramHtml(form.description)}\n`;
      onNotify(msg);
    }
    refetchAll();
  };

  // 🆕 (خطة إعادة تصميم إغلاق سلسلة الجلسات، مرحلة 6، 12 سبتمبر 2026):
  // منطق "🏛️ الحكم النهائي" — عملية واحدة تشمل:
  // 1. تحديث آخر جلسة (result = منطوق الحكم، session_date = تاريخ الحكم
  //    لو اختلف عن تاريخ الجلسة الأصلي).
  // 2. تحديث cases.status = 'منتهية'.
  // 3. recalcNextHearing — هترجع next_hearing = null تلقائيًا (مفيش جلسة
  //    قادمة بعد إقفال آخر جلسة، من غير أي حالة خاصة مطلوبة هنا).
  // 4. Toast نجاح + إشعار تيليجرام + سجل نشاط.
  // ⚠️ (فيكس atomicity، phase23): التحديثين (1+2) بقوا RPC ذرّية واحدة
  // (`record_final_judgment`) بدل كتابتين منفصلتين — راجع التعليق داخل
  // الدالة تحت. **الأوفلاين ممنوع بالكامل** لنفس سبب record_fee_payment
  // (RPC، مش عملية جدول واحد يقدر __dbWrite يقيّدها).
  const handleFinalJudgment = async (sessionId: string, judgmentDate: string, verdictText: string): Promise<{ ok: boolean }> => {
    const session = sessions.find((s) => s.id === sessionId);

    // 🔧 FIX (باگ atomicity — طلب جيمي، 12 سبتمبر 2026): تسجيل الحكم على
    // الجلسة + إغلاق القضية كانوا كتابتين منفصلتين عبر الشبكة (__dbWrite
    // مرتين). لو الكتابة التانية (cases.status) فشلت فشل حقيقي (خطأ DB
    // فعلي راجع من Supabase — مش استثناء اتلقط وقيّد أوفلاين) بعد ما
    // الأولى نجحت وخلصت، مكانش فيه أي rollback: الجلسة تفضل عليها منطوق
    // حكم والقضية تفضل "متداولة" — قضية معلّقة فعليًا في الداتابيز.
    // دلوقتي العمليتين بقوا جوه RPC واحدة (record_final_judgment) بتتنفذ
    // في transaction حقيقية — إما الاتنين ينجحوا مع بعض أو يترجعوا مع
    // بعض تلقائيًا (نفس نمط record_fee_payment/handleAddPayment بالظبط).
    // ⚠️ قرار عمل مصاحب (نفس سبب فرض أونلاين على تسجيل دفعة أتعاب — راجع
    // التعليق في src/lib/offlineQueue.ts سطر ٢٥-٣٣): __dbWrite/طابور
    // الأوفلاين بيدعمون بس INSERT/UPDATE/DELETE على جدول واحد، مش نداء
    // RPC متعدد الجداول. الحكم النهائي بقى ممنوع بالكامل أوفلاين (رسالة
    // صريحة) بدل ما نبني نسخة أوفلاين معقدة وترجعنا لمشكلة الـpartial-save
    // اللي الفيكس ده أصلاً بيقفلها.
    if (!navigator.onLine) {
      toast('⚠️ تسجيل الحكم النهائي يتطلب اتصالاً بالإنترنت — أعد المحاولة عند توفر الاتصال', true);
      return { ok: false };
    }

    const { error } = await db.rpc('record_final_judgment', {
      p_session_id: sessionId,
      p_case_id: caseData.id,
      p_verdict_text: verdictText,
      p_judgment_date: judgmentDate || null,
      p_known_session_updated_at: session?.updated_at || null,
      p_known_case_updated_at: caseData.updated_at || null,
    });
    if (error) {
      if (error.message === 'conflict:session' || error.message === 'conflict:case') {
        toast('⚠️ هذه الجلسة أو القضية عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة', true);
        return { ok: false };
      }
      showErrorToast('final_judgment', error, 'فشل تسجيل الحكم النهائي', 'الحكم النهائي');
      return { ok: false };
    }
    // 🔧 FIX: نفس نمط handleChangeStatus — بنبلّغ الشاشة الأب فورًا إن
    // حالة القضية بقت "منتهية"، عشان القضية تتنقل لقسم "منتهية" في الحال
    // من غير خروج/ريفريش يدوي.
    onUpdate?.('منتهية');

    await recalcNextHearing(caseData.id);
    toast('✅ تم تسجيل الحكم النهائي وإغلاق القضية');

    logActivity(db, 'حكم نهائي', {
      entity_type: 'case', entity_id: caseData.id, details: `${caseData.title} — ${verdictText}`,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
      changes: buildFieldDiff(
        { status: caseData.status },
        { status: 'منتهية' },
        { status: { label: 'الحالة' } }
      ),
    });

    if (onNotify) {
      let msg = `🏛️ <b>حكم نهائي</b>\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `⚖️ <b>${escapeTelegramHtml(caseData.title || '—')}</b>\n`;
      msg += `📋 رقم القيد: ${escapeTelegramHtml(caseData.number || '—')}\n`;
      msg += `🏛 المحكمة: ${escapeTelegramHtml(caseData.court || '—')}\n`;
      msg += `📆 تاريخ الحكم: ${escapeTelegramHtml(judgmentDate)}\n`;
      msg += `📜 المنطوق: ${escapeTelegramHtml(verdictText)}\n`;
      onNotify(msg);
    }

    refetchAll();
    return { ok: true };
  };

  // 🆕 (طلب "تعديل/حذف الحكم النهائي"، 12 سبتمبر 2026): إلغاء الحكم
  // النهائي المسجّل على آخر جلسة — عكس handleFinalJudgment بالظبط:
  // 1. تصفير result + is_judgment_reserved على نفس الجلسة (الحكم بيتشال
  //    خالص، مش مجرد إخفاء — لو المستخدم عايز يسجّل حكم تاني بعدين، لازم
  //    يفعّل التوجل من جديد من SessionUpdateModal).
  // 2. رجوع cases.status لـ"نشطة" (قسم "متداولة" في CasesTab.tsx).
  // 3. recalcNextHearing — بيتحسب طبيعي من الجلسات الموجودة فعليًا (نفس
  //    آخر جلسة مسجّلة، زي ما اتطلب — الدالة المشتركة أصلاً بتحسب من كل
  //    الجلسات، مفيش داعي لمنطق خاص إضافي هنا).
  // ⚠️ (فيكس atomicity، phase23): نفس نمط handleFinalJudgment — RPC ذرّية
  // واحدة (`undo_final_judgment`)، والأوفلاين ممنوع بالكامل لنفس السبب.
  const handleDeleteFinalJudgment = async (sessionId: string) => {
    setDeletingJudgment(true);
    const session = sessions.find((s) => s.id === sessionId);

    // 🔧 FIX (نفس باگ atomicity في handleFinalJudgment بالظبط، طلب جيمي
    // 12 سبتمبر 2026): كانت كتابتين منفصلتين (تصفير الحكم على الجلسة، ثم
    // رجوع cases.status لـ"نشطة") من غير أي rollback لو التانية فشلت فشل
    // حقيقي بعد نجاح الأولى — كانت تنتج قضية "منتهية" من غير أي حكم مسجّل
    // على آخر جلستها. دلوقتي RPC واحدة (undo_final_judgment) بنفس منطق
    // record_final_judgment — راجع التعليق هناك للتفصيل الكامل.
    if (!navigator.onLine) {
      setDeletingJudgment(false);
      toast('⚠️ إلغاء الحكم النهائي يتطلب اتصالاً بالإنترنت — أعد المحاولة عند توفر الاتصال', true);
      return;
    }

    const { error } = await db.rpc('undo_final_judgment', {
      p_session_id: sessionId,
      p_case_id: caseData.id,
      p_known_session_updated_at: session?.updated_at || null,
      p_known_case_updated_at: caseData.updated_at || null,
    });
    if (error) {
      setDeletingJudgment(false);
      if (error.message === 'conflict:session' || error.message === 'conflict:case') {
        toast('⚠️ هذه الجلسة أو القضية عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة', true);
        return;
      }
      showErrorToast('undo_final_judgment', error, 'فشل إلغاء الحكم النهائي', 'إلغاء الحكم النهائي');
      return;
    }
    // 🔧 FIX: القضية رجعت "نشطة"، فلازم الشاشة الأب تعرف فورًا عشان
    // القضية ترجع لقسم "متداولة" في الحال.
    onUpdate?.('نشطة');

    setDeletingJudgment(false);

    await recalcNextHearing(caseData.id);
    toast('↩️ تم إلغاء الحكم النهائي، والقضية رجعت للقضايا المتداولة');

    logActivity(db, 'إلغاء حكم نهائي', {
      entity_type: 'case', entity_id: caseData.id, details: caseData.title || null,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
      changes: buildFieldDiff(
        { status: caseData.status },
        { status: 'نشطة' },
        { status: { label: 'الحالة' } }
      ),
    });

    if (onNotify) {
      let msg = `↩️ <b>إلغاء حكم نهائي</b>\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `⚖️ <b>${escapeTelegramHtml(caseData.title || '—')}</b>\n`;
      msg += `📋 رقم القيد: ${escapeTelegramHtml(caseData.number || '—')}\n`;
      msg += `القضية رجعت "متداولة".\n`;
      onNotify(msg);
    }

    refetchAll();
  };

  // 🆕 (طلب "إلغاء حجز النطق بالحكم قبل تسجيل أي حكم"، 12 سبتمبر 2026):
  // سيناريو مختلف تمامًا عن handleDeleteFinalJudgment فوق: هنا الجلسة
  // "محجوزة للحكم" (is_judgment_reserved === true) بس لسه محصلش أي حكم
  // فعلي (نهائي/تمهيدي) اتسجّل عليها — القضية أصلاً لسه "متداولة"، ومحدش
  // غيّر cases.status. الحجز ده ممكن يكون اتحط غلط (مثلاً toggle في
  // SessionUpdateModal اتفعّل بالغلط)، أو المستخدم غيّر رأيه وعايز الجلسة
  // ترجع عادية بدل ما يضطر يمر بمسار "🏛️ النطق بالحكم" (نهائي/تمهيدي/
  // تأجيل) وكلهم بيفترضوا إنه فعلاً عايز يسجّل حكم من نوع ما.
  // **الفرق الجوهري عن handleDeleteFinalJudgment:** كتابة واحدة بس على
  // الجلسة (تصفير is_judgment_reserved)، من غير أي لمس لـcases.status —
  // لأنه أصلاً محتاجش يترجّع لحاجة، القضية متأثرتش من الأول. بمجرد ما
  // الفلاج يرجع false، شروط إظهار زراير ✏️/🗑️/⚡ في TimelineSection.tsx
  // (s.is_judgment_reserved !== true) بتتفعّل لوحدها من غير أي كود إضافي.
  const handleCancelJudgmentReservation = async (sessionId: string) => {
    setCancelingReservationId(sessionId);
    const session = sessions.find((s) => s.id === sessionId);

    const result = await window.__dbWrite({
      type: 'UPDATE',
      table: 'case_sessions',
      id: sessionId,
      data: { is_judgment_reserved: false },
      knownUpdatedAt: session?.updated_at || null,
    });
    setCancelingReservationId(null);

    if (result.conflict) { toast('⚠️ هذه الجلسة عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة', true); return; }
    if (result.error && !result.offline) { toast('❌ فشل إلغاء حجز النطق بالحكم، حاول مرة أخرى', true); return; }

    if (result.offline && result.queued) {
      toast('📥 تم حفظ إلغاء الحجز محليًا — سيُزامن عند عودة الإنترنت');
      refetchAll();
      return;
    }

    toast('↩️ تم إلغاء حجز النطق بالحكم');

    logActivity(db, 'إلغاء حجز النطق بالحكم', {
      entity_type: 'session', entity_id: sessionId, details: caseData.title || null,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
    });

    refetchAll();
  };

  // 🆕 (خطة إعادة تصميم مودال "النطق بالحكم"، بند 15، 12 سبتمبر 2026):
  // مسار "حكم تمهيدي/جزئي" — بيعيد استخدام نفس آلية "⚡ تحديث"
  // (SessionUpdateModal.handleSave): تحديث آخر جلسة (تسجيل المنطوق +
  // judgment_type='تمهيدي') + إنشاء جلسة جديدة عادية بنفس بيانات الموقع/
  // المحكمة، بفرق واحد عن SessionUpdateModal: الجلسة الجديدة هنا بتتعمل
  // بـis_judgment_reserved=false دايمًا (بدل توريث القيمة القديمة اللي
  // هنا أصلاً true) — عشان القضية تفضل "متداولة" وكأنها محصلش فيها حكم،
  // زي ما اتفق عليه بالظبط. مفيش تعديل على cases.status هنا (بعكس
  // handleFinalJudgment فوق).
  // ⚠️ الدالة دي مقصورة على القضايا الحقيقية بس (FinalJudgmentModal
  // بيتفتح من CaseDetailView.tsx بس، caseData.id دايمًا موجود) — صفر
  // منطق isStandalone هنا (بعكس SessionUpdateModal اللي بيغطي الجلسات
  // المستقلة كمان).
  // ⚠️ (فيكس atomicity، phase24): نفس فئة الباگ اللي كانت في
  // handleFinalJudgment (phase23) — كانت كتابتين منفصلتين عبر الشبكة
  // (UPDATE على الجلسة الحالية + INSERT للجلسة القادمة) من غير أي
  // transaction تجمعهم. خطورتها كانت أقل بكتير (مفيش لمس لـcases.status،
  // وأسوأ حالة = جلسة قادمة ناقصة مش بيانات تالفة، والكود القديم كان
  // بيبلّغ بتوست دقيق) — لكن اتقفلت برضو للاتساق مع handleFinalJudgment.
  // دلوقتي العمليتين بقوا جوه RPC واحدة (record_preliminary_judgment)
  // بتتنفذ في transaction حقيقية — راجع التعليق داخل ملف الـRPC للتفصيل
  // الكامل. **الأوفلاين ممنوع بالكامل** لنفس سبب handleFinalJudgment
  // (RPC، مش عملية جدول واحد يقدر __dbWrite يقيّدها).
  const handlePreliminaryJudgment = async (
    sessionId: string,
    verdictText: string,
    nextSessionDate: string
  ): Promise<{ ok: boolean }> => {
    const session = sessions.find((s) => s.id === sessionId);

    if (!navigator.onLine) {
      toast('⚠️ تسجيل الحكم التمهيدي يتطلب اتصالاً بالإنترنت — أعد المحاولة عند توفر الاتصال', true);
      return { ok: false };
    }

    const { error } = await db.rpc('record_preliminary_judgment', {
      p_session_id: sessionId,
      p_case_id: caseData.id,
      p_verdict_text: verdictText,
      p_next_session_date: nextSessionDate,
      p_known_session_updated_at: session?.updated_at || null,
    });
    if (error) {
      if (error.message === 'conflict:session') {
        toast('⚠️ هذه الجلسة عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة', true);
        return { ok: false };
      }
      showErrorToast('preliminary_judgment', error, 'فشل تسجيل الحكم التمهيدي', 'حكم تمهيدي');
      return { ok: false };
    }

    await recalcNextHearing(caseData.id);
    toast('⚖️ تم تسجيل الحكم التمهيدي وجدولة الجلسة القادمة');

    logActivity(db, 'حكم تمهيدي', {
      entity_type: 'session', entity_id: sessionId, details: `${caseData.title || ''} — ${verdictText}`,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
    });

    if (onNotify) {
      let msg = `⚖️ <b>حكم تمهيدي/جزئي</b>\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `⚖️ <b>${escapeTelegramHtml(caseData.title || '—')}</b>\n`;
      msg += `📋 رقم القيد: ${escapeTelegramHtml(caseData.number || '—')}\n`;
      msg += `📜 المنطوق: ${escapeTelegramHtml(verdictText)}\n`;
      msg += `📆 الجلسة القادمة: ${escapeTelegramHtml(nextSessionDate)}\n`;
      onNotify(msg);
    }

    refetchAll();
    return { ok: true };
  };

  // 🆕 (خطة إعادة تصميم مودال "النطق بالحكم"، بند 16، 12 سبتمبر 2026):
  // مسار "تأجيل النطق بالحكم" — من غير أي منطوق حكم بيتسجل، بس إنشاء
  // جلسة جديدة بنفس بيانات الموقع/المحكمة، والجلسة الجديدة تفضل
  // is_judgment_reserved=true (عشان تفضل "محجوزة للحكم"، وزرار "🏛️"
  // يفضل ظاهر عليها).
  // ⚠️ فيكس atomicity + باگ حقيقي (بند 26، اكتُشف بالاختبار اليدوي —
  // المرحلة 10، اختبار 5، 12 سبتمبر 2026): كانت بتعمل INSERT واحد بس
  // عبر __dbWrite من غير ما تلمس الجلسة القديمة خالص — فالجلسة القديمة
  // كانت بتفضل is_judgment_reserved=true للأبد، حتى بعد ما تبقى مش آخر
  // جلسة (باگ حقيقي، مش بس atomicity). نفس نمط record_preliminary_judgment
  // (phase24) بالظبط دلوقتي: RPC ذرّية واحدة (record_judgment_postponement)
  // بتصفّر is_judgment_reserved على الجلسة القديمة + تعمل INSERT الجديدة
  // في transaction واحدة — راجع
  // database/migrations/sql-migrations-phase26/01-postpone-judgment-atomic-rpc.sql.
  // نفس قرار phase23/24: ممنوع بالكامل أوفلاين (RPC متعدد لا يدعمه طابور
  // __dbWrite أصلاً).
  const handlePostponeJudgment = async (
    sessionId: string,
    nextSessionDate: string
  ): Promise<{ ok: boolean }> => {
    const session = sessions.find((s) => s.id === sessionId);

    if (!navigator.onLine) {
      toast('⚠️ تأجيل النطق بالحكم يتطلب اتصالاً بالإنترنت — أعد المحاولة عند توفر الاتصال', true);
      return { ok: false };
    }

    const { error } = await db.rpc('record_judgment_postponement', {
      p_session_id: sessionId,
      p_case_id: caseData.id,
      p_next_session_date: nextSessionDate,
      p_known_session_updated_at: session?.updated_at || null,
    });
    if (error) {
      if (error.message === 'conflict:session') {
        toast('⚠️ هذه الجلسة عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة', true);
        return { ok: false };
      }
      showErrorToast('postpone_judgment_next_session', error, 'فشل تأجيل النطق بالحكم', 'تأجيل النطق بالحكم');
      return { ok: false };
    }

    await recalcNextHearing(caseData.id);
    toast('⏳ تم تأجيل النطق بالحكم للجلسة القادمة');

    logActivity(db, 'تأجيل نطق بالحكم', {
      entity_type: 'session', entity_id: sessionId, details: caseData.title || null,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
    });

    if (onNotify) {
      let msg = `⏳ <b>تأجيل النطق بالحكم</b>\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `⚖️ <b>${escapeTelegramHtml(caseData.title || '—')}</b>\n`;
      msg += `📋 رقم القيد: ${escapeTelegramHtml(caseData.number || '—')}\n`;
      msg += `📆 جلسة النطق بالحكم الجديدة: ${escapeTelegramHtml(nextSessionDate)}\n`;
      onNotify(msg);
    }

    refetchAll();
    return { ok: true };
  };

  return {
    sessions, setSessions,
    editingSession, setEditingSession,
    deletingSessionId, setDeletingSessionId,
    sessionUpdateTarget, setSessionUpdateTarget,
    finalJudgmentTarget, setFinalJudgmentTarget,
    confirmDeleteSession, setConfirmDeleteSession,
    confirmDeleteJudgment, setConfirmDeleteJudgment,
    deletingJudgment,
    cancelingReservationId,
    handleUpdateSession, handleDeleteSession, handleFinalJudgment, handleDeleteFinalJudgment,
    handleCancelJudgmentReservation,
    handlePreliminaryJudgment, handlePostponeJudgment,
    recalcNextHearing,
  };
}
