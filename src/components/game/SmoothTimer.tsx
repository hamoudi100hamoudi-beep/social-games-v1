import React from 'react';

/**
 * Pure helper to compute effective maximum duration in seconds for a given room status.
 */
export const getMaxTimeForStatus = (status: string, fallbackMaxTime: number): number => {
  switch (status) {
    case "DRAWING":
    case "CHOOSING":
      return 100;
    case "ROUND_END":
      return 8;
    case "PODIUM":
    case "WAITING":
      return 15;
    default:
      return fallbackMaxTime > 0 ? fallbackMaxTime : 15;
  }
};

export interface SmoothTimerProps {
  status?: string;
  initialTimeLeft?: number;
  maxTime: number;
  isFullScreen?: boolean;
  socket?: any;
  gameState?: {
    status: string;
    timeLeft: number;
    currentWord?: string | null;
    phaseRemainingMs?: number;
    phaseEndsAt?: number;
  };
  phaseRemainingMs?: number;
  phaseEndsAt?: number;
}

/**
 * ⏱️ SmoothTimer — High-performance game countdown timer bar.
 * 
 * Features two specialized execution paths:
 * 1. Fixed-Duration Phases (ROUND_END: 8s, PODIUM: 15s):
 *    Uses server-authoritative phase deadline to launch a single unbroken CSS transition
 *    directly in the browser compositor (scaleX(0) over remaining ms). Ignores subsequent
 *    1-second ticks for the same phase to prevent phase-mismatch stutters.
 * 2. Dynamic Countdown Phases (DRAWING: 100s, CHOOSING: 15/100s):
 *    Uses 1-second interval ticking with isTimeJump detection to support dynamic score deductions
 *    and round extensions.
 */
