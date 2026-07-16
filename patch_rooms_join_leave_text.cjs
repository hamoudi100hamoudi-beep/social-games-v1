const fs = require('fs');

let content = fs.readFileSync('server/rooms.ts', 'utf8');
content = content.replace('انضم إلى اللعبة', 'انضم للغرفة');
content = content.replace('غادر اللعبة', 'غادر الغرفة');
fs.writeFileSync('server/rooms.ts', content);
