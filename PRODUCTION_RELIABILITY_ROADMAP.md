# PHASE 9 — Production Reliability & Resource Safety Roadmap

**Repository:** `hamoudi100hamoudi-beep/social-games-v1`  
**Workstream Owner Status:** Active  
**Governance:** All drawing/undo modifications must strictly comply with [`AGENTS.md`](./AGENTS.md) architectural invariants (`type === 4 || type === 10 || type === 5` first-action rule, 1-step undo/redo `isDrawingActive` lock, zero hot-path diagnostic logging, and zero $O(N)$ flat packet sweeps on reconnect).

---

## E. Current Checkpoint / Session Handoff

- **Active Phase / Task:** `PHASE 9A — Binary Packet Contract & Input Safety` (`IN PROGRESS — Audit Complete; Implementation Blueprint Awaiting Review; No Implementation Started`)
- **Workspace Git State & Reference Commit:**
  - Initiating GitHub `main` reference commit: `bf6d0fbeb2952ac5aec17b0cf2c1432b92a23c8b` (adds `PRODUCTION_RELIABILITY_ROADMAP.md` only; does NOT include any `server.ts` change).
  - Local `.git` metadata is absent in this runtime container (`git status`, `git branch -v`, and `git log` exit `128`), so diffs against `bf6d0fbeb2952ac5aec17b0cf2c1432b92a23c8b` are verified by direct file inspection.
- **Development-Server `server.ts` Reconciliation (Separate from PHASE 9A):**
  - Workspace `server.ts:103-107` contains an uncommitted local development-server fix:
    `const PORT = process.env.NODE_ENV !== 'production' || (process.env.NGINX_PORT && process.env.PORT === process.env.NGINX_PORT) ? parseInt(process.env.DEFAULT_APP_PORT || '3000', 10) : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);`
  - Verified GitHub `main` (`bf6d0fbeb2952ac5aec17b0cf2c1432b92a23c8b`) still contains `const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;`.
  - Conclusion: `server.ts:103-107` is a workspace-only dev-server port-collision change **not synced to GitHub `main`** and **strictly separate from PHASE 9A**. Neither `server.ts` nor any other application file was modified during blueprint planning.
- **Last Completed Milestone:**
  - Initialized `PRODUCTION_RELIABILITY_ROADMAP.md` covering `PHASE 9A` through `PHASE 9F` (`bf6d0fbeb2952ac5aec17b0cf2c1432b92a23c8b`).
  - Completed read-only `PHASE 9A` source contract audit and finalized the evidence-backed implementation blueprint (`Decisions A–F`, unresolved items, 5 ordered slices, test & acceptance criteria, and `server.ts` reconciliation).
- **Source Code Changes Made:** None (0 application files modified; only `PRODUCTION_RELIABILITY_ROADMAP.md` updated).
- **Key Audit & Blueprint Takeaways (PHASE 9A):**
  - Confirmed Type 2 trailing-byte bypass in `handleFreeDrawMove` (`server/roomCanonicalStrokeEngine.ts:132-149`), allowing arbitrary trailing bytes up to `maxHttpBufferSize` (`1e8` at `server.ts:114`) to be relayed raw (`server/registerDrawBinaryHandler.ts:187-195`).
  - Confirmed server-only `Type 11`/`12`, legacy `Type 10`, unvalidated client types (`1` shapes, `3`, `4`, `5`, `6`, `7` trailing bytes, `8`, `9`), non-canonical `Type 13`, and unknown types (`0`, `14..255`) pass through `handleDrawBinary`'s `else` fallback (`registerDrawBinaryHandler.ts:213-218`), and client `decodeBinaryDrawMessage` (`src/utils/drawBinaryHelper.ts:629-642`) maps unknown types to `'draw_clear'`.
  - Confirmed additional blueprint constraints discovered during test/lifecycle verification:
    1. Drawer ignores own `Type 12` (`draw_abort`) at `DrawingCanvasCore.tsx:3131` and has no client `3,000`-pt continuous cap, allowing a locally-committed `>3,000`-pt `Type 9` to be re-emitted on Redo (`2488-2563`).
    2. `scripts/test_session_identity_suite.ts:1061` (`makeType4`, `AUTH-11.1`) passes a `20`-byte `Type 4` buffer whereas production client emits `{17, 19, 21, 23}` bytes (`drawBinaryHelper.ts:286-321`).
    3. Existing test suites use `_` and `-` in binary `instId`s (`test_compressed_transport.ts:132,165`, `test_experimental_draw_trial.ts:206`, `test_controlled_fixes_suite.ts:93`), whereas `draw_repair_req` (`server.ts:258`) and `registerDrawingIdentity` (`rooms.ts:1352`) enforce `/^[a-zA-Z0-9]+$/`.
- **Exact Next Action:**
  `Review and approve the first implementation slice before any application source modification.`

---

## A. Workstream Purpose & Scope

**Why This Workstream Exists:**  
While the codebase already passes static compilation and targeted feature test suites, production deployment requires strict hardening around untrusted binary Socket.IO inputs, bounded per-room memory growth and join/sync CPU cost, deterministic dependency installation, standardized test execution, CI verification, and ongoing dependency vulnerability management.

**Why Separate from `REFACTORING_ROADMAP.md`:**  
`REFACTORING_ROADMAP.md` tracks the completed modularization and UI/rendering architecture work (`PHASE 1` through `PHASE 8B`, all closed/completed). **PHASE 9 (`Production Reliability & Resource Safety`)** is a distinct operational, protocol-security, resource-lifecycle, and engineering-automation workstream so architectural cleanup history remains intact and unmixed with production hardening decisions.

---

## B. Master Task Checklist

- [ ] **PHASE 9A — Binary Packet Contract & Input Safety** *(`IN PROGRESS — Audit Complete; Implementation Blueprint Awaiting Review; No Implementation Started`)*
- [ ] **PHASE 9B — Free Draw History Lifecycle, Memory Growth & Sync Performance** *(`PLANNED`)*
- [ ] **PHASE 9C — Reproducible Dependency Installation & Lockfile** *(`PLANNED`)*
- [ ] **PHASE 9D — Unified Test Strategy & Safe Test Commands** *(`PLANNED`)*
- [ ] **PHASE 9E — GitHub Actions Automated Verification** *(`PLANNED`)*
- [ ] **PHASE 9F — Dependency Security Audit & Maintenance Policy** *(`PLANNED`)*

