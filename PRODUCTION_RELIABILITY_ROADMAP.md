# PHASE 9 — Production Reliability & Resource Safety Roadmap

**Repository:** `hamoudi100hamoudi-beep/social-games-v1`  
**Workstream Owner Status:** Active  
**Governance:** All drawing/undo modifications must strictly comply with [`AGENTS.md`](./AGENTS.md) architectural invariants (`type === 4 || type === 10 || type === 5` first-action rule, 1-step undo/redo `isDrawingActive` lock, zero hot-path diagnostic logging, and zero $O(N)$ flat packet sweeps on reconnect).

---

## E. Current Checkpoint / Session Handoff

- **Active Phase / Task:** `PHASE 9A — Binary Packet Contract & Input Safety` (`IN PROGRESS — Slice 1 COMPLETED & VERIFIED; Slice 2 AWAITING VERIFICATION; Slices 3–5 Not Started`)
- **Last Completed Milestone:**
  - **PHASE 9A Slice 1 (`COMPLETED & VERIFIED`):** Protocol direction filtering, non-canonical `Type 13` blocking, and explicit client decoder handling with unknown opcodes returning `null`. Manually tested by the project owner (confirmed working normally) alongside passing `npx tsc --noEmit`, `npm run build`, `scripts/test_phase9a_slice1.ts` (89/89), and all 11 baseline regression suites.
  - **PHASE 9A Slice 2 (`AWAITING VERIFICATION`):** Enforced allocation-free O(1) structural packet validation across `Types 1, 2, 3, 5, 6, 7, 8` (`server/utils/binaryBufferHelpers.ts`, `server/roomCanonicalStrokeEngine.ts`, `server/registerDrawBinaryHandler.ts`), removed spurious canonical continuous `Type 3` raw fallback broadcast after `Type 12` aborts or orphaned/duplicate ends, updated outdated Normal `Type 7` fixtures (`AUTH-11.1`/`11.2`), added `scripts/test_phase9a_slice2.ts` (174/174), and verified all 13 test suites plus `tsc --noEmit` and `npm run build` cleanly.
- **Source Code Changes Made:**
  - **Slice 1:**
    - `server/registerDrawBinaryHandler.ts`: Added pre-routing guard rejecting client-originated `Type 11`, `Type 12`, `Type 0`, `Types 14..255`, and non-canonical `Type 13` (`!useCanonicalPipeline`) while preserving `Type 10` and `Types 1..9` / canonical `13`.
    - `src/utils/drawBinaryHelper.ts`: Replaced fallback `'draw_clear'` assignment in `decodeBinaryDrawMessage` with explicit branches for `Type 5` (`MSG_DRAW_CLEAR`), legacy `Type 10`, `Type 6`, `Type 7`, `Type 8`, and `return null` for unknown opcodes (`0`, `14..255`).
    - `scripts/test_phase9a_slice1.ts`: Slice 1 regression test suite (89 passed, 0 failed).
  - **Slice 2:**
    - `server/utils/binaryBufferHelpers.ts`: Added allocation-free `isValidInstIdBytes`, `extractValidatedInstId`, and `isAllowedStartOrEndTool` (`{0, 1, 3, 4, 5, 6, 7}`) helpers.
    - `server/roomCanonicalStrokeEngine.ts`: Tightened `handleFreeDrawStart` (`=== 18`, tool allowlist, non-empty valid `instId`), `handleFreeDrawMove` (`!== 10 + count * 4`, non-empty valid `instId` checked before stroke lookup), and `handleFreeDrawEnd` (`23 || 27`, tool allowlist, non-empty valid `instId`).
    - `server/registerDrawBinaryHandler.ts`: Enforced exact structural validation per type (`Type 1`: `18 B`, tool `{0,1,3,4,5,6,7}`, non-empty `instId`, canonical broadcast gated on `handleFreeDrawStart`; `Type 2`: `>= 10 B` and `=== 10 + count * 4` in both canonical and Normal paths; `Type 3`: `23 || 27 B`, tool `{0,1,3,4,5,6,7}`, non-empty `instId`, removed canonical continuous raw `Type 3` fallback broadcast; `Type 5`: `8 B` allowing empty `""` or valid ASCII `instId`; `Type 6`: `8 B` non-empty `instId`; `Type 7`: `10 B` FD/Exp vs `8 B` Normal; `Type 8`: `8 B` Normal only). Left `Types 4, 9, 10` untouched.
    - `scripts/test_session_identity_suite.ts`: Added `makeType7Normal` (`8 B`) and updated `AUTH-11.1` / `AUTH-11.2` Normal-mode undo calls from `10 B` to `8 B`.
    - `scripts/test_phase9a_slice2.ts`: New Slice 2 regression test suite (174 passed, 0 failed).
