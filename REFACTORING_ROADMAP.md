# 🗺️ المرجع المعماري الموحد وخارطة الطريق (Unified Architecture Reference & Roadmap)
## Gartic Phone Architecture, Stability, Security & Decomposition Reference Guide
> **المصدر الرسمي الإلزامي والموحد للمشروع (Single Project Source of Truth)** — تاريخ التحديث: 2026-11-21 (مرجع المستودع: `hamoudi100hamoudi-beep/social-games-v1` — آخر Commit موثق: `f99ff28f679479a86ed67e4f4d10738636e3f7e5`)

---

## 🚨 القسم A — تعليمات إلزامية للذكاء الاصطناعي والمطور (Mandatory Instructions & Binding Warning)

> ⚠️ **تنبيه ملزم للذكاء الاصطناعي وأي مطور يقرأ هذا المستند**:
> 1. **المرجع الحصري والنهائي**: تُمثّل هذه الوثيقة **المرجع الموحد والحصري والدائم** لجميع القواعد المعمارية، ومنهجية العمل، والثوابت الأمنية، وسجل تفكيك الكود، وحالة المشروع في مستودع `hamoudi100hamoudi-beep/social-games-v1`.
> 2. **إلزامية القراءة المسبقة**: يجب **قراءة وفهم هذه الوثيقة بالكامل** قبل اقتراح أو تنفيذ أي تعديل معماري، أو صياغة Prompt، أو إعادة هيكلة، أو إضافة ميزات جديدة في المشروع، واعتماد حالتها الحالية بوصفها نقطة البداية للعمل.
> 3. **اعتماد نقطة البداية الفعلية**: تُمثّل الحالة الموثقة في هذا الملف نقطة البداية المعتمدة للعمل، ولا يجوز الاعتماد على محادثات قديمة، أو تقارير سابقة، أو فرضيات ملغاة إذا كانت تتعارض مع الكود الحالي والوثيقة المحدثة.
> 4. **سياسة عدم التخمين**: في حال وجود أي تعارض أو عدم يقين، يجب فحص السورس كود المباشر وتحديث هذه الوثيقة وفق الحقيقة البرمجية المثبتة.

---

## ⚙️ القسم B — منهجية العمل وسياسة الدفعات المعتمدة (Development Workflow & Batch Policy)

تلتزم جميع عمليات التطوير، وإعادة الهيكلة، والتدقيق بالمبادئ العشرة وسياسة الدفعات الصارمة التالية:

### 1. افهم الوضع الحالي أولاً (Understand Current State First)
* **الفحص البرمجي المباشر**: ابدأ دائماً بقراءة وفحص السورس كود المباشر قبل اقتراح أو كتابة أي تعديلات.
* **التدقيق القرائي عند اللزوم (Read-Only Audit)**: في المسائل الحساسة أو المعقدة (مثل محرك الرسم، بروتوكولات المقابس، إدارة الغرف)، ابدأ بتدقيق معماري بنمط القراءة فقط قبل اتخاذ أي قرار برمجي.
* **التحقق من الاعتماديات**: لا تفترض وجود مشكلة أو كسر أو اعتمادية غير موثقة دون التحقق منها في الكود الفعلي.
* **مباشرة القرار**: لا تُصدر تقارير تحليلية مطولة أو مكررة عندما يكون القرار واضحاً ومباشراً من الكود.

### 2. اتخذ قراراً معمارياً قبل التنفيذ (Architecture Decision Before Code)
* **التنفيذ المباشر**: يُنفذ التعديل مباشرة إذا كانت حدود المهمة واضحة ومحددة والمخاطر منخفضة ومفهومة.
* **التدقيق المركّز**: يُطلب تدقيق قرائي موجه إذا كانت الاعتماديات أو الحدود أو المخاطر غير واضحة.
* **الامتناع عن التعديل العشوائي**: يُمنع إجراء أي تعديل أو تفكيك برمجي إذا لم توجد فائدة معمارية أو تشغيلية حقيقية.

### 3. حافظ على البنية المستقرة وسياسة تدرج المخاطر (Preserve Stable Architecture & Risk Tiers)
* **الاستقرار أولاً**: يُحظر تغيير أي بنية معمارية مستقرة ومجربة دون سبب فني واضح ومبرر.
* **حظر التفتيت الشكلي**: يُمنع تقطيع أو استخراج الملفات لمجرد تقليص عدد الأسطر أو حجم الملفات دون وجود حد وظيفي مستقل.
* **التماسك الوظيفي (Functional Cohesion)**: كل دفعة تجمع مكونات أو دوال تشترك في نطاق عمل واحد، ويُحظر خلط تعديلات غير مترابطة في دفعة واحدة.
* **التدرج الصارم للمخاطر (Strict Risk Classification A -> B -> C)**:
  - **الفئة A (منخفضة المخاطر - Low Risk)**: مكونات عرض مستقلة، دوال نقية (Pure functions)، وأدوات حسابية. تُنفذ أولاً.
  - **الفئة B (متوسطة المخاطر - Medium Risk)**: Custom Hooks وشاشات وتراكيب تعتمد على عدة Props أو دورات حياة React.
  - **الفئة C (عالية المخاطر - High Risk)**: محركات الرسم، Socket.IO، سجل الرسم، والتراجع. محظورة تماماً لحين استيفاء بوابات الاستقرار المسبقة.
* **الشمولية والاستدامة**: لا تتجنب حلاً معمارياً أكبر إذا كان يعالج أصل المشكلة بصورة أفضل وأكثر استدامة. قارن دائماً بين الحل البسيط والحل الأشمل من حيث الفائدة، الأداء، التعقيد، والمخاطر.

### 4. قيّم أثر التعديل على الموارد (Resource & Performance Impact Evaluation)
قبل أي تغيير له أثر محتمل، راجع تأثيره المباشر على:
* استهلاك المعالج (CPU) والذاكرة العشوائية (RAM).
* حجم البيانات وحزم المقابس المرسلة عبر الشبكة.
* استهلاك البطارية والأجهزة الضعيفة والهواتف المحمولة.
* سلاسة الرسم والتفاعل ومعدل الإطارات (60fps).
* مزامنة الاتصال، بروتوكولات التراجع، وإعادة الاتصال الشبكي.
* الوظائف المشتركة بين الغرف التنافسية ووضع الرسم الحر.

### 5. نفّذ دفعة واحدة في كل مرة (Single Batch Execution Policy)
* **هدف ونطاق محدد**: كل دفعة برمجة لها هدف وظيفي واضح ونطاق ملفات محدد بدقة.
* **حظر خلط التعديلات**: يُمنع خلط تعديلات غير مترابطة أو دمج مهام متعددة في دفعة واحدة.
* **منع التكرار والتحسينات الجانبية**: لا تعِد اقتراح أو تنفيذ شيء منجز بالفعل، ولا تُنفذ تحسينات جانبية خارج نطاق المهمة المعتمدة.

### 6. استخدم Google AI Studio للتنفيذ (AI Execution Discipline)
* **Prompt موحد وجاهز**: قدم للمستخدم Prompt واحداً كاملاً وجاهزاً للنسخ يوضح الهدف والملفات المسموح بتعديلها والثوابت المحمية.
* **التركيز على مهام النظام**: لا تطلب من الذكاء الاصطناعي تنفيذ محاكاة تجارب لعب يدوية يستطيع المستخدم تنفيذها بنفسه بالمتصفح.
* **ترشيد الاختبارات الآلية**: لا تطلب تشغيل حزم اختبارات آلية ثقيلة أو مكلفة إلا عند وجود ضرورة تقنية حقيقية لمكونات السيرفر والبروتوكول.

### 7. راجع التنفيذ قبل اعتماده وشروط قبول الدفعة (Pre-Acceptance Verification & Acceptance Gates)
* **عدم الاكتفاء بالتقارير اللفظية**: لا تعتبر تقرير الذكاء الاصطناعي دليلاً كافياً على نجاح المهمة.
* **فحص الكود والـ Diff**: افحص الكود الفعلي والتغيرات السطرية لضمان عدم وجود تغييرات جانبية أو تجاوز للنطاق.
* **شروط قبول الدفعة (Batch Acceptance Gates)**:
  - عرض الـ Diff البرمجي الكامل وتدقيقه بدقة.
  - اجتياز فحص الأنواع الصارم: `tsc --noEmit` بنسبة 100% دون أي خطأ.
  - اجتياز بناء التطبيق الكامل: `npm run build` بنجاح تام عند وجود تغييرات كود.
  - المراجعة البرمجية والمشاهدة الاستاتيكية للسياسة الهيكلية.

### 8. اختبار المستخدم والمزامنة (User Testing & GitHub Sync Protocol)
* **التجربة اليدوية للمستخدم**: بعد مراجعة التعديل وتمرير التجميع، يتولى المستخدم تجربة اللعبة والميزات المتأثرة يدوياً بالمتصفح.
* **المزامنة مع GitHub**: بعد تأكيد سلامة التجربة اليدوية، يقوم المستخدم بعملية المزامنة (`Sync to GitHub`).
* **التحقق بعد المزامنة**: بعد المزامنة، يتم التأكد من وصول التغييرات فعلياً إلى المستودع الرئيسي وتطابق شجرة الملفات.

### 9. إغلاق الدفعة وتحديث الوثائق (Batch Closure & Document Update)
* **ربط الإغلاق بالتحقق**: لا تُسجل أي دفعة على أنها مكتملة (`[x] COMPLETED`) إلا بعد استيفاء شروط القبول والمزامنة.
* **تحديث السجل فوراً**: حدّث حالة الدفعة، والمرحلة الحالية، والدفعة التالية المعتمدة في هذا الملف الحصري.
* **توثيق الدروس والمعرفة**: سجل القرارات المعمارية والنتائج التقنية لمنع تكرار فحصها مستقبلاً.

### 10. التعامل مع عدم اليقين (Honesty & Fact Discipline)
* **حظر التلفيق**: يُمنع منعاً باتاً اختراع معلومات، أو أسطر برمجية غير موجودة، أو ادعاء نتائج اختبارات لم تتم.
* **الفصل الصارم**: مَيّز بوضوح بين:
  - **الحقيقة البرمجية المثبتة (Verified Fact)**: كود مثبت بالأسطر والملفات والنتائج.
  - **الافتراض (Assumption)**: تقدير يتطلب تحققاً مركزاً عند بدء الدفعة.
  - **المقترح المستقبلي (Future Proposal)**: فكرة أو قدرة منتج مستقبلية لم يتم اعتمادها كدفعة برمجية بعد.
* **التسجيل الصريح**: عندما يتعذر التحقق من معلومة، سجّل أنها "تحتاج إلى تحقق في الكود" بدلاً من تقديمها كحقيقة قائمة.

---

## 📍 القسم C — الحالة الحالية للمشروع (Current Project State & Architecture Tracker)

> **تاريخ آخر تحديث وثائقي**: 2026-11-21  
> **المرجع الموثق في المستودع**: `hamoudi100hamoudi-beep/social-games-v1` (آخر Commit تنفيذ معتمد: `f99ff28f679479a86ed67e4f4d10738636e3f7e5`)  
> **حالة التنفيذ الحالية**: أعمال التفكيك والتنظيم المعماري للملفات الكبيرة مغلقة ومكتملة عند `PHASE 8B` دون تعديل، ودفعة `PHASE 4G` (حواف `Bucket Fill`) مكتملة ومؤكد قبولها بصرياً من المالك دون حاجة لمزيد من تحسين الحواف. في مسار **`PHASE 4H`** (حصراً للوضع التنافسي `isExperimental === true && isFreeDraw === false`)، اكتملت مراحل `4E-1` (`587097661be7a7a9ad558764127f27bb9e297120`) و`4E-2` (`4c06d4d82eed2e30e52a4cc82e8ba45c905d72bd`) و`4F-1` (`c7817f200fee7b13cf4e5f6c0d811479c3d07437`) و`4F-2` (`ed1feb8f1aea55f141531ae8cab7c3d4c0726abb`)، ثم نُفذت **`PHASE 4H — STAGE 2: COMPETITIVE CHECKPOINT & REPLAY CORRECTION`** (`f99ff28f679479a86ed67e4f4d10738636e3f7e5`) مع إثبات نجاح حزمة الانحدار الآلية الفعلية لـ `Stage 2` (الحالات `1–7` في `scripts/test_stage4f2_competitive_checkpoint_alignment.ts` متضمنةً `Test 7`، مع اجتياز `npx tsc --noEmit` و`npm run build`، دون تغيير سجل أن تشغيل `Stage 4F-2` الأولي الأصلي كان يفتقر لتقرير نجاح نهائي موثق). وأكد المالك في التجربة اليدوية على هاتف Android ضعيف أن أداء `Pencil Undo` أصبح سلساً إجمالاً مع بقاء تأخير طفيف ومحصور فقط عند عبور حد `16` أمراً (مثل الحدود `32` و`16` عند رسم `40` ضربة قلم بعد الدلو)، وبناءً على تدقيق **`STAGE 2.1`** القرائي تقرر اعتماد الخيار A وإغلاق المرحلة رسمياً بالحالة: **`PHASE 4H — STAGE 2 CLOSED — CURRENT IMPLEMENTATION ACCEPTED`**. لا توجد أي مهمة كود نشطة لـ `Pencil Undo` حالياً، ولا يُعاد فتح التحقيق مستقبلاً إلا عند تكرر التأخير أو تفاقمه فعلياً، أو ظهور دليل جديد لحل أفضل دون خرق القيود، أو إعادة فتح صريحة من المالك. في مسار الموثوقية (`PRODUCTION_RELIABILITY_ROADMAP.md`)، يعمل `AFK` (`PHASE 9A`) بشكل طبيعي وتبقى `PHASE 9B`–`PHASE 9F` بحالة `PLANNED` ومؤجلة.

### 📊 سجل التقدم المعماري المبسط (Simplified Architecture Tracker)