export const SmoothTimer: React.FC<SmoothTimerProps> = React.memo(({
  status: propStatus,
  initialTimeLeft: propInitialTimeLeft,
  maxTime,
  isFullScreen = false,
  socket,
  gameState,
  phaseRemainingMs: propPhaseRemainingMs,
  phaseEndsAt: propPhaseEndsAt,
}) => {
  const currentStatus = propStatus || gameState?.status || "WAITING";
  const currentInitialTimeLeft = propInitialTimeLeft ?? gameState?.timeLeft ?? 0;

  const barRef = React.useRef<HTMLDivElement>(null);
  const statusRef = React.useRef(currentStatus);
  const lastSyncedStatusRef = React.useRef(currentStatus);
  const maxTimeRef = React.useRef(maxTime);
  const lastTimeLeftRef = React.useRef<number | null>(null);
  const lastColorClassRef = React.useRef<string>("");
  const isMountedRef = React.useRef(false);
  const rafIdRef = React.useRef<number | null>(null);

  // Tracks active fixed-duration phase key (e.g. "ROUND_END_1700000000000") to prevent re-triggering
  const activeFixedPhaseKeyRef = React.useRef<string | null>(null);
  const transitionCancelledRef = React.useRef<boolean>(false);

  // Stores the latest reliable fixed phase timestamp to allow instant, accurate resumption upon returning from background
  const lastFixedPhaseSnapshotRef = React.useRef<{
    status: "ROUND_END" | "PODIUM";
    phaseEndsAt: number;
    totalDurationMs: number;
    receivedPerfNow: number;
  } | null>(null);

  maxTimeRef.current = maxTime;

  // Attach transitioncancel listener to detect browser-cancelled CSS transitions (e.g. on modal mount)
  React.useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const handleTransitionCancel = (e: TransitionEvent) => {
      if (e.propertyName === 'transform') {
        transitionCancelledRef.current = true;
      }
    };
    bar.addEventListener('transitioncancel', handleTransitionCancel);
    return () => {
      bar.removeEventListener('transitioncancel', handleTransitionCancel);
    };
  }, []);

  React.useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  // Helper to compute and apply color class smoothly
  const applyColor = (pct: number, status: string) => {
    if (!barRef.current) return;
    let timerColorClass = "bg-[#FBBF24] shadow-[0_0_8px_rgba(251,191,36,0.5)]";
    if (status !== "DRAWING" && status !== "CHOOSING") {
      timerColorClass = "bg-[#1AD2FF] shadow-[0_0_8px_rgba(26,210,255,0.5)]";
    } else {
      if (pct <= 20) {
        timerColorClass = "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]";
      } else if (pct <= 50) {
        timerColorClass = "bg-[#F97316] shadow-[0_0_8px_rgba(249,115,22,0.5)]";
      }
    }

    if (lastColorClassRef.current !== timerColorClass) {
      lastColorClassRef.current = timerColorClass;
      barRef.current.className = `w-full h-full rounded-full ${timerColorClass}`;
    }
  };

  /**
   * 🛡️ Health check to detect if CSS transition stalled or was cancelled by DOM modal mounts/recalcs.
   */
  const checkTransitionHealth = React.useCallback((
    status: string,
    targetEndsAt?: number,
    targetRemainingMs?: number
  ): boolean => {
    if (transitionCancelledRef.current) {
      return false;
    }

    const bar = barRef.current;
    if (!bar) return true;

    const totalDurationMs = status === "ROUND_END" ? 8000 : 15000;
    let remMs = targetRemainingMs;
    if (remMs === undefined && targetEndsAt) {
      remMs = Math.max(0, targetEndsAt - Date.now());
    }
    if (remMs === undefined || remMs <= 300) {
      return true;
    }

    const expectedScale = Math.max(0, Math.min(1, remMs / totalDurationMs));

    try {
      const transform = window.getComputedStyle(bar).transform;
      if (transform && transform !== 'none' && transform.startsWith('matrix')) {
        const values = transform.slice(7, -1).split(',');
        if (values.length >= 1) {
          const currentScale = parseFloat(values[0].trim());
          if (!isNaN(currentScale)) {
            // If the bar visual scale is lagging behind expected scale by more than 0.08 (8%), it has stalled
            if (currentScale - expectedScale > 0.08) {
              return false;
            }
          }
        }
      }
    } catch {
      // Ignore errors reading computed style
    }

    return true;
  }, []);

  /**
   * 🚀 Fixed-Phase Path (ROUND_END: 8s, PODIUM: 15s):
   * Launches a SINGLE continuous CSS transition from current scale to 0 over phaseRemainingMs.
   */
  const startFixedPhaseTransition = (
    targetRemainingMs: number | undefined,
    targetEndsAt: number | undefined,
    status: string
  ) => {
    transitionCancelledRef.current = false;
    const bar = barRef.current;
    if (!bar) return;

    const totalDurationMs = status === "ROUND_END" ? 8000 : 15000;

    let remMs = targetRemainingMs;
    if (remMs === undefined && targetEndsAt) {
      remMs = Math.max(0, targetEndsAt - Date.now());
    }
    if (remMs === undefined) {
      const tl = currentInitialTimeLeft > 0 ? currentInitialTimeLeft : (status === "ROUND_END" ? 8 : 15);
      remMs = tl * 1000;
    }
    remMs = Math.max(0, Math.min(totalDurationMs, remMs));

    const startScale = Math.max(0, Math.min(1, remMs / totalDurationMs));

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    applyColor(startScale * 100, status);

    if (remMs <= 0) {
      bar.style.transition = "none";
      bar.style.transform = "scaleX(0)";
      lastTimeLeftRef.current = 0;
      return;
    }

    // 1. Immediately snap to starting ratio without transition
    bar.style.transition = "none";
    bar.style.transform = `scaleX(${startScale.toFixed(4)})`;
    lastTimeLeftRef.current = Math.ceil(remMs / 1000);

    // 2. Double rAF ensures browser flushes initial position before launching continuous CSS transition
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (!barRef.current) return;
        barRef.current.style.transition = `transform ${remMs}ms linear, background-color 0.5s ease, box-shadow 0.5s ease`;
        barRef.current.style.transform = "scaleX(0)";
      });
    });
  };

  /**
   * ⏱️ Dynamic Countdown Path (DRAWING: 100s, CHOOSING: 15/100s):
   * Updates CSS bar by 1-second increments with isTimeJump support for word deductions.
   */
  const syncDynamicBar = React.useCallback((timeLeft: number, status: string, isStatusChange: boolean = false) => {
    const bar = barRef.current;
    if (!bar) return;

    const mTime = getMaxTimeForStatus(status, maxTimeRef.current);
    const clampedTime = Math.max(0, Math.min(mTime, timeLeft));
    const currentScale = Math.max(0, Math.min(1, clampedTime / mTime));
    const currentPct = currentScale * 100;

    applyColor(currentPct, status);

    const isRealStatusChange = isStatusChange || status !== lastSyncedStatusRef.current;
    lastSyncedStatusRef.current = status;

    if (clampedTime <= 0) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      bar.style.transition = isRealStatusChange ? "none" : "transform 0.25s linear";
      bar.style.transform = "scaleX(0)";
      lastTimeLeftRef.current = 0;
      return;
    }

    // Suppress duplicate ticks for the exact same second during an active phase
    if (!isRealStatusChange && lastTimeLeftRef.current !== null && lastTimeLeftRef.current === clampedTime) {
      return;
    }

    const isTimeJump =
      lastTimeLeftRef.current !== null &&
      (clampedTime > lastTimeLeftRef.current || Math.abs(lastTimeLeftRef.current - 1 - clampedTime) > 2);

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (isRealStatusChange || isTimeJump || lastTimeLeftRef.current === null) {
      bar.style.transition = "none";
      bar.style.transform = `scaleX(${currentScale.toFixed(4)})`;
      lastTimeLeftRef.current = clampedTime;

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (!barRef.current) return;
          const targetScale = Math.max(0, (clampedTime - 1) / mTime);
          barRef.current.style.transition = "transform 1s linear, background-color 0.5s ease, box-shadow 0.5s ease";
          barRef.current.style.transform = `scaleX(${targetScale.toFixed(4)})`;
        });
      });
      return;
    }

    // Normal 1-second countdown interval
    const targetScale = Math.max(0, (clampedTime - 1) / mTime);
    bar.style.transition = "transform 1s linear, background-color 0.5s ease, box-shadow 0.5s ease";
    bar.style.transform = `scaleX(${targetScale.toFixed(4)})`;

    lastTimeLeftRef.current = clampedTime;
  }, []);

  // Sync on React render or phase change
  React.useEffect(() => {
    const isFixed = currentStatus === "ROUND_END" || currentStatus === "PODIUM";
    const statusChanged = currentStatus !== statusRef.current;
    statusRef.current = currentStatus;

    if (isFixed) {
      const totalDurationMs = currentStatus === "ROUND_END" ? 8000 : 15000;
      const endsAt = propPhaseEndsAt ?? gameState?.phaseEndsAt ?? (Date.now() + (propPhaseRemainingMs ?? gameState?.phaseRemainingMs ?? currentInitialTimeLeft * 1000));

      lastFixedPhaseSnapshotRef.current = {
        status: currentStatus as "ROUND_END" | "PODIUM",
        phaseEndsAt: endsAt,
        totalDurationMs,
        receivedPerfNow: performance.now(),
      };

      const phaseKey = endsAt ? `${currentStatus}_${endsAt}` : currentStatus;

      // Prevent restarting the continuous transition if already running for this exact phase instance,
      // UNLESS a health check detects the transition was cancelled or stalled by DOM mutations.
      if (activeFixedPhaseKeyRef.current === phaseKey) {
        if (!checkTransitionHealth(currentStatus, endsAt, propPhaseRemainingMs ?? gameState?.phaseRemainingMs)) {
          transitionCancelledRef.current = false;
          const remMs = propPhaseRemainingMs ?? gameState?.phaseRemainingMs;
          startFixedPhaseTransition(remMs, endsAt, currentStatus);
        }
        return;
      }

      activeFixedPhaseKeyRef.current = phaseKey;
      lastSyncedStatusRef.current = currentStatus;
      const remMs = propPhaseRemainingMs ?? gameState?.phaseRemainingMs;
      startFixedPhaseTransition(remMs, endsAt, currentStatus);
    } else {
      lastFixedPhaseSnapshotRef.current = null;
      activeFixedPhaseKeyRef.current = null;
      syncDynamicBar(currentInitialTimeLeft, currentStatus, statusChanged || !isMountedRef.current);
    }

    isMountedRef.current = true;
  }, [
    currentStatus,
    currentInitialTimeLeft,
    propPhaseRemainingMs,
    propPhaseEndsAt,
    gameState?.phaseRemainingMs,
    gameState?.phaseEndsAt,
    syncDynamicBar,
    checkTransitionHealth,
  ]);

  // Listen directly to timer_tick events
  React.useEffect(() => {
    if (!socket) return;
    const onTick = (data: {
      timeLeft: number;
      status: string;
      phaseRemainingMs?: number;
      phaseEndsAt?: number;
    }) => {
      const isFixed = data.status === "ROUND_END" || data.status === "PODIUM";

      if (isFixed) {
        const totalDurationMs = data.status === "ROUND_END" ? 8000 : 15000;
        const endsAt = data.phaseEndsAt || (data.phaseRemainingMs ? Date.now() + data.phaseRemainingMs : Date.now() + data.timeLeft * 1000);

        // Always keep the snapshot fresh on every tick even when animation is running
        lastFixedPhaseSnapshotRef.current = {
          status: data.status as "ROUND_END" | "PODIUM",
          phaseEndsAt: endsAt,
          totalDurationMs,
          receivedPerfNow: performance.now(),
        };

        const phaseKey = data.phaseEndsAt ? `${data.status}_${data.phaseEndsAt}` : data.status;

        // If continuous transition is already active for this phase instance, check if healthy.
        // If healthy, DO NOT restart or interrupt. If stalled/cancelled, self-recover smoothly.
        if (activeFixedPhaseKeyRef.current === phaseKey) {
          if (!checkTransitionHealth(data.status, endsAt, data.phaseRemainingMs)) {
            transitionCancelledRef.current = false;
            startFixedPhaseTransition(data.phaseRemainingMs, data.phaseEndsAt, data.status);
          }
          return;
        }

        activeFixedPhaseKeyRef.current = phaseKey;
        statusRef.current = data.status;
        lastSyncedStatusRef.current = data.status;
        startFixedPhaseTransition(data.phaseRemainingMs, data.phaseEndsAt, data.status);
      } else {
        lastFixedPhaseSnapshotRef.current = null;
        activeFixedPhaseKeyRef.current = null;
        const statusChanged = data.status !== statusRef.current;
        statusRef.current = data.status;
        syncDynamicBar(data.timeLeft, data.status, statusChanged);
      }
    };

    socket.on("timer_tick", onTick);
    return () => {
      socket.off("timer_tick", onTick);
    };
  }, [socket, syncDynamicBar, checkTransitionHealth]);

  // Instant accurate resumption when returning from background tab during a fixed phase
  React.useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      const currentStatus = statusRef.current;
      if (currentStatus !== "ROUND_END" && currentStatus !== "PODIUM") {
        return;
      }

      const snapshot = lastFixedPhaseSnapshotRef.current;
      if (!snapshot || snapshot.status !== currentStatus) {
        activeFixedPhaseKeyRef.current = null;
        return;
      }

      // Compute precise remaining time from authoritative deadline
      const remainingMs = Math.max(0, snapshot.phaseEndsAt - Date.now());
      const phaseKey = `${snapshot.status}_${snapshot.phaseEndsAt}`;

      if (remainingMs <= 50) {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        if (barRef.current) {
          barRef.current.style.transition = "none";
          barRef.current.style.transform = "scaleX(0)";
        }
        lastTimeLeftRef.current = 0;
        activeFixedPhaseKeyRef.current = phaseKey;
        return;
      }

      // Re-initialize CSS transition once from the exact remaining ratio down to 0
      activeFixedPhaseKeyRef.current = phaseKey;
      startFixedPhaseTransition(remainingMs, snapshot.phaseEndsAt, snapshot.status);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const effectiveMaxTime = getMaxTimeForStatus(currentStatus, maxTime || 100);
  const initialClamped = Math.max(0, Math.min(effectiveMaxTime, currentInitialTimeLeft));
  const initialScale = Math.max(0, Math.min(1, initialClamped / effectiveMaxTime));

  return (
    <div
      className={`w-full px-2 sm:px-3 py-1.5 shrink-0 flex items-center justify-center ${isFullScreen ? "bg-transparent" : "bg-game-primary-blue"}`}
    >
      <div className="w-full h-1.5 sm:h-2 bg-black/40 rounded-full overflow-hidden shadow-inner relative">
        <div
          ref={barRef}
          className="w-full h-full rounded-full bg-[#1AD2FF]"
          style={{
            transformOrigin: "left center",
            transform: `scaleX(${initialScale.toFixed(4)})`,
          }}
        />
      </div>
    </div>
  );
});

SmoothTimer.displayName = "SmoothTimer";

export default SmoothTimer;
