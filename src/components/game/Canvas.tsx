import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';

interface CanvasProps {
  socket: Socket;
  roomId: string;
  currentDrawerId: string | null;
  persistentId: string;
}

export const Canvas: React.FC<CanvasProps> = ({ socket, roomId, currentDrawerId, persistentId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const isMyTurn = currentDrawerId === persistentId;
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // إعدادات الخط الثابتة والمريحة لمعالج الهاتف
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000000';

    // 1. استقبال الرسم الباينري من السيرفر وفك تشفيره فوراً
    const handleDrawBinary = (buf: ArrayBuffer | Uint8Array) => {
      if (isMyTurn) return; // إذا كنت أنا الرسام لا أرسم فوق نفسي من السيرفر
      const arr = new Uint8Array(buf);
      if (arr.length < 5) return;

      const type = arr[0];
      // نوع 5 يعني مسح اللوحة بالكامل
      if (type === 5) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      // نوع 1 (بدء خط جديد)، نوع 2 (رسم مستمر)
      const x = (arr[1] << 8) | arr[2];
      const y = (arr[3] << 8) | arr[4];

      if (type === 1) {
        ctx.beginPath();
        ctx.moveTo(x, y);
      } else if (type === 2) {
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    };

    // 2. استقبال مسح اللوحة الصريح
    const handleDrawClear = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    // 3. استقبال المزامنة المقتطعة لآخر 100 حركة عند الدخول لأول مرة
    const handleHistorySync = (history: any[]) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      history.forEach((cmd) => {
        if (cmd.data) handleDrawBinary(cmd.data);
      });
    };

    socket.on('draw_binary', handleDrawBinary);
    socket.on('draw_clear', handleDrawClear);
    socket.on('clear_canvas', handleDrawClear);
    socket.on('draw_history_sync', handleHistorySync);

    return () => {
      socket.off('draw_binary', handleDrawBinary);
      socket.off('draw_clear', handleDrawClear);
      socket.off('clear_canvas', handleDrawClear);
      socket.off('draw_history_sync', handleHistorySync);
    };
  }, [socket, isMyTurn]);

  // دالة تحويل الإحداثيات وضغطها في 5 بايت فقط لحماية الشبكة والرام
  const emitDraw = (type: number, x: number, y: number) => {
    const buf = new Uint8Array(5);
    buf[0] = type;
    buf[1] = (x >> 8) & 0xff;
    buf[2] = x & 0xff;
    buf[3] = (y >> 8) & 0xff;
    buf[4] = y & 0xff;
    socket.emit('draw_binary', buf);
  };

  const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    
    // حساب النسب بدقة لتطابق الرسم بين الهواتف المختلفة الحجم
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: Math.floor((touch.clientX - rect.left) * scaleX),
      y: Math.floor((touch.clientY - rect.top) * scaleY)
    };
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isMyTurn) return;
    e.preventDefault();
    const pos = getTouchPos(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
    
    setIsDrawing(true);
    lastPoint.current = pos;
    emitDraw(1, pos.x, pos.y);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isMyTurn) return;
    e.preventDefault();
    const pos = getTouchPos(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (lastPoint.current && ctx) {
      // الفلترة الذكية لحماية المعالج: لا ترسل شيئاً إذا لم تتحرك اليد أكثر من بكسل واحد
      const dist = Math.hypot(pos.x - lastPoint.current.x, pos.y - lastPoint.current.y);
      if (dist < 1.5) return;

      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      emitDraw(2, pos.x, pos.y);
      lastPoint.current = pos;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isMyTurn) return;
    e.preventDefault();
    setIsDrawing(false);
    lastPoint.current = null;
  };

  return (
    <div className="relative w-full aspect-[4/3] bg-white rounded-xl shadow-inner border border-gray-200 overflow-hidden touch-none">
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-full h-full object-contain"
      />
      {!isMyTurn && (
        <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full pointer-events-none backdrop-blur-sm">
          جاري مشاهدة الرسم...
        </div>
      )}
    </div>
  );
};
