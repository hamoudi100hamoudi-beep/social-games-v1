import { Settings, Play } from 'lucide-react';
import CinematicModal from '../game/CinematicModal';
import { getRoomConfig } from '../../types/game';
import { useAppTranslation } from '../../i18n/useAppTranslation';

interface RoomInfoModalProps {
  isOpen: boolean;
  selectedRoom: string | null;
  roomStats: Record<string, {
    count: number;
    max: number;
    winningScore: number;
    theme: string;
  }>;
  joinError: string | null;
  onClose: () => void;
  onPlay: () => void;
}

export default function RoomInfoModal({
  isOpen,
  selectedRoom,
  roomStats,
  joinError,
  onClose,
  onPlay,
}: RoomInfoModalProps) {
  const { t, isRTL } = useAppTranslation('lobby');
  const { t: tModals } = useAppTranslation('modals');
  const labelStyleClass = isRTL
    ? 'text-[#8C8AA7] text-xs sm:text-sm font-black mb-1'
    : 'text-[#8C8AA7] text-xs sm:text-sm font-black uppercase tracking-wider mb-1';

  return (
    <CinematicModal
      isOpen={isOpen}
      onClose={onClose}
      titleType="report"
      titleText={tModals('titles.info')}
      arabicDisplay={isRTL}
      buttons={[
        {
          id: "room-info-play-btn",
          text: (
            <span dir={isRTL ? 'rtl' : 'ltr'} className="text-white font-black">
              {t('roomInfo.play')}
            </span>
          ),
          onClick: onPlay,
          variant: "danger",
          icon: <Play className="w-5 h-5" fill="currentColor" strokeWidth={3} />,
        },
      ]}
    >
      {selectedRoom && (() => {
        const config = getRoomConfig(selectedRoom);
        const currentCount = roomStats[selectedRoom]?.count ?? 0;
        const max = roomStats[selectedRoom]?.max ?? config.maxPlayers;
        const toWin = roomStats[selectedRoom]?.winningScore ?? config.winningScore;
        const theme = roomStats[selectedRoom]?.theme ?? config.theme;
        const roomDisplayName = config.tag ? `${config.name} ${config.tag}` : (config.name || selectedRoom);

        return (
          <div className="flex flex-col items-center w-full">
            <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-[#FB923C]/10 flex items-center justify-center mb-3 mt-1 relative shrink-0">
              <Settings size={36} className="text-[#FB923C] animate-spin-slow" strokeWidth={3} />
            </div>
            
            <h3 dir="auto" className="text-xl sm:text-2xl font-black text-[#2E2882] mb-4 text-center leading-tight">
              {roomDisplayName}
            </h3>

            {joinError && (
              <div
                dir={isRTL ? 'rtl' : 'ltr'}
                className="mb-3 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl text-center"
              >
                {joinError}
              </div>
            )}

            <div dir={isRTL ? 'rtl' : 'ltr'} className="grid grid-cols-3 gap-2 sm:gap-3 w-full mb-3 py-1">
              <div className="text-center flex flex-col items-center justify-center min-w-0">
                <div className={labelStyleClass}>{t('roomInfo.players')}</div>
                <div dir="ltr" className="text-[#2E2882] font-black text-lg sm:text-xl">{currentCount}/{max}</div>
              </div>
              <div className="text-center flex flex-col items-center justify-center min-w-0">
                <div className={labelStyleClass}>{t('roomInfo.theme')}</div>
                <div dir="auto" className="text-[#2E2882] font-black text-base sm:text-lg leading-snug truncate max-w-full">{theme}</div>
              </div>
              <div className="text-center flex flex-col items-center justify-center min-w-0">
                <div className={labelStyleClass}>{t('roomInfo.toWin')}</div>
                <div dir={isRTL ? 'rtl' : 'ltr'} className="text-[#FB923C] font-black text-base sm:text-lg leading-snug">
                  {config.isFreeDraw ? t('roomInfo.open') : t('roomInfo.points', { count: toWin })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </CinematicModal>
  );
}
