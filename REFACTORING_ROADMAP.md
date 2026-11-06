# 🗺️ خريطة الطريق المعمارية واستقرار النظام (Architecture & Refactoring Roadmap)
## Gartic Phone Architecture, Stability & Security Reference Guide

---

## 📌 سجل التقدم المعماري المبسط (Simplified Architecture Tracker)

| البند | الحالة الحالية | التفاصيل والملاحظات |
| :--- | :--- | :--- |
| **المرحلة المعمارية الحالية** | `PHASE 5B` (جارٍ تنفيذ دفعاتها تدريجياً) | تم إكمال `SUB-BATCH-5B-1` بنجاح. الخطوة التالية: تدقيق معماري للقراءة فقط لـ `PHASE 5B Stage 2` |
| **الدفعة الحالية / الأخيرة** | `SUB-BATCH-5B-1` | `[x] COMPLETED` — استخراج خوارزميات سجل الرسم والتراجع إلى `server/roomDrawingHistory.ts` |
| **آخر دفعة متمة بالكامل** | `SUB-BATCH-5B-1` | `[x] COMPLETED` — 4 دوال لـ `server/roomDrawingHistory.ts` مع بقاء الواجهات التوافقية لـ `RoomManager` |
| **الدفعة التالية المخططة** | `PHASE 5B Stage 2` | `[ ] PLANNED — READ-ONLY AUDIT` — تدقيق معماري للقراءة فقط لملكية بث الرسم الحر النشط والاعتماد المعياري |
| **المخاطر والعوائق المعمارية المفتوحة** | لا يوجد عوائق حرجة | جميع الثوابت المعمارية ونظام الرسم والتراجع والمزامنة مستقرة بالكامل وتحت الحماية المعمارية |
| **وثيقة التفكيك التفصيلية** | [ARCHITECTURE_DECOMPOSITION_PLAN.md](./ARCHITECTURE_DECOMPOSITION_PLAN.md) | الوثيقة المرجعية للمسؤوليات والاعتماديات وشروط الحفاظ على السلوك |

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
  * **مسار محرك الرسم النشط المعتمد (Active Drawing Pipeline)**:
    * البنية الهرمية المعزولة: `IsolatedDrawingLayer` -> `ExperimentalDrawingBoard` -> `DrawingCanvasCore`.

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
  - **التدقيق التكميلي للسيرفر**:
    - مسار حركة السيرفر: يميز `server/registerDrawBinaryHandler.ts` بين المسار المعتمد في Free Draw / Experimental (معالجة معيارية) وبين الرومات التنافسية العادية (بث اعتيادي). مسار الإرسال من العميل يستخدم `socket.volatile` لأحداث الحركة في المواضع المنفذة حالياً.
    - إدارة الذاكرة وتخصيص الكائنات: يستخدم الكود مجمع نقاط قابلاً لإعادة الاستخدام في `drawBinaryHelper.ts`، مع بقاء تخصيصات كائنات ومصفوفات ومؤقتات في أجزاء أخرى من المسار؛ والقرار يهدف لتفادي إضافة طبقات كولباك إضافية.
    - معالجات الانضمام والمغادرة: فحص `server/registerJoinRoomHandler.ts` (إرسال السجل والتراجع ومزامنة خطوط Free Draw النشطة للداخلين الجدد) و `server/registerLeaveRoomHandler.ts` (حذف موثق بالسيرفر وإسناد الانقطاع إلى `roomManager.handleDisconnect()` في `server.ts`).
  - **النتيجة**: أغلقت المرحلة دون استخراج أو إنشاء أي ملفات كود أو مساس ببروتوكول السيرفر أو إضافة مطالبات غير مثبتة.

---

### 📌 PHASE 5 — SERVER ARCHITECTURE & ROOMMANAGER DECOUPLING
- [x] **PHASE 5A — استخراج الأدوات النقية من `server/rooms.ts`**:
  - `server/utils/arabicFuzzyMatch.ts`
  - `server/data/wordsDictionary.ts`
  - `server/utils/binaryBufferHelpers.ts`
