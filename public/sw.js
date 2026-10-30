// Increment this version for every release that changes the app shell.
const CACHE = "motovolt-form-public-shell-v4";
const PUBLIC_ASSETS = ["/", "/icon.svg", "/manifest.webmanifest"];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PUBLIC_ASSETS)),
  );
  // Do not skipWaiting: an active form must keep its matching JS chunks.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith("motovolt-public-shell-") || key.startsWith("motovolt-customers-public-shell-") || key.startsWith("motovolt-form-public-shell-")) && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  const shell = event.request.mode === "navigate" && url.pathname === "/";
  const asset =
    url.pathname.startsWith("/_next/static/") ||
    PUBLIC_ASSETS.includes(url.pathname);
  if (!shell && !asset) return;
  // Never cache API responses, sessions, server-component requests or customer data.
  if (event.request.headers.has("RSC")) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (!shell) {
        const hit = await cache.match(event.request);
        if (hit) return hit;
      }
      try {
        const response = await fetch(event.request);
        if (response.ok)
          await cache.put(shell ? "/" : event.request, response.clone());
        return response;
      } catch (error) {
        const cached = await cache.match(shell ? "/" : event.request);
        if (cached) return cached;
        throw error;
      }
    })(),
  );
});
