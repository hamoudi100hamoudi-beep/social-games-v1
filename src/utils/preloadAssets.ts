// Utility to preload all game sprites and media assets globally
// so that animations and overlay screens appear INSTANTLY with 0ms network latency.

const GAME_ASSETS = [
  '/all_guessed.webp',
  '/all_guessed_rare.webp',
  '/no_one_guessed_2.webp',
  '/partial_guessed.webp',
  '/turn_lost.webp',
  '/skipped.webp',
  '/canceled_turn.webp',
  '/afk_warning.webp',
  '/exit.webp',
  '/waiting.webp',
  '/trophy.webp',
  '/medal1.webp',
  '/medal2.webp',
  '/medal3.webp',
];

const preloadedSet = new Set<string>();
const globalPreloadedImages: HTMLImageElement[] = [];

export function preloadGameSprites(): void {
  if (typeof window === 'undefined') return;

  GAME_ASSETS.forEach((src) => {
    if (!preloadedSet.has(src)) {
      const img = new Image();
      img.src = src;
      img.decoding = 'sync';
      globalPreloadedImages.push(img);
      if ('decode' in img && typeof img.decode === 'function') {
        img.decode().then(() => {
          preloadedSet.add(src);
        }).catch(() => {
          preloadedSet.add(src);
        });
      } else {
        img.onload = () => {
          preloadedSet.add(src);
        };
      }
      img.onerror = () => {
        // Retry once on failure
        setTimeout(() => {
          const retryImg = new Image();
          retryImg.src = src;
          retryImg.decoding = 'sync';
          globalPreloadedImages.push(retryImg);
        }, 1000);
      };
    }
  });
}

export function isAssetPreloaded(src: string): boolean {
  return preloadedSet.has(src);
}
