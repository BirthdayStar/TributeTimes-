const VERSION = 'tt-pwa-v2-2026-07-09';
const SHELL_CACHE = `${VERSION}-shell`;
const STATIC_CACHE = `${VERSION}-static`;
const IMAGE_CACHE = `${VERSION}-images`;
const PAGE_CACHE = `${VERSION}-pages`;
const MAX_IMAGE_ENTRIES = 24;
const MAX_PAGE_ENTRIES = 12;
const PRECACHE_URLS = [
  '/',
  '/radio',
  '/florist',
  '/public',
  '/offline.html',
  '/manifest.webmanifest',
  '/pwa.css',
  '/pwa.js',
  '/icons/favicon.svg',
  '/icons/favicon-16.png',
  '/icons/favicon-32.png',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/screenshots/home-mobile.png',
  '/screenshots/home-desktop.png',
  '/fonts/Chomsky.otf',
  '/fonts/Poppins-Bold.ttf',
  '/fonts/Poppins-Regular.ttf',
  '/fonts/DejaVuSerif.ttf',
  '/fonts/DejaVuSerif-Bold.ttf',
  '/fonts/DejaVuSerif-Italic.ttf'
];

function shouldBypass(requestUrl) {
  return requestUrl.pathname.startsWith('/api/');
}

function isCacheableResponse(request, response) {
  if (!response || !response.ok) return false;
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType) return false;
  if (request.destination === 'image') return contentType.startsWith('image/');
  if (request.destination === 'script' || request.url.endsWith('.js')) return contentType.includes('javascript');
  if (request.destination === 'style' || request.url.endsWith('.css')) return contentType.includes('text/css');
  if (request.url.endsWith('.webmanifest')) return contentType.includes('manifest') || contentType.includes('json');
  return !contentType.includes('text/html');
}

async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((request) => cache.delete(request)));
}

async function networkOnly(request) {
  return fetch(request);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheableResponse(request, response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then(async (response) => {
      if (isCacheableResponse(request, response)) {
        await cache.put(request, response.clone());
        await trimCache(cacheName, limit);
      }
      return response;
    })
    .catch(() => null);
  return cached || fetchPromise || Response.error();
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
      await trimCache(PAGE_CACHE, MAX_PAGE_ENTRIES);
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await caches.match('/offline.html');
    return offline || Response.error();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(PRECACHE_URLS);
    } catch (error) {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      clients.forEach((client) => client.postMessage({
        type: 'SW_CACHE_ERROR',
        message: String(error && error.message || error)
      }));
      throw error;
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => ![SHELL_CACHE, STATIC_CACHE, IMAGE_CACHE, PAGE_CACHE].includes(key))
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: 'SW_ACTIVATED', version: VERSION }));
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (shouldBypass(requestUrl)) {
    event.respondWith(networkOnly(request));
    return;
  }

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (
    requestUrl.pathname.startsWith('/icons/') ||
    requestUrl.pathname.startsWith('/fonts/') ||
    requestUrl.pathname.endsWith('.css') ||
    requestUrl.pathname.endsWith('.js') ||
    requestUrl.pathname.endsWith('.webmanifest')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE, MAX_IMAGE_ENTRIES));
    return;
  }

  event.respondWith(cacheFirst(request, STATIC_CACHE).catch(() => fetch(request)));
});
