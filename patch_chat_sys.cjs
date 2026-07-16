const fs = require('fs');
let content = fs.readFileSync('src/components/game/OverlayChatRoom.tsx', 'utf8');

// The outer div for system messages is `className="flex justify-center mb-2"`
content = content.replace(
  '<div className="flex justify-center mb-2">',
  '<div className="flex justify-center mb-2 animate-message-pop">'
);
content = content.replace(
  '<div className="flex justify-center mb-2">',
  '<div className="flex justify-center mb-2 animate-message-pop">'
);

fs.writeFileSync('src/components/game/OverlayChatRoom.tsx', content);
