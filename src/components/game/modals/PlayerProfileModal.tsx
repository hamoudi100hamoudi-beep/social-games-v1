import React from "react";
import { EyeOff, User as UserIcon } from "lucide-react";
import CinematicModal from "../CinematicModal";

interface PlayerProfileModalProps {
  isOpen: boolean;
  playerToRender: {
    id: string;
    name: string;
    avatar?: string;
    persistentId?: string;
  } | null;
  isSelf: boolean;
  alreadyVoted: boolean;
  isBlocked: boolean;
  onClose: () => void;
  onToggleBlock: () => void;
  onToggleVoteKick: () => void;
}

export default function PlayerProfileModal({
  isOpen,
  playerToRender,
  isSelf,
  alreadyVoted,
  isBlocked,
  onClose,
  onToggleBlock,
  onToggleVoteKick,
}: PlayerProfileModalProps) {
  return (
    <CinematicModal
      isOpen={isOpen}
      onClose={onClose}
      titleType="profile"
      titleText="PROFILE"
    >
      {playerToRender ? (
        <>
          {/* Avatar Emoji Frame with Comfortable Dimensions */}
          <div className="w-24 h-24 sm:w-30 sm:h-30 rounded-full bg-[#ECEBFC] border-2 border-white/80 flex items-center justify-center mx-auto mb-3 sm:mb-4 relative select-none shrink-0">
            <span className="text-[56px] sm:text-[70px] leading-none mb-0.5">{playerToRender.avatar || "👤"}</span>
          </div>

          {/* Player Name Card */}
          <div className="w-full">
            <h3 id="profile-modal-name" className="text-[18px] sm:text-[22px] font-black text-[#2E2882] leading-snug tracking-tight mb-3 sm:mb-4 text-center truncate px-2">
              {playerToRender.name}
            </h3>
          </div>

          {isSelf ? (
            <div 
              className="py-3 px-4 bg-white rounded-[18px] border border-[#4F46E5]/10 text-center text-[#4F46E5] font-extrabold text-sm"
            >
              هذا هو حسابك الشخصي
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 sm:gap-3 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Block / Unblock Action Button (Mute) */}
              <div>
                <button
                  id="profile-modal-block-btn"
                  onClick={() => {
                    onToggleBlock();
                    onClose();
                  }}
                  className={`w-full py-3 sm:py-3.5 px-4 font-black text-sm sm:text-base rounded-[18px] sm:rounded-[20px] transition-all cursor-pointer flex items-center justify-center uppercase tracking-wide gap-2.5 select-none ${
                    isBlocked 
                      ? "bg-[#38BDF8] text-white hover:bg-[#0EA5E9] border-2 border-white/40 active:scale-95"
                      : "bg-[#FB923C] text-white hover:bg-[#EA580C] border-2 border-white/40 active:scale-95"
                  }`}
                >
                  <EyeOff className="w-5 h-5" />
                  {isBlocked ? "UNBLOCK" : "BLOCK"}
                </button>
              </div>

              {/* Votekick Action Button */}
              <div>
                <button
                  id="profile-modal-kick-btn"
                  onClick={() => {
                    onToggleVoteKick();
                    onClose();
                  }}
                  className={`w-full py-3 sm:py-3.5 px-4 font-black text-sm sm:text-base rounded-[18px] sm:rounded-[20px] transition-all cursor-pointer flex items-center justify-center uppercase tracking-wide gap-2.5 select-none ${
                    alreadyVoted 
                      ? "bg-[#38BDF8] text-white hover:bg-[#0EA5E9] border-2 border-white/40 active:scale-95"
                      : "bg-[#FB923C] text-white hover:bg-[#EA580C] border-2 border-white/40 active:scale-95"
                  }`}
                >
                  <UserIcon className="w-5 h-5" />
                  {alreadyVoted ? "REMOVE VOTE" : "VOTEKICK"}
                </button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </CinematicModal>
  );
}
