# 📋 سجل التفكيك المعماري الشامل (Architecture Decomposition Register & Inventory)
## Gartic Phone Persistent Large-Files Refactoring Plan

---

## 🎯 1. الغرض من هذا السجل وسياسة الدفعات (Purpose & Batch Policy)

يُمثّل هذا السجل **المرجع التقني الدائم والمستودع المعماري المفصل** لجميع عمليات تفكيك وتنظيم الملفات الكبيرة في المشروع. يهدف السجل إلى:
1. **تثبيت نتائج التدقيق المعماري (`ARCHITECTURE REASSESSMENT-1`)** في وثيقة دائمة ومفصلة تمنع الحاجة لإعادة فحص الملفات والاعتماديات قبل كل خطوة.
2. **اعتماد منهجية الدفعات المعمارية المتماسكة (`Batch Refactoring Policy`)**: بدلاً من التفتيت الجزئي العشوائي، يتم تجميع العناصر المتقاربة وظيفياً والمستقلة برمجياً في دفعات محددة بدقة.
3. **فصل الحقائق المثبتة في الكود عن الفرضيات**: تسجيل ما تم إثباته برمجياً بالأسطر والدوال، وما يحتاج إلى تحقق مركّز عند بدء الدفعة.

### 🛡️ قواعد ودستور تنفيذ الدفعات (Batch Refactoring Rules):
- **التماسك الوظيفي**: كل دفعة تجمع مكوّنات أو دوال تشترك في نطاق عمل واحد ولا يتم خلط تعديلات غير مترابطة في دفعة واحدة.
- **التدرج الصارم للمخاطر (A -> B -> C)**:
  - **الفئة A (منخفضة المخاطر)**: مكونات عرض مستقلة، دوال نقية، وأدوات حسابية. تُنفذ أولاً.
  - **الفئة B (متوسطة المخاطر)**: Custom Hooks وشاشات تعتمد على عدة Props أو دورات حياة React.
  - **الفئة C (عالية المخاطر)**: محركات الرسم، Socket.IO، سجل الرسم، والتراجع. محظورة تماماً لحين استيفاء بوابات الاستقرار (`PHASE 2` و `PHASE 3`).
- **شروط قبول الدفعة (Batch Acceptance Gates)**:
  - عرض الـ Diff البرمجي الكامل وتدقيقه بدقة.
  - اجتياز فحص الأنواع الصارم: `tsc --noEmit` بنسبة 100% دون أي خطأ.
  - اجتياز بناء التطبيق الكامل: `npm run build` بنجاح تام.
  - المراجعة البرمجية والمشاهدة الاستاتيكية للسياسة الهيكلية.

---

## 🏷️ 2. قاموس حالات دورة حياة التفكيك المبسط (Simplified Status Dictionary)

تلتزم جميع دفعات التفكيك بالحالات المعيارية الخمس التالية حصراً:

* `[x] COMPLETED`: المهمة مكتملة ومحققة معمارياً في الكود.
* `[~] IN PROGRESS`: المهمة قيد التنفيذ والعمل الفعلي حالياً.
* `[ ] PLANNED`: مهمة معتمدة في الخطة المستقبلية ولم تبدأ بعد.
* `[—] DEFERRED`: مؤجلة عمداً بقرار معماري لوجود بوابات سابقة إلزامية.
* `[x] CLOSED (NO EXTRACTION WARRANTED)`: خضعت لتدقيق معماري وتقرر عدم الاستخراج لحماية الثوابت المعمارية.

---

## 📊 3. الجرد الفعلي للملفات الكبيرة ومسؤولياتها (Current Large Files Inventory)

تم قياس وتوثيق الحالة الفعلية لملفات المشروع:

