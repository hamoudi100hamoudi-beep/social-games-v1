import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { Undo, Trash2, Eraser, Sparkles } from 'lucide-react';

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

  // خيارات الألوان النيون الرائعة
  const colors = [
    { name: 'أسود', value: '#000000', rgb: [0, 0, 0], glow: 'rgba(0,0,0,0.4)' },
    { name: 'أحمر نيون', value: '#FF3B30', rgb: [255, 59, 48], glow: 'rgba(255,59,48,0.5)' },
    { name: 'برتقالي نيون', value: '#FF9500', rgb: [255, 149, 0], glow: 'rgba(255,149,0,0.5)' },
    { name: 'أصفر نيون', value: '#FFCC00', rgb: [255, 204, 0], glow: 'rgba(255,204,0,0.5)' },
    { name: 'أخضر نيون', value: '#34C759', rgb: [52, 199, 89], glow: 'rgba(52,199,89,0.5)' },
    { name: 'سماوي نيون', value: '#00D9FF', rgb: [0, 217, 255], glow: 'rgba(0,217,255,0.5)' },
    { name: 'أزرق ملكي', value: '#007AFF', rgb: [0, 122, 255], glow: 'rgba(0,122,255,0.5)' },
    { name: 'بنفسجي متوهج', value: '#AF52DE', rgb: [175, 82, 222], glow: 'rgba(175,82,222,0.5)' },
    { name: 'وردي نيون', value: '#FF2D55', rgb: [255, 45, 85], glow: 'rgba(255,45,85,0.5)' },
    { name: 'بني دافئ', value: '#8B5A2B', rgb: [139, 90, 43], glow: 'rgba(139,90,43,0.5)' },
  ];

  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentThickness, setCurrentThickness] = useState(6);
  const [isEraser, setIsEraser] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // إعدادات لوحة الرسم الافتراضية
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#000000';

    // 1. معالجة الأوامر الرسومية الواردة والباينري فائقة الخفة
    const handleDrawBinary = (buf: ArrayBuffer | Uint8Array, force: boolean = false) => {
      if (isMyTurn && !force) return; // منع تكرار الرسم محلياً للرسام نفسه
      const arr = new Uint8Array(buf);
      if (arr.length < 1) return;

      const type = arr[0];

      // نوع 5: مسح لوحة الرسم بالكامل
      if (type === 5) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      // نوع 3: تغيير لون الرسم [3, R, G, B]
      if (type === 3) {
        if (arr.length >= 4) {
          ctx.strokeStyle = `rgb(${arr[1]},${arr[2]},${arr[3]})`;
        }
        return;
      }

      // نوع 4: تغيير سماكة الفرشاة [4, thickness]
      if (type === 4) {
        if (arr.length >= 2) {
          ctx.lineWidth = arr[1];
        }
        return;
      }

      // نوع 1 و 2: رسم الخطوط الإحداثية [type, x_high, x_low, y_high, y_low]
      if (arr.length < 5) return;
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

    const handleDrawClear = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const handleHistorySync = (history: any[]) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      history.forEach((cmd) => {
        if (cmd.data) handleDrawBinary(cmd.data, true);
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

  // إرسال حركات الرسم
  const emitDraw = (type: number, x: number, y: number) => {
    const buf = new Uint8Array(5);
    buf[0] = type;
    buf[1] = (x >> 8) & 0xff;
    buf[2] = x & 0xff;
    buf[3] = (y >> 8) & 0xff;
    buf[4] = y & 0xff;
    socket.emit('draw_binary', buf);
  };

  // ----------------------------------------------------
  // معالجة اللمس (Touch Events for Mobile)
  // ----------------------------------------------------
  const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
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
    startStroke(pos.x, pos.y);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isMyTurn) return;
    e.preventDefault();
    const pos = getTouchPos(e);
    moveStroke(pos.x, pos.y);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isMyTurn) return;
    e.preventDefault();
    endStroke();
  };

  // ----------------------------------------------------
  // معالجة الماوس (Mouse Events for Desktop testing)
  // ----------------------------------------------------
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.floor((e.clientX - rect.left) * scaleX),
      y: Math.floor((e.clientY - rect.top) * scaleY)
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMyTurn) return;
    const pos = getMousePos(e);
    startStroke(pos.x, pos.y);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isMyTurn) return;
    const pos = getMousePos(e);
    moveStroke(pos.x, pos.y);
  };

  const handleMouseUp = () => {
    if (!isMyTurn) return;
    endStroke();
  };

  // ----------------------------------------------------
  // منطق الرسم الموحد والمتناسق
  // ----------------------------------------------------
  const startStroke = (x: number, y: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const activeColor = isEraser ? '#FFFFFF' : currentColor;
    const activeRgb = isEraser ? [255, 255, 255] : colors.find(c => c.value === currentColor)?.rgb || [0, 0, 0];
    const activeLineWidth = isEraser ? 24 : currentThickness;

    if (ctx) {
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = activeLineWidth;
      ctx.beginPath();
      ctx.moveTo(x, y);
    }

    setIsDrawing(true);
    lastPoint.current = { x, y };

    // تزامن اللون الحالي مع السيرفر واللاعبين
    const colorBuf = new Uint8Array(4);
    colorBuf[0] = 3;
    colorBuf[1] = activeRgb[0];
    colorBuf[2] = activeRgb[1];
    colorBuf[3] = activeRgb[2];
    socket.emit('draw_binary', colorBuf);

    // تزامن حجم خط الفرشاة الحالي
    const thickBuf = new Uint8Array(2);
    thickBuf[0] = 4;
    thickBuf[1] = activeLineWidth;
    socket.emit('draw_binary', thickBuf);

    // إرسال بدء النقطة الأولى
    emitDraw(1, x, y);
  };

  const moveStroke = (x: number, y: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const activeColor = isEraser ? '#FFFFFF' : currentColor;
    const activeLineWidth = isEraser ? 24 : currentThickness;

    if (lastPoint.current && ctx) {
      // تجنب فرط النبضات للماوس أو المستشعر لقطع التقطع
      const dist = Math.hypot(x - lastPoint.current.x, y - lastPoint.current.y);
      if (dist < 1.5) return;

      ctx.strokeStyle = activeColor;
      ctx.lineWidth = activeLineWidth;
      ctx.lineTo(x, y);
      ctx.stroke();

      emitDraw(2, x, y);
      lastPoint.current = { x, y };
    }
  };

  const endStroke = () => {
    setIsDrawing(false);
    lastPoint.current = null;
  };

  // التراجع عن آخر جرة قلم
  const handleUndo = () => {
    socket.emit('undo_draw');
  };

  // مسح كامل الشاشة وحسابات الرسم
  const handleClearAll = () => {
    const buf = new Uint8Array(1);
    buf[0] = 5;
    socket.emit('draw_binary', buf);
  };

  return (
    <div className="w-full flex flex-col gap-2">
      {/* الكانفاس بحد ذاته مع غلاف نيون سفلي للأزرار دوري */}
      <div className="relative w-full aspect-[4/3] bg-white rounded-2xl shadow-inner border border-white/5 overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="w-full h-full object-contain cursor-crosshair bg-white"
        />
        {!isMyTurn && (
          <div className="absolute top-2.5 right-2.5 bg-black/75 text-white text-[10px] font-black tracking-wider px-3 py-1.5 rounded-xl pointer-events-none backdrop-blur-md border border-white/10 flex items-center gap-1.5 animate-pulse">
            <Sparkles size={11} className="text-[#00D9FF]" />
            <span>شاشة العرض المباشر (تخمين سريع)</span>
          </div>
        )}
      </div>

      {/* لوحة التحكم اللامعة تظهر للرسام فقط */}
      {isMyTurn && (
        <div className="w-full p-2.5 bg-[#1C1145]/95 border border-white/10 rounded-2xl flex flex-col gap-2.5 shrink-0 select-none animate-fade-in shadow-2xl">
          {/* سطر انتقاء الألوان */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-indigo-300 shrink-0 select-none">الألوان:</span>
            <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar py-1">
              {colors.map((c) => {
                const isSelected = currentColor === c.value && !isEraser;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => {
                      setCurrentColor(c.value);
                      setIsEraser(false);
                    }}
                    className={`w-6.5 h-6.5 rounded-full shrink-0 border transition-all duration-300 relative ${
                      isSelected 
                        ? 'border-white scale-110 ring-2 ring-indigo-550 shadow-[0_0_8px_rgba(255,255,255,0.4)] border-white' 
                        : 'border-white/20 hover:scale-105'
                    }`}
                    style={{ 
                      backgroundColor: c.value,
                      boxShadow: isSelected ? `0 0 10px ${c.glow}` : 'none'
                    }}
                    title={c.name}
                  />
                );
              })}
            </div>
          </div>

          {/* سطر الإجراءات والحجم منزلق */}
          <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-2">
            {/* منزلق الحجم التفاعلي */}
            <div className="flex items-center gap-2 flex-grow max-w-[50%]">
              <span className="text-[10px] font-black text-indigo-300 shrink-0">الحجم:</span>
              <input
                type="range"
                min="2"
                max="30"
                value={currentThickness}
                onChange={(e) => setCurrentThickness(parseInt(e.target.value))}
                className="w-full h-1 bg-[#120930] rounded-lg appearance-none cursor-pointer accent-[#00D9FF] outline-none"
              />
              <div 
                className="w-4 h-4 rounded-full bg-white border border-white/20 shrink-0 shadow-inner flex items-center justify-center text-[8px] text-slate-800 font-bold"
                style={{ width: `${Math.max(6, currentThickness)}px`, height: `${Math.max(6, currentThickness)}px` }}
              />
            </div>

            {/* أزرار السير والتراجع والمسح */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* زر الممحاة */}
              <button
                type="button"
                onClick={() => setIsEraser(prev => !prev)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black border transition-all duration-300 active:scale-90 ${
                  isEraser 
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-[0_0_8px_rgba(239,68,68,0.2)]' 
                    : 'bg-[#120930] text-indigo-200 border-white/5 hover:border-white/10'
                }`}
                title="تفعيل الممحاة العريضة"
              >
                <Eraser size={11} />
                <span>ممحاة</span>
              </button>

              {/* زر تراجع */}
              <button
                type="button"
                onClick={handleUndo}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black bg-[#120930] text-indigo-200 border border-white/5 hover:border-indigo-500/20 hover:text-white transition-all active:scale-90"
                title="محي آخر جرة قلم"
              >
                <Undo size={11} />
                <span>تراجع</span>
              </button>

              {/* زر محي الكل */}
              <button
                type="button"
                onClick={handleClearAll}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 hover:text-white transition-all active:scale-90"
                title="مسح اللوحة بالكامل"
              >
                <Trash2 size={11} />
                <span>مسح</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
