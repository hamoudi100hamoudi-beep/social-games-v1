import React, { useState, useRef, useImperativeHandle, useEffect, useCallback } from "react";
import { Check, AlertTriangle } from "lucide-react";

export interface HitData {
  id: string;
  name: string;
  isReport?: boolean;
}

export interface ExperimentalHitOverlayHandle {
  addHit: (hit: HitData) => void;
  clear: () => void;
}

interface ExperimentalHitOverlayProps {
  isDrawingMode: boolean;
}

interface SlotState {
  id: string;
  name: string;
  isReport: boolean;
  phase: "idle" | "enter" | "exit";
  timestamp: number;
}

const MAX_SLOTS = 3;
const DISPLAY_DURATION_MS = 4200; // time before exit slide-down starts
const EXIT_DURATION_MS = 300; // duration of exit transition

/**
 * 🛡️ ExperimentalHitOverlay
 * Lightweight, hardware-accelerated Hit Notification overlay for Experimental Draw.
 * - Sibling to IsolatedDrawingLayer (no parent re-renders in ExperimentalGameRoom).
 * - Fixed pool of 3 slots with FIFO ring-buffer (zero unbounded DOM growth).
 * - Visual parity with Normal Room: exact text-[#00E540] color, no shadow.
 * - Hardware-accelerated CSS keyframe transitions: transform (translateY/scale) + opacity.
 * - Zero Framer Motion, zero layout calculations, zero forced reflow.
 */
