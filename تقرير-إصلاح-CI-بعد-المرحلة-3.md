# خطة تنفيذ نهائية (مُتحقّق منها بالكود الفعلي): إلغاء نظام الأوفلاين في الكتابة — الإبقاء على القراءة/الاطلاع فقط

**تاريخ الإعداد:** 13 سبتمبر 2026 (نسخة v3 — بعد جولة تحقق ثالثة، ملف ملف وزر زر، بـgrep/view مباشر على الريبو المرفوع فعليًا، مش على الجردين السابقين كافتراض)
**القرار المرجعي:** المنظومة تفترض حاليًا إن المحامي ممكن يكتب/يعدّل وهو أوفلاين بالكامل ثم تتم مزامنة البيانات لاحقًا. تقرر إلغاء هذا الافتراض بالكامل: **الكتابة تتطلب اتصال دائمًا**، والأوفلاين يبقى مسموحًا به فقط للقراءة/الاطلاع على بيانات محمّلة مسبقًا.

**المبدأ الحاكم لكل مرحلة:** قبل أي تعديل فعلي، تُفحص كل السيناريوهات المترتبة عليه. وبعد كل مرحلة: فحص شامل بالكود الفعلي للتأكد إن مفيش جزء تاني اتأثر بدون قصد — قبل الانتقال للمرحلة اللي بعدها.

**ملاحظة مصدر (v3):** هذه النسخة هي دمج نهائي لثلاث جولات جرد: (1) التقرير الأصلي، (2) إعادة جرد بالكود صحّحت 3 أرقام مؤثرة وأضافت 2 ملاحظة جديدة (🔧)، (3) تحقق ثالث نهائي راجع **كل بند فى النسختين السابقتين سطر بسطر** ضد الريبو — أكّد صحة كل الأرقام الحرجة تقريبًا، وصحّح تفصيلة عدّ صغيرة واحدة + أضاف ملاحظة تنظيف اختيارية واحدة (✅ علامة التحقق النهائي).

---

## 0) نتائج الجرد الكامل (مُدقّقة ثلاث مرات)

| المكوّن | الحجم/النطاق | الوظيفة |
|---|---|---|
| `src/lib/offlineQueue.ts` | 558 سطر ✅ | تعريف `window.__dbWrite` + طابور IndexedDB + `dbFrom` |
| `src/lib/offlineSync.ts` | 644 سطر ✅ | حل الـ temp-IDs (`resolveOfflineFkRefs`/`resolveOfflineSelfId`) + `runOfflineSync` |
| `src/shared/lib/offlineGuard.ts` | 171 سطر ✅ | **مختلط**: فيه `runDuplicateCheckOfflineAware` (مرتبط بالكتابة) لكن كمان `createFetchGuard`/`runReadWithRetry` (خاصين بالقراءة فقط) |
| `public/sw.js` (Service Worker) | 253 سطر ✅ | Background Sync API (`event.tag === 'sync-offline-queue'`، يبدأ سطر 148 بالضبط ✅) — الكاش (أسطر 75-146 ✅) منفصل عنه بوضوح تام فى الكود |
| نقاط نداء `__dbWrite` الفعلية | **52 نقطة فى 13 ملف feature** ✅ (عُدّت واحدة واحدة، مطابقة تمامًا) | قضايا، موكلين، أتعاب، جلسات/كالندر، تذكيرات، أطراف دعوى |
| جداول مغطاة بالطابور | 8 جداول ✅ (مؤكد بالحرف، ومطابق لتعريف النوع `DbWriteTable` نفسه بدون أي فرق) | `clients`, `cases`, `case_sessions`, `reminders`, `case_fees`, `fee_payments`, `case_notes`, `case_parties` |
| رسائل UI "هيتزامن لما النت يرجع" | **11 ملف ✅ — لكن 24 رسالة إجمالاً، مش 21** (✅ تصحيح v3، راجع تفصيل تحت) | كل هوكس الكتابة (كالندر + قضايا + موكلين + أتعاب + تذكيرات)، مش مودالز الكالندر بس |
| حقول sentinel (`_offlineFkTempId`/`_offlineSelfTempId`/`_offlineTempId`/`_offlineCaseTempId`) | ⚠️ لا يُعتمد رقم ثابت — **يُعاد عدّها فعليًا وقت تنفيذ المرحلة 3** (نقاط التوليد الأربعة الأساسية مؤكدة ✅: `useCaseCrudActions.ts:120`, `useClientActions.ts:265`, `useClientLinking.ts:195`, `StandaloneSessionDetailModal.tsx:558`) | **بعضها بيتبعت بشكل غير مشروط** — تفصيلة حرجة، راجع المرحلة 3 |
| اختبارات مرتبطة | 11 ملف إجمالاً ✅ (كل الأسماء والمسارات اتأكدت موجودة فعليًا بدون نقص/زيادة) | راجع الجدول التفصيلي تحت |

### تفصيل ملفات الاختبار (مؤكَّد ✅)
- **8 ملفات feature-hook** بترجع/تتوقع `offline`/`queued`/`conflict` من mock الـ`__dbWrite`: `useRemindersTab.test.ts`, `useFeesActions.test.ts`, `useCaseActions.test.ts`, `useCaseSessions.test.ts`, `useCaseDetailActions.test.ts`, `useClientActions.test.ts`, `useClientLinking.test.ts`, `caseSessionLinkingShared.test.ts`.
- **3 ملفات اختبار مخصصة بالكامل للأوفلاين، موجودة فعليًا فى الريبو**: `src/lib/offlineQueue.banner.test.ts`, `src/lib/offlineQueue.fkTempId.test.ts`, `src/lib/offlineQueue.integration.test.ts`.
- **استثناء صريح مؤكَّد ✅:** `src/shared/lib/dataAccess.test.ts` **ليس** من هذه القائمة — كل ذكر "conflict" فيه فحصته سطر سطر، وكله خاص بـ`safeUpdate` (optimistic locking، مستقل عن الأوفلاين تمامًا). **لا يُلمس فى المرحلة 5.**
- `offlineGuard.retry.test.ts` (خاص بـ`runReadWithRetry` — قراءة) يفضل زي ما هو بالكامل، متتلمسش خالص.

### 🔴 اكتشاف حرج يحكم الخطة كلها: `__dbWrite` مش "أوفلاين" بس (مؤكَّد ✅)

فحص `__dbWrite` (السطور 363-454 من `offlineQueue.ts`) أظهر إنها بتعمل **4 وظائف مدمجة**، **اتنين منهم مالهمش أي علاقة بالأوفلاين** ولازم يتحافظ عليهم:

1. الكتابة العادية أونلاين (INSERT/UPDATE/DELETE) — تفضل.
2. **Optimistic locking / كشف تعارض التعديل المتزامن** (عن طريق `knownUpdatedAt`) — حماية مستقلة تمامًا عن الأوفلاين — **يجب الإبقاء عليها**.
3. **كشف الرفض الصامت من RLS** (`lockErrorIfNoRowsAffected`) — بيكشف لو مكتب مقفول (readonly tenant) رفض العملية بصمت. **مالوش علاقة بالأوفلاين، يجب الإبقاء عليه**.
4. فشل الطلب → حفظ في طابور محلي والمزامنة لاحقًا — **ده الجزء الوحيد المطلوب إلغاؤه**.

**الخطورة لو اتجوهرت النقطة دي:** حذف `__dbWrite` بالكامل (بدل تبسيطها) هيرجّع باگ RLS الصامت وهيلغي حماية تعارض التعديل المتزامن من غير قصد.

### 0.1) توسعة الجرد — كل نداء كتابة فى المشروع (مش بس `__dbWrite`) — مؤكد ✅ بالفحص الفعلي (صفر `navigator.onLine` فى كل الخمسة دول، تأكدت بالـgrep)

| الملف | الوظيفة | الحالة الحالية |
|---|---|---|
| `useAdminBackup.ts` | نسخ احتياطي (إدارة) | 🔴 بدون حماية |
| `useAdminLegalLibrary.ts` | الموسوعة القانونية (إضافة/تعديل/حذف) | 🔴 بدون حماية |
| `useAdminOffice.ts` + `constants.ts` (`saveOfficeSetting`) | إعدادات المكتب | 🔴 بدون حماية |
| `useAdminUsers.ts` | إدارة المستخدمين (إضافة/تعديل/حذف) | 🔴 بدون حماية |
| `TermsAcceptanceScreen.tsx` | قبول الشروط والأحكام (نداء `db.from('terms_acceptances').insert` مباشر، سطر 40) | 🔴 بدون حماية |
| `ArchiveTab.tsx` (تاب الأرشيف بالداشبورد) | رفع/حذف مستند من الأرشيف | 🔴 بدون حماية — **تكرار غير متسق** لنفس وظيفة `useCaseDocuments.ts` المحمية أصلًا (منع صريح مؤكَّد سطر 75 و136 بالحرف) |
| `useCaseDocuments.ts` | رفع/حذف مستند (الشاشة الأساسية) | ✅ محمي فعليًا |
| `useAdminArchive.ts` | حذف/استرجاع قضية، موكل، أتعاب (أرشيف) | 🔴 بدون حماية — يستخدم `db.from()` مباشر (10 نداءات مؤكَّدة)، بعكس `useFeesActions.ts` العادي اللي بيمر بـ`__dbWrite` |

