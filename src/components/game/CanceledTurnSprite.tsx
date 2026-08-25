import React, { useEffect, useState, useRef } from "react";

interface CanceledTurnSpriteProps {
  className?: string;
}

const COLS = 5;
const ROWS = 6;
const BASE_DELAY = 100; // Base delay in ms for normal frames
const EASE_DELAY = 220; // Slower delay for frames 27 and 30 for smooth head-turn easing

interface FrameStep {
  frame: number; // 0-based frame index (0..29)
  delay: number; // Delay duration in ms
}

// Full animation sequence:
// 1) Frame 1 to Frame 30 (reaches frame 30 for the 1st time, easing on 27 and 30)
// 2) Bounces back to Frame 27 (easing on 27), then goes forward to Frame 30 (reaches frame 30 for the 2nd time, easing on 30)
// 3) On the 2nd time, returns back from Frame 30 to Frame 25 (easing through 27) and freezes at Frame 25 until the turn ends
const ANIMATION_SEQUENCE: FrameStep[] = [
  // --- 1. INTRO (Frame 1 -> Frame 30) ---
  { frame: 0, delay: BASE_DELAY },     // Frame 1
  { frame: 1, delay: BASE_DELAY },     // Frame 2
  { frame: 2, delay: BASE_DELAY },     // Frame 3
  { frame: 3, delay: BASE_DELAY },     // Frame 4
  { frame: 4, delay: BASE_DELAY },     // Frame 5
  { frame: 5, delay: BASE_DELAY },     // Frame 6
  { frame: 6, delay: BASE_DELAY },     // Frame 7
  { frame: 7, delay: BASE_DELAY },     // Frame 8
  { frame: 8, delay: BASE_DELAY * 6 }, // Frame 9 (hold 6x)
  { frame: 9, delay: BASE_DELAY },     // Frame 10
  { frame: 10, delay: BASE_DELAY },    // Frame 11
  { frame: 11, delay: BASE_DELAY },    // Frame 12
  { frame: 12, delay: BASE_DELAY },    // Frame 13
  { frame: 13, delay: BASE_DELAY },    // Frame 14
  { frame: 14, delay: BASE_DELAY * 5 },// Frame 15 (hold 5x)
  { frame: 15, delay: BASE_DELAY },    // Frame 16
  { frame: 16, delay: BASE_DELAY },    // Frame 17
  { frame: 17, delay: BASE_DELAY },    // Frame 18
  { frame: 18, delay: BASE_DELAY },    // Frame 19
  { frame: 19, delay: BASE_DELAY },    // Frame 20
  { frame: 20, delay: BASE_DELAY },    // Frame 21
  { frame: 21, delay: BASE_DELAY },    // Frame 22
  { frame: 22, delay: BASE_DELAY },    // Frame 23
  { frame: 23, delay: BASE_DELAY },    // Frame 24
  { frame: 24, delay: BASE_DELAY * 6 },// Frame 25 (hold 6x)
  { frame: 25, delay: BASE_DELAY },    // Frame 26
  { frame: 26, delay: EASE_DELAY },    // Frame 27 (easing / lingering slightly)
  { frame: 27, delay: BASE_DELAY },    // Frame 28
  { frame: 28, delay: BASE_DELAY },    // Frame 29
  { frame: 29, delay: EASE_DELAY },    // Frame 30 (1st arrival at Frame 30, easing / lingering slightly)

  // --- 2. BOUNCE (Frame 30 -> 29 -> 28 -> 27 -> 28 -> 29 -> 30) ---
  { frame: 28, delay: BASE_DELAY },    // Frame 29
  { frame: 27, delay: BASE_DELAY },    // Frame 28
  { frame: 26, delay: EASE_DELAY },    // Frame 27 (turning point, easing / lingering slightly)
  { frame: 27, delay: BASE_DELAY },    // Frame 28
  { frame: 28, delay: BASE_DELAY },    // Frame 29
  { frame: 29, delay: EASE_DELAY },    // Frame 30 (2nd arrival at Frame 30, turning point, easing / lingering)

  // --- 3. FINAL RETURN (Frame 30 -> 29 -> 28 -> 27 -> 26 -> 25) & FREEZE ---
  { frame: 28, delay: BASE_DELAY },    // Frame 29
  { frame: 27, delay: BASE_DELAY },    // Frame 28
  { frame: 26, delay: EASE_DELAY },    // Frame 27 (easing smoothly as he heads back)
  { frame: 25, delay: BASE_DELAY },    // Frame 26
  { frame: 24, delay: 0 },             // Frame 25 (stops and freezes here permanently)
];

export const CanceledTurnSprite: React.FC<CanceledTurnSpriteProps> = ({ className = "" }) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    const scheduleNextStep = (stepIndex: number) => {
      const currentStep = ANIMATION_SEQUENCE[stepIndex];
      // Stop scheduling when reaching the end or if delay is 0
      if (stepIndex >= ANIMATION_SEQUENCE.length - 1 || currentStep.delay <= 0) {
        return;
      }

      timerRef.current = setTimeout(() => {
        if (!isMounted) return;
        const nextStepIndex = stepIndex + 1;
        setFrameIndex(ANIMATION_SEQUENCE[nextStepIndex].frame);
        scheduleNextStep(nextStepIndex);
      }, currentStep.delay);
    };

    const img = new Image();
    img.src = '/canceled_turn.webp';
    if (img.complete) {
      scheduleNextStep(0);
    } else {
      img.onload = () => { if (isMounted) scheduleNextStep(0); };
      img.onerror = () => { if (isMounted) scheduleNextStep(0); };
    }

    return () => {
      isMounted = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const col = frameIndex % COLS;
  const row = Math.floor(frameIndex / COLS);

  const posX = (col / (COLS - 1)) * 100;
  const posY = (row / (ROWS - 1)) * 100;

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <div
        className="w-full h-full aspect-[241/300] bg-no-repeat pointer-events-none select-none relative z-10"
        style={{
          backgroundImage: `url('/canceled_turn.webp')`,
          backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
          backgroundPosition: `${posX.toFixed(4)}% ${posY.toFixed(4)}%`,
        }}
        role="img"
        aria-label="Canceled turn character animation"
      />
    </div>
  );
};

export default CanceledTurnSprite;
