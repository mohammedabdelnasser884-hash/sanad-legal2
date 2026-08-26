# مانيفست — ملفات خطة "المستندات القانونية" (أولوية 1-4 + سجل القرارات 1-10 + قسم 17)

هذا الزيب بيحتوي **بس** الملفات اللي اتضافت أو اتعدّلت كجزء من خطة تطوير شاشة
المستندات القانونية (`Sanad_Document_Generation_Master_Plan.md` + التقرير الشامل
`Sanad_Legal_Documents_Master_Report.md`)، بمسارها الصحيح من جذر المشروع —
جاهزة للنسخ مباشرة فوق نسخة GitHub بتاعتك.

## 🆕 ملفات جديدة بالكامل (9)

- `src/shared/ui/Stepper.tsx`
- `src/shared/ui/VoiceInputField.tsx`
- `src/features/documentGeneration/components/CategoryPicker.tsx`
- `src/features/documentGeneration/components/TemplatePicker/TemplateRow.tsx`
- `src/features/documentGeneration/lib/caseTypeCategoryPriority.ts`
- `src/features/documentGeneration/lib/caseTypeCategoryPriority.test.ts`
- `src/features/documentGeneration/lib/offlineTemplateCache.ts`
- `database/migrations/sql-migrations-phase7/01-document-generation-schema.sql`
- `database/migrations/sql-migrations-phase7/02-document-generation-seed.sql`
- `database/migrations/sql-migrations-phase7/03-can-generate-documents-permission.sql`

## ✏️ ملفات معدّلة (21)

- `src/features/documentGeneration/components/TemplatePicker/TemplateCard.tsx`
- `src/features/documentGeneration/components/TemplatePicker/TemplatePicker.tsx`
- `src/features/documentGeneration/components/DynamicFieldsForm.tsx`
- `src/features/documentGeneration/components/DocumentPreviewEditor.tsx`
- `src/features/documentGeneration/components/SourceModeSelector.tsx`
- `src/features/documentGeneration/hooks/useDocumentTemplates.ts`
- `src/features/documentGeneration/hooks/useGenerateDocument.ts`
- `src/features/documentGeneration/api/exportApi.ts`
- `src/features/documentGeneration/api/generationApi.ts`
- `src/features/documentGeneration/__tests__/useGenerateDocument.test.ts`
- `src/pages/LegalDocumentsPage.tsx`
- `src/pages/LegalDocumentsPage.test.tsx`
- `src/lib/offlineQueue.ts`
- `src/shared/lib/permissions.ts`
- `src/app/shell/navConfig.ts`
- `src/app/shell/DesktopSidebar.tsx`
- `src/app/shell/TabletDrawer.tsx`
- `src/app/shell/AppShell.tsx`
- `src/app/CommandDock.tsx`
- `src/App.tsx`
- `e2e/document-generation.spec.ts`

**الإجمالي: 31 ملف** (9 جديد + 21 معدّل + هذا المانيفست).

## ملحوظات مهمة قبل الرفع

1. **دمج مش استبدال كامل للمشروع** — الزيب ده مقصود إنه يتفك فوق نسخة GitHub
   الحالية بتاعتك (overlay)، مش يستبدلها بالكامل. المسارات مطابقة لجذر المشروع
   بالظبط.
2. **الـ2 SQL migrations الجديدة (01, 02, 03 في phase7) لازم تتشغّل يدويًا على
   Supabase** (SQL Editor) — الزيب مش بيشغّلها تلقائيًا، ده كود بس.
3. **`npm run build`/`npm test` الحقيقيين لسه مطلوبين منك** بعد الدمج — السندبوكس
   اللي اشتغلت بيه مفيهوش نت/`node_modules`، الفحص اللي اتعمل كان نحوي بس
   (`node --experimental-strip-types --check`).
4. استبعدت عمدًا أي ملف اتذكر في التقرير كـ**مرجع/مقارنة نمط** بس مش اتعدّل
   فعليًا (زي `NewCaseModal.tsx`، `NewStandaloneSessionModal.tsx`، `useCaseActions.ts`،
   `ArchiveTab.tsx`، `dataAccess.ts`، `templatesApi.ts`، `types.ts`).
