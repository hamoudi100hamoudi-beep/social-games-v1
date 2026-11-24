import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Trans } from "react-i18next";
import { Clock, Pencil, User as UserIcon, AlertTriangle } from "lucide-react";
import GameTitle from "./GameTitle";
import WaitingSprite from "./WaitingSprite";
import AllGuessedSprite from "./AllGuessedSprite";
import AllGuessedRareSprite from "./AllGuessedRareSprite";
import NoOneGuessed2Sprite from "./NoOneGuessed2Sprite";
import TurnLostSprite from "./TurnLostSprite";
import SkippedSprite from "./SkippedSprite";
import PartialGuessedSprite from "./PartialGuessedSprite";
import CanceledTurnSprite from "./CanceledTurnSprite";
import { useAppTranslation } from "../../i18n/useAppTranslation";

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
  isFreeDraw?: boolean;
  onStartFreeDraw?: () => void;
  activeDrawersCount?: number;
  hasEnteredFreeDraw?: boolean;
  hasDrawHistory?: boolean;
  roundEndAnimationKey?: number;
}

// Static hybrid CSS helpers (Tailwind classes act as non-cqh fallback; cqh clamp() refines proportionally to board height)
const OVERLAY_CONTAINER_STYLE: React.CSSProperties = {
  padding: "clamp(4px, 2.8cqh, 16px)",
};

const CARD_CONTAINER_STYLE: React.CSSProperties = {
  paddingBlock: "clamp(2px, 1.5cqh, 8px)",
  maxHeight: "340px",
};

const TITLE_WRAPPER_STYLE: React.CSSProperties = {
  fontSize: "clamp(15px, 7.8cqh, 22px)",
};

const SUBTITLE_TEXT_STYLE: React.CSSProperties = {
  fontSize: "clamp(11px, 4.8cqh, 12px)",
};

const SPRITE_SLOT_STYLE: React.CSSProperties = {
  maxHeight: "clamp(48px, 48cqh, 156px)",
  marginBlock: "clamp(2px, 1.4cqh, 8px)",
};

const FREEDRAW_DESC_STYLE: React.CSSProperties = {
  fontSize: "clamp(11px, 4.8cqh, 13px)",
};

const FREEDRAW_ACTIONS_STYLE: React.CSSProperties = {
  gap: "clamp(4px, 2.2cqh, 10px)",
};

const FREEDRAW_BTN_STYLE: React.CSSProperties = {
  paddingBlock: "clamp(5px, 2.6cqh, 10px)",
  paddingInline: "clamp(16px, 6cqh, 24px)",
  fontSize: "clamp(12px, 5.4cqh, 16px)",
};

const BODY_TEXT_STYLE: React.CSSProperties = {
  fontSize: "clamp(11.5px, 5.2cqh, 14px)",
};

const CHOOSING_AVATAR_WRAP_STYLE: React.CSSProperties = {
  marginBlock: "clamp(2px, 1.8cqh, 12px)",
};

const CHOOSING_AVATAR_STYLE: React.CSSProperties = {
  maxHeight: "clamp(44px, 28cqh, 88px)",
};

const CHOOSING_EMOJI_STYLE: React.CSSProperties = {
  fontSize: "clamp(22px, 14cqh, 48px)",
};

const CHOOSING_LABEL_STYLE: React.CSSProperties = {
  fontSize: "clamp(11px, 4.8cqh, 14px)",
};

const CHOOSING_NAME_STYLE: React.CSSProperties = {
  fontSize: "clamp(13px, 6.5cqh, 20px)",
};

const ANSWER_LABEL_STYLE: React.CSSProperties = {
  fontSize: "clamp(11px, 4.6cqh, 12px)",
};

const ANSWER_WORD_STYLE: React.CSSProperties = {
  fontSize: "clamp(13px, 6.4cqh, 20px)",
};

const PODIUM_CONTAINER_STYLE: React.CSSProperties = {
  padding: "clamp(4px, 2.2cqh, 16px)",
};

const PODIUM_TITLE_WRAP_STYLE: React.CSSProperties = {
  fontSize: "clamp(14px, 7cqh, 26px)",
};

const PODIUM_STAGE_STYLE: React.CSSProperties = {
  paddingTop: "clamp(14px, 7.2cqh, 30px)",
};

const PODIUM_REST_LIST_STYLE: React.CSSProperties = {
  maxHeight: "clamp(30px, 19cqh, 90px)",
};

