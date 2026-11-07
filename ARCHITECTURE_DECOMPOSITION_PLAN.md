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
  - النوافذ المنبثقة التفاعلية المضمنة واستخدام المكونات المستخرجة: `ChoosingWordOverlay`, `PlayersSidebar`, `MiniBoardOverlay`, `OverlayChatRoom`, `ExperimentalWordOverlay`, `ExperimentalHitOverlay`, `GameActivityFeed`, ونوافذ الإجراءات والتنبيهات الـ 6 المستخرجة عبر `CinematicModal`.
  - طبقات المراحل: اختيار الكلمات، لوحة الرسم النشطة، منصة التتويج، شريط التغذية التفاعلية المستخرج (`GameActivityFeed`), وشريط الدردشة العائم.
  - الحجم الحالي: حوالي 2052 خطاً برمجياً بعد استخراج `GameActivityFeed`.
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

## 🏛️ 4.5 ACTIVE ROOM MODES — ARCHITECTURAL REFERENCE (المرجع المعماري الدائم لأنماط الغرف النشطة)

> ⚠️ **تنبيه ملزم لجميع نماذج الذكاء الاصطناعي والمطورين**: يعتبر هذا القسم **مرجعاً معمارياً دائماً ومصدراً معتمداً للحقيقة** يصف الحالة التشغيلية الفعلية لجميع أنماط الغرف ومكونات الرسم والتوجيه وإعدادات المنتَج. **يجب قراءة ومراجعة هذا القسم قبل اقتراح أو تنفيذ أي تعديلات برمجية مستقبلاً** على مكونات الرسم، إدارة الغرف، إعدادات اللعب، أو بروتوكول المقابس.

### 4.5.1 Current Runtime Room Routing (توجيه أنماط الغرف أثناء التشغيل)
- **الغرف التنافسية (Competitive Rooms)**:
  - تشمل جميع النماذج المحددة مسبقاً (`General #Test`, `General #10P`, `Experimental Draw`, بالإضافة للغرف التنافسية المخصصة/الافتراضية).
  - تعتمد جميعها الخاصية البرمجية `isExperimental: true`.
  - يقوم الملف الرئيسي `src/App.tsx` بتوجيهها حصرياً إلى الغلاف التشغيلي `<ExperimentalGameRoom />`.
- **وضع الرسم الحر (Free Draw Mode)**:
  - يعتمد الخاصية البرمجية `isFreeDraw: true` (مع كون `isExperimental: false` أو `undefined`).
  - يقوم الملف الرئيسي `src/App.tsx` بتوجيه هذا الوضع حصرياً إلى الغلاف التشغيلي `<GameRoom />`.
- **توضيح معماري حاسم**:
  - كائن `GameRoom.tsx` حالياً يُمثل **الغلاف التشغيلي لوضع الرسم الحر حصراً**، وليس محرك رسم كلاسيكي منفصل.
  - كائن `ExperimentalGameRoom.tsx` يُمثل الغلاف التشغيلي لجميع الغرف التنافسية الحالية.
  - لا يجوز افتراض وجود محركات رسم مختلفة لمجرد اختلاف أسماء مكونات الغرف.

### 4.5.2 Current Room Configuration Matrix (مصفوفة تكوين الغرف وحقيقة إعدادات المنتج)

| اسم النمط / الغرفة (Preset / Room) | السعة القصوى (`maxPlayers`) | نقاط الفوز (`winningScore`) | نمط التشغيل (Mode) |
| :--- | :--- | :--- | :--- |
| **General #Test** | 5 لاعبين | 30 نقطة | تنافسي (Competitive) |
| **General #10P** | 10 لاعبين | 120 نقطة | تنافسي (Competitive) |
| **Experimental Draw** | 5 لاعبين | 30 نقطة | تنافسي (Competitive) |
| **Custom fallback** | 5 لاعبين | 30 نقطة | تنافسي (Competitive) |
| **Free Draw** | 5 لاعبين | 0 (بلا نهاية) | رسم حر (Free Draw) |