- **Key Audit & Implementation Takeaways (PHASE 9A):**
  - **Slice 1 (`COMPLETED & VERIFIED`):** Client-originated `0`, `11`, `12`, `14..255`, and non-canonical `13` are silently dropped before `drawHistory`, broadcast, or state mutation; `decodeBinaryDrawMessage` returns `null` for `0` and `14..255` instead of `'draw_clear'`.
  - **Slice 2 (`AWAITING VERIFICATION`):**
    - `Type 1` (`18 B`) and `Type 3` (`23` or `27 B`) enforce tool allowlist `{0, 1, 3, 4, 5, 6, 7}` (`bucket=2` and `pipette=8` rejected) and non-empty valid `[a-zA-Z0-9_-]{1,7}` ASCII `instId`.
    - `Type 2` enforces exact `buf.length === 10 + count * 4` in canonical and Normal paths with zero invented point-count caps (`count = 0` at `10 B` preserved; canonical `3,000`-pt abort limit preserved).
    - Canonical continuous `Type 3` emits only `Type 11` on commit or `Type 12` on cancel/expiry abort; orphaned/duplicate `Type 3` drops silently with zero raw `Type 3` broadcast. Shape & Normal `Type 3` behavior preserved.
    - `Type 5` (`8 B`) preserves all-zero empty `instId === ""` compatibility for `DrawingCanvasCore.tsx:2100, 2119` alongside non-empty valid `instId`; `Type 6` (`8 B`), `Type 7` (`10 B` FD/Exp vs `8 B` Normal), and `Type 8` (`8 B` Normal only) reject truncated, trailing-byte, and malformed control/padding packets.
  - **`Type 10` Compatibility Limitation:** Legacy `Type 10` remains accepted on server ingress (with `server/roomDrawingHistory.ts:100` and `server.ts:79` untouched per `AGENTS.md`) and explicitly decoded as `'draw_clear'`. Because workspace `.git` history and original `Type 10` producers are absent, its exact historical wire format remains unknown.
  - **Remaining Deferred Scope (`Slices 3–5`):** `Type 9` / `>3,000`-pt Redo alignment (`Slice 3`), `Type 4` (`draw_action`) & decoder `DataView` pre-checks (`Slice 4`), `maxHttpBufferSize` reduction (`Slice 5`), and rate limiting remain unstarted.
- **Exact Next Action:**
  `Complete manual gameplay verification for PHASE 9A Slice 2 (Normal, Free Draw, and Experimental drawing/undo/redo/clear/cancel/shape/bucket flows), then review and approve Slice 3.`

---

## A. Workstream Purpose & Scope

**Why This Workstream Exists:**  
While the codebase already passes static compilation and targeted feature test suites, production deployment requires strict hardening around untrusted binary Socket.IO inputs, bounded per-room memory growth and join/sync CPU cost, deterministic dependency installation, standardized test execution, CI verification, and ongoing dependency vulnerability management.

**Why Separate from `REFACTORING_ROADMAP.md`:**  
`REFACTORING_ROADMAP.md` tracks the completed modularization and UI/rendering architecture work (`PHASE 1` through `PHASE 8B`, all closed/completed). **PHASE 9 (`Production Reliability & Resource Safety`)** is a distinct operational, protocol-security, resource-lifecycle, and engineering-automation workstream so architectural cleanup history remains intact and unmixed with production hardening decisions.

---

## B. Master Task Checklist

