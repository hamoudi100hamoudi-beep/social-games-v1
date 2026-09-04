import React, { useEffect, useState, useRef } from "react";

interface NoOneGuessed2SpriteProps {
  className?: string;
}

const TOTAL_FRAMES = 27; // 27 frames (index 0 to 26)
const COLS = 4;
const ROWS = 7;
const BASE_DELAY = 100; // Base delay in ms for normal frames

const getFrameDelay = (frameIndex: number): number => {
  if (frameIndex === 0) {
    return 1400; // Frame 0: Looks at camera/players disappointed for 1.4 seconds (1400ms)
  }
  if (frameIndex === 12) {
    return 500; // Frame 12: Pauses after turning head before sighing
  }
  return BASE_DELAY; // Natural smooth transition for all other frames (100ms)
};

// Module-level preload and GPU texture decode
if (typeof window !== "undefined") {
  const preloadImg = new Image();
  preloadImg.src = "/no_one_guessed_2.webp";
  if ("decode" in preloadImg && typeof preloadImg.decode === "function") {
    preloadImg.decode().catch(() => {});
  }
}

export const NoOneGuessed2Sprite: React.FC<NoOneGuessed2SpriteProps> = ({
  className = "",
}) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    const scheduleNextFrame = (currentFrame: number) => {
      // Freeze / Stop at the last frame (frame index 26)
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
    img.src = "/no_one_guessed_2.webp";
    if (img.complete) {
      scheduleNextFrame(0);
    } else {
      img.onload = () => {
        if (isMounted) scheduleNextFrame(0);
      };
      img.onerror = () => {
        if (isMounted) scheduleNextFrame(0);
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
    <div className={`relative flex items-center justify-center aspect-[563/1000] ${className}`}>
      {/* Hidden image element to guarantee GPU texture decoding is retained */}
      <img
        src="/no_one_guessed_2.webp"
        alt=""
        className="hidden"
        aria-hidden="true"
        decoding="sync"
      />
      {/* Contact shadow */}
      <div
        className="absolute bg-slate-800/25 rounded-[100%] blur-[0.5px] pointer-events-none z-0"
        style={{
          left: '20%',
          width: '60%',
          bottom: '0.2%',
          height: '3.5%',
        }}
        aria-hidden="true"
      />
      <div
        className="w-full h-full aspect-[563/1000] bg-no-repeat pointer-events-none select-none relative z-10"
        style={{
          backgroundImage: `url('/no_one_guessed_2.webp')`,
          backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
          backgroundPosition: `${posX.toFixed(4)}% ${posY.toFixed(4)}%`,
        }}
        role="img"
        aria-label="No one guessed alternate animation"
      />
    </div>
  );
};

export default NoOneGuessed2Sprite;
