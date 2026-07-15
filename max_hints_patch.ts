export function getMaxHints(word: string): number {
  const words = word.split(" ").filter((w) => w.length > 0);
  if (words.length <= 1) {
    const charCount = word.replace(/\s/g, "").length;
    let max = charCount < 3 ? 1 : 2;
    if (charCount >= 5) max = 3;
    return max;
  }
  let max = 1;
  for (const w of words) {
    if (w.length >= 5) max += 2;
    else if (w.length >= 3) max += 1;
  }
  return max;
}
