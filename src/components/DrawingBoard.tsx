/* 
 * ! PROTECTED FILE !
 * This component handles the UI layers, menus, toolbar controls and palette bindings,
 * delegating the high-performance drawing actions to the isolated DrawingCanvasCore.
 */
import React, { useEffect, useRef, useState } from 'react';
import { 
  Pencil, Eraser, Undo2, Redo2, FileX, RefreshCcw, 
  Lightbulb, UserMinus, Circle, Square, PaintBucket, Minus, Pipette 
} from 'lucide-react';
import { ToolType } from '../types/draw';
import {
  TOP_COLORS,
  BOT_COLORS
} from '../utils/drawBinaryHelper';
import DrawingCanvasCore, { DrawingCanvasCoreRef } from './game/DrawingCanvasCore';

const LOGICAL_HEIGHT = 600;

export default function DrawingBoard({ 
  readOnly = false,
  onSkipTurn,
  onRequestHint,
  hintsRemaining = 0,
  timerBarNode
}: { 
  readOnly?: boolean;
  onSkipTurn?: () => void;
  onRequestHint?: () => void;
  hintsRemaining?: number;
  timerPercentage?: number;
  timerBarNode?: React.ReactNode;
  key?: any;
}) {
  const canvasCoreRef = useRef<DrawingCanvasCoreRef>(null);

  // Layout scale tracking for thickness preview bubble resizing
  const containerRef = useRef<HTMLDivElement>(null);
  const [baseScale, setBaseScale] = useState(1);

  // States
  const [activeMenu, setActiveMenu] = useState<'tools' | 'controls' | null>(null);
  const [tool, setTool] = useState<ToolType>('pencil');
  const [color, setColor] = useState('#000000');
  const [penWidth, setPenWidth] = useState(5);
  const [penOpacity, setPenOpacity] = useState(1);
  const [eraserWidth, setEraserWidth] = useState(40);
  const [eraserOpacity, setEraserOpacity] = useState(1);
  const [bucketOpacity, setBucketOpacity] = useState(1);
  const [previewSize, setPreviewSize] = useState<number | null>(null);
  const [historyState, setHistoryState] = useState({ index: 0, length: 0 });
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // References
  const previousTool = useRef<ToolType>('pencil');
  const colorsScrollRef = useRef<HTMLDivElement>(null);

  // Desktop drag scroller for color selector
  useEffect(() => {
    const el = colorsScrollRef.current;
    if (!el) return;
    let isDown = false;
    let startX: number;
    let scrollLeft: number;

    const handleMouseDown = (e: MouseEvent) => {
      isDown = true;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
    };
    const handleMouseLeave = () => {
      isDown = false;
    };
    const handleMouseUp = () => {
      isDown = false;
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.5;
      el.scrollLeft = scrollLeft - walk;
    };

    el.addEventListener('mousedown', handleMouseDown, { passive: false });
    el.addEventListener('mouseleave', handleMouseLeave);
    el.addEventListener('mouseup', handleMouseUp);
    el.addEventListener('mousemove', handleMouseMove, { passive: false });
    return () => {
      el.removeEventListener('mousedown', handleMouseDown);
      el.removeEventListener('mouseleave', handleMouseLeave);
      el.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Update layout scale on resize to correctly align the pen thickness circles preview
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { height } = entry.contentRect;
        if (height === 0) continue;
        const targetScale = height / LOGICAL_HEIGHT;
        setBaseScale(targetScale || 1);
      }
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  const changeTool = (newTool: ToolType) => {
    if (newTool !== 'pipette') {
      previousTool.current = newTool;
    }
    setTool(newTool);
    setActiveMenu(null);
  };

  const currentWidth = tool === 'eraser' ? eraserWidth : penWidth;
  const currentOpacity = tool === 'eraser' ? eraserOpacity : (tool === 'bucket' ? bucketOpacity : penOpacity);

  const undo = () => {
    canvasCoreRef.current?.undo();
  };

  const redo = () => {
    canvasCoreRef.current?.redo();
  };

  const confirmClear = () => {
    canvasCoreRef.current?.clear();
    setShowClearConfirm(false);
  };

  const requestClearCanvas = () => {
    setShowClearConfirm(true);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-white touch-none select-none" dir="rtl">
      
      {showClearConfirm && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
           <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-[90%] text-center" dir="rtl">
              <h3 className="text-xl font-bold mb-2 text-slate-800">تأكيد المسح</h3>
              <p className="text-slate-600 mb-6">هل أنت متأكد من مسح مساحة الرسم بالكامل؟</p>
              <div className="flex gap-3 justify-center">
                 <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-800 font-medium hover:bg-slate-200 transition-colors">إلغاء</button>
                 <button onClick={confirmClear} className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-700 transition-colors">مسح بالكامل</button>
              </div>
           </div>
        </div>
      )}

      {/* Canvas Container Area */}
      <div ref={containerRef} dir="ltr" className="flex-1 relative bg-slate-100 overflow-hidden w-full h-full cursor-crosshair">
        
        {/* Core isolated draw canvas layer */}
        <DrawingCanvasCore
          ref={canvasCoreRef}
          readOnly={readOnly}
          tool={tool}
          color={color}
          thickness={currentWidth}
          opacity={currentOpacity}
          onHistoryStateChange={(idx, len) => setHistoryState({ index: idx, length: len })}
          onPipetteColorPicked={(hex) => {
            setColor(hex);
            if (tool === 'pipette') {
              changeTool(previousTool.current);
            }
          }}
        />

        {/* Brush Size Preview Bubble */}
        {previewSize !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50 touch-none">
            <div 
              className="rounded-full border border-black shadow-[0_0_0_1px_rgba(255,255,255,0.8)]"
              style={{
                width: previewSize * baseScale,
                height: previewSize * baseScale,
              }}
            />
          </div>
        )}

        {/* Overlay Tools Sub-Menu */}
        {!readOnly && activeMenu === 'tools' && (
          <div className="absolute bottom-[58px] left-[6px] grid grid-cols-2 gap-2 bg-black/80 p-2.5 rounded-xl border border-white/20 shadow-xl z-20 animate-in fade-in slide-in-from-bottom-2">
            <SubToolBtn icon={<Pencil />} active={tool==='pencil'} onClick={() => changeTool('pencil')} />
            <SubToolBtn icon={<Eraser />} active={tool==='eraser'} onClick={() => changeTool('eraser')} />
            <SubToolBtn icon={<Square fill="currentColor" />} active={tool==='fillRect'} onClick={() => changeTool('fillRect')} />
            <SubToolBtn icon={<Square />} active={tool==='strokeRect'} onClick={() => changeTool('strokeRect')} />
            <SubToolBtn icon={<Circle fill="currentColor" />} active={tool==='fillCircle'} onClick={() => changeTool('fillCircle')} />
            <SubToolBtn icon={<Circle />} active={tool==='strokeCircle'} onClick={() => changeTool('strokeCircle')} />
            <SubToolBtn icon={<PaintBucket />} active={tool==='bucket'} onClick={() => changeTool('bucket')} />
            <SubToolBtn icon={<Minus />} active={tool==='line'} onClick={() => changeTool('line')} />
            <SubToolBtn icon={<Pipette />} active={tool==='pipette'} onClick={() => changeTool('pipette')} />
            <SubToolBtn icon={<FileX />} onClick={requestClearCanvas} className="text-white !bg-rose-600/80 hover:!bg-rose-600 !border-rose-500" />
          </div>
        )}

        {/* Floating Action Buttons (Undo/Redo) - Upper-Left */}
        {!readOnly && (
          <div className="absolute top-3 left-3 flex gap-1.5 z-30 pointer-events-auto">
            <button 
              type="button"
              onClick={undo} 
              disabled={historyState.index <= 0}
              className={`w-[32px] h-[32px] bg-white text-slate-700 rounded-lg flex items-center justify-center border border-slate-300/40 shadow-[0_2px_6px_rgba(0,0,0,0.15)] transition-all ${historyState.index <= 0 ? 'opacity-30 pointer-events-none' : 'hover:bg-slate-100 hover:scale-105 active:scale-95'}`}
            >
              <Undo2 size={16} strokeWidth={2.5} />
            </button>
            <button 
              type="button"
              onClick={redo} 
              disabled={historyState.index >= historyState.length - 1}
              className={`w-[32px] h-[32px] bg-white text-slate-700 rounded-lg flex items-center justify-center border border-slate-300/40 shadow-[0_2px_6px_rgba(0,0,0,0.15)] transition-all ${historyState.index >= historyState.length - 1 ? 'opacity-30 pointer-events-none' : 'hover:bg-slate-100 hover:scale-105 active:scale-95'}`}
            >
              <Redo2 size={16} strokeWidth={2.5} />
            </button>
          </div>
        )}

        {/* Brush Sliders Panel */}
        {!readOnly && (
          <div className="absolute bottom-[2px] left-0 right-0 w-full flex items-center justify-center px-4 gap-4 z-40 pointer-events-none" dir="ltr">
            
            {/* Stroke Width Slider */}
            <div className="flex-1 relative flex items-center h-4 max-w-[45%] group pointer-events-auto" dir="ltr">
               <div className="absolute inset-x-0 top-1/2 -mt-[2px] h-[4px] rounded-full bg-slate-200 pointer-events-none shadow-sm" />
               <div 
                  className="absolute left-0 top-1/2 -mt-[2px] h-[4px] rounded-l-full bg-[#1a56db] pointer-events-none" 
                  style={{ width: `${((currentWidth - 1) / ((tool === 'eraser' ? (typeof window !== 'undefined' ? window.innerWidth / 2 : 200) : 40) - 1)) * 100}%` }} 
               />
               <input 
                  type="range" min="1" max={tool === 'eraser' ? (typeof window !== 'undefined' ? window.innerWidth / 2 : 200) : 40} value={currentWidth} 
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (tool === 'eraser') setEraserWidth(val);
                    else setPenWidth(val);
                    setPreviewSize(val);
                  }}
                  onPointerUp={() => setPreviewSize(null)}
                  onPointerLeave={() => setPreviewSize(null)}
                  className="absolute inset-0 w-full h-full cursor-pointer appearance-none bg-transparent outline-none m-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.3)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-slate-300/80 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.3)] [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-slate-300/80"
                />
            </div>

            {/* Opacity Slider */}
            <div className="flex-1 relative flex items-center h-4 max-w-[45%] group pointer-events-auto" dir="ltr">
               <div className="absolute inset-x-0 top-1/2 -mt-[2px] h-[4px] rounded-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjY2NjIi8+CjxyZWN0IHg9IjQiIHk9IjQiIHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNjY2MiLz4KPC9zdmc+')] pointer-events-none overflow-hidden border border-slate-300/30 shadow-inner block">
                  <div className="absolute inset-0 w-full h-full" style={{ background: `linear-gradient(to right, transparent, ${tool === 'eraser' ? '#ffffff' : color})` }} />
               </div>
               <input 
                  type="range" min="10" max="100" value={currentOpacity * 100} 
                  onChange={(e) => {
                    const val = Number(e.target.value) / 100;
                    if (tool === 'eraser') setEraserOpacity(val);
                    else if (tool === 'bucket') setBucketOpacity(val);
                    else setPenOpacity(val);
                  }}
                  className="absolute inset-0 w-full h-full cursor-pointer appearance-none bg-transparent outline-none m-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.3)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-slate-300/80 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.3)] [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-slate-300/80"
                />
            </div>

          </div>
        )}

      </div>
      
      {/* Bottom Toolbar with integrated timer and controls */}
      {!readOnly && (
        <div className="bg-[#1a56db] flex flex-col shrink-0 pb-safe shadow-[0_-4px_10px_rgba(0,0,0,0.1)] z-30" dir="ltr">
          {timerBarNode && (
            <div className="w-full">
              {timerBarNode}
            </div>
          )}

          <div className="p-2 sm:p-2.5 pt-1.5 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5 shrink-0">
              {/* 1. Yellow Swap eraser/pencil toggle button */}
              <ActionBtn 
                icon={<RefreshCcw />} 
                active={tool === 'eraser'} 
                onClick={() => {
                  if (tool === 'eraser') changeTool('pencil');
                  else if (tool === 'pencil') changeTool('eraser');
                  else changeTool('pencil');
                }} 
                className="!bg-[#facc15] !text-slate-800 hover:!bg-[#eab308] !border-transparent !rounded-lg"
              />

              {/* 2. White pencil selector */}
              <ActionBtn 
                icon={
                  tool === 'eraser' ? <Eraser /> :
                  tool === 'bucket' ? <PaintBucket /> :
                  tool === 'fillRect' ? <Square fill="currentColor" /> :
                  tool === 'strokeRect' ? <Square /> :
                  tool === 'fillCircle' ? <Circle fill="currentColor" /> :
                  tool === 'strokeCircle' ? <Circle /> :
                  tool === 'line' ? <Minus /> :
                  tool === 'pipette' ? <Pipette /> :
                  <Pencil />
                } 
                active={activeMenu === 'tools' || (tool !== 'eraser' && !activeMenu)} 
                onClick={() => setActiveMenu(m => m === 'tools' ? null : 'tools')} 
                className="!bg-white !text-[#1a56db] !border-transparent !rounded-lg"
              />

              {/* 3. Yellow hint bulb with Red Badge */}
              {hintsRemaining > 0 && onRequestHint && (
                <div className="relative">
                  <ActionBtn 
                    icon={<Lightbulb />} 
                    onClick={onRequestHint} 
                    className="!bg-[#facc15] !text-slate-800 hover:!bg-[#eab308] !border-transparent !rounded-lg flex" 
                  />
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-4.5 h-4.5 flex items-center justify-center rounded-full border border-[#1a56db]">
                    {hintsRemaining}
                  </span>
                </div>
              )}

              {/* 4. Red Skip/Kick Button */}
              {onSkipTurn && (
                <ActionBtn 
                  icon={<UserMinus />} 
                  onClick={onSkipTurn} 
                  className="!bg-[#f23c4f] !text-white hover:!bg-red-600 !border-transparent !rounded-lg shrink-0" 
                />
              )}
            </div>

            {/* Colors scroll palette */}
            <div 
              ref={colorsScrollRef} 
              className="flex-1 overflow-x-auto select-none touch-pan-x no-scrollbar ml-1.5 -mr-2 sm:-mr-2.5 max-w-full py-0.5" 
              dir="ltr"
              style={{ scrollbarWidth: 'none' }}
            >
              <div className="flex flex-col gap-[3px] min-w-max pr-2 sm:pr-2.5">
                <div className="flex gap-[3px]">
                  {TOP_COLORS.map(c => (
                    <ColorBtn key={c} color={c} active={color===c && tool !== 'eraser'} onClick={() => { setColor(c); setActiveMenu(null); if (tool === 'eraser') changeTool(previousTool.current); }} />
                  ))}
                </div>
                <div className="flex gap-[3px]">
                  {BOT_COLORS.map(c => (
                    <ColorBtn key={c} color={c} active={color===c && tool !== 'eraser'} onClick={() => { setColor(c); setActiveMenu(null); if (tool === 'eraser') changeTool(previousTool.current); }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}

// Sub components
function ActionBtn({ icon, active, onClick, className = '' }: { icon: React.ReactNode, active?: boolean, onClick: () => void, className?: string }) {
  return (
    <button 
      type="button"
      onClick={onClick}
      className={`w-[38px] h-[38px] flex items-center justify-center rounded-lg transition-all shadow-sm focus:outline-none select-none
        ${active 
          ? 'bg-white text-[#1a56db] scale-105 shadow-md' 
          : 'bg-[#ffcc00] text-[#1a56db] hover:bg-white hover:scale-105 active:scale-95'
        } ${className}`}
    >
      {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { size: 19, strokeWidth: 2.5 }) : icon}
    </button>
  );
}

function SubToolBtn({ icon, active, onClick, className = '' }: { icon: React.ReactNode, active?: boolean, onClick: () => void, className?: string }) {
  return (
    <button 
      type="button"
      onClick={onClick}
      className={`w-11 h-11 flex items-center justify-center rounded-lg border transition-all
        ${active 
          ? 'bg-blue-600 border-blue-400 text-white shadow-inner scale-105' 
          : 'bg-white/10 border-transparent text-white hover:bg-white/20 ' + className
        }`}
    >
      {React.cloneElement(icon as React.ReactElement, { size: 21, strokeWidth: 2.5 })}
    </button>
  );
}

function ColorBtn({ color, active, onClick }: { key?: React.Key, color: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      type="button"
      onClick={onClick}
      className={`w-[21px] h-[21px] flex-shrink-0 rounded-[4px] border transition-none relative focus:outline-none select-none
        ${active ? 'border-[#FBBF24] border-[2.5px] z-10' : 'border-black/20'}`}
      style={{ backgroundColor: color }}
    />
  );
}
