# 🌐 خارطة طريق التدويل وتعدد اللغات (Localization Roadmap — `PHASE L10N`)

**المستودع المرجعي:** `hamoudi100hamoudi-beep/social-games-v1`  
**الحالة الحالية:** `PHASE L10N-0 COMPLETED — AUDIT & ROADMAP ESTABLISHED` (تاريخ التدقيق: `2026-11-22`)  
**الوثائق المرجعية المرتبطة:**  
- دستور محرك الرسم والتراجع: [`AGENTS.md`](./AGENTS.md)  
- خارطة الطريق المعمارية الموحدة: [`REFACTORING_ROADMAP.md`](./REFACTORING_ROADMAP.md)  
- خارطة طريق الموثوقية والأمان: [`PRODUCTION_RELIABILITY_ROADMAP.md`](./PRODUCTION_RELIABILITY_ROADMAP.md)  

---

## 1. الحوكمة والقيود غير القابلة للكسر (Binding Governance & Protected Systems)

تخضع جميع مراحل **`PHASE L10N`** (`L10N-0` إلى `L10N-6`) للقوانين الصارمة التالية، ويُحظر تجاوزها في أي دفعة قادمة:

1. **حماية ثوابت [`AGENTS.md`](./AGENTS.md) ومحرك الرسم/التراجع:**
   - عدم تعديل حزم `draw_binary` الثنائية، أو شرط أداة الدلو الأولي (`type === 4 || type === 10 || type === 5`) في `server/rooms.ts` (`recordDrawCommand`)، أو قفل `isDrawingActive = false` عند `undo`، أو `redoStack` ذات الخطوة الواحدة، أو `CanvasCheckpointManager`، أو منع تسجيلات الأداء الساخنة.
2. **حماية الإصلاحات السابقة (`UI-A` / `UI-B` / `UI-C`):**
   - **`UI-A Stage 2A`:** الحفاظ التام على استقرار حركة نهاية الجولة (`roundEndAnimationKey` / `MiniBoardOverlay`) دون اهتزاز أفقي أو إعادة ظل CSS الزائد.
   - **`UI-B Stage B2`:** الحفاظ التام على تطابق نسبة إطار لوحة المتفرج `aspect-[680/396]` (`GameRoom.tsx:1110`, `ExperimentalGameRoom.tsx:1450`) ونمط `object-contain` دون مطّ أو قصّ.
   - **`UI-C Stage 1 & 2A`:** الحفاظ التام على مفتاح الهوية المستقرة `persistentId || id`، ومهلة تتبّع الدخول، وغلاف الأنيميشن `flex items-center min-w-0 max-w-full overflow-visible` في `PlayersSidebar.tsx` و`FreeDrawPlayersList.tsx`.
3. **استقلالية الكلمات والتخمين عن لغة الواجهة (Shared Round Content Rule):**
   - تبقى مصفوفة الكلمات (`server/data/wordsDictionary.ts` — `ALL_WORDS`)، وخيارات الكلمات (`wordOptions`)، والكلمة المختارة (`currentWord`)، وتلميحات الحروف المقنّعة (`maskedWordArray`)، واتجاه الكلمة (`isRTL`)، ومحرك المطابقة التقريبية (`server/utils/arabicFuzzyMatch.ts`) **مشتركة على مستوى الغرفة/الجولة** دون أي ترجمة فردية لكل لاعب.
4. **تنفيذ مرحلة واحدة فقط في كل دفعة:** لا يُدمج كود من مرحلتين معاً، ولا تبدأ أي مرحلة تالية إلا بعد اجتياز بوابات القبول (`npx tsc --noEmit` + `npm run build` + التحقق اليدوي من المالك).

---

## 2. القرارات المنتجة المثبتة (Fixed Product Decisions — Zero Ambiguity)

1. **لغة واجهة مستقلة لكل لاعب داخل الغرفة الواحدة:**
   - يمكن للاعبٍ بواجهة عربية اللعب في نفس الغرفة مع لاعبٍ بواجهة إنجليزية في الوقت ذاته.
   - الخادم والغرفة لا يفرضان لغةً موحدة للواجهة على جميع اللاعبين.
2. **أوضاع اللغة الثلاثة (`LanguageMode`):**
   - `"auto"` (الافتراضي): يقرأ اللغة الأساسية للمتصفح (`navigator.languages?.[0] || navigator.language`)؛ إذا بدأت بـ `"ar"` يختار `"ar"`، وفي أي لغة أخرى يختار `"en"`.
   - `"ar"`: العربية إجبارياً.
   - `"en"`: الإنجليزية إجبارياً.
3. **التخزين والتبديل المحلي (بدون قاعدة بيانات أو حسابات):**
   - يُحفظ الاختيار محلياً عبر `safeLocalStorage` (`src/utils/storage.ts`) بمفتاح مخصص (مثل `drawio_ui_lang_mode`).
   - الاختيار اليدوي (`"ar"` أو `"en"`) يتفوق على `"auto"`، مع توفير خيار واضح في شاشة البداية/اللوبي (`Lobby.tsx`) للعودة إلى وضع `"auto"` في أي وقت.
4. **النصوص التي لا تُترجم أبداً:**
   - **محتوى اللاعبين:** الأسماء المستعارة (`nickname`)، أسماء الغرف المخصصة (`#Custom`)، رسائل الدردشة العادية، وتخمينات اللاعبين.
   - **محتوى الجولة المشترك:** `wordOptions`، `currentWord`، `maskedWordArray`، وعرض الكلمة في `ExperimentalWordOverlay.tsx`.
   - **العناوين التجارية والكارتونية ذات الطابع البصري الثابت (`GameTitle` — `Fredoka` 3D Stroke):** تبقى بالإنجليزية دائماً في الواجهتين العربية والإنجليزية:
     - علامة اللعبة وشاشة الغرف: `DRAW.IO`, `ROOMS`
     - عناوين النوافذ المنبثقة (`GameTitle`): `EXIT`, `REPORT`, `PROFILE`, `SKIP`, `INACTIVE`, `INFO`, `ERROR`, `KICKED`, `SLOW DOWN`, `SERVER FULL`, `TIMEOUT`, `DISCONNECTED`, `CLEAN`, `NAMES`, `CUSTOM EMOJI`
     - عناوين لوحة `MiniBoardOverlay` (`GameTitle`): `FREE DRAW`, `WAITING`, `NEW TURN!`, `SKIPPED!`, `INACTIVE`, `CANCELED TURN`, `INTERVAL`, `MASTERPIECE!`, `GAME OVER`
   - *استثناء توضيحي:* النصوص الوصفية، العناوين الفرعية، الأزرار (`PLAY`, `YES`, `NO`, `OK`...)، التلميحات (`title`)، وأوصاف `aria-label` المحيطة بهذه العناوين **تُترجم بالكامل**.

---

## 3. القسم الإلزامي: `EXISTING TEXT-DIRECTION & CHAT SAFEGUARDS — MUST PRESERVE`

يوثّق هذا القسم كل آليات الحماية الحالية الخاصة باتجاه النص (BiDi / RTL / LTR) وعرض الدردشة وسجل الأنشطة ومنطقة الرسم، والتي أثبت التدقيق القرائي وجودها وضرورة حمايتها من الكسر عند تفعيل الترجمة وتبديل `dir="rtl"` / `dir="ltr"`:

### Safeguard 1 — مرشح تضمين رسائل النظام في نافذة الدردشة (`OverlayChatRoom.tsx:103-112`)
- **الملف والأسطر:** `src/components/game/OverlayChatRoom.tsx` (`103–112`)
- **الوظيفة الحالية:** يقرّر عرض رسالة `type === 'system'` في نافذة الدردشة عبر مطابقة نصوص ثابتة: `'انضم للغرفة'`, `'joined'`, `'غادر الغرفة'`, `'left'`, `'خرج'`, `'طرد'`, `'kick'`, `'banned'`.
- **الخلل الذي يمنعه حالياً:** حجب رسائل الجولة (مثل التلميحات ونهاية الجولة) عن نافذة الدردشة وإظهار دخول/خروج/طرد اللاعبين فقط.
- **الاعتماديات:** يعتمد على النصوص النصية الصادرة من `registerJoinRoomHandler.ts:300` و`registerLeaveRoomHandler.ts:42` و`registerVoteKickHandler.ts:212` و`server/rooms.ts:318, 1993`.
- **قاعدة الحفظ الصارمة:** يُمنع تغيير نصوص الخادم في `L10N-4` قبل ترقية هذا المرشح ليفحص أولاً رمز الحدث المهيكَل (`msg.eventCode` / `msg.subType`) مع إبقاء فحص النصوص القديمة كمسار احتياطي (`fallback`)، وإلا ستختفي جميع رسائل الدخول والخروج والطرد بصمت.