**ملاحظة (0.2) — 3 نقاط إدراج خام إضافية، غير حرجة (مؤكَّدة ✅):**

| الملف والسطر | الوظيفة | القرار |
|---|---|---|
| `useCaseCrudActions.ts:304` | إدراج الجلسة الأولى تلقائيًا عند حفظ قضية جديدة (`case_sessions`) | لا حاجة لحماية منفصلة — تابعة لعملية `__dbWrite` أساسية سابقة لها فى نفس الفنكشن، هتتمنع أصلًا فى المرحلة 1 |
| `useCaseCrudActions.ts:768` | نفس الشيء عند تعديل تاريخ قضية موجودة | نفس القرار |
| `caseSessionLinkingShared.ts:557` | إدراج أطراف الدعوى (`case_parties`) عند نقل جلسة مستقلة لقضية | نفس القرار |

**مُستبعدين من الحماية عن قصد (كتابة خلفية، فشلها صامت ومقصود):** `heartbeat.ts`، `logActivity` (`dataAccess.ts`)، `recalcNextHearing` (`dataAccess.ts`).

---

## 🔴🔴 3 اكتشافات إضافية مهمة (من الجولة الثانية، مؤكَّدة كلها ✅ فى الجولة الثالثة)

### أ) `index.html` فيه UI حقيقي مكتوب بالحرف عن الأوفلاين
عنصرين DOM ثابتين فى `index.html` (سطر 49-56 ✅) مش React components:
```html
<div id="offline-banner">
    <span id="offline-banner-text">أنت الآن offline — التعديلات تُحفظ محلياً وتُزامن عند عودة الاتصال</span>
    <span id="offline-queue-badge" ...></span>
</div>
<div id="sync-indicator">
    <span id="sync-text">جاري المزامنة...</span>
</div>
```
بيتحكم فيهم `showOfflineBanner`/`hideOfflineBanner`/`showSyncIndicator`/`hideSyncIndicator` فى `notifications.ts`. **تأكيد نهائي ✅:** الدوال الأربعة دول متستخدمين **بس** من `offlineQueue.ts`/`offlineSync.ts` وتستاتهم — `useDbConnectivity.ts`/`useTenantSubscriptionStatus.ts` لا يستخدموهم خالص، فمفيش تعارض. و`offline-queue-badge` مفيش أي React component بيعرض عدده حاليًا.
- ممكن تتشال الدوال الأربعة بالكامل مع حذف الطابور (المرحلة 2) بأمان.
- لكن **نص العنصرين فى `index.html` نفسه غلط بعد التنفيذ** ولازم يتحذف/يتحدّث كجزء رسمي من المرحلة 2 — **`index.html` لازم يُضاف لقائمة ملفات زيپ المرحلة 2**.

### ب) `forceQueueForSelfTempId` — ميكانيزم حقيقي بيفرض التأجيل حتى وإنت أونلاين
`offlineQueue.ts` سطر 383-384 ✅: لو `_offlineSelfTempId` موجود فى داتا UPDATE، الكود بيتجاهل `navigator.onLine` ويوديك فرع الطابور (لأن الـid المرتبط لسه تمبيد).
- **مؤكَّد ✅:** `_offlineSelfTempId` بيتحط بس لو `isOfflineTempId(caseId)` = true. بعد المرحلة 1، مفيش حاجة تتعمل أوفلاين خالص → مفيش temp-id هيتولد تانى → الفرع ده هيصبح مستحيل الوصول له.
- **شرط لازم يتأكد فى فحص ما بعد المرحلة 1، قبل حذف الآلية فى المرحلة 3:** التأكد إن الأربع نقاط توليد `tmp-` المعروفة (`useCaseCrudActions.ts:120`, `useClientActions.ts:265`, `useClientLinking.ts:195`, `StandaloneSessionDetailModal.tsx:558` — **الأربعة مؤكَّدة ✅ بالسطر بالظبط**) هي الوحيدة، وكلها بتتولّد **بدون شرط أوفلاين أصلًا** (fallback احتياطي دايم)، فلازم الأربعة تتفحص فى المرحلة 3 للتأكد من إزالة التوليد نفسه، مش بس التوقف عن استخدامه.

### جـ) 🔴 خطر عملي وقت النشر (Deploy) — بيانات معلّقة فعليًا فى IndexedDB عند المستخدمين
النظام الحالي بيخزن العمليات الفاشلة أوفلاين فى IndexedDB (`DB_NAME='sanad-offline'`, `STORE_NAME='queue'`) على جهاز المستخدم، وبيعتمد فى مزامنتها على `offlineSync.ts` اللي الخطة بتحذفه بالكامل فى المرحلة 2.
**المشكلة:** لو فيه محامي أوفلاين دلوقتي وعنده عمليات معلّقة، وبعدين النشر حصل — الكود الجديد **مفيهوش أي منطق يقرا أو يزامن الطابور القديم خالص**. العمليات دي هتفضل عالقة فى IndexedDB للأبد بصمت — المستخدم هيفتكر إن التعديل محفوظ لكنه ضايع فعليًا. **أخطر سيناريو فقدان بيانات فى الخطة كلها.**

**الحل المطلوب (قبل أو أثناء المرحلة 2):**
1. تأكيد يدوي/عملي إن مفيش عمليات معلّقة فى الطابور دلوقتي (`await window.__getOfflineQueueCount()` فى الكونسول قبل النشر على أي جهاز مستخدم فعلي).
2. **الأفضل تقنيًا:** كود "تفريغ/drain" مؤقت فى نسخة المرحلة 2 نفسها — عند تحميل التطبيق، لو لقى عناصر فى الطابور، يحاول يزامنهم بمنطق `offlineSync.ts` القديم مرة واحدة قبل حذفه نهائيًا (أو ينبه المستخدم).
3. لو مفيش مستخدمين فعليين تانيين حاليًا، الخطر ده بسيط وممكن يتجاهل — لكن يجب تأكيده صراحة قبل التنفيذ، مش افتراض.

---

## المرحلة 1 — تبسيط `__dbWrite` (إزالة الطابور فقط، الإبقاء على الـ locking وكشف RLS)

### السيناريوهات الواجب فحصها قبل التعديل
- كل الـ**52 نقطة نداء** (مؤكَّدة ✅) — هل أي منها بتتعامل مع `offline`/`queued` بشكل غير مجرد توست تنبيه؟ **أولوية فحص خاصة لـ`caseSessionLinkingShared.ts`** (12 نقطة، أكبر ملف، مشترك بين أكتر من مودال).
- `forceQueue` — مؤكَّد ✅ إنه مش متستخدم بقيمة `true` فى أي نداء حالي، لكن تأكيد نهائي قبل حذف الباراميتر نفسه.
- الدالة بترجع `data: insertedRow || updatedRow` — التأكد إن كل الكولرز لسه هياخدوا نفس الشكل بعد التبسيط.
- مسار الـINSERT بيستخدم `stripOfflineSentinels` — لازم يفضل موجود.
- الـ`catch` block الحالي بيتعامل مع فرق "أونلاين بس الطلب فشل فعليًا" — بعد الإلغاء، لازم يرجع خطأ واضح، مش يختفي بصمت.

### خطوات التنفيذ
1. تبسيط جسم `__dbWrite`: يفضل فرع الكتابة الأونلاين بالكامل (بما فيه الـlocking و`lockErrorIfNoRowsAffected`) كما هو.
2. الشرط `if (navigator.onLine && ...)` يتحول لتنفيذ مباشر دايمًا.
3. الـ`catch` يرجّع خطأ عادي واضح (مش queueing).
4. حذف باراميتر `forceQueue` و`forceQueueForSelfTempId` بعد تأكيد عدم الاستخدام.
5. التوقيع الخارجي للدالة يفضل كما هو — **الـ52 نقطة نداء متوقع إنها متتلمسش خالص**.

### فحص ما بعد التنفيذ
- مراجعة الـ**52 نقطة نداء فى 13 ملف** فعليًا للتأكد إن كل واحدة لسه بتستقبل نفس شكل الـreturn — **مع تركيز خاص على `caseSessionLinkingShared.ts`**.
- التأكد إن أي كود بيقرأ `error.message === 'conflict'` أو بيعتمد على شكل خطأ `lockErrorIfNoRowsAffected` لسه شغال زي ما هو.
- بحث شامل عن أي استخدام تاني لـ`forceQueue`/`forceQueueForSelfTempId` قبل حذفهم فعليًا.
- تأكيد يدوي إن الإدراجات الخام الثلاثة (0.2) بقت غير قابلة للتنفيذ أوفلاين تلقائيًا، بدون حاجة لتعديل كودها.

