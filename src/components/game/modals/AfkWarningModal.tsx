import React from "react";
import { Check } from "lucide-react";
import CinematicModal from "../CinematicModal";
import AfkWarningSprite from "../AfkWarningSprite";

interface AfkWarningModalProps {
  isOpen: boolean;
  afkCountdown: number;
  onConfirmStay: () => void;
}

export default function AfkWarningModal({
  isOpen,
  afkCountdown,
  onConfirmStay,
}: AfkWarningModalProps) {
  return (
    <CinematicModal
      isOpen={isOpen}
      titleType="inactive"
      titleText="INACTIVE"
      buttons={[
        {
          id: "afk-return-btn",
          text: "موافق",
          onClick: onConfirmStay,
          variant: "neutral",
          icon: <Check strokeWidth={4} size={18} />,
        },
      ]}
    >
      {/* Animated Warning Sprite */}
      <div className="flex justify-center mb-3 sm:mb-4 mt-1">
        <AfkWarningSprite className="w-24 sm:w-34 aspect-[256/326]" />
      </div>

      {/* Question & Subtext in the same line (RTL reading order) */}
      <h3 
        id="afk-title" 
        dir="rtl"
        className="text-sm sm:text-base font-black text-[#2E2882] leading-snug mb-3 sm:mb-4 px-1 text-center"
      >
        <span>هل ما زلت هنا؟ </span>
        <span id="afk-description">اضغط موافق للاستمرار في اللعب</span>
      </h3>

      {/* Compact Remainder Countdown Badge */}
      <div 
        dir="rtl"
        className="bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-full px-4 py-1.5 inline-flex items-center gap-2 mb-3 sm:mb-4 text-xs sm:text-sm font-black text-[#EF4444] select-none"
      >
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EF4444] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EF4444]"></span>
        </span>
        <span>
          سيتم فصل الاتصال بعد: <span className="font-extrabold font-mono text-xs sm:text-sm">{afkCountdown}</span> ثانية
        </span>
      </div>
    </CinematicModal>
  );
}
