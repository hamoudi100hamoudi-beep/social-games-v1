import React from "react";
import { AlertTriangle } from "lucide-react";
import { motion } from "motion/react";
import CinematicModal from "../CinematicModal";

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
  return (
    <>
      {/* Cooldown Warning Modal */}
      {shouldRenderCooldown && (
        <CinematicModal
          isOpen={showCooldownWarning}
          onClose={onCloseCooldownWarning}
          titleType="report"
          titleText="SLOW DOWN"
          buttons={[
            {
              id: "cooldown-warning-ok-btn",
              text: "OK",
              onClick: onCloseCooldownWarning,
              variant: "custom",
              className: "w-full py-4 px-5 font-black text-base rounded-[22px] transition-all cursor-pointer flex items-center justify-center uppercase tracking-wide gap-3 select-none bg-[#1AAACC] text-white hover:bg-[#1691ae] border-2 border-white/40 active:scale-95",
            },
          ]}
        >
          {/* Red warning triangle with elegant bell vibration/shaking loop animation */}
          <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 mt-4 relative">
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
              <AlertTriangle className="w-20 h-20 text-[#EF4444] fill-[#EF4444]/5" strokeWidth={2.5} />
            </motion.div>
          </div>

          {/* Alert Message */}
          <h3 id="cooldown-warning-title" className="text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
            You voted recently. Please waiting to votekick again
          </h3>
          <p id="cooldown-warning-ar" className="text-[#8C8AA7] text-base font-bold mb-6">
            لقد قمت بالتصويت مؤخراً. يرجى الانتظار للمحاولة مرة أخرى.
          </p>
        </CinematicModal>
      )}

      {/* Kicked Out / Hard Block Screen */}
      <CinematicModal
        isOpen={isBanned}
        titleType="report"
        titleText="KICKED"
        buttons={[
          {
            id: "kicked-out-exit-btn",
            text: "OK",
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
            <AlertTriangle className="w-20 h-20 text-[#EF4444] fill-[#EF4444]/5" strokeWidth={2.5} />
          </motion.div>
        </div>

        {/* Content Text in standard theme colors */}
        <h3 id="kicked-out-desc" className="text-[20px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
          You were kicked out by voting
        </h3>
        <p id="kicked-out-desc-ar" className="text-[#8C8AA7] text-base font-bold mb-6">
          تم طردك من هذه الغرفة بناءً على تصويت اللاعبين الآخرين.
        </p>
      </CinematicModal>

      {/* Nickname Taken Warning Modal */}
      <CinematicModal
        isOpen={isNicknameTaken}
        overlayClassName="bg-slate-950/100"
        onClose={onLeaveFromNicknameTaken}
        titleType="report"
        titleText="ERROR"
        buttons={[
          {
            id: "nickname-taken-exit-btn",
            text: "OK",
            onClick: onLeaveFromNicknameTaken,
            variant: "danger",
          },
        ]}
      >
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-5 mt-3 relative">
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
            <AlertTriangle className="w-20 h-20 text-[#FB923C] fill-[#FB923C]/5" strokeWidth={2.5} />
          </motion.div>
        </div>

        <h3 id="nickname-taken-desc" className="text-[19px] sm:text-[21px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
          Name already in use
        </h3>
        <p id="nickname-taken-desc-ar" className="text-[#8C8AA7] text-base font-bold mb-6">
          يوجد شخص آخر في الغرفة بنفس الاسم، غيره لتتمكن من الدخول
        </p>
      </CinematicModal>

      {/* Room Full Warning Modal */}
      <CinematicModal
        isOpen={isRoomFull}
        onClose={onLeaveFromRoomFull}
        titleType="report"
        titleText="ERROR"
        buttons={[
          {
            id: "room-full-exit-btn",
            text: "OK",
            onClick: onLeaveFromRoomFull,
            variant: "danger",
          },
        ]}
      >
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-5 mt-3 relative">
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
            <AlertTriangle className="w-20 h-20 text-[#FB923C] fill-[#FB923C]/5" strokeWidth={2.5} />
          </motion.div>
        </div>

        <h3 id="room-full-desc" className="text-[19px] sm:text-[21px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
          This room is full
        </h3>
        <p id="room-full-desc-ar" className="text-[#8C8AA7] text-base font-bold mb-6">
          هذه الغرفة ممتلئة بالكامل
        </p>
      </CinematicModal>

      {/* Server Full (Auth Store Full) Warning Modal */}
      <CinematicModal
        isOpen={isAuthStoreFull}
        onClose={onLeaveFromAuthStoreFull}
        titleType="report"
        titleText="SERVER FULL"
        buttons={[
          {
            id: "auth-store-full-exit-btn",
            text: "OK",
            onClick: onLeaveFromAuthStoreFull,
            variant: "danger",
          },
        ]}
      >
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-5 mt-3 relative">
          <AlertTriangle className="w-20 h-20 text-[#FB923C] fill-[#FB923C]/5" strokeWidth={2.5} />
        </div>

        <h3 id="auth-store-full-desc" className="text-[19px] sm:text-[21px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
          Server Capacity Reached
        </h3>
        <p id="auth-store-full-desc-ar" className="text-[#8C8AA7] text-base font-bold mb-6">
          بلغ الخادم طاقته الاستيعابية القصوى حالياً، يرجى المحاولة بعد قليل
        </p>
      </CinematicModal>

      {/* Join Room Timeout Modal */}
      <CinematicModal
        isOpen={isJoinTimedOut}
        onClose={onLeaveFromJoinTimeout}
        titleType="report"
        titleText="TIMEOUT"
        buttons={[
          {
            id: "join-timeout-exit-btn",
            text: "OK",
            onClick: onLeaveFromJoinTimeout,
            variant: "danger",
          },
        ]}
      >
        <div className="w-24 h-24 flex items-center justify-center mx-auto mb-5 mt-3 relative">
          <AlertTriangle className="w-20 h-20 text-[#FB923C] fill-[#FB923C]/5" strokeWidth={2.5} />
        </div>

        <h3 id="join-timeout-desc" className="text-[19px] sm:text-[21px] font-black text-[#2E2882] leading-snug tracking-tight mb-2">
          Connection Timeout
        </h3>
        <p id="join-timeout-desc-ar" className="text-[#8C8AA7] text-base font-bold mb-6">
          تعذر الاتصال بالغرفة في الوقت المحدد، يرجى المحاولة مرة أخرى
        </p>
      </CinematicModal>
    </>
  );
}