- [ ] **PHASE 9A — Binary Packet Contract & Input Safety** *(`IN PROGRESS — Slice 1 COMPLETED & VERIFIED; Slice 2 AWAITING VERIFICATION; Slices 3–5 Not Started`)*
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
  *(Slice 1: COMPLETED & VERIFIED; Slice 2: AWAITING VERIFICATION; Slices 3–5: Not Started.)*

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
  - **Slice 1 (`COMPLETED & VERIFIED`):** Enforced ingress opcode/direction filtering (`0`, `11`, `12`, `14..255`, non-canonical `13`) in `server/registerDrawBinaryHandler.ts`, and replaced fallback `'draw_clear'` decoding in `src/utils/drawBinaryHelper.ts` with explicit handling for `Type 5`, legacy `Type 10`, `Type 6`, `Type 7`, `Type 8` and `return null` for unsupported opcodes (`0`, `14..255`).
  - **Slice 2 (`AWAITING VERIFICATION`):** Implemented O(1) structural validation across `Types 1, 2, 3, 5, 6, 7, 8` (exact lengths, `{0,1,3,4,5,6,7}` tool allowlist on `Type 1/3`, allocation-free `[a-zA-Z0-9_-]{1,7}` ASCII `instId` check with `Type 5` empty-`instId` compatibility, mode-split `Type 7` lengths `10 B` FD/Exp vs `8 B` Normal, `Type 8` Normal-only `8 B`, and removal of canonical continuous `Type 3` raw fallback broadcast) and aligned `AUTH-11.1`/`AUTH-11.2` Normal `Type 7` test fixtures.
  - **Deferred Decisions (`Slices 3–5`):** `Type 9` / Redo point-cap alignment, `Type 4` length reconciliation & client `DataView` pre-checks, `maxHttpBufferSize`, and rate limits remain scoped to `Slices 3–5`.

- **Files Modified:**  
  - `server/registerDrawBinaryHandler.ts` (Slice 1 ingress direction & non-canonical `Type 13` guard; Slice 2 structural validation on `Types 1, 2, 3, 5, 6, 7, 8` and canonical `Type 3` fallback broadcast removal)
  - `server/roomCanonicalStrokeEngine.ts` (Slice 2 `handleFreeDrawStart`, `handleFreeDrawMove`, and `handleFreeDrawEnd` structural/tool/`instId` enforcement)
  - `server/utils/binaryBufferHelpers.ts` (Slice 2 allocation-free `isValidInstIdBytes`, `extractValidatedInstId`, and `isAllowedStartOrEndTool` helpers)
  - `src/utils/drawBinaryHelper.ts` (Slice 1 explicit clear/control opcode branches & `null` for `0, 14..255`)
  - `scripts/test_session_identity_suite.ts` (Slice 2 `makeType7Normal` helper and `AUTH-11.1` / `AUTH-11.2` 8-byte Normal `Type 7` fixture correction)
  - `scripts/test_phase9a_slice1.ts` (Slice 1 regression test suite)
  - `scripts/test_phase9a_slice2.ts` (Slice 2 regression test suite)
  - `PRODUCTION_RELIABILITY_ROADMAP.md` (status, verification results, limitations, rollback record)

- **Manual & Automated Verification Results (Slice 1 & Slice 2):**
  - **Slice 1 Manual Verification:** Tested manually by the project owner and reported as working normally *(no individual unverified gameplay sub-tests claimed)*.
  - **Slice 2 Manual Verification:** *Pending project owner manual gameplay verification across Normal, Free Draw, and Experimental rooms.*
  - `npx tsc --noEmit` (`lint_applet`, post-Slice 2): **PASS** (0 errors).
  - `npm run build` (`compile_applet`, post-Slice 2): **PASS** (Vite build succeeded).
  - `npx tsx scripts/test_phase9a_slice2.ts`: **PASS** (`174 passed, 0 failed`, exit 0).
  - `npx tsx scripts/test_phase9a_slice1.ts`: **PASS** (`89 passed, 0 failed`, exit 0).
  - `npx tsx scripts/test_session_identity_suite.ts`: **PASS** (`626 passed`, exit 0).
  - `npx tsx scripts/test_type13_hardening.ts`: **PASS** (exit 0).
  - `npx tsx scripts/test_compressed_transport.ts`: **PASS** (exit 0).
  - `npx tsx scripts/test_experimental_draw_trial.ts`: **PASS** (exit 0).
  - `npx tsx scripts/test_repair_seamless_handover.ts`: **PASS** (exit 0).
  - `npx tsx scripts/test_controlled_fixes_suite.ts`: **PASS** (exit 0).
  - `npx tsx scripts/test_full_canvas_replay_experiment.ts`: **PASS** (`5 passed, 0 failed`, exit 0).
  - `npx tsx scripts/test_payload_validation_suite.ts`: **PASS** (`212 passed`, exit 0).
  - `npx tsx scripts/test_legacy1a_routing.ts`: **PASS** (exit 0).
  - `npx tsx scripts/test_legacy1c_unknown_room_routing.ts`: **PASS** (exit 0).
  - `npx tsx scripts/test_codec.ts`: **PASS** (`13 test cases passed`, exit 0).

