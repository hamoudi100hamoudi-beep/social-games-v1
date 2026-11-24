# 🌐 خارطة طريق التدويل وتعدد اللغات (Localization Roadmap — `PHASE L10N`)

**المستودع المرجعي:** `hamoudi100hamoudi-beep/social-games-v1` (آخر Commit تنفيذ موثق: `a78ac5cca480570d2cd97954625184311537120b`)  
**الحالة الحالية (`2026-11-24`):**  
- `L10N-0`: `COMPLETED` (`2026-11-22`)  
- `L10N-0.1`: `COMPLETED` (`2026-11-22`)  
- `L10N-1`: `COMPLETED — OWNER MANUALLY VERIFIED` (`2026-11-22` / معتمد `2026-11-23`)  
- `L10N-1.1`: `COMPLETED — DEPENDENCY AND INITIALIZATION REVIEW APPLIED` (`2026-11-22`)  
- `L10N-2`: `COMPLETED — POPUPS AND MODALS LOCALIZED AND OWNER VERIFIED` (`2026-11-23`)  
- `L10N-2.1`: `COMPLETED — REMAINING POPUPS LOCALIZED, REGISTRY CREATED, AND OWNER VERIFIED` (`2026-11-23`)  
- `L10N-3`: `COMPLETED — OWNER MANUALLY VERIFIED` (`2026-11-23` — Commit: `e2c66a6068eecb685f725f2742695b8f509eb8d1`)
- `L10N-4`: `COMPLETED — OWNER MANUALLY VERIFIED` (`2026-11-23` — Pre-L10N-5 Ref: `f1d9f259c1968261865ee618d1eec10863b3c36b`)
- `L10N-5`: `COMPLETED — OWNER MANUALLY VERIFIED` (`2026-11-24` — Commit: `a78ac5cca480570d2cd97954625184311537120b`)
- `L10N-6`: **`AWAITING MANUAL VERIFICATION`** (`2026-11-24` — Stage 2 implemented & automated checks passed; awaiting owner manual check before `L10N-7`; commit reference pending owner sync)
- `L10N-7`: **`NOT STARTED`**

**الوثائق المرجعية المرتبطة:**  
- دستور محرك الرسم والتراجع: [`AGENTS.md`](./AGENTS.md)  
- سجل النوافذ المنبثقة والطبقات التفاعلية: [`UI_MODAL_REGISTRY.md`](./UI_MODAL_REGISTRY.md)  
- خارطة الطريق المعمارية الموحدة: [`REFACTORING_ROADMAP.md`](./REFACTORING_ROADMAP.md)  
- خارطة طريق الموثوقية والأمان: [`PRODUCTION_RELIABILITY_ROADMAP.md`](./PRODUCTION_RELIABILITY_ROADMAP.md)  

---

## 1. الحوكمة والقيود غير القابلة للكسر (Binding Governance & Protected Systems)

تخضع جميع مراحل **`PHASE L10N`** (`L10N-0` إلى `L10N-8`) للقوانين الصارمة التالية، ويُحظر تجاوزها في أي دفعة قادمة:

1. **حماية ثوابت [`AGENTS.md`](./AGENTS.md) ومحرك الرسم/التراجع:**
   - عدم تعديل حزم `draw_binary` الثنائية، أو شرط أداة الدلو الأولي (`type === 4 || type === 10 || type === 5`) في `server/rooms.ts` (`recordDrawCommand`)، أو قفل `isDrawingActive = false` عند `undo`، أو `redoStack` ذات الخطوة الواحدة، أو `CanvasCheckpointManager`، أو منع تسجيلات الأداء الساخنة.
2. **حماية الإصلاحات السابقة (`UI-A` / `UI-B` / `UI-C`):**
   - **`UI-A Stage 2A`:** الحفاظ التام على استقرار حركة نهاية الجولة (`roundEndAnimationKey` / `MiniBoardOverlay`) دون اهتزاز أفقي أو إعادة ظل CSS الزائد.
   - **`UI-B Stage B2`:** الحفاظ التام على تطابق نسبة إطار لوحة المتفرج `aspect-[680/396]` (`GameRoom.tsx:1110`, `ExperimentalGameRoom.tsx:1450`) ونمط `object-contain` دون مطّ أو قصّ.
   - **`UI-C Stage 1 & 2A`:** الحفاظ التام على مفتاح الهوية المستقرة `persistentId || id`، ومهلة تتبّع الدخول، وغلاف الأنيميشن `flex items-center min-w-0 max-w-full overflow-visible` في `PlayersSidebar.tsx` و`FreeDrawPlayersList.tsx`.
3. **استقلالية الكلمات والتخمين عن لغة الواجهة (Shared Round Content Rule):**
   - تبقى مصفوفة الكلمات (`server/data/wordsDictionary.ts` — `ALL_WORDS`)، وخيارات الكلمات (`wordOptions`)، والكلمة المختارة (`currentWord`)، وتلميحات الحروف المقنّعة (`maskedWordArray`)، واتجاه الكلمة (`isRTL`)، ومحرك المطابقة التقريبية (`server/utils/arabicFuzzyMatch.ts`) **مشتركة على مستوى الغرفة/الجولة** دون أي ترجمة فردية لكل لاعب.
4. **تنفيذ مرحلة واحدة فقط في كل دفعة وعدم نقل الأقسام مبكراً:** لا يُدمج كود من مرحلتين معاً، ولا تُنقل ترجمة أي قسم إلى مرحلة سابقة لمجرد سهولة الوصول إليه، ولا تبدأ أي مرحلة تالية إلا بعد اختبار وإغلاق المرحلة السابقة واجتياز بوابات القبول (`npx tsc --noEmit` + `npm run build` + التحقق اليدوي من المالك).
5. **الالتزام الصارم بنطاق الملفات المسموحة:** لا يُسمح لأي مرحلة بتعديل ملفات خارج قائمة **"الملفات المسموحة"** الخاصة بها دون تبرير تقني واضح ومسبق وتوثيق موافقة مالك المشروع صراحةً.

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
| **مستند HTML وبياناته** | `index.html:2, 6-9` | `lang="en"`, `<title>DRAW.IO Drawing Game</title>`, meta descriptions (`og:title`, `og:description`) — تتحدث قيمة `lang` والوصف بأمان حسب لغة المتصفح/الاختيار، مع **بقاء الاسم التجاري للصفحة `DRAW.IO` بالإنجليزية دائماً**. |
| **اللوبي الرئيسي** | `Lobby.tsx:341, 437, 503, 516, 580, 590-592, 604, 615-617, 630, 654-659, 668, 682` | `NICKNAME`, `Enter your name...`, `هذه الميزة غير متوفرة بعد`, `عذراً، هذه الغرفة ممتلئة بالكامل!`, `OK`, نصوص ثنائية اللغة في `INACTIVE` / `DISCONNECTED` / `ERROR`, `اختر أفاتار`, `أضف إيموجي مخصص` — يُضاف **منتقي اللغة فقط (`Auto` / `العربية` / `English`) في `L10N-1`**، بينما تبقى ترجمة بقية نصوص اللوبي في **`L10N-6`**. |
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
| **الأداء على أندرويد الضعيف** | تهيئة متزامنة فورية (تقديرياً ~1–2ms عند الإقلاع؛ *تقدير نظري وليس قياساً فعلياً من بناء المشروع*)، بدون إعادة تحميل شبكي، وتغليف عبر hook خفيف لا يعيد تصيير مكونات الرسم المعزولة. | أسرع بهامش ميكروثانية غير محسوس بشرياً. |
| **حجم الحزمة (Bundle Size)** | تقديرياً ~16–18 KB مضغوط gzip فقط (*تقدير مرجعي قياسي للحزمة وليس قياساً فعلياً من بناء هذا المشروع؛ سيُقاس الأثر الفعلي بعد البناء في `L10N-1` و`L10N-8`*)، بلا تحميل إضافات backend أو browser-languagedetector الثقيلة. | تقديرياً ~1.5–2 KB مضغوط gzip. |
| **سهولة الصيانة والتوسع المستقبلي** | معمارية معيارية؛ إضافة لغة جديدة (فرنسية/تركية/إسبانية) لا تتعدى إنشاء مجلد لغة وتسجيله في `SUPPORTED_LANGUAGES`. | يتطلب كتابة وصيانة كود التداخل والجمع وقواعد كل لغة يدوياً. |
| **كشف المفاتيح المفقودة (Missing Keys)** | فحص ثابت بـ TypeScript عبر `CustomTypeOptions` + `missingKeyHandler` في بيئة التطوير فقط. | فحص ثابت بـ TypeScript عبر `satisfies TranslationSchema`. |
| **التداخل والمتغيرات (Interpolation)** | مدمج (`{{name}}`, `{{count}}`) مع دعم حماية السياق والاتجاه. | يتطلب كتابة دالة استبدال يدوية لكل حالة خاصة. |
| **الجمع (Pluralization)** | **تفوق حاسم:** يدعم تلقائياً قواعد CLDR الست للغة العربية (`zero`, `one`, `two`, `few`, `many`, `other`) وأي لغة مستقبلية (ثانية/ثانيتان/ثوانٍ، نقطة/نقطتان/نقاط). | يتطلب بناء دالة `Intl.PluralRules` مخصصة وربطها بكل مفتاح يدوياً. |
| **تقسيم الملفات (Namespaces)** | دعم أصيل للـ namespaces (`common`, `lobby`, `modals`, `room`, `drawing`, `events`). | تقسيم كائنات يدوي يفتقد عزل الـ namespace القياسي. |