### 1. `src/components/game/DrawingCanvasCore.tsx`
- **المسؤوليات الرئيسية**:
  - إدارة الكانفاس والطبقات المؤقتة (`canvasRef`, `tempCanvasRef`, `ctxRef`, `tempCtxRef`).
  - تحويلات العرض والزوم والسحب بالأصابع والفأرة (`transformRef`, `measureAndCenter`).
  - مسار إدخال المؤشر واللمس عالي التردد (60-120Hz)، وحلقات Coalesced Events، وحماية ملكية المؤشر `activePointerIdRef`.
  - محركات الرسم: المسارات المنعمة، الأشكال (`canvasPathRenderer.ts`)، والدلو النقطي (`canvasFloodFill.ts`).
  - محرك التراجع وإلغاء التراجع المحلي والربط مع `canvasUndoCache.ts` و `canvasCheckpointManager.ts`.
  - مزامنة المقابس الثنائية اللحظية والربط مع `canvasReplayEngine.ts`.
- **الأجزاء التي يجب إبقاؤها داخل الملف (Non-extractable Hot Paths & Coordinators)**:
  - حلقة معالجة حركة المؤشر اللحظية `processStrokeMove` وحسابات الاستكمال الخطي (Lerp).
  - التنسيق عالي المستوى لإعادة التشغيل (High-level Replay Orchestration) لشدة ارتباطه بمراجع React، ومؤقتات RAF، وإلغاء الأجيال، وحالة واجهة المستخدم.
  - معالجة أحداث المقابس اللحظية وتدفق المزامنة (Drawing Socket Sync & Event Processing) لشدة ارتباطها بسياقات الكانفاس، وجلسات الرسم النشطة والمستنزفة، وحاجز التراجع، وإصلاح الخطوط المفقودة.

#### 2. `src/components/experimental/ExperimentalGameRoom.tsx`
- **المسؤوليات الرئيسية**:
  - منسق الغرفة التنافسية المخصص لجميع النماذج المحددة مسبقاً (`General #Test`, `General #10P`, `Experimental Draw`, والغرف التنافسية المخصصة `isExperimental: true`).
  - إدارة الانتقال بين حالات الجولة (`WAITING`, `CHOOSING`, `DRAWING`, `ROUND_END`, `PODIUM`).
  - تكيف الواجهة مع النافذة المرئية ولوحة المفاتيح في الهواتف (`visualViewport` و `--keyboard-inset`).
  - شريط الوقت عالي الدقة `SmoothTimer`.
  - النوافذ المنبثقة التفاعلية الـ11 المضمنة داخل الـ JSX عبر `CinematicModal`.
  - طبقات المراحل: اختيار الكلمات، لوحة الرسم النشطة، منصة التتويج، وشريط الدردشة العائم.
  - تشترك مع `GameRoom.tsx` (المخصصة لـ Free Draw `isFreeDraw: true`) في نفس تسلسل مكونات الرسم: `IsolatedDrawingLayer` -> `ExperimentalDrawingBoard` -> `DrawingCanvasCore`.

### 3. `server/rooms.ts`
- **المسؤوليات الرئيسية**:
  - مدير الغرف المركزي في الذاكرة `RoomManager` (مصدر الحقيقة الموحد والمالك الحصري لخريطة `this.rooms`).
  - دورة حياة الغرف والجولات، ومؤقت التحديثات الدوري `tick()`.
  - مصادقة الجلسات، التحقق من التوكنات، إدارة هوية الرسام، وإعادة الاتصال.
  - تخمينات الكلمات، المطابقة التقريبية، والتصويت على الطرد.
  - واجهات التوافق (Facades) لعمليات سجل الرسم والتراجع (`server/roomDrawingHistory.ts`) ومحرك الرسم المعياري المستمر (`server/roomCanonicalStrokeEngine.ts`).
  - تنسيق إشعارات الإلغاء (`Type 12`)، مزامنة الضربات النشطة، وإدارة هوية الرسامين.

### 4. `src/components/GameRoom.tsx`
- **المسؤوليات الرئيسية**:
  - منسق الغرفة المحدد لوضع الرسم الحر (Free Draw `isFreeDraw: true`).
  - تستخدم نفس البنية الهرمية المعزولة للرسم (`IsolatedDrawingLayer` -> `ExperimentalDrawingBoard` -> `DrawingCanvasCore`).