### Safeguard 2 — إعادة صياغة خسارة/تجاوز الدور لصاحب الرسالة (`OverlayChatRoom.tsx:113-119`)
- **الملف والأسطر:** `src/components/game/OverlayChatRoom.tsx` (`113–119`)
- **الوظيفة الحالية:** يحوّل الرسالة إلى صيغة المخاطب (`You've lost your turn` / `You've skipped the turn`) عندما `msg.senderId === mySocketId`.
- **الاعتماديات:** `text.includes('lost the turn')` و`text.includes('skipped the turn')` + `msg.senderId`.
- **قاعدة الحفظ الصارمة:** يجب أن يعتمد الفحص مستقبلاً على `eventCode` وهوية الفاعل (`actorId` / `senderId`) مع إبقاء التوافق الخلفي مع النصوص المرسلة مسبقاً.

### Safeguard 3 — عزل اتجاه الفقاعات والمدخلات عبر `dir="auto"` و`unicodeBidi: 'plaintext'`
- **الملفات والأسطر:**
  - `src/components/game/OverlayChatRoom.tsx`: فقاعات المرسل والمستقبل (`174–175`, `216–217`)، شارة النظام (`125–126`)، نص التحذير الاحتياطي (`151`)، وحقل إدخال الدردشة `<textarea dir="auto">` (`365`).
  - `src/components/game/GameActivityFeed.tsx`: سجل التخمينات والرسائل (`279–280`)، ووسوم `dir="auto"` على العناصر المختلطة (`53, 72, 110, 114, 151, 172, 212, 266`).
  - `src/components/experimental/ExperimentalGameRoom.tsx`: حقل التخمين `<input id="guess-input" dir="auto">` (`1743`).
- **الوظيفة الحالية وسبب أهميته:** يسمح بكتابة وقراءة العربية والإنجليزية والإيموجي والأرقام وعلامات الترقيم في نفس الغرفة دون انقلاب موضع علامات الترقيم أو تشوّه سلوك المؤشر في Safari / Android WebView.
- **قاعدة الحفظ الصارمة:** **يُحظر استبدال `dir="auto"` أو إزالة `unicodeBidi: 'plaintext'` في أي رسالة لاعب أو حقل إدخال نصي أو اسم مستخدم/كلمة** حتى عند تحويل المستند إلى `dir="rtl"` أو `dir="ltr"`.

### Safeguard 4 — عزل أسماء اللاعبين بوسم `<bdi>` في تنبيه التصويت للطرد (`OverlayChatRoom.tsx:140-152`)
- **الملف والأسطر:** `src/components/game/OverlayChatRoom.tsx` (`139–152`)
- **الوظيفة الحالية:** يحيط `msg.voterName` و`msg.targetName` بعناصر `<bdi className="text-[#FF4D4D] font-bold max-w-[120px] truncate inline-block">` داخل حاوية `flex-wrap`.
- **الخلل الذي يمنعه:** يمنع الاسم الإنجليزي من قلب ترتيب جملة التصويت العربية أو العكس، ويمنع التفاف الرموز الاتجاهية.
- **قاعدة الحفظ الصارمة:** عند توطين `votekick_alert`، يجب أن يتبع اتجاه الحاوية لغة الواجهة (`dir={isRtlUi ? 'rtl' : 'ltr'}`) مع **إلزامية بقاء وسم `<bdi>`** حول `voterName` و`targetName` في القالبين العربي والإنجليزي معاً.

### Safeguard 5 — محللات `GameActivityFeed.tsx` للأنماط النصية و`subType` (`GameActivityFeed.tsx:41-269`)
- **الملف والأسطر:** `src/components/game/GameActivityFeed.tsx` (`41–269`)
- **الوظيفة الحالية:** يعتمد على `subType` (`close`, `report`, `canceled`, `hit`, `interval`, `turn`, `game_over`, `all_guessed`, `lost_turn`) إضافةً إلى تحليل نصي حساس:
  - السطر `115`: `msg.sender || text.replace(" guessed the word!", "")`
  - السطر `140`: `text.match(/^(Turn of\s+)(.+)$/i)` لاستخراج اسم الرسام من النص `Turn of X`!
  - السطر `162–175`: يطبع `msg.text` حرفياً في `game_over` (`Game over. The winner is X with Y points`).
  - السطر `195–202`: يفحص `.includes("lost the turn")` + `amIDrawer`.
  - السطر `218–257`: مسح احتياطي بالكلمات المفتاحية (`nobody hit`, `hit`, `guessed`, `turn`, `interval`, `timeout`, `time's up`, `answer was`).
- **قاعدة الحفظ الصارمة:** عدم كسر أو حذف هذا التحليل في الواجهة حتى يتم إرسال الحقول المهيكلة (`eventCode`, `params` مثل `playerName`, `winnerName`, `score`, `hasWinners`, `word`, `actorId`) من الخادم وإبقاؤه كـ fallback للرسائل القديمة المخزنة.

### Safeguard 6 — استقلالية اتجاه عرض الكلمة والتلميحات (`ExperimentalWordOverlay.tsx:53-65`, `ChoosingWordOverlay.tsx:28, 52`)
- **الملفات والأسطر:** `src/components/experimental/ExperimentalWordOverlay.tsx` (`53–65`, `84`, `141`)، و`src/components/experimental/ChoosingWordOverlay.tsx` (`28, 52`)، و`server/rooms.ts` (`1046`).
- **الوظيفة الحالية:** يحدد `isRTL = /[\u0600-\u06FF]/.test(currentWord)` (أو `propIsRTL` القادم من الخادم) اتجاه ترتيب الأحرف (`flexDirection: isRTL ? 'row-reverse' : 'row'`).
- **الخلل الذي يمنعه:** إذا تغيّر `<html dir>` إلى `"rtl"` عند اختيار العربية، فقد يتدخل اتجاه DOM الأب لو اعتمد صف الكلمة على `dir` الموروث بدل الاتجاه الصريح المعتمد على لغة الكلمة نفسها.
- **قاعدة الحفظ الصارمة:** يجب أن يظل اتجاه صف الأحرف والتلميحات خاضعاً حصرياً لنص الكلمة (`word`/`propIsRTL`) مع تثبيت `dir="ltr"` على الحاوية الخارجية لصف الحروف (`ExperimentalWordOverlay.tsx:84, 141`) لأن `flexDirection: row-reverse` تفترض محوراً أفقياً يسار-إلى-يمين (LTR) أساسياً؛ فلو ورثت `dir="rtl"` لانقلبت `row-reverse` عكس المطلوب وتشوّه ترتيب حروف الكلمة العربية! *(اكتشاف حرج من التدقيق)*

### Safeguard 7 — قفل اتجاه `dir="ltr"` لهندسة لوحة الرسم وأدواتها (`ExperimentalDrawingBoard.tsx`, `FlipaClipControls.tsx`, `ColorWheelModal.tsx`)
- **الملفات والأسطر:**
  - `src/components/experimental/ExperimentalDrawingBoard.tsx`: منطقة الكانفاس `containerRef` (`420`)، الأزرار العائمة (`532`)، شريط الأدوات السفلي (`582`)، شريط الألوان القابل للتمرير (`649`).
  - `src/components/game/FlipaClipControls.tsx` (`322`).
  - `src/components/game/ColorWheelModal.tsx`: شريط الكثافة (`554`) من اليسار (10%) إلى اليمين (100%) وحقل HEX (`487`).
- **الوظيفة الحالية:** عزل كامل لهندسة الرسم، إحداثيات المؤشر واللمس، ترتيب الأدوات والألوان، واتجاه سحب مؤشر الشفافية عن `dir` الخاص بالواجهة.
- **قاعدة الحفظ الصارمة:** يُحظر إزالة `dir="ltr"` من هذه الحاويات الهندسية؛ تُترجم النصوص والتلميحات (`title` / `aria-label` / كلمة `الكثافة`) فقط مع بقاء المحاور والأزرار الهندسية ثابتة.

