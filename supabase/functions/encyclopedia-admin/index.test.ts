import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubDeno, createRoutedFetch, jsonRequest, type EdgeHandler } from '../_shared/edgeTestUtils';

const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

interface FetchState {
  callerAuthOk: boolean;
  callerAuthBody: { id?: string };
  profile: { is_super_admin?: boolean; is_active?: boolean } | null;
  createCategoryOk: boolean;
  createCategoryError: string;
  createCategoryCalls: unknown[];
  updateCategoryOk: boolean;
  deleteCategoryOk: boolean;
  deleteCategoryCalls: string[];
  categoryChildren: Array<{ id: string }>;
  formsByCategoryIn: Array<{ file_path: string }>;
  uploadOk: boolean;
  uploadCalls: Array<{ path: string; contentType: string | null }>;
  removeOk: boolean;
  removeCalls: string[][];
  createFormOk: boolean;
  createFormError: string;
  createFormCalls: unknown[];
  existingFormById: Record<string, { file_path: string; category_id: string }>;
  updateFormOk: boolean;
  deleteFormOk: boolean;
  deleteFormCalls: string[];
}

function freshState(): FetchState {
  return {
    callerAuthOk: true,
    callerAuthBody: { id: 'caller-1' },
    profile: { is_super_admin: true, is_active: true },
    createCategoryOk: true,
    createCategoryError: 'فشل إنشاء المجلد',
    createCategoryCalls: [],
    updateCategoryOk: true,
    deleteCategoryOk: true,
    deleteCategoryCalls: [],
    categoryChildren: [],
    formsByCategoryIn: [],
    uploadOk: true,
    uploadCalls: [],
    removeOk: true,
    removeCalls: [],
    createFormOk: true,
    createFormError: 'فشل رفع النموذج',
    createFormCalls: [],
    existingFormById: {},
    updateFormOk: true,
    deleteFormOk: true,
    deleteFormCalls: [],
  };
}

