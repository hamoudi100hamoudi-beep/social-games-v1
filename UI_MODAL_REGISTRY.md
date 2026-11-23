# UI Modal & Popup Registry

This registry documents all modal windows, popup dialogs, and full-screen/in-board modal-like overlays implemented under `src/components/`. Every entry is derived directly from the current source code to serve as a single architectural, localization, and maintenance reference.

> **Registry Scope:** Ordinary dropdowns, menus, inline HUD banners (`ExperimentalWordOverlay`, `ExperimentalHitOverlay`), and transient corner toast pills (`RoomsBrowserScreen`'s `newRoomNotice`) are intentionally excluded because they do not behave as modal overlays or blocking/overlaying dialogs.

---

## Table of Contents

1. [Shared Modal Hosts & Typography Primitives](#1-shared-modal-hosts--typography-primitives)
2. [Modal Instances Built on `CinematicModal`](#2-modal-instances-built-on-cinematicmodal)
3. [Standalone Modals & Dialogs](#3-standalone-modals--dialogs)
4. [Full-Screen & In-Board Flow Overlays](#4-full-screen--in-board-flow-overlays)
5. [Critical Lifecycle & Architectural Boundaries](#5-critical-lifecycle--architectural-boundaries)

---

## 1. Shared Modal Hosts & Typography Primitives

### 1.1 `CinematicModal`
- **File Path:** `src/components/game/CinematicModal.tsx`
- **Purpose:** Centralized portal-based modal host providing uniform backdrop dimming, accidental-tap protection, close controls, 3D cartoon title header, centered body slot, and action button bar.
- **Render Target:** React Portal into `document.body` (`fixed inset-0 z-[9999]`, default backdrop `bg-slate-900/80`, overrideable via `overlayClassName`).
- **Close Behavior:**
  - Top-right `X` button rendered when `onClose` is passed (`aria-label={t('actions.close')}` from `common`).
  - Backdrop click closes only when pointer-down started directly on the backdrop (`backdropPointerDownRef`) AND `Date.now() - openTimeRef.current > 300` ms (prevents immediate accidental dismissal from opening tap/release).
- **Animation Owner:** Framer Motion (`AnimatePresence` + `motion.div`).
- **Entrance / Exit Behavior:**
  - Backdrop: `initial={{ opacity: 0 }}` -> `animate={{ opacity: 1 }}` -> `exit={{ opacity: 0 }}` (`duration: 0.18`).
  - Card (`cinematicCardVariants`): `hidden: { opacity: 0, scale: 0.95 }` -> `visible: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: "easeOut" } }` -> `exit: { scale: 0.95, opacity: 0, transition: { duration: 0.15, ease: "easeIn" } }`.
  - Header, body, and button tiers (`cinematicItemVariants`): `hidden: { opacity: 0, y: 5 }` -> `visible: { opacity: 1, y: 0, transition: { duration: 0.15, ease: "easeOut" } }`.
- **Button Variants:** `primary` (`#38BDF8`), `secondary` (`#ECEBFC`), `danger` (`#FB923C`), `neutral` (`#818CF8`), or `custom` (`btn.className`).

### 1.2 `GameTitle`
- **File Path:** `src/components/game/GameTitle.tsx`
- **Purpose:** 3-layer stacked 3D cartoon header typography (`'Fredoka', 'Inter', sans-serif`) used by `CinematicModal`, `CustomEmojiModal`, `MiniBoardOverlay`, and `Lobby`.
- **Color Presets (`type`):**
  - `"exit"`: Fill `#FFB300` (warm golden/orange) / Stroke `#0F3957`
  - `"report"`: Fill `#FB923C` (orange) / Stroke `#0F3957`
  - `"profile"`: Fill `#FFFFFF` / Stroke `#4F46E5`
  - `"skip"`: Fill `#FFFFFF` / Stroke `#38BDF8`
  - `"inactive"`: Fill `#818CF8` / Stroke `#2E2882`
  - `"choose"` / `"miniboard"`: Fill `#FFFFFF` / Stroke `#2E2882`

---

## 2. Modal Instances Built on `CinematicModal`

All entries in this section inherit `CinematicModal`'s portal mounting, `AnimatePresence`, backdrop fade (`0.18s`), and card scale/opacity transitions (`0.2s` in / `0.15s` out), plus any inner icon/content animations noted below.

### 2.1 `ExitConfirmModal` (`EXIT`)
- **Display Name / Identifier:** `ExitConfirmModal` (`EXIT`)
- **File Path:** `src/components/game/modals/ExitConfirmModal.tsx`
- **Parent Component(s):** `GameRoom.tsx`, `ExperimentalGameRoom.tsx`
- **Purpose & Trigger Condition:** Confirms whether the player wants to leave the active room; opened when clicking the room header/toolbar exit action (`showExitConfirm`).
- **Title / `GameTitle` Text & Type:** `"EXIT"` / `type="exit"` (`#FFB300` / `#0F3957`)
- **Main Content & Action Controls:**
  - Animated `ExitSprite` illustration (`w-26 sm:w-36`)
  - Confirmation question (`#exit-confirm-title`): `modals:exit.question`
  - Buttons: `#exit-confirm-no-btn` (`variant="primary"`, `common:actions.no`), `#exit-confirm-yes-btn` (`variant="danger"`, `common:actions.yes`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#exit-confirm-no-btn`.
- **Animation Owner:** `CinematicModal` (Framer Motion) + `ExitSprite` inner animation.
- **Verified Entrance / Exit Behavior:** Framer Motion card `opacity: 0->1`, `scale: 0.95->1` (`0.2s easeOut`) and `scale: 1->0.95`, `opacity: 1->0` (`0.15s easeIn`).
- **Layout & Direction Notes:** `#exit-confirm-title` sets `dir={isRTL ? "rtl" : "ltr"}` locally.
- **Localization Status:** Localized (`modals:exit.question`, `common:actions.*`). Title `"EXIT"` is intentionally preserved in English.
- **Related Stage:** `L10N-2`

### 2.2 `SkipConfirmModal` (`SKIP`)
- **Display Name / Identifier:** `SkipConfirmModal` (`SKIP`)
- **File Path:** `src/components/game/modals/SkipConfirmModal.tsx`
- **Parent Component(s):** `ExperimentalGameRoom.tsx`
- **Purpose & Trigger Condition:** Confirms whether the active drawer wants to skip their drawing turn; opened from the skip turn action (`showSkipConfirm`).
- **Title / `GameTitle` Text & Type:** `"SKIP"` / `type="report"` (`#FB923C` / `#0F3957`)
- **Main Content & Action Controls:**
  - Framed `FastForward` icon badge with CSS loop animation
  - Confirmation question (`#skip-confirm-title`): `modals:skip.question`
  - Buttons: `#skip-confirm-no-btn` (`variant="primary"`, `common:actions.no`), `#skip-confirm-yes-btn` (`variant="danger"`, `common:actions.yes`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#skip-confirm-no-btn`.
- **Animation Owner:** `CinematicModal` (Framer Motion) + CSS `.animate-skip-escape` (`src/components/index.css`).
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`) + continuous `skip-escape-creature` CSS loop (`3.2s cubic-bezier(0.34, 1.25, 0.64, 1) infinite`).
- **Layout & Direction Notes:** `#skip-confirm-title` sets `dir={isRTL ? "rtl" : "ltr"}` locally; inner animation frame stays `select-none`.
- **Localization Status:** Localized (`modals:skip.question`, `common:actions.*`). Title `"SKIP"` is intentionally preserved in English.
- **Related Stage:** `L10N-2`

### 2.3 `ReportConfirmModal` (`REPORT`)
- **Display Name / Identifier:** `ReportConfirmModal` (`REPORT`)
- **File Path:** `src/components/game/modals/ReportConfirmModal.tsx`
- **Parent Component(s):** `ExperimentalGameRoom.tsx`
- **Purpose & Trigger Condition:** Confirms reporting the current drawing; opened when a guesser clicks the report button (`showReportConfirm`).
- **Title / `GameTitle` Text & Type:** `"REPORT"` / `type="report"` (`#FB923C` / `#0F3957`)
- **Main Content & Action Controls:**
  - Animated `AlertTriangle` (`#FB923C`)
  - Confirmation question (`#report-confirm-title`): `modals:report.question`
  - Buttons: `#report-confirm-no-btn` (`variant="primary"`, `common:actions.no`), `#report-confirm-yes-btn` (`variant="danger"`, `common:actions.yes`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#report-confirm-no-btn`.
- **Animation Owner:** `CinematicModal` (Framer Motion) + inner `motion.div` periodic shake.
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`) + `AlertTriangle` periodic shake/pulse (`delay: 1.5s, duration: 0.6s, repeatDelay: 1.8s, repeat: Infinity`).
- **Layout & Direction Notes:** `#report-confirm-title` sets `dir={isRTL ? "rtl" : "ltr"}` locally.
- **Localization Status:** Localized (`modals:report.question`, `common:actions.*`). Title `"REPORT"` is intentionally preserved in English.
- **Related Stage:** `L10N-2`

### 2.4 `AfkWarningModal` (In-Game Pre-Kick Warning — `INACTIVE`)
- **Display Name / Identifier:** `AfkWarningModal` (`INACTIVE` — in-game countdown)
- **File Path:** `src/components/game/modals/AfkWarningModal.tsx`
- **Parent Component(s):** `GameRoom.tsx`, `ExperimentalGameRoom.tsx`
- **Purpose & Trigger Condition:** Live pre-kick inactivity warning inside an active room when the server emits an AFK warning countdown (`showAfkWarning`), giving the player a chance to confirm activity before being kicked. **Distinct from Lobby post-kick `INACTIVE` modal.**
- **Title / `GameTitle` Text & Type:** `"INACTIVE"` / `type="inactive"` (`#818CF8` / `#2E2882`)
- **Main Content & Action Controls:**
  - `AfkWarningSprite` illustration
  - Combined prompt (`#afk-title` + `#afk-description`): `modals:afk.question` + `modals:afk.actionHint`
  - Live countdown pill with `<Trans i18nKey="afk.disconnectCountdown">` and pulsing red dot
  - Button: `#afk-return-btn` (`variant="neutral"`, `Check` icon, `common:actions.ok`)
- **Close Behavior:** **Blocking action only** (`onClose` is NOT passed to `CinematicModal`, so no `X` button or backdrop close — user must click `#afk-return-btn` to emit stay-active confirmation).
- **Animation Owner:** `CinematicModal` (Framer Motion) + `AfkWarningSprite` + Tailwind `animate-ping` status dot.
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`) + pulsing countdown indicator.
- **Layout & Direction Notes:** Prompt and countdown badge apply `dir={isRTL ? "rtl" : "ltr"}` locally; CLDR plural rules (`_zero`, `_one`, `_two`, `_few`, `_many`, `_other`) handled via `<Trans>`.
- **Localization Status:** Localized (`modals:afk.*`, `common:actions.ok`). Title `"INACTIVE"` is intentionally preserved in English.
- **Related Stage:** `L10N-2`

### 2.5 `PlayerProfileModal` (`PROFILE`)
- **Display Name / Identifier:** `PlayerProfileModal` (`PROFILE`)
- **File Path:** `src/components/game/modals/PlayerProfileModal.tsx`
- **Parent Component(s):** `GameRoom.tsx`, `ExperimentalGameRoom.tsx`
- **Purpose & Trigger Condition:** Displays another player's (or own) profile card when clicking a player slot (`selectedPlayerProfile`), allowing mute/block or votekick actions.
- **Title / `GameTitle` Text & Type:** `"PROFILE"` / `type="profile"` (`#FFFFFF` / `#4F46E5`)
- **Main Content & Action Controls:**
  - Circular avatar emoji preview (`👤` fallback)
  - Player name (`#profile-modal-name`) wrapped in `<bdi dir="auto">`
  - If `isSelf`: informational badge `modals:profile.selfAccount`
  - Otherwise: `#profile-modal-block-btn` (`modals:profile.block` / `modals:profile.unblock`) and `#profile-modal-kick-btn` (`modals:profile.votekick` / `modals:profile.removeVote`)
- **Close Behavior:** `X` button, guarded backdrop click, or auto-closes immediately upon clicking block or votekick buttons.
- **Animation Owner:** `CinematicModal` (Framer Motion) + Tailwind CSS utility `animate-in fade-in slide-in-from-bottom-2 duration-300` on action buttons container.
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`) + CSS slide-up fade (`300ms`) on action stack.
- **Layout & Direction Notes:** Player name enforces bidirectional isolation with `dir="auto"` and `<bdi dir="auto">`; self-notice and action stack apply `dir={isRTL ? "rtl" : "ltr"}`.
- **Localization Status:** Localized (`modals:profile.*`). Title `"PROFILE"` is intentionally preserved in English.
- **Related Stage:** `L10N-2`

### 2.6 `RoomAlertModals` (6 Alert Modals)
- **File Path:** `src/components/game/modals/RoomAlertModals.tsx`
- **Parent Component(s):** `GameRoom.tsx`, `ExperimentalGameRoom.tsx`
- **Purpose:** Houses six discrete in-room alert/rejection `CinematicModal` dialogs controlled by props:
  1. **`SLOW DOWN` (Votekick Cooldown Warning):** Triggered by `showCooldownWarning && shouldRenderCooldown`. `titleType="report"`, `titleText="SLOW DOWN"`. Shaking red `AlertTriangle`. Message (`#cooldown-warning-title`): `modals:alerts.cooldown.message`. Button `#cooldown-warning-ok-btn` (`variant="custom"`, `common:actions.ok`). Closable via `X`, backdrop, or button.
  2. **`KICKED` (Voted Out / Banned):** Triggered by `isBanned`. `titleType="report"`, `titleText="KICKED"`. Shaking red `AlertTriangle`. Message (`#kicked-out-desc`): `modals:alerts.kicked.message`. Button `#kicked-out-exit-btn` (`variant="danger"`, `common:actions.ok`). **Blocking (`onClose` omitted)**: user must press OK to exit room.
  3. **`ERROR` (Nickname Taken):** Triggered by `isNicknameTaken`. `titleType="report"`, `titleText="ERROR"`, opaque `overlayClassName="bg-slate-950/100"`. Shaking orange `AlertTriangle`. Message (`#nickname-taken-desc`): `modals:alerts.nicknameTaken.message`. Button `#nickname-taken-exit-btn` (`variant="danger"`, `common:actions.ok`). Closable via `X`, backdrop, or OK (all invoke `onLeaveFromNicknameTaken`).
  4. **`ERROR` (Room Full — In-Room Join Attempt):** Triggered by `isRoomFull`. `titleType="report"`, `titleText="ERROR"`. Shaking orange `AlertTriangle`. Message (`#room-full-desc`): `modals:alerts.roomFull.message`. Button `#room-full-exit-btn` (`variant="danger"`, `common:actions.ok`). Closable via `X`, backdrop, or OK.
  5. **`SERVER FULL` (Auth Store Full):** Triggered by `isAuthStoreFull`. `titleType="report"`, `titleText="SERVER FULL"`. Static orange `AlertTriangle` (no shake). Message (`#auth-store-full-desc`): `modals:alerts.serverFull.message`. Button `#auth-store-full-exit-btn` (`variant="danger"`, `common:actions.ok`). Closable via `X`, backdrop, or OK.
  6. **`TIMEOUT` (Initial Join Room Timeout):** Triggered by `isJoinTimedOut`. `titleType="report"`, `titleText="TIMEOUT"`. Static orange `AlertTriangle` (no shake). Message (`#join-timeout-desc`): `modals:alerts.joinTimeout.message`. Button `#join-timeout-exit-btn` (`variant="danger"`, `common:actions.ok`). Closable via `X`, backdrop, or OK.
- **Animation Owner:** `CinematicModal` (Framer Motion) + `motion.div` periodic shake (`delay: 1.5s, duration: 0.6s, repeatDelay: 1.8s, repeat: Infinity`) on alerts 1–4.
- **Layout & Direction Notes:** All alert `<h3 />` nodes set `dir={isRTL ? "rtl" : "ltr"}`.
- **Localization Status:** All 6 alert modals localized (`modals:alerts.*`, `common:actions.ok`). All 6 English `GameTitle` headers are intentionally preserved in English.
- **Related Stage:** `L10N-2`

### 2.7 Clear Drawing Confirmation (`CLEAN`)
- **Display Name / Identifier:** Clear Drawing Confirmation (`CLEAN`)
- **File Path:** `src/components/experimental/ExperimentalDrawingBoard.tsx` (inline `CinematicModal`)
- **Parent Component(s):** `ExperimentalDrawingBoard` (used in Competitive Experimental & Free Draw rooms)
- **Purpose & Trigger Condition:** Confirms clearing the entire drawing canvas before executing `canvasCoreRef.current?.clear()`; opened when the active drawer/artist taps the clear-canvas toolbar button (`requestClearCanvas` -> `showClearConfirm`).
- **Title / `GameTitle` Text & Type:** `"CLEAN"` / `type="report"` (`#FB923C` / `#0F3957`)
- **Main Content & Action Controls:**
  - Circular red-tinted badge (`#EF4444`) with spinning `RefreshCcw` icon
  - Prompt (`#clean-confirm-desc`): `modals:clean.question`
  - Buttons: `#clean-confirm-no-btn` (`variant="primary"`, `common:actions.no`), `#clean-confirm-yes-btn` (`variant="danger"`, `common:actions.yes`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#clean-confirm-no-btn`.
- **Animation Owner:** `CinematicModal` (Framer Motion) + CSS `.animate-clean-spin` (`src/components/index.css`).
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`) + `clean-spin-loop` (`3s cubic-bezier(0.34, 1.3, 0.64, 1) infinite`, holds briefly then rotates `-360deg`).
- **Layout & Direction Notes:** Root board stays `dir="rtl"` and canvas container stays `dir="ltr"`; `#clean-confirm-desc` sets `dir={isRTL ? "rtl" : "ltr"}` locally inside the portal modal.
- **Localization Status:** Localized (`modals:clean.question`, `common:actions.no`, `common:actions.yes`). Title `"CLEAN"` intentionally preserved in English.
- **Related Stage:** `L10N-2.1`

### 2.8 Floating Player Names Confirmation (`NAMES`)
- **Display Name / Identifier:** Floating Player Names Confirmation (`NAMES`)
- **File Path:** `src/components/experimental/ExperimentalDrawingBoard.tsx` (inline `CinematicModal` gated by `{isFreeDraw && ...}`)
- **Parent Component(s):** `ExperimentalDrawingBoard` (**Free Draw mode only**)
- **Purpose & Trigger Condition:** Confirms toggling the `showFloatingNames` preference (persisted in `safeLocalStorage` under `gartic_show_floating_names`) controlling live floating artist name tags over strokes; triggered by the eye toggle button (`handleToggleFloatingNames` -> `showFloatingNamesConfirm`).
- **Title / `GameTitle` Text & Type:** `"NAMES"` / `type="report"` (`#FB923C` / `#0F3957`)
- **Main Content & Action Controls:**
  - Dynamic icon badge: red `#EF4444` + `EyeOff` when names are currently shown (asking to hide); blue `#3B82F6` + `Eye` when names are currently hidden (asking to show)
  - Conditional prompt (`#names-confirm-desc`): `modals:names.hideQuestion` or `modals:names.showQuestion`
  - Buttons: `#names-confirm-no-btn` (`variant="primary"`, `common:actions.no`), `#names-confirm-yes-btn` (`variant={showFloatingNames ? "danger" : "primary"}`, `common:actions.yes`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#names-confirm-no-btn`.
- **Animation Owner:** `CinematicModal` (Framer Motion). Icon inside is static.
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`).
- **Layout & Direction Notes:** Rendered only when `isFreeDraw` is `true`; `#names-confirm-desc` sets `dir={isRTL ? "rtl" : "ltr"}` locally.
- **Localization Status:** Localized (`modals:names.hideQuestion`, `modals:names.showQuestion`, `common:actions.no`, `common:actions.yes`). Title `"NAMES"` intentionally preserved in English.
- **Related Stage:** `L10N-2.1`

### 2.9 Lobby AFK Post-Kick Notification (`INACTIVE`)
- **Display Name / Identifier:** Lobby AFK Post-Kick Notification (`INACTIVE`)
- **File Path:** `src/components/Lobby.tsx` (inline `CinematicModal`)
- **Parent Component(s):** `Lobby`
- **Purpose & Trigger Condition:** Post-kick notification displayed on return to the Lobby after being disconnected/kicked for inactivity (`afkWarning` initialized on mount when `gartic_afk_kicked` timestamp is `< 180000` ms old; storage flags are cleared on mount). Hides the home card while visible (`!afkWarning && !connLostWarning`). **Distinct from in-game `AfkWarningModal`.**
- **Title / `GameTitle` Text & Type:** `"INACTIVE"` / `type="inactive"` (`#818CF8` / `#2E2882`)
- **Main Content & Action Controls:**
  - Message (`#afk-warning-text`): `modals:lobbyAfk.message`
  - Button: `#afk-warning-ok-btn` (`variant="secondary"`, `common:actions.ok`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#afk-warning-ok-btn`.
- **Animation Owner:** `CinematicModal` (Framer Motion).
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`).
- **Layout & Direction Notes:** `#afk-warning-text` applies `dir={isModalsRTL ? "rtl" : "ltr"}`.
- **Localization Status:** Localized (`modals:lobbyAfk.message`, `common:actions.ok`). Title `"INACTIVE"` intentionally preserved in English.
- **Related Stage:** `L10N-2.1`

### 2.10 Lobby Connection-Lost Notification (`DISCONNECTED`)
- **Display Name / Identifier:** Lobby Connection-Lost Notification (`DISCONNECTED`)
- **File Path:** `src/components/Lobby.tsx` (inline `CinematicModal`)
- **Parent Component(s):** `Lobby`
- **Purpose & Trigger Condition:** Post-exit notification displayed on return to the Lobby after a room disconnect/join timeout or non-AFK session expiration (`connLostWarning` initialized on mount when `gartic_connection_lost` is `< 180000` ms old OR `gartic_session_expired_reason === 'connection_lost'` without an active AFK kick). Hides the home card while visible. **Distinct from `RoomConnectionStatusOverlay`.**
- **Title / `GameTitle` Text & Type:** `"DISCONNECTED"` / `type="exit"` (**warm orange/golden** `#FFB300` / `#0F3957` — intentionally uses `"exit"` styling)
- **Main Content & Action Controls:**
  - Message (`#conn-lost-warning-text`): `modals:lobbyDisconnected.message`
  - Button: `#conn-lost-warning-ok-btn` (`variant="danger"`, `common:actions.ok`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#conn-lost-warning-ok-btn`.
- **Animation Owner:** `CinematicModal` (Framer Motion).
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`).
- **Layout & Direction Notes:** `#conn-lost-warning-text` applies `dir={isModalsRTL ? "rtl" : "ltr"}`.
- **Localization Status:** Localized (`modals:lobbyDisconnected.message`, `common:actions.ok`). Title `"DISCONNECTED"` intentionally preserved in English with `titleType="exit"`.
- **Related Stage:** `L10N-2.1`

### 2.11 Lobby Room-Full Error Modal (`ERROR`)
- **Display Name / Identifier:** Lobby Room-Full Error Modal (`ERROR`)
- **File Path:** `src/components/Lobby.tsx` (inline `CinematicModal`)
- **Parent Component(s):** `Lobby`
- **Purpose & Trigger Condition:** Displayed when `handlePlay()` checks room capacity via `get_room_info` and finds `data.count >= maxCapacity`, setting `joinError`.
- **Title / `GameTitle` Text & Type:** `"ERROR"` / `type="report"` (`#FB923C` / `#0F3957`)
- **Main Content & Action Controls:**
  - Shaking orange `AlertTriangle`
  - Hardcoded bilingual texts (`#lobby-room-full-desc`: `"This room is full"`, `#lobby-room-full-desc-ar`: `"هذه الغرفة ممتلئة بالكامل"`)
  - Button: `#lobby-room-full-ok-btn` (`variant="danger"`, `"OK"`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#lobby-room-full-ok-btn`.
- **Animation Owner:** `CinematicModal` (Framer Motion) + `motion.div` periodic `AlertTriangle` shake (`delay: 1.5s, duration: 0.6s, repeatDelay: 1.8s, repeat: Infinity`).
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`).
- **Layout & Direction Notes:** Still uses stacked hardcoded EN + AR paragraphs.
- **Localization Status:** Not yet localized (outside `L10N-2.1` scope; scheduled for lobby localization).
- **Related Stage:** `L10N-3` (planned)

### 2.12 `RoomInfoModal` (`INFO`)
- **Display Name / Identifier:** `RoomInfoModal` (`INFO`)
- **File Path:** `src/components/lobby/RoomInfoModal.tsx`
- **Parent Component(s):** `Lobby.tsx` (`selectedRoom`)
- **Purpose & Trigger Condition:** Shows selected room metadata (player count/max, theme, winning points/open mode) and error banner before joining; opened when clicking a room card in `RoomsBrowserScreen` (`selectedRoom !== null`).
- **Title / `GameTitle` Text & Type:** `"INFO"` / `type="report"` (`#FB923C` / `#0F3957`)
- **Main Content & Action Controls:**
  - Spinning `Settings` icon (`animate-spin-slow`)
  - Room display name (`roomDisplayName`) and optional `joinError` alert box
  - 3-column stats grid (`Players`, `Theme`, `To Win` / `"مفتوح"` for Free Draw)
  - Button: `#room-info-play-btn` (`variant="danger"`, `Play` icon, `"PLAY"`)
- **Close Behavior:** `X` button or guarded backdrop click (`onClose`).
- **Animation Owner:** `CinematicModal` (Framer Motion) + Tailwind `animate-spin-slow` on `Settings` icon.
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`).
- **Layout & Direction Notes:** Inherits modal card layout without explicit `dir` attributes; contains hardcoded EN labels (`Players`, `Theme`, `To Win`, `PLAY`, `pts`) and AR (`مفتوح`).
- **Localization Status:** Not yet localized (outside `L10N-2.1` scope).
- **Related Stage:** `L10N-3` (planned)

---

## 3. Standalone Modals & Dialogs

These modals do **not** use `CinematicModal`; each implements its own backdrop, positioning, and animation lifecycle.

### 3.1 `CustomEmojiModal` (`CUSTOM EMOJI`)
- **Display Name / Identifier:** `CustomEmojiModal` (`CUSTOM EMOJI`)
- **File Path:** `src/components/game/CustomEmojiModal.tsx`
- **Parent Component(s):** `Lobby.tsx` (`showCustomEmojiModal`)
- **Purpose & Trigger Condition:** Allows players to type/pick any custom Unicode emoji from their keyboard (extracted via `Intl.Segmenter` / regex) and add it to `customEmojis`; opened from the `+` button inside Lobby's Avatar Grid Overlay.
- **Title / `GameTitle` Text & Type:** `"CUSTOM EMOJI"` / `type="skip"` (`#FFFFFF` / `#38BDF8`)
- **Main Content & Action Controls:**
  - Subtitle (`modals:customEmoji.subtitle`)
  - Emoji preview frame (`#custom-emoji-input` preview, animated check badge when detected, `modals:customEmoji.pickPrompt` empty state)
  - Search-type text input (`#custom-emoji-input`, placeholder `modals:customEmoji.placeholder`) with validation error (`modals:customEmoji.invalidError`)
  - Submit button (`modals:customEmoji.submitButton`)
- **Close Behavior:** Top-left `X` button (`aria-label={tCommon('actions.close')}`) or backdrop click (`bg-black/75`), rendered at `z-[110]`.
- **Animation Owner:** Framer Motion (`AnimatePresence` + `motion.div`, plus `motion.span` emoji preview spring/rotate).
- **Verified Entrance / Exit Behavior:**
  - Backdrop: `opacity: 0 -> 1 -> 0` (default Motion transition).
  - Card: `opacity: 0, scale: 0.95` -> `opacity: 1, scale: 1` -> `opacity: 0, scale: 0.95` (`duration: 0.2, ease: [0.16, 1, 0.3, 1]`).
  - Preview emoji: `scale: 0.5, rotate: -10` -> `scale: 1, rotate: 0`.
- **Layout & Direction Notes:** Card applies `dir={isRTL ? 'rtl' : 'ltr'}`.
- **Localization Status:** Localized (`modals:customEmoji.*`, `common:actions.close`). Title `"CUSTOM EMOJI"` intentionally preserved in English.
- **Related Stage:** `L10N-2`

### 3.2 `ColorWheelModal`
- **Display Name / Identifier:** `ColorWheelModal`
- **File Path:** `src/components/game/ColorWheelModal.tsx`
- **Parent Component(s):** `FlipaClipControls.tsx` (`isColorPickerOpen`, active in Free Draw or Experimental Draw when `EXPERIMENTAL_COLOR_WHEEL_TEST` is `true`)
- **Purpose & Trigger Condition:** Interactive HSV color wheel (`reinvented-color-wheel`), HEX editor, live/initial color comparison box, opacity slider, and `localStorage`-persisted saved color swatches; opened by tapping the color picker button in `FlipaClipControls`.
- **Title / `GameTitle` Text & Type:** None (`GameTitle` not used; compact top utility bar instead).
- **Main Content & Action Controls:**
  - HEX input (`#FFFFFF` uppercase), split revert/live comparison buttons (`modals:colorWheel.compareTooltip` / `revertTooltip` / `currentTooltip`), `X` close button (`common:actions.close`)
  - `ReinventedColorWheel` canvas/SV picker
  - Opacity track slider (`10%–100%`, label `modals:colorWheel.opacity`)
  - Saved colors bar: Save button (`modals:colorWheel.save`), Delete button (`modals:colorWheel.deleteTooltip` / `deleteSelectedTooltip`), count label (`modals:colorWheel.savedCount` with CLDR plurals / `savedColors`), swatch grid (`modals:colorWheel.emptyHint`)
- **Close Behavior:** React Portal into `document.body` (`z-[100]`); closes via top-bar `X` button or transparent backdrop `onPointerDown` outside the card.
- **Animation Owner:** Framer Motion (`AnimatePresence` + `motion.div`).
- **Verified Entrance / Exit Behavior:** Card slides & fades `initial={{ opacity: 0, y: 8 }}` -> `animate={{ opacity: 1, y: 0 }}` -> `exit={{ opacity: 0, y: 8 }}` with `transition={{ duration: 0.12, ease: 'easeOut' }}`.
- **Layout & Direction Notes:** Deliberate mixed directionality: card top bar uses `dir="rtl"` (HEX right, compare center, close left); opacity slider track & readout stay `dir="ltr"` with `dir={isRTL ? 'rtl' : 'ltr'}` on the `Opacity` text label; saved-colors footer uses `dir={isRTL ? 'rtl' : 'ltr'}`.
- **Localization Status:** Localized (`modals:colorWheel.*`, `common:actions.close`). Hex/percent readouts stay numeric/LTR.
- **Related Stage:** `L10N-2`

### 3.3 Lobby Avatar Grid Overlay
- **Display Name / Identifier:** Lobby Avatar Grid Overlay (inline in `Lobby.tsx`)
- **File Path:** `src/components/Lobby.tsx` (lines 700–738)
- **Parent Component(s):** `Lobby` (`showAvatarGrid`)
- **Purpose & Trigger Condition:** Displays a 6-column scrollable grid of preset emoji avatars plus a `+` button to launch `CustomEmojiModal`; opened from `AvatarCarousel`'s grid trigger (`onOpenGrid`).
- **Title / `GameTitle` Text & Type:** Plain header label `"اختر أفاتار"` (no `GameTitle`).
- **Main Content & Action Controls:**
  - Header label `"اختر أفاتار"` and `X` close button
  - `+` custom emoji trigger button (`title="أضف إيموجي مخصص"`)
  - Grid buttons for every emoji in `allAvatars` (selects emoji and closes)
- **Close Behavior:** Clicking the `bg-black/40` backdrop, header `X` button, `+` custom emoji button (transitions to `CustomEmojiModal`), or any avatar item. Rendered at `fixed inset-0 z-[100]`.
- **Animation Owner:** Tailwind CSS animate utilities (`animate-in zoom-in-95 duration-200`) on card mount; **no exit transition** (instant unmount on `showAvatarGrid === false`).
- **Verified Entrance / Exit Behavior:** Entrance `zoom-in-95 duration-200`; exit unmounts immediately (`showAvatarGrid && (...)`).
- **Layout & Direction Notes:** Card hardcodes `dir="rtl"`. `Lobby.tsx` touchmove guard explicitly permits scrolling inside this overlay when `showAvatarGrid` is true.
- **Localization Status:** Not yet localized (`"اختر أفاتار"`, `"أضف إيموجي مخصص"` hardcoded in Arabic).
- **Related Stage:** `L10N-3` (planned)

### 3.4 `FreeDrawMobileDebug` Settings Modal
- **Display Name / Identifier:** `FreeDrawMobileDebug` settings modal
- **File Path:** `src/components/game/FreeDrawMobileDebug.tsx`
- **Parent Component(s):** Mounted globally (`App.tsx` / `GameRoom.tsx` / `ExperimentalGameRoom.tsx`) only when `isMobileDebugActive()` is enabled; modal opens via the floating `"FD Debug"` pill (`isPanelOpen`).
- **Purpose & Trigger Condition:** Developer diagnostic modal for toggling localStorage debug flags (`freedraw_bucket_undo_diag`, `freedraw_bucket_join_diag`, `freedraw_bucket_checkpoint_exp`, `freedraw_bucket_batch_replay_exp`), opening Eruda console, reloading, or disabling debug mode.
- **Title / `GameTitle` Text & Type:** Header `"Free Draw Mobile Debug"` (no `GameTitle`).
- **Main Content & Action Controls:**
  - Diagnostic toggles list, Eruda launcher, apply & reload, disable debug, and `X` close button.
- **Close Behavior:** Backdrop click (`bg-black/60 backdrop-blur-xs`, `z-[10000]`) or header `X` button.
- **Animation Owner:** Tailwind CSS animate utilities (`animate-in fade-in zoom-in-95 duration-150`); **no exit transition** (instant unmount).
- **Verified Entrance / Exit Behavior:** Entrance `fade-in zoom-in-95 duration-150`; exit unmounts immediately.
- **Layout & Direction Notes:** Backdrop wrapper uses `dir="rtl"`.
- **Localization Status:** Developer-only diagnostic tool; hardcoded bilingual/Arabic helper strings, not yet localized.
- **Related Stage:** Unscheduled / developer utility

---

## 4. Full-Screen & In-Board Flow Overlays

### 4.1 `RoomConnectionStatusOverlay`
- **Display Name / Identifier:** `RoomConnectionStatusOverlay`
- **File Path:** `src/components/game/RoomConnectionStatusOverlay.tsx`
- **Parent Component(s):** `GameRoom.tsx`, `ExperimentalGameRoom.tsx` (`hasJoinedRoomOnce && (!isConnected || !isRoomJoined)`)
- **Purpose & Trigger Condition:** Live in-room reconnection overlay shown whenever socket connectivity drops or room rejoin is in progress **after** the user has successfully joined the room at least once. If disconnection persists beyond 20s (`isProlongedDisconnect`), reveals a manual exit button to return to Lobby. **Must remain separate from Lobby `DISCONNECTED`.**
- **Title / `GameTitle` Text & Type:** Dynamic `<h3>`: `modals:connection.disconnectedTitle` or `modals:connection.reconnectedTitle` (no `GameTitle`).
- **Main Content & Action Controls:**
  - Dual-ring CSS spinner (`animate-spin`) + pulsing `WifiOff` icon (`animate-pulse`)
  - Subtitle: `modals:connection.reconnecting`, `modals:connection.rejoining`, or `modals:connection.prolongedDisconnect`
  - Conditional button (`#disconnect-return-lobby-btn`) after prolonged disconnect: `modals:connection.returnToLobby`
- **Close Behavior:** Auto-closes when both `isConnected` and `isRoomJoined` become true; manual escape via `#disconnect-return-lobby-btn` when `isProlongedDisconnect` is true.
- **Animation Owner:** Framer Motion (`AnimatePresence` + `motion.div`) for overlay visibility; CSS `animate-spin` and `animate-pulse` for status icon.
- **Verified Entrance / Exit Behavior:** Overlay fades `initial={{ opacity: 0 }}` -> `animate={{ opacity: 1 }}` -> `exit={{ opacity: 0 }}` (`duration: 0.25, ease: "easeOut"`), `fixed inset-0 z-[9000]`.
- **Layout & Direction Notes:** Container sets `dir={isRTL ? "rtl" : "ltr"}`.
- **Localization Status:** Localized (`modals:connection.*`).
- **Related Stage:** `L10N-2`

### 4.2 Initial Room Loading Overlay
- **Display Name / Identifier:** Initial Room Loading Overlay
- **File Path:** Inline in `src/components/GameRoom.tsx` (lines 1276–1294) and `src/components/experimental/ExperimentalGameRoom.tsx` (lines 1856–1874)
- **Parent Component(s):** `GameRoom`, `ExperimentalGameRoom`
- **Purpose & Trigger Condition:** Covers initial room entry (`isInitialLoadingRoom === true`) while socket join handshake completes, preventing visual flash of empty/unhydrated board state.
- **Title / `GameTitle` Text & Type:** None (spinner only).
- **Main Content & Action Controls:** Minimalist brand spinner (`border-[#1AD2FF]` spinning ring on `#052044` backdrop, `fixed inset-0 z-[5000]`). Zero text or buttons.
- **Close Behavior:** Automatically transitions out once initial room join resolves (`isInitialLoadingRoom` becomes `false`).
- **Animation Owner:** Framer Motion (`AnimatePresence` + `motion.div`) + CSS `animate-spin`.
- **Verified Entrance / Exit Behavior:** Mounted visible immediately (`initial={false}`, `animate={{ opacity: 1 }}`) -> fades out on dismiss (`exit={{ opacity: 0 }}`, `duration: 0.35, ease: "easeInOut"`).
- **Layout & Direction Notes:** Language-neutral visual spinner.
- **Localization Status:** N/A (no visible text).
- **Related Stage:** Core room lifecycle

### 4.3 `ChoosingWordOverlay`
- **Display Name / Identifier:** `ChoosingWordOverlay`
- **File Path:** `src/components/experimental/ChoosingWordOverlay.tsx`
- **Parent Component(s):** `ExperimentalGameRoom.tsx` (`gameState.status === "CHOOSING" && amIDrawer`)
- **Purpose & Trigger Condition:** Full-screen prompt letting the chosen drawer pick one of two candidate words to draw during the `CHOOSING` turn phase.
- **Title / `GameTitle` Text & Type:** Heading `"IT'S YOUR TURN!"` (no `GameTitle`).
- **Main Content & Action Controls:**
  - Prompt `"Choose a word to draw"`
  - Two candidate word blocks (`wordOptions[0]`, `wordOptions[1]`, rendered with `dir="auto"`) separated by `"OR"` divider, each paired with a `"DRAW"` button (`onSelectWord`)
- **Close Behavior:** Selecting a word via either `"DRAW"` button, or turn phase moving out of `CHOOSING`. Fixed at `z-[500]`, `bg-black/70`.
- **Animation Owner:** Tailwind CSS animate utilities (`animate-in fade-in zoom-in-95 duration-300`); **no exit transition** (unmounts when status changes).
- **Verified Entrance / Exit Behavior:** Entrance `fade-in zoom-in-95 duration-300`; instant unmount on close.
- **Layout & Direction Notes:** Word options already carry `dir="auto"`; static headings/labels are currently English-only.
- **Localization Status:** Not yet localized (`"IT'S YOUR TURN!"`, `"Choose a word to draw"`, `"DRAW"`, `"OR"`).
- **Related Stage:** `L10N-4` (planned)

### 4.4 `OverlayChatRoom`
- **Display Name / Identifier:** `OverlayChatRoom`
- **File Path:** `src/components/game/OverlayChatRoom.tsx`
- **Parent Component(s):** `GameRoom.tsx`, `ExperimentalGameRoom.tsx` (`isChatOpen`)
- **Purpose & Trigger Condition:** Full-screen interactive chat drawer/overlay toggled from the in-room chat icon (`isChatOpen`), supporting reading/copying messages, system/votekick alerts, and sending chat/guesses via `#chat-textarea`.
- **Title / `GameTitle` Text & Type:** None.
- **Main Content & Action Controls:**
  - Top click-to-close band (`h-16`)
  - Reversed scrollable message feed (`ChatMessageItem` with copy popover `"Copy"`, system/votekick notices)
  - Bottom iOS-keyboard-aware compose bar with `X` close button, `#chat-textarea` (`placeholder="Type your message here..."`, `dir="auto"`), and `Send` button
- **Close Behavior:** Clicking the top spacer bar or bottom-left `X` button (`closeChat`). Fixed at `z-[160]`, `bg-black/60`.
- **Animation Owner:** Tailwind CSS animate utilities + custom `.animate-message-pop` CSS keyframe (`src/components/index.css`). **No exit transition** (`if (!isChatOpen) return null;`).
- **Verified Entrance / Exit Behavior:** Backdrop enters with `animate-in fade-in duration-200`; messages viewport enters with `animate-in slide-in-from-bottom-4 duration-300`; individual messages pop in via `message-pop-in` (`0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)`).
- **Layout & Direction Notes:** `#chat-textarea` and message text nodes use `dir="auto"` + `unicodeBidi: 'plaintext'`; votekick alert composition hardcodes `dir="rtl"` Arabic structure.
- **Localization Status:** Not yet localized (contains hardcoded English/Arabic strings such as `"Type your message here..."`, `"You've lost your turn"`, `"قام ... بالتصويت لطرد"`, `"Copy"`).
- **Related Stage:** `L10N-4` (planned)

### 4.5 `MiniBoardOverlay`
- **Display Name / Identifier:** `MiniBoardOverlay`
- **File Path:** `src/components/game/MiniBoardOverlay.tsx`
- **Parent Component(s):** `GameRoom.tsx`, `ExperimentalGameRoom.tsx` (scoped inside the drawing board canvas container)
- **Purpose & Trigger Condition:** Canvas-scoped overlay (`absolute inset-0 z-[40]`, Podium stage `z-[50]`) covering the drawing canvas for non-drawing phases:
  - Free Draw welcome screen (`"FREE DRAW"` + `"START DRAWING"`)
  - `WAITING` (waiting for players)
  - `CHOOSING` (`"NEW TURN!"` while waiting for drawer)
  - `ROUND_END` (turn outcome variants: `"SKIPPED!"`, `"INACTIVE"`, `"CANCELED TURN"`, `"INTERVAL"`, `"MASTERPIECE!"`)
  - `PODIUM` (`"GAME OVER"` top-3 podium & winner reveal)
- **Title / `GameTitle` Text & Type:** `GameTitle` `type="miniboard"` (`#FFFFFF` / `#2E2882`) for `"FREE DRAW"`, `"WAITING"`, `"NEW TURN!"`, `"SKIPPED!"`, `"INACTIVE"`, `"CANCELED TURN"`, `"INTERVAL"`, `"MASTERPIECE!"`, `"GAME OVER"`.
- **Main Content & Action Controls:**
  - Animated character sprites (`WaitingSprite`, `AllGuessedSprite`, `AllGuessedRareSprite`, `NoOneGuessed2Sprite`, `TurnLostSprite`, `SkippedSprite`, `PartialGuessedSprite`, `CanceledTurnSprite`), drawer/word summary, top-3 podium rankings, and `"START DRAWING"` button (Free Draw only).
- **Close Behavior:** Controlled strictly by room `gameState.status` (or Free Draw entry/activity state); returns `null` during active Free Draw.
- **Animation Owner:** Framer Motion (`AnimatePresence mode="wait"` + `motion.div` fade transitions, plus `GameTitle` drop-in `y: -150 -> 0, duration: 0.85s` on `PODIUM`) + inline CSS `<style>` keyframes in `MiniBoardOverlay.tsx` (`animate-podium-pop`, `animate-badge-pop`, `animate-crown-fall`, `animate-pop`, `animate-medal-shine`).
- **Verified Entrance / Exit Behavior:** Phase screens cross-fade (`initial={{ opacity: 0 }}` -> `animate={{ opacity: 1 }}` -> `exit={{ opacity: 0 }}`), with late-joiner podium animations gated by `timeLeft >= 13` and `roundEndAnimationKey`.
- **Layout & Direction Notes:** Contains Arabic/English turn & podium copy.
- **Localization Status:** Not yet localized (scheduled for game-flow / canvas localization).
- **Related Stage:** `L10N-4` (planned)

---

## 5. Critical Lifecycle & Architectural Boundaries

1. **In-Game `RoomConnectionStatusOverlay` vs. Lobby `DISCONNECTED` Modal:**
   - **Never merge these two flows.**
   - `RoomConnectionStatusOverlay` (`src/components/game/RoomConnectionStatusOverlay.tsx`) operates **inside** an active room (`GameRoom` / `ExperimentalGameRoom`) whenever `hasJoinedRoomOnce && (!isConnected || !isRoomJoined)`, offering live automatic reconnection feedback and a 20-second prolonged-disconnect exit button.
   - Lobby `DISCONNECTED` (`src/components/Lobby.tsx`, `connLostWarning`) operates **outside** rooms after returning to the Lobby (`gartic_connection_lost` or `gartic_session_expired_reason === 'connection_lost'`) and intentionally retains warm golden/orange `titleType="exit"` (`#FFB300` / `#0F3957`).

2. **In-Game `AfkWarningModal` vs. Lobby `INACTIVE` Modal:**
   - **Never merge these two flows.**
   - `AfkWarningModal` (`src/components/game/modals/AfkWarningModal.tsx`) is a blocking **pre-kick** countdown prompt inside an active room allowing the player to stay in the game.
   - Lobby `INACTIVE` (`src/components/Lobby.tsx`, `afkWarning`) is a **post-kick** informational notice shown upon returning to the Lobby when `gartic_afk_kicked` was recorded.

3. **Portal Directionality Rule:**
   - `ExperimentalDrawingBoard` preserves `dir="rtl"` at its root toolbar layout and `dir="ltr"` on its canvas container (`DrawingCanvasCore`), while portal modals rendered via `CinematicModal` apply `dir={isRTL ? "rtl" : "ltr"}` strictly at the localized modal text level.
