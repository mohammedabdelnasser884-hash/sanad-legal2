import React, { useState, useCallback } from 'react';
import { toast } from '../../../../shared/lib/notifications';
import { showErrorToast } from '../../../../shared/lib/errorReporting';
import { logActivity } from '../../../../shared/lib/dataAccess';
import { db } from '../../../../supabaseClient';
import { formatArDate } from '../../../../shared/ui/arabicLocale';
import type { ProfileRow, BackupRow } from '../../../../types';
import type { Database, Json } from '../../../../database.types';

// شكل الـ JSON المخزّن فعليًا في عمود backups.data (النوع الحقيقي في قاعدة
// البيانات هو Json عام، فالواجهة دي بتوصف الشكل الفعلي اللي بيتبني بيه
// جوه handleCreateBackup وبيتقرا بيه جوه handleRestoreBackup، من غير أي تغيير).
export interface BackupSnapshot {
  version: string;
  created_at: string;
  tables: Record<string, unknown[]>;
}

// ── ضغط الـ snapshot قبل الحفظ في backups.data (3 سبتمبر 2026) ──
// المشكلة: مع تراكم بيانات المكتب، حجم الـ JSON الكامل (كل الجداول) بيكبر —
// آخر نسخة كانت ~1.5 ميجا/2877 صف — والحفظ بيبعته كتلة واحدة (طلب واحد)
// لقاعدة البيانات. على شبكة موبايل بطيئة/متذبذبة، الطلب الكبير ده كان
// بيفشل بـ "TypeError: Failed to fetch" (خطأ شبكة خام، مش استثناء من
// Supabase نفسه) عند آخر خطوة بالظبط (بعد ما التصدير كله نجح ووصل 92%).
// الحل: نضغط الـ JSON بصيغة gzip قبل الحفظ (عبر CompressionStream المدمجة
// في المتصفح، من غير أي مكتبة خارجية جديدة) — بيقلل حجم الطلب بشكل كبير
// لبيانات نصية عربية متكررة زي دي، وبالتالي بيقلل احتمال فشل الشبكة.
// متوافق للخلف: النسخ القديمة المخزّنة قبل التعديل ده (من غير علامة
// __compressed) بتتقرا زي ما هي عادي، بدون أي تحويل.
interface CompressedBackupPayload {
  __compressed: true;
  version: string;
  created_at: string;
  gzip_b64: string;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000; // تجنب تجاوز حد آرجيومنتس String.fromCharCode.apply مع مصفوفات كبيرة
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function readAllChunks(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { result.set(c, offset); offset += c.length; }
  return result;
}

// بيرجع snapshot مضغوط لو المتصفح بيدعم CompressionStream، وإلا بيرجع
// الـ snapshot الخام زي ما هو (fallback آمن — نفس السلوك القديم قبل التعديل).
async function compressSnapshotForStorage(snapshot: BackupSnapshot): Promise<BackupSnapshot | CompressedBackupPayload> {
  if (typeof CompressionStream === 'undefined') return snapshot;
  try {
    const json = JSON.stringify(snapshot);
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    void writer.write(new TextEncoder().encode(json));
    void writer.close();
    const compressedBytes = await readAllChunks(cs.readable);
    return {
      __compressed: true,
      version: snapshot.version,
      created_at: snapshot.created_at,
      gzip_b64: uint8ToBase64(compressedBytes),
    };
  } catch (e) {
    return snapshot; // أي فشل في الضغط نفسه (مش شبكة) — نرجع للسلوك القديم بدل ما نوقف الباك أب كله
  }
}

// بيفك ضغط أي شكل مخزّن (مضغوط أو خام قديم) ويرجع BackupSnapshot صالح، أو
// null لو الشكل مش معروف/فشل الفك (نتعامل معاه كخطأ قراءة في الاستدعاء).
async function decompressStoredBackupData(raw: unknown): Promise<BackupSnapshot | null> {
  if (!raw || typeof raw !== 'object') return null;
  if ((raw as { __compressed?: unknown }).__compressed === true) {
    const payload = raw as CompressedBackupPayload;
    try {
      const bytes = base64ToUint8(payload.gzip_b64);
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      // ⚠️ كاست ضروري هنا: type lib.dom.d.ts الحديث بيخصّص Uint8Array بـ
      // generic (Uint8Array<ArrayBufferLike>)، وbase64ToUint8 بيرجّع نسخة
      // مش مضمون TypeScript إنها Uint8Array<ArrayBuffer> تحديدًا (رغم إنها
      // فعليًا كذلك وقت التشغيل — atob مبيرجعش SharedArrayBuffer أبدًا)،
      // فـ BufferSource بيرفضها structurally. كاست type-only، من غير أي
      // تغيير في السلوك الفعلي وقت التشغيل.
      void writer.write(bytes as unknown as BufferSource);
      void writer.close();
      const decompressedBytes = await readAllChunks(ds.readable);
      const json = new TextDecoder().decode(decompressedBytes);
      return JSON.parse(json) as BackupSnapshot;
    } catch (e) {
      return null;
    }
  }
  return raw as BackupSnapshot;
}

// بيعيد محاولة حفظ الباك أب مرة إضافية لو الطلب الأول فشل بخطأ شبكة خام
// (استثناء، مش رد فيه error من Supabase نفسه) — بعد فاصل قصير، عشان
// نتحمّل انقطاعة شبكة عابرة (زي اللي كانت بتحصل عند 92% على شبكة موبايل).
async function insertBackupWithRetry(
  payload: Database['public']['Tables']['backups']['Insert'],
  maxAttempts = 2,
): Promise<{ error: unknown }> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { error } = await db.from('backups').insert([payload]);
      return { error };
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }
  throw lastErr;
}

