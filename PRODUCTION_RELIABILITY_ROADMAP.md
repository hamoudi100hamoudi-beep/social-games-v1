# PHASE 9 — Production Reliability & Resource Safety Roadmap

**Repository:** `hamoudi100hamoudi-beep/social-games-v1`  
**Workstream Owner Status:** Active  
**Governance:** All drawing/undo modifications must strictly comply with [`AGENTS.md`](./AGENTS.md) architectural invariants (`type === 4 || type === 10 || type === 5` first-action rule, 1-step undo/redo `isDrawingActive` lock, zero hot-path diagnostic logging, and zero $O(N)$ flat packet sweeps on reconnect).

---

## E. Current Checkpoint / Session Handoff

- **Active Phase / Task:** `PHASE 9A — Binary Packet Contract & Input Safety` (`IN PROGRESS — Slice 1 Implemented (AWAITING VERIFICATION); Slices 2–5 Not Started`)
- **Last Completed Milestone:**
  - Implemented narrow **PHASE 9A Slice 1** (protocol direction filtering, non-canonical `Type 13` blocking, and explicit client decoder handling with unknown opcodes returning `null`).
  - Added `scripts/test_phase9a_slice1.ts` (89/89 checks passing) and verified `tsc --noEmit`, `vite build`, and all 11 existing protocol/replay regression suites pass.
- **Source Code Changes Made (Slice 1):**
  - `server/registerDrawBinaryHandler.ts`: Added pre-routing guard rejecting client-originated `Type 11`, `Type 12`, `Type 0`, `Types 14..255`, and non-canonical `Type 13` (`!useCanonicalPipeline`) while preserving `Type 10` and `Types 1..9` / canonical `13`.
  - `src/utils/drawBinaryHelper.ts`: Replaced fallback `'draw_clear'` assignment in `decodeBinaryDrawMessage` with explicit branches for `Type 5` (`MSG_DRAW_CLEAR`), legacy `Type 10`, `Type 6`, `Type 7`, `Type 8`, and `return null` for unknown opcodes (`0`, `14..255`).
  - `scripts/test_phase9a_slice1.ts`: New Slice 1 regression test suite (89 passed, 0 failed).
- **Key Audit & Implementation Takeaways (PHASE 9A):**
  - **Unknown Opcodes & Spoofed Controls Hardened (Slice 1):** Client-originated `0`, `11`, `12`, `14..255`, and non-canonical `13` are silently dropped before `drawHistory`, broadcast, or state mutation; `decodeBinaryDrawMessage` returns `null` for `0` and `14..255` instead of `'draw_clear'`.
  - **`Type 10` Compatibility Limitation:** Legacy `Type 10` remains accepted on server ingress (with `server/roomDrawingHistory.ts:100` and `server.ts:79` untouched per `AGENTS.md`) and explicitly decoded as `'draw_clear'`. Because workspace `.git` history and original `Type 10` producers are absent, **its exact historical wire format remains unknown**, and synthetic `Type 10` tests verify only current compatibility behavior, not external historical client proof.
  - **Deferred Scope (`Slices 2–5`):** `Type 2` trailing-byte fix (`server/roomCanonicalStrokeEngine.ts:132-149`), `Type 1/3/4/5/6/7/8/9` structural validation, `Type 9` Redo/point-cap alignment, `maxHttpBufferSize` reduction (`server.ts:114`), rate limiting, and `instId` standardization remain unstarted.
- **Exact Next Action:**
  `Complete manual multiplayer game verification for Slice 1 (drawing, clear, undo/redo, repair, sync), then review and approve Slice 2.`

---

## A. Workstream Purpose & Scope

**Why This Workstream Exists:**  
While the codebase already passes static compilation and targeted feature test suites, production deployment requires strict hardening around untrusted binary Socket.IO inputs, bounded per-room memory growth and join/sync CPU cost, deterministic dependency installation, standardized test execution, CI verification, and ongoing dependency vulnerability management.

