const fs = require('fs');

let content = fs.readFileSync('src/components/index.css', 'utf8');

const customAnims = `
@keyframes message-pop-in {
  0% { transform: scale(0.9) translateY(10px); opacity: 0; }
  60% { transform: scale(1.02) translateY(-2px); opacity: 1; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}
.animate-message-pop {
  animation: message-pop-in 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}

@keyframes avatar-scale-in {
  0% { transform: scale(0.5); opacity: 0; }
  60% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.animate-avatar-pop {
  animation: avatar-scale-in 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
`;

content += customAnims;
fs.writeFileSync('src/components/index.css', content);