### معيار القبول
- **كل الـ52 نقطة نداء فى 13 ملف** تشتغل بدون تعديل فى ملفاتها.
- محاولة كتابة على مكتب مقفول (RLS) لسه بترجع رسالة القفل الصحيحة، مش رسالة اتصال عامة مضلّلة.
- تعديل متزامن لنفس السجل من جلستين لسه بيتكشف كـconflict.

---

## المرحلة 2 — إزالة البنية الميتة (الطابور، المزامنة، الـService Worker)

### السيناريوهات الواجب فحصها قبل التعديل
- `src/main.tsx` بيستورد `offlineQueue.ts` كـside-effect **قبل** `serviceWorkerBootstrap.ts` بترتيب مقصود (تعليق صريح، سطر 7-13 ✅) لأن مستمع رسائل الـSW (`SYNC_OFFLINE_QUEUE`) بينادي `window.__syncOfflineQueue`. أي إعادة ترتيب لازم تُفحص إنها مش هتكسر تسجيل الService Worker نفسه.
- ✅ **ملاحظة إضافية مؤكَّدة (جولة v3):** `serviceWorkerBootstrap.ts` سطر 65-66 بينادي فعليًا `await window.__syncOfflineQueue?.();` عند استقبال رسالة `SYNC_OFFLINE_QUEUE`. النداء بعلامة `?.()` فمش هيكسر لو الدالة اتشالت (هيبقى no-op بصمت)، لكن التعليق (سطر 5) والفرع نفسه هيفضلوا كود ميت/مضلّل بعد الحذف. **يُضاف لقائمة تنظيف اختيارية غير حرجة فى المرحلة 2** (مكانش مذكور صراحة كملف متأثر فى أي نسخة سابقة).
- `public/sw.js` بيحتوي كمان على `networkFirstWithCache`/`cacheFirstWithNetwork` (سطر 78-146 ✅) — دول خاصين بتخزين القراءة — **مؤكد إنهم منفصلين بوضوح** عن جزء Background Sync (يبدأ سطر 148 ✅).
- event listeners على `window` (`'online'`, `'load'`, setInterval كل دقيقة) فى `offlineQueue.ts` — مؤكَّد ✅ إن `useDbConnectivity.ts` و`useTenantSubscriptionStatus.ts` عندهم listeners منفصلة تمامًا لنفس الأحداث لكن لغرض مختلف (مؤشر حالة الاتصال)، ويفضلوا زي ما هم.
- `window.__getOfflineQueueCount` / `window.__syncOfflineQueue` — مؤكَّد ✅ مفيش أي UI بيعرض عدد العمليات المعلّقة حاليًا.

### خطوات التنفيذ
1. حذف `src/lib/offlineSync.ts` بالكامل.
2. حذف الأجزاء الخاصة بالطابور/IndexedDB/event listeners من `offlineQueue.ts` (الإبقاء على `__dbWrite` المبسّطة و`dbFrom` و`stripOfflineSentinels`).
3. تعديل `public/sw.js`: حذف `event.addEventListener('sync', ...)` وقسم `syncOfflineQueue` (سطر 148 فما بعد)، مع الإبقاء الكامل على استراتيجيات الكاش (75-146).
4. تحديث `src/main.tsx` لو استيراد `offlineQueue.ts` بقى غير لازم كside-effect بنفس الترتيب الحرج.
5. 🔴 تحديث/حذف عنصري `#offline-banner`/`#sync-indicator` فى `index.html` + حذف الدوال الأربعة من `notifications.ts`.
6. ✅ تنظيف اختياري: إزالة/تحديث الفرع الميت وتعليقه فى `serviceWorkerBootstrap.ts` (سطر 5 و65-66) — غير حرج وظيفيًا، لكنه تنظيف صحيح.
7. 🔴 قبل هذه المرحلة: تنفيذ خطوة التحقق من الطابور المعلّق (راجع "جـ" فوق).

### فحص ما بعد التنفيذ
- بحث شامل عن أي إشارة متبقية لـ`offlineSync`/`resolveOfflineFkRefs`/`resolveOfflineSelfId`/`runOfflineSync`.
- فحص `public/sw.js` سطر بسطر بعد التعديل للتأكد إن الكاش متأثرش.
- فتح التطبيق فعليًا والتأكد من رسالة الconsole عند تسجيل Service Worker.
- حذف ملفات الاختبار المخصصة الثلاثة (`offlineQueue.banner.test.ts`, `offlineQueue.fkTempId.test.ts`, `offlineQueue.integration.test.ts`) بالتوازي مع حذف مصادرها.

### معيار القبول
- الService Worker لسه بيسجّل نفسه صح ويخدم الكاش للقراءة أوفلاين.
- مفيش أي محاولة تسجيل فى IndexedDB أو background sync بعد الإلغاء.
- مؤشرات حالة الاتصال لسه شغالة عادي.
- 🔴 `index.html` مفيهوش نص متبقي يوعد بحفظ/مزامنة محلية للكتابة.
- 🔴 تأكيد مسبق (يدوي) إن مفيش عمليات معلّقة فى طابور IndexedDB عند أي مستخدم فعلي وقت النشر.

---

## المرحلة 3 — تنظيف حقول الـsentinel (`_offlineFkTempId` وأخواتها)

### السيناريوهات الواجب فحصها قبل التعديل
- **إعادة عدّ فعلية أولًا** (مش الاعتماد على أي تقدير مسبق): مسح كل استدعاءات `withFkOfflineSentinel(` و`withCaseSelfOfflineSentinel(` زائد أي object literal مباشر لنفس الحقول فى: `useCaseCrudActions.ts`, `useClientActions.ts`, `NewStandaloneSessionModal.tsx`. العدد النهائي يتحدد وقت التنفيذ من هذا المسح.
- `withFkOfflineSentinel` عندها فرع شرطي فعلي (`if (!(offline && queued)) return data;`)، لكن `withCaseSelfOfflineSentinel` شرطها على `isOfflineTempId(caseId)` مش على حالة الشبكة — ممكن تتبعت حتى لو الاتصال متاح دلوقتي (لو الـid لسه تمبيد من عملية سابقة). كل موضع لازم يتفحص فرديًا.
- لو حقل بيتبعت غير شرطي، وبعد الإلغاء مفيش أي جهة هتقرأه — استمراره فى الإرسال مش هيسبب خطأ (لسه بيتشال بـ`stripOfflineSentinels`) لكنه كود ميت يستحق التنظيف.
- التأكد إن منطق ربط "قضية جديدة اتعملت فى نفس الجلسة" بموكل/طرف دعوى لسه بيشتغل صح دلوقتي إن كل حاجة أونلاين.

### خطوات التنفيذ
1. مراجعة كل موضع (بعد إعادة العدّ) وتحديد: يتحذف / يتبسط / يفضل كما هو.
2. إزالة الإرسال غير الشرطي للحقول دي من نقاط الإنشاء بعد التأكد من النقطة أعلاه.

### فحص ما بعد التنفيذ
- إعادة تشغيل بحث `grep` عن كل حقول الsentinel بعد التعديل، للتأكد إن مفيش موضع اتنسى.
- تتبع كامل (يدوي، خطوة بخطوة) لسيناريو إنشاء قضية جديدة مربوطة بموكل جديد وطرف دعوى جديد فى نفس الفورم.
- تشغيل أي اختبار موجود لهذا السيناريو تحديدًا.

### معيار القبول
- إنشاء قضية بموكل جديد/طرف جديد فى نفس الخطوة لسه بيشتغل صح أونلاين.
- مفيش حقول `_offline*` بتتبعت لـSupabase (تتأكد بفحص الpayload الفعلي).

---

## المرحلة 4 — توحيد رسائل المنع + حل كل التضاربات المكتشفة

### أ) الجزء المكتشف من البداية (قضية/موكل/أتعاب)
- الحذف/الأرشفة/الاسترجاع للقضية والموكل (`useCaseCrudActions.ts`, `useClientActions.ts`, وتكرارهم فى `useAdminArchive.ts`) أصلًا مش بيستخدموا `__dbWrite` — محتاجين **رسالة منع صريحة موحدة**.
- الأتعاب فيها تضارب فعلي مؤكَّد ✅: `useFeesActions.ts` بيستخدم `__dbWrite`، لكن `useAdminArchive.ts` بيستخدم `db.from()` مباشر. بعد المرحلة 1، الاتنين هيبقوا متطابقين سلوكيًا كأثر جانبي — يستاهل تأكيد صريح بعد المرحلة 1.
- **قرار مؤكد (13 سبتمبر 2026):** رسالة "يتطلب اتصالاً بالإنترنت" تتطبق على الحذف/الأرشفة/الاسترجاع كمان (قضية، موكل، أتعاب، من الشاشة العادية وشاشة الأرشيف).

