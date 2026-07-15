const fs = require('fs');

let content = fs.readFileSync('server/rooms.ts', 'utf8');

const oldLogic = `      const unrevealed = [];
      for (let i = 0; i < word.length; i++) {
        if (word[i] !== " " && !room.gameState.revealedIndices.includes(i)) {
          unrevealed.push(i);
        }
      }
      if (unrevealed.length > 0) {
        const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)];
        room.gameState.revealedIndices.push(pick);
      }`;

const newLogic = `      const validIndices = [];
      const wordsArray = word.split(" ");
      let charIndex = 0;
      
      for (let w = 0; w < wordsArray.length; w++) {
        const wStr = wordsArray[w];
        if (wStr.length === 0) {
          charIndex++;
          continue;
        }
        
        let limit = 0;
        if (wStr.length >= 5) limit = 2;
        else if (wStr.length >= 3) limit = 1;
        
        const wordIndices = [];
        for (let i = 0; i < wStr.length; i++) {
           wordIndices.push(charIndex + i);
        }
        charIndex += wStr.length + 1;
        
        const revealedInWord = wordIndices.filter(idx => room.gameState.revealedIndices.includes(idx)).length;
        
        if (revealedInWord < limit) {
           const unrevealedInWord = wordIndices.filter(idx => !room.gameState.revealedIndices.includes(idx));
           validIndices.push(...unrevealedInWord);
        }
      }

      if (validIndices.length > 0) {
        const pick = validIndices[Math.floor(Math.random() * validIndices.length)];
        room.gameState.revealedIndices.push(pick);
      } else {
        const unrevealed = [];
        for (let i = 0; i < word.length; i++) {
          if (word[i] !== " " && !room.gameState.revealedIndices.includes(i)) {
            unrevealed.push(i);
          }
        }
        if (unrevealed.length > 0) {
          const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)];
          room.gameState.revealedIndices.push(pick);
        }
      }`;

content = content.replace(oldLogic, newLogic);
fs.writeFileSync('server/rooms.ts', content);
