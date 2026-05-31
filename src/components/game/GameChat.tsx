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
    <div className="flex flex-col h-[300px] w-full bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-inner">
      {/* منطقة عرض الرسائل */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
        {messages.map((msg) => {
          if (msg.type === 'system') {
            return (
              <div
                key={msg.id}
                style={{ color: msg.color || '#64748B' }}
                className="text-center font-bold bg-white/80 py-1 px-3 rounded-lg border border-slate-100 shadow-sm animate-fade-in"
              >
                {msg.text}
              </div>
            );
          }

          const isHit = msg.subType === 'hit';
          return (
            <div
              key={msg.id}
              className={`p-2 rounded-lg max-w-[90%] break-words border text-right transition-colors ${
                isHit
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium'
                  : 'bg-white border-slate-100 text-slate-700'
              }`}
            >
              <span className="font-bold text-xs text-slate-400 block mb-0.5">
                {msg.sender}
              </span>
              <span>{msg.text}</span>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* صندوق إدخال النص الزاحف السفلي */}
      <form onSubmit={handleSendMessage} className="p-2 bg-white border-t border-slate-200 flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={status === 'DRAWING' ? 'اكتب تخمينك للكلمة هنا...' : 'اكتب رسالة للدردشة...'}
          maxLength={50}
          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-right text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all placeholder:text-slate-400"
        />
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors shadow-sm active:scale-95"
        >
          {status === 'DRAWING' ? 'خمن' : 'أرسل'}
        </button>
      </form>
    </div>
  );
};