### ب) الجزء الموسّع
- `ArchiveTab.tsx` لازم ياخد **نفس** المنع الموجود فعليًا فى `useCaseDocuments.ts` بالحرف (سطر 75/136) — مش نسخة جديدة مختلفة.
- `useAdminBackup.ts`/`useAdminLegalLibrary.ts`/`useAdminOffice.ts`+`constants.ts`/`useAdminUsers.ts`/`useAdminArchive.ts` — كل واحد لازم يتفحص فرديًا، برسالة مخصصة لكل سياق.
- `TermsAcceptanceScreen.tsx` — سيناريو نادر عمليًا (تسجيل الدخول نفسه محتاج نت)، يستاهل تأكيد قبل إضافة حماية بلا داعي.
- الإدراجات الخام الثلاثة (0.2) — لا تحتاج تعديل فى هذه المرحلة (محمية بشكل غير مباشر من المرحلة 1).

### ✅ خطوة موحدة الرسائل — العدد الصحيح المُتحقق منه (تصحيح v3)

الفحص الفعلي (سطر بسطر، مش عدّ سريع) لقى نفس نمط توست "هيتزامن/محفوظ محليًا" فى **11 ملف**، لكن **العدد الإجمالي 24 رسالة مش 21** — 3 ملفات فيهم رسالة إضافية عن أي عدّ سابق:

| الملف | عدد الرسائل الفعلي (مؤكَّد بالسطر) |
|---|---|
| `useRemindersTab.ts` | 3 |
| `useFeesActions.ts` | 3 |
| `useCaseDetailActions.ts` | 3 |
| `useCaseCrudActions.ts` | **2** (سطر 253 + سطر 717) |
| `useCaseClientLinking.ts` | 2 |
| `useCaseSessions.ts` | 3 |
| `useClientLinking.ts` (calendar) | **2** (سطر 244 + سطر 398) |
| `NewStandaloneSessionModal.tsx` | 1 |
| `SessionUpdateModal.tsx` | 1 |
| `EditStandaloneModal.tsx` | 1 |
| `StandaloneSessionDetailModal.tsx` | **3** (سطر 509 + سطر 612 + سطر 704) |
| **الإجمالي** | **24** |

**⚠️ تحذير تنفيذي:** أي عدّ سابق لهذا الجدول (بما فيه أي نسخة قديمة من هذا التقرير) كان بيسجّل 1 فى `useCaseCrudActions.ts`، 1 فى `useClientLinking.ts`، و2 فى `StandaloneSessionDetailModal.tsx`. **لو التنفيذ اعتمد على العدد القديم، هيفضل رسالة قديمة واحدة فى كل ملف من التلاتة دول متحدّثتش.** الخطوة الأولى الإلزامية قبل التنفيذ: `grep -n "عودة الإنترنت\|عودة النت"` (أو ما يعادلها) على الـ11 ملف تحديدًا، بدل الاعتماد على أي جدول مكتوب.

### خطوات التنفيذ
1. توحيد نمط فحص `navigator.onLine` قبل المحاولة (منع صريح) عبر: حذف/أرشفة/استرجاع قضية، موكل، أتعاب — فى كل من الشاشة العادية وشاشة الأرشيف.
2. تحديث **كل الرسائل الـ24** (مش 21، ومش 11 كعدد سطحي) فى الملفات الـ11 لنفس نمط المنع الصريح.
3. تطبيق نفس النمط على `ArchiveTab.tsx` (مطابقًا لـ`useCaseDocuments.ts` بالحرف)، و`useAdminBackup.ts`/`useAdminLegalLibrary.ts`/`useAdminOffice.ts`/`constants.ts`/`useAdminUsers.ts`/`useAdminArchive.ts` (برسالة مخصصة لكل سياق).
4. `TermsAcceptanceScreen.tsx` — يُقرر بعد الفحص: حماية أم استبعاد بنفس منطق `heartbeat.ts`.

### فحص ما بعد التنفيذ
- مراجعة `useFeesActions.ts` و`useAdminArchive.ts` جنبًا لجنب للتأكد إنهم بقوا متطابقين سلوكيًا.
- مراجعة `ArchiveTab.tsx` و`useCaseDocuments.ts` جنبًا لجنب لنفس السبب.
- فحص كل شاشة بتستخدم `handleDeleteCase`/`handleRestoreCase`/مقابلاتها، وكل شاشات الإدارة.
- ✅ التأكد إن كل الـ**24 رسالة** (مش عدد الملفات فقط) بقت تعرض نفس نمط المنع الصريح.

### معيار القبول
- كل عمليات الحذف/الأرشفة/الاسترجاع (قضية، موكل، أتعاب، مستندات، وكل شاشات الإدارة) — من أي شاشة — بتدّي نفس نمط الرسالة الواضحة وبنفس السلوك بالظبط وقت انقطاع النت.

---

## المرحلة 5 — تحديث الاختبارات

### السيناريوهات الواجب فحصها قبل التعديل
- **8 ملفات feature-hook** (`useRemindersTab.test.ts`, `useFeesActions.test.ts`, `useCaseActions.test.ts`, `useCaseSessions.test.ts`, `useCaseDetailActions.test.ts`, `useClientActions.test.ts`, `useClientLinking.test.ts`, `caseSessionLinkingShared.test.ts`) بتتوقع `offline`/`queued`/`conflict` كmock من `__dbWrite` — بعد التبسيط هتبقى دايمًا `false`/`undefined`.
- `offlineGuard.retry.test.ts` — خاص بـ`runReadWithRetry` (قراءة)، **يفضل زي ما هو بالكامل**.
- **3 ملفات اختبار مخصصة للأوفلاين موجودة فعليًا** (مؤكَّد ✅): `offlineQueue.banner.test.ts`, `offlineQueue.fkTempId.test.ts`, `offlineQueue.integration.test.ts` — تُحذف مع حذف مصادرها فى المرحلة 2.
- **استثناء صريح مؤكَّد ✅:** `dataAccess.test.ts` **لا يُلمس** — بيختبر `safeUpdate` (optimistic locking) مش الأوفلاين.

### خطوات التنفيذ
1. تحديث الmocks فى الـ8 ملفات feature-hook.
2. حذف أي اختبار كان يغطي سيناريو "أوفلاين ثم مزامنة" تحديدًا.
3. حذف 3 ملفات الاختبار المخصصة الموجودة فعليًا بالتوازي مع حذف `offlineQueue.ts`/`offlineSync.ts`.

### فحص ما بعد التنفيذ
- تشغيل الsuite كامل على CI الحقيقي، للتأكد إن تعديلات المراحل 1-4 مكسرتش أي اختبار تاني.
- مراجعة أي اختبار "أخضر" بالصدفة (false positive) بسبب mock ناقص.
- التأكد إن `dataAccess.test.ts` فضل كما هو تمامًا (صفر تعديل).

### معيار القبول
- كل التستات تعدي على CI الحقيقي.

---

## المرحلة 6 — قرار (لا تأكيد فقط) على `offlineGuard.ts`

### السيناريوهات الواجب فحصها
- `runDuplicateCheckOfflineAware` **مؤكد ✅ فيها فرع أوفلاين حقيقي**: `if (guard.offline) return { skipped: true };` (سطر 73 بالحرف). بعد المرحلة 4، هذا الفرع **هيصبح كود ميت عمليًا** — مستحيل الوصول له لأن أي عملية حفظ هتُمنع قبل الوصول لفحص التكرار من الأساس.
- `createFetchGuard`/`runReadWithRetry` — تأكيد إنهم بيُستخدموا فى مسارات قراءة بس قبل ما نقول إنهم "متتلمسش خالص".

### خطوات التنفيذ
- **قرار مطلوب مش تأكيد بلا تعديل:** تبسيط `runDuplicateCheckOfflineAware` بحذف فرع `guard.offline` (بنفس منطق المرحلة 1)، مع الإبقاء على باقي منطق فحص التكرار.
- التأكد إن `createFetchGuard`/`runReadWithRetry` مفيش أي استخدام مختلط فى مسار كتابة، ويفضلوا زي ما هم.

### فحص ما بعد التنفيذ
- التأكد إن فحص التكرار عند إنشاء قضية/موكل لسه بيشتغل صح أونلاين بعد التبسيط.
- التأكد إن `runReadWithRetry`/`createFetchGuard` لسه مستخدمين فى نفس أماكنهم بنفس السلوك.

---

## المرحلة 7 — اختبار يدوي شامل (Manual QA)

قائمة سيناريوهات لازم تتجرب فعليًا (فصل نت حقيقي، مش محاكاة) بعد كل التعديلات:
- محاولة إضافة/تعديل قضية وهو النت مفصول → رسالة منع واضحة، مفيش حفظ محلي، مفيش فقدان لبيانات الفورم.
- محاولة حذف/أرشفة/استرجاع قضية/موكل/أتعاب وهو النت مفصول (الشاشة العادية وشاشة الأرشيف) → نفس رسالة المنع.
- فتح التطبيق وهو أوفلاين بعد ما بياناته اتحمّلت قبل كده أونلاين → القراءة/الاطلاع لسه شغالة من الكاش.
- رجوع النت أثناء استخدام التطبيق → مفيش محاولة مزامنة تلقائية تحصل فى الخلفية.
- تعديل نفس القضية من جلستين فى نفس الوقت وهما أونلاين → لسه بيتكشف كـconflict صح.
- محاولة كتابة على مكتب مقفول (RLS/tenant_write_allowed) → لسه بترجع رسالة القفل الصحيحة.
- حفظ قضية جديدة/تعديل تاريخ قضية بتاريخ جلسة (بيتسجل جلسة أولى تلقائيًا) وهو النت مفصول → المنع بيحصل عند خطوة حفظ القضية نفسها، ومفيش محاولة إدراج جلسة أولى ناقصة تحصل بعد المنع.

