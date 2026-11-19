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
  function anchorAt(it, a) { /* a = {s:'t'|'r'|'b'|'l', t:0..1} نقطه‌ای دلخواه روی لبهٔ شکل */
    var f = a && a.t != null ? Math.max(0, Math.min(1, a.t)) : 0.5;
    switch (a && a.s) {
      case 'r': return { x: it.x + it.w, y: it.y + it.h * f, nx: 1, ny: 0 };
      case 'l': return { x: it.x, y: it.y + it.h * f, nx: -1, ny: 0 };
      case 't': return { x: it.x + it.w * f, y: it.y, nx: 0, ny: -1 };
      default: return { x: it.x + it.w * f, y: it.y + it.h, nx: 0, ny: 1 };
    }
  }
  function parseAnchor(s) { if (!s) return null; var p = String(s).split(':'); return { s: p[0], t: p[1] == null ? 0.5 : parseFloat(p[1]) }; }
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

  /* آیا قطعهٔ (x1,y1)-(x2,y2) روی خطِ دیگری (هم‌راستا و هم‌پوشان) می‌افتد؟ خط‌های هم‌شبکه (از یک پورت) مستثنا */
  function sameNet(u, nets) { if (!nets || !u.nets) return false; for (var i = 0; i < nets.length; i++) if (nets[i] && u.nets.indexOf(nets[i]) >= 0) return true; return false; }
  function collide(x1, y1, x2, y2, used, nets) {
    for (var q = 0; q < used.length; q++) {
      var u = used[q]; if (sameNet(u, nets)) continue;
      if (y1 === y2 && u.h && Math.abs(u.c - y1) < 8 && Math.min(Math.max(x1, x2), u.hi) - Math.max(Math.min(x1, x2), u.lo) > 1) return true;
      if (x1 === x2 && !u.h && Math.abs(u.c - x1) < 8 && Math.min(Math.max(y1, y2), u.hi) - Math.max(Math.min(y1, y2), u.lo) > 1) return true;
    }
    return false;
  }
  /* چند پیکان روی یک لبهٔ یک شکل (بی‌پورت): در طولِ لبه پخش می‌شوند، به ترتیبِ سمتِ دیگرشان (بی‌تقاطع) */
  function spreadAnchors(ends) {
    var g = {};
    ends.forEach(function (E) { if (!E || !E.p || E.fixed || !E.it || E.it.shape === 'diamond') return; var k = E.it.id + ':' + E.p.nx + ':' + E.p.ny; (g[k] = g[k] || []).push(E); });
    Object.keys(g).forEach(function (k) {
      var L = g[k]; if (L.length < 2) return;
      var vert = L[0].p.nx !== 0, it = L[0].it;
      L.sort(function (a, b) { return vert ? a.o.y - b.o.y : a.o.x - b.o.x; });
      L.forEach(function (E, i) { var t = (i + 1) / (L.length + 1); if (vert) E.p.y = Math.round(it.y + it.h * t); else E.p.x = Math.round(it.x + it.w * t); });
    });
  }
  function reserveStubs(a, b, used, nets) {
    [a, b].forEach(function (p) { if (p && (p.nx || p.ny)) recordUsed([{ x: p.x, y: p.y }, { x: p.x + p.nx * 20, y: p.y + p.ny * 20 }], used, nets); });
  }
  function routeOrtho(a, b, obs, used, nets, hard) {
    var S = 20, A = { x: a.x + a.nx * S, y: a.y + a.ny * S }, B = { x: b.x + b.nx * S, y: b.y + b.ny * S };
    var xs = [A.x, B.x], ys = [A.y, B.y], i, j;
    obs.forEach(function (o) { xs.push(o.l, o.r); ys.push(o.t, o.b); });
    xs.sort(function (p, q) { return p - q; }); ys.sort(function (p, q) { return p - q; });
    xs = xs.filter(function (v, k) { return k === 0 || v !== xs[k - 1]; }); ys = ys.filter(function (v, k) { return k === 0 || v !== ys[k - 1]; });
    /* راهروهای موازی میانِ بلوک‌ها: هر خط راهروی خودش را می‌گیرد و خط‌ها روی هم نمی‌افتند */
    function lanes(v) {
      var o = [];
      for (var q = 0; q < v.length; q++) {
        o.push(v[q]);
        var g = q + 1 < v.length ? v[q + 1] - v[q] : 0;
        if (g >= 36) { var n = Math.min(12, Math.floor(g / 18)); for (var z = 1; z < n; z++) o.push(Math.round(v[q] + g * z / n)); }
      }
      return o;
    }
    xs = lanes(xs); ys = lanes(ys);
    var nx = xs.length, ny = ys.length;
    if (nx * ny > 40000) return null;
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
        var u = used[q]; if (sameNet(u, nets)) continue;
        if (y1 === y2 && u.h && Math.abs(u.c - y1) < 6 && Math.max(x1, x2) > u.lo && Math.min(x1, x2) < u.hi) p += 400;
        else if (x1 === x2 && !u.h && Math.abs(u.c - x1) < 6 && Math.max(y1, y2) > u.lo && Math.min(y1, y2) < u.hi) p += 400;
      }
      return p;
    }
    var heap = new Heap(), best = {}, prev = {}, goal = null;
    function key(i2, j2, d) { return (i2 * ny + j2) * 5 + d; }
    function hfun(i2, j2) { return Math.abs(xs[i2] - xs[tI]) + Math.abs(ys[j2] - ys[tJ]); }
    var st = { i: sI, j: sJ, d: 4, g: 0, f: hfun(sI, sJ) };
    heap.push(st); best[key(sI, sJ, 4)] = 0;
    var guard = 0;
    while (heap.size() && guard++ < 90000) {
      var cur = heap.pop();
      if (cur.g > (best[key(cur.i, cur.j, cur.d)] != null ? best[key(cur.i, cur.j, cur.d)] : 1e18)) continue;
      if (cur.i === tI && cur.j === tJ) { if (cur.d !== 4 && (b.nx || b.ny) && DIRS[cur.d][0] === b.nx && DIRS[cur.d][1] === b.ny) continue; goal = cur; break; }
      for (var d = 0; d < 4; d++) {
        var ni = cur.i + DIRS[d][0], nj = cur.j + DIRS[d][1];
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny || !free(ni, nj)) continue;
        if (cur.d !== 4 && ((cur.d ^ 1) === d)) continue; /* برگشت به عقب ممنوع */
        var x1 = xs[cur.i], y1 = ys[cur.j], x2 = xs[ni], y2 = ys[nj];
        if (!clear(x1, y1, x2, y2)) continue;
        if (hard && collide(x1, y1, x2, y2, used, nets)) continue; /* هیچ خطی روی خطِ دیگر نمی‌رود؛ فقط عبورِ عمود */
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
      /* فقط وقتی نقطهٔ میانی حذف شود که مسیر همان جهت را ادامه دهد (برگشت به عقب حذف نشود) */
      if ((a.x === b.x && b.x === c.x && (b.y - a.y) * (c.y - b.y) > 0) || (a.y === b.y && b.y === c.y && (b.x - a.x) * (c.x - b.x) > 0)) continue;
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
  function recordUsed(pts, used, nets) {
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i - 1], q = pts[i];
      if (p.y === q.y) used.push({ h: true, c: p.y, lo: Math.min(p.x, q.x), hi: Math.max(p.x, q.x), nets: nets || null });
      else if (p.x === q.x) used.push({ h: false, c: p.x, lo: Math.min(p.y, q.y), hi: Math.max(p.y, q.y), nets: nets || null });
    }
  }
  /* مسیرِ یک خط: مستقیم اگر آزاد است؛ وگرنه A* با منعِ هم‌پوشانی؛ اگر راهی نبود، با جریمه؛ آخر از همه مسیرِ ساده */
  function routeNet(pa, pb, obs, used, nets, skip) {
    var q = quickRoute(pa, pb), ok = true;
    for (var oi = 0; oi < obs.length && ok; oi++) {
      var own = skip && skip.indexOf(oi) >= 0;
      for (var si = own ? 2 : 1; si < (own ? q.length - 1 : q.length); si++) if (segHits(q[si - 1].x, q[si - 1].y, q[si].x, q[si].y, obs[oi])) { ok = false; break; }
    }
    for (var sj = 1; sj < q.length && ok; sj++) if (collide(q[sj - 1].x, q[sj - 1].y, q[sj].x, q[sj].y, used, nets)) ok = false;
    if (ok) return q;
    var H = routeOrtho(pa, pb, obs, used, nets, true);
    if (H) return H;
    var soft = routeOrtho(pa, pb, obs, used, nets, false) || q; soft.soft = true; return soft;
  }
  /* جای برچسب‌ها پس از کشیدنِ همهٔ خط‌ها: روی خطِ خودش، نه روی بلوک، نه روی برچسبِ دیگر، نه روی خطِ دیگر */
  function labelBox(text) {
    var f = '12px Vazirmatn, Tahoma, sans-serif', tw = textWidth(text, f), w = Math.min(200, tw + 25), lines = tw + 25 > 200 ? lineCount(text, 176, f) : 1;
    return { w: w + 4, h: lines * 17.4 + 9 };
  }
  function placeLabels(list, rects) {
    /* list: [{id, pts, text}] ← {id: {x,y}} */
    var placed = [], out = {}, segs = [];
    list.forEach(function (L) { for (var i = 1; i < L.pts.length; i++) segs.push({ id: L.id, a: L.pts[i - 1], b: L.pts[i] }); });
    function hitsRect(R, M) { return R.l < M.r + 0 && R.r > M.l && R.t < M.b && R.b > M.t; }
    list.forEach(function (L) {
      if (!L.text) { out[L.id] = midOf(L.pts); return; }
      var bx = labelBox(L.text), best = null, bestBad = 1e9, ts = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82, 0.1, 0.9];
      var order = []; for (var i = 1; i < L.pts.length; i++) order.push(i);
      order.sort(function (x, y) { var lx = Math.abs(L.pts[x].x - L.pts[x - 1].x) + Math.abs(L.pts[x].y - L.pts[x - 1].y), ly = Math.abs(L.pts[y].x - L.pts[y - 1].x) + Math.abs(L.pts[y].y - L.pts[y - 1].y); return ly - lx; });
      for (var oi = 0; oi < order.length && bestBad > 0; oi++) {
        var a = L.pts[order[oi] - 1], b = L.pts[order[oi]];
        for (var ti = 0; ti < ts.length && bestBad > 0; ti++) {
          var p = { x: a.x + (b.x - a.x) * ts[ti], y: a.y + (b.y - a.y) * ts[ti] }, R = { l: p.x - bx.w / 2, r: p.x + bx.w / 2, t: p.y - bx.h / 2, b: p.y + bx.h / 2 }, bad = 0, q;
          for (q = 0; q < rects.length; q++) if (hitsRect(R, { l: rects[q].l - 4, r: rects[q].r + 4, t: rects[q].t - 4, b: rects[q].b + 4 })) bad += 100;
          for (q = 0; q < placed.length; q++) if (hitsRect(R, { l: placed[q].l - 6, r: placed[q].r + 6, t: placed[q].t - 6, b: placed[q].b + 6 })) bad += 100;
          var E = { l: R.l - 3, r: R.r + 3, t: R.t - 3, b: R.b + 3 };
          for (q = 0; q < segs.length; q++) if (segs[q].id !== L.id && segHits(segs[q].a.x, segs[q].a.y, segs[q].b.x, segs[q].b.y, E)) bad += 10;
          if (bad < bestBad) { bestBad = bad; best = { p: p, R: R }; }
        }
      }
      if (!best || bestBad > 0) { out[L.id] = { x: (best ? best.p : midOf(L.pts)).x, y: (best ? best.p : midOf(L.pts)).y, hide: true }; return; }
      placed.push(best.R); out[L.id] = best.p;
    });
    return out;
  }

  /* ================= موتور ================= */
  function create(host, o) {
    o = o || {};
    var C = { items: [], links: [], view: o.view || { x: 40, y: 40, k: 1 }, sel: {}, selLink: null, snap: o.snap !== false ? 10 : 0, ro: !!o.readonly, armed: null, geo: {} };
    var itemEl = {}, linkEl = {}, labelEl = {};
    host.classList.add('cv'); if (o.freePoints) host.classList.add('free'); host.innerHTML = '';
    host.setAttribute('tabindex', '0');
    var world = h('div', 'cv-world');
    var svg = sv('svg', { 'class': 'cv-svg', width: 1, height: 1 });
    svg.setAttribute('style', 'overflow:visible');
    var defs = sv('defs', {});
    svg.appendChild(defs);
    var linkLayer = sv('g', {}), tmpLayer = sv('g', {});
    svg.appendChild(linkLayer); svg.appendChild(tmpLayer);
    var itemLayer = h('div', 'cv-items'), labelLayer = h('div', 'cv-labels');
    var handleLayer = h('div', 'cv-handles');
    world.appendChild(svg); world.appendChild(itemLayer); world.appendChild(labelLayer); world.appendChild(handleLayer);
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
      if (!it.ghost && !C.ro) {
        var ts = o.freePoints && shape !== 'diamond' ? [0.25, 0.5, 0.75] : [0.5];
        ['t', 'r', 'b', 'l'].forEach(function (sd) { ts.forEach(function (f) {
          var lx = sd === 'r' ? 100 : sd === 'l' ? 0 : f * 100, ly = sd === 't' ? 0 : sd === 'b' ? 100 : f * 100;
          inner += '<i class="cvp" data-p="' + sd + ':' + f + '" style="left:' + lx + '%;top:' + ly + '%"></i>';
        }); });
      }
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
      var pa = l.fromPort ? portAnchor(a, 'out', l.fromPort) : (l.fa ? anchorAt(a, l.fa) : null), pb = l.toPort ? portAnchor(b, 'in', l.toPort) : (l.ta ? anchorAt(b, l.ta) : null);
      var ca = { x: b.x + b.w / 2, y: b.y + b.h / 2 }, cb = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
      /* پیوندِ دوطرفه از لبه‌ای بیرون می‌آید که رو به بلوکِ دیگر است (همان ردیفِ پورت)؛ دورِ نقشه نمی‌چرخد */
      if (l.both && !l.noFlip) {
        var flip = function (p, it, ot) { if (!p || !p.nx) return p; var oc = ot.x + ot.w / 2; if (p.nx > 0 && oc < it.x) return { x: it.x, y: p.y + 11, nx: -1, ny: 0 }; if (p.nx < 0 && oc > it.x + it.w) return { x: it.x + it.w, y: p.y + 11, nx: 1, ny: 0 }; return p; }; /* +۱۱: میانِ ردیف‌های پورتِ آن لبه، نه روی پورتِ دیگری */
        pa = flip(pa, a, b); pb = flip(pb, b, a);
      }
      if (!pa) pa = anchor(a, pb ? pb.x : ca.x, pb ? pb.y : ca.y);
      if (!pb) pb = anchor(b, pa.x, pa.y);
      return { a: pa, b: pb, from: a, to: b };
    }
    /* هم‌شبکه = سرِ دقیقاً یکسان (شاخه‌شدنِ واقعی از یک نقطه)؛ دو خط که فقط به یک شکل می‌رسند هم‌شبکه نیستند */
    function netsOf(l) { var e = (C.ep && C.ep[l.id]) || endpoints(l); if (!e) return []; return ['p' + Math.round(e.a.x) + ',' + Math.round(e.a.y), 'p' + Math.round(e.b.x) + ',' + Math.round(e.b.y)]; }
    function routeLink(l, quick, obs, used) {
      var e = (!quick && C.ep && C.ep[l.id]) || endpoints(l); if (!e) return null;
      var pts = null;
      if (!quick && o.route !== false) {
        var fi = -1, ti = -1;
        for (var z = 0; z < C.items.length; z++) { if (C.items[z].id === l.from) fi = z; if (C.items[z].id === l.to) ti = z; }
        pts = routeNet(e.a, e.b, obs, used, netsOf(l), [fi, ti]);
      }
      if (!pts) pts = quickRoute(e.a, e.b);
      return { pts: pts, d: toPath(pts), mid: midOf(pts) };
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
      /* برچسبی که جای خالی روی خطِ خودش نیافت روی بوم نمی‌آید (روی چیزی نمی‌افتد)؛ متنش با نگه‌داشتنِ ماوس روی خط دیده می‌شود.
         خطِ انتخاب‌شده همیشه برچسبش را نشان می‌دهد. */
      var tt = el.querySelector('title');
      if (l.label && geo.hideLbl) { if (!tt) { tt = sv('title', {}); el.appendChild(tt); } tt.textContent = l.label; } else if (tt) tt.remove();
      if (l.label && (!geo.hideLbl || C.selLink === l.id)) {
        if (!lb) { lb = h('div', 'cv-lbl'); lb.setAttribute('data-lid', l.id); labelLayer.appendChild(lb); labelEl[l.id] = lb; }
        lb.textContent = l.label; lb.title = l.label; lb.style.left = geo.mid.x + 'px'; lb.style.top = geo.mid.y + 'px';
        lb.className = 'cv-lbl' + (C.selLink === l.id ? ' sel' : '');
        lb.style.borderColor = l.color || '';
      } else if (lb) { lb.remove(); delete labelEl[l.id]; }
    }
    /* quick=true: فقط مسیرِ سریع (هنگام کشیدن)؛ only: فقط پیوندهای متصل به این آیتم‌ها */
    function placeHandles() {
      handleLayer.innerHTML = '';
      var l = C.selLink && linkById(C.selLink), g = l && C.geo[l.id];
      if (!l || !g || l.locked || C.ro || !o.onLinkReattach) return;
      [['from', g.pts[0]], ['to', g.pts[g.pts.length - 1]]].forEach(function (z) {
        var e = h('i', 'cv-eh'); e.setAttribute('data-lid', l.id); e.setAttribute('data-end', z[0]); e.style.left = z[1].x + 'px'; e.style.top = z[1].y + 'px'; e.title = 'بکشید و روی نقطهٔ دیگری رها کنید'; handleLayer.appendChild(e);
      });
    }
    function drawAllLinks(quick, only) {
      if (C.items.length > 160) quick = true;
      var obs = quick ? null : obstacles(), used = [];
      /* خط‌های کوتاه‌تر اول: مسیرِ مستقیم مالِ آن‌هاست و خط‌های بلند دورشان می‌گردند */
      var order = C.links.slice(), len = {}, EP = {}, ends = [];
      order.forEach(function (l) {
        var e = endpoints(l); if (!e) return; EP[l.id] = e;
        len[l.id] = Math.abs(e.a.x - e.b.x) + Math.abs(e.a.y - e.b.y);
        ends.push({ it: e.from, p: e.a, o: e.b, fixed: !!(l.fromPort || l.fa) }, { it: e.to, p: e.b, o: e.a, fixed: !!(l.toPort || l.ta) });
      });
      if (!quick) spreadAnchors(ends);
      C.ep = EP;
      order.sort(function (x, y) { return len[x.id] - len[y.id]; });
      /* سرِ کوتاهِ هر خط کنارِ پورتش از پیش رزرو می‌شود تا هیچ خطِ دیگری از رویش رد نشود.
         اگر خطی راهِ بی‌هم‌پوشانی پیدا نکرد، دوباره چیده می‌شود و این بار آن خط اول می‌رود (تا ۴ دور؛ بهترین دور می‌ماند) */
      var best = null;
      for (var pass = 0; pass < (quick || only ? 1 : 4); pass++) {
        used = []; var geo = {}, failed = [];
        if (!quick) order.forEach(function (l) { var e = EP[l.id]; if (e) reserveStubs(e.a, e.b, used, netsOf(l)); });
        order.forEach(function (l) {
          if (only && !only[l.from] && !only[l.to]) { if (C.geo[l.id]) { geo[l.id] = C.geo[l.id]; if (!quick) recordUsed(C.geo[l.id].pts, used, netsOf(l)); } return; }
          var g = routeLink(l, quick, obs, used); if (g) { geo[l.id] = g; if (g.pts.soft) failed.push(l); if (!quick) recordUsed(g.pts, used, netsOf(l)); }
        });
        if (!best || failed.length < best.failed.length) best = { geo: geo, failed: failed };
        if (!failed.length) break;
        var fs = {}; failed.forEach(function (l) { fs[l.id] = 1; });
        order = failed.concat(order.filter(function (l) { return !fs[l.id]; }));
      }
      C.geo = best.geo;
      if (!quick) {
        var rects = C.items.map(function (it) { return { l: it.x, t: it.y, r: it.x + it.w, b: it.y + it.h }; });
        var pos = placeLabels(order.filter(function (l) { return C.geo[l.id]; }).map(function (l) { return { id: l.id, pts: C.geo[l.id].pts, text: l.label || '' }; }), rects);
        Object.keys(pos).forEach(function (id) { if (C.geo[id]) { C.geo[id].mid = { x: pos[id].x, y: pos[id].y }; C.geo[id].hideLbl = !!pos[id].hide; } });
      }
      C.links.forEach(function (l) { drawLink(l); });
      placeHandles();
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
      placeToolbar(); placeHandles();
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
        var it = byId(ids[0]); if (!it || it.ghost || it.rail || it.act) { tb.style.display = 'none'; return; }
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
        if (o.onLinkBoth && !l.noFlip) tb.appendChild(btn(l.both ? '→' : '⇄', l.both ? 'یک‌طرفه کن' : 'دوطرفه کن', function () { o.onLinkBoth(l); }));
        if (o.onLinkReverse && !l.both && !l.noFlip) tb.appendChild(btn('↺', 'برعکس‌کردنِ جهت', function () { o.onLinkReverse(l); }));
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
      var side = pad + (o.fitSide || 0); /* جای نوارهای کناری (مثلِ ورودی/خروجی‌های فلوچارت) تا روی شکل‌ها نیفتند */
      var r = host.getBoundingClientRect();
      if (!C.items.length || !r.width) { C.view = { x: 40, y: 40, k: 1 }; applyView(); return; }
      var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
      C.items.forEach(function (it) { minx = Math.min(minx, it.x); miny = Math.min(miny, it.y); maxx = Math.max(maxx, it.x + it.w); maxy = Math.max(maxy, it.y + it.h); });
      var k = Math.max(0.25, Math.min(1.2, Math.min((r.width - side * 2) / (maxx - minx), (r.height - pad * 2) / (maxy - miny))));
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
      var eh = e.target.closest ? e.target.closest('.cv-eh') : null;
      if (eh && !C.ro) { host.setPointerCapture(e.pointerId); drag = { t: 'reattach', link: linkById(eh.getAttribute('data-lid')), end: eh.getAttribute('data-end'), sx: e.clientX, sy: e.clientY, moved: false }; return; }
      var port = e.target.closest ? e.target.closest('.cvp') : null;
      var pt = e.target.closest ? e.target.closest('.cvpt') : null;
      var it = targetItem(e);
      var lh = e.target.closest ? e.target.closest('.cvl') : null;
      var lbl = e.target.closest ? e.target.closest('.cv-lbl') : null;
      host.setPointerCapture(e.pointerId);
      if (pt && it && C.ro) { drag = { t: 'portclick', from: it, fromSide: pt.getAttribute('data-pt'), fromName: pt.getAttribute('data-name'), sx: e.clientX, sy: e.clientY, moved: false }; return; }
      if ((port || pt) && it && !C.ro) { drag = { t: 'link', fromAnchor: port ? parseAnchor(port.getAttribute('data-p')) : null, from: it, fromSide: pt ? pt.getAttribute('data-pt') : null, fromName: pt ? pt.getAttribute('data-name') : null, sx: e.clientX, sy: e.clientY, moved: false }; return; }
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
        var a = drag.fromSide === 'out' ? portAnchor(drag.from, 'out', drag.fromName) : drag.fromSide === 'in' ? portAnchor(drag.from, 'in', drag.fromName) : (drag.fromAnchor ? anchorAt(drag.from, drag.fromAnchor) : anchor(drag.from, w.x, w.y));
        a = a || anchor(drag.from, w.x, w.y);
        tmpLayer.innerHTML = '';
        var c = curve(a, { x: w.x, y: w.y }, a, { nx: -a.nx, ny: -a.ny });
        tmpLayer.appendChild(sv('path', { d: c.d, fill: 'none', stroke: 'var(--pri)', 'stroke-width': 2.4, 'stroke-dasharray': '6 4', 'marker-end': markerFor('#2f6fed') }));
        var under = document.elementFromPoint(e.clientX, e.clientY), tgt = under && under.closest ? under.closest('.cvi') : null;
        for (var i in itemEl) itemEl[i].classList.toggle('drop', !!tgt && tgt === itemEl[i] && i !== drag.from.id);
        $$pts(host, under);
      } else if (drag.t === 'reattach') {
        drag.moved = true; var w2 = toWorld(e.clientX, e.clientY), g = C.geo[drag.link.id], fixed = drag.end === 'from' ? g.pts[g.pts.length - 1] : g.pts[0];
        tmpLayer.innerHTML = '';
        tmpLayer.appendChild(sv('path', { d: 'M' + fixed.x + ' ' + fixed.y + ' L' + w2.x + ' ' + w2.y, fill: 'none', stroke: 'var(--pri)', 'stroke-width': 2.4, 'stroke-dasharray': '6 4' }));
        var un2 = document.elementFromPoint(e.clientX, e.clientY), tg2 = un2 && un2.closest ? un2.closest('.cvi') : null;
        for (var i2 in itemEl) itemEl[i2].classList.toggle('drop', !!tg2 && tg2 === itemEl[i2]);
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
          var fromIt = d.from, fSide = d.fromSide, fName = d.fromName, tdot = under.closest('.cvp'), ta = tdot ? parseAnchor(tdot.getAttribute('data-p')) : null, fa = d.fromAnchor || null;
          /* اگر از ورودی کشیده شد و روی خروجی رها شد، جهت برعکس می‌شود */
          if (fSide === 'in' && tSide === 'out') { if (o.onConnect) o.onConnect(to, fromIt, tName, fName, ta, fa); }
          else if (o.onConnect) o.onConnect(fromIt, to, fSide === 'out' ? fName : null, tSide === 'in' ? tName : null, fa, ta);
        } else if (!tgt && o.onConnectNew) o.onConnectNew(d.from, toWorld(e.clientX, e.clientY), d.fromSide === 'out' ? d.fromName : null, d.fromAnchor || null);
      } else if (d.t === 'reattach') {
        tmpLayer.innerHTML = ''; for (var i3 in itemEl) itemEl[i3].classList.remove('drop');
        if (!d.moved) return;
        var un3 = document.elementFromPoint(e.clientX, e.clientY), tg3 = un3 && un3.closest ? un3.closest('.cvi') : null, dot3 = un3 && un3.closest ? un3.closest('.cvp') : null;
        if (tg3 && o.onLinkReattach) o.onLinkReattach(d.link, d.end, byId(tg3.getAttribute('data-id')), dot3 ? parseAnchor(dot3.getAttribute('data-p')) : null);
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

  /* اندازهٔ واقعیِ متن (برای اینکه هیچ متنی زیرِ لبهٔ جعبه نرود) */
  var mctx = null;
  function textWidth(t, font) {
    if (!mctx) { try { mctx = document.createElement('canvas').getContext('2d'); } catch (e) { mctx = null; } }
    if (!mctx) return String(t || '').length * 7.5;
    mctx.font = font || '13.5px Vazirmatn, Tahoma, sans-serif';
    return mctx.measureText(String(t || '')).width;
  }
  /* شمارِ سطرهای متن در عرضِ w (شکستنِ واژه‌ها مثلِ word-break: break-word) */
  function lineCount(t, w, font) {
    var n = 0;
    String(t || '').split('\n').forEach(function (ln) {
      var cur = 0, sp = textWidth(' ', font), c = 1;
      ln.split(/\s+/).forEach(function (wd) {
        if (!wd) return;
        var ww = textWidth(wd, font);
        if (ww > w) { if (cur > 0) { c++; } c += Math.ceil(ww / w) - 1; cur = ww % w; return; }
        if (cur === 0) cur = ww; else if (cur + sp + ww <= w) cur += sp + ww; else { c++; cur = ww; }
      });
      n += c;
    });
    return Math.max(1, n);
  }
  W.PMCanvas = { textWidth: textWidth, lineCount: lineCount, anchorAt: anchorAt, create: create, PALETTE: PALETTE, shapePath: shapePath, anchor: anchor, curve: curve, esc: esc, route: routeOrtho, routeNet: routeNet, reserveStubs: reserveStubs, spreadAnchors: spreadAnchors, recordUsed: recordUsed, placeLabels: placeLabels, quickRoute: quickRoute, toPath: toPath, midOf: midOf };
})(window);
