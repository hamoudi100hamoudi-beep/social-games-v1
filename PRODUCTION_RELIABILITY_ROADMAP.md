# PHASE 9 — Production Reliability & Resource Safety Roadmap

**Repository:** `hamoudi100hamoudi-beep/social-games-v1`  
**Workstream Owner Status:** Active  
**Governance:** All drawing/undo modifications must strictly comply with [`AGENTS.md`](./AGENTS.md) architectural invariants (`type === 4 || type === 10 || type === 5` first-action rule, 1-step undo/redo `isDrawingActive` lock, zero hot-path diagnostic logging, and zero $O(N)$ flat packet sweeps on reconnect).

---

## E. Current Checkpoint / Session Handoff

- **Active Phase / Task:** `PHASE 9A — Binary Packet Contract & Input Safety` (Read-Only Audit Complete; Implementation Not Started)
- **Workspace Git State (Observed):** Local `.git` metadata is absent in the current workspace (`git status`, `git branch -v`, and `git log -n 3 --oneline` exited `128`: `fatal: not a git repository`). Active branch name and `HEAD` commit hash are therefore unverified in this workspace (historical `REFACTORING_ROADMAP.md` cites `6975924ce7fc1d9f5298fac41d5e1a833a2c3a11` for completed Phase 8A).
- **Last Completed Milestone:**
  - Initialized `PRODUCTION_RELIABILITY_ROADMAP.md` covering `PHASE 9A` through `PHASE 9F`.
  - Completed strict read-only source audit of the entire Socket.IO binary drawing protocol (`server.ts`, `server/registerDrawBinaryHandler.ts`, `server/roomCanonicalStrokeEngine.ts`, `server/roomDrawingHistory.ts`, `server/utils/binaryBufferHelpers.ts`, `server/rooms.ts`, `server/registerJoinRoomHandler.ts`, `server/registerRequestRoundSyncHandler.ts`, `src/utils/drawBinaryHelper.ts`, `src/components/game/DrawingCanvasCore.tsx`, `src/types/game.ts`, and `scripts/*`).
- **Source Code Changes Made:** None (0 application files modified; 0 dependencies or lockfiles modified; 0 test commands run).
- **Key Audit Takeaways (PHASE 9A):**
  - Confirmed Type 2 trailing-byte bypass in canonical `handleFreeDrawMove` (`server/roomCanonicalStrokeEngine.ts:132-149`), allowing arbitrary trailing bytes up to `maxHttpBufferSize` (`1e8` = 100,000,000 bytes) to be relayed to all room spectators.
  - Confirmed that server-only packet types `11` (`MSG_DRAW_COMMIT`) and `12` (`MSG_DRAW_ABORT`), as well as unvalidated client types `1` (shapes), `3`, `4`, `6`, `7` (trailing bytes), `8`, `9`, and unknown types (`0`, `10`, `14..255`), either bypass size/structural checks in `handleDrawBinary`'s `else` fallback or allow trailing bytes.
  - Confirmed a critical client decoder fallback hazard in `decodeBinaryDrawMessage` (`src/utils/drawBinaryHelper.ts:629-642`): any unknown type (`0`, `10`, `14..255`) defaults to `'draw_clear'`, wiping client canvases via `applyClearEpoch` (`DrawingCanvasCore.tsx:3446-3447`).
  - Confirmed `AGENTS.md` specifically protects `type === 4 || type === 10 || type === 5` inside `recordRoomDrawCommand` (`server/roomDrawingHistory.ts:100`), though no client encoder emits Type 10.
- **Immediate Blockers / Open Decisions Before 9A Implementation:**
  1. Confirm handling for legacy `Type 10` (protected check in `roomDrawingHistory.ts:100` vs. client fallback to `'draw_clear'`).
  2. Decide whether Free Draw collaborative Redo (`DrawingCanvasCore.tsx:2488-2498`, which re-emits client-originated `Type 9`) needs client/server alignment on the `3,000`-point cap (today a drawn stroke accepted by canonical engine has `<= 3,000` points unless offline/local mutation occurred, whereas legacy normal mode `4848-4861` has no client-side `3,000`-point cap).
  3. Confirm target `maxHttpBufferSize` reduction (e.g., whether `1e6` / `2e5` / `64 KiB` vs. `max` JSON `draw_history_sync` / MsgPack payload constraints on large reconnects).
- **Exact Next Action:**
  `Review the PHASE 9A audit report and agree on the safest implementation scope before modifying source code.`

---

## A. Workstream Purpose & Scope

**Why This Workstream Exists:**  
While the codebase already passes static compilation and targeted feature test suites, production deployment requires strict hardening around untrusted binary Socket.IO inputs, bounded per-room memory growth and join/sync CPU cost, deterministic dependency installation, standardized test execution, CI verification, and ongoing dependency vulnerability management.

