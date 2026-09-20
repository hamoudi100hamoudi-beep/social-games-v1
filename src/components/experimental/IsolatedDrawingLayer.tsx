import React, { memo, useMemo } from 'react';
import { ExperimentalDrawingBoard } from './ExperimentalDrawingBoard';

export interface IsolatedDrawingLayerProps {
  readOnly: boolean;
  isDrawingMode: boolean;
  isFreeDraw: boolean;
  isExperimental?: boolean;
  amIDrawer: boolean;
  currentDrawerId?: string;
  status?: string;
  canSkipTurn: boolean;
  canRequestHint: boolean;
  hintsRemaining: number;
  onSkipTurnRequest?: () => void;
  onRequestHintAction?: () => void;
  onExitFreeDrawAction?: () => void;
  onSyncStateChangeAction?: (syncing: boolean) => void;
  onHistoryLengthChangeAction?: (hasStrokes: boolean) => void;
  drawerTimerSlotRef?: (node: HTMLDivElement | null) => void;
}

/**
 * 🛡️ IsolatedDrawingLayer
 * Architectural Boundary separating the Game Layer (timers, scores, chat, guesses, notifications)
 * from the Drawing Subsystem (DrawingBoard, DrawingCanvasCore, pointer listeners, binary encoding).
 *
 * Guaranteed Invariant:
 * Non-drawing state changes in Game Layer MUST NOT trigger re-renders in this layer.
 */
const IsolatedDrawingLayerComponent: React.FC<IsolatedDrawingLayerProps> = ({
  readOnly,
  isDrawingMode,
  isFreeDraw,
  isExperimental = false,
  amIDrawer,
  currentDrawerId,
  status,
  canSkipTurn,
  canRequestHint,
  hintsRemaining,
  onSkipTurnRequest,
  onRequestHintAction,
  onExitFreeDrawAction,
  onSyncStateChangeAction,
  onHistoryLengthChangeAction,
  drawerTimerSlotRef,
}) => {
  // Stable timerBarNode container with invariant reference
  const stableTimerBarNode = useMemo(() => {
    if (isFreeDraw) return undefined;
    return (
      <div
        id="timer-slot-drawer"
        ref={drawerTimerSlotRef}
        className="w-full shrink-0"
      />
    );
  }, [isFreeDraw, drawerTimerSlotRef]);

  // Stable action proxies
  const handleSkipTurn = useMemo(() => {
    return canSkipTurn && onSkipTurnRequest ? onSkipTurnRequest : undefined;
  }, [canSkipTurn, onSkipTurnRequest]);

  const handleRequestHint = useMemo(() => {
    return canRequestHint && onRequestHintAction ? onRequestHintAction : undefined;
  }, [canRequestHint, onRequestHintAction]);

  return (
    <div className="w-full h-full relative flex flex-col">
      <ExperimentalDrawingBoard
        key="isolated-shared-board"
        currentDrawerId={currentDrawerId}
        status={status}
        readOnly={readOnly}
        isFreeDraw={isFreeDraw}
        isExperimental={isExperimental}
        amIDrawer={amIDrawer}
        onExitFreeDraw={onExitFreeDrawAction}
        onSyncStateChange={onSyncStateChangeAction}
        onHistoryLengthChange={onHistoryLengthChangeAction}
        onSkipTurn={handleSkipTurn}
        onRequestHint={handleRequestHint}
        timerBarNode={stableTimerBarNode}
        hintsRemaining={hintsRemaining}
      />
    </div>
  );
};

// Strict isolation comparison: only re-render if drawing-critical parameters change
function areDrawingPropsEqual(
  prev: Readonly<IsolatedDrawingLayerProps>,
  next: Readonly<IsolatedDrawingLayerProps>
): boolean {
  return (
    prev.readOnly === next.readOnly &&
    prev.isDrawingMode === next.isDrawingMode &&
    prev.isFreeDraw === next.isFreeDraw &&
    prev.isExperimental === next.isExperimental &&
    prev.amIDrawer === next.amIDrawer &&
    prev.currentDrawerId === next.currentDrawerId &&
    prev.status === next.status &&
    prev.canSkipTurn === next.canSkipTurn &&
    prev.canRequestHint === next.canRequestHint &&
    prev.hintsRemaining === next.hintsRemaining &&
    prev.onSkipTurnRequest === next.onSkipTurnRequest &&
    prev.onRequestHintAction === next.onRequestHintAction &&
    prev.onExitFreeDrawAction === next.onExitFreeDrawAction &&
    prev.onSyncStateChangeAction === next.onSyncStateChangeAction &&
    prev.onHistoryLengthChangeAction === next.onHistoryLengthChangeAction &&
    prev.drawerTimerSlotRef === next.drawerTimerSlotRef
  );
}

export const IsolatedDrawingLayer = memo(IsolatedDrawingLayerComponent, areDrawingPropsEqual);