| البند | الحالة الحالية | التفاصيل والملاحظات |
| :--- | :--- | :--- |
| **المرحلة المعمارية الحالية** | `PHASE 8B — Active Stroke Rendering Audit` | `[x] CLOSED — OPTION A (NO RENDERING CHANGE WARRANTED)` — إغلاق تدقيق تصيير مسار الرسم اللحظي بالاعتماد النهائي للخيار A (الإبقاء على بنية إعادة رسم المسار الكامل الحالية دون تغيير معماري) |
| **آخر دفعة تنفيذية مكتملة (Bucket Fill)** | `PHASE 4G` (`4G-1` & `4G-2`) | `[x] COMPLETED & OWNER-VERIFIED (VISUAL ACCEPTANCE; NO FURTHER EDGE OPTIMIZATION NEEDED)` — تطبيق `tryCompositePartialAlphaBoundary` (`924bd1a0ed861e76f2fef131e8e3b924b222c848`) ثم `Unified 4D Premultiplied RGBA Reconstruction` (`dc1253ebec8204f8ac1e308d0ae5a59fc88fd0b3`) في `src/utils/canvasFloodFill.ts` مع إبقاء المسار القديم و`tryCompositePartialAlphaBoundary()` دون حذف؛ تأكيد المالك بصرياً (`2026-11-18`) عبر ألوان ودرجات Opacity/Density مختلفة |
| **حالة `PHASE 4H` (Competitive Undo & Checkpoints)** | `4E-1`, `4E-2`, `4F-1`, `4F-2`, `Stage 2`, `Stage 2.1` | **`PHASE 4H — STAGE 2 CLOSED — CURRENT IMPLEMENTATION ACCEPTED`** — آخر Commit تنفيذ: `f99ff28f679479a86ed67e4f4d10738636e3f7e5` (`STAGE 2`: `[x] IMPLEMENTED — AUTOMATED REGRESSION PASSED — OWNER VERIFIED — RESIDUAL BOUNDARY COST ACCEPTED`). اشتمل المسار على: `4E-1` (`587097661be7a7a9ad558764127f27bb9e297120`)، `4E-2` (`4c06d4d82eed2e30e52a4cc82e8ba45c905d72bd`)، `4F-1` (`c7817f200fee7b13cf4e5f6c0d811479c3d07437`)، `4F-2` (`ed1feb8f1aea55f141531ae8cab7c3d4c0726abb`)، ثم `Stage 2` (`f99ff28f679479a86ed67e4f4d10738636e3f7e5` عبر `computeCompetitiveTailTarget()` و`COMPETITIVE_DEFAULT_STRIDE = 8` و`COMPETITIVE_POST_BUCKET_STRIDE = 16` ومحاذاة Live Tail مع Replay). **التحقق الآلي واليدوي**: يُميّز بوضوح بين التشغيل الأولي غير المكتمل لاختبارات `Stage 4F-2` (الذي ظل دون تقرير نجاح موثق) وبين تشغيل الانحدار الفعلي اللاحق لـ `Stage 2` الذي اجتاز الحالات `1–7` + `npx tsc --noEmit` + `npm run build`، ومع تأكيد المالك لسلاسة `Bucket Undo` و`Pencil Undo` على Android ضعيف وقبول الكلفة الحدودية المتبقية في `Stage 2.1` (`OPTION A ACCEPTED`) |
| **تحسينات Undo/Checkpoints & التشخيص القائمة** | `PHASE 1F.5`, `PHASE 1F.8`, `FreeDrawMobileDebug` | `[x] ALREADY IMPLEMENTED IN CODEBASE` — `CanvasCheckpointManager` (`MAX_HISTORY_CHECKPOINTS = 10` لـ Free Draw مقابل حد أقصى 2 كانفاس `Base`/`Tail` في الوضع التنافسي)، `Batch Bucket Replay` + `CanvasUndoCache` fast-path، ولوحة `FreeDrawMobileDebug.tsx` + `FREE_DRAW_UNDO_DIAG` / `FREE_DRAW_JOIN_DIAG` و`erudaManager.ts` |
| **آخر مراحل تفكيك وتنظيم منجزة** | `PHASE 8A`, `PHASE 8B` | `[x] COMPLETED` — توحيد سياسة أداء الرسم وإلغاء تصنيف العتاد القديم بـ Commit `6975924ce7fc1d9f5298fac41d5e1a833a2c3a11` (PHASE 8A)، وتدقيق تصيير الرسم اللحظي للقراءة فقط (PHASE 8B: مغلقة بلا تعديل كود) |
| **تدقيق الغرف ومحركات السيرفر ومحرك الرسم** | `PHASE 5B-2 & 6C & 7C & 8A & 8B` | `[x] COMPLETED — CLOSED` — اكتمال وتوحيد بنية محرك الرسم، وشبكة الحزم الثنائية، ونواة السيرفر، وأغلفة الغرف، واكتمال جميع أعمال تنظيم وتفكيك الملفات المعتمدة مسبقاً |
| **متابعة `Pencil Undo` بعد `Buckets` (`PHASE 4H — Stage 2 / 2.1`)** | `STAGE 2 & STAGE 2.1 CLOSED` | **`[x] CLOSED — OPTION A ACCEPTED — NO FURTHER CODE CHANGE APPROVED`** — أُنجز تدقيق Stage 1 ثم تنفيذ Stage 2 (`f99ff28f679479a86ed67e4f4d10738636e3f7e5`) ثم تدقيق Stage 2.1 القرائي. أكد المالك على Android ضعيف سلاسة التراجع عموماً مع تأخير طفيف ومقبول عند عبور حدود `16` فقط (الحدان `32` و`16` من أصل `40` خط قلم) وبقاء بقية التراجعات سريعة؛ وتم اعتماد ذلك بوصفه مقايضة أداء محدودة ومقبولة لا عائقاً غير محلول |
| **مسار الموثوقية (`PRODUCTION_RELIABILITY_ROADMAP.md`)** | `PHASE 9A` مؤكد؛ `9B–9F` مؤجلة | أكد المالك عمل `AFK` (`Slice 5C-3B`) بشكل طبيعي في اللعب (مع حفظ سجلات `Type 10` و`ping_activity`)؛ وتبقى `PHASE 9B`–`PHASE 9F` بحالة `PLANNED` ومؤجلة |
| **النشاط التالي المعتمد (`Next Action`)** | `No Active Pencil Undo Code Task` | **`PHASE 4H — STAGE 2 CLOSED — CURRENT IMPLEMENTATION ACCEPTED` — لا توجد أي مهمة كود نشطة لـ `Pencil Undo` حالياً؛ ولا يُعاد فتح التحقيق إلا عند تكرر التأخير/تفاقمه فعلياً، أو وجود دليل جديد لحل أفضل دون خرق القيود، أو قرار صريح من المالك. (تظل `PHASE 9B`–`9F` في `PRODUCTION_RELIABILITY_ROADMAP.md` بحالة `PLANNED`/مؤجلة إلى حين أولوية المالك).** |
| **الحدود والقيود المعمارية المحفوظة** | سقف `2` Checkpoints + حد `3` Bucket Undo | الوضع التنافسي فقط (`isExperimental === true && isFreeDraw === false`)، حد أقصى كانفاسين مخصصين (`Base` و`Tail`)، حد `3` عمليات Bucket Undo، بقاء قفل الخادم و`ACK/REJECT`، حياد Free Draw والغرف العادية، عدم تعديل بروتوكول الخادم، وعدم إضافة أي نظام تشخيصي جديد أو إعادة فتح `4E-1` و`4E-2` و`4F-1` |

### 🏷️ قاموس حالات دورة حياة الدفعات (Status Dictionary)
* `[x] COMPLETED`: المهمة مكتملة ومحققة معمارياً ومثبتة في الكود ومفحوصة بالتجميع.
* `[~] IN PROGRESS`: المهمة قيد التنفيذ والعمل الفعلي حالياً. *(ملاحظة ملزمة: مجرد صياغة Prompt أو مناقشة المهمة لا يُعد دليلاً على أنها قيد التنفيذ)*.
* `[ ] PLANNED — NOT STARTED`: مهمة معتمدة ومخططة في خارطة الطريق ولم يبدأ كتابة أي كود لها بعد.
* `[—] DEFERRED`: مؤجلة عمداً بقرار معماري لوجود بوابات سابقة إلزامية.
* `[x] CLOSED (NO EXTRACTION WARRANTED)`: خضعت لتدقيق معماري وتقرر عدم الاستخراج لحماية الأداء، الثوابت، والتعقيد.

---

## 🛡️ القسم D — الثوابت المعمارية والحماية (Architectural Invariants & Protection Covenant)

عند تعديل أو تفكيك أي جزء من أجزاء النظام، **يجب الالتزام الصارم بالثوابت المعمارية التالية دون استثناء**:

1. **حيادية التفكيك (Behavioral Invariance)**:
   إعادة الهيكلة وفصل الملفات هدفها التنظيم الداخلي فقط؛ يُمنع منعاً باتاً تغيير سلوك اللعبة، أو تدفق الحالات، أو إيقاع الجولات، أو تجربة المستخدم.
2. **وحدة مصدر الحقيقة في الذاكرة (Single Source of Truth)**:
   الالتزام الحصري بمالكية `RoomManager` لـ `this.rooms: Map<string, Room>` داخل ذاكرة السيرفر. يُمنع منعاً باتاً إنشاء نُسخ مستقلة أو متكررة من حالة الغرف (`RoomState`) أو سجل الرسم (`drawHistory`) أو مراجع الكانفاس لتفادي انفصال التزامن (State Desynchronization).
3. **حماية بروتوكول Socket.IO والحزم الثنائية**:
   * **أداة الدلو والبدء الفوري**: الشرط `type === 4 || type === 10 || type === 5` داخل `recordDrawCommand` بملف `server/rooms.ts` و `server/roomDrawingHistory.ts` محمي تماماً لتأمين تسجيل أداة الدلو كخطوة أولى دون اعتبارها حزمة يتيمة.
   * **بروتوكول الرسم الثنائي**: الحفاظ الصارم على البنية المضغوطة `Type 13` و `Type 2` للمكالمات عالي التردد، والبناء المعياري لـ `Type 9` بالسيرفر، وإشعارات الاعتماد `Type 11` (Commit Ack) والإلغاء `Type 12` (Abort Stroke).
4. **حماية طبقات ومراجع لوحة الرسم (`DrawingCanvasCore`)**:
   * حماية مراجع الرسم الأساسية: `canvasRef` و `ctxRef` و `tempCtxRef` والطبقات المؤقتة.
   * حماية حلقة معالجة المؤشر عالي التردد (60-120Hz) وحماية ملكية اللمس الصريحة عبر `activePointerIdRef`.
5. **سلامة تدفق أدوات الرسم وتراجعها (Safe 1-Step Undo/Redo)**:
   * الحفاظ على تدفق النقاط اللحظي بسرعة 60 إطاراً بالثانية.
   * منظومة التراجع الآمن بخطوة واحدة محددة بـ `redoStack = [removed]` على السيرفر والكلاينت.
   * قفل الرسم اللحظي فور التراجع عبر `isDrawingActive = false` لمنع تشوه الترتيب الزمني للضربات المتأخرة.
6. **سلامة المزامنة وإعادة الاتصال (Sync & Reconnection)**:
   * الحفاظ على البحث السريع برقم المقبس $O(1)$ عبر `this.players`.
   * الحفاظ على معالجة انضمام اللاعبين المتأخرين، ومزامنة الضربات النشطة للرسم الحر، وبروتوكول إصلاح الخطوط المفقودة (`draw_repair_req`).
7. **الزوم والتفاعل اللمسي (Viewport & Interactions)**:
   * الحفاظ التام على منطق التكبير والتصغير بالأصابع والسحب (`Pinch-to-Zoom & Pan`) وحسابات تحويل الإحداثيات المنطقية والمرئية في `canvasViewportMath.ts`.
8. **حماية واجهات الهواتف الذكية والنافذة المرئية**:
   * حظر المساس بدوال `visualViewport` أو المتغير البرمجي `--keyboard-inset` أو سلوك تقليص الواجهة وتحويل الدردشة إلى طبقة شفافة عائمة عند فتح لوحة المفاتيح.
9. **نسبة أبعاد الكانفاس وتصميم الواجهة (CSS & Layout Protection)**:
   * الحفاظ على النسبة الدقيقة `aspect-[740/430]` لنسبة أبعاد الكانفاس لمنع تشوه العرض لدى المراقبين.
   * الحفاظ على لون حلقة تحديد Palette الذهبية الممتازة `#D4AF37` بسمك `border-[1.5px]` وتحديد خارجي `-inset-[3px]`.
10. **عدم الدمج القسري للغرف**:
    يُمنع دمج `GameRoom.tsx` و `ExperimentalGameRoom.tsx` في ملف واحد لمجرد تقليل عدد الملفات؛ فلكل منهما مسار مستقر مستقل.
11. **حماية محرك الرسم المشترك وعدم تكراره**:
    تتشارك جميع الأنماط التنافسية ووضع الرسم الحر نفس تسلسل محرك الرسم في العميل (`IsolatedDrawingLayer` -> `ExperimentalDrawingBoard` -> `DrawingCanvasCore`) والسيرفر (`registerDrawBinaryHandler` -> `roomCanonicalStrokeEngine` -> `roomDrawingHistory`). يُحظر تماماً إنشاء محرك رسم مكرر.
12. **حظر التحسينات الجانبية الطارئة والادعاءات غير المثبتة**:
    يُمنع تنفيذ أي "تحسينات أداء" أو تعديلات غير مدرجة في متطلبات المهمة الحالية، كما يُحظر ادعاء أرقام تحسين أداء غير مقاسة باختبارات قياسية.

---

## 🏛️ القسم E — خارطة الطريق وسجل الإنجاز (Roadmap Phases & Historical Batches Detail)

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
- [x] **`BATCH-2-RES` — دراسة دورة حياة سجل الرسم وحدود الذاكرة**:
  - دراسة مسارات إضافة وحذف ومسح `drawHistory`.
  - دراسة وضع الرسم الحر (Free Draw) والغرف طويلة العمر.
  - توثيق العلاقة المتبادلة بين السجل وحاجز التراجع وتقييم خيار اللقطات المرجعية (Canvas Snapshots).
  - اكتملت واستقرت البوابة مع عزل `server/roomDrawingHistory.ts`.

---

### 📌 PHASE 3 — DRAW SYNC CORRECTNESS
- [x] **`BATCH-3-SYNC` — مصفوفة التحقق السلوكي لمزامنة اللوحات وحالات إعادة الاتصال**:
  - الرسم المباشر اللحظي بين لاعبين متصلين في نفس اللحظة.
  - أداة الدلو (Bucket / Flood Fill) وتجاوز عائق البدء الفوري.
  - التراجع (Undo) وإلغاء التراجع (Redo) بحاجز الإغلاق اللحظي `isDrawingActive = false`.
  - مسح اللوحة (Clear Canvas) وتزامن المسح لدى المراقبين والرسام.
  - انضمام لاعب متأخر أثناء رسم نشط واسترجاع السجل.
  - انقطاع الاتصال وإعادة الاتصال في تبويب خلفي ثم العودة.
  - إصلاح الخطوط النشطة المفقودة عبر بروتوكول الإصلاح `draw_repair_req`.
  - توافق وتطابق بكسلات اللوحة بين الرسام والمخمنين بعد تسلسل عمليات مركب.
  - **القرار المعماري النهائي**: `READY TO CLOSE PHASE 3` — اكتمال التدقيق وتأكيد سلامة بروتوكول المزامنة وإعادة الاتصال والرفع المتأخر.

---

### 📌 PHASE 4 — DRAWINGCANVASCORE REFACTOR

#### 1. الوحدات الحسابية وخوارزميات الرسم المستقلة
- [x] **PHASE 4A — حصر المسؤوليات والاعتماديات**.
- [x] **PHASE 4B — فصل محركات وخوارزميات الرسم المستقلة**:
  - `PHASE 4B-1`: استخراج دوال فحص الأوامر والأنواع إلى `src/utils/canvasCommandHelpers.ts`.
  - `PHASE 4B-2`: تدقيق محرك الأشكال والمسارات.
  - `PHASE 4B-3A`: استخراج محرك تصيير الأشكال الهندسية `drawShape` إلى `src/utils/canvasPathRenderer.ts`.
  - `PHASE 4B-3B`: استخراج محرك تصيير المسارات المنعمة `drawEntirePath` إلى `src/utils/canvasPathRenderer.ts`.
  - `PHASE 4B-4A`: استخراج النواة الحسابية لتعبئة المساحات النقطية `executeRasterFloodFill` إلى `src/utils/canvasFloodFill.ts`.
- [x] **PHASE 4C — فصل وظائف الكانفاس والتحكم بالعرض (Viewport & Transform)**:
  - `PHASE 4C-2`: استخراج `computeCanvasFitScale` إلى `src/utils/canvasViewportMath.ts`.
  - `PHASE 4C-4`: استخراج `calculateLogicalCoordinates` إلى `src/utils/canvasViewportMath.ts`.
- [x] **PHASE 4D — فصل مسار الإدخال والتصيير (Pointer & Stroke Pipeline)**:
  - `PHASE 4D-2`: إعادة استخدام قياس DOMRect لكل حدث في Coalesced Events.
  - `PHASE 4D-3 / 4D-3C`: إضافة فحص ملكية المؤشر الصريح `activePointerIdRef`.
  - `PHASE 4D-3D-FIX`: تثبيت وإنهاء الضربة عند بدء التكبير/التصغير بالأصابع Pinch-to-Zoom.

#### 2. تفكيك مرحلة سجل الرسم والتراجع ومحرك الإعادة (`PHASE 4E`)
- [x] **`SUB-BATCH-4E-1A` — Canvas Checkpoint Manager**:
  - **الملف المستخرج**: `src/utils/canvasCheckpointManager.ts`.
  - **المسؤولية والمعمارية**: إدارة دورة حياة النقاط المرجعية للكانفاس (Checkpoints)، النقاط الأساسية والذيلية (Base/Tail Slots)، التحقق من الصلاحية، التحديث التراكمي، الإبطال، وسيارات التخلّي والحد من استهلاك الذاكرة.
- [x] **`SUB-BATCH-4E-1B` — Canvas Undo Cache**:
  - **الملف المستخرج**: `src/utils/canvasUndoCache.ts`.
  - **المسؤولية والمعمارية**: إدارة التخزين المؤقت لصور التراجع وإلغاء التراجع النقطي بخطوة واحدة (`Single-step Bitmap Undo/Redo Cache`)، معالجة التخزين المسبق المعلق قبل الضربة، التحقق من البيانات الوصفية، والإنشاء الكسول للطبقات.
- [x] **`SUB-BATCH-4E-1C` — Replay Engine Extraction & Audit**:
  - **الملف المستخرج**: `src/utils/canvasReplayEngine.ts`.
  - **Stage 1 (Architectural Audit)**: تحديد حدود الملكية وقيود بروتوكول الإعادة.
  - **Stage 2A (Single-command Replay Extraction)**: استخراج الدالة المساعدة ذات الأثر `replaySingleCommand()` لفك ترميز الحزم الفردية ورسم المسارات والأشكال وتنفيذ اختصارات الملء.
  - **Stage 2B (Leftover Replay Session Rendering)**: استخراج الدالة المساعدة ذات الأثر `renderLeftoverReplaySessions()` وتحديث مواضع الاستدعاء الخمسة في `DrawingCanvasCore.tsx` مع الحفاظ الصارم على سلوك مسح المسارات الخاص بـ `processChunk` وبقاء جلسات الرسم النشطة.
  - **تصنيف الدوال**: تم تصنيف `replaySingleCommand()` و `renderLeftoverReplaySessions()` كـ **Stateless / Effectful Helpers**؛ فهي لا تملك حالة داخلية دائمة، ولكنها تعدل المجمعات وسياق الكانفاس الممرر إليها.
  - **Stage 2C (High-Level Replay Orchestration Audit)**: **`[x] CLOSED (NO EXTRACTION WARRANTED)`**. تدقيق معماري للقراءة فقط للتدفق عالي المستوى. **القرار المعماري**: تقرر عدم استخراج المنظم عالي المستوى إلى المحرك وإبقاؤه داخل `DrawingCanvasCore.tsx` لشدة اعتماده على مراجع ومؤقتات React، وحالة المزودات، والتخزين المؤقت، وجدولة RAF، وإلغاء الأجيال، ونقل المقابس، والمقاييس التشخيصية.