### Safeguard 8 — عزل شاشات اللعب الشبكية وشريط المؤقت (`SmoothTimer.tsx`, `GameRoom.tsx`, `ExperimentalGameRoom.tsx`)
- **الملفات والأسطر:**
  - `src/components/game/SmoothTimer.tsx` (`507`: `transformOrigin: "left center"` لتقليص `scaleX`).
  - `src/components/GameRoom.tsx` (`1070–1072`: شبكة `minmax(0, 32%) minmax(0, 68%)`، و`1078`: زر الخروج `top-1 right-1` مقابل زر الدردشة في الرسم الحر `1141`: `mr-12 sm:mr-16`).
  - `src/components/experimental/ExperimentalGameRoom.tsx` (`1412–1414`: شبكة `32% / 68%`، `1420`: زر الخروج `top-1 right-1`، `1511`: `mr-12 sm:mr-16`، `1640` `PlayersSidebar` بـ `text-left`، `1730` أيقونة القلم `left-4` و`pl-11` في `#guess-input`).
- **الخلل الذي يمنعه:** قلب اتجاه `<html dir="rtl">` عالمياً دون تثبيت `dir="ltr"` على الشبكة الأساسية للغرفة سيعكس عمودي قائمة اللاعبين (`32%`) وسجل التخمين (`68%`)، ويكسر اتجاه تقليص شريط المؤقت (`SmoothTimer`) أو يصدم زر الدردشة مع زر `X` في أعلى اليمين.
- **قاعدة الحفظ الصارمة:** الإبقاء على تخطيط شبكة الغرفة الرئيسية (`dir="ltr"` على حاوية الغرفة الهندسية والشبكة والأشرطة الثابتة الموضع)، وتطبيق `dir` اللغة (`rtl`/`ltr`) بذكاء على النوافذ المنبثقة ومحتوى القوائم والرسائل، أو استخدام خصائص CSS المنطقية فقط حيث لا تتعارض مع الإحداثيات الثابتة.

### Safeguard 9 — منع ربط المنطق البرمجي بنصوص العرض المترجمة (`GameRoom.tsx:568`, `ExperimentalGameRoom.tsx:719`, `types/game.ts:174`)
- **الملفات والأسطر:** `GameRoom.tsx:568` و`ExperimentalGameRoom.tsx:719` (`res.error.includes("ممتلئة") || res.error.includes("full") || res.error.includes("كامل")`)، و`src/types/game.ts:174` (`normalized.includes('حر')`).
- **قاعدة الحفظ الصارمة:** نقل أخطاء الانضمام مثل امتلاء الغرفة وخطأ الخادم العام إلى رموز آلية صريحة (`error: 'room_full'`, `'join_failed'`) مع بقاء كشف النصوص القديمة كاحتياط أثناء الترحيل، وعدم اشتقاق أسماء/معرفات الغرف التقنية من النصوص المترجمة.

---

## 4. الجرد الشامل للنصوص المصنفة ومصادرها (Text Inventory A–E + Excluded)

### الفئة (A): محتوى مكتوب من اللاعبين أو محتوى جولة مشترك — لا يُترجم أبداً
| المصدر | الملف والأسطر | الوصف |
| :--- | :--- | :--- |
| الاسم المستعار للاعب | `Lobby.tsx:507`, `PlayersSidebar.tsx`, `FreeDrawPlayersList.tsx`, `PlayerProfileModal.tsx`, `MiniBoardOverlay.tsx` | يُعرض كما أدخله اللاعب تماماً داخل `<bdi>` / `dir="auto"`. |
| رسائل الدردشة والتخمينات | `OverlayChatRoom.tsx:174, 216`, `GameActivityFeed.tsx:282`, `registerSendMessageHandler.ts:93`, `rooms.ts:865` | نصوص اللاعبين الحرة. |
| الكلمات والخيارات والتلميحات | `wordsDictionary.ts`, `ChoosingWordOverlay.tsx:30, 54`, `ExperimentalWordOverlay.tsx`, `MiniBoardOverlay.tsx:326`, `arabicFuzzyMatch.ts` | الكلمة المشتركة في الجولة (`ALL_WORDS`). |
| أسماء الغرف المخصصة | `types/game.ts:180-182` | المعرف الذي أنشأه المستخدم (`#Custom`). |

### الفئة (B): نصوص الواجهة النظامية الثابتة (تُترجم لكل لاعب)
| الشاشة / المكون | الملف والأسطر | النصوص الحالية والحالة |
| :--- | :--- | :--- |
| **مستند HTML وبياناته** | `index.html:2, 6-9` | `lang="en"`, `<title>DRAW.IO Drawing Game</title>`, meta descriptions (`og:title`, `og:description`) — تتحدث ديناميكياً لـ `lang` و`dir` عند التشغيل. |
| **اللوبي الرئيسي** | `Lobby.tsx:341, 437, 503, 516, 580, 590-592, 604, 615-617, 630, 654-659, 668, 682` | `NICKNAME`, `Enter your name...`, `هذه الميزة غير متوفرة بعد`, `عذراً، هذه الغرفة ممتلئة بالكامل!`, `OK`, نصوص ثنائية اللغة في `INACTIVE` / `DISCONNECTED` / `ERROR`, `اختر أفاتار`, `أضف إيموجي مخصص` — **بالإضافة إلى إضافة زر/منتقي اللغة (`Auto` / `العربية` / `English`) هنا في `L10N-2`**. |
| **متصفح الغرف ومعلومات الغرفة** | `RoomsBrowserScreen.tsx:120`, `RoomInfoModal.tsx:36, 67, 71, 75, 77`, `types/game.ts:99-136` | `NEW ROOM`, `PLAY`, `Players`, `Theme`, `To Win`, `مفتوح`, `{toWin} pts` + ترجمة أسماء وعناوين الغرف المعيارية (`General`, `Free Draw`, `🧪 Experimental Draw`) والمواضيع (`General`, `Free Draw`) في طبقة العرض فقط. |
| **مكونات النوافذ المشتركة** | `CinematicModal.tsx:167` | `aria-label="Close"`. |
| **نوافذ التأكيد والتنبيهات** | `ExitConfirmModal.tsx:20,25,46`, `SkipConfirmModal.tsx:21,26,48,51`, `ReportConfirmModal.tsx:20,25,49`, `AfkWarningModal.tsx:25,47,54`, `PlayerProfileModal.tsx:56,75,94`, `RoomAlertModals.tsx:60,88-91,104,131-134,148,173-176,189,214-217,230,241-244,257,268-271` | أزرار `YES`/`NO`/`OK`/`موافق`/`BLOCK`/`UNBLOCK`/`VOTEKICK`/`REMOVE VOTE` وأوصاف المغادرة، التبليغ، التجاوز، الخمول، الحساب الشخصي، الطرد، الاسم المستخدم، امتلاء الغرفة، امتلاء الخادم، انتهاء مهلة الاتصال. |
| **نوافذ الرسم والألوان والإيموجي** | `CustomEmojiModal.tsx:54,108,151,158,176,190`, `ColorWheelModal.tsx:494,506,521,530,557,617,621,629,637,645` | تعليمات الإيموجي، الأخطاء، `الكثافة`, `حفظ`, `الألوان المحفوظة`, تلميحات مقارنة اللون والحذف والإغلاق. |
| **حالة الاتصال وخطأ التطبيق** | `RoomConnectionStatusOverlay.tsx:45-66`, `ErrorBoundary.tsx:30` | `انقطع الاتصال بالخادم`, `عاد الاتصال`, `نحاول إعادة الاتصال تلقائيًا...`, `جارٍ إعادة الانضمام إلى الغرفة...`, `العودة إلى الردهة`, `Sorry.. there was an error`. |
| **محتوى اللوحة والغرفة وأدوات الرسم** | `ChoosingWordOverlay.tsx:17,20,37,44,61`, `MiniBoardOverlay.tsx:121,129,134,172,203,224,247-250,260,266,268,323,434,481,520,550,560`, `PlayersSidebar.tsx:492`, `GameRoom.tsx:963,1051,1079,1120,1145`, `ExperimentalGameRoom.tsx:1278,1393,1421,1460,1515,1670,1779-1794`, `ExperimentalDrawingBoard.tsx:348,354,367-370,384,390,411-414,499,506-507,541,551,565`, `FlipaClipControls.tsx:329,350,393`, `OverlayChatRoom.tsx:187,229,367`, `GameActivityFeed.tsx:91,133,188,291` | نصوص الانتظار، الدور، أزرار الرسم الحر (`ابدأ الرسم`, `انضم للرسم`, `العودة للرسم`)، تلميحات الأدوات (`مسح اللوحة`, `تكبير`, `إعادة تعيين`, `تعديل حجم الأداة`, `تغيير اللون`)، حالات حقل التخمين (`Waiting...`, `Answer here...`, إلخ)، `Empty`, `pts`, `Copy`, `Type your message here...`, رسائل `beforeunload`. |
| **أدوات المطور (اختياري/مقيد)** | `FreeDrawMobileDebug.tsx:1-389` | لوحة تشخيص للمطور فقط (`isMobileDebugActive()`). يُوصى بإبقائها للمطور بالإنجليزية أو خارج نطاق الترجمة الإنتاجية لعدم زيادة حجم القاموس بلا فائدة للاعبين. |

