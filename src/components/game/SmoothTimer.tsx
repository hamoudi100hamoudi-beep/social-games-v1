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
 * Helper to read current computed visual scaleX of the timer bar.
 */
const readComputedScaleX = (bar: HTMLDivElement | null): number => {
  if (!bar) return 1;
  try {
    const transform = window.getComputedStyle(bar).transform;
    if (transform && transform !== 'none' && transform.startsWith('matrix')) {
      const values = transform.slice(7, -1).split(',');
      if (values.length >= 1) {
        const val = parseFloat(values[0].trim());
        if (!isNaN(val)) {
          return Math.max(0, Math.min(1, val));
        }
      }
    }
  } catch {
    // fallback
  }
  return 1;
};

/**
 * ⏱️ SmoothTimer — High-performance game countdown timer bar.
 * 
 * Features two specialized execution paths:
 * 1. Fixed-Duration Phases (ROUND_END: 8s, PODIUM: 15s):
 *    Single-owner, deadline-driven CSS transition directly in browser compositor.
 *    Self-recovers seamlessly without visual jumps if DOM modal mounts pause CSS transitions.
 * 2. Dynamic Countdown Phases (DRAWING: 100s, CHOOSING: 15/100s):
 *    Uses 1-second interval ticking with isTimeJump detection.
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

  // Stores last visual scale & timestamp for smart health checks
  const lastHealthCheckRef = React.useRef<{
    timestamp: number;
    scale: number;
  } | null>(null);

  // Stores the latest reliable fixed phase timestamp to allow instant, accurate resumption upon returning from background
  const lastFixedPhaseSnapshotRef = React.useRef<{
    status: "ROUND_END" | "PODIUM";
    phaseEndsAt: number;
    totalDurationMs: number;
    receivedPerfNow: number;
  } | null>(null);

  maxTimeRef.current = maxTime;

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
   * 🩹 Seamless Recovery for Fixed Phases:
   * Restarts transition FROM the current visual position to scaleX(0) over remainingMs.
   * NEVER resets startScale to (remMs / totalDurationMs), preventing pops/jumps.
   */
  const recoverFixedPhaseTransition = React.useCallback((
    remMs: number,
    status: string
  ) => {
    const bar = barRef.current;
    if (!bar) return;

    const currentScale = readComputedScaleX(bar);

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    applyColor(currentScale * 100, status);

    if (remMs <= 50 || currentScale <= 0.005) {
      bar.style.transition = "none";
      bar.style.transform = "scaleX(0)";
      lastTimeLeftRef.current = 0;
      return;
    }

    // Freeze at current visual scale
    bar.style.transition = "none";
    bar.style.transform = `scaleX(${currentScale.toFixed(4)})`;

    // Update health tracking sample to recovered position
    lastHealthCheckRef.current = {
      timestamp: performance.now(),
      scale: currentScale,
    };

    // Double rAF ensures browser flushes current position before animating down to 0
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (!barRef.current) return;
        barRef.current.style.transition = `transform ${remMs}ms linear, background-color 0.5s ease, box-shadow 0.5s ease`;
        barRef.current.style.transform = "scaleX(0)";
      });
    });
  }, []);

  /**
   * 🛡️ Health check: evaluates visual progress between timer_tick events.
   * If stalled (< 1.5% movement in >=600ms), triggers smooth recovery from current position.
   */
  const checkAndRecoverFixedPhase = React.useCallback((
    status: string,
    targetEndsAt?: number,
    targetRemainingMs?: number
  ) => {
    const bar = barRef.current;
    if (!bar) return;

    const endsAt = targetEndsAt || (targetRemainingMs ? Date.now() + targetRemainingMs : undefined);
    const remMs = targetRemainingMs ?? (endsAt ? Math.max(0, endsAt - Date.now()) : undefined);

    if (remMs === undefined || remMs <= 50) {
      return;
    }

    const now = performance.now();
    const currentScale = readComputedScaleX(bar);

    if (!lastHealthCheckRef.current) {
      lastHealthCheckRef.current = { timestamp: now, scale: currentScale };
      return;
    }

    const elapsedMs = now - lastHealthCheckRef.current.timestamp;
    if (elapsedMs < 600) {
      return;
    }

    const actualScaleDelta = lastHealthCheckRef.current.scale - currentScale;
    lastHealthCheckRef.current = { timestamp: now, scale: currentScale };

    // If visual scale moved less than 1.5% despite >=600ms passing, the transition was interrupted
    if (actualScaleDelta < 0.015 && remMs > 300 && currentScale > 0.02) {
      recoverFixedPhaseTransition(remMs, status);
    }
  }, [recoverFixedPhaseTransition]);

  /**
   * 🚀 Initial Fixed-Phase Launch (ROUND_END: 8s, PODIUM: 15s):
   * Launches a SINGLE continuous CSS transition from target ratio to 0 over phaseRemainingMs.
   */
  const startFixedPhaseTransition = (
    targetRemainingMs: number | undefined,
    targetEndsAt: number | undefined,
    status: string
  ) => {
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

    lastHealthCheckRef.current = {
      timestamp: performance.now(),
      scale: startScale,
    };

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

      // Prevent restarting the transition for the same phase key, unless health check detects a stall
      if (activeFixedPhaseKeyRef.current === phaseKey) {
        checkAndRecoverFixedPhase(currentStatus, endsAt, propPhaseRemainingMs ?? gameState?.phaseRemainingMs);
        return;
      }

      activeFixedPhaseKeyRef.current = phaseKey;
      lastSyncedStatusRef.current = currentStatus;
      const remMs = propPhaseRemainingMs ?? gameState?.phaseRemainingMs;
      startFixedPhaseTransition(remMs, endsAt, currentStatus);
    } else {
      lastFixedPhaseSnapshotRef.current = null;
      activeFixedPhaseKeyRef.current = null;
      lastHealthCheckRef.current = null;
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
    checkAndRecoverFixedPhase,
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

        lastFixedPhaseSnapshotRef.current = {
          status: data.status as "ROUND_END" | "PODIUM",
          phaseEndsAt: endsAt,
          totalDurationMs,
          receivedPerfNow: performance.now(),
        };

        const phaseKey = data.phaseEndsAt ? `${data.status}_${data.phaseEndsAt}` : data.status;

        if (activeFixedPhaseKeyRef.current === phaseKey) {
          checkAndRecoverFixedPhase(data.status, endsAt, data.phaseRemainingMs);
          return;
        }

        activeFixedPhaseKeyRef.current = phaseKey;
        statusRef.current = data.status;
        lastSyncedStatusRef.current = data.status;
        startFixedPhaseTransition(data.phaseRemainingMs, data.phaseEndsAt, data.status);
      } else {
        lastFixedPhaseSnapshotRef.current = null;
        activeFixedPhaseKeyRef.current = null;
        lastHealthCheckRef.current = null;
        const statusChanged = data.status !== statusRef.current;
        statusRef.current = data.status;
        syncDynamicBar(data.timeLeft, data.status, statusChanged);
      }
    };

    socket.on("timer_tick", onTick);
    return () => {
      socket.off("timer_tick", onTick);
    };
  }, [socket, syncDynamicBar, checkAndRecoverFixedPhase]);

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

      // Resume smoothly from current position to scaleX(0) over remainingMs
      activeFixedPhaseKeyRef.current = phaseKey;
      recoverFixedPhaseTransition(remainingMs, snapshot.status);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [recoverFixedPhaseTransition]);

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
          }}
        />
      </div>
    </div>
  );
});

SmoothTimer.displayName = "SmoothTimer";

export default SmoothTimer;
