// Bump this whenever the cached app-shell files should be invalidated.
// v3: added ./styles.css and ./main.js (the built bundle) to APP_SHELL,
// plus the self-hosted font/icon assets that replaced the Google
// Fonts/Lucide CDN requests -- see index.html and styles.css for why.
// These were missing before: the fetch handler below only caches a
// same-origin GET *after* it's actually been requested once, but the very
// first page load that registers a new service worker isn't controlled by
// it yet (a SW doesn't intercept fetches from clients it doesn't control
// until a later navigation), so styles.css/main.js were never guaranteed
// to be cached even after "installing" the PWA -- go offline before a
// second page load ever happens under an active SW and you'd get an
// unstyled app with empty-circle icons. Precaching them here during
// install (which always runs, regardless of fetch-handler timing) closes
// that gap.
// v4: docs/specs/coral-rebrand-and-logo.md -- icon-192/512.png regenerated
// (new mark + color), manifest.json's theme_color changed, and the new
// self-hosted Poppins font (sidebar wordmark) added to APP_SHELL for the
// same first-load-not-yet-controlled reason v3's comment already covers.
// v5: same spec's follow-up -- manifest.json's theme_color corrected again
// (was briefly the coral accent in v4, which showed up as a coral Android
// status bar; now matches the page background instead, see that spec's
// last section). Content-only change to an already-precached APP_SHELL
// entry, same as v4's own reasoning: a v4 device would otherwise keep
// serving the stale coral manifest.json indefinitely, since the SW only
// re-installs/re-precaches when sw.js's own bytes change, not when a
// precached URL's *content* changes server-side.
const CACHE_NAME = "rrrj-v5";
const APP_SHELL = [
  "./", "./index.html", "./manifest.json", "./styles.css", "./main.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/sprite.svg",
  "./fonts/inter-latin.woff2", "./fonts/notosansthai-thai.woff2", "./fonts/poppins-latin-700.woff2"
];

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
// cross-origin requests (Supabase auth/data, the supabase-js CDN script,
// Google Identity Services) so those always go straight to the network.
// The font and icons used to be cross-origin (Google Fonts, unpkg) too --
// now that they're self-hosted (see index.html/styles.css), they're
// same-origin and get the same caching as everything else here.
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
