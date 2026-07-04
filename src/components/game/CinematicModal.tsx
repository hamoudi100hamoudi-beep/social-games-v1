import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import GameTitle from "./GameTitle";

// 🎬 High-performance animation variants for low-end devices
export const cinematicCardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.2, // Fast, non-blocking ease-out instead of heavy physics
      ease: "easeOut"
    },
  },
  exit: {
    scale: 0.95,
    opacity: 0,
    transition: {
      duration: 0.15,
      ease: "easeIn",
    },
  },
};

export const cinematicItemVariants = {
  hidden: { opacity: 0, y: 5 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.15,
      ease: "easeOut",
    },
  },
};

export interface CinematicModalButton {
  id: string;
  text: React.ReactNode;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: "primary" | "secondary" | "danger" | "neutral" | "custom";
  className?: string; // For completely customizable or stateful button overrides (like Block/Unblock toggle styling)
  icon?: React.ReactNode;
}

export interface CinematicModalProps {
  isOpen: boolean;
  onClose?: () => void;
  titleType: "skip" | "exit" | "report" | "profile" | "inactive";
  titleText: string;
  children?: React.ReactNode;
  buttons?: CinematicModalButton[];
  maxWidthClass?: string; // default max-w-sm
}

export default function CinematicModal({
  isOpen,
  onClose,
  titleType,
  titleText,
  children,
  buttons,
  maxWidthClass = "max-w-sm",
}: CinematicModalProps) {
  // Translate the titleType to standard cartoon classes defined in CSS
  const getTitleClass = () => {
    switch (titleType) {
      case "skip":
        return "cartoon-title-skip";
      case "exit":
        return "cartoon-title-exit";
      case "report":
        return "cartoon-title-report";
      case "profile":
        return "cartoon-title-profile";
      case "inactive":
        return "cartoon-title-inactive";
      default:
        return "cartoon-title-skip";
    }
  };

  // Helper to map color variants of our high-quality "No" icon designs
  const getButtonStyles = (btn: CinematicModalButton) => {
    if (btn.className) return btn.className;

    const base = "flex-1 select-none cursor-pointer border-2 active:scale-95 transition-all text-base sm:text-lg font-black py-4 px-5 rounded-[22px] tracking-wide flex items-center justify-center gap-2";
    
    switch (btn.variant) {
      case "primary":
        // Light blue key-player (Yes skip / general action)
        return `${base} bg-[#38BDF8] text-white hover:bg-[#0EA5E9] border-white/40 shadow-md`;
      case "secondary":
        // Lavender grey/soft gloss (The standard beautiful "NO" styling with glossy borders)
        return `${base} bg-[#ECEBFC] text-[#8C8AA7] hover:bg-[#D9D6F7] border-white/80 shadow-sm`;
      case "danger":
        // Vibrant warning orange/red for reporting or permanent exits and votes
        return `${base} bg-[#FB923C] text-white hover:bg-[#EA580C] border-white/40 shadow-md`;
      case "neutral":
        // Playful general active button (Indigo/Purple for OK return trigger etc.)
        return `${base} bg-[#818CF8] text-white hover:bg-[#6366F1] border-white/40 shadow-md`;
      default:
        return `${base} bg-[#ECEBFC] text-[#8C8AA7] hover:bg-[#D9D6F7] border-white/80 shadow-sm`;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="cinematic-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[350] flex items-center justify-center p-4 bg-slate-900/80"
          onClick={(e) => {
            if (e.target === e.currentTarget && onClose) {
              onClose();
            }
          }}
        >
          <div className="w-full flex justify-center pointer-events-none">
            <div className={`responsive-modal-scale pointer-events-auto flex justify-center w-full ${maxWidthClass}`}>
              <motion.div
                key="cinematic-modal-card"
                variants={cinematicCardVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                style={{ willChange: "transform, opacity" }}
                className={`bg-[#ECEBFC] pt-5 pb-8 px-6 sm:px-8 rounded-[32px] w-full shadow-xl text-center relative overflow-visible border border-white/40 flex flex-col h-auto`}
              >
            {/* Minimalist Top Corner Close Button - No circle, no border, no shadow, completely static relative to card */}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="absolute top-5 right-5 text-[#8C8AA7] hover:text-[#5E5B7A] transition-all duration-150 active:scale-90 cursor-pointer z-20 p-1"
                aria-label="Close"
              >
                <X className="w-6 h-6 stroke-[3]" />
              </button>
            )}

            {/* Little Spacer to balance aesthetic padding of the card */}
            <motion.div variants={cinematicItemVariants} className="h-3 w-full" />

            {/* Structured Title Label */}
            <motion.div
              variants={cinematicItemVariants}
              className="relative select-none mb-5 mx-auto py-2 px-3 flex justify-center w-full"
            >
              <GameTitle
                text={titleText}
                type={titleType}
                className="text-[34px]"
              />
            </motion.div>

            {/* Main Interactive Slot Body (Guaranteed to be h-auto as requested) */}
            <motion.div
              variants={cinematicItemVariants}
              className="w-full text-center h-auto dynamic-modal-content"
            >
              {children}
            </motion.div>

            {/* Bottom Button Layout Group */}
            {buttons && buttons.length > 0 && (
              <motion.div
                variants={cinematicItemVariants}
                className="flex items-center gap-3 w-full mt-6"
              >
                {buttons.map((btn) => (
                  <button
                    key={btn.id}
                    id={btn.id}
                    onClick={btn.onClick}
                    className={getButtonStyles(btn)}
                  >
                    {btn.icon}
                    {btn.text}
                  </button>
                ))}
              </motion.div>
            )}
          </motion.div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
