import React from "react";
import { Check } from "lucide-react";
import { Trans } from "react-i18next";
import CinematicModal from "../CinematicModal";
import AfkWarningSprite from "../AfkWarningSprite";
import { useAppTranslation } from "../../../i18n/useAppTranslation";

interface AfkWarningModalProps {
  isOpen: boolean;
  afkCountdown: number;
  onConfirmStay: () => void;
}

export default function AfkWarningModal({
  isOpen,
  afkCountdown,
  onConfirmStay,
}: AfkWarningModalProps) {
  const { t, isRTL } = useAppTranslation("modals");
  const { t: tCommon } = useAppTranslation("common");

  return (
    <CinematicModal
      isOpen={isOpen}
      titleType="inactive"
      titleText={t("titles.afkInactive")}
      arabicDisplay={isRTL}
      buttons={[
        {
          id: "afk-return-btn",
          text: tCommon("actions.ok"),
          onClick: onConfirmStay,
          variant: "neutral",
          icon: <Check strokeWidth={4} size={18} />,
        },
      ]}
    >
      {/* Animated Warning Sprite */}
      <div className="flex justify-center mb-3 sm:mb-4 mt-1">
        <AfkWarningSprite className="w-24 sm:w-34 aspect-[256/326]" />
      </div>

      {/* Question & Subtext in the same line (adaptive reading order) */}
      <h3
        id="afk-title"
        dir={isRTL ? "rtl" : "ltr"}
        className="text-sm sm:text-base font-black text-[#2E2882] leading-snug mb-3 sm:mb-4 px-1 text-center"
      >
        <span>{t("afk.question")} </span>
        <span id="afk-description">{t("afk.actionHint")}</span>
      </h3>

      {/* Compact Remainder Countdown Badge */}
      <div
        dir={isRTL ? "rtl" : "ltr"}
        className="bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-full px-4 py-1.5 inline-flex items-center gap-2 mb-3 sm:mb-4 text-xs sm:text-sm font-black text-[#EF4444] select-none"
      >
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EF4444] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EF4444]"></span>
        </span>
        <span>
          <Trans
            t={t}
            i18nKey="afk.disconnectCountdown"
            count={afkCountdown}
            values={{ count: afkCountdown }}
            components={{
              val: <span className="font-extrabold font-mono text-xs sm:text-sm" />,
            }}
          />
        </span>
      </div>
    </CinematicModal>
  );
}
