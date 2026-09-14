// ══════════════════════════════════════════════════════
//  Edge Function: encyclopedia-admin
//
//  المهمة: كل عمليات الكتابة (إضافة/تعديل/حذف) على قسم
//  "الموسوعة القانونية" — مجلدات (encyclopedia_categories) ونماذج
//  (encyclopedia_forms) — مقصورة على سوبر أدمن فقط (is_super_admin).
//
//  ليه Edge Function ومش كتابة مباشرة من المتصفح رغم إن RLS أصلاً
//  بتمنع غير سوبر أدمن من الكتابة؟ عشان رفع/حذف ملف Storage (باكت
//  encyclopedia-forms، private) لازم يتم بـservice_role — الـanon key
//  العادي مش هيقدر يرفع على باكت خاص، ونفس نمط باقي الفانكشنز الحساسة
//  في المشروع (admin-actions، process-law-extract).
//
//  الإدخال: { action: "...", ... }
//  أنواع action:
//   createCategory  { name_ar, parent_id? }
//   updateCategory  { id, name_ar?, parent_id? }
//   deleteCategory  { id }   — Cascade: بيمسح أي مجلد فرعي جواه وكل
//                              النماذج المرتبطة (DB cascade)، وبيمسح
//                              ملفات الـStorage بتاعتهم يدويًا هنا
//                              (الـcascade في القاعدة بيمسح الصفوف بس،
//                              مش ملفات الـStorage الفعلية)
//   uploadForm      { category_id, title, description?, file_name,
//                      file_type, file_base64 }
//   updateForm      { id, title?, description?, category_id?,
//                      file_name?, file_type?, file_base64? }
//                      — لو file_base64 موجودة، بيتم استبدال الملف
//                      القديم بالكامل (حذف القديم من الـStorage، رفع
//                      الجديد)؛ لو مش موجودة، تعديل بيانات النموذج بس.
//   deleteForm      { id }   — بيمسح ملف الـStorage الأول، بعدين الصف.
//
//  ⚡ توسيع (خطة "الموارد القانونية" — مرحلة 2): نفس الفانكشن بقت
//  مسؤولة كمان عن الكتابة على قسم "دليل المحامي" الجديد (تصنيفات +
//  روابط، جدولين lawyer_guide_categories/lawyer_guide_links) — بنفس
//  أسلوب التحقق (is_super_admin-gated) المستخدم فوق مع الموسوعة.
//  دليل المحامي بيانات بحتة (بدون رفع ملفات Storage)، فمافيش أي تعامل
//  مع الـBucket في العمليات دي.
//   createLinkCategory  { name_ar, icon?, sort_order? }
//   updateLinkCategory  { id, name_ar?, icon?, sort_order? }
//   deleteLinkCategory  { id }   — Cascade: بيمسح كل الروابط اللي جواه
//                                  (DB cascade، مفيش ملفات Storage)
//   createLink      { category_id, title, url, description?,
//                      entity_type?, last_verified_at? }
//   updateLink      { id, category_id?, title?, url?, description?,
//                      entity_type?, last_verified_at? }
//   deleteLink      { id }
//
//  الخرج: دايمًا status 200 — { ok:true, ... } أو { error: "..." }
//  (نفس اتفاقية admin-actions).
// ══════════════════════════════════════════════════════

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BUCKET = 'encyclopedia-forms';
const ALLOWED_FILE_TYPES = ['docx', 'pdf'];
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 ميجا — حد مخصص للموسوعة، منفصل عن حد الـ1 ميجا الخاص بمستندات القضايا

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── REST helpers (نفس نمط admin-actions) ──────────────────────────
async function rest(path: string, method = 'GET', body: unknown = null) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `status ${r.status}`);
  }
  return r.status === 204 ? null : r.json();
}

// مين الشخص اللي عامل الطلب ده، والتأكد إنه سوبر أدمن فعلاً
async function getCaller(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: ANON_KEY },
  });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  return user?.id ? user : null;
}

