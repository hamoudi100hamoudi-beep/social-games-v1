/* 
 * 🧪 EXPERIMENTAL DRAWING BOARD (Task 3: Critical Path Isolation)
 * Handles UI layers, toolbar, menus, and palette bindings with zero mount shock.
 * Pre-mounts all drawing controls and defers non-critical DOM/layout work.
 * All core drawing operations are delegated to DrawingCanvasCore.
 */
import React, { useEffect, useRef, useState, useTransition } from 'react';
import { 
  Pencil, Eraser, Undo2, Redo2, FileX, RefreshCcw, 
  Lightbulb, UserMinus, Circle, Square, PaintBucket, Minus, Pipette, Maximize2, ZoomIn,
  ArrowLeft
} from 'lucide-react';
import { ToolType } from '../../types/draw';
import {
  TOP_COLORS,
  BOT_COLORS
} from '../../utils/drawBinaryHelper';
import DrawingCanvasCore, { DrawingCanvasCoreRef } from '../game/DrawingCanvasCore';
import FlipaClipControls from '../game/FlipaClipControls';
import CinematicModal from '../game/CinematicModal';
import { safeLocalStorage } from '../../utils/storage';
import { expMetrics } from './experimentalInstrumentation';

const LOGICAL_HEIGHT = 430;

export interface ExperimentalDrawingBoardProps {
  readOnly?: boolean;
  onSkipTurn?: () => void;
  onRequestHint?: () => void;
  hintsRemaining?: number;
  timerPercentage?: number;
  timerBarNode?: React.ReactNode;
  currentDrawerId?: string;
  status?: string;
  key?: any;
  onSyncStateChange?: (syncing: boolean) => void;
  isFreeDraw?: boolean;
  onHistoryLengthChange?: (hasStrokes: boolean) => void;
  amIDrawer?: boolean;
  onExitFreeDraw?: () => void;
}

