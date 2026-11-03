/* Stock Board の画面
   ・在庫は「ストックなし」のチェックで持つ（2026-11-03 に残りの数からかえた）。
     ストックなしの品と、買い出しの数を入れた品が「買い出し」に集まる
   ・チェックや数を変えたときは、その品のカードと上の数字だけ直す。全部を作り直すと押した場所が飛ぶうえ、
     数を打っている途中で＋を押したときに押したボタンが消えて効かなくなるため
   ・右上の「編集」で、名前を直す・並べ替える・消す・よくある品から選んで足す
   ・消す・買った・まとめて足す・控えから戻す は、全部「元に戻す」を出す */
(function () {
  'use strict';

  var St = SB.Store;
  var CATS = St.CATS;
  var VIEWS = ['spice', 'supply', 'bousai', 'shop'];
  var FILTERS = ['all', 'out', 'buy', 'exp'];
  var UI_KEY = 'stockboard.ui';
  var EXPORT_EVERY = 30 * 86400000;   // 控えを書き出してから、これだけたったら設定に印を出す

  var S = St.load();
  var ui = { view: 'spice', filter: {} };
  try { Object.assign(ui, JSON.parse(localStorage.getItem(UI_KEY) || '{}')); } catch (e) { /* 既定のまま */ }
  if (VIEWS.indexOf(ui.view) < 0) ui.view = 'spice';
  if (!ui.filter || typeof ui.filter !== 'object') ui.filter = {};
  Object.keys(ui.filter).forEach(function (k) { if (FILTERS.indexOf(ui.filter[k]) < 0) ui.filter[k] = 'all'; });
  var editing = false;   // 編集中か（覚えない。開き直したらふだんの画面）

  // 見本：はじめて開いたときは全部写す。もう開いた端末には、新しく足した見本だけ一度だけ足す
  // （前から入っていた見本で、消したものはよみがえらない）
  var upgraded = 0;
  var upgradeSnap = null;
  if (!S.meta.seeded) {
    St.seedMissing(S, SB.SEEDS);
    S.meta.seeded = true;
    S.meta.seedVer = SB.SEED_VER;
    S.meta.since = Date.now();
    St.save(S);
  } else if ((S.meta.seedVer || 1) < SB.SEED_VER) {
    var prevVer = S.meta.seedVer || 1;
    S.meta.seedVer = SB.SEED_VER;
    S.meta.introDone = false;   // 使いかたが変わったので、はじめにの案内をもう一度出す
    upgradeSnap = JSON.stringify(S);
    upgraded = St.seedMissing(S, SB.SEEDS, prevVer);
    St.save(S);
  }

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var main = $('#main');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return n == null ? '' : String(n); }
  function find(id) {
    for (var i = 0; i < S.items.length; i++) if (S.items[i].id === id) return S.items[i];
    return null;
  }
  function persist() {
    if (!St.save(S)) toast('保存できませんでした。端末の空きを確かめてください');
    updateGear();
  }
  function saveUi() {
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* 覚えられなくても動く */ }
  }

  // ── 日付の見せ方
  function dateLabel(exp) {
    var d = St.parseDate(exp);
    return d ? d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() : '';
  }
  function daysLabel(days) {
    if (days == null) return '';
    if (days < 0) return -days + '日過ぎ';
    if (days === 0) return '今日まで';
    if (days <= St.NEAR) return 'あと' + days + '日';
    var m = Math.round(days / 30.4);
    if (m < 24) return 'あと約' + m + 'か月';
    return 'あと約' + Math.floor(days / 365) + '年';
  }

  // 気にかける品（タブの数に出す）：ストックなし・期限切れ・期限が近い
  function needs(it, today) {
    if (it.out) return true;
    var n = St.nearest(it, today);
    return !!n && (n.state === 'over' || n.state === 'soon');
  }
  function stats(list, today) {
    var s = { all: list.length, out: 0, buy: 0, exp: 0 };
    list.forEach(function (it) {
      if (it.out) s.out++;
      if (it.buy > 0) s.buy++;
      if (St.expSoon(it, today)) s.exp++;
    });
    return s;
  }
  function match(it, f, today) {
    if (f === 'out') return it.out;
    if (f === 'buy') return it.buy > 0;
    if (f === 'exp') return St.expSoon(it, today);
    return true;
  }

  // ── カード（分類の画面）
  function badges(it, today) {
    var n = St.nearest(it, today);
    if (n && n.state === 'over') return '<span class="bd over">期限切れ</span>';
    if (n && n.state === 'soon') return '<span class="bd soon">期限が近い</span>';
    if (n && n.state === 'near') return '<span class="bd near">3か月以内</span>';
    return '';
  }
  function lotsHtml(it, today) {
    if (it.out) return '';
    var ls = St.sortLots(it.lots);
    if (!ls.length) return '<span class="lot none">期限：未入力（押して入れる）</span>';
    return ls.map(function (l) {
      var d = St.daysLeft(l.exp, today);
      return '<span class="lot ' + St.expState(d) + '"><span class="ld">' + dateLabel(l.exp) + '</span>' +
        '<span class="lq">' + (l.qty > 0 ? fmt(l.qty) + esc(it.unit) : '') + '</span><span class="ll">' + daysLabel(d) + '</span></span>';
    }).join('');
  }
  function cardClass(it) {
    return 'card c-' + it.cat + (it.buy > 0 ? ' has-buy' : '') + (it.out ? ' is-out' : '');
  }
  function card(it, today) {
    var u = esc(it.unit);
    return '<article class="' + cardClass(it) + '" data-id="' + it.id + '">' +
      '<div class="card-top"><button type="button" class="name" data-act="edit">' + esc(it.name) + '</button>' +
      '<div class="bds">' + badges(it, today) + '</div></div>' +
      '<div class="sub">' + esc(it.memo) + '</div>' +
      (it.track ? '<button type="button" class="lots" data-act="edit"' + (it.out ? ' hidden' : '') + '>' + lotsHtml(it, today) + '</button>' : '') +
      '<div class="nums">' +
        '<div class="nb"><span class="nl">在庫</span>' +
          '<label class="oc"><input type="checkbox" data-act="out"' + (it.out ? ' checked' : '') + '><span>ストックなし</span></label></div>' +
        '<div class="nb buy"><span class="nl">買い出し' + (u ? '（' + u + '）' : '') + '</span><div class="stp">' +
          '<button type="button" data-act="b-" aria-label="買い出しを1減らす">−</button>' +
          '<input class="bv" data-act="bset" inputmode="decimal" enterkeyhint="done" value="' + (it.buy ? fmt(it.buy) : '') + '" placeholder="0" aria-label="買い出しの数">' +
          '<button type="button" data-act="b+" aria-label="買い出しを1増やす">＋</button></div></div>' +
      '</div></article>';
  }
  // カードを作り直さず、変わるところだけ書きかえる
  function patchCard(el, it) {
    var today = new Date();
    el.className = cardClass(it);
    $('.bds', el).innerHTML = badges(it, today);
    if (it.track) {
      var lb = $('.lots', el);
      lb.innerHTML = lotsHtml(it, today);
      lb.hidden = it.out;
    }
    $('.oc input', el).checked = it.out;
    var bi = $('.bv', el);
    if (document.activeElement !== bi) bi.value = it.buy ? fmt(it.buy) : '';
  }

  // ── 分類の画面
  function chipsHtml(cat, f, st) {
    var cs = [['all', '全部', st.all], ['out', 'ストックなし', st.out], ['buy', '買う予定', st.buy]];
    if (S.items.some(function (it) { return it.cat === cat && it.track; })) cs.push(['exp', '期限が近い', st.exp]);
    return '<div class="chips" role="tablist">' + cs.map(function (c) {
      return '<button type="button" class="chip' + (c[0] === f ? ' on' : '') + '" data-act="filter" data-f="' + c[0] + '">' +
        c[1] + '<span class="n">' + c[2] + '</span></button>';
    }).join('') + '</div>';
  }
  function expBox(list, today) {
    var rows = [];
    list.forEach(function (it) {
      if (!it.track) return;
      it.lots.forEach(function (l) {
        var d = St.daysLeft(l.exp, today);
        var s = St.expState(d);
        if (s === 'over' || s === 'soon' || s === 'near') rows.push({ it: it, l: l, d: d, s: s });
      });
    });
    if (!rows.length) return '';
    rows.sort(function (a, b) { return a.d - b.d; });
    return '<div class="xbox"><div class="xh">期限が近いもの</div>' + rows.map(function (r) {
      return '<button type="button" class="xrow ' + r.s + '" data-act="edit" data-id="' + r.it.id + '">' +
        '<span class="xn">' + esc(r.it.name) + (r.l.qty > 0 ? ' <b>' + fmt(r.l.qty) + esc(r.it.unit) + '</b>' : '') + '</span>' +
        '<span class="xd">' + dateLabel(r.l.exp) + '</span><span class="xl">' + daysLabel(r.d) + '</span></button>';
    }).join('') +
      '<p class="hint">近いものからふだんの食事で使い、使った分を買い足しておくと無駄になりません。</p></div>';
  }
  function introHtml() {
    if (S.meta.introDone) return '';
    return '<div class="intro"><b>はじめに</b><p>一般的な家庭によくある品を入れてあります。切らしたら「ストックなし」にチェックを入れてください。' +
      'チェックした品と、買い出しの数を入れた品が「買い出し」に集まります。</p>' +
      '<p>名前を直す・並べ替える・いらない品を消すときは、右上の「編集」を押します。</p>' +
      '<button type="button" class="ghost sm" data-act="intro">わかった</button></div>';
  }
  function headHtml(cat) {
    var today = new Date();
    var all = S.items.filter(function (it) { return it.cat === cat; });
    var f = ui.filter[cat] || 'all';
    return introHtml() + expBox(all, today) + chipsHtml(cat, f, stats(all, today));
  }
  function emptyHtml(f) {
    var t = {
      all: 'まだ品がありません。右下の＋で足してください。',
      out: 'ストックなしの品はありません。',
      buy: '買う予定のものはありません。',
      exp: '期限が近いものはありません。'
    }[f] || '';
    return '<p class="empty">' + t + '</p>';
  }
  function viewCat(cat) {
    var today = new Date();
    var f = ui.filter[cat] || 'all';
    var list = S.items.filter(function (it) { return it.cat === cat && match(it, f, today); });
    main.innerHTML = '<div id="vhead">' + headHtml(cat) + '</div>' +
      (list.length ? '<div class="list">' + list.map(function (it) { return card(it, today); }).join('') + '</div>' : emptyHtml(f)) +
      (cat === 'bousai' ? '<p class="hint guide">備えの目安（1人・1週間分）：水 21L（2Lで11本）・食事 21食・トイレ 35回。' +
        '最低でも3日分は置いておきます。</p>' : '');
  }

  // ── 編集の画面（名前を直す・並べ替える・消す・足す）
  function erow(it, i, n) {
    var sub = [];
    if (it.unit) sub.push('単位 ' + esc(it.unit));
    if (it.track) sub.push('期限を記録');
    if (it.memo) sub.push(esc(it.memo));
    return '<div class="erow c-' + it.cat + '" data-id="' + it.id + '">' +
      '<button type="button" class="en" data-act="edit"><b>' + esc(it.name) + '</b>' + (sub.length ? '<small>' + sub.join(' ・ ') + '</small>' : '') + '</button>' +
      '<button type="button" class="ib" data-act="up" aria-label="上へ"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button type="button" class="ib" data-act="down" aria-label="下へ"' + (i === n - 1 ? ' disabled' : '') + '>↓</button>' +
      '<button type="button" class="ib del" data-act="del" aria-label="消す">×</button></div>';
  }
  function viewEdit(cat) {
    var list = S.items.filter(function (it) { return it.cat === cat; });
    var miss = St.missingSeeds(S, SB.SEEDS, cat);
    main.innerHTML = '<div id="vhead"><div class="ebar"><b>' + St.catOf(cat).name + 'の品を編集（' + list.length + '品）</b>' +
        '<p>名前を押すと、名前・単位・メモなどを直せます。↑↓で並べ替え、×で消します。終わったら右上の「完了」。</p></div></div>' +
      (list.length ? '<div class="elist">' + list.map(function (it, i) { return erow(it, i, list.length); }).join('') + '</div>'
        : '<p class="empty">まだ品がありません。</p>') +
      '<div class="eadd"><button type="button" class="ghost" data-act="add">＋ 品を足す</button>' +
      (miss.length ? '<button type="button" class="ghost" data-act="pick">よくある品から選んで足す（' + miss.length + '品）</button>' : '') +
      '</div>';
  }

  // ── 買い出しの画面
  function srow(it) {
    var u = esc(it.unit);
    return '<div class="srow c-' + it.cat + (St.onList(it) ? '' : ' zero') + '" data-id="' + it.id + '">' +
      '<button type="button" class="got" data-act="bought">買った</button>' +
      '<div class="sn"><b>' + esc(it.name) + '</b><small>' + srowSub(it) + '</small></div>' +
      '<div class="stp sm"><button type="button" data-act="b-" aria-label="1減らす">−</button>' +
      '<input class="bv" data-act="bset" inputmode="decimal" enterkeyhint="done" value="' + (it.buy ? fmt(it.buy) : '') + '" placeholder="数" aria-label="買う数">' +
      '<button type="button" data-act="b+" aria-label="1増やす">＋</button></div>' +
      '<span class="su">' + u + '</span></div>';
  }
  function srowSub(it) {
    var p = [];
    if (it.out) p.push('<span class="nw so">ストックなし</span>');
    if (it.memo) p.push(esc(it.memo));
    return p.join(' ・ ');
  }
  function patchRow(el, it) {
    el.classList.toggle('zero', !St.onList(it));
    var bi = $('.bv', el);
    if (document.activeElement !== bi) bi.value = it.buy ? fmt(it.buy) : '';
  }
  function shopHeadHtml() {
    var items = S.items.filter(St.onList);
    return '<div class="shop-head"><b>買うもの ' + items.length + '品</b>' +
      (items.length ? '<button type="button" class="ghost sm" data-act="copy">リストをコピー</button>' : '') + '</div>';
  }
  function viewShop() {
    var items = S.items.filter(St.onList);
    var h = '<div id="vhead">' + shopHeadHtml() + '</div>';
    if (!items.length) {
      h += '<p class="empty">買うものはありません。<br>「ストックなし」にチェックを入れた品と、買い出しの数を入れた品がここに集まります。</p>';
    } else {
      CATS.forEach(function (c) {
        var g = items.filter(function (it) { return it.cat === c.id; });
        if (!g.length) return;
        h += '<h3 class="grp g-' + c.id + '">' + c.name + '</h3><div class="slist">' + g.map(srow).join('') + '</div>';
      });
      h += '<p class="hint">「買った」を押すと、ストックなしのチェックが外れて、買い出しは0に戻ります。期限を記録する品は期限を聞きます。</p>';
    }
    main.innerHTML = h;
  }
  function shopText() {
    var d = new Date();
    var lines = ['買い出し（' + (d.getMonth() + 1) + '/' + d.getDate() + '）'];
    CATS.forEach(function (c) {
      var g = S.items.filter(function (it) { return it.cat === c.id && St.onList(it); });
      if (!g.length) return;
      lines.push('', '【' + c.name + '】');
      g.forEach(function (it) {
        lines.push('・' + it.name + (it.buy > 0 ? ' ' + fmt(it.buy) + it.unit : '') + (it.memo ? '（' + it.memo + '）' : ''));
      });
    });
    return lines.join('\n');
  }

  // ── 全体
  function renderTabs() {
    var today = new Date();
    document.querySelectorAll('.tab').forEach(function (t) {
      var v = t.dataset.view;
      var on = v === ui.view;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      var n = v === 'shop'
        ? S.items.filter(St.onList).length
        : S.items.filter(function (it) { return it.cat === v && needs(it, today); }).length;
      var c = $('.cnt', t);
      c.textContent = n || '';
      c.hidden = !n;
    });
    var eb = $('#editBtn');
    eb.hidden = ui.view === 'shop';
    eb.textContent = editing ? '完了' : '編集';
    eb.classList.toggle('on', editing);
  }
  function refreshHead() {
    var h = $('#vhead');
    if (!h || editing) return;
    h.innerHTML = ui.view === 'shop' ? shopHeadHtml() : headHtml(ui.view);
  }
  var renderedDay = '';
  function render() {
    renderedDay = St.ymd(new Date());
    if (ui.view === 'shop') editing = false;
    renderTabs();
    if (ui.view === 'shop') viewShop();
    else if (editing) viewEdit(ui.view);
    else viewCat(ui.view);
    updateGear();
  }
  function changed(it) {
    persist();
    var el = main.querySelector('[data-id="' + it.id + '"]:not(.xrow)');
    if (el) (el.classList.contains('srow') ? patchRow : patchCard)(el, it);
    renderTabs();
    refreshHead();
  }
  function go(view) {
    ui.view = view;
    saveUi();
    render();
    window.scrollTo(0, 0);
  }

  // ── 知らせ（元に戻す付き）
  var toastTimer = null;
  var undoSnap = null;
  function snap() { return JSON.stringify(S); }
  function toast(msg, snapshot) {
    var t = $('#toast');
    undoSnap = snapshot || null;
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (undoSnap ? '<button type="button" id="undo">元に戻す</button>' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; undoSnap = null; }, undoSnap ? 8000 : 3000);
  }
  $('#toast').addEventListener('click', function (e) {
    if (e.target.id !== 'undo' || !undoSnap) return;
    S = St.fromObj(JSON.parse(undoSnap));
    undoSnap = null;
    persist();
    render();
    toast('元に戻しました');
  });

  // ── 下から出る入れ物
  var sheetEl = $('#sheet');
  var sheetBg = $('#sheetBg');
  function openSheet(title, html) {
    $('#sheetTitle').textContent = title;
    $('#sheetBody').innerHTML = html;
    sheetEl.hidden = false;
    sheetBg.hidden = false;
    document.body.classList.add('locked');
  }
  function closeSheet() {
    sheetEl.hidden = true;
    sheetBg.hidden = true;
    $('#sheetBody').innerHTML = '';
    document.body.classList.remove('locked');
  }
  $('#sheetX').addEventListener('click', closeSheet);
  sheetBg.addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheetEl.hidden) closeSheet(); });

  function field(label, input) {
    return '<label class="f"><span class="fl">' + label + '</span>' + input + '</label>';
  }

  // ── 品を足す・直す
  function openEdit(id) {
    var it = id ? find(id) : null;
    var cat = it ? it.cat : (ui.view === 'shop' ? 'spice' : ui.view);
    var track = it ? it.track : St.catOf(cat).track;
    var out = it ? it.out : false;
    var lots = it ? St.sortLots(it.lots).map(function (l) { return { exp: l.exp, qty: l.qty > 0 ? fmt(l.qty) : '' }; }) : [];
    var html = '<form class="form" id="ef" autocomplete="off" novalidate>' +
      field('名前', '<input name="nm" maxlength="40" value="' + esc(it ? it.name : '') + '" placeholder="例：しょうゆ">') +
      '<div class="f"><span class="fl">分類</span><div class="seg">' + CATS.map(function (c) {
        return '<label><input type="radio" name="cat" value="' + c.id + '"' + (c.id === cat ? ' checked' : '') + '><span>' + c.name + '</span></label>';
      }).join('') + '</div></div>' +
      '<div class="row2">' +
        field('単位', '<input name="unit" list="units" maxlength="8" value="' + esc(it ? it.unit : '') + '" placeholder="本・個・袋">') +
        field('買い出し数', '<input name="buy" inputmode="decimal" value="' + (it && it.buy ? fmt(it.buy) : '') + '" placeholder="0">') +
      '</div>' +
      '<label class="tg"><input type="checkbox" name="out"' + (out ? ' checked' : '') + '><span>ストックなし（切らしている）</span></label>' +
      '<label class="tg"><input type="checkbox" name="track"' + (track ? ' checked' : '') + '><span>期限を記録する</span></label>' +
      '<div id="lbox" class="f"' + (track && !out ? '' : ' hidden') + '><span class="fl">期限（賞味期限・使用期限）</span>' +
        '<div id="lots"></div>' +
        '<button type="button" class="ghost sm" id="lotAdd">＋ 期限を足す</button>' +
        '<p class="hint">期限の違うものは分けて入れます。数は分かれば入れてください。</p></div>' +
      field('メモ（置き場所・銘柄など）', '<input name="memo" maxlength="80" value="' + esc(it ? it.memo : '') + '">') +
      '<button type="submit" class="primary">' + (it ? '保存' : '足す') + '</button>' +
      (it ? '<button type="button" class="danger" id="del">この品を消す</button>' : '') +
      '</form>';
    openSheet(it ? '品を直す' : '品を足す', html);

    var f = $('#ef');
    var E = f.elements;
    var lotsEl = $('#lots');
    var trackTouched = false;

    function drawLots() {
      lotsEl.innerHTML = lots.length ? lots.map(function (l, i) {
        return '<div class="lotrow" data-i="' + i + '">' +
          '<input class="le" type="date" value="' + esc(l.exp) + '" aria-label="期限">' +
          '<input class="lq" inputmode="decimal" value="' + esc(l.qty) + '" placeholder="数" aria-label="数">' +
          '<button type="button" class="lx" aria-label="この期限を消す">×</button></div>';
      }).join('') : '<p class="muted">まだありません。下のボタンで足してください。</p>';
    }
    lotsEl.addEventListener('input', function (e) {
      var row = e.target.closest('.lotrow');
      if (!row) return;
      var l = lots[+row.dataset.i];
      if (e.target.classList.contains('lq')) l.qty = e.target.value; else l.exp = e.target.value;
    });
    lotsEl.addEventListener('click', function (e) {
      var x = e.target.closest('.lx');
      if (!x) return;
      lots.splice(+x.closest('.lotrow').dataset.i, 1);
      drawLots();
    });
    $('#lotAdd').addEventListener('click', function () {
      lots.push({ exp: '', qty: '' });
      drawLots();
      $('.lotrow:last-child .le', lotsEl).focus();
    });
    drawLots();

    function showLots() { $('#lbox').hidden = !(E.track.checked && !E.out.checked); }
    E.track.addEventListener('change', function () { trackTouched = true; showLots(); });
    E.out.addEventListener('change', showLots);
    // 新しい品は、分類を変えたら「期限を記録する」もその分類の決まりに合わせる（自分で触っていなければ）
    f.addEventListener('change', function (e) {
      if (e.target.name !== 'cat' || it || trackTouched) return;
      E.track.checked = St.catOf(e.target.value).track;
      showLots();
    });

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = E.nm.value.trim();
      if (!name) { E.nm.focus(); toast('名前を入れてください'); return; }
      var o = { name: name, cat: E.cat.value, unit: E.unit.value, buy: E.buy.value, memo: E.memo.value, track: E.track.checked, out: E.out.checked, lots: [] };
      if (o.track && !o.out) {
        if (lots.some(function (l) { return !l.exp && String(l.qty).trim(); })) { toast('数を入れた行に、期限を入れてください'); return; }
        o.lots = lots.filter(function (l) { return l.exp; }).map(function (l) { return { exp: l.exp, qty: l.qty }; });
      }
      if (it) {
        var n2 = St.normalize(Object.assign({}, o, { id: it.id }));
        // 同じ期限の行はまとめる
        var merged = { lots: [] };
        n2.lots.forEach(function (l) { St.addLot(merged, l.qty, l.exp); });
        n2.lots = merged.lots;
        Object.keys(n2).forEach(function (k) { it[k] = n2[k]; });
        // 分類を変えたら、移った先を見せる（そのままだと品が消えたように見える）
        if (ui.view !== 'shop' && ui.view !== it.cat) { ui.view = it.cat; saveUi(); }
        toast('直しました');
      } else {
        var nw = St.normalize(o);
        var m2 = { lots: [] };
        nw.lots.forEach(function (l) { St.addLot(m2, l.qty, l.exp); });
        nw.lots = m2.lots;
        S.items.push(nw);
        if (ui.view !== 'shop') ui.view = nw.cat;
        saveUi();
        toast('「' + name + '」を足しました');
      }
      persist();
      closeSheet();
      render();
    });

    if (it) {
      $('#del').addEventListener('click', function () {
        closeSheet();
        removeItem(it);
      });
    } else {
      setTimeout(function () { E.nm.focus(); }, 50);
    }
  }

  function removeItem(it) {
    var before = snap();
    S.items = S.items.filter(function (x) { return x !== it; });
    persist();
    render();
    toast('「' + it.name + '」を消しました', before);
  }

  // ── よくある品から選んで足す（その分類の見本のうち、今の一覧に無いもの）
  function openPicker(cat) {
    var list = St.missingSeeds(S, SB.SEEDS, cat);
    if (!list.length) { toast('足せる品はありません'); return; }
    var html = '<p class="lead">' + St.catOf(cat).name + 'でよくある品のうち、今の一覧に無いものです。足したい品にチェックを入れてください。</p>' +
      '<div class="pklist">' + list.map(function (sd, i) {
        return '<label class="pk"><input type="checkbox" value="' + i + '"><span>' + esc(sd.name) + '</span>' +
          '<small>' + esc(sd.unit || '') + (sd.track ? '・期限を記録' : '') + '</small></label>';
      }).join('') + '</div>' +
      '<div class="btns"><button type="button" class="ghost" id="pkAll">全部選ぶ</button>' +
      '<button type="button" class="primary" id="pkGo">選んだ品を足す</button></div>';
    openSheet('よくある品から選ぶ', html);
    var boxes = Array.prototype.slice.call(document.querySelectorAll('#sheetBody .pk input'));
    $('#pkAll').addEventListener('click', function () {
      var all = boxes.every(function (b) { return b.checked; });
      boxes.forEach(function (b) { b.checked = !all; });
      this.textContent = all ? '全部選ぶ' : '全部外す';
    });
    $('#pkGo').addEventListener('click', function () {
      var sel = boxes.filter(function (b) { return b.checked; }).map(function (b) { return list[+b.value]; });
      if (!sel.length) { toast('足す品にチェックを入れてください'); return; }
      var before = snap();
      sel.forEach(function (sd) { S.items.push(St.normalize(sd)); });
      persist();
      closeSheet();
      render();
      toast(sel.length + '品を足しました', before);
    });
  }

  // ── 買った（期限を記録する品は期限を聞く）
  function doBought(it) {
    if (!it.track) {
      var before = snap();
      St.bought(it);
      persist();
      render();
      toast(it.name + 'を買ったので、リストから外しました', before);
      return;
    }
    var html = '<form class="form" id="bf" autocomplete="off" novalidate>' +
      '<p class="lead">' + esc(it.name) + 'の期限が分かれば入れてください。近くなったら知らせます。</p>' +
      field('期限（賞味期限・使用期限）', '<input name="exp" type="date">') +
      field('数（分かれば）' + (it.unit ? '（' + esc(it.unit) + '）' : ''), '<input name="cnt" inputmode="decimal" value="' + (it.buy ? fmt(it.buy) : '') + '">') +
      '<p class="hint">期限が分からなければ、空のままで「買った」にできます。</p>' +
      '<button type="submit" class="primary">買った</button></form>';
    openSheet('買った', html);
    var f = $('#bf');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var before = snap();
      St.bought(it, f.elements.exp.value, f.elements.cnt.value);
      persist();
      closeSheet();
      render();
      toast(it.name + 'を買ったので、リストから外しました', before);
    });
  }

  function doCopy() {
    var text = shopText();
    function fallback() {
      openSheet('リストをコピー', '<p class="lead">下を長押ししてコピーしてください。</p><textarea class="copy" readonly rows="10">' + esc(text) + '</textarea>');
      var ta = $('#sheetBody textarea');
      ta.focus();
      ta.select();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('買い出しのリストをコピーしました'); }, fallback);
    } else {
      fallback();
    }
  }

  // ── 設定（控え・見本）
  function exportDue() {
    if (!S.items.some(function (it) { return St.onList(it) || it.lots.length; })) return false;
    if (S.meta.changedAt <= S.meta.lastExport) return false;
    return Date.now() - Math.max(S.meta.lastExport || 0, S.meta.since || 0) > EXPORT_EVERY;
  }
  function updateGear() { $('#setBtn').classList.toggle('due', exportDue()); }

  function openSettings() {
    var last = S.meta.lastExport ? new Date(S.meta.lastExport) : null;
    var html =
      '<section class="set"><h4>控え</h4>' +
        '<p>中身はこの端末の中にだけあります。iPhone を替えるときや、Safari のデータを消す前に書き出してください。</p>' +
        '<p class="muted">最後に書き出した日：' + (last ? last.getFullYear() + '/' + (last.getMonth() + 1) + '/' + last.getDate() : 'まだありません') + '</p>' +
        '<div class="btns"><button type="button" class="primary" id="expBtn">控えを書き出す</button>' +
        '<label class="ghost filebtn">控えから戻す<input type="file" id="impFile" accept="application/json,.json"></label></div>' +
      '</section>' +
      '<section class="set"><h4>よくある品</h4>' +
        '<p>一般的な家庭によくある品のうち、今の一覧に無いものを全部足します。今ある品はそのままです（前に消した品も戻ります）。' +
        '分類ごとに選んで足すときは、右上の「編集」から。</p>' +
        '<button type="button" class="ghost" id="seedBtn">よくある品を全部足す</button>' +
      '</section>' +
      '<section class="set"><h4>しるしの意味</h4>' +
        '<ul class="legend">' +
          '<li><span class="bd out">ストックなし</span>切らしている品。買い出しに出ます</li>' +
          '<li><span class="bd over">期限切れ</span>期限を過ぎたものがある</li>' +
          '<li><span class="bd soon">期限が近い</span>30日以内</li>' +
          '<li><span class="bd near">3か月以内</span>90日以内</li>' +
        '</ul>' +
      '</section>';
    openSheet('設定', html);
    $('#expBtn').addEventListener('click', doExport);
    $('#impFile').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) doImport(file);
    });
    $('#seedBtn').addEventListener('click', function () {
      var before = snap();
      var n = St.seedMissing(S, SB.SEEDS);
      if (!n) { toast('足りない品はありません'); return; }
      persist();
      closeSheet();
      render();
      toast('よくある品を' + n + '品足しました', before);
    });
  }

  function doExport() {
    var text = St.backupText(S);
    var name = 'StockBoard-' + St.ymd(new Date()) + '.json';
    function done() {
      S.meta.lastExport = Date.now();
      persist();
      closeSheet();
      toast('控えを書き出しました');
    }
    function download() {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      done();
    }
    var file = null;
    try { file = new File([text], name, { type: 'application/json' }); } catch (e) { file = null; }
    // iPhone は共有の画面から「"ファイル"に保存」できる
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).then(done, function (err) {
        if (err && err.name === 'AbortError') return;
        download();
      });
    } else {
      download();
    }
  }

  function doImport(file) {
    var r = new FileReader();
    r.onload = function () {
      var items;
      try { items = St.parseBackup(String(r.result)); } catch (e) {
        toast('読めませんでした。Stock Board で書き出した控えを選んでください');
        return;
      }
      openSheet('控えから戻す',
        '<p class="lead">今の中身（' + S.items.length + '品）を、控えの中身（' + items.length + '品）に置き換えます。</p>' +
        '<p class="hint">置き換えたあと8秒の間は「元に戻す」で戻せます。</p>' +
        '<button type="button" class="primary" id="impGo">置き換える</button>');
      $('#impGo').addEventListener('click', function () {
        var before = snap();
        S.items = items;
        persist();
        closeSheet();
        render();
        toast('控えから戻しました（' + items.length + '品）', before);
      });
    };
    r.readAsText(file);
  }

  // ── 操作
  main.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.dataset.act;
    if (act === 'out' || act === 'bset') return;   // change で受ける
    var host = b.closest('[data-id]');
    var it = host ? find(host.dataset.id) : null;
    switch (act) {
      case 'b-': case 'b+':
        if (it) { St.stepBuy(it, act === 'b+' ? 1 : -1); changed(it); }
        break;
      case 'edit':
        if (it) openEdit(it.id);
        break;
      case 'bought':
        if (it && St.onList(it)) doBought(it);
        else toast('買う数を入れてから押してください');
        break;
      case 'copy': doCopy(); break;
      case 'filter':
        ui.filter[ui.view] = b.dataset.f;
        saveUi();
        render();
        break;
      case 'intro':
        S.meta.introDone = true;
        persist();
        refreshHead();
        break;
      case 'up': case 'down':
        if (it && St.move(S, it.id, act === 'up' ? -1 : 1)) {
          persist();
          render();
          var moved = main.querySelector('.erow[data-id="' + it.id + '"]');
          if (moved) {
            moved.classList.add('moved');
            moved.scrollIntoView({ block: 'nearest' });
            var again = $('[data-act="' + act + '"]', moved);
            if (again && !again.disabled) again.focus();
          }
        }
        break;
      case 'del':
        if (it) removeItem(it);
        break;
      case 'add': openEdit(null); break;
      case 'pick': openPicker(ui.view); break;
    }
  });
  main.addEventListener('change', function (e) {
    var inp = e.target;
    var act = inp.dataset && inp.dataset.act;
    if (act !== 'out' && act !== 'bset') return;
    var host = inp.closest('[data-id]');
    var it = host && find(host.dataset.id);
    if (!it) return;
    if (act === 'out') {
      var before = snap();
      var cleared = St.setOut(it, inp.checked);
      changed(it);
      if (cleared) toast(it.name + 'の期限の記録（' + cleared + '件）も消しました', before);
      return;
    }
    St.setBuy(it, inp.value);
    changed(it);
    inp.value = it.buy ? fmt(it.buy) : '';
  });
  main.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches('input.bv')) e.target.blur();
  });
  main.addEventListener('focusin', function (e) {
    if (e.target.matches('input.bv')) setTimeout(function () { try { e.target.select(); } catch (x) { /* なにもしない */ } }, 0);
  });

  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { go(t.dataset.view); });
  });
  $('#fab').addEventListener('click', function () { openEdit(null); });
  $('#setBtn').addEventListener('click', openSettings);
  $('#editBtn').addEventListener('click', function () {
    editing = !editing;
    render();
    window.scrollTo(0, 0);
  });

  // 日付が変わったまま開きっぱなしでも、戻ってきたら期限の日数を数え直す（日付が同じなら何もしない）
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && sheetEl.hidden && St.ymd(new Date()) !== renderedDay) render();
  });

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(function () { /* 断られても動く */ });
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* 控えが使えなくても動く */ });
  }

  render();
  if (upgraded) toast('よくある品を' + upgraded + '品足しました。いらない品は「編集」から消せます', upgradeSnap);
})();
