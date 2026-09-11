import React, { useEffect, useState } from 'react';
import { expMetrics, ExperimentalMetrics } from './experimentalInstrumentation';
import {
  FlaskConical,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  X,
  Activity,
  Zap,
  MousePointer,
  Layers,
  Copy,
  Check,
} from 'lucide-react';

export const ExperimentalDevHUD: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [metrics, setMetrics] = useState<ExperimentalMetrics>(expMetrics.getMetrics());
  const [activeTab, setActiveTab] = useState<'overview' | 'thread' | 'pointer' | 'ops'>('overview');
  const [copied, setCopied] = useState(false);

  // 🛡️ Only subscribe to metrics updates when the HUD is actually open, preventing re-renders during drawing
  useEffect(() => {
    if (!isOpen) return;
    setMetrics(expMetrics.getMetrics());
    return expMetrics.subscribe((next) => {
      setMetrics(next);
    });
  }, [isOpen]);

  const handleCopyReport = () => {
    const reportData = {
      timestamp: new Date().toISOString(),
      transitionStartTimestamp: metrics.transitionStartTimestamp,
      layerCommitRelMs: metrics.layerCommitRelMs,
      layoutMeasurementRelMs: metrics.layoutMeasurementRelMs,
      gameRoomRenderCount: metrics.gameRoomRenderCount,
      drawingLayerRenderCount: metrics.drawingLayerRenderCount,
      rafStats: metrics.rafStats,
      longTasks: metrics.longTasks,
      pointerDown: metrics.pointerDownStats,
      pointerMoveStats: {
        sampleCount: metrics.pointerMoveStats.sampleCount,
        avgDispatchDelayMs: metrics.pointerMoveStats.avgDispatchDelayMs,
        maxDispatchDelayMs: metrics.pointerMoveStats.maxDispatchDelayMs,
        samples: metrics.pointerMoveStats.samples,
      },
      resizeObserverEvents: metrics.resizeObserverEvents,
      reactCommits: metrics.reactCommits,
      concurrentOperations: metrics.concurrentOperations,
    };

    navigator.clipboard?.writeText(JSON.stringify(reportData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Open Experimental Profiling HUD (Task 2)"
        className="fixed bottom-2 left-2 z-[9999] p-2 rounded-full bg-slate-900/85 hover:bg-slate-800 text-amber-400 border border-amber-400/40 shadow-lg cursor-pointer transition-all active:scale-95 opacity-75 hover:opacity-100 flex items-center gap-1"
      >
        <FlaskConical size={14} />
        {metrics.longTasks.length > 0 && (
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
        )}
      </button>
    );
  }

  return (
    <div
      dir="ltr"
      className="fixed bottom-2 left-2 z-[9999] font-mono text-[11px] bg-slate-900/95 backdrop-blur-md border border-amber-400/40 text-slate-200 rounded-xl shadow-2xl overflow-hidden select-none pointer-events-auto transition-all w-[320px] sm:w-[380px] max-h-[85vh] flex flex-col"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-950 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <FlaskConical size={14} className="text-amber-400 animate-pulse" />
          <span className="font-bold text-amber-400 tracking-wider text-[12px]">TASK 2 PROFILER</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyReport}
            title="Copy Full Diagnostic JSON"
            className="p-1 hover:text-emerald-400 rounded text-slate-400 transition-colors"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>
          <button
            type="button"
            onClick={() => expMetrics.reset()}
            title="Reset Profiler"
            className="p-1 hover:text-white rounded text-slate-400 transition-colors"
          >
            <RotateCcw size={12} />
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            title="Close HUD"
            className="p-1 hover:text-red-400 rounded text-slate-400 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex border-b border-white/10 bg-slate-900/60 text-[10px]">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-1.5 px-1 text-center font-bold transition-all ${
            activeTab === 'overview'
              ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('thread')}
          className={`flex-1 py-1.5 px-1 text-center font-bold transition-all ${
            activeTab === 'thread'
              ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Thread ({metrics.longTasks.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pointer')}
          className={`flex-1 py-1.5 px-1 text-center font-bold transition-all ${
            activeTab === 'pointer'
              ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Pointer
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ops')}
          className={`flex-1 py-1.5 px-1 text-center font-bold transition-all ${
            activeTab === 'ops'
              ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Ops ({metrics.concurrentOperations.length})
        </button>
      </div>

      {/* Tab body */}
      <div className="p-3 overflow-y-auto max-h-[380px] space-y-2 text-[10.5px]">
        {activeTab === 'overview' && (
          <div className="space-y-2">
            {/* Transition Milestone Summary */}
            <div className="p-2 rounded-lg bg-slate-950/70 border border-white/5 space-y-1">
              <div className="text-[10px] text-amber-400/80 font-bold uppercase tracking-wider">
                Transition Milestones (Δ ms)
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">DRAWING Trigger:</span>
                <span className="text-white font-mono">0.0 ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">DrawingLayer Commit:</span>
                <span
                  className={
                    metrics.layerCommitRelMs !== null ? 'text-cyan-400 font-bold' : 'text-slate-500'
                  }
                >
                  {metrics.layerCommitRelMs !== null ? `+${metrics.layerCommitRelMs} ms` : 'pending'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Layout Measurement Ready:</span>
                <span
                  className={
                    metrics.layoutMeasurementRelMs !== null ? 'text-emerald-400 font-bold' : 'text-slate-500'
                  }
                >
                  {metrics.layoutMeasurementRelMs !== null
                    ? `+${metrics.layoutMeasurementRelMs} ms`
                    : 'pending'}
                </span>
              </div>
            </div>

            {/* Quick Diagnostic Card */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-lg bg-slate-950/70 border border-white/5">
                <div className="text-slate-400 text-[9.5px]">1st Touch Queue Delay</div>
                <div
                  className={`text-base font-bold mt-0.5 ${
                    metrics.pointerDownStats?.dispatchDelayMs !== null
                      ? (metrics.pointerDownStats?.dispatchDelayMs || 0) > 30
                        ? 'text-red-400'
                        : 'text-emerald-400'
                      : 'text-slate-500'
                  }`}
                >
                  {metrics.pointerDownStats?.dispatchDelayMs !== null
                    ? `${metrics.pointerDownStats?.dispatchDelayMs} ms`
                    : 'waiting touch'}
                </div>
              </div>

              <div className="p-2 rounded-lg bg-slate-950/70 border border-white/5">
                <div className="text-slate-400 text-[9.5px]">Avg Move Dispatch</div>
                <div
                  className={`text-base font-bold mt-0.5 ${
                    metrics.pointerMoveStats.avgDispatchDelayMs !== null
                      ? metrics.pointerMoveStats.avgDispatchDelayMs > 16
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                      : 'text-slate-500'
                  }`}
                >
                  {metrics.pointerMoveStats.avgDispatchDelayMs !== null
                    ? `${metrics.pointerMoveStats.avgDispatchDelayMs} ms`
                    : 'idle'}
                </div>
              </div>
            </div>

            {/* Renders Counter */}
            <div className="flex justify-between p-2 rounded-lg bg-slate-950/70 border border-white/5">
              <span className="text-slate-400">React Renders:</span>
              <div className="flex gap-2">
                <span className="text-emerald-400">Game: {metrics.gameRoomRenderCount}</span>
                <span className="text-cyan-400 font-bold">Draw: {metrics.drawingLayerRenderCount}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'thread' && (
          <div className="space-y-2">
            {/* RAF Budget & Jitter */}
            <div className="p-2 rounded-lg bg-slate-950/70 border border-white/5 space-y-1">
              <div className="text-[10px] text-amber-400/80 font-bold uppercase tracking-wider">
                Main Thread Frame Budget (3.5s window)
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Sampled Frames:</span>
                <span className="text-white font-mono">{metrics.rafStats.totalFrames}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Dropped Frames (&gt;33ms / &lt;30fps):</span>
                <span
                  className={
                    metrics.rafStats.droppedFrames > 0 ? 'text-amber-400 font-bold' : 'text-emerald-400'
                  }
                >
                  {metrics.rafStats.droppedFrames}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Severe Freezes (&gt;50ms):</span>
                <span
                  className={
                    metrics.rafStats.severeDroppedFrames > 0 ? 'text-red-400 font-bold' : 'text-emerald-400'
                  }
                >
                  {metrics.rafStats.severeDroppedFrames}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Peak Frame Time:</span>
                <span
                  className={
                    metrics.rafStats.maxFrameDurationMs > 33.3 ? 'text-red-400 font-bold' : 'text-emerald-400'
                  }
                >
                  {metrics.rafStats.maxFrameDurationMs} ms
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Avg Frame Time:</span>
                <span className="text-white font-mono">{metrics.rafStats.avgFrameDurationMs} ms</span>
              </div>
            </div>

            {/* Long Tasks Log */}
            <div className="space-y-1">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                Detected Long Tasks ({metrics.longTasks.length})
              </div>
              {metrics.longTasks.length === 0 ? (
                <div className="p-2 text-center text-slate-500 bg-slate-950/50 rounded-lg text-[10px]">
                  No Long Tasks &gt;50ms recorded in transition window.
                </div>
              ) : (
                <div className="space-y-1">
                  {metrics.longTasks.map((task, idx) => (
                    <div
                      key={idx}
                      className="p-1.5 rounded bg-red-950/40 border border-red-500/30 flex justify-between items-center text-[10px]"
                    >
                      <span className="text-slate-300 truncate max-w-[200px]">
                        +{task.timestampRelMs}ms: {task.name}
                      </span>
                      <span className="text-red-400 font-bold">{task.durationMs} ms</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'pointer' && (
          <div className="space-y-2">
            {/* First PointerDown */}
            <div className="p-2 rounded-lg bg-slate-950/70 border border-white/5 space-y-1">
              <div className="text-[10px] text-amber-400/80 font-bold uppercase tracking-wider">
                First PointerDown Event
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Hardware → Handler Delay:</span>
                <span
                  className={
                    metrics.pointerDownStats?.dispatchDelayMs !== null
                      ? (metrics.pointerDownStats?.dispatchDelayMs || 0) > 30
                        ? 'text-red-400 font-bold'
                        : 'text-emerald-400 font-bold'
                      : 'text-slate-500'
                  }
                >
                  {metrics.pointerDownStats?.dispatchDelayMs !== null
                    ? `${metrics.pointerDownStats?.dispatchDelayMs} ms`
                    : 'Awaiting touch input...'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Triggered At:</span>
                <span className="text-slate-300">
                  {metrics.pointerDownStats?.eventTimestampRelMs !== null
                    ? `+${metrics.pointerDownStats?.eventTimestampRelMs} ms from DRAWING`
                    : '—'}
                </span>
              </div>
            </div>

            {/* Continuous PointerMove Stream */}
            <div className="p-2 rounded-lg bg-slate-950/70 border border-white/5 space-y-1">
              <div className="text-[10px] text-amber-400/80 font-bold uppercase tracking-wider">
                Continuous PointerMove Latency
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Samples Captured:</span>
                <span className="text-white font-mono">{metrics.pointerMoveStats.sampleCount} / 30</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Average Dispatch Delay:</span>
                <span className="text-emerald-400 font-bold">
                  {metrics.pointerMoveStats.avgDispatchDelayMs !== null
                    ? `${metrics.pointerMoveStats.avgDispatchDelayMs} ms`
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Peak Dispatch Spike:</span>
                <span
                  className={
                    (metrics.pointerMoveStats.maxDispatchDelayMs || 0) > 25
                      ? 'text-red-400 font-bold'
                      : 'text-emerald-400 font-bold'
                  }
                >
                  {metrics.pointerMoveStats.maxDispatchDelayMs !== null
                    ? `${metrics.pointerMoveStats.maxDispatchDelayMs} ms`
                    : '—'}
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ops' && (
          <div className="space-y-1.5">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
              Concurrent Operations in Transition Window
            </div>
            {metrics.concurrentOperations.length === 0 ? (
              <div className="p-2 text-center text-slate-500 bg-slate-950/50 rounded-lg text-[10px]">
                No operations logged yet.
              </div>
            ) : (
              <div className="space-y-1">
                {metrics.concurrentOperations.map((op, idx) => (
                  <div
                    key={idx}
                    className="p-1.5 rounded bg-slate-950/80 border border-white/5 flex flex-col gap-0.5 text-[10px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300 font-medium truncate max-w-[200px]">
                        +{op.timestampRelMs}ms: {op.name}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ${
                          op.category === 'CRITICAL FOR DRAWING'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : op.category === 'NON-CRITICAL'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-700/40 text-slate-400 border border-slate-600/30'
                        }`}
                      >
                        {op.category === 'CRITICAL FOR DRAWING'
                          ? 'CRITICAL'
                          : op.category === 'NON-CRITICAL'
                          ? 'NON-CRIT'
                          : 'UNKNOWN'}
                      </span>
                    </div>
                    {op.details && <span className="text-slate-500 text-[9px]">{op.details}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