### الفئة (C): رسائل نظامية ديناميكية تحتوي متغيرات (أسماء/أرقام/كلمات)
- `MiniBoardOverlay.tsx:187, 203, 224`: `drawerName || fallback`, `{drawerName} skipped the turn`, `{drawerName} has lost the turn`, `{points} pts`, `# {rank}`
- `ExperimentalHitOverlay.tsx:229-232`: `{name} reported!`, `{name} hit!`
- `AfkWarningModal.tsx:54`: العداد التنازلي `{afkCountdown}` ثانية
- `ColorWheelModal.tsx:629, 637`: `{n}/24 لون`, حذف اللون المحدد `{hex}`
- `GameActivityFeed.tsx:54-56, 73-75, 110-116, 151-155, 172, 201-202`: `{word} is close!`, `{sender} reported!`, `You've found the answer: {word}`, `{sender} hit!`, `Turn of {name}`, `Game over. The winner is {name} with {score} points`
- `OverlayChatRoom.tsx:143-149`: `قام {voterName} بالتصويت لطرد {targetName}`

### الفئة (D): رسائل خاصة موجهة للاعب واحد (Private / Targeted)
- `registerJoinRoomHandler.ts:207, 211, 217, 224, 235, 243, 252, 311`: رموز (`rate_limited`, `invalid_payload`, `unauthorized`, `room_not_found`, `banned`, `session_expired`, `nickname_taken`, `auth_store_full`) + نصوص خام يجب تحويلها لرموز (`room_full` في `L243`، `join_failed` في `L311`).
- `server/rooms.ts:294, 309, 1977`: `afk_warning` (`{ secondsLeft }`), `session_expired` (`{ reason: 'afk_idle' | 'connection_lost' }`).
- `registerVoteKickHandler.ts`: رموز الخطأ (`invalid_payload`, `player_not_found`, `room_not_found`, `rate_limited`, `target_not_found`, `cannot_vote_self`) + مهلة التصويت (`cooldown` -> `SLOW DOWN`).
- `registerSendMessageHandler.ts:79-83`: تحذير مانع الغش الخاص `{ text: '🚫 لا يمكنك كتابة الإجابة في الدردشة أثناء الرسم!', type: 'warning' }` -> يحتاج `eventCode: 'chat_word_leak_warning'`.
- `server/rooms.ts:851-859`: التلميح القريب الخاص `receive_guess` (`subType: 'close'`, `word: guess`, `senderId`) -> يحتاج `eventCode: 'guess_close'`.
- `src/types/game.ts:18-23`: `draw_action_rejected` (`rate_limit`, `turn_ended`, `not_drawer`, `invalid_packet`, `not_recorded`).

### الفئة (E): إشعارات نظامية عامة على مستوى الغرفة (Broadcast System Notifications)
- **قناة الدردشة (`receive_message`):**
  1. دخول لاعب (`registerJoinRoomHandler.ts:300`): `${nickname} انضم للغرفة` -> `eventCode: 'player_joined'`, `params: { name: nickname }`
  2. مغادرة لاعب (`registerLeaveRoomHandler.ts:42`): `${playerName} غادر الغرفة` -> `eventCode: 'player_left'`, `params: { name: playerName }`
  3. تصويت للطرد (`registerVoteKickHandler.ts:169-175`): `type: 'votekick_alert'` (`voterName`, `targetName`) -> `eventCode: 'votekick_alert'`
  4. طرد بالتصويت (`registerVoteKickHandler.ts:210-214`): حالياً يرسل `${kickedName} غادر الغرفة` -> يُوحّد مع رمز مميز `eventCode: 'player_kicked'` (أو `player_left` حسب تصميم العرض، مع الحفاظ على ظهوره في فلتر الدردشة!)
  5. طرد للخمول (`server/rooms.ts:316-320`): `تم طرد ${p.name} بسبب عدم النشاط (AFK)` -> `eventCode: 'player_afk_kicked'`, `params: { name: p.name }`
  6. إزالة لانقطاع الاتصال (`server/rooms.ts:1988-1995`): `انقطع اتصال ${checkPlayer.name} وتمت إزالته من اللعبة` -> `eventCode: 'player_disconnected_removed'`, `params: { name: checkPlayer.name }`
- **قناة التخمينات وسجل النشاط (`receive_guess`):**
  1. بدء دور (`server/rooms.ts:524-530`, `subType: 'turn'`): `Turn of ${name}` -> إضافة `eventCode: 'turn_of'`, `params: { name, drawerId }`
  2. نهاية اللعبة (`server/rooms.ts:552-558`, `subType: 'game_over'`): `Game over. The winner is ${winner.name} with ${winner.score} points` -> إضافة `eventCode: 'game_over'`, `params: { name: winner.name, score: winner.score }`
  3. إلغاء الدور (`server/rooms.ts:609-615`, `subType: 'canceled'`): -> `eventCode: 'turn_canceled'`
  4. تخمين الجميع (`server/rooms.ts:621-627`, `subType: 'all_guessed'`): -> `eventCode: 'all_guessed'`
  5. انتهاء الوقت أو خروج الرسام (`server/rooms.ts:635-651`, `subType: 'answer_reveal'`): رسالتان حالياً (`Time's Up!` / `Nobody hit the answer` و`The answer was: ${word}`) -> إضافة `eventCode: 'round_timeout_won'` / `'nobody_hit'` / `'answer_reveal'` مع `params: { word }`
  6. تخطي الدور (`server/rooms.ts:658-674`, `subType: 'skipped'`): `${name} skipped the turn` -> إضافة `eventCode: 'turn_skipped'`, `params: { name, actorId }`
  7. فقدان الدور (`server/rooms.ts:680-686`, `subType: 'lost_turn'`): `${name} has lost the turn` -> إضافة `eventCode: 'turn_lost'`, `params: { name, actorId }`
  8. فاصل زمني (`server/rooms.ts:690-696`, `subType: 'interval'`): -> `eventCode: 'round_interval'`
  9. إصابة الإجابة (`server/rooms.ts:802-811`, `subType: 'hit'`): -> إضافة `eventCode: 'guess_hit'`, `params: { name: player.name, word }`
  10. تبليغ عن الرسم (`server/rooms.ts:987-994`, `subType: 'report'`): -> إضافة `eventCode: 'draw_reported'`, `params: { name: player.name }`

### العناوين المستثناة بصرياً (`Always English Stylized Brand / GameTitle`)
- `DRAW.IO`, `ROOMS`, `EXIT`, `REPORT`, `PROFILE`, `SKIP`, `INACTIVE`, `INFO`, `ERROR`, `KICKED`, `SLOW DOWN`, `SERVER FULL`, `TIMEOUT`, `DISCONNECTED`, `CLEAN`, `NAMES`, `CUSTOM EMOJI`, `FREE DRAW`, `WAITING`, `NEW TURN!`, `SKIPPED!`, `CANCELED TURN`, `INTERVAL`, `MASTERPIECE!`, `GAME OVER`.
- **السبب التقني المثبت:** يعتمد مكون `GameTitle.tsx` و`.cartoon-title-*` في `src/components/index.css:30-87` على خط `'Fredoka'` وحروف `uppercase tracking-widest` وظلال `text-shadow` متدرجة 3px/7px تتشابك وتكسر اتصال الحروف العربية عند استخدامها مع النص العربي.

---

## 5. التوصية النهائية لمكتبة ونظام الترجمة (Architecture & Tooling Decision)