**القرار النهائي الموصى به:** اعتماد **`i18next` + `react-i18next`** مع استيراد القواميس **محلياً وثابتاً داخل الكود (`resources` مضمّنة في Vite)** ودون استخدام `i18next-http-backend` نهائياً، مع تغليفها في طبقة واجهة موحدة داخل `src/i18n/` وتفعيل التطابق الصارم للأنواع في TypeScript (`CustomTypeOptions`).  
يُجنّب هذا الاختيار بناء محرك جمع وصياغة مخصص للغة العربية ذات الست صيغ، ويحفظ الأداء على أجهزة Android الضعيفة (0ms تأخير شبكة)، ويضمن توسيعاً فورياً لأي لغة قادمة. *(ملحوظة توثيقية: أرقام حجم الحزمة وزمن التهيئة المذكورة أعلاه تقديرية استناداً إلى خصائص الحزمة القياسية وليست قياساً فعلياً من مخرجات Vite لهذا المستودع حتى الآن).*

### البنية المقترحة لمجلد `src/i18n/`
- `src/i18n/types.ts` — أنواع `LanguageMode` (`'auto' | 'ar' | 'en'`) و`SupportedLanguage` (`'ar' | 'en'`) و`CustomTypeOptions`.
- `src/i18n/languageDetector.ts` — قراءة/حفظ `safeLocalStorage`, كشف لغة المتصفح (`navigator.languages?.[0] || navigator.language` -> `'ar'` إذا بدأ بـ `ar` وإلا `'en'`), ودالة تحديث `document.documentElement.lang` (دون فرض `dir="rtl"` عالمياً على هندسة الغرفة والرسم).
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
   - تطبيق قاعدة **Dual-Field Payloads** في `L10N-4`: يضيف الخادم الحقول المهيكلة (`eventCode`, `params`, `playerName`, `actorId`, `winnerName`, `score`, `hasWinners`) **مع الإبقاء على حقل `text` الاحتياطي**؛ ويقرأ العميل في `L10N-5` حقل `eventCode` أولاً ثم يعود تلقائياً لـ `subType` والـ regex القديم عند غياب `eventCode`.
4. **تكافؤ الغرف (`Normal` vs `Experimental` vs `Free Draw`):**
   - تشترك `GameRoom.tsx` (للرسم الحر والوضع العادي) و`ExperimentalGameRoom.tsx` (للوضع التنافسي) في المكونات والخدمات نفسها (`MiniBoardOverlay`, `OverlayChatRoom`, `ExitConfirmModal`, `AfkWarningModal`, `PlayerProfileModal`, `RoomAlertModals`, `RoomConnectionStatusOverlay`, `ExperimentalDrawingBoard`, `ColorWheelModal`). يجب تطبيق كل مرحلة على نسختي الغرف بالتكافؤ التام (النوافذ في `L10N-2`، اللوحة المصغرة في `L10N-3`، الدردشة والتخمينات في `L10N-5`، وأدوات الرسم والنصوص المتفرقة في `L10N-7`).
5. **منع تكرار أو فقدان الأحداث:**
   - لا نضيف أي Socket.IO events جديدة ولا نغير أسماء الأحداث القائمة (`receive_message`, `receive_guess`, `join_room`, `afk_warning`, `session_expired`, `submit_vote_kick`). يتم التوسيع على الحقول الاختيارية داخل الحمولة القائمة فقط.
6. **أثر الأداء وحجم الحزم في Socket.IO / MsgPack (`512 KiB maxHttpBufferSize`):**
   - إضافة `eventCode` (~15 بايت) و`params` (~15–30 بايت) في رسائل النظام النادرة (مرة كل جولة أو دخول/خروج) لا تؤثر نهائياً على `draw_binary` ولا تستهلك معالج الخادم لأن الخادم **يتجنب أي حلقة ترجمة لكل لاعب** ويبث رمزاً واحداً محايداً لجميع اللاعبين.
7. **فصل الكلمات عن لغة الواجهة:**
   - تظل `ALL_WORDS` و`arabicFuzzyMatch.ts` كما هي تماماً. عندما يكون المتسابق بواجهة إنجليزية، يقرأ `Choose a word to draw` بالإنجليزية وتظهر خيارات الكلمات باللغة العربية مع `dir="auto"`؛ وفي شاشة اللعب تظل التلميحات وحساباتها بالاتجاه الفعلي للكلمة (`ExperimentalWordOverlay.tsx`).

---

## 7. الخارطة التنفيذية المفصلة (`L10N-0` إلى `L10N-8`)

### المرحلة `L10N-0` — التدقيق وإعداد خارطة الطريق
1. **الاسم والرقم:** `PHASE L10N-0 — Audit & Roadmap` — **`[x] COMPLETED` (`2026-11-22`)** *(نُظّم التسلسل في `L10N-0.1` بتاريخ `2026-11-22` مع إبقاء سجل إكمال `L10N-0` كما هو)*.
2. **الهدف:** جرد كافة النصوص، توثيق آليات حماية الاتجاه والدردشة، اختيار نظام الترجمة الأنسب، وتثبيت خارطة طريق غير ملتبسة.
3. **الملفات المسموحة:** `LOCALIZATION_ROADMAP.md` (إنشاء)، `REFACTORING_ROADMAP.md` (ربط مرجعي مختصر فقط).
4. **الملفات المحظورة:** جميع الملفات البرمجية (`src/`, `server/`, `public/`, `index.html`, `package.json`, `bun.lock`).
5. **الآليات المحمية:** كامل قاعدة الكود الحالية بلا أي تغيير برمجي.
6. **المهام:** الفحص القرائي الشامل وتوثيق الأقسام `1–9`.
7. **المخاطر:** صفر (مرحلة توثيق وقراءة فقط).
8. **معايير الخروج:** اعتماد الوثيقة من المالك.
9. **الاختبارات:** مراجعة الوثيقة ومطابقتها للكود الفعلي.
10. **الاعتماديات:** لا توجد.

---

### المرحلة `L10N-1` — نواة الترجمة ومنتقي اللغة (`Localization Foundation & Language Selector`)
1. **الاسم والرقم:** `PHASE L10N-1 — Localization Foundation & Language Selector` — **`[x] COMPLETED — OWNER MANUALLY VERIFIED`** *(نُفذ الكود بتاريخ `2026-11-22` واختبره المالك يدوياً في المتصفح: التبديل بين `Auto` / `العربية` / `English`، كشف لغة المتصفح، وحفظ الاختيار بعد إعادة تحميل الصفحة)*.
2. **الهدف:** تأسيس `i18next` و`react-i18next` بملفات `ar` و`en` المحلية، وأوضاع `auto` / `ar` / `en` عبر `safeLocalStorage`، وإضافة **منتقي اللغة فقط** إلى شاشة البداية (`Lobby.tsx`) وتحديث `lang` في مستند HTML بصورة آمنة، **دون ترجمة بقية اللوبي أو تطبيق `dir="rtl"` عالمياً دون عزل هندسة الغرفة والرسم**.
3. **الملفات المنشأة والمعدلة فعلياً:**
   - **ملفات برمجية منشأة (`src/i18n/`):**
     - `src/i18n/types.ts` (تعريف `LanguageMode`, `AppLanguage`, `DeepLocaleSchema`, وتوسيع `CustomTypeOptions` في `i18next`).
     - `src/i18n/languageDetector.ts` (قراءة/حفظ `drawio_ui_lang_mode` عبر `safeLocalStorage`، كشف المتصفح `navigator.languages?.[0] || navigator.language`، `isRTLLanguage`، وتحديث `document.documentElement.lang` فقط دون `dir`).
     - `src/i18n/index.ts` (تهيئة `i18next` محلياً وبصورة فورية بموارد مضمّنة بدون HTTP backend، وتحذير المفاتيح المفقودة في وضع التطوير عبر `import.meta.env?.DEV`).
     - `src/i18n/useAppTranslation.ts` (واجهة React موحدة تُعيد `t`, `i18n`, `languageMode`, `currentLanguage`, `isRTL`, `changeLanguageMode`).
     - `src/i18n/locales/en/common.ts` و`src/i18n/locales/en/index.ts`.
     - `src/i18n/locales/ar/common.ts` و`src/i18n/locales/ar/index.ts` (مفاتيح منتقي اللغة فقط مع إلزام تطابق البنية والمفاتيح عبر TypeScript).
   - **ملفات برمجية معدلة:**
     - `src/main.tsx` (استيراد `./i18n` قبل إنشاء جذر React).
     - `src/components/Lobby.tsx` (إضافة منتقي اللغة المدمج `Auto/تلقائي` | `العربية` | `English` في شاشة البداية فقط، وإخفاؤه عند فتح لوحة مفاتيح الهاتف `isKeyboardOpen` منعاً للتداخل، دون ترجمة أي نص آخر).
   - **ملفات الاعتماديات والقفل والمكتبات المضافة:**
     - `package.json` و`bun.lock` فقط (عبر `bun add i18next react-i18next`؛ دون حذف `bun.lock` ودون إنشاء `package-lock.json` ودون تعديل إصدارات React/Vite/TypeScript).
     - المكتبات المضافة: `i18next@27.2.4` (`^27.2.4`)، `react-i18next@18.0.3` (`^18.0.3`).