---

## ترتيب التسليم

بعد كل مرحلة: **هذا التقرير نفسه محدّثًا** + **zip يحتوي فقط على الملفات المتغيرة في تلك المرحلة، كل ملف في مساره الصحيح داخل الريبو**. قبل الانتقال للمرحلة اللي بعدها. المراحل 1-2 هي الأهم والأخطر تقنيًا وتستاهل أكبر وقت فحص؛ المراحل 3-6 أصغر وأوضح.

**🔴 التزام إلزامي بخصوص الحذف:** الزيب بيوصّل بس الملفات الجديدة/المعدّلة — أي ملف مطلوب **حذفه بالكامل** فى المرحلة (مش تعديله) مش هيكون موجود فى الزيب أصلًا. لازم فى كل تقرير مرحلة قسم صريح باسم "الملفات المطلوب حذفها يدويًا" يسرد المسارات كاملة، حتى لو القائمة فاضية (يُذكر صراحة "لا يوجد ملفات للحذف فى هذه المرحلة" بدل السكوت). هذا غير قابل للتفويت فى أي مرحلة قادمة.

---

## جدول حالة تنفيذ المراحل

| المرحلة | الوصف | الحالة |
|---|---|---|
| 0 | الجرد الكامل (مُدقّق **ثلاث** مرات، آخرها فحص سطر بسطر على الكود الفعلي) | ✅ تم |
| 1 | تبسيط `__dbWrite` (52 نقطة/13 ملف، إزالة الطابور، الإبقاء على locking وكشف RLS) | ✅ تم (13 سبتمبر 2026) — CI حقيقي ناجح (مؤكَّد من بي) |
| 2 | إزالة البنية الميتة (`offlineSync.ts`، أجزاء الطابور، Background Sync، حذف 3 ملفات اختبار) + تحديث `index.html`/`notifications.ts` + تأكيد تفريغ الطابور المعلّق + تنظيف اختياري فى `serviceWorkerBootstrap.ts` | ✅ تم (13 سبتمبر 2026) — CI حقيقي ناجح (مؤكَّد من بي) |
| 3 | تنظيف حقول sentinel (عدد يُحدّد بإعادة عد فعلية وقت التنفيذ) | ✅ تم (13 سبتمبر 2026) — CI حقيقي لم يُشغَّل بعد (راجع تقرير المرحلة تحت) |
| 4 | توحيد رسائل المنع — **24 رسالة فى 11 ملف** (✅ عدد مُتحقق منه نهائيًا) + حل كل التضاربات | ⬜ لم يبدأ |
| 5 | تحديث الاختبارات (8 ملفات feature + 3 ملفات أوفلاين مخصصة، استثناء `dataAccess.test.ts` صريح) | ⬜ لم يبدأ |
| 6 | قرار فعلي (لا تأكيد فقط) على حذف فرع `guard.offline` فى `offlineGuard.ts` | ⬜ لم يبدأ |
| 7 | اختبار يدوي شامل (Manual QA) + سيناريو الجلسة الأولى التلقائية | ⬜ لم يبدأ |

---

## ✅ تقرير تنفيذ المرحلة 1 (13 سبتمبر 2026)

**الملف الوحيد المتغيّر:** `src/lib/offlineQueue.ts` (زيب مُسلَّم: `sanad-phase1-offline-removal.zip`، بنفس مسار الريبو الحقيقي `src/lib/offlineQueue.ts`).

### تأكيد أولي قبل التنفيذ
فحصت الريبو الفعلي المرفوع أولًا (`sanad-legal2-main`) بدل الاعتماد على أي افتراض: تأكدت إن `forceQueue`/`forceQueueForSelfTempId`/شرط `navigator.onLine` كانوا لسه موجودين بالكامل — يعني المرحلة فعلاً لم تُنفَّذ قبل كده على النسخة دي (كما أكّدت بنفسك).

### اللي اتنفّذ بالحرف حسب خطوات المرحلة
1. جسم `__dbWrite`: فرع الكتابة الأونلاين (INSERT/UPDATE/DELETE) اتحافظ عليه **بدون أي تعديل فى منطقه** — بما فيه Optimistic Locking (`knownUpdatedAt`) و`lockErrorIfNoRowsAffected` (كشف الرفض الصامت من RLS).
2. الشرط `if (navigator.onLine && !forceQueueForSelfTempId && !forceQueue)` اتشال بالكامل — الكود دلوقتي بيحاول التنفيذ المباشر دايمًا، مفيش فرع بديل.
3. الـ`catch` بقى يرجّع خطأ واضح (`{ error: { message: 'تعذّر الاتصال بالسيرفر...' }, offline: false }`) بدل التقييد فى IndexedDB.
4. باراميتر `forceQueue` اتشال من التوقيع الخارجي (`Window.__dbWrite`) وجسم الدالة، و`forceQueueForSelfTempId` اتشالت بالكامل معاه. تأكدت (بحث `grep` شامل فى كل ملفات `src/`) إن مفيش أي نداء فى المشروع كان بيبعت `forceQueue` بأي قيمة (الاستخدامات الوحيدة كانت تعليقات توثيقية فى `useCaseSessions.test.ts` و`useClientLinking.ts`، مش نداءات فعلية).
5. التوقيع الخارجي فضل كما هو تمامًا (نفس أسماء الحقول: `type/table/data/id/knownUpdatedAt/returning`، ونفس شكل الـreturn `{error, offline, queued, data, conflict}` — بس `offline`/`queued` هيبقوا دايمًا `false`/`undefined` بدل ما يترجعوا `true` وقت الفشل).

### فحص ما بعد التنفيذ (زي ما الخطة نصّت)
- ✅ عددت فعليًا كل ملفات الـ`__dbWrite` (`grep -rl`): 13 ملف feature حقيقي + ملف تست واحد — مطابق تمامًا لعدد الخطة (13 ملف).
- ✅ راجعت نمط `if (offline && queued)` فى `useCaseCrudActions.ts` تحديدًا (سطر 223 و716) — تأكدت إنه شرط مركّب هيتقيّم `false` تلقائيًا دلوقتي، فالكولر هيعدي على `else if (error)` العادي مباشرة.
- ✅ تتبعت الإدراج الخام (بند 0.2) فى نفس الملف: البنية فعليًا `if (offline && queued) {...} else if (error) { return false; } else { /* الإدراج الخام هنا */ }` — بما إن `offline && queued` بقت `false` دايمًا، أي فشل حقيقي (نت مقطوع) هيوقف عند `else if (error)` **قبل** الوصول للإدراج الخام، بالظبط زي ما الخطة توقعت.
- ✅ بحث شامل: مفيش أي استخدام تاني لـ`forceQueue`/`forceQueueForSelfTempId` فى المشروع غير التعليقات التوثيقية.
- ⚠️ **`error.message === 'conflict'`**: الفحص باقٍ كما هو (فرع الـconflict لسه بيرجّع `{ error: { message: 'conflict' }, conflict: true, offline: false }` بدون أي تعديل).

### ⚠️ ملاحظة أمانة مهمة — تحديث: تم تشغيل CI فعلي بنجاح
البيئة اللي بيّني اشتغلت فيها من غير إنترنت (`npm ci` فشل بخطأ 403)، فعملت وقتها فحص syntax/type منعزل بس (مش CI حقيقي). **بي شغّل بعد كده CI حقيقي (`npm test`/`tsc`/`eslint`/`vite build`) على تعديل المرحلة 1 وأكّد النجاح.** الفحص المعزول اللي عملته وقتها:
- فحص syntax/type منعزل بـTypeScript compiler عام (مش نسخة المشروع) على الملف بمفرده — صفر أخطاء syntax أو type حقيقية فى الملف نفسه.
- تأكدت من توازن الأقواس برمجيًا (`{`/`}`) على الملف كامل.
- مراجعة يدوية كاملة لكل الـ13 ملف نداء ضد الشكل الجديد للـreturn.

### الملفات المطلوب حذفها يدويًا فى هذه المرحلة
لا يوجد. المرحلة 1 تعديل فى ملف موجود بس (`src/lib/offlineQueue.ts`)، صفر حذف.

### خطوة معلّقة من "مراجعة ثالثة — جـ" (خطر البيانات المعلّقة وقت النشر) — ✅ اتحلّت
بي أكّد إن كل الحسابات الحالية حسابات تجربة شخصية بتاعته، مفيش مستخدمين فعليين تانيين — فمخاطر العمليات المعلّقة فى IndexedDB عند مستخدمين حقيقيين غير واردة حاليًا.