export const ExperimentalDrawingBoard: React.FC<ExperimentalDrawingBoardProps> = ({
  readOnly = false,
  onSkipTurn,
  onRequestHint,
  hintsRemaining = 0,
  timerBarNode,
  currentDrawerId,
  status,
  onSyncStateChange,
  isFreeDraw = false,
  onHistoryLengthChange,
  amIDrawer = false,
  onExitFreeDraw,
}) => {
  const canvasCoreRef = useRef<DrawingCanvasCoreRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Layout scale tracking for thickness preview bubble resizing - scheduled via rAF to eliminate layout thrash
  const [baseScale, setBaseScale] = useState(1);

  // Tool States
  const [activeMenu, setActiveMenu] = useState<'tools' | 'controls' | null>(null);
  const [tool, setTool] = useState<ToolType>('pencil');
  const [color, setColor] = useState('#000000');
  const [penWidth, setPenWidth] = useState(3);
  const [penOpacity, setPenOpacity] = useState(1);
  const [eraserWidth, setEraserWidth] = useState(40);
  const [eraserOpacity, setEraserOpacity] = useState(1);
  const [bucketOpacity, setBucketOpacity] = useState(1);
  const [historyState, setHistoryState] = useState({ index: 0, length: 0 });
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Turn tracking guards
  const prevReadOnlyRef = useRef(true);
  const prevStatusRef = useRef<string | undefined>(undefined);
  const hasResetForCurrentTurnRef = useRef(false);

  useEffect(() => {
    if (isFreeDraw) {
      prevReadOnlyRef.current = readOnly;
      prevStatusRef.current = status;
      return;
    }

    const resetToolsToDefault = () => {
      setTool('pencil');
      setColor('#000000');
      setPenWidth(3);
      setPenOpacity(1);
      setEraserWidth(40);
      setEraserOpacity(1);
      setBucketOpacity(1);
      setActiveMenu(null);
      previousTool.current = 'pencil';
      hasResetForCurrentTurnRef.current = true;
    };

    // 1. Pre-initialization during CHOOSING if local player is drawer
    if (status === 'CHOOSING' && amIDrawer && !hasResetForCurrentTurnRef.current) {
      resetToolsToDefault();
    }

    // 2. Safety fallback for direct transition to DRAWING
    const becameDrawer = prevReadOnlyRef.current === true && readOnly === false;
    const drawingStartedAsArtist = status === 'DRAWING' && prevStatusRef.current !== 'DRAWING' && !readOnly;
    if ((becameDrawer || drawingStartedAsArtist) && !hasResetForCurrentTurnRef.current) {
      resetToolsToDefault();
    }

    // 3. Reset guard flag when round finishes
    if (status === 'ROUND_END' || status === 'PODIUM' || status === 'WAITING') {
      hasResetForCurrentTurnRef.current = false;
    }

    prevReadOnlyRef.current = readOnly;
    prevStatusRef.current = status;
  }, [readOnly, status, isFreeDraw, amIDrawer]);

  // Persistent Zoom & Pan preference
  const [zoomEnabled, setZoomEnabled] = useState(() => {
    if (isFreeDraw) return true;
    if (typeof window !== 'undefined') {
      return safeLocalStorage.getItem('gartic_zoom_enabled') === 'true';
    }
    return false;
  });

  useEffect(() => {
    if (isFreeDraw) {
      setZoomEnabled(true);
    }
  }, [isFreeDraw]);

  const toggleZoom = () => {
    const nextVal = !zoomEnabled;
    setZoomEnabled(nextVal);
    if (typeof window !== 'undefined') {
      safeLocalStorage.setItem('gartic_zoom_enabled', nextVal ? 'true' : 'false');
    }
  };

  const handleResetZoom = () => {
    canvasCoreRef.current?.resetZoom?.();
  };

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

  // 🛡️ Task 3: Non-blocking baseScale calculation scheduled via requestAnimationFrame
  // Eliminates synchronous reflow locks and avoids re-render loops
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let rafId: number | null = null;

    const obs = new ResizeObserver((entries) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        for (const entry of entries) {
          const { height } = entry.contentRect;
          if (height === 0) continue;
          const targetScale = height / LOGICAL_HEIGHT;
          setBaseScale((prev) => (Math.abs(prev - targetScale) > 0.01 ? targetScale : prev));
        }
      });
    });

    obs.observe(container);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      obs.disconnect();
    };
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
      
      {/* Clean Drawing Confirm Modal */}
      <CinematicModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        titleType="report"
        titleText="CLEAN"
        buttons={[
          {
            id: "clean-confirm-no-btn",
            text: <span className="text-white font-black">NO</span>,
            onClick: () => setShowClearConfirm(false),
            variant: "primary",
          },
          {
            id: "clean-confirm-yes-btn",
            text: <span className="text-white font-black">YES</span>,
            onClick: confirmClear,
            variant: "danger",
          },
        ]}
      >
        <div className="w-20 h-20 sm:w-26 sm:h-26 flex items-center justify-center mx-auto mb-3 sm:mb-4 mt-1 relative shrink-0">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#EF4444]/12 border-2 border-[#EF4444]/30 flex items-center justify-center shadow-inner">
            <RefreshCcw className="w-8 h-8 sm:w-10 sm:h-10 text-[#EF4444] drop-shadow-sm animate-clean-spin" strokeWidth={2.8} />
          </div>
        </div>

        <h3 id="clean-confirm-desc" className="text-[18px] sm:text-[22px] font-black text-[#2E2882] leading-snug tracking-tight mb-1.5 sm:mb-2 text-center">
          Do you want to clean the drawing?
        </h3>
        <p id="clean-confirm-desc-ar" className="text-[#8C8AA7] text-sm sm:text-base font-bold text-center">
          هل تريد مسح اللوحة بالكامل؟
        </p>
      </CinematicModal>

      {/* Canvas Container Area */}
      <div ref={containerRef} dir="ltr" className="flex-1 relative bg-gray-300 overflow-hidden w-full h-full cursor-crosshair">
        
        {/* Core isolated draw canvas layer (Architectural Boundary - drawing algorithms protected) */}
        <DrawingCanvasCore
          ref={canvasCoreRef}
          readOnly={readOnly}
          tool={tool}
          color={color}
          thickness={currentWidth}
          opacity={currentOpacity}
          currentDrawerId={currentDrawerId}
          status={status}
          isZoomEnabled={zoomEnabled}
          onHistoryStateChange={(idx, len) => {
            setHistoryState({ index: idx, length: len });
            onHistoryLengthChange?.(idx > 0);
          }}
          onPipetteColorPicked={(hex) => {
            setColor(hex);
            if (tool === 'pipette') {
              changeTool(previousTool.current);
            }
          }}
          onSyncStateChange={onSyncStateChange}
          deferredReset={true}
        />

        {/* 🛡️ Task 3: Pre-mounted FlipaClip Brush Controls - Always in DOM to prevent Mount Shock */}
        <div
          className={`absolute bottom-2.5 right-2.5 z-20 pointer-events-auto transition-opacity duration-150 ${
            readOnly ? 'opacity-0 pointer-events-none invisible' : 'opacity-100'
          }`}
          aria-hidden={readOnly}
        >
          <FlipaClipControls
            tool={tool}
            color={color}
            currentWidth={currentWidth}
            currentOpacity={currentOpacity}
            baseScale={baseScale}
            isFreeDraw={isFreeDraw}
            onColorChange={(newColor) => {
              setColor(newColor);
              if (tool === 'eraser') {
                changeTool(previousTool.current || 'pencil');
              }
            }}
            onWidthChange={(w) => {
              if (tool === 'eraser') setEraserWidth(w);
              else setPenWidth(w);
            }}
            onOpacityChange={(op) => {
              if (tool === 'eraser') setEraserOpacity(op);
              else if (tool === 'bucket') setBucketOpacity(op);
              else setPenOpacity(op);
            }}
          />
        </div>

        {/* Overlay Tools Sub-Menu (Rendered conditionally when activeMenu is 'tools') */}
        {!readOnly && activeMenu === 'tools' && (
          <div className="absolute bottom-[56px] left-[6px] grid grid-cols-2 gap-2 bg-black/80 p-2.5 rounded-xl border border-white/20 z-20 pointer-events-auto animate-in fade-in slide-in-from-bottom-2">
            <SubToolBtn icon={<Pencil />} active={tool==='pencil'} onClick={() => changeTool('pencil')} />
            <SubToolBtn icon={<Eraser />} active={tool==='eraser'} onClick={() => changeTool('eraser')} />
            <SubToolBtn icon={<Square fill="currentColor" />} active={tool==='fillRect'} onClick={() => changeTool('fillRect')} />
            <SubToolBtn icon={<Square />} active={tool==='strokeRect'} onClick={() => changeTool('strokeRect')} />
            <SubToolBtn icon={<Circle fill="currentColor" />} active={tool==='fillCircle'} onClick={() => changeTool('fillCircle')} />
            <SubToolBtn icon={<Circle />} active={tool==='strokeCircle'} onClick={() => changeTool('strokeCircle')} />
            <SubToolBtn icon={<PaintBucket />} active={tool==='bucket'} onClick={() => changeTool('bucket')} />
            <SubToolBtn icon={<Minus />} active={tool==='line'} onClick={() => changeTool('line')} />
            <SubToolBtn icon={<Pipette />} active={tool==='pipette'} onClick={() => changeTool('pipette')} />
            <SubToolBtn icon={<FileX />} onClick={requestClearCanvas} className="text-white !bg-[#FB923C]/90 hover:!bg-[#FB923C] !border-orange-500" />
            
            <div className="col-span-2 h-[1px] bg-white/10 my-1 rounded-full"></div>
            
            <SubToolBtn 
              icon={<Undo2 />} 
              onClick={undo} 
              disabled={historyState.index <= 0} 
            />
            <SubToolBtn 
              icon={<Redo2 />} 
              onClick={redo} 
              disabled={historyState.index >= historyState.length - 1} 
            />
          </div>
        )}

        {/* 🛡️ Task 3: Pre-mounted Floating Action Buttons */}
        <div
          className={`absolute top-3 left-3 flex flex-col gap-1.5 z-30 transition-opacity duration-150 ${
            readOnly ? 'opacity-0 pointer-events-none invisible' : 'opacity-100 pointer-events-auto'
          }`}
          dir="ltr"
          aria-hidden={readOnly}
        >
          <div className="flex gap-1.5">
            {isFreeDraw ? (
              onExitFreeDraw && (
                <button
                  type="button"
                  onClick={onExitFreeDraw}
                  title="العودة للروم"
                  className="w-[32px] h-[32px] bg-white text-slate-700 rounded-lg flex items-center justify-center border border-slate-300/40 transition-all hover:bg-slate-100 hover:scale-105 active:scale-95 cursor-pointer shadow-sm select-none"
                >
                  <ArrowLeft size={16} strokeWidth={2.5} />
                </button>
              )
            ) : (
              <button 
                type="button"
                onClick={toggleZoom} 
                title={zoomEnabled ? "تعطيل وضع التكبير والتنقل" : "تفعيل وضع التكبير والتنقل (بإصبعين)"}
                className={`w-[32px] h-[32px] rounded-lg flex items-center justify-center border transition-all select-none hover:scale-105 active:scale-95
                  ${zoomEnabled 
                    ? 'bg-amber-500 text-white border-amber-400' 
                    : 'bg-white text-slate-700 border-slate-300/40 hover:bg-slate-100'}`}
              >
                <ZoomIn size={16} strokeWidth={2.5} />
              </button>
            )}

            {zoomEnabled && (
              <button 
                type="button"
                onClick={handleResetZoom} 
                title="توسيط وإعادة تعيين اللوحة"
                className="w-[32px] h-[32px] bg-white text-slate-700 rounded-lg flex items-center justify-center border border-slate-300/40 transition-all hover:bg-slate-100 hover:scale-105 active:scale-95 text-xs font-bold"
              >
                <Maximize2 size={13} strokeWidth={3} />
              </button>
            )}
          </div>
        </div>

      </div>
      
      {/* 🛡️ Task 3: Pre-mounted Bottom Toolbar with integrated timer and controls */}
      {/* Kept mounted in the DOM to eliminate Mount Shock; toggles via CSS display */}
      <div
        className={`bg-game-primary-blue flex flex-col shrink-0 pb-safe z-30 transition-[opacity] duration-150 ${
          readOnly ? 'hidden pointer-events-none' : 'opacity-100 pointer-events-auto'
        }`}
        dir="ltr"
        aria-hidden={readOnly}
      >
        {timerBarNode && (
          <div className="w-full">
            {timerBarNode}
          </div>
        )}

        <div className="p-2 sm:p-2.5 pt-1.5 flex items-center justify-between gap-0">
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 1. Yellow Swap eraser/pencil toggle button */}
            <ActionBtn 
              icon={<SwapIcon />} 
              active={tool === 'eraser'} 
              onClick={() => {
                if (tool === 'eraser') changeTool('pencil');
                else if (tool === 'pencil') changeTool('eraser');
                else changeTool('pencil');
              }} 
              className="!bg-[#facc15] !text-slate-800 hover:!bg-[#eab308] !border-transparent !rounded-lg"
            />

            {/* 2. Tool selector */}
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
              className="!bg-white !text-primary-brand !border-transparent !rounded-lg"
            />

            {/* 3. Yellow hint bulb with Red Badge - Pre-mounted to eliminate layout shifts and DOM churn */}
            <div className={`relative shrink-0 ${hintsRemaining > 0 && onRequestHint ? 'block' : 'hidden'}`}>
              <ActionBtn 
                icon={<Lightbulb />} 
                onClick={onRequestHint || (() => {})} 
                className="!bg-[#facc15] !text-slate-800 hover:!bg-[#eab308] !border-transparent !rounded-lg flex" 
              />
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-4.5 h-4.5 flex items-center justify-center rounded-full border border-primary-brand">
                {hintsRemaining}
              </span>
            </div>

            {/* 4. Orange Skip/Kick Button - Pre-mounted to eliminate layout shifts and DOM churn */}
            <div className={`shrink-0 ${onSkipTurn ? 'block' : 'hidden'}`}>
              <ActionBtn 
                icon={<UserMinus />} 
                onClick={onSkipTurn || (() => {})} 
                className="!bg-[#FB923C] !text-white hover:!bg-[#EA580C] !border-transparent !rounded-lg" 
              />
            </div>
          </div>

          {/* Colors scroll palette */}
          <div 
            ref={colorsScrollRef} 
            className="flex-1 overflow-x-auto select-none touch-pan-x no-scrollbar ml-[8px] sm:ml-[10px] -mr-2 sm:-mr-2.5 max-w-full py-0.5" 
            dir="ltr"
            style={{ scrollbarWidth: 'none' }}
          >
            <div className="flex flex-col gap-[3px] min-w-max pl-[4px] pr-2 sm:pr-2.5">
              <div className="flex gap-[3px]">
                {TOP_COLORS.map(c => (
                  <ColorBtn 
                    key={c} 
                    color={c} 
                    active={color===c && tool !== 'eraser'} 
                    onClick={() => { 
                      setColor(c); 
                      setActiveMenu(null); 
                      if (tool === 'eraser') changeTool(previousTool.current); 
                    }} 
                  />
                ))}
              </div>
              <div className="flex gap-[3px]">
                {BOT_COLORS.map(c => (
                  <ColorBtn 
                    key={c} 
                    color={c} 
                    active={color===c && tool !== 'eraser'} 
                    onClick={() => { 
                      setColor(c); 
                      setActiveMenu(null); 
                      if (tool === 'eraser') changeTool(previousTool.current); 
                    }} 
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
};

// Sub components
const SwapIcon = ({ size = 22, strokeWidth = 2.5, className }: any) => {
  return (
    <div 
      className={`relative flex items-center justify-center text-current pointer-events-none ${className || ''}`}
      style={{ width: 40, height: 40 }}
    >
      <div className="absolute top-[1px] left-[1px]">
        <Pencil size={18} strokeWidth={strokeWidth} />
      </div>
      <div className="absolute bottom-[1px] right-[1px]">
        <Eraser size={18} strokeWidth={strokeWidth} />
      </div>
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 40 40"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M 37 18 A 14 14 0 0 0 23 4" />
        <path d="M 28 0 L 23 4 L 28 8" />
        <path d="M 3 22 A 14 14 0 0 0 17 36" />
        <path d="M 12 32 L 17 36 L 12 40" />
      </svg>
    </div>
  );
};

function ActionBtn({ icon, active, onClick, className = '' }: { icon: React.ReactNode, active?: boolean, onClick: () => void, className?: string }) {
  return (
    <button 
      type="button"
      onClick={onClick}
      className={`w-[45px] h-[45px] flex items-center justify-center rounded-lg transition-all focus:outline-none select-none
        ${active 
          ? 'bg-white text-primary-brand scale-105' 
          : 'bg-accent-brand text-bg-dark-brand hover:bg-white hover:scale-105 active:scale-95'
        } ${className}`}
    >
      {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { size: 22, strokeWidth: 2.5 }) : icon}
    </button>
  );
}

function SubToolBtn({ icon, active, onClick, className = '', disabled = false }: { icon: React.ReactNode, active?: boolean, onClick: () => void, className?: string, disabled?: boolean }) {
  return (
    <button 
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-11 h-11 flex items-center justify-center rounded-lg border transition-all
        ${disabled ? 'opacity-30 pointer-events-none' : ''}
        ${active 
          ? 'bg-blue-600 border-blue-400 text-white scale-105' 
          : 'bg-white/10 border-transparent text-white hover:bg-white/20 ' + className
        }`}
    >
      {React.cloneElement(icon as React.ReactElement<any>, { size: 21, strokeWidth: 2.5 })}
    </button>
  );
}

// 🛡️ Constitution Invariant: Elegant Gold Selection Ring (#D4AF37)
function ColorBtn({ color, active, onClick }: { key?: React.Key, color: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      type="button"
      onClick={onClick}
      className={`w-[21px] h-[21px] flex-shrink-0 rounded-[4px] border transition-all duration-150 relative focus:outline-none select-none border-black/15`}
      style={{ backgroundColor: color }}
    >
      {active && (
        <span 
          className="absolute -inset-[3px] rounded-[6px] border-[1.5px] border-[#D4AF37] pointer-events-none z-10" 
        />
      )}
    </button>
  );
}