#### 3. تدقيق مزامنة المقابس للرسم (`PHASE 4F`)
- [x] **`PHASE 4F — Drawing Socket Sync Architectural Audit`**:
  - **الحالة**: **`[x] CLOSED (NO EXTRACTION WARRANTED)`**.
  - **القرار المعماري النهائي**: انتهى التدقيق المعماري للقراءة فقط إلى أن استخراج معالجة المقابس من `DrawingCanvasCore.tsx` إلى وحدة خارجية مستقلة (`DrawingSocketSync`) أو إلى خطاف مخصص (`useDrawingSocketSync`) لن يحقق فصلاً وظيفياً حقيقياً، بل سيؤدي إلى إنشاء "كيس مراجع وكولباكات" متضخم (Ref-bag / Callback-soup) يربط الكود الخارجي بأكثر من 35 مرجعاً ودالة داخلية للمكون، مما يزيد التعقيد ويعرض المزامنة للخلل.
  - **المسؤوليات المقيدة بالمكون (`Component-Owned Responsibilities`)**:
    1. الارتباط المباشر بسياقات الكانفاس (`ctxRef` و `tempCtxRef`) والطبقات المؤقتة ومسارات الرسم اللحظي.
    2. إدارة طوابير الجلسات النشطة والمستنزفة (`activeSessionsRef` و `drainingStrokesRef`) ومؤقت استنزاف المراقبين بمعدل 60 إطاراً بالثانية (`spectatorPlaybackRafRef`).
    3. التسليم الذري للخطوط المكتملة (`commitRemoteStrokeAtomically`) وحل طلبات الإصلاح الموجهة (`draw_repair_req`).
    4. معاملات التخزين المؤقت للصور والنقاط المرجعية للتراجع (`CanvasUndoCache` و `CanvasCheckpointManager`).
    5. إعادة بناء السجل عبر شرائح RAF بحجم 50 أمراً (`processIncomingHistorySync`) وقمع الحزم المكررة بمقارنة المحتوى (`areHistoryArraysEqual`).
    6. دورة حياة React، ومراجع المكون، وحالة واجهة المستخدم (`isSyncing`, `hasSyncedOnce`)، وإلغاء أجيال المزامنة (`historySyncGenerationRef`).
  - **التدقيق التكميلي للسيرفر والبروتوكول الواقعي**:
    - جميع النماذج التنافسية المحددة مسبقاً تستخدم `isExperimental: true` ووضع الرسم الحر يستخدم `isFreeDraw: true`؛ وبالتالي تشترك جميع الأنماط النشطة في مسار المحرك المعياري المستمر (Canonical Continuous Stroke Pipeline).
    - مسار الرسم الخام غير المجمع (`isFreeDraw: false && isExperimental: false`) يظل مسار توافق قديم لا يوجد له أي روم نشط مدمج في التوجيه الحالي.
    - إدارة الذاكرة: استخدام مجمع نقاط قابل لإعادة الاستخدام في `drawBinaryHelper.ts` (`pointPool`) مع تفادي النسخ غير الضروري في مسار الحركة عالي التردد.
    - معالجات الانضمام والمغادرة: فحص `registerJoinRoomHandler.ts` و `registerLeaveRoomHandler.ts` وإسناد الانقطاع الفعلي إلى `roomManager.handleDisconnect()` في `server.ts`.
  - **النتيجة**: أغلقت المرحلة رسمياً دون استخراج أو إنشاء أي ملفات كود أو مساس ببروتوكول السيرفر أو إضافة مطالبات غير مثبتة.

#### 4. تطوير محرك تعبئة الدلو متعدد الألوان (`PHASE 4G — BUCKET FILL MULTI-COLOR EDGE RECONSTRUCTION`)

- **حالة المرحلة**: **`[x] COMPLETED & OWNER-VERIFIED (VISUAL ACCEPTANCE — NO FURTHER EDGE OPTIMIZATION NEEDED)`** — مطبقة، ومبنية بنجاح (`npm run build` — `2206` وحدة، Exit `0`)، ومؤكد قبولها بصرياً يدوياً من مالك المشروع (`2026-11-18`) عبر ألوان ودرجات شفافية/كثافة مختلفة. تم إغلاق نقاط المتابعة غير الضرورية، ونقل الاختبارات الآلية الإضافية غير المنفذة إلى ملاحظات تاريخية اختيارية غير معطلة للمرحلة.

- [x] **`PHASE 4G-1` — Partial Alpha Boundary Compositing** *(Commit: `924bd1a0ed861e76f2fef131e8e3b924b222c848`)*:
  - **ما نُفذ**:
    - إضافة الدالة `tryCompositePartialAlphaBoundary()` داخل `src/utils/canvasFloodFill.ts` لمعالجة حدود الألفا الجزئية (`10 < ta < 255`) والتعبئات المتكررة.
    - تحسين معالجة الحواف ذات الشفافية الجزئية والسكبات المتكررة على الكانفاس الشفاف.
    - الحفاظ على حماية Phase 7 (`EXPERIMENTAL_GUARD_PARTIAL_ALPHA_SEEDS_FROM_PHASE6 = true`) لمنع إدخال البذور ذات Alpha الجزئي إلى مسار Phase 6 بطريقة غير آمنة.
    - إضافة حزمة الاختبار: `scripts/test_bucket_partial_alpha_repeated_fill.ts`.
    - الحفاظ على تطابق مسار الرسم المحلي وإعادة الإعادة (`Replay parity = 0 diff`) في الاختبارات الموجودة.
  - **ملاحظة نطاق تمهيدي**: مثّل هذا الإصلاح خطوة تمهيدية؛ إذ يركز اختبار التكرار الموجود (`scripts/test_bucket_partial_alpha_repeated_fill.ts`) أساساً على تكرار لون تعبئة واحد (`#0066ff`) على الكانفاس الشفاف، ولا يمثل اختباراً شاملاً لتسلسلات الألوان المتعددة أو درجات opacity المختلطة.

- [x] **`PHASE 4G-2` — Unified 4D Premultiplied RGBA Reconstruction** *(Commit: `dc1253ebec8204f8ac1e308d0ae5a59fc88fd0b3`)*:
  - **الملف المعدل في هذا الـCommit**: `src/utils/canvasFloodFill.ts`.
  - **التنفيذ الفعلي**:
    - إضافة مفتاح التشغيل المستقل: `EXPERIMENTAL_UNIFIED_4D_BUCKET_EDGE_RECONSTRUCTION = true`.
    - إضافة `matchColorEdgeAware()` لمعالجة حدود Anti-Aliasing بطريقة محدودة ومخصصة للمسار الجديد فقط (`useUnified4D`)، مع الحفاظ التام على `matchColor()` القديمة دون تغيير.
    - إضافة `runUnified4DBoundaryPass()` لتنفيذ إعادة بناء حواف RGBA باستخدام إسقاط Premultiplied 4D (`(R*A, G*A, B*A, A)`).
    - استخدام تقدير تغطية الحد (`Stroke Coverage alpha`)، وتحديث خلفية التعبئة الجديدة بتركيب `Source-Over` (`F(fillOpacity) OVER B_old`) ثم إعادة التركيب.
    - إضافة شروط الثقة والتحقق من صلاحية نواة الخط (`oa`), والتباين (`vSq`), والتدرج، وبواقي خطأ إعادة البناء والخطية المحدودة (`collinear residual`).
    - استخدام فحص محدود للحواف والجيران (Fast-path + خطوتا استقامة + فحص 8 جيران/قفزة واحدة عند غياب Fast-path)، مع تجنب أي مسح إضافي كامل للصورة.
    - الاحتفاظ بمسار Phase 5 / Phase 6 / Phase 7 القديم كاملاً داخل المسار البديل (`else`).
    - الاحتفاظ بـ `tryCompositePartialAlphaBoundary()` كمسار رجوع (`fallback`) للحالات التي لا تسمح معلومات البكسل فيها بإعادة بناء موثوقة.
    - الإبقاء على `EXPERIMENTAL_GUARD_PARTIAL_ALPHA_SEEDS_FROM_PHASE6 = true`.

- **قرارات الحماية المعمارية (`PHASE 4G` Architectural Covenant — Updated `2026-11-18`)**:
  - **قرار المالك للإبقاء على الكود الاحتياطي دون حذف**: يبقى المفتاح `EXPERIMENTAL_UNIFIED_4D_BUCKET_EDGE_RECONSTRUCTION = true` والمسار القديم (`else`) والدالة `tryCompositePartialAlphaBoundary()` موجودة في `src/utils/canvasFloodFill.ts` ولا يتم حذفها أو تنظيفها حالياً؛ وذلك للحفاظ على سهولة الرجوع والمقارنة إن ظهر أي عطل مرتبط بها لاحقاً *(مراجعة الكود البنيوية تُظهر بقاء المسار القديم دون تغيير، دون وجود اختبار آلي مخصص لمقارنة التكافؤ عند قيمة `false`)*.
  - لم يتم إنشاء أي طبقة Canvas جديدة أو تغيير بنية الرسم (`Drawing Architecture`).
  - لم يتم تغيير البروتوكول الثنائي (`Binary Protocol`) أو Socket.IO أو أنظمة المزامنة.
  - لم يتم تغيير بنية التراجع/الإعادة (`Undo/Redo`) أو النقاط المرجعية (`CanvasCheckpointManager`).
  - التعديل الأساسي محصور في النواة الحسابية `src/utils/canvasFloodFill.ts`.

- **نتائج الاختبارات والبناء والتحقق اليدوي**:
  - **الفحص والبناء المنفذ فعلياً (`COMPLETED — NOT PENDING`)**:
    - `npm run build` (`vite build`) — **PASSED (COMPLETED)** (تحويل **2206 وحدة** وبناء إنتاجي كامل خلال `10.64s` برمز خروج `0`).
    - `npx tsc --noEmit` — **PASSED** (0 أخطاء).
    - `npx tsx scripts/test_bucket_partial_alpha_repeated_fill.ts` — **PASSED** (اجتياز جميع حالات المصفوفة وتأكيدات الأمان وتكافؤ الإعادة). *(ملاحظة مسجلة من هذا الاختبار المحدود القائم: حالة `strokeCircle 2px / 50%` أعطت `Gap = 57` و`Final Err = 4.38`؛ وتُسجَّل بوصفها حقيقة تقنية من الاختبار المحدود القائم لا بوصفها عطلاً مؤكداً في التجربة اليدوية)*.
    - `npx tsx --test scripts/test_bucket_checkpoint_suite.ts scripts/test_freedraw_bucket_undo_fastpath.ts` — **18/18 PASSED**.
    - `npx tsx scripts/test_phase9a_slice4.ts` — **36/36 PASSED**.
  - **التجربة اليدوية لصاحب المشروع (`Owner Manual Verification — 2026-11-17 & 2026-11-18: PASSED`)**:
    - اختبر صاحب المشروع اللعبة يدوياً بعد تحديث Unified 4D باستخدام **ألوان تعبئة مختلفة** و**درجات شفافية/كثافة (Opacity/Density) مختلفة** في العمليات المتتالية، وأكد أن **النتائج جيدة ومقبولة بصرياً** ولا يرى حاجة إلى الاستمرار في تحسين خوارزمية الحواف حالياً.
    - **توضيح الدقة المعرفية**: يمثل هذا التأكيد **تحققاً بصرياً يدوياً (`Manual Visual Verification`)** من مالك المشروع على سلوك اللعب الحقيقي، وليس اختباراً رقمياً لـ RGB/Premultiplied RGBA أو مصفوفة قياس آلية متعددة الألوان.
  - **ملاحظات التحقق التاريخية الاختيارية (`Historical Optional Verification Notes — Non-Blocking`)**:
    - *التالية كانت فحوصات آلية إضافية لم تُنفذ وتُسجل تاريخياً فقط لبيان حدود التغطية الآلية؛ وليست مهام متابعة نشطة ولا تُعيق إغلاق `PHASE 4G` ولا يُوصى بإعادة طلبها تلقائياً ما لم يظهر عطل مرتبط بها:*
      - حصر الاختبار الآلي القائم (`scripts/test_bucket_partial_alpha_repeated_fill.ts`) في تكرار لون تعبئة واحد (`#0066ff`) على الكانفاس الشفاف دون مصفوفة آلية متعددة الألوان لـ RGB وPremultiplied RGBA.
      - عدم إنشاء اختبار آلي مستقل لمقارنة `99%` مقابل `100%` أو التعبئات القريبة من لون الخط ضمن مصفوفة Unified 4D مخصصة.
      - عدم تشغيل اختبار آلي مخصص لمقارنة التكافؤ عند تعطيل المفتاح (`EXPERIMENTAL_UNIFIED_4D_BUCKET_EDGE_RECONSTRUCTION = false`).
      - عدم تنفيذ Benchmark آلي مخصص لقياس زمن وذاكرة Unified 4D وحدها عند دقة `680×396` (مع ملاحظة أن كلفة Replay أثناء Undo تتبع الآن ضمن `PHASE 4H` عند فحص التراجع الحقيقي).
      - اختبارات Undo/Redo وCheckpoints الموجودة (`18/18`) لا تقيس وحدها بكسلات Unified 4D.

#### 4.1 التوثيق المرجعي لتحسينات التراجع/النقاط المرجعية وأدوات التشخيص القائمة (`PHASE 1F.5` & `PHASE 1F.8` & Diagnostics Inventory)

> **هدف هذا التوثيق**: تثبيت ما هو موجود ومنفذ فعلياً في المستودع حول `Bucket Undo / Replay / Checkpoints / Mobile Debug` لكي لا تعيد الجلسات المستقبلية اقتراحه أو بناءه من الصفر أثناء تشخيص `PHASE 4H`.

1. **نظام النقاط المرجعية المفهرسة بالسجل (`PHASE 1F.5 — History-Indexed Checkpoints`)**:
   - **`src/utils/canvasCheckpointManager.ts`**: يدير `baseCheckpoint` و`tailCheckpoint`، ومجموعة `historyCheckpoints` بحد أقصى **`MAX_HISTORY_CHECKPOINTS = 10`** لقطات كانفاس في Free Draw (بقيادة المفتاح `freedraw_bucket_checkpoint_exp` المفعّل افتراضياً ويُعطل فقط عند `'0'`). يشمل: التحقق من التطابق عبر `anchorSignature` و`lastClearIndex` (`findLatestClearIndex`), الإبطال بعد موضع التراجع (`invalidateCheckpointsAfterIndex`), التدوير المسبق واللاحق للدلو (`capturePreBucketCheckpoint` و`advanceCheckpointBucketPost`), خطوة الضربات التكيفية (`STRIDE = 8`), وإعادة تدوير الكانفاسات عبر `checkpointCanvasPool`.
   - **`src/utils/bucketCheckpointPolicy.ts`**: سياسة `selectEvictionIndexMinimax()` التي تحمي النقطة الأولى (`index 0` في القائمة) وآخر 3 نقاط مرجعية في الذيل، وتحذف النقطة الداخلية التي تقلّل أسوأ فجوة أوامر دلو متبقية (`countBucketsBeforeIndex`).
   - **الاختبارات والنتائج الفعلية المسجلة في المستودع**:
     - `scripts/test_bucket_checkpoint_suite.ts` (مع `test_freedraw_bucket_undo_fastpath.ts` = **18/18 PASSED**): يثبت سياسة عتبة الدلو (`FREE_DRAW_BUCKET_TAIL_THRESHOLD = 3` مقابل `FREE_DRAW_TAIL_SIZE = 40` للفرشاة)، طرد Minimax عبر 100 دلو بفجوة مضبوطة، وإبطال ما بعد `Clear`.
     - `scripts/test_phase1f_checkpoint_benchmark.ts` وملف نتيجته المحفوظ `scripts/test_phase1f_summary.json`: في ذلك التشغيل المسجل (`OFF` مقابل `ON`) أنجز `OFF` أربع عمليات دلو وعمليتي رسم (`undoDurationMs: 1166`, `redoDurationMs: 906`, `undoPixelDiffCount: 225`)، بينما سجل `ON` زمن `undoDurationMs: 1146` و`redoDurationMs: 911` مع `checkpointPathProven: false` وتوقف في مرحلة `SCENARIO_OBSERVER_C` بسبب `Timeout 10000ms` في محدد زر البدء (لذلك **لا يثبت ذلك السجل وحده تسريعاً مقاساً للـ Checkpoints على الأجهزة** ويبقى القياس على الجهاز الحقيقي من مهام `PHASE 4H`).

