/**
 * Free Draw Mobile Debug - Eruda Lifecycle & Settings Manager
 * 
 * Provides on-demand, dynamic loading of Eruda mobile console for Free Draw debugging.
 * Eruda is NEVER imported or loaded in regular user sessions.
 */

import type erudaType from 'eruda';

let erudaInstance: typeof erudaType | null = null;
let initPromise: Promise<typeof erudaType | null> | null = null;
let isInitialized = false;

/**
 * Checks if Mobile Debug mode is active via URL param (?fddebug=1 or &fddebug=1)
 * or via localStorage ('freedraw_mobile_debug' === '1').
 */
export const isMobileDebugActive = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('fddebug') === '1') {
      localStorage.setItem('freedraw_mobile_debug', '1');
      return true;
    }

    if (window.location.hash) {
      const hashStr = window.location.hash;
      const qIndex = hashStr.indexOf('?');
      if (qIndex !== -1) {
        const hashParams = new URLSearchParams(hashStr.slice(qIndex));
        if (hashParams.get('fddebug') === '1') {
          localStorage.setItem('freedraw_mobile_debug', '1');
          return true;
        }
      }
      if (hashStr.includes('fddebug=1')) {
        localStorage.setItem('freedraw_mobile_debug', '1');
        return true;
      }
    }

    return localStorage.getItem('freedraw_mobile_debug') === '1';
  } catch (e) {
    return false;
  }
};

/**
 * Disables Mobile Debug mode, cleans up localStorage, removes URL param,
 * and destroys Eruda if active.
 */
export const disableMobileDebug = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('freedraw_mobile_debug');
    const url = new URL(window.location.href);
    if (url.searchParams.has('fddebug')) {
      url.searchParams.delete('fddebug');
    }
    let cleanHash = url.hash;
    if (cleanHash && cleanHash.includes('fddebug=1')) {
      cleanHash = cleanHash.replace(/[?&]fddebug=1/, '').replace(/#$/, '');
    }
    const cleanUrl = url.pathname + (url.search ? url.search : '') + cleanHash;
    window.history.replaceState({}, document.title, cleanUrl);
  } catch (e) {}
  destroyEruda();
};

/**
 * Dynamically loads and initializes Eruda only when Mobile Debug is active.
 * Guarantees a single instance with zero redundant initializations.
 */
export const getOrInitEruda = async (): Promise<typeof erudaType | null> => {
  if (typeof window === 'undefined') return null;
  if (!isMobileDebugActive()) return null;

  if (isInitialized && erudaInstance) {
    return erudaInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      // Dynamic import: Vite automatically code-splits Eruda into a separate chunk
      const mod = await import('eruda');
      const eruda = ((mod as any).default || mod) as typeof erudaType;

      // Check if already in DOM
      const existingContainer = document.getElementById('eruda');
      if (!isInitialized || !existingContainer) {
        eruda.init({
          tool: ['console', 'network', 'elements', 'resources', 'info'],
          autoScale: true,
          useShadowDom: true
        });
        isInitialized = true;
      }
      erudaInstance = eruda;
      return eruda;
    } catch (err) {
      console.error('[FreeDrawMobileDebug] Failed to load Eruda:', err);
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
};

/**
 * Opens Eruda Console window.
 */
export const showEruda = async () => {
  const eruda = await getOrInitEruda();
  if (eruda) {
    try {
      eruda.show();
    } catch (e) {}
  }
};

/**
 * Hides Eruda Console window.
 */
export const hideEruda = () => {
  if (erudaInstance) {
    try {
      erudaInstance.hide();
    } catch (e) {}
  }
};

/**
 * Destroys Eruda instance and completely removes its DOM container.
 */
export const destroyEruda = () => {
  if (erudaInstance) {
    try {
      erudaInstance.destroy();
    } catch (e) {}
    erudaInstance = null;
    isInitialized = false;
  }
  if (typeof document !== 'undefined') {
    const el = document.getElementById('eruda');
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }
};
