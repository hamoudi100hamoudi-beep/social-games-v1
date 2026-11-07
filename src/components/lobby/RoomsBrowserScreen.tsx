import React from 'react';
import { Users, Plus, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import GameTitle from '../game/GameTitle';
import { RoomConfig } from '../../types/game';

export interface RoomsBrowserScreenProps {
  sortedPresets: RoomConfig[];
  roomStats: Record<string, {
    count: number;
    max: number;
    winningScore: number;
    theme: string;
  }>;
  newRoomNotice: string | null;
  onBackToHome: () => void;
  onSelectRoom: (roomId: string) => void;
  onNewRoomClick: () => void;
}

export default function RoomsBrowserScreen({
  sortedPresets,
  roomStats,
  newRoomNotice,
  onBackToHome,
  onSelectRoom,
  onNewRoomClick,
}: RoomsBrowserScreenProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-1.5 px-3 pb-3 sm:pt-3 sm:px-5 sm:pb-5 z-10 w-full max-w-md mx-auto overflow-y-auto no-scrollbar">
      {/* Header Row (Back Button and "ROOMS" Title) */}
      <div className="w-full flex items-center justify-between mb-auto relative px-2 mt-1 shrink-0">
        {/* Back button */}
        <button 
          onClick={onBackToHome}
          className="w-10 h-10 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center text-[#2E2882] active:scale-90 transition-transform shadow-md cursor-pointer border border-[#2E2882]/10 z-20"
        >
          <ChevronLeft size={20} strokeWidth={4} />
        </button>

        {/* Title */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
          <GameTitle 
            text="ROOMS" 
            type="skip" 
            className="text-[34px] sm:text-[36px]" 
          />
        </div>

        {/* Spacer for symmetry */}
        <div className="w-10 h-10 pointer-events-none invisible" />
      </div>

      {/* White/Light-purple Room Card */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full bg-[#ECEBFC] p-4 sm:p-6 rounded-[32px] relative border-2 border-white/60 flex flex-col flex-1 mt-10 mb-4 sm:mt-12 sm:mb-6 text-[#2E2882] overflow-hidden min-h-[250px] shrink-0"
      >
        {/* List - Positioned cleanly at the top of the white container */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 no-scrollbar">
          {sortedPresets.map((preset) => {
            const currentCount = roomStats[preset.id]?.count ?? 0;
            const max = roomStats[preset.id]?.max ?? preset.maxPlayers;
            const hasPlayers = currentCount > 0;
            return (
              <button 
                key={preset.id}
                onClick={() => onSelectRoom(preset.id)}
                className={`w-full p-5 sm:p-6 rounded-[28px] flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer ${
                  hasPlayers
                    ? "bg-white hover:bg-slate-50 border-2 border-[#38BDF8]/60 hover:border-[#38BDF8] text-[#2E2882] group"
                    : "bg-[#DCD8F5] hover:bg-[#E3E0F8] border border-[#2E2882]/15 hover:border-[#2E2882]/30 text-[#373070] group"
                }`}
              >
                <div className="flex flex-col items-start">
                  <span className={`text-lg sm:text-xl transition-colors flex items-center gap-2 ${
                    hasPlayers
                      ? "text-[#2E2882] group-hover:text-[#38BDF8]"
                      : "text-[#373070] group-hover:text-[#2E2882]"
                  }`}>
                    <span className="font-black">{preset.name}</span>
                    <span className="font-medium">{preset.tag}</span>
                  </span>
                </div>
                <div className={`flex items-center gap-1.5 font-black text-base sm:text-lg px-1 ${
                  hasPlayers ? "text-[#0284C7]" : "text-[#4F4788]"
                }`}>
                  <Users size={20} strokeWidth={3.5} className={hasPlayers ? "text-[#0284C7]" : "text-[#625A9E]"} />
                  <span>{currentCount}/{max}</span>
                </div>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Bottom New Room button OUTSIDE the white card */}
      <div className="relative w-full flex flex-col items-center mt-auto mb-2 shrink-0">
        <AnimatePresence>
          {newRoomNotice && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.94 }}
              transition={{ duration: 0.18 }}
              className="absolute -top-9 left-1/2 -translate-x-1/2 z-50 bg-[#1E1B4B] text-white text-xs font-bold px-3.5 py-1.5 rounded-full border border-white/20 flex items-center gap-1.5 pointer-events-none whitespace-nowrap"
              dir="rtl"
            >
              <span>{newRoomNotice}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={onNewRoomClick}
          className="w-[85%] sm:w-[75%] max-w-[320px] mx-auto h-12 [@media(min-height:600px)]:h-14 sm:h-16 bg-[#38BDF8] hover:bg-[#0EA5E9] text-white rounded-[24px] font-black text-base [@media(min-height:600px)]:text-lg sm:text-xl flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-lg"
        >
          <Plus size={22} strokeWidth={4} />
          <span>NEW ROOM</span>
        </button>
      </div>
    </div>
  );
}