### 5. `src/components/Lobby.tsx`
- **المسؤوليات الرئيسية**:
  - شاشة البداية: اختيار الأفاتار، محدد الإيموجي، إدخال الاسم.
  - شاشة الغرف واستعراض الإحصائيات.

---

## 🛡️ 4. الثوابت المعمارية المحمية (Architectural Invariants & Red Lines)

تخضع جميع عمليات التفكيك للضوابط الصارمة التالية المنصوص عليها في دستور المشروع:
1. **أداة الدلو والبدء الفوري**: الشرط `type === 4 || type === 10 || type === 5` في `recordDrawCommand` بالسيرفر محمي تماماً ولا يجوز تغييره.
2. **حاجز التراجع بخطوة واحدة (1-Step Safe Buffer)**: الالتزام الصارم بـ `redoStack = [removed]` وقفل الرسم اللحظي عبر `isDrawingActive = false` لمنع تشوه التزامن.
3. **وحدة مصدر الحقيقة في الذاكرة**: يُمنع منعاً باتاً تقسيم `this.rooms` إلى كائنات حالة متعددة أو غير متزامنة.
4. **نسبة أبعاد الكانفاس الثابتة**: الحفاظ على النسبة الدقيقة `aspect-[740/430]` في جميع مسارات الروم لمنع تشوه العرض لدى المراقبين.
5. **حماية تكيف الهواتف الذكية**: حظر المساس بمتغير `--keyboard-inset` أو دوال `visualViewport` أثناء التفكيك.
6. **حلقة التحديد الذهبية**: الحفاظ على لون التحديد `#D4AF37` بسمك `border-[1.5px]` في شريط أدوات الرسم.

---

## 🗂️ 5. سجل حزم ودفعات التفكيك (Decomposition Batches Register)

### 🟢 الدفعة `BATCH-6A-1` — استخراج مؤقت اللعبة `SmoothTimer`
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `src/components/experimental/ExperimentalGameRoom.tsx`.
* **الملف الجديد المنشأ**: `src/components/game/SmoothTimer.tsx`.
* **درجة المخاطر**: **الفئة A (منخفضة المخاطر - Low Risk)**.

---

### 🟢 الدفعة `BATCH-6A-2` — استخراج نوافذ الإجراءات التفاعلية الأساسية (Action Modals)
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `src/components/experimental/ExperimentalGameRoom.tsx`.
* **الملفات الجديدة المنشأة**: `ExitConfirmModal.tsx`, `SkipConfirmModal.tsx`, `ReportConfirmModal.tsx`, `AfkWarningModal.tsx`.
* **درجة المخاطر**: **الفئة A (منخفضة المخاطر - Low Risk)**.

---

### 🟢 الدفعة `BATCH-6A-3` — استخراج نوافذ الملف الشخصي والتنبيهات (Profile & Alert Modals)
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `src/components/experimental/ExperimentalGameRoom.tsx`.
* **الملفات الجديدة المنشأة**: `PlayerProfileModal.tsx`, `RoomAlertModals.tsx`.
* **درجة المخاطر**: **الفئة A (منخفضة المخاطر - Low Risk)**.

---

### 🟢 الدفعة `BATCH-5A-1` — استخراج أدوات المطابقة العربية وقواميس الكلمات للسيرفر
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `server/rooms.ts`.
* **الملفات الجديدة المنشأة**: `server/utils/arabicFuzzyMatch.ts`, `server/data/wordsDictionary.ts`.
* **درجة المخاطر**: **الفئة A (منخفضة المخاطر - Low Risk)**.

---

### 🟢 الدفعة `BATCH-5A-2` — استخراج أدوات معالجة الحزم الثنائية للسيرفر (Pure Binary Helpers)
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `server/rooms.ts`.
* **الملف الجديد المنشأ**: `server/utils/binaryBufferHelpers.ts`.
* **درجة المخاطر**: **الفئة A (منخفضة المخاطر - Low Risk)**.

---

