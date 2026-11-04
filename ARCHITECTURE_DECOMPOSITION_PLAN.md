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
  - عرض الـ Diff البرمجي الكامل بدقة.
  - اجتياز فحص الأنواع الصارم: `tsc --noEmit` بنسبة 100% دون أي خطأ.
  - اجتياز بناء التطبيق الكامل: `npm run build` بنجاح تام.
  - التحقق اليدوي المباشر من المستخدم على بيئة التشغيل، ولا يُدعى نجاح الاختبار يدوياً قبل تأكيده من المستخدم.
  - مزامنة الـ Git وتثبيت مرجع الـ Commit المؤكد قبل الانتقال للدفعة التالية.

---

## 🏷️ 2. قاموس حالات دورة حياة التفكيك المبسط (Simplified Status Dictionary)

تلتزم جميع دفعات التفكيك بالحالات المعيارية الأربع التالية حصراً:

* `[x] COMPLETED`: المهمة مكتملة ومحققة معمارياً في الكود.
* `[~] IN PROGRESS`: المهمة قيد التنفيذ والعمل الفعلي حالياً.
* `[ ] PLANNED`: مهمة معتمدة في الخطة المستقبلية ولم تبدأ بعد.
* `[—] DEFERRED`: مؤجلة عمداً بقرار معماري لوجود بوابات سابقة إلزامية.


---

## 📊 3. الجرد الفعلي للملفات الكبيرة ومسؤولياتها (Current Large Files Inventory)

تم قياس وتوثيق الحالة الفعلية لملفات المشروع (المرجع المتزامن المعتمد: `b2fd77ec13f75382142709b54a46b33804a617f9`):

### 1. `src/components/game/DrawingCanvasCore.tsx` (**6,396 سطراً**)
- **المسؤوليات الرئيسية**:
  - إدارة الكانفاس والطبقات المؤقتة (`canvasRef`, `tempCanvasRef`, `ctxRef`, `tempCtxRef`).
  - تحويلات العرض والزوم والسحب بالأصابع والفأرة (`transformRef`, `measureAndCenter`).
  - مسار إدخال المؤشر واللمس عالي التردد (60-120Hz)، وحلقات Coalesced Events، وحماية ملكية المؤشر `activePointerIdRef`.
  - محركات الرسم: المسارات المنعمة، الأشكال (`canvasPathRenderer.ts`)، والدلو النقطي (`canvasFloodFill.ts`).
  - محرك التراجع وإلغاء التراجع المحلي (Bitmap Snapshots Buffer بحاجز خطوة واحدة).
  - مزامنة المقابس الثنائية اللحظية (`draw_binary` بالحزم 1، 2، 4، 5، 8، 9، 10، 13).
- **الأجزاء التي يجب إبقاؤها داخل الملف (Non-extractable Hot Paths)**:
  - حلقة معالجة حركة المؤشر اللحظية `processStrokeMove` وحسابات الاستكمال الخطي (Lerp). نقلها يتطلب تمرير 8 مراجع ديناميكية في كل إطار مما يسبب Frame Skips وضغطاً على الذاكرة في الهواتف الضعيفة.
  - مراجع الطبقات المباشرة وتنسيق الكانفاس الداخلي.

### 2. `src/components/experimental/ExperimentalGameRoom.tsx` (**2,953 سطراً**)
- **المسؤوليات الرئيسية**:
  - منسق الغرفة التنافسية وإدارة الانتقال بين حالات الجولة (`WAITING`, `CHOOSING`, `DRAWING`, `ROUND_END`, `PODIUM`).
  - تكيف الواجهة مع النافذة المرئية ولوحة المفاتيح في الهواتف (`visualViewport` و `--keyboard-inset`).
  - شريط الوقت عالي الدقة `SmoothTimer` (السطور 101-269).
  - النوافذ المنبثقة التفاعلية الـ11 المضمنة داخل الـ JSX عبر `CinematicModal`.
  - طبقات المراحل: اختيار الكلمات، لوحة الرسم النشطة، منصة التتويج، وشريط الدردشة العائم.
