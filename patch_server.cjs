const fs = require('fs');

let content = fs.readFileSync('server/rooms.ts', 'utf8');

const maxHintsLogic = `
    const words = word.split(" ").filter(w => w.length > 0);
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
`;

const oldLogic = `    const charCount = word.replace(/\\s/g, "").length;
    let maxHints = charCount < 3 ? 1 : 2;
    if (charCount >= 5) {
      maxHints = 3;
    }`;

content = content.replaceAll(oldLogic, maxHintsLogic.trim());

const isRtlLogic = `      const isRTL = /[\\u0600-\\u06FF]/.test(word);
      const { drawHistory, ...publicGameState } = room.gameState;`;

const oldIsRtlLogic = `      const { drawHistory, ...publicGameState } = room.gameState;`;

content = content.replace(oldIsRtlLogic, isRtlLogic);

const isRtlEmitLogic = `          maskedWordArray: maskedWordArray,
          isRTL: isRTL,
        },`;
        
const oldIsRtlEmitLogic = `          maskedWordArray: maskedWordArray,
        },`;

content = content.replace(oldIsRtlEmitLogic, isRtlEmitLogic);

fs.writeFileSync('server/rooms.ts', content);
