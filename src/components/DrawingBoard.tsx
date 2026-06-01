import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { Canvas } from './game/Canvas';
import { GameChat } from './game/GameChat';
import { PlayersList } from './game/PlayersList';
import { GameToolbar } from './game/GameToolbar';

interface DrawingBoardProps {
  socket: Socket;
  roomId: string;
  nickname: string;
  avatar: string;
  persistentId: string;
}

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

    socket.on('room_update', handleRoomUpdate);

    return () => {
      socket.off('room_update', handleRoomUpdate);
    };
  }, [socket, roomId, nickname, avatar, persistentId]);

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4 text-center">
        <div className="bg-white border border-rose-200 p-6 rounded-2xl shadow-sm max-w-sm">
          <span className="text-4xl">⚠️</span>
          <p className="text-rose-700 font-bold mt-3 text-sm">{errorMsg}</p>
          <button onClick={() => window.location.reload()} className="mt-4 bg-slate-900 text-white text-xs px-4 py-2 rounded-xl">
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  if (!joined || !roomState) {
    console.log("[Diagnostic] ⏳ Rendering loading state. joined:", joined, "roomState:", !!roomState);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-medium text-slate-500 mt-4">جاري تأمين الجلسة والدخول للغرفة...</p>
      </div>
    );
  }

  console.log("[Diagnostic] ✅ Rendering DrawingBoard. roomState keys:", Object.keys(roomState));
  const { gameState, players } = roomState;

  return (
    <div className="flex flex-col min-h-screen bg-slate-100 p-3 gap-3 max-w-md mx-auto justify-start overflow-x-hidden">
      <div className="w-full bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex items-center justify-between">
        <div className="text-left">
          <span className="text-[10px] text-slate-400 block font-bold">المؤقت</span>
          <span className="text-sm font-black text-indigo-600">{gameState.timer} ث</span>
        </div>
        <div className="text-center flex-1">
          <span className="text-[10px] text-slate-400 block font-bold">الكلمة المراد رسمها</span>
          <span className="text-base font-black tracking-widest text-slate-800">
            {gameState.currentDrawerId === persistentId || gameState.status !== 'DRAWING'
              ? gameState.currentWord
              : gameState.hintWord}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-400 block font-bold">الجولة</span>
          <span className="text-sm font-black text-slate-700">{gameState.currentRound}/3</span>
        </div>
      </div>

      <Canvas
        socket={socket}
        roomId={roomId}
        currentDrawerId={gameState.currentDrawerId}
        persistentId={persistentId}
      />

      <GameToolbar
        status={gameState.status}
        currentDrawerId={gameState.currentDrawerId}
        persistentId={persistentId}
        wordOptions={gameState.wordOptions || []}
        onSelectWord={(word) => socket.emit('select_word', { roomId, word })}
        onSkipTurn={() => socket.emit('skip_turn')}
      />

      <PlayersList players={players} currentDrawerId={gameState.currentDrawerId} />

      <GameChat socket={socket} roomId={roomId} status={gameState.status} />
    </div>
  );
};
