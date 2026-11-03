/* Stock Board の中身と計算（中身は端末の中だけに置く）
   ・保存場所の名前は stockboard. で始める。個人アプリは全部同じ住所（kodai0625.github.io）に
     並ぶので、ほかのアプリと同じ名前にすると中身が混ざる
   ・計算はここに集めて、画面（app.js）は出すだけにする。test/計算を試す.js がここだけを試す
   ・2026-11-03 に「残りの数」をやめて「ストックなし」のチェックにした（ko-dai さんの希望）。
     前の形の記録は normalize で受ける（数えて0だった品をストックなしにする） */
(function (root) {
  'use strict';

  var KEY = 'stockboard.v1';   // 形を変えても名前は変えない（変えると前の中身が読めなくなる）
  var CATS = [
    { id: 'spice', name: '調味料', track: false },
    { id: 'supply', name: '備品', track: false },
    { id: 'bousai', name: '防災', track: true }
  ];
  var SOON = 30;   // ここまでなら「期限が近い」
  var NEAR = 90;   // ここまでなら「3か月以内」
  var DAY = 86400000;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function round(n) { return Math.round(n * 100) / 100; }

  // 全角の数字も受ける（iPhone の日本語キーボードのまま打っても通るように）
  function toNum(v) {
    if (v == null) return NaN;
    var s = String(v).trim().replace(/[０-９．]/g, function (c) {
      return c === '．' ? '.' : String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
    if (s === '') return NaN;
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }
  function nonNeg(v) {
    var n = toNum(v);
    return isNaN(n) || n < 0 ? 0 : round(n);
  }

  function catOf(id) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i];
    return null;
  }

  // ── 日付（'YYYY-MM-DD' を端末の時刻の日付として扱う）
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 ? d : null;
  }
  function daysLeft(exp, today) {
    var e = parseDate(exp);
    if (!e) return null;
    var t = today || new Date();
    t = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((e - t) / DAY);
  }
  function expState(days) {
    if (days == null) return '';
    if (days < 0) return 'over';
    if (days <= SOON) return 'soon';
    if (days <= NEAR) return 'near';
    return 'ok';
  }

  // ── 品物
  // 品 = { id, cat, name, unit, buy, memo, track, out, lots }
  //   out  … ストックなし（チェック）
  //   lots … 期限を記録する品だけ。{ id, exp, qty }。qty は分かれば（0＝数は入れていない）
  //   ★ストックなしの品は lots を持たない（無いものに期限は無い）

  // 期限の古い順
  function sortLots(lots) {
    return lots.slice().sort(function (a, b) { return a.exp < b.exp ? -1 : a.exp > b.exp ? 1 : 0; });
  }
  // 期限の一番近い組
  function nearest(it, today) {
    if (!it.track || !it.lots.length) return null;
    var l = sortLots(it.lots)[0];
    var d = daysLeft(l.exp, today);
    return { lot: l, days: d, state: expState(d) };
  }
  // どれかの組が90日以内か期限切れ
  function expSoon(it, today) {
    if (!it.track) return false;
    return it.lots.some(function (l) {
      var st = expState(daysLeft(l.exp, today));
      return st === 'over' || st === 'soon' || st === 'near';
    });
  }

  // 買い出しに出る品：ストックなし か 買い出しの数が入っている
  function onList(it) { return it.out || it.buy > 0; }

  // ストックなしにすると期限の記録も消す。消した組の数を返す（知らせに出すため）
  function setOut(it, on) {
    it.out = !!on;
    if (!it.out) return 0;
    var n = it.lots.length;
    it.lots = [];
    return n;
  }
  function setBuy(it, v) { it.buy = nonNeg(v); }
  function stepBuy(it, d) { it.buy = Math.max(0, round(it.buy + d)); }

  // 期限の組を足す。同じ期限があればそこにまとめる。期限が読めなければ足さない
  function addLot(it, n, exp) {
    if (!parseDate(exp)) return false;
    n = nonNeg(n);
    var same = null;
    it.lots.forEach(function (l) { if (l.exp === exp) same = l; });
    if (same) same.qty = round(same.qty + n);
    else it.lots.push({ id: uid(), exp: exp, qty: n });
    it.out = false;
    return true;
  }

  // 買った：ストックなしを外して、買い出しを0に戻す。期限を記録する品は期限が分かれば組を足す
  function bought(it, exp, n) {
    if (it.track && exp) addLot(it, n == null ? it.buy : n, exp);
    it.out = false;
    it.buy = 0;
  }

  function normalize(o) {
    o = o || {};
    var cat = catOf(o.cat) ? o.cat : 'supply';
    var track = o.track == null ? catOf(cat).track : !!o.track;
    var raw = Array.isArray(o.lots) ? o.lots : [];
    var out;
    if (typeof o.out === 'boolean') {
      out = o.out;
    } else {
      // 前の形（残りの数）：数えて0だった品をストックなしにする
      var left = track
        ? raw.reduce(function (s, l) { return s + nonNeg(l && l.qty); }, 0)
        : nonNeg(o.qty);
      out = !!o.counted && left === 0;
    }
    var lots = [];
    if (track && !out) {
      // 期限の無い組は捨てる（前の形では数だけを持っていた。数はもう持たない）
      lots = raw.map(function (l) {
        l = l || {};
        return { id: typeof l.id === 'string' && l.id ? l.id : uid(), exp: parseDate(l.exp) ? l.exp : '', qty: nonNeg(l.qty) };
      }).filter(function (l) { return l.exp; });
    }
    return {
      id: typeof o.id === 'string' && o.id ? o.id : uid(),
      cat: cat,
      name: String(o.name || '').trim().slice(0, 40),
      unit: String(o.unit || '').trim().slice(0, 8),
      buy: nonNeg(o.buy),
      memo: String(o.memo || '').trim().slice(0, 80),
      track: track,
      out: out,
      lots: lots
    };
  }

  // 同じ分類の中で1つ上（d=-1）か下（d=1）と入れかえる。動かせなければ false
  function move(s, id, d) {
    var i = -1;
    for (var k = 0; k < s.items.length; k++) if (s.items[k].id === id) { i = k; break; }
    if (i < 0) return false;
    var cat = s.items[i].cat;
    var j = i + d;
    while (j >= 0 && j < s.items.length && s.items[j].cat !== cat) j += d;
    if (j < 0 || j >= s.items.length) return false;
    var t = s.items[i];
    s.items[i] = s.items[j];
    s.items[j] = t;
    return true;
  }

  // ── 全体
  function blank() {
    return { v: 2, items: [], meta: { seeded: false, seedVer: 0, introDone: false, since: 0, lastExport: 0, changedAt: 0 } };
  }
  function fromObj(o) {
    var s = blank();
    if (o && Array.isArray(o.items)) {
      s.items = o.items.map(normalize).filter(function (it) { return it.name; });
      if (o.meta && typeof o.meta === 'object') {
        Object.keys(s.meta).forEach(function (k) { if (k in o.meta) s.meta[k] = o.meta[k]; });
        // seedVer が無いのは、はじめの見本（v1）だけを写した記録
        if (o.meta.seeded && !('seedVer' in o.meta)) s.meta.seedVer = 1;
      }
    }
    return s;
  }
  function load() {
    var raw = null;
    try { raw = root.localStorage.getItem(KEY); } catch (e) { /* 使えないときは空から */ }
    if (!raw) return blank();
    try {
      return fromObj(JSON.parse(raw));
    } catch (e) {
      // 読めない中身は上書きする前に横へ残す（消さない）
      try { root.localStorage.setItem(KEY + '.broken', raw); } catch (e2) { /* なにもしない */ }
      return blank();
    }
  }
  function save(s) {
    s.meta.changedAt = Date.now();
    try { root.localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
  }

  // 見本のうち、まだ無いもの。after を渡すと、その版より後に足した見本だけ
  // （同じ分類に同じ名前があれば、あるとみなす）
  function missingSeeds(s, seeds, cat, after) {
    var have = {};
    s.items.forEach(function (it) { have[it.cat + '\n' + it.name] = true; });
    return (seeds || []).filter(function (sd) {
      if (cat && sd.cat !== cat) return false;
      if ((sd.v || 1) <= (after || 0)) return false;
      return !have[sd.cat + '\n' + sd.name];
    });
  }
  // 足した数を返す
  function seedMissing(s, seeds, after) {
    var list = missingSeeds(s, seeds, null, after);
    list.forEach(function (sd) { s.items.push(normalize(sd)); });
    return list.length;
  }

  // 控え（書き出したファイル）を読む。形が違えば投げる
  function parseBackup(text) {
    var o = JSON.parse(text);
    if (!o || o.app !== 'StockBoard' || !Array.isArray(o.items)) throw new Error('Stock Board の控えではありません');
    return o.items.map(normalize).filter(function (it) { return it.name; });
  }
  function backupText(s) {
    return JSON.stringify({ app: 'StockBoard', v: 2, at: new Date().toISOString(), items: s.items }, null, 1);
  }

  root.SB = root.SB || {};
  root.SB.Store = {
    KEY: KEY, CATS: CATS, SOON: SOON, NEAR: NEAR,
    uid: uid, round: round, toNum: toNum, nonNeg: nonNeg, catOf: catOf,
    ymd: ymd, parseDate: parseDate, daysLeft: daysLeft, expState: expState,
    sortLots: sortLots, nearest: nearest, expSoon: expSoon, onList: onList,
    setOut: setOut, setBuy: setBuy, stepBuy: stepBuy, addLot: addLot, bought: bought,
    normalize: normalize, move: move, blank: blank, fromObj: fromObj, load: load, save: save,
    missingSeeds: missingSeeds, seedMissing: seedMissing, parseBackup: parseBackup, backupText: backupText
  };
})(typeof window !== 'undefined' ? window : globalThis);