4. **الملفات المحظورة (تم احترامها بالكامل):** `server/*`, `src/components/lobby/*`, `src/components/game/*`, `src/components/experimental/*`, `src/types/game.ts`, `index.html`, `AGENTS.md`.
5. **الآليات المحمية:** عدم تفعيل `dir="rtl"` عالمياً على `<html>` أو `#root`؛ إبقاء محرك الرسم و`SocketProvider` و`DRAW.IO` وبقية نصوص `Lobby.tsx` كما هي تماماً.
6. **نتائج الفحص والبناء الفعلية (`2026-11-22`):**
   - `npx tsc --noEmit`: نجاح تام بدون أخطاء.
   - `npm run build` (`vite build`): نجاح تام خلال `12.06s` (تحويل `2238` وحدة).
   - قياسات مخرجات البناء الفعلية:
     - `dist/index.html`: `2.54 kB │ gzip: 0.72 kB`
     - `dist/assets/index-DN_ggnG_.css`: `85.85 kB │ gzip: 15.24 kB`
     - `dist/assets/eruda-Cb_OITk7.js`: `506.26 kB │ gzip: 160.87 kB`
     - `dist/assets/index-hT9t7BQx.js`: `1,212.22 kB │ gzip: 332.32 kB`
   - اختبار وحدات سريع عبر `tsx`: تحقق من كشف `ar-EG` في `auto`، والتجاوز اليدوي `en`/`ar`، والرجوع إلى `auto` مع `fr-FR`، ومزامنة `document.documentElement.lang` وبقاء `dir` فارغاً، وعمل `safeLocalStorage` عند تعطل `localStorage`، وعدم تنفيذ أي طلب شبكة `fetch`.
7. **ما بقي للاختبار اليدوي من المالك (قبل إغلاق `L10N-1`):**
   - فحص المظهر والتمركز على الهاتف الفعلي (خصوصاً الشاشات الصغيرة وعند فتح/إغلاق لوحة المفاتيح لحقل `NICKNAME`).
   - التحقق في المتصفح من تبديل `Auto` / `العربية` / `English` وبقاء الاختيار بعد `Reload`.
   - التحقق في متصفح عربي وآخر غير عربي عند اختيار `Auto`.
   - التحقق من تغيّر `<html lang="ar|en">` وعدم تغيّر `dir` أو ظهور أي طلب شبكة في تبويب Network.
8. **الاعتماديات:** `L10N-0` و`L10N-0.1`.

---

### المرحلة `L10N-1.1` — مراجعة أمان `bun.lock` وتوقيت تهيئة `i18next` (`Dependency & Initialization Safety Review`)
1. **الاسم والرقم:** `PHASE L10N-1.1 — Dependency & Initialization Safety Review` — **`[x] COMPLETED — DEPENDENCY AND INITIALIZATION REVIEW APPLIED`** (`2026-11-22`)
2. **تدقيق وإصلاح `bun.lock`:**
   - **سبب التضخم المرصود:** عند مقارنة `HEAD` (`e4c131d`) مع `HEAD~1` (`4f0e32d`) في GitHub، احتوى `bun.lock` على **48 حزمة محدثة مسبقاً** في بيئة الحاوية غير مرتبطة بـ `i18next` أو `react-i18next` (`@babel/*`, `rollup` و26 حزمة منصة `@rollup/rollup-*`, `autoprefixer`, `baseline-browser-mapping`, `browserslist`, `csstype`, `electron-to-chromium`, `engine.io`, `node-releases`, `object-inspect`, `playwright`, `playwright-core`, `postcss`, `source-map-js`, `tapable`, `update-browserslist-db`, `@tailwindcss/oxide-wasm32-wasi/@tybys/wasm-util`).
   - **الإجراء المنفذ:** أعيدت جميع الـ 48 حزمة إلى إصدارات `HEAD~1` (`4f0e32d`) باستخدام `bun install --lockfile-only` ثم تثبيت القفل عبر `bun install --frozen-lockfile`.
   - **النتيجة الصافية في `bun.lock` مقارنةً بـ `HEAD~1`:** إضافة **3 حزم فقط** (`i18next@27.2.4`, `react-i18next@18.0.3`, `html-parse-stringify@4.0.1` كاعتماد مباشر وحيد لـ `react-i18next`)، **0 حزم محذوفة**، و**0 تغييرات** في إصدارات الحزم الـ 48 الأخرى.
3. **نتيجة تدقيق توقيت تهيئة `i18next`:**
   - بفحص `node_modules/i18next/dist/esm/i18next.js` (أسطر `1949–2085`, `2205–2266`, `2347`) و`node_modules/react-i18next/dist/es/useTranslation.js` (أسطر `110–199`) و`utils.js` (أسطر `56–69`):
     - وجود `resources` مضمّنة محلياً بدون `backend` وبدون `partialBundledLanguages` يجعل `i18n.init()` تنفذ `load() -> changeLanguage() -> loadResources() -> finish()` **بشكل متزامن بالكامل** قبل انتهاء استدعاء `init()`.
     - تصبح `i18n.isInitialized === true` و`i18n.resolvedLanguage` جاهزتين وحزم الموارد محملة قبل استدعاء `createRoot(...).render(<App />)` في `src/main.tsx`.
     - تعيد `hasLoadedNamespace` القيمة `true` فوراً وتكون `ready === true` في أول تصيير لـ `Lobby` دون إطلاق `Promise` لـ `Suspense` ودون عرض مفتاح الترجمة أو تحذير `USE_T_BEFORE_READY`.
   - بناءً عليه: **لم تُجرَ أي تعديلات** على `src/i18n/index.ts` أو `src/i18n/useAppTranslation.ts` أو `src/main.tsx`.
4. **نتائج الاختبارات الفعلية بعد إصلاح `bun.lock` (`2026-11-22`):**
   - `bun install --frozen-lockfile`: نجاح (`24 packages installed` في `200.00ms` لمطابقة `node_modules` مع القفل النظيف).
   - `npx tsc --noEmit`: نجاح تام بدون أخطاء.
   - `npm run build` (`vite build`): نجاح تام خلال `11.41s` (`dist/assets/index-hT9t7BQx.js`: `1,212.22 kB │ gzip: 332.32 kB`).

---

### المرحلة `L10N-2` — توطين النوافذ المنبثقة فقط (`Popups & Modals`)
1. **الاسم والرقم:** `PHASE L10N-2 — Popups & Modals` — **`[x] COMPLETED — POPUPS AND MODALS LOCALIZED AND OWNER VERIFIED`** (`2026-11-23`)
2. **الهدف:** مراجعة وتوطين جميع النوافذ المنبثقة المشتركة فقط: الاحتفاظ بالترجمات الموجودة والصحيحة، ترجمة النصوص الناقصة، تصحيح النصوص المختلطة (إزالة الازدواجية لتظهر بلغة اللاعب المختارة فقط)، وإبقاء العناوين الفنية (`GameTitle`) بالإنجليزية، دون لمس `MiniBoard` أو الدردشة أو التخمينات أو بقية اللوبي.
3. **الملفات المسموحة والمنفذة:**
   - `src/components/game/modals/ExitConfirmModal.tsx`
   - `src/components/game/modals/SkipConfirmModal.tsx`
   - `src/components/game/modals/ReportConfirmModal.tsx`
   - `src/components/game/modals/AfkWarningModal.tsx`
   - `src/components/game/modals/PlayerProfileModal.tsx`
   - `src/components/game/modals/RoomAlertModals.tsx`
   - `src/components/game/CinematicModal.tsx` (`aria-label` لزر الإغلاق)
   - `src/components/game/CustomEmojiModal.tsx`
   - `src/components/game/ColorWheelModal.tsx`
   - `src/components/game/RoomConnectionStatusOverlay.tsx`
   - `src/i18n/locales/{en,ar}/{common,modals,index}.ts`
   *(ملاحظة فصل النطاق: النوافذ الأربع المضمنة داخل `Lobby.tsx` و`ExperimentalDrawingBoard.tsx` التي رُصدت لاحقاً أُنجزت في المرحلة التكميلية المباشرة `L10N-2.1` أدناه، بينما تبقى بقية نصوص `Lobby.tsx` في `L10N-6` وبقية أدوات `ExperimentalDrawingBoard.tsx` في `L10N-7`).*
4. **الملفات المحظورة (تم احترامها بالكامل):** `server/*`, `src/components/game/MiniBoardOverlay.tsx`, `src/components/game/OverlayChatRoom.tsx`, `src/components/game/GameActivityFeed.tsx`, `src/components/experimental/ChoosingWordOverlay.tsx`, `src/components/experimental/ExperimentalWordOverlay.tsx`, `src/components/GameRoom.tsx`, `src/components/experimental/ExperimentalGameRoom.tsx`.
5. **الآليات المحمية:**
   - بقاء عناوين `GameTitle` بالإنجليزية (`EXIT`, `REPORT`, `PROFILE`, `SKIP`, `INACTIVE`, `ERROR`, `KICKED`, `SLOW DOWN`, `SERVER FULL`, `TIMEOUT`, `CUSTOM EMOJI`).
   - إبقاء `dir="ltr"` على شريط الكثافة وحقل `#HEX` في `ColorWheelModal.tsx`.
   - إبقاء `dir="auto"` / `<bdi>` لاسم اللاعب في `PlayerProfileModal` واختيار الإيموجي.
