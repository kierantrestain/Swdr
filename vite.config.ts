import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

function offlineShell(): Plugin {
  return {
    name: 'swdr-offline-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(name => /\.(?:css|js|woff2)$/.test(name)).sort();
      const version = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 16);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const CURRENT = 'swdr-app-${version}';
const SHELL = new URL('index.html', self.registration.scope).href;
const FILES = new Set(${JSON.stringify(['index.html', 'manifest.webmanifest', 'swdr-192.png', 'swdr-512.png', ...assets])}.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CURRENT).then(cache => cache.addAll([...FILES])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('swdr-app-') && key !== CURRENT)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/team')) {
    event.respondWith(fetch(request).catch(async () => (await caches.open(CURRENT)).match(SHELL)));
  } else if (FILES.has(url.href)) {
    event.respondWith(caches.open(CURRENT).then(async cache => (await cache.match(request)) || fetch(request)));
  }
});
`
      });
    }
  };
}

export default defineConfig({
  plugins: [offlineShell()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/[/]node_modules[/](react|react-dom|scheduler)[/]/.test(id)) return 'react';
          if (/[/]node_modules[/](fflate|yaml)[/]/.test(id)) return 'formats';
        }
      }
    }
  }
});