---

## C. Standardized Status Definitions

| Status | Meaning & Transition Criteria |
| :--- | :--- |
| **`PLANNED`** | Scoped in roadmap; read-only audit and implementation have not yet started. |
| **`IN PROGRESS`** | Active research, read-only audit, or approved code implementation is underway. *(Sub-stages such as "Audit Complete" are noted explicitly inside the task record without marking the overall task completed.)* |
| **`AWAITING VERIFICATION`** | Implementation changes are written and awaiting build (`tsc --noEmit`, `vite build`), automated test runs, and manual verification. |
| **`COMPLETED & VERIFIED`** | Implementation complete, all completion criteria met, tests and builds passed with recorded evidence, and regression invariants verified. |
| **`BLOCKED`** | Cannot proceed due to a missing dependency, unresolved architectural decision, or failing prerequisite task. |

---

## F. Historical Audit Context (Epistemic Discipline)

This roadmap separates prior claims, independently verified code facts, unverified hypotheses, and estimates vs. measurements:

1. **Previously Reported Claims (Stage 1 Prompt Context):**
   - Stage 1 raised two primary concerns for investigation:
     - Claim A: Type 2 (`MSG_DRAW_MOVE`) checks `buf.length < expectedByteLen` without rejecting trailing bytes and relays the original buffer, potentially enabling oversized bandwidth/memory amplification under a large `maxHttpBufferSize`.
     - Claim B: Free Draw `drawHistory` lifecycle may grow unbounded over long-lived rooms and amplify memory/CPU during `getJsonSafeHistory` and reconnect syncs.
2. **Independently Verified Against Current Source (This Audit):**
   - **Verified:** `maxHttpBufferSize` in `server.ts:114` is `1e8` (100,000,000 bytes).
   - **Verified:** `handleFreeDrawMove` (`server/roomCanonicalStrokeEngine.ts:132-149`) checks `if (buf.length < expectedByteLen) return false;` and never checks `buf.length !== expectedByteLen`; `registerDrawBinaryHandler.ts:187-195` broadcasts the original raw `buf`.
   - **Verified:** `useCanonicalPipeline = isFreeDraw || isExperimental` (`registerDrawBinaryHandler.ts:84`) evaluates to `true` for 100% of `ROOM_PRESETS` and `getRoomConfig` fallback (`src/types/game.ts:72-160`), though legacy non-canonical paths still exist in `registerDrawBinaryHandler.ts` when invoked on custom `Room` objects lacking both flags.
   - **Verified:** Multiple non-Type-13 packet types (`1` shapes, `3` cancel/non-canonical/empty `instId`, `4`, `5`, `6`, `7` trailing bytes, `8`, `9`, `11`, `12`, unknown types `0/10/14..255`) lack exact structural/length validation on ingress in `handleDrawBinary`, allowing raw buffers up to `maxHttpBufferSize` to be broadcast and/or persisted into `room.gameState.drawHistory` and later converted via `Array.from(cmd.data)` inside `getJsonSafeHistory` (`server.ts:55`).
   - **Verified:** Client `decodeBinaryDrawMessage` (`src/utils/drawBinaryHelper.ts:629-642`) defaults unknown packet types (`0`, `10`, `14..255`) to `'draw_clear'`, triggering full canvas wipe (`applyClearEpoch`) on receiving clients.
3. **Deferred / Unverified Hypotheses (Targeted for Subsequent Sub-Phases):**
   - Full quantitative measurement of long-lived Free Draw `drawHistory` RAM growth, replay chunk stall duration, and reconnect MsgPack payload limits (deferred to `PHASE 9B`).
   - Lockfile drift (`bun.lock` vs. `package-lock.json` for `npm ci` in CI) and Node vs. Bun runtime compatibility (deferred to `PHASE 9C` / `PHASE 9E`).
4. **Estimated vs. Measured Numbers:**
   - All packet sizes (`min`/`max` bytes) and `Array.from` heap/JSON amplification factors cited in `PHASE 9A` are **deterministic wire-format calculations** derived from buffer layouts in source code, NOT live production profiling measurements.

---

## D. Detailed Per-Task Records

---

### Task 1: `PHASE 9A — Binary Packet Contract & Input Safety`

- **Objective & Scope:**  
  Audit and harden every incoming `draw_binary` packet contract (Types `1`–`13` and unknown types) on both server ingress and client decode, prevent trailing-byte / oversized / direction-spoofed / out-of-bounds payloads, align Transport `maxHttpBufferSize` with real application needs, and enforce invariants without breaking canonical Free Draw/Experimental drawing, shape tools, bucket fill, undo/redo, or `AGENTS.md` rules.
  *(Part 1: Read-Only Contract Audit — Completed; Part 2: Implementation — Not Started.)*

- **Relevant Files:**
  - `server.ts` (`maxHttpBufferSize`, `getJsonSafeHistory`, `draw_repair_req`, `relayFreeDrawMove`)
  - `server/registerDrawBinaryHandler.ts` (`handleDrawBinary`, `defaultRelayFreeDrawMove`)
  - `server/roomCanonicalStrokeEngine.ts` (`handleFreeDrawStart`, `handleFreeDrawMove`, `handleFreeDrawMoveCompressed`, `handleFreeDrawEnd`)
  - `server/roomDrawingHistory.ts` (`recordRoomDrawCommand`, `undoRoomFreeDrawStroke`, `undoRoomLastDrawing`)
  - `server/utils/binaryBufferHelpers.ts` (`decodeType13BufferSafely`, `createType2Buffer`, `createType1Buffer`)
  - `server/rooms.ts` (`RoomManager` facades, `syncActiveFreeDrawStrokesToSocket`, `abortFreeDrawStroke`, `handleFreeDrawClear`, `registerDrawingIdentity`)
  - `src/utils/drawBinaryHelper.ts` (`encodeBinaryDrawMessage`, `decodeBinaryDrawMessage`, `TOOLS_LIST`, `getToolIndex`, `getToolName`)
  - `src/utils/shadowCompression.ts` (`encodeZigZag`, `decodeZigZag`, `writeVarInt`, `readVarInt`)
  - `src/components/game/DrawingCanvasCore.tsx` (binary producers/consumers, `emitDrawCommand`, `onDrawBinary`, `executeUndo`, `executeRedo`)
  - `src/types/game.ts` (`ROOM_PRESETS`, `getRoomConfig`, `Room`, `GameState`)