6. **التنفيذ والاعتماد الفعلي:** توحيد أزرار `YES`/`NO`/`OK`/`BLOCK`/`UNBLOCK`/`VOTEKICK`/`REMOVE VOTE` وأوصافها وصيغ الجمع في `AfkWarningModal` وتلميحات `ColorWheelModal` وحالات `RoomConnectionStatusOverlay` بلغة اللاعب المختارة فقط، واجتياز `npx tsc --noEmit` و`npm run build` ومزامنة GitHub والتحقق اليدوي الكامل من المالك.
7. **الاعتماديات:** `L10N-1` و`L10N-1.1`.

---

### المرحلة `L10N-2.1` — النوافذ المنبثقة المتبقية وسجل النوافذ (`Remaining Popups & UI Modal Registry`)
1. **الاسم والرقم:** `PHASE L10N-2.1 — Remaining Popups & UI Modal Registry` — **`[x] COMPLETED — REMAINING POPUPS LOCALIZED, REGISTRY CREATED, AND OWNER VERIFIED`** (`2026-11-23` — Commit: `d176c37f3d56f364e971ec24cbd22f2a0c0ef64c`)
2. **الهدف:** استكمال توطين النوافذ المنبثقة الأربع التي كانت خارج نطاق `L10N-2` قبل الانتقال إلى `L10N-3`، وإنشاء سجل تقني موحّد وصياني لجميع النوافذ المنبثقة والطبقات المشابهة في المشروع.
3. **النوافذ الأربع الموطّنة والمؤكدة يدوياً:**
   - **`CLEAN`** (تأكيد مسح اللوحة) في `src/components/experimental/ExperimentalDrawingBoard.tsx` (`modals:clean.question`, `common:actions.yes/no`، مع بقاء `.animate-clean-spin` واتجاه الكانفاس `dir="ltr"` دون تغيير).
   - **`NAMES`** (تأكيد إظهار/إخفاء أسماء اللاعبين أثناء الرسم — وضع الرسم الحر فقط `{isFreeDraw && ...}`) في `src/components/experimental/ExperimentalDrawingBoard.tsx` (`modals:names.hideQuestion` / `showQuestion`, `common:actions.yes/no`).
   - **إشعار الخمول في اللوبي `INACTIVE`** (ما بعد الطرد بسبب الخمول) في `src/components/Lobby.tsx` (`modals:lobbyAfk.message`, `common:actions.ok`).
   - **إشعار فقدان الاتصال في اللوبي `DISCONNECTED`** (ما بعد الخروج/انتهاء الجلسة) في `src/components/Lobby.tsx` (`modals:lobbyDisconnected.message`, `common:actions.ok`).
4. **الملفات المعدلة والمنشأة فعلياً:**
   - `src/components/experimental/ExperimentalDrawingBoard.tsx`
   - `src/components/Lobby.tsx`
   - `src/i18n/locales/ar/modals.ts`
   - `src/i18n/locales/en/modals.ts`
   - `UI_MODAL_REGISTRY.md` (إنشاء وتوثيق السجل التقني الكامل للنوافذ).
5. **الثوابت والحدود المعمارية المحفوظة:**
   - بقاء عنوان `DISCONNECTED` البرتقالي/الذهبي (`titleType="exit"`، `#FFB300` / `#0F3957`) وعناوين `CLEAN`, `NAMES`, `INACTIVE` بالإنجليزية دون تغيير.
   - بقاء مسار `RoomConnectionStatusOverlay` (إعادة الاتصال الحية داخل الغرفة) منفصلاً تماماً عن نافذة `DISCONNECTED` في اللوبي (إشعار ما بعد انتهاء الجلسة)، وبقاء `AfkWarningModal` (العد التنازلي قبل الطرد داخل الغرفة) منفصلاً عن نافذة `INACTIVE` في اللوبي.
   - **`CinematicModal.tsx` مقابل `UI_MODAL_REGISTRY.md`:** يبقى `src/components/game/CinematicModal.tsx` المكون التشغيلي المشترك المصدر المرجعي للتنفيذ (Portal، الخلفية، `GameTitle`، الأزرار، وحركات Framer Motion)، بينما يظل `UI_MODAL_REGISTRY.md` سجلًا توثيقياً فقط لا يستبدل الكود ولا ينفّذ حركات؛ وتُحفظ الوثيقتان منفصلتين معاً.
6. **نتائج التحقق:** اجتياز `npx tsc --noEmit` و`npm run build` وفحص مفاتيح القواميس في `enModals` و`arModals`، **وأكد المالك يدوياً أن ترجمات النوافذ الأربع تعمل بصورة صحيحة**.
7. **الاعتماديات:** `L10N-2`.

---

### المرحلة `L10N-3` — اللوحة المصغرة وانتقالات الأدوار (`MiniBoard & Turn Transitions`)
1. **الاسم والرقم:** `PHASE L10N-3 — MiniBoard & Turn Transitions` — **`[x] COMPLETED — OWNER MANUALLY VERIFIED`** (`2026-11-23` — Commit: `e2c66a6068eecb685f725f2742695b8f509eb8d1`)
2. **الهدف:** توطين `MiniBoardOverlay` (الانتظار، الرسم الحر المبدئي، انتقال الأدوار، نهاية الجولة، المنصة `PODIUM`) و`ChoosingWordOverlay` (اختيار الكلمة)، وترجمة النصوص التوضيحية المرافقة للعناوين الفنية مع بقاء العناوين الفنية بالإنجليزية، والحفاظ على الكلمة المختارة والتلميحات المشتركة دون ترجمة مستقلة، وعزل اتجاه صف الأحرف في `ExperimentalWordOverlay.tsx` بـ `dir="ltr"`، دون لمس الدردشة أو التخمينات.
3. **الملفات المنفذة فعلياً ضمن النطاق المسموح:**
   - `src/components/game/MiniBoardOverlay.tsx` (توطين شاشات الرسم الحر والانتظار واختيار الدور ونهاية الجولة بجميع حالاتها والمنصة وصيغ الجمع CLDR للنقاط وتلميحات الميداليات مع `<bdi dir="auto">` و`<Trans>`)
   - `src/components/experimental/ChoosingWordOverlay.tsx` (توطين `prompt` و`drawButton` و`orDivider` مع إبقاء `IT'S YOUR TURN!` بالإنجليزية وإبقاء `wordOptions[0..1]` بدون ترجمة مع `dir="auto"` وثبات موضع أيقونة القلم)
   - `src/components/experimental/ExperimentalWordOverlay.tsx` (إضافة `dir="ltr"` حصراً على حاويتي صف الأحرف للرسام والمخمن وفق Safeguard 6 دون أي تغيير في المنطق أو الأداء أو `React.memo`)
   - `src/i18n/locales/en/miniBoard.ts` و`src/i18n/locales/ar/miniBoard.ts` (`miniBoard` namespace متضمناً صيغ الجمع الست للعربية `zero/one/two/few/many/other` وصيغ الإنجليزية `one/other`)
   - `src/i18n/locales/en/wordChoice.ts` و`src/i18n/locales/ar/wordChoice.ts` (`wordChoice` namespace)
   - `src/i18n/locales/en/index.ts` و`src/i18n/locales/ar/index.ts` (تسجيل النطاقين الجديدين)
4. **الملفات المحظورة (تم احترامها بالكامل):** `server/*`, `src/components/game/OverlayChatRoom.tsx`, `src/components/game/GameActivityFeed.tsx`, `src/components/Lobby.tsx`, `src/components/GameRoom.tsx`, `src/components/experimental/ExperimentalGameRoom.tsx`, `src/components/experimental/ExperimentalDrawingBoard.tsx`, `src/components/game/DrawingCanvasCore.tsx`, `CinematicModal.tsx`, `UI_MODAL_REGISTRY.md`, `package.json`, `bun.lock`, جميع ملفات وأصول السبرايت.
5. **الآليات المحمية:**
   - **`UI-A Stage 2A`:** الحفاظ التام على `roundEndAnimationKey` / `prevRoundEndKeyRef` / `activeAnimationKeyRef` / `wasPodium` / `playPodiumAnimations` / `getAnimClass` وظلال السبرايت في `MiniBoardOverlay.tsx`.
   - **Safeguard 6:** إبقاء `wordOptions`, `currentWord`, `maskedWordArray` مشتركة دون ترجمة، وإبقاء `dir="auto"` في `ChoosingWordOverlay.tsx`، وتثبيت `dir="ltr"` على حاويتي صف الأحرف في `ExperimentalWordOverlay.tsx` مع إبقاء `flexDirection: isRTL ? 'row-reverse' : 'row'`.
   - بقاء عناوين `MiniBoardOverlay` الفنية (`FREE DRAW`, `WAITING`, `NEW TURN!`, `SKIPPED!`, `INACTIVE`, `CANCELED TURN`, `INTERVAL`, `MASTERPIECE!`, `GAME OVER`) وعنوان `IT'S YOUR TURN!` في `ChoosingWordOverlay` بالإنجليزية.
   - بقاء ترتيب المنصة الفيزيائي ثابتاً (المركز الأول في الوسط والثاني والثالث في جانبيهما المعتادين دون عكس Flexbox).
