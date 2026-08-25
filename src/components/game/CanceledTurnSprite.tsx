import React, { useEffect, useState, useRef } from "react";

interface CanceledTurnSpriteProps {
  className?: string;
}

const COLS = 5;
const ROWS = 6;
const BASE_DELAY = 100; // Base delay in ms

interface FrameStep {
  frame: number; // 0-based frame index (0..29)
  delay: number; // Delay duration in ms
}

// Initial playthrough from Frame 1 to Frame 30
const INTRO_SEQUENCE: FrameStep[] = [
  { frame: 0, delay: BASE_DELAY * 2 }, // Frame 1 (holds 2 frames)
  { frame: 1, delay: BASE_DELAY },     // Frame 2
  { frame: 2, delay: BASE_DELAY },     // Frame 3
  { frame: 3, delay: BASE_DELAY },     // Frame 4
  { frame: 4, delay: BASE_DELAY },     // Frame 5
  { frame: 5, delay: BASE_DELAY },     // Frame 6
  { frame: 6, delay: BASE_DELAY },     // Frame 7
  { frame: 7, delay: BASE_DELAY },     // Frame 8
  { frame: 8, delay: BASE_DELAY * 6 }, // Frame 9 (holds 6 frames)
  { frame: 9, delay: BASE_DELAY },     // Frame 10
  { frame: 10, delay: BASE_DELAY },    // Frame 11
  { frame: 11, delay: BASE_DELAY },    // Frame 12
  { frame: 12, delay: BASE_DELAY },    // Frame 13
  { frame: 13, delay: BASE_DELAY },    // Frame 14
  { frame: 14, delay: BASE_DELAY * 5 }, // Frame 15 (holds 5 frames)
  { frame: 15, delay: BASE_DELAY },    // Frame 16
  { frame: 16, delay: BASE_DELAY },    // Frame 17
  { frame: 17, delay: BASE_DELAY },    // Frame 18
  { frame: 18, delay: BASE_DELAY },    // Frame 19
  { frame: 19, delay: BASE_DELAY },    // Frame 20
  { frame: 20, delay: BASE_DELAY },    // Frame 21
  { frame: 21, delay: BASE_DELAY },    // Frame 22
  { frame: 22, delay: BASE_DELAY },    // Frame 23
  { frame: 23, delay: BASE_DELAY },    // Frame 24
  { frame: 24, delay: BASE_DELAY * 6 }, // Frame 25 (holds 6 frames)
  { frame: 25, delay: BASE_DELAY },    // Frame 26
  { frame: 26, delay: BASE_DELAY },    // Frame 27
  { frame: 27, delay: BASE_DELAY },    // Frame 28
  { frame: 28, delay: BASE_DELAY },    // Frame 29
  { frame: 29, delay: BASE_DELAY },    // Frame 30
];

// Continuous ping-pong loop between Frame 27 and Frame 30 (indices 26..29)
// 30 -> 29 -> 28 -> 27 -> 28 -> 29 -> 30 ...
const LOOP_SEQUENCE: FrameStep[] = [
  { frame: 28, delay: BASE_DELAY }, // Frame 29
  { frame: 27, delay: BASE_DELAY }, // Frame 28
  { frame: 26, delay: BASE_DELAY }, // Frame 27
  { frame: 27, delay: BASE_DELAY }, // Frame 28
  { frame: 28, delay: BASE_DELAY }, // Frame 29
  { frame: 29, delay: BASE_DELAY }, // Frame 30
];

export const CanceledTurnSprite: React.FC<CanceledTurnSpriteProps> = ({ className = "" }) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;
    let inLoop = false;
    let stepIndex = 0;

    const playNextStep = () => {
      if (!inLoop) {
        if (stepIndex < INTRO_SEQUENCE.length) {
          const step = INTRO_SEQUENCE[stepIndex];
          setFrameIndex(step.frame);
          stepIndex++;
          timerRef.current = setTimeout(() => {
            if (isMounted) playNextStep();
          }, step.delay);
        } else {
          // Switch to ping-pong loop
          inLoop = true;
          stepIndex = 0;
          const step = LOOP_SEQUENCE[stepIndex];
          setFrameIndex(step.frame);
          stepIndex = (stepIndex + 1) % LOOP_SEQUENCE.length;
          timerRef.current = setTimeout(() => {
            if (isMounted) playNextStep();
          }, step.delay);
        }
      } else {
        const step = LOOP_SEQUENCE[stepIndex];
        setFrameIndex(step.frame);
        stepIndex = (stepIndex + 1) % LOOP_SEQUENCE.length;
        timerRef.current = setTimeout(() => {
          if (isMounted) playNextStep();
        }, step.delay);
      }
    };

    const img = new Image();
    img.src = '/canceled_turn.webp';
    if (img.complete) {
      playNextStep();
    } else {
      img.onload = () => { if (isMounted) playNextStep(); };
      img.onerror = () => { if (isMounted) playNextStep(); };
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
