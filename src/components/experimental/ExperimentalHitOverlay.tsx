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
  visible: boolean;
  timestamp: number;
}

const MAX_SLOTS = 3;
const DISPLAY_DURATION_MS = 4500;

/**
 * 🛡️ ExperimentalHitOverlay
 * Isolated Notification Layer for Experimental Draw.
 * - Sibling to IsolatedDrawingLayer (no parent re-renders).
 * - Fixed pool of 3 pre-mounted slots (no continuous DOM creation/destruction).
 * - Hardware-accelerated transitions (opacity/transform only, no layout recalculations).
 * - Bounded FIFO handling for burst correct guesses (prevents render storms on low-end devices).
 */
export const ExperimentalHitOverlay = React.memo(
  React.forwardRef<ExperimentalHitOverlayHandle, ExperimentalHitOverlayProps>(
    ({ isDrawingMode }, ref) => {
      const [slots, setSlots] = useState<SlotState[]>([
        { id: "", name: "", isReport: false, visible: false, timestamp: 0 },
        { id: "", name: "", isReport: false, visible: false, timestamp: 0 },
        { id: "", name: "", isReport: false, visible: false, timestamp: 0 },
      ]);

      const slotsRef = useRef(slots);
      slotsRef.current = slots;

      const timersRef = useRef<(NodeJS.Timeout | number | null)[]>([null, null, null]);

      const clearTimer = (index: number) => {
        if (timersRef.current[index] !== null) {
          clearTimeout(timersRef.current[index] as any);
          timersRef.current[index] = null;
        }
      };

      const clearAll = useCallback(() => {
        for (let i = 0; i < MAX_SLOTS; i++) {
          clearTimer(i);
        }
        setSlots([
          { id: "", name: "", isReport: false, visible: false, timestamp: 0 },
          { id: "", name: "", isReport: false, visible: false, timestamp: 0 },
          { id: "", name: "", isReport: false, visible: false, timestamp: 0 },
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
            clearTimer(i);
          }
        };
      }, []);

      const addHit = useCallback((hit: HitData) => {
        const current = slotsRef.current;
        const now = Date.now();

        // 🛡️ Slot Allocation Strategy (Fixed Pool of 3):
        // 1. First look for an inactive slot
        let targetIndex = current.findIndex((s) => !s.visible);

        // 2. If all 3 slots are occupied (burst scenario), replace the oldest slot (FIFO)
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

        // Clear any previous timer on the chosen slot
        clearTimer(targetIndex);

        // Schedule auto-dismiss for this slot
        timersRef.current[targetIndex] = setTimeout(() => {
          setSlots((prev) => {
            const next = [...prev];
            if (next[targetIndex]) {
              next[targetIndex] = { ...next[targetIndex], visible: false };
            }
            return next;
          });
          timersRef.current[targetIndex] = null;
        }, DISPLAY_DURATION_MS);

        // Update target slot
        setSlots((prev) => {
          const next = [...prev];
          next[targetIndex] = {
            id: hit.id,
            name: hit.name,
            isReport: Boolean(hit.isReport),
            visible: true,
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

      // Sort visible slots by timestamp ascending so they stack chronologically
      const activeSlots = slots
        .map((slot, index) => ({ ...slot, originalIndex: index }))
        .filter((slot) => slot.visible && slot.name)
        .sort((a, b) => a.timestamp - b.timestamp);

      if (activeSlots.length === 0) return null;

      return (
        <div
          className="absolute bottom-[90px] sm:bottom-[100px] left-1/2 -translate-x-1/2 z-[110] flex flex-col justify-end items-center pointer-events-none gap-1 overflow-visible h-auto max-h-56 w-full max-w-full"
          style={{ contain: "layout style" }}
          dir="ltr"
        >
          {activeSlots.map((slot) => (
            <div
              key={slot.originalIndex}
              style={{
                textShadow: "0 1px 3px rgba(0,0,0,0.7)",
              }}
              className={`flex items-center justify-center gap-1.5 font-bold text-[15px] whitespace-nowrap bg-transparent transition-all duration-300 ease-out will-change-transform opacity-100 translate-y-0 scale-100 ${
                slot.isReport ? "text-red-500" : "text-[#00E540]"
              }`}
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
      );
    }
  )
);

ExperimentalHitOverlay.displayName = "ExperimentalHitOverlay";