- [~] **PHASE 5B — تفكيك وحدات السيرفر الداخلية (RoomManager Modular Controllers)**:
  - **الحالة**: **مرحلة معمارية مستمرة جارٍ تنفيذ دفعاتها تدريجياً (Ongoing Phase)**
  - [x] **Stage 1: Full RoomManager Architectural Audit** — `[x] COMPLETED`
  - [x] **Stage 1B: Drawing Subsystem Ownership Re-validation** — `[x] COMPLETED`
  - [x] **SUB-BATCH-5B-1 — Server Drawing History & Undo/Redo Extraction**:
    - **الحالة**: `[x] COMPLETED`
    - **الملف الجديد المنشأ**: `server/roomDrawingHistory.ts`
    - **الملف المعدل**: `server/rooms.ts`
    - **الدوال المستخرجة**: `recordRoomDrawCommand`, `undoRoomFreeDrawStroke`, `undoRoomLastDrawing`, `redoRoomDrawing`.
    - **التوصيف الفعلي والثوابت**:
      - تصنيف الدوال كـ Synchronous Room-scoped State Algorithms تعمل بالمرجع على كائن `Room` الأصلي.
      - بقاء `RoomManager` المالك الحصري والوحيد لخريطة `this.rooms` في الذاكرة دون تخزين مكرر.
      - بقاء الواجهات التوافقية لـ `RoomManager` دون تغيير في التوقيع أو المستدعين الخارجيين أو الاستدعاءات الداخلية (`handleFreeDrawEnd`, `handleFreeDrawClear`).
      - خلو الوحدة تماماً من Socket.IO وعضوية اللاعبين والمؤقتات وانتقالات الجولات.
      - رفع `extractInstanceIdFromBuffer` إلى نطاق الوحدة وتفادي إنشائه المتكرر.
      - حماية الدلو والمسح كأول إجراء `type === 4 || 10 || 5`، قفل الرسم عند التراجع `isDrawingActive = false`، تراجع بخطوة واحدة، حذف ذري `Type 9 + Type 3` وحذف مستهدف لخطوات Free Draw مع إبطال التخزين المعياري المؤقت `freeDrawCanonicalCache`.
    - **المسؤوليات المتبقية داخل `RoomManager`**: خريطة الغرف، الجولات، الـ Tick الدوري، مؤقتات المراحل، إدارة اللاعبين وإعادة الاتصال، سجل هويات الرسم (`drawingIdentities`)، بدء/إيقاف الرسم الحر، بث وسريان الرسم الحر النشط، فك ترميز وتنسيق `Type 13`/`Type 2` والاعتماد `Type 9` وإشعارات المقابس، ودالة `clearDrawHistoryForRoomAndClient`.
    - **نتائج التحقق الفعلي**: `test_session_identity_suite` (626/626 نجاح)، `test_experimental_draw_trial` (نجاح)، `test_type13_hardening` (نجاح)، `test_freedraw_bucket_undo_fastpath` (4/4 نجاح)، `test_controlled_fixes_suite` (نجاح Tests A-G)، `tsc --noEmit` (0 أخطاء)، `npm run build` (بناء ناجح).
  - [ ] **Stage 2: Free Draw Streaming Ownership Audit**:
    - **الحالة**: `[ ] PLANNED — READ-ONLY AUDIT`
    - **الملف المستهدف**: `server/rooms.ts`
    - **المواضيع المستهدفة للتدقيق**: دورة حياة الضربة النشطة، معالجة `Type 2` و `Type 13`، اعتماد `Type 9` المعياري، إشعارات `Type 11` و `Type 12`، دورة حياة التخزين المعياري، ومزامنة الانضمام النشط.
    - **القاعدة الإلزامية**: تنفيذ تدقيق معماري للقراءة فقط أولاً دون الموافقة المسبقة على الاستخراج.

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
