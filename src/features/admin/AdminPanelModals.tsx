import React from 'react';
import { createPortal } from 'react-dom';
import DeleteConfirmModal from '@/shared/modals/DeleteConfirmModal';
import EditUserModal from './users/EditUserModal';
import UserFormModal from './users/UserFormModal';
import ChangePasswordModal from './security/ChangePasswordModal';
import AddPortalUserModal from './portal/AddPortalUserModal';
import ClientPortalModal from './portal/ClientPortalModal';
import LegalLibraryModal from './legal-library/LegalLibraryModal';
import EncyclopediaCategoryModal from './encyclopedia/EncyclopediaCategoryModal';
import EncyclopediaFormModal from './encyclopedia/EncyclopediaFormModal';
import EncyclopediaBatchUploadModal from './encyclopedia/EncyclopediaBatchUploadModal';
import EncyclopediaBulkMoveModal from './encyclopedia/EncyclopediaBulkMoveModal';
import LawyerGuideCategoryModal from './lawyer-guide/LawyerGuideCategoryModal';
import LawyerGuideLinkModal from './lawyer-guide/LawyerGuideLinkModal';
import type { ProfileRow, ClientRow, LawRow, LegalCategoryRow, EncyclopediaCategoryRow, EncyclopediaFormRow, LawyerGuideCategoryRow, LawyerGuideLinkRow } from '../../types';
import type { EditUserForm, AddUserForm, ChangePasswordPayload } from './users/hooks/useAdminUsers';
import type { PortalAccessRow, PortalSaveForm } from './portal/hooks/useAdminPortal';
import type { LawForm } from './legal-library/hooks/useAdminLegalLibrary';
import type { EncyclopediaCategoryForm, EncyclopediaFormFormValues, EncyclopediaBatchFileResult } from './encyclopedia/hooks/useAdminEncyclopedia';
import type { LawyerGuideCategoryForm, LawyerGuideLinkForm } from './lawyer-guide/hooks/useAdminLawyerGuide';

// مودالز مستقلة عن قسم العرض الحالي (section) — بتتفتح فوق أي قسم أو من غير قسم مفتوح خالص.
// اتنقلت هنا بنفس المنطق تمامًا من AdminPanel.tsx (صفر تغيير سلوك) عشان تخفيف حجم الملف الرئيسي.
interface AdminPanelModalsProps {
  // تعديل مستخدم
  editUser: ProfileRow | null;
  setEditUser: (u: ProfileRow | null) => void;
  handleEditUser: (form: EditUserForm) => void;
  saving: boolean;
  // 🔒 مطلوبة عشان نحسب isSelf في EditUserModal (راجع تعليق isSelf هناك)
  profile?: ProfileRow | null;

  // إضافة مستخدم
  showAddUser: boolean;
  setShowAddUser: (v: boolean) => void;
  handleAddUser: (form: AddUserForm) => void;

  // إضافة وصول بوابة موكل
  showAddPortalUser: boolean;
  setShowAddPortalUser: (v: boolean) => void;
  clients: ClientRow[];
  portalAccess: PortalAccessRow[];
  handleSavePortal: (data: PortalSaveForm) => Promise<void>;
  savingPortal: boolean;

  // تعديل وصول بوابة موكل قائم
  portalClient: ClientRow | null;
  setPortalClient: (c: ClientRow | null) => void;

  // تغيير كلمة مرور
  changePassUser: ProfileRow | null;
  setChangePassUser: (u: ProfileRow | null) => void;
  handleChangePassword: (data: ChangePasswordPayload) => void;

  // إضافة / تعديل قانون
  showLawModal: boolean;
  setShowLawModal: (v: boolean) => void;
  legalCategories: LegalCategoryRow[];
  editingLaw: LawRow | null;
  setEditingLaw: (l: LawRow | null) => void;
  savingLaw: boolean;
  handleSaveLaw: (form: LawForm, file: File | null) => void;

  // تأكيد حذف قانون
  confirmDeleteLaw: LawRow | null;
  setConfirmDeleteLaw: (l: LawRow | null) => void;
  handleDeleteLaw: (law: LawRow) => void;

  // تأكيد حذف مستخدم
  confirmDelete: ProfileRow | null;
  setConfirmDelete: (u: ProfileRow | null) => void;
  handleDeleteUser: (user: ProfileRow) => void;

