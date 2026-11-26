import React from "react";
import { AlertTriangle } from "lucide-react";
import { motion } from "motion/react";
import CinematicModal from "../CinematicModal";
import { useAppTranslation } from "../../../i18n/useAppTranslation";

interface RoomAlertModalsProps {
  // Cooldown Warning
  showCooldownWarning: boolean;
  onCloseCooldownWarning: () => void;
  shouldRenderCooldown?: boolean;

  // Kicked / Banned
  isBanned: boolean;
  onLeaveFromBanned: () => void;

  // Nickname Taken
  isNicknameTaken: boolean;
  onLeaveFromNicknameTaken: () => void;

  // Room Full
  isRoomFull: boolean;
  onLeaveFromRoomFull: () => void;

  // Auth Store Full
  isAuthStoreFull: boolean;
  onLeaveFromAuthStoreFull: () => void;

  // Join Room Timeout
  isJoinTimedOut: boolean;
  onLeaveFromJoinTimeout: () => void;
}

export default function RoomAlertModals({
  showCooldownWarning,
  onCloseCooldownWarning,
  shouldRenderCooldown = true,
  isBanned,
  onLeaveFromBanned,
  isNicknameTaken,
  onLeaveFromNicknameTaken,
  isRoomFull,
  onLeaveFromRoomFull,
  isAuthStoreFull,
  onLeaveFromAuthStoreFull,
  isJoinTimedOut,
  onLeaveFromJoinTimeout,
}: RoomAlertModalsProps) {
  const { t, isRTL } = useAppTranslation("modals");
  const { t: tCommon } = useAppTranslation("common");
  const textDir = isRTL ? "rtl" : "ltr";

  return (
    <>
      {/* Cooldown Warning Modal */}
      {shouldRenderCooldown && (
        <CinematicModal
          isOpen={showCooldownWarning}
          onClose={onCloseCooldownWarning}
          titleType="report"
          titleText={t("titles.slowDown")}
          arabicDisplay={isRTL}
          buttons={[
            {
              id: "cooldown-warning-ok-btn",
              text: tCommon("actions.ok"),
              onClick: onCloseCooldownWarning,
              variant: "custom",
              className:
                "w-full py-4 px-5 font-black text-base rounded-[22px] transition-all cursor-pointer flex items-center justify-center uppercase tracking-wide gap-3 select-none bg-[#1AAACC] text-white hover:bg-[#1691ae] border-2 border-white/40 active:scale-95",
            },
          ]}
        >
          {/* Red warning triangle with elegant bell vibration/shaking loop animation */}
          <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 mt-4 relative">
            <motion.div
              animate={{
                rotate: [-4, 4, -4, 4, -4, 4, 0],
                scale: [1, 1.05, 1, 1.05, 1],
              }}
              transition={{
                delay: 1.5,
                repeat: Infinity,
                duration: 0.6,
                repeatDelay: 1.8,
                ease: "easeInOut",
              }}
            >
              <AlertTriangle className="w-20 h-20 text-[#EF4444] fill-[#EF4444]/5" strokeWidth={2.5} />
            </motion.div>
          </div>

          {/* Alert Message */}
          <h3
            id="cooldown-warning-title"
            dir={textDir}
            className="text-[18px] sm:text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-6"
          >
            {t("alerts.cooldown.message")}
          </h3>
        </CinematicModal>
      )}

      {/* Kicked Out / Hard Block Screen */}
      <CinematicModal
        isOpen={isBanned}
        titleType="report"
        titleText={t("titles.kicked")}
        arabicDisplay={isRTL}
        buttons={[
          {
            id: "kicked-out-exit-btn",
            text: tCommon("actions.ok"),
            onClick: onLeaveFromBanned,
            variant: "danger",
          },
        ]}
      >
        {/* Red warning triangle with elegant bell vibration/shaking loop animation */}
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 mt-4 relative">
          <motion.div
            animate={{
              rotate: [-4, 4, -4, 4, -4, 4, 0],
              scale: [1, 1.05, 1, 1.05, 1],
            }}
            transition={{
              delay: 1.5,
              repeat: Infinity,
              duration: 0.6,
              repeatDelay: 1.8,
              ease: "easeInOut",
            }}
          >
            <AlertTriangle className="w-20 h-20 text-[#EF4444] fill-[#EF4444]/5" strokeWidth={2.5} />
          </motion.div>
        </div>

        {/* Content Text in standard theme colors */}
        <h3
          id="kicked-out-desc"
          dir={textDir}
          className="text-[18px] sm:text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-6"
        >
          {t("alerts.kicked.message")}
        </h3>
      </CinematicModal>

      {/* Nickname Taken Warning Modal */}
      <CinematicModal
        isOpen={isNicknameTaken}
        overlayClassName="bg-slate-950/100"
        onClose={onLeaveFromNicknameTaken}
        titleType="report"
        titleText={t("titles.nicknameTaken")}
        arabicDisplay={isRTL}
        buttons={[
          {
            id: "nickname-taken-exit-btn",
            text: tCommon("actions.ok"),
            onClick: onLeaveFromNicknameTaken,
            variant: "danger",
          },
        ]}
      >
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-5 mt-3 relative">
          <motion.div
            animate={{
              rotate: [-4, 4, -4, 4, -4, 4, 0],
              scale: [1, 1.05, 1, 1.05, 1],
            }}
            transition={{
              delay: 1.5,
              repeat: Infinity,
              duration: 0.6,
              repeatDelay: 1.8,
              ease: "easeInOut",
            }}
          >
            <AlertTriangle className="w-20 h-20 text-[#FB923C] fill-[#FB923C]/5" strokeWidth={2.5} />
          </motion.div>
        </div>

        <h3
          id="nickname-taken-desc"
          dir={textDir}
          className="text-[18px] sm:text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-6"
        >
          {t("alerts.nicknameTaken.message")}
        </h3>
      </CinematicModal>

      {/* Room Full Warning Modal */}
      <CinematicModal
        isOpen={isRoomFull}
        onClose={onLeaveFromRoomFull}
        titleType="report"
        titleText={t("titles.roomFull")}
        arabicDisplay={isRTL}
        buttons={[
          {
            id: "room-full-exit-btn",
            text: tCommon("actions.ok"),
            onClick: onLeaveFromRoomFull,
            variant: "danger",
          },
        ]}
      >
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-5 mt-3 relative">
          <motion.div
            animate={{
              rotate: [-4, 4, -4, 4, -4, 4, 0],
              scale: [1, 1.05, 1, 1.05, 1],
            }}
            transition={{
              delay: 1.5,
              repeat: Infinity,
              duration: 0.6,
              repeatDelay: 1.8,
              ease: "easeInOut",
            }}
          >
            <AlertTriangle className="w-20 h-20 text-[#FB923C] fill-[#FB923C]/5" strokeWidth={2.5} />
          </motion.div>
        </div>

        <h3
          id="room-full-desc"
          dir={textDir}
          className="text-[18px] sm:text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-6"
        >
          {t("alerts.roomFull.message")}
        </h3>
      </CinematicModal>

      {/* Server Full (Auth Store Full) Warning Modal */}
      <CinematicModal
        isOpen={isAuthStoreFull}
        onClose={onLeaveFromAuthStoreFull}
        titleType="report"
        titleText={t("titles.serverFull")}
        arabicDisplay={isRTL}
        buttons={[
          {
            id: "auth-store-full-exit-btn",
            text: tCommon("actions.ok"),
            onClick: onLeaveFromAuthStoreFull,
            variant: "danger",
          },
        ]}
      >
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-5 mt-3 relative">
          <AlertTriangle className="w-20 h-20 text-[#FB923C] fill-[#FB923C]/5" strokeWidth={2.5} />
        </div>

        <h3
          id="auth-store-full-desc"
          dir={textDir}
          className="text-[18px] sm:text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-6"
        >
          {t("alerts.serverFull.message")}
        </h3>
      </CinematicModal>

      {/* Join Room Timeout Modal */}
      <CinematicModal
        isOpen={isJoinTimedOut}
        onClose={onLeaveFromJoinTimeout}
        titleType="report"
        titleText={t("titles.timeout")}
        arabicDisplay={isRTL}
        buttons={[
          {
            id: "join-timeout-exit-btn",
            text: tCommon("actions.ok"),
            onClick: onLeaveFromJoinTimeout,
            variant: "danger",
          },
        ]}
      >
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-5 mt-3 relative">
          <AlertTriangle className="w-20 h-20 text-[#FB923C] fill-[#FB923C]/5" strokeWidth={2.5} />
        </div>

        <h3
          id="join-timeout-desc"
          dir={textDir}
          className="text-[18px] sm:text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-6"
        >
          {t("alerts.joinTimeout.message")}
        </h3>
      </CinematicModal>
    </>
  );
}
