import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ToolType } from '../../types/draw';

interface FlipaClipControlsProps {
  tool: ToolType;
  color: string;
  currentWidth: number;
  currentOpacity: number;
  baseScale: number;
  onWidthChange: (width: number) => void;
  onOpacityChange: (opacity: number) => void;
}

interface DragState {
  type: 'size' | 'opacity';
  startY: number;
  clientX: number;
  clientY: number;
  startVal: number;
  min: number;
  max: number;
  sensitivity: number;
}

export const FlipaClipControls: React.FC<FlipaClipControlsProps> = ({
  tool,
  color,
  currentWidth,
  currentOpacity,
  baseScale: _baseScale,
  onWidthChange,
  onOpacityChange,
}) => {
  const [dragState, setDragState] = useState<DragState | null>(null);

  // Max width according to tool
  const maxWidth = tool === 'eraser' ? 120 : 50;
  const minWidth = 1;

  // Pointer Down for Size Circle
  const handleSizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    setDragState({
      type: 'size',
      startY: e.clientY,
      clientX: e.clientX,
      clientY: e.clientY,
      startVal: currentWidth,
      min: minWidth,
      max: maxWidth,
      sensitivity: 2.2,
    });
  };

  // Pointer Down for Opacity Square
  const handleOpacityPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    setDragState({
      type: 'opacity',
      startY: e.clientY,
      clientX: e.clientX,
      clientY: e.clientY,
      startVal: currentOpacity,
      min: 0.1,
      max: 1.0,
      sensitivity: 140,
    });
  };

  // Pointer Move with real-time 1:1 responsiveness
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    e.preventDefault();
    e.stopPropagation();

    const deltaY = dragState.startY - e.clientY; // Upward drag = positive

    setDragState(prev => prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null);

    if (dragState.type === 'size') {
      const delta = Math.round(deltaY / dragState.sensitivity);
      const newWidth = Math.max(dragState.min, Math.min(dragState.max, dragState.startVal + delta));
      onWidthChange(newWidth);
    } else if (dragState.type === 'opacity') {
      const delta = deltaY / dragState.sensitivity;
      const newOpacity = Math.max(dragState.min, Math.min(dragState.max, Number((dragState.startVal + delta).toFixed(2))));
      onOpacityChange(newOpacity);
    }
  };

  // Pointer Up / Cancel
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragState) {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}
      setDragState(null);
    }
  };

  // Proportional dot calculation (bounded strictly to prevent disappearing or overflowing)
  const widthRatio = Math.max(0, Math.min(1, (currentWidth - minWidth) / (maxWidth - minWidth)));

  // Inner dot for the static button (bounds: 4px min, 22px max)
  const buttonDotSize = 4 + widthRatio * 18;

  // Inner circle for the floating preview (bounds: 4px min, 44px max within 56px container)
  const floatingCircleSize = 4 + widthRatio * 40;

  // Opacity display color
  const activeOpacityColor = tool === 'eraser' ? '#FFFFFF' : color;
  const isBucket = tool === 'bucket';

  return (
    <div className="relative select-none touch-none" dir="ltr">
      {/* 1. FlipaClip Main Buttons on the Right */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Brush Size Circle Button (Fixed pure white dot) */}
        {!isBucket && (
          <div
            onPointerDown={handleSizePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            title="اضغط واسحب للأعلى أو الأسفل لتغيير حجم الخط"
            className={`w-[38px] h-[38px] sm:w-[42px] sm:h-[42px] rounded-full bg-[#0B3B75]/95 backdrop-blur-sm border-2 flex items-center justify-center cursor-ns-resize shadow-lg active:scale-95 touch-none ${
              dragState?.type === 'size'
                ? 'border-primary-brand ring-2 ring-primary-brand/50'
                : 'border-white/30 hover:border-white/60'
            }`}
          >
            {/* Inner fixed white dot */}
            <div
              className="rounded-full bg-white pointer-events-none shadow-sm"
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
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title="اضغط واسحب للأعلى أو الأسفل لتغيير كثافة وشفافية اللون"
          className={`w-[38px] h-[38px] sm:w-[42px] sm:h-[42px] rounded-[8px] sm:rounded-[10px] bg-[#0B3B75]/95 backdrop-blur-sm border-2 p-[4px] flex items-center justify-center cursor-ns-resize shadow-lg active:scale-95 touch-none ${
            dragState?.type === 'opacity'
              ? 'border-primary-brand ring-2 ring-primary-brand/50'
              : 'border-white/30 hover:border-white/60'
          }`}
        >
          {/* Inner Clean Color Swatch */}
          <div
            className="w-full h-full rounded-[5px] sm:rounded-[6px] border border-black/20 shadow-inner"
            style={{
              backgroundColor: activeOpacityColor,
              opacity: currentOpacity,
            }}
          />
        </div>
      </div>

      {/* 2. Floating Portal Preview: Rendered directly to body with z-[9999] so it NEVER hides under bottom toolbar */}
      {dragState !== null && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed pointer-events-none z-[9999] select-none flex flex-col items-center"
          style={{
            left: `${dragState.clientX - 68}px`,
            top: `${dragState.clientY - 42}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Single Clean Numerical Counter Pill */}
          <div className="mb-2 bg-black/90 text-white font-black text-xs px-2.5 py-1 rounded-md shadow-2xl border border-white/20 whitespace-nowrap">
            {dragState.type === 'size' ? `${currentWidth}px` : `${Math.round(currentOpacity * 100)}%`}
          </div>

          {/* Floating Shape Preview */}
          {dragState.type === 'size' ? (
            <div className="w-[56px] h-[56px] rounded-full bg-[#0B3B75]/95 backdrop-blur-md border-2 border-white/40 shadow-2xl flex items-center justify-center overflow-hidden">
              <div
                className="rounded-full bg-white shadow-md"
                style={{
                  width: `${floatingCircleSize}px`,
                  height: `${floatingCircleSize}px`,
                }}
              />
            </div>
          ) : (
            <div className="w-[56px] h-[56px] rounded-[14px] bg-[#0B3B75]/95 backdrop-blur-md border-2 border-white/40 shadow-2xl p-[6px] flex items-center justify-center">
              <div
                className="w-full h-full rounded-[8px] border border-black/20 shadow-inner"
                style={{
                  backgroundColor: activeOpacityColor,
                  opacity: currentOpacity,
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