- **قرار المنتج المعماري الملزم (Explicit Product Decision)**:
  - اختلاف قيم نقاط الفوز (`winningScore`) هو **خيار تكوين متعمد ومقصود على مستوى كل غرفة على حدة**.
  - النمط `General #10P` **يجب أن يحتفظ بـ `winningScore: 120` بشكل دائم**، ويُحظر تماماً تعميم أو توحيد قيم نقاط الفوز إلى 30 عبر النماذج التنافسية.
  - لا يجوز افتراض أن الغرف التنافسية يجب أن تتشارك نفس نقاط الفوز؛ فقيمتا `maxPlayers` و `winningScore` متغيران مستقلان تماماً لضبط خيارات الروم.
  - يقرأ محرك اللعب التنافسي المشترك هذه القيم مباشرة من كائن الغرفة السيرفري `Room`.
- **التوجه المستقبلي لخيار إنشاء الغرف المخصصة (Future Product Direction)**:
  - قد يتم مستقبلاً إضافة خيار إنشاء غرف مخصصة بواسطة المستخدم مستوحى من تجربة Gartic.io تتيح للمستخدم تحديد عدد اللاعبين ونقاط الفوز المطلوبة لإكمال اللعبة.
  - هذه قدرة منتج مستقبلية (`FUTURE PRODUCT CAPABILITY`) وليست مهمة برمجية منفذة أو معتمدة في هذا التحديث الوثائقي.
  - التصميم المستقبلي سيعتمد محرك لعب تنافسي واحد مشترك مع تمرير إعدادات الغرفة المخصصة المعتمدة إلى كائن `Room` السيرفري.
  - يتم التمييز الصارم بين:
    1. **النموذج المخصص الحالي (Current Custom Fallback)**: تكوين ثابت بحجم 5 لاعبين و 30 نقطة.
    2. **إنشاء الغرف المخصصة المستقبلي (Future User-Created Configurable Rooms)**: ميزة مستقبلية غير منفذة بعد.

### 4.5.3 Shared Client Drawing Architecture (البنية المعمارية المشتركة لمحرك الرسم في العميل)

تتشارك جميع الغرف التنافسية ووضع الرسم الحر نفس تسلسل مكونات الرسم المعزولة:

- **المسار التنافسي (Competitive Pipeline)**:
  `App.tsx` -> `ExperimentalGameRoom.tsx` -> `IsolatedDrawingLayer.tsx` -> `ExperimentalDrawingBoard.tsx` -> `DrawingCanvasCore.tsx`
- **مسار الرسم الحر (Free Draw Pipeline)**:
  `App.tsx` -> `GameRoom.tsx` -> `IsolatedDrawingLayer.tsx` -> `ExperimentalDrawingBoard.tsx` -> `DrawingCanvasCore.tsx`

- **مسؤولية طبقة الرسم المشتركة (`Drawing Canvas Chain Responsibilities`)**:
  - استقبال وإلغاء وتجميع معالجة إدخالات المؤشر واللمس (Pointer/Touch Input).
  - بناء المسارات والخطوط وتصييرها على الكانفاس (Stroke Construction & Rendering).
  - تنفيذ أداء أداة الدلو، المسح، التراجع، وإلغاء التراجع.
  - التكامل مع التخزين المؤقت النقطي والنقاط المرجعية وسجل إعادة التشغيل المحلي.
  - معالجة واستيعاب أحداث الرسم الثنائية اللحظية ومزامنة اللوحة.
- **مسؤولية أغلفة الغرف (`Room Shell Responsibilities`)**:
  - إدارة عرض واجهة اللعبة، الجلسة، انتقال المراحل، وشاشات الانتظار واختيار الكلمات والتتويج.
- **حظر تكرار المحركات**: يُمنع استحدث محرك رسم ثانٍ أو مكرر لوضع الرسم الحر أو الغرف التنافسية.

### 4.5.4 Shared Client Drawing Utilities (الوحدات الحسابية المساعدة للرسم في العميل)