**Why Separate from `REFACTORING_ROADMAP.md`:**  
`REFACTORING_ROADMAP.md` tracks the completed modularization and UI/rendering architecture work (`PHASE 1` through `PHASE 8B`, all closed/completed). **PHASE 9 (`Production Reliability & Resource Safety`)** is a distinct operational, protocol-security, resource-lifecycle, and engineering-automation workstream so architectural cleanup history remains intact and unmixed with production hardening decisions.

---

## B. Master Task Checklist

- [ ] **PHASE 9A — Binary Packet Contract & Input Safety** *(`IN PROGRESS — Slice 1 AWAITING VERIFICATION; Slices 2–5 Not Started`)*
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
   - **Verified:** Multiple non-Type-13 packet types (`1` shapes, `3` cancel/non-canonical/empty `instId`, `4`, `5`, `6`, `7` trailing bytes, `8`, `9`, `11`, `12`, legacy `10`, and unknown types `0/14..255`) lack exact structural/length validation on ingress in `handleDrawBinary`, allowing raw buffers up to `maxHttpBufferSize` to be broadcast and/or persisted into `room.gameState.drawHistory` and later converted via `Array.from(cmd.data)` inside `getJsonSafeHistory` (`server.ts:55`).
   - **Verified:** Client `decodeBinaryDrawMessage` (`src/utils/drawBinaryHelper.ts:629-642`) defaults unrecognized packet types (`0`, `14..255`) — as well as legacy `Type 10` — to `'draw_clear'`, triggering full canvas wipe (`applyClearEpoch`) on receiving clients.
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
  4. **Bypass in `registerDrawBinaryHandler.ts:213-218` (`else` Branch):** Reached in active rooms by `Type 1` (shapes), `Type 3` (shapes), `Type 4` (bucket), `Type 6` (cancel), `Type 9` (client shape strokes & Free Draw/Exp client `executeRedo` strokes), **plus spoofed `Type 11` / `Type 12`, `Type 13` (if `!useCanonicalPipeline`), legacy `Type 10`, and unknown types (`0`, `14..255`)**. Has **zero** length, bounds, coordinate, count, direction, or trailing-byte validation; directly calls `recordDrawCommand` and broadcasts raw `buf`.
  5. **Type 9 Unchecked Header & Length (`roomDrawingHistory.ts:51-56, 84-99`):** A 16-byte client `Type 9` with `pointsLength = 65535` or a 100 MB Type 9 passes the `else` branch, gets stored in `drawHistory` (`isValidStart = true`), broadcasts to room clients (where `decodeBinaryDrawMessage` throws `RangeError` and drops it), and bloats `draw_history_sync`. Legitimate client `Type 9` sizes are `26 B` (shapes), `<= 12,018 B` (canonical 3,000-pt stroke), or `16 + N*4 (+2)` in legacy normal mode / client Free Draw Redo.
  6. **Server-Only Type Spoofing (`Type 11` & `Type 12`):** Clients never legitimately send `Type 11` (`MSG_DRAW_COMMIT`) or `Type 12` (`MSG_DRAW_ABORT`), yet if sent, the `else` branch relays them to other sockets (corrupting spectator `activeSessionsRef` / `drainingStrokesRef` or triggering bogus `draw_repair_req` storms) and appends them to non-empty `drawHistory`.
  7. **Unknown Type -> Canvas Wipe & Legacy `Type 10` Distinction (`drawBinaryHelper.ts:629-642`, `DrawingCanvasCore.tsx:3446-3447`):** `decodeBinaryDrawMessage` defaults unrecognized byte `0` values (`0`, `14..255`) — alongside `Type 10` — to `'draw_clear'`, causing spectators to wipe their canvas via `applyClearEpoch`. Unlike truly unknown types (`0`, `14..255`), `Type 10` is explicitly guarded in `roomDrawingHistory.ts:100` (`AGENTS.md`) and `server.ts:79` as a legacy clear marker. Meanwhile `getToolName(idx)` (`drawBinaryHelper.ts:75-77`) silently maps any invalid tool index (`9..255`) to `'pencil'`.
  8. **Rate & Authorization Observations:** `start_free_draw` (`server.ts:281-286`) allows any joined Free Draw player to self-authorize without rate limiting; `draw_binary` has no byte/message rate limit; `Type 7` in canonical mode checks `buf.length < 10` (allowing trailing bytes).
  9. **Downstream `drawHistory` / `getJsonSafeHistory` Amplification:** Raw buffers accepted into `drawHistory` remain pinned in server RAM and are transformed via `Array.from(cmd.data)` (`server.ts:55`) into boxed JS number arrays on every `join_room` and `request_round_sync`, multiplying heap & wire cost.