### الخطوة الجاية
المرحلة 2 اتنفّذت بالفعل (راجع تقريرها تحت).

---

## ✅ تقرير تنفيذ المرحلة 2 (13 سبتمبر 2026)

**تأكيد مسبق:** بي أكّد صراحة إن كل الحسابات الحالية حسابات تجربة شخصية، فمفيش خطر بيانات معلّقة فى IndexedDB عند مستخدمين فعليين — القيد المذكور فى "مراجعة ثالثة — جـ" اتلغى.

### الملفات المطلوب حذفها يدويًا فى هذه المرحلة
- `src/lib/offlineSync.ts`
- `src/lib/offlineQueue.banner.test.ts`
- `src/lib/offlineQueue.fkTempId.test.ts`
- `src/lib/offlineQueue.integration.test.ts`

### الملفات المتغيّرة (زيب مُسلَّم: `sanad-phase2-offline-removal.zip`، بمسارات الريبو الحقيقية)
1. **`src/lib/offlineQueue.ts`** — إعادة كتابة كاملة: اتشال كل شئ خاص بالطابور (IndexedDB: `DB_NAME`/`openOfflineDB`/`__offlineEnqueue`/`__getOfflineQueue`/`__getOfflineQueueCount`/`__deleteOfflineItem`/`__updateOfflineItem`/`OfflineQueueItem`)، Background Sync registration، تعريف `window.__syncOfflineQueue` والمزامنة التلقائية (`__runOfflineSyncIfNeeded` + مستمعي `online`/`load`/`setInterval`)، وبانرات الشبكة (`window.addEventListener('offline'/'online')` اللي كانت بتنادي `showOfflineBanner`/`hideOfflineBanner`/`showSyncIndicator`). فضل بس: `dbFrom`، `DbWriteTable`، `stripOfflineSentinels`، و`__dbWrite` المبسّطة من المرحلة 1 (بدون أي تعديل إضافي فى منطقها).
2. **`public/sw.js`** — حذف قسم Background Sync كامل (`self.addEventListener('sync', ...)` + دالة `syncOfflineQueue`). استراتيجيات الكاش (`networkFirstWithCache`/`cacheFirstWithNetwork`) والـPush Notifications فضلوا زي ما هم بدون أي تعديل.
3. **`src/lib/serviceWorkerBootstrap.ts`** — تنظيف الفرع الميت: شلت مستمع رسالة `SYNC_OFFLINE_QUEUE` من الـService Worker (كان بينادي `window.__syncOfflineQueue` اللي اتشالت)، وحدّثت التعليق اللي كان بيوثّق ترتيب الاستيراد (اعتماد `main.tsx` القديم اتلغى).
4. **`src/main.tsx`** — تحديث التعليق التوثيقي بس (ترتيب استيراد `offlineQueue.ts` قبل `serviceWorkerBootstrap.ts` مبقاش شرط حرج بعد إلغاء `__syncOfflineQueue`، لكن سبتهم بنفس الترتيب لأن `offlineQueue.ts` لسه لازم يتحمّل بدري عشان يعرّف `__dbWrite`).
5. **`index.html`** — حذف عنصري `#offline-banner`/`#sync-indicator` بالكامل من الـDOM (كان فيهم نص حرفي غلط بعد الإلغاء: "التعديلات تُحفظ محلياً وتُزامن عند عودة الاتصال").
6. **`src/shared/lib/notifications.ts`** — حذف الدوال الأربعة `showOfflineBanner`/`hideOfflineBanner`/`showSyncIndicator`/`hideSyncIndicator` بالكامل (كانت مستخدمة بس من الملفات المحذوفة وتستاتهم — تأكدت بـ`grep` شامل قبل الحذف).
7. **`src/index.css`** — حذف الـCSS المرتبط بالعنصرين المحذوفين (`#offline-banner`, `#sync-indicator`, `.sync-dot`, `@keyframes syncPulse`) كتنظيف إضافي (مش مذكور صراحة فى نص الخطة، لكنه كود ميت واضح بعد حذف العناصر).

### فحص ما بعد التنفيذ
- ✅ بحث `grep` شامل على المشروع كله للتأكد من صفر إشارة متبقية لأي من: `offlineSync`، `resolveOfflineFkRefs`، `resolveOfflineSelfId`، `runOfflineSync`، `showOfflineBanner`/`hideOfflineBanner`/`showSyncIndicator`/`hideSyncIndicator`، `__offlineEnqueue`/`__getOfflineQueue`/`__getOfflineQueueCount`/`__deleteOfflineItem`/`__updateOfflineItem`/`__syncOfflineQueue`/`OfflineQueueItem`، `forceQueue` — الوحيد اللي فضل تعليقات توثيقية فى ملفات هتتنضف فى المرحلة 3 (`useClientActions.ts`، `caseSessionLinkingShared.ts`، `useClientLinking.ts` — بيوثّقوا آلية الـsentinel نفسها اللي المرحلة 3 هتشيلها).
- ✅ تأكدت إن `useDbConnectivity.ts`/`useTenantSubscriptionStatus.ts` عندهم مستمعي `online`/`offline` منفصلين تمامًا (لمؤشر حالة الاتصال العام، مش الأوفلاين-رايتينج) وفضلوا بدون أي تعديل.
- ✅ فحص syntax معزول (TypeScript compiler عام + `node --check` لـ`sw.js`) على كل الملفات المتغيرة — صفر أخطاء حقيقية (الأخطاء اللي ظهرت أول مرة على `notifications.ts` لوحدها كانت بسبب عزل الفحص عن `serviceWorkerBootstrap.ts` اللي بيعرّف نفس الـglobal — اختفت لما اتفحصوا مع بعض).
- ✅ **CI حقيقي:** بي شغّل `npm test`/`tsc`/`eslint`/`vite build` الحقيقيين على تعديلات المرحلة 2 وأكّد النجاح.

### معيار القبول
- ✅ الـService Worker لسه بيسجّل نفسه ويخدم الكاش للقراءة أوفلاين (منطق الكاش متلمسش خالص).
- ✅ مفيش أي محاولة تسجيل فى IndexedDB أو Background Sync بعد الإلغاء (كل الكود اللي كان بيعملها اتحذف).
- ✅ مؤشرات حالة الاتصال العامة (`useDbConnectivity`/`useTenantSubscriptionStatus`) لسه شغالة عادي.
- ✅ `index.html` مفيهوش نص متبقي يوعد بحفظ/مزامنة محلية للكتابة.
- ✅ تأكيد مسبق من بي: مفيش عمليات معلّقة فى IndexedDB (حسابات تجربة بس حاليًا).
- ✅ CI حقيقي ناجح (مؤكَّد من بي).

### الخطوة الجاية (تاريخيًا — راجع تقرير المرحلة 3 تحت لتحديث الحالة)
المرحلتين 1 و2 اتأكّد نجاح الـCI الحقيقي عليهم.

---

## ✅ تقرير تنفيذ المرحلة 3 (13 سبتمبر 2026)

### تأكيد أولي قبل التنفيذ
فحصت الريبو الفعلي المرفوع (بعد المرحلتين 1 و2) أولًا: تأكدت `offlineSync.ts` محذوف فعليًا، `offlineQueue.ts` 163 سطر (مطابق تقرير المرحلة 2)، `forceQueue`/`navigator.onLine` مش موجودين إلا فى تعليقات توثيقية — يعني المرحلتين 1 و2 فعلاً منفّذتين على النسخة المرفوعة زي ما التقرير بيقول.

### إعادة العدّ الفعلية (بالـgrep، مش بالتقدير)
- **نداءات `withFkOfflineSentinel(`**: 6 (مؤكَّدة) — `useCaseCrudActions.ts:213`، `caseSessionLinkingShared.ts` (4 نداءات: أسطر 259، 350، 759، 870)، `NewStandaloneSessionModal.tsx:364`.
- **نداءات `withCaseSelfOfflineSentinel(`**: 2 (مؤكَّدة، برا التستات) — `caseSessionLinkingShared.ts:778`، `useClientLinking.ts:388`. (تأكيد سلبي: `StandaloneSessionDetailModal.tsx` معهوش نداء عمدًا — فيه تعليق صريح فى الكود بيوثّق السبب، زي ما التقرير الأصلي رصد.)
- **حقول sentinel كـobject literal مباشر (مش عبر الدالتين فوق)**: 5 مواضع — `useCaseCrudActions.ts:160` (`_offlineTempId`، فى الـpayload الأساسي)، `useCaseCrudActions.ts:231` (`_offlineCaseTempId`، جوه الفرع الميت)، `useClientActions.ts:267` (`_offlineTempId`)، `useClientActions.ts:394-395` (`_offlineFkTempId`/`_offlineSelfTempId` شرطيين)، `caseSessionLinkingShared.ts:196` (`_offlineTempId` فى `buildCaseInsertData`)، `NewStandaloneSessionModal.tsx:422` (`_offlineTempId`).

