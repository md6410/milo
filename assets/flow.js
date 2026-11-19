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
  var ORDER = ['start', 'process', 'decision', 'io', 'sub', 'db', 'note', 'text', 'end'];
  var CYCLE = ['process', 'decision', 'io', 'sub', 'db', 'note'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid(list, p) { var n = list.length + 1, ids = {}; list.forEach(function (x) { ids[x.id] = 1; }); while (ids[p + n]) n++; return p + n; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function colorOf(n) { return n.color || TYPES[n.type].color; }

  /* ----- تصویرِ ایستا (SVG) ----- */
  function wrap(text, w, fs) {
    var per = Math.max(4, Math.floor(w / (fs * 0.55))), out = [];
    String(text || '').split('\n').forEach(function (ln) {
      var line = '';
      ln.split(/\s+/).forEach(function (wd) { if ((line + ' ' + wd).trim().length > per && line) { out.push(line); line = wd; } else line = (line + ' ' + wd).trim(); });
      out.push(line);
    });
    return out.slice(0, 6);
  }
  function svgString(flow, opt) {
    opt = opt || {};
    if (!flow || !flow.nodes || !flow.nodes.length) return '';
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
    var obs = nodes.map(function (n) { return { l: n.x - 14, t: n.y - 14, r: n.x + n.w + 14, b: n.y + n.h + 14 }; }), used = [];
    (flow.edges || []).forEach(function (e) {
      var a = by[e.from], b = by[e.to]; if (!a || !b) return;
      var pa = CV.anchor(a, b.x + b.w / 2, b.y + b.h / 2), pb = CV.anchor(b, a.x + a.w / 2, a.y + a.h / 2), col = e.color || '#7d88a3';
      var pts = (nodes.length < 90 && CV.route(pa, pb, obs, used)) || CV.quickRoute(pa, pb);
      var d = CV.toPath(pts), mid = CV.midOf(pts);
      for (var q = 1; q < pts.length; q++) { var u = pts[q - 1], w = pts[q]; if (u.y === w.y) used.push({ h: true, c: u.y, lo: Math.min(u.x, w.x), hi: Math.max(u.x, w.x) }); else if (u.x === w.x) used.push({ h: false, c: u.x, lo: Math.min(u.y, w.y), hi: Math.max(u.y, w.y) }); }
      s += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" marker-end="url(#m' + col.replace('#', '') + ')"/>';
      if (e.label) s += '<rect x="' + (mid.x - e.label.length * 3.6 - 6) + '" y="' + (mid.y - 11) + '" width="' + (e.label.length * 7.2 + 12) + '" height="20" rx="10" fill="' + (bg || '#fff') + '" stroke="' + col + '"/><text x="' + mid.x + '" y="' + (mid.y + 4) + '" font-size="12" text-anchor="middle" fill="' + ink + '">' + esc(e.label) + '</text>';
    });
    nodes.forEach(function (n) {
      var col = colorOf(n) || ink, t = TYPES[n.type] || TYPES.process;
      s += '<g transform="translate(' + n.x + ' ' + n.y + ')">';
      if (n.type !== 'text') s += '<path d="' + CV.shapePath(t.shape, n.w, n.h) + '" fill="' + col + '" fill-opacity=".16" stroke="' + col + '" stroke-width="2" stroke-linejoin="round"/>';
      var lines = wrap(n.text, n.w * (n.type === 'decision' ? 0.62 : 0.86), fs), y0 = n.h / 2 - (lines.length - 1) * 8 + 4;
      lines.forEach(function (ln, i) { s += '<text x="' + n.w / 2 + '" y="' + (y0 + i * 16) + '" font-size="' + fs + '" text-anchor="middle" fill="' + ink + '">' + esc(ln) + '</text>'; });
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
    var hist = [JSON.stringify(data)], hi = 0, dirty = false, saving = false, cv = null, drop = 0;
    var RO = !!opt.readonly;
    var ov = document.createElement('div'); ov.className = 'fl-ov' + (RO ? ' ro' : '');
    var pal = ORDER.map(function (k) {
      var t = TYPES[k], sh = CV.shapePath(t.shape, 44, 28);
      return '<button type="button" class="fl-p" draggable="true" data-t="' + k + '" title="' + t.name + ' — کلیک یا بکشید"><svg viewBox="0 0 44 28" width="44" height="28"><path d="' + sh + '" fill="' + (t.color || '#888888') + '" fill-opacity=".15" stroke="' + (t.color || '#888888') + '" stroke-width="1.6"' + (k === 'text' ? ' stroke-dasharray="3 2"' : '') + '/></svg><span>' + t.name + '</span></button>';
    }).join('');
    ov.innerHTML = '<div class="fl-top"><b class="fl-title">' + esc(opt.title || 'فلوچارت') + '</b><span class="fl-sp"></span>' +
      (RO ? '<span class="pill">فقط مشاهده — برای تغییر، «شروع ویرایش» را در برنامه بزنید</span>' : '<button class="btn sm" data-a="undo" title="Ctrl+Z">↶ برگردان</button><button class="btn sm" data-a="redo" title="Ctrl+Y">↷ از نو</button>') +
      '<button class="btn sm" data-a="zout">－</button><button class="btn sm" data-a="fit">جا بده</button><button class="btn sm" data-a="zin">＋</button>' +
      '<button class="btn sm" data-a="svg">⬇ تصویر SVG</button><button class="btn sm" data-a="mmd">کپی Mermaid</button>' +
      (RO ? '' : '<button class="btn sm pri" data-a="save">ذخیره</button><button class="btn sm" data-a="saveclose">ذخیره و بستن</button>') + '<button class="btn sm" data-a="close">✕ بستن</button></div>' +
      '<div class="fl-body">' + (RO ? '' : '<div class="fl-pal">' + pal + '<div class="fl-hint">دوبار کلیک روی بوم = شکلِ تازه<br>از نقطهٔ کنارِ هر شکل بکشید و روی شکلِ دیگر رها کنید = اتصال<br>رها کردن روی جای خالی = شکل + اتصال<br>روی شکل/پیکان کلیک کنید تا رنگ و ابزار بیاید<br>Shift+کشیدن = انتخابِ چندتایی</div></div>') + '<div class="fl-cv"></div></div>';
    document.body.appendChild(ov);
    var host = ov.querySelector('.fl-cv');

    function model() {
      var items = data.nodes.map(function (n) {
        var t = TYPES[n.type] || TYPES.process;
        return { id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, shape: t.shape, color: n.type === 'text' ? null : colorOf(n), text: n.text, cls: 'fl-' + n.type };
      });
      var links = data.edges.map(function (e) { return { id: e.id, from: e.from, to: e.to, label: e.label, color: e.color }; });
      return { items: items, links: links };
    }
    function render(keepSel) { var m = model(); var sel = cv.selectedIds(); cv.setData(m.items, m.links, keepSel); if (keepSel) cv.select(sel.filter(function (i) { return data.nodes.some(function (n) { return n.id === i; }); })); empty(); }
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
    function addEdge(a, b) {
      if (a === b) return;
      for (var i = 0; i < data.edges.length; i++) if (data.edges[i].from === a && data.edges[i].to === b) return;
      var from = nodeById(a), outs = data.edges.filter(function (e) { return e.from === a; }).length;
      var e = { id: uid(data.edges, 'e'), from: a, to: b, label: from && from.type === 'decision' ? (outs === 0 ? 'بله' : outs === 1 ? 'خیر' : '') : '', color: null };
      data.edges.push(e); commit(); render(true); return e;
    }
    function removeNodes(ids) {
      var s = {}; ids.forEach(function (i) { s[i] = 1; });
      data.nodes = data.nodes.filter(function (n) { return !s[n.id]; });
      data.edges = data.edges.filter(function (e) { return !s[e.from] && !s[e.to]; });
      commit(); render(false);
    }
    var cnt = 0;
    cv = CV.create(host, { id: 'fl', onView: null, readonly: RO,
      onMove: function (list) { list.forEach(function (m) { var n = nodeById(m.id); if (n) { n.x = m.x; n.y = m.y; } }); commit(); },
      onAdd: function (p) { addNode('process', p.x, p.y, true); },
      onConnect: function (a, b) { addEdge(a.id, b.id); },
      onConnectNew: function (a, p) {
        var src = nodeById(a.id), n = addNode(src && src.type === 'decision' ? 'process' : 'process', p.x, p.y, false);
        var e = addEdge(a.id, n.id); cv.select([n.id]); setTimeout(function () { cv.edit(n.id); }, 30);
      },
      onRename: function (it, v) { var n = nodeById(it.id); if (n) { n.text = v; commit(); render(true); } },
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
      if (p) { var c = cv.centerOf(); var jitter = (cnt++ % 6) * 24; addNode(p.getAttribute('data-t'), c.x + jitter, c.y + jitter, true); return; }
      if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'undo' && hi > 0) restore(hi - 1);
      else if (a === 'redo' && hi < hist.length - 1) restore(hi + 1);
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
    ov.addEventListener('dragstart', function (e) { var p = e.target.closest ? e.target.closest('.fl-p') : null; if (p) { e.dataTransfer.setData('text/plain', p.getAttribute('data-t')); e.dataTransfer.effectAllowed = 'copy'; } });
    host.addEventListener('dragover', function (e) { e.preventDefault(); });
    host.addEventListener('drop', function (e) {
      e.preventDefault(); var t = e.dataTransfer.getData('text/plain'); if (!TYPES[t]) return;
      var r = host.getBoundingClientRect(), v = cv.getView();
      addNode(t, (e.clientX - r.left - v.x) / v.k, (e.clientY - r.top - v.y) / v.k, true);
    });
    host.focus();
    return { close: function () { shut(true); } };
  }

  W.FLOW = { edit: edit, svg: svgString, mermaid: mermaid, TYPES: TYPES };
})(window);