- **Implementation Decisions:**  
  - **Slice 1 Implemented (`AWAITING VERIFICATION`):** Enforced ingress opcode/direction filtering and non-canonical `Type 13` blocking in `server/registerDrawBinaryHandler.ts`, and replaced fallback `'draw_clear'` decoding in `src/utils/drawBinaryHelper.ts` with explicit handling for `Type 5`, legacy `Type 10`, `Type 6`, `Type 7`, `Type 8` and `return null` for unsupported opcodes (`0`, `14..255`).
  - **Deferred Decisions:** Structural schemas and exact byte lengths for `Types 1–9`, `Type 2` trailing bytes, `Type 9` / Redo alignment, `maxHttpBufferSize`, rate limits, and `instId` standardization remain scoped to `Slices 2–5`.

- **Files Modified:**  
  - `server/registerDrawBinaryHandler.ts` (Slice 1 ingress direction & non-canonical `Type 13` guard)
  - `src/utils/drawBinaryHelper.ts` (Slice 1 explicit clear/control opcode branches & `null` for `0, 14..255`)
  - `scripts/test_phase9a_slice1.ts` (new Slice 1 regression test suite)
  - `PRODUCTION_RELIABILITY_ROADMAP.md` (status, verification results, limitations, rollback record)

- **Tests Run & Exact Results (Executed After Slice 1 Changes):**
  - `npx tsc --noEmit` (`lint_applet`): **PASS** (0 errors).
  - `npm run build` (`compile_applet`): **PASS** (Vite build succeeded).
  - `npx tsx scripts/test_phase9a_slice1.ts`: **PASS** (89 passed, 0 failed).
  - `npx tsx scripts/test_type13_hardening.ts`: **PASS** (exit 0).
  - `npx tsx scripts/test_session_identity_suite.ts`: **PASS** (626 passed, exit 0).
  - `npx tsx scripts/test_compressed_transport.ts`: **PASS** (exit 0).
  - `npx tsx scripts/test_experimental_draw_trial.ts`: **PASS** (exit 0).
  - `npx tsx scripts/test_repair_seamless_handover.ts`: **PASS** (exit 0).
  - `npx tsx scripts/test_controlled_fixes_suite.ts`: **PASS** (exit 0).
  - `npx tsx scripts/test_full_canvas_replay_experiment.ts`: **PASS** (5 passed, 0 failed, exit 0).
  - `npx tsx scripts/test_payload_validation_suite.ts`: **PASS** (212 passed, exit 0).
  - `npx tsx scripts/test_legacy1a_routing.ts`: **PASS** (exit 0).
  - `npx tsx scripts/test_legacy1c_unknown_room_routing.ts`: **PASS** (exit 0).
  - `npx tsx scripts/test_codec.ts`: **PASS** (13 test cases passed, exit 0).

- **Performance & Compatibility Notes:**
  - Slice 1 runtime overhead is $O(1)$ per packet (two scalar integer checks in `handleDrawBinary` and direct equality checks in `decodeBinaryDrawMessage`), with zero heap allocations, zero buffer copies, zero hot-path loops, and zero `console.log` additions (`AGENTS.md` compliant).
  - Memory footprint decreases under spoofed/malformed `Type 0/11/12/14..255` or non-canonical `Type 13` traffic because those frames are no longer appended to `room.gameState.drawHistory`.
  - **`Type 10` Compatibility Limitation:** Legacy `Type 10` behavior is preserved (`server/roomDrawingHistory.ts:100`, `server.ts:79`, ingress pass-through, explicit `'draw_clear'` decode), but `.git` history and original producers are absent so its exact legacy packet format remains unverified; synthetic tests validate compatibility behavior only.
  - **Remaining Risks (Deferred to Slices 2–5):** `Type 2` trailing bytes (`roomCanonicalStrokeEngine.ts:132-149`), unchecked lengths on client `Types 1, 3, 4, 5, 6, 7, 8, 9`, unbounded `Type 10` trailing bytes, `DrawingCanvasCore.tsx:2987` passing `NaN` if a malformed `Type 4` decodes to `null` (non-crashing), `maxHttpBufferSize: 1e8`, and absent per-socket `draw_binary` rate limits.
  - **Rollback Instructions (Slice 1 Only):** Revert the two `if (type === ...)` guards at `server/registerDrawBinaryHandler.ts:118-123`, restore the fallback `let eventName = 'draw_clear'` block in `src/utils/drawBinaryHelper.ts:629-658`, remove `scripts/test_phase9a_slice1.ts`, and re-run `npx tsc --noEmit` + `npm run build`.