تعتمد طبقة الرسم المشتركة على الوحدات المساعدة المستخرجة التالية:
- `canvasPathRenderer.ts`: تصيير الأشكال الهندسية (`drawShape`) وتصيير المسارات الكاملة المنعمة (`drawEntirePath`).
- `canvasFloodFill.ts`: تنفيذ النواة الحسابية لتعبئة المساحات النقطية (`executeRasterFloodFill`).
- `canvasCheckpointManager.ts`: إدارة النقاط المرجعية للكانفاس (Checkpoints)، تقييد السقوف، وإبطال الطبقات وإدارة حد الذاكرة.
- `canvasUndoCache.ts`: التخزين المؤقت النقطي للتراجع بخطوة واحدة (`Single-step Bitmap Undo Cache`) وإنشاء الطبقات الكسول.
- `canvasReplayEngine.ts`: دوال تصيير إعادة التشغيل الفردية والمجمعة (`replaySingleCommand`, `renderLeftoverReplaySessions`).

### 4.5.5 Shared Server Drawing Architecture (البنية المعمارية المشتركة للسيرفر ومحرك الرسم)

يعتمد السيرفر مسار معالجة موحد بين وضع الرسم الحر والغرف التنافسية:

`server/registerDrawBinaryHandler.ts` -> `server/roomCanonicalStrokeEngine.ts` -> `server/roomDrawingHistory.ts`

- **توزيع المسؤوليات بالسيرفر**:
  - `server/registerDrawBinaryHandler.ts`: استقبال وتوجيه الحزم الثنائية، التحقق من الصلاحيات والأدوار، الترحيل الشبكي، وإرسال إشعار اعتماد الضربة `Type 11` (Commit Ack).
  - `server/roomCanonicalStrokeEngine.ts`: المعالجة التزامنية للضربات المعيارية النشطة، فك ترميز الحزم المضغوطة `Type 2` و `Type 13`، بناء حزمة الاعتماد المعيارية `Type 9`، وإدارة التخزين المعياري المؤقت.
  - `server/roomDrawingHistory.ts`: خوارزميات سجل الرسم المعتمدة بالسيرفر، الحذف المستهدف للضربات، سلوك التراجع/إلغاء التراجع بخطوة واحدة، وحماية ثوابت سجل الرسم.
  - `RoomManager` (`server/rooms.ts`): المالك الحصري لحالة الغرف المعتمدة `this.rooms` في الذاكرة، واجهات التوافق (Facades)، دورة حياة الغرف واللاعبين، بث إشعارات الإلغاء `Type 12` عبر `abortFreeDrawStroke`، تنسيق المسح، إدارة الاتصال وإعادة الاتصال، وسجل هويات الرسم.
- **مسار التوافق القديم (Legacy Branch)**: مسار `isFreeDraw: false && isExperimental: false` يظل مسار توافق قديم لا يوجد له أي روم نشط مدمج في الواجهة والتوجيه الحالي.

### 4.5.6 Permanent Mode Difference Matrix (مصفوفة الفروقات الدائمة بين الأنماط)