| معيار التقييم | `i18next` + `react-i18next` (محلي بالكامل بدون HTTP Backend) | نظام TypeScript مخصص خفيف (`Custom i18n`) |
| :--- | :--- | :--- |
| **التوافق مع React 19 + Vite** | متوافق مع React `19.0.1` (الإصدار الحديث `react-i18next` v15+ و`i18next` v24+/v25+) وتدعمه حزمة Vite مباشرة بدون إضافات. | متوافق 100% دون أي اعتماديات خارجية. |
| **الحزم المحلية دون طلبات شبكة** | استيراد القواميس مباشرةً (`import ar from './locales/ar'`) داخل حزمة Vite -> **0 طلبات شبكة**. | 0 طلبات شبكة تلقائياً. |
| **الأداء على أندرويد الضعيف** | تهيئة متزامنة فورية (~1–2ms عند الإقلاع)، بدون إعادة تحميل شبكي، وتغليف عبر hook خفيف لا يعيد تصيير مكونات الرسم المعزولة. | أسرع بهامش ميكروثانية غير محسوس بشرياً. |
| **حجم الحزمة (Bundle Size)** | ~16–18 KB مضغوط gzip فقط (~0.5% زيادة تقريباً)، بلا تحميل إضافات backend أو browser-languagedetector الثقيلة. | ~1.5–2 KB مضغوط gzip. |
| **سهولة الصيانة والتوسع المستقبلي** | معمارية معيارية؛ إضافة لغة جديدة (فرنسية/تركية/إسبانية) لا تتعدى إنشاء مجلد لغة وتسجيله في `SUPPORTED_LANGUAGES`. | يتطلب كتابة وصيانة كود التداخل والجمع وقواعد كل لغة يدوياً. |
| **كشف المفاتيح المفقودة (Missing Keys)** | فحص ثابت بـ TypeScript عبر `CustomTypeOptions` + `missingKeyHandler` في بيئة التطوير فقط. | فحص ثابت بـ TypeScript عبر `satisfies TranslationSchema`. |
| **التداخل والمتغيرات (Interpolation)** | مدمج (`{{name}}`, `{{count}}`) مع دعم حماية السياق والاتجاه. | يتطلب كتابة دالة استبدال يدوية لكل حالة خاصة. |
| **الجمع (Pluralization)** | **تفوق حاسم:** يدعم تلقائياً قواعد CLDR الست للغة العربية (`zero`, `one`, `two`, `few`, `many`, `other`) وأي لغة مستقبلية (ثانية/ثانيتان/ثوانٍ، نقطة/نقطتان/نقاط). | يتطلب بناء دالة `Intl.PluralRules` مخصصة وربطها بكل مفتاح يدوياً. |
| **تقسيم الملفات (Namespaces)** | دعم أصيل للـ namespaces (`common`, `lobby`, `modals`, `room`, `drawing`, `events`). | تقسيم كائنات يدوي يفتقد عزل الـ namespace القياسي. |

**القرار النهائي الموصى به:** اعتماد **`i18next` + `react-i18next`** مع استيراد القواميس **محلياً وثابتاً داخل الكود (`resources` مضمّنة في Vite)** ودون استخدام `i18next-http-backend` نهائياً، مع تغليفها في طبقة واجهة موحدة داخل `src/i18n/` وتفعيل التطابق الصارم للأنواع في TypeScript (`CustomTypeOptions`).  
يُجنّب هذا الاختيار بناء محرك جمع وصياغة مخصص للغة العربية ذات الست صيغ، ويحفظ الأداء الفائق على أجهزة Android الضعيفة (0ms network latency)، ويضمن توسيعاً فورياً لأي لغة قادمة.

### البنية المقترحة لمجلد `src/i18n/`
- `src/i18n/types.ts` — أنواع `LanguageMode` (`'auto' | 'ar' | 'en'`) و`SupportedLanguage` (`'ar' | 'en'`) و`CustomTypeOptions`.
- `src/i18n/languageDetector.ts` — قراءة/حفظ `safeLocalStorage`, كشف لغة المتصفح (`navigator.languages?.[0] || navigator.language` -> `'ar'` إذا بدأ بـ `ar` وإلا `'en'`), ودالة تحديث `document.documentElement.lang` و`dir`.
- `src/i18n/index.ts` — تهيئة `i18next` المتزامنة مع `initReactI18next`، تحذير المفاتيح المفقودة في `import.meta.env.DEV` فقط، وتصدير واجهة موحدة.
- `src/i18n/useAppTranslation.ts` — hook خفيف يغلف `useTranslation` ويوفر `{ t, language, mode, setLanguageMode, isRTL }`.
- `src/i18n/locales/en/*.json` (أو `.ts`) و`src/i18n/locales/ar/*.json` (أو `.ts`) مقسمة إلى namespaces: `common`, `lobby`, `modals`, `room`, `drawing`, `events`.

---

## 6. تقييم مخاطر وتوافق اللغات المختلطة في الغرفة الواحدة

1. **السجل المنزلق (Rolling 40-Message History في `server/rooms.ts:1179-1197`):**
   - يحتفظ الخادم حالياً بـ `room.chatMessages` (40 رسالة) و`room.guessMessages` (40 رسالة) ويحدّث `msg.senderId` عند `reconnectPlayer` (`1851–1861`).
   - *ملحوظة معمارية مثبتة:* حالياً يرسل `sendStateToPlayer` (`1057–1083`) مصفوفات `players`, `votekicks`, `gameState` ولا يعيد بث المصفوفتين الكاملتين عند الانضمام، بينما يتم الحفظ لإتاحة أي catch-up أو تشخيص. ومع ذلك، فإن تخزين `eventCode` + `params` داخل كل رسالة نظامية في `saveChatMessage`/`saveGuessMessage` يضمن أنه سواء عُرضت لحظياً أو عند أي إعادة مزامنة تاريخية مستقبلية، سيُترجمها كل عميل حسب لغته المحلية.
2. **إعادة الاتصال (`reconnectPlayer`) وتزامن الحالة:**
   - يعيد الخادم ربط `senderId` وتُرسَل `room_state_update`, `draw_history_sync`, `draw_redo_sync`, `bucket_lock_sync`. حزم الرسم وبيانات `roundEndReason` هي أصلاً رموز لغة محايدة، وبمجرد ترقية رسائل `afk_warning` و`session_expired` و`join_room` لتُقرأ بالرموز فقط يبقى المسار متطابقاً عبر كل عمليات إعادة الاتصال.
3. **الرسائل النصية القديمة (Backward Compatibility):**
   - تطبيق قاعدة **Dual-Field Payloads** في `L10N-4`: يضيف الخادم الحقول المهيكلة (`eventCode`, `params`, `playerName`, `actorId`, `winnerName`, `score`, `hasWinners`) **مع الإبقاء على حقل `text` الاحتياطي**؛ ويقرأ العميل `eventCode` أولاً ثم يعود تلقائياً لـ `subType` والـ regex القديم عند غياب `eventCode`.
4. **تكافؤ الغرف (`Normal` vs `Experimental` vs `Free Draw`):**
   - تشترك `GameRoom.tsx` (للرسم الحر والوضع العادي) و`ExperimentalGameRoom.tsx` (للوضع التنافسي) في المكونات والخدمات نفسها (`MiniBoardOverlay`, `OverlayChatRoom`, `ExitConfirmModal`, `AfkWarningModal`, `PlayerProfileModal`, `RoomAlertModals`, `RoomConnectionStatusOverlay`, `ExperimentalDrawingBoard`, `ColorWheelModal`). يجب تحديث كلتيهما في نفس المرحلة (`L10N-5`) لضمان عدم بقاء أي نص يتيم في أحد الأوضاع.
5. **منع تكرار أو فقدان الأحداث:**
   - لا نضيف أي Socket.IO events جديدة ولا نغير أسماء الأحداث القائمة (`receive_message`, `receive_guess`, `join_room`, `afk_warning`, `session_expired`, `submit_vote_kick`). يتم التوسيع على الحقول الاختيارية داخل الحمولة القائمة فقط.
6. **أثر الأداء وحجم الحزم في Socket.IO / MsgPack (`512 KiB maxHttpBufferSize`):**
   - إضافة `eventCode` (~15 بايت) و`params` (~15–30 بايت) في رسائل النظام النادرة (مرة كل جولة أو دخول/خروج) لا تؤثر نهائياً على `draw_binary` ولا تستهلك معالج الخادم لأن الخادم **يتجنب أي حلقة ترجمة لكل لاعب** ويبث رمزاً واحداً محايداً لجميع اللاعبين.
