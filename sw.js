
const CACHE_NAME = 'friends-snake-v1';
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon.png'
];

self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => { if (k !== CACHE_NAME) return caches.delete(k); })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', evt => {
  evt.respondWith(
    caches.match(evt.request).then(resp => {
      return resp || fetch(evt.request).then(fetchResp => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(evt.request, fetchResp.clone());
          return fetchResp;
        });
      }).catch(()=> caches.match('/index.html'));
    })
  );
});
