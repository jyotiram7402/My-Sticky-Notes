/* My Sticky Notes service worker (hand-written, no plugin).
 *
 * - Cache-first for /_next/static/ (hashed, never changes) and the app icons.
 * - Network-first for page navigations; when offline, the cached app shell ("/") is served.
 * - /api/ is never cached: notes live in localStorage and sync through the API.
 *
 * Bump VERSION whenever this file changes; old caches are deleted on activate.
 */
const VERSION = "v1";
const STATIC_CACHE = `msn-static-${VERSION}`;
const PAGE_CACHE = `msn-pages-${VERSION}`;
const APP_SHELL = "/";
const ICONS = ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png"];
const MAX_STATIC_ENTRIES = 200;

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#F5F5F2">
<title>Offline · My Sticky Notes</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #F5F5F2; color: #111111; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 22rem; padding: 24px; text-align: center; }
  h1 { font-size: 24px; font-weight: 500; letter-spacing: -0.02em; margin: 16px 0 8px; }
  p { margin: 0 0 20px; color: #6B6B6B; }
  button { height: 48px; padding: 0 24px; border: 0; border-radius: 999px; background: #000000; color: #FFFFFF;
           font: inherit; font-weight: 600; cursor: pointer; }
  .logo { width: 56px; height: 56px; border-radius: 14px; background: #FF9A3C; margin: 0 auto; }
</style>
</head>
<body>
<main>
  <div class="logo" aria-hidden="true"></div>
  <h1>You're offline</h1>
  <p>Open the app once while online and it will work offline after that.</p>
  <button type="button" onclick="location.reload()">Try again</button>
</main>
</body>
</html>`;

function isCacheablePage(response) {
  if (!response || !response.ok || response.status !== 200) return false;
  if (response.redirected || response.type !== "basic") return false;
  const type = response.headers.get("content-type") || "";
  return type.includes("text/html");
}

function isIconPath(pathname) {
  return (
    pathname.startsWith("/icons/") ||
    pathname === "/icon" ||
    pathname.startsWith("/icon/") ||
    pathname === "/apple-icon" ||
    pathname.startsWith("/apple-icon/")
  );
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

/** Caches the signed-in app shell and the static files it references, so offline works after one visit. */
async function precacheShell() {
  const response = await fetch(APP_SHELL, { credentials: "same-origin", cache: "no-store" });
  if (!isCacheablePage(response)) return; // e.g. redirected to /login: never cached
  const html = await response.clone().text();
  const pages = await caches.open(PAGE_CACHE);
  await pages.put(APP_SHELL, response);
  const assets = Array.from(new Set(html.match(/\/_next\/static\/[^"'\\\s)<>]+/g) || []));
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    assets.map((asset) =>
      cache
        .match(asset)
        .then((hit) => hit || cache.add(asset))
        .catch(() => undefined),
    ),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(ICONS.map((url) => cache.add(url).catch(() => undefined)));
      try {
        await precacheShell();
      } catch (error) {
        // Offline during install: the shell is cached on the next online visit.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGE_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith("msn-") && !keep.has(name)).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

async function networkFirstPage(event) {
  const request = event.request;
  try {
    const response = await fetch(request);
    const url = new URL(request.url);
    if (url.pathname === APP_SHELL && isCacheablePage(response)) {
      const copy = response.clone();
      event.waitUntil(
        caches
          .open(PAGE_CACHE)
          .then((cache) => cache.put(APP_SHELL, copy))
          .catch(() => undefined),
      );
    }
    return response;
  } catch (error) {
    const cache = await caches.open(PAGE_CACHE);
    const shell = await cache.match(APP_SHELL);
    if (shell) return shell;
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const copy = response.clone();
    cache
      .put(request, copy)
      .then(() => trimCache(cache, MAX_STATIC_ENTRIES))
      .catch(() => undefined);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache the API

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(event));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || isIconPath(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
