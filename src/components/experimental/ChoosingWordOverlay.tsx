import React from "react";
import { Pencil } from "lucide-react";

interface ChoosingWordOverlayProps {
  wordOptions?: string[];
  onSelectWord: (word: string) => void;
}

export function ChoosingWordOverlay({
  wordOptions,
  onSelectWord,
}: ChoosingWordOverlayProps) {
  return (
    <div className="fixed inset-0 z-[500] bg-black/70 flex items-center justify-center p-4 touch-none">
      <div className="text-center w-full max-w-md px-6 animate-in fade-in zoom-in-95 duration-300">
        <h2 className="text-[#FBBF24] text-3xl sm:text-4xl font-black mb-2 drop-shadow-md tracking-wide">
          IT'S YOUR TURN!
        </h2>
        <p className="text-white/80 text-lg sm:text-xl mb-12">
          Choose a word to draw
        </p>

        {wordOptions && wordOptions.length >= 2 && (
          <div className="space-y-6">
            <div className="flex flex-col items-center">
              <span
                className="text-white text-3xl font-bold mb-4 drop-shadow-lg"
                dir="auto"
              >
                {wordOptions[0]}
              </span>
              <button
                onClick={() => onSelectWord(wordOptions[0])}
                className="w-[85%] max-w-xs bg-accent-brand hover:bg-accent-brand-dark text-bg-dark-brand font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-[0_4px_14px_0_rgba(251,191,36,0.39)] active:scale-95 transition-all text-xl"
              >
                <Pencil fill="currentColor" size={24} />
                DRAW
              </button>
            </div>

            <div className="flex items-center w-full relative py-2">
              <div className="flex-1 border-t border-white/20 h-px"></div>
              <span className="px-4 text-white/50 font-bold bg-transparent text-lg">
                OR
              </span>
              <div className="flex-1 border-t border-white/20 h-px"></div>
            </div>

            <div className="flex flex-col items-center">
              <span
                className="text-white text-3xl font-bold mb-4 drop-shadow-lg"
                dir="auto"
              >
                {wordOptions[1]}
              </span>
              <button
                onClick={() => onSelectWord(wordOptions[1])}
                className="w-[85%] max-w-xs bg-accent-brand hover:bg-accent-brand-dark text-bg-dark-brand font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-[0_4px_14px_0_rgba(251,191,36,0.39)] active:scale-95 transition-all text-xl"
              >
                <Pencil fill="currentColor" size={24} />
                DRAW
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