- **Performance & Compatibility Notes:**
  - Slice 1 & Slice 2 runtime overhead is $O(1)$ per packet: at most a 7-byte integer loop (`isValidInstIdBytes`), exact `buf.length` integer comparisons, and scalar `buf[8]` bounds checks before state lookup or room broadcast — zero extra buffer allocations, zero history sweeps, and zero `console.log` telemetry (`AGENTS.md` compliant).
  - Network & memory impact improves strictly for malformed traffic: trailing-byte `Type 2`/`3`/`5`/`6`/`7`/`8` payloads and spurious raw `Type 3` packets after cancelled/expired/orphaned/duplicate canonical strokes are no longer relayed or appended to `drawHistory` (nor converted via `Array.from` during `join_room`/`request_round_sync`).
  - **`Type 10` Compatibility Limitation:** Legacy `Type 10` behavior is preserved (`server/roomDrawingHistory.ts:100`, `server.ts:79`, ingress pass-through, explicit `'draw_clear'` decode), but `.git` history and original producers are absent so its exact legacy packet format remains unverified; synthetic tests validate compatibility behavior only.
  - **Remaining Risks (Targeted by Slices 3–5):** Client-originated `Type 9` trailing bytes and `>3,000`-pt Free Draw Redo lifecycle (`Slice 3`), `Type 4` (`draw_action`) length/tool checks and client decoder `DataView` pre-checks (`Slice 4`, including `DrawingCanvasCore.tsx:2987` `NaN` multiplication if a malformed `Type 4` returns `null`), `maxHttpBufferSize: 1e8` (`Slice 5`), and absent per-socket `draw_binary` / `start_free_draw` rate limits.
  - **Rollback Instructions:**
    - *Slice 2:* Remove the Slice 2 helpers in `server/utils/binaryBufferHelpers.ts`, revert `handleFreeDrawStart`/`handleFreeDrawMove`/`handleFreeDrawEnd` in `server/roomCanonicalStrokeEngine.ts`, restore pre-Slice 2 branching in `server/registerDrawBinaryHandler.ts` (including previous `Type 3` canonical `else` broadcast), revert `makeType7Normal` in `scripts/test_session_identity_suite.ts`, delete `scripts/test_phase9a_slice2.ts`, and re-run `npx tsc --noEmit` + `npm run build`.
    - *Slice 1:* Revert the two `if (type === ...)` guards at `server/registerDrawBinaryHandler.ts:118-123`, restore the fallback `let eventName = 'draw_clear'` block in `src/utils/drawBinaryHelper.ts`, remove `scripts/test_phase9a_slice1.ts`, and re-run `npx tsc --noEmit` + `npm run build`.

- **Completion Criteria:**
  - Exact binary schemas, directionality, byte bounds, and field constraints defined and enforced at server ingress (`handleDrawBinary`) for every allowed packet type (`1`–`9`, `13`), with `Type 10` compatibility resolved separately and `server/roomDrawingHistory.ts:100` left unchanged.
  - Trailing-byte rejection on `Type 2`, `Type 7`, `Type 9`, etc., matching `Type 13` strictness. *(Types 1, 2, 3, 5, 6, 7, 8 enforced in Slice 2; Types 4 & 9 targeted in Slices 3–4.)*
  - Client-originated `Type 11` / `Type 12` and truly unknown packet types (`0`, `14..255`) rejected cleanly on server ingress; client `decodeBinaryDrawMessage` no longer maps unknown packet types (`0`, `14..255`) to `'draw_clear'`. *(Slice 1: `COMPLETED & VERIFIED`.)*
  - Safe `maxHttpBufferSize` tuned and documented with compatibility proof.
  - Automated validation test suite covering malformed, truncated, oversized, trailing-byte, spoofed, and valid packets passes alongside `npx tsc --noEmit`, `npm run build`, and existing Phase 5–8 test suites.

- **Current Status:**  
  `IN PROGRESS — Slice 1 COMPLETED & VERIFIED; Slice 2 AWAITING VERIFICATION (Slices 3–5 Not Started)`

