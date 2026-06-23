// Safe storage wrapper to prevent crashes in restricted frames (e.g., iframes inside AI Studio)
// that block third-party access to localStorage.

class MemoryStorage {
  private data: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.data.hasOwnProperty(key) ? this.data[key] : null;
  }

  setItem(key: string, value: string): void {
    this.data[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.data[key];
  }

  clear(): void {
    this.data = {};
  }
}

class SafeStorage implements Storage {
  private fallback: MemoryStorage;
  private useFallback: boolean = false;

  constructor() {
    this.fallback = new MemoryStorage();
    if (typeof window === 'undefined') {
      this.useFallback = true;
      return;
    }
    try {
      // Test if localStorage is accessible and doesn't throw
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
    } catch (e) {
      this.useFallback = true;
    }
  }

  get length(): number {
    if (this.useFallback) return 0; // simple fallback
    try {
      return window.localStorage.length;
    } catch {
      return 0;
    }
  }

  clear(): void {
    if (this.useFallback) {
      this.fallback.clear();
      return;
    }
    try {
      window.localStorage.clear();
    } catch {
      this.fallback.clear();
    }
  }

  getItem(key: string): string | null {
    if (this.useFallback) {
      return this.fallback.getItem(key);
    }
    try {
      return window.localStorage.getItem(key);
    } catch {
      return this.fallback.getItem(key);
    }
  }

  key(index: number): string | null {
    if (this.useFallback) return null;
    try {
      return window.localStorage.key(index);
    } catch {
      return null;
    }
  }

  removeItem(key: string): void {
    if (this.useFallback) {
      this.fallback.removeItem(key);
      return;
    }
    try {
      window.localStorage.removeItem(key);
    } catch {
      this.fallback.removeItem(key);
    }
  }

  setItem(key: string, value: string): void {
    if (this.useFallback) {
      this.fallback.setItem(key, value);
      return;
    }
    try {
      window.localStorage.setItem(key, value);
    } catch {
      this.fallback.setItem(key, value);
    }
  }
}

export const safeLocalStorage = new SafeStorage();