function extractRowId(url: string): string {
  const m = url.match(/[?&]id=eq\.([^&]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function buildFetchMock(state: FetchState) {
  return createRoutedFetch([
    // getCaller
    {
      match: (url) => url.includes('/auth/v1/user'),
      respond: () => (state.callerAuthOk
        ? { status: 200, body: state.callerAuthBody }
        : { status: 401, body: {} }),
    },
    // getCallerProfile
    {
      match: (url, init) => url.includes('/rest/v1/profiles') && init?.method === 'GET',
      respond: () => (state.profile ? { status: 200, body: [state.profile] } : { status: 200, body: [] }),
    },
    // deleteCategory: GET children (parent_id=eq.)
    {
      match: (url) => url.includes('/rest/v1/encyclopedia_categories') && url.includes('parent_id=eq.'),
      respond: () => ({ status: 200, body: state.categoryChildren }),
    },
    // deleteCategory: GET forms by category_id=in.(...)
    {
      match: (url) => url.includes('/rest/v1/encyclopedia_forms') && url.includes('category_id=in.'),
      respond: () => ({ status: 200, body: state.formsByCategoryIn }),
    },
    // encyclopedia_categories POST (create)
    {
      match: (url, init) => url.includes('/rest/v1/encyclopedia_categories') && init?.method === 'POST',
      respond: (_url, init) => {
        const parsed = JSON.parse(init!.body as string);
        state.createCategoryCalls.push(parsed);
        return state.createCategoryOk
          ? { status: 201, body: [parsed] }
          : { status: 400, body: { message: state.createCategoryError } };
      },
    },
    // encyclopedia_categories PATCH (update)
    {
      match: (url, init) => url.includes('/rest/v1/encyclopedia_categories') && init?.method === 'PATCH',
      respond: (_url, init) => {
        const parsed = JSON.parse(init!.body as string);
        return state.updateCategoryOk
          ? { status: 200, body: [parsed] }
          : { status: 400, body: { message: 'فشل تعديل المجلد' } };
      },
    },
    // encyclopedia_categories DELETE
    {
      match: (url, init) => url.includes('/rest/v1/encyclopedia_categories') && init?.method === 'DELETE',
      respond: (url) => {
        state.deleteCategoryCalls.push(extractRowId(url));
        return state.deleteCategoryOk
          ? { status: 204, body: null }
          : { status: 400, body: { message: 'تعذر حذف المجلد' } };
      },
    },
    // encyclopedia_forms GET by id (existing lookup for update/delete)
    {
      match: (url, init) => url.includes('/rest/v1/encyclopedia_forms') && (init?.method === 'GET') && /[?&]id=eq\./.test(url),
      respond: (url) => {
        const id = extractRowId(url);
        const row = state.existingFormById[id];
        return { status: 200, body: row ? [row] : [] };
      },
    },
    // encyclopedia_forms POST (create)
    {
      match: (url, init) => url.includes('/rest/v1/encyclopedia_forms') && init?.method === 'POST',
      respond: (_url, init) => {
        const parsed = JSON.parse(init!.body as string);
        state.createFormCalls.push(parsed);
        return state.createFormOk
          ? { status: 201, body: [parsed] }
          : { status: 400, body: { message: state.createFormError } };
      },
    },
    // encyclopedia_forms PATCH (update)
    {
      match: (url, init) => url.includes('/rest/v1/encyclopedia_forms') && init?.method === 'PATCH',
      respond: (_url, init) => {
        const parsed = JSON.parse(init!.body as string);
        return state.updateFormOk
          ? { status: 200, body: [parsed] }
          : { status: 400, body: { message: 'تعذر تعديل النموذج' } };
      },
    },
    // encyclopedia_forms DELETE
    {
      match: (url, init) => url.includes('/rest/v1/encyclopedia_forms') && init?.method === 'DELETE',
      respond: (url) => {
        state.deleteFormCalls.push(extractRowId(url));
        return state.deleteFormOk
          ? { status: 204, body: null }
          : { status: 400, body: { message: 'تعذر حذف النموذج' } };
      },
    },
    // storage upload: POST /storage/v1/object/encyclopedia-forms/<path>
    {
      match: (url, init) => url.includes('/storage/v1/object/encyclopedia-forms/') && init?.method === 'POST',
      respond: (url, init) => {
        const path = url.split('/storage/v1/object/encyclopedia-forms/')[1];
        state.uploadCalls.push({ path, contentType: (init?.headers as Record<string, string>)?.['Content-Type'] ?? null });
        return state.uploadOk
          ? { status: 200, body: { Key: path } }
          : { status: 400, body: { message: 'فشل رفع الملف' } };
      },
    },
    // storage remove: DELETE /storage/v1/object/encyclopedia-forms
    {
      match: (url, init) => url.endsWith('/storage/v1/object/encyclopedia-forms') && init?.method === 'DELETE',
      respond: (_url, init) => {
        const parsed = JSON.parse(init!.body as string);
        state.removeCalls.push(parsed.prefixes);
        return state.removeOk
          ? { status: 200, body: [] }
          : { status: 400, body: { message: 'فشل الحذف' } };
      },
    },
  ]);
}

describe('encyclopedia-admin', () => {
  let handler: EdgeHandler;
  let state: FetchState;

  beforeEach(async () => {
    state = freshState();
    const box = stubDeno(ENV);
    vi.stubGlobal('fetch', buildFetchMock(state));
    vi.resetModules();
    await import('./index.ts');
    handler = box.handler!;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('يرفض أي شخص مش سوبر أدمن', async () => {
    state.profile = { is_super_admin: false, is_active: true };
    const res = await handler(jsonRequest({ action: 'createCategory', name_ar: 'صيغ جنائية' }));
    const data = await res.json();
    expect(data.error).toContain('سوبر أدمن');
  });

  it('يرفض حساب معطّل حتى لو سوبر أدمن', async () => {
    state.profile = { is_super_admin: true, is_active: false };
    const res = await handler(jsonRequest({ action: 'createCategory', name_ar: 'صيغ جنائية' }));
    const data = await res.json();
    expect(data.error).toContain('معطّل');
  });

  it('createCategory: بينشئ مجلد رئيسي بنجاح', async () => {
    const res = await handler(jsonRequest({ action: 'createCategory', name_ar: 'صيغ جنائية' }));
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.createCategoryCalls[0]).toMatchObject({ name_ar: 'صيغ جنائية', parent_id: null });
  });

  it('createCategory: بيرجّع رسالة الخطأ من التريجر (منع مستوى تالت) زي ما هي', async () => {
    state.createCategoryOk = false;
    state.createCategoryError = 'غير مسموح بمستوى ثالث من المجلدات — المجلد الأب ده أصلاً مجلد فرعي';
    const res = await handler(jsonRequest({ action: 'createCategory', name_ar: 'صيغة فرعية', parent_id: 'sub-1' }));
    const data = await res.json();
    expect(data.error).toContain('مستوى ثالث');
  });

  it('createCategory: بيرفض اسم فاضي', async () => {
    const res = await handler(jsonRequest({ action: 'createCategory', name_ar: '   ' }));
    const data = await res.json();
    expect(data.error).toBeTruthy();
    expect(state.createCategoryCalls.length).toBe(0);
  });

  it('deleteCategory: بيمسح ملفات الاستوريج بتاعة كل النماذج (نفسه + مجلد فرعي) قبل حذف الصف', async () => {
    state.categoryChildren = [{ id: 'sub-1' }];
    state.formsByCategoryIn = [{ file_path: 'cat-1/f1.pdf' }, { file_path: 'sub-1/f2.docx' }];
    const res = await handler(jsonRequest({ action: 'deleteCategory', id: 'cat-1' }));
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.removeCalls[0]).toEqual(['cat-1/f1.pdf', 'sub-1/f2.docx']);
    expect(state.deleteCategoryCalls).toEqual(['cat-1']);
  });

  it('uploadForm: بيرفض نوع ملف غير docx/pdf', async () => {
    const res = await handler(jsonRequest({
      action: 'uploadForm', category_id: 'cat-1', title: 'صحيفة دعوى',
      file_name: 'x.exe', file_type: 'exe', file_base64: btoa('hello'),
    }));
    const data = await res.json();
    expect(data.error).toContain('صيغة الملف');
    expect(state.uploadCalls.length).toBe(0);
  });

  it('uploadForm: بيرفض ملف أكبر من 2 ميجا', async () => {
    const bigBase64 = btoa('a'.repeat(3 * 1024 * 1024)); // أكبر من الحد بكتير
    const res = await handler(jsonRequest({
      action: 'uploadForm', category_id: 'cat-1', title: 'صحيفة دعوى',
      file_name: 'x.pdf', file_type: 'pdf', file_base64: bigBase64,
    }));
    const data = await res.json();
    expect(data.error).toContain('2 ميجابايت');
    expect(state.uploadCalls.length).toBe(0);
  });

  it('uploadForm: بيرفع الملف للاستوريج بعدها يعمل insert بنجاح', async () => {
    const res = await handler(jsonRequest({
      action: 'uploadForm', category_id: 'cat-1', title: 'صحيفة دعوى مطالبة بأجرة',
      description: 'نموذج جاهز', file_name: 'دعوى.pdf', file_type: 'pdf', file_base64: btoa('%PDF-1.4 fake'),
    }));
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.uploadCalls.length).toBe(1);
    expect(state.uploadCalls[0].contentType).toBe('application/pdf');
    expect(state.createFormCalls[0]).toMatchObject({
      category_id: 'cat-1', title: 'صحيفة دعوى مطالبة بأجرة', file_name: 'دعوى.pdf', file_type: 'pdf',
    });
  });

  it('uploadForm: لو الـinsert فشل بعد نجاح الرفع، بيمسح الملف اليتيم', async () => {
    state.createFormOk = false;
    const res = await handler(jsonRequest({
      action: 'uploadForm', category_id: 'cat-1', title: 'صحيفة دعوى',
      file_name: 'x.pdf', file_type: 'pdf', file_base64: btoa('%PDF fake'),
    }));
    const data = await res.json();
    expect(data.error).toBe(state.createFormError);
    expect(state.uploadCalls.length).toBe(1);
    expect(state.removeCalls.length).toBe(1); // rollback للملف اليتيم
  });

  it('deleteForm: بيمسح الملف من الاستوريج بعدين الصف', async () => {
    state.existingFormById['form-1'] = { file_path: 'cat-1/form-1.pdf', category_id: 'cat-1' };
    const res = await handler(jsonRequest({ action: 'deleteForm', id: 'form-1' }));
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.removeCalls[0]).toEqual(['cat-1/form-1.pdf']);
    expect(state.deleteFormCalls).toEqual(['form-1']);
  });

  it('deleteForm: بيرجّع خطأ واضح لو النموذج مش موجود', async () => {
    const res = await handler(jsonRequest({ action: 'deleteForm', id: 'ghost' }));
    const data = await res.json();
    expect(data.error).toContain('غير موجود');
  });

  it('updateForm: تعديل بيانات بس (من غير ملف جديد) ميعملش أي عملية Storage', async () => {
    state.existingFormById['form-1'] = { file_path: 'cat-1/form-1.pdf', category_id: 'cat-1' };
    const res = await handler(jsonRequest({ action: 'updateForm', id: 'form-1', title: 'عنوان جديد' }));
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.uploadCalls.length).toBe(0);
    expect(state.removeCalls.length).toBe(0);
  });

  it('updateForm: استبدال الملف بيرفع الجديد بعدين يمسح القديم', async () => {
    state.existingFormById['form-1'] = { file_path: 'cat-1/form-1.pdf', category_id: 'cat-1' };
    const res = await handler(jsonRequest({
      action: 'updateForm', id: 'form-1', file_name: 'جديد.docx', file_type: 'docx', file_base64: btoa('new file'),
    }));
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.uploadCalls.length).toBe(1);
    expect(state.removeCalls[0]).toEqual(['cat-1/form-1.pdf']);
  });

  it('عملية غير معروفة بترجع 400', async () => {
    const res = await handler(jsonRequest({ action: 'doSomethingWeird' }));
    expect(res.status).toBe(400);
  });
});
