import React from "react";
import { FastForward } from "lucide-react";
import CinematicModal from "../CinematicModal";

interface SkipConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSkip: () => void;
}

export default function SkipConfirmModal({
  isOpen,
  onClose,
  onConfirmSkip,
}: SkipConfirmModalProps) {
  return (
    <CinematicModal
      isOpen={isOpen}
      onClose={onClose}
      titleType="report"
      titleText="SKIP"
      buttons={[
        {
          id: "skip-confirm-no-btn",
          text: <span className="text-white font-black">NO</span>,
          onClick: onClose,
          variant: "primary",
        },
        {
          id: "skip-confirm-yes-btn",
          text: <span className="text-white font-black">YES</span>,
          onClick: onConfirmSkip,
          variant: "danger",
        },
      ]}
    >
      {/* Animated Skip Drawing Page & Creature Anchor */}
      <div className="w-28 h-18 sm:w-32 sm:h-20 bg-white rounded-2xl border-2 border-[#1AAACC]/35 relative overflow-hidden flex items-center justify-center mx-auto mb-3 sm:mb-4 mt-1 shrink-0 select-none">
        {/* Inner Canvas Border */}
        <div className="absolute inset-1 rounded-[14px] border border-dashed border-[#1AAACC]/20 pointer-events-none" />

        {/* Playful Creature (FastForward triangles) leaping out of the drawing sheet */}
        <div className="relative z-10 flex items-center justify-center animate-skip-escape">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#1AAACC]/15 border border-[#1AAACC]/30 flex items-center justify-center">
            <FastForward className="w-6 h-6 sm:w-7 sm:h-7 text-[#1AAACC] ml-0.5" strokeWidth={2.8} />
          </div>
        </div>
      </div>

      <h3 id="skip-confirm-title" className="text-[18px] sm:text-[22px] font-black text-[#2E2882] leading-snug tracking-tight mb-1.5 sm:mb-2 text-center">
        Do you want to skip your turn?
      </h3>
      <p id="skip-confirm-title-ar" className="text-[#8C8AA7] text-sm sm:text-base font-bold text-center">
        هل تريد تجاوز دورك في الرسم؟
      </p>
    </CinematicModal>
  );
}
