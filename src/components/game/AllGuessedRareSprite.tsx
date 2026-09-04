import React, { useEffect, useState, useRef } from "react";

interface AllGuessedRareSpriteProps {
  className?: string;
}

const TOTAL_FRAMES = 12; // 12 frames (index 0 to 11)
const COLS = 4;
const ROWS = 3;
const BASE_DELAY = 100; // Base delay in ms for normal frames

const getFrameDelay = (frameIndex: number): number => {
  if (frameIndex === 0 || frameIndex === TOTAL_FRAMES - 1) {
    return BASE_DELAY * 1.5; // Slight hold at endpoints for visual impact
  }
  return BASE_DELAY;
};

// Module-level preload and GPU texture decode
if (typeof window !== "undefined") {
  const preloadImg = new Image();
  preloadImg.src = "/all_guessed_rare.webp";
  if ("decode" in preloadImg && typeof preloadImg.decode === "function") {
    preloadImg.decode().catch(() => {});
  }
}

export const AllGuessedRareSprite: React.FC<AllGuessedRareSpriteProps> = ({
  className = "",
}) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    const scheduleNextFrame = (currentFrame: number, direction: 1 | -1) => {
      let nextFrame = currentFrame + direction;
      let nextDir = direction;

      if (nextFrame >= TOTAL_FRAMES) {
        nextFrame = TOTAL_FRAMES - 2;
        nextDir = -1;
      } else if (nextFrame < 0) {
        nextFrame = 1;
        nextDir = 1;
      }

      const delay = getFrameDelay(currentFrame);
      timerRef.current = setTimeout(() => {
        if (!isMounted) return;
        setFrameIndex(nextFrame);
        scheduleNextFrame(nextFrame, nextDir);
      }, delay);
    };

    const img = new Image();
    img.src = "/all_guessed_rare.webp";
    if (img.complete) {
      scheduleNextFrame(0, 1);
    } else {
      img.onload = () => {
        if (isMounted) scheduleNextFrame(0, 1);
      };
      img.onerror = () => {
        if (isMounted) scheduleNextFrame(0, 1);
      };
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
        className="w-full h-full aspect-[727/1200] bg-no-repeat pointer-events-none select-none relative z-10"
        style={{
          backgroundImage: `url('/all_guessed_rare.webp')`,
          backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
          backgroundPosition: `${posX.toFixed(4)}% ${posY.toFixed(4)}%`,
        }}
        role="img"
        aria-label="Fast all guessed celebration animation"
      />
    </div>
  );
};

export default AllGuessedRareSprite;
