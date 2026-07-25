import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Sparkles, Check } from 'lucide-react';
import GameTitle from './GameTitle';

interface CustomEmojiModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddEmoji: (emoji: string) => void;
}

/**
 * Robust helper to extract the first full Unicode Emoji (including complex compound emojis
 * with skin tones, ZWJ sequences, gender modifiers, etc.)
 */
export function extractFirstEmoji(text: string): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Use Intl.Segmenter for native grapheme cluster extraction if available
  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
    try {
      const segmenter = new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' });
      const segments = Array.from(segmenter.segment(trimmed)) as Array<{ segment: string }>;
      // Extended pictographics, regional indicator pairs (flags), keycaps, etc.
      const emojiRegex = /(\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F1E6}-\u{1F1FF}])/u;
      
      for (const seg of segments) {
        if (emojiRegex.test(seg.segment)) {
          return seg.segment;
        }
      }
    } catch {
      // Fallback below if Segmenter fails
    }
  }

  // Fallback regex match for country flags (\p{Regional_Indicator}{2}), tag flags, or Extended_Pictographic
  const fallbackRegex = /(\p{Regional_Indicator}{2}|[\u{1F1E6}-\u{1F1FF}]{2}|\u{1F3F4}[\u{E0020}-\u{E007E}]+\u{E007F}|\p{Extended_Pictographic}(\u200D(\p{Extended_Pictographic}|\p{Regional_Indicator})|\uFE0F|\uFE0E|[\u{1F3FB}-\u{1F3FF}])*)/u;
  const match = trimmed.match(fallbackRegex);
  return match ? match[0] : null;
}

export default function CustomEmojiModal({
  isOpen,
  onClose,
  onAddEmoji,
}: CustomEmojiModalProps) {
  const [inputText, setInputText] = useState('');
  const [detectedEmoji, setDetectedEmoji] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInputText('');
      setDetectedEmoji(null);
      setErrorMsg(null);
      // Auto-focus input when modal opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);
    setErrorMsg(null);

    const emoji = extractFirstEmoji(val);
    setDetectedEmoji(emoji);
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detectedEmoji) {
      setErrorMsg('الرجاء إدخال إيموجي من كيبورد الهاتف 🎨');
      return;
    }
    onAddEmoji(detectedEmoji);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 overflow-hidden">
          {/* Normal Dark Overlay without blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 cursor-pointer"
          />

          {/* Modal Container with flexible max height and scroll to stay inside viewport */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm bg-white rounded-[28px] sm:rounded-[32px] p-4 sm:p-6 border border-white/40 shadow-2xl z-10 flex flex-col items-center text-center max-h-[85dvh] overflow-y-auto no-scrollbar my-auto"
            dir="rtl"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              type="button"
              className="absolute top-3 left-3 sm:top-4 sm:left-4 w-8 h-8 sm:w-9 sm:h-9 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center text-slate-500 active:scale-90 transition-transform cursor-pointer z-20"
            >
              <X size={18} strokeWidth={3} />
            </button>

            {/* Title */}
            <div className="mb-1 mt-0.5">
              <GameTitle text="CUSTOM EMOJI" type="skip" className="text-[22px] sm:text-[28px]" />
            </div>

            <p className="text-[#8C8AA7] font-bold text-xs sm:text-sm mb-3">
              أضف إيموجيك الخاص من كيبورد الهاتف 🎨
            </p>

            {/* Preview Box */}
            <div className="w-18 h-18 sm:w-22 sm:h-22 rounded-2xl sm:rounded-3xl bg-[#38BDF8]/10 border-2 border-[#38BDF8]/30 flex items-center justify-center mb-3 relative shadow-inner shrink-0">
              {detectedEmoji ? (
                <motion.span
                  key={detectedEmoji}
                  initial={{ scale: 0.5, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  className="text-5xl sm:text-6xl select-none"
                >
                  {detectedEmoji}
                </motion.span>
              ) : (
                <div className="flex flex-col items-center text-[#38BDF8]/60">
                  <Sparkles size={28} className="animate-pulse" />
                  <span className="text-[10px] sm:text-[11px] font-black mt-1">اختر إيموجي</span>
                </div>
              )}

              {detectedEmoji && (
                <div className="absolute -bottom-1.5 -right-1.5 bg-green-500 text-white rounded-full p-1 shadow-md border-2 border-white">
                  <Check size={12} strokeWidth={3} />
                </div>
              )}
            </div>

            {/* Form Input */}
            <form onSubmit={handleConfirm} className="w-full space-y-3">
              <div className="relative w-full">
                <input
                  ref={inputRef}
                  type="search"
                  inputMode="text"
                  enterKeyHint="done"
                  id="custom-emoji-input"
                  value={inputText}
                  onChange={handleInputChange}
                  placeholder="اضغط هنا واستخدم كيبورد الإيموجي..."
                  autoComplete="one-time-code"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  name="search"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
                  className="w-full bg-slate-50 border-2 border-[#2E2882]/15 focus:border-[#38BDF8] rounded-2xl px-3 py-2.5 sm:py-3 text-center text-slate-800 font-bold placeholder:text-slate-400 outline-none transition-all text-xs sm:text-sm shadow-inner ios-input-focus"
                />
              </div>

              {errorMsg && (
                <p className="text-rose-500 font-bold text-xs animate-shake">
                  {errorMsg}
                </p>
              )}

              {/* Confirm Button */}
              <button
                type="submit"
                disabled={!detectedEmoji}
                className="w-full h-11 sm:h-12 bg-[#38BDF8] hover:bg-[#0EA5E9] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md cursor-pointer shrink-0"
              >
                <Plus size={18} strokeWidth={3.5} />
                <span>إضافة للإيموجيات</span>
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
