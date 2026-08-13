import React, { useEffect, useState, useRef } from "react";

interface AllGuessedSpriteProps {
  className?: string;
  mode?: "all_guessed" | "no_one_guessed" | "success" | "failed";
}

const COLS = 5;
const ROWS = 7;

// Success sequence (Everyone guessed):
const SUCCESS_SEQUENCE: { frame: number; delay: number }[] = [
  // 1 to 6 (0 -> 5)
  { frame: 0, delay: 120 },
  { frame: 1, delay: 120 },
  { frame: 2, delay: 120 },
  { frame: 3, delay: 120 },
  { frame: 4, delay: 120 },
  { frame: 5, delay: 120 },
  // 6 back to 1 (4 -> 0)
  { frame: 4, delay: 120 },
  { frame: 3, delay: 120 },
  { frame: 2, delay: 120 },
  { frame: 1, delay: 120 },
  { frame: 0, delay: 120 },
  // 1 to 6 again (1 -> 5)
  { frame: 1, delay: 120 },
  { frame: 2, delay: 120 },
  { frame: 3, delay: 120 },
  { frame: 4, delay: 120 },
  { frame: 5, delay: 120 },
  // 6 back to 1 again (4 -> 0)
  { frame: 4, delay: 120 },
  { frame: 3, delay: 120 },
  { frame: 2, delay: 120 },
  { frame: 1, delay: 120 },
  { frame: 0, delay: 120 },
  // Turn to camera: 1 to 10 (1 -> 9), pause at frame 10 (index 9) for 520ms
  { frame: 1, delay: 120 },
  { frame: 2, delay: 120 },
  { frame: 3, delay: 120 },
  { frame: 4, delay: 120 },
  { frame: 5, delay: 120 },
  { frame: 6, delay: 120 },
  { frame: 7, delay: 120 },
  { frame: 8, delay: 120 },
  { frame: 9, delay: 520 }, // Frame 10 (index 9) pause 520ms
  // Thumbs up / interaction: 11 to 16 (10 -> 15), pause at frame 16 (index 15) for 720ms
  { frame: 10, delay: 120 },
  { frame: 11, delay: 120 },
  { frame: 12, delay: 120 },
  { frame: 13, delay: 120 },
  { frame: 14, delay: 120 },
  { frame: 15, delay: 720 }, // Frame 16 (index 15) pause 720ms
  // End sequence: 17 to 22 (16 -> 21), final hold at frame 22 (index 21)
  { frame: 16, delay: 120 },
  { frame: 17, delay: 120 },
  { frame: 18, delay: 120 },
  { frame: 19, delay: 120 },
  { frame: 20, delay: 120 },
  { frame: 21, delay: Infinity }, // Frame 22 (index 21) hold final pose
];

// No-one guessed sequence (Failed / Disappointment):
const FAILED_INTRO_SEQUENCE: { frame: number; delay: number }[] = [
  // 1 to 6 (0 -> 5)
  { frame: 0, delay: 120 },
  { frame: 1, delay: 120 },
  { frame: 2, delay: 120 },
  { frame: 3, delay: 120 },
  { frame: 4, delay: 120 },
  { frame: 5, delay: 120 },
  // 6 back to 1 (4 -> 0)
  { frame: 4, delay: 120 },
  { frame: 3, delay: 120 },
  { frame: 2, delay: 120 },
  { frame: 1, delay: 120 },
  { frame: 0, delay: 120 },
  // 1 to 6 again (1 -> 5)
  { frame: 1, delay: 120 },
  { frame: 2, delay: 120 },
  { frame: 3, delay: 120 },
  { frame: 4, delay: 120 },
  { frame: 5, delay: 120 },
  // 6 back to 1 again (4 -> 0)
  { frame: 4, delay: 120 },
  { frame: 3, delay: 120 },
  { frame: 2, delay: 120 },
  { frame: 1, delay: 120 },
  { frame: 0, delay: 120 },
  // Turn to camera: 1 to 10 (1 -> 9), pause at frame 10 (index 9) for 520ms
  { frame: 1, delay: 120 },
  { frame: 2, delay: 120 },
  { frame: 3, delay: 120 },
  { frame: 4, delay: 120 },
  { frame: 5, delay: 120 },
  { frame: 6, delay: 120 },
  { frame: 7, delay: 120 },
  { frame: 8, delay: 120 },
  { frame: 9, delay: 520 }, // Frame 10 (index 9)
  // 11 to 16 (10 -> 15)
  { frame: 10, delay: 120 },
  { frame: 11, delay: 120 },
  { frame: 12, delay: 120 },
  { frame: 13, delay: 120 },
  { frame: 14, delay: 120 },
  { frame: 15, delay: 120 }, // Frame 16 (index 15)
  // Jump directly from frame 16 to frame 23 (index 22) -> 27 (index 26) with 320ms pause
  { frame: 22, delay: 120 }, // Frame 23
  { frame: 23, delay: 120 }, // Frame 24
  { frame: 24, delay: 120 }, // Frame 25
  { frame: 25, delay: 120 }, // Frame 26
  { frame: 26, delay: 320 }, // Frame 27 (index 26) - delay 320ms
  // 28 to 31 (27 -> 30) with 420ms pause
  { frame: 27, delay: 120 }, // Frame 28
  { frame: 28, delay: 120 }, // Frame 29
  { frame: 29, delay: 120 }, // Frame 30
  { frame: 30, delay: 420 }, // Frame 31 (index 30) - delay 420ms
  // 32 to 35 (31 -> 34) with 720ms pause
  { frame: 31, delay: 120 }, // Frame 32
  { frame: 32, delay: 120 }, // Frame 33
  { frame: 33, delay: 120 }, // Frame 34
  { frame: 34, delay: 720 }, // Frame 35 (index 34) - delay 720ms
];

