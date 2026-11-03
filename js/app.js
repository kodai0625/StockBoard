/* Stock Board の画面
   ・数を変えたときは、その品のカードと上の数字だけ直す。全部を作り直すと押した場所が飛ぶうえ、
     数を打っている途中で＋を押したときに押したボタンが消えて効かなくなるため
   ・消す・買った・まとめて入れる・控えから戻す は、全部「元に戻す」を出す */
(function () {
  'use strict';

  var St = SB.Store;
  var CATS = St.CATS;
  var VIEWS = ['spice', 'supply', 'bousai', 'shop'];
  var UI_KEY = 'stockboard.ui';
  var EXPORT_EVERY = 30 * 86400000;   // 控えを書き出してから、これだけたったら設定に印を出す

  var S = St.load();
  var ui = { view: 'spice', filter: {} };
  try { Object.assign(ui, JSON.parse(localStorage.getItem(UI_KEY) || '{}')); } catch (e) { /* 既定のまま */ }
  if (VIEWS.indexOf(ui.view) < 0) ui.view = 'spice';
  if (!ui.filter || typeof ui.filter !== 'object') ui.filter = {};

  // はじめて開いたときだけ見本を写す
  if (!S.meta.seeded) {
    St.seedMissing(S, SB.SEEDS);
    S.meta.seeded = true;
    S.meta.since = Date.now();
    St.save(S);
  }

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var main = $('#main');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return n == null ? '未入力' : String(n); }
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
    return d ? d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() : '期限なし';
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

  // 気にかける品（タブの数に出す）：足りない・なし・期限切れ・期限が近い
  function needs(it, today) {
    if (St.isLow(it) || St.isOut(it)) return true;
    var n = St.nearest(it, today);
    return !!n && (n.state === 'over' || n.state === 'soon');
  }
  function stats(list, today) {
    var s = { all: list.length, low: 0, todo: 0, buy: 0, exp: 0 };
    list.forEach(function (it) {
      if (St.isLow(it) || St.isOut(it)) s.low++;
      if (!it.counted) s.todo++;
      if (it.buy > 0) s.buy++;
      if (expSoon(it, today)) s.exp++;
    });
    return s;
  }
  // どれかの組が90日以内か期限切れ
  function expSoon(it, today) {
    if (!it.track) return false;
    return it.lots.some(function (l) {
      var st = St.expState(St.daysLeft(l.exp, today));
      return st === 'over' || st === 'soon' || st === 'near';
    });
  }
  function match(it, f, today) {
    if (f === 'low') return St.isLow(it) || St.isOut(it);
    if (f === 'buy') return it.buy > 0;
    if (f === 'exp') return expSoon(it, today);
    if (f === 'todo') return !it.counted;
    return true;
  }

  // ── カード（分類の画面）
  function badges(it, today) {
    var b = [];
    if (St.isOut(it)) b.push('<span class="bd out">なし</span>');
    else if (St.isLow(it)) b.push('<span class="bd low">少ない</span>');
    var n = St.nearest(it, today);
    if (n && n.state === 'over') b.push('<span class="bd over">期限切れ</span>');
    else if (n && n.state === 'soon') b.push('<span class="bd soon">期限が近い</span>');
    else if (n && n.state === 'near') b.push('<span class="bd near">3か月以内</span>');
    return b.join('');
  }
  function subLine(it) {
    var u = esc(it.unit);
    var p = [];
    if (!it.counted) p.push('<span class="todo">まだ数えていません</span>');
    if (it.target > 0) p.push('目安 ' + fmt(it.target) + u);
    var sf = St.shortfall(it);
    if (sf > 0) p.push('<span class="short">あと' + sf + u + 'で目安</span>');
    if (it.memo) p.push(esc(it.memo));
    return p.join('<span class="dot"> ・ </span>');
  }
  function lotsHtml(it, today) {
    var ls = St.sortLots(it.lots);
    if (!ls.length) {
      return '<div class="lot none">' + (it.counted ? '残りはありません' : '期限は未入力（名前を押して入れる）') + '</div>';
    }
    return ls.map(function (l) {
      var d = St.daysLeft(l.exp, today);
      return '<div class="lot ' + St.expState(d) + '"><span class="ld">' + dateLabel(l.exp) + '</span>' +
        '<span class="lq">' + fmt(l.qty) + esc(it.unit) + '</span><span class="ll">' + daysLabel(d) + '</span></div>';
    }).join('');
  }
  function cardClass(it) {
    return 'card c-' + it.cat + (it.buy > 0 ? ' has-buy' : '') + (it.counted ? '' : ' uncounted');
  }
  function card(it, today) {
    var u = esc(it.unit);
    var q = St.qty(it);
    var qctl = it.track
      ? '<button type="button" class="qv' + (q == null ? ' todo' : '') + '" data-act="edit" aria-label="残り（押すと期限ごとに直せます）">' + fmt(q) + '</button>'
      : '<input class="qv" data-act="qset" inputmode="decimal" enterkeyhint="done" value="' + (q == null ? '' : fmt(q)) + '" placeholder="未入力" aria-label="残り">';
    return '<article class="' + cardClass(it) + '" data-id="' + it.id + '">' +
      '<div class="card-top"><button type="button" class="name" data-act="edit">' + esc(it.name) + '</button>' +
      '<div class="bds">' + badges(it, today) + '</div></div>' +
      '<div class="sub">' + subLine(it) + '</div>' +
      (it.track ? '<div class="lots">' + lotsHtml(it, today) + '</div>' : '') +
      '<div class="nums">' +
        '<div class="nb"><span class="nl">残り' + (u ? '（' + u + '）' : '') + '</span><div class="stp">' +
          '<button type="button" data-act="q-" aria-label="残りを1減らす">−</button>' + qctl +
          '<button type="button" data-act="q+" aria-label="残りを1増やす">＋</button></div></div>' +
        '<div class="nb buy"><span class="nl">買い出し' + (u ? '（' + u + '）' : '') + '</span><div class="stp">' +
          '<button type="button" data-act="b-" aria-label="買い出しを1減らす">−</button>' +
          '<input class="bv" data-act="bset" inputmode="decimal" enterkeyhint="done" value="' + (it.buy ? fmt(it.buy) : '') + '" placeholder="0" aria-label="買い出しの数">' +
          '<button type="button" data-act="b+" aria-label="買い出しを1増やす">＋</button></div></div>' +
      '</div></article>';
  }
  // カードを作り直さず、変わるところだけ書きかえる
  function patchCard(el, it) {
    var today = new Date();
    var q = St.qty(it);
    el.className = cardClass(it);
    $('.bds', el).innerHTML = badges(it, today);
    $('.sub', el).innerHTML = subLine(it);
    if (it.track) {
      $('.lots', el).innerHTML = lotsHtml(it, today);
      var qb = $('.qv', el);
      qb.textContent = fmt(q);
      qb.classList.toggle('todo', q == null);
    } else {
      var qi = $('.qv', el);
      if (document.activeElement !== qi) qi.value = q == null ? '' : fmt(q);
    }
    var bi = $('.bv', el);
    if (document.activeElement !== bi) bi.value = it.buy ? fmt(it.buy) : '';
  }

  // ── 分類の画面
  function chipsHtml(cat, f, st) {
    var cs = [['all', '全部', st.all], ['low', '足りない', st.low], ['buy', '買う予定', st.buy]];
    if (st.todo) cs.push(['todo', '未入力', st.todo]);
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
        '<span class="xn">' + esc(r.it.name) + ' <b>' + fmt(r.l.qty) + esc(r.it.unit) + '</b></span>' +
        '<span class="xd">' + dateLabel(r.l.exp) + '</span><span class="xl">' + daysLabel(r.d) + '</span></button>';
    }).join('') +
      '<p class="hint">近いものからふだんの食事で使い、使った分を買い足しておくと無駄になりません。</p></div>';
  }
  function introHtml() {
    if (S.meta.introDone) return '';
    return '<div class="intro"><b>はじめに</b><p>見本の品を入れてあります。数えたものから「残り」を入れてください（入れるまでは「未入力」）。' +
      'いらない品は名前を押すと消せます。足すときは右下の＋。</p>' +
      '<p>防災の目安は 1人・1週間分です（水は1日3L、食事は1日3食、トイレは1日5回）。</p>' +
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
      low: '足りないものはありません。',
      buy: '買う予定のものはありません。',
      todo: '全部数えてあります。',
      exp: '期限が近いものはありません。'
    }[f] || '';
    return '<p class="empty">' + t + '</p>';
  }
  function viewCat(cat) {
    var today = new Date();
    var f = ui.filter[cat] || 'all';
    var list = S.items.filter(function (it) { return it.cat === cat && match(it, f, today); });
    main.innerHTML = '<div id="vhead">' + headHtml(cat) + '</div>' +
      (list.length ? '<div class="list">' + list.map(function (it) { return card(it, today); }).join('') + '</div>' : emptyHtml(f));
  }

  // ── 買い出しの画面
  function srow(it) {
    var u = esc(it.unit);
    var q = St.qty(it);
    return '<div class="srow c-' + it.cat + (it.buy > 0 ? '' : ' zero') + '" data-id="' + it.id + '">' +
      '<button type="button" class="got" data-act="bought">買った</button>' +
      '<div class="sn"><b>' + esc(it.name) + '</b><small>' + srowSub(it, q, u) + '</small></div>' +
      '<div class="stp sm"><button type="button" data-act="b-" aria-label="1減らす">−</button>' +
      '<input class="bv" data-act="bset" inputmode="decimal" enterkeyhint="done" value="' + fmt(it.buy) + '" aria-label="買う数">' +
      '<button type="button" data-act="b+" aria-label="1増やす">＋</button></div>' +
      '<span class="su">' + u + '</span></div>';
  }
  function srowSub(it, q, u) {
    // 「目安 12／本」のように数と単位の間で折り返さないよう、ひとかたまりずつ包む
    var p = ['残り ' + (q == null ? '未入力' : fmt(q) + u)];
    if (it.target) p.push('目安 ' + fmt(it.target) + u);
    if (it.memo) p.push(esc(it.memo));
    return p.map(function (x) { return '<span class="nw">' + x + '</span>'; }).join(' ・ ');
  }
  function patchRow(el, it) {
    el.classList.toggle('zero', !(it.buy > 0));
    var bi = $('.bv', el);
    if (document.activeElement !== bi) bi.value = fmt(it.buy);
  }
  function fillTargets() {
    return S.items.filter(function (it) { return St.shortfall(it) > it.buy; });
  }
  function shopHeadHtml() {
    var items = S.items.filter(function (it) { return it.buy > 0; });
    var fill = fillTargets();
    return '<div class="shop-head"><b>買うもの ' + items.length + '品</b>' +
      (items.length ? '<button type="button" class="ghost sm" data-act="copy">リストをコピー</button>' : '') + '</div>' +
      (fill.length ? '<button type="button" class="fill" data-act="fill">目安に足りない分を入れる（' + fill.length + '品）</button>' : '');
  }
  function viewShop() {
    var items = S.items.filter(function (it) { return it.buy > 0; });
    var h = '<div id="vhead">' + shopHeadHtml() + '</div>';
    if (!items.length) {
      h += '<p class="empty">買うものはありません。<br>各分類の「買い出し」に数を入れると、ここに集まります。</p>';
    } else {
      CATS.forEach(function (c) {
        var g = items.filter(function (it) { return it.cat === c.id; });
        if (!g.length) return;
        h += '<h3 class="grp g-' + c.id + '">' + c.name + '</h3><div class="slist">' + g.map(srow).join('') + '</div>';
      });
      h += '<p class="hint">「買った」を押すと、買い出しの数が残りに足されて、買い出しは0に戻ります。期限を記録する品は期限を聞きます。</p>';
    }
    main.innerHTML = h;
  }
  function shopText() {
    var d = new Date();
    var lines = ['買い出し（' + (d.getMonth() + 1) + '/' + d.getDate() + '）'];
    CATS.forEach(function (c) {
      var g = S.items.filter(function (it) { return it.cat === c.id && it.buy > 0; });
      if (!g.length) return;
      lines.push('', '【' + c.name + '】');
      g.forEach(function (it) { lines.push('・' + it.name + ' ' + fmt(it.buy) + it.unit + (it.memo ? '（' + it.memo + '）' : '')); });
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
        ? S.items.filter(function (it) { return it.buy > 0; }).length
        : S.items.filter(function (it) { return it.cat === v && needs(it, today); }).length;
      var c = $('.cnt', t);
      c.textContent = n || '';
      c.hidden = !n;
    });
  }
  function refreshHead() {
    var h = $('#vhead');
    if (!h) return;
    h.innerHTML = ui.view === 'shop' ? shopHeadHtml() : headHtml(ui.view);
  }
  var renderedDay = '';
  function render() {
    renderedDay = St.ymd(new Date());
    renderTabs();
    if (ui.view === 'shop') viewShop(); else viewCat(ui.view);
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
    var lots = it && it.track ? St.sortLots(it.lots).map(function (l) { return { qty: fmt(l.qty), exp: l.exp }; }) : [];
    var q = it ? St.qty(it) : null;
    var html = '<form class="form" id="ef" autocomplete="off" novalidate>' +
      field('名前', '<input name="nm" maxlength="40" value="' + esc(it ? it.name : '') + '" placeholder="例：しょうゆ">') +
      '<div class="f"><span class="fl">分類</span><div class="seg">' + CATS.map(function (c) {
        return '<label><input type="radio" name="cat" value="' + c.id + '"' + (c.id === cat ? ' checked' : '') + '><span>' + c.name + '</span></label>';
      }).join('') + '</div></div>' +
      '<div class="row2">' +
        field('単位', '<input name="unit" list="units" maxlength="8" value="' + esc(it ? it.unit : '') + '" placeholder="本・個・袋">') +
        field('目安（置いておきたい数）', '<input name="tgt" inputmode="decimal" value="' + (it && it.target ? fmt(it.target) : '') + '" placeholder="なし">') +
      '</div>' +
      '<label class="tg"><input type="checkbox" name="track"' + (track ? ' checked' : '') + '><span>期限を記録する</span></label>' +
      '<div id="qbox"' + (track ? ' hidden' : '') + '>' +
        field('残り', '<input name="qty" inputmode="decimal" value="' + (q == null || track ? '' : fmt(q)) + '" placeholder="まだ数えていない">') +
      '</div>' +
      '<div id="lbox" class="f"' + (track ? '' : ' hidden') + '><span class="fl">残り（期限ごと）</span>' +
        '<div id="lots"></div>' +
        '<button type="button" class="ghost sm" id="lotAdd">＋ 期限の違う組を足す</button>' +
        '<p class="hint">−で減らすときは、期限の古い組から減ります。</p></div>' +
      field('買い出し数', '<input name="buy" inputmode="decimal" value="' + (it && it.buy ? fmt(it.buy) : '') + '" placeholder="0">') +
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
          '<input class="lq" inputmode="decimal" value="' + esc(l.qty) + '" placeholder="数" aria-label="数">' +
          '<input class="le" type="date" value="' + esc(l.exp) + '" aria-label="期限">' +
          '<button type="button" class="lx" aria-label="この組を消す">×</button></div>';
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
      lots.push({ qty: '', exp: '' });
      drawLots();
      $('.lotrow:last-child .lq', lotsEl).focus();
    });
    drawLots();

    function switchTrack(on) {
      if (on) {
        var n = St.toNum(E.qty.value);
        lots = !isNaN(n) && n > 0 ? [{ qty: fmt(St.round(n)), exp: '' }] : [];
        drawLots();
      } else {
        var sum = lots.reduce(function (s, l) { return s + St.nonNeg(l.qty); }, 0);
        E.qty.value = lots.length ? fmt(St.round(sum)) : '';
      }
      $('#qbox').hidden = on;
      $('#lbox').hidden = !on;
    }
    E.track.addEventListener('change', function () { trackTouched = true; switchTrack(E.track.checked); });
    // 新しい品は、分類を変えたら「期限を記録する」もその分類の決まりに合わせる（自分で触っていなければ）
    f.addEventListener('change', function (e) {
      if (e.target.name !== 'cat' || it || trackTouched) return;
      var on = St.catOf(e.target.value).track;
      if (on !== E.track.checked) { E.track.checked = on; switchTrack(on); }
    });

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = E.nm.value.trim();
      if (!name) { E.nm.focus(); toast('名前を入れてください'); return; }
      var on = E.track.checked;
      var o = { name: name, cat: E.cat.value, unit: E.unit.value, target: E.tgt.value, buy: E.buy.value, memo: E.memo.value, track: on };
      if (on) {
        var bad = lots.filter(function (l) { return l.exp && !(St.nonNeg(l.qty) > 0); });
        if (bad.length) { toast('期限を入れた組に、数を入れてください'); return; }
        var kept = lots.filter(function (l) { return St.nonNeg(l.qty) > 0; });
        o.lots = kept.map(function (l) { return { qty: l.qty, exp: l.exp }; });
        o.counted = kept.length > 0 || !!(it && it.counted);
      } else {
        var n = St.toNum(E.qty.value);
        o.counted = !isNaN(n);
        o.qty = isNaN(n) ? 0 : n;
      }
      if (it) {
        var n2 = St.normalize(Object.assign({}, o, { id: it.id }));
        Object.keys(n2).forEach(function (k) { it[k] = n2[k]; });
        // 分類を変えたら、移った先を見せる（そのままだと品が消えたように見える）
        if (ui.view !== 'shop' && ui.view !== it.cat) { ui.view = it.cat; saveUi(); }
        toast('直しました');
      } else {
        S.items.push(St.normalize(o));
        if (ui.view !== 'shop') ui.view = o.cat;
        saveUi();
        toast('「' + name + '」を足しました');
      }
      persist();
      closeSheet();
      render();
    });

    if (it) {
      $('#del').addEventListener('click', function () {
        var before = snap();
        S.items = S.items.filter(function (x) { return x !== it; });
        persist();
        closeSheet();
        render();
        toast('「' + it.name + '」を消しました', before);
      });
    } else {
      setTimeout(function () { E.nm.focus(); }, 50);
    }
  }

  // ── 買った（期限を記録する品は期限を聞く）
  function doBought(it) {
    if (!it.track) {
      var before = snap();
      var n = it.buy;
      St.bought(it);
      persist();
      render();
      toast(it.name + 'を' + fmt(n) + it.unit + '残りに足しました', before);
      return;
    }
    var html = '<form class="form" id="bf" autocomplete="off" novalidate>' +
      '<p class="lead">' + esc(it.name) + 'を残りに足します。期限が分かれば入れてください。</p>' +
      field('買った数' + (it.unit ? '（' + esc(it.unit) + '）' : ''), '<input name="cnt" inputmode="decimal" value="' + fmt(it.buy) + '">') +
      field('期限（賞味期限・使用期限）', '<input name="exp" type="date">') +
      '<p class="hint">分からなければ空のままで足せます（「期限なし」の組になります）。</p>' +
      '<button type="submit" class="primary">残りに足す</button></form>';
    openSheet('買った', html);
    var f = $('#bf');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var n = St.toNum(f.elements.cnt.value);
      if (isNaN(n) || n <= 0) { f.elements.cnt.focus(); toast('買った数を入れてください'); return; }
      var before = snap();
      St.bought(it, n, f.elements.exp.value);
      persist();
      closeSheet();
      render();
      toast(it.name + 'を' + fmt(St.round(n)) + it.unit + '残りに足しました', before);
    });
  }

  function doFill() {
    var list = fillTargets();
    if (!list.length) return;
    var before = snap();
    list.forEach(function (it) { it.buy = St.shortfall(it); });
    persist();
    render();
    toast(list.length + '品の買い出しに、目安に足りない分を入れました', before);
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
    if (!S.items.some(function (it) { return it.counted; })) return false;
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
      '<section class="set"><h4>見本</h4>' +
        '<p>はじめに入っていた品のうち、今の一覧に無いものを足します。今ある品と数はそのままです（消した見本も戻ります）。</p>' +
        '<button type="button" class="ghost" id="seedBtn">見本から足りないものを足す</button>' +
      '</section>' +
      '<section class="set"><h4>しるしの意味</h4>' +
        '<ul class="legend">' +
          '<li><span class="bd out">なし</span>残りが0</li>' +
          '<li><span class="bd low">少ない</span>目安より少ない（目安を入れた品だけ）</li>' +
          '<li><span class="bd over">期限切れ</span>期限を過ぎた組がある</li>' +
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
      if (!n) { toast('足りない見本はありません'); return; }
      persist();
      closeSheet();
      render();
      toast('見本を' + n + '品足しました', before);
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
    if (act === 'qset' || act === 'bset') return;
    var host = b.closest('[data-id]');
    var it = host ? find(host.dataset.id) : null;
    switch (act) {
      case 'q-': case 'q+':
        if (it) { St.step(it, act === 'q+' ? 1 : -1); changed(it); }
        break;
      case 'b-': case 'b+':
        if (it) { St.stepBuy(it, act === 'b+' ? 1 : -1); changed(it); }
        break;
      case 'edit':
        if (it) openEdit(it.id);
        break;
      case 'bought':
        if (it && it.buy > 0) doBought(it);
        else toast('買う数を入れてから押してください');
        break;
      case 'fill': doFill(); break;
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
    }
  });
  main.addEventListener('change', function (e) {
    var inp = e.target;
    var act = inp.dataset && inp.dataset.act;
    if (act !== 'qset' && act !== 'bset') return;
    var host = inp.closest('[data-id]');
    var it = host && find(host.dataset.id);
    if (!it) return;
    if (act === 'qset') St.setQty(it, inp.value); else St.setBuy(it, inp.value);
    changed(it);
    if (act === 'qset') inp.value = St.qty(it) == null ? '' : fmt(St.qty(it));
    else inp.value = host.classList.contains('srow') ? fmt(it.buy) : (it.buy ? fmt(it.buy) : '');
  });
  main.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches('input.qv, input.bv')) e.target.blur();
  });
  main.addEventListener('focusin', function (e) {
    if (e.target.matches('input.qv, input.bv')) setTimeout(function () { try { e.target.select(); } catch (x) { /* なにもしない */ } }, 0);
  });

  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { go(t.dataset.view); });
  });
  $('#fab').addEventListener('click', function () { openEdit(null); });
  $('#setBtn').addEventListener('click', openSettings);

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
})();
