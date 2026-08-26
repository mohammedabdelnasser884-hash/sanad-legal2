// ══════════════════════════════════════════════════════════════
//  permissions.ts — مصدر واحد لتعريف "الأدمن" ولمفاتيح الصلاحيات
//  التفصيلية (بند 6 في تقرير مراجعة صلاحيات أعضاء المكتب، 16 أغسطس 2026)
//
//  المشكلة اللي بيحلها الملف ده:
//  1) `isAdmin = profile?.role === 'admin'` كان مكرر حرفيًا في
//     useAppData.ts و App.tsx — أي تعديل مستقبلي في تعريف "أدمن"
//     (مثلاً لو حبينا نضيف is_super_admin هنا) كان لازم يتم في مكانين.
//  2) مفاتيح PERMISSION_LABELS (في icons.ts) وشكل EditUserForm.permissions/
//     AddUserForm.permissions (في useAdminUsers.ts) كانوا نوعين منفصلين
//     (`Record<string, boolean>` عام) بدون ربط بينهم — أي مفتاح جديد كان
//     لازم يتضاف يدويًا في مكانين من غير ضمان تطابق التسمية.
//
//  ⚠️ تحديث (خطة تفعيل الصلاحيات التفصيلية، مرحلة 2 — 16 أغسطس 2026):
//  التفعيل الفعلي بدأ. الطبقة التانية (RLS + has_permission() على
//  القاعدة) اتفعّلت فى مرحلة 1. checkPermission()/ROLE_DEFAULT_PERMISSIONS
//  تحت دول طبقة الفرونت إند (تجربة مستخدم بس — إخفاء/تعطيل، مش خط
//  الدفاع الحقيقي). لسه محتاجين توصيل فعلي فى نقاط الواجهة (مرحلة 3)
//  قبل ما يبقى ليهم أثر ملموس على أي مستخدم.
// ══════════════════════════════════════════════════════════════

import type { Json } from '../../database.types';

/** أدوار المستخدمين المتاحة حاليًا في profiles.role */
export const USER_ROLES = ['admin', 'lawyer', 'viewer'] as const;
export type UserRole = typeof USER_ROLES[number];

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === 'string' && (USER_ROLES as readonly string[]).includes(role);
}

/** أقل شكل ممكن لصف profile نحتاجه هنا — بدل استيراد ProfileRow الكامل
 *  وخلق تبعية دائرية محتملة بين shared/lib والأنواع المولّدة من قاعدة البيانات. */
export interface RoleBearing {
  role?: string | null;
}

/** المصدر الوحيد لتعريف "هل المستخدم أدمن؟" في كل الفرونت إند.
 *  ⚠️ ده بيعكس الدور المخزّن في profiles.role بس — لو احتجنا نضيف
 *  is_super_admin هنا مستقبلًا، التعديل بيتم هنا مرة واحدة وبس. */
export function isAdminRole(profile: RoleBearing | null | undefined): boolean {
  return profile?.role === 'admin';
}

// ─────────────────────────────────────────────────────────────
//  مفاتيح الصلاحيات التفصيلية (permissions JSON على profiles)
// ─────────────────────────────────────────────────────────────

/** نفس الـ 8 مفاتيح اللي كانت مكتوبة حرفيًا في PERMISSION_LABELS
 *  (icons.ts) و EditUserForm.permissions/AddUserForm.permissions
 *  (useAdminUsers.ts) — دلوقتي مصدر واحد، والاتنين بيستوردوا منه. */
// ⚡ NEW (سجل قرارات تقرير المستندات القانونية، بند 6 — 26 أغسطس 2026):
// 'can_generate_documents' — مقفول لدوري lawyer/admin بس بلا استثناء
// (نفس نمط القفل الأساسي بتاع can_view_fees/can_edit_fees، مش نمط
// can_edit_fees القابل للتخصيص عبر profiles.permissions). راجع
// checkPermission() تحت لتفاصيل القفل نفسه.
export const PERMISSION_KEYS = [
  'can_add_cases',
  'can_edit_cases',
  'can_delete_cases',
  'can_view_fees',
  'can_edit_fees',
  'can_add_clients',
  'can_view_reports',
  'can_export_data',
  'can_generate_documents',
] as const;

export type PermissionKey = typeof PERMISSION_KEYS[number];

/** شكل الصلاحيات التفصيلية لمستخدم واحد — Partial لأن مفاتيح غير
 *  موجودة تُعامَل كـ false ضمنيًا في أي مكان مستقبلي يقرأها فعليًا. */
export type PermissionsMap = Partial<Record<PermissionKey, boolean>>;

// ─────────────────────────────────────────────────────────────
//  مرحلة 2 (خطة تفعيل الصلاحيات التفصيلية، 16 أغسطس 2026):
//  checkPermission() + ROLE_DEFAULT_PERMISSIONS — مطابقين حرفيًا
//  لـhas_permission() على القاعدة (database/migrations/
//  sql-migrations-phase6/01-has-permission-function.sql). أي تعديل
//  هنا لازم يترافق بنفس التعديل هناك، وإلا الفرونت إند والـRLS
//  هيختلفوا (Matrix Test فى مرحلة 5 هيمسك أي اختلاف).
// ─────────────────────────────────────────────────────────────

