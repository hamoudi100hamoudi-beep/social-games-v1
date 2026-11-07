import React from "react";
import {
  Zap,
  AlertTriangle,
  Check,
  Clock,
  Pencil,
  Info,
} from "lucide-react";

export interface GameActivityMessage {
  id: string;
  sender: string;
  senderId?: string;
  text: string;
  isSelf: boolean;
  type: "message" | "system";
  subType?: string;
  word?: string;
}

export interface GameActivityFeedProps {
  guesses: GameActivityMessage[];
  socketId: string | null;
  amIDrawer: boolean;
  isFreeDraw: boolean;
}

export function GameActivityFeed({
  guesses,
  socketId,
  amIDrawer,
  isFreeDraw,
}: GameActivityFeedProps) {
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-3 flex flex-col-reverse font-sans min-h-0 bg-transparent">
      <div className="flex flex-col-reverse gap-2">
        {[...guesses].reverse().map((msg) => {
          const isSystem = msg.type === "system";
          if (isSystem) {
            const subType = msg.subType || "";
            const text = msg.text;

            // Close guess warning
            if (subType === "close") {
              const displayWord = msg.word || "";
              return (
                <div
                  key={msg.id}
                  className="flex items-center gap-2 text-amber-500 font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <Zap size={15} className="text-amber-500 fill-amber-500 shrink-0" />
                  <span dir="auto" className="flex items-center gap-1">
                    <span className="text-amber-500 font-extrabold">{displayWord}</span>
                    <span className="text-amber-500/90 font-normal">is close!</span>
                  </span>
                </div>
              );
            }

            // Drawing report warning log
            if (subType === "report") {
              return (
                <div
                  key={msg.id}
                  className="flex items-center gap-2 text-[#EF4444] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <AlertTriangle
                    size={14}
                    className="text-[#EF4444] shrink-0 font-extrabold"
                  />
                  <span dir="auto" className="flex items-center gap-1">
                    <span className="text-[#EF4444] font-extrabold">{msg.sender}</span>
                    <span className="text-[#EF4444] font-normal">reported!</span>
                  </span>
                </div>
              );
            }

            // Drawing canceled turn log
            if (subType === "canceled") {
              return (
                <div
                  key={msg.id}
                  className="flex items-center gap-2 text-[#EF4444] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <AlertTriangle
                    size={14}
                    className="text-[#EF4444] shrink-0 font-extrabold"
                  />
                  <span dir="auto" className="text-[#EF4444] font-normal">Canceled turn</span>
                </div>
              );
            }

            // Hit / guessed correctly
            if (subType === "hit") {
              const isSelfGuesser = msg.senderId === socketId;
              const displayWord = msg.word || "";
              return (
                <div
                  key={msg.id}
                  className="flex items-center gap-2 text-[#00E540] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <Check
                    size={14}
                    className="stroke-[3.5] text-[#00E540] shrink-0"
                  />
                  {isSelfGuesser ? (
                    <span dir="auto" className="font-normal text-[#00E540]">
                      You've found the answer: <span className="font-extrabold text-[#00E540]">{displayWord}</span>
                    </span>
                  ) : (
                    <span dir="auto" className="font-normal text-[#00E540]">
                      <span className="font-extrabold text-[#00E540]">{msg.sender || text.replace(" guessed the word!", "")}</span> hit!
                    </span>
                  )}
                </div>
              );
            }

            // Round End break / Interval
            if (subType === "interval") {
              return (
                <div
                  key={msg.id}
                  className="flex items-center gap-2 text-[#1AD2FF] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <Clock
                    size={14}
                    className="text-[#1AD2FF] shrink-0"
                  />
                  <span className="font-normal text-[#1AD2FF]">Interval...</span>
                </div>
              );
            }

            // Turn change
            if (subType === "turn") {
              const match = text.match(/^(Turn of\s+)(.+)$/i);
              return (
                <div
                  key={msg.id}
                  className="flex items-center gap-2 text-[#1AD2FF] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <Pencil
                    size={12}
                    className="text-[#1AD2FF] shrink-0"
                  />
                  {match ? (
                    <span dir="auto" className="text-[#1AD2FF]">
                      Turn of <span className="font-extrabold text-[#1AD2FF]">{match[2]}</span>
                    </span>
                  ) : (
                    <span dir="auto" className="text-[#1AD2FF]">{text}</span>
                  )}
                </div>
              );
            }

            // Game over
            if (subType === "game_over") {
              return (
                <div
                  key={msg.id}
                  className="flex items-start gap-2 text-[#1AD2FF] font-normal text-sm sm:text-base py-1 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <Info
                    size={14}
                    className="text-[#1AD2FF] shrink-0 mt-0.5"
                  />
                  <span dir="auto" className="font-normal">{text}</span>
                </div>
              );
            }

            // Everybody hit
            if (subType === "all_guessed") {
              return (
                <div
                  key={msg.id}
                  className="flex items-center gap-2 text-[#00E540] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <Check
                    size={14}
                    className="stroke-[3.5] text-[#00E540] shrink-0"
                  />
                  <span className="font-normal">Everybody hit the answer!</span>
                </div>
              );
            }

            // Lost turn / Inactive
            if (
              subType === "lost_turn" ||
              text.toLowerCase().includes("lost the turn") ||
              text.toLowerCase().includes("lost your turn")
            ) {
              const isDrawerSelf = amIDrawer;
              const displayText = isDrawerSelf
                ? "You've lost your turn"
                : text;
              return (
                <div
                  key={msg.id}
                  className="flex items-center gap-2 text-[#EF4444] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <AlertTriangle
                    size={14}
                    className="text-[#EF4444] shrink-0"
                  />
                  <span dir="auto" className="font-normal">{displayText}</span>
                </div>
              );
            }

            // Other reveals
            const isNobodyHit = text.toLowerCase().includes("nobody hit");
            let iconNode = (
              <Info size={14} className="shrink-0 text-[#1AD2FF]" />
            );
            let textColor = "#1AD2FF";

            if (
              !isNobodyHit && (
                text.toLowerCase().includes("hit") ||
                text.toLowerCase().includes("guessed") ||
                text.toLowerCase().includes("guessed the word")
              )
            ) {
              iconNode = (
                <Check
                  size={14}
                  className="stroke-[3.5] text-[#00E540] shrink-0"
                />
              );
              textColor = "#00E540";
            } else if (text.toLowerCase().includes("turn") || isNobodyHit) {
              iconNode = (
                <Pencil size={12} className="shrink-0 text-[#1AD2FF]" />
              );
              textColor = "#1AD2FF";
            } else if (text.toLowerCase().includes("interval")) {
              iconNode = (
                <Clock size={14} className="shrink-0 text-[#1AD2FF]" />
              );
              textColor = "#1AD2FF";
            } else if (
              text.toLowerCase().includes("timeout") ||
              text.toLowerCase().includes("time's up") ||
              text.toLowerCase().includes("answer was")
            ) {
              iconNode = (
                <Pencil size={12} className="shrink-0 text-[#1AD2FF]" />
              );
              textColor = "#1AD2FF";
            }

            return (
              <div
                key={msg.id}
                className="flex items-center gap-2 font-normal text-sm sm:text-base py-0.5"
                style={{ color: textColor }}
              >
                {iconNode}
                <span dir="auto">{text}</span>
              </div>
            );
          }

          return (
            <div key={msg.id} className="text-sm sm:text-base">
              <div className="flex items-start gap-1">
                <span className="font-extrabold text-[#F3F4F6] shrink-0">
                  {msg.sender}:
                </span>
                <span
                  className={`${msg.isSelf ? "text-white" : "text-slate-300"} font-normal break-words`}
                  dir="auto"
                  style={{ unicodeBidi: "plaintext" }}
                >
                  {msg.text}
                </span>
              </div>
            </div>
          );
        })}
        {!isFreeDraw && (
          <div className="flex items-center gap-1.5 text-primary-brand font-normal text-sm sm:text-base">
            <Info size={14} />
            Waiting for players
          </div>
        )}
      </div>
    </div>
  );
}
