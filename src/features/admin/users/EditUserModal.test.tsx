import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import EditUserModal from './EditUserModal';
import type { ProfileRow } from '../../../types';

// ⚠️ نفس ملاحظة LoginScreen.test.tsx: vitest.config.ts شغّال بـ
// `globals: false`، فمفيش afterEach global مسجّل تلقائيًا لتنظيف
// @testing-library/react بعد كل تست — cleanup يدوي إلزامي هنا برضه.
afterEach(() => { cleanup(); });

// ⚠️ EditUserModal.tsx مبنية بـ React.createElement (مفيش JSX) — نفس
// أسلوب LoginScreen.test.tsx، عشان نفضل متسقين ومحتاجينش أي إعداد
// إضافي لـ JSX transform في vitest.config.ts.
//
// ⚠️ المشروع مفيهوش @testing-library/jest-dom ولا user-event مثبتين
// (نفس ملاحظة LoginScreen.test.tsx) — matchers فانيلا بس (toBeTruthy/
// toBeNull)، وfireEvent بدل userEvent.
//
// ⚠️ useModalPresentation → useResponsiveLayout بيعتمد على
// window.matchMedia، مش متاحة في jsdom افتراضيًا. useResponsiveLayout
// نفسها بترجع 'mobile' (isDesktop:false) لو matchMedia مش دالة —
// فمفيش داعي لأي mock هنا، الـ fallback الطبيعي كافي للتست ده.

function baseUser(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 'profile-1',
    user_id: 'user-1',
    full_name: 'محمد أحمد',
    email: 'mohamed@sanad.test',
    role: 'lawyer',
    created_at: null,
    tenant_id: 'tenant-1',
    rbac_role: null,
    is_super_admin: false,
    is_active: true,
    permissions: {},
    last_login: null,
    must_change_password: false,
    is_locked: false,
    failed_login_attempts: 0,
    last_seen_at: null,
    last_seen_device: null,
    last_seen_browser: null,
    last_seen_ip: null,
    ...overrides,
  } as ProfileRow;
}

function renderModal(props: Partial<React.ComponentProps<typeof EditUserModal>> = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    React.createElement(EditUserModal, {
      user: baseUser(),
      onSave,
      onClose,
      saving: false,
      ...props,
    }),
  );
  return { onSave, onClose };
}

describe('EditUserModal — الصلاحيات التفصيلية (مرحلة 4، خطة تفعيل الصلاحيات)', () => {
  it('مستخدم عادي (مش هو نفسه): checkboxes الصلاحيات ظاهرة وقابلة للضغط، وتغيير واحدة منها بيحدّث form.permissions فقط بلا أثر على الباقي', () => {
    renderModal();
    const addCasesBtn = screen.getByTestId('admin-edituser-permission-can_add_cases') as HTMLButtonElement;
    expect(addCasesBtn.disabled).toBe(false);
    // lawyer افتراضيًا can_add_cases=true → الضغطة الأولى تعمل استثناء صريح false
    fireEvent.click(addCasesBtn);
    expect(addCasesBtn.className).toContain('bg-[#C9A84C]/8'); // بقى استثناء صريح (ذهبي)
  });

  it('🔒 [FIX] isSelf=true: كل checkbox صلاحية معطّل (disabled)، والضغط عليه مالوش أي أثر على الفورم', () => {
    renderModal({ isSelf: true });
    const keys = [
      'can_add_cases', 'can_edit_cases', 'can_delete_cases',
      'can_add_clients', 'can_view_reports', 'can_export_data',
    ];
    for (const key of keys) {
      const btn = screen.getByTestId(`admin-edituser-permission-${key}`) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.className).toContain('opacity-50');
      expect(btn.className).toContain('cursor-not-allowed');
      const classBefore = btn.className;
      fireEvent.click(btn);
      // من غير أي أثر: الكلاس (وبالتبعية حالة isOverride/checked) متغيرش
      expect(btn.className).toBe(classBefore);
    }
  });

  it('🔒 [FIX] isSelf=true: نفس رسالة القفل الموجودة تحت الدور موسّعة لتوضّح إن الصلاحيات التفصيلية برضه مقفولة', () => {
    renderModal({ isSelf: true });
    expect(
      screen.getByText('مايمكنش تغيّر دورك أو حالة حسابك أو صلاحياتك التفصيلية بنفسك — لازم أدمن تاني يعمل ده.'),
    ).toBeTruthy();
  });

  it('isSelf=false (افتراضي): مفيش أي رسالة قفل ظاهرة، وزرارات الدور/الحالة شغالة', () => {
    renderModal();
    expect(
      screen.queryByText('مايمكنش تغيّر دورك أو حالة حسابك أو صلاحياتك التفصيلية بنفسك — لازم أدمن تاني يعمل ده.'),
    ).toBeNull();
    const roleBtn = screen.getByTestId('admin-edituser-role-viewer') as HTMLButtonElement;
    expect(roleBtn.disabled).toBe(false);
  });

  it('دور admin مختار: مفيش checkboxes خالص، بيتعرض نص "وصول كامل" بدل منها', () => {
    renderModal({ user: baseUser({ role: 'admin' }) });
    expect(screen.queryByTestId('admin-edituser-permission-can_add_cases')).toBeNull();
    expect(
      screen.getByText('المدير عنده وصول كامل لكل الصلاحيات دايمًا (بما فيها الأتعاب) — مفيش استثناءات تُضبط له.'),
    ).toBeTruthy();
  });

  it('can_view_fees/can_edit_fees مش موجودين خالص كـcheckbox (قرار 2.1 — مقفولين بلا استثناء)', () => {
    renderModal();
    expect(screen.queryByTestId('admin-edituser-permission-can_view_fees')).toBeNull();
    expect(screen.queryByTestId('admin-edituser-permission-can_edit_fees')).toBeNull();
  });

  it('تبديل الدور فعليًا (مع استثناءات صريحة محفوظة) بيصفّر form.permissions ويظهر تنبيه reset-notice، وبيختفي أول ما تلمس أي checkbox', () => {
    renderModal({ user: baseUser({ role: 'lawyer', permissions: { can_export_data: true } }) });
    expect(screen.queryByTestId('admin-edituser-permissions-reset-notice')).toBeNull();

    fireEvent.click(screen.getByTestId('admin-edituser-role-viewer'));
    expect(screen.getByTestId('admin-edituser-permissions-reset-notice')).toBeTruthy();

    fireEvent.click(screen.getByTestId('admin-edituser-permission-can_view_reports'));
    expect(screen.queryByTestId('admin-edituser-permissions-reset-notice')).toBeNull();
  });

  it('حفظ الفورم بيبعت permissions زي ما هي في form.permissions (بعد أي تعديل محلي على الـcheckboxes)', () => {
    const { onSave } = renderModal({ user: baseUser({ role: 'viewer', permissions: {} }) });
    fireEvent.click(screen.getByTestId('admin-edituser-permission-can_view_reports'));
    fireEvent.click(screen.getByTestId('admin-edituser-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const savedForm = onSave.mock.calls[0][0];
    // viewer افتراضيًا can_view_reports=true → أول ضغطة تعمل استثناء صريح false
    expect(savedForm.permissions.can_view_reports).toBe(false);
  });
});
