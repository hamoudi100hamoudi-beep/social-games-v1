import React from "react";
import {
  Zap,
  AlertTriangle,
  Check,
  Clock,
  Pencil,
  Info,
} from "lucide-react";
import { Trans } from "react-i18next";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { StructuredSystemEventMetadata } from "../../types/game";

export interface GameActivityMessage extends StructuredSystemEventMetadata {
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
  persistentPlayerId?: string | null;
  amIDrawer: boolean;
  isFreeDraw: boolean;
}

function parseLegacyWinnerText(
  text: string
): { winnerName: string; score: number } | null {
  const match = text.match(
    /^Game over\. The winner is (.+) with (-?\d+) points?$/i
  );
  if (!match) return null;
  const parsedScore = Number(match[2]);
  if (!Number.isFinite(parsedScore)) return null;
  return { winnerName: match[1].trim(), score: parsedScore };
}

export function GameActivityFeed({
  guesses,
  socketId,
  persistentPlayerId,
  amIDrawer,
  isFreeDraw,
}: GameActivityFeedProps) {
  const { t, isRTL } = useAppTranslation("events");
  const uiDir = isRTL ? "rtl" : "ltr";

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-3 flex flex-col-reverse font-sans min-h-0 bg-transparent">
      <div className="flex flex-col-reverse gap-2">
        {[...guesses].reverse().map((msg) => {
          const isSystem = msg.type === "system";
          if (isSystem) {
            const subType = msg.subType || "";
            const text = msg.text || "";
            const lowerText = text.toLowerCase();
            const eventCode = msg.eventCode;

            // 1. Primary dispatch by structured eventCode, then legacy subType/text fallback

            // Close guess warning
            if (eventCode === "guess_close" || (!eventCode && subType === "close")) {
              const displayWord = msg.params?.guess ?? msg.word ?? "";
              return (
                <div
                  key={msg.id}
                  dir={uiDir}
                  className="flex items-center gap-2 text-amber-500 font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <Zap size={15} className="text-amber-500 fill-amber-500 shrink-0" />
                  <span className="text-amber-500/90 font-normal">
                    <Trans
                      t={t}
                      i18nKey="activity.guessClose"
                      values={{ guess: displayWord }}
                      components={{
                        guess: <bdi dir="auto" className="text-amber-500 font-extrabold" />,
                      }}
                    />
                  </span>
                </div>
              );
            }

            // Drawing report warning log
            if (eventCode === "draw_reported" || (!eventCode && subType === "report")) {
              const reporterName = msg.params?.name ?? msg.sender ?? "";
              return (
                <div
                  key={msg.id}
                  dir={uiDir}
                  className="flex items-center gap-2 text-[#EF4444] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <AlertTriangle
                    size={14}
                    className="text-[#EF4444] shrink-0 font-extrabold"
                  />
                  <span className="text-[#EF4444] font-normal">
                    <Trans
                      t={t}
                      i18nKey="activity.drawReported"
                      values={{ name: reporterName }}
                      components={{
                        player: <bdi dir="auto" className="text-[#EF4444] font-extrabold" />,
                      }}
                    />
                  </span>
                </div>
              );
            }

            // Drawing canceled turn log
            if (eventCode === "turn_canceled" || (!eventCode && subType === "canceled")) {
              return (
                <div
                  key={msg.id}
                  dir={uiDir}
                  className="flex items-center gap-2 text-[#EF4444] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <AlertTriangle
                    size={14}
                    className="text-[#EF4444] shrink-0 font-extrabold"
                  />
                  <span className="text-[#EF4444] font-normal">
                    {t("activity.turnCanceled")}
                  </span>
                </div>
              );
            }

            // Hit / guessed correctly (preserve exact senderId === socketId self detection)
            if (eventCode === "guess_hit" || (!eventCode && subType === "hit")) {
              const isSelfGuesser = msg.senderId === socketId;
              const displayWord = msg.word ?? msg.params?.word ?? "";
              const playerName =
                msg.params?.name ??
                msg.sender ??
                text.replace(" guessed the word!", "");
              return (
                <div
                  key={msg.id}
                  dir={uiDir}
                  className="flex items-center gap-2 text-[#00E540] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <Check
                    size={14}
                    className="stroke-[3.5] text-[#00E540] shrink-0"
                  />
                  {isSelfGuesser ? (
                    <span className="font-normal text-[#00E540]">
                      <Trans
                        t={t}
                        i18nKey="activity.guessHitSelf"
                        values={{ word: displayWord }}
                        components={{
                          word: <bdi dir="auto" className="font-extrabold text-[#00E540]" />,
                        }}
                      />
                    </span>
                  ) : (
                    <span className="font-normal text-[#00E540]">
                      <Trans
                        t={t}
                        i18nKey="activity.guessHitOther"
                        values={{ name: playerName }}
                        components={{
                          player: <bdi dir="auto" className="font-extrabold text-[#00E540]" />,
                        }}
                      />
                    </span>
                  )}
                </div>
              );
            }

            // Round End break / Interval
            if (eventCode === "round_interval" || (!eventCode && subType === "interval")) {
              return (
                <div
                  key={msg.id}
                  dir={uiDir}
                  className="flex items-center gap-2 text-[#1AD2FF] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <Clock
                    size={14}
                    className="text-[#1AD2FF] shrink-0"
                  />
                  <span className="font-normal text-[#1AD2FF]">
                    {t("activity.roundInterval")}
                  </span>
                </div>
              );
            }

            // Turn change
            if (eventCode === "turn_of" || (!eventCode && subType === "turn")) {
              const match = text.match(/^(Turn of\s+)(.+)$/i);
              const playerName = msg.params?.name ?? match?.[2];
              return (
                <div
                  key={msg.id}
                  dir={playerName ? uiDir : "auto"}
                  className="flex items-center gap-2 text-[#1AD2FF] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <Pencil
                    size={12}
                    className="text-[#1AD2FF] shrink-0"
                  />
                  {playerName ? (
                    <span className="text-[#1AD2FF]">
                      <Trans
                        t={t}
                        i18nKey="activity.turnOf"
                        values={{ name: playerName }}
                        components={{
                          player: <bdi dir="auto" className="font-extrabold text-[#1AD2FF]" />,
                        }}
                      />
                    </span>
                  ) : (
                    <span dir="auto" className="text-[#1AD2FF]" style={{ unicodeBidi: "plaintext" }}>
                      {text}
                    </span>
                  )}
                </div>
              );
            }

            // Game over
            if (eventCode === "game_over" || (!eventCode && subType === "game_over")) {
              const legacyParsed = parseLegacyWinnerText(text);
              const winnerName = msg.params?.winnerName ?? legacyParsed?.winnerName;
              const score =
                typeof msg.params?.score === "number"
                  ? msg.params.score
                  : legacyParsed?.score;

              return (
                <div
                  key={msg.id}
                  dir={winnerName !== undefined && score !== undefined ? uiDir : "auto"}
                  className="flex items-start gap-2 text-[#1AD2FF] font-normal text-sm sm:text-base py-1 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <Info
                    size={14}
                    className="text-[#1AD2FF] shrink-0 mt-0.5"
                  />
                  {winnerName && typeof score === "number" ? (
                    <span className="font-normal">
                      <Trans
                        t={t}
                        i18nKey="activity.gameOver"
                        count={score}
                        values={{ winnerName, count: score }}
                        components={{
                          winner: <bdi dir="auto" className="font-extrabold text-[#1AD2FF]" />,
                        }}
                      />
                    </span>
                  ) : (
                    <span dir="auto" className="font-normal" style={{ unicodeBidi: "plaintext" }}>
                      {text}
                    </span>
                  )}
                </div>
              );
            }

            // Everybody hit
            if (eventCode === "all_guessed" || (!eventCode && subType === "all_guessed")) {
              return (
                <div
                  key={msg.id}
                  dir={uiDir}
                  className="flex items-center gap-2 text-[#00E540] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <Check
                    size={14}
                    className="stroke-[3.5] text-[#00E540] shrink-0"
                  />
                  <span className="font-normal">{t("activity.allGuessed")}</span>
                </div>
              );
            }

            // Lost turn / Inactive (use actorId against persistentPlayerId / socketId when available)
            if (
              eventCode === "turn_lost" ||
              (!eventCode &&
                (subType === "lost_turn" ||
                  lowerText.includes("lost the turn") ||
                  lowerText.includes("lost your turn")))
            ) {
              const isDrawerSelf = msg.actorId
                ? Boolean(
                    (persistentPlayerId && msg.actorId === persistentPlayerId) ||
                      (socketId && msg.actorId === socketId)
                  )
                : amIDrawer;
              const actorName =
                msg.params?.name ??
                text.match(/^(.+?)\s+has lost the turn$/i)?.[1];

              return (
                <div
                  key={msg.id}
                  dir={isDrawerSelf || actorName ? uiDir : "auto"}
                  className="flex items-center gap-2 text-[#EF4444] font-normal text-sm sm:text-base py-0.5 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <AlertTriangle
                    size={14}
                    className="text-[#EF4444] shrink-0"
                  />
                  {isDrawerSelf ? (
                    <span className="font-normal">{t("activity.turnLostSelf")}</span>
                  ) : actorName ? (
                    <span className="font-normal">
                      <Trans
                        t={t}
                        i18nKey="activity.turnLostOther"
                        values={{ name: actorName }}
                        components={{
                          player: <bdi dir="auto" className="font-extrabold text-[#EF4444]" />,
                        }}
                      />
                    </span>
                  ) : (
                    <span dir="auto" className="font-normal" style={{ unicodeBidi: "plaintext" }}>
                      {text}
                    </span>
                  )}
                </div>
              );
            }

            // Skipped turn (use actorId against persistentPlayerId / socketId when available)
            if (
              eventCode === "turn_skipped" ||
              (!eventCode &&
                (subType === "skipped" || lowerText.includes("skipped the turn")))
            ) {
              const isDrawerSelf = msg.actorId
                ? Boolean(
                    (persistentPlayerId && msg.actorId === persistentPlayerId) ||
                      (socketId && msg.actorId === socketId)
                  )
                : amIDrawer;
              const actorName =
                msg.params?.name ??
                text.match(/^(.+?)\s+skipped the turn$/i)?.[1];

              return (
                <div
                  key={msg.id}
                  dir={isDrawerSelf || actorName ? uiDir : "auto"}
                  className="flex items-center gap-2 font-normal text-sm sm:text-base py-0.5 text-[#1AD2FF] animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <Pencil size={12} className="shrink-0 text-[#1AD2FF]" />
                  {isDrawerSelf ? (
                    <span className="font-normal">{t("activity.turnSkippedSelf")}</span>
                  ) : actorName ? (
                    <span className="font-normal">
                      <Trans
                        t={t}
                        i18nKey="activity.turnSkippedOther"
                        values={{ name: actorName }}
                        components={{
                          player: <bdi dir="auto" className="font-extrabold text-[#1AD2FF]" />,
                        }}
                      />
                    </span>
                  ) : (
                    <span dir="auto" className="font-normal" style={{ unicodeBidi: "plaintext" }}>
                      {text}
                    </span>
                  )}
                </div>
              );
            }

            // Structured Timeout Won / Nobody Hit / Answer Reveal (do not rely on subType alone)
            if (eventCode === "round_timeout_won") {
              return (
                <div
                  key={msg.id}
                  dir={uiDir}
                  className="flex items-center gap-2 font-normal text-sm sm:text-base py-0.5 text-[#1AD2FF]"
                >
                  <Pencil size={12} className="shrink-0 text-[#1AD2FF]" />
                  <span>{t("activity.roundTimeoutWon")}</span>
                </div>
              );
            }

            if (eventCode === "nobody_hit") {
              return (
                <div
                  key={msg.id}
                  dir={uiDir}
                  className="flex items-center gap-2 font-normal text-sm sm:text-base py-0.5 text-[#1AD2FF]"
                >
                  <Pencil size={12} className="shrink-0 text-[#1AD2FF]" />
                  <span>{t("activity.nobodyHit")}</span>
                </div>
              );
            }

            if (eventCode === "answer_reveal") {
              const revealedWord =
                msg.params?.word ??
                msg.word ??
                text.match(/^The answer was:\s*(.+)$/i)?.[1];
              return (
                <div
                  key={msg.id}
                  dir={revealedWord ? uiDir : "auto"}
                  className="flex items-center gap-2 font-normal text-sm sm:text-base py-0.5 text-[#1AD2FF]"
                >
                  <Pencil size={12} className="shrink-0 text-[#1AD2FF]" />
                  {revealedWord ? (
                    <span>
                      <Trans
                        t={t}
                        i18nKey="activity.answerReveal"
                        values={{ word: revealedWord }}
                        components={{
                          word: <bdi dir="auto" className="font-extrabold text-[#1AD2FF]" />,
                        }}
                      />
                    </span>
                  ) : (
                    <span dir="auto" style={{ unicodeBidi: "plaintext" }}>
                      {text}
                    </span>
                  )}
                </div>
              );
            }

            // Legacy fallback reveals & unmatched activity events (never discard silently)
            const isNobodyHit = lowerText.includes("nobody hit");
            if (isNobodyHit) {
              return (
                <div
                  key={msg.id}
                  dir={uiDir}
                  className="flex items-center gap-2 font-normal text-sm sm:text-base py-0.5 text-[#1AD2FF]"
                >
                  <Pencil size={12} className="shrink-0 text-[#1AD2FF]" />
                  <span>{t("activity.nobodyHit")}</span>
                </div>
              );
            }

            if (lowerText.includes("time's up") || lowerText.includes("timeout")) {
              return (
                <div
                  key={msg.id}
                  dir={uiDir}
                  className="flex items-center gap-2 font-normal text-sm sm:text-base py-0.5 text-[#1AD2FF]"
                >
                  <Pencil size={12} className="shrink-0 text-[#1AD2FF]" />
                  <span>{t("activity.roundTimeoutWon")}</span>
                </div>
              );
            }

            const legacyAnswerMatch = text.match(/^The answer was:\s*(.+)$/i);
            const legacyRevealWord =
              legacyAnswerMatch?.[1] ??
              (subType === "answer_reveal" && msg.word ? msg.word : undefined);
            if (legacyRevealWord) {
              return (
                <div
                  key={msg.id}
                  dir={uiDir}
                  className="flex items-center gap-2 font-normal text-sm sm:text-base py-0.5 text-[#1AD2FF]"
                >
                  <Pencil size={12} className="shrink-0 text-[#1AD2FF]" />
                  <span>
                    <Trans
                      t={t}
                      i18nKey="activity.answerReveal"
                      values={{ word: legacyRevealWord }}
                      components={{
                        word: <bdi dir="auto" className="font-extrabold text-[#1AD2FF]" />,
                      }}
                    />
                  </span>
                </div>
              );
            }

            let iconNode = (
              <Info size={14} className="shrink-0 text-[#1AD2FF]" />
            );
            let textColor = "#1AD2FF";

            if (
              lowerText.includes("hit") ||
              lowerText.includes("guessed") ||
              lowerText.includes("guessed the word")
            ) {
              iconNode = (
                <Check
                  size={14}
                  className="stroke-[3.5] text-[#00E540] shrink-0"
                />
              );
              textColor = "#00E540";
            } else if (lowerText.includes("turn")) {
              iconNode = (
                <Pencil size={12} className="shrink-0 text-[#1AD2FF]" />
              );
              textColor = "#1AD2FF";
            } else if (lowerText.includes("interval")) {
              iconNode = (
                <Clock size={14} className="shrink-0 text-[#1AD2FF]" />
              );
              textColor = "#1AD2FF";
            } else if (lowerText.includes("answer was")) {
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
                <span dir="auto" style={{ unicodeBidi: "plaintext" }}>
                  {text}
                </span>
              </div>
            );
          }

          return (
            <div key={msg.id} className="text-sm sm:text-base">
              <div className="flex items-start gap-1">
                <span className="font-extrabold text-[#F3F4F6] shrink-0">
                  <bdi dir="auto">{msg.sender}</bdi>:
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
          <div
            dir={uiDir}
            className="flex items-center gap-1.5 text-primary-brand font-normal text-sm sm:text-base"
          >
            <Info size={14} className="shrink-0" />
            <span>{t("activity.waitingForPlayers")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