**Why Separate from `REFACTORING_ROADMAP.md`:**  
`REFACTORING_ROADMAP.md` tracks the completed modularization and UI/rendering architecture work (`PHASE 1` through `PHASE 8B`, all closed/completed). **PHASE 9 (`Production Reliability & Resource Safety`)** is a distinct operational, protocol-security, resource-lifecycle, and engineering-automation workstream so architectural cleanup history remains intact and unmixed with production hardening decisions.

---

## B. Master Task Checklist

- [ ] **PHASE 9A — Binary Packet Contract & Input Safety** *(Audit Complete / Implementation Not Started — `IN PROGRESS`)*
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
   - **Verified:** `maxHttpBufferSize` in `server.ts:110` is `1e8` (100,000,000 bytes).
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
  1. **Transport Buffer Cap (`server.ts:110`):** `maxHttpBufferSize: 1e8` (100,000,000 bytes). Because `handleDrawBinary` checks neither a global frame limit nor exact packet lengths for most types, an authenticated drawer (or any joined Free Draw player who calls `start_free_draw`) can emit up to ~95.37 MiB per `draw_binary` message.
  2. **Confirmed Type 2 Trailing-Bytes Defect (`roomCanonicalStrokeEngine.ts:132-149`, `registerDrawBinaryHandler.ts:187-195`):** Canonical `handleFreeDrawMove` checks `buf.length < expectedByteLen` and `stroke.points.length + count > 3000`, accepts buffers with `buf.length > expectedByteLen`, and `handleDrawBinary` relays the unmodified `buf` (with all trailing bytes) to the room. Client `decodeBinaryDrawMessage` ignores trailing bytes beyond `10 + movesLength * 4`.
  3. **Canonical Mode Empty-`instId` Persistence Edge Case (`roomCanonicalStrokeEngine.ts:66-70, 272-276`, `roomDrawingHistory.ts:60`):** None of `handleFreeDrawStart/Move/End` reject an all-null `instId` (`""`). When `instId === ""`, `recordRoomDrawCommand`'s duplicate-Type-3 suppression (`if (isBinary && instId && ...)`) does not fire, allowing unvalidated Type 3 buffers (including trailing bytes) to be persisted into `drawHistory` right after `type9Buf`. Also cancelled `Type 3` (`buf[22] === 1`) triggers `abortFreeDrawStroke` (returns `null` from `handleFreeDrawEnd`), causing `registerDrawBinaryHandler.ts:209-211` to broadcast the raw client `buf` unchecked.
  4. **Bypass in `registerDrawBinaryHandler.ts:213-218` (`else` Branch):** Reached in active rooms by `Type 1` (shapes), `Type 3` (shapes), `Type 4` (bucket), `Type 6` (cancel), `Type 9` (client shape strokes & Free Draw/Exp client `executeRedo` strokes), **plus spoofed `Type 11` / `Type 12`, `Type 13` (if `!useCanonicalPipeline`), and unknown types (`0`, `10`, `14..255`)**. Has **zero** length, bounds, coordinate, count, direction, or trailing-byte validation; directly calls `recordDrawCommand` and broadcasts raw `buf`.
  5. **Type 9 Unchecked Header & Length (`roomDrawingHistory.ts:51-56, 84-99`):** A 16-byte client `Type 9` with `pointsLength = 65535` or a 100 MB Type 9 passes the `else` branch, gets stored in `drawHistory` (`isValidStart = true`), broadcasts to room clients (where `decodeBinaryDrawMessage` throws `RangeError` and drops it), and bloats `draw_history_sync`. Legitimate client `Type 9` sizes are `26 B` (shapes), `<= 12,018 B` (canonical 3,000-pt stroke), or `16 + N*4 (+2)` in legacy normal mode / client Free Draw Redo.
  6. **Server-Only Type Spoofing (`Type 11` & `Type 12`):** Clients never legitimately send `Type 11` (`MSG_DRAW_COMMIT`) or `Type 12` (`MSG_DRAW_ABORT`), yet if sent, the `else` branch relays them to other sockets (corrupting spectator `activeSessionsRef` / `drainingStrokesRef` or triggering bogus `draw_repair_req` storms) and appends them to non-empty `drawHistory`.
  7. **Unknown Type -> Canvas Wipe (`drawBinaryHelper.ts:629-642`, `DrawingCanvasCore.tsx:3446-3447`):** `decodeBinaryDrawMessage` defaults unrecognized byte `0` values (`0`, `10`, `14..255`) to `'draw_clear'`, causing spectators to wipe their canvas via `applyClearEpoch`. Meanwhile `Type 10` (referenced in `roomDrawingHistory.ts:100` per `AGENTS.md` and `server.ts:79`) has zero client encoder, and `getToolName(idx)` (`drawBinaryHelper.ts:75-77`) silently maps any invalid tool index (`9..255`) to `'pencil'`.
  8. **Rate & Authorization Observations:** `start_free_draw` (`server.ts:277-282`) allows any joined Free Draw player to self-authorize without rate limiting; `draw_binary` has no byte/message rate limit; `Type 7` in canonical mode checks `buf.length < 10` (allowing trailing bytes).
  9. **Downstream `drawHistory` / `getJsonSafeHistory` Amplification:** Raw buffers accepted into `drawHistory` remain pinned in server RAM and are transformed via `Array.from(cmd.data)` (`server.ts:55`) into boxed JS number arrays on every `join_room` and `request_round_sync`, multiplying heap & wire cost.

