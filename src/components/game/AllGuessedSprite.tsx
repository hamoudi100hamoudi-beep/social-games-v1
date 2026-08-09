import React, { useEffect, useState, useRef } from "react";

interface AllGuessedSpriteProps {
  className?: string;
}

const COLS = 5;
const ROWS = 5;

// Sequence of steps (0-based frame indices):
// 1. 1 to 6 (0 -> 5)
// 2. 6 to 1 (4 -> 0)
// 3. 1 to 6 (1 -> 5)
// 4. 6 to 1 (4 -> 0)
// 5. 1 to 11 (1 -> 10), pause at frame 11 (index 10) for 500ms (5 frames)
// 6. 12 to 17 (11 -> 16), pause at frame 17 (index 16) for 700ms (7 frames)
// 7. 18 to 23 (17 -> 22), stop at frame 23 (index 22)
const SEQUENCE: { frame: number; delay: number }[] = [
  // 1 to 6
  { frame: 0, delay: 100 },
  { frame: 1, delay: 100 },
  { frame: 2, delay: 100 },
  { frame: 3, delay: 100 },
  { frame: 4, delay: 100 },
  { frame: 5, delay: 100 },
  // 6 back to 1
  { frame: 4, delay: 100 },
  { frame: 3, delay: 100 },
  { frame: 2, delay: 100 },
  { frame: 1, delay: 100 },
  { frame: 0, delay: 100 },
  // 1 to 6 again
  { frame: 1, delay: 100 },
  { frame: 2, delay: 100 },
  { frame: 3, delay: 100 },
  { frame: 4, delay: 100 },
  { frame: 5, delay: 100 },
  // 6 back to 1 again
  { frame: 4, delay: 100 },
  { frame: 3, delay: 100 },
  { frame: 2, delay: 100 },
  { frame: 1, delay: 100 },
  { frame: 0, delay: 100 },
  // 1 to 11
  { frame: 1, delay: 100 },
  { frame: 2, delay: 100 },
  { frame: 3, delay: 100 },
  { frame: 4, delay: 100 },
  { frame: 5, delay: 100 },
  { frame: 6, delay: 100 },
  { frame: 7, delay: 100 },
  { frame: 8, delay: 100 },
  { frame: 9, delay: 100 },
  { frame: 10, delay: 500 }, // Frame 11 (index 10) pause = 5 frames
  // 12 to 17
  { frame: 11, delay: 100 },
  { frame: 12, delay: 100 },
  { frame: 13, delay: 100 },
  { frame: 14, delay: 100 },
  { frame: 15, delay: 100 },
  { frame: 16, delay: 700 }, // Frame 17 (index 16) pause = 7 frames
  // 18 to 23
  { frame: 17, delay: 100 },
  { frame: 18, delay: 100 },
  { frame: 19, delay: 100 },
  { frame: 20, delay: 100 },
  { frame: 21, delay: 100 },
  { frame: 22, delay: Infinity }, // Frame 23 (index 22) final stop
];

export const AllGuessedSprite: React.FC<AllGuessedSpriteProps> = ({ className = "" }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const stepRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    const runStep = () => {
      const currentStep = stepRef.current;
      if (currentStep >= SEQUENCE.length) return;

      const { delay } = SEQUENCE[currentStep];
      if (delay === Infinity) return; // Stop at final frame

      timerRef.current = setTimeout(() => {
        if (!isMounted) return;
        const nextStep = stepRef.current + 1;
        if (nextStep < SEQUENCE.length) {
          stepRef.current = nextStep;
          setStepIndex(nextStep);
          runStep();
        }
      }, delay);
    };

    runStep();

    return () => {
      isMounted = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const currentFrame = SEQUENCE[stepIndex].frame;
  const col = currentFrame % COLS;
  const row = Math.floor(currentFrame / COLS);

  const posX = (col / (COLS - 1)) * 100;
  const posY = (row / (ROWS - 1)) * 100;

  return (
    <div
      className={`aspect-[251/200] bg-no-repeat pointer-events-none select-none ${className}`}
      style={{
        backgroundImage: `url('/all_guessed.webp')`,
        backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
        backgroundPosition: `${posX.toFixed(4)}% ${posY.toFixed(4)}%`,
      }}
      role="img"
      aria-label="All guessed character animation"
    />
  );
};

export default AllGuessedSprite;
