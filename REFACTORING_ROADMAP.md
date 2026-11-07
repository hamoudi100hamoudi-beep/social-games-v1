# 🗺️ خريطة الطريق المعمارية واستقرار النظام (Architecture & Refactoring Roadmap)
## Gartic Phone Architecture, Stability & Security Reference Guide

---

## 📌 سجل التقدم المعماري المبسط (Simplified Architecture Tracker)

| البند | الحالة الحالية | التفاصيل والملاحظات |
| :--- | :--- | :--- |
| **المرحلة المعمارية الحالية** | `PHASE 6C — ExperimentalGameRoom Refactoring` | استكمال استخراج المكونات المستقلة وتصفية الكود المتبقي في غلاف اللعب التنافسي |
| **الدفعة الحالية / الأخيرة** | `BATCH-6C-1` | `[x] COMPLETED` — استخراج شريط التغذية التفاعلية السريعة إلى المكون المستقل `GameActivityFeed` |
| **آخر دفعة متمة بالكامل** | `BATCH-6C-1` | `[x] COMPLETED` — استخراج `GameActivityFeed` بنجاح (مع ثبات وحفظ إنجازات PHASE 5B و PHASE 5C سابقاً) |
| **الدفعة التالية المخططة** | `BATCH-6C-2` | تنظيف وإنهاء توليد جزيئات الاحتفال غير المستغلة `confettis` في `ExperimentalGameRoom.tsx` |
| **المخاطر والعوائق المعمارية المفتوحة** | لا يوجد عوائق حرجة | ملاحظة فنية مثبتة لم يتم تعديلها: بوابة DPR الصامتة (`EXPERIMENTAL_DPR_1_TEST`) تتطلب تدقيقاً مستقلاً مستقبلاً |
| **وثيقة التفكيك التفصيلية** | [ARCHITECTURE_DECOMPOSITION_PLAN.md](./ARCHITECTURE_DECOMPOSITION_PLAN.md) | الوثيقة المرجعية المعتمدة (راجع قسم 4.5 للمرجع المعماري الدائم لأنماط الغرف) |

> ⚠️ **تنبيه للمطورين والذكاء الاصطناعي**: هذا الملف هو **المرجع الحصري والدائم** لتنظيم وتتبع كل المهام المعمارية والأمنية وهيكلة الكود في المشروع. للتفاصيل الفنية الدقيقة حول أحجام الملفات والاعتماديات وجداول الدفعات، راجع الوثيقة المرجعية الشقيقة: `ARCHITECTURE_DECOMPOSITION_PLAN.md`.

---

## 🎯 1. الغرض من الخريطة (Purpose of the Roadmap)

تُمثّل هذه الوثيقة الدليل المعماري الحاكم والمصدر المرجعي الموحد للمشروع لضمان:
1. **الاستقرار التشغيلي**: منع حدوث أي انتكاسات (Regressions) أو تدهور في تجربة اللعب اللحظية (60fps) أثناء إعادة الهيكلة أو تفكيك الملفات الكبيرة.
2. **التوثيق الدقيق للمراحل**: توضيح الحدود الفاصلة بين ما أُنجز وثَبُت في الكود الحالي، وما هو قيد المراجعة، وما هو مجدول للمستقبل.
3. **منع القرارات العشوائية**: حظر تجزئة الملفات لمجرد تقليص حجم الأسطر دون دراسة عميقة للاعتماديات ونقاط الاتصال الشبكي بالخادم ومحرك الرسم.

---

## 📍 2. الحالة المرجعية الحالية للنظام (Current Reference State)