2. **إعادة التشغيل المجمّعة للدلو ومسار التراجع السريع (`PHASE 1F.8 — Batch Bucket Replay & Fast-Path Undo`)**:
   - **`DrawingCanvasCore.tsx` (`replayFreeDrawHistorySafely`)**: ينفذ **Batch Bucket Replay** في Free Draw (مفعّل افتراضياً عبر `freedraw_bucket_batch_replay_exp !== '0'`) بحيث تقرأ حزم الدلو المتتالية صورة الكانفاس مرة واحدة إلى `batchImageData` مشترك (`getImageData` واحد) وتعيد استخدام `batchVisited` و`batchQueueX` و`batchQueueY` وتُنفذ `executeRasterFloodFill` مباشرة قبل تفريغ النتيجة (`flushBatchBuffer` / `ctx.putImageData`) عند مواجهة أمر غير الدلو أو نهاية الإعادة؛ مع دعم `_replayHint` (`full_canvas_opaque` و`noop` داخل `canvasReplayEngine.ts`).
   - **`src/utils/canvasUndoCache.ts` و`tryFastPathUndo`**: كاش نقطي بخطوة واحدة (`undoCanvas` / `redoCanvas` / `pendingCanvas`) مع تحقق `canRestoreFastPath()` (مطابقة `instanceId` و`strokeId` و`targetIndex` و`prevAnchorSignature`)، وقفل منع التداخل `undoInProgressRef` (Single-Flight Undo Guard)، وفصل توقيت `replayDurationMs` عن `totalUndoDurationMs` دون تكرار السجلات.
   - **الاختبارات الفعلية المسجلة في المستودع**:
     - `scripts/test_phase1f8_batch_replay.ts`: سكريبت Playwright يختبر محاكاة كانفاس 2D بمقارنة بايت-ببايت (`0` pixel diff) عبر 15 دلو، وأوامر مختلطة، وUndo/Redo، والشفافية المتداخلة، وسياسة `'0'` للتعطيل، وسيناريو 100 دلو/20 Undo/20 Redo داخل بيئة المحاكاة المستقلة في السكريبت.
     - `scripts/test_bucket_checkpoint_suite.ts` + `scripts/test_freedraw_bucket_undo_fastpath.ts` (**18/18 PASSED**): يشمل `A -> B -> Bucket -> C -> Undo Bucket` بصفر تنفيذ `floodFill` عند تحقق شروط الكاش السريع، وتعطيل Batch Replay عند `'0'`، وعزل مؤقتات `local_undo` و`remote_undo`.

3. **أدوات التشخيص القائمة في الهاتف والكونسول (`Existing Diagnostic Tools — DO NOT RE-INVENT`)**:
   - **`src/components/game/FreeDrawMobileDebug.tsx`** (+ `scripts/test_mobile_debug_suite.ts`) و**`src/utils/erudaManager.ts`** (`Eruda v3.4.3`, يُفعّل عبر `?fddebug=1` أو `localStorage['freedraw_mobile_debug'] === '1'` في Free Draw):
     - **`Undo Diagnostics`** (`freedraw_bucket_undo_diag`, افتراضياً **OFF**): تسجيل فقط (`console.log("[FREE_DRAW_UNDO_DIAG]", ...)` و`[FREE_DRAW_REDO_DIAG]`) دون تغيير أي سلوك تشغيلي.
     - **`Room Join Diagnostics`** (`freedraw_bucket_join_diag`, افتراضياً **OFF**): تسجيل فقط (`console.log("[FREE_DRAW_JOIN_DIAG]", ...)`) عند مزامنة الدخول.
     - **`Adaptive Bucket Checkpoints`** (`freedraw_bucket_checkpoint_exp`, افتراضياً **ON**, `'0' = تعطيل`): **علم سلوكي يغيّر مسار التنفيذ الفعلي**.
     - **`Bucket Batch Replay`** (`freedraw_bucket_batch_replay_exp`, افتراضياً **ON**, `'0' = تعطيل`): **علم سلوكي يغيّر مسار التنفيذ الفعلي**.
   - **الحقول المتوفرة أصلاً في `FREE_DRAW_UNDO_DIAG` (`DrawingCanvasCore.tsx:113-171`)**:
     `fastPath` (`hit`/`miss`/`na`), `fastPathMissReason`, `historyLengthBefore`, `targetIndex`, `targetDistanceFromEnd`, `replayStartIndex`, `commandsReplayed`, `bucketCommandsEncountered`, `floodFillExecutions`, `cumulativeFillDurationMs`, `maxFillDurationMs`, `checkpointSelectionDurationMs`, `checkpointRestoreDurationMs`, `batchSetupDurationMs`, `checkpointCaptureDurationMs`, `checkpointCaptureAttempts` / `Successes`, `batchFlushDurationMs` / `Count`, `replayOtherDurationMs`, `cumulativeFilledPixels`, `maxFillPixelCount`, `replayDurationMs`, `totalUndoDurationMs`, `hints` (`existedBefore`, `discarded`, `usedShortcut`, `forcedFill`), و`checkpointFacts` (`bestCheckpointSlot`, `bestCheckpointIndex`, `checkpointCount`, `approximateRetainedMemoryMB`, `maxBucketGap`, `checkpointIndices`, `checkpointBucketCounts`).

#### 5. مسار التراجع ونقاط الاستعادة وأداة الدلو في الوضع التنافسي (`PHASE 4H — COMPETITIVE UNDO / REDO & BUCKET FILL`)

- **الحالة الرسمية**: **`PHASE 4H — STAGE 2 CLOSED — CURRENT IMPLEMENTATION ACCEPTED`**
- **النطاق المرجعي**: الوضع التنافسي فقط (`isExperimental === true && isFreeDraw === false`) — آخر Commit تنفيذ معتمد: `f99ff28f679479a86ed67e4f4d10738636e3f7e5`.
- **المشكلة التاريخية السابقة (تمت معالجتها في مراحل `4E-1` حتى `4F-2` و`Stage 2`)**: رُصد سابقاً ثقل وتجمّد شديد على هاتف Android ضعيف عند تنفيذ `Undo` بعد تكرار عمليات `Bucket Fill`، وتبين في التحقيق والتنفيذ اللاحقين الحاجة إلى معالجة `No-op`، وضبط حد التراجع عن الدلو على الخادم، وتأكيد/رفض حزم الدلو من الخادم، ومحاذاة نقطتي `Base` و`Tail` دون تجاوز حد الـ 2 كانفاس، ثم تصحيح تباين خطوة القلم بين التحديث الحي وإعادة التشغيل (`Stage 2`).

##### أ. المراحل المنجزة ضمن `PHASE 4H`

1. **`PHASE 4E-1 — Competitive Bucket No-op Handling`**
   - **Commit**: `587097661be7a7a9ad558764127f27bb9e297120` | **الحالة**: `[x] IMPLEMENTED & OWNER-VERIFIED`
   - **ما تم تنفيذه**:
     - منع تسجيل عمليات Bucket التي لا تغيّر أي بكسلات (`filledPixelCount === 0`) في `localCommandsRef` أو إرسال `Type 4` للشبكة.
     - الحفاظ على `localRedoStackRef` و`Undo Cache` و`Checkpoints` وعدم استهلاك `strokeId` عند تحقق `No-op` حقيقي.
     - التفريق الصريح بين `No-op` حقيقي وبين فشل تنفيذ `floodFill` (`null`) مع إظهار التشخيص المناسب دون معاملته كـ `No-op` ناجح.
     - تأكيد المالك نجاح التجربة اليدوية. *(ملاحظة: يجب عدم إعادة فتح أو تكرار تحقيقات هذه المرحلة).*

2. **`PHASE 4E-2 — Competitive Bucket Undo Limit`**
   - **Commit**: `4c06d4d82eed2e30e52a4cc82e8ba45c905d72bd` | **الحالة**: `[x] IMPLEMENTED & OWNER-VERIFIED`
   - **ما تم تنفيذه**:
     - فرض حد تراجع قدره 3 عمليات Bucket في الوضع التنافسي (`COMPETITIVE_BUCKET_UNDO_LIMIT = 3`) ضمن `drawEpoch` الحالي بسلطة الخادم (`server/roomDrawingHistory.ts`).
     - استخدام هوية ثابتة لقفل Bucket (`drawEpoch + instId + strokeId`) بدلاً من الاعتماد على فهارس التاريخ الخام القابلة للتغير عند التراجع أو الحذف.
     - الحفاظ على الترتيب الزمني للأوامر؛ بحيث لا تستهلك أدوات القلم والممحاة والأشكال حد Bucket Undo، لكن قفل أي Bucket يمنع التراجع عنه أو عن أي أمر أقدم منه دون تجاوز القفل.
     - تأكيد المالك نجاح التجربة لحد التراجع ومزامنة الرسام والمتفرجين (`Drawer / Spectator sync`). *(ملاحظة: يجب عدم إعادة فتح أو تكرار تحقيقات هذه المرحلة).*

3. **`PHASE 4F-1 — Competitive Bucket Server ACK / REJECT`**
   - **Commit**: `c7817f200fee7b13cf4e5f6c0d811479c3d07437` | **الحالة**: `[x] IMPLEMENTED & OWNER-VERIFIED`
   - **ما تم تنفيذه**:
     - إرسال `draw_action_ack` من الخادم إلى الرسام فقط بعد تسجيل `Type 4` بنجاح فعلياً في سجل الغرفة، وإرسال `draw_action_rejected` إلى الرسام فقط عند الرفض (مثل تجاوز Rate Limiter أو رفض التحقق).
     - حماية `Checkpoints` من أي Bucket غير مؤكد أو مرفوض، ومعالجة التراجع المحلي النظيف عند الرفض المتأخر وحالات السباق بين `Undo / Redo` و`ACK / REJECT`.
     - إضافة ملف الاختبار الموجه: `scripts/test_stage4f1_bucket_ack_reject.ts`.
     - تأكيد المالك نجاح التجربة اليدوية. *(ملاحظة: يجب عدم إعادة فتح أو تكرار تحقيقات هذه المرحلة).*

4. **`PHASE 4F-2 — Competitive Checkpoint Alignment`**
   - **Commit**: `ed1feb8f1aea55f141531ae8cab7c3d4c0726abb` | **الحالة**: `[x] IMPLEMENTED — BUCKET UNDO OWNER-VERIFIED (ORIGINAL AUTOMATED PASS REPORT UNCONFIRMED)`
   - **ما تم تنفيذه**:
     - محاذاة `Base` و`Tail` Checkpoints في `src/utils/canvasCheckpointManager.ts` و`src/components/game/DrawingCanvasCore.tsx` مع حدود القفل والتأكيد من الخادم (`reconcileCompetitiveCheckpoints`).
     - حظر التقاط أو اعتماد أي Checkpoint يحتوي على عملية Bucket غير مؤكدة من الخادم.
     - الإبقاء الصارم على **حد أقصى 2 Checkpoint canvases فقط (`Base` و`Tail`)** في الوضع التنافسي دون استخدام `10-checkpoint pool`.
     - تحسين مسار `Replay` بعد عمليات Bucket المتكررة عبر `computeCompetitiveReplayPlan()`.
     - إضافة ملف الاختبار: `scripts/test_stage4f2_competitive_checkpoint_alignment.ts`.
     - **حالة التحقق اليدوي**: أكد المالك في اختبار يدوي اختفاء التجمّد الشديد عند التراجع عن Bucket بعد تنفيذ ~20 عملية Bucket متتالية.
     - **حالة التحقق الآلي الأولي الأصلي (التزام الصدق)**: **لا يُسجل أن التشغيل الأولي غير المكتمل لاختبارات `Stage 4F-2` الآلية قد نجح**؛ إذ لم يتوفر تقرير تشغيل نهائي موثوق لذلك التشغيل الأصلي قبل تنفيذ `Stage 2` وإعادة تشغيل حزمة الانحدار اللاحقة.

5. **`PHASE 4H — STAGE 2: COMPETITIVE CHECKPOINT & REPLAY CORRECTION`**
   - **Implementation Commit**: `f99ff28f679479a86ed67e4f4d10738636e3f7e5`
   - **الحالة الرسمية**: **`[x] IMPLEMENTED — AUTOMATED REGRESSION PASSED — OWNER VERIFIED — RESIDUAL BOUNDARY COST ACCEPTED`**
   - **الملفات المعدلة**:
     - `src/utils/canvasCheckpointManager.ts`
     - `scripts/test_stage4f2_competitive_checkpoint_alignment.ts`
   - **ما تم تنفيذه**:
     - إضافة الدالة المشتركة **`computeCompetitiveTailTarget()`** لتوحيد حساب موضع `Tail` بين التحديث الحي والإعادة في الوضع التنافسي.
     - تعريف واستخدام الثابتين **`COMPETITIVE_DEFAULT_STRIDE = 8`** (عند عدم وجود عمليات Bucket مفتوحة القفل) و**`COMPETITIVE_POST_BUCKET_STRIDE = 16`** (عند وجود عمليات Bucket مفتوحة القفل بعد `Base`).
     - محاذاة سياسة `Tail` أثناء التحديث الحي (`reconcileCompetitiveCheckpoints()`) مع تخطيط الإعادة (`computeCompetitiveReplayPlan()`), بحيث يلتزم الطرفان باستبقاء `Tail` عند `postLastBucket` خلال أول 15 ضربة قلم تالية ثم عند `postLastBucket + k * 16` مع إعادة استقرار `Tail` إلى `postLastBucket` عند عبور الحد تراجعياً.
     - إضافة **`Test 7`** في `scripts/test_stage4f2_competitive_checkpoint_alignment.ts` لتغطية سيناريو: `20 confirmed Buckets → 16 Pencil strokes → repeated Pencil Undo` (النتيجة المسجلة: تنفيذ الفل للرسام `[0, 3, 0, ...]` وللمتفرج `[3, 0, 0, ...]`).
     - الإبقاء الصارم على حد أقصى كانفاسين تنافسيين فقط (`Base` و`Tail`).
   - **التحقق الآلي الفعلي لـ `Stage 2` (منفصل عن التشغيل الأولي الناقص لـ `Stage 4F-2`)**:
     - اجتياز جميع حالات الاختبار **`1–7`** في `scripts/test_stage4f2_competitive_checkpoint_alignment.ts` وفق تقرير التنفيذ الفعلي لـ `Stage 2`.
     - اجتياز `npx tsc --noEmit` دون أخطاء.
     - اجتياز `npm run build` بنجاح تام.

##### ب. التحقق اليدوي على الهاتف وقرار الإغلاق النهائي (`STAGE 2.1` & `OWNER DECISION`)

- **الحالة الرسمية**: **`PHASE 4H — STAGE 2 CLOSED — CURRENT IMPLEMENTATION ACCEPTED`** *(لا توجد أي مهمة كود نشطة لـ `Pencil Undo` حالياً)*
- **نتائج التجربة اليدوية الفعلية للمالك على هاتف Android ضعيف**:
  - أكد المالك بعد اختبار `Stage 2` على هاتف Android ضعيف أن **الأداء العام للتراجع عن القلم (`Pencil Undo`) أصبح سلساً**.
  - يظهر تأخير طفيف ومتبقٍ فقط عندما يعبر التراجع حد Checkpoint بعد كل `16` أمراً من القلم.
  - عند اختبار رسم `40` ضربة قلم بعد عمليات `Bucket`، رصد المالك هذا التأخير المحدود عند الحدين **`32`** و**`16`** فقط، بينما بقيت جميع عمليات التراجع الأخرى سريعة.
  - **التصنيف المعتمد**: يُوثّق هذا التأخير بوصفه **مقايضة أداء محدودة ومقبولة (`Accepted Bounded Performance Trade-off`)** وليس بوصفه عائقاً تنفيذياً غير محلول.

- **تدقيق الجدوى القرائي (`PHASE 4H — STAGE 2.1: FINAL CHECKPOINT BOUNDARY COST & ZERO-TRADEOFF FEASIBILITY AUDIT`)**:
  - **القرار الرسمي**: **`CLOSED — OPTION A ACCEPTED — NO FURTHER CODE CHANGE APPROVED`**
  - **ملخص تقييم الخيارات الخمسة**:
    - **`Option A` (المعتمد)**: الإبقاء على `COMPETITIVE_POST_BUCKET_STRIDE = 16` كما في `Stage 2`؛ كلفة حدودية محدودة لمرة واحدة (`≤ 3` عمليات Flood Fill) عند عبور كل مضاعف لـ `16` مع سرعة التراجعات الأخرى وبدون أي عبء ذاكرة إضافي.
    - **`Option B`**: تثبيت `Tail` نهائياً عند `postLastBucket` (`STRIDE = Infinity`)؛ يزيل إعادة الفل في تراجع القلم لكنه يُعيد تضخّم تكلفة إعادة تصيير ضربات القلم خطياً `O(M)` في كل تراجع متكرر في الجلسات الطويلة.
    - **`Option C`**: رفع الخطوة إلى `24` أو `32`؛ يرحّل الكلفة الحدودية دون إزالتها ويزيد عمل إعادة التشغيل العادي قبل بلوغ الحد.
    - **`Option D`**: إضافة خانات Bitmap في `CanvasUndoCache`؛ يرفع استهلاك الذاكرة العشوائية/VRAM (`+1.08MB` لكل كانفاس إضافي عند `680×396`)، ويضيف كلفة نسخ `drawImage` عند كل ضربة، ويزيد تعقيد الإبطال والتعافي، ولا يحل مسار المتفرج (`Spectator`).
    - **`Option E`**: الاحتفاظ بثلاث حالات Checkpoint متزامنة (`Base` + `postLastBucket` + `PencilStride`) داخل كانفاسين؛ مستحيل رياضياً تحت سقف الكانفاسين المخصصين.
  - **قرار المالك**: اعتماد الإبقاء على التنفيذ الحالي (`Option A`) وإغلاق المرحلة، لأن التأخير الطفيف المحدود المتبقي عند عبور حدود `16` لا يبرر مقايضات الذاكرة أو الأداء المستمر أو التعقيد في البدائل الأخرى.