- **Completion Criteria:**
  - Exact binary schemas, directionality, byte bounds, and field constraints defined and enforced at server ingress (`handleDrawBinary`) for every allowed packet type (`1`–`9`, `13`), with `Type 10` compatibility resolved separately and `server/roomDrawingHistory.ts:100` left unchanged.
  - Trailing-byte rejection on `Type 2`, `Type 7`, `Type 9`, etc., matching `Type 13` strictness.
  - Client-originated `Type 11` / `Type 12` and truly unknown packet types (`0`, `14..255`) rejected cleanly on server ingress; client `decodeBinaryDrawMessage` no longer maps unknown packet types (`0`, `14..255`) to `'draw_clear'`. *(Slice 1 implemented — Awaiting Verification.)*
  - Safe `maxHttpBufferSize` tuned and documented with compatibility proof.
  - Automated validation test suite covering malformed, truncated, oversized, trailing-byte, spoofed, and valid packets passes alongside `npx tsc --noEmit`, `npm run build`, and existing Phase 5–8 test suites.

- **Current Status:**  
  `IN PROGRESS — Slice 1 AWAITING VERIFICATION (Slices 2–5 Not Started)`

- **Next Exact Action:**  
  `Complete manual multiplayer game verification for Slice 1 (drawing, clear, undo/redo, repair, sync), then review and approve Slice 2.`

---

#### `PHASE 9A — Implementation Blueprint & Slice Tracker`

**Status:** `IN PROGRESS — Slice 1 AWAITING VERIFICATION`

##### 1. Decisions Supported by Evidence (Resolved A–F & Decoder Null Safety)

1. **Decision A — Legacy `Type 10` Policy (Finalized for Slice 1 — Preserve Without Unproven Length Clamping):**
   - *Evidence:* Exhaustive workspace search confirms zero current client or server producers of `Type 10`, and no `Type 10` test fixtures exist in `scripts/`. Workspace `.git` history is unavailable (`NO_GIT`), so past encoders cannot be inspected. `Type 10` is explicitly protected in `server/roomDrawingHistory.ts:100` (`type === 4 || type === 10 || type === 5`, `AGENTS.md:16`), handled as legacy clear/action in `server.ts:79` (`getJsonSafeHistory`), and decoded to `'draw_clear'` via fallback in `src/utils/drawBinaryHelper.ts:629-642` (meanwhile `isClearCommand` in `src/utils/canvasCommandHelpers.ts:18` and `src/utils/bucketCheckpointPolicy.ts:25` only checks `byte0 === 5`, so historical `Type 10` entries clear via `replaySingleCommand` rather than clear-index jump). **Its exact legacy wire format/length remains unknown.**
   - *Blueprint Decision:* Classify packet opcodes distinctly: `Type 5` = explicit current clear; `Type 10` = explicit legacy clear (preserved); `Type 11`/`12` = server-originated control packets; `Type 0` & `14..255` = unsupported/unknown. Preserve explicit `Type 10 -> 'draw_clear'` in `decodeBinaryDrawMessage`, do not reject `Type 10` on server ingress in Slice 1, do not invent an exact byte length for `Type 10`, and leave `server/roomDrawingHistory.ts:100` (`AGENTS.md`) and `server.ts:79` untouched.

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

