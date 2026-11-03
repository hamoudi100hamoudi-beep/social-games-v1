# Implementation Plan - BATCH-6A-3: Extract Player Profile & Room Alert Modals

## Summary
Extract `PlayerProfileModal` and `RoomAlertModals` from `src/components/experimental/ExperimentalGameRoom.tsx` into clean, modular presentation components inside `src/components/game/modals/`. This continues Phase 6A decomposition of large files while strictly preserving state management, socket handlers, timer invariants, and room lifecycles within `ExperimentalGameRoom.tsx`.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Zero Feature / Logic Loss**: All modal state variables (`selectedProfilePlayer`, `votekicks`, `blockedUsers`, `showCooldownWarning`, `isBanned`, `isNicknameTaken`, `isRoomFull`, `isAuthStoreFull`, `isJoinTimedOut`), socket emissions, and `safeLocalStorage.removeItem("gartic_player_room")` cleanup remain inside `ExperimentalGameRoom.tsx`.
> - **Zero Timer / Portal Changes**: `SmoothTimer.tsx`, portal refs (`drawerTimerSlotEl`, `spectatorTimerSlotEl`), transition timers, `server/rooms.ts`, and `TIMER-FREEZE-1` open issue note are untouched.
> - **Component Cleanliness**: The new components will be pure presentation UI receiving explicit props and callbacks without adding extra hooks or duplicate state.

---

## 1. Overview & Core Concept

- **What It Does**: Extracts 7 inline modal dialogs (Player Profile + 6 Room Alerts) into 2 dedicated components: `PlayerProfileModal.tsx` and `RoomAlertModals.tsx`.
- **Target Audience**: Players interacting with player profiles (blocking/votekicking) or viewing room connection/status alerts (cooldown, kicked, nickname taken, room full, server capacity full, join timeout).
- **Key Value**: Reduces line count and JSX clutter in `ExperimentalGameRoom.tsx` by ~360 lines, making the room orchestrator easier to maintain and test.

---

## 2. User Experience & Visual Design

- **Visual Fidelity**: All styling, Arabic/English text, animations (motion shake/vibration for warning triangles), Lucide icons, and `CinematicModal` configurations remain 100% identical.
- **Player Profile Modal**: Displays player avatar, name, self-account badge or Block/Unblock & Votekick/Remove Vote buttons with state feedback (`isBlocked`, `alreadyVoted`).
- **Room Alert Modals**: Renders alert dialogs (`SLOW DOWN`, `KICKED`, `ERROR - Name taken`, `ERROR - Room full`, `SERVER FULL`, `TIMEOUT`) preserving exact backdrop overlays, warning icons, and button callbacks.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Extract 6 Room Alerts into single `RoomAlertModals.tsx` container component**
  - *Chosen Approach*: Group the 6 alert modals into one `RoomAlertModals.tsx` wrapper component to avoid creating 6 micro-files for static alert dialogs.
  - *Why*: Streamlines imports while cleanly isolating all alert presentation JSX from `ExperimentalGameRoom.tsx`.
  - *Alternatives Considered*: Creating 6 separate files (`CooldownWarningModal.tsx`, `KickedModal.tsx`, etc.), which would add file overhead without additional structural benefit.

- **Decision 2: Pass explicit handlers instead of mutating room state inside child modals**
  - *Chosen Approach*: Pass granular callbacks (`onClose`, `onLeave`, `onClearRoomStorageAndLeave`, `onToggleBlock`, `onToggleVoteKick`) via props.
  - *Why*: Preserves `ExperimentalGameRoom` as the single source of truth for room lifecycle and player identity.

---

## 4. Technical Architecture & Data Strategy

### System Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ExperimentalGameRoom.tsx (Orchestrator)                 │
│                                                                             │
│  State: selectedProfilePlayer, votekicks, blockedUsers, showCooldownWarning, │
│         isBanned, isNicknameTaken, isRoomFull, isAuthStoreFull, isJoinTimedOut │
│  Handlers: handleToggleBlock, handleToggleVoteKick, onLeave, socket emits   │
└──────────────┬──────────────────────────────────────────────┬───────────────┘
               │                                              │
               ▼                                              ▼
┌───────────────────────────────┐              ┌───────────────────────────────┐
│     PlayerProfileModal.tsx    │              │     RoomAlertModals.tsx       │
│                               │              │                               │
│  - Player identity & avatar   │              │  1. CooldownWarningModal      │
│  - Self account indicator     │              │  2. KickedOutModal (isBanned) │
│  - Block / Unblock button     │              │  3. NicknameTakenModal        │
│  - Votekick / Unvote button   │              │  4. RoomFullModal             │
│                               │              │  5. AuthStoreFullModal        │
│                               │              │  6. JoinTimedOutModal         │
└───────────────────────────────┘              └───────────────────────────────┘
```

### Proposed File Changes & Interfaces

#### 1. `src/components/game/modals/PlayerProfileModal.tsx`
```typescript
interface PlayerProfileModalProps {
  isOpen: boolean;
  player: {
    id: string;
    name: string;
    avatar: string;
    persistentId?: string;
  } | null;
  persistentPlayerId: string;
  socketId?: string;
  isSelf: boolean;
  alreadyVoted: boolean;
  isBlocked: boolean;
  onClose: () => void;
  onToggleBlock: () => void;
  onToggleVoteKick: () => void;
}
```

#### 2. `src/components/game/modals/RoomAlertModals.tsx`
```typescript
interface RoomAlertModalsProps {
  // Cooldown Warning
  showCooldownWarning: boolean;
  onCloseCooldownWarning: () => void;
  FULL_DRAWING_ISOLATION_TEST: boolean;
  isDrawingMode: boolean;

  // Kicked / Banned
  isBanned: boolean;
  onLeaveFromBanned: () => void;

  // Nickname Taken
  isNicknameTaken: boolean;
  onLeaveFromNicknameTaken: () => void;

  // Room Full
  isRoomFull: boolean;
  onLeaveFromRoomFull: () => void;

  // Auth Store / Server Full
  isAuthStoreFull: boolean;
  onLeaveFromAuthStoreFull: () => void;

  // Join Timeout
  isJoinTimedOut: boolean;
  onLeaveFromJoinTimeout: () => void;
}
```

#### 3. Updates to `ExperimentalGameRoom.tsx`
- Import `PlayerProfileModal` and `RoomAlertModals` from `../game/modals/`.
- Replace lines 2275-2356 (`CinematicModal` profile block) with `<PlayerProfileModal ... />`.
- Replace lines 2358-2635 (Cooldown, Banned, NicknameTaken, RoomFull, AuthStoreFull, JoinTimedOut modals) with `<RoomAlertModals ... />`.

#### 4. Documentation Updates
- Update `ARCHITECTURE_DECOMPOSITION_PLAN.md` & `REFACTORING_ROADMAP.md` recording BATCH-6A-3 details, build status, and designating `BATCH-5A-1` as the next scheduled batch.

---

## Verification Plan

1. Run `npx tsc --noEmit` via `lint_applet` to confirm 0 type errors.
2. Run `npm run build` via `compile_applet` to verify successful compilation.
3. Verify all modal callbacks and state parameters match original behavior.