export const ExperimentalHitOverlay = React.memo(
  React.forwardRef<ExperimentalHitOverlayHandle, ExperimentalHitOverlayProps>(
    ({ isDrawingMode }, ref) => {
      const [slots, setSlots] = useState<SlotState[]>([
        { id: "", name: "", isReport: false, phase: "idle", timestamp: 0 },
        { id: "", name: "", isReport: false, phase: "idle", timestamp: 0 },
        { id: "", name: "", isReport: false, phase: "idle", timestamp: 0 },
      ]);

      const slotsRef = useRef(slots);
      slotsRef.current = slots;

      const exitTimersRef = useRef<(NodeJS.Timeout | number | null)[]>([null, null, null]);
      const idleTimersRef = useRef<(NodeJS.Timeout | number | null)[]>([null, null, null]);

      const clearSlotTimers = (index: number) => {
        if (exitTimersRef.current[index] !== null) {
          clearTimeout(exitTimersRef.current[index] as any);
          exitTimersRef.current[index] = null;
        }
        if (idleTimersRef.current[index] !== null) {
          clearTimeout(idleTimersRef.current[index] as any);
          idleTimersRef.current[index] = null;
        }
      };

      const clearAll = useCallback(() => {
        for (let i = 0; i < MAX_SLOTS; i++) {
          clearSlotTimers(i);
        }
        setSlots([
          { id: "", name: "", isReport: false, phase: "idle", timestamp: 0 },
          { id: "", name: "", isReport: false, phase: "idle", timestamp: 0 },
          { id: "", name: "", isReport: false, phase: "idle", timestamp: 0 },
        ]);
      }, []);

      // If drawing mode ends, clean up slots and timers immediately
      useEffect(() => {
        if (!isDrawingMode) {
          clearAll();
        }
      }, [isDrawingMode, clearAll]);

      // Cleanup timers on unmount
      useEffect(() => {
        return () => {
          for (let i = 0; i < MAX_SLOTS; i++) {
            clearSlotTimers(i);
          }
        };
      }, []);

      const addHit = useCallback((hit: HitData) => {
        const current = slotsRef.current;
        const now = Date.now();

        // 🛡️ Slot Allocation Strategy (Fixed Pool of 3):
        // 1. Look for an idle slot
        let targetIndex = current.findIndex((s) => s.phase === "idle");

        // 2. If all active, look for an exiting slot
        if (targetIndex === -1) {
          targetIndex = current.findIndex((s) => s.phase === "exit");
        }

        // 3. If all slots active in 'enter', replace the oldest slot (FIFO)
        if (targetIndex === -1) {
          let oldestTime = Infinity;
          for (let i = 0; i < MAX_SLOTS; i++) {
            if (current[i].timestamp < oldestTime) {
              oldestTime = current[i].timestamp;
              targetIndex = i;
            }
          }
        }

        if (targetIndex === -1) targetIndex = 0;

        // Clear existing timers for this slot
        clearSlotTimers(targetIndex);

        // Schedule exit transition (drops down and fades out)
        exitTimersRef.current[targetIndex] = setTimeout(() => {
          setSlots((prev) => {
            const next = [...prev];
            if (next[targetIndex] && next[targetIndex].phase !== "idle") {
              next[targetIndex] = { ...next[targetIndex], phase: "exit" };
            }
            return next;
          });
          exitTimersRef.current[targetIndex] = null;

          // Schedule cleanup to idle after exit transition finishes
          idleTimersRef.current[targetIndex] = setTimeout(() => {
            setSlots((prev) => {
              const next = [...prev];
              if (next[targetIndex] && next[targetIndex].phase === "exit") {
                next[targetIndex] = { ...next[targetIndex], phase: "idle" };
              }
              return next;
            });
            idleTimersRef.current[targetIndex] = null;
          }, EXIT_DURATION_MS);
        }, DISPLAY_DURATION_MS);

        // Activate slot with enter transition
        setSlots((prev) => {
          const next = [...prev];
          next[targetIndex] = {
            id: hit.id,
            name: hit.name,
            isReport: Boolean(hit.isReport),
            phase: "enter",
            timestamp: now,
          };
          return next;
        });
      }, []);

      useImperativeHandle(
        ref,
        () => ({
          addHit,
          clear: clearAll,
        }),
        [addHit, clearAll]
      );

      // If not drawing, don't render overlay
      if (!isDrawingMode) return null;

      // Filter active slots and sort by timestamp so newest appear in order
      const activeSlots = slots
        .map((slot, index) => ({ ...slot, originalIndex: index }))
        .filter((slot) => slot.phase !== "idle" && slot.name)
        .sort((a, b) => a.timestamp - b.timestamp);

      if (activeSlots.length === 0) return null;

      return (
        <>
          <style>{`
            @keyframes expHitEnter {
              0% {
                opacity: 0;
                transform: translateY(14px) scale(0.9);
              }
              100% {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
            }
            @keyframes expHitExit {
              0% {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
              100% {
                opacity: 0;
                transform: translateY(14px) scale(0.9);
              }
            }
            .exp-hit-enter {
              animation: expHitEnter 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
              will-change: transform, opacity;
            }
            .exp-hit-exit {
              animation: expHitExit 300ms cubic-bezier(0.4, 0, 1, 1) forwards;
              will-change: transform, opacity;
            }
          `}</style>
          <div
            className="absolute bottom-[90px] sm:bottom-[100px] left-1/2 -translate-x-1/2 z-[110] flex flex-col justify-end items-center pointer-events-none gap-0.5 overflow-visible h-auto max-h-56 w-full max-w-full"
            style={{ contain: "layout style" }}
            dir="ltr"
          >
            {activeSlots.map((slot) => (
              <div
                key={`${slot.originalIndex}-${slot.id}`}
                className={`flex items-center justify-center gap-1.5 font-bold text-[15px] whitespace-nowrap bg-transparent will-change-transform ${
                  slot.phase === "exit" ? "exp-hit-exit" : "exp-hit-enter"
                } ${slot.isReport ? "text-red-500" : "text-[#00E540]"}`}
              >
                {slot.isReport ? (
                  <AlertTriangle size={16} className="text-red-500 shrink-0" />
                ) : (
                  <Check size={16} strokeWidth={4} className="shrink-0" />
                )}
                <span className="truncate max-w-[150px] sm:max-w-[200px] text-center" dir="ltr">
                  {slot.name}
                </span>
                <span>{slot.isReport ? "reported!" : "hit!"}</span>
              </div>
            ))}
          </div>
        </>
      );
    }
  )
);

ExperimentalHitOverlay.displayName = "ExperimentalHitOverlay";