* **البنية التكنولوجية الأساسية (الموثقة من واقع `package.json` الفعلي)**:
  * **الواجهة الأمامية (Frontend)**:
    * React 19 (`19.0.1`) مع React DOM 19.
    * محرك البناء والتطوير السريع Vite 6 (`6.2.3`).
    * محرك التنسيق Tailwind CSS v4 (`4.1.14`) عبر `@tailwindcss/vite`.
    * مكتبة الحركة `motion` (`12.40.0`) وأيقونات `lucide-react`.
    * عميل المقابس اللحظية `socket.io-client` (`4.8.3`) مع المحلل الثنائي `socket.io-msgpack-parser` (`3.0.2`).
  * **الخادم الخلفي (Backend)**:
    * Node.js مع إطار العمل Express (`4.21.2`) ومفسر TypeScript المباشر `tsx` (`4.21.0`).
    * خادم المقابس اللحظية `socket.io` (`4.8.3`) مع دعم MsgPack الثنائي.
  * **إدارة حالة الغرف (Room State Architecture)**:
    * إدارة كاملة في الذاكرة العشوائية (`In-Memory Room Management`) عبر فئة `RoomManager` داخل `server/rooms.ts` لضمان أقل زمن تأخير ممكن (Low Latency) دون وسيط قاعدة بيانات لغرف اللعب السريع.
  * **مسار محرك الرسم النشط المعتمد ومصفوفة أنماط الغرف (Active Drawing Pipeline & Mode Matrix)**:
    * **وضع الرسم الحر (`isFreeDraw: true`)**: يُوجّه إلى `GameRoom.tsx`.
    * **النماذج التنافسية الحالية (`isExperimental: true`)**: (`General #Test`, `General #10P`, `Experimental Draw`, Custom fallback) تُوجّه جميعها إلى `ExperimentalGameRoom.tsx`.
    * **البنية الهرمية المعزولة للرسم المشتركة**: `IsolatedDrawingLayer` -> `ExperimentalDrawingBoard` -> `DrawingCanvasCore` -> المحرك المعياري المستمر بالسيرفر (`Server Canonical Continuous Stroke Pipeline`).
    * **مسار الرسم الخام القديم غير المجمع (`isFreeDraw: false && isExperimental: false`)**: مسار توافق قديم لا يوجد له أي مسار روم نشط مدمج في الواجهة والتوجيه الحالي.

---

## 🛡️ 3. دستور الحفاظ على استقرار اللعبة (The Preservation Covenant)

عند تعديل أو تفكيك أي جزء من أجزاء النظام، **يجب الالتزام الصارم بالثوابت المعمارية التالية دون استثناء**:

1. **حيادية التفكيك (Behavioral Invariance)**:
   * إعادة الهيكلة وفصل الملفات هدفها التنظيم الداخلي فقط؛ يُمنع منعاً باتاً تغيير سلوك اللعبة، أو تدفق الحالات، أو إيقاع الجولات.
2. **وحدة مصدر الحقيقة (Single Source of Truth)**:
   * حظر إنشاء نُسخ مستقلة أو متكررة من حالة الغرف (`RoomState`) أو سجل الرسم (`drawHistory`) أو مراجع الكانفاس لتفادي انفصال التزامن (State Desynchronization).
3. **حماية الترتيب الشبكي والبروتوكول الثنائي**:
   * الحفاظ الصارم على تسلسل وصول أحداث Socket.IO وترميز الحزم الثنائية المضغوطة وتكامل محرك `socket.io-msgpack-parser`.
4. **حماية طبقات ومراجع لوحة الرسم**:
   * حماية مراجع الرسم الأساسية: `canvasRef` و `ctxRef` و `tempCtxRef` والطبقات المخصصة للمعاينة المؤقتة والمسارات النشطة في `DrawingCanvasCore`.
5. **سلامة تدفق أدوات الرسم وتراجعها**:
   * الحفاظ على تدفق النقاط اللحظي (Streamed Points) بسرعة 60 إطاراً بالثانية، ومنظومة التراجع الآمن بخطوة واحدة (`1-step safe undo/redo buffer`) عبر `isDrawingActive` لمنع تشوه الترتيب الزمني، وأداة الدلو (Bucket Flood-Fill) دون تأخير، ومسح اللوحة (Clear Canvas).
6. **سلامة المزامنة وإعادة الاتصال (Sync & Reconnection)**:
   * الحفاظ على آلية معالجة انضمام اللاعبين المتأخرين، ومزامنة خطوط الرسم النشطة، وبروتوكول استرجاع التاريخ دون تجميد السيرفر بحلقات بحث خطية $O(N)$.
