import React, { useState, useRef, useEffect } from 'react';
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

const LOCAL_STORAGE_PALETTE_KEY = 'flipaclip_user_saved_colors';

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

  // Calculate maximum diameter to fill modal with virtually zero wasted side margin
  const getOptimalWheelDiameter = () => {
    if (typeof window !== 'undefined') {
      const screenW = window.innerWidth;
      return Math.min(346, Math.max(260, Math.floor(screenW * 0.94) - 8));
    }
    return 340;
  };

  const [wheelDiameter, setWheelDiameter] = useState(getOptimalWheelDiameter);

  // Wheel container ref & instance ref
  const wheelContainerRef = useRef<HTMLDivElement>(null);
  const wheelInstanceRef = useRef<ReinventedColorWheel | null>(null);
  const isInternalUpdateRef = useRef(false);

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

  // Listen to global pointer releases to safely reset wheel interaction flag
  useEffect(() => {
    const handlePointerRelease = () => {
      isUserInteractingWithWheelRef.current = false;
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
    };
  }, []);

  // Capture initial color and recalculate size when modal opens
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
  }, [isOpen, color]);

  // Sync hex input and selected color when color prop updates
  useEffect(() => {
    setHexInput(color.toUpperCase());
    const upper = color.toUpperCase();
    if (savedPalette.includes(upper)) {
      setSelectedSavedColor(upper);
    }
  }, [color, savedPalette]);

  // Safe setter that protects Hue when Saturation is 0 (preventing unexpected reset to red)
  const setWheelColorSafely = (newHex: string) => {
    if (!wheelInstanceRef.current) return;
    try {
      const rgb = ReinventedColorWheel.hex2rgb(newHex);
      const hsv = ReinventedColorWheel.rgb2hsv(rgb);
      const currentHsv = wheelInstanceRef.current.hsv;
      // If saturation is 0 (far left of square: white/gray/black), preserve existing hue!
      // Otherwise rgb2hsv converts grayscale to Hue 0 (pure red)
      if (hsv[1] === 0 && currentHsv) {
        hsv[0] = currentHsv[0];
      }
      isInternalUpdateRef.current = true;
      wheelInstanceRef.current.hsv = hsv;
      isInternalUpdateRef.current = false;
      lastWheelHexRef.current = newHex.toUpperCase();
    } catch (_) {}
  };

  // Initialize ReinventedColorWheel when modal is open
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
        setHexInput(hex);
        onColorChange(hex);
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
  }, [isOpen, wheelDiameter]);

  // Sync color changes from external clicks (e.g. clicking swatch, typing HEX, or revert button)
  useEffect(() => {
    if (!wheelInstanceRef.current || !color) return;
    const upper = color.toUpperCase();

    // CRITICAL: If the user is actively dragging in the wheel, OR if this color was
    // generated by the wheel itself, DO NOT overwrite the wheel!
    // Overwriting while dragging was the exact cause of the vibration and jumping to red!
    if (isUserInteractingWithWheelRef.current || upper === lastWheelHexRef.current) {
      return;
    }

    setWheelColorSafely(upper);
  }, [color]);

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
      onColorChange(upper);
    }
  };

  // Smooth tactile Opacity Slider calculation
  const updateOpacityFromClientX = (clientX: number) => {
    if (!sliderTrackRef.current || !onOpacityChange) return;
    const rect = sliderTrackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newOpacity = Number((0.10 + ratio * 0.90).toFixed(2));
    onOpacityChange(newOpacity);
  };

  const handleSliderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingSliderRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    updateOpacityFromClientX(e.clientX);
  };

  const handleSliderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSliderRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    updateOpacityFromClientX(e.clientX);
  };

  const handleSliderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSliderRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    isDraggingSliderRef.current = false;
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

          {/* Modal Container */}
          <motion.div
            ref={modalCardRef}
            initial={{ opacity: 0, scale: 0.94, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 6 }}
            transition={{ type: 'spring', damping: 27, stiffness: 380 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-[356px] sm:w-[370px] max-w-[98vw] bg-[#0E2A54] border-2 border-white/20 rounded-[20px] shadow-[0_12px_40px_rgba(0,0,0,0.45)] overflow-hidden flex flex-col text-white"
            dir="rtl"
          >
            {/* Top Bar: HEX Input on the right, Compare box in middle, Close on left */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-[#0B2245]/90">
              {/* Top-Right: HEX Code Input (clean input without colored circle since compare box already shows color) */}
              <div className="flex items-center gap-1 bg-[#071833] border border-white/20 rounded-xl px-2.5 py-1 shadow-inner shrink-0">
                <span className="text-xs font-mono font-black text-white/50 select-none">#</span>
                <input
                  type="text"
                  value={hexInput.replace(/^#/, '')}
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
                  className="w-16 bg-transparent text-xs font-mono font-black text-white focus:outline-none uppercase tracking-wider text-center"
                  dir="ltr"
                  placeholder="FFFFFF"
                />
              </div>

              {/* Middle: FlipaClip Split Comparison Box (revert vs live) */}
              <div
                title="مقارنة اللون: انقر على النصف الأول لاسترجاع اللون السابق"
                className="relative flex items-center h-7 rounded-lg overflow-hidden border border-white/40 shadow-inner cursor-pointer"
              >
                {/* Revert to Initial Color */}
                <button
                  type="button"
                  onClick={() => {
                    setWheelColorSafely(initialColor.toUpperCase());
                    onColorChange(initialColor);
                  }}
                  className="w-6 h-full relative group transition-transform active:scale-95"
                  style={{ backgroundColor: initialColor }}
                  title="استرجاع اللون السابق"
                >
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Undo2 className="w-3 h-3 text-white drop-shadow" />
                  </div>
                </button>

                {/* Divider */}
                <div className="w-[1px] h-full bg-white/40 z-10 pointer-events-none" />

                {/* Current Color */}
                <div
                  className="w-6 h-full"
                  style={{ backgroundColor: color }}
                  title="اللون المختار حالياً"
                />
              </div>

              {/* Top-Left: Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center transition-colors text-white/80 hover:text-white shrink-0"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body: Color Wheel taking MAXIMUM available width */}
            <div className="px-0.5 py-1.5 flex flex-col items-center gap-2">
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
                  className="flex items-center justify-center select-none touch-none [&_.reinvented-color-wheel--sv-space]:rounded-[8px] [&_.reinvented-color-wheel--sv-space]:shadow-[0_0_0_1.5px_rgba(255,255,255,0.25)] [&_.reinvented-color-wheel--hue-handle]:shadow-[0_2px_8px_rgba(0,0,0,0.6)] [&_.reinvented-color-wheel--sv-handle]:shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
                />
              </div>

              {/* Opacity Slider: Thin Bar + Large Thumb Circle + Accurate LTR Direction */}
              {onOpacityChange && (
                <div className="w-full flex flex-col gap-1 px-3" dir="ltr">
                  <div className="flex justify-between items-center text-xs font-semibold text-white/80 px-0.5">
                    <span className="font-mono text-[#D4AF37] font-black text-sm">{opacityPercent}%</span>
                    <span dir="rtl" className="text-white/70 text-[11px]">الكثافة</span>
                  </div>

                  {/* Interactive Slider Track (LTR: Left 10% -> Right 100%) */}
                  <div
                    ref={sliderTrackRef}
                    onPointerDown={handleSliderPointerDown}
                    onPointerMove={handleSliderPointerMove}
                    onPointerUp={handleSliderPointerUp}
                    onPointerCancel={handleSliderPointerUp}
                    className="relative w-full h-6 flex items-center cursor-pointer select-none touch-none px-1"
                  >
                    {/* Thin sleek bar track (height 8px) */}
                    <div className="relative w-full h-2 rounded-full overflow-hidden border border-white/25 shadow-inner">
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
                        className="absolute inset-0"
                        style={{
                          background: `linear-gradient(to right, transparent, ${color})`,
                        }}
                      />
                    </div>

                    {/* Prominent Large Thumb Circle (22px diameter, larger than 8px bar) */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[22px] h-[22px] rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.6)] border-2 border-[#0E2A54] ring-2 ring-white/70 pointer-events-none transition-transform active:scale-110 flex items-center justify-center"
                      style={{
                        left: `calc(11px + (100% - 22px) * ${opacityRatio})`,
                      }}
                    >
                      {/* Inner dot with live color and opacity */}
                      <div
                        className="w-2.5 h-2.5 rounded-full shadow-inner"
                        style={{ backgroundColor: color, opacity: opacity }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom Section: Save Color & Delete Icon Buttons + Saved Colors Swatches */}
              <div className="w-full px-2.5 pb-1 flex flex-col gap-1.5" dir="rtl">
                <div className="flex items-center gap-2">
                  {/* Save Color Button (Returned to bottom as requested) */}
                  <button
                    type="button"
                    onClick={handleSaveColor}
                    className="flex items-center gap-1.5 text-xs font-black bg-[#1A447E] hover:bg-[#255DB0] active:scale-95 text-white px-3 py-1.5 rounded-xl border border-white/20 transition-all shadow-sm shrink-0"
                    title="حفظ اللون الحالي"
                  >
                    <Plus className="w-4 h-4 text-[#D4AF37]" strokeWidth={3} />
                    <span>حفظ اللون</span>
                  </button>

                  {/* Delete Selected Color Icon Button (ONLY appears when saved colors exist) */}
                  {savedPalette.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteSelectedColor}
                      className="flex items-center justify-center w-8 h-8 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-300 hover:text-red-100 border border-red-500/30 transition-all active:scale-95 shadow-sm shrink-0"
                      title={`حذف اللون المحدد (${currentTargetForDeletion || ''})`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  {/* Saved Color Swatches List */}
                  <div className="flex-1 flex items-center gap-1.5 overflow-x-auto px-2 py-1 scrollbar-none min-h-[38px] bg-[#071833]/40 border border-white/10 rounded-xl">
                    {savedPalette.map((savedColor, idx) => {
                      const isSelected = selectedSavedColor === savedColor || (!selectedSavedColor && idx === 0);
                      return (
                        <div key={`${savedColor}-${idx}`} className="relative shrink-0 p-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSavedColor(savedColor);
                              setWheelColorSafely(savedColor);
                              onColorChange(savedColor);
                            }}
                            className={`w-7 h-7 rounded-lg border transition-all active:scale-95 ${
                              isSelected
                                ? 'border-[#D4AF37] ring-2 ring-[#D4AF37] shadow-[0_0_8px_rgba(212,175,55,0.5)]'
                                : 'border-white/30 hover:border-white/80 shadow-sm'
                            }`}
                            style={{ backgroundColor: savedColor }}
                            title={savedColor}
                          />
                        </div>
                      );
                    })}
                  </div>
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