const PODIUM_REST_HEADER_STYLE: React.CSSProperties = {
  fontSize: "clamp(9.5px, 4.2cqh, 12px)",
};

const PODIUM_SIZES_COMPACT = {
  firstCrownWrap: { top: "calc(-1 * clamp(13px, 6.2cqh, 28px))" } as React.CSSProperties,
  firstCrownText: { fontSize: "clamp(13px, 6.2cqh, 28px)" } as React.CSSProperties,
  firstAvatar: { width: "clamp(34px, 18.5cqh, 92px)", height: "clamp(34px, 18.5cqh, 92px)" } as React.CSSProperties,
  firstEmoji: { fontSize: "clamp(18px, 10cqh, 48px)" } as React.CSSProperties,
  firstMedalWrap: { bottom: "calc(-1 * clamp(5px, 2.4cqh, 14px))" } as React.CSSProperties,
  firstMedal: { width: "clamp(18px, 9cqh, 44px)", height: "clamp(18px, 9cqh, 44px)" } as React.CSSProperties,
  firstTextWrap: { marginTop: "clamp(6px, 2.8cqh, 14px)" } as React.CSSProperties,
  firstName: { fontSize: "clamp(10.5px, 5cqh, 18px)" } as React.CSSProperties,
  firstPoints: { fontSize: "clamp(8.5px, 3.8cqh, 12px)" } as React.CSSProperties,
  sideAvatar: { width: "clamp(28px, 15cqh, 76px)", height: "clamp(28px, 15cqh, 76px)" } as React.CSSProperties,
  sideEmoji: { fontSize: "clamp(15px, 8cqh, 40px)" } as React.CSSProperties,
  sideMedalWrap: { bottom: "calc(-1 * clamp(4px, 2cqh, 12px))" } as React.CSSProperties,
  sideMedal: { width: "clamp(15px, 7.5cqh, 36px)", height: "clamp(15px, 7.5cqh, 36px)" } as React.CSSProperties,
  sideTextWrap: { marginTop: "clamp(5px, 2.4cqh, 12px)" } as React.CSSProperties,
  sideName: { fontSize: "clamp(10px, 4.4cqh, 15px)" } as React.CSSProperties,
  sidePoints: { fontSize: "clamp(8px, 3.5cqh, 11px)" } as React.CSSProperties,
};

const PODIUM_SIZES_STANDARD = {
  firstCrownWrap: { top: "calc(-1 * clamp(15px, 7.5cqh, 30px))" } as React.CSSProperties,
  firstCrownText: { fontSize: "clamp(15px, 7.5cqh, 28px)" } as React.CSSProperties,
  firstAvatar: { width: "clamp(46px, 27cqh, 104px)", height: "clamp(46px, 27cqh, 104px)" } as React.CSSProperties,
  firstEmoji: { fontSize: "clamp(24px, 14cqh, 58px)" } as React.CSSProperties,
  firstMedalWrap: { bottom: "calc(-1 * clamp(6px, 3.2cqh, 16px))" } as React.CSSProperties,
  firstMedal: { width: "clamp(22px, 12cqh, 52px)", height: "clamp(22px, 12cqh, 52px)" } as React.CSSProperties,
  firstTextWrap: { marginTop: "clamp(8px, 3.8cqh, 16px)" } as React.CSSProperties,
  firstName: { fontSize: "clamp(12px, 5.8cqh, 18px)" } as React.CSSProperties,
  firstPoints: { fontSize: "clamp(9.5px, 4.2cqh, 12px)" } as React.CSSProperties,
  sideAvatar: { width: "clamp(38px, 21cqh, 88px)", height: "clamp(38px, 21cqh, 88px)" } as React.CSSProperties,
  sideEmoji: { fontSize: "clamp(20px, 11cqh, 46px)" } as React.CSSProperties,
  sideMedalWrap: { bottom: "calc(-1 * clamp(5px, 2.6cqh, 14px))" } as React.CSSProperties,
  sideMedal: { width: "clamp(18px, 10cqh, 40px)", height: "clamp(18px, 10cqh, 40px)" } as React.CSSProperties,
  sideTextWrap: { marginTop: "clamp(6px, 3.2cqh, 14px)" } as React.CSSProperties,
  sideName: { fontSize: "clamp(11px, 5cqh, 15px)" } as React.CSSProperties,
  sidePoints: { fontSize: "clamp(8.5px, 3.8cqh, 11px)" } as React.CSSProperties,
};