  // إضافة / تعديل مجلد في الموسوعة القانونية
  showCategoryModal: boolean;
  setShowCategoryModal: (v: boolean) => void;
  encyclopediaCategories: EncyclopediaCategoryRow[];
  editingCategory: EncyclopediaCategoryRow | null;
  setEditingCategory: (c: EncyclopediaCategoryRow | null) => void;
  categoryParentForNew: string | null;
  setCategoryParentForNew: (id: string | null) => void;
  savingCategory: boolean;
  handleSaveCategory: (form: EncyclopediaCategoryForm) => void;

  // تأكيد حذف مجلد من الموسوعة القانونية
  confirmDeleteCategory: EncyclopediaCategoryRow | null;
  setConfirmDeleteCategory: (c: EncyclopediaCategoryRow | null) => void;
  handleDeleteCategory: (category: EncyclopediaCategoryRow) => void;

  // إضافة / تعديل نموذج في الموسوعة القانونية
  showFormModal: boolean;
  setShowFormModal: (v: boolean) => void;
  editingForm: EncyclopediaFormRow | null;
  setEditingForm: (f: EncyclopediaFormRow | null) => void;
  formModalCategoryId: string | null;
  setFormModalCategoryId: (id: string | null) => void;
  savingForm: boolean;
  handleSaveForm: (form: EncyclopediaFormFormValues, file: File | null) => void;

  // تأكيد حذف نموذج من الموسوعة القانونية
  confirmDeleteForm: EncyclopediaFormRow | null;
  setConfirmDeleteForm: (f: EncyclopediaFormRow | null) => void;
  handleDeleteForm: (form: EncyclopediaFormRow) => void;

  // الرفع المتعدد للنماذج في الموسوعة القانونية
  showBatchUploadModal: boolean;
  setShowBatchUploadModal: (v: boolean) => void;
  batchModalCategoryId: string | null;
  setBatchModalCategoryId: (id: string | null) => void;
  batchUploading: boolean;
  batchProgress: { current: number; total: number } | null;
  batchResults: EncyclopediaBatchFileResult[] | null;
  setBatchResults: (r: EncyclopediaBatchFileResult[] | null) => void;
  handleUploadBatch: (categoryId: string, items: { file: File; title: string }[]) => void;

  // تأكيد حذف جماعي للنماذج في الموسوعة القانونية
  confirmBulkDeleteForms: EncyclopediaFormRow[] | null;
  setConfirmBulkDeleteForms: (f: EncyclopediaFormRow[] | null) => void;
  bulkDeleting: boolean;
  handleBulkDeleteForms: (forms: EncyclopediaFormRow[]) => void;

  // نقل جماعي للنماذج في الموسوعة القانونية
  bulkMoveForms: EncyclopediaFormRow[] | null;
  setBulkMoveForms: (f: EncyclopediaFormRow[] | null) => void;
  bulkMoving: boolean;
  handleBulkMoveForms: (forms: EncyclopediaFormRow[], targetCategoryId: string) => void;

  // إضافة / تعديل تصنيف في دليل المحامي
  showGuideCategoryModal: boolean;
  setShowGuideCategoryModal: (v: boolean) => void;
  editingGuideCategory: LawyerGuideCategoryRow | null;
  setEditingGuideCategory: (c: LawyerGuideCategoryRow | null) => void;
  savingGuideCategory: boolean;
  handleSaveGuideCategory: (form: LawyerGuideCategoryForm) => void;

  // تأكيد حذف تصنيف من دليل المحامي
  confirmDeleteGuideCategory: LawyerGuideCategoryRow | null;
  setConfirmDeleteGuideCategory: (c: LawyerGuideCategoryRow | null) => void;
  handleDeleteGuideCategory: (category: LawyerGuideCategoryRow) => void;

  // إضافة / تعديل رابط في دليل المحامي
  showGuideLinkModal: boolean;
  setShowGuideLinkModal: (v: boolean) => void;
  editingGuideLink: LawyerGuideLinkRow | null;
  setEditingGuideLink: (l: LawyerGuideLinkRow | null) => void;
  guideLinkModalCategoryId: string | null;
  setGuideLinkModalCategoryId: (id: string | null) => void;
  guideCategories: LawyerGuideCategoryRow[];
  savingGuideLink: boolean;
  handleSaveGuideLink: (form: LawyerGuideLinkForm) => void;