- **Audit Findings (Verified — Read-Only):**
  1. **Transport Buffer Cap (`server.ts:114`):** `maxHttpBufferSize: 1e8` (100,000,000 bytes). Because `handleDrawBinary` checks neither a global frame limit nor exact packet lengths for most types, an authenticated drawer (or any joined Free Draw player who calls `start_free_draw`) can emit up to ~95.37 MiB per `draw_binary` message.
  2. **Confirmed Type 2 Trailing-Bytes Defect (`roomCanonicalStrokeEngine.ts:132-149`, `registerDrawBinaryHandler.ts:187-195`):** Canonical `handleFreeDrawMove` checks `buf.length < expectedByteLen` and `stroke.points.length + count > 3000`, accepts buffers with `buf.length > expectedByteLen`, and `handleDrawBinary` relays the unmodified `buf` (with all trailing bytes) to the room. Client `decodeBinaryDrawMessage` ignores trailing bytes beyond `10 + movesLength * 4`.
  3. **Canonical Mode Empty-`instId` Persistence Edge Case (`roomCanonicalStrokeEngine.ts:66-70, 272-276`, `roomDrawingHistory.ts:60`):** None of `handleFreeDrawStart/Move/End` reject an all-null `instId` (`""`). When `instId === ""`, `recordRoomDrawCommand`'s duplicate-Type-3 suppression (`if (isBinary && instId && ...)`) does not fire, allowing unvalidated Type 3 buffers (including trailing bytes) to be persisted into `drawHistory` right after `type9Buf`. Also cancelled `Type 3` (`buf[22] === 1`) triggers `abortFreeDrawStroke` (returns `null` from `handleFreeDrawEnd`), causing `registerDrawBinaryHandler.ts:209-211` to broadcast the raw client `buf` unchecked.
  4. **Bypass in `registerDrawBinaryHandler.ts:213-218` (`else` Branch):** Reached in active rooms by `Type 1` (shapes), `Type 3` (shapes), `Type 4` (bucket), `Type 6` (cancel), `Type 9` (client shape strokes & Free Draw/Exp client `executeRedo` strokes), **plus spoofed `Type 11` / `Type 12`, `Type 13` (if `!useCanonicalPipeline`), and unknown types (`0`, `10`, `14..255`)**. Has **zero** length, bounds, coordinate, count, direction, or trailing-byte validation; directly calls `recordDrawCommand` and broadcasts raw `buf`.
  5. **Type 9 Unchecked Header & Length (`roomDrawingHistory.ts:51-56, 84-99`):** A 16-byte client `Type 9` with `pointsLength = 65535` or a 100 MB Type 9 passes the `else` branch, gets stored in `drawHistory` (`isValidStart = true`), broadcasts to room clients (where `decodeBinaryDrawMessage` throws `RangeError` and drops it), and bloats `draw_history_sync`. Legitimate client `Type 9` sizes are `26 B` (shapes), `<= 12,018 B` (canonical 3,000-pt stroke), or `16 + N*4 (+2)` in legacy normal mode / client Free Draw Redo.
  6. **Server-Only Type Spoofing (`Type 11` & `Type 12`):** Clients never legitimately send `Type 11` (`MSG_DRAW_COMMIT`) or `Type 12` (`MSG_DRAW_ABORT`), yet if sent, the `else` branch relays them to other sockets (corrupting spectator `activeSessionsRef` / `drainingStrokesRef` or triggering bogus `draw_repair_req` storms) and appends them to non-empty `drawHistory`.
  7. **Unknown Type -> Canvas Wipe (`drawBinaryHelper.ts:629-642`, `DrawingCanvasCore.tsx:3446-3447`):** `decodeBinaryDrawMessage` defaults unrecognized byte `0` values (`0`, `10`, `14..255`) to `'draw_clear'`, causing spectators to wipe their canvas via `applyClearEpoch`. Meanwhile `Type 10` (referenced in `roomDrawingHistory.ts:100` per `AGENTS.md` and `server.ts:79`) has zero client encoder, and `getToolName(idx)` (`drawBinaryHelper.ts:75-77`) silently maps any invalid tool index (`9..255`) to `'pencil'`.
  8. **Rate & Authorization Observations:** `start_free_draw` (`server.ts:281-286`) allows any joined Free Draw player to self-authorize without rate limiting; `draw_binary` has no byte/message rate limit; `Type 7` in canonical mode checks `buf.length < 10` (allowing trailing bytes).
  9. **Downstream `drawHistory` / `getJsonSafeHistory` Amplification:** Raw buffers accepted into `drawHistory` remain pinned in server RAM and are transformed via `Array.from(cmd.data)` (`server.ts:55`) into boxed JS number arrays on every `join_room` and `request_round_sync`, multiplying heap & wire cost.

- **Implementation Decisions:**  
  *Blueprint drafted below (`PHASE 9A — Proposed Implementation Blueprint (Awaiting Review)`); awaiting slice-by-slice approval before any source edit.*

- **Files Modified:**  
  *None (0 application source files modified; only `PRODUCTION_RELIABILITY_ROADMAP.md` updated).*

- **Tests Run & Exact Results:**  
  *None executed during read-only blueprint verification.* *(Test fixtures in `scripts/` inspected read-only to confirm slice compatibility constraints.)*

