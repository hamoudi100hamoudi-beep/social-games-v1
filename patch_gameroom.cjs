const fs = require('fs');

let content = fs.readFileSync('src/components/GameRoom.tsx', 'utf8');

const oldNonDrawerRTL = `            const fullWordStr = maskedArray
              .map((m: any) => m.char || "")
              .join("");
            const isRTL = /[\\u0600-\\u06FF]/.test(
              fullWordStr || gameState.currentWord || "",
            );`;

const newNonDrawerRTL = `            const isRTL = gameState.isRTL || false;`;

content = content.replace(oldNonDrawerRTL, newNonDrawerRTL);

fs.writeFileSync('src/components/GameRoom.tsx', content);