async function getCallerProfile(callerId: string) {
  const rows = await rest(`profiles?user_id=eq.${callerId}&select=id,is_super_admin,is_active&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

// ── Storage helpers (REST خام بـservice_role — نفس نمط signStorageUrl في client-portal-api) ──
async function uploadToStorage(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `فشل رفع الملف (status ${r.status})`);
  }
}

async function removeFromStorage(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!r.ok) {
    // best-effort: لو الحذف من الـStorage فشل (ملف مش موجود أصلاً مثلاً)،
    // منسّبش ده يمنع حذف الصف من القاعدة — بس بنسجّله في اللوج
    const e = await r.json().catch(() => ({}));
    console.error('[encyclopedia-admin:removeFromStorage]', e.message || r.status);
  }
}

const FILE_TYPE_CONTENT_TYPE: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** يفك base64 لملف ويتحقق من النوع والحجم قبل أي كتابة. يرمي رسالة عربية جاهزة للعرض لو رفض. */
function decodeAndValidateFile(fileType: string, fileBase64: string): Uint8Array {
  if (!ALLOWED_FILE_TYPES.includes(fileType)) {
    throw new Error('صيغة الملف غير مسموحة — المسموح فقط Word (docx) أو PDF');
  }
  let bytes: Uint8Array;
  try {
    const binary = atob(fileBase64);
    bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    throw new Error('تعذر قراءة الملف المرفوع');
  }
  if (bytes.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new Error('حجم الملف أكبر من المسموح (2 ميجابايت كحد أقصى)');
  }
  return bytes;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    const callerUser = await getCaller(req);
    if (!callerUser) return json({ error: 'الجلسة منتهية، سجّل الدخول من جديد' }, 401);

    const caller = await getCallerProfile(callerUser.id);
    if (!caller) return json({ error: 'حساب غير معروف' }, 403);
    if (caller.is_active === false) return json({ error: 'الحساب معطّل' }, 403);
    if (caller.is_super_admin !== true) {
      return json({ error: 'العملية دي مقصورة على سوبر أدمن فقط' }, 403);
    }

    // ── إنشاء مجلد ──
    if (action === 'createCategory') {
      const nameAr = String(body.name_ar || '').trim();
      if (!nameAr) return json({ error: 'اسم المجلد مطلوب' });
      const parentId = body.parent_id ? String(body.parent_id) : null;
      const id = crypto.randomUUID();
      try {
        const rows = await rest('encyclopedia_categories', 'POST', {
          id, name_ar: nameAr, parent_id: parentId,
        });
        return json({ ok: true, category: Array.isArray(rows) ? rows[0] : rows });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'تعذر إنشاء المجلد' });
      }
    }

    // ── تعديل مجلد ──
    if (action === 'updateCategory') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'id مطلوب' });
      const patch: Record<string, unknown> = {};
      if (body.name_ar !== undefined) {
        const nameAr = String(body.name_ar).trim();
        if (!nameAr) return json({ error: 'اسم المجلد مطلوب' });
        patch.name_ar = nameAr;
      }
      if (body.parent_id !== undefined) patch.parent_id = body.parent_id ? String(body.parent_id) : null;
      try {
        const rows = await rest(`encyclopedia_categories?id=eq.${id}`, 'PATCH', patch);
        return json({ ok: true, category: Array.isArray(rows) ? rows[0] : rows });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'تعذر تعديل المجلد' });
      }
    }

    // ── حذف مجلد (Cascade: بيشيل أي مجلد فرعي + كل النماذج جواه) ──
    if (action === 'deleteCategory') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'id مطلوب' });
      try {
        // كل المجلدات المتأثرة: نفسه + أي مجلد فرعي مباشر تحته (مستويين بس ممكنين أصلًا)
        const children = await rest(`encyclopedia_categories?parent_id=eq.${id}&select=id`);
        const categoryIds = [id, ...((Array.isArray(children) ? children : []).map((c: { id: string }) => c.id))];
        const inList = categoryIds.map((c) => `"${c}"`).join(',');
        const forms = await rest(`encyclopedia_forms?category_id=in.(${inList})&select=file_path`);
        const filePaths = (Array.isArray(forms) ? forms : []).map((f: { file_path: string }) => f.file_path);
        await removeFromStorage(filePaths);
        await rest(`encyclopedia_categories?id=eq.${id}`, 'DELETE');
        return json({ ok: true });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'تعذر حذف المجلد' });
      }
    }

    // ── رفع نموذج جديد ──
    if (action === 'uploadForm') {
      const categoryId = String(body.category_id || '');
      const title = String(body.title || '').trim();
      const fileName = String(body.file_name || '').trim();
      const fileType = String(body.file_type || '').trim();
      const fileBase64 = String(body.file_base64 || '');
      if (!categoryId || !title || !fileName || !fileType || !fileBase64) {
        return json({ error: 'بيانات ناقصة (المجلد، العنوان، الملف كلهم مطلوبين)' });
      }
      let bytes: Uint8Array;
      try {
        bytes = decodeAndValidateFile(fileType, fileBase64);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'ملف غير صالح' });
      }
      const id = crypto.randomUUID();
      const ext = fileType;
      const path = `${categoryId}/${id}.${ext}`;
      try {
        await uploadToStorage(path, bytes, FILE_TYPE_CONTENT_TYPE[fileType]);
        const rows = await rest('encyclopedia_forms', 'POST', {
          id,
          category_id: categoryId,
          title,
          description: body.description ? String(body.description).trim() : null,
          file_path: path,
          file_name: fileName,
          file_type: fileType,
          created_by: caller.id ?? null,
        });
        return json({ ok: true, form: Array.isArray(rows) ? rows[0] : rows });
      } catch (e) {
        // لو فشل الـinsert بعد نجاح الرفع، نحاول نمسح الملف اليتيم (best-effort)
        await removeFromStorage([path]);
        return json({ error: e instanceof Error ? e.message : 'تعذر رفع النموذج' });
      }
    }

    // ── تعديل نموذج (بيانات فقط، أو استبدال الملف كمان لو اتبعت file_base64) ──
    if (action === 'updateForm') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'id مطلوب' });
      const existingRows = await rest(`encyclopedia_forms?id=eq.${id}&select=file_path,category_id`);
      const existing = Array.isArray(existingRows) ? existingRows[0] : null;
      if (!existing) return json({ error: 'النموذج غير موجود' });

      const patch: Record<string, unknown> = {};
      if (body.title !== undefined) {
        const title = String(body.title).trim();
        if (!title) return json({ error: 'عنوان النموذج مطلوب' });
        patch.title = title;
      }
      if (body.description !== undefined) patch.description = body.description ? String(body.description).trim() : null;
      if (body.category_id !== undefined) patch.category_id = String(body.category_id);

      let newPath: string | null = null;
      if (body.file_base64) {
        const fileType = String(body.file_type || '').trim();
        const fileName = String(body.file_name || '').trim();
        if (!fileType || !fileName) return json({ error: 'بيانات الملف الجديد ناقصة (الاسم والنوع)' });
        let bytes: Uint8Array;
        try {
          bytes = decodeAndValidateFile(fileType, String(body.file_base64));
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : 'ملف غير صالح' });
        }
        const categoryForPath = (patch.category_id as string) || existing.category_id;
        newPath = `${categoryForPath}/${id}.${fileType}`;
        try {
          await uploadToStorage(newPath, bytes, FILE_TYPE_CONTENT_TYPE[fileType]);
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : 'تعذر رفع الملف الجديد' });
        }
        patch.file_path = newPath;
        patch.file_name = fileName;
        patch.file_type = fileType;
      }

      try {
        const rows = await rest(`encyclopedia_forms?id=eq.${id}`, 'PATCH', patch);
        // نظّف الملف القديم بعد نجاح التحديث فقط، ولو المسار فعلًا اتغيّر
        if (newPath && newPath !== existing.file_path) await removeFromStorage([existing.file_path]);
        return json({ ok: true, form: Array.isArray(rows) ? rows[0] : rows });
      } catch (e) {
        // فشل تحديث الصف بعد رفع ملف جديد بنجاح — نمسح الملف الجديد اليتيم، ونسيب القديم زي ما هو
        if (newPath) await removeFromStorage([newPath]);
        return json({ error: e instanceof Error ? e.message : 'تعذر تعديل النموذج' });
      }
    }

    // ── حذف نموذج ──
    if (action === 'deleteForm') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'id مطلوب' });
      try {
        const rows = await rest(`encyclopedia_forms?id=eq.${id}&select=file_path`);
        const existing = Array.isArray(rows) ? rows[0] : null;
        if (!existing) return json({ error: 'النموذج غير موجود' });
        await removeFromStorage([existing.file_path]);
        await rest(`encyclopedia_forms?id=eq.${id}`, 'DELETE');
        return json({ ok: true });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'تعذر حذف النموذج' });
      }
    }

    // ══════════ دليل المحامي — تصنيفات ══════════

    // ── إنشاء تصنيف ──
    if (action === 'createLinkCategory') {
      const nameAr = String(body.name_ar || '').trim();
      if (!nameAr) return json({ error: 'اسم التصنيف مطلوب' });
      const id = crypto.randomUUID();
      try {
        const rows = await rest('lawyer_guide_categories', 'POST', {
          id,
          name_ar: nameAr,
          icon: body.icon ? String(body.icon).trim() : null,
          sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0,
        });
        return json({ ok: true, category: Array.isArray(rows) ? rows[0] : rows });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'تعذر إنشاء التصنيف' });
      }
    }

    // ── تعديل تصنيف ──
    if (action === 'updateLinkCategory') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'id مطلوب' });
      const patch: Record<string, unknown> = {};
      if (body.name_ar !== undefined) {
        const nameAr = String(body.name_ar).trim();
        if (!nameAr) return json({ error: 'اسم التصنيف مطلوب' });
        patch.name_ar = nameAr;
      }
      if (body.icon !== undefined) patch.icon = body.icon ? String(body.icon).trim() : null;
      if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0;
      try {
        const rows = await rest(`lawyer_guide_categories?id=eq.${id}`, 'PATCH', patch);
        return json({ ok: true, category: Array.isArray(rows) ? rows[0] : rows });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'تعذر تعديل التصنيف' });
      }
    }

    // ── حذف تصنيف (Cascade: بيشيل كل الروابط اللي جواه — بيانات بحتة، مفيش Storage) ──
    if (action === 'deleteLinkCategory') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'id مطلوب' });
      try {
        await rest(`lawyer_guide_categories?id=eq.${id}`, 'DELETE');
        return json({ ok: true });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'تعذر حذف التصنيف' });
      }
    }

    // ══════════ دليل المحامي — روابط ══════════

    // ── إنشاء رابط ──
    if (action === 'createLink') {
      const categoryId = String(body.category_id || '');
      const title = String(body.title || '').trim();
      const url = String(body.url || '').trim();
      if (!categoryId || !title || !url) {
        return json({ error: 'بيانات ناقصة (التصنيف، العنوان، الرابط كلهم مطلوبين)' });
      }
      const id = crypto.randomUUID();
      try {
        const rows = await rest('lawyer_guide_links', 'POST', {
          id,
          category_id: categoryId,
          title,
          url,
          description: body.description ? String(body.description).trim() : null,
          entity_type: body.entity_type ? String(body.entity_type).trim() : null,
          last_verified_at: body.last_verified_at ? String(body.last_verified_at) : null,
        });
        return json({ ok: true, link: Array.isArray(rows) ? rows[0] : rows });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'تعذر إنشاء الرابط' });
      }
    }

    // ── تعديل رابط ──
    if (action === 'updateLink') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'id مطلوب' });
      const patch: Record<string, unknown> = {};
      if (body.category_id !== undefined) patch.category_id = String(body.category_id);
      if (body.title !== undefined) {
        const title = String(body.title).trim();
        if (!title) return json({ error: 'عنوان الرابط مطلوب' });
        patch.title = title;
      }
      if (body.url !== undefined) {
        const url = String(body.url).trim();
        if (!url) return json({ error: 'الرابط (URL) مطلوب' });
        patch.url = url;
      }
      if (body.description !== undefined) patch.description = body.description ? String(body.description).trim() : null;
      if (body.entity_type !== undefined) patch.entity_type = body.entity_type ? String(body.entity_type).trim() : null;
      if (body.last_verified_at !== undefined) patch.last_verified_at = body.last_verified_at ? String(body.last_verified_at) : null;
      try {
        const rows = await rest(`lawyer_guide_links?id=eq.${id}`, 'PATCH', patch);
        return json({ ok: true, link: Array.isArray(rows) ? rows[0] : rows });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'تعذر تعديل الرابط' });
      }
    }

    // ── حذف رابط ──
    if (action === 'deleteLink') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'id مطلوب' });
      try {
        await rest(`lawyer_guide_links?id=eq.${id}`, 'DELETE');
        return json({ ok: true });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'تعذر حذف الرابط' });
      }
    }

    return json({ error: `عملية غير معروفة: ${action}` }, 400);
  } catch (e) {
    console.error('[encyclopedia-admin] unexpected error', e instanceof Error ? e.message : String(e));
    return json({ error: 'حصل خطأ غير متوقع' }, 500);
  }
});
