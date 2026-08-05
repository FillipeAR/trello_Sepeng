// Service worker do ObraFlow — só cache, sem lógica de negócio.
//
// Escrito à mão em vez de Serwist/next-pwa: a própria documentação do
// Next.js (guia de PWA) avisa que o Serwist "atualmente exige configuração
// do webpack" — este projeto roda em Turbopack, então um plugin de geração
// de service worker via webpack não se aplica aqui. Um `sw.js` estático em
// `public/` não depende de bundler nenhum, funciona igual nos dois.
//
// Responsabilidade única: deixar a obra que já foi aberta uma vez acessível
// offline (última versão vista) e não atrapalhar escrita nenhuma — POST/
// mutação passa direto pra rede; quem lida com "sem conexão" na escrita é a
// fila local em `src/lib/offline-queue.ts`, não o service worker.

const CACHE_VERSION = "obraflow-v1";
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll([OFFLINE_URL])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("obraflow-") && key !== RUNTIME_CACHE && key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Nunca intercepta escrita — deixa falhar/passar direto pra rede. A fila
  // local (IndexedDB) é quem decide o que fazer quando isso falha.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    return offline ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}
