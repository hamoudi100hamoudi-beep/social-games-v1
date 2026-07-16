const fs = require('fs');

let content = fs.readFileSync('server/rooms.ts', 'utf8');

const addLogic = `      if (!room.gameState.turnQueue.includes(pId)) {
        room.gameState.turnQueue.push(pId);
      }
    }`;

const newAddLogic = `      if (!room.gameState.turnQueue.includes(pId)) {
        room.gameState.turnQueue.push(pId);
      }
      this.broadcastMessage(room, {
        id: "sys-join-" + Date.now().toString() + Math.random().toString(36).substr(2, 5),
        text: \`\${player.name} انضم إلى اللعبة\`,
        type: "system",
        subType: "join",
        color: "#00E540"
      });
    }`;

content = content.replace(addLogic, newAddLogic);

const removeLogic = `        if (player) {
          player.roomId = null;
        }`;

const newRemoveLogic = `        if (player) {
          player.roomId = null;
          this.broadcastMessage(room, {
            id: "sys-leave-" + Date.now().toString() + Math.random().toString(36).substr(2, 5),
            text: \`\${player.name} غادر اللعبة\`,
            type: "system",
            subType: "leave",
            color: "#EF4444"
          });
        }`;

content = content.replace(removeLogic, newRemoveLogic);

fs.writeFileSync('server/rooms.ts', content);