### 🟢 الدفعة `BATCH-7A-1` — إعادة استخدام النوافذ المستخرجة في `GameRoom.tsx`
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `src/components/GameRoom.tsx`.
* **درجة المخاطر**: **الفئة A/B (منخفضة إلى متوسطة)**.

---

### 🟢 الدفعة `BATCH-7A-2` — استخراج واجهات Lobby المستقلة
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `src/components/Lobby.tsx`.
* **الملفات الجديدة المنشأة**: `src/components/lobby/RoomInfoModal.tsx`, `src/components/lobby/AvatarCarousel.tsx`.
* **درجة المخاطر**: **الفئة B (متوسطة المخاطر)**.

---

### 🟢 الدفعة `BATCH-6B-1` — استخراج شاشة اختيار الكلمات للرسام (`ChoosingWordOverlay`)
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `src/components/experimental/ExperimentalGameRoom.tsx`.
* **الملف الجديد المنشأ**: `src/components/experimental/ChoosingWordOverlay.tsx`.
* **درجة المخاطر**: **الفئة B (متوسطة المخاطر)**.

---

### 🔴 بوابات الاستقرار البحثية والمعمارية (Stability Gates)

* **`BATCH-2-RES` — دراسة دورة حياة سجل الرسم وحدود الذاكرة (`PHASE 2`)**:
  * **الحالة**: `[x] COMPLETED`

* **`BATCH-3-SYNC` — مصفوفة التحقق السلوكي لمزامنة اللوحات (`PHASE 3`)**:
  * **الحالة**: `[x] COMPLETED`
  * **القرار المعماري النهائي**: `READY TO CLOSE PHASE 3` — اكتمل التدقيق البرمجي لدورة حياة حزمة الإلغاء Type 6 وتأكيد سلامة بروتوكول المزامنة وإعادة الاتصال والرفع المتأخر.

---

### 🟢 تفكيك مرحلة سجل الرسم والتراجع ومحرك الإعادة (`PHASE 4E`)

#### 🟢 `SUB-BATCH-4E-1A` — Canvas Checkpoint Manager
* **الحالة**: `[x] COMPLETED`
* **الملف المستخرج**: `src/utils/canvasCheckpointManager.ts`
* **المسؤولية**: إدارة دورة حياة النقاط المرجعية للكانفاس (Checkpoints)، النقاط الأساسية والذيلية (Base/Tail Slots)، التحقق من الصلاحية، التحديث التراكمي، الإبطال، وسيارات التخلّي والحد من الذاكرة.

#### 🟢 `SUB-BATCH-4E-1B` — Canvas Undo Cache
* **الحالة**: `[x] COMPLETED`
* **الملف المستخرج**: `src/utils/canvasUndoCache.ts`
* **المسؤولية**: إدارة التخزين المؤقت لصور التراجع وإلغاء التراجع النقطي بخطوة واحدة (`Single-step Bitmap Undo/Redo Cache`)، معالجة التخزين المسبق المعلق قبل الضربة، التحقق من البيانات الوصفية، والإنشاء الكسول للطبقات.

#### 🟢 `SUB-BATCH-4E-1C` — Replay Engine Extraction & Audit
* **الملف المستخرج**: `src/utils/canvasReplayEngine.ts`
* **المركبات والتطبيقات الفرعية**:
  - **Stage 1 (Architectural Audit)**: `[x] COMPLETED`. تحديد حدود الملكية وقيود بروتوكول الإعادة.
  - **Stage 2A (Single-command Replay Extraction)**: `[x] COMPLETED`. استخراج الدالة المساعدة ذات الأثر `replaySingleCommand()` لفك ترميز الحزم الفردية ورسم المسارات والأشكال وتنفيذ اختصارات الملء.
  - **Stage 2B (Leftover Replay Session Rendering)**: `[x] COMPLETED`. استخراج الدالة المساعدة ذات الأثر `renderLeftoverReplaySessions()` وتحديث مواضع الاستدعاء الخمسة في `DrawingCanvasCore.tsx` مع الحفاظ الصارم على سلوك مسح المسارات الخاص بـ `processChunk` وبقاء جلسات الرسم النشطة.
  - **Stage 2C (High-Level Replay Orchestration Audit)**: `[x] CLOSED (NO EXTRACTION WARRANTED)`. تدقيق معماري للقراءة فقط للتدفق عالي المستوى. **القرار المعماري**: تقرر عدم استخراج المنظم عالي المستوى إلى المحرك وإبقاؤه داخل `DrawingCanvasCore.tsx` لشدة اعتماده على مراجع ومؤقتات React، وحالة المزودات، والتخزين المؤقت، وجدولة RAF، وإلغاء الأجيل، ونقل المقابس، والمقاييس التشخيصية.
  - **طبيعة الدوال المستخرجة**: تم تصنيف `replaySingleCommand()` و `renderLeftoverReplaySessions()` كـ **Stateless / Effectful Helpers**؛ فهي لا تملك حالة داخلية دائمة، ولكنها تقوم بتعديل المجمّعات وسياق الكانفاس الممرر إليها.

