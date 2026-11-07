import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { WifiOff, LogOut } from "lucide-react";

export interface RoomConnectionStatusOverlayProps {
  isVisible: boolean;
  isConnected: boolean;
  isProlongedDisconnect: boolean;
  onReturnToLobby: () => void;
}

/**
 * 🌐 Independent Connection Status Overlay (CONNECTION-STATUS-UX-1)
 * Stateless presentational overlay displayed when room connection is lost or reconnecting.
 */
export const RoomConnectionStatusOverlay: React.FC<RoomConnectionStatusOverlayProps> = ({
  isVisible,
  isConnected,
  isProlongedDisconnect,
  onReturnToLobby,
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="connection-status-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed inset-0 z-[9000] bg-[#061220]/60 flex flex-col items-center justify-center p-4 select-none touch-none"
          dir="rtl"
        >
          <div className="bg-[#121B2A] border border-white/10 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center">
            {/* Animated Icon / Spinner */}
            <div className="relative w-16 h-16 mb-5 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-[#1AD2FF]/20" />
              <div className="absolute inset-0 rounded-full border-4 border-t-[#1AD2FF] animate-spin" />
              <WifiOff className="w-7 h-7 text-[#FB923C] animate-pulse" />
            </div>

            {/* Status Title */}
            <h3 className="text-xl sm:text-2xl font-black text-white mb-2 tracking-tight">
              {!isConnected
                ? "انقطع الاتصال بالخادم"
                : "عاد الاتصال"}
            </h3>

            {/* Status Subtitle */}
            <p className="text-sm sm:text-base text-slate-300 font-medium mb-6 leading-relaxed">
              {isProlongedDisconnect
                ? "تعذر استعادة الاتصال حتى الآن. يرجى التحقق من اتصالك بالإنترنت."
                : !isConnected
                  ? "نحاول إعادة الاتصال تلقائيًا..."
                  : "جارٍ إعادة الانضمام إلى الغرفة..."}
            </p>

            {/* Prolonged Disconnect Action: Return to Lobby */}
            {isProlongedDisconnect && (
              <button
                id="disconnect-return-lobby-btn"
                onClick={onReturnToLobby}
                className="w-full py-3.5 px-5 font-black text-sm sm:text-base rounded-2xl transition-all cursor-pointer flex items-center justify-center uppercase tracking-wide gap-2 bg-[#FB923C] text-white hover:bg-[#EA580C] border-2 border-white/30 active:scale-95 shadow-lg"
              >
                <LogOut className="w-5 h-5 ml-1" />
                <span>العودة إلى الردهة</span>
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
