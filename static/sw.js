// Service worker: lets the website install as an app, opens instantly,
// shows a friendly screen when there is no internet, and shows plant alerts.
const CACHE = 'sprout-v3';
const SHELL = ['/offline.html', '/icons/icon-192.png', '/icons/icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Live plant data is never cached, so the app never shows old readings as if they were new.
  if (new URL(req.url).pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    // Pages: always try the internet first; without it, show the offline screen.
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  // CSS, JS and icons: internet first (so updates arrive at once), cached copy when offline.
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req)));
});

// A push alert from the server: arrives even when the app is closed.
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (err) { d = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Sprout', {
    body: d.body || '', tag: d.tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
  }));
});

// Tapping a plant alert opens the app (or brings it to the front).
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => new URL(c.url).origin === location.origin);
      return open ? open.focus() : self.clients.openWindow('/');
    }));
});