---

### 🟢 تفكيك وتدقيق مزامنة المقابس للرسم (`PHASE 4F`)

#### 🟢 `PHASE 4F — Drawing Socket Sync Architectural Audit`
* **الحالة**: `[x] CLOSED (NO EXTRACTION WARRANTED)`
* **القرار المعماري النهائي**:
  - انتهى التدقيق المعماري للقراءة فقط إلى أن استخراج معالجة المقابس من `DrawingCanvasCore.tsx` إلى وحدة خارجية مستقلة (`DrawingSocketSync`) أو إلى خطاف مخصص (`useDrawingSocketSync`) لن يحقق فصلاً وظيفياً حقيقياً، بل سيؤدي إلى إنشاء "كيس مراجع وكولباكات" متضخم (Ref-bag / Callback-soup) يربط الكود الخارجي بأكثر من 35 مرجعاً ودالة داخلية للمكون.
* **المسؤوليات المقيدة بالمكون (`Component-Owned Responsibilities`)**:
  1. الارتباط المباشر بسياقات الكانفاس (`ctxRef` و `tempCtxRef`) والطبقات المؤقتة ومسارات الرسم اللحظي.
  2. إدارة طوابير الجلسات النشطة والمستنزفة (`activeSessionsRef` و `drainingStrokesRef`) ومؤقت استنزاف المراقبين بمعدل 60 إطاراً بالثانية (`spectatorPlaybackRafRef`).
  3. التسليم الذري للخطوط المكتملة (`commitRemoteStrokeAtomically`) وحل طلبات الإصلاح الموجهة (`draw_repair_req`).
  4. معاملات التخزين المؤقت للصور والنقاط المرجعية للتراجع (`CanvasUndoCache` و `CanvasCheckpointManager`).
  5. إعادة بناء السجل عبر شرائح RAF بحجم 50 أمراً (`processIncomingHistorySync`) وقمع الحزم المكررة بمقارنة المحتوى (`areHistoryArraysEqual`).
  6. دورة حياة React، ومراجع المكون، وحالة واجهة المستخدم (`isSyncing`, `hasSyncedOnce`)، وإلغاء أجيال المزامنة (`historySyncGenerationRef`).
