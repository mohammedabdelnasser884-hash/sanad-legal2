import React from 'react';
import { I } from '../../constants';

// ─────────────────────────────────────────────────────────
//  ClientTableRow — مرحلة D3 من خطة Desktop Experience (14 أغسطس 2026):
//  صف جدول الموكلين على الديسكتوب، بنفس نمط CaseTableRow.tsx (D1/D2)
//  بالحرف — نفس أسلوب الأعمدة الثابتة العرض عبر `td`، نفس تنسيق زرار
//  "فتح" في العمود الأخير، نفس التسمية (`ClientTableRow` بدل الاسم في
//  نص الخطة لو فيه تعارض — هنا مفيش تعارض تسمية زي `CaseRow`، فاستخدمنا
//  الاسم المباشر).
//
//  الأعمدة الستة المختارة (بمعزل عن نص الخطة، لأن قسم 9 كان مركّز على
//  القضايا بس): الاسم | النوع | الهاتف | الرقم القومي/السجل | عدد
//  القضايا | الإجراءات. نفس الحقول المعروضة فعليًا في كارت الموكل
//  (ClientsTab.tsx renderClientCard) — صفر حقل جديد غير موجود بالفعل
//  في الكارت، فقط عرض جدولي لنفس البيانات.
//
//  D3 بيجمع D1+D2 (هيكل + ربط ببيانات حقيقية) في خطوة واحدة، لأن الخطة
//  وصفتها كمرحلة جزئية واحدة "نفس النمط" — البيانات هنا حقيقية من أول
//  تسليم، مفيش مرحلة mock منفصلة زي القضايا.
//
//  ⚡ مرحلة G2 (15 أغسطس 2026): A11y pass — نفس تعديل CaseTableRow.tsx
//  بالحرف: زرار "فتح" بقى بياخد `aria-label` ديناميكي فيه اسم الموكل
//  نفسه (`فتح ملف الموكل: ${data.name}`) بدل الاعتماد على `title` بس
//  (اللي فضل موجود زي ما هو كـtooltip إضافي).
// ─────────────────────────────────────────────────────────

export interface ClientTableRowData {
    id: string;
    name: string;
    typeLabel: string;
    phone: string;
    nationalId: string;
    caseCount: number;
}

interface ClientTableRowProps {
    data: ClientTableRowData;
    onOpen?: (id: string) => void;
}

function ClientTableRow({ data, onOpen }: ClientTableRowProps) {
    return React.createElement('tr', {
        key: data.id,
        'data-testid': 'clients-table-row',
        className: 'border-b border-white/5 hover:bg-white/[0.03] transition-colors',
    },
        React.createElement('td', { className: 'px-3 py-2.5 text-[12px] font-bold text-white truncate max-w-[220px]' }, data.name),
        React.createElement('td', { className: 'px-3 py-2.5' },
            React.createElement('span', {
                className: 'text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 whitespace-nowrap',
            }, data.typeLabel)
        ),
        React.createElement('td', { className: 'px-3 py-2.5 text-[11px] text-slate-400 whitespace-nowrap' }, data.phone || '—'),
        React.createElement('td', { className: 'px-3 py-2.5 text-[11px] text-slate-400 font-mono whitespace-nowrap' }, data.nationalId || '—'),
        React.createElement('td', { className: 'px-3 py-2.5 text-[11px] text-slate-300 whitespace-nowrap' },
            data.caseCount > 0 ? `${data.caseCount} قضية` : '—'
        ),
        React.createElement('td', { className: 'px-3 py-2.5 text-left' },
            React.createElement('button', {
                onClick: () => onOpen?.(data.id),
                'data-testid': 'clients-table-row-open',
                'aria-label': `فتح ملف الموكل: ${data.name}`,
                className: 'inline-flex items-center gap-1 text-slate-400 hover:text-amber-300 transition-colors',
                title: 'فتح ملف الموكل',
            }, React.createElement(I.Eye))
        )
    );
}

export default ClientTableRow;
