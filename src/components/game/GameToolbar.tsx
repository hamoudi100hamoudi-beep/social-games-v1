import React from 'react';

interface GameToolbarProps {
  status: string;
  currentDrawerId: string | null;
  persistentId: string;
  wordOptions: string[];
  onSelectWord: (word: string) => void;
  onSkipTurn: () => void;
}

export const GameToolbar: React.FC<GameToolbarProps> = ({
  status,
  currentDrawerId,
  persistentId,
  wordOptions,
  onSelectWord,
  onSkipTurn,
}) => {
  const isMyTurn = currentDrawerId === persistentId;

  // إذا لم يكن دور اللاعب في الرسم، الشريط يختفي تماماً ولا يشغل مساحة
  if (!isMyTurn) return null;

  return (
    <div className="w-full bg-[#1C1145]/90 text-white rounded-2xl p-3.5 shadow-2xl border border-white/10 flex flex-col gap-3 animate-fade-in shrink-0" dir="rtl">
      {/* طور اختيار الكلمات */}
      {status === 'CHOOSING' && wordOptions.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-black text-[#00D9FF] uppercase tracking-wider animate-pulse flex items-center gap-1">
            <span>✨</span> اختر كلمة لتبدأ الرسم وإبهار منافسيك:
          </span>
          <div className="flex gap-2 w-full justify-center">
            {wordOptions.map((word) => (
              <button
                key={word}
                onClick={() => onSelectWord(word)}
                className="flex-1 max-w-[130px] bg-gradient-to-b from-[#FFD700] to-[#FFA500] hover:from-[#FFE875] hover:to-[#FFB733] active:scale-95 text-slate-950 font-black py-2.5 px-3 rounded-xl text-xs text-center transition-all duration-300 shadow-[0_0_15px_rgba(255,215,0,0.35)] border border-[#FFD700]/40"
              >
                {word}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* طور الرسم المستمر - يظهر زر التخطي لحالات الطوارئ بقالب نيون فخم */}
      {status === 'DRAWING' && (
        <div className="flex items-center justify-between w-full">
          <span className="text-xs font-black text-indigo-200 animate-pulse flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            أنت في طور الرسم والتحكّم الآن...
          </span>
          <button
            onClick={onSkipTurn}
            className="bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 active:scale-95 text-white font-black py-1.5 px-4 rounded-xl text-[10px] transition-all duration-300 shadow-[0_0_15px_rgba(239,68,68,0.25)] border border-rose-500/20"
          >
            تخطي الدور ⏭️
          </button>
        </div>
      )}
    </div>
  );
};