7. **فصل الكلمات عن لغة الواجهة:**
   - تظل `ALL_WORDS` و`arabicFuzzyMatch.ts` كما هي تماماً. عندما يكون المتسابق بواجهة إنجليزية، يقرأ `Choose a word to draw` بالإنجليزية وتظهر خيارات الكلمات باللغة العربية مع `dir="auto"`؛ وفي شاشة اللعب تظل التلميحات وحساباتها بالاتجاه الفعلي للكلمة (`ExperimentalWordOverlay.tsx`).

---

## 7. الخارطة التنفيذية المفصلة (`L10N-0` إلى `L10N-6`)

### المرحلة `L10N-0` — التدقيق وإعداد خارطة الطريق
1. **الاسم والرقم:** `PHASE L10N-0 — Localization Audit & Roadmap Establishment` — **`[x] COMPLETED` (`2026-11-22`)**
2. **الهدف:** جرد كافة النصوص، توثيق آليات حماية الاتجاه والدردشة، اختيار نظام الترجمة الأنسب، وتثبيت خارطة طريق غير ملتبسة.
3. **الملفات المسموحة:** `LOCALIZATION_ROADMAP.md` (إنشاء)، `REFACTORING_ROADMAP.md` (ربط مرجعي مختصر فقط).
4. **الملفات المحظورة:** جميع الملفات البرمجية (`src/`, `server/`, `public/`, `index.html`, `package.json`, ملفات القفل).
5. **الآليات المحمية:** كامل قاعدة الكود الحالية بلا أي تغيير برمجي.
6. **المهام:** الفحص القرائي الشامل وتوثيق الأقسام `1–8`.
7. **المخاطر:** صفر (مرحلة توثيق وقراءة فقط).
8. **معايير الخروج:** اعتماد الوثيقة من المالك.
9. **الاختبارات:** مراجعة الوثيقة ومطابقتها للكود الفعلي.
10. **الاعتماديات:** لا توجد.

---

### المرحلة `L10N-1` — تأسيس نواة الترجمة وهندسة اللغة (بدون تعديل واجهات اللعب)
1. **الاسم والرقم:** `PHASE L10N-1 — i18n Core Foundation & Strict Key Typing` — **`[ ] NEXT READY`**
2. **الهدف:** تثبيت حزمة الترجمة وتجهيز طبقة `src/i18n/` كاملةً بنظام اللغات الثلاث (`auto` / `ar` / `en`) وفحص الأنواع ومزامنة `<html lang/dir>` دون تغيير أي شاشة لعب أو رسالة خادم بعد.
3. **الملفات المسموحة:** `package.json`, `package-lock.json`, مجلد جديد `src/i18n/*`, `src/main.tsx` (استيراد تهيئة i18n المبكرة فقط دون تغيير سلوك التطبيق).
4. **الملفات المحظورة:** `server/*`, `src/components/*` (باستثناء عدم مس أي مكون في `L10N-1`), `src/types/game.ts`, `index.html`, `AGENTS.md`.
5. **الآليات المحمية:** عدم فرض `dir` عالمي يكسر شبكة الغرف لاحقاً (توفير أداة مساعدة تحدّث `document.documentElement.lang` و`data-ui-dir` / `dir` بشكل منضبط، مع استقلالية تامة عن محرك الرسم و`SocketProvider`).
6. **التعديلات الدقيقة:**
   - تثبيت `i18next` و`react-i18next` (عبر `install_applet_package` أو `npm`).
   - إنشاء `src/i18n/types.ts`, `src/i18n/languageDetector.ts` (باستخدام `safeLocalStorage`), `src/i18n/index.ts`, `src/i18n/useAppTranslation.ts`.
   - إنشاء هياكل القواميس الأولية (`en` و`ar`) لـ namespaces: `common`, `lobby`, `modals`, `room`, `drawing`, `events` مع دالة تحذير المفاتيح المفقودة في التطوير (`import.meta.env.DEV`) وفحص TypeScript الصارم.
   - مزامنة `<title>` و`meta[name="description"]` و`lang` برمجياً وفق اللغة الفعّالة.
7. **المخاطر:** فشل peer dependencies مع React `19.0.1` أو زيادة حجم الحزمة الأولية أو تعارض SSR/Window عند غياب `localStorage` (محمي بـ `safeLocalStorage` وفحوص `typeof window`).
8. **معايير الخروج:** اجتياز `npx tsc --noEmit` و`npm run build` بنسبة 100%، وبقاء اللعبة مطابقة بصرياً 100% دون أي أثر سلبي.
9. **الاختبارات:** تحقق آلي (`npx tsc --noEmit`, `npm run build`) + تحقق يدوي سريع من المالك أن التطبيق يقلع بسلاسة دون أخطاء console.
10. **الاعتماديات:** `L10N-0`.

---

### المرحلة `L10N-2` — توطين اللوبي ومنتقي اللغة (`Lobby`, `RoomsBrowserScreen`, `RoomInfoModal`)
1. **الاسم والرقم:** `PHASE L10N-2 — Lobby, Room Browser & Language Selector UI`
2. **الهدف:** تفعيل منتقي اللغة (`Auto` / `العربية` / `English`) في شاشة البداية، وتوطين نصوص اللوبي ومتصفح الغرف ومعلومات الغرفة مع إبقاء `DRAW.IO` و`ROOMS` و`INFO` و`ERROR` و`INACTIVE` و`DISCONNECTED` بالإنجليزية.
3. **الملفات المسموحة:** `src/components/Lobby.tsx`, `src/components/lobby/RoomsBrowserScreen.tsx`, `src/components/lobby/RoomInfoModal.tsx`, `src/components/lobby/AvatarCarousel.tsx` (إن لزم `aria-label`), وملفات `src/i18n/locales/*`.
4. **الملفات المحظورة:** `server/*`, `src/components/game/*`, `src/components/experimental/*`, `src/types/game.ts` (منع كسر `getRoomConfig`!).
5. **الآليات المحمية:** حقل `NICKNAME` (`dir="auto"` للاسم)، بطاقات الغرف (`#Test`, `#10P`, `#Lab`), سلوك iOS Keyboard focus bypass في `Lobby.tsx`, وبقاء شعارات `GameTitle` بالإنجليزية.
6. **التعديلات الدقيقة:**
   - إضافة مبدّل لغة مدمج أنيق في شاشة البداية (`Lobby.tsx`) يتيح الاختيار بين `تلقائي (Auto)` / `العربية` / `English` وحفظه عبر `useAppTranslation`.
   - استبدال النصوص الثابتة وثنائية اللغة القديمة في `Lobby.tsx`, `RoomsBrowserScreen.tsx`, `RoomInfoModal.tsx` بمفاتيح `t(...)`، وتوفير ترجمة عرض فقط لـ `preset.name` / `theme` داخل الواجهة دون المساس بـ `roomId`.
   - ضبط محاذاة وأيقونة زر العودة في `RoomsBrowserScreen` (`ChevronLeft` / `ChevronRight` وفق الاتجاه أو `dir` الحاوية).
7. **المخاطر:** امتلاء البطاقات على الشاشات القصيرة (`max-height: 500px`) أو تغيّر طول التسميات في `RoomInfoModal` (العمود الثلاثي `grid-cols-3`).
8. **معايير الخروج:** تبديل فوري بين `Auto`/`ar`/`en` في اللوبي، ثبات الاختيار بعد التحديث، وبقاء العناوين الكارتونية ثابتة.
9. **الاختبارات:** `npx tsc --noEmit` + `npm run build` + اختبار المالك اليدوي في متصفح عربي ومتصفح إنجليزي والتبديل اليدوي والعودة لـ `Auto`.
10. **الاعتماديات:** `L10N-1`.

---