7. **الزوم والتفاعل اللمسي (Viewport & Interactions)**:
   * الحفاظ التام على منطق الزوم بالأصابع والسحب (`Pinch-to-Zoom & Pan`) وحسابات تحويل الإحداثيات بين شاشة المستخدم ومصفوفة لوحة الرسم.
8. **ثبات التصميم والواجهة البصرية (CSS & Layout Protection)**:
   * حظر تعديل مساحات أو ألوان أو فئات Tailwind CSS أو هوامش الروم واستجابته للأجهزة المحمولة والشاشات الكبيرة أثناء مهام التفكيك.
9. **حماية معالجة الكيبورد والنافذة المرئية**:
   * حظر المساس بدوال `visualViewport` أو المتغير البرمجي الهام `--keyboard-inset` أو سلوك تقليص الواجهة وتحويل الدردشة إلى طبقة شفافة عائمة عند فتح لوحة المفاتيح في الغرفة التنافسية.
10. **عدم الدمج القسري للغرف**:
    * يُمنع دمج `GameRoom` و `ExperimentalGameRoom` في ملف واحد لمجرد تقليل عدد الملفات؛ فلكل منهما مسار مستقر مستقل.
11. **حظر التحسينات الجانبية الطارئة**:
    * يُمنع تنفيذ أي "تحسينات أداء" أو تعديلات غير مدرجة في متطلبات المهمة الحالية.

---

## 🏛️ 4. سجل الأعمال المعمارية المنجزة والمثبتة (Historical Achievements)

### أ. المراحل التأسيسية السابقة (Historical Decoupling)
- [x] **فصل أدوات الضغط والترميز الثنائي**: `/src/types/draw.ts` و `/src/utils/drawBinaryHelper.ts`.
- [x] **عزل شريط وقائمة اللاعبين**: `/src/components/game/PlayersSidebar.tsx`.
- [x] **عزل واجهة الدردشة التفاعلية الشفافة**: `/src/components/game/OverlayChatRoom.tsx`.
- [x] **اعتماد المحرك المعماري النشط للرسم**: تجميع ونقل منطق الكانفاس المطور إلى `DrawingCanvasCore.tsx`.

### ب. الإنجازات المعمارية والأمنية الحديثة المثبتة بالكود
- [x] **موثوقية أنيميشن دخول اللاعبين (`JOIN-ANIMATION-1`)**.
- [x] **حصر الأنيميشن على الأحداث الحقيقية فقط (`EVENT-ANIMATION-2`)**.
- [x] **تثبيت مؤشر شريط الوقت واتجاهه (`TIMER-BAR-1` & `TIMER-BAR-2`)**.
- [x] **أمان الجلسات وحماية الخادم الأساسية (Rate Limiting Foundations)**.

---

## 🚀 5. خريطة المراحل وتفكيك المكونات (Roadmap Phases Detail)

### 📌 PHASE 1 — SERVER SECURITY COMPLETION
- [x] **تحديد معدل التصويت بالطرد**: `submit_vote_kick`.
- [x] **تحديد معدل مزامنة الجولات**: `request_round_sync`.
- [x] **حماية وتنظيف خرائط المعدلات**: دورياً في `server/rateLimit.ts`.
- [x] **تقييد مصفوفة استعلام الغرف**: `get_rooms_info` بحد أقصى 10 عناصر.
- [x] **SEC-1 — تدقيق أحداث الخادم المتبقية وحمولات الرسم**.
- [x] **SEC-2A — إصلاح انهيار كولباك `get_room_info`**.
- [x] **SEC-2B — منع تكرار بث هويات الرسم (Idempotency)**.
- [x] **SEC-2C — تأمين حدث `draw_repair_req`**.
- [x] **SEC-2D — تحسين بث حالة `start_free_draw` و `stop_free_draw`**.

---

