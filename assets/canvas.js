/* بومِ گرافیکی: جابه‌جایی، زوم، بلوک، پورت، پیوندِ راست‌گوشه که از میانِ شکل‌ها رد نمی‌شود. بدونِ ?. */
(function (W) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var PALETTE = ['#2f6fed', '#7a5af8', '#e0558a', '#d64545', '#e0912b', '#d4a514', '#1f9d63', '#14a3a3', '#64748b', '#1c2333'];

  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function sv(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- مسیرِ شکل‌ها ---------- */
  function shapePath(shape, w, h) {
    var r = 12, s = Math.min(26, h * 0.3);
    switch (shape) {
      case 'diamond': return 'M' + w / 2 + ' 1 L' + (w - 1) + ' ' + h / 2 + ' L' + w / 2 + ' ' + (h - 1) + ' L1 ' + h / 2 + 'Z';
      case 'term': { var q = h / 2; return 'M' + q + ' 1 H' + (w - q) + ' A' + (q - 1) + ' ' + (q - 1) + ' 0 0 1 ' + (w - q) + ' ' + (h - 1) + ' H' + q + ' A' + (q - 1) + ' ' + (q - 1) + ' 0 0 1 ' + q + ' 1Z'; }
      case 'para': return 'M' + s + ' 1 H' + (w - 1) + ' L' + (w - s) + ' ' + (h - 1) + ' H1Z';
      case 'db': { var e = Math.min(14, h * 0.2); return 'M1 ' + e + ' A' + (w / 2 - 1) + ' ' + e + ' 0 0 1 ' + (w - 1) + ' ' + e + ' V' + (h - e) + ' A' + (w / 2 - 1) + ' ' + e + ' 0 0 1 1 ' + (h - e) + 'Z M1 ' + e + ' A' + (w / 2 - 1) + ' ' + e + ' 0 0 0 ' + (w - 1) + ' ' + e; }
      case 'note': return 'M1 1 H' + (w - 16) + ' L' + (w - 1) + ' 16 V' + (h - 1) + ' H1Z M' + (w - 16) + ' 1 V16 H' + (w - 1);
      case 'sub': return 'M' + r + ' 1 H' + (w - r) + ' Q' + (w - 1) + ' 1 ' + (w - 1) + ' ' + r + ' V' + (h - r) + ' Q' + (w - 1) + ' ' + (h - 1) + ' ' + (w - r) + ' ' + (h - 1) + ' H' + r + ' Q1 ' + (h - 1) + ' 1 ' + (h - r) + ' V' + r + ' Q1 1 ' + r + ' 1Z M14 1 V' + (h - 1) + ' M' + (w - 14) + ' 1 V' + (h - 1);
      default: return 'M' + r + ' 1 H' + (w - r) + ' Q' + (w - 1) + ' 1 ' + (w - 1) + ' ' + r + ' V' + (h - r) + ' Q' + (w - 1) + ' ' + (h - 1) + ' ' + (w - r) + ' ' + (h - 1) + ' H' + r + ' Q1 ' + (h - 1) + ' 1 ' + (h - r) + ' V' + r + ' Q1 1 ' + r + ' 1Z';
    }
  }

  /* ---------- لنگرها ---------- */
  function anchor(it, tx, ty) {
    var cx = it.x + it.w / 2, cy = it.y + it.h / 2, dx = tx - cx, dy = ty - cy;
    if (Math.abs(dx) * it.h >= Math.abs(dy) * it.w) return dx >= 0 ? { x: it.x + it.w, y: cy, nx: 1, ny: 0 } : { x: it.x, y: cy, nx: -1, ny: 0 };
    return dy >= 0 ? { x: cx, y: it.y + it.h, nx: 0, ny: 1 } : { x: cx, y: it.y, nx: 0, ny: -1 };
  }
  function portAnchor(it, side, name) { /* side: 'in' = لبهٔ راست، 'out' = لبهٔ چپ */
    var list = it.ports && it.ports[side] || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return side === 'in' ? { x: it.x + it.w, y: it.y + list[i].y, nx: 1, ny: 0 } : { x: it.x, y: it.y + list[i].y, nx: -1, ny: 0 };
    return null;
  }
  function curve(a, b, na, nb) { // خمِ نرم (برای پیش‌نمایشِ کشیدن و حالتِ جایگزین)
    var d = Math.max(36, Math.min(160, Math.hypot(b.x - a.x, b.y - a.y) / 2.4));
    var c1 = { x: a.x + na.nx * d, y: a.y + na.ny * d }, c2 = { x: b.x + nb.nx * d, y: b.y + nb.ny * d };
    return { d: 'M' + a.x + ' ' + a.y + ' C' + c1.x + ' ' + c1.y + ' ' + c2.x + ' ' + c2.y + ' ' + b.x + ' ' + b.y,
      mid: { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 } };
  }

  /* ---------- مسیریابیِ راست‌گوشه (گرافِ دیدِ متعامد + A*) ---------- */
  function Heap() { this.a = []; }
  Heap.prototype.push = function (n) { var a = this.a, i = a.length; a.push(n); while (i > 0) { var p = (i - 1) >> 1; if (a[p].f <= n.f) break; a[i] = a[p]; i = p; } a[i] = n; };
  Heap.prototype.pop = function () { var a = this.a, top = a[0], last = a.pop(); if (a.length) { var i = 0, n = a.length; for (;;) { var l = 2 * i + 1, r = l + 1, m = i, mv = last.f; if (l < n && a[l].f < mv) { m = l; mv = a[l].f; } if (r < n && a[r].f < mv) { m = r; } if (m === i) break; a[i] = a[m]; i = m; } a[i] = last; } return top; };
  Heap.prototype.size = function () { return this.a.length; };

  function segHits(x1, y1, x2, y2, R) {
    if (y1 === y2) { if (y1 <= R.t || y1 >= R.b) return false; return Math.max(x1, x2) > R.l && Math.min(x1, x2) < R.r; }
    if (x1 <= R.l || x1 >= R.r) return false; return Math.max(y1, y2) > R.t && Math.min(y1, y2) < R.b;
  }
  function inside(x, y, R) { return x > R.l && x < R.r && y > R.t && y < R.b; }
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function routeOrtho(a, b, obs, used) {
    var S = 20, A = { x: a.x + a.nx * S, y: a.y + a.ny * S }, B = { x: b.x + b.nx * S, y: b.y + b.ny * S };
    var xs = [A.x, B.x], ys = [A.y, B.y], i, j;
    obs.forEach(function (o) { xs.push(o.l, o.r); ys.push(o.t, o.b); });
    xs.sort(function (p, q) { return p - q; }); ys.sort(function (p, q) { return p - q; });
    xs = xs.filter(function (v, k) { return k === 0 || v !== xs[k - 1]; }); ys = ys.filter(function (v, k) { return k === 0 || v !== ys[k - 1]; });
    var nx = xs.length, ny = ys.length;
    if (nx * ny > 9000) return null;
    var ix = {}, iy = {}; xs.forEach(function (v, k) { ix[v] = k; }); ys.forEach(function (v, k) { iy[v] = k; });
    var sI = ix[A.x], sJ = iy[A.y], tI = ix[B.x], tJ = iy[B.y];
    var freeMemo = {};
    function free(i2, j2) {
      var k = i2 * ny + j2; if (freeMemo[k] != null) return freeMemo[k];
      var r = true;
      if (!((i2 === sI && j2 === sJ) || (i2 === tI && j2 === tJ))) for (var q = 0; q < obs.length; q++) if (inside(xs[i2], ys[j2], obs[q])) { r = false; break; }
      return (freeMemo[k] = r);
    }
    function clear(x1, y1, x2, y2) { for (var q = 0; q < obs.length; q++) if (segHits(x1, y1, x2, y2, obs[q])) return false; return true; }
    function overlapPenalty(x1, y1, x2, y2) {
      var p = 0;
      for (var q = 0; q < used.length; q++) {
        var u = used[q];
        if (y1 === y2 && u.h && Math.abs(u.c - y1) < 4 && Math.max(x1, x2) > u.lo && Math.min(x1, x2) < u.hi) p += 60;
        else if (x1 === x2 && !u.h && Math.abs(u.c - x1) < 4 && Math.max(y1, y2) > u.lo && Math.min(y1, y2) < u.hi) p += 60;
      }
      return p;
    }
    var heap = new Heap(), best = {}, prev = {}, goal = null;
    function key(i2, j2, d) { return (i2 * ny + j2) * 5 + d; }
    function hfun(i2, j2) { return Math.abs(xs[i2] - xs[tI]) + Math.abs(ys[j2] - ys[tJ]); }
    var st = { i: sI, j: sJ, d: 4, g: 0, f: hfun(sI, sJ) };
    heap.push(st); best[key(sI, sJ, 4)] = 0;
    var guard = 0;
    while (heap.size() && guard++ < 40000) {
      var cur = heap.pop();
      if (cur.g > (best[key(cur.i, cur.j, cur.d)] != null ? best[key(cur.i, cur.j, cur.d)] : 1e18)) continue;
      if (cur.i === tI && cur.j === tJ) { if (cur.d !== 4 && (b.nx || b.ny) && DIRS[cur.d][0] === b.nx && DIRS[cur.d][1] === b.ny) continue; goal = cur; break; }
      for (var d = 0; d < 4; d++) {
        var ni = cur.i + DIRS[d][0], nj = cur.j + DIRS[d][1];
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny || !free(ni, nj)) continue;
        if (cur.d !== 4 && ((cur.d ^ 1) === d)) continue; /* برگشت به عقب ممنوع */
        var x1 = xs[cur.i], y1 = ys[cur.j], x2 = xs[ni], y2 = ys[nj];
        if (!clear(x1, y1, x2, y2)) continue;
        var turn = cur.d !== 4 && cur.d !== d ? 40 : 0;
        /* ورود به گره‌ی مقصد باید در جهتِ خلافِ بردارِ نرمالِ آن باشد؛ خروج از مبدأ در جهتِ بردار */
        if (cur.i === sI && cur.j === sJ && cur.d === 4) { if (DIRS[d][0] === -a.nx && DIRS[d][1] === -a.ny && (a.nx || a.ny)) turn += 80; }
        var g = cur.g + Math.abs(x2 - x1) + Math.abs(y2 - y1) + turn + overlapPenalty(x1, y1, x2, y2);
        var k2 = key(ni, nj, d);
        if (best[k2] == null || g < best[k2]) { best[k2] = g; prev[k2] = cur; heap.push({ i: ni, j: nj, d: d, g: g, f: g + hfun(ni, nj) }); }
      }
    }
    if (!goal) return null;
    var pts = [], n = goal;
    while (n) { pts.unshift({ x: xs[n.i], y: ys[n.j] }); n = prev[key(n.i, n.j, n.d)]; }
    pts.unshift({ x: a.x, y: a.y }); pts.push({ x: b.x, y: b.y });
    return simplify(pts);
  }
  function simplify(p) {
    var dd = [p[0]];
    for (var z = 1; z < p.length; z++) if (p[z].x !== dd[dd.length - 1].x || p[z].y !== dd[dd.length - 1].y) dd.push(p[z]);
    p = dd; if (p.length < 2) return [p[0], p[0]];
    var o = [p[0]];
    for (var i = 1; i < p.length - 1; i++) {
      var a = o[o.length - 1], b = p[i], c = p[i + 1];
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) continue;
      o.push(b);
    }
    o.push(p[p.length - 1]);
    return o;
  }
  function quickRoute(a, b) { /* مسیرِ سریع هنگامِ کشیدن */
    var S = 20, A = { x: a.x + a.nx * S, y: a.y + a.ny * S }, B = { x: b.x + b.nx * S, y: b.y + b.ny * S }, pts;
    if (a.nx && b.nx) { var mx = (A.x + B.x) / 2; pts = [a, A, { x: mx, y: A.y }, { x: mx, y: B.y }, B, b]; }
    else if (a.ny && b.ny) { var my = (A.y + B.y) / 2; pts = [a, A, { x: A.x, y: my }, { x: B.x, y: my }, B, b]; }
    else if (a.nx) pts = [a, A, { x: A.x, y: B.y }, B, b]; else pts = [a, A, { x: B.x, y: A.y }, B, b];
    return simplify(pts);
  }
  function toPath(pts) { /* چندخطیِ راست‌گوشه با گوشهٔ گرد */
    var r = 10, d = 'M' + pts[0].x + ' ' + pts[0].y;
    for (var i = 1; i < pts.length - 1; i++) {
      var p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      var l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1, l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1, rr = Math.min(r, l1 / 2, l2 / 2);
      var ax = p1.x - (p1.x - p0.x) / l1 * rr, ay = p1.y - (p1.y - p0.y) / l1 * rr, bx = p1.x + (p2.x - p1.x) / l2 * rr, by = p1.y + (p2.y - p1.y) / l2 * rr;
      d += ' L' + ax + ' ' + ay + ' Q' + p1.x + ' ' + p1.y + ' ' + bx + ' ' + by;
    }
    return d + ' L' + pts[pts.length - 1].x + ' ' + pts[pts.length - 1].y;
  }
  function midFree(pts, obs) { /* وسطِ بلندترین قطعه‌ای که داخلِ هیچ بلوکی نیست */
    var best = null, bl = -1;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, bad = false;
      for (var q = 0; q < obs.length; q++) { var R = obs[q]; if (m.x > R.l + 14 && m.x < R.r - 14 && m.y > R.t + 14 && m.y < R.b - 14) { bad = true; break; } }
      if (!bad && l > bl) { bl = l; best = m; }
    }
    return best || midOf(pts);
  }
  function midOf(pts) {
    var tot = 0, i; for (i = 1; i < pts.length; i++) tot += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    var half = tot / 2, acc = 0;
    for (i = 1; i < pts.length; i++) {
      var l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (acc + l >= half) { var t = (half - acc) / (l || 1); return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }; }
      acc += l;
    }
    return pts[0];
  }
  function recordUsed(pts, used) {
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i - 1], q = pts[i];
      if (p.y === q.y) used.push({ h: true, c: p.y, lo: Math.min(p.x, q.x), hi: Math.max(p.x, q.x) });
      else if (p.x === q.x) used.push({ h: false, c: p.x, lo: Math.min(p.y, q.y), hi: Math.max(p.y, q.y) });
    }
  }

  /* ================= موتور ================= */
  function create(host, o) {
    o = o || {};
    var C = { items: [], links: [], view: o.view || { x: 40, y: 40, k: 1 }, sel: {}, selLink: null, snap: o.snap !== false ? 10 : 0, ro: !!o.readonly, armed: null, geo: {} };
    var itemEl = {}, linkEl = {}, labelEl = {};
    host.classList.add('cv'); host.innerHTML = '';
    host.setAttribute('tabindex', '0');
    var world = h('div', 'cv-world');
    var svg = sv('svg', { 'class': 'cv-svg', width: 1, height: 1 });
    svg.setAttribute('style', 'overflow:visible');
    var defs = sv('defs', {});
    svg.appendChild(defs);
    var linkLayer = sv('g', {}), tmpLayer = sv('g', {});
    svg.appendChild(linkLayer); svg.appendChild(tmpLayer);
    var itemLayer = h('div', 'cv-items'), labelLayer = h('div', 'cv-labels');
    world.appendChild(svg); world.appendChild(itemLayer); world.appendChild(labelLayer);
    var ui = h('div', 'cv-ui');
    host.appendChild(world); host.appendChild(ui);
    var tb = h('div', 'cv-tb'); tb.style.display = 'none'; ui.appendChild(tb);
    var editor = null;
    var MARKER = 'cvah' + (o.id || ''), markers = {};
    function markerFor(color) {
      color = color || '#7d88a3';
      var id = MARKER + color.replace('#', '');
      if (!markers[id]) {
        var m = sv('marker', { id: id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
        m.appendChild(sv('path', { d: 'M0 0L10 5L0 10z', fill: color })); defs.appendChild(m); markers[id] = 1;
      }
      return 'url(#' + id + ')';
    }

    function byId(id) { for (var i = 0; i < C.items.length; i++) if (C.items[i].id === id) return C.items[i]; return null; }
    function linkById(id) { for (var i = 0; i < C.links.length; i++) if (C.links[i].id === id) return C.links[i]; return null; }
    function applyView() {
      var v = C.view;
      world.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.k + ')';
      host.style.backgroundPosition = v.x + 'px ' + v.y + 'px';
      host.style.backgroundSize = (24 * v.k) + 'px ' + (24 * v.k) + 'px';
      placeToolbar();
      if (o.onView) o.onView({ x: v.x, y: v.y, k: v.k });
    }
    function toWorld(cx, cy) { var r = host.getBoundingClientRect(); return { x: (cx - r.left - C.view.x) / C.view.k, y: (cy - r.top - C.view.y) / C.view.k }; }
    function toScreen(x, y) { return { x: x * C.view.k + C.view.x, y: y * C.view.k + C.view.y }; }
    function snapv(v) { return C.snap ? Math.round(v / C.snap) * C.snap : v; }

    /* ----- ساختِ DOM ----- */
    function buildItem(it) {
      var el = h('div', 'cvi cvs-' + (it.shape || 'card') + (it.ghost ? ' ghost' : '') + (it.cls ? ' ' + it.cls : ''));
      el.setAttribute('data-id', it.id);
      if (it.color) el.style.setProperty('--ic', it.color);
      var inner = '', shape = it.shape || 'card';
      if (shape !== 'card') {
        inner += '<svg class="cvsh" viewBox="0 0 ' + it.w + ' ' + it.h + '" preserveAspectRatio="none"><path d="' + shapePath(shape, it.w, it.h) + '" vector-effect="non-scaling-stroke"/></svg>';
        inner += '<div class="cvt">' + (it.html != null ? it.html : esc(it.text || '')) + '</div>';
      } else inner += it.html || '';
      if (!it.ghost && !C.ro) inner += '<i class="cvp p-t" data-p="t"></i><i class="cvp p-r" data-p="r"></i><i class="cvp p-b" data-p="b"></i><i class="cvp p-l" data-p="l"></i>';
      if (it.ports) ['in', 'out'].forEach(function (side) {
        (it.ports[side] || []).forEach(function (p) {
          inner += '<i class="cvpt ' + side + (p.unused ? ' unused' : '') + (p.warn ? ' warn' : '') + '" data-pt="' + side + '" data-name="' + esc(p.name) + '" style="top:' + p.y + 'px" title="' + (side === 'in' ? 'ورودی: ' : 'خروجی: ') + esc(p.name) + (p.tip ? ' — ' + esc(p.tip) : '') + ' (کلیک = جزئیات)"></i>';
        });
      });
      el.innerHTML = inner;
      return el;
    }
    function placeItem(it, el) { el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; el.style.width = it.w + 'px'; el.style.height = it.h + 'px'; }

    function endpoints(l) {
      var a = byId(l.from), b = byId(l.to); if (!a || !b) return null;
      var pa = l.fromPort ? portAnchor(a, 'out', l.fromPort) : null, pb = l.toPort ? portAnchor(b, 'in', l.toPort) : null;
      var ca = { x: b.x + b.w / 2, y: b.y + b.h / 2 }, cb = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
      if (!pa) pa = anchor(a, pb ? pb.x : ca.x, pb ? pb.y : ca.y);
      if (!pb) pb = anchor(b, pa.x, pa.y);
      return { a: pa, b: pb, from: a, to: b };
    }
    function routeLink(l, quick, obs, used) {
      var e = endpoints(l); if (!e) return null;
      var pts = null;
      if (!quick && o.route !== false) {
        /* اول مسیرِ کوتاهِ مستقیم؛ اگر از شکلِ دیگری رد نشد همان بهتر است */
        var q = quickRoute(e.a, e.b), ok = true, fi = -1, ti = -1;
        for (var z = 0; z < C.items.length; z++) { if (C.items[z].id === l.from) fi = z; if (C.items[z].id === l.to) ti = z; }
        for (var oi = 0; oi < obs.length && ok; oi++) {
          var own = oi === fi || oi === ti;
          for (var si = own ? 2 : 1; si < (own ? q.length - 1 : q.length); si++) if (segHits(q[si - 1].x, q[si - 1].y, q[si].x, q[si].y, obs[oi])) { ok = false; break; }
        }
        pts = ok ? q : routeOrtho(e.a, e.b, obs, used);
      }
      if (!pts) pts = quickRoute(e.a, e.b);
      return { pts: pts, d: toPath(pts), mid: obs && !quick ? midFree(pts, obs) : midOf(pts) };
    }
    function obstacles() { return C.items.map(function (it) { return { l: it.x - 14, t: it.y - 14, r: it.x + it.w + 14, b: it.y + it.h + 14 }; }); }
    function drawLink(l, g) {
      var geo = C.geo[l.id]; if (!geo) return;
      var el = linkEl[l.id];
      if (!el) {
        el = sv('g', { 'class': 'cvl' }); el.setAttribute('data-lid', l.id);
        el.appendChild(sv('path', { 'class': 'cvl-v', fill: 'none', 'stroke-linejoin': 'round' }));
        el.appendChild(sv('path', { 'class': 'cvl-h', fill: 'none' }));
        linkLayer.appendChild(el); linkEl[l.id] = el;
      }
      var v = el.childNodes[0], hit = el.childNodes[1];
      v.setAttribute('d', geo.d); hit.setAttribute('d', geo.d);
      v.setAttribute('stroke', l.color || '#7d88a3'); v.setAttribute('stroke-width', l.w || 2);
      if (l.dashed) v.setAttribute('stroke-dasharray', '6 5'); else v.removeAttribute('stroke-dasharray');
      if (l.arrow !== false) v.setAttribute('marker-end', markerFor(l.color)); else v.removeAttribute('marker-end');
      if (l.both) v.setAttribute('marker-start', markerFor(l.color)); else v.removeAttribute('marker-start');
      el.setAttribute('class', 'cvl' + (C.selLink === l.id ? ' sel' : '') + (l.locked ? ' locked' : ''));
      var lb = labelEl[l.id];
      if (l.label) {
        if (!lb) { lb = h('div', 'cv-lbl'); lb.setAttribute('data-lid', l.id); labelLayer.appendChild(lb); labelEl[l.id] = lb; }
        lb.textContent = l.label; lb.title = l.label; lb.style.left = geo.mid.x + 'px'; lb.style.top = geo.mid.y + 'px';
        lb.className = 'cv-lbl' + (C.selLink === l.id ? ' sel' : '');
        lb.style.borderColor = l.color || '';
      } else if (lb) { lb.remove(); delete labelEl[l.id]; }
    }
    /* quick=true: فقط مسیرِ سریع (هنگام کشیدن)؛ only: فقط پیوندهای متصل به این آیتم‌ها */
    function drawAllLinks(quick, only) {
      var obs = quick ? null : obstacles(), used = [];
      if (C.items.length > 90) quick = true;
      C.links.forEach(function (l) {
        if (only && !only[l.from] && !only[l.to]) { if (C.geo[l.id]) { var old = C.geo[l.id]; if (!quick) recordUsed(old.pts, used); } return; }
        var g = routeLink(l, quick, obs, used); if (g) { C.geo[l.id] = g; if (!quick) recordUsed(g.pts, used); }
      });
      C.links.forEach(function (l) { drawLink(l); });
    }

    C.setData = function (items, links, keepSel) {
      C.items = items; C.links = links; C.geo = {};
      itemLayer.innerHTML = ''; linkLayer.innerHTML = ''; labelLayer.innerHTML = ''; itemEl = {}; linkEl = {}; labelEl = {};
      if (!keepSel) { C.sel = {}; C.selLink = null; }
      items.forEach(function (it) { var el = buildItem(it); placeItem(it, el); itemLayer.appendChild(el); itemEl[it.id] = el; if (C.sel[it.id]) el.classList.add('sel'); });
      drawAllLinks(false); placeToolbar();
    };
    C.setReadonly = function (v) { v = !!v; if (C.ro === v) return; C.ro = v; C.setData(C.items, C.links, true); };
    C.selectedIds = function () { return Object.keys(C.sel); };

    /* ----- انتخاب ----- */
    function setSel(ids, linkId) {
      C.sel = {}; (ids || []).forEach(function (i) { C.sel[i] = 1; }); C.selLink = linkId || null;
      for (var id in itemEl) itemEl[id].classList.toggle('sel', !!C.sel[id]);
      for (var lid in linkEl) { linkEl[lid].setAttribute('class', 'cvl' + (C.selLink === lid ? ' sel' : '') + ((linkById(lid) || {}).locked ? ' locked' : '')); if (labelEl[lid]) labelEl[lid].classList.toggle('sel', C.selLink === lid); }
      placeToolbar();
      if (o.onSelect) o.onSelect(ids && ids.length === 1 ? byId(ids[0]) : null, linkId ? linkById(linkId) : null, ids || []);
    }
    C.select = setSel;

    /* ----- نوارابزارِ شناور ----- */
    function colorDots(cur, fn) {
      var w = h('span', 'cv-dots');
      PALETTE.forEach(function (c) { var d = h('i', 'cv-dot' + (cur === c ? ' on' : '')); d.style.background = c; d.title = c; d.addEventListener('click', function (e) { e.stopPropagation(); fn(c); }); w.appendChild(d); });
      var x = h('i', 'cv-dot none', '∅'); x.title = 'رنگِ پیش‌فرض'; x.addEventListener('click', function (e) { e.stopPropagation(); fn(null); }); w.appendChild(x);
      return w;
    }
    function btn(icon, title, fn) { var b = h('button', 'cv-b', icon); b.type = 'button'; b.title = title; b.addEventListener('click', function (e) { e.stopPropagation(); fn(); }); return b; }
    function placeToolbar() {
      var ids = C.selectedIds();
      tb.innerHTML = '';
      if (editor) { tb.style.display = 'none'; return; }
      var pos = null;
      if (ids.length === 1 && !C.selLink) {
        var it = byId(ids[0]); if (!it || it.ghost) { tb.style.display = 'none'; return; }
        if (C.ro) { if (o.readActions) o.readActions(it).forEach(function (a) { tb.appendChild(btn(a.icon, a.title, function () { a.fn(it); })); }); }
        else {
          if (!it.noColor && o.onColor) tb.appendChild(colorDots(it.color, function (c) { o.onColor(it, c); }));
          if (o.itemActions) o.itemActions(it).forEach(function (a) { tb.appendChild(btn(a.icon, a.title, function () { a.fn(it); })); });
          if (!it.noEdit) tb.appendChild(btn('✎', 'ویرایش متن', function () { C.edit(it.id); }));
          if (!it.noDelete) tb.appendChild(btn('🗑', 'حذف', function () { if (o.onDelete) o.onDelete([it.id]); }));
        }
        pos = toScreen(it.x + it.w / 2, it.y);
      } else if (ids.length > 1 && !C.ro) {
        tb.appendChild(h('span', 'cv-n', ids.length + ' مورد'));
        if (o.onColor) tb.appendChild(colorDots(null, function (c) { ids.forEach(function (i) { var it = byId(i); if (it && !it.ghost) o.onColor(it, c); }); }));
        tb.appendChild(btn('🗑', 'حذف همه', function () { if (o.onDelete) o.onDelete(ids.filter(function (i) { var it = byId(i); return it && !it.ghost && !it.noDelete; })); }));
        var minx = 1e9, miny = 1e9, maxx = -1e9;
        ids.forEach(function (i) { var it = byId(i); if (it) { minx = Math.min(minx, it.x); miny = Math.min(miny, it.y); maxx = Math.max(maxx, it.x + it.w); } });
        pos = toScreen((minx + maxx) / 2, miny);
      } else if (C.selLink && !C.ro) {
        var l = linkById(C.selLink), geo = l && C.geo[l.id];
        if (!l || !geo || l.locked) { tb.style.display = 'none'; return; }
        if (o.onLinkColor) tb.appendChild(colorDots(l.color, function (c) { o.onLinkColor(l, c); }));
        tb.appendChild(btn('✎', 'برچسب', function () { C.editLabel(l.id); }));
        if (o.onLinkBoth) tb.appendChild(btn(l.both ? '→' : '⇄', l.both ? 'یک‌طرفه کن' : 'دوطرفه کن', function () { o.onLinkBoth(l); }));
        if (o.onLinkReverse && !l.both) tb.appendChild(btn('↺', 'برعکس‌کردنِ جهت', function () { o.onLinkReverse(l); }));
        tb.appendChild(btn('🗑', 'حذفِ پیوند', function () { if (o.onLinkDelete) o.onLinkDelete(l); }));
        pos = toScreen(geo.mid.x, geo.mid.y);
      }
      if (!pos || !tb.childNodes.length) { tb.style.display = 'none'; return; }
      tb.style.display = 'flex';
      var r = host.getBoundingClientRect(), tw = tb.offsetWidth || 200;
      tb.style.left = Math.max(4, Math.min(r.width - tw - 4, pos.x - tw / 2)) + 'px';
      tb.style.top = Math.max(4, pos.y - 46) + 'px';
    }

    /* ----- ویرایشِ درجا ----- */
    function openEditor(box, value, commit) {
      closeEditor(false);
      var ta = h('textarea', 'cv-edit'); ta.value = value || '';
      ta.style.left = box.x + 'px'; ta.style.top = box.y + 'px'; ta.style.width = Math.max(box.w, 90) + 'px'; ta.style.height = Math.max(box.h, 34) + 'px';
      ui.appendChild(ta); editor = { ta: ta, commit: commit, done: false };
      placeToolbar();
      setTimeout(function () { ta.focus(); ta.select(); }, 0);
      ta.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeEditor(true); }
        else if (e.key === 'Escape') { e.preventDefault(); closeEditor(false); }
      });
      ta.addEventListener('blur', function () { closeEditor(true); });
    }
    function closeEditor(ok) {
      if (!editor || editor.done) return;
      var e = editor; e.done = true; editor = null;
      var v = e.ta.value; e.ta.remove();
      if (ok) e.commit(v);
      host.focus(); placeToolbar();
    }
    C.edit = function (id) {
      if (C.ro) return;
      var it = byId(id); if (!it) return;
      var p = toScreen(it.x, it.y), k = C.view.k;
      openEditor({ x: p.x, y: p.y, w: it.w * k, h: Math.min(it.h * k, 60) }, it.text != null ? it.text : it.title, function (v) { if (o.onRename) o.onRename(it, v); });
    };
    C.editLabel = function (lid) {
      if (C.ro) return;
      var l = linkById(lid), geo = l && C.geo[l.id]; if (!l || !geo) return;
      var p = toScreen(geo.mid.x, geo.mid.y);
      openEditor({ x: p.x - 70, y: p.y - 16, w: 140, h: 32 }, l.label || '', function (v) { if (o.onLinkLabel) o.onLinkLabel(l, v.trim()); });
    };

    /* ----- نما ----- */
    C.fit = function (pad) {
      pad = pad == null ? 50 : pad;
      var r = host.getBoundingClientRect();
      if (!C.items.length || !r.width) { C.view = { x: 40, y: 40, k: 1 }; applyView(); return; }
      var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
      C.items.forEach(function (it) { minx = Math.min(minx, it.x); miny = Math.min(miny, it.y); maxx = Math.max(maxx, it.x + it.w); maxy = Math.max(maxy, it.y + it.h); });
      var k = Math.max(0.25, Math.min(1.2, Math.min((r.width - pad * 2) / (maxx - minx), (r.height - pad * 2) / (maxy - miny))));
      C.view = { k: k, x: (r.width - (maxx - minx) * k) / 2 - minx * k, y: (r.height - (maxy - miny) * k) / 2 - miny * k };
      applyView();
    };
    C.zoomBy = function (f, cx, cy) {
      var r = host.getBoundingClientRect(); if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
      var nk = Math.max(0.2, Math.min(2.5, C.view.k * f)), px = cx - r.left, py = cy - r.top;
      C.view.x = px - (px - C.view.x) * (nk / C.view.k); C.view.y = py - (py - C.view.y) * (nk / C.view.k); C.view.k = nk; applyView();
    };
    C.centerOf = function () { var r = host.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); };
    C.toWorld = toWorld;
    C.getView = function () { return { x: C.view.x, y: C.view.y, k: C.view.k }; };
    C.focusItem = function (id) {
      var it = byId(id), r = host.getBoundingClientRect(); if (!it) return;
      C.view.x = r.width / 2 - (it.x + it.w / 2) * C.view.k; C.view.y = r.height / 2 - (it.y + it.h / 2) * C.view.k; applyView();
    };
    C.arm = function (v) { C.armed = v || null; host.classList.toggle('armed', !!v); };
    host.addEventListener('wheel', function (e) { e.preventDefault(); C.zoomBy(Math.exp(-e.deltaY * 0.0014), e.clientX, e.clientY); }, { passive: false });

    /* ----- اشاره‌گر ----- */
    var drag = null;
    function targetItem(e) { var n = e.target.closest ? e.target.closest('.cvi') : null; return n ? byId(n.getAttribute('data-id')) : null; }
    host.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('.cv-ui')) return;
      if (editor) closeEditor(true);
      host.focus({ preventScroll: true });
      var port = e.target.closest ? e.target.closest('.cvp') : null;
      var pt = e.target.closest ? e.target.closest('.cvpt') : null;
      var it = targetItem(e);
      var lh = e.target.closest ? e.target.closest('.cvl') : null;
      var lbl = e.target.closest ? e.target.closest('.cv-lbl') : null;
      host.setPointerCapture(e.pointerId);
      if (pt && it && C.ro) { drag = { t: 'portclick', from: it, fromSide: pt.getAttribute('data-pt'), fromName: pt.getAttribute('data-name'), sx: e.clientX, sy: e.clientY, moved: false }; return; }
      if ((port || pt) && it && !C.ro) { drag = { t: 'link', from: it, fromSide: pt ? pt.getAttribute('data-pt') : null, fromName: pt ? pt.getAttribute('data-name') : null, sx: e.clientX, sy: e.clientY, moved: false }; return; }
      if (it) {
        if (e.shiftKey) { var ids = C.selectedIds(); var i = ids.indexOf(it.id); if (i >= 0) ids.splice(i, 1); else ids.push(it.id); setSel(ids); }
        else if (!C.sel[it.id]) setSel([it.id]);
        if (it.ghost || C.ro || it.fixed) { drag = { t: 'none' }; return; }
        var starts = {}; C.selectedIds().forEach(function (id) { var x = byId(id); if (x && !x.ghost && !x.fixed) starts[id] = { x: x.x, y: x.y }; });
        drag = { t: 'move', sx: e.clientX, sy: e.clientY, starts: starts, moved: false, hit: it };
        return;
      }
      if (lh || lbl) { setSel([], (lh || lbl).getAttribute('data-lid')); drag = { t: 'none' }; return; }
      if (e.shiftKey && !C.ro) { drag = { t: 'box', sx: e.clientX, sy: e.clientY, moved: false }; return; }
      drag = { t: 'pan', sx: e.clientX, sy: e.clientY, vx: C.view.x, vy: C.view.y, moved: false };
    });
    host.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      if (drag.t === 'pan') { drag.moved = true; C.view.x = drag.vx + dx; C.view.y = drag.vy + dy; applyView(); host.classList.add('panning'); }
      else if (drag.t === 'move') {
        drag.moved = true; var k = C.view.k, mv = {};
        for (var id in drag.starts) { var it = byId(id), st = drag.starts[id]; it.x = snapv(st.x + dx / k); it.y = snapv(st.y + dy / k); placeItem(it, itemEl[id]); mv[id] = 1; }
        drawAllLinks(true, mv); placeToolbar();
      } else if (drag.t === 'link') {
        drag.moved = true; var w = toWorld(e.clientX, e.clientY);
        var a = drag.fromSide === 'out' ? portAnchor(drag.from, 'out', drag.fromName) : drag.fromSide === 'in' ? portAnchor(drag.from, 'in', drag.fromName) : anchor(drag.from, w.x, w.y);
        a = a || anchor(drag.from, w.x, w.y);
        tmpLayer.innerHTML = '';
        var c = curve(a, { x: w.x, y: w.y }, a, { nx: -a.nx, ny: -a.ny });
        tmpLayer.appendChild(sv('path', { d: c.d, fill: 'none', stroke: 'var(--pri)', 'stroke-width': 2.4, 'stroke-dasharray': '6 4', 'marker-end': markerFor('#2f6fed') }));
        var under = document.elementFromPoint(e.clientX, e.clientY), tgt = under && under.closest ? under.closest('.cvi') : null;
        for (var i in itemEl) itemEl[i].classList.toggle('drop', !!tgt && tgt === itemEl[i] && i !== drag.from.id);
        $$pts(host, under);
      } else if (drag.t === 'box') {
        drag.moved = true; var r = host.getBoundingClientRect();
        if (!drag.el) { drag.el = h('div', 'cv-box'); ui.appendChild(drag.el); }
        var x1 = Math.min(drag.sx, e.clientX) - r.left, y1 = Math.min(drag.sy, e.clientY) - r.top;
        drag.el.style.left = x1 + 'px'; drag.el.style.top = y1 + 'px'; drag.el.style.width = Math.abs(dx) + 'px'; drag.el.style.height = Math.abs(dy) + 'px';
      }
    });
    function $$pts(root, under) { var cur = root.querySelector('.cvpt.hot'); if (cur) cur.classList.remove('hot'); var p = under && under.closest ? under.closest('.cvpt') : null; if (p) p.classList.add('hot'); }
    function endDrag(e) {
      if (!drag) return; var d = drag; drag = null; host.classList.remove('panning');
      try { host.releasePointerCapture(e.pointerId); } catch (x) { /* بی‌اثر */ }
      if (d.t === 'move' && d.moved) {
        var out = []; for (var id in d.starts) { var it = byId(id); out.push({ id: id, x: it.x, y: it.y }); }
        drawAllLinks(false); placeToolbar();
        if (o.onMove) o.onMove(out);
      } else if (d.t === 'pan' && !d.moved) {
        if (C.armed && o.onPlace && !C.ro) { o.onPlace(C.armed, toWorld(e.clientX, e.clientY)); return; }
        setSel([]);
      } else if (d.t === 'portclick') {
        if (o.onPortClick && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) o.onPortClick(d.from, d.fromSide, d.fromName);
      } else if (d.t === 'link') {
        tmpLayer.innerHTML = ''; for (var i in itemEl) itemEl[i].classList.remove('drop'); $$pts(host, null);
        if (!d.moved) { if (d.fromSide && o.onPortClick) o.onPortClick(d.from, d.fromSide, d.fromName); return; }
        var under = document.elementFromPoint(e.clientX, e.clientY), tgt = under && under.closest ? under.closest('.cvi') : null;
        var tpt = under && under.closest ? under.closest('.cvpt') : null;
        if (tgt && tgt.getAttribute('data-id') !== d.from.id) {
          var to = byId(tgt.getAttribute('data-id')), tSide = tpt ? tpt.getAttribute('data-pt') : null, tName = tpt ? tpt.getAttribute('data-name') : null;
          var fromIt = d.from, fSide = d.fromSide, fName = d.fromName;
          /* اگر از ورودی کشیده شد و روی خروجی رها شد، جهت برعکس می‌شود */
          if (fSide === 'in' && tSide === 'out') { if (o.onConnect) o.onConnect(to, fromIt, tName, fName); }
          else if (o.onConnect) o.onConnect(fromIt, to, fSide === 'out' ? fName : null, tSide === 'in' ? tName : null);
        } else if (!tgt && o.onConnectNew) o.onConnectNew(d.from, toWorld(e.clientX, e.clientY), d.fromSide === 'out' ? d.fromName : null);
      } else if (d.t === 'box') {
        if (d.el) { var br = d.el.getBoundingClientRect(); d.el.remove();
          var a = toWorld(br.left, br.top), b = toWorld(br.right, br.bottom), ids = [];
          C.items.forEach(function (it) { if (!it.ghost && it.x < b.x && it.x + it.w > a.x && it.y < b.y && it.y + it.h > a.y) ids.push(it.id); });
          setSel(ids); }
      }
    }
    host.addEventListener('pointerup', endDrag);
    host.addEventListener('pointercancel', endDrag);
    host.addEventListener('dblclick', function (e) {
      /* با pointer-capture هدفِ رویداد خودِ بوم است؛ پس زیرِ اشاره‌گر را با مختصات پیدا می‌کنیم */
      var under = document.elementFromPoint(e.clientX, e.clientY) || e.target;
      if (under.closest && under.closest('.cv-ui')) return;
      var n = under.closest ? under.closest('.cvi') : null, it = n ? byId(n.getAttribute('data-id')) : null;
      var lbl = under.closest ? (under.closest('.cvl') || under.closest('.cv-lbl')) : null;
      if (lbl && !C.ro) { var l = linkById(lbl.getAttribute('data-lid')); if (l && !l.locked) { C.editLabel(l.id); return; } }
      if (it) { if (o.onOpen) o.onOpen(it); return; }
      if (!C.ro && o.onAdd) { var w = toWorld(e.clientX, e.clientY); o.onAdd(w); }
    });
    host.addEventListener('keydown', function (e) {
      if (editor) return;
      var ids = C.selectedIds(), meta = e.ctrlKey || e.metaKey;
      if ((e.key === 'Delete' || e.key === 'Backspace') && !C.ro) {
        e.preventDefault();
        if (C.selLink) { var l = linkById(C.selLink); if (l && !l.locked && o.onLinkDelete) o.onLinkDelete(l); }
        else if (ids.length && o.onDelete) o.onDelete(ids.filter(function (i) { var it = byId(i); return it && !it.ghost && !it.noDelete; }));
      } else if (e.key === 'Escape') { if (C.armed && o.onDisarm) o.onDisarm(); setSel([]); }
      else if (e.key === 'F2' || e.key === 'Enter') { if (ids.length === 1 && !C.ro) { e.preventDefault(); var x = byId(ids[0]); if (x && !x.noEdit && !x.ghost) C.edit(x.id); } else if (C.selLink) C.editLabel(C.selLink); }
      else if (meta && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey ? o.onRedo : o.onUndo) (e.shiftKey ? o.onRedo : o.onUndo)(); }
      else if (meta && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); if (o.onRedo) o.onRedo(); }
      else if (meta && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (o.onSave) o.onSave(); }
      else if (meta && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); if (o.onDuplicate && ids.length && !C.ro) o.onDuplicate(ids); }
      else if (meta && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); setSel(C.items.filter(function (i) { return !i.ghost; }).map(function (i) { return i.id; })); }
      else if (e.key.indexOf('Arrow') === 0 && ids.length && !C.ro) {
        e.preventDefault(); var st = e.shiftKey ? 50 : 10, mx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, my = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0, out = [];
        ids.forEach(function (i) { var it = byId(i); if (it && !it.ghost && !it.fixed) { it.x += mx; it.y += my; placeItem(it, itemEl[i]); out.push({ id: i, x: it.x, y: it.y }); } });
        drawAllLinks(false); placeToolbar(); if (out.length && o.onMove) o.onMove(out);
      }
    });
    C.refreshItem = function (id) {
      var it = byId(id); if (!it) return; var old = itemEl[id], el = buildItem(it); placeItem(it, el); if (C.sel[id]) el.classList.add('sel'); old.replaceWith(el); itemEl[id] = el; drawAllLinks(false); placeToolbar();
    };
    C.redraw = function () { for (var id in itemEl) { var it = byId(id); placeItem(it, itemEl[id]); } drawAllLinks(false); placeToolbar(); };
    applyView();
    return C;
  }

  W.PMCanvas = { create: create, PALETTE: PALETTE, shapePath: shapePath, anchor: anchor, curve: curve, esc: esc, route: routeOrtho, quickRoute: quickRoute, toPath: toPath, midOf: midOf };
})(window);
