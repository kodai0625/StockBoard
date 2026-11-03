/* Stock Board の読み込み係（Livessa・Task Board と同じ形）
   ・いつもサーバーを先に見に行き、取れたときだけ控えを入れ替えます（つながらないときは控えを出す）
   ・res.ok を必ず見ます。見ないと、エラー画面そのものを控えてしまいます
   ・★消す控えは sb- で始まるものだけ。個人アプリは全部同じ住所に並んでいて、
     控えの置き場もほかのアプリと共有なので、全部消すと隣のアプリの控えまで消えます
   ・VERSION は 公開用を作る.py が中身から計算して書きかえます */
var VERSION = 'sb-44cfb3f6';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      return k.indexOf('sb-') === 0 && k !== VERSION ? caches.delete(k) : null;
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
        return res;
      }
      return caches.match(req).then(function (hit) { return hit || res; });
    }).catch(function () {
      // つながらないとき。控えが無ければ、ページを開くときだけ控えの index.html を出す
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./index.html').then(function (h) { return h || Response.error(); });
        return Response.error();
      });
    })
  );
});
