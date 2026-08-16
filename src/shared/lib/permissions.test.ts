import { describe, it, expect } from 'vitest';
import {
  usePermission,
  ROLE_DEFAULT_PERMISSIONS,
  PERMISSION_KEYS,
  type PermissionBearing,
} from './permissions';

// ══════════════════════════════════════════════════════════════
//  usePermission() — لازم يتطابق حرفيًا مع has_permission() على
//  القاعدة (database/migrations/sql-migrations-phase6/
//  01-has-permission-function.sql). الاختبارات هنا طبقة الفرونت
//  إند بس — Matrix Test الكامل عبر الطبقتين (UI + RLS) هو مرحلة 5.
// ══════════════════════════════════════════════════════════════

describe('usePermission — admin/super_admin بايباس كامل', () => {
  it('role=admin → true لكل المفاتيح الـ8 حتى بدون permissions', () => {
    const profile: PermissionBearing = { role: 'admin' };
    for (const key of PERMISSION_KEYS) {
      expect(usePermission(profile, key)).toBe(true);
    }
  });

  it('is_super_admin=true مع role=lawyer → true لكل المفاتيح (بما فيها الأتعاب)', () => {
    const profile: PermissionBearing = { role: 'lawyer', is_super_admin: true };
    for (const key of PERMISSION_KEYS) {
      expect(usePermission(profile, key)).toBe(true);
    }
  });

  it('is_super_admin=true مع role=viewer → true حتى للأتعاب (بايباس كامل بلا استثناء)', () => {
    const profile: PermissionBearing = { role: 'viewer', is_super_admin: true };
    expect(usePermission(profile, 'can_view_fees')).toBe(true);
    expect(usePermission(profile, 'can_edit_fees')).toBe(true);
  });
});

describe('usePermission — قفل الأتعاب الأساسي (قرار 2.1، بلا استثناء)', () => {
  it('lawyer بقيمة صريحة can_view_fees=true محفوظة → لسه false (القفل أسبق من الاستثناء الصريح)', () => {
    const profile: PermissionBearing = {
      role: 'lawyer',
      permissions: { can_view_fees: true, can_edit_fees: true },
    };
    expect(usePermission(profile, 'can_view_fees')).toBe(false);
    expect(usePermission(profile, 'can_edit_fees')).toBe(false);
  });

  it('viewer → can_view_fees/can_edit_fees = false دايمًا', () => {
    const profile: PermissionBearing = { role: 'viewer' };
    expect(usePermission(profile, 'can_view_fees')).toBe(false);
    expect(usePermission(profile, 'can_edit_fees')).toBe(false);
  });
});

describe('usePermission — قيمة صريحة فى permissions بتلغي افتراضي الدور (قرار 2.2)', () => {
  it('lawyer بقيمة صريحة can_delete_cases=true → true (افتراضي الدور false)', () => {
    const profile: PermissionBearing = {
      role: 'lawyer',
      permissions: { can_delete_cases: true },
    };
    expect(usePermission(profile, 'can_delete_cases')).toBe(true);
  });

  it('lawyer بقيمة صريحة can_add_cases=false → false (افتراضي الدور true)', () => {
    const profile: PermissionBearing = {
      role: 'lawyer',
      permissions: { can_add_cases: false },
    };
    expect(usePermission(profile, 'can_add_cases')).toBe(false);
  });

  it('null صريح جوه الـJSON يتعامل معاه زي المفتاح الغائب (يرجع لافتراضي الدور)', () => {
    const profile: PermissionBearing = {
      role: 'viewer',
      permissions: { can_add_cases: null as unknown as boolean },
    };
    expect(usePermission(profile, 'can_add_cases')).toBe(false); // افتراضي viewer
  });
});

describe('usePermission — افتراضي الدور (من غير أي قيمة صريحة)', () => {
  it.each(PERMISSION_KEYS)('lawyer.%s يطابق ROLE_DEFAULT_PERMISSIONS.lawyer', (key) => {
    const profile: PermissionBearing = { role: 'lawyer' };
    // can_view_fees/can_edit_fees مقفولين بلا استثناء (قرار 2.1) — القيمة
    // false دايمًا لغير admin، حتى لو المصفوفة الافتراضية بتوثّقها false
    // برضه (نفس النتيجة، لكن السبب مختلف — القفل مش الافتراضي).
    expect(usePermission(profile, key)).toBe(ROLE_DEFAULT_PERMISSIONS.lawyer[key]);
  });

  it.each(PERMISSION_KEYS)('viewer.%s يطابق ROLE_DEFAULT_PERMISSIONS.viewer', (key) => {
    const profile: PermissionBearing = { role: 'viewer' };
    expect(usePermission(profile, key)).toBe(ROLE_DEFAULT_PERMISSIONS.viewer[key]);
  });
});

describe('usePermission — حالات حدّية', () => {
  it('profile=null → false لكل المفاتيح', () => {
    for (const key of PERMISSION_KEYS) {
      expect(usePermission(null, key)).toBe(false);
    }
  });

  it('profile=undefined → false لكل المفاتيح', () => {
    for (const key of PERMISSION_KEYS) {
      expect(usePermission(undefined, key)).toBe(false);
    }
  });

  it('role غير معروف (مش من USER_ROLES) → false (مفيش افتراضي يتطبّق)', () => {
    const profile: PermissionBearing = { role: 'some-future-role' };
    expect(usePermission(profile, 'can_view_reports')).toBe(false);
  });

  it('role=null بلا permissions → false لكل المفاتيح', () => {
    const profile: PermissionBearing = { role: null };
    for (const key of PERMISSION_KEYS) {
      expect(usePermission(profile, key)).toBe(false);
    }
  });
});

describe('ROLE_DEFAULT_PERMISSIONS — مطابقة مصفوفة قسم 2.1 من الخطة', () => {
  it('admin → true لكل الـ8 مفاتيح', () => {
    for (const key of PERMISSION_KEYS) {
      expect(ROLE_DEFAULT_PERMISSIONS.admin[key]).toBe(true);
    }
  });

  it('lawyer → true فقط لـcan_add_cases/can_edit_cases/can_add_clients/can_view_reports', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.lawyer).toEqual({
      can_add_cases: true,
      can_edit_cases: true,
      can_delete_cases: false,
      can_view_fees: false,
      can_edit_fees: false,
      can_add_clients: true,
      can_view_reports: true,
      can_export_data: false,
    });
  });

  it('viewer → true فقط لـcan_view_reports', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.viewer).toEqual({
      can_add_cases: false,
      can_edit_cases: false,
      can_delete_cases: false,
      can_view_fees: false,
      can_edit_fees: false,
      can_add_clients: false,
      can_view_reports: true,
      can_export_data: false,
    });
  });
});
