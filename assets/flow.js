/* ویرایشگرِ فلوچارت (روی PMCanvas) + تصویرِ ایستا + خروجی Mermaid. بدونِ ?. */
(function (W) {
  'use strict';
  var CV = W.PMCanvas;
  var TYPES = {
    start:   { name: 'شروع',        shape: 'term',    w: 140, h: 52, color: '#1f9d63' },
    end:     { name: 'پایان',       shape: 'term',    w: 140, h: 52, color: '#d64545' },
    process: { name: 'پردازش',      shape: 'rect',    w: 170, h: 64, color: '#2f6fed' },
    decision:{ name: 'تصمیم؟',      shape: 'diamond', w: 180, h: 104, color: '#e0912b' },
    io:      { name: 'ورودی/خروجی', shape: 'para',    w: 180, h: 64, color: '#7a5af8' },
    sub:     { name: 'زیرفرایند',   shape: 'sub',     w: 170, h: 64, color: '#14a3a3' },
    db:      { name: 'پایگاه‌داده', shape: 'db',      w: 130, h: 84, color: '#64748b' },
    note:    { name: 'یادداشت',     shape: 'note',    w: 170, h: 90, color: '#d4a514' },
    text:    { name: 'متن',         shape: 'rect',    w: 150, h: 36, color: null }
  };
  var PORT_COL = { 'in': '#1f9d63', out: '#e0912b' };
  var ORDER = ['start', 'process', 'decision', 'io', 'sub', 'db', 'note', 'text', 'end'];
  var CYCLE = ['process', 'decision', 'io', 'sub', 'db', 'note'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid(list, p) { var n = list.length + 1, ids = {}; list.forEach(function (x) { ids[x.id] = 1; }); while (ids[p + n]) n++; return p + n; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function colorOf(n) { return n.color || TYPES[n.type].color; }

  /* ----- اندازهٔ شکل بر پایهٔ متن: هیچ متنی زیرِ لبهٔ شکل نمی‌رود ----- */
  var LH = 20.25, BADGE = 16;
  function fontOf() { var f = 'Vazirmatn, Tahoma, sans-serif'; try { f = getComputedStyle(document.body).fontFamily || f; } catch (e) { } return '13.5px ' + f; }
  /* فضای متن در هر شکل (همان insetِ .cvt در app.css) */
  function innerW(shape, w) { return shape === 'diamond' ? w * 0.52 : shape === 'para' ? w - 60 : shape === 'sub' ? w - 44 : w - 20; }
  function outerH(shape, h) { return shape === 'diamond' ? h / 0.6 : shape === 'db' ? (h + 6) / 0.78 : h + 12; }
  function fitNode(n, font) {
    var t = TYPES[n.type] || TYPES.process, shape = t.shape, text = n.text || '', extra = n.port ? BADGE : 0;
    if (!text && !extra) return false;
    var maxW = shape === 'diamond' ? 440 : 360, W = Math.max(n.w || t.w, 60), lines;
    for (;;) {
      lines = CV.lineCount(text, innerW(shape, W) - 6, font);
      if (lines <= (shape === 'diamond' ? 3 : 3) || W >= maxW) break;
      W += 10;
    }
    /* واژهٔ بلندتر از پهنا (مثلِ کد) در مرورگر گاهی یک سطر بیشتر می‌شکند: یک سطرِ ذخیره */
    var iw = innerW(shape, W) - 6, longW = String(text).split(/\s+/).some(function (wd) { return CV.textWidth(wd, font) > iw; });
    if (longW) lines += 1;
    var H = Math.ceil(outerH(shape, lines * LH + extra + 6)), ch = false;
    if (W > n.w) { n.x = Math.round(n.x - (W - n.w) / 2); n.w = W; ch = true; }
    if (H > n.h) { n.h = H; ch = true; }
    return ch;
  }
  /* هر شکلی که روی شکلِ دیگری افتاده، به پایین هل داده می‌شود (ترتیب و ستون‌ها حفظ می‌شود) */
  function separate(nodes, gap) {
    gap = gap == null ? 100 : gap; /* ۷۰: دو خطِ صافِ خروج/ورود (۲۴) + راهرو */
    var L = nodes.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; }), moved = false;
    for (var i = 1; i < L.length; i++) {
      var b = L[i], again = true, guard = 0;
      while (again && guard++ < 200) {
        again = false;
        for (var j = 0; j < i; j++) {
          var a = L[j];
          if (b.x < a.x + a.w + gap && b.x + b.w + gap > a.x && b.y < a.y + a.h + gap && b.y + b.h + gap > a.y) { b.y = a.y + a.h + gap; again = moved = true; }
        }
      }
    }
    return moved;
  }
  /* شکل‌هایی که تقریباً زیرِ هم‌اند دقیقاً هم‌محور می‌شوند (خطِ صاف، بی‌پیچِ ریز) */
  function align(flow) {
    var by = {}; (flow.nodes || []).forEach(function (n) { by[n.id] = n; });
    (flow.edges || []).slice().sort(function (a, b) { return ((by[a.from] || {}).y || 0) - ((by[b.from] || {}).y || 0); }).forEach(function (e) {
      var a = by[e.from], b = by[e.to]; if (!a || !b || e.fa || e.ta || b.y <= a.y) return;
      var d = (a.x + a.w / 2) - (b.x + b.w / 2); if (d && Math.abs(d) <= 16) b.x = Math.round(b.x + d);
    });
  }
  /* مسیرِ همهٔ پیکان‌ها با قاعدهٔ بوم (کوتاه‌تر اول، رزروِ سرها، بی‌هم‌پوشانی) ← {R, soft: شمارِ پیکان‌هایی که راهِ تمیز نیافتند} */
  function routeAll(flow, strict) {
    var nodes = flow.nodes || [], by = {}, idx = {};
    nodes.forEach(function (n, i) { by[n.id] = n; idx[n.id] = i; });
    var obs = nodes.map(function (n) { return { l: n.x - 28, t: n.y - 28, r: n.x + n.w + 28, b: n.y + n.h + 28 }; }), used = [], R = [];
    (flow.edges || []).forEach(function (e) {
      var a = by[e.from], b = by[e.to]; if (!a || !b) return;
      var pa = e.fa ? CV.anchorAt(a, e.fa) : CV.anchor(a, e.ta ? CV.anchorAt(b, e.ta).x : b.x + b.w / 2, e.ta ? CV.anchorAt(b, e.ta).y : b.y + b.h / 2), pb = e.ta ? CV.anchorAt(b, e.ta) : CV.anchor(b, pa.x, pa.y);
      R.push({ e: e, pa: pa, pb: pb, len: Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y), nets: [e.from + '>' + JSON.stringify(e.fa || ''), e.to + '<' + JSON.stringify(e.ta || '')] });
    });
    var ends = []; R.forEach(function (r) { var a = by[r.e.from], b = by[r.e.to], sa = (TYPES[a.type] || TYPES.process).shape, sb = (TYPES[b.type] || TYPES.process).shape;
      ends.push({ it: { id: a.id, x: a.x, y: a.y, w: a.w, h: a.h, shape: sa }, p: r.pa, o: r.pb, dir: 'out', fixed: !!r.e.fa }, { it: { id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, shape: sb }, p: r.pb, o: r.pa, dir: 'in', fixed: !!r.e.ta }); });
    CV.spreadAnchors(ends);
    R.forEach(function (r) { r.pa.stub = r.pb.stub = 30; r.pa.lanes = 30; });
    R.forEach(function (r) { r.nets = ['o' + Math.round(r.pa.x) + ',' + Math.round(r.pa.y), 'i' + Math.round(r.pb.x) + ',' + Math.round(r.pb.y)]; });
    if (!strict) {
      /* نمایش: مسیرِ ذخیره‌شده اگر سرهایش جور است؛ وگرنه مسیرِ سادهٔ فوری (بی‌برچسب) — هیچ مسیریابی‌ای */
      R.forEach(function (r) {
        var p = r.e.pts, ok = p && p.length > 1 && Math.abs(p[0][0] - r.pa.x) < 2 && Math.abs(p[0][1] - r.pa.y) < 2 && Math.abs(p[p.length - 1][0] - r.pb.x) < 2 && Math.abs(p[p.length - 1][1] - r.pb.y) < 2;
        if (ok) { r.pts = p.map(function (q) { return { x: q[0], y: q[1] }; }); r.mid = r.e.mid ? { x: r.e.mid[0], y: r.e.mid[1], hide: !!r.e.hide } : null; }
        else { r.pts = CV.quickRoute(r.pa, r.pb); r.mid = { x: 0, y: 0, hide: true }; }
      });
      return { R: R, soft: 0 };
    }
    R.sort(function (x, y) { return x.len - y.len; });
    R.forEach(function (r) { CV.reserveStubs(r.pa, r.pb, used, r.nets); });
    var soft = 0;
    R.forEach(function (r) { r.pts = CV.routeNet(r.pa, r.pb, obs, used, r.nets, [idx[r.e.from], idx[r.e.to]]); if (r.pts.soft) soft++; CV.recordRoute(r.pts, used, 30, 30, r.nets); });
    return { R: R, soft: soft };
  }
  /* اگر پیکانی جای تمیز ندارد، شکل‌ها از مرکز باز می‌شوند (×۱٫۳، حداکثر ۴ بار) تا هر خط راهروی خودش را بیابد */
  function spread(flow, noArrange) {
    var nodes = flow.nodes || [];
    if (nodes.length < 2 || nodes.length > 160) return false;
    var orig = nodes.map(function (n) { return [n.x, n.y]; });
    for (var it = 0; it < 4; it++) {
      if (!routeAll(flow, true).soft) return it > 0;
      var cx = 0, cy = 0; nodes.forEach(function (n) { cx += n.x + n.w / 2; cy += n.y + n.h / 2; }); cx /= nodes.length; cy /= nodes.length;
      nodes.forEach(function (n) { n.x = Math.round(cx + (n.x + n.w / 2 - cx) * 1.3 - n.w / 2); n.y = Math.round(cy + (n.y + n.h / 2 - cy) * 1.3 - n.h / 2); });
    }
    if (!routeAll(flow, true).soft) return true;
    /* باز کردن کافی نبود (مثلاً ستونِ بلند): چیدمانِ خودکار و دوباره آزمون — هیچ پیکانی بی‌راهِ تمیز نمی‌ماند */
    nodes.forEach(function (n, i) { n.x = orig[i][0]; n.y = orig[i][1]; });
    if (noArrange) return true;
    arrange(flow); separate(nodes);
    spread(flow, true);
    return true;
  }
  /* شکلی که پیکان‌های زیادی دارد آن‌قدر پهن می‌شود که هر پیکان نقطهٔ خودش را با ۱۶ فاصله داشته باشد */
  function widen(flow) {
    var deg = {}, ch = false;
    (flow.edges || []).forEach(function (e) { deg[e.from] = deg[e.from] || { i: 0, o: 0 }; deg[e.to] = deg[e.to] || { i: 0, o: 0 }; deg[e.from].o++; deg[e.to].i++; });
    (flow.nodes || []).forEach(function (n) { var d = deg[n.id]; if (!d || n.type === 'decision') return; var need = (Math.max(d.i, d.o) + 1) * 16; if (n.w < need) { n.x = Math.round(n.x - (need - n.w) / 2); n.w = need; ch = true; } });
    return ch;
  }
  /* سبک (هنگامِ باز شدن): فقط اندازهٔ شکل‌ها از روی متن و جدا کردنِ هم‌پوشانی — بی‌مسیریابی */
  function tidyLight(flow) { var f = fontOf(), ch = false; (flow.nodes || []).forEach(function (n) { if (fitNode(n, f)) ch = true; }); if (widen(flow)) ch = true; align(flow); if (separate(flow.nodes || [])) ch = true; return ch; }
  /* کامل (فقط با «چیدمان خودکار»): همان + باز کردن تا هر پیکان راهِ تمیز داشته باشد */
  function tidy(flow) { var ch = tidyLight(flow); if (spread(flow)) ch = true; return ch; }
  /* چیدمانِ لایه‌ای از بالا به پایین: ترتیب از روی پیکان‌ها، هر شکل زیرِ شکل‌های پیشینش */
  function arrange(flow) {
    var nodes = flow.nodes || [], edges = flow.edges || [], by = {}, out = {}, pre = {};
    nodes.forEach(function (n) { by[n.id] = n; out[n.id] = []; pre[n.id] = []; });
    edges.forEach(function (e) { if (by[e.from] && by[e.to] && e.from !== e.to) out[e.from].push(e.to); });
    /* حذفِ پیکان‌های برگشتی (حلقه) با DFS */
    var state = {}, fwd = [];
    var seeds = nodes.slice().sort(function (a, b) { var ra = a.port && a.port.side === 'in' ? 0 : a.type === 'start' ? 1 : 2, rb = b.port && b.port.side === 'in' ? 0 : b.type === 'start' ? 1 : 2; return ra - rb || a.y - b.y || a.x - b.x; });
    function dfs(id) { state[id] = 1; out[id].forEach(function (t) { if (state[t] === 1) return; fwd.push([id, t]); if (!state[t]) dfs(t); }); state[id] = 2; }
    seeds.forEach(function (n) { if (!state[n.id]) dfs(n.id); });
    fwd.forEach(function (p) { pre[p[1]].push(p[0]); });
    var layer = {}, iso = [];
    function lay(id, d) { if (layer[id] != null) return layer[id]; if (d > 400) return 0; var m = 0; pre[id].forEach(function (p) { m = Math.max(m, lay(p, d + 1) + 1); }); return (layer[id] = m); }
    nodes.forEach(function (n) { if (!pre[n.id].length && !out[n.id].length && !edges.some(function (e) { return e.to === n.id; })) iso.push(n); else lay(n.id, 0); });
    var maxL = 0; nodes.forEach(function (n) { if (layer[n.id] != null) maxL = Math.max(maxL, layer[n.id]); });
    nodes.forEach(function (n) { if (n.port && n.port.side === 'out' && layer[n.id] != null && !out[n.id].length) layer[n.id] = Math.max(layer[n.id], maxL); });
    var rows = []; nodes.forEach(function (n) { if (layer[n.id] == null) return; (rows[layer[n.id]] = rows[layer[n.id]] || []).push(n); });
    var cx = {}, y = 0, GX = 56, GY = 64;
    rows.forEach(function (row, r) {
      if (!row) return;
      row.forEach(function (n) { var ps = pre[n.id].filter(function (p) { return cx[p] != null; }); n._d = ps.length ? ps.reduce(function (s2, p) { return s2 + cx[p]; }, 0) / ps.length : null; });
      var free = row.filter(function (n) { return n._d == null; }).sort(function (a, b) { return a.x - b.x; });
      var tw = free.reduce(function (s2, n) { return s2 + n.w + GX; }, -GX), x0 = -tw / 2;
      free.forEach(function (n) { n._d = x0 + n.w / 2; x0 += n.w + GX; });
      row.sort(function (a, b) { return a._d - b._d; });
      var right = -1e9, want = 0, got = 0;
      row.forEach(function (n) { var x = Math.max(n._d - n.w / 2, right + GX); n.x = Math.round(x); right = x + n.w; want += n._d; got += x + n.w / 2; });
      var sh = Math.round((want - got) / row.length);
      var hmax = 0; row.forEach(function (n) { n.x += sh; n.y = y; cx[n.id] = n.x + n.w / 2; hmax = Math.max(hmax, n.h); delete n._d; });
      /* فاصلهٔ این ردیف تا بعدی به اندازهٔ پیکان‌هایی که از آن می‌گذرند (هرکدام راهروی ۱۶) */
      var cross = 0; fwd.forEach(function (p2) { if (layer[p2[0]] <= r && layer[p2[1]] > r) cross++; });
      y += hmax + GY + 60 + 16 * Math.min(cross, 60);
    });
    /* شکل‌های بی‌پیکان (یادداشت‌ها) در ستونی کنارِ نمودار */
    var minx = 1e9; nodes.forEach(function (n) { if (layer[n.id] != null) minx = Math.min(minx, n.x); });
    if (minx === 1e9) minx = 0;
    var yy = 0; iso.forEach(function (n) { n.x = Math.round(minx - n.w - 90); n.y = yy; yy += n.h + 30; });
    edges.forEach(function (e) { e.fa = null; e.ta = null; });
  }

  /* ----- تصویرِ ایستا (SVG) ----- */
  function wrap(text, w, fs) {
    var font = fs + 'px Vazirmatn, Tahoma, sans-serif', out = [];
    String(text || '').split('\n').forEach(function (ln) {
      var line = '';
      ln.split(/\s+/).forEach(function (wd) { var t2 = (line + ' ' + wd).trim(); if (line && CV.textWidth(t2, font) > w) { out.push(line); line = wd; } else line = t2; });
      out.push(line);
    });
    return out;
  }
  function svgString(flow, opt) {
    opt = opt || {};
    if (!flow || !flow.nodes || !flow.nodes.length) return '';
    flow = clone(flow); tidyLight(flow);
    var nodes = flow.nodes, by = {}, minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, P = 16;
    nodes.forEach(function (n) { by[n.id] = n; minx = Math.min(minx, n.x); miny = Math.min(miny, n.y); maxx = Math.max(maxx, n.x + n.w); maxy = Math.max(maxy, n.y + n.h); });
    var vb = [minx - P, miny - P, maxx - minx + P * 2, maxy - miny + P * 2];
    var ink = opt.ink || '#1c2333', bg = opt.bg, fs = 13;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb.join(' ') + '" width="' + (opt.width || vb[2]) + '"' + (opt.height === 'auto' ? '' : ' height="' + (opt.height || vb[3]) + '"') + ' style="font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl"' + (opt.cls ? ' class="' + opt.cls + '"' : '') + '>';
    s += '<defs>';
    var cols = {}; (flow.edges || []).forEach(function (e) { cols[e.color || '#7d88a3'] = 1; });
    Object.keys(cols).forEach(function (c) { s += '<marker id="m' + c.replace('#', '') + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="' + c + '"/></marker>'; });
    s += '</defs>';
    if (bg) s += '<rect x="' + vb[0] + '" y="' + vb[1] + '" width="' + vb[2] + '" height="' + vb[3] + '" fill="' + bg + '"/>';
    var R = routeAll(flow, false).R, labels = '';
    R.forEach(function (r, i) {
      var e = r.e, col = e.color || '#7d88a3', d = CV.toPath(r.pts), mid = r.mid || CV.midOf(r.pts);
      s += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" marker-end="url(#m' + col.replace('#', '') + ')"/>';
      if (e.label && mid.hide) s += '<title>' + esc(e.label) + '</title>';
      else if (e.label) { var lw = CV.textWidth(e.label, '12px Vazirmatn, Tahoma, sans-serif') + 18; labels += '<rect x="' + (mid.x - lw / 2) + '" y="' + (mid.y - 11) + '" width="' + lw + '" height="20" rx="10" fill="' + (bg || '#fff') + '" stroke="' + col + '"/><text x="' + mid.x + '" y="' + (mid.y + 4) + '" font-size="12" text-anchor="middle" fill="' + ink + '">' + esc(e.label) + '</text>'; }
    });
    s += labels;
    nodes.forEach(function (n) {
      var col = colorOf(n) || ink, t = TYPES[n.type] || TYPES.process;
      s += '<g transform="translate(' + n.x + ' ' + n.y + ')">';
      if (n.port) col = n.color || PORT_COL[n.port.side];
      if (n.type !== 'text') s += '<path d="' + CV.shapePath(t.shape, n.w, n.h) + '" fill="' + col + '" fill-opacity=".16" stroke="' + col + '" stroke-width="2" stroke-linejoin="round"/>';
      var lines = wrap(n.text, n.w * (n.type === 'decision' ? 0.62 : 0.86), fs), y0 = n.h / 2 - (lines.length - 1) * 8 + 4;
      lines.forEach(function (ln, i) { s += '<text x="' + n.w / 2 + '" y="' + (y0 + i * 16) + '" font-size="' + fs + '" text-anchor="middle" fill="' + ink + '">' + esc(ln) + '</text>'; });
      if (n.port) s += '<text x="' + (n.w - 8) + '" y="-4" font-size="10.5" text-anchor="end" fill="' + (PORT_COL[n.port.side]) + '">' + (n.port.side === 'in' ? '⇢ ورودی' : '⇠ خروجی') + '</text>';
      s += '</g>';
    });
    return s + '</svg>';
  }

  /* ----- Mermaid ----- */
  function mermaid(flow) {
    if (!flow || !flow.nodes || !flow.nodes.length) return '';
    var id = {}, L = ['flowchart TD'];
    flow.nodes.forEach(function (n, i) {
      id[n.id] = 'n' + (i + 1);
      var t = '"' + String(n.text || TYPES[n.type].name).replace(/"/g, "'").replace(/\n/g, '<br/>') + '"', k = 'n' + (i + 1);
      var f = { start: '([' + t + '])', end: '([' + t + '])', process: '[' + t + ']', decision: '{' + t + '}', io: '[/' + t + '/]', sub: '[[' + t + ']]', db: '[(' + t + ')]', note: '>' + t + ']', text: '[' + t + ']' }[n.type] || '[' + t + ']';
      L.push('  ' + k + f);
    });
    (flow.edges || []).forEach(function (e) { if (id[e.from] && id[e.to]) L.push('  ' + id[e.from] + (e.label ? ' -->|' + String(e.label).replace(/[|"]/g, '') + '| ' : ' --> ') + id[e.to]); });
    return L.join('\n');
  }

  /* ----- ویرایشگر ----- */
  function edit(opt) {
    var data = opt.flow && opt.flow.nodes ? clone(opt.flow) : { v: 1, nodes: [], edges: [] };
    data.edges = data.edges || [];
    tidyLight(data); /* فقط اندازهٔ شکل‌ها از روی متن؛ مسیرها همان ذخیره‌شده‌اند (چیدن فقط با دکمه) */
    var hist = [JSON.stringify(data)], hi = 0, dirty = false, saving = false, cv = null, drop = 0;
    var RO = !!opt.readonly;
    var ov = document.createElement('div'); ov.className = 'fl-ov' + (RO ? ' ro' : '');
    var pal = ORDER.map(function (k) {
      var t = TYPES[k], sh = CV.shapePath(t.shape, 44, 28);
      return '<button type="button" class="fl-p" draggable="true" data-t="' + k + '" title="' + t.name + ' — کلیک یا بکشید"><svg viewBox="0 0 44 28" width="44" height="28"><path d="' + sh + '" fill="' + (t.color || '#888888') + '" fill-opacity=".15" stroke="' + (t.color || '#888888') + '" stroke-width="1.6"' + (k === 'text' ? ' stroke-dasharray="3 2"' : '') + '/></svg><span>' + t.name + '</span></button>';
    }).join('');
    ov.innerHTML = '<div class="fl-top"><b class="fl-title">' + esc(opt.title || 'فلوچارت') + '</b><span class="fl-sp"></span>' +
      (RO ? '<span class="pill">فقط مشاهده — برای تغییر، «شروع ویرایش» را در برنامه بزنید</span>' : '<button class="btn sm" data-a="undo" title="Ctrl+Z">↶ برگردان</button><button class="btn sm" data-a="redo" title="Ctrl+Y">↷ از نو</button>') +
      (RO ? '' : '<button class="btn sm" data-a="arrange" title="چیدن، مسیریابی و بررسیِ همهٔ قاعده‌ها — فقط یک بار؛ نتیجه با «ذخیره» می‌ماند">✨ چیدمان خودکار</button>') +
      '<button class="btn sm" data-a="zout">－</button><button class="btn sm" data-a="fit">جا بده</button><button class="btn sm" data-a="zin">＋</button>' +
      '<button class="btn sm" data-a="svg">⬇ تصویر SVG</button><button class="btn sm" data-a="mmd">کپی Mermaid</button>' +
      (RO ? '' : '<button class="btn sm pri" data-a="save">ذخیره</button><button class="btn sm" data-a="saveclose">ذخیره و بستن</button>') + '<button class="btn sm" data-a="close">✕ بستن</button></div>' +
      '<div class="fl-body">' + (RO ? '' : '<div class="fl-pal">' + pal + '<div class="fl-hint">دوبار کلیک روی بوم = شکلِ تازه<br>از نقطهٔ کنارِ هر شکل بکشید و روی شکلِ دیگر رها کنید = اتصال<br>رها کردن روی جای خالی = شکل + اتصال<br>روی شکل/پیکان کلیک کنید تا رنگ و ابزار بیاید<br>Shift+کشیدن = انتخابِ چندتایی</div></div>') + '<div class="fl-cv"></div></div>';
    document.body.appendChild(ov);
    var host = ov.querySelector('.fl-cv');

    var ports = { 'in': clone((opt.ports && opt.ports.inputs) || []), out: clone((opt.ports && opt.ports.outputs) || []) };
    function boundNode(side, name) { for (var i = 0; i < data.nodes.length; i++) { var n = data.nodes[i]; if (n.port && n.port.side === side && n.port.name === name) return n; } return null; }
    function portState(side, p) {
      if (p.unused) return 'unused';
      var b = boundNode(side, p.name); if (!b) return 'none';
      return data.edges.some(function (e) { return side === 'in' ? e.from === b.id : e.to === b.id; }) ? 'ok' : 'dangling';
    }
    var ST_TXT = { wired: '✓ به ماژول وصل است', ok: '✓ تعریف شده', unused: '✗ بدون استفاده', none: '⚠ هدف مشخص نیست', dangling: '⚠ به چیزی وصل نیست' };
    var railsEl = null;
    function renderPorts() {
      if (!railsEl) { railsEl = document.createElement('div'); railsEl.className = 'cv-ui fl-rails'; host.appendChild(railsEl); }
      var cols = { 'in': '', out: '' };
      ['in', 'out'].forEach(function (side) {
        ports[side].forEach(function (p) {
          var st = portState(side, p), tip = [p.name, p.desc, p.use, p.via, ST_TXT[st], p.why].filter(Boolean).join(' — ');
          cols[side] += '<div class="fl-pc ' + st + ' ' + side + '"' + (RO ? '' : ' draggable="true"') + ' data-port="' + side + ':' + esc(p.name) + '" title="' + esc(tip) + (RO ? '' : ' — بکشید و روی بوم رها کنید، یا کلیک کنید') + '">' +
            '<div class="pcn">' + (side === 'in' ? '⇢ ' : '⇠ ') + esc(p.name) + '</div><div class="pcs">' + ST_TXT[st] + '</div>' + (p.via ? '<small class="pcv">↳ ' + esc(p.via) + '</small>' : '') +
            (RO ? '' : '<button type="button" class="fl-px' + (p.unused ? ' on' : '') + '" data-px="' + side + ':' + esc(p.name) + '" title="' + (p.unused ? 'از حالتِ «بدون استفاده» درآور' : 'این ' + (side === 'in' ? 'ورودی' : 'خروجی') + ' در اینجا استفاده نمی‌شود') + '">✗</button>') + '</div>';
        });
      });
      railsEl.innerHTML = '<div class="fl-rail in"><div class="fl-rh">⇢ ورودی‌های این بخش<br><span>به بوم بکشید</span></div>' + (cols['in'] || '<div class="fl-rn">ورودی ندارد</div>') + '</div>' +
        '<div class="fl-rail out"><div class="fl-rh">⇠ خروجی‌های این بخش<br><span>به بوم بکشید</span></div>' + (cols.out || '<div class="fl-rn">خروجی ندارد</div>') + '</div>';
    }
    function addPortNode(side, name, at) {
      var ex = boundNode(side, name);
      if (ex) { cv.select([ex.id]); cv.focusItem(ex.id); return; }
      var t = TYPES.io, cnt2 = data.nodes.filter(function (q) { return q.port && q.port.side === side; }).length, r = host.getBoundingClientRect(), p;
      if (at) p = at; else p = cv.toWorld(side === 'in' ? r.right - 330 : r.left + 330, r.top + 120 + cnt2 * 95);
      var n = { id: uid(data.nodes, 'n'), type: 'io', text: name, x: Math.round((p.x - t.w / 2) / 10) * 10, y: Math.round((p.y - t.h / 2) / 10) * 10, w: t.w, h: t.h, color: null, port: { side: side, name: name } };
      data.nodes.push(n); commit(); render(false); cv.select([n.id]);
    }
    function toggleUnused(side, name) {
      var p = ports[side].filter(function (x) { return x.name === name; })[0]; if (!p) return;
      var why = '', un = !p.unused;
      if (un) { why = prompt('چرا این ' + (side === 'in' ? 'ورودی' : 'خروجی') + ' «' + name + '» در اینجا استفاده نمی‌شود؟ (توضیح بنویسید)', p.why || ''); if (why === null) return; if (!String(why).trim()) { alert('نوشتنِ دلیل لازم است.'); return; } }
      Promise.resolve(opt.onUnused ? opt.onUnused(side, name, un, why) : null).then(function () { p.unused = un; p.why = un ? why : ''; renderPorts(); });
    }
    function model() {
      var items = data.nodes.map(function (n) {
        var t = TYPES[n.type] || TYPES.process;
        var it = { id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, shape: t.shape, color: n.type === 'text' ? null : colorOf(n), text: n.text, cls: 'fl-' + n.type };
        if (n.port) { it.color = n.color || PORT_COL[n.port.side]; it.html = '<span class="pb ' + n.port.side + '">' + (n.port.side === 'in' ? '⇢ ورودی' : '⇠ خروجی') + '</span>' + esc(n.text); it.cls += ' fl-bound'; }
        return it;
      });
      var links = data.edges.map(function (e) { return { id: e.id, from: e.from, to: e.to, label: e.label, color: e.color, fa: e.fa || null, ta: e.ta || null }; });
      return { items: items, links: links };
    }
    function render(keepSel) { renderPorts(); var m = model(); var sel = cv.selectedIds(); cv.setData(m.items, m.links, keepSel); if (keepSel) cv.select(sel.filter(function (i) { return data.nodes.some(function (n) { return n.id === i; }); })); empty(); }
    function empty() {
      var e = host.querySelector('.fl-empty');
      if (data.nodes.length) { if (e) e.remove(); return; }
      if (e) return;
      e = document.createElement('div'); e.className = 'fl-empty cv-ui';
      e.innerHTML = RO ? '<div>این بخش فلوچارتی ندارد.</div>' : '<div>بومِ خالی است.<br>یک شکل از نوارِ کناری بکشید، یا روی بوم دوبار کلیک کنید.</div><button class="btn pri" data-a="sample">با یک نمونه شروع کن</button>';
      host.appendChild(e);
    }
    function commit() {
      var s = JSON.stringify(data);
      if (s === hist[hi]) return;
      hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 80) hist.shift(); hi = hist.length - 1; dirty = true; mark();
    }
    function restore(i) { hi = i; data = JSON.parse(hist[hi]); dirty = true; render(false); mark(); }
    function mark() { if (RO) return; var b = ov.querySelector('[data-a=save]'); b.textContent = dirty ? 'ذخیره ●' : 'ذخیره'; ov.querySelector('[data-a=undo]').disabled = hi === 0; ov.querySelector('[data-a=redo]').disabled = hi >= hist.length - 1; }
    function nodeById(id) { for (var i = 0; i < data.nodes.length; i++) if (data.nodes[i].id === id) return data.nodes[i]; return null; }
    function addNode(type, cx, cy, editNow) {
      var t = TYPES[type], n = { id: uid(data.nodes, 'n'), type: type, text: type === 'text' ? 'متن' : t.name, x: 0, y: 0, w: t.w, h: t.h, color: null };
      n.x = Math.round((cx - n.w / 2) / 10) * 10; n.y = Math.round((cy - n.h / 2) / 10) * 10;
      data.nodes.push(n); commit(); render(false); cv.select([n.id]);
      if (editNow) setTimeout(function () { cv.edit(n.id); }, 30);
      return n;
    }
    function sameAnchor(x, y) { return JSON.stringify(x || null) === JSON.stringify(y || null); }
    function addEdge(a, b, fa, ta) {
      if (a === b) return;
      for (var i = 0; i < data.edges.length; i++) if (data.edges[i].from === a && data.edges[i].to === b && sameAnchor(data.edges[i].fa, fa) && sameAnchor(data.edges[i].ta, ta)) return;
      var from = nodeById(a), outs = data.edges.filter(function (e) { return e.from === a; }).length;
      var e = { id: uid(data.edges, 'e'), from: a, to: b, label: from && from.type === 'decision' ? (outs === 0 ? 'بله' : outs === 1 ? 'خیر' : '') : '', color: null, fa: fa || null, ta: ta || null };
      data.edges.push(e); commit(); render(true); return e;
    }
    function removeNodes(ids) {
      var s = {}; ids.forEach(function (i) { s[i] = 1; });
      data.nodes = data.nodes.filter(function (n) { return !s[n.id]; });
      data.edges = data.edges.filter(function (e) { return !s[e.from] && !s[e.to]; });
      commit(); render(false);
    }
    var cnt = 0;
    cv = CV.create(host, { id: 'fl', onView: null, readonly: RO, freePoints: true, fitSide: 215, stub: 30, lanes: 30,
      saved: function () { var m = {}; data.edges.forEach(function (e) { if (e.pts) m[e.id] = { p: e.pts, m: e.mid || null, h: e.hide ? 1 : 0 }; }); return m; },
      onMove: function (list) { list.forEach(function (m) { var n = nodeById(m.id); if (n) { n.x = m.x; n.y = m.y; } }); commit(); },
      onAdd: function (p) { addNode('process', p.x, p.y, true); },
      onConnect: function (a, b, pa, pb, fa, ta) { addEdge(a.id, b.id, fa, ta); },
      onLinkReattach: function (l, end, item, anchorSpec) {
        var e = data.edges.filter(function (x) { return x.id === l.id; })[0]; if (!e) return;
        if (end === 'from') { if (item.id === e.to) return; e.from = item.id; e.fa = anchorSpec || null; } else { if (item.id === e.from) return; e.to = item.id; e.ta = anchorSpec || null; }
        commit(); render(true); cv.select([], l.id);
      },
      onConnectNew: function (a, p, port, fa) {
        var src = nodeById(a.id), n = addNode(src && src.type === 'decision' ? 'process' : 'process', p.x, p.y, false);
        var e = addEdge(a.id, n.id, fa, null); cv.select([n.id]); setTimeout(function () { cv.edit(n.id); }, 30);
      },
      onRename: function (it, v) { var n = nodeById(it.id); if (n) { n.text = v; fitNode(n, fontOf()); separate(data.nodes); commit(); render(true); } },
      onColor: function (it, c) { var n = nodeById(it.id); if (n) { n.color = c; commit(); render(true); } },
      onDelete: function (ids) { if (ids.length) removeNodes(ids); },
      onLinkLabel: function (l, v) { data.edges.forEach(function (e) { if (e.id === l.id) e.label = v; }); commit(); render(true); cv.select([], l.id); },
      onLinkColor: function (l, c) { data.edges.forEach(function (e) { if (e.id === l.id) e.color = c; }); commit(); render(true); cv.select([], l.id); },
      onLinkDelete: function (l) { data.edges = data.edges.filter(function (e) { return e.id !== l.id; }); commit(); render(false); },
      onLinkReverse: function (l) { data.edges.forEach(function (e) { if (e.id === l.id) { var t = e.from; e.from = e.to; e.to = t; } }); commit(); render(true); cv.select([], l.id); },
      onDuplicate: function (ids) {
        var map = {}, ns = [];
        ids.forEach(function (i) { var n = nodeById(i); if (!n) return; var c = clone(n); c.id = uid(data.nodes.concat(ns), 'n'); c.x += 30; c.y += 30; map[i] = c.id; ns.push(c); });
        data.edges.slice().forEach(function (e) { if (map[e.from] && map[e.to]) data.edges.push({ id: uid(data.edges, 'e'), from: map[e.from], to: map[e.to], label: e.label, color: e.color }); });
        data.nodes = data.nodes.concat(ns); commit(); render(false); cv.select(ns.map(function (n) { return n.id; }));
      },
      onUndo: function () { if (hi > 0) restore(hi - 1); }, onRedo: function () { if (hi < hist.length - 1) restore(hi + 1); },
      onSave: function () { save(false); },
      itemActions: function (it) {
        var n = nodeById(it.id); if (!n) return [];
        var acts = [];
        if (n.port) acts.push({ icon: '✂', title: 'جداکردن از ورودی/خروجی', fn: function () { n.port = null; commit(); render(true); } });
        if (CYCLE.indexOf(n.type) >= 0) acts.push({ icon: '⬡', title: 'تغییرِ شکل', fn: function () { n.type = CYCLE[(CYCLE.indexOf(n.type) + 1) % CYCLE.length]; var t = TYPES[n.type]; n.w = Math.max(n.w, t.w * 0.8); n.h = Math.max(n.h, t.h * 0.8); if (n.type === 'decision') n.h = Math.max(n.h, 96); commit(); render(true); } });
        acts.push({ icon: '⊕', title: 'بزرگ‌تر', fn: function () { n.w = Math.round(n.w * 1.2); n.h = Math.round(n.h * 1.2); commit(); render(true); } });
        acts.push({ icon: '⊖', title: 'کوچک‌تر', fn: function () { n.w = Math.max(60, Math.round(n.w / 1.2)); n.h = Math.max(34, Math.round(n.h / 1.2)); commit(); render(true); } });
        return acts;
      }
    });
    render(false); cv.fit(); mark();

    function save(close) {
      if (saving) return; saving = true;
      var clean = { v: 1, nodes: data.nodes, edges: data.edges };
      Promise.resolve(opt.onSave(data.nodes.length ? clean : null)).then(function () { dirty = false; mark(); saving = false; if (close) shut(true); }, function () { saving = false; });
    }
    function shut(force) {
      if (!force && dirty && !confirm('تغییرات ذخیره نشده‌اند. بسته شود؟')) return;
      document.removeEventListener('keydown', onKey, true); ov.remove(); if (opt.onClose) opt.onClose();
    }
    function onKey(e) { if (e.key === 'Escape' && !document.querySelector('.cv-edit') && document.activeElement === document.body) shut(false); }
    document.addEventListener('keydown', onKey, true);

    ov.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'), p = e.target.closest('.fl-p');
      var pc = e.target.closest('[data-port]'), px = e.target.closest('[data-px]');
      if (px) { var xv = px.getAttribute('data-px').split(':'); toggleUnused(xv[0], xv.slice(1).join(':')); return; }
      if (pc && !RO) { var pv = pc.getAttribute('data-port').split(':'); addPortNode(pv[0], pv.slice(1).join(':')); return; }
      if (p) { var c = cv.centerOf(); var jitter = (cnt++ % 6) * 24; addNode(p.getAttribute('data-t'), c.x + jitter, c.y + jitter, true); return; }
      if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'undo' && hi > 0) restore(hi - 1);
      else if (a === 'redo' && hi < hist.length - 1) restore(hi + 1);
      else if (a === 'arrange' && !RO) {
        if (!data.nodes.length) return;
        arrange(data); tidy(data); render(false);
        var rr = cv.arrange(), byN = {};
        data.nodes.forEach(function (n) { byN[n.id] = n; });
        rr.items.forEach(function (it) { var n = byN[it.id]; if (n) { n.x = Math.round(it.x); n.y = Math.round(it.y); } });
        data.edges.forEach(function (e) { var g = rr.links[e.id]; if (g) { e.pts = g.p; e.mid = g.m; e.hide = g.h ? 1 : 0; } else { delete e.pts; delete e.mid; delete e.hide; } });
        commit(); render(true); cv.fit();
      }
      else if (a === 'zin') cv.zoomBy(1.2); else if (a === 'zout') cv.zoomBy(1 / 1.2); else if (a === 'fit') cv.fit();
      else if (a === 'save') save(false); else if (a === 'saveclose') save(true); else if (a === 'close') shut(false);
      else if (a === 'svg') { var s = svgString(data, { bg: '#ffffff' }); var l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' })); l.download = (opt.title || 'flowchart').replace(/[\\\/:*?"<>|\s]+/g, '_') + '.svg'; document.body.appendChild(l); l.click(); setTimeout(function () { URL.revokeObjectURL(l.href); l.remove(); }, 500); }
      else if (a === 'mmd') { var m = mermaid(data); (navigator.clipboard ? navigator.clipboard.writeText(m) : Promise.reject()).then(function () { if (opt.toast) opt.toast('کد Mermaid کپی شد'); }, function () { prompt('کدِ Mermaid:', m); }); }
      else if (a === 'sample') {
        data.nodes = [{ id: 'n1', type: 'start', text: 'شروع', x: 200, y: 20, w: 140, h: 52, color: null }, { id: 'n2', type: 'process', text: 'دریافتِ ورودی', x: 185, y: 120, w: 170, h: 64, color: null },
          { id: 'n3', type: 'decision', text: 'معتبر است؟', x: 180, y: 230, w: 180, h: 104, color: null }, { id: 'n4', type: 'process', text: 'پردازش و ذخیره', x: 440, y: 250, w: 170, h: 64, color: null },
          { id: 'n5', type: 'process', text: 'نمایشِ خطا', x: -60, y: 250, w: 170, h: 64, color: null }, { id: 'n6', type: 'end', text: 'پایان', x: 460, y: 380, w: 140, h: 52, color: null }];
        data.edges = [{ id: 'e1', from: 'n1', to: 'n2', label: '', color: null }, { id: 'e2', from: 'n2', to: 'n3', label: '', color: null }, { id: 'e3', from: 'n3', to: 'n4', label: 'بله', color: null },
          { id: 'e4', from: 'n3', to: 'n5', label: 'خیر', color: null }, { id: 'e5', from: 'n4', to: 'n6', label: '', color: null }, { id: 'e6', from: 'n5', to: 'n2', label: '', color: null }];
        commit(); render(false); cv.fit();
      }
    });
    /* کشیدن از نوار به بوم */
    ov.addEventListener('dragstart', function (e) { var pcx = e.target.closest ? e.target.closest('.fl-pc') : null; if (pcx && !RO) { e.dataTransfer.setData('text/plain', 'port:' + pcx.getAttribute('data-port')); e.dataTransfer.effectAllowed = 'copy'; return; } var p = e.target.closest ? e.target.closest('.fl-p') : null; if (p) { e.dataTransfer.setData('text/plain', p.getAttribute('data-t')); e.dataTransfer.effectAllowed = 'copy'; } });
    host.addEventListener('dragover', function (e) { e.preventDefault(); });
    host.addEventListener('drop', function (e) {
      e.preventDefault(); var t = e.dataTransfer.getData('text/plain');
      if (t.indexOf('port:') === 0) { var pv2 = t.slice(5).split(':'), rr = host.getBoundingClientRect(); addPortNode(pv2[0], pv2.slice(1).join(':'), cv.toWorld(e.clientX, e.clientY)); return; }
      if (!TYPES[t]) return;
      var r = host.getBoundingClientRect(), v = cv.getView();
      addNode(t, (e.clientX - r.left - v.x) / v.k, (e.clientY - r.top - v.y) / v.k, true);
    });
    host.focus();
    return { close: function () { shut(true); } };
  }

  W.FLOW = { edit: edit, svg: svgString, mermaid: mermaid, TYPES: TYPES, tidy: tidy, arrange: arrange };
})(window);