// ── نسخة شكل الـ snapshot الحالية (نفس القيمة المستخدمة في handleCreateBackup) —
// بنستخدمها للتحقق من ملف مرفوع من الجهاز: لو الرقم الرئيسي (قبل النقطة) مختلف،
// يبقى شكل الجداول ممكن يكون اتغيّر من ساعتها (عمود اتضاف/اتشال)، فبنحذّر
// المستخدم بدل ما نستعيد بصمت على أساس افتراضات ممكن تبقى غلط.
const CURRENT_SNAPSHOT_VERSION = '1.1';
const CURRENT_SNAPSHOT_MAJOR = CURRENT_SNAPSHOT_VERSION.split('.')[0];

// ── حجم الصفحة لجلب كل صفوف الجدول عند التصدير (تجنب حد الـ 1000 صف الافتراضي في Supabase) ──
const FETCH_PAGE_SIZE = 1000;
// ── حجم الدفعة عند إعادة الإدخال وقت الاستعادة (تجنب حمولة request ضخمة دفعة واحدة) ──
const INSERT_CHUNK_SIZE = 500;

// ── جدول الجداول اللي بيغطيها الباك أب، بترتيب الإدخال (الآباء الأول) ──
// case_parties اتضافت بعد case_sessions (مرحلة 12 من خطة تعدد الأطراف —
// الجدول ده بيرجع لـ cases/case_sessions الاتنين، فلازم ييجي بعد الاتنين).
const BACKUP_TABLES: BackupTableName[] = ['clients','cases','case_sessions','case_parties','case_fees','fee_payments','case_documents','reminders','client_portal_pins','activity_log'];

// ── نفس الجداول لكن بترتيب الحذف (الأبناء الأول، عشان القيود الأجنبية) ──
// ⚠️ profiles و activity_log مُستثناتان عمداً من الحذف (upsert فقط) — انظر التعليق في handleRestoreBackup
// case_parties محطوطة الأول في ترتيب الحذف: معندهاش أي جدول بيرجعلها بـ FK
// (مفيش ابن ليها)، وهي نفسها بترجع لـ cases/case_sessions/clients (CASCADE/SET NULL) —
// فحذفها الأول آمن ومتوافق مع فلسفة "الأبناء الأول" هنا.
const RESTORE_DELETE_ORDER: BackupTableName[] = ['case_parties','fee_payments','case_fees','case_documents','case_sessions','reminders','client_portal_pins','cases','clients'];
// case_parties بعد case_sessions في ترتيب الإدخال لنفس السبب (بترجع لـ cases و
// case_sessions الاتنين عن طريق case_id/session_id، فلازم الاتنين يكونوا موجودين قبلها).
const RESTORE_INSERT_ORDER: BackupTableName[] = ['clients','cases','case_sessions','case_parties','case_fees','fee_payments','case_documents','reminders','client_portal_pins'];

