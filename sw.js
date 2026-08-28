// Bump this whenever the cached app-shell files should be invalidated.
const CACHE_NAME = "rrrj-v3";
const APP_SHELL = ["./", "./index.html", "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first for same-origin GET requests: always serve the latest app
// when online, cache each response for offline fallback, and never touch
// cross-origin requests (Supabase auth/data, Google Fonts, the supabase-js
// CDN script) so those always go straight to the network.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req, { cache: "no-store" })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});

// Bill reminders (Web Push). The send-bill-reminders edge function posts a
// JSON payload { title, body, billId } -- title/body are pre-localized
// server-side (Thai, the app's default; there's no stored per-user
// language preference to pick from server-side today), billId is used
// only for the deep link below, never shown.
self.addEventListener("push", (event) => {
  let payload = { title: "รายการที่ต้องจ่าย", body: "" };
  try { if (event.data) payload = event.data.json(); } catch (e) { /* fall back to the default above */ }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      data: { billId: payload.billId || null },
      tag: payload.billId ? "bill-" + payload.billId : undefined
    })
  );
});

// Deep-links into the app's Settings > Bills section, and straight into
// that specific bill's edit form when a client is already loaded and has
// synced far enough to have it locally (see main.js's `?bill=` handling
// for the other half of this). Reuses an already-open tab (focus) rather
// than always opening a new one, matching how most installed PWAs behave.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const billId = event.notification.data && event.notification.data.billId;
  const targetPath = billId ? ("./?bill=" + encodeURIComponent(billId)) : "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetPath);
          return client.focus();
        }
      }
      return clients.openWindow(targetPath);
    })
  );
});
