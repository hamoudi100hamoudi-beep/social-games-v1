import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Clock, Pencil, User as UserIcon, AlertTriangle } from "lucide-react";
import GameTitle from "./GameTitle";

interface Player {
  id: string;
  persistentId?: string;
  name: string;
  avatar: string;
  points: number | null;
  isEmpty?: boolean;
}

interface MiniBoardOverlayProps {
  gameState: any;
  amIDrawer: boolean;
  currentPlayers: Player[];
  getCurrentDrawerName: () => string;
}

export function MiniBoardOverlay({
  gameState,
  amIDrawer,
  currentPlayers,
  getCurrentDrawerName,
}: MiniBoardOverlayProps) {
  // We use this z-index to overlay inside the DrawingBoard
  const containerClass = "absolute inset-0 z-[40] flex flex-col items-center justify-center bg-white pointer-events-auto p-2 sm:p-4 select-none font-sans overflow-y-auto min-h-0";

  const wasPodium = React.useRef(false);
  const playPodiumAnimations = React.useRef(true);
  
  if (gameState.status === "PODIUM" && !wasPodium.current) {
    // Only play intro animations if we entered the podium phase early enough (e.g. at the very start)
    playPodiumAnimations.current = gameState.timeLeft >= 13;
  }
  wasPodium.current = gameState.status === "PODIUM";

  const getAnimClass = (className: string) => playPodiumAnimations.current ? className : "";

  return (
    <AnimatePresence mode="wait">
      {/* 1. WAITING FOR PLAYERS */}
      {gameState.status === "WAITING" && (
        <motion.div
          key="waiting-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={containerClass}
        >
          <div className="text-center w-full max-w-sm my-auto py-2">
            <div className="mb-2 sm:mb-4">
              <GameTitle text="WAITING" type="miniboard" className="text-[20px] sm:text-[26px]" />
            </div>
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 mb-3 mx-auto bg-sky-100 rounded-full flex items-center justify-center border-3 sm:border-4 border-[#0B2E5C]/10 shadow-inner">
              <span className="text-3xl sm:text-5xl animate-pulse">⏳</span>
              <span className="absolute -top-1 -right-1 text-base sm:text-xl animate-bounce">⏰</span>
            </div>
            <p className="text-[#728299] text-sm sm:text-base font-bold tracking-wide">
              Waiting for players
            </p>
          </div>
        </motion.div>
      )}

      {/* 2. CHOOSING (Guesser View) */}
      {gameState.status === "CHOOSING" && !amIDrawer && (
        <motion.div
          key="choosing-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={containerClass}
        >
          <div className="text-center w-full max-w-sm my-auto py-2">
            <div className="mb-2 sm:mb-4">
              <GameTitle text="NEW TURN!" type="miniboard" className="text-[20px] sm:text-[26px]" />
            </div>

            <div className="relative w-max mx-auto mb-3 sm:mb-4">
              <div className="w-18 h-18 sm:w-24 sm:h-24 bg-[#FFD13B] border-[4px] sm:border-[5px] border-[#0A2540] rounded-full flex items-center justify-center shadow-lg overflow-hidden">
                <span className="text-4xl sm:text-6xl">
                  {
                    currentPlayers.find(
                      (p) =>
                        p.persistentId === gameState.currentDrawerId ||
                        p.id === gameState.currentDrawerId
                    )?.avatar
                  }
                </span>
              </div>
            </div>

            <p className="text-[#728299] text-xs sm:text-base font-bold mb-0.5">
              It's the turn of
            </p>
            <h3 className="text-[#0B2E5C] font-black text-base sm:text-2xl tracking-wide">
              {getCurrentDrawerName()}
            </h3>
          </div>
        </motion.div>
      )}

      {/* 3. ROUND END */}
      {gameState.status === "ROUND_END" &&
        (() => {
          const reason = gameState.roundEndReason;
          const word = gameState.roundEndWord || "";
          const drawerName = getCurrentDrawerName() || "الرسام";
          const hasSucceeded = (gameState.correctGuessers || []).length > 0;

          // 3.1. SKIPPED STATE
          if (reason === "skipped") {
            return (
              <motion.div key="round-end-skipped" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={containerClass}>
                <div className="text-center w-full max-w-sm my-auto py-2">
                  <div className="mb-2 sm:mb-4">
                    <GameTitle text="SKIPPED!" type="miniboard" className="text-[20px] sm:text-[26px]" />
                  </div>
                  <div className="relative w-16 h-16 sm:w-22 sm:h-22 mx-auto bg-green-50 rounded-full flex items-center justify-center border-3 sm:border-4 border-green-100 shadow-sm mb-3 sm:mb-4">
                    <span className="text-4xl sm:text-6xl animate-bounce">✏️</span>
                    <span className="absolute -bottom-1 -right-1 text-xl sm:text-2xl animate-spin">💫</span>
                  </div>
                  <h3 className="text-[#728299] font-bold text-xs sm:text-base tracking-wide mb-0.5" dir="auto">
                    {amIDrawer ? "You've skipped the turn" : `${drawerName} skipped the turn`}
                  </h3>
                </div>
              </motion.div>
            );
          }

          // 3.2. TURN LOST / INACTIVE STATE
          if (reason === "turn_lost") {
            return (
              <motion.div key="round-end-lost" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={containerClass}>
                <div className="text-center w-full max-w-sm my-auto py-2">
                  <div className="mb-2 sm:mb-4">
                    <GameTitle text="INACTIVE" type="miniboard" className="text-[20px] sm:text-[26px]" />
                  </div>
                  <div className="relative w-16 h-16 sm:w-22 sm:h-22 mx-auto bg-amber-50 rounded-full flex items-center justify-center border-3 sm:border-4 border-amber-100 shadow-sm mb-3 sm:mb-4">
                    <span className="text-4xl sm:text-6xl animate-pulse">💤</span>
                    <span className="absolute -bottom-1 -right-1 text-xl sm:text-2xl">⏰</span>
                  </div>
                  <h3 className="text-[#728299] font-bold text-xs sm:text-base tracking-wide mb-0.5" dir="auto">
                    {amIDrawer ? "You've lost your turn :(" : `${drawerName} has lost the turn`}
                  </h3>
                </div>
              </motion.div>
            );
          }

          // 3.3. CANCELED STATE
          if (reason === "canceled") {
            return (
              <motion.div key="round-end-canceled" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={containerClass}>
                <div className="text-center w-full max-w-sm my-auto py-2">
                  <div className="mb-2 sm:mb-4">
                    <GameTitle text="CANCELED TURN" type="miniboard" className="text-[18px] sm:text-[24px]" />
                  </div>

                  <div className="mb-3 sm:mb-4 flex justify-center">
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
                      <AlertTriangle className="w-14 h-14 sm:w-20 sm:h-20 text-[#EF4444] fill-[#EF4444]/5" strokeWidth={2.5} />
                    </motion.div>
                  </div>

                  <p className="text-[#728299] text-xs sm:text-base font-bold mb-0.5" dir="auto">
                    Users score has been canceled
                  </p>
                  <p className="text-[#728299]/70 text-[11px] sm:text-xs font-bold" dir="auto">
                    لقد تم إلغاء نقاط الدور
                  </p>
                </div>
              </motion.div>
            );
          }

          // 3.4. INTERVAL / STANDARD ROUND END
          let titleText = "INTERVAL";
          let subTitle = "Take a while to relax";
          let bottomText = "";

          if (reason === "all_guessed") {
            titleText = "MASTERPIECE!";
            subTitle = "";
            bottomText = "Everybody hit the answer!";
          } else if (reason === "timeout" || reason === "drawer_left") {
            bottomText = hasSucceeded ? "" : "Nobody hit the answer :(";
          }

          return (
            <motion.div key="round-end-interval" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={containerClass}>
              <div className="text-center w-full max-w-sm my-auto py-2">
                <div className={subTitle ? "mb-1" : "mb-2 sm:mb-4"}>
                  <GameTitle text={titleText} type="miniboard" className="text-[20px] sm:text-[26px]" />
                </div>

                {subTitle && (
                  <p className="text-[#728299] text-xs sm:text-base font-bold mb-2 sm:mb-4" dir="auto">
                    {subTitle}
                  </p>
                )}

                <div className="relative w-16 h-16 sm:w-22 sm:h-22 mx-auto bg-sky-50 rounded-full flex items-center justify-center border-3 sm:border-4 border-sky-150 shadow-sm mb-3 sm:mb-4">
                  <span className="text-4xl sm:text-6xl animate-bounce">🎨</span>
                  <span className="absolute -top-1 -right-1 text-xl sm:text-2xl">✨</span>
                </div>

                {bottomText && (
                  <p className="text-[#728299] text-xs sm:text-base font-bold mb-2" dir="auto">
                    {bottomText}
                  </p>
                )}

                {word && hasSucceeded && reason !== "all_guessed" && (
                  <div className="text-center">
                    <span className="text-[#728299] text-[12px] sm:text-sm font-bold block mb-0.5">
                      The answer was:
                    </span>
                    <span className="text-[#0B2E5C] text-base sm:text-2xl font-black tracking-wide inline-block drop-shadow-sm" dir="auto">
                      {word}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })()}

      {/* 4. PODIUM STATE */}
      {gameState.status === "PODIUM" &&
        (() => {
          const sorted = currentPlayers.filter((p) => !p.isEmpty);
          const first = sorted[0];
          const second = sorted[1];
          const third = sorted[2];
          const restOfPlayers = sorted.slice(3);

          let crownDelay = "2.0s";
          if (third) {
            crownDelay = "4.6s";
          } else if (second) {
            crownDelay = "3.4s";
          }

          return (
            <motion.div
              key="podium-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[50] flex flex-col items-center justify-center bg-[#F3F4F6] p-1.5 sm:p-4 font-sans select-none overflow-y-auto min-h-0"
            >
              <style>{`
                @keyframes medal-shine {
                  0% { transform: translateX(-150%) rotate(25deg); opacity: 0; }
                  5% { opacity: 1; }
                  15% { transform: translateX(150%) rotate(25deg); opacity: 0; }
                  100% { transform: translateX(150%) rotate(25deg); opacity: 0; }
                }
                .animate-medal-shine {
                  animation: medal-shine 5s ease-in-out infinite;
                }
                @keyframes podiumPop {
                  0% { transform: scale(0); opacity: 0; }
                  70% { transform: scale(1.1); }
                  90% { transform: scale(0.97); }
                  100% { transform: scale(1); opacity: 1; }
                }
                .animate-podium-pop {
                  animation: podiumPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
                }
                @keyframes badgePop {
                  0% { transform: translateX(-50%) scale(0); opacity: 0; }
                  70% { transform: translateX(-50%) scale(1.35); }
                  90% { transform: translateX(-50%) scale(0.97); }
                  100% { transform: translateX(-50%) scale(1); opacity: 1; }
                }
                .animate-badge-pop {
                  animation: badgePop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
                }
                @keyframes crownFall {
                  0% { transform: translateY(-120px); opacity: 0; animation-timing-function: ease-in; }
                  40% { transform: translateY(0px); opacity: 1; animation-timing-function: ease-out; }
                  65% { transform: translateY(-12px); animation-timing-function: ease-in; }
                  82% { transform: translateY(0px); animation-timing-function: ease-out; }
                  92% { transform: translateY(-3px); animation-timing-function: ease-in; }
                  100% { transform: translateY(0px); opacity: 1; }
                }
                .animate-crown-fall {
                  animation: crownFall 0.7s both;
                }
                @keyframes fadeUp {
                  from { opacity: 0; transform: translateY(10px); }
                  to { opacity: 1; transform: translateY(0); }
                }
                .animate-pop {
                  animation: fadeUp 0.5s ease-out both;
                }
              `}</style>
              
              <div className="flex flex-col items-center flex-1 shrink-0 w-full justify-center my-auto">
                <motion.div 
                  initial={{ y: -150, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ ease: [0.1, 0.9, 0.2, 1], duration: 0.85 }}
                  className="mt-1 sm:mt-3 mb-1 sm:mb-3 w-full flex justify-center drop-shadow-md shrink-0"
                >
                  <GameTitle text="GAME OVER" type="miniboard" className="text-[18px] sm:text-[26px]" />
                </motion.div>

                <div className="relative w-full max-w-[340px] sm:max-w-[420px] h-[145px] sm:h-[205px] mx-auto flex items-end justify-center gap-1 sm:gap-3 px-1 sm:px-4 z-20 shrink-0">
                  {/* 2nd Place */}
                  <div className="w-[31%] flex flex-col items-center justify-end relative h-[85%] group z-20">
                    {second ? (
                      <>
                        <div className={`relative mb-1 w-fit mx-auto ${getAnimClass("animate-podium-pop")}`} style={{ animationDelay: '2.4s' }}>
                          <div className="w-14 h-14 sm:w-22 sm:h-22 rounded-full bg-[#E2E8F0] flex items-center justify-center text-3xl sm:text-5xl border-[3px] sm:border-[4px] border-[#0A2540] shadow-md overflow-hidden relative">
                            <span className="select-none">{second.avatar}</span>
                          </div>
                          <div 
                            className={`absolute -bottom-1 sm:-bottom-1.5 inset-x-0 mx-auto w-4.5 h-4.5 sm:w-7 sm:h-7 rounded-full bg-gradient-to-b from-[#F1F5F9] via-[#CBD5E1] to-[#64748B] border-[1.5px] sm:border-[2px] border-[#0A2540] flex items-center justify-center shadow-md text-[#0A2540] font-extrabold text-[10px] sm:text-xs z-20 overflow-hidden ${getAnimClass("animate-badge-pop")}`}
                            style={{ animationDelay: '2.9s' }}
                          >
                            2
                            <div className="absolute inset-0 bg-white/40 animate-medal-shine z-10" />
                          </div>
                        </div>
                        <div className={`text-center mb-0.5 px-0.5 w-full ${getAnimClass("animate-pop")}`} style={{ animationDelay: '2.6s' }}>
                          <span className="text-[#0A2540] font-black text-[12px] sm:text-[15px] truncate block w-full">
                            {second.name}
                          </span>
                          <span className="text-slate-500 font-extrabold text-[9px] sm:text-[11px] block leading-none">
                            {second.points} pts
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="w-full" />
                    )}
                  </div>

                  {/* 1st Place */}
                  <div className="w-[38%] flex flex-col items-center justify-end relative h-[118%] group z-30">
                    {first ? (
                      <>
                        <div className={`relative mb-1.5 w-fit mx-auto ${getAnimClass("animate-podium-pop")}`} style={{ animationDelay: '1.0s' }}>
                          {/* Crown - inside relative avatar wrapper for perfect centering */}
                          <div 
                            className={`absolute -top-[22px] sm:-top-[30px] inset-x-0 mx-auto w-fit z-40 ${getAnimClass("animate-crown-fall")} drop-shadow-md flex justify-center`} 
                            style={{ animationDelay: crownDelay }}
                          >
                            <span className="text-[20px] sm:text-[28px] select-none">👑</span>
                          </div>

                          <div className="w-18 h-18 sm:w-26 sm:h-26 rounded-full bg-[#FFD13B] flex items-center justify-center text-4xl sm:text-6xl border-[3px] sm:border-[5px] border-[#0A2540] shadow-lg overflow-hidden relative group-hover:scale-105 transition-transform duration-300">
                            <span className="select-none">{first.avatar}</span>
                          </div>
                          <div 
                            className={`absolute -bottom-1.5 inset-x-0 mx-auto w-5.5 h-5.5 sm:w-8 sm:h-8 rounded-full bg-gradient-to-b from-[#FFF3C2] via-[#FFD700] to-[#B8860B] border-[2px] sm:border-[2.5px] border-[#0A2540] flex items-center justify-center shadow-xl text-white font-black text-[11px] sm:text-xs z-20 overflow-hidden ${getAnimClass("animate-badge-pop")}`}
                            style={{ animationDelay: '1.5s' }}
                          >
                            1
                            <div className="absolute inset-0 bg-white/50 animate-medal-shine z-10" />
                          </div>
                        </div>
                        <div className={`text-center mb-0.5 px-0.5 w-full ${getAnimClass("animate-pop")}`} style={{ animationDelay: '1.2s' }}>
                          <span className="text-[#0A2540] font-black text-[13px] sm:text-[18px] truncate block w-full drop-shadow-sm">
                            {first.name}
                          </span>
                          <span className="text-yellow-600 font-black text-[10px] sm:text-[12px] block leading-none">
                            {first.points} pts
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="w-full" />
                    )}
                  </div>

                  {/* 3rd Place */}
                  <div className="w-[31%] flex flex-col items-center justify-end relative h-[85%] group z-10">
                    {third ? (
                      <>
                        <div className={`relative mb-1 w-fit mx-auto ${getAnimClass("animate-podium-pop")}`} style={{ animationDelay: '3.6s' }}>
                          <div className="w-14 h-14 sm:w-22 sm:h-22 rounded-full bg-[#FFB074] flex items-center justify-center text-3xl sm:text-5xl border-[3px] sm:border-[4px] border-[#0A2540] shadow-md overflow-hidden relative">
                            <span className="select-none">{third.avatar}</span>
                          </div>
                          <div 
                            className={`absolute -bottom-1 sm:-bottom-1.5 inset-x-0 mx-auto w-4.5 h-4.5 sm:w-7 sm:h-7 rounded-full bg-gradient-to-b from-[#FFEDD5] via-[#FB923C] to-[#C2410C] border-[1.5px] sm:border-[2px] border-[#0A2540] flex items-center justify-center shadow-lg text-white font-extrabold text-[10px] sm:text-xs z-20 overflow-hidden ${getAnimClass("animate-badge-pop")}`}
                            style={{ animationDelay: '4.1s' }}
                          >
                            3
                            <div className="absolute inset-0 bg-white/30 animate-medal-shine z-10" />
                          </div>
                        </div>
                        <div className={`text-center mb-0.5 px-0.5 w-full ${getAnimClass("animate-pop")}`} style={{ animationDelay: '3.8s' }}>
                          <span className="text-[#0A2540] font-black text-[12px] sm:text-[15px] truncate block w-full">
                            {third.name}
                          </span>
                          <span className="text-orange-600 font-extrabold text-[9px] sm:text-[11px] block leading-none">
                            {third.points} pts
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="w-full" />
                    )}
                  </div>
                </div>
              </div>

              {/* Scrollable list for 4th Rank and below */}
              {restOfPlayers.length > 0 && (
                <div className="w-full max-w-[340px] sm:max-w-md mx-auto mt-1 sm:mt-2 mb-1 px-2 bg-white/60 backdrop-blur-sm rounded-xl p-1.5 border border-slate-200/80 shadow-inner z-10 shrink-0">
                  <p className="text-center text-[#0B2E5C] font-extrabold text-[10px] sm:text-xs uppercase tracking-wider mb-0.5">
                    بقية قائمة المتصدرين
                  </p>
                  <div className="flex flex-col gap-1 max-h-[60px] sm:max-h-[90px] overflow-y-auto pr-1">
                    {restOfPlayers.map((p, idx) => (
                      <div key={p.id} className="flex items-center justify-between text-slate-700 bg-white/40 p-1 sm:p-1.5 rounded-lg text-[10px] sm:text-xs font-bold border border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400"># {idx + 4}</span>
                          <span>{p.avatar}</span>
                          <span>{p.name}</span>
                        </div>
                        <span className="text-slate-500">{p.points} Pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })()}
    </AnimatePresence>
  );
}

