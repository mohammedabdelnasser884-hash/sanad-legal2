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
  refetchAll: () => Promise<void> | void
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

  return {
    sessions, setSessions,
    editingSession, setEditingSession,
    deletingSessionId, setDeletingSessionId,
    sessionUpdateTarget, setSessionUpdateTarget,
    finalJudgmentTarget, setFinalJudgmentTarget,
    confirmDeleteSession, setConfirmDeleteSession,
    handleUpdateSession, handleDeleteSession,
    recalcNextHearing,
  };
}
