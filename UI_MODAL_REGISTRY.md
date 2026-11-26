# UI Modal & Popup Registry

This registry is a **documentation-only technical navigation and maintenance catalog** of modal windows, popup dialogs, and modal-like overlays under `src/components/`.

- **Authoritative Source of Truth:** Actual runtime TSX/CSS source code is always authoritative. This document helps locate files, triggers, dimensions, animations, directionality rules, and localization keys; it does **not** implement rendering or animations.
- **`CinematicModal.tsx` vs. `UI_MODAL_REGISTRY.md`:**
  - `src/components/game/CinematicModal.tsx` is the **shared runtime component** responsible for common portal mounting (`document.body`), backdrop dimming, close controls, `GameTitle`, bottom action buttons, and shared Framer Motion entrance/exit transitions. It remains the implementation source of truth for shared modal behavior.
  - `UI_MODAL_REGISTRY.md` catalogs concrete modal/popup instances, standalone dialogs, and full-screen/in-board flow overlays across the app. **Both artifacts are intentionally kept separate and maintained independently.**
- **Scope & Maintenance:** Ordinary dropdowns, menus, inline HUD banners (`ExperimentalWordOverlay`, `ExperimentalHitOverlay`), and transient corner toast pills (`RoomsBrowserScreen`'s `newRoomNotice`) are excluded. Update this registry whenever adding, removing, or structurally changing modal windows; see [`LOCALIZATION_ROADMAP.md`](./LOCALIZATION_ROADMAP.md) for localization phase tracking.

---

## Inventory Summary (Grouped Components vs. Individual Instances)

| Category | Source Components / Inline Sites | Individual Popup / Overlay Instances | Notes |
| :--- | :---: | :---: | :--- |
| **Shared Primitives** | `2` (`CinematicModal.tsx`, `GameTitle.tsx`) | — | Shared runtime host & 3D header typography |
| **`CinematicModal` Instances** | `10` sites (5 modal files, 1 grouped alert file of 6 dialogs, 5 inline `Lobby`/`Board` blocks; `RoomInfoModal` + 4 inline) | **`17` individual dialogs** | Counts `RoomAlertModals.tsx` as **6 individual alert dialogs** (`SLOW DOWN`, `KICKED`, `ERROR` ×2, `SERVER FULL`, `TIMEOUT`) |
| **Standalone Modals & Dialogs** | `4` (`CustomEmojiModal`, `ColorWheelModal`, `Lobby` Avatar Grid, `FreeDrawMobileDebug`) | **`4` individual dialogs** | Custom backdrops/portals; do not use `CinematicModal` |
| **Full-Screen & In-Board Overlays** | `5` (`RoomConnectionStatusOverlay`, Initial Room Loading Overlay, `ChoosingWordOverlay`, `OverlayChatRoom`, `MiniBoardOverlay`) | **`5` flow overlays** | Phase/connection/chat overlays (`MiniBoardOverlay` renders multiple turn-state views) |
| **Total UI Modals & Overlays** | **`19` active modal/overlay sites** (+ `2` shared primitives) | **`26` individual instances** | Verified directly from `src/components/` |

---

## Table of Contents

1. [Shared Modal Hosts & Typography Primitives](#1-shared-modal-hosts--typography-primitives)
2. [Modal Instances Built on `CinematicModal` (17 Individual Popups)](#2-modal-instances-built-on-cinematicmodal-17-individual-popups)
3. [Standalone Modals & Dialogs (4 Individual Popups)](#3-standalone-modals--dialogs-4-individual-popups)
4. [Full-Screen & In-Board Flow Overlays (5 Overlays)](#4-full-screen--in-board-flow-overlays-5-overlays)
5. [Critical Lifecycle & Architectural Boundaries](#5-critical-lifecycle--architectural-boundaries)

---

## 1. Shared Modal Hosts & Typography Primitives

### 1.1 `CinematicModal` (Shared Runtime Implementation Source of Truth)
- **File Path:** `src/components/game/CinematicModal.tsx`
- **Purpose:** Centralized portal-based modal host providing uniform backdrop dimming, accidental-tap protection, close controls, 3D cartoon title header, centered body slot, and action button bar.
- **Render Target:** React Portal into `document.body` (`fixed inset-0 z-[9999]`, default backdrop `bg-slate-900/80`, overrideable via `overlayClassName`).
- **Dimensions & Responsive Layout:** Card uses `w-[88%] max-w-[380px] sm:max-w-[460px] min-h-[340px] sm:min-h-[440px] h-auto max-h-[85dvh] overflow-y-auto rounded-[28px] sm:rounded-[36px] pt-5 pb-5 px-5 sm:pt-7 sm:pb-7 sm:px-8` (overrideable via `maxWidthClass`). Global `.responsive-modal-scale` class (`src/components/index.css`) is defined for short viewports (`max-height: 500px`), while `CinematicModal` itself relies on `max-h-[85dvh]` + internal scrolling.
- **Close Behavior:**
  - Top-right `X` button rendered when `onClose` is passed (`aria-label={t('actions.close')}` from `common`).
  - Backdrop click closes only when pointer-down started directly on the backdrop (`backdropPointerDownRef`) AND `Date.now() - openTimeRef.current > 300` ms (prevents immediate accidental dismissal from opening tap/release).
- **Animation Owner:** Framer Motion (`AnimatePresence` + `motion.div`).
- **Entrance / Exit Behavior:**
  - Backdrop: `initial={{ opacity: 0 }}` -> `animate={{ opacity: 1 }}` -> `exit={{ opacity: 0 }}` (`duration: 0.18`).
  - Card (`cinematicCardVariants`): `hidden: { opacity: 0, scale: 0.95 }` -> `visible: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: "easeOut" } }` -> `exit: { scale: 0.95, opacity: 0, transition: { duration: 0.15, ease: "easeIn" } }`.
  - Header, body, and button tiers (`cinematicItemVariants`): `hidden: { opacity: 0, y: 5 }` -> `visible: { opacity: 1, y: 0, transition: { duration: 0.15, ease: "easeOut" } }`.
- **Button Variants:** `primary` (`#38BDF8`), `secondary` (`#ECEBFC`), `danger` (`#FB923C`), `neutral` (`#818CF8`), or `custom` (`btn.className`).
- **Arabic Title Opt-In:** Optional `arabicDisplay` prop (`false` by default) forwarded to `GameTitle` when rendering localized RTL popup headings.

### 1.2 `GameTitle`
- **File Path:** `src/components/game/GameTitle.tsx`
- **Purpose:** 3-layer stacked 3D cartoon header typography (`'Fredoka', 'Inter', sans-serif` for English; inherited `font-sans` stack at `fontWeight: 900`, `dir="rtl"`, and 24-direction circular `text-shadow` outline when `arabicDisplay` is `true`) used by `CinematicModal`, `CustomEmojiModal`, `MiniBoardOverlay`, and `Lobby`.
- **Color Presets (`type`):**
  - `"exit"`: Fill `#FFB300` (warm golden/orange) / Stroke `#0F3957`
  - `"report"`: Fill `#FB923C` (orange) / Stroke `#0F3957`
  - `"profile"`: Fill `#FFFFFF` / Stroke `#4F46E5`
  - `"skip"`: Fill `#FFFFFF` / Stroke `#38BDF8`
  - `"inactive"`: Fill `#818CF8` / Stroke `#2E2882`
  - `"choose"` / `"miniboard"`: Fill `#FFFFFF` / Stroke `#2E2882`

---

## 2. Modal Instances Built on `CinematicModal` (17 Individual Popups)

All entries in this section inherit `CinematicModal`'s portal mounting, `AnimatePresence`, default card dimensions (`w-[88%] max-w-[380px] sm:max-w-[460px] min-h-[340px] sm:min-h-[440px] max-h-[85dvh]`), backdrop fade (`0.18s`), and card scale/opacity transitions (`0.2s` in / `0.15s` out), plus any inner icon/content animations noted below.

### 2.1 `ExitConfirmModal` (`EXIT`)
- **Display Name / Identifier:** `ExitConfirmModal` (`EXIT`)
- **File Path:** `src/components/game/modals/ExitConfirmModal.tsx`
- **Parent Component(s):** `GameRoom.tsx`, `ExperimentalGameRoom.tsx`
- **Purpose & Trigger Condition:** Confirms whether the player wants to leave the active room; opened when clicking the room header/toolbar exit action (`showExitConfirm`).
- **Title / `GameTitle` Text & Type:** `"EXIT"` (AR: `"الخروج"`) / `type="exit"` (`#FFB300` / `#0F3957`)
- **Main Content & Action Controls:**
  - Animated `ExitSprite` illustration (`w-26 sm:w-36`)
  - Confirmation question (`#exit-confirm-title`): `modals:exit.question`
  - Buttons: `#exit-confirm-no-btn` (`variant="primary"`, `common:actions.no`), `#exit-confirm-yes-btn` (`variant="danger"`, `common:actions.yes`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#exit-confirm-no-btn`.
- **Animation Owner:** `CinematicModal` (Framer Motion) + `ExitSprite` inner animation.
- **Verified Entrance / Exit Behavior:** Framer Motion card `opacity: 0->1`, `scale: 0.95->1` (`0.2s easeOut`) and `scale: 1->0.95`, `opacity: 1->0` (`0.15s easeIn`).
- **Layout & Direction Notes:** `#exit-confirm-title` sets `dir={isRTL ? "rtl" : "ltr"}` locally; `arabicDisplay={isRTL}` renders the Arabic title in RTL.
- **Localization Source & Keys:** Localized in `src/i18n/locales/{en,ar}/modals.ts` (`modals:titles.exit`, `modals:exit.question`) and `common.ts` (`common:actions.no`, `common:actions.yes`).

### 2.2 `SkipConfirmModal` (`SKIP`)
- **Display Name / Identifier:** `SkipConfirmModal` (`SKIP`)
- **File Path:** `src/components/game/modals/SkipConfirmModal.tsx`
- **Parent Component(s):** `ExperimentalGameRoom.tsx`
- **Purpose & Trigger Condition:** Confirms whether the active drawer wants to skip their drawing turn; opened from the skip turn action (`showSkipConfirm`).
- **Title / `GameTitle` Text & Type:** `"SKIP"` (AR: `"تخطّي"`) / `type="report"` (`#FB923C` / `#0F3957`)
- **Main Content & Action Controls:**
  - Framed `FastForward` icon badge (`w-28 h-18 sm:w-32 sm:h-20`) with CSS loop animation
  - Confirmation question (`#skip-confirm-title`): `modals:skip.question`
  - Buttons: `#skip-confirm-no-btn` (`variant="primary"`, `common:actions.no`), `#skip-confirm-yes-btn` (`variant="danger"`, `common:actions.yes`)
- **Close Behavior:** `X` button, guarded backdrop click, `#skip-confirm-no-btn`, or automatically dismissed by `ExperimentalGameRoom.tsx` whenever the player leaves active drawing mode (`!isDrawingMode`) or `gameState.status !== "DRAWING"` (resets `showSkipConfirm` only; never invokes `handleSkipTurn()` or emits `skip_turn`).
- **Animation Owner:** `CinematicModal` (Framer Motion) + CSS `.animate-skip-escape` (`src/components/index.css`).
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`) + continuous `skip-escape-creature` CSS loop (`3.2s cubic-bezier(0.34, 1.25, 0.64, 1) infinite`).
- **Layout & Direction Notes:** `#skip-confirm-title` sets `dir={isRTL ? "rtl" : "ltr"}` locally; inner animation frame stays `select-none`; `arabicDisplay={isRTL}` renders the Arabic title in RTL.
- **Localization Source & Keys:** Localized in `modals.ts` (`modals:titles.skip`, `modals:skip.question`) and `common.ts` (`common:actions.*`).

### 2.3 `ReportConfirmModal` (`REPORT`)
- **Display Name / Identifier:** `ReportConfirmModal` (`REPORT`)
- **File Path:** `src/components/game/modals/ReportConfirmModal.tsx`
- **Parent Component(s):** `ExperimentalGameRoom.tsx`
- **Purpose & Trigger Condition:** Confirms reporting the current drawing; opened when a guesser clicks the report button (`showReportConfirm`).
- **Title / `GameTitle` Text & Type:** `"REPORT"` (AR: `"إبلاغ"`) / `type="report"` (`#FB923C` / `#0F3957`)
- **Main Content & Action Controls:**
  - Animated `AlertTriangle` (`w-16 h-16 sm:w-20 sm:h-20`, `#FB923C`)
  - Confirmation question (`#report-confirm-title`): `modals:report.question`
  - Buttons: `#report-confirm-no-btn` (`variant="primary"`, `common:actions.no`), `#report-confirm-yes-btn` (`variant="danger"`, `common:actions.yes`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#report-confirm-no-btn`.
- **Animation Owner:** `CinematicModal` (Framer Motion) + inner `motion.div` periodic shake.
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`) + `AlertTriangle` periodic shake/pulse (`delay: 1.5s, duration: 0.6s, repeatDelay: 1.8s, repeat: Infinity`).
- **Layout & Direction Notes:** `#report-confirm-title` sets `dir={isRTL ? "rtl" : "ltr"}` locally; `arabicDisplay={isRTL}` renders the Arabic title in RTL.
- **Localization Source & Keys:** Localized in `modals.ts` (`modals:titles.report`, `modals:report.question`) and `common.ts` (`common:actions.*`).

### 2.4 `AfkWarningModal` (In-Game Pre-Kick Warning — `INACTIVE`)
- **Display Name / Identifier:** `AfkWarningModal` (`INACTIVE` — in-game live countdown)
- **File Path:** `src/components/game/modals/AfkWarningModal.tsx`
- **Parent Component(s):** `GameRoom.tsx`, `ExperimentalGameRoom.tsx`
- **Purpose & Trigger Condition:** Live pre-kick inactivity warning inside an active room when the server emits an AFK warning countdown (`showAfkWarning`), giving the player a chance to confirm activity before being kicked. **Distinct from Lobby post-kick `INACTIVE` modal (2.9).**
- **Title / `GameTitle` Text & Type:** `"INACTIVE"` (AR: `"خمول!"`) / `type="inactive"` (`#818CF8` / `#2E2882`)
- **Main Content & Action Controls:**
  - `AfkWarningSprite` illustration (`w-24 sm:w-34`)
  - Combined prompt (`#afk-title` + `#afk-description`): `modals:afk.question` + `modals:afk.actionHint`
  - Live countdown pill with `<Trans i18nKey="afk.disconnectCountdown">` and pulsing red dot
  - Button: `#afk-return-btn` (`variant="neutral"`, `Check` icon, `common:actions.ok`)
- **Close Behavior:** **Blocking action only** (`onClose` is NOT passed to `CinematicModal`, so no `X` button or backdrop close — user must click `#afk-return-btn` to emit stay-active confirmation).
- **Animation Owner:** `CinematicModal` (Framer Motion) + `AfkWarningSprite` + Tailwind `animate-ping` status dot.
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`) + pulsing countdown indicator.
- **Layout & Direction Notes:** Prompt and countdown badge apply `dir={isRTL ? "rtl" : "ltr"}` locally; `arabicDisplay={isRTL}` renders the Arabic title in RTL; CLDR plural forms (`_zero`, `_one`, `_two`, `_few`, `_many`, `_other`) handled via `<Trans>`.
- **Localization Source & Keys:** Localized in `modals.ts` (`modals:titles.afkInactive`, `modals:afk.*`) and `common.ts` (`common:actions.ok`).

### 2.5 `PlayerProfileModal` (`PROFILE`)
- **Display Name / Identifier:** `PlayerProfileModal` (`PROFILE`)
- **File Path:** `src/components/game/modals/PlayerProfileModal.tsx`
- **Parent Component(s):** `GameRoom.tsx`, `ExperimentalGameRoom.tsx`
- **Purpose & Trigger Condition:** Displays another player's (or own) profile card when clicking a player slot (`selectedPlayerProfile`), allowing mute/block or votekick actions.
- **Title / `GameTitle` Text & Type:** `"PROFILE"` (AR: `"الملف"`) / `type="profile"` (`#FFFFFF` / `#4F46E5`)
- **Main Content & Action Controls:**
  - Circular avatar emoji preview (`w-24 h-24 sm:w-30 sm:h-30`, `👤` fallback)
  - Player name (`#profile-modal-name`) wrapped in `<bdi dir="auto">`
  - If `isSelf`: informational badge `modals:profile.selfAccount`
  - Otherwise: `#profile-modal-block-btn` (`modals:profile.block` / `modals:profile.unblock`) and `#profile-modal-kick-btn` (`modals:profile.votekick` / `modals:profile.removeVote`)
- **Close Behavior:** `X` button, guarded backdrop click, or auto-closes immediately upon clicking block or votekick buttons.
- **Animation Owner:** `CinematicModal` (Framer Motion) + Tailwind CSS utility `animate-in fade-in slide-in-from-bottom-2 duration-300` on action buttons container.
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`) + CSS slide-up fade (`300ms`) on action stack.
- **Layout & Direction Notes:** Player name enforces bidirectional isolation with `dir="auto"` and `<bdi dir="auto">`; self-notice and action stack apply `dir={isRTL ? "rtl" : "ltr"}`; `arabicDisplay={isRTL}` renders the Arabic title in RTL.
- **Localization Source & Keys:** Localized in `modals.ts` (`modals:titles.profile`, `modals:profile.*`).

### 2.6 `RoomAlertModals` — Grouped Component Containing 6 Individual Alert Dialogs
- **Grouped Component Path:** `src/components/game/modals/RoomAlertModals.tsx`
- **Parent Component(s):** `GameRoom.tsx`, `ExperimentalGameRoom.tsx`
- **Shared Structure:** Renders six discrete `CinematicModal` instances side-by-side (`RoomAlertModals` counts as **1 source component file containing 6 individual popup instances**). All alert `<h3 />` message nodes apply `dir={isRTL ? "rtl" : "ltr"}` locally; `GameTitle` headers are localized via `modals:titles.*` and pass `arabicDisplay={isRTL}` while keeping English `Fredoka` titles unchanged.

#### 2.6.1 Votekick Cooldown Warning (`SLOW DOWN`)
- **Trigger Condition:** `showCooldownWarning && shouldRenderCooldown`
- **Title / `GameTitle`:** `"SLOW DOWN"` (AR: `"تمهل!"`, `modals:titles.slowDown`) / `type="report"` (`#FB923C` / `#0F3957`)
- **Content & Controls:** Shaking red `AlertTriangle` (`w-20 h-20`), message `#cooldown-warning-title` (`modals:alerts.cooldown.message`), button `#cooldown-warning-ok-btn` (`variant="custom"`, teal `#1AAACC`, `common:actions.ok`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#cooldown-warning-ok-btn`.
- **Animation Owner:** `CinematicModal` + `motion.div` periodic shake (`delay: 1.5s, duration: 0.6s, repeatDelay: 1.8s, repeat: Infinity`).

#### 2.6.2 Voted Out / Kicked Alert (`KICKED`)
- **Trigger Condition:** `isBanned`
- **Title / `GameTitle`:** `"KICKED"` (AR: `"طُردت!"`, `modals:titles.kicked`) / `type="report"` (`#FB923C` / `#0F3957`)
- **Content & Controls:** Shaking red `AlertTriangle` (`w-20 h-20`), message `#kicked-out-desc` (`modals:alerts.kicked.message`), button `#kicked-out-exit-btn` (`variant="danger"`, `common:actions.ok`)
- **Close Behavior:** **Blocking (`onClose` omitted)** — player must press `#kicked-out-exit-btn` (`onLeaveFromBanned`).
- **Animation Owner:** `CinematicModal` + `motion.div` periodic shake (`delay: 1.5s, duration: 0.6s, repeatDelay: 1.8s, repeat: Infinity`).

#### 2.6.3 Nickname Taken Error (`ERROR`)
- **Trigger Condition:** `isNicknameTaken`
- **Title / `GameTitle`:** `"ERROR"` (AR: `"محجوز!"`, `modals:titles.nicknameTaken`) / `type="report"` (`#FB923C` / `#0F3957`), custom opaque backdrop `overlayClassName="bg-slate-950/100"`
- **Content & Controls:** Shaking orange `AlertTriangle` (`w-20 h-20`), message `#nickname-taken-desc` (`modals:alerts.nicknameTaken.message`), button `#nickname-taken-exit-btn` (`variant="danger"`, `common:actions.ok`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#nickname-taken-exit-btn` (all call `onLeaveFromNicknameTaken`).
- **Animation Owner:** `CinematicModal` + `motion.div` periodic shake (`delay: 1.5s, duration: 0.6s, repeatDelay: 1.8s, repeat: Infinity`).

#### 2.6.4 In-Room Join Room-Full Error (`ERROR`)
- **Trigger Condition:** `isRoomFull`
- **Title / `GameTitle`:** `"ERROR"` (AR: `"ممتلئة!"`, `modals:titles.roomFull`) / `type="report"` (`#FB923C` / `#0F3957`)
- **Content & Controls:** Shaking orange `AlertTriangle` (`w-20 h-20`), message `#room-full-desc` (`modals:alerts.roomFull.message`), button `#room-full-exit-btn` (`variant="danger"`, `common:actions.ok`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#room-full-exit-btn` (all call `onLeaveFromRoomFull`).
- **Animation Owner:** `CinematicModal` + `motion.div` periodic shake (`delay: 1.5s, duration: 0.6s, repeatDelay: 1.8s, repeat: Infinity`).

#### 2.6.5 Server Full / Auth Store Full Alert (`SERVER FULL`)
- **Trigger Condition:** `isAuthStoreFull`
- **Title / `GameTitle`:** `"SERVER FULL"` (AR: `"مشغول!"`, `modals:titles.serverFull`) / `type="report"` (`#FB923C` / `#0F3957`)
- **Content & Controls:** Static orange `AlertTriangle` (`w-20 h-20`, no shake), message `#auth-store-full-desc` (`modals:alerts.serverFull.message`), button `#auth-store-full-exit-btn` (`variant="danger"`, `common:actions.ok`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#auth-store-full-exit-btn` (all call `onLeaveFromAuthStoreFull`).
- **Animation Owner:** `CinematicModal` only.

#### 2.6.6 Join Room Timeout Alert (`TIMEOUT`)
- **Trigger Condition:** `isJoinTimedOut`
- **Title / `GameTitle`:** `"TIMEOUT"` (AR: `"مهلة!"`, `modals:titles.timeout`) / `type="report"` (`#FB923C` / `#0F3957`)
- **Content & Controls:** Static orange `AlertTriangle` (`w-20 h-20`, no shake), message `#join-timeout-desc` (`modals:alerts.joinTimeout.message`), button `#join-timeout-exit-btn` (`variant="danger"`, `common:actions.ok`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#join-timeout-exit-btn` (all call `onLeaveFromJoinTimeout`).
- **Animation Owner:** `CinematicModal` only.

### 2.7 Clear Drawing Confirmation (`CLEAN`)
- **Display Name / Identifier:** Clear Drawing Confirmation (`CLEAN`)
- **File Path:** `src/components/experimental/ExperimentalDrawingBoard.tsx` (inline `CinematicModal`)
- **Parent Component(s):** `ExperimentalDrawingBoard` (shared across Competitive Experimental & Free Draw rooms)
- **Purpose & Trigger Condition:** Confirms clearing the entire drawing canvas before executing `canvasCoreRef.current?.clear()`; opened when the active drawer/artist taps the clear-canvas toolbar button (`requestClearCanvas` -> `showClearConfirm`).
- **Title / `GameTitle` Text & Type:** `"CLEAN"` (AR: `"مسح"`) / `type="report"` (`#FB923C` / `#0F3957`)
- **Main Content & Action Controls:**
  - Circular red-tinted badge (`w-16 h-16 sm:w-20 sm:h-20` inside `w-20 h-20 sm:w-26 sm:h-26`, `#EF4444`) with spinning `RefreshCcw` icon
  - Prompt (`#clean-confirm-desc`): `modals:clean.question`
  - Buttons: `#clean-confirm-no-btn` (`variant="primary"`, `common:actions.no`), `#clean-confirm-yes-btn` (`variant="danger"`, `common:actions.yes`)
- **Close Behavior:** `X` button, guarded backdrop click, `#clean-confirm-no-btn`, or automatically dismissed by `ExperimentalDrawingBoard.tsx` when `readOnly` transitions `false -> true` (competitive or Free Draw; resets `showClearConfirm` only without invoking `confirmClear()` or clearing the canvas).
- **Animation Owner:** `CinematicModal` (Framer Motion) + CSS `.animate-clean-spin` (`src/components/index.css`).
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`) + `clean-spin-loop` (`3s cubic-bezier(0.34, 1.3, 0.64, 1) infinite`, pauses briefly then rotates `-360deg`).
- **Layout & Direction Notes:** Root board stays `dir="rtl"` and canvas container stays `dir="ltr"`; `#clean-confirm-desc` sets `dir={isRTL ? "rtl" : "ltr"}` locally inside the portal modal; `arabicDisplay={isRTL}` renders the Arabic title in RTL.
- **Localization Source & Keys:** Localized in `modals.ts` (`modals:titles.clean`, `modals:clean.question`) and `common.ts` (`common:actions.no`, `common:actions.yes`).

### 2.8 Floating Player Names Confirmation (`NAMES`)
- **Display Name / Identifier:** Floating Player Names Confirmation (`NAMES`)
- **File Path:** `src/components/experimental/ExperimentalDrawingBoard.tsx` (inline `CinematicModal` gated by `{isFreeDraw && ...}`)
- **Parent Component(s):** `ExperimentalDrawingBoard` (**Free Draw mode only**)
- **Purpose & Trigger Condition:** Confirms toggling the `showFloatingNames` preference (persisted in `safeLocalStorage` under `gartic_show_floating_names`, default `true`) controlling live floating artist name tags over strokes; triggered by the eye toggle button (`handleToggleFloatingNames` -> `showFloatingNamesConfirm`).
- **Title / `GameTitle` Text & Type:** `"NAMES"` (AR: `"الأسماء"`) / `type="report"` (`#FB923C` / `#0F3957`)
- **Main Content & Action Controls:**
  - Dynamic circular icon badge (`w-16 h-16 sm:w-20 sm:h-20`): red `#EF4444` + `EyeOff` when names are currently shown (asking to hide); blue `#3B82F6` + `Eye` when names are currently hidden (asking to show)
  - Conditional prompt (`#names-confirm-desc`): `modals:names.hideQuestion` or `modals:names.showQuestion`
  - Buttons: `#names-confirm-no-btn` (`variant="primary"`, `common:actions.no`), `#names-confirm-yes-btn` (`variant={showFloatingNames ? "danger" : "primary"}`, `common:actions.yes`)
- **Close Behavior:** `X` button, guarded backdrop click, `#names-confirm-no-btn`, or automatically dismissed by `ExperimentalDrawingBoard.tsx` when `readOnly` transitions `false -> true` in Free Draw (resets `showFloatingNamesConfirm` only without invoking `confirmToggleFloatingNames()` or mutating persisted `showFloatingNames`).
- **Animation Owner:** `CinematicModal` (Framer Motion). Inner icon is static.
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`).
- **Layout & Direction Notes:** Rendered only when `isFreeDraw` is `true`; `#names-confirm-desc` sets `dir={isRTL ? "rtl" : "ltr"}` locally; `arabicDisplay={isRTL}` renders the Arabic title in RTL.
- **Localization Source & Keys:** Localized in `modals.ts` (`modals:titles.names`, `modals:names.hideQuestion`, `modals:names.showQuestion`) and `common.ts` (`common:actions.no`, `common:actions.yes`).

### 2.9 Lobby AFK Post-Kick Notification (`INACTIVE`)
- **Display Name / Identifier:** Lobby AFK Post-Kick Notification (`INACTIVE`)
- **File Path:** `src/components/Lobby.tsx` (inline `CinematicModal`)
- **Parent Component(s):** `Lobby`
- **Purpose & Trigger Condition:** Post-kick notification displayed on return to the Lobby after being disconnected/kicked for inactivity (`afkWarning` initialized on mount when `gartic_afk_kicked` timestamp is `< 180000` ms old; storage flags are cleared on mount). Hides the home card while visible (`!afkWarning && !connLostWarning`). **Distinct from in-game `AfkWarningModal` (2.4).**
- **Title / `GameTitle` Text & Type:** `"INACTIVE"` (AR: `"خمول!"`) / `type="inactive"` (`#818CF8` / `#2E2882`)
- **Main Content & Action Controls:**
  - Message (`#afk-warning-text`): `modals:lobbyAfk.message`
  - Button: `#afk-warning-ok-btn` (`variant="secondary"`, `common:actions.ok`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#afk-warning-ok-btn`.
- **Animation Owner:** `CinematicModal` (Framer Motion).
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`).
- **Layout & Direction Notes:** `#afk-warning-text` applies `dir={isModalsRTL ? "rtl" : "ltr"}`; `arabicDisplay={isModalsRTL}` renders the Arabic title in RTL.
- **Localization Source & Keys:** Localized in `modals.ts` (`modals:titles.lobbyInactive`, `modals:lobbyAfk.message`) and `common.ts` (`common:actions.ok`).

### 2.10 Lobby Connection-Lost Notification (`DISCONNECTED`)
- **Display Name / Identifier:** Lobby Connection-Lost Notification (`DISCONNECTED`)
- **File Path:** `src/components/Lobby.tsx` (inline `CinematicModal`)
- **Parent Component(s):** `Lobby`
- **Purpose & Trigger Condition:** Post-exit notification displayed on return to the Lobby after a room disconnect/join timeout or non-AFK session expiration (`connLostWarning` initialized on mount when `gartic_connection_lost` is `< 180000` ms old OR `!isAfk && !afkStored && reason === 'connection_lost' && !connLostStored`). Hides the home card while visible. **Distinct from `RoomConnectionStatusOverlay` (4.1).**
- **Title / `GameTitle` Text & Type:** `"DISCONNECTED"` (AR: `"انقطاع!"`) / `type="exit"` (**warm golden/orange** `#FFB300` / `#0F3957` — intentionally uses `"exit"` styling)
- **Main Content & Action Controls:**
  - Message (`#conn-lost-warning-text`): `modals:lobbyDisconnected.message`
  - Button: `#conn-lost-warning-ok-btn` (`variant="danger"`, `common:actions.ok`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#conn-lost-warning-ok-btn`.
- **Animation Owner:** `CinematicModal` (Framer Motion).
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`).
- **Layout & Direction Notes:** `#conn-lost-warning-text` applies `dir={isModalsRTL ? "rtl" : "ltr"}`; `arabicDisplay={isModalsRTL}` renders the Arabic title in RTL.
- **Localization Source & Keys:** Localized in `modals.ts` (`modals:titles.disconnected`, `modals:lobbyDisconnected.message`) and `common.ts` (`common:actions.ok`). `titleType="exit"` is intentionally kept unchanged.

### 2.11 Lobby Room-Full Error Modal (`ERROR`)
- **Display Name / Identifier:** Lobby Room-Full Error Modal (`ERROR`)
- **File Path:** `src/components/Lobby.tsx` (inline `CinematicModal`)
- **Parent Component(s):** `Lobby`
- **Purpose & Trigger Condition:** Displayed when `handlePlay()` checks room capacity via `get_room_info` and finds `data.count >= maxCapacity`, setting `joinError`.
- **Title / `GameTitle` Text & Type:** `"ERROR"` (AR: `"ممتلئة!"`) / `type="report"` (`#FB923C` / `#0F3957`)
- **Main Content & Action Controls:**
  - Shaking orange `AlertTriangle` (`w-20 h-20`)
  - Message (`#lobby-room-full-desc`): `modals:alerts.roomFull.message`
  - Button: `#lobby-room-full-ok-btn` (`variant="danger"`, `common:actions.ok`)
- **Close Behavior:** `X` button, guarded backdrop click, or `#lobby-room-full-ok-btn`.
- **Animation Owner:** `CinematicModal` (Framer Motion) + `motion.div` periodic `AlertTriangle` shake (`delay: 1.5s, duration: 0.6s, repeatDelay: 1.8s, repeat: Infinity`).
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`).
- **Layout & Direction Notes:** `#lobby-room-full-desc` applies `dir={isModalsRTL ? 'rtl' : 'ltr'}`; `arabicDisplay={isModalsRTL}` renders the Arabic title in RTL.
- **Localization Source & Keys:** Localized in `modals.ts` (`modals:titles.roomFull`, `modals:alerts.roomFull.message`) and `common.ts` (`common:actions.ok`).

### 2.12 `RoomInfoModal` (`INFO`)
- **Display Name / Identifier:** `RoomInfoModal` (`INFO`)
- **File Path:** `src/components/lobby/RoomInfoModal.tsx`
- **Parent Component(s):** `Lobby.tsx` (`selectedRoom`)
- **Purpose & Trigger Condition:** Shows selected room metadata (player count/max, theme, winning points/open mode) and error banner before joining; opened when clicking a room card in `RoomsBrowserScreen` (`selectedRoom !== null`).
- **Title / `GameTitle` Text & Type:** `"INFO"` (AR: `"معلومات"`) / `type="report"` (`#FB923C` / `#0F3957`)
- **Main Content & Action Controls:**
  - Spinning `Settings` icon (`w-18 h-18 sm:w-20 sm:h-20` circle, `animate-spin-slow`)
  - Room display name (`roomDisplayName`) and optional `joinError` alert box
  - 3-column stats grid (`grid-cols-3`, labels `lobby:roomInfo.players`, `lobby:roomInfo.theme`, `lobby:roomInfo.toWin` / `lobby:roomInfo.open`)
  - Button: `#room-info-play-btn` (`variant="danger"`, `Play` icon, `lobby:roomInfo.play`)
- **Close Behavior:** `X` button or guarded backdrop click (`onClose`).
- **Animation Owner:** `CinematicModal` (Framer Motion) + Tailwind `animate-spin-slow` on `Settings` icon.
- **Verified Entrance / Exit Behavior:** `CinematicModal` Motion entrance/exit (`0.2s` / `0.15s`).
- **Layout & Direction Notes:** Stats grid and labels apply `dir={isRTL ? 'rtl' : 'ltr'}`; `arabicDisplay={isRTL}` renders the Arabic title in RTL.
- **Localization Source & Keys:** Localized in `modals.ts` (`modals:titles.info`) and `lobby.ts` (`lobby:roomInfo.*`).

---

## 3. Standalone Modals & Dialogs (4 Individual Popups)

These modals do **not** use `CinematicModal`; each implements its own backdrop, sizing, positioning, and animation lifecycle.

### 3.1 `CustomEmojiModal` (`CUSTOM EMOJI`)
- **Display Name / Identifier:** `CustomEmojiModal` (`CUSTOM EMOJI`)
- **File Path:** `src/components/game/CustomEmojiModal.tsx`
- **Parent Component(s):** `Lobby.tsx` (`showCustomEmojiModal`)
- **Purpose & Trigger Condition:** Allows players to type/pick any custom Unicode emoji from their keyboard (extracted via `Intl.Segmenter` / regex) and add it to `customEmojis`; opened from the `+` button inside Lobby's Avatar Grid Overlay.
- **Title / `GameTitle` Text & Type:** `"CUSTOM EMOJI"` (AR: `"إيموجي"`) / `type="skip"` (`#FFFFFF` / `#38BDF8`)
- **Dimensions & Responsive Layout:** `w-[88%] max-w-[380px] sm:max-w-[460px] min-h-[340px] sm:min-h-[440px] max-h-[85dvh] overflow-y-auto rounded-[28px] sm:rounded-[36px] p-5 sm:p-7` at `z-[110]`.
- **Main Content & Action Controls:**
  - Subtitle (`modals:customEmoji.subtitle`)
  - Emoji preview frame (`w-18 h-18 sm:w-24 sm:h-24`, check badge when detected, `modals:customEmoji.pickPrompt` empty state)
  - Search-type text input (`#custom-emoji-input`, placeholder `modals:customEmoji.placeholder`) with validation error (`modals:customEmoji.invalidError`)
  - Submit button (`modals:customEmoji.submitButton`)
- **Close Behavior:** Top-left `X` button (`aria-label={tCommon('actions.close')}`) or backdrop click (`bg-black/75`).
- **Animation Owner:** Framer Motion (`AnimatePresence` + `motion.div`, plus `motion.span` emoji preview spring/rotate).
- **Verified Entrance / Exit Behavior:**
  - Backdrop: `opacity: 0 -> 1 -> 0` (default Motion transition).
  - Card: `opacity: 0, scale: 0.95` -> `opacity: 1, scale: 1` -> `opacity: 0, scale: 0.95` (`duration: 0.2, ease: [0.16, 1, 0.3, 1]`).
  - Preview emoji: `scale: 0.5, rotate: -10` -> `scale: 1, rotate: 0`.
- **Layout & Direction Notes:** Card applies `dir={isRTL ? 'rtl' : 'ltr'}`; `arabicDisplay={isRTL}` renders the Arabic title in RTL.
- **Localization Source & Keys:** Localized in `modals.ts` (`modals:titles.customEmoji`, `modals:customEmoji.*`) and `common.ts` (`common:actions.close`).

### 3.2 `ColorWheelModal`
- **Display Name / Identifier:** `ColorWheelModal`
- **File Path:** `src/components/game/ColorWheelModal.tsx`
- **Parent Component(s):** `FlipaClipControls.tsx` (`isColorPickerOpen`, active in Free Draw or Experimental Draw when `EXPERIMENTAL_COLOR_WHEEL_TEST` is `true`)
- **Purpose & Trigger Condition:** Interactive HSV color wheel (`reinvented-color-wheel`), HEX editor, live/initial color comparison box, opacity slider, and `localStorage`-persisted saved color swatches; opened by tapping the color picker button in `FlipaClipControls`.
- **Title / `GameTitle` Text & Type:** None (`GameTitle` not used; compact top utility bar instead).
- **Dimensions & Responsive Layout:** Portal to `document.body` (`z-[100]`); card uses `w-[310px] sm:w-[340px] max-w-[94vw] max-h-[92dvh] overflow-y-auto rounded-[20px]`; dynamic wheel diameter calculated via `getOptimalWheelDiameter()` (`min(290, min(max(220, floor(w*0.82)), max(210, floor(h*0.42))))`).
- **Main Content & Action Controls:**
  - HEX input (`#FFFFFF` uppercase), split revert/live comparison buttons (`modals:colorWheel.compareTooltip` / `revertTooltip` / `currentTooltip`), `X` close button (`common:actions.close`)
  - `ReinventedColorWheel` canvas/SV picker
  - Opacity track slider (`10%–100%`, label `modals:colorWheel.opacity`)
  - Saved colors bar: Save button (`modals:colorWheel.save`), Delete button (`modals:colorWheel.deleteTooltip` / `deleteSelectedTooltip`), count label (`modals:colorWheel.savedCount` with CLDR plurals / `savedColors`), swatch grid (`modals:colorWheel.emptyHint`)
- **Close Behavior:** Closes via top-bar `X` button, transparent backdrop `onPointerDown` outside the card, or automatically when `ExperimentalDrawingBoard` passes `readOnly={true}` into pre-mounted `FlipaClipControls` (`setIsColorPickerOpen(false)`). On `readOnly`, `FlipaClipControls` also detaches active drag listeners and cancels pending `requestAnimationFrame` work, and `ColorWheelModal` cancels pending wheel/slider `requestAnimationFrame` work and interaction refs when `isOpen` becomes `false` without flushing unfinished color, opacity, or width values.
- **Animation Owner:** Framer Motion (`AnimatePresence` + `motion.div`).
- **Verified Entrance / Exit Behavior:** Card slides & fades `initial={{ opacity: 0, y: 8 }}` -> `animate={{ opacity: 1, y: 0 }}` -> `exit={{ opacity: 0, y: 8 }}` with `transition={{ duration: 0.12, ease: 'easeOut' }}`.
- **Layout & Direction Notes:** Deliberate mixed directionality: card top bar uses `dir="rtl"` (HEX right, compare center, close left); opacity slider track & readout stay `dir="ltr"` with `dir={isRTL ? 'rtl' : 'ltr'}` on the `Opacity` text label; saved-colors footer uses `dir={isRTL ? 'rtl' : 'ltr'}`.
- **Localization Source & Keys:** Localized in `modals.ts` (`modals:colorWheel.*`) and `common.ts` (`common:actions.close`). Hex/percent readouts stay numeric/LTR.

### 3.3 Lobby Avatar Grid Overlay
- **Display Name / Identifier:** Lobby Avatar Grid Overlay (inline in `Lobby.tsx`)
- **File Path:** `src/components/Lobby.tsx` (lines 700–738)
- **Parent Component(s):** `Lobby` (`showAvatarGrid`)
- **Purpose & Trigger Condition:** Displays a 6-column scrollable grid of preset emoji avatars plus a `+` button to launch `CustomEmojiModal`; opened from `AvatarCarousel`'s grid trigger (`onOpenGrid`).
- **Title / `GameTitle` Text & Type:** Plain header label `"اختر أفاتار"` (no `GameTitle`).
- **Dimensions & Responsive Layout:** `fixed inset-0 z-[100] p-4`, card `w-full max-w-sm rounded-3xl p-5`, scrollable 6-column grid `max-h-[300px] sm:max-h-[400px]`.
- **Main Content & Action Controls:**
  - Header label `"اختر أفاتار"` and `X` close button
  - `+` custom emoji trigger button (`title="أضف إيموجي مخصص"`)
  - Grid buttons for every emoji in `allAvatars` (selects emoji and closes)
- **Close Behavior:** Clicking the `bg-black/40` backdrop, header `X` button, `+` custom emoji button (transitions to `CustomEmojiModal`), or any avatar item.
- **Animation Owner:** Tailwind CSS animate utilities (`animate-in zoom-in-95 duration-200`) on card mount; **no exit transition** (instant unmount on `showAvatarGrid === false`).
- **Verified Entrance / Exit Behavior:** Entrance `zoom-in-95 duration-200`; exit unmounts immediately (`showAvatarGrid && (...)`).
- **Layout & Direction Notes:** Card hardcodes `dir="rtl"`. `Lobby.tsx` touchmove guard explicitly permits scrolling inside this overlay when `showAvatarGrid` is true.
- **Localization Source & Status:** Not yet localized (`"اختر أفاتار"`, `"أضف إيموجي مخصص"` hardcoded in Arabic; scheduled for `L10N-6` per `LOCALIZATION_ROADMAP.md`).

### 3.4 `FreeDrawMobileDebug` Settings Modal
- **Display Name / Identifier:** `FreeDrawMobileDebug` settings modal
- **File Path:** `src/components/game/FreeDrawMobileDebug.tsx`
- **Parent Component(s):** Mounted globally (`App.tsx` / `GameRoom.tsx` / `ExperimentalGameRoom.tsx`) only when `isMobileDebugActive()` is enabled; modal opens via the floating `"FD Debug"` pill (`isPanelOpen`).
- **Purpose & Trigger Condition:** Developer diagnostic modal for toggling localStorage debug flags (`freedraw_bucket_undo_diag`, `freedraw_bucket_join_diag`, `freedraw_bucket_checkpoint_exp`, `freedraw_bucket_batch_replay_exp`), opening Eruda console, reloading, or disabling debug mode.
- **Title / `GameTitle` Text & Type:** Header `"Free Draw Mobile Debug"` (no `GameTitle`).
- **Dimensions & Responsive Layout:** `fixed inset-0 z-[10000] p-3`, card `w-full max-w-sm sm:max-w-md rounded-2xl p-4 sm:p-5`.
- **Main Content & Action Controls:**
  - Diagnostic toggles list, Eruda launcher, apply & reload, disable debug, and `X` close button.
- **Close Behavior:** Backdrop click (`bg-black/60 backdrop-blur-xs`) or header `X` button.
- **Animation Owner:** Tailwind CSS animate utilities (`animate-in fade-in zoom-in-95 duration-150`); **no exit transition** (instant unmount).
- **Verified Entrance / Exit Behavior:** Entrance `fade-in zoom-in-95 duration-150`; exit unmounts immediately.
- **Layout & Direction Notes:** Backdrop wrapper uses `dir="rtl"`.
- **Localization Source & Status:** Developer-only diagnostic tool; hardcoded bilingual/Arabic helper strings (kept outside production player localization scope).

---

## 4. Full-Screen & In-Board Flow Overlays (5 Overlays)

### 4.1 `RoomConnectionStatusOverlay`
- **Display Name / Identifier:** `RoomConnectionStatusOverlay`
- **File Path:** `src/components/game/RoomConnectionStatusOverlay.tsx`
- **Parent Component(s):** `GameRoom.tsx`, `ExperimentalGameRoom.tsx` (`hasJoinedRoomOnce && (!isConnected || !isRoomJoined)`)
- **Purpose & Trigger Condition:** Live in-room reconnection overlay shown whenever socket connectivity drops or room rejoin is in progress **after** the user has successfully joined the room at least once. If disconnection persists beyond 20s (`isProlongedDisconnect`), reveals a manual exit button to return to Lobby. **Must remain separate from Lobby `DISCONNECTED` (2.10).**
- **Title / `GameTitle` Text & Type:** Dynamic `<h3>`: `modals:connection.disconnectedTitle` or `modals:connection.reconnectedTitle` (no `GameTitle`).
- **Dimensions & Responsive Layout:** `fixed inset-0 z-[9000] bg-[#061220]/60 p-4`, card `max-w-sm w-full rounded-3xl p-6 sm:p-8`.
- **Main Content & Action Controls:**
  - Dual-ring CSS spinner (`w-16 h-16`, `animate-spin`) + pulsing `WifiOff` icon (`animate-pulse`)
  - Subtitle: `modals:connection.reconnecting`, `modals:connection.rejoining`, or `modals:connection.prolongedDisconnect`
  - Conditional button (`#disconnect-return-lobby-btn`) after prolonged disconnect: `modals:connection.returnToLobby`
- **Close Behavior:** Auto-closes when both `isConnected` and `isRoomJoined` become true; manual escape via `#disconnect-return-lobby-btn` when `isProlongedDisconnect` is true.
- **Animation Owner:** Framer Motion (`AnimatePresence` + `motion.div`) for overlay visibility; CSS `animate-spin` and `animate-pulse` for status icon.
- **Verified Entrance / Exit Behavior:** Overlay fades `initial={{ opacity: 0 }}` -> `animate={{ opacity: 1 }}` -> `exit={{ opacity: 0 }}` (`duration: 0.25, ease: "easeOut"`).
- **Layout & Direction Notes:** Container sets `dir={isRTL ? "rtl" : "ltr"}`.
- **Localization Source & Keys:** Localized in `modals.ts` (`modals:connection.*`).

### 4.2 Initial Room Loading Overlay
- **Display Name / Identifier:** Initial Room Loading Overlay
- **File Path:** Inline in `src/components/GameRoom.tsx` (lines 1276–1294) and `src/components/experimental/ExperimentalGameRoom.tsx` (lines 1856–1874)
- **Parent Component(s):** `GameRoom`, `ExperimentalGameRoom`
- **Purpose & Trigger Condition:** Covers initial room entry (`isInitialLoadingRoom === true`) while socket join handshake completes, preventing visual flash of empty/unhydrated board state.
- **Title / `GameTitle` Text & Type:** None (spinner only).
- **Dimensions & Responsive Layout:** `fixed inset-0 z-[5000]`, backdrop `bg-[#061220]` (`bg-[#061220]/50` when `isMobileDebugActive()`), spinner `w-14 h-14`.
- **Main Content & Action Controls:** Minimalist spinning border ring (`border-[#1AD2FF]`). Zero text or buttons.
- **Close Behavior:** Automatically transitions out once initial room join resolves (`isInitialLoadingRoom` becomes `false`).
- **Animation Owner:** Framer Motion (`AnimatePresence` + `motion.div`) + CSS `animate-spin`.
- **Verified Entrance / Exit Behavior:** Mounted visible immediately (`initial={false}`, `animate={{ opacity: 1 }}`) -> fades out on dismiss (`exit={{ opacity: 0 }}`, `duration: 0.35, ease: "easeInOut"`).
- **Layout & Direction Notes:** Language-neutral visual spinner.
- **Localization Source & Status:** N/A (no visible text).

### 4.3 `ChoosingWordOverlay`
- **Display Name / Identifier:** `ChoosingWordOverlay`
- **File Path:** `src/components/experimental/ChoosingWordOverlay.tsx`
- **Parent Component(s):** `ExperimentalGameRoom.tsx` (`gameState.status === "CHOOSING" && amIDrawer`)
- **Purpose & Trigger Condition:** Full-screen prompt letting the chosen drawer pick one of two candidate words to draw during the `CHOOSING` turn phase.
- **Title / `GameTitle` Text & Type:** Heading `"IT'S YOUR TURN!"` (no `GameTitle`).
- **Dimensions & Responsive Layout:** `fixed inset-0 z-[500] bg-black/70 p-4`, inner container `w-full max-w-md px-6`.
- **Main Content & Action Controls:**
  - Prompt `"Choose a word to draw"`
  - Two candidate word blocks (`wordOptions[0]`, `wordOptions[1]`, rendered with `dir="auto"`) separated by `"OR"` divider, each paired with a `"DRAW"` button (`onSelectWord`)
- **Close Behavior:** Selecting a word via either `"DRAW"` button, or turn phase moving out of `CHOOSING`.
- **Animation Owner:** Tailwind CSS animate utilities (`animate-in fade-in zoom-in-95 duration-300`); **no exit transition** (unmounts when status changes).
- **Verified Entrance / Exit Behavior:** Entrance `fade-in zoom-in-95 duration-300`; instant unmount on close.
- **Layout & Direction Notes:** Word options already carry `dir="auto"` (shared round words are never translated per `LOCALIZATION_ROADMAP.md`); static headings/buttons are currently English-only.
- **Localization Source & Status:** Not yet localized (`"IT'S YOUR TURN!"`, `"Choose a word to draw"`, `"DRAW"`, `"OR"` scheduled for `L10N-3`; see `LOCALIZATION_ROADMAP.md`).

### 4.4 `OverlayChatRoom`
- **Display Name / Identifier:** `OverlayChatRoom`
- **File Path:** `src/components/game/OverlayChatRoom.tsx`
- **Parent Component(s):** `GameRoom.tsx`, `ExperimentalGameRoom.tsx` (`isChatOpen`)
- **Purpose & Trigger Condition:** Full-screen interactive chat drawer/overlay toggled from the in-room chat icon (`isChatOpen`), supporting reading/copying messages, system/votekick alerts, and sending chat/guesses via `#chat-textarea`.
- **Title / `GameTitle` Text & Type:** None.
- **Dimensions & Responsive Layout:** `fixed top-0 bottom-0 left-0 right-0 z-[160] bg-black/60`, top dismiss spacer `h-16`, feed & compose form capped at `max-w-2xl mx-auto`, compose padding tracks `--keyboard-inset`.
- **Main Content & Action Controls:**
  - Top click-to-close band (`h-16`)
  - Reversed scrollable message feed (`ChatMessageItem` with copy popover `"Copy"`, system/votekick notices)
  - Bottom iOS-keyboard-aware compose bar with `X` close button, `#chat-textarea` (`placeholder="Type your message here..."`, `dir="auto"`), and `Send` button
- **Close Behavior:** Clicking the top spacer bar or bottom-left `X` button (`closeChat`).
- **Animation Owner:** Tailwind CSS animate utilities + custom `.animate-message-pop` CSS keyframe (`src/components/index.css`). **No exit transition** (`if (!isChatOpen) return null;`).
- **Verified Entrance / Exit Behavior:** Backdrop enters with `animate-in fade-in duration-200`; messages viewport enters with `animate-in slide-in-from-bottom-4 duration-300`; individual messages pop in via `message-pop-in` (`0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)`).
- **Layout & Direction Notes:** `#chat-textarea` and message text nodes use `dir="auto"` + `unicodeBidi: 'plaintext'`; votekick alert composition hardcodes `dir="rtl"` Arabic structure with `<bdi>` player name isolation.
- **Localization Source & Status:** Not yet localized (contains hardcoded strings such as `"Type your message here..."`, `"You've lost your turn"`, `"قام ... بالتصويت لطرد"`, `"Copy"`; scheduled for `L10N-5` after `L10N-4` structured server events).

### 4.5 `MiniBoardOverlay`
- **Display Name / Identifier:** `MiniBoardOverlay`
- **File Path:** `src/components/game/MiniBoardOverlay.tsx`
- **Parent Component(s):** `GameRoom.tsx`, `ExperimentalGameRoom.tsx` (scoped inside the drawing board canvas container)
- **Purpose & Trigger Condition:** Canvas-scoped overlay (`absolute inset-0 z-[40]`, Podium stage `z-[50]`) covering the drawing canvas for non-drawing phases:
  - Free Draw welcome screen (`"FREE DRAW"` / `"الرسم الحر"`)
  - `WAITING` (`"WAITING"` / `"بانتظار اللاعبين"`)
  - `CHOOSING` (`"NEW TURN!"` / `"دور جديد!"` while waiting for drawer)
  - `ROUND_END` (turn outcome variants: `"SKIPPED!"` / `"تخطّي"`, `"INACTIVE"` / `"فاتك الدور!"`, `"CANCELED TURN"` / `"تم إلغاء الدور!"`, `"INTERVAL"` / `"استراحة!"`, `"PERFECT!"` / `"ممتاز!"`)
  - `PODIUM` (`"ROUND COMPLETE"` / `"انتهت الجولة!"` top-3 podium & winner reveal)
- **Title / `GameTitle` Text & Type:** `GameTitle` `type="miniboard"` (`#FFFFFF` / `#2E2882`, `arabicDisplay={isRTL}`) localized via `miniBoard:titles.*`.
- **Dimensions & Responsive Layout:** Scoped to board container (`absolute inset-0 p-2 sm:p-4 overflow-y-auto`); inner card `w-full max-w-sm`; podium stage `max-w-[340px] sm:max-w-[420px] h-[160px] sm:h-[220px]`; 4th+ leaderboard `max-h-[60px] sm:max-h-[90px]`.
- **Main Content & Action Controls:**
  - Animated character sprites (`WaitingSprite`, `AllGuessedSprite`, `AllGuessedRareSprite`, `NoOneGuessed2Sprite`, `TurnLostSprite`, `SkippedSprite`, `PartialGuessedSprite`, `CanceledTurnSprite`), drawer/word summary, top-3 podium rankings, and `miniBoard:freeDraw.startButton` (Free Draw only).
- **Close Behavior:** Controlled strictly by room `gameState.status` (or Free Draw entry/activity state); returns `null` during active Free Draw.
- **Animation Owner:** Framer Motion (`AnimatePresence mode="wait"` + `motion.div` fade transitions, plus `GameTitle` drop-in `y: -150 -> 0, duration: 0.85s` on `PODIUM`) + inline CSS `<style>` keyframes in `MiniBoardOverlay.tsx` (`animate-podium-pop`, `animate-badge-pop`, `animate-crown-fall`, `animate-pop`, `animate-medal-shine`).
- **Verified Entrance / Exit Behavior:** Phase screens cross-fade (`initial={{ opacity: 0 }}` -> `animate={{ opacity: 1 }}` -> `exit={{ opacity: 0 }}`), with late-joiner podium animations gated by `timeLeft >= 13` and `roundEndAnimationKey`.
- **Layout & Direction Notes:** Localized via `miniBoard.ts` (`titles.*`, `freeDraw.*`, `waiting.*`, `choosing.*`, `roundEnd.*`, `podium.*`); dynamic drawer names and revealed answers use `dir="auto"`.
- **Localization Source & Status:** Localized in `src/i18n/locales/{en,ar}/miniBoard.ts`.

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
