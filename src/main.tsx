import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './components/index.css';
import { SocketProvider } from './components/SocketProvider.tsx';

// Register Service Worker for PWA (Browser Installability)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
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

