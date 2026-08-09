import React, { useEffect, useState, useRef } from "react";

interface TurnLostSpriteProps {
  className?: string;
}

const TOTAL_FRAMES = 21;
const COLS = 5;
const ROWS = 5;

// Delay logic per frame index (0-based):
// Frame 11 (index 10): 200ms delay
// Frame 21 (index 20): 200ms delay
// Other frames: 100ms
const getFrameDelay = (frameIndex: number): number => {
  switch (frameIndex) {
    case 10: // Frame 11
      return 200;
    case 20: // Frame 21 (Last frame)
      return 200;
    default:
      return 100;
  }
};

export const TurnLostSprite: React.FC<TurnLostSpriteProps> = ({ className = "" }) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    const scheduleNextFrame = (currentFrame: number) => {
      const delay = getFrameDelay(currentFrame);
      timerRef.current = setTimeout(() => {
        if (!isMounted) return;
        const nextFrame = (currentFrame + 1) % TOTAL_FRAMES;
        setFrameIndex(nextFrame);
        scheduleNextFrame(nextFrame);
      }, delay);
    };

    scheduleNextFrame(frameIndex);

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
        className="w-full h-full aspect-[1295/1260] bg-no-repeat pointer-events-none select-none relative z-10"
        style={{
          backgroundImage: `url('/turn_lost.webp')`,
          backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
          backgroundPosition: `${posX.toFixed(4)}% ${posY.toFixed(4)}%`,
        }}
        role="img"
        aria-label="Turn lost character animation"
      />
    </div>
  );
};

export default TurnLostSprite;