- **الأجزاء المستقلة الجاهزة للاستخراج**:
  - مؤقت `SmoothTimer` (168 سطراً).
  - النوافذ المنبثقة الـ11 (تستهلك أكثر من 550 سطراً).
  - شاشات المراحل المنفصلة (`ChoosingWordOverlay`, `PodiumOverlay`).

### 3. `server/rooms.ts` (**2,490 سطراً**)
- **المسؤوليات الرئيسية**:
  - مدير الغرف المركزي في الذاكرة `RoomManager` (مصدر الحقيقة الموحد للغرف).
  - دورة حياة الغرف والجولات، ومؤقت التحديثات الدوري `tick()`.
  - مصادقة الجلسات، التحقق من التوكنات، إدارة هوية الرسام، وإعادة الاتصال.
  - تخمينات الكلمات، المطابقة التقريبية، والتصويت على الطرد.
  - إدارة سجل الرسم `drawHistory`، وحاجز التراجع خطوة واحدة، ومزامنة الرسم الحر.
  - دوال معالجة البايتات والحزم الثنائية، وقواميس الكلمات.
- **الأجزاء المستقلة الجاهزة للاستخراج**:
  - دوال المطابقة النصية العربية والمسافة التحريرية وقاموس الكلمات (السطور 1-284).
  - دوال ترميز وفك الحزم الثنائية النقية (السطور 29-166).

### 4. `src/components/GameRoom.tsx` (**1,777 سطراً**)
- **المسؤوليات الرئيسية**:
  - منسق الغرفة الكلاسيكية (غير التجريبية).
  - تكرار شبه متطابق لنفس النوافذ المنبثقة الـ11 ونفس مسارات الجولة ومؤشرات القراءة غير المقروءة `UnreadBadge`.
- **فرص الاستخراج**:
  - إعادة استخدام النوافذ المنبثقة المستخرجة من الغرفة التجريبية، مما يقلص حجم الملف فوراً بنحو 400 سطر.

### 5. `src/components/Lobby.tsx` (**877 سطراً**)
- **المسؤوليات الرئيسية**:
  - شاشة البداية: اختيار الأفاتار، محدد الإيموجي، إدخال الاسم مع تجاوز قيود iOS.
  - شاشة الغرف: استعراض الغرف، استهلاك إحصائيات `get_rooms_info` مع تقييد التردد.
  - النوافذ المنبثقة: نافذة معلومات الغرفة `RoomInfoModal`، ونافذة الإيموجي المخصص `CustomEmojiModal`.
- **فرص الاستخراج**:
  - نافذة `RoomInfoModal` ومحدد الأفاتار `AvatarCarousel`.

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

#### 🟢 الدفعة 1: `BATCH-6A-1` — استخراج مؤقت اللعبة `SmoothTimer`
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `src/components/experimental/ExperimentalGameRoom.tsx` (تم تقليص 184 سطراً).
* **الملف الجديد المنشأ**: `src/components/game/SmoothTimer.tsx` (201 سطر).
* **الأجزاء المستخرجة**:
  - دالة الحساب النقي: `getMaxTimeForStatus(status: string, fallbackMaxTime: number)`.
  - المكون المستقل: `SmoothTimer` مع تغليفه بـ `React.memo` لمنع إعادة تصيير شريط المؤقت مع حالات الروم غير المرتبطة.
* **الاعتماديات والواجهات (Dependencies & Props)**:
  - Props: `status?: string`, `initialTimeLeft?: number`, `maxTime: number`, `isFullScreen?: boolean`, `socket?: any`, `gameState?: { status: string; timeLeft: number }`, `phaseRemainingMs?: number`, `phaseEndsAt?: number`.
  - استماع الحدث: يستمع محلياً إلى `socket.on("timer_tick")` مع تنظيف صريح `socket.off("timer_tick")` عند unmount.
  - الحفاظ على دورة `double-rAF` اللحظية لمنع وميض الشريط عند الانتقال بين الجولات.
  - تنفيذ انتقال CSS انسيابي واحد متصل من المقياس المتبقي الفعلي حتى الصفر لحالتي `ROUND_END` و `PODIUM`.
