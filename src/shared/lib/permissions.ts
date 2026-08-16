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
//  القاعدة) اتفعّلت فى مرحلة 1. usePermission()/ROLE_DEFAULT_PERMISSIONS
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
export const PERMISSION_KEYS = [
  'can_add_cases',
  'can_edit_cases',
  'can_delete_cases',
  'can_view_fees',
  'can_edit_fees',
  'can_add_clients',
  'can_view_reports',
  'can_export_data',
] as const;

export type PermissionKey = typeof PERMISSION_KEYS[number];

/** شكل الصلاحيات التفصيلية لمستخدم واحد — Partial لأن مفاتيح غير
 *  موجودة تُعامَل كـ false ضمنيًا في أي مكان مستقبلي يقرأها فعليًا. */
export type PermissionsMap = Partial<Record<PermissionKey, boolean>>;

// ─────────────────────────────────────────────────────────────
//  مرحلة 2 (خطة تفعيل الصلاحيات التفصيلية، 16 أغسطس 2026):
//  usePermission() + ROLE_DEFAULT_PERMISSIONS — مطابقين حرفيًا
//  لـhas_permission() على القاعدة (database/migrations/
//  sql-migrations-phase6/01-has-permission-function.sql). أي تعديل
//  هنا لازم يترافق بنفس التعديل هناك، وإلا الفرونت إند والـRLS
//  هيختلفوا (Matrix Test فى مرحلة 5 هيمسك أي اختلاف).
// ─────────────────────────────────────────────────────────────

/** مصفوفة الصلاحيات الافتراضية لكل دور (قسم 2.1 من الخطة) — نفس
 *  الترتيب اللي بترجعه has_permission() لما مفيش قيمة صريحة محفوظة
 *  في profiles.permissions. can_view_fees/can_edit_fees متسجلين هنا
 *  كـfalse لكل الأدوار غير admin كمرجع توثيقي بس — usePermission()
 *  بترفضهم قبل ما توصل للمصفوفة دي أصلاً (قرار 2.1: قفل أساسي بلا
 *  استثناء، مش افتراضي قابل للتعديل). */
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
 *  ⚠️ ده مش React hook فعليًا (مفيش useState/useEffect جواه) — اسمه
 *  usePermission مطابقةً للتصميم الأصلي فى الخطة (قسم 3.4)، وعشان
 *  يفضل قابل للاستخدام جوه React hooks تانية (usePermissions مثلاً)
 *  من غير لخبطة فى التسمية. آمن يتنده بره component لو احتجت. */
export function usePermission(
  profile: PermissionBearing | null | undefined,
  key: PermissionKey,
): boolean {
  if (isAdminRole(profile) || profile?.is_super_admin === true) return true;

  // قفل أساسي للأتعاب بلا استثناء (قرار 2.1) — مطابق لـhas_permission().
  if (key === 'can_view_fees' || key === 'can_edit_fees') return false;

  const permissions = (profile?.permissions ?? null) as PermissionsMap | null;
  const explicit = permissions?.[key];
  if (explicit !== undefined && explicit !== null) return explicit;

  const role = profile?.role;
  if (!isValidRole(role)) return false;
  return ROLE_DEFAULT_PERMISSIONS[role][key] ?? false;
}
