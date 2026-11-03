// ふるさと納税かんたんナビ Service Worker
// 方針: ネット優先（常に最新を表示）。つながらないときだけ保存しておいた版を出す。
const CACHE = 'furusato-navi-v10';
// 起動に欠かせないもの。1つでも取れなければインストールをやり直す
const CORE = ['./', 'index.html', 'core.js', 'manifest.webmanifest'];
// あればよいもの。取れなくても Service Worker のインストールは止めない
// （1つの失敗で全体が失敗すると、ホーム画面への追加やオフライン表示ができなくなるため）
const EXTRA = [
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'img/hero.webp', 'img/done.webp'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE).then(() => Promise.allSettled(EXTRA.map(u => c.add(u)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        // 206（部分応答）などは Cache API に入れられないので、完全な同一オリジンの応答だけ保存する
        if (res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