export function MiniBoardOverlay({
  gameState,
  amIDrawer,
  currentPlayers,
  getCurrentDrawerName,
  isFreeDraw = false,
  onStartFreeDraw,
  activeDrawersCount = 0,
  hasEnteredFreeDraw = false,
  hasDrawHistory = false,
  roundEndAnimationKey,
}: MiniBoardOverlayProps) {
  const { t, isRTL } = useAppTranslation("miniBoard");

  // We use this z-index to overlay inside the DrawingBoard
  const containerClass =
    "absolute inset-0 z-[40] [container-type:size] flex flex-col items-center bg-white pointer-events-auto p-1.5 sm:p-4 select-none font-sans overflow-y-auto min-h-0";
  const cardClass =
    "text-center w-full max-w-sm h-full my-auto flex flex-col items-center justify-between py-0.5 sm:py-2 min-h-0";
  const spriteSlotClass =
    "flex-1 min-h-0 flex items-center justify-center my-0.5 sm:my-1.5 w-full max-h-[110px] sm:max-h-[156px]";

  const prevRoundEndKeyRef = React.useRef<number | null>(null);
  const activeAnimationKeyRef = React.useRef<number>(0);

  // Baseline on mount: do not trigger animation if already in ROUND_END when mounting
  if (prevRoundEndKeyRef.current === null) {
    prevRoundEndKeyRef.current = roundEndAnimationKey ?? 0;
    activeAnimationKeyRef.current = 0;
  } else if (
    roundEndAnimationKey !== undefined &&
    roundEndAnimationKey > prevRoundEndKeyRef.current
  ) {
    prevRoundEndKeyRef.current = roundEndAnimationKey;
    activeAnimationKeyRef.current = roundEndAnimationKey;
  }

  const wasPodium = React.useRef(false);
  const playPodiumAnimations = React.useRef(false);

  if (gameState.status === "PODIUM" && !wasPodium.current) {
    // Only play intro animations if we entered the podium phase early enough (e.g. at the very start)
    playPodiumAnimations.current = gameState.timeLeft >= 13;
  }
  wasPodium.current = gameState.status === "PODIUM";

  const getAnimClass = (className: string) => playPodiumAnimations.current ? className : "";

  // If Free Draw mode: hide overlay if player has drawn, if someone is drawing, or if draw history exists
  const historyPresent = Boolean(hasDrawHistory || gameState?.hasDrawHistory);
  if (
    isFreeDraw &&
    (hasEnteredFreeDraw ||
      activeDrawersCount > 0 ||
      amIDrawer ||
      historyPresent)
  ) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      {/* 1. FREE DRAW START SCREEN OR WAITING FOR PLAYERS */}
      {(isFreeDraw
        ? !hasEnteredFreeDraw &&
          activeDrawersCount === 0 &&
          !amIDrawer &&
          !historyPresent
        : gameState.status === "WAITING") && (
        <motion.div
          key="waiting-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={containerClass}
          style={OVERLAY_CONTAINER_STYLE}
        >
          <div className={cardClass} style={CARD_CONTAINER_STYLE}>
            {/* Top Title */}
            <div className="w-full shrink-0 pt-0.5 text-[15px] sm:text-[22px]" style={TITLE_WRAPPER_STYLE}>
              <GameTitle text={isFreeDraw ? "FREE DRAW" : "WAITING"} type="miniboard" className="text-[1em]" />
            </div>

            {/* Middle Frameless Animated Sprite */}
            <div className={spriteSlotClass} style={SPRITE_SLOT_STYLE}>
              <WaitingSprite className="h-full w-auto max-w-full aspect-[203/315]" />
            </div>

            {/* Bottom Text / Start Button */}
            <div
              className="w-full shrink-0 pb-0.5 flex flex-col items-center gap-1.5 sm:gap-2.5 px-1"
              style={isFreeDraw ? FREEDRAW_ACTIONS_STYLE : undefined}
            >
              {isFreeDraw ? (
                <>
                  <p
                    dir={isRTL ? "rtl" : "ltr"}
                    className="text-[#64748B] text-[11px] sm:text-[13px] font-semibold tracking-tight text-center max-w-[290px] leading-snug"
                    style={FREEDRAW_DESC_STYLE}
                  >
                    {t("freeDraw.description")}
                  </p>
                  <button
                    type="button"
                    onClick={onStartFreeDraw}
                    dir={isRTL ? "rtl" : "ltr"}
                    className="px-4 py-1.5 sm:px-6 sm:py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-95 text-white font-black text-xs sm:text-base shadow-lg transition-all border-2 border-white/60 flex items-center gap-1.5 sm:gap-2 cursor-pointer mx-auto leading-none"
                    style={FREEDRAW_BTN_STYLE}
                  >
                    <Pencil className="w-3.5 h-3.5 sm:w-[18px] sm:h-[18px] shrink-0" />
                    <span>{t("freeDraw.startButton")}</span>
                  </button>
                </>
              ) : (
                <p
                  dir={isRTL ? "rtl" : "ltr"}
                  className="text-[#728299] text-xs sm:text-sm font-bold tracking-wide leading-tight"
                  style={BODY_TEXT_STYLE}
                >
                  {t("waiting.message")}
                </p>
              )}
            </div>
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
          style={OVERLAY_CONTAINER_STYLE}
        >
          <div className={cardClass} style={CARD_CONTAINER_STYLE}>
            <div className="w-full shrink-0 pt-0.5 text-[15px] sm:text-[22px]" style={TITLE_WRAPPER_STYLE}>
              <GameTitle text="NEW TURN!" type="miniboard" className="text-[1em]" />
            </div>

            <div
              className="flex-1 min-h-0 w-full flex items-center justify-center my-0.5 sm:my-2"
              style={CHOOSING_AVATAR_WRAP_STYLE}
            >
              <div
                className="h-full w-auto max-h-[64px] sm:max-h-[88px] aspect-square bg-[#FFD13B] border-[3px] sm:border-[5px] border-[#0A2540] rounded-full flex items-center justify-center shadow-lg overflow-hidden"
                style={CHOOSING_AVATAR_STYLE}
              >
                <span className="text-[24px] sm:text-[48px] leading-none" style={CHOOSING_EMOJI_STYLE}>
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

            <div className="w-full shrink-0 pb-0.5 px-1" dir={isRTL ? "rtl" : "ltr"}>
              <p
                className="text-[#728299] text-[11px] sm:text-sm font-bold mb-0.5 leading-tight"
                style={CHOOSING_LABEL_STYLE}
              >
                {t("choosing.turnOf")}
              </p>
              <h3
                dir="auto"
                className="text-[#0B2E5C] font-black text-sm sm:text-xl tracking-wide leading-tight break-words max-w-full"
                style={CHOOSING_NAME_STYLE}
              >
                <bdi dir="auto">{getCurrentDrawerName()}</bdi>
              </h3>
            </div>
          </div>
        </motion.div>
      )}

      {/* 3. ROUND END */}
      {gameState.status === "ROUND_END" &&
        (() => {
          const reason = gameState.roundEndReason;
          const word = gameState.roundEndWord || "";
          const drawerName = getCurrentDrawerName() || t("roundEnd.defaultDrawer");
          const hasSucceeded = (gameState.correctGuessers || []).length > 0;

          // 3.1. SKIPPED STATE
          if (reason === "skipped") {
            return (
              <motion.div key="round-end-skipped" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={containerClass} style={OVERLAY_CONTAINER_STYLE}>
                <div className={cardClass} style={CARD_CONTAINER_STYLE}>
                  <div className="w-full shrink-0 pt-0.5 text-[15px] sm:text-[22px]" style={TITLE_WRAPPER_STYLE}>
                    <GameTitle text="SKIPPED!" type="miniboard" className="text-[1em]" />
                  </div>
                  <div className={spriteSlotClass} style={SPRITE_SLOT_STYLE}>
                    <SkippedSprite className="h-full w-auto max-w-full aspect-[374/559]" animationKey={activeAnimationKeyRef.current} />
                  </div>
                  <div className="w-full shrink-0 pb-0.5 px-1">
                    <h3
                      className="text-[#728299] font-bold text-xs sm:text-sm tracking-wide leading-snug break-words"
                      dir={isRTL ? "rtl" : "ltr"}
                      style={BODY_TEXT_STYLE}
                    >
                      {amIDrawer ? (
                        t("roundEnd.skippedSelf")
                      ) : (
                        <Trans
                          t={t}
                          i18nKey="roundEnd.skippedOther"
                          values={{ drawerName }}
                          components={{
                            drawer: <bdi dir="auto" />,
                          }}
                        />
                      )}
                    </h3>
                  </div>
                </div>
              </motion.div>
            );
          }

          // 3.2. TURN LOST / INACTIVE STATE
          if (reason === "turn_lost") {
            return (
              <motion.div key="round-end-lost" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={containerClass} style={OVERLAY_CONTAINER_STYLE}>
                <div className={cardClass} style={CARD_CONTAINER_STYLE}>
                  <div className="w-full shrink-0 pt-0.5 text-[15px] sm:text-[22px]" style={TITLE_WRAPPER_STYLE}>
                    <GameTitle text="INACTIVE" type="miniboard" className="text-[1em]" />
                  </div>
                  <div className={spriteSlotClass} style={SPRITE_SLOT_STYLE}>
                    <TurnLostSprite className="h-full w-auto max-w-full aspect-[1295/1260]" animationKey={activeAnimationKeyRef.current} />
                  </div>
                  <div className="w-full shrink-0 pb-0.5 px-1">
                    <h3
                      className="text-[#728299] font-bold text-xs sm:text-sm tracking-wide leading-snug break-words"
                      dir={isRTL ? "rtl" : "ltr"}
                      style={BODY_TEXT_STYLE}
                    >
                      {amIDrawer ? (
                        t("roundEnd.turnLostSelf")
                      ) : (
                        <Trans
                          t={t}
                          i18nKey="roundEnd.turnLostOther"
                          values={{ drawerName }}
                          components={{
                            drawer: <bdi dir="auto" />,
                          }}
                        />
                      )}
                    </h3>
                  </div>
                </div>
              </motion.div>
            );
          }

          // 3.3. CANCELED STATE
          if (reason === "canceled") {
            return (
              <motion.div key="round-end-canceled" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={containerClass} style={OVERLAY_CONTAINER_STYLE}>
                <div className={cardClass} style={CARD_CONTAINER_STYLE}>
                  <div className="w-full shrink-0 pt-0.5 text-[15px] sm:text-[22px]" style={TITLE_WRAPPER_STYLE}>
                    <GameTitle text="CANCELED TURN" type="miniboard" className="text-[1em]" />
                  </div>

                  <div className={spriteSlotClass} style={SPRITE_SLOT_STYLE}>
                    <CanceledTurnSprite className="h-full w-auto max-w-full aspect-[241/300]" animationKey={activeAnimationKeyRef.current} />
                  </div>

                  <div className="w-full shrink-0 pb-0.5 px-1">
                    <p
                      className="text-[#728299] text-xs sm:text-sm font-bold leading-snug break-words"
                      dir={isRTL ? "rtl" : "ltr"}
                      style={BODY_TEXT_STYLE}
                    >
                      {t("roundEnd.canceledScore")}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          }

          // 3.4. INTERVAL / STANDARD ROUND END
          let titleText = "INTERVAL";
          let subTitle = t("roundEnd.intervalSubtitle");
          let bottomText = "";

          if (reason === "all_guessed") {
            titleText = "MASTERPIECE!";
            subTitle = "";
            bottomText = t("roundEnd.allGuessed");
          } else if (reason === "timeout" || reason === "drawer_left") {
            bottomText = hasSucceeded ? "" : t("roundEnd.nobodyGuessed");
          }

          return (
            <motion.div key="round-end-interval" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={containerClass} style={OVERLAY_CONTAINER_STYLE}>
              <div className={cardClass} style={CARD_CONTAINER_STYLE}>
                <div className="w-full shrink-0 pt-0.5">
                  <div className="text-[15px] sm:text-[22px]" style={TITLE_WRAPPER_STYLE}>
                    <GameTitle text={titleText} type="miniboard" className="text-[1em]" />
                  </div>
                  {subTitle && (
                    <p
                      className="text-[#728299] text-[11px] sm:text-xs font-bold mt-0.5 leading-tight"
                      dir={isRTL ? "rtl" : "ltr"}
                      style={SUBTITLE_TEXT_STYLE}
                    >
                      {subTitle}
                    </p>
                  )}
                </div>

                <div className={spriteSlotClass} style={SPRITE_SLOT_STYLE}>
                  {reason === "all_guessed" ? (
                    gameState?.isFastAllGuessed ? (
                      <AllGuessedRareSprite className="h-full w-auto max-w-full aspect-[727/1200]" animationKey={activeAnimationKeyRef.current} />
                    ) : (
                      <AllGuessedSprite
                        mode="all_guessed"
                        className="h-full w-auto max-w-full aspect-[245/250]"
                        animationKey={activeAnimationKeyRef.current}
                      />
                    )
                  ) : hasSucceeded ? (
                    <PartialGuessedSprite
                      className="h-full w-auto max-w-full aspect-[343/300]"
                      animationKey={activeAnimationKeyRef.current}
                    />
                  ) : gameState?.noOneGuessedVariant === 2 ? (
                    <NoOneGuessed2Sprite
                      className="h-full w-auto max-w-full aspect-[563/1000]"
                      animationKey={activeAnimationKeyRef.current}
                    />
                  ) : (
                    <AllGuessedSprite
                      mode="no_one_guessed"
                      className="h-full w-auto max-w-full aspect-[245/250]"
                      animationKey={activeAnimationKeyRef.current}
                    />
                  )}
                </div>

                <div className="w-full shrink-0 pb-0.5 px-1">
                  {bottomText && (
                    <p
                      className="text-[#728299] text-xs sm:text-sm font-bold leading-snug break-words"
                      dir={isRTL ? "rtl" : "ltr"}
                      style={BODY_TEXT_STYLE}
                    >
                      {bottomText}
                    </p>
                  )}

                  {word && hasSucceeded && reason !== "all_guessed" && (
                    <div className="text-center">
                      <span
                        className="text-[#728299] text-[11px] sm:text-xs font-bold block mb-0.5 leading-tight"
                        dir={isRTL ? "rtl" : "ltr"}
                        style={ANSWER_LABEL_STYLE}
                      >
                        {t("roundEnd.theAnswerWas")}
                      </span>
                      <span
                        className="text-[#0B2E5C] text-sm sm:text-xl font-black tracking-wide inline-block leading-tight break-words max-w-full"
                        dir="auto"
                        style={ANSWER_WORD_STYLE}
                      >
                        <bdi dir="auto">{word}</bdi>
                      </span>
                    </div>
                  )}
                </div>
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
          const sizes = restOfPlayers.length > 0 ? PODIUM_SIZES_COMPACT : PODIUM_SIZES_STANDARD;

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
              className="absolute inset-0 z-[50] [container-type:size] flex flex-col items-center bg-[#F3F4F6] p-1 sm:p-4 font-sans select-none overflow-y-auto min-h-0"
              style={PODIUM_CONTAINER_STYLE}
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
                  0% { transform: scale(0); opacity: 0; }
                  70% { transform: scale(1.35); }
                  90% { transform: scale(0.97); }
                  100% { transform: scale(1); opacity: 1; }
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
              
              <div className="flex flex-col items-center justify-between w-full h-full max-h-[420px] my-auto min-h-0">
                <motion.div 
                  initial={{ y: -150, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ ease: [0.1, 0.9, 0.2, 1], duration: 0.85 }}
                  className="w-full flex justify-center shrink-0 mb-0.5 sm:mb-2 text-[14px] sm:text-[26px]"
                  style={PODIUM_TITLE_WRAP_STYLE}
                >
                  <GameTitle text="GAME OVER" type="miniboard" className="text-[1em]" />
                </motion.div>

                <div
                  className="relative flex-1 min-h-0 w-full max-w-[340px] sm:max-w-[420px] mx-auto flex items-end justify-center gap-1 sm:gap-3 px-1 sm:px-4 z-20 pt-4 sm:pt-7"
                  style={PODIUM_STAGE_STYLE}
                >
                  {/* 2nd Place */}
                  <div className="w-[31%] flex flex-col items-center justify-end relative max-h-full group z-20">
                    {second ? (
                      <>
                        <div className={`relative mb-0.5 w-fit mx-auto ${getAnimClass("animate-podium-pop")}`} style={{ animationDelay: '2.4s' }}>
                          <div
                            className={`${restOfPlayers.length > 0 ? "w-8 h-8 sm:w-18 sm:h-18" : "w-10 h-10 sm:w-22 sm:h-22"} rounded-full bg-[#E2E8F0] flex items-center justify-center text-lg sm:text-5xl border-[3px] sm:border-[4px] border-[#0A2540] overflow-hidden relative`}
                            style={sizes.sideAvatar}
                          >
                            <span className="select-none leading-none" style={sizes.sideEmoji}>{second.avatar}</span>
                          </div>
                          <div
                            className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 sm:-bottom-3.5 z-20 pointer-events-none flex items-center justify-center"
                            style={sizes.sideMedalWrap}
                          >
                            <div 
                              className={`relative w-4 h-4 sm:w-10 sm:h-10 flex items-center justify-center ${getAnimClass("animate-badge-pop")}`}
                              style={{ ...sizes.sideMedal, animationDelay: '2.9s' }}
                            >
                              <img 
                                src="/medal2.webp" 
                                alt={t("podium.medalAlt.second")} 
                                className="w-full h-full object-contain"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none z-10">
                                <div className="w-full h-full bg-gradient-to-r from-transparent via-white/60 to-transparent animate-medal-shine" />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div
                          className={`text-center mt-1.5 sm:mt-3.5 mb-0.5 px-0.5 w-full ${getAnimClass("animate-pop")}`}
                          style={{ ...sizes.sideTextWrap, animationDelay: '2.6s' }}
                        >
                          <span
                            className="text-[#0A2540] font-black text-[10px] sm:text-[15px] truncate block w-full leading-tight"
                            dir="auto"
                            style={sizes.sideName}
                          >
                            <bdi dir="auto">{second.name}</bdi>
                          </span>
                          <span
                            dir={isRTL ? "rtl" : "ltr"}
                            className="text-slate-500 font-extrabold text-[8.5px] sm:text-[11px] block leading-none"
                            style={sizes.sidePoints}
                          >
                            {t("podium.points", { count: second.points ?? 0 })}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="w-full" />
                    )}
                  </div>

                  {/* 1st Place */}
                  <div className="w-[38%] flex flex-col items-center justify-end relative max-h-full group z-30">
                    {first ? (
                      <>
                        <div className={`relative mb-0.5 sm:mb-1 w-fit mx-auto ${getAnimClass("animate-podium-pop")}`} style={{ animationDelay: '1.0s' }}>
                          {/* Crown - inside relative avatar wrapper for perfect centering */}
                          <div 
                            className={`absolute -top-[15px] sm:-top-[30px] inset-x-0 mx-auto w-fit z-40 ${getAnimClass("animate-crown-fall")} flex justify-center`} 
                            style={{ ...sizes.firstCrownWrap, animationDelay: crownDelay }}
                          >
                            <span className="text-[15px] sm:text-[28px] leading-none select-none" style={sizes.firstCrownText}>👑</span>
                          </div>

                          <div
                            className={`${restOfPlayers.length > 0 ? "w-9 h-9 sm:w-22 sm:h-22" : "w-12 h-12 sm:w-26 sm:h-26"} rounded-full bg-[#FFD13B] flex items-center justify-center text-xl sm:text-6xl border-[3px] sm:border-[5px] border-[#0A2540] overflow-hidden relative group-hover:scale-105 transition-transform duration-300`}
                            style={sizes.firstAvatar}
                          >
                            <span className="select-none leading-none" style={sizes.firstEmoji}>{first.avatar}</span>
                          </div>
                          <div
                            className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 sm:-bottom-4 z-20 pointer-events-none flex items-center justify-center"
                            style={sizes.firstMedalWrap}
                          >
                            <div 
                              className={`relative w-5 h-5 sm:w-13 sm:h-13 flex items-center justify-center ${getAnimClass("animate-badge-pop")}`}
                              style={{ ...sizes.firstMedal, animationDelay: '1.5s' }}
                            >
                              <img 
                                src="/medal1.webp" 
                                alt={t("podium.medalAlt.first")} 
                                className="w-full h-full object-contain"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none z-10">
                                <div className="w-full h-full bg-gradient-to-r from-transparent via-white/60 to-transparent animate-medal-shine" />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div
                          className={`text-center mt-2 sm:mt-4 mb-0.5 px-0.5 w-full ${getAnimClass("animate-pop")}`}
                          style={{ ...sizes.firstTextWrap, animationDelay: '1.2s' }}
                        >
                          <span
                            className="text-[#0A2540] font-black text-[11px] sm:text-[18px] truncate block w-full leading-tight"
                            dir="auto"
                            style={sizes.firstName}
                          >
                            <bdi dir="auto">{first.name}</bdi>
                          </span>
                          <span
                            dir={isRTL ? "rtl" : "ltr"}
                            className="text-yellow-600 font-black text-[9px] sm:text-[12px] block leading-none"
                            style={sizes.firstPoints}
                          >
                            {t("podium.points", { count: first.points ?? 0 })}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="w-full" />
                    )}
                  </div>

                  {/* 3rd Place */}
                  <div className="w-[31%] flex flex-col items-center justify-end relative max-h-full group z-10">
                    {third ? (
                      <>
                        <div className={`relative mb-0.5 w-fit mx-auto ${getAnimClass("animate-podium-pop")}`} style={{ animationDelay: '3.6s' }}>
                          <div
                            className={`${restOfPlayers.length > 0 ? "w-8 h-8 sm:w-18 sm:h-18" : "w-10 h-10 sm:w-22 sm:h-22"} rounded-full bg-[#FFB074] flex items-center justify-center text-lg sm:text-5xl border-[3px] sm:border-[4px] border-[#0A2540] overflow-hidden relative`}
                            style={sizes.sideAvatar}
                          >
                            <span className="select-none leading-none" style={sizes.sideEmoji}>{third.avatar}</span>
                          </div>
                          <div
                            className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 sm:-bottom-3.5 z-20 pointer-events-none flex items-center justify-center"
                            style={sizes.sideMedalWrap}
                          >
                            <div 
                              className={`relative w-4 h-4 sm:w-10 sm:h-10 flex items-center justify-center ${getAnimClass("animate-badge-pop")}`}
                              style={{ ...sizes.sideMedal, animationDelay: '4.1s' }}
                            >
                              <img 
                                src="/medal3.webp" 
                                alt={t("podium.medalAlt.third")} 
                                className="w-full h-full object-contain"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none z-10">
                                <div className="w-full h-full bg-gradient-to-r from-transparent via-white/60 to-transparent animate-medal-shine" />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div
                          className={`text-center mt-1.5 sm:mt-3.5 mb-0.5 px-0.5 w-full ${getAnimClass("animate-pop")}`}
                          style={{ ...sizes.sideTextWrap, animationDelay: '3.8s' }}
                        >
                          <span
                            className="text-[#0A2540] font-black text-[10px] sm:text-[15px] truncate block w-full leading-tight"
                            dir="auto"
                            style={sizes.sideName}
                          >
                            <bdi dir="auto">{third.name}</bdi>
                          </span>
                          <span
                            dir={isRTL ? "rtl" : "ltr"}
                            className="text-orange-600 font-extrabold text-[8.5px] sm:text-[11px] block leading-none"
                            style={sizes.sidePoints}
                          >
                            {t("podium.points", { count: third.points ?? 0 })}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="w-full" />
                    )}
                  </div>
                </div>

                {/* Scrollable list for 4th Rank and below */}
                {restOfPlayers.length > 0 && (
                  <div className="w-full max-w-[340px] sm:max-w-md mx-auto mt-1 sm:mt-2 px-1.5 sm:px-2 bg-white/95 rounded-xl py-1 sm:p-1.5 border border-slate-200 z-10 shrink-0">
                    <p
                      dir={isRTL ? "rtl" : "ltr"}
                      className="text-center text-[#0B2E5C] font-extrabold text-[9.5px] sm:text-xs uppercase tracking-wider mb-0.5 leading-tight"
                      style={PODIUM_REST_HEADER_STYLE}
                    >
                      {t("podium.restOfLeaderboard")}
                    </p>
                    <div
                      className="flex flex-col gap-0.5 sm:gap-1 max-h-[34px] sm:max-h-[90px] overflow-y-auto pr-1"
                      style={PODIUM_REST_LIST_STYLE}
                    >
                      {restOfPlayers.map((p, idx) => (
                        <div key={p.id} className="flex items-center justify-between text-slate-700 bg-white/40 px-1.5 py-0.5 sm:p-1.5 rounded-lg text-[10px] sm:text-xs font-bold border border-slate-100 leading-tight">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-slate-400 shrink-0"># {idx + 4}</span>
                            <span className="shrink-0">{p.avatar}</span>
                            <span className="truncate" dir="auto"><bdi dir="auto">{p.name}</bdi></span>
                          </div>
                          <span
                            dir={isRTL ? "rtl" : "ltr"}
                            className="text-slate-500 shrink-0"
                          >
                            {t("podium.points", { count: p.points ?? 0 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })()}
    </AnimatePresence>
  );
}

