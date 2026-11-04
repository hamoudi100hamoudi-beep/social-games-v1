import React from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';

interface AvatarCarouselProps {
  selectedEmoji: string;
  isKeyboardOpen: boolean;
  onPrevAvatar: () => void;
  onNextAvatar: () => void;
  onOpenGrid: () => void;
}

export default function AvatarCarousel({
  selectedEmoji,
  isKeyboardOpen,
  onPrevAvatar,
  onNextAvatar,
  onOpenGrid,
}: AvatarCarouselProps) {
  return (
    <div className={`flex flex-col items-center w-full ${isKeyboardOpen ? 'gap-1.5' : 'gap-2'}`}>
      <div className="flex items-center justify-between w-full relative max-w-[280px] sm:max-w-[320px]">
        <button 
          type="button"
          onClick={onPrevAvatar}
          className={`bg-white hover:bg-slate-50 border border-[#2E2882]/10 rounded-full flex items-center justify-center transition-all active:scale-90 text-[#2E2882] shadow-sm cursor-pointer ${isKeyboardOpen ? 'w-10 h-10' : 'w-11 h-11'}`}
        >
          <ChevronLeft strokeWidth={3.5} className="w-5 h-5" />
        </button>
        
        <div className="relative group cursor-pointer" onClick={onOpenGrid}>
          <div className={`rounded-full bg-white border-4 border-[#38BDF8] flex items-center justify-center shadow-md hover:scale-105 transition-transform select-none overflow-hidden ${
            isKeyboardOpen 
              ? "w-[85px] h-[85px]" 
              : "w-[85px] h-[85px] [@media(min-height:600px)]:w-32 [@media(min-height:600px)]:h-32 sm:w-36 sm:h-36"
          }`}>
            <span className={`leading-none flex items-center justify-center select-none ${
              isKeyboardOpen 
                ? "text-[55px] translate-y-1" 
                : "text-[55px] [@media(min-height:600px)]:text-[80px] sm:text-[96px] translate-y-1 sm:translate-y-2"
            }`}>{selectedEmoji}</span>
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-full">
               <LayoutGrid className="text-white" size={isKeyboardOpen ? 24 : 28} />
            </div>
          </div>
          {/* Small grid badge */}
          <div className={`absolute -bottom-1 -right-1 bg-[#38BDF8] rounded-full border-2 border-white text-white shadow-md transition-all hover:scale-110 active:scale-95 ${isKeyboardOpen ? 'p-1.5' : 'p-2'}`}>
            <LayoutGrid size={isKeyboardOpen ? 14 : 16} strokeWidth={3} />
          </div>
        </div>
        
        <button 
          type="button"
          onClick={onNextAvatar}
          className={`bg-white hover:bg-slate-50 border border-[#2E2882]/10 rounded-full flex items-center justify-center transition-all active:scale-90 text-[#2E2882] shadow-sm cursor-pointer ${isKeyboardOpen ? 'w-10 h-10' : 'w-11 h-11'}`}
        >
          <ChevronRight strokeWidth={3.5} className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
