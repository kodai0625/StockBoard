/* Stock Board の中身と計算（中身は端末の中だけに置く）
   ・保存場所の名前は stockboard. で始める。個人アプリは全部同じ住所（kodai0625.github.io）に
     並ぶので、ほかのアプリと同じ名前にすると中身が混ざる
   ・計算はここに集めて、画面（app.js）は数字を出すだけにする。test/計算を試す.js がここだけを試す */
(function (root) {
  'use strict';

  var KEY = 'stockboard.v1';
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
  // 期限の古い順。期限なしは最後
  function sortLots(lots) {
    return lots.slice().sort(function (a, b) {
      if (!a.exp && !b.exp) return 0;
      if (!a.exp) return 1;
      if (!b.exp) return -1;
      return a.exp < b.exp ? -1 : a.exp > b.exp ? 1 : 0;
    });
  }

  // 残り。まだ数えていなければ null
  function qty(it) {
    if (!it.counted) return null;
    if (!it.track) return it.qty;
    return round(it.lots.reduce(function (s, l) { return s + l.qty; }, 0));
  }

  // 期限の一番近い組（残っていて、期限が入っているものだけ）
  function nearest(it, today) {
    if (!it.track) return null;
    var ls = sortLots(it.lots.filter(function (l) { return l.qty > 0 && l.exp; }));
    if (!ls.length) return null;
    var d = daysLeft(ls[0].exp, today);
    return { lot: ls[0], days: d, state: expState(d) };
  }

  function isOut(it) { return qty(it) === 0; }
  function isLow(it) {
    var q = qty(it);
    return q != null && it.target > 0 && q < it.target;
  }
  // 目安まであといくつ（買う数なので切り上げ）
  function shortfall(it) {
    var q = qty(it);
    if (q == null || !(it.target > 0)) return 0;
    return Math.max(0, Math.ceil(round(it.target - q)));
  }

  // −／＋。期限を記録する品は、減らすときは期限の古い組から、増やすときは一番新しい組に足す
  function step(it, d) {
    if (!it.track) {
      it.qty = Math.max(0, round((it.counted ? it.qty : 0) + d));
      it.counted = true;
      return;
    }
    it.counted = true;
    if (d < 0) {
      var need = -d;
      sortLots(it.lots).forEach(function (l) {
        if (need <= 0 || l.qty <= 0) return;
        var take = Math.min(l.qty, need);
        l.qty = round(l.qty - take);
        need = round(need - take);
      });
      it.lots = it.lots.filter(function (l) { return l.qty > 0; });
    } else {
      var ls = sortLots(it.lots);
      var last = ls[ls.length - 1];
      if (!last) { last = { id: uid(), qty: 0, exp: '' }; it.lots.push(last); }
      last.qty = round(last.qty + d);
    }
  }

  // 数を直接入れる（期限を記録しない品だけ）。空にすると「まだ数えていない」に戻る
  function setQty(it, v) {
    var n = toNum(v);
    if (isNaN(n)) { it.counted = false; it.qty = 0; return; }
    it.counted = true;
    it.qty = Math.max(0, round(n));
  }
  function setBuy(it, v) { it.buy = nonNeg(v); }
  function stepBuy(it, d) { it.buy = Math.max(0, round(it.buy + d)); }

  // 同じ期限の組があればそこに足す
  function addLot(it, n, exp) {
    n = nonNeg(n);
    if (!n) return;
    exp = parseDate(exp) ? exp : '';
    var same = null;
    it.lots.forEach(function (l) { if (l.exp === exp) same = l; });
    if (same) same.qty = round(same.qty + n);
    else it.lots.push({ id: uid(), qty: n, exp: exp });
    it.counted = true;
  }

  // 買った：買い出しの数を残りに足して、買い出しを 0 に戻す
  function bought(it, n, exp) {
    n = n == null ? it.buy : nonNeg(n);
    if (it.track) {
      addLot(it, n, exp);
      it.counted = true;
    } else {
      it.qty = round((it.counted ? it.qty : 0) + n);
      it.counted = true;
    }
    it.buy = 0;
  }

  function normalize(o) {
    o = o || {};
    var cat = catOf(o.cat) ? o.cat : 'supply';
    var it = {
      id: typeof o.id === 'string' && o.id ? o.id : uid(),
      cat: cat,
      name: String(o.name || '').trim().slice(0, 40),
      unit: String(o.unit || '').trim().slice(0, 8),
      target: nonNeg(o.target),
      buy: nonNeg(o.buy),
      memo: String(o.memo || '').trim().slice(0, 80),
      track: o.track == null ? catOf(cat).track : !!o.track,
      counted: !!o.counted,
      qty: 0,
      lots: []
    };
    if (it.track) {
      it.lots = (Array.isArray(o.lots) ? o.lots : []).map(function (l) {
        l = l || {};
        return { id: typeof l.id === 'string' && l.id ? l.id : uid(), qty: nonNeg(l.qty), exp: parseDate(l.exp) ? l.exp : '' };
      }).filter(function (l) { return l.qty > 0; });
    } else {
      it.qty = nonNeg(o.qty);
    }
    return it;
  }

  // ── 全体
  function blank() {
    return { v: 1, items: [], meta: { seeded: false, introDone: false, since: 0, lastExport: 0, changedAt: 0 } };
  }
  function fromObj(o) {
    var s = blank();
    if (o && Array.isArray(o.items)) {
      s.items = o.items.map(normalize).filter(function (it) { return it.name; });
      if (o.meta && typeof o.meta === 'object') {
        Object.keys(s.meta).forEach(function (k) { if (k in o.meta) s.meta[k] = o.meta[k]; });
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

  // 見本のうち、同じ分類に同じ名前が無いものだけ足す。足した数を返す
  function seedMissing(s, seeds) {
    var have = {};
    s.items.forEach(function (it) { have[it.cat + '\n' + it.name] = true; });
    var n = 0;
    (seeds || []).forEach(function (sd) {
      if (have[sd.cat + '\n' + sd.name]) return;
      s.items.push(normalize(sd));
      n++;
    });
    return n;
  }

  // 控え（書き出したファイル）を読む。形が違えば投げる
  function parseBackup(text) {
    var o = JSON.parse(text);
    if (!o || o.app !== 'StockBoard' || !Array.isArray(o.items)) throw new Error('Stock Board の控えではありません');
    var items = o.items.map(normalize).filter(function (it) { return it.name; });
    return items;
  }
  function backupText(s) {
    return JSON.stringify({ app: 'StockBoard', v: 1, at: new Date().toISOString(), items: s.items }, null, 1);
  }

  root.SB = root.SB || {};
  root.SB.Store = {
    KEY: KEY, CATS: CATS, SOON: SOON, NEAR: NEAR,
    uid: uid, round: round, toNum: toNum, nonNeg: nonNeg, catOf: catOf,
    ymd: ymd, parseDate: parseDate, daysLeft: daysLeft, expState: expState,
    sortLots: sortLots, qty: qty, nearest: nearest, isOut: isOut, isLow: isLow, shortfall: shortfall,
    step: step, setQty: setQty, setBuy: setBuy, stepBuy: stepBuy, addLot: addLot, bought: bought,
    normalize: normalize, blank: blank, fromObj: fromObj, load: load, save: save,
    seedMissing: seedMissing, parseBackup: parseBackup, backupText: backupText
  };
})(typeof window !== 'undefined' ? window : globalThis);