  // تأكيد حذف رابط من دليل المحامي
  confirmDeleteGuideLink: LawyerGuideLinkRow | null;
  setConfirmDeleteGuideLink: (l: LawyerGuideLinkRow | null) => void;
  handleDeleteGuideLink: (link: LawyerGuideLinkRow) => void;
}

export default function AdminPanelModals(props: AdminPanelModalsProps) {
  const {
    editUser, setEditUser, handleEditUser, saving, profile,
    showAddUser, setShowAddUser, handleAddUser,
    showAddPortalUser, setShowAddPortalUser, clients, portalAccess, handleSavePortal, savingPortal,
    portalClient, setPortalClient,
    changePassUser, setChangePassUser, handleChangePassword,
    showLawModal, setShowLawModal, legalCategories, editingLaw, setEditingLaw, savingLaw, handleSaveLaw,
    confirmDeleteLaw, setConfirmDeleteLaw, handleDeleteLaw,
    confirmDelete, setConfirmDelete, handleDeleteUser,
    showCategoryModal, setShowCategoryModal, encyclopediaCategories, editingCategory, setEditingCategory,
    categoryParentForNew, setCategoryParentForNew, savingCategory, handleSaveCategory,
    confirmDeleteCategory, setConfirmDeleteCategory, handleDeleteCategory,
    showFormModal, setShowFormModal, editingForm, setEditingForm,
    formModalCategoryId, setFormModalCategoryId, savingForm, handleSaveForm,
    confirmDeleteForm, setConfirmDeleteForm, handleDeleteForm,
    showBatchUploadModal, setShowBatchUploadModal, batchModalCategoryId, setBatchModalCategoryId,
    batchUploading, batchProgress, batchResults, setBatchResults, handleUploadBatch,
    confirmBulkDeleteForms, setConfirmBulkDeleteForms, bulkDeleting, handleBulkDeleteForms,
    bulkMoveForms, setBulkMoveForms, bulkMoving, handleBulkMoveForms,
    showGuideCategoryModal, setShowGuideCategoryModal, editingGuideCategory, setEditingGuideCategory,
    savingGuideCategory, handleSaveGuideCategory,
    confirmDeleteGuideCategory, setConfirmDeleteGuideCategory, handleDeleteGuideCategory,
    showGuideLinkModal, setShowGuideLinkModal, editingGuideLink, setEditingGuideLink,
    guideLinkModalCategoryId, setGuideLinkModalCategoryId, guideCategories,
    savingGuideLink, handleSaveGuideLink,
    confirmDeleteGuideLink, setConfirmDeleteGuideLink, handleDeleteGuideLink,
  } = props;

  return React.createElement(React.Fragment, null,

    editUser && React.createElement(EditUserModal, {
      user: editUser, onSave: handleEditUser,
      onClose: () => setEditUser(null), saving,
      isSelf: !!profile && editUser.id === profile.id
    }),

    showAddUser && React.createElement(UserFormModal, {
      onSave: handleAddUser,
      onClose: () => setShowAddUser(false), loading: saving,
      title: 'إضافة مستخدم جديد'
    }),

    showAddPortalUser && React.createElement(AddPortalUserModal, {
      clients, portalAccess,
      onSave: async (data: PortalSaveForm) => { await handleSavePortal(data); setShowAddPortalUser(false); },
      onClose: () => setShowAddPortalUser(false), saving: savingPortal
    }),

    portalClient && React.createElement(ClientPortalModal, {
      client: portalClient, portalAccess,
      onSave: handleSavePortal,
      onClose: () => setPortalClient(null), saving: savingPortal
    }),

    // مودال تغيير كلمة المرور
    changePassUser && React.createElement(ChangePasswordModal, {
      user: changePassUser,
      onSave: handleChangePassword,
      onClose: () => setChangePassUser(null),
      saving
    }),

    // مودال إضافة / تعديل قانون في المكتبة القانونية
    showLawModal && React.createElement(LegalLibraryModal, {
      categories: legalCategories,
      editingLaw,
      saving: savingLaw,
      onSave: handleSaveLaw,
      onClose: () => { setShowLawModal(false); setEditingLaw(null); }
    }),

    // تأكيد حذف قانون
    confirmDeleteLaw && createPortal(React.createElement(DeleteConfirmModal, {
      title: "حذف هذا القانون؟",
      itemName: confirmDeleteLaw.title || '—',
      itemType: "القانون",
      mode: "delete",
      loading: savingLaw,
      onConfirm: () => handleDeleteLaw(confirmDeleteLaw),
      onCancel: () => setConfirmDeleteLaw(null),
      inputTestId: 'admin-law-delete-input',
      confirmTestId: 'admin-law-delete-confirm',
      cancelTestId: 'admin-law-delete-cancel'
    }), document.body),

    // تأكيد حذف مستخدم
    confirmDelete && createPortal(React.createElement(DeleteConfirmModal, {
      title: "حذف المستخدم؟",
      itemName: confirmDelete.full_name || '—',
      itemType: "المستخدم",
      mode: "delete",
      loading: saving,
      onConfirm: () => handleDeleteUser(confirmDelete),
      onCancel: () => setConfirmDelete(null),
      inputTestId: 'admin-user-delete-input',
      confirmTestId: 'admin-user-delete-confirm',
      cancelTestId: 'admin-user-delete-cancel'
    }), document.body),

    // مودال إضافة / تعديل مجلد في الموسوعة القانونية
    showCategoryModal && React.createElement(EncyclopediaCategoryModal, {
      categories: encyclopediaCategories,
      editingCategory,
      defaultParentId: categoryParentForNew,
      saving: savingCategory,
      onSave: handleSaveCategory,
      onClose: () => { setShowCategoryModal(false); setEditingCategory(null); setCategoryParentForNew(null); }
    }),

    // تأكيد حذف مجلد من الموسوعة القانونية (Cascade — بيشيل أي مجلد فرعي وكل النماذج جواه)
    confirmDeleteCategory && createPortal(React.createElement(DeleteConfirmModal, {
      title: "حذف هذا المجلد؟",
      itemName: confirmDeleteCategory.name_ar || '—',
      itemType: "المجلد",
      mode: "delete",
      loading: savingCategory,
      deleteConsequences: confirmDeleteCategory.parent_id
        ? ["سيُحذف المجلد وكل النماذج الموجودة بداخله نهائياً", "لا يمكن استعادة الملفات بعد الحذف"]
        : ["سيُحذف المجلد وأي مجلد فرعي بداخله وكل نماذجهم نهائياً", "لا يمكن استعادة الملفات بعد الحذف"],
      onConfirm: () => handleDeleteCategory(confirmDeleteCategory),
      onCancel: () => setConfirmDeleteCategory(null),
      inputTestId: 'admin-encyclopedia-category-delete-input',
      confirmTestId: 'admin-encyclopedia-category-delete-confirm',
      cancelTestId: 'admin-encyclopedia-category-delete-cancel'
    }), document.body),

    // مودال رفع / تعديل نموذج في الموسوعة القانونية
    showFormModal && React.createElement(EncyclopediaFormModal, {
      categories: encyclopediaCategories,
      editingForm,
      defaultCategoryId: formModalCategoryId,
      saving: savingForm,
      onSave: handleSaveForm,
      onClose: () => { setShowFormModal(false); setEditingForm(null); setFormModalCategoryId(null); }
    }),

    // تأكيد حذف نموذج من الموسوعة القانونية
    confirmDeleteForm && createPortal(React.createElement(DeleteConfirmModal, {
      title: "حذف هذا النموذج؟",
      itemName: confirmDeleteForm.title || '—',
      itemType: "النموذج",
      mode: "delete",
      loading: savingForm,
      onConfirm: () => handleDeleteForm(confirmDeleteForm),
      onCancel: () => setConfirmDeleteForm(null),
      inputTestId: 'admin-encyclopedia-form-delete-input',
      confirmTestId: 'admin-encyclopedia-form-delete-confirm',
      cancelTestId: 'admin-encyclopedia-form-delete-cancel'
    }), document.body),

    // مودال الرفع المتعدد للنماذج في الموسوعة القانونية
    showBatchUploadModal && React.createElement(EncyclopediaBatchUploadModal, {
      categories: encyclopediaCategories,
      defaultCategoryId: batchModalCategoryId,
      uploading: batchUploading,
      progress: batchProgress,
      results: batchResults,
      onUpload: handleUploadBatch,
      onClose: () => { setShowBatchUploadModal(false); setBatchModalCategoryId(null); setBatchResults(null); }
    }),

    // تأكيد حذف جماعي للنماذج المحددة في الموسوعة القانونية — نفس مودال
    // تأكيد حذف نموذج واحد (DeleteConfirmModal بنمط 'delete')، بس itemName هنا
    // نص عدّاد ثابت ("3 نماذج") لازم المستخدم يكتبه بالظبط للتأكيد، بدل اسم
    // نموذج واحد. الحذف الفعلي بيحصل تسلسليًا (handleBulkDeleteForms).
    confirmBulkDeleteForms && createPortal(React.createElement(DeleteConfirmModal, {
      title: "حذف الملفات المحددة؟",
      itemName: `${confirmBulkDeleteForms.length} ${confirmBulkDeleteForms.length === 1 ? 'ملف' : 'ملفات'}`,
      itemType: "الملفات المحددة",
      mode: "delete",
      loading: bulkDeleting,
      deleteConsequences: [
        `سيُحذف ${confirmBulkDeleteForms.length} ${confirmBulkDeleteForms.length === 1 ? 'ملف' : 'ملفات'} نهائياً من التخزين والقاعدة`,
        "لا يمكن استعادة الملفات بعد الحذف",
      ],
      onConfirm: () => handleBulkDeleteForms(confirmBulkDeleteForms),
      onCancel: () => setConfirmBulkDeleteForms(null),
      inputTestId: 'admin-encyclopedia-bulk-delete-input',
      confirmTestId: 'admin-encyclopedia-bulk-delete-confirm',
      cancelTestId: 'admin-encyclopedia-bulk-delete-cancel'
    }), document.body),

    // مودال نقل جماعي للنماذج المحددة في الموسوعة القانونية — اختيار مجلد
    // وجهة واحد، ثم النقل الفعلي تسلسليًا (handleBulkMoveForms)
    bulkMoveForms && React.createElement(EncyclopediaBulkMoveModal, {
      forms: bulkMoveForms,
      categories: encyclopediaCategories,
      moving: bulkMoving,
      onMove: handleBulkMoveForms,
      onClose: () => setBulkMoveForms(null),
    }),

    // مودال إضافة / تعديل تصنيف في دليل المحامي
    showGuideCategoryModal && React.createElement(LawyerGuideCategoryModal, {
      editingCategory: editingGuideCategory,
      saving: savingGuideCategory,
      onSave: handleSaveGuideCategory,
      onClose: () => { setShowGuideCategoryModal(false); setEditingGuideCategory(null); }
    }),

    // تأكيد حذف تصنيف من دليل المحامي (Cascade — بيشيل كل الروابط اللي جواه)
    confirmDeleteGuideCategory && createPortal(React.createElement(DeleteConfirmModal, {
      title: "حذف هذا التصنيف؟",
      itemName: confirmDeleteGuideCategory.name_ar || '—',
      itemType: "التصنيف",
      mode: "delete",
      loading: savingGuideCategory,
      deleteConsequences: ["سيُحذف التصنيف وكل الروابط الموجودة بداخله نهائياً"],
      onConfirm: () => handleDeleteGuideCategory(confirmDeleteGuideCategory),
      onCancel: () => setConfirmDeleteGuideCategory(null),
      inputTestId: 'admin-lawyer-guide-category-delete-input',
      confirmTestId: 'admin-lawyer-guide-category-delete-confirm',
      cancelTestId: 'admin-lawyer-guide-category-delete-cancel'
    }), document.body),

    // مودال إضافة / تعديل رابط في دليل المحامي
    showGuideLinkModal && React.createElement(LawyerGuideLinkModal, {
      categories: guideCategories,
      editingLink: editingGuideLink,
      defaultCategoryId: guideLinkModalCategoryId,
      saving: savingGuideLink,
      onSave: handleSaveGuideLink,
      onClose: () => { setShowGuideLinkModal(false); setEditingGuideLink(null); setGuideLinkModalCategoryId(null); }
    }),

    // تأكيد حذف رابط من دليل المحامي
    confirmDeleteGuideLink && createPortal(React.createElement(DeleteConfirmModal, {
      title: "حذف هذا الرابط؟",
      itemName: confirmDeleteGuideLink.title || '—',
      itemType: "الرابط",
      mode: "delete",
      loading: savingGuideLink,
      onConfirm: () => handleDeleteGuideLink(confirmDeleteGuideLink),
      onCancel: () => setConfirmDeleteGuideLink(null),
      inputTestId: 'admin-lawyer-guide-link-delete-input',
      confirmTestId: 'admin-lawyer-guide-link-delete-confirm',
      cancelTestId: 'admin-lawyer-guide-link-delete-cancel'
    }), document.body)
  );
}
