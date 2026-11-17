import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('SWDR could not open its workspace.');
createRoot(root).render(<App />);

if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  void navigator.serviceWorker.register('/sw.js').catch(() => {
    // IndexedDB remains available if the browser cannot cache the application shell.
  });
}
