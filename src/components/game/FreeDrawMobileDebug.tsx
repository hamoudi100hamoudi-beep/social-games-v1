import React, { useState, useEffect } from 'react';
import {
  Bug,
  X,
  RefreshCw,
  Terminal,
  PowerOff,
  Sliders,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ExternalLink
} from 'lucide-react';
import {
  isMobileDebugActive,
  disableMobileDebug,
  getOrInitEruda,
  showEruda,
  destroyEruda
} from '../../utils/erudaManager';

export const FreeDrawMobileDebug: React.FC = () => {
  // Check if debug mode is active (URL param or localStorage)
  const [isActive, setIsActive] = useState<boolean>(() => isMobileDebugActive());
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);

  // Read current live states from localStorage
  const [undoDiagEnabled, setUndoDiagEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('freedraw_bucket_undo_diag') === '1';
  });

  const [checkpointExpEnabled, setCheckpointExpEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('freedraw_bucket_checkpoint_exp') === '1';
  });

  // When active in Free Draw: initialize Eruda once dynamically in background
  useEffect(() => {
    if (!isActive) return;

    // Load Eruda so it begins capturing console and network logs immediately
    getOrInitEruda();

    // Clean up when unmounting from Free Draw (e.g. leaving room or navigating to Lobby)
    return () => {
      destroyEruda();
    };
  }, [isActive]);

  // Keep state synchronized if changed externally or after reload
  const refreshStates = () => {
    if (typeof window === 'undefined') return;
    setUndoDiagEnabled(localStorage.getItem('freedraw_bucket_undo_diag') === '1');
    setCheckpointExpEnabled(localStorage.getItem('freedraw_bucket_checkpoint_exp') === '1');
  };

  if (!isActive) {
    return null;
  }

  // Toggle Undo Diagnostics flag
  const toggleUndoDiag = () => {
    const nextVal = !undoDiagEnabled;
    if (nextVal) {
      localStorage.setItem('freedraw_bucket_undo_diag', '1');
    } else {
      localStorage.removeItem('freedraw_bucket_undo_diag');
    }
    setUndoDiagEnabled(nextVal);
  };

  // Toggle Adaptive Bucket Checkpoints Experiment flag
  const toggleCheckpointExp = () => {
    const nextVal = !checkpointExpEnabled;
    if (nextVal) {
      localStorage.setItem('freedraw_bucket_checkpoint_exp', '1');
    } else {
      localStorage.removeItem('freedraw_bucket_checkpoint_exp');
    }
    setCheckpointExpEnabled(nextVal);
  };

  // Open Eruda console drawer
  const handleOpenEruda = async () => {
    await showEruda();
    setIsPanelOpen(false);
  };

  // Apply changes and reload page to start with a clean session
  const handleApplyAndReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  // Disable Mobile Debug mode completely
  const handleDisableDebug = () => {
    disableMobileDebug();
    setIsActive(false);
    setIsPanelOpen(false);
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <>
      {/* 🚀 Floating Trigger Pill Button (Safe Area Aware & Touch Friendly) */}
      <div 
        className="fixed top-14 left-2.5 z-[9999] pointer-events-auto select-none"
        style={{ touchAction: 'manipulation' }}
      >
        <button
          type="button"
          onClick={() => {
            refreshStates();
            setIsPanelOpen(true);
          }}
          title="Free Draw Mobile Debug"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-amber-400 border border-amber-500/50 shadow-xl backdrop-blur-md text-xs font-bold active:scale-95 transition-all cursor-pointer"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <Bug size={13} className="text-amber-400 shrink-0" />
          <span>FD Debug</span>
        </button>
      </div>

      {/* 🛠️ Debug Settings Modal Overlay */}
      {isPanelOpen && (
        <div 
          className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 pointer-events-auto"
          onClick={() => setIsPanelOpen(false)}
          dir="rtl"
        >
          <div 
            className="w-full max-w-sm sm:max-w-md bg-[#0F172A] border border-slate-700/80 rounded-2xl shadow-2xl p-4 sm:p-5 text-white text-sm flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <Bug size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-amber-400 tracking-tight leading-tight">
                    Free Draw Mobile Debug
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    إدارة أدوات التشخيص ونقاط الاستعادة على الهاتف
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPanelOpen(false)}
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 flex items-center justify-center transition-all cursor-pointer border border-slate-700/40"
              >
                <X size={16} />
              </button>
            </div>

            {/* Settings Toggles List */}
            <div className="flex flex-col gap-2.5">
              {/* 1. Undo Diagnostics Toggle */}
              <div 
                onClick={toggleUndoDiag}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800/90 border border-slate-700/50 cursor-pointer transition-all active:scale-[0.99]"
              >
                <div className="flex flex-col gap-0.5 pr-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-100 text-xs sm:text-sm">
                    <Sliders size={14} className="text-cyan-400 shrink-0" />
                    <span>Undo Diagnostics</span>
                  </div>
                  <span className="text-[10px] sm:text-[11px] text-slate-400 leading-tight">
                    تسجيل إحصائيات التراجع والتجمّد وأوقات التعبئة في Console
                  </span>
                  <code className="text-[9px] text-slate-500 font-mono mt-0.5">
                    freedraw_bucket_undo_diag
                  </code>
                </div>

                <div className="flex items-center gap-2 shrink-0 mr-2">
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    undoDiagEnabled 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                      : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                  }`}>
                    {undoDiagEnabled ? 'ON' : 'OFF'}
                  </span>
                  <div className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
                    undoDiagEnabled ? 'bg-emerald-600' : 'bg-slate-700'
                  }`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                      undoDiagEnabled ? '-translate-x-5' : 'translate-x-0'
                    }`} />
                  </div>
                </div>
              </div>

              {/* 2. Adaptive Bucket Checkpoints Experiment Toggle */}
              <div 
                onClick={toggleCheckpointExp}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800/90 border border-slate-700/50 cursor-pointer transition-all active:scale-[0.99]"
              >
                <div className="flex flex-col gap-0.5 pr-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-100 text-xs sm:text-sm">
                    <CheckCircle2 size={14} className="text-amber-400 shrink-0" />
                    <span>Adaptive Bucket Checkpoints</span>
                  </div>
                  <span className="text-[10px] sm:text-[11px] text-slate-400 leading-tight">
                    التقاط نقاط استعادة قبل/بعد الدلو لتخطي إعادة الـ floodFill
                  </span>
                  <code className="text-[9px] text-slate-500 font-mono mt-0.5">
                    freedraw_bucket_checkpoint_exp
                  </code>
                </div>

                <div className="flex items-center gap-2 shrink-0 mr-2">
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    checkpointExpEnabled 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                      : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                  }`}>
                    {checkpointExpEnabled ? 'ON' : 'OFF'}
                  </span>
                  <div className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
                    checkpointExpEnabled ? 'bg-emerald-600' : 'bg-slate-700'
                  }`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                      checkpointExpEnabled ? '-translate-x-5' : 'translate-x-0'
                    }`} />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-col gap-2 pt-1 border-t border-slate-700/60">
              {/* Launch Eruda */}
              <button
                type="button"
                onClick={handleOpenEruda}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer border border-blue-400/30"
              >
                <Terminal size={16} />
                <span>فتح وحدة تحكم Eruda (Console)</span>
              </button>

              {/* Apply & Reload */}
              <button
                type="button"
                onClick={handleApplyAndReload}
                className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-slate-600/40"
              >
                <RefreshCw size={13} />
                <span>تطبيق وإعادة التحميل (Apply & Reload)</span>
              </button>

              {/* Disable Mobile Debug */}
              <button
                type="button"
                onClick={handleDisableDebug}
                className="w-full py-1.5 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/50 active:scale-95 text-red-300 font-medium text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-red-800/40"
              >
                <PowerOff size={12} />
                <span>تعطيل وضع التصحيح ومسح المعامل (Disable)</span>
              </button>
            </div>

            {/* Footer Notice */}
            <div className="text-[10px] text-slate-400 flex items-center justify-between px-1">
              <span>* كل هاتف يحتفظ بإعداداته الخاصة بشكل مستقل</span>
              <span className="font-mono text-slate-500">v3.4.3</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FreeDrawMobileDebug;
