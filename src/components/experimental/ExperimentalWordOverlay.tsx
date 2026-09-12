import React, { memo, useMemo } from 'react';

export interface ExperimentalWordOverlayProps {
  status?: string;
  isDrawingMode: boolean;
  isFreeDraw: boolean;
  amIDrawer: boolean;
  isFullScreenMode?: boolean;
  currentWord?: string | null;
  revealedIndices?: number[];
  hintsUsed?: number;
  maskedWordArray?: Array<{ char?: string; isSpace?: boolean }>;
  isRTL?: boolean;
}

// 🛡️ Pre-allocated static style references to eliminate CSS clamp recalculations & garbage collection pressure
const CONTAINER_STYLE: React.CSSProperties = { top: 'clamp(6px, 1.6vw, 12px)' };
const SPACE_STYLE: React.CSSProperties = { width: 'clamp(10px, 3.2vw, 24px)' };
const CHAR_CONTAINER_STYLE: React.CSSProperties = { height: 'clamp(22px, 5.2vw, 42px)' };
const CHAR_TEXT_STYLE: React.CSSProperties = { fontSize: 'clamp(14px, 3.2vw, 24px)' };
const UNDERLINE_STYLE: React.CSSProperties = {
  width: 'clamp(7px, 1.9vw, 14px)',
  height: 'clamp(2.5px, 0.4vw, 3px)',
};

/**
 * 🛡️ ExperimentalWordOverlay (Suspect 5: Word Overlay & Hints Isolation)
 * 
 * Isolates the Word & Hint rendering layer completely from the Drawing Critical Path:
 * 1. Wrapped in React.memo with value equality checking (stops re-renders caused by unrelated room events).
 * 2. Pre-calculates RTL via single regex test only on word change.
 * 3. Uses Set-based O(1) character revealed lookup.
 * 4. Uses static CSS style references to avoid inline clamp recalculations.
 * 5. Visual design, typography, spacing, and behavior remain 100% identical to production.
 */
const ExperimentalWordOverlayComponent: React.FC<ExperimentalWordOverlayProps> = ({
  status,
  isFreeDraw,
  amIDrawer,
  isFullScreenMode = false,
  currentWord,
  revealedIndices,
  hintsUsed = 0,
  maskedWordArray,
  isRTL: propIsRTL = false,
}) => {
  if (status !== 'DRAWING' || isFreeDraw) return null;
  if (amIDrawer && !isFullScreenMode) return null;
  if (!amIDrawer && isFullScreenMode) return null;

  const isDrawer = amIDrawer;

  // Memoize RTL detection only when currentWord changes (avoid repeated regex evaluation on render)
  const isRTL = useMemo(() => {
    if (isDrawer && currentWord) {
      return /[\u0600-\u06FF]/.test(currentWord);
    }
    return propIsRTL;
  }, [isDrawer, currentWord, propIsRTL]);

  // Memoize row container style with dynamic direction
  const wordRowStyle = useMemo<React.CSSProperties>(() => ({
    flexDirection: isRTL ? 'row-reverse' : 'row',
    gap: 'clamp(4px, 1.6vw, 12px)'
  }), [isRTL]);

  // Memoize revealed indices as a Set for instant O(1) character lookup
  const revealedSet = useMemo(() => {
    return new Set(revealedIndices || []);
  }, [revealedIndices]);

  // Memoize characters split array
  const characters = useMemo(() => {
    if (!currentWord) return [];
    return currentWord.split('');
  }, [currentWord]);

  return (
    <div 
      className="absolute left-0 right-0 flex items-center justify-center z-[150] pointer-events-none"
      style={CONTAINER_STYLE}
    >
      {isDrawer && currentWord ? (
        <div className="flex items-center" style={wordRowStyle}>
          {characters.map((char: string, i: number) => {
            if (char === ' ') {
              return (
                <span 
                  key={`space-${i}`} 
                  style={SPACE_STYLE} 
                />
              );
            }
            const isRevealed = revealedSet.has(i);
            return (
              <div
                key={`char-${i}`}
                className="flex flex-col items-center justify-between"
                style={CHAR_CONTAINER_STYLE}
              >
                <span
                  className={`leading-none font-black ${isRevealed ? 'text-[#FBBF24]' : 'text-[#0F172A]'}`}
                  style={CHAR_TEXT_STYLE}
                >
                  {char}
                </span>
                <div
                  className={`rounded-full mt-auto ${hintsUsed >= 1 ? (isRevealed ? 'bg-[#FBBF24]' : 'bg-[#0F172A]') : 'opacity-0'}`}
                  style={UNDERLINE_STYLE}
                />
              </div>
            );
          })}
        </div>
      ) : (
        maskedWordArray && maskedWordArray.length > 0 ? (
          <div className="flex items-center" style={wordRowStyle}>
            {maskedWordArray.map((item: any, i: number) => {
              if (item.isSpace) {
                return (
                  <span 
                    key={`space-${i}`} 
                    style={SPACE_STYLE} 
                  />
                );
              }
              return (
                <div
                  key={`char-${i}`}
                  className="flex flex-col items-center justify-between"
                  style={CHAR_CONTAINER_STYLE}
                >
                  <span 
                    className="leading-none font-black text-[#0F172A]"
                    style={CHAR_TEXT_STYLE}
                  >
                    {item.char || ''}
                  </span>
                  <div
                    className={`rounded-full mt-auto ${item.char ? 'bg-[#0F172A]' : 'bg-slate-500'}`}
                    style={UNDERLINE_STYLE}
                  />
                </div>
              );
            })}
          </div>
        ) : null
      )}
    </div>
  );
};

// Strict memoization comparison: prevent re-renders unless word or hints state actually changed
function areWordOverlayPropsEqual(
  prev: Readonly<ExperimentalWordOverlayProps>,
  next: Readonly<ExperimentalWordOverlayProps>
): boolean {
  if (
    prev.status !== next.status ||
    prev.isDrawingMode !== next.isDrawingMode ||
    prev.isFreeDraw !== next.isFreeDraw ||
    prev.amIDrawer !== next.amIDrawer ||
    prev.isFullScreenMode !== next.isFullScreenMode ||
    prev.currentWord !== next.currentWord ||
    prev.hintsUsed !== next.hintsUsed ||
    prev.isRTL !== next.isRTL
  ) {
    return false;
  }

  // Check revealedIndices array equality
  if (prev.revealedIndices !== next.revealedIndices) {
    const prevLen = prev.revealedIndices?.length ?? 0;
    const nextLen = next.revealedIndices?.length ?? 0;
    if (prevLen !== nextLen) return false;
    if (prev.revealedIndices && next.revealedIndices) {
      for (let i = 0; i < prevLen; i++) {
        if (prev.revealedIndices[i] !== next.revealedIndices[i]) return false;
      }
    }
  }

  // Check maskedWordArray equality
  if (prev.maskedWordArray !== next.maskedWordArray) {
    const prevLen = prev.maskedWordArray?.length ?? 0;
    const nextLen = next.maskedWordArray?.length ?? 0;
    if (prevLen !== nextLen) return false;
    if (prev.maskedWordArray && next.maskedWordArray) {
      for (let i = 0; i < prevLen; i++) {
        const p = prev.maskedWordArray[i];
        const n = next.maskedWordArray[i];
        if (p?.char !== n?.char || p?.isSpace !== n?.isSpace) return false;
      }
    }
  }

  return true;
}

export const ExperimentalWordOverlay = memo(ExperimentalWordOverlayComponent, areWordOverlayPropsEqual);
