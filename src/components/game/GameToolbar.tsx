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
    <div className="w-full bg-slate-950 text-white rounded-xl p-3 shadow-md border border-slate-800 flex flex-col gap-3 animate-fade-in">
      {/* طور اختيار الكلمات */}
      {status === 'CHOOSING' && wordOptions.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-bold text-amber-400">اختر كلمة لتبدأ الرسم:</span>
          <div className="flex gap-2 w-full justify-center">
            {wordOptions.map((word) => (
              <button
                key={word}
                onClick={() => onSelectWord(word)}
                className="flex-1 max-w-[150px] bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-bold py-2.5 px-3 rounded-lg text-sm text-center transition-all shadow-sm"
              >
                {word}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* طور الرسم المستمر - يظهر زر التخطي لحالات الطوارئ */}
      {status === 'DRAWING' && (
        <div className="flex items-center justify-between w-full">
          <span className="text-xs font-medium text-slate-400">أنت ترسم الآن...</span>
          <button
            onClick={onSkipTurn}
            className="bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold py-1.5 px-4 rounded-lg text-xs transition-colors shadow-sm"
          >
            تخطي الدور ⏭️
          </button>
        </div>
      )}
    </div>
  );
};