| العنصر / الخاصية | الأنماط التنافسية (`Competitive`) | وضع الرسم الحر (`Free Draw`) |
| :--- | :--- | :--- |
| **مكونات محرك الرسم** | مشتركة بالكامل (`DrawingCanvasCore` -> `ExperimentalDrawingBoard` -> `IsolatedDrawingLayer`) | مشتركة بالكامل (`DrawingCanvasCore` -> `ExperimentalDrawingBoard` -> `IsolatedDrawingLayer`) |
| **البنية الشبكية الثنائية** | مشتركة (`Type 13` مضغوط، `Type 9` معياري، `Type 11`, `Type 12`, بروتوكول الإصلاح) | مشتركة (`Type 13` مضغوط، `Type 9` معياري، `Type 11`, `Type 12`, بروتوكول الإصلاح) |
| **محرك السيرفر والذاكرة** | مشترك (`roomCanonicalStrokeEngine` & `roomDrawingHistory`) | مشترك (`roomCanonicalStrokeEngine` & `roomDrawingHistory`) |
| **دورة حياة الجولات** | مراحل متسلسلة (`WAITING`, `CHOOSING`, `DRAWING`, `ROUND_END`, `PODIUM`) | جلسة مستمرة غير محدودة بوقت ولا تحتوي على مراحل جولات تلقائية |
| **إدارة دور الرسام** | رسام واحد لكل دور مع قائمة دور واسم كلمة محدد | رسامون متعددون نشطون في نفس الوقت عبر `room.activeDrawers` |
| **نظام التخمين والدردشة** | تخمين الكلمة المطلوبة مع احتساب النقاط وتصنيف الإجابات | دردشة تفاعلية عامة بين اللاعبين دون نظام تخمين نقاط |
| **مؤقتات العد التنازلي** | مؤقت جولة محدد لكل مرحلة (`SmoothTimer`) | بلا مؤقت جولات (مع بقاء المراقبة العامة للـ AFK وإعادة الاتصال نشطة) |
| **التحقق من التراجع** | تراجع مستهدف بالضربة عبر المحرك المعياري | تراجع مستهدف بالضربة مع التحقق الصارم من ملكية هوية الرسام للـ Socket |
| **عناصر الواجهة المميزة** | شريط الوقت، اختيار الكلمات، لوحة التتويج، زر إلغاء الدور | بطاقات أجهزة الرسامين الطافية، أزرار بدء/إيقاف الرسم الحر |

### 4.5.7 Experimental Feature Flags & DPR Gate Reference (أعلام الخصائص التجريبية وتدقيق DPR)

مكون `src/components/experimental/ExperimentalDrawingBoard.tsx` يحتوي على أعلام الخصائص التالية:
- `EXPERIMENTAL_COLOR_WHEEL_TEST = true`
- `EXPERIMENTAL_INPUT_OPTIMIZATIONS_TEST = true`
- `EXPERIMENTAL_BITMAP_UNDO_TEST = true`
- `EXPERIMENTAL_DPR_1_TEST = true`
- `EXPERIMENTAL_CANVAS_ALPHA_TEST = true`
- `EXPERIMENTAL_DESTINATION_OUT_ERASER_TEST = true`

- **آلية تأثير الأعلام عبر الأنماط**:
  - نظرأ لأن جميع الغرف التنافسية الحالية تعتمد `isExperimental: true`، فإن هذه الأعلام تؤثر على جميع الغرف التنافسية.
  - وضع الرسم الحر يمتلك شروطاً مستقلة عبر `isFreeDraw` تقوم بتفعيل السلوكيات المماثلة مباشرة (تحسينات الإدخال، التخزين المؤقت النقطي للتراجع، تثبيت DPR عند 1.0، قناة Alpha، أداة المحاية بـ destination-out، وعجلة الألوان).

- **نتيجة التدقيق الفني لبوابة DPR الصامتة (Known Ineffective DPR Test Gate)**:
  - **حقيقة الكود الفعلية**: العلم `EXPERIMENTAL_DPR_1_TEST` لا يتحكم بشكل مستقل في دقة الكانفاس المرئية للرومات التنافسية النشطة.
  - **السبب الفني**: يحسب `DrawingCanvasCore.tsx` دقة `effectiveDPR` باستخدام الشرط:
    `const effectiveDPR = (isFreeDraw || isExperimental || enableFixedDPR) ? 1.0 : (window.devicePixelRatio || 1.0);`
  - ونظراً لأن جميع الغرف التنافسية تعتمد `isExperimental: true` ووضع الرسم الحر يعتمد `isFreeDraw: true`، فإن `effectiveDPR` يظل مثبتاً دائماً عند `1.0` حتى لو تم تغيير قيم `EXPERIMENTAL_DPR_1_TEST`.
  - **التصنيف والتوجيه**: يُصنف كـ **ملاحظة فنية مثبتة لم يتم تعديلها (KNOWN TECHNICAL FINDING — NOT FIXED)**. يُحظر تعديل هذا السلوك في مهام التوثيق؛ وأي تغيير مستقبلي لدقة DPR يتطلب تدقيقاً شاملاً ومستقلاً لأثره على استهلاك الذاكرة والمعالج والأجهزة الضعيفة.