- **Next Exact Action:**  
  `Complete manual gameplay verification for PHASE 9A Slice 2 (Normal, Free Draw, and Experimental drawing/undo/redo/clear/cancel/shape/bucket flows), then review and approve Slice 3.`

---

#### `PHASE 9A — Implementation Blueprint & Slice Tracker`

**Status:** `IN PROGRESS — Slice 1 COMPLETED & VERIFIED; Slice 2 AWAITING VERIFICATION`

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
4. **Canonical `instId` Character Set (Resolved for Slice 2 vs. Long-Term Choice):** Production clients emit `/^[a-z0-9]{1,7}$/i` (`DrawingCanvasCore.tsx:317`), while inspected regression suites use `_` and `-` (`loss_test`, `size_test`, `case_test`, `user_01`, `player-1`). Slice 2 retains `/^[a-zA-Z0-9_-]{1,7}$/` so existing tests remain green; migrating test fixtures to `/^[a-zA-Z0-9]{1,7}$/` remains an optional later cleanup.
5. **Exact `maxHttpBufferSize` Target & `join_room` Field Caps (Slice 5):** Confirm target `maxHttpBufferSize` (`512 KiB` vs. `1 MiB` initially; `256 KiB` post-Slice-3) and whether `join_room` (`nickname`, `avatar`, `playerId`, `reconnectSecret`) should receive explicit string length bounds in the same or follow-up implementation change.
6. **Per-Socket `draw_binary` / `start_free_draw` Rate Limits (Post-Slice 5 / Deferred):** Gather empirical event-rate/byte-rate measurements from rapid pencil strokes (`200ms` batches) and quick bucket clicks before setting throttle constants so legitimate drawers are never dropped.

##### 3. Proposed Implementation Slices (In Order)

1. **Slice 1 — Narrow Ingress Direction Filtering, Non-Canonical `Type 13` Block & Client Decoder Unknown-Type Null Fix *(COMPLETED & VERIFIED)***
   - *Goal:* Stop spoofed server control injection (`Type 11`/`12`), reject truly unknown opcodes (`0`, `14..255`), block non-canonical `Type 13` bypass, and stop client `decodeBinaryDrawMessage` from turning unknown opcodes into `'draw_clear'`, without absorbing Slices 2–5 or breaking `Type 10`.
   - *Files:* `server/registerDrawBinaryHandler.ts`, `src/utils/drawBinaryHelper.ts`, `scripts/test_phase9a_slice1.ts`.
   - *Verified Scope:*
     - **A. Server ingress direction filtering (`handleDrawBinary`):** Rejected client-originated `Type 11` and `Type 12`; rejected unsupported/unknown types `0` and `14..255`; preserved `Type 10` (without inventing a `Type 10` length check or altering `server/roomDrawingHistory.ts:100` or `server.ts:79`); preserved all legitimate client drawing types (`1..9` and canonical `13`).
     - **B. Non-canonical `Type 13` handling (`handleDrawBinary`):** Rejected client-originated `Type 13` cleanly when `!useCanonicalPipeline`, while preserving canonical `handleFreeDrawMoveCompressed` validation and relay when `useCanonicalPipeline === true`.
     - **C. Client decoder fallback correction (`decodeBinaryDrawMessage`):** Explicitly handled `Type 5` (`MSG_DRAW_CLEAR`) and `Type 10` as `'draw_clear'`; preserved `Type 11` (`draw_commit`) and `Type 12` (`draw_abort`) as recognized server control messages; returned `null` for truly unknown types (`0`, `14..255`).
   - *Verification Status:* **COMPLETED & VERIFIED** — manually tested by the project owner (reported working normally), alongside passing `npx tsc --noEmit`, `npm run build`, `scripts/test_phase9a_slice1.ts` (89/89), and all 11 baseline suites.