// Loop between frame 31 and 35 (indices 30 to 34):
const FAILED_LOOP_SEQUENCE: { frame: number; delay: number }[] = [
  // Backward from 35 to 31
  { frame: 33, delay: 120 }, // Frame 34
  { frame: 32, delay: 120 }, // Frame 33
  { frame: 31, delay: 120 }, // Frame 32
  { frame: 30, delay: 420 }, // Frame 31 - delay 420ms
  // Forward from 31 to 35
  { frame: 31, delay: 120 }, // Frame 32
  { frame: 32, delay: 120 }, // Frame 33
  { frame: 33, delay: 120 }, // Frame 34
  { frame: 34, delay: 720 }, // Frame 35 - delay 720ms
];

export const AllGuessedSprite: React.FC<AllGuessedSpriteProps> = ({
  className = "",
  mode = "all_guessed",
}) => {
  const isFailedMode = mode === "no_one_guessed" || mode === "failed";
  const [currentFrame, setCurrentFrame] = useState(0);
  const stepRef = useRef(0);
  const inLoopRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;
    stepRef.current = 0;
    inLoopRef.current = false;

    const runStep = () => {
      if (!isMounted) return;

      if (!isFailedMode) {
        // Success Mode Execution
        const currentStep = stepRef.current;
        if (currentStep >= SUCCESS_SEQUENCE.length) return;

        const item = SUCCESS_SEQUENCE[currentStep];
        setCurrentFrame(item.frame);

        if (item.delay === Infinity) return; // Final static hold

        timerRef.current = setTimeout(() => {
          if (!isMounted) return;
          stepRef.current += 1;
          runStep();
        }, item.delay);
      } else {
        // Failed Mode Execution
        if (!inLoopRef.current) {
          const currentStep = stepRef.current;
          if (currentStep < FAILED_INTRO_SEQUENCE.length) {
            const item = FAILED_INTRO_SEQUENCE[currentStep];
            setCurrentFrame(item.frame);

            timerRef.current = setTimeout(() => {
              if (!isMounted) return;
              stepRef.current += 1;
              runStep();
            }, item.delay);
          } else {
            // Intro finished -> start loop
            inLoopRef.current = true;
            stepRef.current = 0;
            runStep();
          }
        } else {
          // Loop phase
          const loopStep = stepRef.current % FAILED_LOOP_SEQUENCE.length;
          const item = FAILED_LOOP_SEQUENCE[loopStep];
          setCurrentFrame(item.frame);

          timerRef.current = setTimeout(() => {
            if (!isMounted) return;
            stepRef.current += 1;
            runStep();
          }, item.delay);
        }
      }
    };

    const img = new Image();
    img.src = '/all_guessed.webp';
    if (img.complete) {
      runStep();
    } else {
      img.onload = () => { if (isMounted) runStep(); };
      img.onerror = () => { if (isMounted) runStep(); };
    }

    return () => {
      isMounted = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isFailedMode]);

  const col = currentFrame % COLS;
  const row = Math.floor(currentFrame / COLS);

  const posX = (col / (COLS - 1)) * 100;
  const posY = (row / (ROWS - 1)) * 100;

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
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
        className="w-full h-full aspect-[2444/2500] bg-no-repeat pointer-events-none select-none relative z-10"
        style={{
          backgroundImage: `url('/all_guessed.webp')`,
          backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
          backgroundPosition: `${posX.toFixed(4)}% ${posY.toFixed(4)}%`,
        }}
        role="img"
        aria-label={isFailedMode ? "No one guessed character animation" : "All guessed character animation"}
      />
    </div>
  );
};

export default AllGuessedSprite;
