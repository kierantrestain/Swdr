import { createRoot } from 'react-dom/client';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
// Astryx cascade: reset (@layer reset) → components (@layer astryx-base) → theme tokens (@layer astryx-theme).
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('SWDR could not open its workspace.');
createRoot(root).render(<Theme theme={neutralTheme}><App /></Theme>);

if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  void navigator.serviceWorker.register('/sw.js').catch(() => {
    // IndexedDB remains available if the browser cannot cache the application shell.
  });
}
