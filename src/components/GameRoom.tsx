import React, { useMemo } from 'react';
import { useSocket } from './SocketProvider';
import { DrawingBoard } from './DrawingBoard';

interface GameRoomProps {
  nickname: string;
  room: string;
  avatar: string;
  onLeave?: () => void;
  justJoined?: boolean;
}

export default function GameRoom({ nickname, room, avatar }: GameRoomProps) {
  const { socket } = useSocket();

  // توليد المعرف الثابت الموحد للهاتف والجهاز لمنع الخروج وإضافة ميزة استئناف الاتصال
  const persistentId = useMemo(() => {
    if (typeof window !== 'undefined') {
      let id = localStorage.getItem('gartic_persistent_id');
      if (!id) {
        id = 'player-' + Math.random().toString(36).substring(2, 11);
        localStorage.setItem('gartic_persistent_id', id);
      }
      return id;
    }
    return 'player-fallback';
  }, []);

  if (!socket) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 animate-fade-in">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-medium text-slate-500 mt-4">جاري تهيئة الاتصال بالسيرفر...</p>
      </div>
    );
  }

  return (
    <DrawingBoard
      socket={socket}
      roomId={room}
      nickname={nickname}
      avatar={avatar}
      persistentId={persistentId}
    />
  );
}