* **التدقيق التكميلي للسيرفر والبروتوكول الواقعي المحدث**:
  - **واقع مسار الرسم بالسيرفر**: جميع النماذج التنافسية الحالية المحددة مسبقاً (`General #Test`, `General #10P`, `Experimental Draw`, Custom fallback) تستخدم `isExperimental: true` وستستخدم وضع الرسم الحر `isFreeDraw: true`؛ وبالتالي تشترك جميع أنماط التشغيل النشطة في مسار المحرك المعياري المستمر (Canonical Continuous Stroke Pipeline).
  - **مسار الرسم الخام غير المجمع (Legacy Raw Unbuffered Branch)**: يبقى مسار `isFreeDraw: false && isExperimental: false` مسار توافق قديم لا يوجد له أي مسار روم نشط مدمج في الواجهة أو التوجيه الحالي للتطبيق.
  - **إدارة تخصيص الذاكرة (Allocations)**: يستخدم الكود مجمع نقاط قابلاً لإعادة الاستخدام في `drawBinaryHelper.ts` (`pointPool`)، مع مراعاة تفادي التخصيصات والنسخ غير الضرورية في مسار الحركة عالي التردد، والحفاظ على المعالجة التزامنية دون مطالبات أداء غير مثبتة باختبارات قياسية.
  - **معالجات الانضمام والمغادرة**: تم فحص `server/registerJoinRoomHandler.ts` (إرسال السجل والتراجع ومزامنة خطوط Free Draw النشطة للداخلين الجدد) و `server/registerLeaveRoomHandler.ts` (حذف موثق بالسيرفر وإسناد الانقطاع الفعلي إلى `roomManager.handleDisconnect()` في `server.ts`).
  - **النتيجة**: أغلقت المرحلة دون استخراج أو إنشاء أي ملفات كود أو مساس ببروتوكول السيرفر أو إضافة مطالبات غير مثبتة.

---

### 🟡 المرحلة المعمارية قيد التفكيك التدريجي (`PHASE 5B`)

#### 🟡 `PHASE 5B — SERVER / ROOMMANAGER MODULAR CONTROLLERS`
* **الحالة**: **مرحلة معمارية مستمرة قيد التنفيذ تدريجياً (Ongoing Phase)**
* **الملف المستهدف**: `server/rooms.ts` (`RoomManager`)

##### 🟢 `Stage 1: Full RoomManager Architectural Audit`
* **الحالة**: `[x] COMPLETED`
* **النتيجة**: توثيق الاعتماديات وتأكيد ملكية `RoomManager` الحصرية لخريطة `this.rooms` في الذاكرة.

##### 🟢 `Stage 1B: Drawing Subsystem Ownership Re-validation`
* **الحالة**: `[x] COMPLETED`
* **النتيجة**: إعادة فحص الاعتماديات الفعلية وفصل خوارزميات سجل الرسم والتراجع عن إدارة هويات الرسم وبث الرسم الحر النشط.

##### 🟢 `SUB-BATCH-5B-1 — Server Drawing History & Undo/Redo Extraction`
* **الحالة**: `[x] COMPLETED`
* **الملف الجديد المنشأ**: `server/roomDrawingHistory.ts`
* **الملف المعدل**: `server/rooms.ts`
* **الدوال الأربع المستخرجة**:
  1. `recordRoomDrawCommand`
  2. `undoRoomFreeDrawStroke`
  3. `undoRoomLastDrawing`
  4. `redoRoomDrawing`
* **التوصيف المعماري والتطبيق الفعلي**:
  - تصنيف الدوال المستخرجة كـ **خوارزميات ناتجة عن حالة بنطاق الغرفة (Synchronous Room-scoped State Algorithms)** تعمل مباشرة على كائن `Room` الأصلي الممرر كمرجع (By reference).
  - بقاء `RoomManager` المالك الحصري والوحيد لسجل الغرف `this.rooms` في الذاكرة؛ حيث لم يتم إدخال أي كائنات حالة مستقلة أو تخزين مكرر للسجل.
  - بقاء دوال `RoomManager` الأربع السابقة كواجهات توافقية (Compatibility Facades) تحافظ تماماً على توقيع الدوال والمستدعين الخارجيين.
  - بقاء الاستدعاءات الداخلية لـ `this.recordDrawCommand()` داخل `handleFreeDrawEnd` و `handleFreeDrawClear` دون تغيير عبر الواجهة التوافقية.
  - خلو الوحدة الجديدة `server/roomDrawingHistory.ts` تماماً من أي اعتماديات على Socket.IO، عضوية اللاعبين، مؤقتات الجولات، أو انتقال المراحل.
  - رفع مساعد استخراج معرف الجلسة `extractInstanceIdFromBuffer` إلى نطاق الوحدة (Module scope)، وتفادي إعادة إنشائه عند كل استدعاء لـ `recordDrawCommand`.