// ── الجداول الحقيقية الوحيدة اللي البك أب/الاستعادة بيلفوا عليها فعليًا ──
// (نفس محتوى BACKUP_TABLES/RESTORE_*_ORDER + 'profiles'/'activity_log'
// المُضافين لاحقًا في handleCreateBackup/handleRestoreBackup) — union حقيقي
// من أسماء الجداول، بدل string عام.
type BackupTableName =
  | 'clients' | 'cases' | 'case_sessions' | 'case_parties' | 'case_fees' | 'fee_payments'
  | 'case_documents' | 'reminders' | 'client_portal_pins' | 'activity_log'
  | 'profiles';

// اسم الجدول بقى Generic مقيّد بـ BackupTableName — supabase-js بيتحقق منه
// وقت الكتابة زي أي `.from()` تاني (مفيش `as any` على اختيار الجدول خالص).
// الجزء اللي لسه محتاج كاست هو شكل الصفوف نفسها (rows: unknown[])، مش اسم
// الجدول: صفوف الـ backup راجعة من JSON مخزّن (BackupSnapshot.tables)، شكلها
// الفعلي مش معروف وقت الكتابة (ملف قديم يمكن يكون بشكل مختلف شوية عن
// database.types.ts الحالي)، فده تفاوت حقيقي مش كسل — بنسيبه `unknown[]`
// في fetchAllRows واستدعاءات insert/upsert تحت، ومسؤولية الشكل الصحيح
// بتتحمّلها قاعدة البيانات نفسها (RLS + قيود الأعمدة) وقت التنفيذ.
function dynFrom<T extends BackupTableName>(table: T) {
  return db.from(table);
}

// ⚠️ دالة عادية (مش method reference) بس عشان نقدر ناخد ReturnType بتاعها —
// `typeof db.from<'clients'>` مش صالح لأن db.from method عام (generic method)
// مش دالة مستقلة، فـ TypeScript مش بيقدر يستنتج الـ generic instantiation من
// مجرد الإشارة ليها من غير نداء. الدالة دي بس عشان النوع، مش بتتنادى فعليًا.
function _typedClientsFrom() {
  return db.from('clients');
}

// ── جلب كل صفوف جدول بالكامل عبر صفحات (بدل select('*') وحيد قد يُقتطع بصمت) ──
async function fetchAllRows(table: BackupTableName, columns: string): Promise<unknown[]> {
  let all: unknown[] = [];
  let from = 0;
  while (true) {
    const to = from + FETCH_PAGE_SIZE - 1;
    const { data, error } = await dynFrom(table).select(columns).range(from, to);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }
  return all;
}

// ── شكل نسخة مرفوعة من الجهاز، لسه معلّقة قبل تأكيد المستخدم ──
// (نفس بيانات BackupSnapshot لكن مع اسم الملف الأصلي بدل معرّف backups.id،
// لأنها لسه مش صف في قاعدة البيانات).
export interface PendingFileRestore {
  fileName: string;
  snapshot: BackupSnapshot;
  rowsCount: number;
  sizeKb: number;
  // true لو النسخة المرفوعة رقمها الرئيسي (major) مختلف عن نسخة الشكل الحالية —
  // مش مانع للاستعادة، بس بيتعرض كتحذير في مودال التأكيد (راجع CURRENT_SNAPSHOT_MAJOR)
  versionMismatch: boolean;
}

