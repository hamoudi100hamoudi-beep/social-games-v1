import React from "react";
import CinematicModal from "../CinematicModal";
import ExitSprite from "../ExitSprite";

interface ExitConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmExit: () => void;
  spriteClassName?: string;
}

export default function ExitConfirmModal({
  isOpen,
  onClose,
  onConfirmExit,
  spriteClassName = "w-26 sm:w-36 h-auto drop-shadow-sm",
}: ExitConfirmModalProps) {

  return (
    <CinematicModal
      isOpen={isOpen}
      onClose={onClose}
      titleType="exit"
      titleText="EXIT"
      buttons={[
        {
          id: "exit-confirm-no-btn",
          text: "NO",
          onClick: onClose,
          variant: "primary",
        },
        {
          id: "exit-confirm-yes-btn",
          text: "YES",
          onClick: onConfirmExit,
          variant: "danger",
        },
      ]}
    >
      {/* Animated Exit Character Sprite */}
      <div className="w-full flex items-center justify-center mb-3 sm:mb-5 mt-1">
        <ExitSprite className={spriteClassName} />
      </div>

      {/* Question */}
      <h3 id="exit-confirm-title" className="text-[18px] sm:text-[22px] font-black text-[#2E2882] leading-snug tracking-tight mb-3 sm:mb-4 text-center">
        Do you want to leave the game?
      </h3>
    </CinematicModal>
  );
}