* **المسؤوليات المتبقية داخل `RoomManager` (بعد دمج SUB-BATCH-5B-2)**:
  - تمت إضافة واجهات التوافق لفك ترميز `Type 2` و `Type 13` وبناء `Type 9` المعياري التي تم استخراج خوارزمياتها في `SUB-BATCH-5B-2` إلى `server/roomCanonicalStrokeEngine.ts`.
  - يواصل `RoomManager` امتلاك خريطة الغرف `this.rooms` بالكامل، انتقالات الجولات، مؤقت Tick الدوري، إدارة اللاعبين، إعادة الاتصال، هويات الرسم (`drawingIdentities`)، بدء/إيقاف الرسم الحر، مزامنة العملاء، تنسيق الإلغاء `Type 12` عبر `abortFreeDrawStroke` وتنسيق المسح.

##### 🟢 `SUB-BATCH-5B-2 — Server Canonical Stroke Engine Extraction`
* **الحالة**: `[x] COMPLETED`
* **الملف الجديد المنشأ**: `server/roomCanonicalStrokeEngine.ts`
* **الملف المعدل**: `server/rooms.ts`
* **الدوال السبع المستخرجة**:
  1. `getOrCreateFreeDrawStrokes`
  2. `getOrCreateFreeDrawCanonicalCache`
  3. `handleFreeDrawStart`
  4. `handleFreeDrawMove`
  5. `handleFreeDrawMoveCompressed`
  6. `handleFreeDrawEnd`
  7. `getCanonicalFreeDrawStroke`
* **الحدود المعمارية والتصميم التزامني**:
  - الوحدة المستخرجة تعمل تزامندياً بالكامل على كائن `Room` الأصلي الممرر كمرجع (By reference).
  - يحتفظ `RoomManager` بالملكية الحصرية لخريطة `this.rooms` وحالة الغرفة المعتمدة.
  - يحتفظ `RoomManager` بتواقيع الدوال العامة الأصلية كواجهات توافقية (Compatibility Facades).
  - يحتفظ `RoomManager` بملكية بث حزمة الإلغاء `Type 12` عبر `abortFreeDrawStroke` وتنسيق إلغاء الضربات النشطة، مزامنة انضمام/إعادة اتصال الضربات النشطة، وتنسيق مسح اللوحة.
  - تسلسل سجل التاريخ: تسلسل سجل التاريخ التراكمي لـ `Type 9` متتبوعاً بـ `Type 3` يظل تتابعياً عبر كولباك الواجهة التوافقية لـ `recordDrawCommand` الممرر تزامندياً إلى `handleFreeDrawEnd`.
  - ملكية الإشعارات الشبكية: إشعار اعتماد الضربة `Type 11` (Commit Ack) يظل مملوكاً لـ `server/registerDrawBinaryHandler.ts`؛ وإشعار الإلغاء `Type 12` (Abort) يظل مملوكاً لـ `RoomManager.prototype.abortFreeDrawStroke`.
* **الحقيقة التشغيلية لأنماط الغرف المحققة**:
  - الأنماط التنافسية الحالية (`General #Test`, `General #10P`, `Experimental Draw`, والغرف التنافسية المخصصة) تعتمد `isExperimental: true` وتُوجّه إلى `ExperimentalGameRoom`.
  - وضع الرسم الحر يستعين بـ `isFreeDraw: true` ويُوجّه إلى `GameRoom`.
  - كلا النمطين التشغيليين النشطين يتشاركان نفس البنية: `IsolatedDrawingLayer` -> `ExperimentalDrawingBoard` -> `DrawingCanvasCore` ومحرك الرسم المعياري المستمر بالسيرفر (Server Canonical Continuous Stroke Pipeline).
  - مسار الرسم الخام القديم غير المجمع (`isFreeDraw: false && isExperimental: false`) يظل مسار توافق قديم دون وجود روم نشط مدمج في التوجيه الحالي للتطبيق.