- **Performance & Compatibility Notes:**
  - `encodeBinaryDrawMessage` produces `27 B` for `Type 3` when `strokeId` and `expectedPointCount` are defined (`DrawingCanvasCore.tsx:4891, 5021`) or `23 B` otherwise.
  - `Type 13` theoretical maximum for 3,000 points under `encodeZigZag` + 32-bit `writeVarInt` with values in `[-32768, 32767]` is `10 + 3000 * (3 + 3) = 18,010 B`.
  - Canonical `Type 9` for 3,000 points is `12,018 B` (`16 + 3000*4 + 2`); `Type 2` fallback (`createType2Buffer`) for 3,000 points is `12,010 B` (`10 + 3000*4`).
  - Client Free Draw `executeRedo` emits `Type 9` with `newStrokeId` (`DrawingCanvasCore.tsx:2488-2562`) and ignores incoming `Type 12` abort for own `instanceId` (`DrawingCanvasCore.tsx:3131`).
  - Any server hardening must preserve `AGENTS.md` invariants (`type === 4 || type === 10 || type === 5` inside `recordRoomDrawCommand`, 1-step undo/redo `isDrawingActive` lock, zero per-packet `console.log` spam).

- **Completion Criteria:**
  - Exact binary schemas, directionality, byte bounds, and field constraints defined and enforced at server ingress (`handleDrawBinary`) for every allowed packet type (`1`–`9`, `13`).
  - Trailing-byte rejection on `Type 2`, `Type 7`, `Type 9`, etc., matching `Type 13` strictness.
  - Client-originated `Type 11` / `Type 12` and unknown/unsupported packet types rejected cleanly on server ingress; client `decodeBinaryDrawMessage` no longer maps unknown packet types to `'draw_clear'`.
  - Safe `maxHttpBufferSize` tuned and documented with compatibility proof.
  - Automated validation test suite covering malformed, truncated, oversized, trailing-byte, spoofed, and valid packets passes alongside `npx tsc --noEmit`, `npm run build`, and existing Phase 5–8 test suites.

- **Current Status:**  
  `IN PROGRESS — Audit Complete; Implementation Blueprint Awaiting Review; No Implementation Started`

- **Next Exact Action:**  
  `Review and approve the first implementation slice before any application source modification.`

---

#### `PHASE 9A — Proposed Implementation Blueprint (Awaiting Review)`

**Reference GitHub `main` Commit:** `bf6d0fbeb2952ac5aec17b0cf2c1432b92a23c8b`  
**Status:** `IN PROGRESS — Audit Complete; Implementation Blueprint Awaiting Review; No Implementation Started`

##### 1. Decisions Supported by Evidence (Resolved A–F)

1. **Decision A — Legacy `Type 10` Policy:**
   - *Evidence:* No encoder anywhere in `src/` or `scripts/` produces `Type 10`, and server code never emits `Type 10`. `server/roomDrawingHistory.ts:100` (`type === 4 || type === 10 || type === 5`) is explicitly protected by `AGENTS.md:16`, and `server.ts:79` tolerates it during `getJsonSafeHistory`. Meanwhile, client-sent `Type 10` currently passes `handleDrawBinary`'s `else` fallback (`server/registerDrawBinaryHandler.ts:213-218`), sets `isValidStart = true`, and decodes on receiving clients as `'draw_clear'` (`src/utils/drawBinaryHelper.ts:629-642`), causing canvas wipes.
   - *Blueprint Decision:* **Reject client-originated `Type 10` at server ingress (`server/registerDrawBinaryHandler.ts`)**, **leave `server/roomDrawingHistory.ts:100` and `server.ts:79` intact** (100% compliant with `AGENTS.md`), and remove the unknown-type -> `'draw_clear'` default in `src/utils/drawBinaryHelper.ts:629-642`.

2. **Decision B — `Type 9` Maximum & Free Draw Redo Lifecycle:**
   - *Evidence:* Canonical `handleFreeDrawMove` (`server/roomCanonicalStrokeEngine.ts:137`) and `handleFreeDrawMoveCompressed` (`182`) abort strokes at `> 3,000` points and emit `Type 12` (`draw_abort`) to `io.to(roomId)` (`server/rooms.ts:1319-1334`). However, `DrawingCanvasCore.tsx:3131` (`if (data.instanceId === instanceId && !isFreeDrawUndo) return;`) causes the drawer to ignore their own server `Type 12` abort, and `processStrokeMove` (`4628-4756`) has no client-side `3,000`-point cap. Consequently, a drawer exceeding 3,000 points commits a `> 3,000`-pt `Type 9` locally (`4864-4878`), desyncs from spectators, and on Undo (`2276`) -> Redo (`2488-2563`) re-emits a `> 3,000`-pt `Type 9` (`> 12,018 B`). Wire format max (`UInt16LE` at byte `14`) is `65,535` points (`262,158 B`).
   - *Blueprint Decision:* **Do not enforce a server-side `<= 3,000`-pt cap on client `Type 9` in isolation before aligning the client**, or legitimate user Redo after a long stroke would fail silently. Instead, pair exact structural validation (`buf.length === 16 + pointsLength * 4 (+2)`, `tool <= 8`) and `<= 3,000`-pt canonical enforcement together with client-side handling of `Type 12` abort / `3,000`-pt stroke boundary in a dedicated slice (**Slice 3**).

3. **Decision C — Transport `maxHttpBufferSize` (`server.ts:114` = `1e8`):**
   - *Evidence:* Socket.IO's `maxHttpBufferSize` caps incoming client->server Engine.IO payloads (server->client `draw_history_sync` emitted in `server/registerJoinRoomHandler.ts:104, 184` is not gated by inbound `maxHttpBufferSize`). Inspected client->server events: canonical `Type 13` max = `18,010 B`; canonical `Type 9` max (at `3,000` pts) = `12,018 B`; theoretical `UInt16` `Type 9` max (`65,535` pts) = `262,158 B`; `send_message` (`server/registerSendMessageHandler.ts:61`) `<= 250` chars; `submit_guess` (`server/registerSubmitGuessHandler.ts:60`) `<= 250` chars; `select_word` (`server/registerSelectWordHandler.ts:21-28`) word string; `draw_repair_req` (`server.ts:254-264`) `instId 1..7`, `strokeId 0..65535`; `get_rooms_info` (`server/registerGetRoomsInfoHandler.ts:31-38`) `<= 10` IDs `<= 100` chars; `register_drawing_identity` (`server/registerDrawingIdentityHandlers.ts`, `rooms.ts:1352`) `instId <= 7` chars; `submit_vote_kick` (`server/registerVoteKickHandler.ts`); `join_room` (`registerJoinRoomHandler.ts:48` — `nickname`/`avatar` are currently unlength-checked strings on server).
   - *Blueprint Decision:* Isolate `maxHttpBufferSize` reduction into **Slice 5**, separate from binary schema checks. **`512 KiB` (`524_288 B`)** or **`1 MiB` (`1_048_576 B`)** preserves headroom even for worst-case `262,158 B` `Type 9` + MsgPack framing (a ~100x–190x reduction from `100 MB`), while tighter bounds (`256 KiB`) should only be applied after `Type 9` point caps (**Slice 3**) and `join_room` string bounds are confirmed.

