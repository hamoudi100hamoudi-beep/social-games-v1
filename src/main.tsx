import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './components/index.css';
import { SocketProvider } from './components/SocketProvider.tsx';

// Register Service Worker for PWA (Browser Installability)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const isProd = (import.meta as any).env?.PROD;
  if (!isProd) {
    // In development mode, aggressively unregister any existing service worker to prevent
    // stale caching of React and Vite assets (which cause the "Invalid hook call" or blank screen error)
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      let hasUnregistered = false;
      for (const registration of registrations) {
        registration.unregister().then((success) => {
          if (success) {
            console.log('[PWA] Unregistered stale development service worker:', registration.scope);
            hasUnregistered = true;
          }
        });
      }
      // If we found and unregistered a service worker, clear caches and reload to get fresh code
      if (registrations.length > 0) {
        if (typeof caches !== 'undefined') {
          caches.keys().then((keys) => {
            keys.forEach((key) => caches.delete(key));
          });
        }
        setTimeout(() => {
          window.location.reload();
        }, 100);
      }
    });
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registered with scope:', reg.scope);
        })
        .catch((err) => {
          console.error('[PWA] Service Worker registration failed:', err);
        });
    });
  }
}

// Programmatic Screen Orientation Locking (Compliments standard manifest.json portrait configuration)
if (typeof window !== 'undefined' && window.screen && window.screen.orientation && (window.screen.orientation as any).lock) {
  const lockPortrait = () => {
    try {
      ((window.screen.orientation as any).lock)('portrait')
        .then(() => console.log('[PWA] Screen orientation locked to portrait successfully.'))
        .catch((err: any) => console.log('[PWA] Orientation lock status:', err.message || err));
    } catch (err) {
      // Ignored for environments where screen API is partially implemented or under restrictive frames
    }
  };
  window.addEventListener('load', lockPortrait);
  lockPortrait();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SocketProvider>
      <App />
    </SocketProvider>
  </StrictMode>,
);

