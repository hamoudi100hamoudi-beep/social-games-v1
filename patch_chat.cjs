const fs = require('fs');

let content = fs.readFileSync('src/components/game/OverlayChatRoom.tsx', 'utf8');

content = content.replaceAll("animate-in slide-in-from-bottom-2", "animate-message-pop");

fs.writeFileSync('src/components/game/OverlayChatRoom.tsx', content);