- **Implementation Decisions:**  
  *Pending approval after review of the PHASE 9A audit report.*

- **Files Modified:**  
  *None (application source files strictly untouched during read-only audit; only `PRODUCTION_RELIABILITY_ROADMAP.md` created).*

- **Tests Run & Exact Results:**  
  *None executed during this read-only documentation & contract audit phase.* *(Existing baseline suites in `scripts/` inspected read-only and mapped in the PHASE 9A Audit Report.)*

- **Performance & Compatibility Notes:**
  - `encodeBinaryDrawMessage` produces `27 B` for `Type 3` when `strokeId` and `expectedPointCount` are defined (`DrawingCanvasCore.tsx:4891, 5021`) or `23 B` otherwise.
  - `Type 13` theoretical maximum for 3,000 points under `encodeZigZag` + 32-bit `writeVarInt` with values in `[-32768, 32767]` is `10 + 3000 * (3 + 3) = 18,010 B` (since worst-case ZigZag of `-32768..32767` is `<= 65536`, taking at most 3 VarInt bytes per coordinate, 6 bytes per point). Under current client clamp `[-30000, 30000]`, worst-case is identically `18,010 B` (`60000` requires 3 VarInt bytes).
  - Canonical `Type 9` for 3,000 points is `12,018 B` (`16 + 3000*4 + 2`); `Type 2` fallback (`createType2Buffer`) for 3,000 points is `12,010 B` (`10 + 3000*4`).
  - Client Free Draw `executeRedo` emits `Type 9` with `newStrokeId` (`DrawingCanvasCore.tsx:2488-2562`) and ignores incoming `Type 12` abort for own `instanceId` (`DrawingCanvasCore.tsx:3131`). Normal rooms (`!isFreeDraw && !isExperimental`, currently unreachable via UI presets/fallback) do not enforce a `3,000`-point cap on continuous strokes before sending `Type 2` or `Type 9`.
  - Any server hardening must preserve `AGENTS.md` invariants (`type === 4 || type === 10 || type === 5` inside `recordRoomDrawCommand`, 1-step undo/redo `isDrawingActive` lock, zero per-packet `console.log` spam).

- **Known Risks / Unresolved Questions:**
  1. Legacy `Type 10`: Should server ingress reject client `Type 10` while keeping the `type === 10` check inside `recordRoomDrawCommand` untouched per `AGENTS.md`, or keep read-only tolerance? And should client `decodeBinaryDrawMessage` stop defaulting unknown types to `'draw_clear'`?
  2. Client vs. Server `Type 9` point-count cap (`3,000` points vs. possible multi-part or >3,000-pt stroke in non-canonical normal mode).
  3. Safe `maxHttpBufferSize` threshold considering `draw_history_sync` (which is JSON-boxed `Array.from(cmd.data)` over MsgPack) vs. binary ingress.
  4. Whether `Type 13` should be rejected in non-canonical fallback (`!useCanonicalPipeline`) or decoded through `decodeType13BufferSafely`.
  5. Whether `instId` format on binary packets should match `registerDrawingIdentity` rules (`1..7` ASCII alphanumeric `/^[a-z0-9]+$/i` — note `server/rooms.ts:1202` sends `"server"` which is 6 ASCII alphanumeric chars, and `server.ts:254` enforces `^[a-zA-Z0-9]+$` on `draw_repair_req`).

- **Completion Criteria:**
  - Exact binary schemas, directionality, byte bounds, and field constraints defined and enforced at server ingress (`handleDrawBinary`) for every allowed packet type (`1`–`9`, `13`).
  - Trailing-byte rejection on `Type 2`, `Type 7`, `Type 9`, etc., matching `Type 13` strictness.
  - Client-originated `Type 11` / `Type 12` and unknown/unsupported packet types rejected cleanly on server ingress; client `decodeBinaryDrawMessage` no longer maps unknown packet types to `'draw_clear'`.
  - Safe `maxHttpBufferSize` tuned and documented with compatibility proof.
  - Automated validation test suite covering malformed, truncated, oversized, trailing-byte, spoofed, and valid packets passes alongside `npx tsc --noEmit`, `npm run build`, and existing Phase 5–8 test suites.

- **Current Status:**  
  `IN PROGRESS` *(Part 1 Read-Only Audit Complete; Part 2 Implementation Not Started)*

- **Next Exact Action:**  
  `Review the PHASE 9A audit report and agree on the safest implementation scope before modifying source code.`

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
  - Multiple rate-limit `Map`s in `server.ts:121-125` and `freeDrawCanonicalCache` eviction (`roomCanonicalStrokeEngine.ts:285-289`) require dedicated lifecycle inspection in Phase 9B.

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
