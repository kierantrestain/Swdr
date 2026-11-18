import { createRoot } from 'react-dom/client';
// Astryx cascade: reset (@layer reset) → components (@layer astryx-base) → theme tokens (@layer astryx-theme).
// index.html declares the full layer order first so SWDR's element defaults (@layer swdr-base) sit beneath the components.
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import { App } from './App';
import { ErrorBoundary } from './shell/ErrorBoundary';
import { finishOpenRouter } from './ai/byok';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('SWDR could not open its workspace.');
// App wraps itself in the SWDR Astryx theme (src/astryx-themes.ts) so it can switch light and dark.
createRoot(root).render(<ErrorBoundary><App /></ErrorBoundary>);

// Finish connecting an OpenRouter account when this page is its sign-in callback.
void finishOpenRouter();

// Ask the browser to keep SWDR's storage under pressure instead of clearing it, so local projects survive.
void navigator.storage?.persist?.().catch(() => undefined);

if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  void navigator.serviceWorker.register('/sw.js').catch(() => {
    // IndexedDB remains available if the browser cannot cache the application shell.
  });
}
