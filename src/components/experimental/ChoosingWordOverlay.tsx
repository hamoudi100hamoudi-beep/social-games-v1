import React from "react";
import { Pencil } from "lucide-react";
import GameTitle from "../game/GameTitle";
import { useAppTranslation } from "../../i18n/useAppTranslation";

interface ChoosingWordOverlayProps {
  wordOptions?: string[];
  onSelectWord: (word: string) => void;
}

export function ChoosingWordOverlay({
  wordOptions,
  onSelectWord,
}: ChoosingWordOverlayProps) {
  const { t, isRTL } = useAppTranslation("wordChoice");

  return (
    <div className="fixed inset-0 z-[500] bg-black/70 flex flex-col items-center px-4 sm:px-6 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.75rem))] pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.75rem))] overflow-y-auto touch-pan-y">
      <div className="w-full max-w-md text-center shrink-0 pt-1 sm:pt-3 pb-3 sm:pb-5">
        <GameTitle
          text={t("title")}
          type="report"
          arabicDisplay={isRTL}
          className="text-[28px] sm:text-[38px]"
        />
        <p
          dir={isRTL ? "rtl" : "ltr"}
          className="text-white/85 text-base sm:text-xl font-semibold mt-3 sm:mt-4"
        >
          {t("prompt")}
        </p>
      </div>

      <div className="flex-1 w-full max-w-md flex flex-col items-center justify-center py-2 sm:py-4">
        {wordOptions && wordOptions.length >= 2 && (
          <div className="w-full space-y-4 sm:space-y-6">
            <div className="flex flex-col items-center">
              <span
                className="text-white text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 text-center break-words max-w-full"
                dir="auto"
              >
                {wordOptions[0]}
              </span>
              <button
                type="button"
                onClick={() => onSelectWord(wordOptions[0])}
                className="w-[85%] max-w-xs bg-[#EA580C] hover:bg-[#C2410C] active:bg-[#9A3412] text-[#0A1A38] font-black py-3.5 sm:py-4 rounded-full flex items-center justify-center gap-3 active:scale-95 transition-[transform,background-color] duration-100 ease-out text-lg sm:text-xl cursor-pointer"
              >
                <Pencil fill="none" size={24} strokeWidth={2.5} className="text-white shrink-0" />
                <span dir={isRTL ? "rtl" : "ltr"}>{t("drawButton")}</span>
              </button>
            </div>

            <div className="flex items-center w-full relative py-1 sm:py-2">
              <div className="flex-1 border-t border-white/20 h-px"></div>
              <span
                dir={isRTL ? "rtl" : "ltr"}
                className="px-4 text-white/60 font-bold bg-transparent text-base sm:text-lg"
              >
                {t("orDivider")}
              </span>
              <div className="flex-1 border-t border-white/20 h-px"></div>
            </div>

            <div className="flex flex-col items-center">
              <span
                className="text-white text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 text-center break-words max-w-full"
                dir="auto"
              >
                {wordOptions[1]}
              </span>
              <button
                type="button"
                onClick={() => onSelectWord(wordOptions[1])}
                className="w-[85%] max-w-xs bg-[#EA580C] hover:bg-[#C2410C] active:bg-[#9A3412] text-[#0A1A38] font-black py-3.5 sm:py-4 rounded-full flex items-center justify-center gap-3 active:scale-95 transition-[transform,background-color] duration-100 ease-out text-lg sm:text-xl cursor-pointer"
              >
                <Pencil fill="none" size={24} strokeWidth={2.5} className="text-white shrink-0" />
                <span dir={isRTL ? "rtl" : "ltr"}>{t("drawButton")}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
