import React, { useEffect, useState, useRef } from "react";

interface PartialGuessedSpriteProps {
  className?: string;
}

const TOTAL_FRAMES = 22;
const COLS = 4;
const ROWS = 6;
const FRAME_DELAY = 95; // ~10.5 fps for smooth, expressive animation pacing

export const PartialGuessedSprite: React.FC<PartialGuessedSpriteProps> = ({ className = "" }) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    const scheduleNextFrame = (currentFrame: number) => {
      // If currently on frame 0, double its delay (acting like 2 frames)
      const delay = currentFrame === 0 ? FRAME_DELAY * 2 : FRAME_DELAY;

      timerRef.current = setTimeout(() => {
        if (!isMounted) return;
        const nextFrame = (currentFrame + 1) % TOTAL_FRAMES;
        setFrameIndex(nextFrame);
        scheduleNextFrame(nextFrame);
      }, delay);
    };

    const img = new Image();
    img.src = '/partial_guessed.webp';
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
        className="w-full h-full aspect-[343/300] bg-no-repeat pointer-events-none select-none"
        style={{
          backgroundImage: `url('/partial_guessed.webp')`,
          backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
          backgroundPosition: `${posX.toFixed(4)}% ${posY.toFixed(4)}%`,
        }}
        role="img"
        aria-label="Partial guessed turn animation"
      />
    </div>
  );
};

export default PartialGuessedSprite;