- **التعليقات القديمة في الكود (Stale Comments)**:
  - توجد بعض التعليقات داخل `DrawingCanvasCore.tsx` تشير إلى استخدام الرومات التنافسية لدقة DPR متكيفة (Adaptive DPR). هذه التعليقات غير دقيقة تشغيلياً بسبب اعتماد جميع الرومات التنافسية على `isExperimental: true`. تم ترك التعليقات كما هي دون مساس بها في هذه المهمة التوثيقية.

### 4.5.8 Performance and Safety Principles (مبادئ الأداء والسلامة الهيكلية)
1. **الحفاظ الصارم على محرك رسم واحد مشترك** وتجنب إنشاء نسخ مكررة من مكونات الرسم.
2. **الحفاظ على المعالجة التزامنية الفورية** لحزم Movement `Type 2` و `Type 13` بالسيرفر وتفادي إدخال طبقات كولباك أفقية أو نقل أحداث غير متزامن.
3. **تفادي مطالبات الأداء غير المثبتة**: مفكك `Type 13` ينشئ كائنات ومصفوفات مؤقتة طبيعياً دون ادعاء "انعدام التخصيص الذاكري بالكامل".
4. **حماية ملكية الحزم والتسلسل الزمني**: الحفاظ على ترتيب تسجيل `Type 9` متتبوعاً بـ `Type 3` بالسجل، ملكية `Type 11` لمسار Handler المقابس، وملكية `Type 12` لدالة `abortFreeDrawStroke` في `RoomManager`.
5. **إبقاء مصدر الحقيقة للغرف داخل `RoomManager`** وتفادي تقسيم حالة الغرفة لمجرد تقليص حجم أسطر الملفات.
6. **مراعاة التأثير المزدوج**: عند تعديل أي مكون رسم مشترك، يجب اختبار وفحص سلوكه في كل من الغرف التنافسية ووضع الرسم الحر.

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

### 🟢 الدفعة `BATCH-6C-1` — استخراج شريط التغذية التفاعلية السريعة (`GameActivityFeed`)
* **الحالة**: `[x] COMPLETED`
* **الملف المصدر**: `src/components/experimental/ExperimentalGameRoom.tsx`.
* **الملف الجديد المنشأ**: `src/components/game/GameActivityFeed.tsx`.
* **درجة المخاطر**: **الفئة A (منخفضة المخاطر - Low Risk)**.
* **التفاصيل والمعايير المعمارية**:
  - تم استخراج قسم التغذية التفاعلية السريعة (Quick Feedback Area) بالكامل إلى مكون عرض مستقل وغير مالك للحالة (Stateless Presentational Component) باسم `GameActivityFeed`.
  - يتلقى المكون المقترن 4 Props فقط: `guesses`, `socketId`, `amIDrawer`, `isFreeDraw`.
  - تم الاحتفاظ بجميع مستمعي Socket.IO، وحالة `guesses` ومراجعها التزامنية `guessesRef` ورسائل الخلفية المؤجلة، والمؤثرات الصوتية، وإدارة حالة اللعبة بالكامل داخل `ExperimentalGameRoom.tsx`.
  - تمت المحافظة الصارمة على ترتيب الرسائل المعكوس `[...guesses].reverse()` وكافة شروط التصيير والأيقونات ومستويات الألوان والأنيميشن ونمط `dir="auto"`.

---

### 🟡 الملاحظة الفنية للدفعة المخططة `BATCH-6C-2` — تنظيف كود جزيئات الاحتفال غير المستغلة
* **التصنيف المعماري**: `VERIFIED UNUSED CODE — PROPOSED CLEANUP, NOT YET IMPLEMENTED`
* **التفاصيل المعمارية**:
  - كشف التدقيق المصطفي للكود في `ExperimentalGameRoom.tsx` أن المتغير `confettis` المولّد عبر `React.useMemo` (في الأسطر 280–319) يُنشئ 120 كائناً لجزيئات الاحتفال عند دخول مرحلة `PODIUM` دون وجود أي مرجع أو استخدام أو تصيير له في أي مكان آخر داخل المكون.
  - لم يُنفذ حذف هذا الكود في هذه الدفعة، وتم توثيقه كمرشح للتنظيف في الدفعة القادمة `BATCH-6C-2`.

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

