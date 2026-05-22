const fs = require('fs');

let content = fs.readFileSync('src/components/GameRoom.tsx', 'utf8');

const smoothTimerCode = `const SmoothTimer = ({ gameState, maxTime, isFullScreen = false }: { gameState: { status: string, timeLeft: number, currentWord?: string | null }, maxTime: number, isFullScreen?: boolean }) => {
  const barRef = React.useRef<HTMLDivElement>(null);
  const lastTimeLeftRef = React.useRef(gameState.timeLeft);
  const lastUpdateRef = React.useRef(Date.now());
  const statusRef = React.useRef(gameState.status);

  React.useEffect(() => {
    if (gameState.status !== statusRef.current) {
      statusRef.current = gameState.status;
      lastTimeLeftRef.current = gameState.timeLeft;
      lastUpdateRef.current = Date.now();
    } else if (gameState.timeLeft !== lastTimeLeftRef.current) {
      lastTimeLeftRef.current = gameState.timeLeft;
      lastUpdateRef.current = Date.now();
    }
  }, [gameState.timeLeft, gameState.status]);

  React.useEffect(() => {
    let requestId: number;
    const updateTimer = () => {
      const now = Date.now();
      const elapsed = (now - lastUpdateRef.current) / 1000;
      let visualTimeLeft = lastTimeLeftRef.current - elapsed;
      if (visualTimeLeft < 0) visualTimeLeft = 0;
      let pct = (visualTimeLeft / maxTime) * 100;
      pct = Math.max(0, Math.min(100, pct));
      
      if (barRef.current) {
        barRef.current.style.width = \`\${pct}%\`;
        let timerColorClass = 'bg-[#FBBF24] shadow-[0_0_8px_rgba(251,191,36,0.5)]';
        if (gameState.status !== 'DRAWING' && gameState.status !== 'CHOOSING') {
          timerColorClass = 'bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.5)]';
        } else {
          if (pct <= 20) {
            timerColorClass = 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]';
          } else if (pct <= 50) {
            timerColorClass = 'bg-[#F97316] shadow-[0_0_8px_rgba(249,115,22,0.5)]';
          }
        }
        barRef.current.className = \`h-full rounded-full \${timerColorClass}\`;
      }
      
      requestId = requestAnimationFrame(updateTimer);
    };
    requestId = requestAnimationFrame(updateTimer);
    return () => cancelAnimationFrame(requestId);
  }, [maxTime, gameState.status]);

  return (
    <div className={\`w-full px-2 sm:px-3 py-1 shrink-0 flex items-center justify-center \${isFullScreen ? 'bg-transparent' : 'bg-[#1A103C]'}\`} dir="ltr">
        <div className="w-full h-1.5 sm:h-2 bg-[#24174D] rounded-full overflow-hidden shadow-inner flex justify-start">
            <div 
              ref={barRef}
              className="h-full rounded-full bg-[#3b82f6]"
            />
        </div>
    </div>
  );
};
`;

content = content.replace('export default function GameRoom({ nickname, room, onLeave }: GameRoomProps) {', smoothTimerCode + '\nexport default function GameRoom({ nickname, room, onLeave }: GameRoomProps) {');

content = content.replace(/const renderTimerBar = \(isFullScreen: boolean = false\) => \{\s+let timerColorClass = 'bg-\[#FBBF24\] shadow-\[0_0_8px_rgba\(251,191,36,0\.5\)\]';[\s\S]*?<\/[dD]iv>\s+<\/[dD]iv>\s+\);\s+\};/, '');

content = content.replace(/\{renderTimerBar\(\)\}/g, '<SmoothTimer gameState={gameState} maxTime={getMaxTime()} isFullScreen={false} />');
content = content.replace(/renderTimerBar\(true\)/g, '<SmoothTimer gameState={gameState} maxTime={getMaxTime()} isFullScreen={true} />');

fs.writeFileSync('src/components/GameRoom.tsx', content);