2. **Slice 2 — Canonical Stream & Control-Packet Structural Validation *(AWAITING VERIFICATION)***
   - *Goal:* Harden structural validation of supported stream and control packets (`Type 1`, `Type 2`, `Type 3`, `Type 5`, `Type 6`, `Type 7`, `Type 8`) without changing gameplay semantics, altering wire formats, adding arbitrary point-count caps, or breaking legitimate client compatibility.
   - *Files Modified:* `server/utils/binaryBufferHelpers.ts`, `server/roomCanonicalStrokeEngine.ts`, `server/registerDrawBinaryHandler.ts`, `scripts/test_session_identity_suite.ts` (corrected `AUTH-11.1` / `AUTH-11.2` Normal-mode `Type 7` fixture to 8 bytes), and `scripts/test_phase9a_slice2.ts` (174/174 passed).
   - **Resolved Final Compatibility Decisions (Types `1, 2, 3, 5, 6, 7, 8`):**
     1. **`Type 7` (`MSG_DRAW_UNDO`) Mode-Specific Length Policy:**
        - *Finding:* Normal-mode production client (`DrawingCanvasCore.tsx:2452`) always calls `emitDrawCommand('draw_undo', {})` -> **`8` bytes**. Free Draw / Experimental (`2407`) always calls `emitDrawCommand('draw_undo', { strokeId })` -> **`10` bytes**. Zero production client paths emit `10` bytes in Normal mode (`drawBinaryHelper.ts:644` treats `strokeId` at bytes `8..9` as optional strictly because Normal mode sends `8` bytes). `scripts/test_session_identity_suite.ts:1074, 1157` (`AUTH-11.1`) passes a `10`-byte packet in Normal mode only because the test helper `makeType7` defaulted `strokeId = 1`.
        - *Final Rule:* Enforce exact **`buf.length === 8`** in Normal / Competitive mode (`!isFreeDraw && !isExperimental`) and exact **`buf.length === 10`** in Free Draw / Experimental (`isFreeDraw || isExperimental`). Correct `AUTH-11.1` (`test_session_identity_suite.ts:1157`, and `1212` for consistency) to emit `8`-byte Normal `Type 7` packets alongside Slice 2 implementation rather than weakening production ingress.
     2. **`Type 1` (`MSG_DRAW_START`) & `Type 3` (`MSG_DRAW_END`) Tool Allowlist:**
        - *Finding:* `TOOLS_LIST` (`drawBinaryHelper.ts:68`) contains `0:'pencil'`, `1:'eraser'`, `2:'bucket'`, `3:'line'`, `4:'strokeRect'`, `5:'fillRect'`, `6:'strokeCircle'`, `7:'fillCircle'`, `8:'pipette'`. In `DrawingCanvasCore.tsx:5091-5213`, `bucket` (`2`) uses `Type 4` (`draw_action`) and returns early; `pipette` (`8`) is purely local sampling and emits no network packets. Only continuous tools (`0, 1`) and shape tools (`3, 4, 5, 6, 7`) emit `Type 1` (`4615, 4942`) and `Type 3` (`4891, 5021`); server catch-up `createType1Buffer` (`rooms.ts:1232`) emits only `0` or `1`. Accepting `2` (`bucket`) or `8` (`pipette`) on `Type 1`/`3` would spoof shape sessions (`activeSessionsRef`) and pollute `drawHistory`.
        - *Final Rule:* Reject `2` (`bucket`), `8` (`pipette`), and `9..255` on `Type 1` and `Type 3`. Exact allowed tool index set is **`{0, 1, 3, 4, 5, 6, 7}`** (`tool <= 7 && tool !== 2`). Note `isContinuousTool` stays `{0, 1}`.
     3. **`Type 2` (`MSG_DRAW_MOVE`) Zero-Count & Maximum-Count Boundary:**
        - *Finding:* Normal UI client (`DrawingCanvasCore.tsx:4739, 4809`) guards `moveBatchRef.current.length > 0`, so real clients never emit `count = 0`. However, canonical `decodeType13BufferSafely` (`binaryBufferHelpers.ts:48-53`) explicitly treats `count = 0` (`10` B) as a valid empty packet, and `defaultRelayFreeDrawMove` (`registerDrawBinaryHandler.ts:43` -> `createType2Buffer`) emits a `10`-B `count = 0` fallback buffer if relaying an empty `Type 13` (while `syncActiveFreeDrawStrokesToSocket` always has `>= 1` point). Client decoder (`drawBinaryHelper.ts:450-469`) also decodes `count = 0` (`10` B) as a benign `{ moves: [] }` no-op. In canonical mode (`roomCanonicalStrokeEngine.ts:137`), active strokes start with `p0` (`length = 1`) and abort at `stroke.points.length + count > 3000` -> max accepted `count = 2999` (existing canonical bound, max accepted `12,006` B). Normal mode has no client or server point-count cap (`UInt16LE` protocol ceiling `65,535` -> `262,150` B, transport-bounded later in Slice 5).
        - *Final Rule:* Enforce `buf.length >= 10` and exact `buf.length === 10 + buf.readUInt16LE(8) * 4` (with valid non-empty `instId`) across both `handleFreeDrawMove` and non-canonical `else`, with **zero newly invented point-count cap** (`count = 0` permitted at exact `10` B without introducing arbitrary `count >= 1` or max-count limits).
     4. **`Type 3` (`MSG_DRAW_END`) Cancelled, Expired, Orphaned & Duplicate Handling:**
        - *Finding:* Both `23`-B (no `strokeId`/`expectedPointCount`) and `27`-B (current extended metadata, `DrawingCanvasCore.tsx:4891, 5021`) variants are valid; `buf[22] === 1` marks cancelled. In canonical continuous mode (`useCanonicalPipeline && isContinuousTool`, `registerDrawBinaryHandler.ts:208-223`): (a) normal active stroke commits `[Type 9, Type 3]` in `drawHistory`, caches `Type 9`, deletes active stroke, and emits `Type 11` (`draw_commit`); (b) cancelled active stroke (`buf[22] === 1`) or expired active stroke (`> 60s`) triggers `abortFreeDrawStroke` (`rooms.ts:1305`), deleting active stroke and emitting `Type 12` (`draw_abort`), then returns `null`; (c) missing active stroke (orphan) or second duplicate `Type 3` returns `null`. Currently, `registerDrawBinaryHandler.ts:219-223` falls into `else { socket.broadcast.to(roomId).emit('draw_binary', buf); }` whenever `handleFreeDrawEnd` returns `null`, spuriously broadcasting raw `Type 3` **after** `Type 12` abort or without an active stroke. Meanwhile Shape (`!isContinuousTool`) and Normal-mode (`!useCanonicalPipeline`) `Type 3` route through `224-230` (preserving `roomDrawingHistory.ts:60` & spectator completion).
        - *Final Rule:* Enforce exact `buf.length === 23 || buf.length === 27`, valid non-empty `instId`, and tool in `{0, 1, 3, 4, 5, 6, 7}` before routing. In canonical continuous `Type 3` (`208-223`), emit `Type 11` on commit and **remove the spurious `else` raw `Type 3` broadcast** (`219-223`) so cancelled/expired strokes emit only `Type 12` and orphaned/duplicate strokes drop silently. Preserve existing Shape and Normal-mode `Type 3` routing (`224-230`) unchanged.
   - **Exact Finalized Slice 2 Implementation Rules:**
     - *Shared ASCII `instId` check (`server/registerDrawBinaryHandler.ts` & `server/roomCanonicalStrokeEngine.ts`):* Zero-allocation 7-byte scan accepting `[a-zA-Z0-9_-]{1,7}` (non-empty, zero control/non-ASCII bytes). Exception: **`Type 5` ONLY** allows all-zero `instId === ""` OR `[a-zA-Z0-9_-]{1,7}` (rejecting malformed non-zero control/non-ASCII bytes).
     - **`Type 1`:** `buf.length === 18` && non-empty valid `instId` && `buf[8] <= 7 && buf[8] !== 2`. Canonical continuous (`useCanonicalPipeline && isContinuousTool`): broadcast only if `handleFreeDrawStart(...) === true`.
     - **`Type 2`:** `buf.length >= 10` && non-empty valid `instId` && `buf.length === 10 + buf.readUInt16LE(8) * 4` (enforced in `handleFreeDrawMove` and non-canonical fallback).
     - **`Type 3`:** `(buf.length === 23 || buf.length === 27)` && non-empty valid `instId` && `buf[8] <= 7 && buf[8] !== 2`. Canonical continuous: only emits `Type 11` on commit or `Type 12` on abort (`handleFreeDrawEnd`), never re-broadcasting raw `buf` on `null` return. Shape/Normal mode: records & broadcasts structurally valid `23`/`27` B packets as before.
     - **`Type 5`:** `buf.length === 8` && `(instId === "" || isValidAsciiInstId(instId))` (preserving `DrawingCanvasCore.tsx:2100, 2119` empty-`instId` clear).
     - **`Type 6`:** `buf.length === 8` && non-empty valid `instId` (preserving current `recordDrawCommand` + broadcast behavior without redesigning canonical cleanup semantics).
     - **`Type 7`:** In `isFreeDraw || isExperimental`: `buf.length === 10` && non-empty valid `instId` (plus existing Free Draw `drawingIdentities` ownership gate). In Normal mode: `buf.length === 8` && non-empty valid `instId`.
     - **`Type 8`:** Reject `isFreeDraw || isExperimental`; in Normal mode: `buf.length === 8` && non-empty valid `instId`.
     - **`Type 10`:** Preserved untouched (`AGENTS.md` compatibility).
   - *Explicitly Excluded From Slice 2:* `Type 4` (`Slice 4`), `Type 9` & `>3,000`-pt Redo lifecycle (`Slice 3`), `Type 10` (`AGENTS.md`), `maxHttpBufferSize` (`Slice 5`), rate limits, client edits, and `Type 6` canonical stroke-abort semantic redesign.

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
- **Slice 2 Regression Suite (`scripts/test_phase9a_slice2.ts` — Executed, 174/174 Passed):**
  1. `Type 2` trailing bytes (`+1`, `+1024`) and truncated (`< 10`, `< 10 + count*4`) rejected in canonical (`Free Draw`/`Experimental`) & non-canonical (`Normal`) rooms; valid `10 + N*4` `Type 2` (including `count = 0` at `10` B, canonical `2999`-pt max, and large Normal-mode batches) passes without arbitrary count caps, while canonical `> 3,000` pts still aborts with `Type 12`.
  2. `Type 1` (`< 18`, `> 18` trailing bytes, disallowed tools `2` bucket / `8` pipette / `>= 9`, empty/control `instId`) rejected; valid `18 B` `Type 1` for `{0, 1, 3, 4, 5, 6, 7}` pass in all modes.
  3. `Type 3` (`22`, `24`, `26`, `28` trailing bytes, disallowed tools `2` / `8` / `>= 9`, empty/control `instId`) rejected; valid `23 B` and `27 B` `Type 3` (continuous commit & shape/Normal end) pass.
  4. Canonical continuous `Type 3` edge states: cancelled (`buf[22] === 1`) and expired (`> 60s`) emit ONLY `Type 12` (`draw_abort`) without raw `Type 3` broadcast; orphaned and duplicate `Type 3` drop silently without `Type 11` or raw `Type 3` broadcast.
  5. `Type 5` (`7`, `9`, `64` trailing bytes, malformed control/padding `instId`) rejected; valid `8 B` `Type 5` with BOTH empty all-zero `instId === ""` (`DrawingCanvasCore` production Clear!) AND non-empty `instId` pass.
  6. `Type 6` (`7`, `9`, `32` trailing bytes, empty/non-ASCII `instId`) rejected; valid `8 B` `Type 6` passes.
  7. `Type 7` in Free Draw / Experimental (`8`, `9`, `11`, `64` trailing bytes, empty `instId`) rejected; valid `10 B` passes.
  8. `Type 7` in Normal mode (`7`, `9`, `10`, `20` trailing bytes, empty `instId`) rejected; valid `8 B` Normal packet passes (`AUTH-11.1`/`AUTH-11.2` updated from `10 B` to `8 B`).
  9. `Type 8` (`7`, `9`, `16` trailing bytes, empty `instId`) rejected in Normal mode (and still rejected in Free Draw / Experimental); valid `8 B` passes in Normal mode.
  10. Canonical `instId === ""`, embedded null after padding, space, control, and non-ASCII bytes rejected across `Type 1/2/3/6/7/8`, while `[a-zA-Z0-9_-]{1,7}` test IDs remain accepted.
  11. Zero regression on `Type 10` compatibility (`test_phase9a_slice1.ts`) and all 11 existing `scripts/` regression suites.
- **Later Slices (`3–5`):** `Type 9` truncated/trailing-byte/`>3,000`-pt Redo tests (`Slice 3`), `Type 4` `{17,19,21,23}` & decoder `DataView` bounds (`Slice 4`), and `maxHttpBufferSize` boundary checks (`Slice 5`).

- **Current Status:**  
  `IN PROGRESS — Slice 1 COMPLETED & VERIFIED; Slice 2 AWAITING VERIFICATION (Slices 3–5 Not Started)`

- **Next Exact Action:**  
  `Complete manual gameplay verification for PHASE 9A Slice 2 (Normal, Free Draw, and Experimental drawing/undo/redo/clear/cancel/shape/bucket flows), then review and approve Slice 3.`

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
