import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ClientRow } from '../../../types';
import type { PortalAccessRow } from './hooks/useAdminPortal';
import PortalSection from './PortalSection';

// ⚠️ PortalSection.tsx مبنية بـ React.createElement (مفيش JSX) — مفيهاش
// أي استيراد لـ supabaseClient/constants، فمفيش داعي لأي vi.mock هنا
// (بعكس EditUserModal.test.tsx).
afterEach(() => { cleanup(); });

function client(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: 'client-1',
    full_name: 'أحمد محمد',
    client_name: 'أحمد محمد',
    email: 'ahmed@example.com',
    phone: '01000000000',
    ...overrides,
  } as ClientRow;
}

// 🆕 (تنظيم شاشة بوابة الموكل — تابات الحالة، 16 سبتمبر 2026): 3 عملاء
// بالحالات الثلاث الممكنة: مفعّل (has access + is_active=true)، معطّل
// (has access + is_active=false)، وبدون إعداد خالص (مفيش صف بوابة أصلًا).
// حسب قرار جمعي: "معطّل" و"بدون إعداد" بيتجمّعوا مع بعض جوه تاب "غير
// مفعّل" الواحد — لأن الاتنين فعليًا بيوديك لنفس المودال/الإجراء.
const clients: ClientRow[] = [
  client({ id: 'client-active', full_name: 'سارة فعّالة' }),
  client({ id: 'client-disabled', full_name: 'محمد معطّل' }),
  client({ id: 'client-no-access', full_name: 'ليلى بدون بوابة' }),
];

const portalAccess: PortalAccessRow[] = [
  { client_id: 'client-active', is_active: true, client_name: 'سارة فعّالة', email: null },
  { client_id: 'client-disabled', is_active: false, client_name: 'محمد معطّل', email: null },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof PortalSection>> = {}) {
  const setClientSearch = vi.fn();
  const setPortalClient = vi.fn();
  render(
    React.createElement(PortalSection, {
      clientSearch: '',
      setClientSearch,
      filteredClients: clients,
      portalAccess,
      setPortalClient,
      ...overrides,
    }),
  );
  return { setClientSearch, setPortalClient };
}

describe('PortalSection — تابات الحالة (الكل / مفعّل / غير مفعّل)', () => {
  it('التاب الافتراضي "الكل" بيعرض الثلاث عملاء، والعدّادات جنب كل تاب صحيحة', () => {
    renderSection();
    expect(screen.getAllByTestId('admin-portal-card')).toHaveLength(3);
    expect(screen.getByTestId('admin-portal-tab-all').textContent).toContain('(3)');
    expect(screen.getByTestId('admin-portal-tab-active').textContent).toContain('(1)');
    expect(screen.getByTestId('admin-portal-tab-inactive').textContent).toContain('(2)');
  });

  it('الضغط على تاب "مفعّل" بيسيب العميل الشغال بس', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('admin-portal-tab-active'));
    const cards = screen.getAllByTestId('admin-portal-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('سارة فعّالة');
  });

  it('الضغط على تاب "غير مفعّل" بيجمع المعطّل + اللي بدون إعداد مع بعض', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('admin-portal-tab-inactive'));
    const cards = screen.getAllByTestId('admin-portal-card');
    expect(cards).toHaveLength(2);
    const names = cards.map((c) => c.textContent);
    expect(names.some((t) => t?.includes('محمد معطّل'))).toBe(true);
    expect(names.some((t) => t?.includes('ليلى بدون بوابة'))).toBe(true);
    // الكارت الأصلي لكل حالة لسه بيفرّق بصريًا (بادچ أحمر "معطّل" مقابل
    // نص "لا يوجد وصول") حتى بعد ما اتجمعوا في نفس التاب
    expect(screen.getByText('✗ معطّل')).toBeTruthy();
    expect(screen.getByText('لا يوجد وصول')).toBeTruthy();
  });

  it('تبديل التاب من "الكل" لـ"مفعّل" وبالعكس بيحدّث القائمة كل مرة (مش state متجمّد)', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('admin-portal-tab-active'));
    expect(screen.getAllByTestId('admin-portal-card')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('admin-portal-tab-all'));
    expect(screen.getAllByTestId('admin-portal-card')).toHaveLength(3);
  });

  it('التابات بتشتغل فوق نتيجة البحث (filteredClients) مش بتستبدلها', () => {
    // filteredClients هنا بالفعل مُصفّاة بحرف "م" (زي ما AdminPanel.tsx
    // بيعمل بالبحث)، فالتاب لازم يشتغل فوق الاتنين اللي فاضلين بس.
    renderSection({ filteredClients: [clients[1], clients[2]] }); // محمد + ليلى
    fireEvent.click(screen.getByTestId('admin-portal-tab-active'));
    expect(screen.getByTestId('admin-portal-empty')).toBeTruthy();
  });

  it('زرار الإعداد/التعديل بينادي setPortalClient بالعميل الصحيح جوه أي تاب', () => {
    const { setPortalClient } = renderSection();
    fireEvent.click(screen.getByTestId('admin-portal-tab-inactive'));
    const setupButtons = screen.getAllByTestId('admin-portal-setup-button');
    fireEvent.click(setupButtons[0]);
    expect(setPortalClient).toHaveBeenCalledTimes(1);
    expect(setPortalClient.mock.calls[0][0].id).toBe('client-disabled');
  });
});