6. **نتائج التحقق الآلي المنفذة (`2026-11-23`):**
   - `npx tsc --noEmit`: نجاح تام بدون أخطاء.
   - `npm run build` (`vite build`): نجاح تام خلال `9.76s` (`2244` وحدة؛ `dist/assets/index-CjNqk9nL.js`: `1,233.67 kB │ gzip: 339.80 kB`).
   - التحقق من صيغ الجمع وتكافؤ المفاتيح عبر `tsx`: تطابق كامل لمفاتيح `miniBoard` و`wordChoice` بين العربية والإنجليزية وتحقق من `0, 1, 2, 5, 15, 100` في كلتا اللغتين.
7. **التحقق اليدوي من المالك (`COMPLETED — OWNER MANUALLY VERIFIED — 2026-11-23`):**
   - تم التحقق اليدوي الكامل من المالك في اللغتين العربية والإنجليزية لكل من:
     - شاشة الرسم الحر الأولية (`FREE DRAW`) وشاشة الانتظار (`WAITING`).
     - شاشة اختيار الكلمة (`ChoosingWordOverlay`) وعرض الكلمة الفعلية والتلميحات المقنّعة (`ExperimentalWordOverlay`).
     - جميع حالات `ROUND_END` (`skipped`, `turn_lost`, `canceled`, `interval`, `all_guessed`, و`timeout` مع وجود فائزين وبدونه).
     - منصة التتويج (`PODIUM`) مع `1` و`2` و`3` وأكثر من `3` لاعبين.
8. **الاعتماديات:** `L10N-2` و`L10N-2.1`.

---

### المرحلة `L10N-4` — الأحداث النظامية المهيكلة والتوافق الخلفي (`Structured System Events & Backward Compatibility`)
1. **الاسم والرقم:** `PHASE L10N-4 — Structured System Events & Backward Compatibility` — **`[x] COMPLETED — OWNER MANUALLY VERIFIED`** (`2026-11-23` — Ref: `f1d9f259c1968261865ee618d1eec10863b3c36b`)
2. **الهدف:** مرحلة تقنية مستقلة لتجهيز رسائل النظام في الخادم والأنواع المشتركة بإضافة `eventCode` و`params` و`actorId` (عند وجود فاعل ذي دلالة وباعتماد `persistentId || id` دون استبدال `senderId`) ورموز أخطاء الانضمام (`errorCode: 'room_full' | 'join_failed'`) مع **الحفاظ التام على `text` و`error` و`subType` و`type` القديمة كـ `fallback`**، وضمان توافق الرسائل المخزنة وإعادة الاتصال، دون إنشاء أحداث Socket.IO جديدة، ودون تغيير بروتوكول الرسم الثنائي أو محرك الرسم، **ودون ترجمة واجهة الدردشة أو التخمينات في هذه المرحلة**.
3. **الملفات المعدلة فعلياً ضمن النطاق المسموح:**
   - `src/types/game.ts` (تعريف `SystemEventCode`، `SystemEventParams`، `StructuredSystemEventMetadata`، `JoinRoomErrorCode = 'room_full' | 'join_failed'`، و`RoomMessagePayload` غير التقييدية لـ `chatMessages`/`guessMessages`، دون المساس بـ `getRoomConfig` أو `ROOM_PRESETS`)
   - `server/rooms.ts` (إضافة الحقول المهيكلة مباشرة في مواضع البناء داخل `kickIdlePlayers`، `transitionToChoosing`، `transitionToPodium`، `transitionToRoundEnd`، `submitGuess`، `reportDrawing`، و`handleDisconnect` — **دون أي تعديل على `recordDrawCommand` أو `saveChatMessage`/`saveGuessMessage` أو `reconnectPlayer` أو بروتوكول الرسم/التراجع**)
   - `server/registerJoinRoomHandler.ts` (إضافة `eventCode: 'player_joined'`, `params: { name: nickname }`, `actorId: authJoinRes.cleanPid` إلى `joinMsg`؛ وإضافة `errorCode: 'room_full'` و`errorCode: 'join_failed'` مع إبقاء نص `error` القديم كما هو حرفياً)
   - `server/registerLeaveRoomHandler.ts` (إضافة `eventCode: 'player_left'`, `params: { name: playerName }`, `actorId`)
   - `server/registerSendMessageHandler.ts` (إضافة `eventCode: 'chat_word_leak_warning'`, `actorId` بدون `params` في تحذير منع تسريب الإجابة الخاص)
   - `server/registerVoteKickHandler.ts` (إضافة `eventCode: 'votekick_alert'`, `params: { voterName, targetName }`, `actorId: selfId`؛ وإضافة `eventCode: 'player_kicked'`, `params: { name: kickedName }`, `actorId: banId` مع إبقاء النصوص والحقول القديمة كاملة)
   - `src/components/GameRoom.tsx` و`src/components/experimental/ExperimentalGameRoom.tsx` (تحديث شرط `join_room` ليقبل `res.errorCode === 'room_full'` مع إبقاء fallback فحص النصوص القديمة دون ترجمة أي عنصر واجهة)
   - تحديثات تحقق مركّزة في الاختبارات: `scripts/test_session_identity_suite.ts`، `scripts/test_leave_room_integrity.ts`، `scripts/test_phase9a_slice5c3a.ts`
4. **الملفات المحظورة (تم احترامها بالكامل):** `server/registerDrawBinaryHandler.ts`, `server/roomCanonicalStrokeEngine.ts`, `server/utils/binaryBufferHelpers.ts`, `server/utils/arabicFuzzyMatch.ts`, `server/data/wordsDictionary.ts`, `server/roomDrawingHistory.ts`, `src/components/game/OverlayChatRoom.tsx`, `src/components/game/GameActivityFeed.tsx`, `src/components/experimental/ExperimentalHitOverlay.tsx`, `src/components/Lobby.tsx`, `src/components/game/DrawingCanvasCore.tsx`, `src/utils/canvasCheckpointManager.ts`, `AGENTS.md`, `UI_MODAL_REGISTRY.md`, `REFACTORING_ROADMAP.md`, `package.json`, `bun.lock`.
5. **الآليات المحمية:** **Safeguard 1 & 2 & 5 & 9:** بقاء جميع حقول `text`, `error`, `type`, `subType`, `sender`, `senderId`, `word`, `voterName`, `targetName`, `color`، وقنوات `receive_message` / `receive_guess`، والحد المنزلق `40` رسالة، و`reconnectPlayer` دون أي تغيير سلوكي.
6. **التعديلات المنفذة بدقة (20 رمز حدث + رمزا خطأ انضمام):**
   - قناة الدردشة (`receive_message`): `player_joined`, `player_left`, `votekick_alert`, `player_kicked`, `chat_word_leak_warning`, `player_afk_kicked`, `player_disconnected_removed`.
   - قناة التخمينات وسجل النشاط (`receive_guess`): `turn_of`, `game_over`, `turn_canceled`, `all_guessed`, `round_timeout_won`, `nobody_hit`, `answer_reveal`, `turn_skipped`, `turn_lost`, `round_interval`, `guess_hit`, `guess_close`, `draw_reported`.
   - أخطاء `join_room`: `errorCode: 'room_full'` (مع إبقاء `'عذراً، هذه الغرفة ممتلئة بالكامل!'`) و`errorCode: 'join_failed'` (مع إبقاء `'حدث خطأ أثناء الانضمام للغرفة'`).
7. **نتائج الاختبار والتحقق الآلي (`2026-11-23`):**
   - `npx tsc --noEmit`: نجاح تام بدون أخطاء.
   - `npm run build` (`vite build`): نجاح تام خلال `8.47s` (`2244` وحدة).
   - `npx tsx scripts/test_payload_validation_suite.ts`: نجاح (`212 passed`).
   - `npx tsx scripts/test_leave_room_integrity.ts`: نجاح (`79 passed`).
   - `npx tsx scripts/test_session_identity_suite.ts`: نجاح (`631 passed`).
   - `npx tsx scripts/test_phase9a_slice5c3a.ts`: نجاح (`29 passed, 0 failed`).
   - `npx tsx scripts/test_phase9a_slice5c3b.ts`: نجاح (`53 passed, 0 failed`).
8. **التحقق اليدوي من المالك (`COMPLETED — OWNER MANUALLY VERIFIED — 2026-11-23`):** تم التحقق اليدوي الكامل من المالك واعتماد عمل اللعب والدردشة وسجل التخمينات وإشعار امتلاء الغرفة بصورة طبيعية دون أي تغيير بصري غير مقصود قبل الانتقال إلى `L10N-5`.
9. **الاعتماديات:** `L10N-3`.

---

