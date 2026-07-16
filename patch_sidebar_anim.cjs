const fs = require('fs');

let content = fs.readFileSync('src/components/game/PlayersSidebar.tsx', 'utf8');

const target = `className={\`absolute inset-x-0 flex items-center pl-1.5 pr-1 py-1.5 sm:pl-3 sm:pr-2.5 sm:py-3 overflow-visible \${bgClass} \${!slot.isEmpty ? 'cursor-pointer hover:bg-white/5 active:bg-white/10' : ''}\`}`;
const replacement = `className={\`absolute inset-x-0 flex items-center pl-1.5 pr-1 py-1.5 sm:pl-3 sm:pr-2.5 sm:py-3 overflow-visible \${bgClass} \${!slot.isEmpty ? 'cursor-pointer hover:bg-white/5 active:bg-white/10 animate-avatar-pop' : ''}\`}`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync('src/components/game/PlayersSidebar.tsx', content);
  console.log("Patched successfully");
} else {
  console.log("Target string not found in PlayersSidebar.tsx");
}
