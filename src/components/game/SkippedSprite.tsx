import React, { useEffect, useState, useRef } from "react";

interface SkippedSpriteProps {
  className?: string;
}

const TOTAL_FRAMES = 20;
const COLS = 5;
const ROWS = 4;
const FRAME_DELAY = 90; // Animation on "twos" (~11-12fps) for crisp, stepped timing

export const SkippedSprite: React.FC<SkippedSpriteProps> = ({ className = "" }) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    const scheduleNextFrame = (currentFrame: number) => {
      // Stop at frame 20 (index 19)
      if (currentFrame >= TOTAL_FRAMES - 1) {
        return;
      }

      timerRef.current = setTimeout(() => {
        if (!isMounted) return;
        const nextFrame = currentFrame + 1;
        setFrameIndex(nextFrame);
        scheduleNextFrame(nextFrame);
      }, FRAME_DELAY);
    };

    const img = new Image();
    img.src = '/skipped.webp';
    if (img.complete) {
      scheduleNextFrame(0);
    } else {
      img.onload = () => { if (isMounted) scheduleNextFrame(0); };
      img.onerror = () => { if (isMounted) scheduleNextFrame(0); };
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

  // Percentage positioning based on CSS spec formula:
  // position_x = col / (COLS - 1) * 100%
  // position_y = row / (ROWS - 1) * 100%
  const posX = (col / (COLS - 1)) * 100;
  const posY = (row / (ROWS - 1)) * 100;

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <div
        className="w-full h-full aspect-[374/559] bg-no-repeat pointer-events-none select-none"
        style={{
          backgroundImage: `url('/skipped.webp')`,
          backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
          backgroundPosition: `${posX.toFixed(4)}% ${posY.toFixed(4)}%`,
        }}
        role="img"
        aria-label="Skipped turn animation"
      />
    </div>
  );
};

export default SkippedSprite;