6. **Decision F — Truly Unknown Packet Types (`0`, `14..255`), Server-Only Directions (`Type 11`, `12`), & Decoder Null Safety:**
   - *Evidence:* Client `decodeBinaryDrawMessage(` has 7 production call sites across `src/`:
     - `src/components/game/DrawingCanvasCore.tsx:2228` (`tryFastPathUndo` diag) — checks `if (dec && ...)` (**safe**).
     - `src/components/game/DrawingCanvasCore.tsx:2478` (`executeRedo` Free Draw/Exp) — checks `if (!decoded || !decoded.data) return;` (**safe**).
     - `src/components/game/DrawingCanvasCore.tsx:2915` (`replayFreeDrawHistorySafely` diag) — checks `if (dec && ...)` (**safe**).
     - `src/components/game/DrawingCanvasCore.tsx:2987` (`replayFreeDrawHistorySafely` batch bucket path under `isBucketCommand`) — uses `decoded?.data || {}`; does not crash on `null`, though without an explicit skip `data.x * LOGICAL_WIDTH` would pass `NaN` to `executeRasterFloodFill` if a `Type 4` command ever decoded to `null` (unknown types `0/14..255` cannot enter this branch because `isBucketCommand` checks `byte0 === 4` or `event === 'draw_action'`).
     - `src/components/game/DrawingCanvasCore.tsx:3124` (`onDrawBinary`, also fed by `pendingBinaryQueueRef` drains at `4097, 4278, 4288`) — checks `if (!decoded) return;` and `if (!data) return;` (**safe**).
     - `src/components/game/DrawingCanvasCore.tsx:3541` (`onDrawBinary` remote `draw_undo` lookup) — checks `if (dec?.data)` (**safe**).
     - `src/utils/canvasReplayEngine.ts:103` (`replaySingleCommand`, called by `applyReplayCommand` at `DrawingCanvasCore.tsx:2641` for undo replay `2238`, full sync `2697`, mid-history replay `3055`, and chunked join sync `3861`) — checks `if (!decoded || !decoded.data) return 'none';`, and `applyReplayCommand` handles `'none'` as a benign no-op without halting replay loops (**safe**).
     - Test scripts in `scripts/` (`test_repair_seamless_handover.ts:180,263`, `test_experimental_draw_trial.ts:148,214`, `test_controlled_fixes_suite.ts:365,664`, `test_full_canvas_replay_experiment.ts:175`, `test_type13_hardening.ts:56..240`) guard `null` appropriately; `scripts/test_compressed_transport.ts:84, 139, 198` dereference without null checks (valid `Type 13` test payloads only).
   - *Blueprint Decision:* Returning `null` for truly unknown types (`0`, `14..255`) introduces zero runtime exceptions, zero broken replay/history sync/repair, and zero unexpected early exits across `src/`. Reject client-originated `Type 11`, `Type 12`, and truly unknown packet types (`0`, `14..255`) silently on server ingress (**Slice 1**), and update `src/utils/drawBinaryHelper.ts:629-642` so `eventName = 'draw_clear'` applies **explicitly** to `type === MSG_DRAW_CLEAR` (`5`) and `type === 10` (while keeping `Type 11` and `Type 12` server control decoding intact), returning `null` for all unknown types (`0`, `14..255`).

##### 2. Decisions Still Requiring Evidence / Approval Before Coding (Later Slices `2–5`)