* **درجة المخاطر**: **الفئة A (منخفضة المخاطر - Low Risk)**.

---

### 🟢 الدفعة 2: `BATCH-6A-2` — استخراج نوافذ الإجراءات التفاعلية الأساسية (Action Modals)
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `src/components/experimental/ExperimentalGameRoom.tsx` (تم تقليص أسطر الـ JSX المضمنة للنوافذ بحدود 115 سطراً).
* **الملفات الجديدة المنشأة**:
  - `src/components/game/modals/ExitConfirmModal.tsx` (نافذة تأكيد الخروج).
  - `src/components/game/modals/SkipConfirmModal.tsx` (نافذة تأكيد تخطي الدور).
  - `src/components/game/modals/ReportConfirmModal.tsx` (نافذة تأكيد الإبلاغ عن الرسم).
  - `src/components/game/modals/AfkWarningModal.tsx` (نافذة تحذير الخمول وتأكيد التواجد مع العداد التنازلي).
* **الاعتماديات والواجهات**:
  - جميع المكونات مصممة كـ Presentation Components نقية تعتمد على Props صريحة (`isOpen`, `onClose`, `onConfirmExit`, `onConfirmSkip`, `onConfirmReport`, `onConfirmStay`, `afkCountdown`).
  - جميع التفاعلات وإرسال المقابس والحالات تبقى داخل منسق الروم.
* **درجة المخاطر**: **الفئة A (منخفضة المخاطر - Low Risk)**.

---

### 🟢 الدفعة 3: `BATCH-6A-3` — استخراج نوافذ الملف الشخصي والتنبيهات (Profile & Alert Modals)
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `src/components/experimental/ExperimentalGameRoom.tsx` (تم تقليص أسطر الـ JSX المضمنة للنوافذ بحدود 250 سطراً).
* **الملفات الجديدة المنشأة**:
  - `src/components/game/modals/PlayerProfileModal.tsx` (نافذة الملف الشخصي للاعب، الحظر/إلغاء الحظر، والتصويت بالطرد).
  - `src/components/game/modals/RoomAlertModals.tsx` (مكون جامع للنوافذ الست: Cooldown Warning, Banned/Kicked, Nickname Taken, Room Full, Auth Store Full, Join Timeout).
* **الاعتماديات والواجهات (Props Interface)**:
  - `PlayerProfileModal`: يستقبل `isOpen`, `playerToRender`, `isSelf`, `alreadyVoted`, `isBlocked`, `onClose`, `onToggleBlock`, `onToggleVoteKick`.
  - `RoomAlertModals`: يستقبل شروط الفتح كـ boolean وكولباكات المغادرة الفردية التي تنفذ مسح التخزين المحلي `safeLocalStorage.removeItem("gartic_player_room")` واستدعاء `onLeave?.()`.
* **درجة المخاطر**: **الفئة A (منخفضة المخاطر - Low Risk)**.

---

### 🟢 الدفعة 4: `BATCH-5A-1` — استخراج أدوات المطابقة العربية وقواميس الكلمات للسيرفر
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `server/rooms.ts` (تقليص صافي قدره 138 سطراً).
* **الملفات الجديدة المنشأة**:
  - `server/utils/arabicFuzzyMatch.ts` (يتضمن `getLevenshteinDistance`, `normalizeArabic`, `isCloseGuess`).
  - `server/data/wordsDictionary.ts` (يتضمن القاموس `ALL_WORDS` بـ 463 كلمة بالضبط).
* **التوافق التكامي مع المستهلكين الخارجيين**:
  - احتفاظ تصدير `normalizeArabic` من `server/rooms.ts` عبر `export { normalizeArabic } from "./utils/arabicFuzzyMatch.js";`.
* **درجة المخاطر**: **الفئة A (منخفضة المخاطر - Low Risk)**.

---