### المرحلة `L10N-3` — توطين النوافذ المنبثقة المشتركة وشاشات حالة الاتصال ولوحات الجولة
1. **الاسم والرقم:** `PHASE L10N-3 — Shared Modals, Connection Overlay & MiniBoard/WordChooser UI`
2. **الهدف:** توطين جميع النوافذ المنبثقة (`ExitConfirmModal`, `SkipConfirmModal`, `ReportConfirmModal`, `AfkWarningModal`, `PlayerProfileModal`, `RoomAlertModals`, `CinematicModal`, `CustomEmojiModal`, `ColorWheelModal`), غلاف الاتصال (`RoomConnectionStatusOverlay`), `ErrorBoundary`, وشاشتي `ChoosingWordOverlay` و`MiniBoardOverlay`.
3. **الملفات المسموحة:** `src/components/game/modals/*`, `src/components/game/CinematicModal.tsx`, `src/components/game/CustomEmojiModal.tsx`, `src/components/game/ColorWheelModal.tsx`, `src/components/game/RoomConnectionStatusOverlay.tsx`, `src/components/game/MiniBoardOverlay.tsx`, `src/components/experimental/ChoosingWordOverlay.tsx`, `src/ErrorBoundary.tsx`, و`src/i18n/locales/*`.
4. **الملفات المحظورة:** `server/*`, `DrawingCanvasCore.tsx`, `ExperimentalDrawingBoard.tsx` (في `L10N-5`), `OverlayChatRoom.tsx`, `GameActivityFeed.tsx`, `ExperimentalWordOverlay.tsx`.
5. **الآليات المحمية:**
   - **`UI-A Stage 2A`:** عدم المساس بمفاتيح `roundEndAnimationKey` / `activeAnimationKeyRef` أو إزالة أي `animationKey` أو ظلال في `MiniBoardOverlay.tsx`.
   - **`ColorWheelModal`:** إبقاء شريط الكثافة (`554`) وحقل `#HEX` (`487`) `dir="ltr"` حرفياً.
   - **العناوين المستثناة:** بقاء كل `GameTitle` headers في النوافذ وفي `MiniBoardOverlay` (`NEW TURN!`, `SKIPPED!`, `GAME OVER`, إلخ) بالإنجليزية مع ترجمة الأوصاف والأزرار فقط.
   - **`ChoosingWordOverlay`:** إبقاء `dir="auto"` على الكلمتين المعروضتين دون أي ترجمة لهما.
6. **التعديلات الدقيقة:** توحيد صيغ المفرد والجمع في `AfkWarningModal` (ثانية/ثانيتان/ثوانٍ)، `MiniBoardOverlay` (نقطة/نقاط)، إزالة الازدواجية القديمة (عربي + إنجليزي معاً) ليظهر النص بلغة اللاعب المختارة فقط، وضبط `dir={isRTL ? 'rtl' : 'ltr'}` في حاويات النوافذ النصية.
7. **المخاطر:** عدم تطابق ارتفاع الأزرار أو النص داخل `MiniBoardOverlay` على الهواتف الصغيرة (`overflow-y-auto` يجب الحفاظ عليه).
8. **معايير الخروج:** تغطية 100% لنصوص النوافذ والـ MiniBoard بالعربية والإنجليزية بنسق موحد ونظيف.
9. **الاختبارات:** `npx tsc --noEmit` + `npm run build` + فحص المالك يدوياً لكل نافذة ومرحلة نهاية الجولة والمنصة.
10. **الاعتماديات:** `L10N-2`.

---

### المرحلة `L10N-4` — ترقية أحداث الخادم إلى رموز مهيكلة متوافقة خلفياً (Server Event Codes & Backward-Compatible Payloads)
1. **الاسم والرقم:** `PHASE L10N-4 — Server Structured Event Codes & Safe Client Fallbacks`
2. **الهدف:** تزويد الخادم برموز أحداث ومتغيرات مهيكلة (`eventCode` + `params` + `actorId` + رمز `room_full` / `join_failed`) لجميع الرسائل التفاعلية والتنبيهات مع الحفاظ الكامل على الحقول النصية القديمة (`text`) وقواعد البروتوكول الثنائي.
3. **الملفات المسموحة:** `server/rooms.ts` (فقط دوال البث النصي في `broadcastMessage`/`broadcastGuess` وإجراءات الفحص `checkIdlePlayers`/`handleDisconnect`), `server/registerJoinRoomHandler.ts`, `server/registerLeaveRoomHandler.ts`, `server/registerSendMessageHandler.ts`, `server/registerVoteKickHandler.ts`, `src/types/game.ts` (إضافة واجهة optional message code فقط دون تغيير `getRoomConfig`), و`src/components/game/OverlayChatRoom.tsx` + `src/components/game/GameActivityFeed.tsx` + `src/components/GameRoom.tsx` + `src/components/experimental/ExperimentalGameRoom.tsx` (بقدر استقبال `eventCode`/`error` مع إبقاء التوافق الخلفي).
4. **الملفات المحظورة:** `server/registerDrawBinaryHandler.ts`, `server/roomCanonicalStrokeEngine.ts`, `server/utils/binaryBufferHelpers.ts`, `server/utils/arabicFuzzyMatch.ts`, `server/data/wordsDictionary.ts`, وأي منطق في `recordDrawCommand` (`type === 4 || type === 10 || type === 5`) أو `undo` / `redo`.
5. **الآليات المحمية:** **Safeguard 1 & 2 & 5 & 9:** ضمان ألا يختفي أي إشعار دخول/خروج/طرد في `OverlayChatRoom`، وعدم كسر regex أو fallback `GameActivityFeed`، وعدم كسر كشف `room_full` في الغرفتين.
6. **التعديلات الدقيقة:**
   - إضافة حقول اختيارية موحدة في رسائل الدردشة والتخمينات: `eventCode`, `params` (مثل `{ name, score, word, voterName, targetName }`), و`actorId`، مع الإبقاء على `text` القياسي كـ fallback.
   - توحيد أخطاء `join_room` (`L243`: `error: 'room_full'`, `L311`: `error: 'join_failed'` مع الإبقاء في العميل على قبول النص القديم + الرمز الجديد).
   - ترقية مرشح `OverlayChatRoom` و`GameActivityFeed` لقراءة `eventCode` أولاً مع fallback تلقائي للمسار القديم.
7. **المخاطر:** كسر اختبارات السيرفر الموجودة في `scripts/test_*.ts` إن تغير حقل `text` أو شكل الاستجابة؛ لذا يجب إبقاء `text` سليماً وإضافة الحقول الجديدة اختيارياً وتشغيل اختبارات الهوية والحمولات للتحقق.
8. **معايير الخروج:** وصول جميع الرسائل في الغرف المختلطة دون فقدان أو تكرار أو أخطاء TypeScript.
9. **الاختبارات:** `npx tsc --noEmit` + `npm run build` + `npx tsx scripts/test_payload_validation_suite.ts` + `npx tsx scripts/test_leave_room_integrity.ts` + تجربة المالك لحسابين بلغتين مختلفتين داخل نفس الغرفة.
10. **الاعتماديات:** `L10N-3`.

---

### المرحلة `L10N-5` — توطين الغرف وأدوات الرسم والدردشة وسجل الأنشطة (Normal, Experimental & Free Draw)
1. **الاسم والرقم:** `PHASE L10N-5 — Rooms, Chat/Activity Localization, Drawing Toolbars & BiDi Hardening`
2. **الهدف:** ترجمة كل واجهات `GameRoom`, `ExperimentalGameRoom`, `PlayersSidebar`, `FreeDrawPlayersList`, `OverlayChatRoom`, `GameActivityFeed`, `ExperimentalHitOverlay`, `ExperimentalDrawingBoard`, `FlipaClipControls`, و`ExperimentalWordOverlay` (ضبط العزل الاتجاهي الصريح فقط) مع التزام تام بجميع الآليات المحمية.
3. **الملفات المسموحة:** `src/components/GameRoom.tsx`, `src/components/experimental/ExperimentalGameRoom.tsx`, `src/components/experimental/ExperimentalDrawingBoard.tsx`, `src/components/experimental/ExperimentalWordOverlay.tsx` (تثبيت العزل الاتجاهي `dir="ltr"` فقط على صف الكلمة دون تغيير منطق `isRTL` أو الكلمات!), `src/components/experimental/ExperimentalHitOverlay.tsx`, `src/components/game/PlayersSidebar.tsx`, `src/components/game/FreeDrawPlayersList.tsx`, `src/components/game/OverlayChatRoom.tsx`, `src/components/game/GameActivityFeed.tsx`, `src/components/game/FlipaClipControls.tsx`, و`src/i18n/locales/*`.
4. **الملفات المحظورة:** `src/components/game/DrawingCanvasCore.tsx`, `src/utils/canvasFloodFill.ts`, `server/*`, `AGENTS.md`.
5. **الآليات المحمية:** **جميع Safeguards 1–9:**
   - إبقاء شبكة الغرفة `dir="ltr"` لمنع انقلاب `32%/68%` أو تقليص `SmoothTimer` (`transformOrigin: left center`) أو تصادم زر `X` مع زر الدردشة.
   - الحفاظ على `UI-B Stage B2` (`aspect-[680/396]` للمتفرج) و`UI-C Stage 2A` (`flex items-center min-w-0 max-w-full` في قائمة اللاعبين).
   - الحفاظ على `dir="auto"` + `unicodeBidi: 'plaintext'` في جميع رسائل الدردشة والتخمينات وحقول الإدخال (`#chat-textarea`, `#guess-input`)، و`<bdi>` في `votekick_alert`.
   - الحفاظ على `dir="ltr"` في `ExperimentalDrawingBoard` (`420, 532, 582, 649`) و`FlipaClipControls`.
