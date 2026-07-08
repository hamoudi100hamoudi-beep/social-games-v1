const fs = require('fs');
const file = 'src/components/GameRoom.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `        mapped.sort((a, b) => {
          // If points are different, sort by points descending
          if (b.points !== a.points) {
            return b.points - a.points;
          }
          // If points are identical (such as a round-end score reset or tie), preserve their previous ranking order
          const indexA = prevPlayers.findIndex((p) => p.id === a.id);
          const indexB = prevPlayers.findIndex((p) => p.id === b.id);`;

const replacement = `        mapped.sort((a, b) => {
          // If points are different, sort by points descending
          if (b.points !== a.points) {
            return b.points - a.points;
          }
          
          // If points are identical and > 0, use the exact same tie-breaker as the server
          // (which is the join order, reflected by their index in state.players)
          if (b.points > 0) {
            const indexA_server = state.players.findIndex((p) => p.id === a.id);
            const indexB_server = state.players.findIndex((p) => p.id === b.id);
            return indexA_server - indexB_server;
          }

          // If points are identical (such as a round-end score reset or tie), preserve their previous ranking order
          const indexA = prevPlayers.findIndex((p) => p.id === a.id);
          const indexB = prevPlayers.findIndex((p) => p.id === b.id);`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Patched successfully");
} else {
    console.log("Target not found");
}