export function useAdminBackup(profile?: ProfileRow | null) {
  const _userName = profile?.full_name || null;
  const tenantId = profile?.tenant_id ?? null;
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupProgress, setBackupProgress] = useState('');
  // نسبة تقدم رقمية (0-100) — حساب بسيط: خطوة/إجمالي الخطوات (جداول)، مش حجم البيانات
  const [backupProgressPercent, setBackupProgressPercent] = useState(0);
  const [confirmRestore, setConfirmRestore] = useState<BackupRow | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [restoreProgressPercent, setRestoreProgressPercent] = useState(0);
  // ── رفع نسخة من الجهاز ──
  const [pendingFileRestore, setPendingFileRestore] = useState<PendingFileRestore | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // 🔒 FIX (تشخيص لوجز CI — 4 أغسطس 2026): كانت بتعمل select('*') وده
  // بيجيب عمود data كمان (اللي فيه نسخة JSON كاملة من كل جداول المكتب —
  // ممكن يكون ميجابايتات لكل صف). مع تراكم صفوف backups بمرور الوقت (الجدول
  // ده مش متضمن في أي تنظيف دوري)، الكويري البسيطة دي بقت بتاخد وقت طويل
  // كفاية إنها تضرب statement timeout في بوستجرس (راجع "canceling statement
  // due to statement timeout" في Supabase logs) — مجرد عرض قائمة النسخ كان
  // بيجر كل بيانات كل نسخة من غير أي داعي. الحل: القايمة بتجيب الأعمدة
  // الخفيفة بس (من غير data)، وأي عملية محتاجة المحتوى الكامل (تنزيل/استعادة)
  // بتجيبه لوحده بصف واحد وقت الحاجة الفعلية (راجع handleDownloadBackup/
  // handleRestoreBackup تحت).
  const fetchBackups = useCallback(async () => {
    setLoadingBackups(true);
    const { data } = await db.from('backups')
      .select('id,created_at,created_by,created_by_name,tables_count,rows_count,size_kb')
      .order('created_at', { ascending: false }).limit(20);
    if (data) setBackups(data as unknown as BackupRow[]);
    setLoadingBackups(false);
  }, []);

  // ── إنشاء نسخة احتياطية ──
  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    setBackupProgressPercent(0);
    // profiles بتتضاف بعد الحلقة (مش فيها paging؛ حسابات المكتب عادة قليلة العدد نسبياً ومش محتاجة صفحات)
    const tables: BackupTableName[] = [...BACKUP_TABLES, 'profiles'];
    // +1 عشان خطوة "الحفظ" الأخيرة بعد التصدير (راجع setBackupProgress('جاري الحفظ...') تحت)
    const totalSteps = tables.length + 1;
    let completedSteps = 0;
    const snapshot: BackupSnapshot = { version: CURRENT_SNAPSHOT_VERSION, created_at: new Date().toISOString(), tables: {} };

    // client_portal_pins فيها عمود pin القديم (نص صريح، لسه موجود لحد
    // ما يتحذف نهائيًا من قاعدة البيانات) — النسخة الاحتياطية لازم
    // تستثنيه صراحةً عشان ملف الباك أب ميبقاش فيه أي PIN كنص واضح،
    // حتى لو الجدول نفسه لسه فيه العمود القديم.
    const columnOverrides: Record<string, string> = {
      client_portal_pins: 'id,client_id,pin_hash,is_active,client_name,email',
    };

    let incomplete = false;
    for (const table of tables) {
      setBackupProgress('جاري تصدير: ' + table + '...');
      try {
        const rows = await fetchAllRows(table, columnOverrides[table] || '*');
        snapshot.tables[table] = rows;
      } catch (e) {
        snapshot.tables[table] = [];
        incomplete = true;
      }
      completedSteps++;
      setBackupProgressPercent(Math.round((completedSteps / totalSteps) * 100));
    }

    setBackupProgress('جاري الحفظ...');
    let totalRows = 0;
    let sizeKb = 0;
    let error: unknown = null;
    try {
      totalRows = Object.values(snapshot.tables).reduce((s: number, t: unknown[])=>s+t.length, 0);
      // sizeKb بيفضل بيمثّل الحجم المنطقي (قبل الضغط) — ده اللي المستخدم بيفهمه
      // كـ"حجم النسخة"، مش حجم النقل الفعلي بعد الضغط.
      sizeKb = Math.round(JSON.stringify(snapshot).length / 1024);
      const storedData = await compressSnapshotForStorage(snapshot);

      ({ error } = await insertBackupWithRetry({
        created_by: profile?.id,
        created_by_name: profile?.full_name || 'مدير',
        tables_count: tables.length,
        rows_count: totalRows,
        size_kb: sizeKb,
        // كاست type-only ضروري: BackupSnapshot/CompressedBackupPayload معرّفين
        // بـ interface بخصائص مسمّاة (من غير index signature صريح)، وعمود
        // data الحقيقي في قاعدة البيانات نوعه Json عام (مطلوب index signature) —
        // نفس الفجوة النوعية الموصوفة فوق BackupSnapshot، القيمة الفعلية وقت
        // التشغيل JSON سليم 100% في الحالتين (مضغوطة أو خام).
        data: storedData as unknown as Json,
      }));
    } catch (e) {
      // ✅ تشخيص فشل admin-backup (26 يوليو 2026): اتأكد إن السبب كان وقت
      // العملية (تصدير + حفظ كل جداول المكتب بالتسلسل على بيانات production
      // حقيقية) بياخد وقت أطول من مهلة التست القديمة، مش استثناء حقيقي —
      // راجع e2e/admin-backup.spec.ts (مهلة expectToast اتزودت لـ30 ثانية).
      setCreatingBackup(false);
      setBackupProgress('');
      showErrorToast(
        'admin_backup_create',
        e,
        'تعذّر إنشاء النسخة الاحتياطية. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.',
        'إنشاء نسخة احتياطية',
      );
      return;
    }

    completedSteps++;
    setBackupProgressPercent(Math.round((completedSteps / totalSteps) * 100));
    setCreatingBackup(false);
    setBackupProgress('');
    // 🔎 FIX (تشخيص لوجز E2E — 26 أغسطس 2026): هذا الفرع (`error` من
    // نتيجة insert نفسها، مش استثناء) كان بيعرض توست عام بس من غير أي
    // تسجيل للسبب الحقيقي (رفض RLS/قيد قاعدة بيانات/إلخ) — يعني أي فشل
    // فعلي هنا كان عمره ما هيظهر في recordError/systemHealth، فكل تشخيص
    // مستقبلي كان هيقف عند "فشل" من غير سبب. توحيد مع نفس نمط فرع
    // catch فوقه (showErrorToast) عشان الخطأ الخام يتسجل فعليًا.
    if (error) {
      showErrorToast(
        'admin_backup_create',
        error,
        'تعذّر حفظ النسخة الاحتياطية. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.',
        'إنشاء نسخة احتياطية',
      );
      return;
    }
    toast(incomplete ? '⚠️ تم الحفظ لكن بعض الجداول فشل تصديرها — راجع النسخة' : '✅ تم إنشاء النسخة الاحتياطية بنجاح');
    logActivity(db, 'إنشاء نسخة احتياطية', { entity_type: 'backup', details: `${totalRows} صف — ${sizeKb} KB`, userName: _userName });
    fetchBackups();
  };

  // ── تنزيل نسخة ──
  // 🔒 FIX (تشخيص لوجز CI — 4 أغسطس 2026): backup الجاي من القايمة (fetchBackups)
  // بقى مش فيه عمود data (راجع تعليق fetchBackups فوق) — بنجيبه هنا بصف واحد بس
  // (select على id محدد) وقت الحاجة الفعلية للتنزيل، مش مع كل القايمة.
  const handleDownloadBackup = async (backup: BackupRow) => {
    toast('⏳ جاري تجهيز الملف...');
    const { data: fullBackup, error } = await db.from('backups')
      .select('data,created_at')
      .eq('id', backup.id)
      .single();
    if (error || !fullBackup) { toast('❌ تعذر تنزيل النسخة الاحتياطية', true); return; }
    const snapshot = await decompressStoredBackupData(fullBackup.data);
    if (!snapshot) { toast('❌ تعذر قراءة بيانات النسخة الاحتياطية', true); return; }

    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `sanad-backup-${new Date(fullBackup.created_at as string).toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('📥 جاري التنزيل...');
    logActivity(db, 'تنزيل نسخة احتياطية', { entity_type: 'backup', details: formatArDate(backup.created_at as string), userName: _userName });
  };

  // ── استعادة نسخة ──
  // ⚠️ تتطلب كتابة 'استعادة' يدوياً في حقل التأكيد قبل التنفيذ
  // ⚠️ استعادة حقيقية لنقطة زمنية: بنحذف بيانات المكتب الحالية من كل جدول (بالترتيب
  //    الصحيح لتفادي قيود المفاتيح الأجنبية) ثم بندخل صفوف النسخة الاحتياطية كاملة.
  //    استثناءان مقصودان من الحذف (upsert فقط بدلاً من حذف/إعادة إدخال):
  //    - profiles: حذفه قد يحذف حساب الأدمن الحالي نفسه أثناء عملية الاستعادة
  //      (RLS بتعتمد على profile المستخدم المسجل دخوله).
  //    - activity_log: سجل تدقيق قانوني — طمس الإدخالات اللي حصلت بعد
  //      تاريخ النسخة الاحتياطية (بما فيها إدخالات الاستعادة نفسها لاحقاً) غير مقبول
  //      من الناحية القانونية/المحاسبية، فبيتم فقط استكمال أي صفوف قديمة ناقصة.
  // ── الخطوات الفعلية للاستعادة (حذف + إدخال + upsert)، مستقلة عن مصدر
  // الـ snapshot (نسخة من القايمة أو ملف مرفوع من الجهاز) عشان تتستخدم من
  // الاتنين من غير تكرار كود. بترجع عدد الجداول اللي نجحت + هل فيه فشل جزئي،
  // وبتنادي onProgress بعد كل خطوة (نسبة 0-100، حساب بسيط: خطوة/إجمالي الخطوات).
  const performRestoreSteps = async (
    snapshot: BackupSnapshot | null,
    onProgress: (percent: number) => void,
    // ⚠️ لازم string مضمون (مش string|null) — الدالة دي منفصلة عن
    // handleRestoreBackup/handleRestoreFromFile، فـ TypeScript مش بيقدر يتتبع
    // إن فحص `if (!tenantId) return;` في الدالتين المنادية ضامن إن tenantId
    // مش null هنا. تمرير القيمة كباراميتر بيفرض الضمان ده صراحةً بدل الاعتماد
    // على تتبع النطاق (closure narrowing) اللي مش بيعدي حدود الدالة.
    tenantIdSafe: string,
  ): Promise<{ restoredTables: number; failed: boolean }> => {
    const totalSteps = RESTORE_DELETE_ORDER.length + RESTORE_INSERT_ORDER.length + 2; // +2: profiles و activity_log
    let completedSteps = 0;
    let restoredTables = 0;
    let failed = false;
    onProgress(0);

    // ١) حذف بيانات المكتب الحالية (أبناء أولاً) من الجداول اللي هنعيد إدخالها بالكامل
    for (const table of RESTORE_DELETE_ORDER) {
      try {
        // ⚠️ table هنا union من عدة جداول، ومعظمها فيه عمود tenant_id مباشر
        // لكن client_portal_pins لأ (مربوط بالـ tenant عن طريق clients.tenant_id
        // مش عمود مباشر في جدوله هو) — فـ TypeScript بيحسب تقاطع أعمدة كل
        // الجداول في RESTORE_DELETE_ORDER فيرفض 'tenant_id' لأنه مش مشترك في
        // كلها. الكاست هنا موثّق ومقصود: باقي الجداول كلها فعلاً فيها العمود،
        // وحالة client_portal_pins الوحيدة هتفشل وقت التشغيل وتتلقط في catch
        // تحت (نفس السلوك الحالي، بدون أي تغيير فعلي في المنطق وقت التشغيل).
        await (dynFrom(table) as unknown as ReturnType<typeof _typedClientsFrom>)
          .delete()
          .eq('tenant_id', tenantIdSafe);
      } catch (e) {
        failed = true;
      }
      completedSteps++;
      onProgress(Math.round((completedSteps / totalSteps) * 100));
    }

    // ٢) إعادة إدخال صفوف النسخة الاحتياطية (آباء أولاً)، على دفعات
    for (const table of RESTORE_INSERT_ORDER) {
      const rows = snapshot?.tables?.[table];
      if (rows && rows.length > 0) {
        try {
          for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
            // ⚠️ الكاست هنا مختلف عن اختيار الجدول فوق (اللي بقى متحقق منه
            // بالكامل عبر BackupTableName): rows جايين من JSON مخزّن فعليًا
            // (BackupSnapshot.tables)، شكل كل صف مش معروف وقت الكتابة —
            // ممكن يكون من نسخة احتياطية أقدم بشكل مختلف شوية عن
            // database.types.ts الحالي. الكاست بيقول "الصف ده المفروض يطابق
            // شكل جدول `table` الحقيقي" (افتراض معقول لأنه جاي من باك أب لنفس
            // القاعدة)، مش "تجاهل النوع خالص" زي `any`.
            const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE) as Database['public']['Tables'][typeof table]['Insert'][];
            const { error } = await dynFrom(table).insert(chunk);
            if (error) throw error;
          }
          restoredTables++;
        } catch (e) {
          failed = true;
        }
      }
      completedSteps++;
      onProgress(Math.round((completedSteps / totalSteps) * 100));
    }

    // ٣) profiles و activity_log: upsert فقط (بدون حذف) — انظر التعليق أعلى handleRestoreBackup
    for (const table of ['profiles', 'activity_log'] as const satisfies readonly BackupTableName[]) {
      const rows = snapshot?.tables?.[table];
      if (rows && rows.length > 0) {
        try {
          for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
            // نفس ملاحظة insert فوق — الكاست هنا لشكل الصف (unknown JSON)، مش لاسم الجدول.
            const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE) as Database['public']['Tables'][typeof table]['Insert'][];
            const { error } = await dynFrom(table).upsert(chunk, { ignoreDuplicates: false });
            if (error) throw error;
          }
          restoredTables++;
        } catch (e) { failed = true; }
      }
      completedSteps++;
      onProgress(Math.round((completedSteps / totalSteps) * 100));
    }

    return { restoredTables, failed };
  };

  const handleRestoreBackup = async (backup: BackupRow) => {
    if (restoreConfirmText.trim() !== 'استعادة') {
      toast('❌ اكتب "استعادة" في حقل التأكيد أولاً', true);
      return;
    }
    if (!tenantId) {
      toast('❌ تعذر تحديد المكتب الحالي — لا يمكن الاستعادة بأمان', true);
      return;
    }
    setRestoringBackup(true);
    setRestoreProgressPercent(0);
    // 🔒 FIX (تشخيص لوجز CI — 4 أغسطس 2026): نفس ملحوظة handleDownloadBackup —
    // backup.data مش متجاب مع القايمة دلوقتي، فبنجيبه هنا بصف واحد قبل ما نبدأ
    // أي حذف فعلي (لو فشل الجلب، بنوقف من غير ما نلمس أي بيانات موجودة).
    const { data: fullBackup, error: fetchErr } = await db.from('backups')
      .select('data').eq('id', backup.id).single();
    if (fetchErr || !fullBackup) {
      setRestoringBackup(false);
      toast('❌ تعذر جلب بيانات النسخة الاحتياطية — لم يتم حذف أو تعديل أي شيء', true);
      return;
    }
    const snapshot = await decompressStoredBackupData(fullBackup.data);
    if (!snapshot) {
      setRestoringBackup(false);
      toast('❌ تعذر قراءة بيانات النسخة الاحتياطية — لم يتم حذف أو تعديل أي شيء', true);
      return;
    }
    let restoredTables = 0;
    let failed = false;

    try {
      ({ restoredTables, failed } = await performRestoreSteps(snapshot, setRestoreProgressPercent, tenantId));
    } finally {
      setRestoringBackup(false);
      setConfirmRestore(null);
      setRestoreConfirmText('');
    }

    const backupDate = formatArDate(backup.created_at as string);
    toast(failed ? `⚠️ تمت الاستعادة جزئياً — راجع البيانات (${restoredTables} جدول نجح)` : `✅ تمت الاستعادة الكاملة — ${restoredTables} جداول`);
    logActivity(db, 'استعادة نسخة احتياطية', { entity_type: 'backup', details: `نسخة ${backupDate} — ${restoredTables} جداول${failed ? ' (جزئي)' : ''}`, userName: _userName });
    // إعادة تحميل التطبيق عشان البيانات المستعادة تظهر فوراً
    setTimeout(() => window.location.reload(), 1500);
  };

  // ── اختيار ملف JSON من الجهاز (رفع، بدون استعادة فعلية بعد) ──
  // بيتحقق إن الملف بشكل BackupSnapshot سليم، وبيحط النتيجة في
  // pendingFileRestore عشان مودال التأكيد (زي استعادة نسخة من القايمة بالظبط،
  // نفس شرط كتابة "استعادة") — الاستعادة الفعلية بتحصل في handleRestoreFromFile.
  const handleFileSelected = async (file: File) => {
    setUploadingFile(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !parsed.tables || typeof parsed.tables !== 'object') {
        toast('❌ الملف مش نسخة احتياطية سليمة (شكل غير متوقع)', true);
        return;
      }
      const snapshot = parsed as BackupSnapshot;
      // ⚠️ الملف لازم يكون فيه على الأقل جدول واحد من جداول سند المعروفة —
      // ده بيمنع قبول أي ملف JSON عشوائي بس عنده مفتاح "tables" بالصدفة
      // (فحص شكلي بسيط، مش تحقق كامل من كل عمود في كل جدول).
      const knownTables: string[] = [...BACKUP_TABLES, 'profiles'];
      const hasKnownTable = Object.keys(snapshot.tables).some(t => knownTables.includes(t));
      if (!hasKnownTable) {
        toast('❌ الملف مش نسخة احتياطية من سند — مفيش جداول معروفة جواه', true);
        return;
      }
      const versionMismatch = !snapshot.version || snapshot.version.split('.')[0] !== CURRENT_SNAPSHOT_MAJOR;
      const rowsCount = Object.values(snapshot.tables).reduce((s: number, t) => s + (Array.isArray(t) ? t.length : 0), 0);
      const sizeKb = Math.round(text.length / 1024);
      setPendingFileRestore({ fileName: file.name, snapshot, rowsCount, sizeKb, versionMismatch });
    } catch (e) {
      toast('❌ تعذّر قراءة الملف — تأكد إنه ملف JSON سليم من نسخة احتياطية سابقة', true);
    } finally {
      setUploadingFile(false);
    }
  };

  // ── استعادة فعلية من الملف المرفوع (بعد تأكيد المستخدم بكتابة "استعادة") ──
  const handleRestoreFromFile = async () => {
    if (!pendingFileRestore) return;
    if (restoreConfirmText.trim() !== 'استعادة') {
      toast('❌ اكتب "استعادة" في حقل التأكيد أولاً', true);
      return;
    }
    if (!tenantId) {
      toast('❌ تعذر تحديد المكتب الحالي — لا يمكن الاستعادة بأمان', true);
      return;
    }
    setRestoringBackup(true);
    setRestoreProgressPercent(0);
    let restoredTables = 0;
    let failed = false;
    try {
      ({ restoredTables, failed } = await performRestoreSteps(pendingFileRestore.snapshot, setRestoreProgressPercent, tenantId));
    } finally {
      setRestoringBackup(false);
      setPendingFileRestore(null);
      setRestoreConfirmText('');
    }

    toast(failed ? `⚠️ تمت الاستعادة جزئياً — راجع البيانات (${restoredTables} جدول نجح)` : `✅ تمت الاستعادة الكاملة — ${restoredTables} جداول`);
    logActivity(db, 'استعادة نسخة احتياطية من ملف مرفوع', { entity_type: 'backup', details: `ملف ${pendingFileRestore.fileName} — ${restoredTables} جداول${failed ? ' (جزئي)' : ''}`, userName: _userName });
    setTimeout(() => window.location.reload(), 1500);
  };

  return {
    backups, loadingBackups,
    creatingBackup, backupProgress, backupProgressPercent,
    confirmRestore, setConfirmRestore,
    restoreConfirmText, setRestoreConfirmText,
    restoringBackup, restoreProgressPercent,
    pendingFileRestore, setPendingFileRestore, uploadingFile,
    fetchBackups, handleCreateBackup, handleDownloadBackup, handleRestoreBackup,
    handleFileSelected, handleRestoreFromFile,
  };
}
