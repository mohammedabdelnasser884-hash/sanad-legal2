import React, { useState } from 'react';
import { I } from '../../../constants';
import { ROLE_CONFIG, PERMISSION_LABELS } from '../icons';
import { useModalPresentation } from '@/shared/hooks/useModalPresentation';
import { PERMISSION_KEYS, ROLE_DEFAULT_PERMISSIONS, isValidRole, type PermissionKey } from '@/shared/lib/permissions';
import type { ProfileRow } from '../../../types';
import type { EditUserForm } from './hooks/useAdminUsers';

// مرحلة 4 (خطة تفعيل الصلاحيات التفصيلية، 16 أغسطس 2026): can_view_fees/
// can_edit_fees مش من ضمن القايمة القابلة للتعديل هنا — مقفولين تمامًا
// لغير admin بلا استثناء (قرار 2.1)، فمفيش معنى نعرضهم كـcheckbox قابل
// للتفعيل. الاسمين لسه موجودين فى PERMISSION_KEYS/has_permission() عادي،
// بس هنا بالذات بنستبعدهم من العرض.
const EDITABLE_PERMISSION_KEYS = PERMISSION_KEYS.filter(
  (k): k is Exclude<PermissionKey, 'can_view_fees' | 'can_edit_fees'> =>
    k !== 'can_view_fees' && k !== 'can_edit_fees'
);

interface EditUserModalProps {
  user: ProfileRow;
  onSave: (data: EditUserForm) => void;
  onClose: () => void;
  saving: boolean;
  // 🔒 FIX (مراجعة أمان صلاحيات أعضاء المكتب — 16 أغسطس 2026): تريجر
  // prevent_self_privilege_escalation بيمنع أي مستخدم (حتى أدمن) من تغيير
  // role/is_active/permissions في صف نفسه على مستوى القاعدة. isSelf بيعكس
  // نفس القيد على الواجهة، عشان الأدمن ما ياخدش خطأ عام مش مفهوم لما يحاول
  // يعدّل دوره أو حالة حسابه من الشاشة دي — الاسم لسه قابل للتعديل عادي.
  isSelf?: boolean;
}