1. **Future Long-Term Disposition of `Type 10` (Post-Slice 1):** Because `.git` history and original `Type 10` encoders are absent in this workspace (`NO_GIT`), `Type 10` exact legacy wire length remains unknown; deprecating or tightening `Type 10` length bounds remains deferred unless historical evidence later confirms it is safe.
2. **`Type 4` (`draw_action` / Bucket) Exact Length vs. Existing `AUTH-11.1` Test Helper (Slice 4):** Real client `encodeBinaryDrawMessage('draw_action')` emits only `{17, 19, 21, 23}` bytes (`src/utils/drawBinaryHelper.ts:286-321`), whereas `scripts/test_session_identity_suite.ts:1061` (`makeType4`, `AUTH-11.1`) passes `Buffer.alloc(20)` directly into `handleDrawBinary` (`line 1153`). Confirm whether to update `makeType4` to `17`/`21` bytes alongside strict `{17, 19, 21, 23}` server enforcement, or defer strict length checking to its own step.
3. **Client-Side `3,000`-Point UX Policy (`DrawingCanvasCore.tsx`, Slice 3):** Confirm whether reaching `3,000` points during a single continuous stroke should (a) cleanly finalize/auto-split into a new stroke on client + canonical server, or (b) honor incoming `Type 12` (`draw_abort`) from the server by cancelling/discarding the local provisional stroke cleanly without inserting an oversized `Type 9` into `localCommandsRef`.
4. **`Type 5` (`draw_clear`) Empty `instId` Tolerance (Slice 2):** Verify whether any client or test path calls `encodeBinaryDrawMessage('draw_clear', {})` with an empty `instId`, vs. always attaching caller `instanceId` (`DrawingCanvasCore.tsx:2102, 2113`).
5. **Canonical `instId` Character Set (Slice 2):** Decide whether to retain `/^[a-zA-Z0-9_-]{1,7}$/` permanently in binary headers (full test compatibility) or standardize tests on `/^[a-zA-Z0-9]{1,7}$/` to match `draw_repair_req` and `registerDrawingIdentity`.
6. **Exact `maxHttpBufferSize` Target & `join_room` Field Caps (Slice 5):** Confirm target `maxHttpBufferSize` (`512 KiB` vs. `1 MiB` initially; `256 KiB` post-Slice-3) and whether `join_room` (`nickname`, `avatar`, `playerId`, `reconnectSecret`) should receive explicit string length bounds in the same or follow-up implementation change.
7. **Per-Socket `draw_binary` / `start_free_draw` Rate Limits (Post-Slice 5 / Deferred):** Gather empirical event-rate/byte-rate measurements from rapid pencil strokes (`200ms` batches) and quick bucket clicks before setting throttle constants so legitimate drawers are never dropped.

##### 3. Proposed Implementation Slices (In Order)

1. **Slice 1 — Narrow Ingress Direction Filtering, Non-Canonical `Type 13` Block & Client Decoder Unknown-Type Null Fix *(AWAITING VERIFICATION — Implemented & Automated Checks Passed)***
   - *Goal:* Stop spoofed server control injection (`Type 11`/`12`), reject truly unknown opcodes (`0`, `14..255`), block non-canonical `Type 13` bypass, and stop client `decodeBinaryDrawMessage` from turning unknown opcodes into `'draw_clear'`, without absorbing Slices 2–5 or breaking `Type 10`.
   - *Files:* `server/registerDrawBinaryHandler.ts`, `src/utils/drawBinaryHelper.ts`, `scripts/test_phase9a_slice1.ts`.
   - *Implemented Scope (ONLY):*
     - **A. Server ingress direction filtering (`handleDrawBinary`):** Rejected client-originated `Type 11` and `Type 12`; rejected unsupported/unknown types `0` and `14..255`; preserved `Type 10` (without inventing a `Type 10` length check or altering `server/roomDrawingHistory.ts:100` or `server.ts:79`); preserved all legitimate client drawing types (`1..9` and canonical `13`).
     - **B. Non-canonical `Type 13` handling (`handleDrawBinary`):** Rejected client-originated `Type 13` cleanly when `!useCanonicalPipeline`, while preserving canonical `handleFreeDrawMoveCompressed` validation and relay when `useCanonicalPipeline === true`.
     - **C. Client decoder fallback correction (`decodeBinaryDrawMessage`):** Explicitly handled `Type 5` (`MSG_DRAW_CLEAR`) and `Type 10` as `'draw_clear'`; preserved `Type 11` (`draw_commit`) and `Type 12` (`draw_abort`) as recognized server control messages; returned `null` for truly unknown types (`0`, `14..255`). No caller edits were needed (`src/` callers already handle `null` safely).
   - *Explicitly Excluded From Slice 1 (Assigned to Slices 2–5):*
     - `Type 2` exact-length correction (`Slice 2`)
     - `Type 1` or `Type 3` structural validation (`Slice 2`)
     - `Type 4` bucket size validation (`Slice 4`)
     - `Type 5` or `Type 6` full schema hardening (`Slice 2`)
     - `Type 7` or `Type 8` validation (`Slice 2`)
     - `Type 9` point-count or Redo changes (`Slice 3`)
     - Transport `maxHttpBufferSize` changes (`Slice 5`)
     - Rate limiting (`Deferred`)
     - `instanceId` policy changes (`Slice 2`)
   - *Verification Status:* `npx tsc --noEmit`, `npm run build`, `scripts/test_phase9a_slice1.ts` (89/89), and all 11 baseline suites passed. Pending manual gameplay verification.

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
   - *Scope:* Lower `maxHttpBufferSize` (`524_288` / `1_048_576`, or `262_144` after Slice 3 confirms `Type 9` ceiling), leaving `PORT` resolution logic (`server.ts:103-107`) unchanged; document measured overhead for `draw_history_sync` & MsgPack frames.
   - *Acceptance Criteria:* Large `> maxHttpBufferSize` frames disconnect/reject cleanly at transport layer; max valid `Type 13` (`18,010 B`), `Type 9` (`12,018 B`), `join_room`, and normal reconnect `draw_history_sync` operate without regression.

