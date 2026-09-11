import React, { useEffect, useState, useRef } from "react";

interface ExitSpriteProps {
  className?: string;
}

const TOTAL_FRAMES = 14; // 14 active frames (index 0 to 13)
const COLS = 5;
const ROWS = 3;
const BASE_DELAY = 100; // Base delay in ms for normal frames

// Delay logic per frame index (0-based):
// First frame (index 0): 400ms pause so the character is clearly visible with the text from frame 0
// Last frame (index 13): Stops/freezes
// Other frames: 100ms
const getFrameDelay = (frameIndex: number): number => {
  if (frameIndex === 0) {
    return BASE_DELAY * 4; // First frame held for 400ms
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
      // Stop and freeze at the last active frame (index 13)
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

    // Immediately schedule next frame from frame 0 without waiting for async image load checks
    scheduleNextFrame(0);

    return () => {
      isMounted = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const col = frameIndex % COLS;
  const row = Math.floor(frameIndex / COLS);

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Synchronous eager image rendering for instant 0ms appearance with text */}
      <div className="w-full aspect-[288/528] overflow-hidden pointer-events-none select-none relative z-10">
        <img
          src="/exit.webp"
          alt="Exit room animation"
          decoding="sync"
          loading="eager"
          className="absolute max-w-none pointer-events-none select-none"
          style={{
            width: `${COLS * 100}%`,
            height: `${ROWS * 100}%`,
            transform: `translate(-${(col / COLS) * 100}%, -${(row / ROWS) * 100}%)`,
            willChange: "transform",
          }}
        />
      </div>
    </div>
  );
};

export default ExitSprite;