### 🟢 الدفعة 5: `BATCH-5A-2` — استخراج أدوات معالجة الحزم الثنائية للسيرفر (Pure Binary Helpers)
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `server/rooms.ts` (تقليص صافي قدره 116 سطراً).
* **الملف الجديد المنشأ**: `server/utils/binaryBufferHelpers.ts` (137 سطراً).
* **الأجزاء المستخرجة**:
  - `decodeZigZag(z: number): number`
  - `readVarIntFromBuffer(buf: Buffer, cursor: { offset: number }): number`
  - `decodeType13BufferSafely(buf: Buffer)`
  - `createType2Buffer(instId: string, points: { x: number; y: number }[]): Buffer`
  - `createType1Buffer(instId: string, tool: number, r: number, g: number, b: number, width: number, opacity: number, p0_x: number, p0_y: number): Buffer`
* **التوافق التكاملي مع المستهلكين الخارجيين**:
  - إعادة تصدير الدوال الخمس من `server/rooms.ts` للحفاظ على مسارات المستهلكين دون أي تعديل.
* **درجة المخاطر**: **الفئة A (منخفضة المخاطر - Low Risk)**.

---

### 🟢 الدفعة 6: `BATCH-7A-1` — إعادة استخدام النوافذ المستخرجة في `GameRoom.tsx`
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `src/components/GameRoom.tsx` (تقليص صافي قدره 350 سطراً).
* **المكونات المعاد استخدامها**:
  - `src/components/game/modals/ExitConfirmModal.tsx` (مع خاصية `spriteClassName="w-26 sm:w-36 h-auto"` للحفاظ على المظهر).
  - `src/components/game/modals/AfkWarningModal.tsx` (مع الحفاظ على شرط `(!isFreeDrawIsolated || isAfkPopupOpen)`).
  - `src/components/game/modals/PlayerProfileModal.tsx` (مع الحفاظ على حسابات الهوية والحظر والتصويت).
  - `src/components/game/modals/RoomAlertModals.tsx` (لتنبيهات Cooldown و Banned و Nickname Taken و Room Full و Auth Store Full و Join Timeout).
* **درجة المخاطر**: **الفئة A/B (منخفضة إلى متوسطة)**.

---

### 🟢 الدفعة 7: `BATCH-7A-2` — استخراج واجهات Lobby المستقلة
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `src/components/Lobby.tsx` (تقليص صافي قدره 80 سطراً).
* **الملفات الجديدة المنشأة**:
  - `src/components/lobby/RoomInfoModal.tsx` (واجهة نافذة معلومات الغرفة عبر `CinematicModal`).
  - `src/components/lobby/AvatarCarousel.tsx` (محدد الأفاتار الدائري والتنقل بالأسهم والتكيف مع لوحة المفاتيح).
* **درجة المخاطر**: **الفئة B (متوسطة المخاطر)**.
* **الحفاظ على السلوك**: الحفاظ على ملكية الحالة وتخزين الأفاتار في `safeLocalStorage`، وتجاوز قيود تركيز iOS، وبقاء حظر التمرير الخارجي و `preventScroll` وتراكب شبكة الإيموجي في `Lobby.tsx`.

---


### 🟢 الدفعة 8: `BATCH-6B-1` — استخراج شاشة اختيار الكلمات للرسام (`ChoosingWordOverlay`)
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `src/components/experimental/ExperimentalGameRoom.tsx`.
* **الملف الجديد المنشأ**: `src/components/experimental/ChoosingWordOverlay.tsx`.
* **الأجزاء المستخرجة**:
  - واجهة العرض الكاملة لشاشة اختيار الكلمات للرسام (`IT'S YOUR TURN!`) وخياري الكلمات وزر الرسم الفردي ومؤشر `Pencil`.
  - بقاء ملكية المقابس وحالة اللعبة `gameState` داخل `ExperimentalGameRoom.tsx`.
  - بقاء مكون `MiniBoardOverlay.tsx` مسؤولاً بالكامل عن شاشات `WAITING` و `CHOOSING (Guesser)` و `ROUND_END` و `PODIUM`.
  - استخراج منصة التتويج (`PodiumOverlay`) ليس جزءاً من هذه الدفعة لضمان وحدة دورة حياة شاشات اللوحة المصغرة.