4. **Decision D — Binary `instId` Validation & Test Fixture Evidence:**
   - *Evidence:* Production clients generate `/^[a-z0-9]{1,7}$/i` (`DrawingCanvasCore.tsx:317`); server binary clears use `"server"` (`server/rooms.ts:1202`); `draw_repair_req` (`server.ts:258`) and `registerDrawingIdentity` (`server/rooms.ts:1352`) require `/^[a-zA-Z0-9]{1,7}$/`. **However**, canonical engine (`server/roomCanonicalStrokeEngine.ts:66-70, 272-276`) does not reject `instId === ""` (all-zero `bytes 1..7`), which bypasses `recordRoomDrawCommand` duplicate suppression (`server/roomDrawingHistory.ts:60`). Crucially, inspected test suites pass binary `instId`s with `_` and `-`: `'loss_test'`/`'size_test'` (`scripts/test_compressed_transport.ts:132,165`), `'case_test'` (`scripts/test_experimental_draw_trial.ts:206`), `'user_01'` (`scripts/test_remote_handover_double_rendering.ts:13`), `'player-1'` (`scripts/test_controlled_fixes_suite.ts:93`).
   - *Blueprint Decision:* Reject empty (`""`) and non-printable/control `instId` bytes on drawing/stroke/undo packets without blindly banning `-`/`_` (e.g., accept printable ASCII `[0x21..0x7E]` or `/^[a-zA-Z0-9_-]{1,7}$/`) so zero existing regression suites break unless tests explicitly migrate to `[a-zA-Z0-9]{1,7}`.

5. **Decision E — `Type 13` in Non-Canonical Rooms:**
   - *Evidence:* `useCanonicalPipeline = isFreeDraw || isExperimental` (`server/registerDrawBinaryHandler.ts:84`) is `true` for all `ROOM_PRESETS` and `getRoomConfig` fallback (`src/types/game.ts:72-161`). Only custom/synthetic non-canonical `Room` objects evaluate `!useCanonicalPipeline`, causing `Type 13` to skip `decodeType13BufferSafely` and fall into `else` (`213-218`).
   - *Blueprint Decision:* Explicitly **reject `Type 13` when `!useCanonicalPipeline`** (`registerDrawBinaryHandler.ts`), since legacy non-canonical mode uses uncompressed `Type 2`.

6. **Decision F — Unknown Packet Types & Server-Only Directions (`Type 11`, `Type 12`, Client Decoder Fallback):**
   - *Evidence:* Client `decodeBinaryDrawMessage` (`src/utils/drawBinaryHelper.ts:395`) is the single binary decode choke point called by `onDrawBinary` (`DrawingCanvasCore.tsx:4122`), `replaySingleCommand` (`src/utils/canvasReplayEngine.ts:103`), `tryFastPathUndo` (`2228`), and `executeRedo` (`2478`). Lines `629-642` initialize `eventName = 'draw_clear'` and fall back to `'draw_clear'` for any type other than `1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13`.
   - *Blueprint Decision:* Reject client-originated `Type 11`, `Type 12`, and all unknown types (`0`, `10`, `14..255`) silently on server ingress (**Slice 1**), and change `src/utils/drawBinaryHelper.ts:629-642` to match `type === MSG_DRAW_CLEAR` (`5`) explicitly and return `null` on unknown types (`applyClearEpoch` only runs for explicit `Type 5` or JSON `draw_clear`).

##### 2. Decisions Still Requiring Evidence / Approval Before Coding

1. **`Type 4` (`draw_action` / Bucket) Exact Length vs. Existing `AUTH-11.1` Test Helper:** Real client `encodeBinaryDrawMessage('draw_action')` emits only `{17, 19, 21, 23}` bytes (`src/utils/drawBinaryHelper.ts:286-321`), whereas `scripts/test_session_identity_suite.ts:1061` (`makeType4`, `AUTH-11.1`) passes `Buffer.alloc(20)` directly into `handleDrawBinary` (`line 1153`). Confirm whether to update `makeType4` to `17`/`21` bytes alongside strict `{17, 19, 21, 23}` server enforcement, or defer strict length checking to its own step.
2. **Client-Side `3,000`-Point UX Policy (`DrawingCanvasCore.tsx`):** Confirm whether reaching `3,000` points during a single continuous stroke should (a) cleanly finalize/auto-split into a new stroke on client + canonical server, or (b) honor incoming `Type 12` (`draw_abort`) from the server by cancelling/discarding the local provisional stroke cleanly without inserting an oversized `Type 9` into `localCommandsRef`.
3. **`Type 5` (`draw_clear`) Empty `instId` Tolerance:** Verify whether any client or test path calls `encodeBinaryDrawMessage('draw_clear', {})` with an empty `instId`, vs. always attaching caller `instanceId` (`DrawingCanvasCore.tsx:2102, 2113`).
4. **Canonical `instId` Character Set:** Decide whether to retain `/^[a-zA-Z0-9_-]{1,7}$/` permanently in binary headers (full test compatibility) or standardize tests on `/^[a-zA-Z0-9]{1,7}$/` to match `draw_repair_req` and `registerDrawingIdentity`.
5. **Exact `maxHttpBufferSize` Target & `join_room` Field Caps:** Confirm target `maxHttpBufferSize` (`512 KiB` vs. `1 MiB` initially; `256 KiB` post-Slice-3) and whether `join_room` (`nickname`, `avatar`, `playerId`, `reconnectSecret`) should receive explicit string length bounds in the same or follow-up PR.
6. **Per-Socket `draw_binary` / `start_free_draw` Rate Limits:** Gather empirical event-rate/byte-rate measurements from rapid pencil strokes (`200ms` batches) and quick bucket clicks before setting throttle constants so legitimate drawers are never dropped.

