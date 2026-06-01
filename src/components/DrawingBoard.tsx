import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { Canvas } from './game/Canvas';
import { GameChat } from './game/GameChat';
import { PlayersList } from './game/PlayersList';
import { GameToolbar } from './game/GameToolbar';
import { LogOut } from 'lucide-react';

interface DrawingBoardProps {
  socket: Socket;
  roomId: string;
  nickname: string;
  avatar: string;
  persistentId: string;
}

const SmoothTimer: React.FC<{ gameState: { status: string; timeLeft: number }; maxTime: number }> = ({
  gameState,
  maxTime,
}) => {
  const barRef = React.useRef<HTMLDivElement>(null);
  const lastTimeLeftRef = React.useRef(gameState.timeLeft);
  const lastUpdateRef = React.useRef(Date.now());
  const statusRef = React.useRef(gameState.status);

  React.useEffect(() => {
    if (gameState.status !== statusRef.current) {
      statusRef.current = gameState.status;
      lastTimeLeftRef.current = gameState.timeLeft;
      lastUpdateRef.current = Date.now();
    } else if (gameState.timeLeft !== lastTimeLeftRef.current) {
      lastTimeLeftRef.current = gameState.timeLeft;
      lastUpdateRef.current = Date.now();
    }
  }, [gameState.timeLeft, gameState.status]);

  React.useEffect(() => {
    let requestId: number;
    const updateTimer = () => {
      const now = Date.now();
      const elapsed = (now - lastUpdateRef.current) / 1000;
      let visualTimeLeft = lastTimeLeftRef.current - elapsed;
      if (visualTimeLeft < 0) visualTimeLeft = 0;
      let pct = (visualTimeLeft / maxTime) * 100;
      pct = Math.max(0, Math.min(100, pct));

      if (barRef.current) {
        barRef.current.style.width = `${pct}%`;
        let timerColorClass = 'bg-[#FBBF24] shadow-[0_0_8px_rgba(251,191,36,0.6)]';
        if (gameState.status !== 'DRAWING' && gameState.status !== 'CHOOSING') {
          timerColorClass = 'bg-[#00D9FF] shadow-[0_0_8px_rgba(0,217,255,0.6)]';
        } else {
          if (pct <= 20) {
            timerColorClass = 'bg-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.7)]';
          } else if (pct <= 50) {
            timerColorClass = 'bg-[#F97316] shadow-[0_0_8px_rgba(249,115,22,0.6)]';
          }
        }
        barRef.current.className = `h-full rounded-full transition-all duration-100 ${timerColorClass}`;
      }

      requestId = requestAnimationFrame(updateTimer);
    };
    requestId = requestAnimationFrame(updateTimer);
    return () => cancelAnimationFrame(requestId);
  }, [maxTime, gameState.status]);

  return (
    <div className="w-full h-1.5 sm:h-2 bg-[#1A103C] rounded-full overflow-hidden shadow-inner flex justify-start mt-1.5" dir="ltr">
      <div ref={barRef} className="h-full rounded-full bg-amber-400" />
    </div>
  );
};

