import React, { useEffect, useState, useRef } from "react";

interface NoOneGuessed2SpriteProps {
  className?: string;
}

const COLS = 4;
const ROWS = 7;

interface AnimationStep {
  frame: number;
  delay: number;
}

// Total 27 frames: Frame 1 (index 0) to Frame 27 (index 26)
// Grid: 4 columns x 7 rows = 28 cells (index 26 is the 27th frame, cell 28 is empty)
const ANIMATION_SEQUENCE: AnimationStep[] = [
  // 1. التوقف عند الإطار الأول نصف ثانية (500ms)
  { frame: 0, delay: 500 },

  // 2. الرمشة الأولى: التحرك للإطار 3 (index 2) والعودة للإطار الأول
  { frame: 1, delay: 75 },
  { frame: 2, delay: 80 }, // الإطار 3 (إغلاق العينين)
  { frame: 1, delay: 75 },
  // التوقف عند الإطار الأول نصف ثانية (500ms)
  { frame: 0, delay: 500 },

  // 3. الرمشة الثانية: نتقدم مرة أخرى للإطار 3 ونعود للإطار 1
  { frame: 1, delay: 75 },
  { frame: 2, delay: 80 }, // الإطار 3 (إغلاق العينين)
  { frame: 1, delay: 75 },
  // التوقف عند الإطار الأول ثانية كاملة (1000ms)
  { frame: 0, delay: 1000 },

  // 4. تشغيل بقية الإطارات للأنيميشن الأساسي وصولاً إلى الإطار الـ 27 والتجمد عنده
  ...Array.from({ length: 26 }, (_, i) => {
    const f = i + 1; // من الإطار 2 (index 1) إلى الإطار 27 (index 26)
    const delay = f === 12 ? 500 : 100; // الإطار 13 (index 12): وقفة 500ms بعد الالتفات
    return { frame: f, delay };
  }),
];

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

    const playStep = (stepIndex: number) => {
      // Reached the final step (frame 26) - freeze at the end
      if (stepIndex >= ANIMATION_SEQUENCE.length - 1) {
        return;
      }

      const currentStep = ANIMATION_SEQUENCE[stepIndex];
      timerRef.current = setTimeout(() => {
        if (!isMounted) return;
        const nextStepIndex = stepIndex + 1;
        setFrameIndex(ANIMATION_SEQUENCE[nextStepIndex].frame);
        playStep(nextStepIndex);
      }, currentStep.delay);
    };

    const img = new Image();
    img.src = "/no_one_guessed_2.webp";
    if (img.complete) {
      playStep(0);
    } else {
      img.onload = () => {
        if (isMounted) playStep(0);
      };
      img.onerror = () => {
        if (isMounted) playStep(0);
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