### 📌 PHASE 2 — DRAW HISTORY LIFECYCLE
- [x] **دراسة مسارات إضافة وحذف ومسح `drawHistory`**.
- [x] **دراسة وضع الرسم الحر (Free Draw) والغرف طويلة العمر**.
- [x] **توثيق العلاقة المتبادلة بين السجل وحاجز التراجع**.
- [x] **تقييم واستخدام خيار اللقطات المرجعية (Canvas Snapshots)**.

---

### 📌 PHASE 3 — DRAW SYNC CORRECTNESS
- [x] **مصفوفة التحقق السلوكي للرسم وحالات إعادة الاتصال والانضمام المتأخر**:
  - [x] الرسم المباشر اللحظي بين لاعبين متصلين في نفس اللحظة.
  - [x] أداة الدلو (Bucket / Flood Fill) وتجاوز عائق البدء الفوري.
  - [x] التراجع (Undo) وإلغاء التراجع (Redo) بحاجز الإغلاق اللحظي.
  - [x] مسح اللوحة (Clear Canvas) وتزامن المسح لدى المراقبين والرسام.
  - [x] انضمام لاعب متأخر أثناء رسم نشط.
  - [x] انقطاع الاتصال وإعادة الاتصال في تبويب خلفي ثم العودة.
  - [x] إصلاح الخطوط النشطة المفقودة عبر بروتوكول الإصلاح.
  - [x] توافق وتطابق بكسلات اللوحة بين الرسام والمخمنين بعد تسلسل عمليات مركب.

---

### 📌 PHASE 4 — DRAWINGCANVASCORE REFACTOR
- [x] **PHASE 4A — حصر المسؤوليات والاعتماديات**.
- [x] **PHASE 4B — فصل محركات وخوارزميات الرسم المستقلة**:
  - [x] `PHASE 4B-1` — استخراج دوال فحص الأوامر إلى `src/utils/canvasCommandHelpers.ts`.
  - [x] `PHASE 4B-2` — تدقيق محرك الأشكال والمسارات.
  - [x] `PHASE 4B-3A` — استخراج محرك الأشكال `drawShape` إلى `src/utils/canvasPathRenderer.ts`.
  - [x] `PHASE 4B-3B` — استخراج محرك المسارات `drawEntirePath` إلى `src/utils/canvasPathRenderer.ts`.
  - [x] `PHASE 4B-4A` — استخراج النواة الحسابية للدلو `executeRasterFloodFill` إلى `src/utils/canvasFloodFill.ts`.
- [x] **PHASE 4C — فصل وظائف الكانفاس والتحكم بالعرض (Viewport & Transform)**:
  - [x] `PHASE 4C-2` — استخراج `computeCanvasFitScale` إلى `src/utils/canvasViewportMath.ts`.
  - [x] `PHASE 4C-4` — استخراج `calculateLogicalCoordinates` إلى `src/utils/canvasViewportMath.ts`.
- [x] **PHASE 4D — فصل مسار الإدخال والتصيير (Pointer & Stroke Pipeline)**:
  - [x] `PHASE 4D-2` — إعادة استخدام قياس DOMRect لكل حدث في Coalesced Events.
  - [x] `PHASE 4D-3 / 4D-3C` — إضافة فحص ملكية المؤشر الصريح `activePointerIdRef`.
  - [x] `PHASE 4D-3D-FIX` — تثبيت وإنهاء الضربة عند بدء التكبير/التصغير بالأصابع Pinch-to-Zoom.
