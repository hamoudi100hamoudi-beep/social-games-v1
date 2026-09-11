import React, { useEffect, useState, useRef } from "react";

interface AfkWarningSpriteProps {
  className?: string;
}

const TOTAL_FRAMES = 12; // 12 frames total (index 0 to 11)
const COLS = 6;
const ROWS = 2;

// 12 fps baseline: 1000ms / 12 = ~83.33ms
// Frame 1 (index 0) holds for 350ms so it appears firmly with the text on first render, and endpoints hold for 250ms
const getFrameDelay = (frameIndex: number): number => {
  if (frameIndex === 0) {
    return 350; // First frame held for 350ms so it's clearly visible with the text
  }
  if (frameIndex === TOTAL_FRAMES - 1) {
    return 250; // Endpoint pause
  }
  return 83; // Standard 12 fps frame duration
};

// Module-level preload and GPU texture decode
if (typeof window !== "undefined") {
  const preloadImg = new Image();
  preloadImg.src = "/afk_warning.webp";
  if ("decode" in preloadImg && typeof preloadImg.decode === "function") {
    preloadImg.decode().catch(() => {});
  }
}

export const AfkWarningSprite: React.FC<AfkWarningSpriteProps> = ({
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

    // Immediately schedule next frame from frame 0 without waiting for async image load checks
    scheduleNextFrame(0, 1);

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
      <div className="w-full aspect-[256/326] overflow-hidden pointer-events-none select-none relative z-10">
        <img
          src="/afk_warning.webp"
          alt="AFK Inactivity Warning Animation"
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

export default AfkWarningSprite;