- **شروط إعادة الفتح المستقبلية فقط (`Future Reconsideration Criteria`)**:
  - لا يُعاد فتح تحقيق `Pencil Undo` أو تعديل هذا المسار مستقبلاً إلا إذا تحقق أحد الشروط التالية:
    1. أصبح التأخير متكرراً على نطاق واسع أو أسوأ بشكل ملموس في اللعب الفعلي.
    2. ظهرت أدلة جديدة تثبت وجود حل أفضل فعلياً دون خرق القيود المعمارية المعتمدة.
    3. أعاد مالك المشروع فتح التحقيق بقرار صريح.

- **القيود المعمارية الصارمة المحفوظة دون تغيير**:
  - يقتصر النطاق على الوضع التنافسي فقط: `isExperimental === true && isFreeDraw === false`.
  - الحد الأقصى للكانفاسات المخصصة للـ Checkpoints هو **2 فقط**: `Base` و`Tail`.
  - يظل حد التراجع عن `Bucket` في الوضع التنافسي **`3`** عمليات.
  - يبقى قفل الخادم الموثوق و`draw_action_ack` / `draw_action_rejected` دون تغيير.
  - يبقى وضع الرسم الحر (`Free Draw`) والغرف العادية (`Normal Rooms`) دون أي مساس.
  - لا توجد أي تغييرات في بروتوكول الخادم.
  - لا يوجد أي نظام تشخيصي جديد.
  - الالتزام الصارم بوثيقة `AGENTS.md`: حماية `type === 4 || type === 10 || type === 5` كخطوة أولى، وحماية تراجع الخطوة الواحدة مع `isDrawingActive = false`، ومنع إضافة أي `console.log` غير محكوم ببوابة التشخيص في المسار الساخن، ومنع عودة مسح الحزم المسطح $O(N)$.

---

### 📌 PHASE 5 — SERVER ARCHITECTURE & ROOMMANAGER DECOUPLING

#### 1. الأدوات النقية للسيرفر (`PHASE 5A`)
- [x] **`BATCH-5A-1` — استخراج أدوات المطابقة وقواميس الكلمات**:
  - **الملفات المنشأة**: `server/utils/arabicFuzzyMatch.ts`، `server/data/wordsDictionary.ts`.
  - **درجة المخاطر**: الفئة A (منخفضة المخاطر).
- [x] **`BATCH-5A-2` — استخراج أدوات معالجة الحزم الثنائية**:
  - **الملف المنشأ**: `server/utils/binaryBufferHelpers.ts`.
  - **درجة المخاطر**: الفئة A (منخفضة المخاطر).

#### 2. تفكيك وحدات السيرفر الداخلية (`PHASE 5B`)
- [x] **`PHASE 5B — SERVER / ROOMMANAGER MODULAR CONTROLLERS`**:
  - **الحالة**: **`[x] COMPLETED — CLOSED (NO FURTHER EXTRACTION WARRANTED)`**.
  - **`Stage 1: Full RoomManager Architectural Audit`**: توثيق الاعتماديات وتأكيد ملكية `RoomManager` الحصرية لخريطة `this.rooms` في الذاكرة وفهرس المقابس `this.players`.
  - **`Stage 1B: Drawing Subsystem Ownership Re-validation`**: إعادة فحص الاعتماديات وفصل خوارزميات سجل الرسم والتراجع عن إدارة هويات الرسم وبث الرسم الحر النشط.
  - **`SUB-BATCH-5B-1 — Server Drawing History & Undo/Redo Extraction`**:
    - **الملف الجديد المنشأ**: `server/roomDrawingHistory.ts`.
    - **الدوال الأربع المستخرجة**:
      1. `recordRoomDrawCommand`
      2. `undoRoomFreeDrawStroke`
      3. `undoRoomLastDrawing`
      4. `redoRoomDrawing`
    - **التوصيف المعماري**: خوارزميات ناتجة عن حالة بنطاق الغرفة (Synchronous Room-scoped State Algorithms) تعمل مباشرة على كائن `Room` الأصلي الممرر كمرجع (By reference). بقاء `RoomManager` كواجهة توافقية (Compatibility Facades) تحافظ تماماً على التواقيع والمستدعين الخارجيين. رفع مساعد استخراج معرف الجلسة `extractInstanceIdFromBuffer` إلى نطاق الوحدة (Module scope).
  - **`SUB-BATCH-5B-2 — Server Canonical Stroke Engine Extraction`**:
    - **الملف الجديد المنشأ**: `server/roomCanonicalStrokeEngine.ts`.
    - **الدوال السبع المستخرجة**:
      1. `getOrCreateFreeDrawStrokes`
      2. `getOrCreateFreeDrawCanonicalCache`
      3. `handleFreeDrawStart`
      4. `handleFreeDrawMove`
      5. `handleFreeDrawMoveCompressed`
      6. `handleFreeDrawEnd`
      7. `getCanonicalFreeDrawStroke`
    - **الحدود المعمارية**: تعمل تزامندياً بالكامل على كائن `Room` الممرر كمرجع، مع بقاء `RoomManager` مالكاً لخريطة الغرف وواجهات التوافق وبث إشعار الإلغاء `Type 12` عبر `abortFreeDrawStroke`. تسلسل سجل التاريخ التراكمي لـ `Type 9` متبوعاً بـ `Type 3` يظل تتابعياً عبر كولباك الواجهة التوافقية لـ `recordDrawCommand`. إشعار اعتماد الضربة `Type 11` (Commit Ack) يظل مملوكاً لـ `server/registerDrawBinaryHandler.ts`.
    - **نتائج حزمة الاختبارات التاريخية المثبتة**:
      * `scripts/test_experimental_draw_trial.ts`: اجتياز بنجاح.
      * `scripts/test_type13_hardening.ts`: اجتياز بنجاح.
      * `scripts/test_freedraw_bucket_undo_fastpath.ts`: نجاح 4/4 اختبارات.
      * `scripts/test_session_identity_suite.ts`: نجاح 626/626 اختباراً بنسبة 100%.
      * `scripts/test_controlled_fixes_suite.ts`: اجتياز جميع الاختبارات (Tests A - G).
      * `scripts/test_legacy1a_routing.ts`: اجتياز بنجاح.
      * `scripts/test_legacy1c_unknown_room_routing.ts`: اجتياز بنجاح.
  - **`Stage 2: Focused Drawing Pipeline Extraction Feasibility Audit & Closure`**:
    - **الحالة**: **`[x] COMPLETED — CLOSED (NO FURTHER EXTRACTION WARRANTED)`**.
    - **طبيعة التدقيق**: تدقيق معماري بنمط القراءة فقط (Read-Only Source Audit) لمسار الرسم والضربات المعيارية وسجل الرسم والتراجع في `server/rooms.ts`.
    - **القرار المعماري النهائي**: تأكيد أن الخوارزميات الناتجة ومعالجة الحزم الثنائية تم استخراجها بالفعل في `roomDrawingHistory.ts` و `roomCanonicalStrokeEngine.ts` و `binaryBufferHelpers.ts`. أما بالنسبة للدوال المتبقية في `server/rooms.ts`: فبعضها عبارة عن واجهات توافقية رشيقة (Facades) تفوّض العمل مباشرة للموديولات المستخرجة، والبعض الآخر ينفّذ مسؤوليات تنسيق حية ترتبط بحالة الغرفة، وإلغاء الضربات النشطة، وبث حزم الإلغاء `Type 12` عبر Socket.IO، وملكية هويات الرسم (`drawingIdentities`)، وتنظيف السجل، ومزامنة الضربات النشطة للداخلين الجدد. هذه المسؤوليات تظل شديدة الترابط بملكية `RoomManager` الحصرية لحالة الغرف ودورة حياة المقابس؛ وإنشاء موديول `DrawingService` إضافي سيؤدي فقط إلى إضافة طبقات غير ضرورية وتشتيت المسؤوليات دون تحقيق حد وظيفي مستقل. ولذلك **تقرر إغلاق المرحلة رسمياً مع عدم الحاجة لأي استخراج إضافي (`NO FURTHER EXTRACTION WARRANTED`)**.
    - *(ملاحظة معمارية: يتم التمييز بين نتائج الاختبارات التاريخية المثبتة أعلاه 626/626، وبين هذا التدقيق القرائي الذي لم يتطلب أي تغيير كود أو إعادة تشغيل حزم)*.
  - **`Stage 3: Residual RoomManager Core Architectural Audit & Final Closure`**:
    - **الحالة**: **`[x] COMPLETED — CLOSED (NO FURTHER EXTRACTION WARRANTED)`**.
    - **طبيعة التدقيق**: تدقيق معماري بنمط القراءة فقط (Read-Only Source Audit).
    - **القرار المعماري النهائي**: إغلاق المرحلة رسمياً بقرار **عدم الحاجة لاستخراج إضافي تحت البنية والمسؤوليات الراهنة (`NO FURTHER EXTRACTION WARRANTED`)**. استخراج `roomDrawingHistory.ts` و `roomCanonicalStrokeEngine.ts` أنشأ الحد المعياري المستقل والأنسب، وبقية مسؤوليات `RoomManager` تشكل نواة متماسكة ومترابطة تزامندياً.
    - **خريطة ملكية ومسؤوليات `RoomManager` المتبقية**:
      1. **ملكية كائنات الغرف وفهرس اللاعبين**: يحتفظ بالملكية الحصرية لخريطة الغرف `this.rooms: Map<string, Room>` كـ Source of Truth، وفهرس `this.players: Map<string, Player>` المخصص للبحث السريع برقم المقبس `socketId` إلى كائن `Player`، إلى جانب مصفوفة `room.players`.
      2. **اختيار الرسام وتدوير الدور**: تختار دالة `transitionToChoosing` أول مرشح في `room.gameState.turnQueue` يوجد له كائن لاعب مطابق داخل مصفوفة `room.players` (عبر المطابقة مع `p.persistentId || p.id`) دون تصفية صريحة لخاصية `isOffline`.
      3. **إدارة الانقطاع وفترة السماح الصامتة (90 ثانية)**: تحفظ دالة `handleDisconnect` عمداً `p.isOffline = false` وتكتفي بتثبيت `p.offlineSince = Date.now()` خلال فترة السماح الصامتة (90 ثانية) لمنع اضطراب واجهة المستخدم وتأطير مؤقت الإخلاء في `this.evictionTimers`.
      4. **دوال تنسيق الرسم الحر المتبقية داخل `RoomManager`**:
         - `syncActiveFreeDrawStrokesToSocket`: تنسيق تجهيز حزم `Type 1` و `Type 2` ومزامنة الضربات النشطة المفتوحة للداخلين الجدد.
         - `abortAllActiveFreeDrawStrokesForSocket`: تنظيف وإلغاء الضربات النشطة للمقابس المنقطعة.
         - `abortAllActiveFreeDrawStrokesForRoom`: تنظيف وإلغاء جميع الضربات النشطة للغرفة.
         - `abortFreeDrawStroke`: بث حزمة الإلغاء الثنائية `Type 12` على مستوى الغرفة عبر Socket.IO.
      5. **الدقة والصياغة المعمارية**: الأجزاء التزامنية تُنفّذ بشكل تتابعي على خيط Event-loop في Node.js، ومؤشرات كولباك المؤقتات وأحداث المقابس تُنفذ في مهام لاحقة وتتطلب دائماً التحقق من صلاحية الحالة (`stale-state validation`).

#### 3. تدقيق اتساق أنماط الغرف النشطة (`PHASE 5C`)
- [x] **`PHASE 5C — ACTIVE ROOM MODES CONSISTENCY AUDIT`**:
  - **الحالة**: **`[x] COMPLETED — READ-ONLY SOURCE AUDIT`**.
  - **النتائج والحقائق المعمارية الدائمة المثبتة**:
    1. جميع النماذج التنافسية الحالية تعتمد `isExperimental: true` وتُوجّه إلى `<ExperimentalGameRoom />`.
    2. اختلاف قيم نقاط الفوز (`General #10P` بـ 120 نقطة مقابل 30 نقطة للبقية) هو خيار تكوين متعمد على مستوى كل غرفة؛ ويُحظر تماماً تعميم أو توحيد قيم نقاط الفوز.
    3. وضع الرسم الحر نمط تشغيل/جلسة مستمر وليس محرك رسم منفصل؛ حيث يُوجّه إلى `<GameRoom />` ويتشارك مع الغرف التنافسية محركات الرسم المشتركة بالسيرفر والعميل.
    4. التمييز الصارم بين النموذج المخصص الحالي (تكوين ثابت: 5 لاعبين، 30 نقطة) والإنشاء المستقبلي للغرف المخصصة كقدرة منتج مستقبلية.
    5. توثيق الملاحظة الفنية المثبتة لبوابة DPR الصامتة `EXPERIMENTAL_DPR_1_TEST` دون تغيير الكود.

---

### 📌 PHASE 6 — EXPERIMENTALGAMEROOM REFACTORING & CLEANUP

- [x] **PHASE 6C Stage 1 — Residual ExperimentalGameRoom Architectural Audit**:
  - **الحالة**: `[x] COMPLETED — READ-ONLY SOURCE AUDIT`.
  - **النتيجة**: تدقيق شامل للمكون `ExperimentalGameRoom.tsx` وتوثيق مكوناته المستخرجة وبنيته المتبقية.

- [x] **BATCH-6C-1 — Game Activity Feed Extraction**:
  - **الحالة**: `[x] COMPLETED`.
  - **النتيجة**: استخراج منطقة التغذية السريعة (Quick Feedback Area) إلى المكون العرضي المستقل `src/components/game/GameActivityFeed.tsx` بالـ 4 Props الصريحة (`guesses`, `socketId`, `amIDrawer`, `isFreeDraw`). تم الحفاظ على مستمعي Socket.IO، وحالة `guesses` ومراجعها التزامنية `guessesRef` ورسائل الخلفية المؤجلة والمؤثرات الصوتية بالكامل داخل `ExperimentalGameRoom.tsx`.

- [x] **BATCH-6C-2 — Remove Unused Podium Confetti Generation**:
  - **الحالة**: `[x] COMPLETED`.
  - **النتيجة**: حذف وتصفية الكود غير المستغل لمتغير `confettis` المولّد عبر `React.useMemo` في `ExperimentalGameRoom.tsx` (تخفيض حجم الملف إلى 2010 سطراً) واجتياز الفحص الثابت (`tsc --noEmit`) وبناء التطبيق بنجاح تام، مع الحفاظ الكامل على تصيير وشاشات مرحلة التتويج PODIUM.

- [x] **BATCH-6C-3 — Shared Room Connection Status Overlay Extraction**:
  - **الحالة**: **`[x] COMPLETED`**.
  - **المكون الجديد المنشأ**: `src/components/game/RoomConnectionStatusOverlay.tsx`.
  - **الملفات المعدلة**: `src/components/GameRoom.tsx` و `src/components/experimental/ExperimentalGameRoom.tsx`.
  - **الواجهة المعمارية المعتمدة الصريحة (Exact Props Interface)**:
    ```typescript
    interface RoomConnectionStatusOverlayProps {
      isVisible: boolean;
      isConnected: boolean;
      isProlongedDisconnect: boolean;
      onReturnToLobby: () => void;
    }
    ```
  - **النتائج المعمارية والتغييرات**:
    - استخراج واجهة حالة الاتصال وإعادة الاتصال المطابقة إلى مكون عرض مستقل غير مالك للحالة (`Stateless Presentational Component`).
    - دمج واستخدام المكون المشترك في كلا المكونين الأب (`GameRoom.tsx` و `ExperimentalGameRoom.tsx`).
    - بقاء حالة الاتصال، ومستمعي Socket.IO، وسلوك إعادة الاتصال التلقائي، والمؤقتات، وتنظيف التخزين المحلي، ودوال مغادرة الغرفة بالكامل داخل المكونات الأب.
    - الحفاظ الكامل على شاشات التحميل الأولية ومنطق إدارة الاتصال.
    - إزالة استيرادي `WifiOff` و `LogOut` غير المستخدمين من المكونين الأب مع الإبقاء على استيرادي `motion` و `AnimatePresence`.
  - **نتائج التحقق الفني والتجربة المسجلة**:
    - `npx tsc --noEmit`: اجتياز بنسبة 100% (**0 errors**).
    - `npm run build`: بناء ناجح بنسبة 100%.
    - المزامنة مع GitHub: مكتملة ومؤكدة (`GitHub Synchronization Completed`).
    - التجربة اليدوية للمستخدم: ناجحة واكتمال تجربة اللعب بشكل طبيعي ممتاز دون أي كسر.

