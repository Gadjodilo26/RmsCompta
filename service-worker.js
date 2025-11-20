importScripts("./config.js");

const swConfig = self.APP_CONFIG || {};
const CACHE_NAME = swConfig.pwa?.cacheName || "compta-locale-cache-v1";
const CACHE_ASSETS = swConfig.pwa?.assets || [
  "./",
  "./index.html",
  "./calendar.html",
  "./contacts.html",
  "./support.html",
  "./artisan.html",
  "./mode-emploi.html",
  "./styles.css",
  "./config.js",
  "./app.js",
  "./manifest.webmanifest",
  "./logoOfficielRMS.svg",
  "./logo-footer-placeholder.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Ajoutez/supprimez des fichiers dans CACHE_ASSETS pour adapter le cache à votre projet dérivé.

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((oldKey) => caches.delete(oldKey))
        )
      )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
