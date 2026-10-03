const CACHE_NAME = "neko-nap-offline-v2";
const APP_ROOT = new URL("./", self.location.href).pathname;
const appUrl = (path = "") => `${APP_ROOT}${path}`;
const CORE_URLS = [
  appUrl(),
  appUrl("manifest.webmanifest"),
  appUrl("favicon.ico"),
  appUrl("favicon.png"),
  appUrl("icons/apple-touch-icon.png"),
  appUrl("icons/icon-192.png"),
  appUrl("icons/icon-512.png"),
  appUrl("icons/icon-maskable-512.png"),
  appUrl("assets/neko-nap-cat.png"),
  appUrl("assets/cat-purring.mp3"),
  appUrl("assets/rain-sound.mp3"),
  appUrl("assets/ocean-waves.mp3"),
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(CORE_URLS);

  const page = await cache.match(APP_ROOT);
  if (!page) return;

  const html = await page.text();
  const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => `${url.pathname}${url.search}`);

  await cache.addAll([...new Set(assetUrls)]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(APP_ROOT, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(APP_ROOT)) || Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }),
  );
});