#### المرحلة `L10N-5` — الدردشة والتخمينات وإشعارات الدردشة (`Chat, Guesses & Chat Notifications`)
1. **الاسم والرقم:** `PHASE L10N-5 — Chat, Guesses & Chat Notifications` — **`[x] COMPLETED — OWNER MANUALLY VERIFIED`** (`2026-11-24` — Commit: `a78ac5cca480570d2cd97954625184311537120b`)
2. **الهدف:** توطين `OverlayChatRoom` و`GameActivityFeed` و`ExperimentalHitOverlay` وحقل التخمين في الغرفتين، بما يشمل رسائل الانضمام والمغادرة والتصويت والطرد والـ AFK وانقطاع الاتصال ومنع تسريب الإجابة محلياً لكل لاعب عبر `eventCode`/`params`/`actorId`، مع عدم ترجمة الرسائل والتخمينات التي كتبها اللاعبون والحفاظ على كافة تحسينات BiDi وتكافؤ `GameRoom` و`ExperimentalGameRoom`.
3. **الملفات المنشأة والمعدلة فعلياً ضمن النطاق المسموح:**
   - `src/i18n/locales/en/events.ts` (إنشاء — 40 مفتاحاً نصياً/جمعياً في نطاق `events`)
   - `src/i18n/locales/ar/events.ts` (إنشاء — 44 مفتاحاً متضمناً صيغ الجمع الست CLDR `zero/one/two/few/many/other` عبر `DeepPluralLocaleSchema<typeof enEvents>`)
   - `src/i18n/locales/en/index.ts` و`src/i18n/locales/ar/index.ts` (تسجيل نطاق `events` دون تعديل `src/i18n/index.ts` أو `src/i18n/types.ts`)
   - `src/components/game/OverlayChatRoom.tsx` (توسيع `ChatMessage` بالبيانات المهيكلة، أولوية `eventCode`/`params` + fallback للرسائل القديمة، إظهار `player_disconnected_removed` ورسالة `player_kicked` المميزة، إصلاح `dir="rtl"` الصلب في `votekick_alert` ليتبع `isRTL`، إزالة الازدواجية في أيقونة تحذير الغش، عزل الأسماء بـ `<bdi dir="auto">`، وترجمة `Copy` و`placeholder` مع إبقاء `msg.text` و`dir="auto"` و`unicodeBidi: 'plaintext'`)
   - `src/components/game/GameActivityFeed.tsx` (توسيع `GameActivityMessage`، التفريق الكامل عبر `eventCode` للأحداث الـ 13 بما فيها فصل `round_timeout_won` و`nobody_hit` و`answer_reveal` عن `subType: 'answer_reveal'`، استخدام `actorId` مقابل `persistentPlayerId || socketId` لاستقرار نسبة `turn_lost`/`turn_skipped` التاريخية مع fallback لـ `amIDrawer` فقط عند غياب `actorId`، إبقاء `senderId === socketId` في `guess_hit`، ترجمة `Waiting for players` و`game_over` بصيغ الجمع، وإبقاء التخمينات دون ترجمة)
   - `src/components/experimental/ExperimentalHitOverlay.tsx` (توطين `hit!` و`reported!` عبر `<Trans>` و`<bdi dir="auto">` واتجاه `isRTL` على الصف دون تغيير الـ 3-slot FIFO pool أو المؤقتات أو CSS keyframes أو `React.memo`/`forwardRef`)
   - `src/components/GameRoom.tsx` (توسيع نوع `Message` بالحقول المهيكلة وأنواع `votekick_alert`/`warning` فقط)
   - `src/components/experimental/ExperimentalGameRoom.tsx` (توسيع `Message`، ضبط `guesses`/`guessesRef` كـ `GameActivityMessage[]`، تمرير `persistentPlayerId` إلى `GameActivityFeed`، دعم `eventCode` والاسم في `hitOverlayRef.current?.addHit`، توطين placeholders حقل `#guess-input` الـ 10 مع بقاء الرسم الحر فارغاً، وعكس موضع أيقونة القلم وحشوتها في العربية `right-4` / `pl-4 pr-11` دون المساس بنصوص `L10N-7`)
4. **الملفات المحظورة (تم احترامها بالكامل):** `server/*`, `src/components/Lobby.tsx`, `src/components/lobby/*`, `src/components/experimental/ExperimentalDrawingBoard.tsx`, `src/components/game/FlipaClipControls.tsx`, `src/components/game/DrawingCanvasCore.tsx`, `src/i18n/index.ts`, `src/i18n/types.ts`, `AGENTS.md`, `package.json`, `bun.lock`.
5. **الآليات المحمية:**
   - **Safeguard 1 & 2 & 4 & 5:** الحفاظ على التوافق الخلفي الكامل عند غياب `eventCode`، وعزل الأسماء بـ `<bdi dir="auto">`، وعدم قلب حاويات التخطيط الخارجية لفقاعات الدردشة أو شبكة الغرفة `32% / 68%`.
   - **Safeguard 3 & 8:** الحفاظ على `dir="auto"` و`unicodeBidi: 'plaintext'` لرسائل وتخمينات اللاعبين و`dir="auto"` لحقول الإدخال.
6. **نتائج التحقق الآلي المنفذة (`2026-11-23`):**
   - `npx tsc --noEmit`: نجاح تام بدون أخطاء.
   - `npm run build` (`vite build`): نجاح تام خلال `8.47s` (`2246` وحدة؛ `dist/assets/index-BLgNIkAT.js`: `1,254.64 kB │ gzip: 343.23 kB`).
   - التحقق من تكافؤ المفاتيح وصيغ الجمع العربية (`0, 1, 2, 5, 15, 100`) عبر `tsx`: تطابق كامل (`missingInAr: []`, `missingInEn: []`).
   - جميع اختبارات الخادم الخمسة: `212 + 79 + 631 + 29 + 53 = 1004` فحص نجاح (`0 failed`).
7. **التحقق اليدوي من المالك (`COMPLETED — OWNER MANUALLY VERIFIED — 2026-11-24`):** اختبر المالك اللعبة فعلياً بحسابين داخل نفس الغرفة (حساب بالعربية وآخر بالإنجليزية)، وعرض كل حساب لغته المختارة بصورة سليمة دون الحاجة لأي تعديل برمجي لإغلاق `L10N-5`.
8. **الاعتماديات:** `L10N-4`.

---

### المرحلة `L10N-6` — اللوبي ومتصفح الغرف (`Lobby & Room Browser`)
1. **الاسم والرقم:** `PHASE L10N-6 — Lobby & Room Browser` — **`[x] COMPLETED — OWNER MANUALLY VERIFIED`** (`2026-11-24` — Commit: `a749950a390401175184ad3253aa02f0ee2de6cb`)
2. **الهدف:** توطين النصوص المتبقية في `Lobby.tsx` (بما فيها تسمية ومؤقت الإدخال لـ `NICKNAME`، زر الشاشة الرئيسية `"الغرف"`، رسالة الميزة غير المتوفرة بعد، نافذة امتلاء الغرفة ورسالة خطأ الانضمام بإعادة استخدام `common:actions.ok` و`common:actions.close` و`modals:alerts.roomFull.message`، وشبكة اختيار الأفاتار) و`RoomsBrowserScreen.tsx` و`RoomInfoModal.tsx` و`AvatarCarousel.tsx`، مع الحفاظ الكامل على أسماء الغرف والمعرفات التقنية ومواضيعها بدون ترجمة، إضافةً إلى تعديل تخطيطي محدود في `GameActivityFeed.tsx` لإبقاء صفوف إشعارات النظام محاذية لليسار مثل تخمينات اللاعبين مع حفظ اتجاه النص الداخلي RTL/LTR.
3. **الملفات المنشأة والمعدلة فعلياً ضمن النطاق المسموح:**
   - `src/i18n/locales/en/lobby.ts` و`src/i18n/locales/ar/lobby.ts` (إنشاء نطاق `lobby` بصيغة ثابتة `{{count}} نقطة` في العربية دون صيغ جمع)
   - `src/i18n/locales/en/index.ts` و`src/i18n/locales/ar/index.ts` (تسجيل نطاق `lobby`)
   - `src/components/Lobby.tsx` (توطين `NICKNAME` و`Enter your name...` مع `dir="auto"`، زر الرئيسية `"الغرف"` دون لمس منتقي اللغة `L10N-1` أو عناوين `DRAW.IO`/`INACTIVE`/`DISCONNECTED`/`ERROR`، إزالة التكرار الثنائي اللغة في مودال امتلاء الغرفة وإعادة استخدام `modals:alerts.roomFull.message` و`common:actions.ok`، وتوطين نافذة الأفاتار واتجاهها وأزرارها وإعادة استخدام `common:actions.close`)
   - `src/components/lobby/RoomsBrowserScreen.tsx` (توطين `NEW ROOM` و`aria-label` لزر الرجوع واتجاه إشعار `newRoomNotice` مع إبقاء `GameTitle` `"ROOMS"` وأسماء ووسوم الغرف كما هي)
   - `src/components/lobby/RoomInfoModal.tsx` (توطين `PLAY` -> `العب`، `Players` -> `اللاعبون`، `Theme` -> `الموضوع`، `To Win` -> `للفوز`، `OPEN` -> `مفتوح`، وعرض النقاط `{{count}} pts` / `{{count}} نقطة` بصيغة ثابتة دون صيغ جمع، مع إبقاء `INFO` وأسماء الغرف و`General`/`Free Draw` دون ترجمة، وضبط `dir="auto"` و`dir={isRTL ? 'rtl' : 'ltr'}` وإزالة `uppercase tracking-wider` عن التسميات العربية)
   - `src/components/lobby/AvatarCarousel.tsx` (توطين أوصاف `aria-label`/`title` لأزرار التبديل وفتح المعرض، وتحويل حاوية فتح المعرض إلى `<button type="button">` مع الحفاظ التام على المظهر والسلوك)
   - `src/components/game/GameActivityFeed.tsx` (**تعديل تخطيطي محدود فقط:** تثبيت `dir="ltr"` على حاويات `flex` الخارجية لجميع إشعارات النظام والتنبيهات بحيث تبقى محاذية لليسار مثل صفوف تخمينات اللاعبين، مع نقل `dir={uiDir}` مع `text-left` إلى عناصر `<span>` الداخلية لحفظ قراءة العربية RTL والإنجليزية LTR دون المساس بترتيب الرسائل أو تصنيفها أو تخمينات اللاعبين ودون لمس `OverlayChatRoom.tsx`)