- [x] **PHASE 4E — فصل إدارة السجل والتراجع ومحرك الإعادة (History, Replay & Undo Decoupling)**:
  - [x] **SUB-BATCH-4E-1A (Canvas Checkpoint Manager)**: استخراج `CanvasCheckpointManager` إلى `src/utils/canvasCheckpointManager.ts` لإدارة النقاط المرجعية والتقييد والحد من الذاكرة.
  - [x] **SUB-BATCH-4E-1B (Canvas Undo Cache)**: استخراج `CanvasUndoCache` إلى `src/utils/canvasUndoCache.ts` لإدارة التخزين المؤقت النقطي للتراجع وإلغاء التراجع.
  - [x] **SUB-BATCH-4E-1C (Replay Engine Extraction & Audit)**:
    - Stage 1 (Architectural Audit): تحديد حدود التفكيك.
    - Stage 2A (Single-command Replay Extraction): استخراج `replaySingleCommand()` إلى `src/utils/canvasReplayEngine.ts` كدالة مساعدة ذات أثر (Stateless/Effectful Helper).
    - Stage 2B (Leftover Replay Session Rendering): استخراج `renderLeftoverReplaySessions()` إلى `src/utils/canvasReplayEngine.ts` كدالة مساعدة ذات أثر واستبدال مواضع الاستدعاء الخمسة في `DrawingCanvasCore.tsx`.
    - Stage 2C (High-Level Replay Orchestration Audit): **[x] CLOSED (NO EXTRACTION WARRANTED)**. تدقيق معماري للقراءة فقط إكمالاً لتقييم المنظم عالي المستوى. تقرر عدم استخراج المنظم عالي المستوى لحماية اعتماده على مراجع ومؤقتات React، وجدولة RAF، والتخزين المؤقت، وإلغاء الأجيال، ونقل المقابس، والقياسات التشخيصية.
- [x] **PHASE 4F — تدقيق مزامنة المقابس للرسم (Drawing Socket Sync Architectural Audit)**:
  - **الحالة**: `[x] CLOSED (NO EXTRACTION WARRANTED)`
  - **القرار المعماري**: خلص التدقيق المعماري للقراءة فقط إلى أن إنشاء وحدة منفصلة `DrawingSocketSync` أو استخراج Custom Hook كبير لن يوفر فصلاً وظيفياً حقيقياً، بل سيخلق كيس مراجع وكولباكات متضخماً (Ref/Callback bag) يزيد التعقيد.
  - **مبررات إبقاء المعالجة داخل `DrawingCanvasCore.tsx`**:
    - الارتباط العضوي بسياقات الكانفاس (`ctxRef` و `tempCtxRef`) والطبقات المؤقتة ومسارات الرسم اللحظي.
    - إدارة طوابير الجلسات النشطة والمستنزفة (`activeSessionsRef` و `drainingStrokesRef`).
    - التسليم الذري للخطوط المكتملة وحل طلبات الإصلاح (`commitRemoteStrokeAtomically` و `draw_repair_req`).
    - عمليات التخزين المؤقت والنقاط المرجعية للتراجع (`undoCache` و `checkpointManager`).
    - دورة حياة إعادة بناء السجل عبر RAF ومنع ازدواجية الحزم (`areHistoryArraysEqual`).
    - دورة حياة React ومراجع المكون وحالة واجهة المستخدم وإلغاء أجيال المزامنة.
  - **التدقيق التكميلي للسيرفر المحدث**:
    - مسار حركة السيرفر: جميع النماذج التنافسية المحددة مسبقاً (`General #Test`, `General #10P`, `Experimental Draw`, Custom fallback) تستخدم `isExperimental: true` ووضع الرسم الحر يستخدم `isFreeDraw: true`؛ وبالتالي تشترك جميع الأنماط النشطة في المحرك المعياري المستمر (Canonical Continuous Stroke Pipeline).
    - مسار الرسم الخام القديم غير المجمع (`isFreeDraw: false && isExperimental: false`): يظل مسار توافق قديم لا يوجد له روم نشط مدمج في التوجيه الحالي.
    - إدارة الذاكرة وتخصيص الكائنات: يستخدم الكود مجمع نقاط قابلاً لإعادة الاستخدام في `drawBinaryHelper.ts` مع الحفاظ على المعالجة التزامنية ومنع النسخ غير الضرورية في مسار الحركة عالي التردد دون مطالبات أداء غير مثبتة باختبارات قياسية.
    - معالجات الانضمام والمغادرة: فحص `server/registerJoinRoomHandler.ts` (إرسال السجل والتراجع ومزامنة خطوط Free Draw النشطة للداخلين الجدد) و `server/registerLeaveRoomHandler.ts` (حذف موثق بالسيرفر وإسناد الانقطاع إلى `roomManager.handleDisconnect()` في `server.ts`).
  - **النتيجة**: أغلقت المرحلة دون استخراج أو إنشاء أي ملفات كود أو مساس ببروتوكول السيرفر أو إضافة مطالبات غير مثبتة.

