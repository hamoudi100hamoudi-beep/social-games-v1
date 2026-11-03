import React from "react";
import { AlertTriangle } from "lucide-react";
import { motion } from "motion/react";
import CinematicModal from "../CinematicModal";

interface ReportConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmReport: () => void;
}

export default function ReportConfirmModal({
  isOpen,
  onClose,
  onConfirmReport,
}: ReportConfirmModalProps) {
  return (
    <CinematicModal
      isOpen={isOpen}
      onClose={onClose}
      titleType="report"
      titleText="REPORT"
      buttons={[
        {
          id: "report-confirm-no-btn",
          text: "NO",
          onClick: onClose,
          variant: "primary",
        },
        {
          id: "report-confirm-yes-btn",
          text: "YES",
          onClick: onConfirmReport,
          variant: "danger",
        },
      ]}
    >
      {/* Red warning triangle with elegant bell vibration/shaking loop animation */}
      <div className="w-18 h-18 sm:w-24 sm:h-24 flex items-center justify-center mx-auto mb-3 sm:mb-4 mt-1 relative">
        <motion.div 
          animate={{
            rotate: [-4, 4, -4, 4, -4, 4, 0],
            scale: [1, 1.05, 1, 1.05, 1]
          }}
          transition={{
            delay: 1.5,
            repeat: Infinity,
            duration: 0.6,
            repeatDelay: 1.8,
            ease: "easeInOut"
          }}
        >
          <AlertTriangle className="w-16 h-16 sm:w-20 sm:h-20 text-[#FB923C] fill-[#FB923C]/5" strokeWidth={2.5} />
        </motion.div>
      </div>

      {/* Content Text unified with golden standard */}
      <h3 id="report-confirm-title" className="text-[18px] sm:text-[22px] font-black text-[#2E2882] leading-snug tracking-tight mb-3 sm:mb-4 text-center">
        Are you sure you wanna report this drawing?
      </h3>
    </CinematicModal>
  );
}
