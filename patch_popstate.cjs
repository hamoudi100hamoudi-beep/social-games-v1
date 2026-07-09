const fs = require('fs');
const file = 'src/components/GameRoom.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `  useEffect(() => {
    if (typeof window === "undefined") return;

    // Push an initial state to trap the back button
    window.history.pushState(null, "", window.location.href);

    const handlePopState = (e: PopStateEvent) => {
      // Push another state immediately to replace the one we just popped
      window.history.pushState(null, "", window.location.href);`;

const replacement = `  useEffect(() => {
    if (typeof window === "undefined") return;

    // Push an initial state to trap the back button
    // We append a hash to ensure the browser registers a distinct history entry
    if (!window.location.hash.includes("game")) {
      window.history.pushState(null, "", window.location.pathname + window.location.search + "#game");
    }

    const handlePopState = (e: PopStateEvent) => {
      // The user pressed back, which popped the "#game" hash.
      // We immediately push it back to trap the NEXT back press.
      window.history.pushState(null, "", window.location.pathname + window.location.search + "#game");`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Patched successfully");
} else {
    console.log("Target not found");
}