##### 3. Proposed Implementation Slices (In Order)

1. **Slice 1 — Protocol Direction & Client Decoder Safety (`Type 10`, `11`, `12`, Unknown Types, Non-Canonical `Type 13` Block)**
   - *Goal:* Close canvas-wipe vector and spoofed commit/abort relay with minimal behavioral surface.
   - *Files:* `server/registerDrawBinaryHandler.ts`, `src/utils/drawBinaryHelper.ts`.
   - *Scope:* Reject client-originated `Type 10`, `Type 11`, `Type 12`, unknown byte `0` types (`0`, `14..255`), and `Type 13` when `!useCanonicalPipeline` in `handleDrawBinary`; make `decodeBinaryDrawMessage` match `type === MSG_DRAW_CLEAR` (`5`) explicitly and return `null` on unknown types; do NOT touch `server/roomDrawingHistory.ts:100` (`AGENTS.md`) or `server.ts:79`.
   - *Acceptance Criteria:* Sending `Type 0/10/11/12/14..255` from a client socket is silently ignored (`drawHistory` unchanged, not broadcast); client `decodeBinaryDrawMessage` returns `null` for `0/10/14..255` and still decodes `Type 5` and all valid `1..9, 11..13` packets.

2. **Slice 2 — Canonical Stream & Control-Packet Structural Validation (`Type 2` Trailing Bytes, `Type 1`/`3`/`5`/`6`/`7`/`8` Exact Bounds & Non-Empty `instId`)**
   - *Goal:* Eliminate the confirmed `Type 2` trailing-bytes relay defect, canonical `instId === ""` persistence leak, and header truncation/trailing-byte bugs on stream/control packets.
   - *Files:* `server/registerDrawBinaryHandler.ts`, `server/roomCanonicalStrokeEngine.ts`.
   - *Scope:*
     - Enforce exact `buf.length === 10 + count * 4` on `Type 2` (canonical `handleFreeDrawMove` & legacy fallback).
     - Enforce exact lengths and bounds: `Type 1` (`=== 18`, `tool <= 8`), `Type 3` (`=== 23` or `=== 27`, valid `tool`), `Type 5` (`=== 8`), `Type 6` (`=== 8`), `Type 7` (`=== 10` in canonical modes, `=== 8 || === 10` in normal mode), `Type 8` (`=== 8`).
     - Validate non-empty printable `instId` (`/^[a-zA-Z0-9_-]{1,7}$/`) in `handleFreeDrawStart/Move/End`, and ensure cancelled `Type 3` (`buf[22] === 1`) aborts cleanly without bypassing validation.
   - *Acceptance Criteria:* Trailing-byte `Type 2`, malformed/short `Type 1/3/5/6/7/8`, and all-zero `instId` canonical packets are rejected cleanly without entering `drawHistory` or relaying; all canonical/shape/undo/clear test suites pass unchanged.

3. **Slice 3 — `Type 9` & Free Draw `>3,000`-Point / Redo Lifecycle Alignment**
   - *Goal:* Harden client-originated `Type 9` while fixing the confirmed `Type 12` (`draw_abort`) / `>3,000`-pt desync on client Redo.
   - *Files:* `src/components/game/DrawingCanvasCore.tsx`, `server/registerDrawBinaryHandler.ts`.
   - *Scope:* Align drawer handling when a continuous stroke reaches `3,000` points or receives server `Type 12` abort (`DrawingCanvasCore.tsx:3131`, `4628-4912`), then enforce exact `Type 9` schema (`buf.length === 16 + pointsLength * 4 (+2)`, `tool <= 8`, `pointsLength <= 3000` in canonical modes / explicit agreed cap in normal mode, valid `instId`).
   - *Acceptance Criteria:* Drawing `>3,000` points in Free Draw/Experimental never desyncs drawer vs. spectators, subsequent Undo/Redo stays in sync with server `drawHistory`, and oversized/truncated/trailing-byte `Type 9` packets are rejected at server ingress.

4. **Slice 4 — `Type 4` (`draw_action`) Structural Hardening & Decoder Bounds Pre-Checks**
   - *Goal:* Lock down remaining shape/bucket header validation and prevent client `DataView` `RangeError` exceptions on truncated inputs.
   - *Files:* `server/registerDrawBinaryHandler.ts`, `src/utils/drawBinaryHelper.ts` *(plus `scripts/test_session_identity_suite.ts:1061` only if strict `{17, 19, 21, 23}` length is chosen over tolerating legacy 20B test packet)*.
   - *Scope:* Validate `Type 4` (`tool === 2` bucket or valid shape/action bounds, exact byte length `{17, 19, 21, 23}` once reconciled with `makeType4`); add explicit `view.byteLength` guards before every `DataView` read in `decodeBinaryDrawMessage`.
   - *Acceptance Criteria:* Zero uncaught `RangeError` noise on truncated `Type 1/2/3/4/9/11/12` buffers in `decodeBinaryDrawMessage`; bucket flood fill works identically across competitive & Free Draw modes and preserves `AGENTS.md` first-action invariant.

5. **Slice 5 — Transport `maxHttpBufferSize` Tuning & Socket Event Payload/Rate Guardrails**
   - *Goal:* Shrink Socket.IO ingress ceiling from `100 MB` (`1e8`) to a bounded production cap and verify chat/join/capability/rate-limit safety.
   - *Files:* `server.ts` *(optionally `server/registerJoinRoomHandler.ts` if `nickname`/`avatar` caps are included)*.
   - *Scope:* Lower `maxHttpBufferSize` (`524_288` / `1_048_576`, or `262_144` after Slice 3 confirms `Type 9` ceiling), without altering the existing `PORT` startup lines unless tracked separately; document measured overhead for `draw_history_sync` & MsgPack frames.
   - *Acceptance Criteria:* Large `> maxHttpBufferSize` frames disconnect/reject cleanly at transport layer; max valid `Type 13` (`18,010 B`), `Type 9` (`12,018 B`), `join_room`, and normal reconnect `draw_history_sync` operate without regression.