export const DrawingBoard: React.FC<DrawingBoardProps> = ({
  socket,
  roomId,
  nickname,
  avatar,
  persistentId,
}) => {
  const [roomState, setRoomState] = useState<any>(null);
  const [joined, setJoined] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // متتبع الارتفاع التلقائي لتقلص الواجهة بالكامل عند صعود كيبورد الهاتف
  const [viewportHeight, setViewportHeight] = useState<number>(() => {
    return window.visualViewport ? window.visualViewport.height : window.innerHeight;
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
      } else {
        setViewportHeight(window.innerHeight);
      }
    };

    window.visualViewport?.addEventListener('resize', handleResize);
    window.addEventListener('resize', handleResize);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    console.log("[Diagnostic] ✨ DrawingBoard mounted, emitting 'join_room' with:", { roomId, nickname, avatar, persistentId });
    socket.emit(
      'join_room',
      { roomId, nickname, avatar, playerId: persistentId },
      (res: any) => {
        console.log("[Diagnostic] 📥 Received callback for 'join_room':", res);
        if (res?.error) {
          setErrorMsg(res.error);
        } else {
          setJoined(true);
        }
      }
    );

    const handleRoomUpdate = (updatedRoom: any) => {
      console.log("[Diagnostic] 🔄 Received 'room_update' event:", updatedRoom);
      setRoomState(updatedRoom);
    };

    const handleTimerTick = (data: { timeLeft: number; status: string }) => {
      setRoomState((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          gameState: {
            ...prev.gameState,
            timeLeft: data.timeLeft,
            status: data.status,
          }
        };
      });
    };

    socket.on('room_update', handleRoomUpdate);
    socket.on('timer_tick', handleTimerTick);

    return () => {
      socket.off('room_update', handleRoomUpdate);
      socket.off('timer_tick', handleTimerTick);
    };
  }, [socket, roomId, nickname, avatar, persistentId]);

  const handleExit = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('gartic_player_room');
    }
    window.location.reload();
  };

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#120930] p-4 text-center">
        <div className="bg-[#1C1145] border border-red-500/30 p-6 rounded-2xl shadow-lg max-w-sm">
          <span className="text-4xl">⚠️</span>
          <p className="text-rose-400 font-bold mt-3 text-sm">{errorMsg}</p>
          <button onClick={() => window.location.reload()} className="mt-4 bg-[#7C4DFF] text-white text-xs px-4 py-2.5 rounded-xl hover:bg-[#683FD6] active:scale-95 transition-all">
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  if (!joined || !roomState) {
    console.log("[Diagnostic] ⏳ Rendering loading state. joined:", joined, "roomState:", !!roomState);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#120930]">
        <div className="w-12 h-12 border-4 border-[#00D9FF] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-semibold text-[#00D9FF] mt-4 tracking-wider animate-pulse">جاري الاتصال وتأمين الغرفة...</p>
      </div>
    );
  }

  console.log("[Diagnostic] ✅ Rendering DrawingBoard. roomState keys:", Object.keys(roomState));
  const { gameState, players } = roomState;

  // احتساب الوقت الأقصى بناء على حالة اللعبة لضمان دقة المؤقت
  const getTimerMax = () => {
    if (gameState.status === 'CHOOSING') return 15;
    if (gameState.status === 'DRAWING') return 80;
    if (gameState.status === 'ROUND_END') return 10;
    return 80;
  };

  const isMyTurn = gameState.currentDrawerId === persistentId;

  return (
    <div
      className="flex flex-col bg-[#120930] p-3 gap-2 max-w-md mx-auto justify-start overflow-hidden relative select-none"
      style={{ height: `${viewportHeight}px`, maxHeight: `${viewportHeight}px` }}
      dir="rtl"
    >
      {/* هيدر الغرفة اللامع للعداد والكلمة */}
      <div className="w-full bg-[#1C1145]/90 border border-white/10 rounded-2xl p-3 shadow-lg flex flex-col gap-1.5 shrink-0">
        <div className="flex items-center justify-between w-full">
          {/* قسم اليمين: الجولات وخروج */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExit}
              className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl transition-colors active:scale-90"
              title="خروج"
            >
              <LogOut size={16} />
            </button>
            <div className="text-right">
              <span className="text-[9px] text-[#00D9FF] block font-black uppercase tracking-wider">الجولة</span>
              <span className="text-xs font-black text-white">{gameState.currentRound}/3</span>
            </div>
          </div>

          {/* قسم المنتصف: الكلمة المراد رسمها بسبيسات أحرف مريحة للعين */}
          <div className="text-center flex-1">
            <span className="text-[9px] text-indigo-300 block font-black uppercase tracking-wider">الكلمة المراد رسمها</span>
            <span className="text-sm sm:text-base font-black tracking-widest text-[#FFD700] bg-white/5 px-2.5 py-0.5 rounded-lg border border-white/5">
              {isMyTurn || gameState.status !== 'DRAWING'
                ? gameState.currentWord || 'جاري التحضير...'
                : gameState.hintWord}
            </span>
          </div>

          {/* قسم اليسار: الوقت الرقمي */}
          <div className="text-left">
            <span className="text-[9px] text-amber-400 block font-black uppercase tracking-wider">المؤقت</span>
            <span className="text-sm font-black text-white">{gameState.timeLeft} ث</span>
          </div>
        </div>

        {/* المؤقت الانسيابي الذكي الفرعي */}
        <SmoothTimer gameState={gameState} maxTime={getTimerMax()} />
      </div>

      {/* الكانفاس بحدود نيون زرقاء متوهجة */}
      <div className="shrink-0 relative rounded-2xl border border-[#00D9FF]/20 shadow-[0_0_15px_rgba(0,217,255,0.1)] overflow-hidden">
        <Canvas
          socket={socket}
          roomId={roomId}
          currentDrawerId={gameState.currentDrawerId}
          persistentId={persistentId}
        />
      </div>

      {/* شريط الألعاب/التخطي لطور الرسم أو الاختيار */}
      <GameToolbar
        status={gameState.status}
        currentDrawerId={gameState.currentDrawerId}
        persistentId={persistentId}
        wordOptions={gameState.wordOptions || []}
        onSelectWord={(word) => socket.emit('select_word', { roomId, word })}
        onSkipTurn={() => socket.emit('skip_turn')}
      />

      {/* قائمة اللاعبين الأفقية المحدثة بالكامل لتوفر مساحة الشاشة للمحادثة */}
      <PlayersList players={players} currentDrawerId={gameState.currentDrawerId} />

      {/* المحادثة وصندوق الخمن بوضعية نيون مرنة تتقلص حسب الطول المتوفر */}
      <GameChat socket={socket} roomId={roomId} status={gameState.status} />
    </div>
  );
};