* **درجة المخاطر**: **الفئة B (متوسطة المخاطر)**.
* **شروط قبول الدفعة**: الحفاظ الصارم على أبعاد الكانفاس واستجابة لوحة المفاتيح وسلوك الاختيار الفوري.

---

### 🔴 بوابات الاستقرار البحثية والمعمارية (Stability Gates - الإلزامية قبل الفئة C)

### 📌 `BATCH-2-RES` — دراسة دورة حياة سجل الرسم وحدود الذاكرة (`PHASE 2`)
* **الحالة**: `DEFERRED` (بوابة بحثية معمارية إلزامية)
* **المسؤولية**: دراسة حدود ذاكرة `drawHistory` وسلوك الغرف المفتوحة والتراجع الآمن.
* **الشرط الحاكم**: لا يمكن البدء في تفكيك سجل الرسم أو وحدات السيرفر الداخلية قبل إغلاق هذه المرحلة.

### 📌 `BATCH-3-SYNC` — مصفوفة التحقق السلوكي لمزامنة اللوحات (`PHASE 3`)
* **الحالة**: `DEFERRED` (بوابة اختبار سلوكي شاملة)
* **المسؤولية**: التحقق من تطابق اللوحات بين جميع اللاعبين عند انقطاع الاتصال والانضمام المتأخر وحزم الإصلاح.

---

### 🔴 الدفعات عالية المخاطر المؤجلة (High-Risk Category C Batches)

* **`BATCH-4E-1` — استخراج وحدة السجل والتراجع (`DrawingHistoryController`)**:
  * **الحالة**: `BLOCKED` (محظورة لحين استقرار `BATCH-2-RES`).
* **`BATCH-4F-1` — استخراج مسار مزامنة المقابس للرسم (`DrawingSocketSync`)**:
  * **الحالة**: `BLOCKED` (محظورة لحين استقرار `BATCH-3-SYNC`).
* **`BATCH-5B-1` — تفكيك وحدات السيرفر الداخلية (`RoomManager Modular Controllers`)**:
  * **الحالة**: `BLOCKED` (محظورة لحين استقرار `BATCH-2-RES` و `BATCH-3-SYNC`).

---

## 🔍 6. التحقق المركّز للدفعة الأولى (`BATCH-6A-1: SmoothTimer`)

تم حصر وتدقيق النقاط التقنية الخاصة بالدفعة الأولى لإثبات جاهزيتها للتنفيذ:
1. **استقلالية المكون**: المكون `SmoothTimer` لا يستدعي أي دوال تعدل حالة الروم أو الغرف أو الرسم. هو مكون مستهلك (Consumer) فقط.
2. **الاعتماديات المحددة**:
   - الدالة المساعدة `getMaxTimeForStatus` (سطر 86 في `ExperimentalGameRoom.tsx`) دالة نقية ترجع الحد الأقصى للثواني حسب الحالة (CHOOSING: 15s, ROUND_END: 5s, PODIUM: 15s, الافتراضي: maxTime). تُنقل مع المؤقت إلى نفس الملف أو ملف أدوات.
   - يعتمد المكون على `socket` للاستماع لحدث `timer_tick`. يمكن تمرير `socket` كـ Prop اختياري، أو استهلاكه عبر `useSocket()`.
3. **أثر الفصل على إعادة التصيير**:
   - حالياً، وجود `SmoothTimer` داخل نفس الملف يجعل أي تحديث للروم يمر عبر كود المؤقت، ومع استخراجه وتغليفه بـ `React.memo` مع الحفاظ على مستمع `timer_tick` الداخلي وتقنية `double-rAF`، سينعزل تحريك الـ CSS Bar عن شجرة الروم بنسبة 100% مما يوفر حماية للأجهزة الضعيفة.

---

*تم إنشاء هذا السجل المعماري ليكون المرجع الأساسي والدائم لكافة دفعات التفكيك في المشروع.*