##### 4. Tests & Acceptance Criteria Across Slices

- **Existing Verification Baseline (Must Stay Green):**
  - Static checks: `npx tsc --noEmit` and `npm run build`.
  - Protocol & Regression Suites in `scripts/` (run cleanly per slice): `scripts/test_type13_hardening.ts`, `scripts/test_compressed_transport.ts`, `scripts/test_session_identity_suite.ts`, `scripts/test_payload_validation_suite.ts`, `scripts/test_controlled_fixes_suite.ts`, `scripts/test_experimental_draw_trial.ts`, `scripts/test_repair_seamless_handover.ts`, `scripts/test_legacy1a_routing.ts`, `scripts/test_legacy1c_unknown_room_routing.ts`, `scripts/test_codec.ts`.
- **New Targeted Tests Needed (During Implementation):**
  - Negative/boundary binary contract tests covering: `Type 2` trailing bytes (`+1`, `+1024`), `Type 1/3/4/5/6/7/8/9` truncated & trailing-byte buffers, client-spoofed `Type 10`/`11`/`12`, unknown bytes (`0`, `14`, `255`), non-canonical `Type 13`, all-zero `instId` (`""`), invalid tool indices (`9`, `255`), `decodeBinaryDrawMessage` returning `null` instead of `'draw_clear'`, and canonical `Type 9` Redo after `>3,000`-pt strokes.

##### 5. Development-Server `server.ts` Reconciliation Record

- **Observed Difference:** Workspace `server.ts:103-107` resolves `PORT` via `NODE_ENV !== 'production' || (process.env.NGINX_PORT && process.env.PORT === process.env.NGINX_PORT) ? parseInt(process.env.DEFAULT_APP_PORT || '3000', 10) : ...`, whereas GitHub `main` (`bf6d0fbeb2952ac5aec17b0cf2c1432b92a23c8b`) has `const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;`.
- **Disposition:** Keep completely separate from **PHASE 9A**. Do not bundle into Slice 1–4 packet contracts, and track/commit `server.ts:103-107` independently as a local runtime/dev-server fix.

- **Current Status:**  
  `IN PROGRESS — Audit Complete; Implementation Blueprint Awaiting Review; No Implementation Started`

- **Next Exact Action:**  
  `Review and approve the first implementation slice before any application source modification.`

---

### Task 2: `PHASE 9B — Free Draw History Lifecycle, Memory Growth & Sync Performance`

- **Objective & Scope:**  
  Audit and bound long-lived Free Draw and room `drawHistory` growth, `freeDrawCanonicalCache` / `freeDrawStrokes` / rate-limit map lifetimes, and `getJsonSafeHistory` (`Array.from`) serialization/CPU/memory amplification during `join_room` and `request_round_sync`, without violating `AGENTS.md` (no $O(N)$ packet-sweep regressions on reconnect, preserve 1-step undo/redo invariants and targeted Free Draw undo).

- **Relevant Files:**
  - `server/rooms.ts` (`drawHistory`, `clearDrawHistoryForRoomAndClient`, `handleFreeDrawClear`, eviction & idle room cleanup, `rateLimit.ts` maps)
  - `server/roomDrawingHistory.ts` (`recordRoomDrawCommand`, `undoRoomFreeDrawStroke`)
  - `server/roomCanonicalStrokeEngine.ts` (`freeDrawStrokes` stale/60s eviction, `freeDrawCanonicalCache` eviction loop)
  - `server.ts` (`getJsonSafeHistory`, `roundSyncLimits`, `drawRepairLimits`, `chatMessageLimits`, `guessLimits`, `voteKickLimits`)
  - `server/registerJoinRoomHandler.ts`, `server/registerRequestRoundSyncHandler.ts`
  - `src/components/game/DrawingCanvasCore.tsx` (`onDrawHistorySync`, `processIncomingHistorySync`, chunked replay)

- **Audit Findings (Preliminary Observations from 9A Inspection — Full Audit Pending):**
  - Competitive rounds reset history via `clearDrawHistoryForRoomAndClient` (`server/rooms.ts:505, 583`), whereas Free Draw has no automatic round reset and only clears on explicit `Type 5` (`draw_clear`) or room destruction.
  - `getJsonSafeHistory` (`server.ts:54-56`) converts every binary `Buffer` in `drawHistory` via `Array.from(cmd.data)` on every `join_room` and `request_round_sync`.
  - Multiple rate-limit `Map`s in `server.ts:125-129` and `freeDrawCanonicalCache` eviction (`roomCanonicalStrokeEngine.ts:285-289`) require dedicated lifecycle inspection in Phase 9B.

- **Implementation Decisions:** *Not started.*
- **Files Modified:** *None.*
- **Tests Run & Exact Results:** *None.*
- **Performance & Compatibility Notes:** Must benchmark or estimate history compaction / binary sync impact against `DrawingCanvasCore` join diagnostics (`FREE_DRAW_JOIN_DIAG`) and preserve `AGENTS.md` O(1)/non-sweep guarantees.
- **Known Risks / Unresolved Questions:** Compaction/snapshotting strategy when Free Draw rooms accumulate hundreds/thousands of strokes while players still use targeted per-stroke undo (`undoRoomFreeDrawStroke`).
- **Completion Criteria:** Bounded `drawHistory` & per-room cache lifecycle, non-amplifying history sync, verified memory/sync bounds under load test, full regression pass.
- **Current Status:** `PLANNED`
- **Next Exact Action:** Complete and close `PHASE 9A` before initiating the `PHASE 9B` read-only audit.

---

### Task 3: `PHASE 9C — Reproducible Dependency Installation & Lockfile`