6. **التعديلات الدقيقة:**
   - ربط كل رسائل `OverlayChatRoom` و`GameActivityFeed` (بما فيها `eventCode` القادم من `L10N-4` والرسائل التوجيهية `Waiting for players`، و`Copy`) بمفاتيح الترجمة.
   - ترجمة `Empty`, `pts`, `report` tooltip, نصوص حالات `#guess-input`, أزرار الرسم الحر (`ابدأ الرسم`/`انضم للرسم`/`العودة للرسم`), نافذتي تأكيد `CLEAN` و`NAMES` (وصف/أزرار بدون تغيير `CLEAN`/`NAMES`), وتلميحات أدوات الرسم.
   - توطين `ExperimentalHitOverlay` (`reported!`, `hit!`) مع `<bdi>` لاسم اللاعب.
7. **المخاطر:** تداخل نص `#guess-input` العربي مع أيقونة القلم اليسرى (`left-4` و`pl-11`), أو تغيّر طول شارات `pts` في `PlayersSidebar` أو `votekick_alert` على شاشات صغيرة، أو اختلال اتجاه الحروف في `ExperimentalWordOverlay` عند كون المستند `rtl`.
8. **معايير الخروج:** تجربة متطابقة في الجودَة بالعربية والإنجليزية عبر الأوضاع الثلاثة (العادي، التنافسي، والرسم الحر) وفي الغرف المختلطة.
9. **الاختبارات:** `npx tsc --noEmit` + `npm run build` + اختبار المالك اليدوي بحسابين (عربي + إنجليزي) في نفس الغرفة التنافسية وفي الرسم الحر على الجوال وسطح المكتب.
10. **الاعتماديات:** `L10N-4`.

---

### المرحلة `L10N-6` — التدقيق النهائي وفحص اكتمال المفاتيح والإغلاق
1. **الاسم والرقم:** `PHASE L10N-6 — Final Localization Audit, Missing-Key Verification & Closure`
2. **الهدف:** التحقق الآلي واليدوي الشامل من عدم وجود أي نص يتيم غير مترجم، وتساوي جميع المفاتيح بين `ar` و`en`، وسلامة الأداء والاتجاه واللعب باللغات المختلطة.
3. **الملفات المسموحة:** تصحيحات مفاتيح القاموس `src/i18n/locales/*` وأي إصلاحات طفيفة لم تُكتشف إلا في الفحص النهائي، وتحديث `LOCALIZATION_ROADMAP.md` لإغلاق المسار.
4. **الملفات المحظورة:** محرك الرسم (`DrawingCanvasCore.tsx`), بروتوكول الرسم الثنائي (`server/registerDrawBinaryHandler.ts`), ومصفوفة الكلمات (`wordsDictionary.ts`).
5. **الآليات المحمية:** كامل ثوابت `AGENTS.md` و`UI-A/B/C` وSafeguards 1–9.
6. **التعديلات الدقيقة:** فحص تطابق مفاتيح JSON/TS بين اللغات، تدقيق لغوي للترجمات العربية والإنجليزية، التحقق من `index.html` meta، وتحديث حالة `PHASE L10N` إلى `COMPLETED`.
7. **المخاطر:** بقايا نصوص hardcoded في مسار فرعي نادر (مثل انقطاع الاتصال المطوّل أو نافذة خطأ `auth_store_full`).
8. **معايير الخروج:** صفر مفاتيح مفقودة، اجتياز `npx tsc --noEmit` و`npm run build`، وموافقة المالك النهائية بعد تجربة حية كاملة.
9. **الاختبارات:** فحص تكافؤ مفاتيح القواميس، `npx tsc --noEmit`، `npm run build`، وتجربة المالك النهائية (Auto + AR + EN + Mixed Room + Reconnect).
10. **الاعتماديات:** `L10N-5`.

---

## 8. نطاق وتفاصيل المرحلة القادمة المباشرة (`L10N-1 ONLY`)

> تُعد **`L10N-1`** الدفعة التنفيذية الأولى والوحيدة عند انتقالنا للتنفيذ، ولا تتضمن أي تعديل على شاشات اللعبة أو السيرفر:

- **ما ستشمله `L10N-1` حصرياً:**
  1. تثبيت حزم `i18next` و`react-i18next` في `package.json`.
  2. إنشاء بنية `src/i18n/`:
     - `types.ts` (تعريف `LanguageMode = 'auto' | 'ar' | 'en'` و`SupportedLanguage = 'ar' | 'en'` ودعم namespaces).
     - `languageDetector.ts` (كشف لغة المتصفح وحفظ/قراءة التفضيل بأمان عبر `safeLocalStorage` وحساب اللغة الفعلية وتحديث `<html lang>` و`<title>`/`meta` دون فرض قلب هندسة الرسم).
     - `index.ts` (تهيئة `i18next` متزامنة بالاستيراد المحلي الكامل + `missingKeyHandler` في وضع التطوير فقط).
     - `useAppTranslation.ts` (واجهة التفاعل الموحدة للمكونات).
     - ملفات القواميس المنظمة `locales/en/*.ts` و`locales/ar/*.ts` (أو JSON) مع فحص النوع الصارم لمنع وجود مفتاح في لغة دون الأخرى.
  3. ربط التهيئة المبكرة في `src/main.tsx` فقط دون لمس أي مكون واجهة أو سطر في `server/`.
- **النتيجة المتوقعة من `L10N-1`:** بنية تحتية صلبة وجاهزة 100%، اجتياز `npx tsc --noEmit` و`npm run build`، مع بقاء واجهة التطبيق شغالة ومتطابقة تماماً قبل بدء `L10N-2`.

---

## 9. قواعد تحديث خارطة الطريق الإلزامية (`Roadmap Update Rules`)

يجب الالتزام بهذه القواعد التسع في كل دفعة قادمة من مسار `PHASE L10N`:

1. **التأريخ والتوثيق الدقيق عند الإغلاق:** عند اكتمال أي مرحلة بنجاح، تُحدّث حالتها إلى `[x] COMPLETED` مع تاريخ الإنجاز الدقيق والمرجع المعتمد (Commit / Verification Reference).
2. **حظر حذف المراحل:** لا تُحذف أي مرحلة من هذا الملف حتى بعد اكتمالها؛ تبقى جميع المراحل موثقة لتكوّن السجل الكامل للمشروع.
3. **الإضافة المنضبطة للاكتشافات الجديدة:** إذا كُشفت تفاصيل أو نصوص أو إصلاحات جديدة أثناء التنفيذ، تُسجّل أو تُضاف كمرحلة فرعية واضحة دون كسر التسلسل المعتمد (`L10N-0` إلى `L10N-6`).
4. **وضوح المراحل المتبقية:** يجب أن يُظهر الملف دائماً وبدقة ما اكتمل وما هو جارٍ وما هي المراحل المتبقية بالتحديد.
5. **تحديث قسم آليات الحماية:** إذا تم اكتشاف آلية حماية إضافية لاتجاه النص (BiDi) أو للدردشة أو لمنطقة الرسم أثناء التنفيذ، يجب إضافتها فوراً إلى القسم `3` (`EXISTING TEXT-DIRECTION & CHAT SAFEGUARDS — MUST PRESERVE`).
6. **بوابات التحقق البرمجي الإلزامية:** في كل مرحلة تعديل كود، يجب تنفيذ واجتياز `npx tsc --noEmit` و`npm run build` وتوثيق نتائجهما قبل الانتقال أو الاعتماد.
7. **التحقق اليدوي من المالك قبل الإغلاق:** لا تُعلَم أي مرحلة مرئية أو تفاعلية كـ `COMPLETED` إلا بعد اختبار المالك يدوياً على المتصفح والهاتف وتأكيده سلامة التجربة.
8. **حظر دمج المراحل:** تنفيذ مرحلة واحدة فقط في كل أمر/دفعة.
9. **حماية ثوابت المستودع:** أي تغيير مستقبلي في خارطة التدويل يجب أن يثبت التزامه الصارم بـ [`AGENTS.md`](./AGENTS.md) و[`REFACTORING_ROADMAP.md`](./REFACTORING_ROADMAP.md).
