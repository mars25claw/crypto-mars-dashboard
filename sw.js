// ╔══════════════════════════════════════════════╗
// ║  Crypto Mars Service Worker  v7              ║
// ║  Push notifications + no HTML caching        ║
// ╚══════════════════════════════════════════════╝
const CACHE_NAME = 'cm-assets-v7';
const ASSET_EXTS = ['.png','.ico','.webp','.woff','.woff2'];

// ── Install: skip waiting immediately ──────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
});

// ── Activate: clean old caches ─────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: pass HTML/JS/API through, cache only static assets ─────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const ext = url.pathname.split('.').pop();
  if (ASSET_EXTS.includes('.'+ext) && e.request.method === 'GET') {
    e.respondWith(
      caches.open(CACHE_NAME).then(c =>
        c.match(e.request).then(cached => cached || fetch(e.request).then(r => {
          c.put(e.request, r.clone()); return r;
        }))
      )
    );
  }
  // Everything else (HTML, JS, API) → always fetch live
});

// ── Push: show OS notification ─────────────────────────────────────────────
self.addEventListener('push', e => {
  let data = { title: '🪙 Crypto Mars', body: 'New alert', tag: 'cm-default', icon: '/icon-192.png' };
  try {
    if (e.data) {
      const d = e.data.json();
      data = {
        title: d.title || data.title,
        body:  d.body  || data.body,
        tag:   d.tag   || 'cm-' + Date.now(),
        icon:  '/icon-192.png',
        badge: '/icon-192.png',
        data:  { url: d.url || '/' },
        requireInteraction: d.urgent || false,
        vibrate: [200, 100, 200],
        actions: d.urgent ? [
          { action: 'view', title: '📊 View Dashboard' },
          { action: 'dismiss', title: 'Dismiss' }
        ] : []
      };
    }
  } catch(err) {
    if (e.data) data.body = e.data.text();
  }
  e.waitUntil(self.registration.showNotification(data.title, data));
});

// ── Notification click: open dashboard ─────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) ? e.notification.data.url : '/';
  if (e.action === 'dismiss') return;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else self.clients.openWindow(url);
    })
  );
});

// ── Message from page: PING / INIT_NOTIF ───────────────────────────────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'PING') {
    e.source.postMessage({ type: 'PONG', version: 'cm-sw-v7' });
  }
  if (e.data && e.data.type === 'SHOW_NOTIF') {
    const d = e.data;
    self.registration.showNotification(d.title || '🪙 Crypto Mars', {
      body: d.body || '',
      tag:  d.tag  || 'cm-inline-' + Date.now(),
      icon: '/icon-192.png',
      requireInteraction: false,
    });
  }
});
