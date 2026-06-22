# 🛡️ Constitution & Architectural Invariants of the Drawing/Undo Engine
# 🛡️ دستور وقواعد حماية نظام الرسم والتراجع المستقر

This document governs the physical rules and logical invariants of the Drawing and Undo Engine for this application. Any AI editor, developer, or assistant modifying the codebase **MUST STRICTLY ADHERE** to these invariants. Do not alter, simplify, or refactor these sections unless requested explicitly by the user with specific reference to this system.

هذا المستند يحدد القوانين الصارمة والقواعد الثابتة لنظام الرسم وأداة التراجع والدلو المستقرة. يجب على أي نموذج ذكاء اصطناعي أو مطور يقرأ هذا الملف الالتزام التام بهذه القيود وعدم العبث بها لتجنب تخريب توازن اللعبة أو التسبب في تجمد السيرفر.

---

## ── 1. CORE INVARIANTS (القواعد الصارمة والخطوط الحمراء) ──

### 🎨 A. Bucket Tool & First-Action Drawing (أداة الدلو والبدء الفوري)
- **Problem**: When a user uses the Bucket (Flood Fill) tool as the **very first action** of a turn, or when they reconnect, the action must be recorded immediately without being filtered out as an "orphaned block".
- **Rule**:
  - Inside `server/rooms.ts` (`recordDrawCommand`), we allow binary packet type `4` (Bucket/Paint Action) as an alternative starting packet to initialize drawing history safely even if `drawHistory.length` is zero.
  - The condition: `type === 4 || type === 10 || type === 5` inside `recordDrawCommand` is **fully protected**. Do not alter or break this checks, as it guarantees immediate registration of the Bucket tool and Canvas cleared events locally and upon reconnection.
- **القاعدة**:
  - داخل كود السيرفر في `recordDrawCommand` بملف `server/rooms.ts` يُسمح للنوع الثنائي `type === 4` (أداة الدلو) بالمرور الفوري حتى لو كان السجل فارغاً. يُمنع منعاً باتاً تعديل هذا الشرط لتفادي مشكلة اختفاء الدلو أو عدم ظهوره كخطوة أولى.

---

### 🔄 B. Safe Undo & Redo (نظام التراجع الآمن ومنع التجمد)
- **Problem**: Infinite undo/redo loops and canvas state discrepancies between drawers and guessers during network jitter or client reconnections.
- **Rule**:
  - The server strictly enforces a **1-step undo/redo buffer** via `room.gameState.redoStack = [removed]` on the server and `localRedoStackRef` on the client.
  - **Drawing Lock**: When `undo` is triggered, the engine immediately sets `room.gameState.isDrawingActive = false`. This locks out late-arriving draw packets (such as delayed `draw_move` binary chunks) from appending back onto the newly popped stroke index.
  - Do not try to rewrite this logic using client-side manual timeline indices or historical packet sweeps, as this creates desync storms.
- **القاعدة**:
  - يتم تمكين تراجع آمن خطوة واحدة عبر `room.gameState.redoStack = [removed]` في السيرفر ومزامنتها على الكلاينت بطريقة ثنائية.
  - بمجرد الضغط على زر التراجع، يُقفل الرسم فوراً عبر تعيين `isDrawingActive = false` لمنع أي حزم شبكية متأخرة بالدخول وتشويه ترتيب اللوحة التشاركي.

---

### ⚡ C. High-Performance Client Rendering Loop (طبقات ومحرك لوحة الرسم)
- **Location**: `src/components/game/DrawingCanvasCore.tsx`
- **Rule**:
  - Visual layers: The canvas rendering flow isolates active, real-time drawings from finalized historic paths. Do not consolidate state dependencies directly into inline styles or components to avoid high frame skips.
  - **Palette Selection in DrawingBoard**: The active selection ring/indicator is designed to be thinner (`border-[1.5px]`), slightly larger (`-inset-[3px]` outline) with an elegant Gold shade (`#D4AF37`) and subtle glow. Keep this presentation clean and visually distinct from standard yellow or drawing palette grids.
- **القاعدة**:
  - لوحة الرسم معزولة لضمان أداء 60 إطاراً بالثانية للأجهزة الضعيفة.
  - تم تمييز لون تحديدPalette الألوان المحددة بحلقة ذهبية ممتازة (#D4AF37) أوسع وأنحف من المربعات العادية لمنع تدمير الرؤية البصرية للألوان وخاصة تداخله مع اللون الأصفر.

---

## ── 2. DO NOT RE-INTRODUCE (ممنوع إعادة إضافة التالي) ──
- **Diagnostic Logging**: Do not re-add active debugging comments or telemetry lines like `console.log("[DRAW LOG] ...")` inside real-time drawing streams to prevent CPU lag or memory exhaustion under hundreds of active rooms.
- **Flat Packet Iterations**: Do not force search-loops or absolute offset math across `drawHistory` frames since this creates the $O(N)$ execution bottleneck that locks the server during reconnection sweeps.
- **لا تُعد أسطر الفحص والمراقبة المؤقتة**: تم إزالة جميع كونسول لوق التشخيص ومراقبة حزم الرسم اللحظية لمنع استنزاف موارد المعالج والذاكرة العشوائية وسرعة تصفية المتصفح.

---

*This document is a binding contract for any developer bot or human engineer modifying this code. Maintain this balance to keep this drawing engine elite.*
*هذا المستند هو حجر الأساس ودستور بقاء محرك الرسم في أعلى درجات الكفاءة والاستقرار الهيكلي.*