##### 4. Tests & Acceptance Criteria Across Slices

- **Existing Verification Baseline (Must Stay Green):**
  - Static checks: `npx tsc --noEmit` and `npm run build`.
  - Protocol & Regression Suites in `scripts/` (run per slice): `scripts/test_type13_hardening.ts`, `scripts/test_compressed_transport.ts`, `scripts/test_session_identity_suite.ts`, `scripts/test_payload_validation_suite.ts`, `scripts/test_controlled_fixes_suite.ts`, `scripts/test_experimental_draw_trial.ts`, `scripts/test_repair_seamless_handover.ts`, `scripts/test_legacy1a_routing.ts`, `scripts/test_legacy1c_unknown_room_routing.ts`, `scripts/test_codec.ts`.
- **Slice 1 Regression Suite (`scripts/test_phase9a_slice1.ts` — Executed, 89/89 Passed):**
  1. Valid `Type 5` (`MSG_DRAW_CLEAR`) decodes to `'draw_clear'`, triggers server clear routing, and clears replay state.
  2. Synthetic `Type 10` explicitly decodes as `'draw_clear'`, passes `handleDrawBinary` -> `recordRoomDrawCommand` (`server/roomDrawingHistory.ts:100`), and produces replay effect `'clear'` *(compatibility-behavior check only; exact historical format remains unknown)*.
  3. Unknown `Type 0`, `14`, `15`, `99`, `255` return `null` in `decodeBinaryDrawMessage`, are rejected by `handleDrawBinary`, and return `'none'` without clearing replay state.
  4. Client-originated `Type 11` and `Type 12` are rejected at `handleDrawBinary` across Free Draw, Experimental, and Normal/Competitive rooms without broadcasting, `drawHistory` insertion, or mutating `isDrawingActive`.
  5. Non-canonical `Type 13` (`!useCanonicalPipeline`) is rejected cleanly without fallback relay or `drawHistory` insertion, while canonical `Type 13` succeeds and relays points normally.
  6. Server-originated `Type 11` (`handleFreeDrawEnd`) and `Type 12` (`abortFreeDrawStroke`) emit and decode accurately for clients.
  7. Supported client `Types 1..9` and `Type 13` codec roundtrips and Normal-room bucket/shape/redo flows remain intact.
- **New Targeted Tests Needed for Later Slices (`Slices 2–5`):**
  - Negative/boundary binary contract tests covering: `Type 2` trailing bytes (`+1`, `+1024`), `Type 1/3/4/5/6/7/8/9` truncated & trailing-byte buffers, all-zero `instId` (`""`), invalid tool indices (`9`, `255`), and canonical `Type 9` Redo after `>3,000`-pt strokes.

- **Current Status:**  
  `IN PROGRESS — Slice 1 AWAITING VERIFICATION (Slices 2–5 Not Started)`

- **Next Exact Action:**  
  `Complete manual multiplayer game verification for Slice 1 (drawing, clear, undo/redo, repair, sync), then review and approve Slice 2.`

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
