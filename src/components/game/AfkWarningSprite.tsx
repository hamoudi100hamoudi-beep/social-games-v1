import React, { useEffect, useState, useRef } from "react";

interface AfkWarningSpriteProps {
  className?: string;
}

const TOTAL_FRAMES = 12; // 12 frames total (index 0 to 11)
const COLS = 6;
const ROWS = 2;

// 12 fps baseline: 1000ms / 12 = ~83.33ms
// Frame 1 (index 0) and Frame 12 (index 11) hold for 3 frames duration (3 * 83.33 ≈ 250ms)
const getFrameDelay = (frameIndex: number): number => {
  if (frameIndex === 0 || frameIndex === TOTAL_FRAMES - 1) {
    return 250; // 3 frames duration for endpoints
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

    const img = new Image();
    img.src = "/afk_warning.webp";
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
    <div className={`relative flex items-center justify-center shrink-0 ${className}`}>
      {/* Hidden image element to guarantee GPU texture decoding is retained */}
      <img
        src="/afk_warning.webp"
        alt=""
        className="hidden"
        aria-hidden="true"
        decoding="sync"
      />
      <div
        className="h-full aspect-[256/326] max-w-full bg-no-repeat pointer-events-none select-none relative z-10"
        style={{
          backgroundImage: `url('/afk_warning.webp')`,
          backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
          backgroundPosition: `${posX.toFixed(4)}% ${posY.toFixed(4)}%`,
        }}
        role="img"
        aria-label="AFK Inactivity Warning Animation"
      />
    </div>
  );
};

export default AfkWarningSprite;
