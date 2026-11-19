/* بومِ گرافیکی (جابه‌جایی، زوم، بلوک، پیوند با کشیدن) — برای نقشهٔ ساختار و فلوچارت. بدونِ ?. */
(function (W) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var PALETTE = ['#2f6fed', '#7a5af8', '#e0558a', '#d64545', '#e0912b', '#d4a514', '#1f9d63', '#14a3a3', '#64748b', '#1c2333'];

  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function sv(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* مسیرِ شکل‌ها در جعبهٔ w×h */
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

  /* لنگر روی ضلعِ رو به نقطهٔ مقابل */
  function anchor(it, tx, ty) {
    var cx = it.x + it.w / 2, cy = it.y + it.h / 2, dx = tx - cx, dy = ty - cy;
    if (Math.abs(dx) * it.h >= Math.abs(dy) * it.w) return dx >= 0 ? { x: it.x + it.w, y: cy, nx: 1, ny: 0 } : { x: it.x, y: cy, nx: -1, ny: 0 };
    return dy >= 0 ? { x: cx, y: it.y + it.h, nx: 0, ny: 1 } : { x: cx, y: it.y, nx: 0, ny: -1 };
  }
  function curve(a, b, na, nb) {
    var d = Math.max(36, Math.min(160, Math.hypot(b.x - a.x, b.y - a.y) / 2.4));
    var c1 = { x: a.x + na.nx * d, y: a.y + na.ny * d }, c2 = { x: b.x + nb.nx * d, y: b.y + nb.ny * d };
    return { d: 'M' + a.x + ' ' + a.y + ' C' + c1.x + ' ' + c1.y + ' ' + c2.x + ' ' + c2.y + ' ' + b.x + ' ' + b.y,
      mid: { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 } };
  }

  function create(host, o) {
    o = o || {};
    var C = { items: [], links: [], view: o.view || { x: 40, y: 40, k: 1 }, sel: {}, selLink: null, snap: o.snap !== false ? 10 : 0 };
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
    world.appendChild(svg); world.appendChild(labelLayer); world.appendChild(itemLayer);
    var ui = h('div', 'cv-ui');
    host.appendChild(world); host.appendChild(ui);
    var tb = h('div', 'cv-tb'); tb.style.display = 'none'; ui.appendChild(tb);
    var editor = null;
    var MARKER = 'cvah' + (o.id || ''), markers = {};
    function markerFor(color) {
      color = color || '#7d88a3';
      var id = MARKER + color.replace('#', '');
      if (!markers[id]) {
        var m = sv('marker', { id: id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' });
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
      var inner = '';
      var shape = it.shape || 'card';
      if (shape !== 'card') {
        inner += '<svg class="cvsh" viewBox="0 0 ' + it.w + ' ' + it.h + '" preserveAspectRatio="none"><path d="' + shapePath(shape, it.w, it.h) + '" vector-effect="non-scaling-stroke"/></svg>';
        inner += '<div class="cvt">' + (it.html != null ? it.html : esc(it.text || '')) + '</div>';
      } else inner += it.html || '';
      if (!it.ghost && !o.readonly) inner += '<i class="cvp p-t" data-p="t"></i><i class="cvp p-r" data-p="r"></i><i class="cvp p-b" data-p="b"></i><i class="cvp p-l" data-p="l"></i>';
      el.innerHTML = inner;
      return el;
    }
    function placeItem(it, el) {
      el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; el.style.width = it.w + 'px'; el.style.height = it.h + 'px';
    }
    function linkGeom(l) {
      var a = byId(l.from), b = byId(l.to); if (!a || !b) return null;
      var ac = { x: b.x + b.w / 2, y: b.y + b.h / 2 }, bc = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
      var pa = anchor(a, ac.x, ac.y), pb = anchor(b, bc.x, bc.y);
      var c = curve(pa, pb, pa, pb);
      return c;
    }
    function drawLink(l) {
      var g = linkEl[l.id]; var geo = linkGeom(l); if (!geo) return;
      if (!g) {
        g = sv('g', { 'class': 'cvl' }); g.setAttribute('data-lid', l.id);
        g.appendChild(sv('path', { 'class': 'cvl-v', fill: 'none' }));
        g.appendChild(sv('path', { 'class': 'cvl-h', fill: 'none' }));
        linkLayer.appendChild(g); linkEl[l.id] = g;
      }
      var v = g.childNodes[0], hit = g.childNodes[1];
      v.setAttribute('d', geo.d); hit.setAttribute('d', geo.d);
      v.setAttribute('stroke', l.color || '#7d88a3');
      v.setAttribute('stroke-width', l.w || 2);
      if (l.dashed) v.setAttribute('stroke-dasharray', '6 5'); else v.removeAttribute('stroke-dasharray');
      if (l.arrow !== false) v.setAttribute('marker-end', markerFor(l.color)); else v.removeAttribute('marker-end');
      g.setAttribute('class', 'cvl' + (C.selLink === l.id ? ' sel' : '') + (l.locked ? ' locked' : ''));
      var lb = labelEl[l.id];
      if (l.label) {
        if (!lb) { lb = h('div', 'cv-lbl'); lb.setAttribute('data-lid', l.id); labelLayer.appendChild(lb); labelEl[l.id] = lb; }
        lb.textContent = l.label; lb.style.left = geo.mid.x + 'px'; lb.style.top = geo.mid.y + 'px';
        lb.className = 'cv-lbl' + (C.selLink === l.id ? ' sel' : '');
        if (l.color) lb.style.borderColor = l.color; else lb.style.borderColor = '';
      } else if (lb) { lb.remove(); delete labelEl[l.id]; }
    }
    function drawAllLinks() { for (var i = 0; i < C.links.length; i++) drawLink(C.links[i]); }

    C.setData = function (items, links, keepSel) {
      C.items = items; C.links = links;
      itemLayer.innerHTML = ''; linkLayer.innerHTML = ''; labelLayer.innerHTML = ''; itemEl = {}; linkEl = {}; labelEl = {};
      if (!keepSel) { C.sel = {}; C.selLink = null; }
      items.forEach(function (it) { var el = buildItem(it); placeItem(it, el); itemLayer.appendChild(el); itemEl[it.id] = el; if (C.sel[it.id]) el.classList.add('sel'); });
      drawAllLinks(); placeToolbar();
    };
    C.selectedIds = function () { return Object.keys(C.sel); };

    /* ----- انتخاب ----- */
    function setSel(ids, linkId) {
      C.sel = {}; (ids || []).forEach(function (i) { C.sel[i] = 1; }); C.selLink = linkId || null;
      for (var id in itemEl) itemEl[id].classList.toggle('sel', !!C.sel[id]);
      drawAllLinks(); placeToolbar();
      if (o.onSelect) o.onSelect(ids && ids.length === 1 ? byId(ids[0]) : null, linkId ? linkById(linkId) : null, ids || []);
    }
    C.select = setSel;

    /* ----- نوارابزار شناور ----- */
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
        var it = byId(ids[0]); if (!it || it.ghost || o.readonly) { tb.style.display = 'none'; return; }
        if (!it.noColor && o.onColor) tb.appendChild(colorDots(it.color, function (c) { o.onColor(it, c); }));
        if (o.itemActions) o.itemActions(it).forEach(function (a) { tb.appendChild(btn(a.icon, a.title, function () { a.fn(it); })); });
        if (!it.noEdit) tb.appendChild(btn('✎', 'ویرایش متن', function () { C.edit(it.id); }));
        if (!it.noDelete) tb.appendChild(btn('🗑', 'حذف', function () { if (o.onDelete) o.onDelete([it.id]); }));
        pos = toScreen(it.x + it.w / 2, it.y);
      } else if (ids.length > 1 && !o.readonly) {
        tb.appendChild(h('span', 'cv-n', ids.length + ' مورد'));
        if (o.onColor) tb.appendChild(colorDots(null, function (c) { ids.forEach(function (i) { var it = byId(i); if (it && !it.ghost) o.onColor(it, c); }); }));
        tb.appendChild(btn('🗑', 'حذف همه', function () { if (o.onDelete) o.onDelete(ids.filter(function (i) { var it = byId(i); return it && !it.ghost && !it.noDelete; })); }));
        var minx = 1e9, miny = 1e9, maxx = -1e9;
        ids.forEach(function (i) { var it = byId(i); if (it) { minx = Math.min(minx, it.x); miny = Math.min(miny, it.y); maxx = Math.max(maxx, it.x + it.w); } });
        pos = toScreen((minx + maxx) / 2, miny);
      } else if (C.selLink && !o.readonly) {
        var l = linkById(C.selLink), geo = l && linkGeom(l);
        if (!l || !geo || l.locked) { tb.style.display = 'none'; return; }
        if (o.onLinkColor) tb.appendChild(colorDots(l.color, function (c) { o.onLinkColor(l, c); }));
        tb.appendChild(btn('✎', 'برچسب', function () { C.editLabel(l.id); }));
        if (o.onLinkReverse) tb.appendChild(btn('⇄', 'برعکس‌کردنِ جهت', function () { o.onLinkReverse(l); }));
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
    function openEditor(box, value, commit, multiline) {
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
      var it = byId(id); if (!it) return;
      var p = toScreen(it.x, it.y), k = C.view.k;
      openEditor({ x: p.x, y: p.y, w: it.w * k, h: it.h * k }, it.text != null ? it.text : it.title, function (v) { if (o.onRename) o.onRename(it, v); });
    };
    C.editLabel = function (lid) {
      var l = linkById(lid), geo = l && linkGeom(l); if (!l || !geo) return;
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
    C.getView = function () { return { x: C.view.x, y: C.view.y, k: C.view.k }; };
    C.focusItem = function (id) {
      var it = byId(id), r = host.getBoundingClientRect(); if (!it) return;
      C.view.x = r.width / 2 - (it.x + it.w / 2) * C.view.k; C.view.y = r.height / 2 - (it.y + it.h / 2) * C.view.k; applyView();
    };
    host.addEventListener('wheel', function (e) { e.preventDefault(); C.zoomBy(Math.exp(-e.deltaY * 0.0014), e.clientX, e.clientY); }, { passive: false });

    /* ----- اشاره‌گر ----- */
    var drag = null;
    function targetItem(e) { var n = e.target.closest ? e.target.closest('.cvi') : null; return n ? byId(n.getAttribute('data-id')) : null; }
    host.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('.cv-ui')) return;
      if (editor) closeEditor(true);
      host.focus({ preventScroll: true });
      var port = e.target.closest ? e.target.closest('.cvp') : null;
      var it = targetItem(e);
      var lh = e.target.closest ? e.target.closest('.cvl') : null;
      var lbl = e.target.closest ? e.target.closest('.cv-lbl') : null;
      host.setPointerCapture(e.pointerId);
      if (port && it && !o.readonly) { drag = { t: 'link', from: it, sx: e.clientX, sy: e.clientY, moved: false }; return; }
      if (it) {
        if (e.shiftKey) { var ids = C.selectedIds(); var i = ids.indexOf(it.id); if (i >= 0) ids.splice(i, 1); else ids.push(it.id); setSel(ids); }
        else if (!C.sel[it.id]) setSel([it.id]);
        if (it.ghost || o.readonly || it.fixed) { drag = { t: 'none' }; return; }
        var starts = {}; C.selectedIds().forEach(function (id) { var x = byId(id); if (x && !x.ghost && !x.fixed) starts[id] = { x: x.x, y: x.y }; });
        drag = { t: 'move', sx: e.clientX, sy: e.clientY, starts: starts, moved: false, hit: it };
        return;
      }
      if (lh || lbl) { setSel([], (lh || lbl).getAttribute('data-lid')); drag = { t: 'none' }; return; }
      if (e.shiftKey) { drag = { t: 'box', sx: e.clientX, sy: e.clientY, moved: false }; return; }
      drag = { t: 'pan', sx: e.clientX, sy: e.clientY, vx: C.view.x, vy: C.view.y, moved: false };
    });
    host.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      if (drag.t === 'pan') { drag.moved = true; C.view.x = drag.vx + dx; C.view.y = drag.vy + dy; applyView(); host.classList.add('panning'); }
      else if (drag.t === 'move') {
        drag.moved = true; var k = C.view.k;
        for (var id in drag.starts) { var it = byId(id), st = drag.starts[id]; it.x = snapv(st.x + dx / k); it.y = snapv(st.y + dy / k); placeItem(it, itemEl[id]); }
        drawAllLinks(); placeToolbar();
      } else if (drag.t === 'link') {
        drag.moved = true; var w = toWorld(e.clientX, e.clientY), a = anchor(drag.from, w.x, w.y);
        tmpLayer.innerHTML = '';
        var c = curve(a, { x: w.x, y: w.y }, a, { nx: -a.nx, ny: -a.ny });
        tmpLayer.appendChild(sv('path', { d: c.d, fill: 'none', stroke: 'var(--pri)', 'stroke-width': 2.4, 'stroke-dasharray': '6 4', 'marker-end': markerFor('#2f6fed') }));
        var under = document.elementFromPoint(e.clientX, e.clientY), tgt = under && under.closest ? under.closest('.cvi') : null;
        for (var i in itemEl) itemEl[i].classList.toggle('drop', !!tgt && tgt === itemEl[i] && i !== drag.from.id);
      } else if (drag.t === 'box') {
        drag.moved = true; var r = host.getBoundingClientRect();
        if (!drag.el) { drag.el = h('div', 'cv-box'); ui.appendChild(drag.el); }
        var x1 = Math.min(drag.sx, e.clientX) - r.left, y1 = Math.min(drag.sy, e.clientY) - r.top;
        drag.el.style.left = x1 + 'px'; drag.el.style.top = y1 + 'px'; drag.el.style.width = Math.abs(dx) + 'px'; drag.el.style.height = Math.abs(dy) + 'px';
      }
    });
    function endDrag(e) {
      if (!drag) return; var d = drag; drag = null; host.classList.remove('panning');
      try { host.releasePointerCapture(e.pointerId); } catch (x) { /* بی‌اثر */ }
      if (d.t === 'move' && d.moved) {
        var out = []; for (var id in d.starts) { var it = byId(id); out.push({ id: id, x: it.x, y: it.y }); }
        if (o.onMove) o.onMove(out);
      } else if (d.t === 'pan' && !d.moved) { setSel([]); }
      else if (d.t === 'link') {
        tmpLayer.innerHTML = ''; for (var i in itemEl) itemEl[i].classList.remove('drop');
        if (!d.moved) return;
        var under = document.elementFromPoint(e.clientX, e.clientY), tgt = under && under.closest ? under.closest('.cvi') : null;
        if (tgt && tgt.getAttribute('data-id') !== d.from.id) { if (o.onConnect) o.onConnect(d.from, byId(tgt.getAttribute('data-id'))); }
        else if (!tgt && o.onConnectNew) o.onConnectNew(d.from, toWorld(e.clientX, e.clientY));
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
      if (lbl && !o.readonly) { var l = linkById(lbl.getAttribute('data-lid')); if (l && !l.locked) { C.editLabel(l.id); return; } }
      if (it) { if (o.onOpen) o.onOpen(it); return; }
      if (!o.readonly && o.onAdd) { var w = toWorld(e.clientX, e.clientY); o.onAdd(w); }
    });
    host.addEventListener('keydown', function (e) {
      if (editor) return;
      var ids = C.selectedIds(), meta = e.ctrlKey || e.metaKey;
      if ((e.key === 'Delete' || e.key === 'Backspace') && !o.readonly) {
        e.preventDefault();
        if (C.selLink) { var l = linkById(C.selLink); if (l && !l.locked && o.onLinkDelete) o.onLinkDelete(l); }
        else if (ids.length && o.onDelete) o.onDelete(ids.filter(function (i) { var it = byId(i); return it && !it.ghost && !it.noDelete; }));
      } else if (e.key === 'Escape') setSel([]);
      else if (e.key === 'F2' || e.key === 'Enter') { if (ids.length === 1 && !o.readonly) { e.preventDefault(); var x = byId(ids[0]); if (x && !x.noEdit && !x.ghost) C.edit(x.id); } else if (C.selLink) C.editLabel(C.selLink); }
      else if (meta && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey ? o.onRedo : o.onUndo) (e.shiftKey ? o.onRedo : o.onUndo)(); }
      else if (meta && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); if (o.onRedo) o.onRedo(); }
      else if (meta && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (o.onSave) o.onSave(); }
      else if (meta && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); if (o.onDuplicate && ids.length) o.onDuplicate(ids); }
      else if (meta && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); setSel(C.items.filter(function (i) { return !i.ghost; }).map(function (i) { return i.id; })); }
      else if (e.key.indexOf('Arrow') === 0 && ids.length && !o.readonly) {
        e.preventDefault(); var st = e.shiftKey ? 50 : 10, mx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, my = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0, out = [];
        ids.forEach(function (i) { var it = byId(i); if (it && !it.ghost && !it.fixed) { it.x += mx; it.y += my; placeItem(it, itemEl[i]); out.push({ id: i, x: it.x, y: it.y }); } });
        drawAllLinks(); placeToolbar(); if (out.length && o.onMove) o.onMove(out);
      }
    });
    C.refreshItem = function (id) { /* بازسازیِ تنهایِ یک آیتم */
      var it = byId(id); if (!it) return; var old = itemEl[id], el = buildItem(it); placeItem(it, el); if (C.sel[id]) el.classList.add('sel'); old.replaceWith(el); itemEl[id] = el; drawAllLinks(); placeToolbar();
    };
    C.redraw = function () { for (var id in itemEl) { var it = byId(id); placeItem(it, itemEl[id]); } drawAllLinks(); placeToolbar(); };
    /* وقتی بوم عرضش عوض می‌شود (مثلاً کشوی جزئیات باز/بسته می‌شود)، بلوک‌ها در صفحه سرِ جایشان بمانند */
    if (o.anchorRight && W.ResizeObserver) {
      var lastW = host.clientWidth;
      new ResizeObserver(function () { var w = host.clientWidth; if (lastW && w !== lastW) { C.view.x += (w - lastW); applyView(); } lastW = w; }).observe(host);
    }
    applyView();
    return C;
  }

  W.PMCanvas = { create: create, PALETTE: PALETTE, shapePath: shapePath, anchor: anchor, curve: curve, esc: esc };
})(window);