/** مصفوفة الصلاحيات الافتراضية لكل دور (قسم 2.1 من الخطة) — نفس
 *  الترتيب اللي بترجعه has_permission() لما مفيش قيمة صريحة محفوظة
 *  في profiles.permissions. can_view_fees/can_edit_fees/
 *  can_generate_documents متسجلين هنا كمرجع توثيقي بس — checkPermission()
 *  بترفضهم (الأتعاب) أو بتقفلهم على lawyer/admin بس (توليد المستندات)
 *  قبل ما توصل للمصفوفة دي أصلاً (قفل أساسي بلا استثناء، مش افتراضي
 *  قابل للتعديل عبر profiles.permissions). */
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, Required<PermissionsMap>> = {
  admin: {
    can_add_cases: true,
    can_edit_cases: true,
    can_delete_cases: true,
    can_view_fees: true,
    can_edit_fees: true,
    can_add_clients: true,
    can_view_reports: true,
    can_export_data: true,
    can_generate_documents: true,
  },
  lawyer: {
    can_add_cases: true,
    can_edit_cases: true,
    can_delete_cases: false,
    can_view_fees: false,
    can_edit_fees: false,
    can_add_clients: true,
    can_view_reports: true,
    can_export_data: false,
    can_generate_documents: true,
  },
  viewer: {
    can_add_cases: false,
    can_edit_cases: false,
    can_delete_cases: false,
    can_view_fees: false,
    can_edit_fees: false,
    can_add_clients: false,
    can_view_reports: true,
    can_export_data: false,
    can_generate_documents: false,
  },
};

/** أقل شكل ممكن لصف profile محتاجينه هنا (زي RoleBearing فوق، بس
 *  بيضيف permissions/is_super_admin). ProfileRow (Tables<'profiles'>)
 *  بيطابقه تلقائيًا — مفيش حاجة لاستيراد النوع الكامل هنا. */
export interface PermissionBearing extends RoleBearing {
  permissions?: Json | null;
  is_super_admin?: boolean | null;
}

/** فحص صلاحية واحدة لمستخدم واحد — نفس منطق has_permission() على
 *  القاعدة بالظبط (قسم 3.2/3.4 من الخطة)، بالترتيب:
 *    1) admin أو is_super_admin → true دايمًا (بايباس كامل).
 *    2) can_view_fees/can_edit_fees → false دايمًا لغير admin، بلا
 *       استثناء حتى لو فيه قيمة صريحة محفوظة (قرار 2.1 — القفل ده
 *       أسبق من فحص الاستثناء الصريح).
 *    3) قيمة صريحة محفوظة في profile.permissions[key] بتلغي الافتراضي
 *       (قرار 2.2) — undefined/null يتعاملوا زي المفتاح الغائب.
 *    4) من غير قيمة صريحة → افتراضي الدور (ROLE_DEFAULT_PERMISSIONS).
 *
 *  ⚠️ ده مش React hook فعليًا (مفيش useState/useEffect جواه) — كان
 *  اسمه usePermission قبل كده، وده كان بيخلّي eslint-plugin-react-hooks
 *  يعامله كـhook حقيقي بمجرد بادئة "use" ويرفض أي استدعاء ليه جوه
 *  event handler (handleSaveCase/handleDeleteCase/...) أو جوه loop —
 *  "React Hook may be executed more than once" (16 أغسطس 2026، build
 *  step: lint). اتغيّر الاسم لـcheckPermission (rename بحت، صفر تغيير
 *  في المنطق) عشان الاسم يبقى دقيق ويشتغل بأمان من أي مكان — جوه
 *  event handler أو loop أو بره component، من غير قيود Rules of Hooks. */
export function checkPermission(
  profile: PermissionBearing | null | undefined,
  key: PermissionKey,
): boolean {
  if (isAdminRole(profile) || profile?.is_super_admin === true) return true;

  // قفل أساسي للأتعاب بلا استثناء (قرار 2.1) — مطابق لـhas_permission().
  if (key === 'can_view_fees' || key === 'can_edit_fees') return false;

  // ⚡ NEW (سجل قرارات تقرير المستندات القانونية، بند 6 — 26 أغسطس 2026):
  // توليد المستندات مقفول لدوري lawyer/admin بس بلا استثناء — دور
  // viewer ما يقدرش يولّد مستندات نهائيًا، حتى لو فيه قيمة صريحة محفوظة
  // في profiles.permissions تحاول تفتحها له. admin أصلاً رجع true فوق،
  // فالفحص هنا فعليًا بيحدد مصير lawyer/viewer بس.
  if (key === 'can_generate_documents') return profile?.role === 'lawyer';

  const permissions = (profile?.permissions ?? null) as PermissionsMap | null;
  const explicit = permissions?.[key];
  if (explicit !== undefined && explicit !== null) return explicit;

  const role = profile?.role;
  if (!isValidRole(role)) return false;
  return ROLE_DEFAULT_PERMISSIONS[role][key] ?? false;
}