4. **الملفات المحظورة (تم احترامها بالكامل):** `OverlayChatRoom.tsx`, `server/*`, `src/types/game.ts` (`getRoomConfig`, `ROOM_PRESETS`), `GameRoom.tsx`, `ExperimentalGameRoom.tsx`, `DrawingCanvasCore.tsx`, `ExperimentalDrawingBoard.tsx`, `PlayersSidebar.tsx`, `FreeDrawPlayersList.tsx`, `src/i18n/index.ts`, `src/i18n/types.ts`, `AGENTS.md`, `package.json`, `bun.lock`.
5. **الآليات المحمية:**
   - بقاء `DRAW.IO`, `ROOMS` (`GameTitle`), `INFO`, `ERROR`, `INACTIVE`, `DISCONNECTED` بالإنجليزية دائماً.
   - بقاء المعرفات والأسماء التقنية (`General`, `General #Test`, `General #10P`, `Free Draw`, `Experimental Draw`, `#Custom`, `#Test`, `#10P`, `#Lab`) ومواضيع الغرف (`General`, `Free Draw`) دون أي تغيير في العرض أو المنطق (`Safeguard 9`).
   - الحفاظ على `dir="auto"` وسلوك الإدخال و`handleIOSFocusBypass` في `Lobby.tsx`، ومنتقي لغة `L10N-1`، وإبقاء صفوف تخمينات اللاعبين في `GameActivityFeed.tsx` كما هي تماماً.
6. **التحقق اليدوي من المالك (`COMPLETED — OWNER MANUALLY VERIFIED — 2026-11-24`):** اختبر المالك اللوبي ومتصفح الغرف ومودال المعلومات والمحاذاة اليسرى لإشعارات `GameActivityFeed` بعد المزامنة مع GitHub (Commit: `a749950a390401175184ad3253aa02f0ee2de6cb`) وأكد عمل الترجمة بنجاح، مع بقاء لاحق النقاط `pts` في `PlayersSidebar` وإصلاحات دورة حياة واجهة الرسم إلى `L10N-7`.
7. **الاعتماديات:** `L10N-5`.

---

### المرحلة `L10N-7` — أدوات الرسم والواجهة المتبقية (`Drawing Tools & Remaining UI`)
1. **الاسم والرقم:** `PHASE L10N-7 — Drawing Tools & Remaining UI` — **`[~] IN PROGRESS (Stage 2A Implemented — Remaining L10N-7 Tasks Pending)`**
2. **الهدف:** توطين أدوات الرسم (`FlipaClipControls.tsx`, `ExperimentalDrawingBoard.tsx` شاملةً `title` و`aria-label` ونوافذ `CLEAN` و`NAMES`) والنصوص المتفرقة المتبقية (`PlayersSidebar.tsx`, `FreeDrawPlayersList.tsx`, تلميحات/أزرار `GameRoom.tsx` و`ExperimentalGameRoom.tsx` المتبقية، `beforeunload`، و`ErrorBoundary.tsx`) مع الحفاظ الصارم على اتجاه أدوات الرسم وإحداثياتها.
3. **شرط المالك الإلزامي لنقاط اللاعبين في `PlayersSidebar.tsx`:**
   - يجب أن يستخدم لاحق نقاط اللاعبين في العربية الكلمة الثابتة **`"نقطة"`** دائماً بصيغة **`<number> نقطة`** (مثل `0 نقطة`، `1 نقطة`، `2 نقطة`، `5 نقطة`، `100 نقطة`) **دون استخدام صيغ الجمع العربية (`نقطتان` / `نقاط`)**.
4. **المرحلة الفرعية `L10N-7 Stage 2A — Player Points & Drawing UI Lifecycle`:** **`[~] IMPLEMENTED — AWAITING OWNER MANUAL VERIFICATION`** (`2026-11-24` — مرجع التنفيذ النهائي: بانتظار مزامنة المالك مع GitHub)
   - **ما تم تنفيذه في `Stage 2A`:**
     - توطين لاحق نقاط اللاعبين العام عبر `common:units.points` (`{{count}} pts` / `{{count}} نقطة` الثابتة دون صيغ جمع) في `src/i18n/locales/{en,ar}/common.ts` و`src/components/game/PlayersSidebar.tsx` مع الحفاظ التام على الترتيب الفيزيائي LTR (`[30] [نقطة]`) وإبقاء `FreeDrawPlayersList.tsx` بأسماء فقط.
     - مزامنة حالة الدردشة وزر الخروج `X` عند دخول وضع الرسم المعزول (`FULL_DRAWING_ISOLATION_TEST && isDrawingMode`) في `src/components/experimental/ExperimentalGameRoom.tsx` باستدعاء `closeChat()` وفصل التركيز عن حقول الإدخال دون مسح رسائل الدردشة أو عداد غير المقروءة.
     - الإغلاق التلقائي الآمن لنوافذ وقوائم الرسم المؤقتة عند انتهاء دور الرسم:
       - `SkipConfirmModal` (وإغلاق `ReportConfirmModal` عند تحوّل الدور أو خروج الحالة عن `DRAWING` مع بقاء `ReportConfirmModal` متاحاً للمشاهدين أثناء `DRAWING`) في `ExperimentalGameRoom.tsx` دون استدعاء `handleSkipTurn()` أو إرسال `skip_turn`.
       - إغلاق `activeMenu` و`CLEAN` (`showClearConfirm`) و`NAMES` (`showFloatingNamesConfirm`) وإرجاع `pipette` إلى `previousTool.current || 'pencil'` عند تحول `readOnly` من `false` إلى `true` في `ExperimentalDrawingBoard.tsx` (للرسم التنافسي والحر مع الحفاظ على التفضيلات المحفوظة وعدم لمس `DrawingCanvasCore.tsx`).
       - تمرير `readOnly` إلى `FlipaClipControls.tsx` مع إبقائه مثبّتاً في DOM لتنظيف `isColorPickerOpen` ومستمعات المؤشر وطلبات `requestAnimationFrame` والقيم المعلقة و`dragState` عند التوقف عن الرسم.
       - إلغاء عمل `RAF` والقيم المعلقة ومؤشرات السحب عند إغلاق `ColorWheelModal.tsx` خارجياً دون تمرير تحديثات متأخرة ودون مسح `savedPalette`.
   - **المهام المتبقية من `L10N-7` (ما زالت `PENDING` للدفعة القادمة):**
     - توطين التلميحات (`title`/`aria-label`) والأزرار المتبقية في `ExperimentalDrawingBoard.tsx` و`FlipaClipControls.tsx`.
     - توطين تسمية `Empty` في `PlayersSidebar.tsx` و`FreeDrawPlayersList.tsx` (إن لزم)، وتلميحات/أزرار الغرفة المتبقية (`الخروج من الغرفة`, `الدردشة`, `Report drawing`, `You reported this draw`, `ابدأ الرسم`/`انضم للرسم`/`العودة للرسم`) في `GameRoom.tsx` و`ExperimentalGameRoom.tsx`، ورسالة `beforeunload`، و`src/ErrorBoundary.tsx`.
5. **الملفات المسموحة للدفعة الحالية واللاحقة:**
   - `src/components/experimental/ExperimentalDrawingBoard.tsx`
   - `src/components/game/FlipaClipControls.tsx`
   - `src/components/game/ColorWheelModal.tsx` (تعديل دورة حياة مصرح به في `Stage 2A`)
   - `src/components/game/PlayersSidebar.tsx`
   - `src/components/game/FreeDrawPlayersList.tsx` (للمهام المتبقية فقط؛ محظور في `Stage 2A`)
   - `src/components/GameRoom.tsx` (للمهام المتبقية فقط؛ محظور في `Stage 2A`) و`src/components/experimental/ExperimentalGameRoom.tsx`
   - `src/ErrorBoundary.tsx` (للمهام المتبقية فقط)
   - `src/i18n/locales/*`
6. **الملفات المحظورة:** `src/components/game/DrawingCanvasCore.tsx`, `src/utils/canvasFloodFill.ts`, `src/utils/canvasCheckpointManager.ts`, `src/components/experimental/IsolatedDrawingLayer.tsx`, `server/*`, `src/types/game.ts`, `AGENTS.md`.
7. **الآليات المحمية:**
   - **Safeguard 7 & 8:** الإبقاء الصارم على `dir="ltr"` على `ExperimentalDrawingBoard` و`FlipaClipControls` وشبكة الغرفة و`SmoothTimer`، وثبات `IsolatedDrawingLayer` و`key="isolated-shared-board"`.
   - **`UI-B Stage B2` & `UI-C Stage 2A`:** عدم تغيير أبعاد `aspect-[680/396]` أو بنية `flex items-center min-w-0 max-w-full` في `PlayersSidebar.tsx` و`FreeDrawPlayersList.tsx`.
   - بقاء `CLEAN` و`NAMES` و`SKIP` كعناوين `GameTitle` بالإنجليزية.
