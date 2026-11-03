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
  gameState?: { status: string; timeLeft: number; currentWord?: string | null };
}

/**
 * ⏱️ SmoothTimer — High-performance game countdown timer bar.
 * Uses transform: scaleX() with double-rAF initialization to guarantee zero-flicker transitions
 * and updates CSS smoothly once per second via direct socket timer_tick events without triggering
 * React component re-renders.
 */
export const SmoothTimer: React.FC<SmoothTimerProps> = React.memo(({
  status: propStatus,
  initialTimeLeft: propInitialTimeLeft,
  maxTime,
  isFullScreen = false,
  socket,
  gameState,
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

  // Synchronize CSS bar with target time using transform: scaleX() and transform-origin: left center
  const syncBar = React.useCallback((timeLeft: number, status: string, isStatusChange: boolean = false) => {
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
      // 1. Immediately snap to current ratio without transition
      bar.style.transition = "none";
      bar.style.transform = `scaleX(${currentScale.toFixed(4)})`;
      lastTimeLeftRef.current = clampedTime;

      // 2. Double rAF ensures the browser flushes the initial transform before starting the CSS transition
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

  // Reset or initialize on status or phase change
  React.useEffect(() => {
    const statusChanged = currentStatus !== statusRef.current;
    statusRef.current = currentStatus;
    syncBar(currentInitialTimeLeft, currentStatus, statusChanged || !isMountedRef.current);
    isMountedRef.current = true;
  }, [currentStatus, currentInitialTimeLeft, syncBar]);

  // Listen directly to timer_tick to drive the CSS transition once per second (0% CPU rAF loop)
  React.useEffect(() => {
    if (!socket) return;
    const onTick = (data: { timeLeft: number; status: string }) => {
      const statusChanged = data.status !== statusRef.current;
      statusRef.current = data.status;
      syncBar(data.timeLeft, data.status, statusChanged);
    };

    socket.on("timer_tick", onTick);
    return () => {
      socket.off("timer_tick", onTick);
    };
  }, [socket, syncBar]);

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