- **Objective & Scope:**  
  Audit current lockfile and toolchain setup (`package.json`, `bun.lock`, npm/node vs. bun behavior) and establish a deterministic, reproducible dependency installation workflow suitable for local development and CI (`npm ci` / `package-lock.json` or unified package manager policy).

- **Relevant Files:**
  - `package.json`
  - `bun.lock` (observed present in root)
  - Any `package-lock.json` / `.nvmrc` / `engines` config (none observed for npm at root during Phase 9A workspace check)

- **Audit Findings (Preliminary):**
  - Root contains `package.json` and `bun.lock`; npm scripts in `package.json` use `tsx server.ts`, `vite build`, and `tsc --noEmit`, while `vite` appears in both `dependencies` (`^6.2.3`) and `devDependencies` (`^6.2.3`). Full lockfile & runtime parity check deferred to `PHASE 9C`.

- **Implementation Decisions:** *Not started.*
- **Files Modified:** *None.*
- **Tests Run & Exact Results:** *None.*
- **Performance & Compatibility Notes:** Must ensure native/binary optional deps (`sharp`, `playwright`, `socket.io-msgpack-parser`) install cleanly on Linux CI runners.
- **Known Risks / Unresolved Questions:** Whether production/CI targets `npm` (`package-lock.json` + `npm ci`) or `bun` (`bun.lock` + `bun install --frozen-lockfile`).
- **Completion Criteria:** Single documented package manager & committed lockfile policy, verified clean-environment reproducible install.
- **Current Status:** `PLANNED`
- **Next Exact Action:** Execute `PHASE 9C` dependency/lockfile audit after `PHASE 9A`/`9B` (or when scheduled).

---

### Task 4: `PHASE 9D — Unified Test Strategy & Safe Test Commands`

- **Objective & Scope:**  
  Inventory all 28+ existing verification scripts in `scripts/`, classify unit/integration/browser/benchmark scripts, eliminate brittle assumptions (e.g., hardcoded running `:3000` server requirements vs. ephemeral port suites), and add canonical, safe `package.json` test scripts (unit/protocol suite vs. Playwright browser suite).

- **Relevant Files:**
  - `package.json` (`scripts` section currently has `dev`, `start`, `build`, `preview`, `clean`, `lint` — zero `test` scripts)
  - `scripts/*.ts` (`28` TypeScript scripts + `scripts/experiments/`)

- **Audit Findings (Preliminary from 9A Inspection):**
  - `scripts/` already contains strong standalone suites (`test_type13_hardening.ts`, `test_session_identity_suite.ts`, `test_payload_validation_suite.ts`, `test_controlled_fixes_suite.ts`, `test_codec.ts`, `test_compressed_transport.ts`, `test_experimental_draw_trial.ts`, `test_repair_seamless_handover.ts`, `test_legacy1a_routing.ts`, `test_legacy1c_unknown_room_routing.ts`, etc.) alongside Playwright scripts (`test_action_primitives.ts`, `verify_browser_runtime.ts`) that assume a live server on `http://localhost:3000`.

- **Implementation Decisions:** *Not started.*
- **Files Modified:** *None.*
- **Tests Run & Exact Results:** *None.*
- **Performance & Compatibility Notes:** CI-safe tests must run headless/ephemeral without port conflicts or manual UI interaction.
- **Known Risks / Unresolved Questions:** Determining which legacy scripts in `scripts/` are maintained regression tests vs. one-off historical diagnostics.
- **Completion Criteria:** Classified test inventory, unified `npm test` / targeted suite scripts in `package.json`, all safe suites runnable cleanly in one command.
- **Current Status:** `PLANNED`
- **Next Exact Action:** Proceed after `PHASE 9C` establishes reproducible installs.

---

### Task 5: `PHASE 9E — GitHub Actions Automated Verification`

- **Objective & Scope:**  
  Add automated GitHub Actions CI workflows running typechecking (`tsc --noEmit`), production build (`vite build`), and the unified safe test suites from `PHASE 9D` on pull requests and pushes.

- **Relevant Files:**
  - `.github/workflows/*.yml` (not yet checked/created)
  - `package.json`, lockfile

- **Audit Findings:** *Deferred to PHASE 9E.*
- **Implementation Decisions:** *Not started.*
- **Files Modified:** *None.*
- **Tests Run & Exact Results:** *None.*
- **Performance & Compatibility Notes:** Node/Bun version pinning and dependency caching aligned with `PHASE 9C`.
- **Known Risks / Unresolved Questions:** Separating fast deterministic protocol/unit checks from Playwright browser jobs (artifact upload on failure).
- **Completion Criteria:** Passing CI workflow file checked in and verified on PR/push triggers.
- **Current Status:** `PLANNED`
- **Next Exact Action:** Proceed after `PHASE 9C` and `PHASE 9D`.

---

### Task 6: `PHASE 9F — Dependency Security Audit & Maintenance Policy`

- **Objective & Scope:**  
  Audit current npm/bun dependency tree for known CVEs, evaluate outdated or duplicate declarations (e.g., `vite` in both `dependencies` and `devDependencies`), establish Dependabot / scheduled audit checks, and document safe upgrade & patch verification procedures.

- **Relevant Files:**
  - `package.json`
  - Lockfile (`bun.lock` / `package-lock.json`)
  - `.github/dependabot.yml` / audit workflow (if adopted)

- **Audit Findings:** *Deferred to PHASE 9F.*
- **Implementation Decisions:** *Not started.*
- **Files Modified:** *None.*
- **Tests Run & Exact Results:** *None.*
- **Performance & Compatibility Notes:** Avoid breaking major-version jumps (`express` 4->5, `react` 19, `socket.io` / `msgpack-parser` wire compatibility) without explicit regression verification.
- **Known Risks / Unresolved Questions:** Transitive CVEs in Vite/dev-only toolchain vs. runtime Express/Socket.IO surface.
- **Completion Criteria:** Clean baseline security audit report, documented upgrade triage & SLA policy, automated advisory monitoring configured.
- **Current Status:** `PLANNED`
- **Next Exact Action:** Proceed after `PHASE 9E`.