### 🟢 المرحلة المعمارية المكتملة (`PHASE 5B`)

#### 🟢 `PHASE 5B — SERVER / ROOMMANAGER MODULAR CONTROLLERS`
* **الحالة**: `[x] COMPLETED — CLOSED (NO FURTHER EXTRACTION WARRANTED)`
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

##### 🟢 `Stage 3: Residual RoomManager Core Architectural Audit & Closure`
* **الحالة**: `[x] COMPLETED — CLOSED (NO FURTHER EXTRACTION WARRANTED)`
* **طبيعة التدقيق**: تدقيق معماري بنمط **القراءة فقط (Read-Only Source Audit)** لم يقم بتشغيل أو إعادة تنفيذ الاختبارات الآلية، واعتمد على فحص الكود المباشر وتحليل شجرة الاعتماديات.
* **النتائج والحقائق المعمارية الدائمة المثبتة**:
  1. **القرار المعماري النهائي**: إغلاق المرحلة `PHASE 5B` رسمياً بقرار **عدم الحاجة لاستخراج إضافي تحت البنية والمسؤوليات الراهنة (`NO FURTHER EXTRACTION WARRANTED`)**. استخراج `server/roomDrawingHistory.ts` و `server/roomCanonicalStrokeEngine.ts` أنشأ الحد المعياري المستقل والأنسب للمشروع. لا يعني ذلك حظر أي تفكيك مستقبلي للأبد؛ وإنما عدم وجود مبرر معماري حالي، وحال ظهور حدود مستقلة مستقبلاً يمكن إجراء تدقيق جديد.
  2. **خريطة ملكية ومسؤوليات `RoomManager` المتبقية**:
     - **ملكية كائنات الغرف وفهرس اللاعبين**: يحتفظ `RoomManager` بالملكية الحصرية لخريطة الغرف `this.rooms: Map<string, Room>` كـ Source of Truth، وفهرس `this.players: Map<string, Player>` المخصص للبحث السريع برقم المقبس `socketId` إلى كائن `Player`، إلى جانب مصفوفة `room.players` التي تُمثّل عضوية اللاعبين داخل كل غرفة.
     - **اختيار الرسام وتدوير الدور**: تختار دالة `transitionToChoosing` أول مرشح في `room.gameState.turnQueue` يوجد له كائن لاعب مطابق داخل مصفوفة `room.players` (عبر المطابقة مع `p.persistentId || p.id`) دون تصفية صريحة لخاصية `isOffline`.
     - **إدارة الانقطاع وفترة السماح الصامتة**: تحفظ دالة `handleDisconnect` عمداً `p.isOffline = false` خلال فترة السماح الصامتة (90 ثانية) وتكتفي بتثبيت `p.offlineSince = Date.now()` لمنع اضطراب واجهة المستخدم وتأطير مؤقت الإخلاء في `this.evictionTimers`.
     - **دوال تنسيق الرسم الحر المتبقية داخل `RoomManager`**:
       - `syncActiveFreeDrawStrokesToSocket`: تنسيق تجهيز حزم `Type 1` و `Type 2` ومزامنة الضربات النشطة المفتوحة للداخلين الجدد.
       - `abortAllActiveFreeDrawStrokesForSocket`: تنظيف وإلغاء الضربات النشطة للمقابس المنقطعة.
       - `abortAllActiveFreeDrawStrokesForRoom`: تنظيف وإلغاء جميع الضربات النشطة للغرفة.
       - `abortFreeDrawStroke`: بث حزمة الإلغاء الثنائية `Type 12` على مستوى الغرفة عبر Socket.IO.
       - *(هذه الدوال تُمثل تنسيق البث والإنهاء الشبكي على مستوى الغرف وليست خوارزميات فك الترميز أو سجل التراجع المستخرجة).*
     - **الدقة والصياغة المعمارية والأداء**:
       - الأجزاء التزامنية في JavaScript تُنفّذ بشكل تتابعي متسلسل على خيط الـ Event-loop في Node.js.
       - مؤشرات كولباك المؤقتات وأحداث المقابس تُنفذ في مهام لاحقة لـ Event-loop وتتطلب دائماً التحقق من صلاحية الحالة (`stale-state validation`).
       - يقوم `RoomManager` بالمرور على خرائط الضربات النشطة لعمليات الإلغاء والتنسيق والمزامنة، كما يمر Tick الدوري على الغرف النشطة دون افتراض سقف عددي عالمي غير موثق.
       - تحتفظ جميع الغرف بقيم تكوينها المستقلة المعتمدة (`General #Test`: maxPlayers 5, winningScore 30; `General #10P`: maxPlayers 10, winningScore 120).

