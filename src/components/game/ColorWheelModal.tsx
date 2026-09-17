import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, Undo2 } from 'lucide-react';
import ReinventedColorWheel from 'reinvented-color-wheel';
import 'reinvented-color-wheel/css/reinvented-color-wheel.min.css';

interface ColorWheelModalProps {
  isOpen: boolean;
  color: string;
  opacity?: number;
  onColorChange: (color: string) => void;
  onOpacityChange?: (opacity: number) => void;
  onClose: () => void;
}

interface CachedTrackBounds {
  left: number;
  width: number;
}

const LOCAL_STORAGE_PALETTE_KEY = 'flipaclip_user_saved_colors';
const EMIT_THROTTLE_MS = 30; // ~33Hz safe throttle for heavy React/Canvas parent updates on low-end devices

export const ColorWheelModal: React.FC<ColorWheelModalProps> = ({
  isOpen,
  color,
  opacity = 1.0,
  onColorChange,
  onOpacityChange,
  onClose,
}) => {
  // Snapshot initial color when modal opens (for split comparison box)
  const [initialColor, setInitialColor] = useState(color);
  const prevIsOpenRef = useRef(isOpen);

  // Stable refs for callbacks to prevent re-instantiating the color wheel during live drag
  const onColorChangeRef = useRef(onColorChange);
  onColorChangeRef.current = onColorChange;
  const onOpacityChangeRef = useRef(onOpacityChange);
  onOpacityChangeRef.current = onOpacityChange;

  // Saved palette in localStorage - empty by default, ONLY user saved colors!
  const [savedPalette, setSavedPalette] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_PALETTE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return [];
  });

  // Track currently selected saved color (for targeted deletion)
  const [selectedSavedColor, setSelectedSavedColor] = useState<string | null>(null);

  // Calculate optimal diameter to fit neatly on small mobile screens without overflowing or feeling cramped
  const getOptimalWheelDiameter = useCallback(() => {
    if (typeof window !== 'undefined') {
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      const maxByHeight = Math.max(210, Math.floor(screenH * 0.42));
      const maxByWidth = Math.max(220, Math.floor(screenW * 0.82));
      return Math.min(290, Math.min(maxByWidth, maxByHeight));
    }
    return 270;
  }, []);

  const [wheelDiameter, setWheelDiameter] = useState(getOptimalWheelDiameter);

  // Wheel container ref & instance ref
  const wheelContainerRef = useRef<HTMLDivElement>(null);
  const wheelInstanceRef = useRef<ReinventedColorWheel | null>(null);
  const isInternalUpdateRef = useRef(false);

  // Direct DOM feedback refs for zero-latency 60/120fps live dragging without React reconciliation overhead
  const hexInputRef = useRef<HTMLInputElement>(null);
  const liveColorBoxRef = useRef<HTMLDivElement>(null);
  const sliderGradientRef = useRef<HTMLDivElement>(null);
  const sliderThumbRef = useRef<HTMLDivElement>(null);
  const sliderDotRef = useRef<HTMLDivElement>(null);
  const opacityTextRef = useRef<HTMLSpanElement>(null);

  // Cached layout bounds to completely eliminate getBoundingClientRect layout thrashing during pointermove
  const cachedSliderBoundsRef = useRef<CachedTrackBounds | null>(null);

  // Low-end device throttle tracking refs (~30ms emit window)
  const lastColorEmitTimeRef = useRef<number>(0);
  const pendingColorRef = useRef<string | null>(null);
  const rafColorIdRef = useRef<number | null>(null);

  const lastOpacityEmitTimeRef = useRef<number>(0);
  const pendingOpacityRef = useRef<number | null>(null);
  const rafOpacityIdRef = useRef<number | null>(null);

  // Critical refs to eliminate wheel vibration and accidental red reset during rapid SV dragging
  const isUserInteractingWithWheelRef = useRef(false);
  const lastWheelHexRef = useRef<string | null>(null);

  // Hex input string state
  const [hexInput, setHexInput] = useState(color.toUpperCase());

  // Slider drag references
  const sliderTrackRef = useRef<HTMLDivElement>(null);
  const isDraggingSliderRef = useRef(false);

  // Modal card ref
  const modalCardRef = useRef<HTMLDivElement>(null);

  // Global pointer release listener to safely reset interaction flag and flush pending updates
  useEffect(() => {
    const handlePointerRelease = () => {
      isUserInteractingWithWheelRef.current = false;
      if (rafColorIdRef.current) {
        cancelAnimationFrame(rafColorIdRef.current);
        rafColorIdRef.current = null;
      }
      if (pendingColorRef.current) {
        const finalColor = pendingColorRef.current;
        pendingColorRef.current = null;
        setHexInput(finalColor);
        onColorChangeRef.current?.(finalColor);
      }
    };

    window.addEventListener('pointerup', handlePointerRelease);
    window.addEventListener('pointercancel', handlePointerRelease);
    window.addEventListener('mouseup', handlePointerRelease);
    window.addEventListener('touchend', handlePointerRelease);

    return () => {
      window.removeEventListener('pointerup', handlePointerRelease);
      window.removeEventListener('pointercancel', handlePointerRelease);
      window.removeEventListener('mouseup', handlePointerRelease);
      window.removeEventListener('touchend', handlePointerRelease);
      if (rafColorIdRef.current) {
        cancelAnimationFrame(rafColorIdRef.current);
        rafColorIdRef.current = null;
      }
      if (rafOpacityIdRef.current) {
        cancelAnimationFrame(rafOpacityIdRef.current);
        rafOpacityIdRef.current = null;
      }
    };
  }, []);

  // Capture initial color and recalculate size when modal opens, and on window resize
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setInitialColor(color);
      setHexInput(color.toUpperCase());
      setWheelDiameter(getOptimalWheelDiameter());
      lastWheelHexRef.current = color.toUpperCase();

      const currentUpper = color.toUpperCase();
      if (savedPalette.includes(currentUpper)) {
        setSelectedSavedColor(currentUpper);
      } else if (savedPalette.length > 0) {
        setSelectedSavedColor(savedPalette[0]);
      } else {
        setSelectedSavedColor(null);
      }
    }
    prevIsOpenRef.current = isOpen;

    if (!isOpen) return;
    const handleResize = () => {
      setWheelDiameter(getOptimalWheelDiameter());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, color, getOptimalWheelDiameter, savedPalette]);

  // Sync hex input and selected color when color prop updates
  useEffect(() => {
    setHexInput(color.toUpperCase());
    const upper = color.toUpperCase();
    if (savedPalette.includes(upper)) {
      setSelectedSavedColor(upper);
    }
  }, [color, savedPalette]);

  // Safe setter that protects Hue when Saturation is 0 (preventing unexpected reset to red)
  const setWheelColorSafely = useCallback((newHex: string) => {
    if (!wheelInstanceRef.current) return;
    try {
      const rgb = ReinventedColorWheel.hex2rgb(newHex);
      const hsv = ReinventedColorWheel.rgb2hsv(rgb);
      const currentHsv = wheelInstanceRef.current.hsv;
      // If saturation is 0 (far left of square: white/gray/black), preserve existing hue!
      if (hsv[1] === 0 && currentHsv) {
        hsv[0] = currentHsv[0];
      }
      isInternalUpdateRef.current = true;
      wheelInstanceRef.current.hsv = hsv;
      isInternalUpdateRef.current = false;
      lastWheelHexRef.current = newHex.toUpperCase();
    } catch (_) {}
  }, []);

  // Initialize ReinventedColorWheel ONLY on open/resize — NEVER destroyed on parent re-renders!
  useEffect(() => {
    if (!isOpen || !wheelContainerRef.current) return;

    // Clean previous children
    wheelContainerRef.current.innerHTML = '';

    const wheel = new ReinventedColorWheel({
      appendTo: wheelContainerRef.current,
      hex: color,
      wheelDiameter: wheelDiameter,
      wheelThickness: 34,
      handleDiameter: 22,
      wheelReflectsSaturation: false,
      onChange: (c) => {
        if (isInternalUpdateRef.current) return;
        const hex = c.hex.toUpperCase();
        lastWheelHexRef.current = hex;

        // 1. Direct Instant DOM Updates (0ms latency, zero reflow)
        if (hexInputRef.current && document.activeElement !== hexInputRef.current) {
          hexInputRef.current.value = hex.replace(/^#/, '');
        }
        if (liveColorBoxRef.current) {
          liveColorBoxRef.current.style.backgroundColor = hex;
        }
        if (sliderGradientRef.current) {
          sliderGradientRef.current.style.background = `linear-gradient(to right, transparent, ${hex})`;
        }
        if (sliderDotRef.current) {
          sliderDotRef.current.style.backgroundColor = hex;
        }

        // 2. Throttled parent notification (~30ms / 33Hz) to prevent CPU starvation on low-end devices
        pendingColorRef.current = hex;
        const now = performance.now();
        const elapsed = now - lastColorEmitTimeRef.current;

        if (elapsed >= EMIT_THROTTLE_MS) {
          lastColorEmitTimeRef.current = now;
          if (rafColorIdRef.current) {
            cancelAnimationFrame(rafColorIdRef.current);
            rafColorIdRef.current = null;
          }
          onColorChangeRef.current?.(hex);
        } else if (!rafColorIdRef.current) {
          rafColorIdRef.current = requestAnimationFrame(() => {
            rafColorIdRef.current = null;
            if (pendingColorRef.current) {
              lastColorEmitTimeRef.current = performance.now();
              onColorChangeRef.current?.(pendingColorRef.current);
            }
          });
        }
      },
    });

    wheelInstanceRef.current = wheel;
    lastWheelHexRef.current = color.toUpperCase();

    return () => {
      try {
        wheelInstanceRef.current = null;
        if (wheelContainerRef.current) {
          wheelContainerRef.current.innerHTML = '';
        }
      } catch (_) {}
    };
  }, [isOpen, wheelDiameter]); // ONLY dependent on open state and diameter

  // Sync color changes from external sources (e.g. clicking swatch, typing HEX, or revert button)
  useEffect(() => {
    if (!wheelInstanceRef.current || !color) return;
    const upper = color.toUpperCase();

    // CRITICAL: If the user is actively dragging in the wheel, OR if this color was
    // generated by the wheel itself, DO NOT overwrite the wheel!
    if (isUserInteractingWithWheelRef.current || upper === lastWheelHexRef.current) {
      return;
    }

    setWheelColorSafely(upper);
    if (hexInputRef.current && document.activeElement !== hexInputRef.current) {
      hexInputRef.current.value = upper.replace(/^#/, '');
    }
    if (liveColorBoxRef.current) {
      liveColorBoxRef.current.style.backgroundColor = upper;
    }
    if (sliderGradientRef.current) {
      sliderGradientRef.current.style.background = `linear-gradient(to right, transparent, ${upper})`;
    }
    if (sliderDotRef.current) {
      sliderDotRef.current.style.backgroundColor = upper;
    }
  }, [color, setWheelColorSafely]);

  // Handle saving current color to palette
  const handleSaveColor = () => {
    const hex = color.toUpperCase();
    if (savedPalette.includes(hex)) {
      setSelectedSavedColor(hex);
      return;
    }
    const newPalette = [hex, ...savedPalette].slice(0, 24);
    setSavedPalette(newPalette);
    setSelectedSavedColor(hex);
    try {
      localStorage.setItem(LOCAL_STORAGE_PALETTE_KEY, JSON.stringify(newPalette));
    } catch (_) {}
  };

  // Handle deleting ONLY the selected saved color
  const handleDeleteSelectedColor = () => {
    if (savedPalette.length === 0) return;
    const activeTarget = selectedSavedColor || (savedPalette.includes(color.toUpperCase()) ? color.toUpperCase() : savedPalette[0]);
    const newPalette = savedPalette.filter((c) => c !== activeTarget);
    setSavedPalette(newPalette);
    setSelectedSavedColor(newPalette[0] || null);
    try {
      localStorage.setItem(LOCAL_STORAGE_PALETTE_KEY, JSON.stringify(newPalette));
    } catch (_) {}
  };

  // Handle manual HEX input submit
  const handleHexSubmit = (val: string) => {
    let clean = val.trim();
    if (!clean.startsWith('#')) clean = '#' + clean;
    if (/^#[0-9A-F]{6}$/i.test(clean)) {
      const upper = clean.toUpperCase();
      setWheelColorSafely(upper);
      onColorChangeRef.current?.(upper);
    }
  };

  // Smooth tactile Opacity Slider calculation with cached bounds (0 layout thrashing) and GPU translate3d acceleration
  const updateOpacityFromClientX = useCallback((clientX: number, bounds: CachedTrackBounds) => {
    if (bounds.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    const newOpacity = Number((0.10 + ratio * 0.90).toFixed(2));

    // 1. GPU Hardware Accelerated translate3d update on the compositor thread
    if (sliderThumbRef.current) {
      sliderThumbRef.current.style.transform = `translate3d(calc(9px + (${bounds.width}px - 18px) * ${ratio}), -50%, 0)`;
    }
    if (sliderDotRef.current) {
      sliderDotRef.current.style.opacity = String(newOpacity);
    }
    if (opacityTextRef.current) {
      opacityTextRef.current.innerText = `${Math.round(newOpacity * 100)}%`;
    }

    // 2. Throttled parent notification (~30ms) to preserve CPU performance on low-end phones
    pendingOpacityRef.current = newOpacity;
    const now = performance.now();
    const elapsed = now - lastOpacityEmitTimeRef.current;

    if (elapsed >= EMIT_THROTTLE_MS) {
      lastOpacityEmitTimeRef.current = now;
      if (rafOpacityIdRef.current) {
        cancelAnimationFrame(rafOpacityIdRef.current);
        rafOpacityIdRef.current = null;
      }
      onOpacityChangeRef.current?.(newOpacity);
    } else if (!rafOpacityIdRef.current) {
      rafOpacityIdRef.current = requestAnimationFrame(() => {
        rafOpacityIdRef.current = null;
        if (pendingOpacityRef.current !== null) {
          lastOpacityEmitTimeRef.current = performance.now();
          onOpacityChangeRef.current?.(pendingOpacityRef.current);
        }
      });
    }
  }, []);

  const handleSliderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!sliderTrackRef.current) return;
    // Measure bounding client rect ONCE at pointerdown to completely prevent layout thrashing inside pointermove
    const rect = sliderTrackRef.current.getBoundingClientRect();
    const bounds: CachedTrackBounds = { left: rect.left, width: rect.width };
    cachedSliderBoundsRef.current = bounds;

    isDraggingSliderRef.current = true;
    updateOpacityFromClientX(e.clientX, bounds);

    const onMove = (moveEv: PointerEvent) => {
      if (!isDraggingSliderRef.current || !cachedSliderBoundsRef.current) return;
      moveEv.preventDefault();
      updateOpacityFromClientX(moveEv.clientX, cachedSliderBoundsRef.current);
    };

    const onUp = () => {
      isDraggingSliderRef.current = false;
      cachedSliderBoundsRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);

      if (rafOpacityIdRef.current) {
        cancelAnimationFrame(rafOpacityIdRef.current);
        rafOpacityIdRef.current = null;
      }
      if (pendingOpacityRef.current !== null) {
        const finalOp = pendingOpacityRef.current;
        pendingOpacityRef.current = null;
        onOpacityChangeRef.current?.(finalOp);
      }
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  if (typeof document === 'undefined') return null;

  const opacityRatio = Math.max(0, Math.min(1, (opacity - 0.10) / 0.90));
  const opacityPercent = Math.round(opacity * 100);
  const currentTargetForDeletion = selectedSavedColor || (savedPalette.includes(color.toUpperCase()) ? color.toUpperCase() : savedPalette[0]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-1 sm:p-2 select-none pointer-events-auto">
          {/* Transparent Backdrop (Zero tint, zero blur - pure click-outside trigger) */}
          <div
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) {
                onClose();
              }
            }}
            className="fixed inset-0 z-0 bg-transparent"
          />

          {/* Modal Container: Compact, fits all mobile screens nicely */}
          <motion.div
            ref={modalCardRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-[310px] sm:w-[340px] max-w-[94vw] max-h-[92dvh] overflow-y-auto no-scrollbar bg-[#0E2A54] border-2 border-white/20 rounded-[20px] overflow-hidden flex flex-col text-white"
            dir="rtl"
          >
            {/* Top Bar: HEX Input on the right, Compare box in middle, Close on left */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 bg-[#0B2245]/90 shrink-0">
              {/* Top-Right: HEX Code Input */}
              <div className="flex items-center gap-1 bg-[#071833] border border-white/20 rounded-xl px-2 py-0.5 shrink-0">
                <span className="text-xs font-mono font-black text-white/50 select-none">#</span>
                <input
                  ref={hexInputRef}
                  type="text"
                  defaultValue={hexInput.replace(/^#/, '')}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6);
                    setHexInput('#' + clean.toUpperCase());
                  }}
                  onBlur={(e) => handleHexSubmit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleHexSubmit((e.target as HTMLInputElement).value);
                    }
                  }}
                  maxLength={6}
                  className="w-14 bg-transparent text-xs font-mono font-black text-white focus:outline-none uppercase tracking-wider text-center"
                  dir="ltr"
                  placeholder="FFFFFF"
                />
              </div>

              {/* Middle: FlipaClip Split Comparison Box (revert vs live) */}
              <div
                title="مقارنة اللون: انقر على النصف الأول لاسترجاع اللون السابق"
                className="relative flex items-center h-6 rounded-lg overflow-hidden border border-white/40 cursor-pointer"
              >
                {/* Revert to Initial Color */}
                <button
                  type="button"
                  onClick={() => {
                    setWheelColorSafely(initialColor.toUpperCase());
                    onColorChangeRef.current?.(initialColor);
                  }}
                  className="w-6 h-full relative group transition-transform active:scale-95"
                  style={{ backgroundColor: initialColor }}
                  title="استرجاع اللون السابق"
                >
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Undo2 className="w-3 h-3 text-white" />
                  </div>
                </button>

                {/* Divider */}
                <div className="w-[1px] h-full bg-white/40 z-10 pointer-events-none" />

                {/* Current Color Live Box */}
                <div
                  ref={liveColorBoxRef}
                  className="w-6 h-full"
                  style={{ backgroundColor: color }}
                  title="اللون المختار حالياً"
                />
              </div>

              {/* Top-Left: Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center transition-colors text-white/80 hover:text-white shrink-0"
                title="إغلاق"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Body: Color Wheel taking available width */}
            <div className="px-0.5 py-1 flex flex-col items-center gap-1.5">
              {/* The Color Wheel */}
              <div
                className="relative flex items-center justify-center select-none touch-none my-0.5"
                style={{ width: `${wheelDiameter}px`, height: `${wheelDiameter}px` }}
                onPointerDown={() => {
                  isUserInteractingWithWheelRef.current = true;
                }}
              >
                <div
                  ref={wheelContainerRef}
                  className="flex items-center justify-center select-none touch-none [&_.reinvented-color-wheel]:touch-none [&_.reinvented-color-wheel--sv-space]:rounded-[8px] [&_.reinvented-color-wheel--sv-space]:border-0 [&_.reinvented-color-wheel--sv-space]:outline-none"
                />
              </div>

              {/* Opacity Slider: Thin Bar + Thumb Circle + Accurate LTR Direction */}
              {onOpacityChange && (
                <div className="w-full flex flex-col gap-0.5 px-3" dir="ltr">
                  <div className="flex justify-between items-center text-xs font-semibold text-white/80 px-0.5">
                    <span ref={opacityTextRef} className="font-mono text-[#D4AF37] font-black text-xs">{opacityPercent}%</span>
                    <span dir="rtl" className="text-white/70 text-[10px]">الكثافة</span>
                  </div>

                  {/* Interactive Slider Track (LTR: Left 10% -> Right 100%) */}
                  <div
                    ref={sliderTrackRef}
                    onPointerDown={handleSliderPointerDown}
                    className="relative w-full h-5 flex items-center cursor-pointer select-none touch-none px-1"
                  >
                    {/* Thin sleek bar track (height 6px) */}
                    <div className="relative w-full h-1.5 rounded-full overflow-hidden border border-white/25">
                      {/* Checkerboard Pattern */}
                      <div
                        className="absolute inset-0"
                        style={{
                          background: 'conic-gradient(#888 25%, #444 0 50%, #888 0 75%, #444 0)',
                          backgroundSize: '6px 6px',
                        }}
                      />
                      {/* Gradient Fill: Left transparent -> Right solid color */}
                      <div
                        ref={sliderGradientRef}
                        className="absolute inset-0"
                        style={{
                          background: `linear-gradient(to right, transparent, ${color})`,
                        }}
                      />
                    </div>

                    {/* Prominent Thumb Circle - Hardware GPU Accelerated via translate3d */}
                    <div
                      ref={sliderThumbRef}
                      className="absolute top-1/2 left-0 -translate-x-1/2 w-[18px] h-[18px] rounded-full bg-white border-2 border-[#0E2A54] ring-1 ring-white/70 pointer-events-none transition-transform active:scale-110 flex items-center justify-center"
                      style={{
                        transform: `translate3d(calc(9px + (100% - 18px) * ${opacityRatio}), -50%, 0)`,
                        willChange: 'transform',
                      }}
                    >
                      {/* Inner dot with live color and opacity */}
                      <div
                        ref={sliderDotRef}
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: color, opacity: opacity }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom Section: Save Color & Delete Icon Buttons + Saved Colors Swatches */}
              <div className="w-full px-2.5 pb-1 flex flex-col gap-1" dir="rtl">
                <div className="flex items-center gap-1.5">
                  {/* Plus Button: Add current color */}
                  <button
                    type="button"
                    onClick={handleSaveColor}
                    disabled={savedPalette.length >= 24}
                    title="حفظ اللون الحالي في اللوحة"
                    className="h-6 px-2 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 text-[11px] font-bold text-white transition-all border border-white/20 shrink-0"
                  >
                    <Plus className="w-3 h-3 text-[#D4AF37]" />
                    <span>حفظ</span>
                  </button>

                  {/* Delete Button: Trash icon */}
                  <button
                    type="button"
                    onClick={handleDeleteSelectedColor}
                    disabled={savedPalette.length === 0}
                    title={currentTargetForDeletion ? `حذف اللون المحدد (${currentTargetForDeletion})` : "حذف اللون المحدد"}
                    className="w-6 h-6 rounded-lg bg-red-500/20 hover:bg-red-500/30 active:scale-95 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-red-300 hover:text-red-200 transition-all border border-red-500/30 shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>

                  {/* Swatches Label */}
                  <span className="text-[10px] text-white/50 font-bold mr-auto">
                    {savedPalette.length > 0 ? `${savedPalette.length}/24 لون` : 'الألوان المحفوظة'}
                  </span>
                </div>

                {/* Swatches Grid: User Saved Colors */}
                <div className="w-full min-h-[34px] max-h-[70px] overflow-y-auto no-scrollbar bg-[#081B38]/90 border border-white/15 rounded-xl p-1.5 flex flex-wrap gap-1.5 items-center">
                  {savedPalette.length === 0 ? (
                    <div className="w-full py-1 text-center text-[11px] text-white/40 font-medium">
                      اضغط على &ldquo;حفظ&rdquo; لإضافة ألوانك المفضلة هنا
                    </div>
                  ) : (
                    savedPalette.map((savedHex, idx) => {
                      const isSelected = selectedSavedColor === savedHex;
                      return (
                        <button
                          key={`${savedHex}-${idx}`}
                          type="button"
                          onClick={() => {
                            setSelectedSavedColor(savedHex);
                            setWheelColorSafely(savedHex);
                            onColorChangeRef.current?.(savedHex);
                          }}
                          className={`w-6 h-6 rounded-[6px] relative transition-all active:scale-90 shrink-0 ${
                            isSelected
                              ? 'ring-2 ring-[#D4AF37] ring-offset-1 ring-offset-[#081B38] scale-105 z-10'
                              : 'border border-white/30 hover:border-white/70 hover:scale-105'
                          }`}
                          style={{ backgroundColor: savedHex }}
                          title={savedHex}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ColorWheelModal;
