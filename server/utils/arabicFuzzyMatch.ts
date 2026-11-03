export function getLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function normalizeArabic(str: string): string {
  return str
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F]/g, "") // remove Arabic tashkeel (diacritics)
    .trim()
    .toLowerCase();
}

export function isCloseGuess(guess: string, target: string): boolean {
  const gOrig = guess.toLowerCase().trim();
  const tOrig = target.toLowerCase().trim();

  if (!gOrig || !tOrig) return false;
  if (gOrig === tOrig) return false;

  // Compare normalized versions
  const gNorm = normalizeArabic(gOrig);
  const tNorm = normalizeArabic(tOrig);

  if (gNorm === tNorm) {
    // Under normalization they match perfectly - this is definitely very close!
    return true;
  }

  const len = Math.max(gNorm.length, tNorm.length);
  const dist = getLevenshteinDistance(gNorm, tNorm);

  if (len <= 2) {
    return false;
  } else if (len <= 4) {
    return dist === 1;
  } else if (len <= 7) {
    return dist <= 2; // threshold of 1 or 2
  } else {
    // For length > 7, distance <= 3 or <= 30% of the word length
    return dist <= 3 || dist / len <= 0.3;
  }
}
