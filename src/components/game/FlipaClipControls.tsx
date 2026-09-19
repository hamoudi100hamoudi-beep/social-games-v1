import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ToolType } from '../../types/draw';
import ColorWheelModal from './ColorWheelModal';

interface FlipaClipControlsProps {
  tool: ToolType;
  color: string;
  currentWidth: number;
  currentOpacity: number;
  baseScale: number;
  onWidthChange: (width: number) => void;
  onOpacityChange: (opacity: number) => void;
  isFreeDraw?: boolean;
  onColorChange?: (color: string) => void;
}

interface DragState {
  type: 'size' | 'opacity';
  startY: number;
  clientX: number;
  clientY: number;
  currentVal: number;
}

const EMIT_THROTTLE_MS = 30; // ~33Hz safe throttle for canvas / drawing board state re-renders

export const FlipaClipControls: React.FC<FlipaClipControlsProps> = ({
  tool,
  color,
  currentWidth,
  currentOpacity,
  baseScale: _baseScale,
  onWidthChange,
  onOpacityChange,
  isFreeDraw = false,
  onColorChange,
}) => {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  // Stable callback refs
  const onWidthChangeRef = useRef(onWidthChange);
  onWidthChangeRef.current = onWidthChange;
  const onOpacityChangeRef = useRef(onOpacityChange);
  onOpacityChangeRef.current = onOpacityChange;
  const onColorChangeRef = useRef(onColorChange);
  onColorChangeRef.current = onColorChange;

  // Throttled data update refs (~30ms) for low-end device optimization
  const lastWidthEmitTimeRef = useRef<number>(0);
  const pendingWidthRef = useRef<number | null>(null);
  const rafWidthIdRef = useRef<number | null>(null);

  const lastOpacityEmitTimeRef = useRef<number>(0);
  const pendingOpacityRef = useRef<number | null>(null);
  const rafOpacityIdRef = useRef<number | null>(null);

  // Active window cleanup tracker to prevent dangling listeners
  const activeCleanupRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeCleanupRef.current) {
        activeCleanupRef.current();
        activeCleanupRef.current = null;
      }
      if (rafWidthIdRef.current) {
        cancelAnimationFrame(rafWidthIdRef.current);
        rafWidthIdRef.current = null;
      }
      if (rafOpacityIdRef.current) {
        cancelAnimationFrame(rafOpacityIdRef.current);
        rafOpacityIdRef.current = null;
      }
    };
  }, []);

  // Max width according to tool
  const maxWidth = tool === 'eraser' ? 120 : 50;
  const minWidth = 1;

  // 1. Live Drag for Brush Size Circle
  const handleSizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (activeCleanupRef.current) {
      activeCleanupRef.current();
    }

    const startVal = currentWidth;
    let startY = e.clientY;
    const sensitivity = 2.2;

    setDragState({
      type: 'size',
      startY,
      clientX: e.clientX,
      clientY: e.clientY,
      currentVal: startVal,
    });

    const onWindowMove = (moveEv: PointerEvent) => {
      moveEv.preventDefault();

      const maxDeltaY = (maxWidth - startVal) * sensitivity;
      const minDeltaY = (minWidth - startVal) * sensitivity;

      // Dynamic zero-deadzone boundary clamping on reversal
      if (startY - moveEv.clientY > maxDeltaY) {
        startY = moveEv.clientY + maxDeltaY;
      } else if (startY - moveEv.clientY < minDeltaY) {
        startY = moveEv.clientY + minDeltaY;
      }

      const deltaY = startY - moveEv.clientY;
      const delta = Math.round(deltaY / sensitivity);
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startVal + delta));

      // Visual indicator follows finger immediately (GPU transform)
      setDragState({
        type: 'size',
        startY,
        clientX: moveEv.clientX,
        clientY: moveEv.clientY,
        currentVal: newWidth,
      });

      // Data update throttled (~30ms) to avoid locking CPU during rapid swipes
      pendingWidthRef.current = newWidth;
      const now = performance.now();
      const elapsed = now - lastWidthEmitTimeRef.current;

      if (elapsed >= EMIT_THROTTLE_MS) {
        lastWidthEmitTimeRef.current = now;
        if (rafWidthIdRef.current) {
          cancelAnimationFrame(rafWidthIdRef.current);
          rafWidthIdRef.current = null;
        }
        onWidthChangeRef.current(newWidth);
      } else if (!rafWidthIdRef.current) {
        rafWidthIdRef.current = requestAnimationFrame(() => {
          rafWidthIdRef.current = null;
          if (pendingWidthRef.current !== null) {
            lastWidthEmitTimeRef.current = performance.now();
            onWidthChangeRef.current(pendingWidthRef.current);
          }
        });
      }
    };

    const onWindowUp = () => {
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
      activeCleanupRef.current = null;

      setDragState(null);

      if (rafWidthIdRef.current) {
        cancelAnimationFrame(rafWidthIdRef.current);
        rafWidthIdRef.current = null;
      }
      if (pendingWidthRef.current !== null) {
        const finalWidth = pendingWidthRef.current;
        pendingWidthRef.current = null;
        onWidthChangeRef.current(finalWidth);
      }
    };

    activeCleanupRef.current = () => {
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
    };

    window.addEventListener('pointermove', onWindowMove, { passive: false });
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowUp);
  };

  // 2. Live Drag & Tap Handler for Opacity Square
  const handleOpacityPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (activeCleanupRef.current) {
      activeCleanupRef.current();
    }

    const startTime = Date.now();
    const startX = e.clientX;
    let startY = e.clientY;
    const startOpacity = currentOpacity;
    const minOpacity = 0.1;
    const maxOpacity = 1.0;
    const sensitivity = 140;
    let isDragging = false;

    // Show visual indicator immediately on pointerdown (current value) without changing the value
    setDragState({
      type: 'opacity',
      startY,
      clientX: e.clientX,
      clientY: e.clientY,
      currentVal: startOpacity,
    });

    const onWindowMove = (moveEv: PointerEvent) => {
      const distX = Math.abs(moveEv.clientX - startX);
      const distY = Math.abs(moveEv.clientY - startY);

      if (!isDragging && distY >= 6 && distY > distX * 0.7) {
        isDragging = true;
      }

      if (isDragging) {
        moveEv.preventDefault();

        const maxDeltaY = (maxOpacity - startOpacity) * sensitivity;
        const minDeltaY = (minOpacity - startOpacity) * sensitivity;

        // Dynamic zero-deadzone boundary clamping on reversal
        if (startY - moveEv.clientY > maxDeltaY) {
          startY = moveEv.clientY + maxDeltaY;
        } else if (startY - moveEv.clientY < minDeltaY) {
          startY = moveEv.clientY + minDeltaY;
        }

        const deltaY = startY - moveEv.clientY;
        const delta = deltaY / sensitivity;
        const newOpacity = Math.max(minOpacity, Math.min(maxOpacity, Number((startOpacity + delta).toFixed(2))));

        // Visual indicator follows finger immediately
        setDragState({
          type: 'opacity',
          startY,
          clientX: moveEv.clientX,
          clientY: moveEv.clientY,
          currentVal: newOpacity,
        });

        // Data update throttled (~30ms) for smooth performance
        pendingOpacityRef.current = newOpacity;
        const now = performance.now();
        const elapsed = now - lastOpacityEmitTimeRef.current;

        if (elapsed >= EMIT_THROTTLE_MS) {
          lastOpacityEmitTimeRef.current = now;
          if (rafOpacityIdRef.current) {
            cancelAnimationFrame(rafOpacityIdRef.current);
            rafOpacityIdRef.current = null;
          }
          onOpacityChangeRef.current(newOpacity);
        } else if (!rafOpacityIdRef.current) {
          rafOpacityIdRef.current = requestAnimationFrame(() => {
            rafOpacityIdRef.current = null;
            if (pendingOpacityRef.current !== null) {
              lastOpacityEmitTimeRef.current = performance.now();
              onOpacityChangeRef.current(pendingOpacityRef.current);
            }
          });
        }
      }
    };

    const onWindowUp = () => {
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
      activeCleanupRef.current = null;

      if (!isDragging && Date.now() - startTime < 350) {
        // Quick tap: toggle color picker modal
        if (isFreeDraw) {
          setIsColorPickerOpen(prev => !prev);
        }
      }

      setDragState(null);

      if (rafOpacityIdRef.current) {
        cancelAnimationFrame(rafOpacityIdRef.current);
        rafOpacityIdRef.current = null;
      }
      if (pendingOpacityRef.current !== null) {
        const finalOp = pendingOpacityRef.current;
        pendingOpacityRef.current = null;
        onOpacityChangeRef.current(finalOp);
      }
    };

    activeCleanupRef.current = () => {
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
    };

    window.addEventListener('pointermove', onWindowMove, { passive: false });
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowUp);
  };

  // Proportional dot calculation (bounds: 4px min, 22px max)
  const widthRatio = Math.max(0, Math.min(1, (currentWidth - minWidth) / (maxWidth - minWidth)));
  const buttonDotSize = 4 + widthRatio * 18;

  // Proportional preview circle for drag portal (bounds: 4px min, 44px max)
  const displayVal = dragState ? dragState.currentVal : (dragState === null ? currentWidth : currentOpacity);
  const dragRatio = dragState?.type === 'size'
    ? Math.max(0, Math.min(1, (displayVal - minWidth) / (maxWidth - minWidth)))
    : 0;
  const floatingCircleSize = 4 + dragRatio * 40;

  // Opacity display color
  const activeOpacityColor = tool === 'eraser' ? '#FFFFFF' : color;
  const isBucket = tool === 'bucket';

  return (
    <div className="relative select-none touch-none" dir="ltr">
      {/* 1. FlipaClip Main Buttons on the Right */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Brush Size Circle Button */}
        {!isBucket && (
          <div
            onPointerDown={handleSizePointerDown}
            title="اضغط واسحب للأعلى أو الأسفل لتغيير حجم الخط"
            className={`w-[38px] h-[38px] sm:w-[42px] sm:h-[42px] rounded-full bg-[#0B3B75]/95 border-2 flex items-center justify-center cursor-ns-resize active:scale-95 touch-none ${
              dragState?.type === 'size'
                ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/50 scale-105'
                : 'border-white/30 hover:border-white/60'
            }`}
          >
            {/* Inner fixed white dot */}
            <div
              className="rounded-full bg-white pointer-events-none"
              style={{
                width: `${buttonDotSize}px`,
                height: `${buttonDotSize}px`,
              }}
            />
          </div>
        )}

        {/* Opacity Square Button (Styled identically to palette color squares) */}
        <div
          onPointerDown={handleOpacityPointerDown}
          title={isFreeDraw ? "اضغط لفتح عجلة الألوان، أو اسحب للأعلى والأسفل لتغيير الكثافة" : "اضغط واسحب للأعلى أو الأسفل لتغيير كثافة وشفافية اللون"}
          className={`w-[38px] h-[38px] sm:w-[42px] sm:h-[42px] rounded-[8px] sm:rounded-[10px] bg-[#0B3B75]/95 border-2 p-[4px] flex items-center justify-center cursor-pointer active:scale-95 touch-none transition-all ${
            isColorPickerOpen
              ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/50 scale-105'
              : dragState?.type === 'opacity'
              ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/50 scale-105'
              : 'border-white/30 hover:border-white/60'
          }`}
        >
          {/* Inner Clean Color Swatch */}
          <div
            className="w-full h-full rounded-[5px] sm:rounded-[6px] border border-black/20 pointer-events-none"
            style={{
              backgroundColor: activeOpacityColor,
              opacity: currentOpacity,
            }}
          />
        </div>
      </div>

      {/* 2. Color Wheel Modal for Free Draw */}
      {isFreeDraw && onColorChange && (
        <ColorWheelModal
          isOpen={isColorPickerOpen}
          color={color}
          opacity={currentOpacity}
          onOpacityChange={onOpacityChange}
          onColorChange={onColorChange}
          onClose={() => setIsColorPickerOpen(false)}
        />
      )}

      {/* 3. Floating Portal Preview: Rendered directly to body with GPU Hardware Acceleration (translate3d) */}
      {dragState !== null && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed top-0 left-0 pointer-events-none z-[9999] select-none flex flex-col items-center"
          style={{
            transform: `translate3d(${dragState.clientX - 68}px, ${dragState.clientY - 42}px, 0) translate(-50%, -50%)`,
            willChange: 'transform',
          }}
        >
          {/* Single Clean Numerical Counter Pill */}
          <div className="mb-2 bg-black/90 text-white font-black text-xs px-2.5 py-1 rounded-md border border-white/20 whitespace-nowrap shadow-lg">
            {dragState.type === 'size' ? `${Math.round(displayVal)}px` : `${Math.round(displayVal * 100)}%`}
          </div>

          {/* Floating Shape Preview */}
          {dragState.type === 'size' ? (
            <div className="w-[56px] h-[56px] rounded-full bg-[#0B3B75] border-2 border-white/40 flex items-center justify-center overflow-hidden shadow-xl">
              <div
                className="rounded-full bg-white"
                style={{
                  width: `${floatingCircleSize}px`,
                  height: `${floatingCircleSize}px`,
                }}
              />
            </div>
          ) : (
            <div className="w-[56px] h-[56px] rounded-[14px] bg-[#0B3B75] border-2 border-white/40 p-[6px] flex items-center justify-center shadow-xl">
              <div
                className="w-full h-full rounded-[8px] border border-black/20"
                style={{
                  backgroundColor: activeOpacityColor,
                  opacity: displayVal,
                }}
              />
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default FlipaClipControls;