**اكتشاف حاكم للقرار كله (تتبّع فعلي بالكود، مش افتراض):** تتبعت كل مسار بيستخدم نتيجة `offline`/`queued` الراجعة من `__dbWrite`، ولقيت إنها **بقت مستحيلة تتحقق بـ`true` فعليًا** بعد المرحلة 1 — `__dbWrite` بيرجّع `offline: false` دايمًا (حرفيًا فى الكود) و`queued` فضلت `undefined` دايمًا (مفيش أي مكان فى `__dbWrite` الجديد بيحطها `true`). ده بيعني:
- كل متغيرات fallback زي `realOrTempCaseId`/`createdCaseId`/`linkedClientId` بتاخد الـid الحقيقي الراجع من الإدراج دايمًا، مش التمبيد.
- `isOfflineTempId(caseId)` (شرط `withCaseSelfOfflineSentinel`) بيتفحص على id حقيقي دايمًا → دايمًا `false`.
- `(offline && queued)` (شرط `withFkOfflineSentinel`) → دايمًا `false`.
- يعني الدالتين التنين كانوا فعليًا **بيرجّعوا `data` من غير تغيير فى كل استدعاء حقيقي** حتى قبل أي تعديل مني — التبسيط اللي عملته توثيق للواقع، مش تغيير سلوك.

### خطوات التنفيذ (قرار لكل موضع بعد المراجعة)

| الموضع | القرار | السبب |
|---|---|---|
| `useCaseCrudActions.ts:160` (`_offlineTempId` فى payload القضية) | 🗑️ حذف | بيتبعت غير شرطي مع كل قضية، مفيش قارئ له بعد حذف `offlineSync.ts` |
| `useCaseCrudActions.ts:231` (`_offlineCaseTempId` جوه `if(offline&&queued)`) | ⬜ يفضل كما هو | جوه فرع ميت بالكامل (غير قابل للوصول) — إزالته الحقيقية هي إزالة الفرع نفسه، وده موضوع توحيد الرسائل بالمرحلة 4 مش تنظيف السنتينل بس؛ تركه هنا صفر خطر لأنه غير قابل للتنفيذ أصلًا |
| `useCaseCrudActions.ts:213` (`withFkOfflineSentinel` نداء) | ⬜ يفضل كما هو (الدالة اتبسّطت مركزيًا) | التوقيع نفسه متلمسش، الدالة بقت passthrough |
| `useClientActions.ts:267` (`_offlineTempId` فى data الموكل) | 🗑️ حذف | نفس سبب `useCaseCrudActions.ts:160` |
| `useClientActions.ts:394-395` (`_offlineFkTempId`/`_offlineSelfTempId` شرطيين) | 🗑️ حذف (الشرطين نفسهم + الحقلين) | `isOfflineTemp`/`isTargetOfflineTempCase` مستحيل يبقوا `true` (نفس الاكتشاف الحاكم فوق) — الـspread كان دايمًا بيرجع `{}` |
| `caseSessionLinkingShared.ts:196` (`_offlineTempId` فى `buildCaseInsertData`) | 🗑️ حذف | نفس السبب — الباراميتر `offlineTempId` فضل فى التوقيع (بدون استخدام جوه الدالة) عشان الـcallers لسه بيمرروه لأغراض تانية |
| `caseSessionLinkingShared.ts` — تعريف `withFkOfflineSentinel`/`withCaseSelfOfflineSentinel` (259, 350, 759, 778, 870) | 🔧 تبسيط (passthrough) | الشرط الداخلي مستحيل يتحقق — التوقيع فضل زي ما هو فـ6+2 نداءات فى المشروع متلمسوش |
| `NewStandaloneSessionModal.tsx:364` (`withFkOfflineSentinel` نداء) | ⬜ يفضل كما هو (الدالة اتبسّطت مركزيًا) | نفس منطق `useCaseCrudActions.ts:213` |
| `NewStandaloneSessionModal.tsx:422` (`_offlineTempId` فى data الجلسة) | 🗑️ حذف | نفس السبب |
| `useClientLinking.ts:388` (`withCaseSelfOfflineSentinel` نداء) | ⬜ يفضل كما هو (الدالة اتبسّطت مركزيًا) | نفس منطق نداءات `withFkOfflineSentinel` |

### الملفات المتغيّرة (زيب مُسلَّم: `sanad-phase3-offline-removal.zip`، بمسارات الريبو الحقيقية)
1. **`src/features/cases/hooks/caseActions/useCaseCrudActions.ts`** — حذف `_offlineTempId: offlineTempId` من payload الإدراج؛ تحديث التعليق التوثيقي فوق توليد `offlineTempId` ليعكس الوضع الجديد (فضل الاسم كـmetغير للـtempId argument بس).
2. **`src/features/clients/hooks/useClientActions.ts`** — حذف `_offlineTempId` من data إدراج الموكل؛ حذف الـspreadين الشرطيين لـ`_offlineFkTempId`/`_offlineSelfTempId` من data ربط الموكل التلقائي بقضية/جلسة موجودة (فضل `client_id` بس)؛ تحديث التعليقات الملاصقة.
3. **`src/features/calendar/hooks/caseSessionLinkingShared.ts`** — حذف `_offlineTempId` من `buildCaseInsertData`؛ تبسيط `withCaseSelfOfflineSentinel`/`withFkOfflineSentinel` لـpassthrough بسيط (نفس التوقيع بالحرف، جسم الدالة بس اتغيّر)؛ توثيق السبب فى تعليقات فوق الدالتين.
4. **`src/features/calendar/NewStandaloneSessionModal.tsx`** — حذف `_offlineTempId` من data إدراج الجلسة المستقلة؛ تحديث التعليق فوق توليد `sessionOfflineTempId`.

### الملفات المطلوب حذفها يدويًا فى هذه المرحلة
لا يوجد. المرحلة 3 تعديلات فى ملفات موجودة بس، صفر حذف.

### فحص ما بعد التنفيذ
- ✅ بحث `grep` شامل على المشروع كله عن `_offlineFkTempId`/`_offlineSelfTempId`/`_offlineTempId`/`_offlineCaseTempId` (برا التستات): الوحيد المتبقي كـ**كود فعلي** (مش تعليق) هو `_offlineCaseTempId` جوه الفرع الميت فى `useCaseCrudActions.ts:231` — قرار مقصود (الجدول فوق)، وباقي كل الإشارات بقت تعليقات توثيقية بس.
- ✅ تتبعت يدويًا سيناريو "قضية جديدة بموكل جديد وطرف جديد فى نفس الفورم": `insertCaseParties(newCaseId, false, false)` (المسار الوحيد القابل للتنفيذ فعليًا) بيستخدم `newCaseId` الحقيقي مباشرة، و`withFkOfflineSentinel(false, false, ...)` بترجع `rowData` زي ما هي (passthrough) — السيناريو يفضل شغال بالظبط زي قبل التعديل، لأن الدالة كانت أصلًا بترجع نفس القيمة فى الحالة دي.
- ✅ تتبعت مسار `useClientActions.ts` (موكل جديد + ربط بقضية/جلسة موجودة): بعد الحذف، الـdata المرسلة بقت `{ client_id: linkedClientId }` بس — مطابقة تمامًا لما كانت بترجعه الـspreadات الشرطية القديمة فعليًا (كانت دايمًا `{}` زيادة).
- ✅ فحص توازن الأقواس (`{`/`}`) برمجيًا على كل الملفات الأربعة المتغيرة — سليم فى الكل.
- ⚠️ **فحص syntax/type معزول** بـTypeScript compiler عام (مش نسخة المشروع، مفيش `node_modules`/اتصال إنترنت فى البيئة دلوقتي) على الملفات الأربعة بمفردها — راجعت التغييرات سطر بسطر يدويًا كمان (diff كامل مقابل النسخة الأصلية) للتأكد من سلامة كل تعديل.

### ⚠️ ملاحظة أمانة مهمة — مختلفة عن المرحلتين 1 و2
البيئة اللي شغّلت فيها المرحلة دي **من غير إنترنت** (نفس قيد المرحلة 1 الأولي)، ومقدرتش أشغّل `npm ci`/`npm test`/`tsc`/`eslint`/`vite build` الحقيقيين خالص هذه المرة — لا وقت التنفيذ ولا بعده. اللي عملته بدلًا منه: مراجعة يدوية كاملة سطر بسطر لكل التغييرات (diff) + فحص توازن الأقواس برمجيًا + تتبع منطقي كامل لكل سيناريو فى جدول القرارات فوق. **لازم تشغّل CI حقيقي على تعديلات المرحلة 3 دي قبل ما نعتبرها مقفولة رسميًا** — مختلف عن المرحلتين 1 و2 اللي اتأكد نجاح CI حقيقي عليهم فعلاً.

