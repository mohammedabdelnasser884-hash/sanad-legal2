import React from 'react';
import { I } from '../../constants';

// ─────────────────────────────────────────────────────────
//  CaseTableRow — مرحلة D1 من خطة Desktop Experience (14 أغسطس 2026):
//  صف جدول القضايا على الديسكتوب. الأعمدة الستة المطلوبة في الخطة
//  (قسم 9): رقم القضية | الموكل | المحكمة | الحالة | الجلسة القادمة |
//  الإجراءات.
//
//  ⚠️ قرار تسمية موثّق: الخطة سمّت المكوّن المطلوب "CaseRow" بالحرف
//  (قسم 9 وجدول 0.1)، لكن `CaseRow` اسم مستخدم فعليًا في المشروع —
//  `src/types.ts` بيصدّره كـ`type CaseRow = Tables<'cases'>` (صف قاعدة
//  البيانات الخام، مستورد ومستخدم في `useAppData.ts`/`ArchiveSection.tsx`/
//  `useAdminArchive.ts`). استخدام نفس الاسم للمكوّن هيسبب تعارض استيراد
//  فوري (type vs component) في أي ملف يحتاج الاتنين. اخترت
//  `CaseTableRow` بدلًا منه — نفس المعنى المقصود من الخطة (صف جدول
//  القضايا)، بدون أي تعارض. هيتوثّق نفس القرار في تقرير التسليم.
//
//  D1 هيكلي بس — بيانات وهمية (mock) للتأكد من الشكل بصريًا فقط، صفر
//  ربط فعلي بـ`MappedCase`/الفلترة/البحث/الصفحات (ده شغل D2). الربط
//  الفعلي بمنطق الأزرار (setSelectedCase...) هيحصل في D2 عبر
//  `onOpen`/props حقيقية بدل الموجودة هنا كنموذج.
//
//  ⚡ مرحلة G2 (15 أغسطس 2026): A11y pass — زرار "فتح" (عمود الإجراءات)
//  كان بياخد `title` بس ("فتح القضية") — `title` وحده مش مضمون إنه
//  يتقرا بكل قارئات الشاشة، وكمان نفس النص هيتكرر حرفيًا في كل صفوف
//  الجدول (مش مفيد لو قارئ الشاشة بيستعرض قائمة الأزرار المتاحة في
//  الصفحة كلها). أضفت `aria-label` ديناميكي فيه رقم القضية نفسه
//  (`فتح القضية رقم ${data.number}`) عشان كل زرار يبقى ليه اسم إمكاني
//  مميز. الـ`title` اتسابت زي ما هي (tooltip بصري إضافي، مفيش ضرر).
// ─────────────────────────────────────────────────────────

export interface CaseTableRowData {
    id: string;
    number: string;
    clientName: string;
    court: string;
    status: string;
    nextSessionLabel: string; // نص جاهز للعرض (تاريخ منسّق أو "—") — د2 هيحسبها من بيانات حقيقية
}

interface CaseTableRowProps {
    data: CaseTableRowData;
    onOpen?: (id: string) => void;
}

function CaseTableRow({ data, onOpen }: CaseTableRowProps) {
    return React.createElement('tr', {
        key: data.id,
        'data-testid': 'cases-table-row',
        className: 'border-b border-white/5 hover:bg-white/[0.03] transition-colors',
    },
        React.createElement('td', { className: 'px-3 py-2.5 text-[11px] font-mono font-black text-amber-300 whitespace-nowrap' }, data.number),
        React.createElement('td', { className: 'px-3 py-2.5 text-[12px] font-bold text-white truncate max-w-[220px]' }, data.clientName),
        React.createElement('td', { className: 'px-3 py-2.5 text-[11px] text-slate-400 truncate max-w-[160px]' }, data.court),
        React.createElement('td', { className: 'px-3 py-2.5' },
            React.createElement('span', {
                className: 'text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 whitespace-nowrap',
            }, data.status)
        ),
        React.createElement('td', { className: 'px-3 py-2.5 text-[11px] text-slate-300 whitespace-nowrap' }, data.nextSessionLabel),
        React.createElement('td', { className: 'px-3 py-2.5 text-left' },
            React.createElement('button', {
                onClick: () => onOpen?.(data.id),
                'data-testid': 'cases-table-row-open',
                'aria-label': `فتح القضية رقم ${data.number}`,
                className: 'inline-flex items-center gap-1 text-slate-400 hover:text-amber-300 transition-colors',
                title: 'فتح القضية',
            }, React.createElement(I.Eye))
        )
    );
}

export default CaseTableRow;
