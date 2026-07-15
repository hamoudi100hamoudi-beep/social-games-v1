const fs = require('fs');
let content = fs.readFileSync('src/components/GameRoom.tsx', 'utf8');

const oldLogic = `                        const word = gameState.currentWord || "";
                        const charCount = word.replace(/\\s/g, "").length;
                        let maxHints = charCount < 3 ? 1 : 2;
                        if (charCount >= 5) maxHints = 3;
                        return Math.max(0, maxHints - (gameState.hintsUsed || 0));`;

const newLogic = `                        const word = gameState.currentWord || "";
                        const words = word.split(" ").filter((w: string) => w.length > 0);
                        let maxHints = 0;
                        if (words.length <= 1) {
                          const charCount = word.replace(/\\s/g, "").length;
                          maxHints = charCount < 3 ? 1 : 2;
                          if (charCount >= 5) {
                            maxHints = 3;
                          }
                        } else {
                          maxHints = 1;
                          for (const w of words) {
                            if (w.length >= 5) maxHints += 2;
                            else if (w.length >= 3) maxHints += 1;
                          }
                        }
                        return Math.max(0, maxHints - (gameState.hintsUsed || 0));`;

content = content.replace(oldLogic, newLogic);
fs.writeFileSync('src/components/GameRoom.tsx', content);