### معيار القبول
- ✅ إنشاء قضية بموكل جديد/طرف جديد فى نفس الخطوة — تتبّع منطقي مؤكَّد إنه لسه بيشتغل صح أونلاين (زي ما هو بالظبط).
- ✅ مفيش حقول `_offline*` بتتبعت لـSupabase فى أي نقطة إنشاء (كانت مؤكَّدة أصلًا حتى قبل هذه المرحلة بفضل `stripOfflineSentinels`، ودلوقتي مؤكَّدة كمان على مستوى الكود المرسل نفسه، مش بس التنضيف قبل الإرسال).
- ⚠️ CI حقيقي: **نجح بعد إصلاح الـ12 تست المذكورة فى تقرير إصلاح CI تحت** — راجعه للتفاصيل.

### الخطوة الجاية (تاريخيًا — راجع تقرير إصلاح CI تحت لتحديث الحالة)
فى انتظار تأكيدك لنجاح CI حقيقي على تعديلات المرحلة 3. بعد كده جاهز أبدأ المرحلة 4 (توحيد رسائل المنع — 24 رسالة فى 11 ملف، زائد حماية `useAdminBackup.ts`/`useAdminLegalLibrary.ts`/`useAdminOffice.ts`/`useAdminUsers.ts`/`useAdminArchive.ts`/`ArchiveTab.tsx`/`TermsAcceptanceScreen.tsx` اللي مالهاش حماية خالص دلوقتي — وده هيشمل حذف الفرع الميت `if(offline&&queued)` جوه `useCaseCrudActions.ts:223-269` اللي فيه `_offlineCaseTempId` المتبقي من المرحلة دي) وقت ما تدّيني إشارة الاستمرار.

---

## ✅ تقرير إصلاح فشل CI الحقيقي على تعديلات المرحلة 3 (13 سبتمبر 2026)

### النتيجة
شغّلت CI الحقيقي (GitHub Actions، job `build-and-test`) على تعديلات المرحلة 3 زي ما كان معلّق فى "معيار القبول" فوق — **فشل فعلاً**، لكن الفشل كان **متوقّع بالظبط** وموصوف مسبقًا فى قسم "الملفات المطلوب تعديلها لاحقًا" (8 ملفات feature-hook بتتوقع `offline`/`queued`/`conflict`). مش باج جديد فى منطق المرحلة 3 — التستات لسه بتفترض سلوك الـsentinel القديم اللي المرحلة 3 نفسها شالته من الكود.

### تحليل اللوج (`logs_94153471693.zip`، job `build-and-test` → step `Run unit tests`)
- **النتيجة الإجمالية:** `Test Files: 3 failed | 53 passed (56)`، `Tests: 12 failed | 1191 passed (1203)`.
- **الفشل الوحيد** فى 3 ملفات، كلهم من نفس العائلة (توقّع sentinel فى بيانات مُرسَلة لـ`__dbWrite`):

| الملف | عدد الفشل | التستات |
|---|---|---|
| `src/features/calendar/hooks/caseSessionLinkingShared.test.ts` | 7 | `withCaseSelfOfflineSentinel`، `withFkOfflineSentinel` (×2)، `buildCaseInsertData`، `linkClientToParty`، `linkSessionGroupToCase`، `retryFailedGroupSessionsLinkToCase` |
| `src/features/calendar/hooks/useClientLinking.test.ts` | 3 | `handleLinkCase` (أونلاين + المرحلة 2 أوفلاين)، `handleLinkExistingClient` (المرحلة 3-1) |
| `src/features/clients/hooks/useClientActions.test.ts` | 2 | `handleSaveClient — clientLinkTarget` (case مع `caseIsOfflineTemp=true`، ×2) |

كل الـ12 حالة نفس الشكل بالظبط: التست بيعمل `toEqual`/`toMatchObject` على data متوقَّع فيها `_offlineFkTempId`/`_offlineSelfTempId`/`_offlineSelfFallbackName`/`_offlineTempId`، لكن الدالة (بعد تبسيطها لـpassthrough فى المرحلة 3) بترجع الـdata الأساسية بس من غير أي حقل sentinel.

### الإصلاح
عدّلت الـ3 ملفات (تستات بس — صفر تغيير فى كود الإنتاج المُسلَّم فى المرحلة 3) بإزالة توقّع حقول الـsentinel، مع تحديث كل تست ليتحقق من passthrough الفعلي (الـdata بترجع من غير أي إضافة)، ومع تعليق توثيقي فوق كل تعديل بيرجّع للمرحلة 3 كسبب:

| الملف | التعديل |
|---|---|
| `caseSessionLinkingShared.test.ts` | `withCaseSelfOfflineSentinel`/`withFkOfflineSentinel`: التوقّع بقى `data` زي ما هي حتى مع caseId/offline&&queued تمبيد. `buildCaseInsertData`: `toMatchObject` من غير `_offlineTempId` + `expect(...).not.toHaveProperty('_offlineTempId')`. `linkClientToParty`/`linkSessionGroupToCase`/`retryFailedGroupSessionsLinkToCase`: التوقّع بقى `{ client_id: ... }`/`{ case_id: ... }` بس |
| `useClientLinking.test.ts` | تست INSERT:cases الأونلاين: شيل `_offlineTempId: expect.stringMatching(/^tmp-/)`, ضفت `not.toHaveProperty`. تست المرحلة 2 (أوفلاين بالكامل): UPDATE:case_sessions بقى متوقَّع `{ case_id: ... }` بس. تست المرحلة 3-1 (createdCaseId تمبيد): UPDATE:cases بقى متوقَّع `{ client_id: ... }` بس |
| `useClientActions.test.ts` | تستين `clientLinkTarget` مع `caseIsOfflineTemp=true`: UPDATE:cases بقى متوقَّع `{ client_id: ... }` بس فى الحالتين (بدل الـsentinel المزدوج/المفرد) |

عناوين 3 تستات كانت بتوصف السلوك القديم فى اسمها اتحدّثت كمان عشان الاسم يفضل صادق مع الجسم بعد التعديل.

### فحص ما بعد الإصلاح
- ✅ `grep` شامل على الـ3 ملفات المعدَّلة تأكيدًا إن مفيش أي `expect` متبقي بيفترض `_offlineFkTempId`/`_offlineSelfTempId`/`_offlineTempId` كقيمة فعلية فى الناتج — الإشارات المتبقية كلها تعليقات توثيقية أو نص عنوان تست بس.
- ✅ راجعت كل تعديل يدويًا سطر بسطر مقابل التنفيذ الفعلي لكل دالة مستهدفة فى `caseSessionLinkingShared.ts`/`useClientLinking.ts`/`useClientActions.ts` (مش افتراض — اتبعت كل `data:` مُرسَلة فعليًا لـ`__dbWrite` فى كل مسار).
- ⚠️ **نفس ملاحظة الأمانة فى تقرير المرحلة 3 نفسه:** البيئة من غير إنترنت، فحاولت `npm ci` فعليًا كتأكيد (رجّعت `403 Forbidden` على تسجيل npm — متوقّع فى بيئة بلا اتصال) ومقدرتش أشغّل `vitest`/`tsc` الحقيقيين. التأكيد بديل بمطابقة يدوية كاملة بين كل `expect` جديد وسطر التنفيذ المقابل له بالظبط (مش تخمين للسلوك) — بنفس مستوى الصرامة المستخدم فى تقرير المرحلة 3 الأصلي.
- **✅ تأكيد:** CI حقيقي اتشغّل على التعديلات دي ونجح بالكامل — المرحلة 3 مقفولة رسميًا (13 سبتمبر 2026).

### الملفات المتغيّرة فى هذا الإصلاح (زيب مُسلَّم: `sanad-phase3-ci-fix.zip`)
1. `src/features/calendar/hooks/caseSessionLinkingShared.test.ts`
2. `src/features/calendar/hooks/useClientLinking.test.ts`
3. `src/features/clients/hooks/useClientActions.test.ts`

كود الإنتاج (الملفات الأربعة المذكورة فى قسم "الملفات المتغيّرة" بتقرير المرحلة 3 فوق) **متلمسش خالص** فى هذا الإصلاح — الفشل كان فى التستات بس، مش فى منطق المرحلة 3.

### الخطوة الجاية
✅ **تأكيد نجاح CI الحقيقي وصل (13 سبتمبر 2026).** المرحلة 3 تُعتبر مقفولة رسميًا بكل أجزائها (تنظيف الـsentinel + إصلاح التستات الـ12 اللي كانت بتفترض السلوك القديم). جاهز أبدأ المرحلة 4 (توحيد رسائل المنع — 24 رسالة فى 11 ملف، زائد حماية `useAdminBackup.ts`/`useAdminLegalLibrary.ts`/`useAdminOffice.ts`/`useAdminUsers.ts`/`useAdminArchive.ts`/`ArchiveTab.tsx`/`TermsAcceptanceScreen.tsx` اللي مالهاش حماية خالص دلوقتي — وده هيشمل حذف الفرع الميت `if(offline&&queued)` جوه `useCaseCrudActions.ts:223-269` اللي فيه `_offlineCaseTempId` المتبقي من المرحلة دي) وقت ما تدّيني إشارة الاستمرار.