8. **التعديلات الدقيقة المتبقية بعد `Stage 2A`:** ترجمة `Empty`, التلميحات والأوصاف والأزرار في `ExperimentalDrawingBoard` و`FlipaClipControls`، وأزرار الرسم الحر وتلميحات الغرفة ورسالة `beforeunload` و`ErrorBoundary`.
9. **المخاطر:** اتساع شارة النقاط في `PlayersSidebar` على الشاشات الضيقة، أو أي انزياح عرضي في شريط أدوات الرسم (محمي بـ `dir="ltr"`).
10. **معايير الخروج:** اكتمال توطين 100% من نصوص واجهة اللاعبين في جميع الأوضاع الثلاثة مع ثبات تام لهندسة الرسم وقائمة اللاعبين وموافقة المالك اليدوية.
11. **الاختبارات:** `npx tsc --noEmit` + `npm run lint` + `npm run build` + فحص تكافؤ القواميس + اختبارات المالك اليدوية الكاملة.
12. **الاعتماديات:** `L10N-6`.

---

### المرحلة `L10N-8` — التدقيق النهائي لضمان الجودة والإغلاق (`Final Localization QA`)
1. **الاسم والرقم:** `PHASE L10N-8 — Final Localization QA`
2. **الهدف:** تدقيق شامل لجميع النصوص، مطابقة 100% لمفاتيح `ar` و`en`، فحص الترجمات الناقصة، واختبار `Auto` و`AR` و`EN` وغرف اللغات المختلطة والاتجاهات، ثم الاعتماد النهائي وإغلاق المسار.
3. **الملفات المسموحة:** ملفات القواميس `src/i18n/locales/*` (لتصحيح أي مفتاح ناقص أو صياغة لغوية)، وأي إصلاح نصي/اتجاهي طفيف يثبت احتياجه في المراجعة الأخيرة (مع توثيق أي ملف إضافي وموافقة المالك)، وتحديث `LOCALIZATION_ROADMAP.md` و`REFACTORING_ROADMAP.md` لإغلاق `PHASE L10N`.
4. **الملفات المحظورة:** `src/components/game/DrawingCanvasCore.tsx`, `server/registerDrawBinaryHandler.ts`, `server/data/wordsDictionary.ts`, `server/utils/arabicFuzzyMatch.ts`, `AGENTS.md`.
5. **الآليات المحمية:** كامل ثوابت `AGENTS.md` و`UI-A/B/C` وSafeguards 1–9.
6. **التعديلات الدقيقة:** مقارنة شاملة لمفاتيح `ar` مقابل `en`، فحص وجود أي نصوص hardcoded متبقية، التحقق من حجم الحزمة الفعلي مقارنة بالتقدير الأولي، وتحديث الوثائق بالحالة النهائية `COMPLETED`.
7. **المخاطر:** بقاء نص يتيم في مسار نادر أو عدم تطابق صيغة جمع عربية.
8. **معايير الخروج:** صفر مفاتيح مفقودة، تطابق كامل بين `ar` و`en`، اجتياز `npx tsc --noEmit` و`npm run build`، وموافقة مالك المشروع النهائية بعد الاختبار الكامل.
9. **الاختبارات:** فحص تكافؤ المفاتيح + `npx tsc --noEmit` + `npm run build` + اختبار المالك النهائي (`Auto`, `AR`, `EN`، لاعبين بلغتين مختلفتين داخل الغرفة الواحدة، النصوص المختلطة، إعادة الاتصال، الوضع التنافسي والرسم الحر).
10. **الاعتماديات:** `L10N-7`.

---

## 8. الحالة المباشرة للمرحلة الحالية (`L10N-6 — COMPLETED`, `L10N-7 Stage 2A — IMPLEMENTED / AWAITING MANUAL VERIFICATION`)

> أُغلقت **`L10N-6`** بعد التحقق اليدوي الناجح من المالك (`2026-11-24` — Commit: `a749950a390401175184ad3253aa02f0ee2de6cb`)، ونُفذت **`L10N-7 Stage 2A`** وهي الآن بحالة **`IMPLEMENTED — AWAITING OWNER MANUAL VERIFICATION`** (`2026-11-24` — مرجع التنفيذ النهائي بانتظار مزامنة المالك)، مع إبقاء بقية مهام **`L10N-7`** معلّقةً للمرحلة اللاحقة:

- **ملخص ما تم تنفيذه في `L10N-7 Stage 2A`:**
  1. إضافة مفتاح `common:units.points` (`{{count}} pts` / `{{count}} نقطة` الثابتة دون صيغ جمع) وتطبيقه في `PlayersSidebar.tsx` مع الحفاظ على الترتيب الفيزيائي LTR وإبقاء `FreeDrawPlayersList.tsx` دون عرض نقاط.
  2. إغلاق الدردشة تلقائياً عبر `closeChat()` عند دخول `isDrawingMode` تحت `FULL_DRAWING_ISOLATION_TEST` في `ExperimentalGameRoom.tsx` لضمان ظهور زر الخروج `X` ومزامنة `isChatOpenRef` وفصل لوحة المفاتيح.
  3. الإغلاق التلقائي الآمن لنوافذ وقوائم الرسم المؤقتة عند انتهاء الدور (`SkipConfirmModal`, `ReportConfirmModal`, `activeMenu`, `CLEAN`, `NAMES`, أداة `pipette`, `FlipaClipControls`, و`ColorWheelModal`) مع تنظيف مستمعات المؤشر و`RAF` دون مسح اللوحة أو إرسال `skip_turn` أو المساس بالتفضيلات المحفوظة.
- **المتبقي قبل إغلاق `L10N-7` بالكامل:** التحقق اليدوي من المالك لـ `Stage 2A`، ثم استكمال توطين التلميحات والأزرار المتبقية في `ExperimentalDrawingBoard.tsx` و`FlipaClipControls.tsx` و`PlayersSidebar.tsx` (`Empty`) و`GameRoom.tsx`/`ExperimentalGameRoom.tsx` و`beforeunload` و`ErrorBoundary.tsx`.

---

## 9. قواعد تحديث خارطة الطريق وحوكمة الوثائق الإلزامية (`Roadmap Update & Documentation Governance Rules`)

يجب الالتزام بهذه القواعد الإلزامية في كل دفعة قادمة من مسار `PHASE L10N`:

1. **التأريخ والتوثيق الدقيق فور الإغلاق:** عند اكتمال أي مرحلة واعتمادها يدوياً من المالك، تُحدّث حالتها إلى `[x] COMPLETED` في هذه الخارطة فوراً مع تاريخ الإنجاز الدقيق والمرجع المعتمد (Commit / Verification Reference).
2. **حظر حذف المراحل:** لا تُحذف أي مرحلة من هذا الملف حتى بعد اكتمالها؛ تبقى جميع المراحل موثقة لتكوّن السجل الكامل للمشروع.
3. **الإضافة المنضبطة للاكتشافات الجديدة:** إذا كُشفت تفاصيل أو نصوص أو إصلاحات جديدة أثناء التنفيذ، تُسجّل أو تُضاف كمرحلة فرعية واضحة دون كسر التسلسل المعتمد (`L10N-0` إلى `L10N-8`).
4. **وضوح المراحل المتبقية:** يجب أن يُظهر الملف دائماً وبدقة ما اكتمل وما هو قيد المراجعة وما هي المرحلة التالية والمراحل المتبقية بالتحديد.
5. **الفصل بين سجل العمارة وخارطة التدويل:** يوثّق [`UI_MODAL_REGISTRY.md`](./UI_MODAL_REGISTRY.md) معمارية النوافذ المنبثقة والطبقات التفاعلية في الواجهة (ويُحدّث عند إضافة أو حذف أو تعديل بنية أي نافذة منبثقة)، بينما يظل `LOCALIZATION_ROADMAP.md` السجل المرجعي لتتبع مراحل التدويل.
6. **تحديث قسم آليات الحماية ومطابقة الكود الفعلي:** يجب أن تظل جميع المسارات البرمجية ووصف السلوك والقيود في الوثائق مستندةً حرفياً إلى الكود الفعلي، مع إضافة أي آلية حماية إضافية لاتجاه النص (`BiDi`) أو الدردشة أو الرسم إلى القسم `3` فور اكتشافها.
7. **بوابات التحقق البرمجي الإلزامية:** في كل مرحلة تعديل كود، يجب تنفيذ واجتياز `npx tsc --noEmit` و`npm run build` وتوثيق نتائجهما قبل الانتقال أو الاعتماد.
8. **التحقق اليدوي من المالك قبل الإغلاق:** لا تُعلَم أي مرحلة مرئية أو تفاعلية كـ `COMPLETED` إلا بعد اختبار المالك يدوياً على المتصفح والهاتف وموافقته على سلامة التجربة.
9. **تنفيذ مرحلة واحدة فقط وحظر دمج المراحل:** تُنفذ مرحلة واحدة فقط في كل دفعة برمجية، ولا تُنقل ترجمة أي قسم إلى مرحلة سابقة أو لاحقة.
10. **الانضباط الصارم بنطاق الملفات وحماية الثوابت:** لا يُسمح لأي مرحلة بتعديل ملفات خارج قائمة ملفاتها المسموحة دون تبرير تقني واضح وتوثيق موافقة مالك المشروع، مع الالتزام الصارم بـ [`AGENTS.md`](./AGENTS.md) و[`REFACTORING_ROADMAP.md`](./REFACTORING_ROADMAP.md).