---

### 📌 PHASE 5 — SERVER ARCHITECTURE & ROOMMANAGER DECOUPLING
- [x] **PHASE 5A — استخراج الأدوات النقية من `server/rooms.ts`**:
  - `server/utils/arabicFuzzyMatch.ts`
  - `server/data/wordsDictionary.ts`
  - `server/utils/binaryBufferHelpers.ts`
- [x] **PHASE 5B — تفكيك وحدات السيرفر الداخلية (RoomManager Modular Controllers)**:
  - **الحالة**: `[x] COMPLETED — CLOSED (NO FURTHER EXTRACTION WARRANTED)`
  - [x] **Stage 1: Full RoomManager Architectural Audit** — `[x] COMPLETED`
  - [x] **Stage 1B: Drawing Subsystem Ownership Re-validation** — `[x] COMPLETED`
  - [x] **SUB-BATCH-5B-1 — Server Drawing History & Undo/Redo Extraction** — `[x] COMPLETED`
  - [x] **SUB-BATCH-5B-2 — Server Canonical Stroke Engine Extraction** — `[x] COMPLETED`
  - [x] **Stage 2: Free Draw Streaming Ownership Audit & Correction Addendum** — `[x] COMPLETED`
  - [x] **Stage 3: Residual RoomManager Core Architectural Audit & Closure** — `[x] COMPLETED — CLOSED (NO FURTHER EXTRACTION WARRANTED)`:
    - **التدقيق والقرار**: تدقيق معماري بنمط القراءة فقط أثبت أن استخراج `roomDrawingHistory.ts` و `roomCanonicalStrokeEngine.ts` أنشأ الحد المعياري المستقل والأنسب، وأن بقية مسؤوليات `RoomManager` تشكل نواة متماسكة ومترابطة تزامندياً. إغلاق المرحلة رسمياً بقرار عدم الحاجة لاستخراج إضافي تحت البنية والمسؤوليات الراهنة.
    - **دقة الحقائق وتوثيق المكونات المتبقية**: توثيق اختيار الرسام في `transitionToChoosing` (مطابقة أول مرشح في `turnQueue` بـ `room.players` دون تصفية صريحة لـ `isOffline`)، وإدارة الانقطاع مع الحفاظ عمداً على `isOffline = false` وتثبيت `offlineSince` خلال فترة السماح الصامتة (90 ثانية)، وإدراج دوال التنسيق الشبكي للرسم الحر (`syncActiveFreeDrawStrokesToSocket`, `abortAllActiveFreeDrawStrokesForSocket`, `abortAllActiveFreeDrawStrokesForRoom`, `abortFreeDrawStroke`) ضمن خريطة ملكية `RoomManager` بالكامل.

---

### 📌 PHASE 5C — ACTIVE ROOM MODES CONSISTENCY AUDIT
- [x] **PHASE 5C — ACTIVE ROOM MODES CONSISTENCY AUDIT**:
  - **الحالة**: `[x] COMPLETED — READ-ONLY SOURCE AUDIT`
  - **المرجع المعماري الدائم**: تم توثيق وحفظ المرجع المعماري الدائم لأنماط الغرف النشطة في `ARCHITECTURE_DECOMPOSITION_PLAN.md` (قسم 4.5).
  - **الحقائق المعتمدة**:
    - جميع النماذج التنافسية الحالية تعتمد `isExperimental: true` وتستخدم غلاف اللعب `<ExperimentalGameRoom />`.
    - وضع الرسم الحر (`isFreeDraw: true`) يستخدم غلاف الجلسة المستمرة `<GameRoom />`.
    - اختلاف نقاط الفوز (`General #10P` بـ 120 نقطة مقابل 30 نقطة للبقية) هو خيار تكوين متعمد ومقصود على مستوى الروم. يُحظر توحيده.
    - تشترك كافة الأنماط في محرك الرسم بالسيرفر (`roomCanonicalStrokeEngine` & `roomDrawingHistory`) وسلسلة مكونات العميل (`IsolatedDrawingLayer` -> `ExperimentalDrawingBoard` -> `DrawingCanvasCore`).
    - تم توثيق الملاحظة الفنية المثبتة لبوابة DPR الصامتة (`EXPERIMENTAL_DPR_1_TEST`) وتأجيل أي تغيير مستقبلي لدقة الكانفاس لتدقيق مستقل منفصل.
    - إمكانية إنشاء غرف مخصصة بخيارات يحددها المستخدم مستوحاة من Gartic.io هي قدرة منتج مستقبلية (`FUTURE PRODUCT CAPABILITY`) وليست دفعة إعادة هيكلة حالية.
    - تمت المحافظة التامة على الكود دون إجراء أي تعديلات برمجية أو تغيير في السلوك التشغيلي.

