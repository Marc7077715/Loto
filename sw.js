/* Service worker : rend l'application utilisable hors connexion. */
const CACHE = 'loto-v1';
const FILES = ['./', 'index.html', 'css/style.css', 'js/app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
for (let n = 1; n <= 90; n++) { FILES.push(`audio/n/${n}.mp3`); if (n >= 10) FILES.push(`audio/d/${n}.mp3`); }
for (const l of 'BINGO') FILES.push(`audio/l/${l}.mp3`);
for (const p of ['quine', 'double-quine', 'carton-plein', 'bingo', 'ligne', 'debut', 'fin', 'cadeau', 'bravo', 'demarque', 'verif']) FILES.push(`audio/p/${p}.mp3`);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Réseau d'abord (pour recevoir les mises à jour), cache en secours ; l'audio, lui, est servi depuis le cache.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const isAudio = e.request.url.includes('/audio/');
  const fromNet = () => fetch(e.request).then((res) => {
    if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  });
  const fromCache = () => caches.match(e.request, { ignoreSearch: true });
  e.respondWith(isAudio
    ? fromCache().then((r) => r || fromNet())
    : fromNet().catch(() => fromCache()));
});