function EditUserModal({ user, onSave, onClose, saving, isSelf = false }: EditUserModalProps) {
  const [form, setForm] = useState<EditUserForm>({
    full_name: user.full_name || '',
    role: user.role || 'lawyer',
    is_active: user.is_active !== false,
    permissions: (user.permissions as Record<string, boolean>) || {},
  });
  // ⚠️ FIX (مراجعة أمان صلاحيات أعضاء المكتب — 16 أغسطس 2026): تأكيد إضافي
  // قبل ترقية أي مستخدم لدور "مدير" (صلاحيات كاملة على المكتب)، بنفس نمط
  // تأكيدات الحذف/التعطيل الموجودة في باقي الشاشة. بيظهر بس لو الدور
  // فعليًا هيتغيّر لـ admin (مش لو المستخدم أدمن أصلًا من الأول).
  const [confirmingAdminPromotion, setConfirmingAdminPromotion] = useState(false);
  // مرحلة 4: بيبان لحظيًا بعد أي تبديل دور فعليًا مسح استثناءات صلاحيات
  // كانت محفوظة (مش مجرد ضغطة على نفس الدور الحالي) — بيختفي أول ما
  // المستخدم يلمس أي checkbox صلاحية تاني، عشان ميفضلش عالق على الشاشة.
  const [roleChangeResetNotice, setRoleChangeResetNotice] = useState(false);

  const roleEntry = ROLE_CONFIG[form.role];
  // ⚠️ FIX (نفس المراجعة): defaultPerms والصلاحيات التفصيلية عمومًا كانت
  // بتدّي انطباع للأدمن إنه بيضبط وصول دقيق (زي منع عرض الأتعاب)، لكن
  // بعد فحص شامل للكود ثبت إن حقل permissions مش بيتقرأ في أي مكان تاني
  // غير الشاشة دي — يعني القيم دي مكنش لها أي أثر فعلي. لحد ما يتفعّل
  // النظام ده فعليًا (فرونت إند + RLS)، بنعطّل الواجهة ونوضّح السبب،
  // بدل ما نسيب أمان وهمي. الحقل نفسه لسه بيتبعت زي ما هو (مش بنمسحه)
  // عشان لو اتفعّل مستقبلًا القيم المحفوظة تفضل موجودة.
  // 🆕 (دفعة 2.2 — تقرير تشخيص تجربة سطح المكتب): نفس نمط useModalPresentation
  // المُطبَّق في NewCaseModal.tsx. هنا الخلفية/الحدود عبر inline style مش
  // className، فبنستخدم modalPresentation.isDesktop للتحويل بدل panelShapeClassName.
  const modalPresentation = useModalPresentation();

  const isPromotingToAdmin = form.role === 'admin' && user.role !== 'admin';

  const handleSaveClick = () => {
    if (isPromotingToAdmin && !confirmingAdminPromotion) {
      setConfirmingAdminPromotion(true);
      return;
    }
    onSave(form);
  };

  return React.createElement('div',{
    className:`fixed inset-0 z-50 flex ${modalPresentation.overlayAlignClassName} justify-center`,
    style:{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)'}
  },
    React.createElement('div',{
      className:`w-full max-w-sm ${modalPresentation.isDesktop ? 'rounded-3xl' : 'rounded-t-3xl'} p-5 space-y-4 ${modalPresentation.panelAnimationClassName}`,
      style:{background:'#0d1a2e',border:'1px solid rgba(212,175,55,0.15)',borderBottom: modalPresentation.isDesktop ? '1px solid rgba(212,175,55,0.15)' : 'none',maxHeight:'85vh',overflowY:'auto'}
    },
      // هيدر
      React.createElement('div',{className:"flex items-center justify-between"},
        React.createElement('h3',{className:"text-sm font-black text-white"},"تعديل المستخدم"),
        React.createElement('button',{onClick:onClose,className:"w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-slate-400 hover:text-white"},
          React.createElement(I.X))
      ),

      // الاسم
      React.createElement('div',null,
        React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},"الاسم الكامل"),
        React.createElement('input',{
          value:form.full_name,
          onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setForm((f: EditUserForm) =>({...f,full_name:e.target.value})),
          className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white",
          style:{fontFamily:'Cairo,sans-serif'},
          'data-testid':'admin-edituser-full_name'
        })
      ),

      // الدور
      React.createElement('div',null,
        React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-2"},"الدور"),
        React.createElement('div',{className:"grid grid-cols-3 gap-2"},
          ['admin','lawyer','viewer'].map((role: string) =>{
            const rc = ROLE_CONFIG[role];
            return React.createElement('button',{
              key:role,
              disabled:isSelf,
              onClick:()=>{
                if(isSelf)return;
                setConfirmingAdminPromotion(false);
                setForm((f: EditUserForm) => {
                  // بيصفّر أي استثناءات صريحة محفوظة (قرار 2.5 — نفس
                  // سلوك admin-actions على السيرفر، بس هنا فى الفرونت
                  // إند عشان الأدمن يشوف الأثر فورًا قبل الحفظ). التنبيه
                  // بيظهر بس لو فعلاً كان فيه استثناءات هتتمسح.
                  if (role !== f.role && Object.keys(f.permissions || {}).length > 0) {
                    setRoleChangeResetNotice(true);
                  }
                  return {...f,role,permissions:{}};
                });
              },
              'data-testid':'admin-edituser-role-'+role,
              className:`py-2 rounded-xl text-[10px] font-black border transition-all ${form.role===role?`${rc.bg} ${rc.color} ${rc.border}`:'bg-white/5 text-slate-500 border-white/10'} ${isSelf?'opacity-50 cursor-not-allowed':''}`
            }, rc.label);
          })
        ),
        isSelf && React.createElement('p',{className:"text-[9px] text-slate-500 mt-1.5"},
          "مايمكنش تغيّر دورك أو حالة حسابك أو صلاحياتك التفصيلية بنفسك — لازم أدمن تاني يعمل ده.")
      ),

      // الصلاحيات التفصيلية — ✅ مرحلة 4 (خطة تفعيل الصلاحيات التفصيلية):
      // فُعِّلت فعليًا. كل checkbox بيعكس/يعدّل form.permissions[key]، اللي
      // بيتبعت مباشرة لـadmin-actions (update_profile) وبيتقروا من
      // has_permission() على القاعدة (RLS) + checkPermission() فى الفرونت
      // إند. can_view_fees/can_edit_fees مش هنا خالص — مقفولين بلا
      // استثناء (قرار 2.1)، مفيش checkbox ليهم أصلًا.
      // 🔒 FIX (مراجعة أمان صلاحيات أعضاء المكتب، متابعة 16 أغسطس 2026):
      // نفس قيد isSelf المطبّق على زرارات الدور/الـis_active فوق — الباك
      // إند (admin-actions: changingSensitive) بيرفض تعديل permissions
      // على نفس المستخدم برضه، فكان لازم الـcheckboxes تتعطّل هنا كمان
      // بدل ما تسيب الأدمن يلمسها ويكتشف الرفض بس وقت الحفظ برسالة عامة.
      form.role === 'admin'
        ? React.createElement('div',{className:"p-3 rounded-xl bg-white/5 border border-white/8"},
            React.createElement('p',{className:"text-[10px] text-slate-400 leading-relaxed"},
              "المدير عنده وصول كامل لكل الصلاحيات دايمًا (بما فيها الأتعاب) — مفيش استثناءات تُضبط له.")
          )
        : React.createElement('div',null,
        React.createElement('div',{className:"flex items-center justify-between mb-2"},
          React.createElement('label',{className:"text-[10px] font-bold text-slate-400"},"الصلاحيات التفصيلية"),
          React.createElement('div',{className:"flex items-center gap-2 text-[8px] text-slate-500"},
            React.createElement('span',{className:"flex items-center gap-1"},
              React.createElement('span',{className:"w-2 h-2 rounded-full bg-white/15 inline-block"}),"افتراضي الدور"),
            React.createElement('span',{className:"flex items-center gap-1"},
              React.createElement('span',{className:"w-2 h-2 rounded-full bg-[#C9A84C] inline-block"}),"استثناء صريح")
          )
        ),
        React.createElement('p',{className:"text-[9px] text-slate-500 mb-2 leading-relaxed"},
          "عرض/تعديل الأتعاب مقفول تمامًا لغير المدير ولا يظهر هنا."),
        roleChangeResetNotice && React.createElement('p',{
          className:"text-[9px] font-bold text-amber-400 mb-2 p-2 rounded-lg bg-amber-500/8 border border-amber-500/20",
          'data-testid':'admin-edituser-permissions-reset-notice'
        }, "⚠️ تغيير الدور صفّر أي استثناءات صلاحيات كانت محفوظة لهذا المستخدم — الصلاحيات دلوقتي على افتراضي الدور الجديد."),
        React.createElement('div',{className:"space-y-1.5"},
          EDITABLE_PERMISSION_KEYS.map((key: PermissionKey) => {
            const roleDefault = isValidRole(form.role) ? ROLE_DEFAULT_PERMISSIONS[form.role][key] : false;
            const explicit = form.permissions?.[key];
            const isOverride = explicit !== undefined && explicit !== null;
            const checked = isOverride ? !!explicit : roleDefault;
            const meta = PERMISSION_LABELS[key];
            return React.createElement('button',{
              key,
              type:'button',
              disabled:isSelf,
              onClick:()=>{
                if(isSelf)return;
                setRoleChangeResetNotice(false);
                setForm((f: EditUserForm) => ({
                  ...f,
                  permissions: { ...f.permissions, [key]: !checked },
                }));
              },
              'data-testid':'admin-edituser-permission-'+key,
              className:`w-full flex items-center justify-between p-2 rounded-lg border transition-all ${
                isOverride ? 'bg-[#C9A84C]/8 border-[#C9A84C]/25' : 'bg-white/5 border-white/8'
              } ${isSelf?'opacity-50 cursor-not-allowed':''}`
            },
              React.createElement('span',{className:"flex items-center gap-2 text-[10px] font-bold text-white"},
                React.createElement('span',null, meta?.icon),
                meta?.label || key
              ),
              React.createElement('span',{
                className:`w-9 h-5 rounded-full transition-all relative flex-shrink-0 ${checked?'bg-[#C9A84C]':'bg-slate-600'}`
              },
                React.createElement('span',{
                  className:`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow ${checked?'right-0.5':'left-0.5'}`
                })
              )
            );
          })
        )
      ),

      // الحالة
      React.createElement('div',{className:"flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/8"},
        React.createElement('div',null,
          React.createElement('p',{className:"text-xs font-black text-white"},"حالة الحساب"),
          React.createElement('p',{className:`text-[10px] ${form.is_active?'text-[#C9A84C]':'text-red-400'}`},
            form.is_active?'نشط — بإمكانه تسجيل الدخول':'معطّل — لا يستطيع الدخول')
        ),
        React.createElement('button',{
          disabled:isSelf,
          onClick:()=>{if(isSelf)return;setForm((f: EditUserForm) =>({...f,is_active:!f.is_active}));},
          'data-testid':'admin-edituser-active-toggle',
          className:`w-12 h-6 rounded-full transition-all relative ${form.is_active?'bg-[#C9A84C]':'bg-slate-600'} ${isSelf?'opacity-50 cursor-not-allowed':''}`
        },
          React.createElement('div',{
            className:`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow ${form.is_active?'right-0.5':'left-0.5'}`
          })
        )
      ),

      // تنبيه تأكيد الترقية لمدير — بيظهر بعد أول ضغطة على "حفظ" لو
      // الدور هيتغيّر لـ admin، وبيتطلب ضغطة تأكيد صريحة تانية
      confirmingAdminPromotion && React.createElement('div',{
        className:"p-3 rounded-xl bg-red-500/10 border border-red-500/25 space-y-2",
        'data-testid':'admin-edituser-promotion-warning'
      },
        React.createElement('p',{className:"text-[11px] font-black text-red-400"},
          `متأكد إنك عايز تدّي "${form.full_name || user.full_name}" صلاحيات مدير كاملة؟`),
        React.createElement('p',{className:"text-[9px] text-slate-400"},
          "هيقدر يشوف ويعدّل بيانات كل المكتب، ويضيف/يحذف مستخدمين تانيين.")
      ),

      // زر الحفظ
      React.createElement('button',{
        onClick:handleSaveClick,
        disabled:saving||!form.full_name.trim(),
        'data-testid':'admin-edituser-save',
        className:`w-full py-3 rounded-xl text-xs font-black shadow-lg active:scale-95 transition-transform disabled:opacity-50 ${
          confirmingAdminPromotion
            ? 'text-white bg-red-500'
            : 'text-premium-bg bg-gradient-to-tr from-premium-gold to-[#E8C97A]'
        }`
      },saving?'جاري الحفظ...':(confirmingAdminPromotion?'تأكيد الترقية لمدير':'حفظ التعديلات'))
    )
  );
}

export default EditUserModal;
