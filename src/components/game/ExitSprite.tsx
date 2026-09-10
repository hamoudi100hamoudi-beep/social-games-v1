import React, { useEffect, useState, useRef } from "react";

interface ExitSpriteProps {
  className?: string;
}

const TOTAL_FRAMES = 14; // 14 active frames (index 0 to 13)
const COLS = 5;
const ROWS = 3;
const BASE_DELAY = 100; // Base delay in ms for normal frames

// Delay logic per frame index (0-based):
// First frame (index 0): 300ms (held as 3 frames)
// Last frame (index 13): Stops/freezes
// Other frames: 100ms
const getFrameDelay = (frameIndex: number): number => {
  if (frameIndex === 0) {
    return BASE_DELAY * 3; // First frame displayed for 3 frames duration (300ms)
  }
  return BASE_DELAY;
};

// Module-level preload and GPU texture decode
if (typeof window !== "undefined") {
  const preloadImg = new Image();
  preloadImg.src = "/exit.webp";
  if ("decode" in preloadImg && typeof preloadImg.decode === "function") {
    preloadImg.decode().catch(() => {});
  }
}

export const ExitSprite: React.FC<ExitSpriteProps> = ({ className = "" }) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    const scheduleNextFrame = (currentFrame: number) => {
      // Stop and freeze at the last active frame (index 22)
      if (currentFrame >= TOTAL_FRAMES - 1) {
        return;
      }

      const delay = getFrameDelay(currentFrame);
      timerRef.current = setTimeout(() => {
        if (!isMounted) return;
        const nextFrame = currentFrame + 1;
        setFrameIndex(nextFrame);
        scheduleNextFrame(nextFrame);
      }, delay);
    };

    const img = new Image();
    img.src = "/exit.webp";
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

  const posX = (col / (COLS - 1)) * 100;
  const posY = (row / (ROWS - 1)) * 100;

  return (
    <div className={`relative flex items-center justify-center shrink-0 ${className}`}>
      <div
        className="h-full aspect-[288/528] max-w-full bg-no-repeat pointer-events-none select-none relative z-10"
        style={{
          backgroundImage: `url('/exit.webp')`,
          backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
          backgroundPosition: `${posX.toFixed(4)}% ${posY.toFixed(4)}%`,
        }}
        role="img"
        aria-label="Exit room animation"
      />
    </div>
  );
};

export default ExitSprite;