---

### 📌 PHASE 6 — EXPERIMENTALGAMEROOM REFACTORING & CLEANUP
- [x] **PHASE 6C Stage 1 — Residual ExperimentalGameRoom Architectural Audit**:
  - **الحالة**: `[x] COMPLETED — READ-ONLY SOURCE AUDIT`
  - **التفاصيل**: إجراء تدقيق معماري شامل للمكون `ExperimentalGameRoom.tsx` وتوثيق مكوناته المتبقية والمستخرجة وإحصاء أسطره الحالية (~2052 سطر).
- [x] **BATCH-6C-1 — Game Activity Feed Extraction**:
  - **الحالة**: `[x] COMPLETED`
  - **التفاصيل**: استخراج منطقة التغذية السريعة (Quick Feedback Area) إلى المكون المستقل `src/components/game/GameActivityFeed.tsx` بشروطه الأربعة (`guesses`, `socketId`, `amIDrawer`, `isFreeDraw`).
- [ ] **BATCH-6C-2 — Remove Unused Podium Confetti Generation**:
  - **الحالة**: `[ ] PLANNED`
  - **التفاصيل**: تنظيف وإنهاء الكود غير المستغل لمتغير `confettis` المولّد عبر `React.useMemo` (في الأسطر 280–319) من `ExperimentalGameRoom.tsx` (`VERIFIED UNUSED CODE — PROPOSED CLEANUP, NOT YET IMPLEMENTED`).

---

## 🧪 6. سياسة الاختبارات والموارد (Testing & Resource Policy)

تلتزم جميع مهام المشروع بالضوابط التقنية الهيكلية التالية:

1. **الأولوية للفحص الثابت المباشر**:
   - الاعتماد بالدرجة الأولى على قراءة الكود الذكية، وتدقيق الـ Diff السطري، وفحص TypeScript (`tsc --noEmit`)، وبناء التطبيق (`npm run build`).
2. **الاختبارات الآلية الموجهة والخفيفة فقط**:
   - تشغيل الاختبارات الآلية الموجودة ذات الصلة المباشرة بالمهمة عند الحاجة (مثل `scripts/test_session_identity_suite.ts`).
3. **مخرجات تقارير دقيقة ومختصرة**:
   - كل تقرير يحتوي على: سبب المشكلة، الملفات المعدلة، الـ Diff الفعلي، نتائج الفحص والبناء، والمخاطر المفتوحة.

---

## 🏷️ 7. دليل دلالات علامات الحالة (Status Legend)

* `[x]`: **منجز ومثبت** (Completed & Verified) — تم تنفيذه والتحقق من صحته وبنائه في التطبيق.
* `[ ]`: **لم يبدأ بعد** (Not Started) — مخطط له ولم تبدأ أي خطوة فيه.
* `[~]`: **منجز جزئياً** (Partially Done) — جزء منه منفذ ويتطلب استكمالاً.
* `[—]`: **مؤجل عمداً** (Deferred) — مؤجل لانتظار اعتماد مراحل أخرى تسبقه.
* `[x] CLOSED (NO EXTRACTION WARRANTED)`: **مغلق بقرار معماري مثبت** — خضع لتدقيق وتم إبقاء المنطق في مكانه لحماية الأداء والثوابت.

---
