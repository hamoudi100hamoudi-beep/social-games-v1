import React, { useEffect, useState, useRef } from "react";

interface WaitingSpriteProps {
  className?: string;
}

const TOTAL_FRAMES = 16;
const COLS = 5;
const ROWS = 4;

// Delay logic per frame index (0-based):
// Frame 1 (index 0): 3000ms pause
// Frame 6 (index 5): 1500ms pause
// Frame 11 (index 10): 1500ms pause
// Other frames: 100ms
const getFrameDelay = (frameIndex: number): number => {
  switch (frameIndex) {
    case 0: // Frame 1
      return 3000;
    case 5: // Frame 6
      return 1500;
    case 10: // Frame 11
      return 1500;
    default:
      return 100;
  }
};

export const WaitingSprite: React.FC<WaitingSpriteProps> = ({ className = "" }) => {
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    const runFrame = () => {
      const current = frameRef.current;
      const delay = getFrameDelay(current);

      timerRef.current = setTimeout(() => {
        if (!isMounted) return;
        const nextFrame = (frameRef.current + 1) % TOTAL_FRAMES;
        frameRef.current = nextFrame;
        setFrame(nextFrame);
        runFrame();
      }, delay);
    };

    runFrame();

    return () => {
      isMounted = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const col = frame % COLS;
  const row = Math.floor(frame / COLS);

  // Percentage positioning based on CSS spec formula:
  // position_x = col / (COLS - 1) * 100%
  // position_y = row / (ROWS - 1) * 100%
  const posX = (col / (COLS - 1)) * 100;
  const posY = (row / (ROWS - 1)) * 100;

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Sharp contact shadow directly underneath character's feet and brush */}
      <div
        className="absolute bg-slate-800/25 rounded-[100%] blur-[0.5px] pointer-events-none z-0"
        style={{
          left: '26%',
          width: '60%',
          bottom: '0.2%',
          height: '3.5%',
        }}
        aria-hidden="true"
      />
      <div
        className="w-full h-full aspect-[203/315] bg-no-repeat pointer-events-none select-none relative z-10"
        style={{
          backgroundImage: `url('/waiting.webp')`,
          backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
          backgroundPosition: `${posX.toFixed(4)}% ${posY.toFixed(4)}%`,
        }}
        role="img"
        aria-label="Waiting character animation"
      />
    </div>
  );
};

export default WaitingSprite;