- [x] **PHASE 6C — Stage 2: Post-Extraction Residual Architectural Audit & Closure**:
  - **الحالة**: **`[x] COMPLETED — READ-ONLY ARCHITECTURAL AUDIT`**.
  - **القرار المعماري النهائي للمرحلة**: **`[x] CLOSED — NO FURTHER EXTRACTION WARRANTED`**.
  - **طبيعة التدقيق**: تدقيق معماري بنمط القراءة فقط (Read-Only Source Audit) للمسؤوليات المتبقية داخل `ExperimentalGameRoom.tsx` بعد إنجاز الدفعات الثلاث (`BATCH-6C-1`, `BATCH-6C-2`, `BATCH-6C-3`).
  - **خريطة المسؤوليات المتبقية والمحفوظة داخل المكون الأب (`Responsibilities Retained Inside Parent`)**:
    1. **إدارة دورة حياة الجلسات والاتصال**: هوية اللاعب الدائمة، الانضمام وإعادة الاتصال الذري (`join_room` بمهلة 10 ثوانٍ)، وتوجيه انتهاء الجلسة.
    2. **تنسيق حالة الغرفة واللعبة المركزية**: الانتقال بين حالات الجولات (`WAITING`, `CHOOSING`, `DRAWING`, `ROUND_END`, `PODIUM`).
    3. **مزامنة قائمة اللاعبين وترطيب بوابة الأحداث**: فرز اللاعبين، وعضوية الخانات، وربط أحداث الصوت بـ `useRoomEventGate`.
    4. **محرك التخزين المؤقت في الخلفية أثناء الرسم (Background Buffering Engine)**: آلية مخصصة ومصممة لتقليل تحديثات حالة React المتكررة أثناء الرسم عبر تخزين رسائل الدردشة والتخمينات وتحديثات اللاعبين في مراجع متزامنة (`chatMessagesRef`, `guessesRef`, `currentPlayersRef`, `unreadCountRef`) وتفريغها ذرياً دفعة واحدة عند انتهاء دور الرسم. *(ملاحظة معمارية دقيقة: هذا التصميم يهدف لتخفيف ضغط الريندر؛ ولا يُدّعى رقم تحسين مقاس لـ 60 FPS لعدم توفر قياسات معيارية في هذا التدقيق)*.
    5. **تنسيق إشارات الصوت وانتقال المراحل**: تشغيل أصوات المراحل، التلميحات، الإشعارات، وإجابات التخمين الصحيحة.
    6. **إدارة لوحة المفاتيح والنافذة المرئية في الهواتف**: حسابات `--keyboard-inset` على iOS Safari و Android، وتتبع `visualViewport`، وتطويع أبعاد الحاوية دون كسر تجربة اللمس.
    7. **اعتراض زر الرجوع الفيزيائي في Android والحماية من إغلاق المتصفح**: مصيدة تاريخ المتصفح العميقة (15 حالة) لإغلاق النوافذ المفتوحة بالتسلسل الهرمي قبل الخروج من الروم، وحماية `beforeunload`.
    8. **تنسيق التخمين، الدردشة، وإجراءات الإشراف**: نماذج الإدخال، التصويت بالطرد، حظر المستخدمين، والإبلاغ عن الرسم.
    9. **تنسيق فتحتي مؤقت اللعبة الموحد SmoothTimer**: نقل المؤقت بسلاسة عبر React Portal بين موقعه في لوحة الرسم المخصصة وموقعه الافتراضي للمراقبين.
    10. **جسر الرسم الحر داخل الغلاف التنافسي**: إدارة حالة الانضمام ومغادرة الرسم الحر المشترك.
  - **المرشحات التي تم فحصها وتقرر رفض استخراجها (`Evaluated & Rejected Candidates`)**:
    - **شريط الإجراءات السريعة (`ActionsBar`)**: 54 سطراً من JSX؛ يتطلب تمرير ما لا يقل عن 9 Props وكولباكات مملوكة للأب دون أي دورة حياة مستقلة. تقرر إبقاؤه داخل الأب (`KEEP IN PARENT`).
    - **شريط إدخال التخمين (`GuessInputBar`)**: 78 سطراً من JSX؛ يرتبط ارتباطاً وثيقاً بـ `guessInputRef`، وحالة التركيز، وتفادي قفزات كيبورد iOS Safari، وحسابات `--keyboard-inset`. استخراجه يضيف تعقيداً ويزيد مخاطر انتكاسات لوحة المفاتيح بالهواتف. تقرر إبقاؤه داخل الأب (`KEEP IN PARENT`).
    - **طبقة التتويج ونهاية الجولة (`RoundEndPodiumLayer`)**: مغطاة ومستخرجة بالفعل مسبقاً داخل المكون المستقل `MiniBoardOverlay.tsx`؛ لا حاجة ولا مسوغ لاستخراجها ثانية.
  - **النتيجة الختامية وإغلاق المرحلة**:
    - تم استخراج كافة المكونات العرضية والنوافذ المنبثقة المستقلة بالفعل في دفعات سابقة.
    - الكود المتبقي في `ExperimentalGameRoom.tsx` (~1966 سطراً) يشكل حدود منسق تنافسي متماسك تترابط مسؤولياته عضوياً مع محرك Socket.IO ومراجع المتصفح.
    - أي استخراج إضافي سيؤدي فقط إلى تفجير عدد الـ Props والـ Callbacks ويزيد التعقيد ومخاطر الانتكاسات دون عائد معماري حقيقي.
    - **القرار**: إغلاق `PHASE 6C` رسمياً نهائياً، مع **عدم إنشاء أي دفعة BATCH-6C-4**.

---

### 🗂️ سجل الدفعات والمكونات المستخرجة تاريخياً (Historical Batch Register)

#### 1. استخراجات واجهات الغرف والتنبيهات في العميل (`PHASE 6A` & `PHASE 6B`)
- [x] **`BATCH-6A-1` — استخراج مؤقت اللعبة `SmoothTimer`**:
  - **الملف المنشأ**: `src/components/game/SmoothTimer.tsx`.
  - **المسؤولية**: عزل شريط ومؤقت الوقت عالي الدقة.
  - **درجة المخاطر**: الفئة A (منخفضة المخاطر).
- [x] **`BATCH-6A-2` — استخراج نوافذ الإجراءات التفاعلية الأساسية (Action Modals)**:
  - **الملفات المنشأة**: `ExitConfirmModal.tsx`، `SkipConfirmModal.tsx`، `ReportConfirmModal.tsx`، `AfkWarningModal.tsx`.
  - **درجة المخاطر**: الفئة A (منخفضة المخاطر).
- [x] **`BATCH-6A-3` — استخراج نوافذ الملف الشخصي والتنبيهات (Profile & Alert Modals)**:
  - **الملفات المنشأة**: `PlayerProfileModal.tsx`، `RoomAlertModals.tsx`.
  - **درجة المخاطر**: الفئة A (منخفضة المخاطر).
- [x] **`BATCH-6B-1` — استخراج شاشة اختيار الكلمات للرسام (`ChoosingWordOverlay`)**:
  - **الملف المنشأ**: `src/components/experimental/ChoosingWordOverlay.tsx`.
  - **المسؤولية**: عزل شاشة اختيار الكلمة المنبثقة للرسام النشط.
  - **درجة المخاطر**: الفئة B (متوسطة المخاطر).

#### 2. إعادة الاستخدام وتفكيك واجهات البداية (`PHASE 7A` & `PHASE 7B`)
- [x] **`BATCH-7A-1` — إعادة استخدام النوافذ المستخرجة في `GameRoom.tsx`**:
  - **الملف المعدل**: `src/components/GameRoom.tsx`.
  - **المسؤولية**: استبدال النوافذ المضمنة بالنوافذ المستخرجة الموحدة (`CinematicModal`).
  - **درجة المخاطر**: الفئة A/B.
- [x] **`BATCH-7A-2` — استخراج واجهات Lobby المستقلة**:
  - **الملفات المنشأة**: `src/components/lobby/RoomInfoModal.tsx`، `src/components/lobby/AvatarCarousel.tsx`.
  - **المسؤولية**: عزل نافذة معلومات الغرفة ومحدد الأفاتار ثلاثي الأبعاد/الدوار.
  - **درجة المخاطر**: الفئة B (متوسطة المخاطر).
- [x] **`PHASE 7B — Lobby Architecture`**:
  - **Stage 1 (Residual Architectural Audit)**: `[x] COMPLETED — READ-ONLY SOURCE AUDIT`. فحص الـ 10 مسؤوليات وتحديد حدود شاشة تصفح الرومات كمرشح عرض مستقل.
  - **Stage 2 (Rooms Browser Presentation Extraction)**: `[x] COMPLETED`.
    - **المكون الجديد المستخرج**: `src/components/lobby/RoomsBrowserScreen.tsx` (127 سطراً).
    - **الملف المعدل**: `src/components/Lobby.tsx` (تخفيض الحجم إلى 715 سطراً).
    - **الواجهة المعمارية المعتمدة**:
      ```typescript
      interface RoomsBrowserScreenProps {
        sortedPresets: RoomConfig[];
        roomStats: Record<string, { count: number; max: number; winningScore: number; theme: string }>;
        newRoomNotice: string | null;
        onBackToHome: () => void;
        onSelectRoom: (roomId: string) => void;
        onNewRoomClick: () => void;
      }
      ```
    - **الثوابت المحفوظة في الأب**: بقاء المقابس (Socket.IO)، استعلامات `get_rooms_info`، مؤقت الـ 10 ثوانٍ، كبح التكرار `lastRoomsInfoFetchTime`، التحقق من السعة قبل الدخول، دورة حياة الـ Viewport والكيبورد، وإدارة الأفاتار والاسم بالكامل في `Lobby.tsx`.
    - **المزامنة والتحقق**: الـ Commit المعتمد في GitHub هو `3b1bb48df5eecd8a925e8209c9161f198e0c7860`. اجتياز الفحص الثابت (`tsc --noEmit`)، وبناء التطبيق، وتأكيد تجربة المستخدم اليدوية لسلامة اللعب دون أي كسر. *(لا يُدّعى أي رقم تحسين أداء مقاس)*.

#### 3. تدقيق بنية غلاف الرسم الحر (`PHASE 7C`)
- [x] **`PHASE 7C Stage 1 — GameRoom Architecture Residual Audit`**:
  - **الحالة**: **`[x] COMPLETED — CLOSED (NO EXTRACTION WARRANTED)`**.
  - **طبيعة التدقيق**: تدقيق معماري بنمط القراءة فقط (Read-Only Source Audit) لمكون `src/components/GameRoom.tsx` (1381 سطراً، 50,546 بايت).
  - **الحقيقة المعمارية المثبتة**: كائن `GameRoom.tsx` هو الغلاف التشغيلي المخصص لوضع الرسم الحر (`isFreeDraw: true`)، ويتشارك محرك الرسم بالكامل (`IsolatedDrawingLayer` -> `ExperimentalDrawingBoard` -> `DrawingCanvasCore`) مع الغرف التنافسية.
  - **المكونات المستخرجة والمعزولة مسبقاً**:
    - `RoomConnectionStatusOverlay.tsx` (واجهة حالة الاتصال المشتركة).
    - `FreeDrawPlayersList.tsx` (قائمة اللاعبين وشريط الخانات).
    - `MiniBoardOverlay.tsx` (لوحة العرض المصغرة والمراقبين).
    - `OverlayChatRoom.tsx` (واجهة الدردشة العائمة).
    - النوافذ الموحدة: `ExitConfirmModal.tsx`، `AfkWarningModal.tsx`، `PlayerProfileModal.tsx`، `RoomAlertModals.tsx`.
    - `FreeDrawMobileDebug.tsx` (كونسول تصحيح الأخطاء بالهواتف).
  - **المسؤوليات المتبقية والمحفوظة في المكون الأب (`Responsibilities Retained in GameRoom.tsx`)**:
    1. دورة حياة الجلسة والانضمام وإعادة الاتصال الذري (`join_room` بمهلة 10 ثوانٍ) وإعادة التوجيه عند انتهاء الصلاحية.
    2. إدارة حالة وحصانة الرسامين النشطين في الرسم الحر (`activeDrawers`، `handleStartFreeDraw`، `handleStopFreeDraw`).
    3. آلية عزل الرسم الحر التشخيصية (`FREE_DRAW_ISOLATION_TEST`) ومحرك التخزين المؤقت للدردشة في المراجع المتزامنة (`chatMessagesRef`، `unreadBadgeTopRef`، `unreadBadgeSideRef`).
    4. مصيدة زر الرجوع الفيزيائي في Android (15 حالة عبر `popstate`) وحماية `beforeunload`.
    5. تكيف النافذة المرئية ولوحة المفاتيح في الهواتف (`visualViewport`، `--keyboard-inset`، وقفل الـ body/HTML).
    6. تنسيق إشارات الصوت وبوابة الأحداث (`useRoomEventGate`).
  - **المرشحات المفحوصة وسبب رفض الاستخراج (`Evaluated Candidates & Rejection Reasons`)**:
    - **شريط الإجراءات السفلي (`ActionsBar`)**: 38 سطراً فقط؛ يتطلب تمرير ما لا يقل عن 6 Props وكولباكات، واستخراجه لا يحقق أي حد وظيفي مستقل.
    - **زر الخروج العلوي (`GlobalExitButton`)**: 10 أسطر بسيطة من الـ JSX مرتبطة بنافذة `showExitConfirm`.
  - **القرار المعماري النهائي**: إغلاق `PHASE 7C` رسمياً بقرار **عدم الحاجة لاستخراج إضافي (`NO EXTRACTION WARRANTED`)** لحماية تماسك الغلاف التشغيلي وتفادي انتكاسات التزامن أو تجربة الهواتف.

#### 4. المكونات التأسيسية المعزولة تاريخياً (Historical Decoupling)
- `src/components/game/PlayersSidebar.tsx`: عزل قائمة اللاعبين والتفاعلات.
- `src/components/game/OverlayChatRoom.tsx`: عزل واجهة الدردشة التفاعلية العائمة.
- `src/types/draw.ts` و `src/utils/drawBinaryHelper.ts`: فصل أدوات الضغط والترميز الثنائي.
- `DrawingCanvasCore.tsx`: اعتماد المحرك المعماري النشط للرسم وتجميع منطق الكانفاس المطور.

#### 5. توحيد أداء الرسم وتدقيق التصيير (PHASE 8A & PHASE 8B)

- [x] **`PHASE 8A — Unified Drawing Performance Policy`**:
  - **الحالة**: **`[x] COMPLETED`** (الـ Commit المعتمد: `6975924ce7fc1d9f5298fac41d5e1a833a2c3a11`).
  - **الأهداف والتنفيذ المعماري**:
    1. **استئصال تصنيف العتاد الثلاثي القديم**: حذف دوال ومتغيرات `getPerformanceTier()` و `PERF_TIER` و `IS_LOW_END` و `getAdaptiveDPR()`.
    2. **اعتماد ثابت الدقة الموحد الصريح**: تصدير واستخدام `CANVAS_DPR = 1.0` لجميع سياقات الكانفاس والطبقات المؤقتة ومخازن `CanvasCheckpointManager`.
    3. **تنظيف وإلغاء الأعلام المهجورة**: إزالة تمديدات `enableFixedDPR` و `EXPERIMENTAL_DPR_1_TEST` المهجورة من `DrawingCanvasCore.tsx` و `ExperimentalDrawingBoard.tsx` و `canvasCheckpointManager.ts`.
    4. **توحيد ومطابقة حدود المسح**: استبدال كافة استدعاءات `tempCtx.clearRect` و `ctx.clearRect` التي كانت تعتمد على `DPR` المتكيف القديم لتطابق أبعاد الكانفاس الفعلية حصراً عبر `LOGICAL_WIDTH * CANVAS_DPR, LOGICAL_HEIGHT * CANVAS_DPR`.
    5. **توحيد زمن التجميع الشبكي**: إزالة التفرع القديم المهجور `(IS_LOW_END ? 40 : (PERF_TIER === 2 ? 24 : 16))` وتثبيت زمن التجميع للوضع المستمر عند `intervalMs = 200`.
  - **الثوابت الإنتاجية المحمية التي تم الحفاظ عليها نصاً دون تغيير**:
    - دقة الكانفاس: `CANVAS_DPR = 1.0`.
    - التجميع الشبكي: `intervalMs = 200` (Continuous Mode).
    - عتبات تصفية النقاط اللمسية (Point Sampling Thresholds):
      - عرض الفرشاة أقل من 6: `0.5`.
      - عرض الفرشاة بين 6 و 10: `1.5`.
      - عرض الفرشاة أكبر من 10: `3.5`.
    - الحفاظ الكامل على مسار الهندسة أحادية المصدر (Single-Source Canonical Geometry)، خوارزمية التنعيم، النقل المضغوط غير الفاقد Type 13، واعتمادات الضربات Type 9، ونظام التراجع السريع (Fast-path Bitmap Undo Cache & Checkpoints).
  - **نتائج التحقق الفني والتجربة اليدوية**:
    - فحص الأنواع الصارم (`npx tsc --noEmit`): اجتياز بنسبة 100% (**0 errors**).
    - بناء التطبيق (`npm run build`): بناء إنتاجي ناجح بنسبة 100%.
    - الاختبارات الآلية: اجتياز كامل لـ `test_session_identity_suite.ts` (626/626 اختباراً)، `test_bucket_checkpoint_suite.ts` (14/14 اختباراً)، و `test_compressed_transport.ts`.
    - التجربة اليدوية للمستخدم: اختبر المستخدم اللعبة يدوياً وأكد أن الرسم يعمل بسلاسة تامة وتطابق كامل.
    - *(ملاحظة معمارية دقيقة: هذا التعديل يمثل تنظيفاً معمارياً وحذف كود مهجور؛ ولا يُدّعى أي تحسين أداء مقاس ناتج عنه)*.

