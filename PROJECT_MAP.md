# PROJECT_MAP.md

## 1. Vision
بناء منصة ألعاب اجتماعية عربية (Mobile-First Web Platform) تبدأ بلعبة "رسم وتخمين" لحظية. المنصة تركز على السرعة، البساطة، واللعب الجماعي اللحظي بأقل قدر من التعقيد، مع بنية تحتية تسمح بإضافة ألعاب جديدة مستقبلاً بسهولة.

## 2. Core Philosophy
- **Simplicity First:** أقل قدر من الكود يحل المشكلة.
- **Mobile-First:** تصميم موجه بالكامل لشاشات الهاتف الصغرية (بدون Hover, أزرار كبيرة، واجهات غير مزدحمة).
- **Core Loop Focus:** صب التركيز على جعل نواة اللعبة (Game Loop) ممتعة وسريعة ومستقرة قبل أي توسع.

## 3. MVP Scope (M1 - M3)
- إنشاء غرفة ومشاركتها عبر رابط.
- الانضمام لغرفة.
- الرسم اللحظي وتزامنه مع اللاعبين.
- التخمين عبر نظام الدردشة.
- إدارة الجولات واختيار الرسام.
- نظام نقاط مبسط جداً ومؤقت للجولة.

## 4. Architecture Overview
**Monolith Modular Architecture**
- تطبيق واحد شامل (Single Node.js Process) لتوفير التكاليف وتقليل التشعب المفرط.
- الـ Frontend والـ Backend يعملان عبر خادم واحد (Express + Vite Middleware).
- **الطبقات:**
  - `Core/Room Engine`: إدارة الغرف واللاعبين، بغض النظر عن اللعبة الحالية.
  - `Game Logic`: الوحدات الخاصة بكل لعبة (مثل وحدة الرسم).
  - `Socket Layer`: استقبال الأوامر وتوزيع الحالات (State Broadcast).

## 5. Tech Stack
- **Frontend:** React 18, Vite, Tailwind CSS (Mobile-First UI).
- **Backend:** Node.js, Express, Socket.io (Realtime).
- **Database:** SQLite (سيتم دمجها لاحقاً لحفظ بيانات الغرف أو الجلسات المعمرة - حالياً الاعتماد على In-Memory).

## 6. Folder Structure Proposal (Flat & Simple)
```text
/src
  /components     # واجهات React التشاركية والأساسية
  /providers      # React Contexts (Socket Provider, etc.)
  /lib            # وظائف مساعدة عامة (Utils)
/server.ts        # المدخل الأساسي (Vite + Express)
```

## 7. Room System Concept
الغرفة هي المحور. تتكون من `RoomID`، قائمة الـ `Players`، ولها `GameState`. النظام يجب أن يدير دخول/خروج اللاعبين واكتشاف انقطاع الاتصال تلقائياً (Disconnect Handling) وتنظيف الغرف الفارغة.

## 8. Game Module Concept
أي لعبة يجب أن تمتلك واجهة موحدة `IGameModule` لتسجيل أحداثها (Events) وتحديث حالتها، مما يجعل فصل منطق اللعبة عن محرك الغرف ممكناً.

## 9. Socket Communication Principles
- **Event-Driven:** الاعتماد على الـ Sockets للإرسال والاستقبال.
- **State Broadcast:** الخادم هو مصدر الحقيقة (Single Source of Truth). يرسل حالة الغرفة الكاملة أو تحديثات جزئية (Diffs) لتحديث الـ UI.

## 10. Database Philosophy
تأجيل تعقيد قواعد البيانات المستضافة. البدء بحالة في الذاكرة (In-Memory Maps)، ثم التدرج نحو SQLite كملف محلي إذا تطلب الأمر تخزين الجلسات (Sessions) أو إحصائيات مبسطة.

## 11. Performance Principles
- الحد من تأثير إعادة الرسم بـ React.
- ضغط بيانات الرسم المرسلة عبر Socket.io (تجميع النقاط في مصفوفة وتمريرها بدل تمرير حدث لكل بكسل).

## 12. Mobile-First Rules
لا توجد حالات Hover. مساحة الرسم تستغل الشاشة أو جزء كبير منها المريح للإصبع. الشات يقع بأسفل השاشة أو ينزلق ليُسهل الكتابة والتخمين.

## 13. Things Explicitly Avoided
متجر، عملات، نظام أصدقاء، متابعة، Voice Chat، قواعد بيانات ضخمة و Microservices.

## 14. Scalability Strategy
Scale-Up prior to Scale-Out. تعظيم قدرة الخادم الفردي، ثم الانتقال لـ Redis Adapter لدعم أكثر من خادم (Node) فقط عندما يكون هناك ضغط فعلي موثق.

## 15. Risk Assessment
- **Socket Overload:** زيادة الـ Payload أثناء الرسم بـ Socket.io (الحل: Batching للـ draw points).
- **Memory Leaks:** الغرف النشطة إلى الأبد (الحل: Garbage collection للغرف الخاملة لمدة ساعة).

## 16. Development Priorities (M1 to M4)
- **M1:** الهيكل الأساسي + Socket Connection. *(Completed)*
- **M2:** Room Engine + Syncing State. *(Completed)*
- **M3:** Drawing Logic (UI Fully Enhanced, Snapshot, Undo limits, Buck Fill fix, External Strokes, Zoom limit) *(Completed)*.
- **M4.1:** Login System UI (Electric Purple & Cyan Theme, Home, Rooms Browser, Room Info Modal). *(Completed)*
- **M4.2:** Guessing Logic (Core Loop, Socket events for game state, Game Room UI). *(Completed)*
- **M4.3:** Canvas Dimension Normalization و Sync Fixes (Fixed 4:3 aspect ratio, relative coordinate broadcast, responsive Guesser View, Socket loopback double-draw & undo/redo sync fixed). *(Completed)*
- **M4.4:** Integrate real Socket.io events for Game State (Turn management, Scoring, Word Selection, synchronization). *(Next Task)*

**⚠️ TEMPORARY TESTING MODIFICATIONS (MUST BE REVERTED LATER) ⚠️**
- `server.ts`: Replaced `socket.broadcast.emit` with `io.emit` for drawing events to allow internal UI loopback.
- `GameRoom.tsx`: The fullscreen DrawingBoard is hidden (`display: none`) instead of being unmounted so that it retains its state while testing the read-only loopback.


## 17. Success Criteria For MVP
- [x] واجهة رسم احترافية للهواتف (Pinch-to-Zoom, Tools, Colors).
- [ ] لعبة تعمل بدون تقطعات ظاهرة.
- [ ] يمكن لـ 5 أصدقاء الدخول في نفس الغرفة بسلاسة.
- [ ] لعب 3 جولات وفوز لاعب مع عرض اللوحة النهائية.

## 18. Technical Debt Warnings
الاعتماد الكلي على In-Memory State قد يؤدي لضياع الغرف عند إعادة التشغيل (Restart). مقبول للمرحلة الحالية، لكن يجب توثيقه.

## 19. Future Expansion Rules
لإضافة لعبة، لا نعدل الـ Core. ننشئ لعبة في `/games/ludo` تتوافق مع `IGameModule`.

---
## ORPHANS & PENDING (قيد المراجعة أو معلق)
- تثبيت وتفعيل Type Definitions لمنطق الغرف والأحداث.
- تحديد أقصى سعة تحميل للخادم للـ Drawing Data.
