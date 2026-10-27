// オフライン用 service worker。ネットがあれば最新を取りに行き（network-first）、無ければキャッシュを使う。
const CACHE = 'etw-v5';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'css/app.css',
  'js/app.js', 'js/store.js', 'js/grade.js', 'js/util.js', 'js/content.js',
  'js/render/exhibit.js', 'js/render/questions.js', 'js/render/written.js',
  'data/units/index.json', 'data/units/unit-00.json', 'data/units/unit-01.json', 'data/units/unit-03.json', 'data/units/unit-04.json', 'data/units/unit-06.json', 'data/units/unit-07.json', 'data/units/unit-08.json', 'data/tutorials.json', 'data/mocks/index.json', 'data/mocks/mock-a.json', 'data/mocks/mock-b.json', 'data/mocks/mock-c.json', 'data/units/unit-09.json', 'data/units/unit-10.json', 'data/units/unit-11.json', 'data/units/unit-12.json', 'data/units/unit-13.json', 'data/units/unit-05.json', 'data/units/unit-02.json', 'data/sample-rubrics.json',
  'seed/samples.json', 'seed/practice.json', 'seed/answer-types.json', 'seed/weeks.json', 'seed/cards.json',
  'seed/img/hist.webp', 'seed/img/scatter.webp', 'seed/img/polygon.webp',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !isFont) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