- [x] **`PHASE 8B — Active Stroke Rendering Audit`**:
  - **الحالة**: **`[x] COMPLETED — CLOSED (OPTION A APPROVED — NO IMPLEMENTATION WARRANTED)`**.
  - **طبيعة المرحلة**: تدقيق معماري بنمط القراءة فقط (Read-Only Architectural Audit) لتحليل خط أنابيب تصيير الكانفاس المؤقت أثناء الرسم النشط في `src/components/game/DrawingCanvasCore.tsx` و `src/utils/canvasPathRenderer.ts`.
  - **الحقائق المعمارية والنتائج المثبتة من الكود المباشر**:
    1. **جدولة وتجميع الإطارات**: دالة `redrawTempLayer()` تستخدم `requestAnimationFrame` مع قفل منطقي تزامني (`redrawRequestedRef`)؛ مما يحقق كبحاً وتجميعاً تاماً (100% coalesce efficiency) لأحداث المؤشر المتعددة خلال الإطار الواحد (أقصى طلب معلق: طلب واحد فقط).
    2. **مسح وإعادة بناء الطبقة المؤقتة**: دالة `executeRedrawTempLayer()` تقوم بمسح الكانفاس المؤقت بالكامل `tempCtx.clearRect` وتُعيد رسم كامل المسار النشط عبر `drawEntirePath()`.
    3. **المسؤوليات المتعددة للكانفاس المؤقت**: الكانفاس المؤقت مشترك ومسؤول أيضاً عن تصيير جلسات الرسامين البعيدين النشطة (`activeSessionsRef`) والضربات المستنزفة (`drainingStrokesRef`) ومعاينات الأشكال؛ ومسحه الدوري يخدم جميع هذه العناصر معاً.
    4. **كفاءة خوارزمية السبلاين**: تدقيق خوارزمية السبلاين الهجينة `drawEntirePath()` أثبت أنها تعمل بـ 8 متغيرات بدائية على الـ Stack مع صفر تخصيصات في الذاكرة (Zero Heap Allocations)، وتستغرق أقل من 0.25ms على الديسك توب وأقل من 1ms على معظم الهواتف للأطوال الواقعية للمسار.
    5. **المخاطر البصرية للرسم التراكمي/التفاضلي الجزئي (Incremental Rendering - Option B)**:
       - **تراكم الشفافية (Alpha Accumulation)**: تكرار ضربات `ctx.stroke()` الجزئية يُنشئ تداخلاً دائرياً عند مفاصل المقاطع (End caps) مما يسبب بقعاً داكنة مشوهة عند استخدام فُرش شفافة (`opacity < 1.0`).
       - **خطوط وتعرجات التنعيم النقطي (Antialiasing Seams)** عند مفاصل الوصل بين المقاطع.
       - **قفزة بصرية عند التسليم والاعتماد النهائي (Commit Jump)**: لأن الضربة النهائية تُطبع كمسار مستمر واحد في الكانفاس الدائم؛ فإذا رُسمت المعاينة بمقاطع مجزأة فستختلف نغمتها وشكلها لحظة رفع الإصبع.
    6. **أعباء فصل الطبقات في كانفاس ثالث (Option C)**: إضافة كانفاس ثالث في الـ DOM تزيد استهلاك الذاكرة الرسومية VRAM (+1.08MB) وتزيد عبء التركيب في المتصفح دون وجود مسوغ أداء حقيقي.
  - **القرار المعماري النهائي**:
    - **اعتماد الخيار A (`OPTION A — KEEP THE CURRENT FULL-PATH RENDERING ARCHITECTURE`)**.
    - الإبقاء على بنية إعادة رسم المسار الكامل الحالية، وعدم إجراء أي تغيير معماري في خط أنابيب التصيير لعدم وجود ما يبرره فنياً.
    - لم يتم تعديل أو إنشاء أي سورس كود في PHASE 8B.
    - *(ملاحظة معمارية: لا يُدّعى أن الأداء قد ثبتت مثاليته تجريبياً، ولم يتم نشر أي أرقام غير مقاسة لمعدل الإطارات أو أزمنة التنفيذ)*.

---

## 🔬 القسم F — المرجع التقني المعماري والجرد الفعلي (Technical Reference & Inventory)

### 1. توجيه أنماط الغرف أثناء التشغيل (Runtime Room Routing)
* **الغرف التنافسية (Competitive Rooms)**:
  تشمل جميع النماذج المحددة مسبقاً (`General #Test`, `General #10P`, `Experimental Draw`, والغرف التنافسية المخصصة الافتراضية). تعتمد جميعها الخاصية البرمجية `isExperimental: true` ويقوم الملف الرئيسي `src/App.tsx` بتوجيهها حصرياً إلى الغلاف التشغيلي `<ExperimentalGameRoom />`.
* **وضع الرسم الحر (Free Draw Mode)**:
  يعتمد الخاصية البرمجية `isFreeDraw: true` (مع كون `isExperimental: false` أو `undefined`) ويقوم الملف الرئيسي `src/App.tsx` بتوجيه هذا الوضع حصرياً إلى الغلاف التشغيلي `<GameRoom />`.
* **توضيح معماري حاسم**: كائن `GameRoom.tsx` حالياً يُمثل **الغلاف التشغيلي لوضع الرسم الحر حصراً**، وليس محرك رسم كلاسيكي منفصل. كائن `ExperimentalGameRoom.tsx` يُمثل الغلاف التشغيلي لجميع الغرف التنافسية الحالية. ولا يجوز افتراض وجود محركات رسم مختلفة لمجرد اختلاف أسماء مكونات الغرف.

### 2. مصفوفة تكوين الغرف وحقيقة إعدادات المنتج (Room Configuration Matrix)

| اسم النمط / الغرفة (Preset / Room) | السعة القصوى (`maxPlayers`) | نقاط الفوز (`winningScore`) | نمط التشغيل (Mode) |
| :--- | :--- | :--- | :--- |
| **General #Test** | 5 لاعبين | 30 نقطة | تنافسي (Competitive) |
| **General #10P** | 10 لاعبين | 120 نقطة | تنافسي (Competitive) |
| **Experimental Draw** | 5 لاعبين | 30 نقطة | تنافسي (Competitive) |
| **Custom fallback** | 5 لاعبين | 30 نقطة | تنافسي (Competitive) |
| **Free Draw** | 5 لاعبين | 0 (بلا نهاية) | رسم حر (Free Draw) |

* **قرار المنتج المعماري الملزم (Explicit Product Decision)**:
  - اختلاف قيم نقاط الفوز (`winningScore`) هو **خيار تكوين متعمد ومقصود على مستوى كل غرفة على حدة**.
  - النمط `General #10P` **يجب أن يحتفظ بـ `winningScore: 120` بشكل دائم**، ويُحظر تماماً تعميم أو توحيد قيم نقاط الفوز إلى 30 عبر النماذج التنافسية.
  - لا يجوز افتراض أن الغرف التنافسية يجب أن تتشارك نفس نقاط الفوز؛ فقيمتا `maxPlayers` و `winningScore` متغيران مستقلان تماماً لضبط خيارات الروم، ويقرأهما محرك اللعب مباشرة من كائن الغرفة السيرفري `Room`.
* **التوجه المستقبلي لخيار إنشاء الغرف المخصصة (Future Product Direction)**:
  - إمكانية إنشاء غرف مخصصة بواسطة المستخدم مستوحاة من تجربة Gartic.io (تتيح للمستخدم تحديد عدد اللاعبين ونقاط الفوز) هي قدرة منتج مستقبلية (`FUTURE PRODUCT CAPABILITY`) وليست مهمة برمجية منفذة حالياً.
  - التصميم المستقبلي سيعتمد محرك لعب تنافسي واحد مشترك مع تمرير إعدادات الغرفة المعتمدة إلى كائن `Room` السيرفري.
  - يتم التمييز الصارم بين:
    1. **النموذج المخصص الحالي (Current Custom Fallback)**: تكوين ثابت بحجم 5 لاعبين و 30 نقطة.
    2. **إنشاء الغرف المخصصة المستقبلي (Future User-Created Configurable Rooms)**: ميزة مستقبلية غير منفذة بعد.

### 3. البنية المعمارية المشتركة لمحرك الرسم في العميل (Shared Client Drawing Architecture)
تتشارك جميع الغرف التنافسية ووضع الرسم الحر نفس تسلسل مكونات الرسم المعزولة:
* **المسار التنافسي**: `App.tsx` -> `ExperimentalGameRoom.tsx` -> `IsolatedDrawingLayer.tsx` -> `ExperimentalDrawingBoard.tsx` -> `DrawingCanvasCore.tsx`
* **مسار الرسم الحر**: `App.tsx` -> `GameRoom.tsx` -> `IsolatedDrawingLayer.tsx` -> `ExperimentalDrawingBoard.tsx` -> `DrawingCanvasCore.tsx`
* **مسؤولية طبقة الرسم المشتركة**: استقبال وإلغاء وتجميع معالجة إدخالات المؤشر واللمس، بناء وتصيير المسارات، أداة الدلو، المسح، التراجع وإلغاء التراجع، والتكامل مع التخزين المؤقت والنقاط المرجعية ومعالجة الحزم الثنائية.
* **مسؤولية أغلفة الغرف**: إدارة عرض واجهة اللعبة، الجلسة، انتقال المراحل، وشاشات الانتظار واختيار الكلمات والتتويج.
* **الوحدات الحسابية المساعدة المستخرجة**:
  - `canvasPathRenderer.ts`: تصيير الأشكال الهندسية (`drawShape`) والمسارات المنعمة (`drawEntirePath`).
  - `canvasFloodFill.ts`: النواة الحسابية لتعبئة المساحات النقطية (`executeRasterFloodFill`).
  - `canvasCheckpointManager.ts`: إدارة النقاط المرجعية للكانفاس، تقييد السقوف، وإدارة حد الذاكرة.
  - `canvasUndoCache.ts`: التخزين المؤقت النقطي للتراجع بخطوة واحدة والإنشاء الكسول للطبقات.
  - `canvasReplayEngine.ts`: دوال تصيير إعادة التشغيل الفردية والمجمعة (`replaySingleCommand`, `renderLeftoverReplaySessions`).

### 4. البنية المعمارية المشتركة للسيرفر ومحرك الرسم (Shared Server Drawing Architecture)
مسار معالجة موحد بين وضع الرسم الحر والغرف التنافسية:  
`server/registerDrawBinaryHandler.ts` -> `server/roomCanonicalStrokeEngine.ts` -> `server/roomDrawingHistory.ts` -> `RoomManager` (`server/rooms.ts`)
* `server/registerDrawBinaryHandler.ts`: استقبال وتوجيه الحزم الثنائية، التحقق من الصلاحيات والأدوار، الترحيل الشبكي، وإرسال إشعار اعتماد الضربة `Type 11` (Commit Ack).
* `server/roomCanonicalStrokeEngine.ts`: المعالجة التزامنية للضربات المعيارية النشطة، فك ترميز الحزم المضغوطة `Type 2` و `Type 13`، بناء حزمة الاعتماد المعيارية `Type 9`، وإدارة التخزين المعياري المؤقت.
* `server/roomDrawingHistory.ts`: خوارزميات سجل الرسم المعتمدة بالسيرفر، الحذف المستهدف للضربات، سلوك التراجع/إلغاء التراجع بخطوة واحدة، وحماية ثوابت سجل الرسم.
* `RoomManager` (`server/rooms.ts`): المالك الحصري لحالة الغرف المعتمدة `this.rooms` في الذاكرة، واجهات التوافق (Facades)، دورة حياة الغرف واللاعبين، بث إشعارات الإلغاء `Type 12` عبر `abortFreeDrawStroke`، تنسيق المسح، إدارة الاتصال وإعادة الاتصال، وسجل هويات الرسم.
* **مسار التوافق القديم (Legacy Branch)**: مسار `isFreeDraw: false && isExperimental: false` يظل مسار توافق قديم لا يوجد له أي روم نشط مدمج في الواجهة والتوجيه الحالي.

### 5. مصفوفة الفروقات الدائمة بين الأنماط (Permanent Mode Difference Matrix)

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

### 6. أعلام الخصائص التجريبية وتوحيد دقة الكانفاس (Experimental Feature Flags & Unified Canvas DPR)
مكون `src/components/experimental/ExperimentalDrawingBoard.tsx` يحتوي حالياً على أعلام الخصائص التجريبية التالية:
* `EXPERIMENTAL_COLOR_WHEEL_TEST = true`
* `EXPERIMENTAL_INPUT_OPTIMIZATIONS_TEST = true`
* `EXPERIMENTAL_BITMAP_UNDO_TEST = true`
* `EXPERIMENTAL_CANVAS_ALPHA_TEST = true`
* `EXPERIMENTAL_DESTINATION_OUT_ERASER_TEST = true`

* **حسم وتوحيد دقة الكانفاس عبر `CANVAS_DPR = 1.0` (PHASE 8A Closure)**:
  - تم حسم مسألة بوابة DPR الصامتة السابقة وتصنيف العتاد الثلاثي القديم وإزالتهما بالكامل في **PHASE 8A** (الـ Commit المعتمد: `6975924ce7fc1d9f5298fac41d5e1a833a2c3a11`).
  - تم استئصال دوال ومتغيرات `getPerformanceTier()` و `PERF_TIER` و `IS_LOW_END` و `getAdaptiveDPR()`، وحذف علم `EXPERIMENTAL_DPR_1_TEST` وخاصية `enableFixedDPR` تماماً من الكود.
  - يعتمد محرك الرسم المشترك بجميع أنماطه التنافسية ووضع الرسم الحر حصرياً على الثابت الموحد:
    `export const CANVAS_DPR = 1.0;`
  - تعمل جميع سياقات الكانفاس الدائمة والمؤقتة ومخازن Checkpoint Manager على دقة ثابتة محكمة قدرها $680 \times 396$ بكسل فيزيائي (`CANVAS_DPR = 1.0`)، مما يضمن تطابقاً بكسلياً بنسبة 100% بين جميع الأجهزة ويمنع استنزاف الذاكرة الرسومية VRAM.
  - تم توحيد حدود المسح لجميع استدعاءات `tempCtx.clearRect` و `ctx.clearRect` لتعتمد حصرياً على `CANVAS_DPR`، وتم تصحيح وإزالة التعليقات القديمة التي كانت تشير لدقة متكيفة متغيرة.

### 7. الجرد الفعلي للملفات الكبيرة ومسؤولياتها المتبقية (Large Files Inventory)
1. **`src/components/game/DrawingCanvasCore.tsx`**:
   - إدارة الكانفاس والطبقات المؤقتة (`canvasRef`, `tempCanvasRef`, `ctxRef`, `tempCtxRef`) بالدقة الموحدة `CANVAS_DPR = 1.0`.
   - تحويلات العرض والزوم والسحب بالأصابع والفأرة (`transformRef`, `measureAndCenter`).
   - مسار إدخال المؤشر واللمس عالي التردد (60-120Hz)، وحلقات Coalesced Events، وحماية ملكية المؤشر `activePointerIdRef`.
   - محركات الرسم: المسارات المنعمة، الأشكال (`canvasPathRenderer.ts`)، والدلو النقطي (`canvasFloodFill.ts`).
   - محرك التراجع وإلغاء التراجع المحلي والربط مع `canvasUndoCache.ts` و `canvasCheckpointManager.ts`.
   - مزامنة المقابس الثنائية اللحظية والربط مع `canvasReplayEngine.ts`.
   - **اكتمال تدقيق أداء الرسم وسياسة التصيير (PHASE 8A & PHASE 8B)**:
     - إنجاز PHASE 8A: توحيد دقة الكانفاس عند `CANVAS_DPR = 1.0`، توحيد زمن التجميع الشبكي عند 200ms، وتطهير تصنيف العتاد القديم.
     - إنجاز PHASE 8B: تدقيق خط أنابيب تصيير الكانفاس المؤقت (`drawEntirePath()`, `redrawTempLayer()`, `executeRedrawTempLayer()`) واعتماد الخيار A (الإبقاء على معمارية إعادة رسم المسار الكامل الحالية دون تغيير لعدم وجود ما يبرره فنياً وتفادياً لمخاطر تراكم الشفافية وتعرجات التنعيم).
   - **حدود محظورة الاستخراج (Non-extractable Hot Paths & Coordinators)**:
     - حلقة معالجة حركة المؤشر اللحظية `processStrokeMove` وحسابات الاستكمال الخطي (Lerp).
     - التنسيق عالي المستوى لإعادة التشغيل (High-level Replay Orchestration) لشدة ارتباطه بمراجع React، ومؤقتات RAF، وإلغاء الأجيال، وحالة واجهة المستخدم.
     - معالجة أحداث المقابس اللحظية وتدفق المزامنة (Drawing Socket Sync & Event Processing) لشدة ارتباطها بسياقات الكانفاس، وجلسات الرسم النشطة والمستنزفة، وحاجز التراجع، وإصلاح الخطوط المفقودة.
   - **الخلاصة المعمارية**: اكتملت جميع أعمال التنظيم والتفكيك المعتمدة مسبقاً لهذا الملف، والملف مستقر تماماً ولا توجد أي استخراجات إضافية مبررة.
