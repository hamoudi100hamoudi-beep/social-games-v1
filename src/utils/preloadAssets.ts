// Utility to preload all game sprites and media assets globally
// so that animations and overlay screens appear INSTANTLY with 0ms network latency.

const GAME_ASSETS = [
  '/all_guessed.webp',
  '/turn_lost.webp',
  '/waiting.webp',
  '/trophy.webp',
  '/medal1.webp',
  '/medal2.webp',
  '/medal3.webp',
];

const preloadedSet = new Set<string>();

export function preloadGameSprites(): void {
  if (typeof window === 'undefined') return;

  GAME_ASSETS.forEach((src) => {
    if (!preloadedSet.has(src)) {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        preloadedSet.add(src);
      };
      img.onerror = () => {
        // Retry once on failure
        setTimeout(() => {
          const retryImg = new Image();
          retryImg.src = src;
        }, 1000);
      };
    }
  });
}

export function isAssetPreloaded(src: string): boolean {
  return preloadedSet.has(src);
}
