# PHASE 9 — Production Reliability & Resource Safety Roadmap

**Repository:** `hamoudi100hamoudi-beep/social-games-v1`  
**Workstream Owner Status:** Active  
**Governance:** All drawing/undo modifications must strictly comply with [`AGENTS.md`](./AGENTS.md) architectural invariants (`type === 4 || type === 10 || type === 5` first-action rule, 1-step undo/redo `isDrawingActive` lock, zero hot-path diagnostic logging, and zero $O(N)$ flat packet sweeps on reconnect).

---

## E. Current Checkpoint / Session Handoff

- **Active Phase / Task:** `PHASE 9A — Binary Packet Contract & Input Safety` (`IN PROGRESS — Slices 1–4, 5A, 5B, 5C-1, 5C-2 & 5C-3A COMPLETED & VERIFIED; Slice 5C-3B AWAITING OWNER VERIFICATION`)
- **Last Completed Milestone:**
  - **PHASE 9A Slice 1 (`COMPLETED & VERIFIED`):** Protocol direction filtering, non-canonical `Type 13` blocking, and explicit client decoder handling with unknown opcodes returning `null`. Manually verified by the project owner alongside passing `npx tsc --noEmit`, `npm run build`, `scripts/test_phase9a_slice1.ts` (89/89), and all 11 baseline regression suites.
  - **PHASE 9A Slice 2 (`COMPLETED & VERIFIED`):** Enforced allocation-free O(1) structural packet validation across `Types 1, 2, 3, 5, 6, 7, 8` (`server/utils/binaryBufferHelpers.ts`, `server/roomCanonicalStrokeEngine.ts`, `server/registerDrawBinaryHandler.ts`), removed spurious canonical continuous `Type 3` raw fallback broadcast after `Type 12` aborts or orphaned/duplicate ends, updated Normal `Type 7` fixtures (`AUTH-11.1`/`11.2`), added `scripts/test_phase9a_slice2.ts` (174/174), passed all 13 test suites plus `tsc --noEmit` and `npm run build`, and was manually verified by the project owner.
  - **PHASE 9A Slice 3 (`COMPLETED & VERIFIED`):** Implemented Hybrid Option D (Sub-slice 3A client originating `Type 12` Case 1/2 abort rollback + D1 prospective automatic long-stroke segmentation in `DrawingCanvasCore.tsx`; Sub-slice 3B O(1) `Type 9` server ingress validation in `binaryBufferHelpers.ts` & `registerDrawBinaryHandler.ts`; added `scripts/test_phase9a_slice3.ts` 71/71 passing). Reported manually verified in gameplay by the project owner alongside passing `tsc --noEmit`, `npm run build`, and all 14 existing regression suites.
  - **PHASE 9A Slice 4 (`COMPLETED & VERIFIED`):** Implemented `isValidType4Packet` (`{17, 19, 21, 23}`, `tool === 2`, `opacity <= 100`, `x/y <= 10000`), isolated `Type 4` in `registerDrawBinaryHandler.ts`, hardened client `decodeBinaryDrawMessage` (`DataView` pre-checks + pooled 0-length `Buffer` fix), added `getValidBatchBucketPayload` NaN guard in `DrawingCanvasCore.tsx`, updated `makeType4` (`scripts/test_session_identity_suite.ts:1060`), and added `scripts/test_phase9a_slice4.ts`. Fixed Slice 4 test-harness exit hang by wrapping `stopManagerTimer(rm)` in `try/finally` blocks and adding the Slices 1–3 `process.exit(0)` termination call on success (required because importing `DrawingCanvasCore.tsx` triggers `SocketProvider.tsx`'s module-level un-exported `socketInstance` auto-connect/reconnection loop). Verified: `scripts/test_phase9a_slice4.ts` passes (`36 passed, 0 failed`, exit code `0` without external timeout), `scripts/test_session_identity_suite.ts` passes (`626` passed, exit `0`), `npx tsc --noEmit` PASS, `npm run build` PASS, and *"The project owner tested the game manually and confirmed that it works normally."*
  - **PHASE 9A Slice 5A (`COMPLETED & VERIFIED`):** Implemented O(1) constant-memory per-socket dual token bucket protection for `draw_binary` ingress (`server/drawRateLimit.ts`, `server/registerDrawBinaryHandler.ts`, `server.ts` disconnect cleanup), pre-bucket O(1) header & `Type 13` work-cost accounting (`80` pkt burst / `35` pkt/s refill; `524,288` work burst / `65,536`/s refill), and active-stroke cleanup on throttled stream/end packets to prevent ghost strokes or canvas desync. Verified by `scripts/test_phase9a_slice5a.ts` (`26/26` passed, exit `0`) and project owner manual verification of normal gameplay.
  - **PHASE 9A Slice 5B (`COMPLETED & VERIFIED`):** Reduced Socket.IO server `maxHttpBufferSize` from `1e8` (100,000,000 B) to exact `512 * 1024` (`524,288` B / `512 KiB`) via shared constant `MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES` (`server/transportConfig.ts`, `server.ts`), preserving WebSocket-only transport, `socket.io-msgpack-parser` (`3.0.2`), client `SocketProvider.tsx`, and uncompressed transport config. Verified on live Socket.IO + Engine.IO + MsgPack WebSocket server (`scripts/test_phase9a_slice5b.ts`: `16/16` passed, exit `0`) and project owner manual verification of normal gameplay.
  - **PHASE 9A Slice 5C-1 (`COMPLETED & VERIFIED`):** Hardened remaining control-event input boundaries and drawing identity ownership without duplicating existing rate limits: early structural/length/control-character bounds on `join_room` (deferring `supportsType13` capability write until authenticated join/reconnect success), `MAX_DRAWING_IDENTITIES_PER_SOCKET = 2` per room + `instanceId.length <= 64` pre-trim check on `register_drawing_identity`/`unregister_drawing_identity`, strict `supportsType13` boolean allowlist via `sanitizeClientCapabilities` on `client_capabilities`, early `get_room_info` validation (`handleGetRoomInfo`) returning default stats cleanly with zero `TypeError`/`console.error` spam, pre-trim length/array guards on `send_message`, `submit_guess`, `select_word`, and `draw_repair_req`, and early `submit_vote_kick` payload/rate-limit gating before `room.players.find`. Verified by `scripts/test_phase9a_slice5c1.ts` (`27/27` passed, exit `0`), `npx tsc --noEmit` (`0` errors, exit `0`), `npm run build` (exit `0`), and regression suites (`test_payload_validation_suite.ts` `212 passed`, `test_session_identity_suite.ts` `626 passed`, `test_leave_room_integrity.ts` `78 passed`, `test_state_transition_reset.ts` `6 passed`).
  - **PHASE 9A Slice 5C-2 (`COMPLETED & VERIFIED`):** Added O(1) constant-memory per-socket token buckets (`ControlRateLimiter` in `server/rateLimit.ts`) for `join_room` (4/0.5s), `get_room_info` (10/5s), `get_rooms_info` (4/1s), shared `start_free_draw`/`stop_free_draw` (`free_draw_toggle` 4/1s), shared `register_drawing_identity`/`unregister_drawing_identity` (`drawing_identity` 8/2s), and `request_drawing_identities` (4/1s) with `defaultControlRateLimiter.cleanupSocket(socket.id)` on disconnect, while preserving `leave_room`, `client_capabilities`, and existing Slice 5A / chat / guess / vote-kick / sync / repair limiters. Verified by `scripts/test_phase9a_slice5c2.ts` (`17/17` passed, exit `0`) and project owner manual verification of normal gameplay.
  - **PHASE 9A Slice 5C-3A (`COMPLETED & VERIFIED`):** Hardened server-side Vote-Kick in `server/registerVoteKickHandler.ts`, `src/types/game.ts`, and `server/rooms.ts` with authoritative self-vote rejection (`cannot_vote_self`), a separate 60,000ms `(voterId, targetPlayerId)` cooldown for `votekick_alert` notifications without blocking vote withdrawal/changes or existing `3/2s` rate limits, duplicate unvote `sendStateToPlayer` removal, and lifecycle cleanup of `room.votekicks` / `room.votekickAlertCooldowns` in `removePlayerFromRoom`. Verified by `scripts/test_phase9a_slice5c3a.ts` (`27/27` passed, exit `0`) and project owner manual verification of normal gameplay.
  - **PHASE 9A Slice 5C-3B (`AWAITING OWNER VERIFICATION`):** Removed untrusted `socket.onAny` / `PASSIVE_BACKGROUND_EVENTS` global activity tracking from `server.ts` and centralized O(1) activity tracking (`markPlayerActive`, `handlePingActivity` in `server/controlInputValidation.ts`) so `player.lastActivity` updates and `player.afkWarningSent` resets happen strictly on genuine accepted gameplay actions, valid `join_room` / `reconnectPlayer` transitions, and explicit `ping_activity`, preserving the 140s warning threshold, 90s eviction countdown (230s total), and 90s silent disconnect grace timer. Verified by `scripts/test_phase9a_slice5c3b.ts` (`46/46` passed, exit `0`), `npx tsc --noEmit` (`0` errors, exit `0`), `npm run build` (exit `0`), `test_phase9a_slice5c3a.ts` (`27/27`), `test_phase9a_slice5c2.ts` (`17/17`), `test_payload_validation_suite.ts` (`212 passed`), `test_session_identity_suite.ts` (`626 passed`), `test_leave_room_integrity.ts` (`78 passed`), and `test_state_transition_reset.ts` (`6 passed`). **Awaiting owner manual gameplay verification before closing PHASE 9A.**
- **Source Code Changes Made:**
  - **Slice 1:**
    - `server/registerDrawBinaryHandler.ts`: Added pre-routing guard rejecting client-originated `Type 11`, `Type 12`, `Type 0`, `Types 14..255`, and non-canonical `Type 13` (`!useCanonicalPipeline`) while preserving `Type 10` and `Types 1..9` / canonical `13`.
    - `src/utils/drawBinaryHelper.ts`: Replaced fallback `'draw_clear'` assignment in `decodeBinaryDrawMessage` with explicit branches for `Type 5` (`MSG_DRAW_CLEAR`), legacy `Type 10`, `Type 6`, `Type 7`, `Type 8`, and `return null` for unknown opcodes (`0`, `14..255`).
    - `scripts/test_phase9a_slice1.ts`: Slice 1 regression test suite (89 passed, 0 failed).
  - **Slice 2:**
    - `server/utils/binaryBufferHelpers.ts`: Added allocation-free `isValidInstIdBytes`, `extractValidatedInstId`, and `isAllowedStartOrEndTool` (`{0, 1, 3, 4, 5, 6, 7}`) helpers.
    - `server/roomCanonicalStrokeEngine.ts`: Tightened `handleFreeDrawStart` (`=== 18`, tool allowlist, non-empty valid `instId`), `handleFreeDrawMove` (`!== 10 + count * 4`, non-empty valid `instId` checked before stroke lookup), and `handleFreeDrawEnd` (`23 || 27`, tool allowlist, non-empty valid `instId`).
    - `server/registerDrawBinaryHandler.ts`: Enforced exact structural validation per type (`Type 1`, `Type 2`, `Type 3`, `Type 5`, `Type 6`, `Type 7`, `Type 8`) and removed canonical continuous `Type 3` raw fallback broadcast. Left `Types 4, 9, 10` untouched.
    - `scripts/test_session_identity_suite.ts`: Added `makeType7Normal` (`8 B`) and updated `AUTH-11.1` / `AUTH-11.2` Normal-mode undo calls from `10 B` to `8 B`.
    - `scripts/test_phase9a_slice2.ts`: New Slice 2 regression test suite (174 passed, 0 failed).
  - **Slice 3:**
    - `server/utils/binaryBufferHelpers.ts`: Added O(1) `isValidType9Packet(buf, useCanonicalPipeline)` enforcing `>= 16 B`, valid non-empty ASCII `instId`, tool allowlist `{0, 1, 3, 4, 5, 6, 7}`, `pointsLength >= 1` (`=== 2` for shapes `{3..7}`), canonical `<= 3,000` pts with required 2-byte `strokeId` (`16 + N*4 + 2`), and Normal-mode `1..65,535` pts (`26 B` for shapes; `16 + N*4` or `16 + N*4 + 2` for continuous).
    - `server/registerDrawBinaryHandler.ts`: Added explicit `else if (type === 9)` branch invoking `isValidType9Packet(buf, useCanonicalPipeline)` before `recordDrawCommand` / broadcast (leaving `Type 4` Bucket and legacy `Type 10` completely untouched).
    - `src/components/game/DrawingCanvasCore.tsx`: Added `CANONICAL_STROKE_MAX_POINTS = 3000`, `CANONICAL_FINISH_ENDPOINT_RESERVE = 1`, exported `willCanonicalSegmentExceedLimit`, integrated prospective auto-split in `processStrokeMove` / `finishCurrentStroke` / `startPencilOrEraserStroke({ fromAutoSplit })` (maintaining pointer capture & shared exact canonical endpoints across monotonically ordered segments), and unblocked originating-client `draw_abort` (`Type 12`) at line `3150` with Case 1 active-stroke rollback + pointer/outside-entry resets and Case 2 late post-release rollback (supporting `60s` `draw_end` aborts and active newer strokes without emitting `Type 3/6/7` or polluting `localRedoStackRef`).
    - `scripts/test_phase9a_slice3.ts`: New Slice 3 regression test suite (71 passed, 0 failed).
  - **Slice 4:**
    - `server/utils/binaryBufferHelpers.ts`: Added O(1) `isValidType4Packet(buf)`.
    - `server/registerDrawBinaryHandler.ts`: Added `else if (type === 4)` validation guard isolating `else` strictly to legacy `Type 10`.
    - `src/utils/drawBinaryHelper.ts`: Added O(1) per-type `DataView` bounds & `Type 4` field checks returning `null` cleanly before reads, plus fixed `typeof input.byteLength === 'number'` so 0-byte pooled `Buffer` views do not slice 8 KB slab memory.
    - `src/components/game/DrawingCanvasCore.tsx`: Added exported `getValidBatchBucketPayload` null/`NaN` guard in `replayFreeDrawHistorySafely`.
    - `scripts/test_session_identity_suite.ts`: Updated `makeType4` (`1060`) from `20 B` placeholder to valid `17 B` bucket packet.
    - `scripts/test_phase9a_slice4.ts`: Slice 4 regression suite (`36 passed, 0 failed`, exit `0`; `try/finally` `stopManagerTimer` + `process.exit(0)` on success matching Slices 1–3 convention).
  - **Slice 5A (`COMPLETED & VERIFIED`):**
    - `server/drawRateLimit.ts`: New O(1) constant-memory `DrawRateLimiter` + `defaultDrawRateLimiter` + `cleanupDrawRateLimit` (`maxPackets: 80`, `packetRefillPerSec: 35`, `maxWorkUnits: 524_288`, `workRefillPerSec: 65_536`).
    - `server/registerDrawBinaryHandler.ts`: Added pre-bucket O(1) header checks & `Type 13` work-cost calculation (`Math.max(buf.length, compressedCount * 4)`), dual token-bucket gate prior to `decodeType13BufferSafely` / history mutation / broadcast, and `cleanupRejectedActiveStroke` (canonical `abortFreeDrawStroke` / Normal `isDrawingActive = false` + single `Type 12` abort).
    - `server.ts`: Wired `defaultDrawRateLimiter.cleanupSocket(socket.id)` into `socket.on('disconnect', ...)` without modifying `maxHttpBufferSize` or unrelated handlers.
    - `scripts/test_phase9a_slice3.ts`: Advanced simulated clock by `+200ms` on Part 3B's simulated `200ms` batch flushes and isolated per-room `DrawRateLimiter` instances in `setupModeRoom` so real-time flood throttling does not trip a tight synchronous CPU loop claiming `200ms` pacing.
    - `scripts/test_phase9a_slice5a.ts`: New 26-assertion Slice 5A regression & flood-protection test suite (`26/26` passed, exit `0`).
  - **Slice 5B (`COMPLETED & VERIFIED`):**
    - `server/transportConfig.ts`: New standalone constant module exporting `MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES = 512 * 1024` (`524,288` bytes) so integration tests do not import `server.ts` side effects.
    - `server.ts`: Updated `new Server(httpServer, ...)` `maxHttpBufferSize` from `1e8` to `MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES`, keeping WebSocket-only transport (`['websocket']`), `socket.io-msgpack-parser` (`3.0.2`), and Slice 5A cleanup unchanged.
    - `scripts/test_phase9a_slice5b.ts`: New 16-check real Socket.IO + `socket.io-msgpack-parser` transport integration suite (`16/16` passed, exit `0`).
  - **Slice 5C-2 (`COMPLETED & VERIFIED`):**
    - `server/rateLimit.ts`: Added O(1) constant-memory `ControlRateLimiter`, `CONTROL_RATE_LIMITS`, `defaultControlRateLimiter`, and `cleanupControlRateLimit` while keeping `checkRateLimit()` unchanged.
    - `server/controlInputValidation.ts`, `server/registerJoinRoomHandler.ts`, `server/registerGetRoomsInfoHandler.ts`, `server/registerDrawingIdentityHandlers.ts`, `server.ts`: Wired per-socket control-event throttling (`join_room`, `get_room_info`, `get_rooms_info`, shared `start_free_draw`/`stop_free_draw`, shared `register_drawing_identity`/`unregister_drawing_identity`, `request_drawing_identities`) and unconditional `defaultControlRateLimiter.cleanupSocket(socket.id)` disconnect cleanup.
    - `scripts/test_phase9a_slice5c2.ts`: Control-event rate-limiting test suite (`17/17` passed, exit `0`).
  - **Slice 5C-3A (`COMPLETED & VERIFIED`):**
    - `src/types/game.ts`: Added `votekickAlertCooldowns?: Map<string, number>` on `Room`.
    - `server/registerVoteKickHandler.ts`: Added authoritative self-vote guard (`cannot_vote_self`), separated 60,000ms `(voterId, targetPlayerId)` `votekick_alert` notification cooldown without blocking vote withdrawal/changes or existing `3/2s` rate limits, and removed duplicate unvote `sendStateToPlayer` broadcast.
    - `server/rooms.ts`: Initialized `votekickAlertCooldowns` in `createRoom` and cleaned `room.votekicks` / `room.votekickAlertCooldowns` entries in `removePlayerFromRoom`.
    - `scripts/test_phase9a_slice5c3a.ts`: Vote-kick hardening suite (`27/27` passed, exit `0`).
  - **Slice 5C-3B (`AWAITING OWNER VERIFICATION`):**
    - `server/controlInputValidation.ts`: Added `PlayerActivityTarget`, O(1) `markPlayerActive(player, now)`, and `handlePingActivity(socket, roomManager, now)`.
    - `server.ts`: Removed `PASSIVE_BACKGROUND_EVENTS` and `socket.onAny` global activity refresh; wired `ping_activity` to `handlePingActivity(socket, roomManager)`.
    - `server/registerDrawBinaryHandler.ts`, `server/registerSendMessageHandler.ts`, `server/registerVoteKickHandler.ts`, `server/rooms.ts`: Updated `player.lastActivity` and reset `player.afkWarningSent = false` strictly after validated, authorized, rate-limit-approved genuine actions (`draw_binary`, `send_message`, `submit_guess`, `startGameRound`, `handleSkipTurn`, consumed `requestHint`, accepted `reportDrawing`, valid `submit_vote_kick` add/withdraw, accepted Free Draw drawer toggles, `addPlayerToRoom`, and both authenticated branches of `reconnectPlayer`).
    - `scripts/test_phase9a_slice5c3b.ts`: AFK activity accuracy & live Socket.IO + MsgPack bypass prevention suite (`46/46` passed, exit `0`).
- **Key Audit & Implementation Takeaways (PHASE 9A):**
  - **Slice 1 (`COMPLETED & VERIFIED`):** Client-originated `0`, `11`, `12`, `14..255`, and non-canonical `13` are dropped silently; `decodeBinaryDrawMessage` returns `null` for `0` and `14..255`.
  - **Slice 2 (`COMPLETED & VERIFIED`):** `Types 1, 2, 3, 5, 6, 7, 8` enforce exact O(1) structural bounds, tool allowlists (`{0, 1, 3, 4, 5, 6, 7}`), and non-empty valid `[a-zA-Z0-9_-]{1,7}` ASCII `instId` (`Type 5` also preserves empty `""` Clear compatibility).
  - **Slice 3 (`COMPLETED & VERIFIED`):** Strict O(1) `Type 9` validation (`1..3000` canonical, `1..65535` Normal, `=== 2` shapes), originating-client `Type 12` Case 1/2 abort rollback, and prospective D1 auto-split strictly before `3,000` pts with per-segment Undo/Redo & late-joiner sync parity.
  - **Slice 4 (`COMPLETED & VERIFIED`):** Enforced O(1) `{17, 19, 21, 23}` `Type 4` validation (`tool === 2`, `opacity <= 100`, `x/y <= 10000`), full `DataView` pre-checks in `decodeBinaryDrawMessage`, and `getValidBatchBucketPayload` `NaN` protection; clean-exit lifecycle fix verified (`36 passed, 0 failed`, exit `0`), `test_session_identity_suite.ts` (`626` passed, exit `0`), `tsc --noEmit`, `vite build`, and owner-confirmed manual gameplay all passing.
  - **Slice 5A (`COMPLETED & VERIFIED`):** `draw_binary` ingress enforces per-socket packet (`80` burst / `35/s`) and work (`524,288` burst / `65,536/s`) budgets in O(1) memory/time after auth and O(1) header checks, before `Type 13` decoding, `drawHistory` writes, `redoStack` mutations, or broadcasts, with immediate disconnect cleanup and single-abort active-stroke sync on rejection (`test_phase9a_slice5a.ts`: `26/26` passed, exit `0`; owner manual gameplay verification passed).
  - **Slice 5B (`COMPLETED & VERIFIED`):** Socket.IO/Engine.IO incoming WebSocket payload cap is `524,288` B (`512 KiB`), keeping all real MsgPack packets far below cap while terminating oversized frames pre-handler (`test_phase9a_slice5b.ts`: `16/16` passed, exit `0`; owner manual gameplay verification passed).
  - **Slice 5C-1 (`COMPLETED & VERIFIED`):** Remaining unvalidated control payloads (`join_room`, `get_room_info`, `client_capabilities`, `register_drawing_identity`/`unregister_drawing_identity`, and pre-`trim()`/`find()` bounds across `send_message`, `submit_guess`, `select_word`, `draw_repair_req`, `submit_vote_kick`) and per-socket drawing-identity map growth (`MAX_DRAWING_IDENTITIES_PER_SOCKET = 2`) are now enforced cleanly without altering existing rate limits (`test_phase9a_slice5c1.ts`: `27/27`, exit `0`; `tsc --noEmit`: `0` errors, exit `0`; `npm run build`: exit `0`; plus regression suites).
  - **Slice 5C-2 (`COMPLETED & VERIFIED`):** Per-socket control-event token buckets in `server/rateLimit.ts` protect `join_room`, `get_room_info`, `get_rooms_info`, `start_free_draw`/`stop_free_draw`, drawing identity events, and `request_drawing_identities` in O(1) time/memory with O(1) disconnect cleanup while leaving `leave_room`, `client_capabilities`, and prior limits intact (`test_phase9a_slice5c2.ts`: `17/17`, exit `0`; owner manual verification passed).
  - **Slice 5C-3A (`COMPLETED & VERIFIED`):** Vote-kick handler blocks self-votes (`cannot_vote_self`) and throttles repeated `votekick_alert` notifications per `(voterId, targetPlayerId)` over a 60,000ms window without preventing vote withdrawal, legitimate vote changes, or `3/2s` rate limiting (`test_phase9a_slice5c3a.ts`: `27/27`, exit `0`; owner manual verification passed).
  - **Slice 5C-3B (`AWAITING OWNER VERIFICATION`):** Untrusted `socket.onAny` AFK refresh is eliminated; only genuine accepted gameplay events, valid join/reconnect calls, and explicit `ping_activity` update `lastActivity` and clear `afkWarningSent`, preventing passive, malformed, unauthorized, unknown, or rate-limited events from resetting the 140s warning / 230s AFK eviction clock (`test_phase9a_slice5c3b.ts`: `46/46`, exit `0`; `tsc --noEmit` & `npm run build` exit `0`).
  - **`Type 10` Compatibility Limitation:** Legacy `Type 10` behavior is preserved (`server/roomDrawingHistory.ts:100`, `server.ts:79`, ingress pass-through, explicit `'draw_clear'` decode), but `.git` history and original producers are absent so its exact legacy wire format remains unverified; synthetic tests validate compatibility behavior only.
- **Exact Next Action:**
  `Slices 5C-2 and 5C-3A are COMPLETED & VERIFIED. Slice 5C-3B is implemented and automated tests pass; await owner manual gameplay verification before closing PHASE 9A.`

---

## A. Workstream Purpose & Scope

**Why This Workstream Exists:**  
While the codebase already passes static compilation and targeted feature test suites, production deployment requires strict hardening around untrusted binary Socket.IO inputs, bounded per-room memory growth and join/sync CPU cost, deterministic dependency installation, standardized test execution, CI verification, and ongoing dependency vulnerability management.

**Why Separate from `REFACTORING_ROADMAP.md`:**  
`REFACTORING_ROADMAP.md` tracks the completed modularization and UI/rendering architecture work (`PHASE 1` through `PHASE 8B`, all closed/completed). **PHASE 9 (`Production Reliability & Resource Safety`)** is a distinct operational, protocol-security, resource-lifecycle, and engineering-automation workstream so architectural cleanup history remains intact and unmixed with production hardening decisions.

---

## B. Master Task Checklist

- [ ] **PHASE 9A — Binary Packet Contract & Input Safety** *(`IN PROGRESS — Slices 1–4, 5A, 5B, 5C-1, 5C-2 & 5C-3A COMPLETED & VERIFIED; Slice 5C-3B AWAITING OWNER VERIFICATION`)*
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
  *(Slices 1–4, 5A, 5B & 5C-1: `COMPLETED & VERIFIED`; Slices 5C-2 & 5C-3: `NOT STARTED`.)*

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
  - **Slice 2 (`COMPLETED & VERIFIED`):** Implemented O(1) structural validation across `Types 1, 2, 3, 5, 6, 7, 8` (exact lengths, `{0,1,3,4,5,6,7}` tool allowlist on `Type 1/3`, allocation-free `[a-zA-Z0-9_-]{1,7}` ASCII `instId` check with `Type 5` empty-`instId` compatibility, mode-split `Type 7` lengths `10 B` FD/Exp vs `8 B` Normal, `Type 8` Normal-only `8 B`, and removal of canonical continuous `Type 3` raw fallback broadcast), aligned `AUTH-11.1`/`11.2` Normal `Type 7` test fixtures, and received owner manual verification.
  - **Slice 3 (`COMPLETED & VERIFIED`):** Implemented coordinated Hybrid Option D (Sub-slice 3A client `DrawingCanvasCore.tsx` originating `Type 12` Case 1/2 abort rollback + D1 prospective automatic long-stroke segmentation preserving pointer capture and exact endpoints; Sub-slice 3B O(1) `Type 9` server ingress validation in `server/utils/binaryBufferHelpers.ts` & `server/registerDrawBinaryHandler.ts`), preserving Normal `1..65,535` continuous compatibility, canonical `1..3,000` bounds, `Type 4` Bucket, and legacy `Type 10`, with automated tests + owner-reported gameplay verification.
  - **Slice 4 (`COMPLETED & VERIFIED`):** Implemented `isValidType4Packet`, isolated `Type 4` ingress validation, client `DataView` pre-checks + zero-length pooled `Buffer` fix, `getValidBatchBucketPayload` NaN guard, updated `makeType4`, and fixed the Slice 4 test harness exit lifecycle (`try/finally` `stopManagerTimer` + `process.exit(0)` on success matching Slices 1–3 convention to release `SocketProvider.tsx`'s module-level `socketInstance`); `36 passed, 0 failed` (exit `0`), `test_session_identity_suite.ts` (`626` passed, exit `0`), `npx tsc --noEmit`, `npm run build`, and owner-reported manual gameplay verification all passed.
  - **Slice 5A (`COMPLETED & VERIFIED`):** Implemented O(1) constant-memory per-socket `draw_binary` dual token bucket (`server/drawRateLimit.ts`: `80` pkts burst / `35` pkts/s refill; `524,288` work units burst / `65,536`/s refill) inside `server/registerDrawBinaryHandler.ts` after auth & O(1) header validation and strictly prior to `decodeType13BufferSafely`, `recordDrawCommand`, undo/redo/clear mutations, or broadcasts, with active-stroke rejection cleanup (`abortFreeDrawStroke` / `isDrawingActive = false` + single `Type 12` abort) and immediate disconnect cleanup in `server.ts`. Verified via `scripts/test_phase9a_slice5a.ts` (`26/26` passed, exit `0`) and project owner manual verification of normal gameplay.
  - **Slice 5B (`COMPLETED & VERIFIED`):** Tightened Socket.IO server `maxHttpBufferSize` from `1e8` (`100,000,000` B) to exact `512 * 1024` (`524,288` B / `512 KiB`) via `server/transportConfig.ts` (`MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES`), verified via live Socket.IO + Engine.IO + `socket.io-msgpack-parser` WebSocket tests (`scripts/test_phase9a_slice5b.ts`: `16/16` passed, exit `0`) and project owner manual verification of normal gameplay. Preserved WebSocket-only transport, uncompressed framing, client `SocketProvider.tsx`, Slice 5A rate limiter, and outbound `draw_history_sync` (`751,559 B` tested unrestricted).
  - **Slice 5C-1 (`COMPLETED & VERIFIED`):** Enforced early type/length/control-character boundaries on `join_room`, `get_room_info`, `client_capabilities`, `register_drawing_identity`/`unregister_drawing_identity`, `send_message`, `submit_guess`, `select_word`, `draw_repair_req`, and `submit_vote_kick`, plus per-socket per-room drawing-identity cap (`MAX_DRAWING_IDENTITIES_PER_SOCKET = 2`) and post-auth/post-join `supportsType13` capability write deferral, without modifying existing rate limits. Verified via `scripts/test_phase9a_slice5c1.ts` (`27/27`, exit `0`), `npx tsc --noEmit` (`0` errors, exit `0`), `npm run build` (exit `0`), and regression suites (`212`, `626`, `78`, `6` passed).
  - **Slices 5C-2 & 5C-3 (`NOT STARTED`):** Remaining control-event rate limits (`5C-2`) and behavioral changes (`5C-3`) remain explicitly unstarted pending approval.

- **Files Modified:**  
  - `server/transportConfig.ts` (Slice 5B shared `MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES = 512 * 1024`)
  - `server/drawRateLimit.ts` (Slice 5A O(1) per-socket packet and work-unit token bucket `DrawRateLimiter`, `defaultDrawRateLimiter`, `cleanupDrawRateLimit`)
  - `server/controlInputValidation.ts` (Slice 5C-1 `CONTROL_CHAR_REGEX`, `hasControlCharacters`, `sanitizeClientCapabilities`, `handleGetRoomInfo`, `handleDrawRepairReq`)
  - `server.ts` (Slice 5A immediate `defaultDrawRateLimiter.cleanupSocket(socket.id)` on `disconnect`; Slice 5B `maxHttpBufferSize: MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES`; Slice 5C-1 wiring for `handleGetRoomInfo`, `sanitizeClientCapabilities`, `handleDrawRepairReq`)
  - `server/rooms.ts` (Slice 5C-1 strict `sanitizeClientCapabilities` allowlist in `setClientCapabilities`, `instanceId.length <= 64` pre-trim guard, and `MAX_DRAWING_IDENTITIES_PER_SOCKET = 2` per socket per room)
  - `server/registerJoinRoomHandler.ts` (Slice 5C-1 early payload/control-char/UTF-16 length checks preserving existing flag/ZWJ avatars & whitespace nicknames, plus post-join/reconnect capability write deferral)
  - `server/registerDrawingIdentityHandlers.ts` (Slice 5C-1 `instanceId.length <= 64` pre-trim guard)
  - `server/registerSendMessageHandler.ts` (Slice 5C-1 `text.length > 1000` pre-trim guard)
  - `server/registerSubmitGuessHandler.ts` (Slice 5C-1 Array payload rejection & `guess.length > 1000` pre-trim guard)
  - `server/registerSelectWordHandler.ts` (Slice 5C-1 Array payload rejection & `word.length > 128` pre-trim guard)
  - `server/registerVoteKickHandler.ts` (Slice 5C-1 early `targetPlayerId` bounds/control-char check and `3/2s` rate check moved prior to `room.players.find`)
  - `server/registerDrawBinaryHandler.ts` (Slice 1 ingress direction & non-canonical `Type 13` guard; Slice 2 structural validation on `Types 1, 2, 3, 5, 6, 7, 8` and canonical `Type 3` fallback broadcast removal; Slice 3 strict O(1) `Type 9` ingress validation; Slice 4 `isValidType4Packet` guard isolating `else` to legacy `Type 10`; Slice 5A pre-bucket O(1) header & `Type 13` cost accounting, token bucket gate, and `cleanupRejectedActiveStroke`)
  - `server/roomCanonicalStrokeEngine.ts` (Slice 2 `handleFreeDrawStart`, `handleFreeDrawMove`, and `handleFreeDrawEnd` structural/tool/`instId` enforcement)
  - `server/utils/binaryBufferHelpers.ts` (Slice 2 allocation-free `isValidInstIdBytes`, `extractValidatedInstId`, and `isAllowedStartOrEndTool`; Slice 3 `isValidType9Packet`; Slice 4 `isValidType4Packet`)
  - `src/utils/drawBinaryHelper.ts` (Slice 1 explicit clear/control opcode branches & `null` for `0, 14..255`; Slice 4 O(1) `DataView` bounds & `Type 4` field validation + 0-length pooled `Buffer` slice fix)
  - `src/components/game/DrawingCanvasCore.tsx` (Slice 3 `CANONICAL_STROKE_MAX_POINTS`, `willCanonicalSegmentExceedLimit`, D1 prospective auto-split across continuous drags, and originating-client `Type 12` Case 1 active & Case 2 late post-release rollback; Slice 4 `getValidBatchBucketPayload` null/`NaN` replay guard)
  - `scripts/test_session_identity_suite.ts` (Slice 2 `makeType7Normal` helper and `AUTH-11.1` / `AUTH-11.2` 8-byte Normal `Type 7` fixture correction; Slice 4 `makeType4` updated to valid `17 B` bucket packet)
  - `scripts/test_payload_validation_suite.ts` (Slice 5C-1 cleared `voteKickLimits` for `voterPid` prior to independent `VOTE-3.6` quorum check)
  - `scripts/test_phase9a_slice1.ts` (Slice 1 regression test suite)
  - `scripts/test_phase9a_slice2.ts` (Slice 2 regression test suite)
  - `scripts/test_phase9a_slice3.ts` (Slice 3 regression test suite; Slice 5A simulated `+200ms` clock tick on Part 3B batched loop & per-fixture `DrawRateLimiter`)
  - `scripts/test_phase9a_slice4.ts` (Slice 4 regression test suite; `try/finally` `stopManagerTimer` + `process.exit(0)` clean exit fix; `36 passed, 0 failed`, exit `0`)
  - `scripts/test_phase9a_slice5a.ts` (Slice 5A O(1) token bucket, `Type 13` pre-decode/single-decode, active-stroke cleanup, disconnect cleanup, and `AGENTS.md` resource protection suite; `26 passed, 0 failed`, exit `0`)
  - `scripts/test_phase9a_slice5b.ts` (Slice 5B real Socket.IO + Engine.IO + `socket.io-msgpack-parser` transport message size protection integration suite; `16 passed, 0 failed`, exit `0`)
  - `scripts/test_phase9a_slice5c1.ts` (Slice 5C-1 control input bounds, `client_capabilities` allowlist, drawing-identity cap, `get_room_info` validation, pre-`trim()`/`find()` bounds, and live Socket.IO + MsgPack integration suite; `27 passed, 0 failed`, exit `0`)
  - `PRODUCTION_RELIABILITY_ROADMAP.md` (status, verification results, limitations, rollback record)

- **Manual & Automated Verification Results (Slices 1–5C-1):**
  - **Slice 1 Manual Verification:** Tested manually by the project owner and reported as working normally *(no individual unverified gameplay sub-tests claimed)*.
  - **Slice 2 Manual Verification:** Tested and manually verified by the project owner *(no individual unverified gameplay sub-tests claimed)*.
  - **Slice 3 Manual Verification:** Tested and manually verified by the project owner *(no individual unverified gameplay sub-tests claimed)*.
  - **Slice 4 Manual Verification:** `"The project owner tested the game manually and confirmed that it works normally."`
  - **Slice 5A Manual Verification:** Project owner manually verified normal gameplay.
  - **Slice 5B Manual Verification:** Project owner manually verified normal gameplay.
  - **Latest Verified Run (Post–Slice 5C-3B):**
    - `npx tsx scripts/test_phase9a_slice5c3b.ts`: **PASS** (`46 passed, 0 failed`, exit `0`).
    - `npx tsx scripts/test_phase9a_slice5c3a.ts`: **PASS** (`27 passed, 0 failed`, exit `0`).
    - `npx tsx scripts/test_phase9a_slice5c2.ts`: **PASS** (`17 passed, 0 failed`, exit `0`).
    - `npx tsx scripts/test_payload_validation_suite.ts`: **PASS** (`212 passed`, exit `0`).
    - `npx tsx scripts/test_session_identity_suite.ts`: **PASS** (`626 passed`, exit `0`).
    - `npx tsx scripts/test_leave_room_integrity.ts`: **PASS** (`78 passed`, exit `0`).
    - `npx tsx scripts/test_state_transition_reset.ts`: **PASS** (`6 passed`, exit `0`).
    - `npx tsc --noEmit`: **PASS** (`0` errors, exit `0`).
    - `npm run build`: **PASS** (`vite build` succeeded, exit `0`).
  - **Prior Baseline Runs (Completed Prior to Slice 5C-2):**
    - `npx tsx scripts/test_phase9a_slice5c1.ts`: **PASS** (`27 passed, 0 failed`, exit `0`).
    - `npx tsx scripts/test_phase9a_slice5b.ts`: **PASS** (`16 passed, 0 failed`, exit `0`).
    - `npx tsx scripts/test_phase9a_slice5a.ts`: **PASS** (`26 passed, 0 failed`, exit `0`).
    - `npx tsx scripts/test_phase9a_slice4.ts`: **PASS** (`36 passed, 0 failed`, exit `0`).
    - `npx tsx scripts/test_phase9a_slice3.ts`: **PASS** (`71 passed, 0 failed`, exit `0`).
    - `npx tsx scripts/test_phase9a_slice2.ts`: **PASS** (`174 passed, 0 failed`, exit `0`).
    - `npx tsx scripts/test_phase9a_slice1.ts`: **PASS** (`89 passed, 0 failed`, exit `0`).
    - `npx tsx scripts/test_type13_hardening.ts`: **PASS** (exit `0`).
    - `npx tsx scripts/test_compressed_transport.ts`: **PASS** (exit `0`).
    - `npx tsx scripts/test_experimental_draw_trial.ts`: **PASS** (exit `0`).
    - `npx tsx scripts/test_freedraw_bucket_undo_fastpath.ts`: **PASS** (exit `0`).
    - `npx tsx scripts/test_repair_seamless_handover.ts`: **PASS** (exit `0`).
    - `npx tsx scripts/test_controlled_fixes_suite.ts`: **PASS** (exit `0`).
    - `npx tsx scripts/test_full_canvas_replay_experiment.ts`: **PASS** (exit `0`).
    - `npx tsx scripts/test_codec.ts`: **PASS** (`13 passed`, exit `0`).
    - `npx tsx scripts/test_legacy1a_routing.ts`: **PASS** (exit `0`).
    - `npx tsx scripts/test_legacy1c_unknown_room_routing.ts`: **PASS** (exit `0`).

- **Performance & Compatibility Notes:**
  - Slice 5A overhead is strictly $O(1)$ per packet (`8.15 ms` / `7.02 ms` across `100,000` `DrawRateLimiter.consume` calls) with zero hot-path allocations, zero arrays/filters, zero `console.log` telemetry (`AGENTS.md` compliant), and immediate `disconnect` cleanup (`0` leaked map entries across `1,000` connect/cleanup cycles).
  - Slice 5B overhead is **zero per-frame application cost** beyond Engine.IO / `ws@8.21.3`'s native `maxPayload: 524288` frame-length check prior to MsgPack decode. Oversized incoming payloads (`>= 524,289 B` wire) terminate at WebSocket layer (`1009`, client `'transport close'`) before touching `draw_binary` / `send_message` / `join_room` handlers or room state; healthy bystanders are unaffected, `reconnection: true` recovers with a new `socket.id` + `reconnectSecret` history sync, and outbound `draw_history_sync` (`751,559 B`) delivers unrestricted.
  - Slice 5C-1 adds only constant-time string length/type/control-char checks, boolean allowlist extraction (`supportsType13`), and a <=2 key count check on `drawingIdentities` registration (`O(k)` over a bounded map), preserving Arabic nicknames with spaces, complex flag/ZWJ emoji avatars, and all existing control rate limits.
  - Slice 5C-2 adds strictly $O(1)$ per-socket token-bucket checks in `server/rateLimit.ts` inside one fixed socket record cleaned up via `Map.delete(socketId)` on disconnect (`1.36 ms` across `1,000` connect/cleanup cycles, `0` leaked records).
  - Slice 5C-3A adds strictly $O(1)$ authoritative self-vote comparison and `(voterId, targetPlayerId)` Map lookup for `votekick_alert` notifications without allocating timers or altering vote withdrawal/quorum semantics.
  - Slice 5C-3B removes `socket.onAny` middleware overhead on every Socket.IO frame and replaces it with $O(1)$ `markPlayerActive(player, now)` field writes (`lastActivity` + `afkWarningSent = false`) executed solely inside already-validated gameplay handlers.
  - Normal client drawing (~5 pkt/s `200ms` batches, `2,900`-pt auto-split 3-packet seams, rapid shape/stippling bursts, canonical 3,000-pt `Type 13`/`Type 9` at `18,064 B` / `12,072 B`, and `65,535`-pt `262,158 B` Normal `Type 9` at `262,214 B` wire) passes cleanly without throttling or transport rejection.
  - **`Type 10` Compatibility Limitation:** Legacy `Type 10` behavior is preserved (`server/roomDrawingHistory.ts:100`, `server.ts:79`, ingress pass-through, explicit `'draw_clear'` decode), but `.git` history and original producers are absent so its exact legacy packet format remains unverified; synthetic tests validate compatibility behavior only.
  - **Remaining Status:** All automated PHASE 9A slices (`1`–`4`, `5A`, `5B`, `5C-1`, `5C-2`, `5C-3A`, `5C-3B`) are implemented; **Slice 5C-3B awaits owner manual gameplay verification** before closing `PHASE 9A`.
  - **Rollback Instructions:**
    - *Slice 5C-3B:* Restore `socket.onAny` / `PASSIVE_BACKGROUND_EVENTS` in `server.ts`, revert `markPlayerActive` / `handlePingActivity` in `server/controlInputValidation.ts` and call sites in `server/rooms.ts`, `server/registerDrawBinaryHandler.ts`, `server/registerSendMessageHandler.ts`, `server/registerVoteKickHandler.ts`, remove `scripts/test_phase9a_slice5c3b.ts`, and re-run `npx tsc --noEmit` + `npm run build`.
    - *Slice 5C-3A:* Revert `votekickAlertCooldowns` in `src/types/game.ts` / `server/rooms.ts` and self-vote / notification-cooldown guards in `server/registerVoteKickHandler.ts`, remove `scripts/test_phase9a_slice5c3a.ts`, and re-run `npx tsc --noEmit` + `npm run build`.
    - *Slice 5C-2:* Revert `ControlRateLimiter` in `server/rateLimit.ts` and its call sites in `server.ts`, `server/controlInputValidation.ts`, `server/registerJoinRoomHandler.ts`, `server/registerGetRoomsInfoHandler.ts`, `server/registerDrawingIdentityHandlers.ts`, remove `scripts/test_phase9a_slice5c2.ts`, and re-run `npx tsc --noEmit` + `npm run build`.
    - *Slice 5C-1:* Revert `server/controlInputValidation.ts`, Slice 5C-1 changes in `server.ts`, `server/rooms.ts`, `server/registerJoinRoomHandler.ts`, `server/registerDrawingIdentityHandlers.ts`, `server/registerSendMessageHandler.ts`, `server/registerSubmitGuessHandler.ts`, `server/registerSelectWordHandler.ts`, `server/registerVoteKickHandler.ts`, `scripts/test_payload_validation_suite.ts`, remove `scripts/test_phase9a_slice5c1.ts`, and re-run `npx tsc --noEmit` + `npm run build`.
    - *Slice 5B:* Restore `maxHttpBufferSize: 1e8` (or a higher temporary ceiling such as `1024 * 1024`) in `server.ts`, optionally remove `server/transportConfig.ts` and `scripts/test_phase9a_slice5b.ts`, and re-run `npx tsc --noEmit` + `npm run build`.
    - *Slice 5A:* Remove `defaultDrawRateLimiter` / `now` / `cleanupRejectedActiveStroke` integration in `server/registerDrawBinaryHandler.ts` (restoring direct execution of validated blocks), remove `defaultDrawRateLimiter.cleanupSocket(socket.id)` from `server.ts`, delete `server/drawRateLimit.ts` and `scripts/test_phase9a_slice5a.ts`, revert the Slice 3 Part 3B `DrawRateLimiter`/`simNowMs` test helper additions if desired, and re-run `npx tsc --noEmit` + `npm run build`.
    - *Slice 4:* Revert `isValidType4Packet` in `server/utils/binaryBufferHelpers.ts` and `else if (type === 4)` in `server/registerDrawBinaryHandler.ts`, restore previous `decodeBinaryDrawMessage` & `getValidBatchBucketPayload` behavior in `src/utils/drawBinaryHelper.ts` / `DrawingCanvasCore.tsx`, remove `scripts/test_phase9a_slice4.ts`, and re-run `npx tsc --noEmit` + `npm run build`.
    - *Slice 3:* Revert `Type 9` validation branch in `server/registerDrawBinaryHandler.ts` and `isValidType9Packet` in `server/utils/binaryBufferHelpers.ts`; revert `DrawingCanvasCore.tsx` (`willCanonicalSegmentExceedLimit`, `processStrokeMove` split, `startPencilOrEraserStroke` `fromAutoSplit`, `finishCurrentStroke` anchor return, `3131` local `draw_abort` allowance, and `3394` Case 1/2 handlers); remove `scripts/test_phase9a_slice3.ts`; re-run `npx tsc --noEmit` + `npm run build`.
    - *Slice 2:* Remove the Slice 2 helpers in `server/utils/binaryBufferHelpers.ts`, revert `handleFreeDrawStart`/`handleFreeDrawMove`/`handleFreeDrawEnd` in `server/roomCanonicalStrokeEngine.ts`, restore pre-Slice 2 branching in `server/registerDrawBinaryHandler.ts` (including previous `Type 3` canonical `else` broadcast), revert `makeType7Normal` in `scripts/test_session_identity_suite.ts`, delete `scripts/test_phase9a_slice2.ts`, and re-run `npx tsc --noEmit` + `npm run build`.
    - *Slice 1:* Revert the two `if (type === ...)` guards at `server/registerDrawBinaryHandler.ts:118-123`, restore the fallback `let eventName = 'draw_clear'` block in `src/utils/drawBinaryHelper.ts`, remove `scripts/test_phase9a_slice1.ts`, and re-run `npx tsc --noEmit` + `npm run build`.

- **Completion Criteria:**
  - Exact binary schemas, directionality, byte bounds, and field constraints defined and enforced at server ingress (`handleDrawBinary`) for every allowed packet type (`1`–`9`, `13`), with `Type 10` compatibility resolved separately and `server/roomDrawingHistory.ts:100` left unchanged. *(Slices 1–4 `COMPLETED & VERIFIED` across Types `1`–`9` and `13`.)*
  - Trailing-byte rejection on `Type 2`, `Type 7`, `Type 9`, etc., matching `Type 13` strictness. *(Enforced across `1`–`9` & `13` on server ingress and client `decodeBinaryDrawMessage`.)*
  - Client-originated `Type 11` / `Type 12` and truly unknown packet types (`0`, `14..255`) rejected cleanly on server ingress; client `decodeBinaryDrawMessage` no longer maps unknown packet types (`0`, `14..255`) to `'draw_clear'`. *(Slice 1: `COMPLETED & VERIFIED`.)*
  - Per-socket O(1) `draw_binary` packet & decode/work protection enforced (`Slice 5A: COMPLETED & VERIFIED`), `maxHttpBufferSize: 524_288` (`512 KiB`) enforced (`Slice 5B: COMPLETED & VERIFIED`), remaining control-event input boundaries & drawing-identity limits enforced (`Slice 5C-1: COMPLETED & VERIFIED`), per-socket control-event rate limits enforced (`Slice 5C-2: COMPLETED & VERIFIED`), Vote-Kick self-vote & notification spam hardening enforced (`Slice 5C-3A: COMPLETED & VERIFIED`), and AFK genuine-activity accuracy enforced (`Slice 5C-3B: AWAITING OWNER VERIFICATION`).
  - Automated validation test suites, `npx tsc --noEmit`, `npm run build`, and owner gameplay verification pass cleanly with exit 0.

- **Current Status:**  
  `IN PROGRESS — Slices 1–4, 5A, 5B, 5C-1, 5C-2 & 5C-3A COMPLETED & VERIFIED; Slice 5C-3B AWAITING OWNER VERIFICATION`

- **Next Exact Action:**  
  `Complete owner manual gameplay verification for Slice 5C-3B to finalize PHASE 9A closure.`

---

#### `PHASE 9A — Implementation Blueprint & Slice Tracker`

**Status:** `IN PROGRESS — Slices 1–4, 5A, 5B, 5C-1, 5C-2 & 5C-3A COMPLETED & VERIFIED; Slice 5C-3B AWAITING OWNER VERIFICATION`

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

2. **Slice 2 — Canonical Stream & Control-Packet Structural Validation *(COMPLETED & VERIFIED)***
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
   - *Verification Status:* **COMPLETED & VERIFIED** — manually verified by the project owner alongside `npx tsc --noEmit`, `npm run build`, `scripts/test_phase9a_slice2.ts` (174/174), and all 12 baseline suites.

3. **Slice 3 — `Type 9` Structural Validation & Free Draw Abort/Redo Alignment *(COMPLETED & VERIFIED)***
   - *Goal:* Close the unchecked `Type 9` (`MSG_DRAW_STROKE`) ingress bypass while fixing the originating-drawer `Type 12` (`draw_abort`) ignore bug and `>3,000`-point Free Draw / Experimental Redo desync.
   - **A. Verified `Type 9` Wire Contract (`src/utils/drawBinaryHelper.ts:323-352, 584-610`, `server/roomCanonicalStrokeEngine.ts:247-273`):**
     - `Byte 0` (`Uint8`): `9` (`MSG_DRAW_STROKE`).
     - `Bytes 1..7` (`7B ASCII`): `instId` (`0x00`-padded; production `[a-z0-9]{1,7}`, Slice 2 ingress allows `[a-zA-Z0-9_-]{1,7}`).
     - `Byte 8` (`Uint8`): `tool` index (`TOOLS_LIST`). Active/shape/redo `Type 9` producers only ever emit `{0:'pencil', 1:'eraser', 3:'line', 4:'strokeRect', 5:'fillRect', 6:'strokeCircle', 7:'fillCircle'}`. (`bucket=2` uses `Type 4`; `pipette=8` never sends packets).
     - `Bytes 9..11` (`3x Uint8`): `r, g, b`. `Byte 12` (`Uint8`): `width`. `Byte 13` (`Uint8`): `opacity` (`0..100` -> `/100`).
     - `Bytes 14..15` (`Uint16LE`): `pointsLength` (`0..65535`).
     - `Bytes 16 .. 16 + pointsLength * 4 - 1`: `pointsLength` pairs of `(x: Int16LE, y: Int16LE)` scaled by `10000` (encoder clamps to `[-30000, 30000]`, i.e., `-3.0..3.0` normalized to support un-clamped edge strokes).
     - Optional Trailer (`2` bytes at `16 + pointsLength * 4`): `strokeId` (`Uint16LE`). Thus exact valid wire lengths are **`16 + pointsLength * 4`** (no `strokeId`, e.g., legacy Normal continuous mode) OR **`16 + pointsLength * 4 + 2`** (with `strokeId`, e.g., canonical server `Type 9`, shape `Type 9`, collaborative Redo `Type 9`).
     - *Zero-point rule:* No legitimate client or server producer emits a `0`-point `Type 9` over the network (`DrawingCanvasCore.tsx:3160` and `canvasReplayEngine.ts:125` skip `scaledPoints.length === 0`); shape tools always emit **`pointsLength === 2`** (`26 B`, `DrawingCanvasCore.tsx:5008-5019`), and continuous strokes always emit **`pointsLength >= 1`**. Note: three synthetic unit fixtures in `scripts/test_session_identity_suite.ts:1433, 1474, 1889` call `rm.recordDrawCommand(...)` directly (never `handleDrawBinary`) with zero-filled `Buffer.alloc(24)` (`pointsLength = 0`).
   - **B. Mode-Specific Legitimate Point Limits:**
     - **Free Draw & Experimental (`isFreeDraw || isExperimental`):** Active continuous strokes (`0, 1`) do NOT emit client `Type 9` (`4846`); server constructs canonical `Type 9` capped at **`3,000` points** (`roomCanonicalStrokeEngine.ts:137, 182`, max `12,018 B`). Client emits `Type 9` only for (1) shapes (`{3..7}`, **`2` pts**, `26 B`) and (2) collaborative Redo (`2488-2563`, `{0,1,3..7}`, `16 + pointsLength * 4 + 2` bytes). *Pre-Slice-3 defect:* Because client lacks a `3,000`-pt limit and ignores `Type 12`, collaborative Redo can currently emit `> 3,000`-pt `Type 9` packets. Once client/server align in Slice 3, legitimate canonical `Type 9` bounds are **`pointsLength === 2` (`26 B`) for shapes** and **`1 <= pointsLength <= 3000` (`22..12,018 B`) for continuous strokes**.
     - **Normal / Competitive (`!isFreeDraw && !isExperimental`):** Shapes (`{3..7}`) emit **`2` pts** (`26 B`). Continuous (`0, 1`) strokes emit client `Type 9` (`16 + pointsLength * 4`, no `strokeId`) with `pointsLength >= 1` and currently **no client or server engine point cap** (theoretical `Uint16LE` ceiling `65,535` = `262,154 B` / `262,156 B`, noting `ROOM_PRESETS` and `getRoomConfig` in `src/types/game.ts:72-160` all default to `isExperimental: true`). Server ingress should enforce exact `buf.length === 16 + pointsLength * 4 (+2)`, `pointsLength >= 1` (`=== 2` for shapes), and an agreed ceiling (either preserving `1..65535` bounded by Slice 5 `maxHttpBufferSize`, or an approved generous Normal ceiling such as `16,384` pts = `65,552 B`).
   - **C. Confirmed `Type 9` Vulnerabilities & Complete `Type 12` Abort Trace:**
     - *Server `Type 9` Bypass (`server/registerDrawBinaryHandler.ts:275-281`):* `Type 9` hits the unvalidated `else` branch — accepting `< 16 B` truncated packets, trailing bytes up to `100 MB`, `pointsLength = 0`, disallowed tools (`bucket=2`, `pipette=8`, `9..255`), and empty `instId`. `recordRoomDrawCommand` (`server/roomDrawingHistory.ts:84-99`) unconditionally sets `isValidStart = true`, clears `redoStack`, filters prior `1/2/3/6` entries, appends raw `buf` into `drawHistory` (amplified via `Array.from` in `getJsonSafeHistory`), and broadcasts raw `buf`. Client `decodeBinaryDrawMessage` (`drawBinaryHelper.ts:584-610`) lacks `view.byteLength` pre-checks before `getUint16(14)` / `getInt16(16 + i*4)` (throwing caught `RangeError`s on truncated buffers) and ignores trailing bytes.
     - **7-Step `Type 12` (`draw_abort`) Desync Lifecycle:**
       1. `startPencilOrEraserStroke` (`4557-4626`) sets `isDrawingRef = true`, stages `undoCache.stagePending()`, initializes `currentPathRef`/`canonicalStrokeRef`/`networkStrokePointsRef` with `p0`, and emits `Type 1`. Spectators open `activeSessionsRef[instId]`; server creates active stroke in `room.freeDrawStrokes`.
       2. `processStrokeMove` (`4628-4756`, including `getCoalescedEvents` at `5305-5314`) appends unlimited points with **zero client point limit**, batching `Type 13` every `200ms`.
       3. Upon crossing `3,000` points (`roomCanonicalStrokeEngine.ts:137, 182`) or `60s` (`130, 175, 238`), `RoomManager.abortFreeDrawStroke` (`rooms.ts:1319-1334`) deletes the server stroke (nothing in `drawHistory`) and emits `Type 12` (`10 B`, `strokeId=0` on move overflow/60s timer or `strokeId > 0` on `draw_end` 60s expiry) to `io.to(roomId)`.
       4. **`DrawingCanvasCore.tsx:3131` BUG:** `if (data.instanceId === instanceId && !isFreeDrawUndo) return;` drops `draw_abort` (`Type 12`) — as well as `draw_commit` (`3312`) — for the originating drawer before `else if (event === 'draw_abort')` (`3394`). Spectators execute `3394-3397` and erase the live preview; the drawer ignores `Type 12` completely.
       5. Drawer keeps `isDrawingRef = true`, continues painting onto `tempCtx` and sending dropped `Type 13` chunks, then in `finishCurrentStroke` (`4758-4912`) calls `commitFreeDrawPendingCache`, draws the `>3,000`-pt `canonicalStrokeRef` **permanently onto `ctx`**, pushes a `>3,000`-pt `Type 9` onto `localCommandsRef` (`4864-4878`), and sends `Type 3` (silently dropped by Slice 2 server). **Permanent drawer vs. spectator/history desync.**
       6. Pressing Undo (`2260-2410`) erases the local stroke and pushes the oversized `Type 9` onto `localRedoStackRef` (`2206`/`2372`), while server `Type 7` finds nothing in `drawHistory` (NO-OP).
       7. Pressing Redo (`2462-2578`) pops the `>3,000`-pt `Type 9` and emits it directly (`2562`). Server rejection would re-desync drawer vs. spectators unless client/server boundaries are aligned first.
   - **D. Evaluation of Candidate Solutions (Options A–D):**
     - **Option A (Strict `Type 12` Abort Discard Only, Zero Client Split):** Fixes `3131` + clears provisional stroke on `Type 12`. *Continuity:* Poor (entire long drag disappears suddenly mid-stroke). *Consistency/Sync:* Good during stroke, but leaves a `~200ms + RTT` `pointerup` race right as `#3,001` leaves client unless optimistic-commit rollback handles `strokeId=0`. *Undo/Redo & History:* Clean (no entry created). *Wastes bandwidth/CPU* on points before abort; *high UX risk* on `120Hz/240Hz` mobile screens with `getCoalescedEvents`.
     - **Option B (Client Auto-Split Only, Ignoring `Type 12` Sync):** Keeps strokes continuous across split boundaries, but **leaves `3131` broken** for `60s` expiry aborts (`roomCanonicalStrokeEngine.ts:130,175,238`) and tampered/stale clients; splits 1 gesture into multiple Undo steps; executes `commitPending` + `stagePending` bitmap copies mid-drag on split.
     - **Option C (Keep Oversized Stroke Locally + Truncate Redo):** Breaks Single-Source Canvas determinism, diverges flood-fill boundaries between drawer and spectators, and corrupts server vs. client Undo/Redo parity. **Rejected.**
     - **Option D (Recommended — Hybrid Authoritative `Type 12` Compliance + Proactive Client Boundary Prevention):**
       - *Layer 1 (Authoritative Abort Invariant):* Allow `draw_abort` (`Type 12`) through `DrawingCanvasCore.tsx:3131` for `data.instanceId === instanceId`. Cancel any active provisional stroke cleanly (`isDrawingRef = false`, clear timers/temp canvas/stroke buffers, `undoCache.discardPending()`, **do NOT** emit `draw_cancel`), AND if `Type 12` arrives after an optimistic `finishCurrentStroke` (`60s` `draw_end` abort carrying `strokeId > 0`, or un-ACKed tail entry), cleanly roll back the matching un-committed `localCommandsRef` entry without pushing to `localRedoStackRef`.
       - *Layer 2 (Proactive Client Boundary in `isFreeDraw || isExperimental`):* Gate point count inside `processStrokeMove` (including `getCoalescedEvents`) **before** exceeding server `3,000` points:
         - **Sub-option D1 (Recommended — Seamless Auto-Split at `2,900` points):** Cleanly finalize Stroke #1 via `finishCurrentStroke()` (`<= 2,900` pts + optional 1 end point <= `2,901` -> server commits `Type 9` + `Type 11`) and immediately call `startPencilOrEraserStroke(lastPt.x, lastPt.y)` maintaining pointer capture and stroke continuity (`100`-pt headroom guarantees client batches + coalesced bursts stay strictly `<= 3,000`). *Trade-off:* 1 continuous drag >2,900 pts produces 2 undoable segments and 1 `commitPending`/`stagePending` canvas blit (`680x396` = `~1.08 MB`) at split.
         - **Sub-option D2 (Alternative awaiting owner preference — Hard Cap / Finalize at `2,999` points without starting Stroke #2):** Commits cleanly at limit and locks gesture until `pointerup`/`pointerdown`, preserving `1 drag = 1 Undo` with zero mid-drag bitmap copy at the cost of halting ink until finger lift.
       - *Layer 3 (Server `Type 9` Enforcement):* Once client Layers 1–2 are applied, enforce O(1) exact `Type 9` contract in `server/registerDrawBinaryHandler.ts` (and helper in `server/utils/binaryBufferHelpers.ts`).
   - **E. Proposed Sub-Slices & Exact Files:**
     - **Sub-Slice 3A (Client `Type 12` + Boundary Alignment):** `src/components/game/DrawingCanvasCore.tsx` (unblock `draw_abort` at `3131`, handle local provisional cancel & un-ACKed `draw_end` rollback in `3394`, add proactive `2,900`-pt auto-split [or owner-selected D2 freeze] in `processStrokeMove`).
     - **Sub-Slice 3B (Server `Type 9` Ingress Validation + Tests):** `server/utils/binaryBufferHelpers.ts` (O(1) `isValidType9ShapeAndLength` / `extractValidatedInstId`), `server/registerDrawBinaryHandler.ts` (`Type 9` validation before `recordDrawCommand` / broadcast), `scripts/test_phase9a_slice3.ts` *(plus optionally `src/utils/drawBinaryHelper.ts:584-610` minimal `Type 9` bounds pre-check or defer all decoder pre-checks uniformly to Slice 4)*.
   - **F. Slice 3 Planned Regression Suite (16 Non-Duplicate Cases) & Acceptance Criteria:**
     1. Truncated `Type 9` (`1`..`15` bytes) rejected at `handleDrawBinary` in all modes.
     2. `Type 9` claiming `pointsLength = N` with fewer than `16 + N * 4` bytes (including `N = 65535` on 16B/64B buffer) rejected without broadcast or `drawHistory` insertion.
     3. `Type 9` with trailing bytes (`16 + N*4 + 1`, `+3`, `+64`, `+1024`) rejected in all modes (both with and without `strokeId`).
     4. Zero-point `Type 9` (`pointsLength = 0`, `16 B` and `18 B`) rejected at `handleDrawBinary` (`recordRoomDrawCommand` direct fixtures remain compatible).
     5. `Type 9` with disallowed `tool` (`2` bucket, `8` pipette, `9..255`) or invalid/empty `instId` (all-zero `""`, control chars, embedded null) rejected.
     6. Shape `Type 9` (`tool ∈ {3, 4, 5, 6, 7}`) accepted at valid `26 B` (`pointsLength === 2` + `strokeId`) and rejected when `pointsLength !== 2` (e.g., `1`, `3`, `5000`).
     7. Canonical (`Free Draw` / `Experimental`) continuous `Type 9` (`tool ∈ {0, 1}`) accepted at `1..3000` points (`16 + N*4 + 2`, max `12,018 B`) and rejected at `pointsLength >= 3001` (`>= 12,020 B`).
     8. Normal-mode continuous `Type 9` (`!isFreeDraw && !isExperimental`) accepted both without `strokeId` (`16 + N*4`) and with `strokeId` (`16 + N*4 + 2`) up to approved Normal ceiling without false rejection.
     9. Valid collaborative Redo `Type 9` (`strokeId` present, `1..3000` pts) persists `strokeId` into `drawHistory` and supports subsequent `Type 7` per-stroke Undo cleanly.
     10. Un-clamped out-of-bounds normalized coordinates encoded within valid `Int16LE` range (`[-30000, 30000]`) pass structural `Type 9` ingress intact.
     11. Client-originated `Type 9` structural validation runs identically in `useCanonicalPipeline === true` and `false` (no fallback leak).
     12. Originating-drawer routing logic verifies `event === 'draw_abort'` for `data.instanceId === instanceId` is not filtered by `3131` and clears provisional stroke state cleanly (without emitting `draw_cancel`).
     13. Late post-`pointerup` `Type 12` abort with matching un-committed `strokeId > 0` rolls back local un-committed command cleanly without corrupting prior strokes.
     14. Proactive client split triggers strictly before `3,000` points (`<= 2,901` per segment even under batched `getCoalescedEvents` input) and preserves `strokeId` monotonicity across split segments.
     15. Following Undo of a Redo-replayed or split `<= 3,000`-pt stroke, server `drawHistory` and client `localCommandsRef` remain identical across drawer, spectators, and late-joining `draw_history_sync`.
     16. `AGENTS.md` compliance check: invalid `Type 9` rejection does not mutate `room.gameState.isDrawingActive` or clear `redoStack`, and `Type 4` (`draw_action`) / legacy `Type 10` remain unaffected pending Slice 4.
     - *Acceptance Criteria:* `npx tsc --noEmit`, `npm run build`, `scripts/test_phase9a_slice3.ts`, and all 13 existing suites pass; zero drawer/spectator canvas or Undo/Redo desync on `>3,000`-pt continuous drags and `60s` aborts.
   - **G. CPU, RAM, Network, Low-End Mobile, Compatibility & Rollback:**
     - *CPU/RAM/Network:* Server `Type 9` validation is strictly $O(1)$ scalar header/length math (no point loop/array allocation), stopping up to `100 MB` malformed `Type 9` amplification in RAM/broadcast/`getJsonSafeHistory`. Auto-split at `2,900` pts generates one `1.08 MB` (`680x396`) `commitPending`/`stagePending` blit only every `2,900` points (~10–25s continuous drawing) and keeps `Type 13`/`Type 9` buffers `<= 12 KB`.
     - *Low-End Mobile:* Batching check inside `getCoalescedEvents()` prevents multi-event frames from overshooting `3,000` pts; avoid adding any `console.log` diagnostics (`AGENTS.md`).
     - *Compatibility Risks:* Old/cached browser clients without Sub-slice 3A hitting server Sub-slice 3B `<= 3,000`-pt `Type 9` enforcement could lose Redo on strokes drawn past 3,000 pts — therefore **deploy Sub-slice 3A + 3B together** (and reject >3000-pt `Type 9` only in canonical rooms while preserving Normal-mode continuous compatibility). Verify `finishShapeDrawing` shapes are strictly `2` pts across all modes.
      - *Rollback Strategy:* Revert `DrawingCanvasCore.tsx` (`3131` abort allowance, `3394` rollback, and `processStrokeMove` split guard), revert `Type 9` branch in `server/registerDrawBinaryHandler.ts` + helper in `server/utils/binaryBufferHelpers.ts`, remove `scripts/test_phase9a_slice3.ts`, and re-run `npx tsc --noEmit` + `npm run build` + Slices 1–2 suites *(rollback of server `Type 9` checks preserves wire format since zero wire headers change)*.
   - *Verification Status:* **COMPLETED & VERIFIED** — reported manually verified in gameplay by the project owner alongside passing `npx tsc --noEmit`, `npm run build`, `scripts/test_phase9a_slice3.ts` (71/71), and all 14 baseline suites.

4. **Slice 4 — `Type 4` (`draw_action`) Structural Hardening & Decoder Bounds Pre-Checks *(IN PROGRESS — READ-ONLY AUDIT COMPLETE)***
   - *Goal:* Close the last unvalidated structured packet (`Type 4` bucket fill) on server ingress without breaking legacy `Type 10` or `AGENTS.md` invariants, eliminate `DataView` `RangeError` noise and truncated/trailing misparses in `decodeBinaryDrawMessage` across all opcodes (`1..13`), guard batch bucket replay against `null`/`NaN`, and fix the obsolete `20`-byte `makeType4` test helper.
   - **A. Verified `Type 4` (`MSG_DRAW_ACTION`) Wire Contract (`src/utils/drawBinaryHelper.ts:286-321, 553-582`):**
     - `Byte 0` (`Uint8`): `4` (`MSG_DRAW_ACTION`).
     - `Bytes 1..7` (`7B ASCII`): `instId` (`writeString7`, `0x00`-padded; valid production `[a-z0-9]{1,7}`, Slice 2 server ingress `[a-zA-Z0-9_-]{1,7}`).
     - `Byte 8` (`Uint8`): `tool` index (`getToolIndex(data.tool)` -> **`2`** for `'bucket'`). Exhaustive search across `DrawingCanvasCore.tsx:2531, 5305` and all `scripts/` confirms `'bucket'` (`2`) is the ONLY tool ever emitted or rendered for `Type 4` (`canvasReplayEngine.ts:219` & `DrawingCanvasCore.tsx:3584` ignore non-`'bucket'` `draw_action` events).
     - `Bytes 9..11` (`3x Uint8`): `r, g, b` (`0..255`).
     - `Byte 12` (`Uint8`): `opacity` (`Math.min(100, Math.max(0, Math.round((opacity ?? 1) * 100)))` -> **`0..100`**).
     - `Bytes 13..14` (`Uint16LE`): `x` (`Math.min(10000, Math.max(0, Math.round((x || 0) * 10000)))` -> **`0..10000`**; note `Uint16LE`, NOT `Int16LE`).
     - `Bytes 15..16` (`Uint16LE`): `y` (`Math.min(10000, Math.max(0, Math.round((y || 0) * 10000)))` -> **`0..10000`**).
     - Independent Optional Fields:
       - `targetRGBA` (`4` bytes at `[17..20]`, `4x Uint8` `r, g, b, a` in `0..255`) when `targetR/G/B/A` are all defined (`baseLen = 21`, else `17`).
       - `strokeId` (`2` bytes `Uint16LE` at offset `baseLen` -> `[17..18]` when `!hasTarget`, `[21..22]` when `hasTarget`).
     - **Four Exact Mutually Unambiguous Lengths:**
       - **`17 B`**: No `targetRGBA`, no `strokeId` (Normal/minimal legacy emitters without `strokeId` or sampled target).
       - **`19 B`**: No `targetRGBA`, **with `strokeId`** at `[17..18]` (e.g., bucket fill when `floodFill` returned `null` or Redo/test calls supplying `strokeId` without `targetRGBA`).
       - **`21 B`**: **With `targetRGBA`** at `[17..20]`, no `strokeId` (optional `targetRGBA` without `strokeId`).
       - **`23 B`**: **With `targetRGBA`** at `[17..20]` **AND `strokeId`** at `[21..22]` (standard production client bucket click `DrawingCanvasCore.tsx:5305` when `sampledTarget` is returned + collaborative Redo `2516-2531`).
     - Because `17 + 0`, `17 + 2`, `17 + 4`, `17 + 6` map bijectively onto `{17, 19, 21, 23}`, both `decodeBinaryDrawMessage` (`563-576`) and `recordRoomDrawCommand` (`server/roomDrawingHistory.ts:43-48`) resolve optional fields cleanly without flag bits. Zero production paths emit `18`, `20`, `22`, `< 17`, or `> 23` bytes.
   - **B. `scripts/test_session_identity_suite.ts` Fixture Finding (`makeType4` at Line `1060`):**
     - `makeType4` (`1060-1065`), called solely at line `1160` inside `AUTH-11.1` (Normal-room authorization test), allocates a `20`-byte zero-filled buffer writing only `buf[0] = 4` and `instId` at `1..7`.
     - It sets `buf[8] = 0` (`'pencil'` rather than `'bucket' = 2`), leaves coordinates/color/opacity zeroed, and causes `decodeBinaryDrawMessage` (`20 >= 21` false, `20 >= 19` true) to misread bytes `17..18` as a phantom `strokeId = 0` while ignoring byte `19`.
     - *Decision:* Keep production validation strict (`{17, 19, 21, 23}`, `tool === 2`) and update `makeType4` in `scripts/test_session_identity_suite.ts:1060` to construct a valid `17`-byte bucket packet (`tool = 2`, valid `r/g/b`, `opacity <= 100`, `x/y <= 10000`) alongside Slice 4 implementation.
   - **C. `decodeBinaryDrawMessage` Complete `DataView` Bounds Audit (`src/utils/drawBinaryHelper.ts:395-663`):**
     - Currently only `view.byteLength < 8` is checked upfront (`425`). Except `Type 13` (`472-530`), malformed short buffers throw caught `RangeError`s (spamming `console.error`), short `Type 2/9` packets with huge header counts allocate partial arrays before throwing `RangeError`, and invalid intermediate/trailing lengths silently misparse or pass:
       - `Type 1` (`433-448`): `8..17 B` throws `RangeError`; `> 18 B` accepts trailing bytes -> require `view.byteLength === 18`.
       - `Type 2` (`450-470`): `< 10` or `< 10 + movesLength * 4` throws `RangeError` mid-loop (allocating partial `moves` up to 65,535 if truncated); `> 10 + movesLength * 4` accepts trailing bytes -> check `view.byteLength < 10`, read `movesLength`, check `view.byteLength !== 10 + movesLength * 4` BEFORE loop.
       - `Type 13` (`472-530`): Already bounds-safe (`< 10`, `=== 10` for `0`, `<= 3000`, `cursor.offset >= length`, `[-32768..32767]`, `cursor.offset !== length`) -> preserve 100%.
       - `Type 3` (`532-551`): `< 22 B` throws `RangeError`; `22 B` silently defaults `isCancelled = false`; `24/25/26/>27 B` accepts trailing bytes -> require `view.byteLength === 23 || view.byteLength === 27` (verified zero callers/tests emit `22 B`).
       - `Type 4` (`553-582`): `< 17 B` throws `RangeError`; `18, 20, 22, > 23 B` silently misparse/drop optional fields -> require `len === 17 || len === 19 || len === 21 || len === 23` AND validate `buf[8] === 2`, `opacity <= 100`, `x <= 10000`, `y <= 10000`.
       - `Type 9` (`584-610`): `< 16` or `< 16 + pointsLength * 4` throws `RangeError` mid-loop; `expectedLen + 1` or `> expectedLen + 2` accepts trailing bytes -> check `view.byteLength < 16`, compute `expectedLen = 16 + pointsLength * 4`, require `view.byteLength === expectedLen || view.byteLength === expectedLen + 2` BEFORE allocating `points` array.
       - `Type 11` (`612-619`): `8..11 B` throws `RangeError`; `> 12 B` ignores trailing bytes -> require `view.byteLength === 12`.
       - `Type 12` (`621-627`): `8..9 B` throws `RangeError`; `> 10 B` ignores trailing bytes -> require `view.byteLength === 10`.
       - `Type 5` (`629`), `Type 6` (`636`), `Type 8` (`651`): Only read `0..7` but accept `> 8 B` trailing bytes -> require `view.byteLength === 8` (distinct from legacy **`Type 10`**, which MUST keep `view.byteLength >= 8` since its legacy format is unknown!).
       - `Type 7` (`643-649`): `9 B` silently drops byte 8 (`strokeId = undefined`), `> 10 B` accepts trailing bytes -> require `view.byteLength === 8 || view.byteLength === 10`.
       - *Consumer Safety Gap (`DrawingCanvasCore.tsx:3004-3029`):* In `replayFreeDrawHistorySafely` batch bucket mode (`isBucketCommand` checks `byte0 === 4`), if `decodeBinaryDrawMessage(cmdObj.data)` returns `null`, `const data = decoded?.data || {}` produces `data.x * LOGICAL_WIDTH = NaN`, and `executeRasterFloodFill` (`canvasFloodFill.ts:95`) checks `if (sx < 0 || sx >= cw || sy < 0 || sy >= ch)` which is **`false` for `NaN`**! Guard `!decoded || !decoded.data || decoded.data.tool !== 'bucket' || decoded.data.x === undefined || decoded.data.y === undefined` -> `continue` before reading `batchData`. All other 6 `decodeBinaryDrawMessage` call sites (`DrawingCanvasCore.tsx:2245, 2495, 2932, 3141, 3675`, `canvasReplayEngine.ts:103`) already handle `null` safely.
   - **D. Confirmed vs. Unconfirmed Issues & Approved Implementation Scope:**
     - *Confirmed:* (1) Unvalidated `Type 4` ingress (`registerDrawBinaryHandler.ts:285-291`); (2) Outdated `20 B` `makeType4` helper (`test_session_identity_suite.ts:1060`); (3) Missing `DataView` pre-checks & `try/catch` `RangeError` exposure in `decodeBinaryDrawMessage` (`drawBinaryHelper.ts`); (4) Batch bucket `null`/`NaN` hazard (`DrawingCanvasCore.tsx:3004-3029`).
     - *Unconfirmed / Preserved:* Legacy `Type 10` format remains unknown (`NO_GIT`) — do NOT tighten `Type 10` length (`>= 8 B` kept, `server/roomDrawingHistory.ts:100` `type === 4 || type === 10 || type === 5` untouched per `AGENTS.md`); `Type 4` optional `strokeId` may be absent in legacy/Normal tests so allow `{17, 19, 21, 23}` across all modes rather than rejecting `17/21 B` in Free Draw; `Type 1..13` coordinate clamped ranges beyond wire types (except `Type 4` `[0..10000]` & `opacity <= 100`) keep existing bounds.
     - *Files Targeted in Slice 4:* `server/utils/binaryBufferHelpers.ts` (add O(1) `isValidType4Packet`), `server/registerDrawBinaryHandler.ts` (explicit `else if (type === 4)` branch guarding `recordDrawCommand` & broadcast while isolating `else` strictly to legacy `Type 10`), `src/utils/drawBinaryHelper.ts` (O(1) per-type `DataView` bounds & `Type 4` field validation returning `null` cleanly before any `DataView` read), `src/components/game/DrawingCanvasCore.tsx` (`3004-3029` batch bucket null/`NaN` skip guard), `scripts/test_session_identity_suite.ts` (fix `makeType4` to `17 B` bucket), and new `scripts/test_phase9a_slice4.ts`.
   - *Acceptance Criteria:* `npx tsc --noEmit`, `npm run build`, `scripts/test_phase9a_slice4.ts`, and all 14 existing regression suites pass; zero `RangeError` / `console.error` exceptions on truncated/malformed buffers; bucket flood fill & first-action `AGENTS.md` invariant preserved across Normal, Experimental, and Free Draw.

4. **Slice 4 — `Type 4` (`draw_action`) Structural Hardening & Decoder Bounds Pre-Checks *(COMPLETED & VERIFIED)***
   - *(Implementation complete, Slice 4 harness clean-exit lifecycle fixed via `try/finally` `stopManagerTimer` + `process.exit(0)` on success, `scripts/test_phase9a_slice4.ts` passing `36 passed, 0 failed` with exit `0`, `scripts/test_session_identity_suite.ts` passing `626` tests with exit `0`, `tsc --noEmit` PASS, `npm run build` PASS, and "The project owner tested the game manually and confirmed that it works normally.")*

5. **Slice 5 — Network Ingress Resource Protection *(Slices 5A, 5B, 5C-1, 5C-2 & 5C-3A COMPLETED & VERIFIED; Slice 5C-3B AWAITING OWNER VERIFICATION)***
   - *Goal:* Protect `draw_binary` ingress in Slice 5A via O(1) per-socket packet and byte/decode-work token buckets; enforce `maxHttpBufferSize = 512 * 1024` (`524,288` B) on the production Socket.IO server in Slice 5B; close remaining control-event input boundaries and drawing-identity map caps in Slice 5C-1; enforce O(1) per-socket control-event token buckets in Slice 5C-2; harden Vote-Kick notification/self-vote abuse in Slice 5C-3A; and enforce genuine AFK activity tracking in Slice 5C-3B.
   - **A. Slice 5A Implementation Summary (`COMPLETED & VERIFIED`):**
     - **Finalized Thresholds (Validated Against Client Cadence):**
       - Packet Token Bucket: **`maxPackets = 80`**, **`packetRefillPerSec = 35`** (covers `200ms` continuous batches ~5 pkt/s, `2,900`-pt auto-split 3-packet seams, and rapid shape/stippling/undo bursts without dropping legitimate strokes).
       - Byte/Work Token Bucket: **`maxWorkUnits = 524_288`** (`512 KiB`), **`workRefillPerSec = 65_536`** (`64 KiB/s`) — covers full `262,158 B` Normal 65,535-pt `Type 9` + surrounding operations while capping `Type 13` 3,000-pt decode floods (`Math.max(buf.length, compressedCount * 4)` pre-decode work cost after O(1) header checks).
     - **Control Flow & Active-Stroke Sync Cleanup:** Runs in `server/registerDrawBinaryHandler.ts` *after* central room/drawer authorization, direction filtering, and O(1) structural header checks, and *strictly before* `decodeType13BufferSafely`, `recordDrawCommand`, `undo*`/`redo*`/`handleFreeDrawClear`, or broadcasts. If a throttled opcode (`1, 2, 3, 6, 9, 13`) leaves an open canonical `freeDrawStrokes` entry or Normal `room.gameState.isDrawingActive === true`, cleans it up once via `abortFreeDrawStroke` / `isDrawingActive = false` + single `Type 12` abort without touching `drawHistory` or `redoStack`, then drops repeat flood packets silently.
     - **Disconnect Cleanup:** `server.ts` invokes `defaultDrawRateLimiter.cleanupSocket(socket.id)` in `socket.on('disconnect', ...)`.
     - **Verification:** `scripts/test_phase9a_slice5a.ts` (`26/26` passed, exit `0`) + project owner manual verification of normal gameplay.
   - **B. Slice 5B Implementation Summary (`COMPLETED & VERIFIED`):**
     - **Configured Transport Limit:** `MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES = 512 * 1024` (`524,288` B / `512 KiB`) exported from `server/transportConfig.ts` and applied to `new Server(httpServer, { ..., maxHttpBufferSize: MAX_SOCKET_HTTP_BUFFER_SIZE_BYTES, ... })` in `server.ts`.
     - **Unchanged Transport Invariants:** `transports: ['websocket']`, `socket.io-msgpack-parser@3.0.2`, client `SocketProvider.tsx` (`reconnection: true`, WebSocket-only, `customParser`), uncompressed transport, Slice 5A `draw_binary` limiter, and outbound `draw_history_sync` remain untouched.
     - **Verified Wire Envelope & Boundary Behavior (`socket.io@4.8.4` / `engine.io@6.6.11` / `ws@8.21.3`):** Real `socket.io-client` attaches `options: { compress: true }` (+19 B over bare MsgPack headers), yielding +54 B (<64 KiB `ArrayBuffer`) / +56 B (>=64 KiB `ArrayBuffer`) on `draw_binary`: canonical max `Type 13` (`18,064 B`), canonical max `Type 9` (`12,072 B`), and theoretical 65,535-pt Normal `Type 9` (`262,214 B`) all pass intact; `524,287` B & `524,288` B pass, whereas `524,289` B (`MAX+1`) is closed at WebSocket `ws` layer (`1009`, client `'transport close'`) before MsgPack parsing or Socket.IO event dispatch.
     - **Verification:** `scripts/test_phase9a_slice5b.ts` (`16/16` passed, exit `0`) + project owner manual verification of normal gameplay.
   - **C-1. Slice 5C-1 Implementation Summary (`COMPLETED & VERIFIED`):**
     - **`join_room` (`server/registerJoinRoomHandler.ts`):** Early structural, control-character, and UTF-16 length checks before room lookup, auth credential mutation, or broadcasts (preserving whitespace-padded Arabic nicknames, flag/ZWJ emoji avatars `<= 32` UTF-16 code units, and `NetDrawerAuth`), plus deferral of `supportsType13` capability writes until join or reconnect succeeds.
     - **Drawing Identities (`server/rooms.ts`, `server/registerDrawingIdentityHandlers.ts`):** Pre-trim `instanceId.length <= 64` guard and `MAX_DRAWING_IDENTITIES_PER_SOCKET = 2` per room on new/unowned claims, preserving idempotent same-owner re-registration (`0` broadcasts), active-owner steal protection, unregister slot freeing, and disconnect cleanup.
     - **`client_capabilities` (`server/controlInputValidation.ts`, `server/rooms.ts`, `server.ts`):** Replaced `{ ...existing, ...caps }` spread with strict `sanitizeClientCapabilities` extracting only boolean `supportsType13` and discarding arbitrary properties/nested blobs while preserving legacy defaults on omitted fields.
     - **`get_room_info` (`server/controlInputValidation.ts`, `server.ts`):** Added `handleGetRoomInfo` with early string/`<= 100`/non-control-char/non-empty validation prior to `getRoom`/`getRoomConfig`, returning default `{ count: 0, max: 5, winningScore: 30, theme: 'General' }` cleanly with zero `TypeError` or `console.error` spam.
     - **Pre-`trim()` / Pre-`find()` Control Bounds (`server/registerSendMessageHandler.ts`, `server/registerSubmitGuessHandler.ts`, `server/registerSelectWordHandler.ts`, `server/controlInputValidation.ts`, `server/registerVoteKickHandler.ts`):** Enforced raw string limits before `.trim()` (`send_message`/`submit_guess` `<= 1000`, `select_word` `<= 128`, `draw_repair_req` `instId <= 16`, `submit_vote_kick` `targetPlayerId <= 64` + Arrays rejected), moved existing `3/2s` vote-kick rate check before `room.players.find`, and preserved all existing rate limits (`5/2s`, `3/2s`, `1/1s`, `20/1s`, `10`-ID `get_rooms_info`).
     - **Verification:** `scripts/test_phase9a_slice5c1.ts` (`27/27` passed, exit `0`), `npx tsc --noEmit` (`0` errors, exit `0`), `npm run build` (exit `0`), `test_payload_validation_suite.ts` (`212 passed`, exit `0`), `test_session_identity_suite.ts` (`626 passed`, exit `0`), `test_leave_room_integrity.ts` (`78 passed`, exit `0`), `test_state_transition_reset.ts` (`6 passed`, exit `0`), `test_phase9a_slice5a.ts` (`26/26` passed, exit `0`), and `test_phase9a_slice5b.ts` (`16/16` passed, exit `0`).
   - **C-2. Slice 5C-2 Implementation Summary (`COMPLETED & VERIFIED`):**
     - **O(1) Per-Socket Limiter (`server/rateLimit.ts`):** Added `ControlRateLimiter`, `CONTROL_RATE_LIMITS`, `defaultControlRateLimiter`, and `cleanupControlRateLimit` storing fixed per-socket bucket slots inside a single `Map<string, SocketControlBucketsRecord>` with O(1) `Map.delete(socketId)` cleanup on disconnect, keeping `checkRateLimit()` and `server/drawRateLimit.ts` untouched.
     - **Event Groups & Preserved Routes:** `join_room` (`4` burst / `0.5/s`, returning `{ success: false, error: 'rate_limited' }`), `get_room_info` (`10` burst / `5/s`, returning `{ error: 'rate_limited' }`), `get_rooms_info` (`4` burst / `1/s`, replying empty object), shared `start_free_draw`/`stop_free_draw` (`free_draw_toggle` `4` burst / `1/s`), shared `register_drawing_identity`/`unregister_drawing_identity` (`drawing_identity` `8` burst / `2/s`), and `request_drawing_identities` (`4` burst / `1/s`); `leave_room` and `client_capabilities` remain unthrottled and disconnect cleanup runs inside `server.ts` `finally`.
     - **Verification:** `scripts/test_phase9a_slice5c2.ts` (`17/17` passed, exit `0`) + project owner manual verification of normal gameplay.
   - **C-3A. Slice 5C-3A Implementation Summary (`COMPLETED & VERIFIED`):**
     - **Self-Vote Protection (`server/registerVoteKickHandler.ts`):** Compares authenticated voter identity against resolved target player's authoritative identity before mutating `room.votekicks`, `chatMessages`, or broadcasting, returning `{ success: false, error: 'cannot_vote_self' }`.
     - **Separate `votekick_alert` Cooldown (`server/registerVoteKickHandler.ts`, `src/types/game.ts`, `server/rooms.ts`):** Enforces a 60,000ms cooldown keyed by `(voterId, targetPlayerId)` on `votekick_alert` system chat notifications only, preserving vote withdrawal, vote changes, quorum ban logic, `3/2s` rate limiting, client 60s cooldown, and `VOTE-3` / `NET` behavior; cleans up stale pairs in `removePlayerFromRoom`.
     - **Verification:** `scripts/test_phase9a_slice5c3a.ts` (`27/27` passed, exit `0`) + project owner manual verification of normal gameplay.
   - **C-3B. Slice 5C-3B Implementation Summary (`AWAITING OWNER VERIFICATION`):**
     - **Removed Global Tracking (`server.ts`):** Removed `PASSIVE_BACKGROUND_EVENTS` and `socket.onAny` completely; unknown, passive, malformed, unauthorized, and rate-limited events never refresh `player.lastActivity`.
     - **Centralized O(1) Activity Update (`server/controlInputValidation.ts`):** Added `PlayerActivityTarget`, `markPlayerActive(player, now)`, and `handlePingActivity(socket, roomManager, now)` to update `lastActivity` and clear `afkWarningSent = false` without allocations or timers.
     - **Genuine Event & Lifecycle Sites (`server/registerDrawBinaryHandler.ts`, `server/registerSendMessageHandler.ts`, `server/registerVoteKickHandler.ts`, `server/rooms.ts`):** Refreshes activity strictly after validation/authorization/rate limits succeed for accepted `draw_binary`, `send_message`, valid `submit_guess`, `startGameRound`, `handleSkipTurn`, consumed `requestHint`, accepted `reportDrawing`, valid `submit_vote_kick` vote/withdrawal, authorized Free Draw toggles, `ping_activity`, `addPlayerToRoom`, and both authenticated branches of `reconnectPlayer`.
     - **Verification:** `scripts/test_phase9a_slice5c3b.ts` (`46/46` passed, exit `0`), `npx tsc --noEmit` (`0` errors, exit `0`), `npm run build` (exit `0`), `test_phase9a_slice5c3a.ts` (`27/27`, exit `0`), `test_phase9a_slice5c2.ts` (`17/17`, exit `0`), `test_payload_validation_suite.ts` (`212 passed`), `test_session_identity_suite.ts` (`626 passed`), `test_leave_room_integrity.ts` (`78 passed`), `test_state_transition_reset.ts` (`6 passed`). **Awaiting owner manual gameplay verification.**

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
- **Slice 3 Regression Suite (`scripts/test_phase9a_slice3.ts` — Executed, 71/71 Passed):**
  1. Strict `Type 9` validation across Normal, Free Draw, and Experimental (`{3..7}` shapes `26 B` w/ 2-pt check, canonical continuous `1..3,000` + 2B `strokeId`, Normal continuous `1..65,535` w/ or w/o `strokeId`, truncated headers `< 16 B`, truncated payloads, trailing bytes `+1/+3/+64/+1024`, `pointsLength = 0`, disallowed tools `2/8/9/255`, empty/malformed `instId`, full `[-32768..32767]` coordinates untouched, `Type 4` & `Type 10` untouched, O(1) throughput `4.50 ms / 5,000` frames).
  2. Originating-client `Type 12` (`draw_abort`) Case 1 (mid-stroke pointer down) and Case 2 (late post-release `strokeId > 0`, including active subsequent stroke preservation, zero false Redo, zero `Type 3/6/7`), plus live server `60s` expiry verification on both `Type 13` move (`strokeId=0`) and `Type 3` end (`strokeId=77`).
  3. Prospective `willCanonicalSegmentExceedLimit` boundary checks and full 7,500-point continuous Free Draw & Experimental end-to-end auto-split integration: zero `Type 12` aborts, `<= 3,000`-pt committed segments, monotonic `strokeId`s (`1, 2, 3`), exact endpoint seam continuity, individual per-segment Undo (`Type 7`) + Redo (`Type 9`), and late-joiner `drawHistory` recovery.
- **Slice 4 Regression Suite (`scripts/test_phase9a_slice4.ts` — Executed, `36 passed, 0 failed`, Exit `0`):**
  1. Server `Type 4` accepts all four legitimate encoded forms (`17`, `19`, `21`, `23` B) with valid `instId`, `tool === 2`, `opacity <= 100`, `x/y <= 10000` in Normal, Experimental, and Free Draw rooms, and preserves `AGENTS.md` first-action (`type === 4` on empty history) + `redoStack = []` clearing.
  2. Server `Type 4` rejects truncated (`< 17 B`), invalid-combination/trailing (`18`, `20`, `22`, `24`, `128`, `1024 B`), non-bucket `tool` (`0, 1, 3..8, 255`), empty/malformed `instId`, `opacity > 100`, and `x > 10000` / `y > 10000` before `drawHistory`, `redoStack`, `isDrawingActive`, or broadcast.
  3. Client `decodeBinaryDrawMessage` decodes all valid packets (`1, 2, 3, 4 {17,19,21,23}, 5, 6, 7 {8,10}, 8, 9, 10, 11, 12, 13`) identically without regression.
  4. Client `decodeBinaryDrawMessage` returns `null` with ZERO `RangeError` / `console.error` noise on every truncated boundary (`8..minLen-1`), `count = 65535` short-buffer DoS payloads (`Type 2`/`9`), invalid lengths (`Type 4 {18,20,22,24}`, `Type 3 {22,24,25,26,28}`, `Type 7 {9,11}`), and trailing bytes on `1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12`, while keeping legacy `Type 10` (`>= 8 B` -> `'draw_clear'`) untouched.
  5. Batch bucket replay guard verification: a malformed byte-`4` entry returning `null` from `decodeBinaryDrawMessage` is skipped safely without passing `NaN` into `executeRasterFloodFill`.
- **Slice 5A Regression Suite (`scripts/test_phase9a_slice5a.ts` — Executed, `26 passed, 0 failed`, Exit `0`):**
  1. Normal continuous drawing (~5 pkt/s) + periodic 3-packet auto-split seams pass 0-drop over 30s; `80`-packet burst passes and 81st throttles; linear `35` pkt/s refill verified.
  2. Work-unit burst (`524,288`) accepts full `262,158 B` Normal `Type 9` and rejects overflow atomically without deducting `packetTokens`; linear `65,536/s` refill verified.
  3. Per-socket isolation, immediate `cleanupSocket` removal across `1,000` connect/cleanup cycles, fresh bucket on reconnect with new `socket.id`, and O(1) speed (`7.02 ms / 100,000` checks).
  4. `Type 13` pre-bucket invalid-header rejection, single-decode path on allowed packets, work-budget abort at packet `#44` with zero `decodeType13BufferSafely` invocations on rejected flood packets.
  5. Active-stroke sync cleanup (`abortFreeDrawStroke` / `isDrawingActive = false` + single `Type 12` abort) on throttled `Type 13`/`2`/`3`, zero `drawHistory`/`redoStack`/collaborator mutations on throttled `Type 4`/`5`/`9`/`10`, and `AGENTS.md` first-action `Type 4` invariant preserved.
- **Slice 5B Transport Protection Suite (`scripts/test_phase9a_slice5b.ts` — Executed, `16 passed, 0 failed`, Exit `0`):**
  1. Valid `join_room` (`200 B`), `send_message` (`100 B`), `submit_guess` (`65 B`), small `Type 4` (`76 B`), max canonical `Type 13` (`18,064 B`), max canonical `Type 9` (`12,072 B`), and theoretical 65,535-pt Normal `Type 9` (`262,214 B`) succeed over real WebSocket + `socket.io-msgpack-parser`.
  2. Exact live Engine.IO wire boundaries calibrated & verified: `524,287 B` & `524,288 B` accepted cleanly (`transport_probe` ack & `draw_binary`), while `524,289 B` (`MAX+1`) rejects pre-handler without ack or event dispatch (`'transport close'`).
  3. Oversized binary (`draw_binary` `524,289 B`) & non-binary (`send_message` `540,062 B`, `join_room` `530,138 B`) disconnect pre-handler with `0` app handler calls, `0` `drawHistory`/`chatMessages` mutations, `0` bystander broadcasts, and intact healthy bystander functionality.
  4. Real `reconnection: true` transport recovery assigns a new `socket.id` after oversized disconnect, restores `draw_history_sync` via `reconnectSecret` (`join_room` `reconnectOnly: true`), and resumes normal stroke commits; `751,559 B` (`> 512 KiB`) server→client `draw_history_sync` delivers without disconnect.
- **Slice 5C-1 Regression Suite (`scripts/test_phase9a_slice5c1.ts` — Executed, `27 passed, 0 failed`, Exit `0`):**
  1. `join_room` compatibility preserved for `NetDrawerAuth`, whitespace-padded `'  أحمد  '`, and flag/ZWJ emoji avatars (`<= 32` UTF-16), while all `26` invalid payloads reject with zero player/authStore/capability/room/broadcast side effects.
  2. Drawing identity ownership cap enforces `MAX_DRAWING_IDENTITIES_PER_SOCKET = 2` per room, preserves idempotent re-registration (`0` broadcasts), active-owner steal prevention, unregister slot freeing, disconnect cleanup, `REG-1.V2` (`inst-direct-123`), and `> 64` pre-trim rejection.
  3. `client_capabilities` allowlist preserves `supportsType13` boolean transitions and legacy defaults while rejecting `null`/primitives/`Array`/non-boolean values and dropping arbitrary properties/nested blobs.
  4. `get_room_info` validates room IDs early (`handleGetRoomInfo`) and returns default config cleanly across invalid types/empty/control-char/`> 100` inputs with zero `TypeError` or `console.error` spam.
  5. Pre-`trim()` raw bounds and Array rejections verified across `send_message`, `submit_guess`, `select_word`, `draw_repair_req`, and pre-`find()` `submit_vote_kick` validation + `3/2s` rate limiting, plus live Socket.IO + MsgPack wire integration (`F1–F3`).
- **Slice 5C-2 Control-Event Rate Limiting Suite (`scripts/test_phase9a_slice5c2.ts` — Executed, `17 passed, 0 failed`, Exit `0`):**
  1. Verified all 6 O(1) token-bucket groups (`join_room`, `get_room_info`, `get_rooms_info`, shared `free_draw_toggle`, shared `drawing_identity`, `request_drawing_identities`), per-socket/per-event isolation, bounded memory on 5,000-flood bursts, and O(1) disconnect cleanup across 1,000 lifecycles.
  2. Verified throttled callback contracts, preserved `leave_room` / `client_capabilities` / prior Slice 5A & chat/guess/vote-kick/sync limiters, and live Socket.IO + MsgPack StrictMode join/identity bursts.
- **Slice 5C-3A Vote-Kick Server Hardening Suite (`scripts/test_phase9a_slice5c3a.ts` — Executed, `27 passed, 0 failed`, Exit `0`):**
  1. Verified authoritative self-vote rejection (`cannot_vote_self`) without mutating `room.votekicks`, chat, or broadcasts.
  2. Verified 60,000ms `(voterId, targetPlayerId)` `votekick_alert` notification cooldown while preserving vote withdrawal, legitimate target changes, `3/2s` rate limiting, quorum bans, `removePlayerFromRoom` cleanup, and live Socket.IO + MsgPack wiring.
- **Slice 5C-3B AFK Activity Accuracy Suite (`scripts/test_phase9a_slice5c3b.ts` — Executed, `46 passed, 0 failed`, Exit `0`):**
  1. Verified invalid, malformed, word-leak, unauthorized, duplicate, exhausted, rate-limited, and passive events never update `lastActivity` or clear `afkWarningSent`.
  2. Verified genuine accepted gameplay events (`draw_binary` `Types 1/2/3/4`, `send_message`, valid wrong `submit_guess`, `select_word`, consumed `requestHint`, new `reportDrawing`, `handleSkipTurn`, valid `submit_vote_kick` add/withdraw, accepted `start_free_draw`/`stop_free_draw`, `ping_activity`), `addPlayerToRoom`, and successful `reconnectPlayer` update `lastActivity` and clear `afkWarningSent = false`.
  3. Verified failed reconnects do not refresh activity, 140s warning / 230s eviction thresholds enforce despite passive/unauthorized/RL floods, and live Socket.IO + MsgPack unknown events cannot bypass AFK timers.

- **Current Status:**  
  `IN PROGRESS — Slices 1–4, 5A, 5B, 5C-1, 5C-2 & 5C-3A COMPLETED & VERIFIED; Slice 5C-3B AWAITING OWNER VERIFICATION`

- **Next Exact Action:**  
  `Complete owner manual gameplay verification for Slice 5C-3B to finalize PHASE 9A closure.`

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
