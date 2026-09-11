import React, { useState } from 'react';
import { toast } from '../../../shared/lib/notifications';
import { I } from '../../../constants';
import { Inp } from '@/shared/ui/Inp';
import { ROLE_CONFIG, PERMISSION_LABELS } from '../icons';
import { EDITABLE_PERMISSION_KEYS } from './EditUserModal';
import { ROLE_DEFAULT_PERMISSIONS, isValidRole, type PermissionKey } from '@/shared/lib/permissions';
import { useModalPresentation } from '@/shared/hooks/useModalPresentation';
import type { AddUserForm } from './hooks/useAdminUsers';

// فورم محلي للمودال ده تحديدًا — نفس حقول AddUserForm زائد is_active
// (الحقل ده مش مستخدم فعليًا في handleAddUser دلوقتي، لكنه موجود في الحالة الأولية للفورم من الأصل)
interface UserForm extends AddUserForm {
    is_active: boolean;
}

// ══════════════════════════════════════════════════════════════
//  UserFormModal — مودال إضافة مستخدم موحّد
//  يحل محل NewLawyerModal.tsx و admin/modals/AddUserModal.tsx
//  اللي كانا نفس المودال منطقيًا (نفس الحقول ونفس استدعاء الـ
//  create_lawyer action) بس مكتوبين مرتين بأسلوبين مختلفين.
// ══════════════════════════════════════════════════════════════
function UserFormModal({ onClose, onSave, loading, title = 'إضافة مستخدم جديد لسَنَد' }: {
    onClose: () => void;
    onSave: (form: AddUserForm) => void;
    loading?: boolean;
    title?: string;
}) {
    const [form, setForm] = useState<UserForm>({
        full_name: '', email: '', password: '', role: 'lawyer',
        permissions: {}, is_active: true
    });
    const [showPass, setShowPass] = useState(false);
    const s = (k: keyof UserForm, v: string | boolean | Record<string, boolean>) => setForm((p: UserForm) => ({ ...p, [k]: v }));
    // 🆕 (دفعة 2.2 — تقرير تشخيص تجربة سطح المكتب): نفس نمط useModalPresentation
    // المُطبَّق في NewCaseModal.tsx.
    const modalPresentation = useModalPresentation();

    const submit = () => {
        if (!form.full_name.trim() || !form.email.trim() || !form.password) {
            toast('يرجى تعبئة كل الحقول', true); return;
        }
        if (form.password.length < 8) {
            toast('كلمة السر 8 أحرف على الأقل', true); return;
        }
        onSave(form);
    };

    return React.createElement('div', {
        className: `fixed inset-0 z-50 flex ${modalPresentation.overlayAlignClassName} justify-center bg-black/70 backdrop-blur-sm`,
        onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); }
    },
        React.createElement('div', {
            className: `bg-premium-card w-full max-w-lg ${modalPresentation.panelShapeClassName} p-6 pb-10 shadow-2xl ${modalPresentation.panelAnimationClassName}`,
            style: { maxHeight: '90vh', overflowY: 'auto' }
        },
            React.createElement('div', { className: "w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" }),
            React.createElement('div', { className: "flex items-center justify-between mb-5" },
                React.createElement('h3', { className: "text-sm font-black text-white flex items-center gap-2" },
                    React.createElement('span', { className: "w-1 h-4 bg-premium-gold rounded-full" }),
                    title
                ),
                React.createElement('button', {
                    onClick: onClose,
                    className: "w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-slate-400"
                }, React.createElement(I.X))
            ),

            React.createElement('div', { className: "space-y-4" },
                React.createElement(Inp, {
                    label: "الاسم الكامل", value: form.full_name,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('full_name', e.target.value),
                    placeholder: "الأستاذ / محمد أحمد", required: true,
                    'data-testid': 'admin-user-full_name'
                }),
                React.createElement(Inp, {
                    label: "البريد الإلكتروني", type: "email", value: form.email,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('email', e.target.value),
                    placeholder: "lawyer@firm.com", required: true,
                    'data-testid': 'admin-user-email'
                }),
                React.createElement('div', null,
                    React.createElement('label', { className: "block text-[10px] font-bold text-slate-400 mb-1.5" },
                        "كلمة السر المؤقتة",
                        React.createElement('span', { className: "text-rose-400 mr-1" }, "*")
                    ),
                    React.createElement('div', { className: "relative" },
                        React.createElement('input', {
                            type: showPass ? 'text' : 'password', value: form.password,
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('password', e.target.value),
                            placeholder: "8 أحرف على الأقل",
                            className: "w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 pl-10",
                            style: { fontFamily: 'Cairo,sans-serif' },
                            'data-testid': 'admin-user-password'
                        }),
                        React.createElement('button', {
                            type: "button", onClick: () => setShowPass(!showPass),
                            className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-premium-gold transition-colors"
                        }, React.createElement(I.Eye))
                    )
                ),
                React.createElement('div', null,
                    React.createElement('label', { className: "block text-[10px] font-bold text-slate-400 mb-2" }, "الصلاحية"),
                    React.createElement('div', { className: "grid grid-cols-3 gap-2" },
                        ['admin', 'lawyer', 'viewer'].map((role: string) => {
                            const rc = ROLE_CONFIG[role];
                            return React.createElement('button', {
                                key: role, type: "button",
                                onClick: () => setForm((p: UserForm) => ({ ...p, role, permissions: {} })),
                                'data-testid': 'admin-user-role-' + role,
                                className: `py-2.5 rounded-xl text-[11px] font-black border transition-all ${form.role === role ? `${rc.bg} ${rc.color} ${rc.border}` : 'bg-white/5 text-slate-500 border-white/10'}`
                            }, rc.label);
                        })
                    )
                ),

                // ⚡ NEW (طلب تفعيل تخصيص الصلاحيات وقت إضافة المستخدم،
                // 11 سبتمبر 2026): نفس UI الصلاحيات التفصيلية الموجود فى
                // EditUserModal.tsx بالظبط، بس هنا بيتفعّل وقت الإنشاء
                // مباشرة بدل ما يحتاج المستخدم رجعة لشاشة "تعديل" منفصلة.
                // الباك إند (create_lawyer فى admin-actions) كان جاهز أصلاً
                // بيقبل ويحفظ body.permissions من غير أي تعديل مطلوب —
                // الفجوة كانت هنا فى الواجهة بس. مفيش checkbox لـ
                // can_view_fees/can_edit_fees هنا برضو (مقفولين على admin
                // بلا استثناء، زي شاشة التعديل بالظبط).
                form.role !== 'admin' && React.createElement('div', null,
                    React.createElement('div', { className: "flex items-center justify-between mb-2" },
                        React.createElement('label', { className: "text-[10px] font-bold text-slate-400" }, "الصلاحيات التفصيلية"),
                        React.createElement('div', { className: "flex items-center gap-2 text-[8px] text-slate-500" },
                            React.createElement('span', { className: "flex items-center gap-1" },
                                React.createElement('span', { className: "w-2 h-2 rounded-full bg-white/15 inline-block" }), "افتراضي الدور"),
                            React.createElement('span', { className: "flex items-center gap-1" },
                                React.createElement('span', { className: "w-2 h-2 rounded-full bg-[#C9A84C] inline-block" }), "استثناء صريح")
                        )
                    ),
                    React.createElement('p', { className: "text-[9px] text-slate-500 mb-2 leading-relaxed" },
                        "عرض/تعديل الأتعاب مقفول تمامًا لغير المدير ولا يظهر هنا."),
                    React.createElement('div', { className: "space-y-1.5" },
                        EDITABLE_PERMISSION_KEYS.map((key: PermissionKey) => {
                            const roleDefault = isValidRole(form.role) ? ROLE_DEFAULT_PERMISSIONS[form.role][key] : false;
                            const explicit = form.permissions?.[key];
                            const isOverride = explicit !== undefined && explicit !== null;
                            const checked = isOverride ? !!explicit : roleDefault;
                            const meta = PERMISSION_LABELS[key];
                            return React.createElement('button', {
                                key,
                                type: 'button',
                                onClick: () => setForm((p: UserForm) => ({
                                    ...p,
                                    permissions: { ...p.permissions, [key]: !checked },
                                })),
                                'data-testid': 'admin-adduser-permission-' + key,
                                className: `w-full flex items-center justify-between p-2 rounded-lg border transition-all ${
                                    isOverride ? 'bg-[#C9A84C]/8 border-[#C9A84C]/25' : 'bg-white/5 border-white/8'
                                }`
                            },
                                React.createElement('span', { className: "flex items-center gap-2 text-[10px] font-bold text-white" },
                                    React.createElement('span', null, meta?.icon),
                                    meta?.label || key
                                ),
                                React.createElement('span', {
                                    className: `w-9 h-5 rounded-full transition-all relative flex-shrink-0 ${checked ? 'bg-[#C9A84C]' : 'bg-slate-600'}`
                                },
                                    React.createElement('span', {
                                        className: `absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow ${checked ? 'right-0.5' : 'left-0.5'}`
                                    })
                                )
                            );
                        })
                    )
                ),
                React.createElement('button', {
                    disabled: loading,
                    onClick: submit,
                    'data-testid': 'admin-user-submit',
                    className: "w-full py-3.5 bg-gradient-to-tr from-premium-gold to-[#E8C97A] text-premium-bg rounded-xl font-black text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform mt-2"
                }, loading ? React.createElement(I.Spin) : React.createElement(I.Users), loading ? 'جاري الإنشاء...' : 'إنشاء الحساب وإضافته لسَنَد')
            )
        )
    );
}

export default UserFormModal;
