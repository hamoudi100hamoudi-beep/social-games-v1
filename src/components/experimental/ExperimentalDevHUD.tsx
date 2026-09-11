import React, { useEffect, useState } from 'react';
import { expMetrics, ExperimentalMetrics } from './experimentalInstrumentation';
import { FlaskConical, ChevronDown, ChevronUp, RotateCcw, X } from 'lucide-react';

export const ExperimentalDevHUD: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [metrics, setMetrics] = useState<ExperimentalMetrics>(expMetrics.getMetrics());
  const [isExpanded, setIsExpanded] = useState(false);

  // 🛡️ Only subscribe to metrics updates when the HUD is actually open, preventing zero unnecessary re-renders during active drawing
  useEffect(() => {
    if (!isOpen) return;
    setMetrics(expMetrics.getMetrics());
    return expMetrics.subscribe((next) => {
      setMetrics(next);
    });
  }, [isOpen]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Open Experimental Metrics HUD"
        className="fixed bottom-2 left-2 z-[9999] p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-amber-400 border border-amber-400/40 shadow-lg cursor-pointer transition-all active:scale-95 opacity-70 hover:opacity-100"
      >
        <FlaskConical size={14} />
      </button>
    );
  }

  return (
    <div
      dir="ltr"
      className="fixed bottom-2 left-2 z-[9999] font-mono text-[11px] bg-slate-900/90 backdrop-blur border border-amber-400/40 text-amber-300 rounded-lg shadow-xl overflow-hidden select-none pointer-events-auto transition-all"
    >
      {/* Header bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer border-b border-white/5"
      >
        <FlaskConical size={13} className="text-amber-400 animate-pulse" />
        <span className="font-bold text-white tracking-wide">EXP LAB</span>
        <span className="text-slate-400">|</span>
        <span className="text-emerald-400">Game: {metrics.gameRoomRenderCount}</span>
        <span className="text-slate-400">|</span>
        <span className="text-cyan-400 font-bold">Draw: {metrics.drawingLayerRenderCount}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            expMetrics.reset();
          }}
          title="Reset Counters"
          className="ml-1 p-0.5 hover:text-white rounded"
        >
          <RotateCcw size={11} />
        </button>
        {isExpanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
          }}
          title="Close HUD"
          className="ml-1 p-0.5 hover:text-red-400 rounded text-slate-400"
        >
          <X size={12} />
        </button>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="p-2.5 flex flex-col gap-1.5 bg-slate-950/80 text-[10px] text-slate-300">
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">GameRoom Renders:</span>
            <span className="text-emerald-400 font-bold">{metrics.gameRoomRenderCount}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">Drawing Layer Renders:</span>
            <span className="text-cyan-400 font-bold">{metrics.drawingLayerRenderCount}</span>
          </div>
          <div className="flex justify-between gap-4 border-t border-white/10 pt-1">
            <span className="text-slate-400">Transition → 1st Touch:</span>
            <span className={metrics.transitionToFirstInputMs !== null ? "text-amber-300 font-bold" : "text-slate-500"}>
              {metrics.transitionToFirstInputMs !== null ? `${metrics.transitionToFirstInputMs} ms` : 'idle'}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">1st Touch → 1st Canvas Draw:</span>
            <span className={metrics.inputToFirstDrawMs !== null ? "text-emerald-400 font-bold" : "text-slate-500"}>
              {metrics.inputToFirstDrawMs !== null ? `${metrics.inputToFirstDrawMs} ms` : 'idle'}
            </span>
          </div>
          <div className="border-t border-white/10 pt-1 text-[9px] text-slate-400 truncate max-w-[220px]">
            <span className="text-slate-500">Reason: </span>
            {metrics.lastDrawingLayerRenderReason}
          </div>
        </div>
      )}
    </div>
  );
};
