import React, { useState, useRef, useEffect } from 'react';
import { Socket } from 'socket.io-client';

interface ChatMessage {
  id: string;
  text: string;
  sender?: string;
  senderId?: string;
  type: 'message' | 'system';
  subType?: 'hit' | 'turn' | 'answer_reveal' | 'all_guessed' | 'skipped' | 'lost_turn';
  color?: string;
}

interface GameChatProps {
  socket: Socket;
  roomId: string;
  status: string;
}

export const GameChat: React.FC<GameChatProps> = ({ socket, roomId, status }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. استقبال الرسائل والتخمينات مع تطبيق الطابور المنزلق (حد أقصى 40 رسالة في الرام)
    const handleNewMessage = (msg: ChatMessage) => {
      setMessages((prev) => {
        const updated = [...prev, msg];
        if (updated.length > 40) {
          updated.shift(); // طرد أقدم رسالة لحماية الذاكرة فوراً
        }
        return updated;
      });
    };

    socket.on('receive_message', handleNewMessage);
    socket.on('receive_guess', handleNewMessage);

    return () => {
      socket.off('receive_message', handleNewMessage);
      socket.off('receive_guess', handleNewMessage);
    };
  }, [socket]);

  // النزول التلقائي لأسفل الشات عند استقبال رسالة جديدة بسلاسة
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // إذا كانت اللعبة في طور الرسم، نرسل الرسالة كتخمين للكلمة، وإلا نرسلها كشات عادي
    if (status === 'DRAWING') {
      socket.emit('submit_guess', { roomId, guess: inputValue.trim() });
    } else {
      socket.emit('send_message', { roomId, text: inputValue.trim() });
    }

    setInputValue('');
  };

  return (
    <div className="flex flex-col flex-1 min-h-[120px] w-full bg-[#180F33]/85 border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex-grow" dir="rtl">
      {/* منطقة عرض الرسائل */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2 text-sm no-scrollbar">
        {messages.map((msg) => {
          if (msg.type === 'system') {
            const isHitSys = msg.subType === 'hit';
            
            return (
              <div
                key={msg.id}
                className={`text-center font-bold text-xs py-1.5 px-3 rounded-xl border my-1 max-w-[90%] mx-auto block animate-fade-in ${
                  isHitSys 
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.15)]'
                    : 'bg-[#20144B]/70 border-white/5 text-indigo-200'
                }`}
              >
                {msg.text}
              </div>
            );
          }

          const isHit = msg.subType === 'hit';
          return (
            <div
              key={msg.id}
              className={`p-2.5 rounded-xl max-w-[85%] break-words border text-right transition-all duration-300 ${
                isHit
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.1)] font-bold mr-auto'
                  : 'bg-[#24174D]/60 border-white/5 text-white/95'
              }`}
            >
              <span className="font-extrabold text-[10px] text-[#00D9FF]/80 block mb-0.5">
                {msg.sender}
              </span>
              <span className="text-sm font-semibold">{msg.text}</span>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* صندوق إدخال النص الزاحف السفلي */}
      <form onSubmit={handleSendMessage} className="p-2 bg-[#20144B] border-t border-white/10 flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={status === 'DRAWING' ? 'اكتب تخمينك للكلمة هنا...' : 'اكتب رسالة للدردشة...'}
          maxLength={50}
          className="flex-1 px-3.5 py-2.5 bg-[#140C2E]/95 border border-white/5 rounded-xl text-right text-sm text-white focus:outline-none focus:border-[#7C4DFF] focus:bg-[#110A26] transition-all placeholder:text-white/30"
        />
        <button
          type="submit"
          className="bg-[#7C4DFF] hover:bg-[#683FD6] active:scale-95 text-white font-black px-4 py-2.5 rounded-xl text-sm transition-all shadow-md shadow-[#7C4DFF]/20"
        >
          {status === 'DRAWING' ? 'خمن' : 'أرسل'}
        </button>
      </form>
    </div>
  );
};