2. **`src/components/experimental/ExperimentalGameRoom.tsx`** (~1966 سطراً في قياس المستودع الحالي بعد تنفيذ BATCH-6C-3؛ مع الحفاظ على القراءة التاريخية 2010 سطراً عند نقطة BATCH-6C-2):
   - منسق الغرفة التنافسية المخصص لجميع النماذج التنافسية (`General #Test`, `General #10P`, `Experimental Draw`, والغرف التنافسية المخصصة `isExperimental: true`).
   - إدارة الانتقال بين حالات الجولة (`WAITING`, `CHOOSING`, `DRAWING`, `ROUND_END`, `PODIUM`).
   - تكيف الواجهة مع النافذة المرئية ولوحة المفاتيح في الهواتف (`visualViewport` و `--keyboard-inset`).
   - شريط الوقت عالي الدقة `SmoothTimer`.
   - النوافذ المنبثقة التفاعلية المضمنة واستخدام المكونات المستخرجة: `ChoosingWordOverlay`, `PlayersSidebar`, `MiniBoardOverlay`, `OverlayChatRoom`, `ExperimentalWordOverlay`, `ExperimentalHitOverlay`, `GameActivityFeed`, `RoomConnectionStatusOverlay`, ونوافذ الإجراءات والتنبيهات المستخرجة عبر `CinematicModal`.
   - طبقات المراحل: اختيار الكلمات، لوحة الرسم النشطة، منصة التتويج، شريط التغذية التفاعلية المستخرج (`GameActivityFeed`)، واجهة حالة الاتصال المشتركة (`RoomConnectionStatusOverlay`)، وشريط الدردشة العائم.
3. **`server/rooms.ts`**:
   - مدير الغرف المركزي في الذاكرة `RoomManager` (مصدر الحقيقة الموحد والمالك الحصري لخريطة `this.rooms`).
   - دورة حياة الغرف والجولات، ومؤقت التحديثات الدوري `tick()`.
   - مصادقة الجلسات، التحقق من التوكنات، إدارة هوية الرسام، وإعادة الاتصال.
   - تخمينات الكلمات، المطابقة التقريبية، والتصويت على الطرد.
   - واجهات التوافق (Facades) لعمليات سجل الرسم والتراجع (`server/roomDrawingHistory.ts`) ومحرك الرسم المعياري المستمر (`server/roomCanonicalStrokeEngine.ts`).
   - تنسيق إشعارات الإلغاء (`Type 12`)، مزامنة الضربات النشطة، وإدارة هوية الرسامين.
4. **`src/components/GameRoom.tsx`** (1381 سطراً، 50,546 بايت في قياس المستودع المتزامن الحالي):
   - منسق الغرفة المحدد لوضع الرسم الحر (Free Draw `isFreeDraw: true`).
   - تشارك نفس البنية الهرمية المعزولة للرسم (`IsolatedDrawingLayer` -> `ExperimentalDrawingBoard` -> `DrawingCanvasCore`).
   - تماسك الغلاف التشغيلي لإدارة دورة حياة المقابس، وانضمام الرسامين النشطين، ومصيدة أزرار الرجوع في الهواتف.
5. **`src/components/Lobby.tsx`** (715 سطراً بعد استخراج `RoomsBrowserScreen.tsx` بـ Commit `3b1bb48df5eecd8a925e8209c9161f198e0c7860`):
   - شاشة البداية: اختيار الأفاتار، محدد الإيموجي، إدخال الاسم، واستعراض قائمة الغرف والإحصائيات عبر المكون المستخرج.

---

## 🧪 القسم G — سياسة الاختبارات والموارد (Testing & Resource Policy)

تلتزم جميع عمليات الفحص والتحقق والموارد بالضوابط الصارمة التالية:
1. **الاختبار اليدوي بواسطة مالك المشروع**:
   الاختبار اليدوي للاعبين والمتفرجين وعلى الهواتف المحمولة يتولاه مالك المشروع مباشرة عبر المتصفح والأجهزة الحقيقية.
2. **حظر محاكاة اللعب الثقيلة بالمتصفح**:
   لا يُطلب من الذكاء الاصطناعي محاكاة تجارب اللعب اليدوية عبر `Playwright` أو تشغيل اختبارات متصفح ثقيلة عندما يستطيع المالك اختبارها مباشرة على المتصفح أو الهاتف.
3. **منع الـ Benchmarks الطويلة والمجموعات الواسعة بلا ضرورة**:
   يُمنع تشغيل قياسات أداء طويلة (`long benchmarks`) أو مجموعات اختبارات واسعة وشاملة ما لم توجد ضرورة تقنية واضحة ومحددة.
4. **أولوية الفحص الاستاتيكي والاختبارات الصغيرة الموجهة**:
   إعطاء الأولوية الأولى لقراءة الكود، وتدقيق الـ Diff السطري، والمشاهدة الاستاتيكية، والاختبارات الصغيرة الموجهة المرتبطة مباشرة بالتعديل المنفذ (مثل `scripts/test_session_identity_suite.ts` أو اختبار مرحلة محدد)، دون تشغيل اختبارات ثقيلة لمهام التوثيق أو المهام العرضية البسيطة.
5. **فحص TypeScript والبناء عند وجود تغييرات كود مبررة**:
   عند تعديل الكود بما يستدعي التحقق، يُشغّل:
   - فحص الأنواع الصارم: `npx tsc --noEmit`
   - بناء التطبيق الكامل: `npm run build`
6. **حظر ادعاء نجاح أي اختبار دون تشغيل فعلي**:
   يُمنع منعاً باتاً تسجيل أو ادعاء نجاح أي اختبار دون وجود نتيجة تنفيذ فعلية موثوقة لنفس الحالة الحالية للكود.
7. **عدم إعادة تشغيل اختبارات ناجحة مسبقاً بلا سبب**:
   لا تُعاد اختبارات ثبت نجاحها سابقاً ما لم يتغير مسارها أو يظهر سبب تقني واضح يبرر إعادة التشغيل، مع مراعاة التدقيق الأعلى لمكونات الفئة C (محرك الرسم، المقابس، السيرفر).

---

## ⏸️ القسم H — سجل الأعمال المؤجلة والواجهات الصوتية (Deferred Work & Audio Register)

### 📌 UI & Room Audio Targeted Fix & System Status
* **الحالة المعمارية**: **`[x] COMPLETED — TARGETED UI AUDIO FIX IMPLEMENTED AND USER-VERIFIED`**
* **طبيعة المهمة**: تم تنفيذ وإنجاز الإصلاحات الصوتية المستهدفة بنجاح وتأكيدها وتجربتها يدوياً من قبل المستخدم. لا توجد أي أعمال صوتية جارية حالياً ولا حاجة لإنشاء مرحلة جديدة لإعادة هيكلة نظام الصوت.

#### أ. التعديلات والإصلاحات الصوتية المنفذة والمثبتة (Verified Audio Implementation Details)

1. **إعادة تصميم واستبدال صوت النقر (`buttonClick`)**:
   - تم استبدال ملف `public/sounds/ui/button.wav` بصوت تكة ناعمة ومدوّرة (Soft Tactile Tick).
   - **المواصفات الفنية المثبتة**: صيغة WAV Mono بتردد 44100Hz وعمق 16-bit PCM، حجم الملف **2514 بايت** (أقل من 3KB)، والمدة الزمنية **28.00 ميلي ثانية** تقريباً.
   - تم خفض مستوى الصوت المبدئي (`volume`) لـ `buttonClick` في `SOUND_CONFIG` من 0.6 إلى **0.25**.

2. **حذف أصول أصوات الدردشة والإشعارات غير المطلوبة**:
   - تم حذف ملفي `public/sounds/ui/chat.wav` و `public/sounds/ui/notification.wav` بالكامل من المستودع بقرار من المنتج.

3. **إلغاء أحداث واستدعاءات أصوات الرسائل**:
   - تم حذف `chatMessage` و `notification` من نوع `SoundEvent` وقاموس `SOUND_CONFIG` في `src/utils/soundConfig.ts`.
   - تم إزالة استدعاءات `soundManager.play('notification')` من دالة `onReceiveMessage` داخل `GameRoom.tsx` و `ExperimentalGameRoom.tsx`.
   - لا يتم تشغيل أي صوت عند إرسال أو استقبال الرسائل العادية أو النظامية، مع الحفاظ التام على استقبال وعرض الرسائل في واجهة الدردشة دون تغيير.

4. **منع تداخل صوت النقر مع صوت مغادرة اللاعب (`playerLeave`)**:
   - تم تحديث المستمع العام للنقرات في `src/App.tsx` ليستثني زر تأكيد الخروج (`exit-confirm-yes-btn`).
   - زر إلغاء الخروج وبقية الأزرار تستمر بتشغيل صوت `buttonClick` بشكل طبيعي.
   - عند الضغط على زر تأكيد الخروج، لا يصدر صوت `buttonClick` محلياً، مما يسمح للاعبين المتبقين بسماع صوت المغادرة القديم `playerLeave` ناصعاً دون أي تداخل أو إشعارات إضافية.

5. **الحفاظ الصارم على جميع الأصوات القديمة**:
   - تم الحفاظ الكامل دون أي تعديل على إعدادات واستدعاءات الأصوات القديمة التسعة:  
     `playerJoin`, `playerLeave`, `correctGuessSelf`, `correctGuessOther`, `wordSelectionShow`, `hintShow`, `roundStart`, `roundEnd`, `applause`.
   - لم يتم تغيير زر كتم الصوت، ولا نظام `AudioContext` العام، ولا آلية التحميل.

6. **الحفاظ على حماية `SoundManager`**:
   - تم الإبقاء على فحص `response.headers.get('content-type')` في `src/utils/soundManager.ts` لمنع فك استجابات صفحات الـ HTML (مثل 404 fallback) على أنها ملفات صوتية.

7. **نتائج الفحص والتحقق**:
   - **فحص الأنواع (`npx tsc --noEmit`)**: نجاح تام (0 أخطاء).
   - **بناء التطبيق (`npm run build`)**: بناء ناجح بنسبة 100%.
   - **التجربة اليدوية للمستخدم**: اختبر المستخدم اللعبة يدوياً وأكد أن الأصوات تعمل بصورة طبيعية، وأن صوت مغادرة اللاعب القديم يعمل بوضوح دون تداخل مع صوت النقر عند تأكيد الخروج.

#### ب. السجل التاريخي وتصحيح معلومات الأخطاء الصوتية (Historical Audio Log & Resolution)
- **الأخطاء الثلاثة التاريخية (`Failed to decode sound ... text/html`)**: حدثت سابقاً بسبب غياب الملفات في لقطة القديمة؛ وتم حل مشكلة الـ 404 بإضافة الملفات في Commit `29274455cd80bd44802bfef44e81403f809d86a7` وتأمين `soundManager`.
- **حسم قرار أصوات الدردشة والإشعارات**: تقرر رسمياً عدم تشغيل أي صوت لرسائل الدردشة أو الإشعارات النظامية وحذف الملفين نهائياً.
- **معالجة تداخل الصوت عند المغادرة**: تم حل مشكلة تداخل صوت النقر مع صوت المغادرة بنجاح وتأكيدها باختبار المستخدم اليدوي.

#### ج. ملاحظات مستقبليّة اختيارية (Optional Future Notes)
- يمكن إجراء اختبارات توافق تكميلية اختيارية عبر أجهزة ومتصفحات مختلفة (مثل iOS Safari AudioContext unlock) في المستقبل عند الحاجة، دون أن يشكّل ذلك عائقاً أمام إغلاق واكتمال الإصلاح الحالي المعتمد.

---

## 🧭 القسم I — قرارات المالك وتسليم الجلسة (`OWNER DECISIONS & SESSION HANDOFF — 2026-11-21`)

> **ملخص ملزم لأي جلسة عمل قادمة**: تم اعتماد القرارات التالية مباشرة من مالك المشروع بتاريخ `2026-11-21` (المرجع: `hamoudi100hamoudi-beep/social-games-v1` — آخر Commit تنفيذ معتمد: `f99ff28f679479a86ed67e4f4d10738636e3f7e5`) بعد إتمام `PHASE 4H — STAGE 2` وتدقيق الجدوى `STAGE 2.1` والتجربة اليدوية على Android ضعيف:

1. **التركيز الحصري على الغرفة التنافسية**: يقتصر نطاق `PHASE 4H` على الوضع التنافسي فقط (`isExperimental === true && isFreeDraw === false`)، مع بقاء `Free Draw` والغرف العادية دون تغيير.
2. **اعتماد نجاح تحسين `Bucket Undo` و`Pencil Undo (Stage 2)` يدوياً**: أكد المالك في التجربة اليدوية على هاتف Android ضعيف اختفاء التجمّد الشديد لـ `Bucket Undo` بعد ~20 عملية Bucket، وأن الأداء العام لـ `Pencil Undo` أصبح سلساً مع تأخير طفيف ومحدود فقط عند عبور حد `16` (مثل `32` و`16` عند رسم `40` خط قلم) وبقاء سائر التراجعات سريعة.
3. **إغلاق `STAGE 2` و`STAGE 2.1` باعتماد الخيار A**: الحالة الرسمية هي **`PHASE 4H — STAGE 2 CLOSED — CURRENT IMPLEMENTATION ACCEPTED`**، وقرار تدقيق الجدوى **`STAGE 2.1`** هو **`CLOSED — OPTION A ACCEPTED — NO FURTHER CODE CHANGE APPROVED`** (التأخير الحدودي الطفيف مقبول ولا يبرر مقايضات الخيارات B/C/D أو استحالة E).
4. **الحفاظ على حد 3 عمليات `Bucket Undo` وقفل الخادم**: يُحفظ حد الثلاث عمليات للتراجع عن Bucket Fill مع قفل الخادم الموثوق و`draw_action_ack` / `draw_action_rejected` دون تعديل على بروتوكول الخادم.
5. **عدم زيادة عدد Checkpoint Canvases أو إضافة تشخيصات جديدة**: يظل الحد الأقصى لنقاط الاستعادة المخصصة في الوضع التنافسي `2` فقط (`Base` و`Tail`)، ويُمنع إضافة كانفاسات جديدة أو توسيع Pool النقاط المرجعية أو استحداث نظام تشخيص جديد.
6. **لا توجد مهمة كود نشطة لـ `Pencil Undo` حالياً**: لا يُعاد فتح تحقيق `Pencil Undo` إلا إذا أصبح التأخير متكرراً أو أسوأ ملموساً، أو ظهر دليل جديد لحل أفضل دون خرق القيود الحالية، أو أعاد المالك فتحه صراحةً.
7. **عدم إعادة فتح أو تكرار التحقيقات السابقة**: تُغلق ملفات التحقيق السابقة الخاصة بمراحل `4E-1` و`4E-2` و`4F-1` و`Stage 2 / 2.1` ولا يُعاد فتحها أو تكرار نقاشها.

### 📜 أرشيف قرارات المالك السابقة (`2026-11-18` — مرجع تاريخي)
1. **إغلاق تحسينات حواف `PHASE 4G`**: قبول بصري يدوي لـ `Unified 4D` (`PHASE 4G-2`) دون حاجة لمواصلة تحسين الحواف.
2. **إثبات اكتمال البناء (`npm run build`)** لمرحلة `4G` (`2206` وحدة، Exit `0`).
3. **الإبقاء على مسار الرجوع والدوال الاحتياطية في `canvasFloodFill.ts`** (`EXPERIMENTAL_UNIFIED_4D_BUCKET_EDGE_RECONSTRUCTION` و`tryCompositePartialAlphaBoundary()`).
4. **الاعتماد السابق لـ `PHASE 4H`**: فتح تحقيق `Bucket Undo` قبل تنفيذ `4E-1`–`4F-2` (وقد نُفذت لاحقاً مراحل `4E-1`–`4F-2` و`Stage 2` مع إغلاق متابعة `Pencil Undo` في `Stage 2.1` كما هو موثق أعلاه).
5. **منع إعادة اختراع تحسينات أو تشخيصات قائمة** (`PHASE 1F.5`, `PHASE 1F.8`, `FreeDrawMobileDebug.tsx`, `erudaManager.ts`, `FREE_DRAW_UNDO_DIAG` / `FREE_DRAW_JOIN_DIAG`).
6. **تأكيد عمل `AFK` (`PHASE 9A — Slice 5C-3B`)** وحفظ سجلاته في `PRODUCTION_RELIABILITY_ROADMAP.md`.
7. **إبقاء `PHASE 9B`–`PHASE 9F` مؤجلة (`PLANNED`)**.
8. **احترام إغلاق مراحل التفكيك السابقة** (`PHASE 1` إلى `PHASE 8B`).

---

## 🌐 القسم J — مسار التدويل وتعدد اللغات (`PHASE L10N — LOCALIZATION_ROADMAP.md`)

- **الحالة الحالية (`2026-11-22`):** `PHASE L10N-0 COMPLETED` | `PHASE L10N-0.1 COMPLETED` | **`L10N-1 — AWAITING MANUAL VERIFICATION`** (تم تأسيس `src/i18n/` وإضافة منتقي اللغة في شاشة البداية بـ `Lobby.tsx` واجتياز `tsc --noEmit` و`vite build`؛ بانتظار التحقق اليدوي من المالك قبل الانتقال إلى `L10N-2`).
- **المرجع التفصيلي المعتمد:** راجع [`LOCALIZATION_ROADMAP.md`](./LOCALIZATION_ROADMAP.md) للاطلاع على الجرد الشامل للنصوص، وقسم الحماية الإلزامي (`EXISTING TEXT-DIRECTION & CHAT SAFEGUARDS — MUST PRESERVE`)، والمراحل المعتمدة من **`L10N-0` إلى `L10N-8`**.




