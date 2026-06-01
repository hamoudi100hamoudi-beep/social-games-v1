import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { DrawingBoard } from './DrawingBoard';

interface GameRoomProps {
  socket: Socket;
  roomId: string;
}

export const GameRoom: React.FC<GameRoomProps> = ({ socket, roomId }) => {
  const [nickname, setNickname] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('gartic_player_nickname') || '';
    }
    return '';
  });
  const [avatar, setAvatar] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('gartic_player_avatar') || '🦊';
    }
    return '🦊';
  });
  const [persistentId, setPersistentId] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // توليد أو استرجاع معرف ثابت فريد للهاتف لمنع الطرد عند قفل الشاشة
    let pId = localStorage.getItem('game_persistent_id');
    if (!pId) {
      pId = 'p_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('game_persistent_id', pId);
    }
    setPersistentId(pId);
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("👆 [Button Clicked] Join Room button pressed. Data:", { roomId, nickname });
    
    const trimmed = nickname.trim();
    if (!trimmed || trimmed.length < 2) {
      console.log("⚠️ [Button Clicked] Nickname too short or empty. Halting.");
      setError('⚠️ يجب إدخال اسم مستخدم يحتوي على حرفين على الأقل!');
      return;
    }
    
    setError('');
    console.log("✅ [Button Clicked] Nickname valid. Setting isJoined to true.");
    // تفعيل التحول فوراً لعرض اللوحة الرئيسية ومباشرة الاتصال
    setIsJoined(true);
  };

  if (isJoined) {
    return (
      <DrawingBoard
        socket={socket}
        roomId={roomId}
        nickname={nickname.trim()}
        avatar={avatar}
        persistentId={persistentId}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4 dir-rtl text-right" dir="rtl">
      <form onSubmit={handleJoin} className="bg-white p-6 rounded-2xl shadow-md w-full max-w-sm border border-slate-200 space-y-4">
        <h2 className="text-xl font-black text-center text-slate-800">دخول غرفة اللعبة</h2>
        
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-500 mr-1">اكتب اسمك المستعار:</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              if (error) setError('');
            }}
            placeholder="مثال: البطل..."
            maxLength={15}
            className={`w-full px-3 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:border-indigo-500 text-right transition-colors ${
              error ? 'border-rose-300 focus:border-rose-500 bg-rose-50/20' : 'border-slate-200'
            }`}
          />
          {error && (
            <p className="text-rose-600 text-xs font-bold text-right mt-1 animate-fade-in">
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm shadow-sm transition-all active:scale-95 text-center block"
        >
          دخول الروم - فحص التحديث V2 🚀
        </button>
      </form>
    </div>
  );
};