* **خصائص الأداء والحفاظ على الذاكرة**:
  - الحفاظ على منطق المعالجة التزامنية وتفادي التخصيصات والنسخ غير الضرورية في مسار الحركة عالي التردد.
  - ملاحظة دقيقة: مفكك أحداث الحركة `Type 13` يقوم بإنشاء مصفوفة نقاط مؤقتة وكائنات نقاط مخصصة وكائن نتيجة فك الترميز كجزء طبيعي من عمله دون مطالبات أداء غير مثبتة باختبارات قياسية.
* **نتائج حزمة الاختبارات والبناء**:
  - `scripts/test_experimental_draw_trial.ts`: اجتياز بنجاح.
  - `scripts/test_type13_hardening.ts`: اجتياز بنجاح.
  - `scripts/test_freedraw_bucket_undo_fastpath.ts`: نجاح 4/4 اختبارات.
  - `scripts/test_session_identity_suite.ts`: نجاح 626/626 اختباراً بنسبة 100%.
  - `scripts/test_controlled_fixes_suite.ts`: اجتياز جميع الاختبارات (Tests A - G).
  - `scripts/test_legacy1a_routing.ts`: اجتياز بنجاح.
  - `scripts/test_legacy1c_unknown_room_routing.ts`: اجتياز بنجاح.
  - `tsc --noEmit`: 0 أخطاء في الأنواع.
  - `npm run build`: بناء ناجح 100%.

##### 🟢 `PHASE 5B — STAGE 2: FREE DRAW STREAMING OWNERSHIP AUDIT & CORRECTION ADDENDUM`
* **الحالة**: `[x] COMPLETED`
* **النتيجة**: اكتمل التدقيق وتدقيق التصحيح بنجاح وتم تنفيذه كاملاً في `SUB-BATCH-5B-2`.

---

### 🔵 التدقيق المعماري المخطط التالي (`PHASE 5C`)

#### 🔵 `PHASE 5C — ACTIVE ROOM MODES CONSISTENCY AUDIT`
* **الحالة**: `[ ] PLANNED — STRICT READ-ONLY AUDIT`
* **الهدف المعماري**: التدقيق للقراءة فقط لتأكيد أن جميع الغرف التنافسية النشطة تتشارك نفس قواعد وخيارات اللعب، وأن الفروقات تقتصر حصرياً على قيم التكوين المعتمدة مثل سعة اللاعبين.
* **نطاق التدقيق والمقارنة (Audit Target & Comparison)**:
  1. مقارنة النماذج التنافسية المحددة مسبقاً: `General #Test`, `General #10P`, `Experimental Draw`, والغرف التنافسية المخصصة (Custom fallback).
  2. فحص فروقات `winningScore` بشكل صريح، وخاصة أن `General #10P` تعتمد `winningScore = 120` بينما بقية النماذج تعتمد `winningScore = 30` (معاملتها كإعدادات منتج تتطلب التأكيد وتجنب الافتراض بأنها مجرد فرق سعة لاعبين).
  3. فحص جميع أفرع وأعلام الخصائص `EXPERIMENTAL_*_TEST` في `ExperimentalDrawingBoard.tsx` والتأكد من تفعيلها بانسجام عبر النماذج التنافسية.
  4. فحص غياب مؤقتات الجولات وقواعد التخمين في وضع الرسم الحر (`Free Draw`).
  5. فحص صلاحيات الرسم المتعدد وهويات الرسامين في وضع الرسم الحر.
  6. فحص محركات الرسم المشتركة بين العميل والسيرفر.
* **أهداف التصنيف النظري للتدقيق (5 Classification Targets)**:
  1. محرك الرسم المشترك (Shared drawing engine).
  2. قواعد اللعب التنافسية المشتركة (Shared competitive gameplay rules).
  3. سلوك الروم/الجلسة المخصص لكل نمط (Mode-specific room/session behavior).
  4. الفروقات القائمة على التكوين فقط (Configuration-only differences).
  5. أي انحراف غير مقصود في الميزات (Any unintended feature divergence).
* **القاعدة الصارمة**: تدقيق للقراءة فقط دون إدخال أي تعديلات برمجية أثناء مرحلة التدقيق.



---