---

### 🟢 التدقيق المعماري المكتمل (`PHASE 5C`)

#### 🟢 `PHASE 5C — ACTIVE ROOM MODES CONSISTENCY AUDIT`
* **الحالة**: `[x] COMPLETED — READ-ONLY SOURCE AUDIT`
* **النتائج والحقائق المعمارية الدائمة المثبتة**:
  1. **اشتراك النماذج التنافسية الحالية في نفس التنفيذ**: تعتمد جميع الغرف التنافسية (`General #Test`, `General #10P`, `Experimental Draw`, Custom fallback) الخاصية البرمجية `isExperimental: true` وتُوجّه إلى غلاف اللعب التنافسي الموحد `<ExperimentalGameRoom />`.
  2. **قيم التكوين المستقلة للمنتج**: اختلاف قيم السعة القصوى للاعبين (`maxPlayers`) ونقاط الفوز المطلوب تحصيلها (`winningScore`) هو خيار تكوين متعمد على مستوى كل غرفة؛ حيث يحتفظ النمط `General #10P` بـ `winningScore: 120` وتستعين باقي النماذج التنافسية بـ `winningScore: 30`. يُحظر تماماً تعميم أو توحيد قيم نقاط الفوز.
  3. **وضع الرسم الحر نمط تشغيل/جلسة مستمر وليس محرك رسم منفصل**: وضع الرسم الحر (`isFreeDraw: true`) يُوجّه إلى `<GameRoom />` كغلاف تشغيلي للجلسة، ويتشارك مع الغرف التنافسية محركات الرسم المشتركة بالسيرفر والعميل.
  4. **البنية المعمارية المشتركة للعميل والسيرفر**: استخدام المحرك المعياري المستمر بالسيرفر (`roomCanonicalStrokeEngine` & `roomDrawingHistory`) وسلسلة مكونات الرسم بالعميل (`IsolatedDrawingLayer` -> `ExperimentalDrawingBoard` -> `DrawingCanvasCore`).
  5. **التمييز بين النموذج المخصص الحالي والإنشاء المستقبلي للغرف**: النموذج المخصص الحالي يمتلك تكويناً ثابتاً (5 لاعبين، 30 نقطة)، بينما إتاحة إنشاء غرف مخصصة بخيارات يحددها المستخدم هي ميزة مستقبلية مستوحاة من Gartic.io وليست مهمة منفذة حالياً.
  6. **توثيق نتائج التدقيق الفني (Technical Findings)**: تم توثيق النواقص الشكلية كـ ملاحظات فنية مثبتة لم يتم تعديلها دون إجراء أي تغييرات برمجية (بوابة DPR الصامتة `EXPERIMENTAL_DPR_1_TEST` والتعليقات القديمة في `DrawingCanvasCore.tsx`).
  7. **الحيادية البرمجية الكاملة**: أُنجز التدقيق بنجاح ودون إجراء أي تعديلات على الكود السورس أو السكريبتات أو ملفات التكوين.



---
