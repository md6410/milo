/* مدیر پروژه — رابط کاربری. بدونِ ?. (سازگاری با مرورگرهای قدیمی‌تر). */
(function () {
'use strict';
var J = window.JAL, E = window.ENG;
var S = { user: null, csrf: '', needsSetup: false, projects: [], pid: 0, P: null, idx: null, sch: null,
  tab: 'dash', focus: 0, sel: 0, open: {}, zoom: 'week', crit: true, logNode: '', logKind: '' };
var FA = J.fa;
var ZOOM = { day: 26, week: 11, month: 4, quarter: 1.6 };

/* ---------- کمک‌ها ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function num(v) { return v == null || v === '' ? '' : FA(Math.round(v * 10) / 10); }
function toast(msg, err) {
  var d = document.createElement('div'); d.className = 'toast' + (err ? ' err' : ''); d.textContent = msg;
  $('#toasts').appendChild(d); setTimeout(function () { d.remove(); }, err ? 6000 : 2800);
}
function api(action, body, opts) {
  opts = opts || {};
  var headers = { 'X-CSRF': S.csrf }, payload;
  if (body instanceof FormData) payload = body; else { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body || {}); }
  return fetch('api.php?a=' + action, { method: 'POST', headers: headers, body: payload, credentials: 'same-origin' })
    .then(function (r) { return r.json().catch(function () { throw new Error('پاسخ نامعتبر از سرور'); }).then(function (j) {
      if (j.error) { var e = new Error(j.error); e.status = r.status; throw e; } return j; }); });
}
function guard(fn) { return function () { var a = arguments; try { var r = fn.apply(null, a); if (r && r.catch) r.catch(fail); } catch (e) { fail(e); } }; }
function fail(e) { if (e && e.status === 401) { S.user = null; render(); } toast(e.message || String(e), true); }
function statusPill(st) { return '<span class="pill s st-' + st + '">' + E.STATUS[st] + '</span>'; }
function bar(p, cls) { return '<div class="bar ' + (cls || '') + '"><i style="width:' + (p || 0) + '%"></i></div>'; }
function dateField(name, iso, ph) {
  return '<input class="ltr jd" name="' + name + '" data-iso="' + esc(iso || '') + '" value="' + esc(iso ? J.fmt(iso) : '') + '" placeholder="' + (ph || '۱۴۰۵/۰۸/۲۸') + '" autocomplete="off">';
}
function readDate(inp) { var v = J.parse(inp.value); return v === undefined ? undefined : v; }
function fmtDT(s) { // 'YYYY-MM-DD HH:MM:SS' (محلی سرور)
  if (!s) return ''; return J.fmt(s.slice(0, 10)) + ' ' + FA(s.slice(11, 16));
}
function download(name, text, mime) {
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime || 'application/json' })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function safeName(s) { return String(s).replace(/[\\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'project'; }

/* ---------- مودال ---------- */
function modal(opts) {
  var ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = '<form class="modal ' + (opts.cls || '') + '"><h3>' + esc(opts.title) + '</h3>' + opts.body +
    '<div class="act">' + (opts.noOk ? '' : '<button class="btn pri" type="submit">' + (opts.ok || 'ذخیره') + '</button>') +
    '<button class="btn" type="button" data-close>' + (opts.noOk ? 'بستن' : 'انصراف') + '</button></div></form>';
  document.body.appendChild(ov);
  var f = $('form', ov);
  function close() { ov.remove(); }
  ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
  $('[data-close]', ov).addEventListener('click', close);
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var bad = null;
    $$('input.jd', f).forEach(function (i) { var v = J.parse(i.value); if (v === undefined) { i.classList.add('bad'); bad = i; } else i.classList.remove('bad'); });
    if (bad) { bad.focus(); toast('تاریخ را مثل ۱۴۰۵/۰۸/۲۸ بنویسید', true); return; }
    var r = opts.onok ? opts.onok(f, close) : null;
    if (r && r.then) r.then(function (keep) { if (keep !== false) close(); }).catch(fail); else if (r !== false) close();
  });
  var first = $('input,textarea,select', f); if (first && !opts.noFocus) first.focus();
  if (opts.setup) opts.setup(f, close);
  return { el: ov, close: close };
}
function jdVal(f, name) { var i = $('[name=' + name + ']', f); return i ? J.parse(i.value) : null; }

/* ---------- بارگذاری ---------- */
function loadMe() {
  return fetch('api.php?a=me', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
    S.user = j.user; S.csrf = j.csrf; S.needsSetup = j.needs_setup;
  });
}
function loadProjects() { return api('projects').then(function (j) { S.projects = j.projects; }); }
function loadProject(pid) {
  return api('project_get', { project_id: pid }).then(function (P) {
    S.pid = pid; S.P = P; reindex();
    if (S.focus && !S.idx.byId.has(S.focus)) S.focus = 0;
    if (S.sel && !S.idx.byId.has(S.sel)) S.sel = 0;
  });
}
function reindex() { S.idx = E.build(S.P); S.sch = E.schedule(S.idx); }
function reload() { return loadProject(S.pid).then(function () { render(true); }); }

/* ---------- مسیریابی ---------- */
function route() {
  var m = /^#\/p\/(\d+)(?:\/(\w+))?/.exec(location.hash);
  if (!S.user) return render();
  if (m) {
    var pid = +m[1]; S.tab = m[2] || 'dash';
    if (S.pid !== pid || !S.P) { S.focus = 0; S.sel = 0; S.open = {}; return loadProject(pid).then(function () { render(); }).catch(function (e) { fail(e); location.hash = '#/'; }); }
    return render();
  }
  S.pid = 0; S.P = null;
  loadProjects().then(function () { render(); }).catch(fail);
}
function go(tab) { location.hash = '#/p/' + S.pid + '/' + tab; }

/* ---------- نمایش اصلی ---------- */
var scrollKeep = {};
function render(keep) {
  var app = $('#app');
  if (!S.user) { app.innerHTML = authView(); return; }
  if (!S.P) { app.innerHTML = homeView(); return; }
  if (!$('#content')) {
    app.innerHTML = shell();
  } else {
    $('.top', app).outerHTML = topBar(); $('.tabs', app).outerHTML = tabsBar();
  }
  renderContent(keep); renderDrawer();
}
function shell() { return topBar() + tabsBar() + '<div class="main"><section id="content"></section><aside id="drawer" class="hidden"></aside></div>'; }
function topBar() {
  var p = S.P.project;
  return '<header class="top"><button class="btn ghost" data-act="home">→ پروژه‌ها</button><h1>' + esc(p.name) + '</h1>' +
    '<span class="pill">' + FA(p.progress) + '٪</span><span class="sp"></span>' +
    '<button class="btn sm" data-act="editproject">تنظیمات پروژه</button></header>';
}
var TABS = [['dash', 'داشبورد'], ['map', 'نقشهٔ ساختار'], ['outline', 'فهرست و ویرایش'], ['plan', 'ترتیب و زمان‌بندی'], ['gantt', 'تایم‌لاین'], ['logs', 'گزارش‌ها'], ['ai', 'هوش مصنوعی و خروجی']];
function tabsBar() {
  return '<nav class="tabs">' + TABS.map(function (t) { return '<div class="tab ' + (S.tab === t[0] ? 'on' : '') + '" data-act="tab" data-v="' + t[0] + '">' + t[1] + '</div>'; }).join('') + '</nav>';
}
function renderContent(keep) {
  var c = $('#content'); if (!c) return;
  var sc = {};
  if (keep) { $$('[data-sk]', c).forEach(function (e) { sc[e.getAttribute('data-sk')] = [e.scrollLeft, e.scrollTop]; }); sc.win = window.scrollY; }
  var fn = { dash: dashView, map: mapView, outline: outlineView, plan: planView, gantt: ganttView, logs: logsView, ai: aiView }[S.tab] || dashView;
  c.innerHTML = fn();
  if (keep) { $$('[data-sk]', c).forEach(function (e) { var s = sc[e.getAttribute('data-sk')]; if (s) { e.scrollLeft = s[0]; e.scrollTop = s[1]; } }); window.scrollTo(0, sc.win || 0); }
  if (S.tab === 'gantt' && !keep) { var g = $('.gscroll'); if (g && S._gToday != null) g.scrollLeft = Math.max(0, S._gToday - 160); }
  if (S.tab === 'ai') bindAi();
}
function selectNode(id, focusToo) {
  S.sel = id;
  if (focusToo != null) S.focus = focusToo;
  renderContent(true); renderDrawer();
}

/* ---------- ورود ---------- */
function authView() {
  var setup = S.needsSetup;
  return '<div class="auth card"><h1>مدیر پروژه</h1><p class="mut">' + (setup ? 'نخستین اجرا: یک نام کاربری و رمز بسازید.' : 'برای ادامه وارد شوید.') + '</p>' +
    '<form data-form="' + (setup ? 'setup' : 'login') + '"><label class="f"><span>نام کاربری</span><input name="username" class="ltr" autocomplete="username" required></label>' +
    '<label class="f"><span>رمز عبور' + (setup ? ' (حداقل ۶ نویسه)' : '') + '</span><input type="password" name="password" class="ltr" autocomplete="' + (setup ? 'new-password' : 'current-password') + '" required></label>' +
    '<button class="btn pri" type="submit" style="width:100%;justify-content:center">' + (setup ? 'ساخت حساب و ورود' : 'ورود') + '</button></form></div>';
}

/* ---------- خانه ---------- */
function homeView() {
  var cards = S.projects.map(function (p) {
    return '<div class="card pcard" data-act="open" data-id="' + p.id + '"><h3>' + esc(p.name) + '</h3>' +
      '<div class="mut sm" style="min-height:22px">' + esc((p.description || '').slice(0, 90)) + '</div>' +
      '<div class="row" style="margin:8px 0 4px"><div class="grow">' + bar(p.progress, p.progress >= 100 ? 'ok' : '') + '</div><b>' + FA(p.progress) + '٪</b></div>' +
      '<div class="row sm mut"><span>' + FA(p.node_count) + ' بخش</span><span>·</span><span>' + FA(p.leaf_done) + '/' + FA(p.leaf_count) + ' کار انجام‌شده</span>' +
      (p.target_date ? '<span>·</span><span>هدف: ' + J.fmt(p.target_date) + '</span>' : '') + '</div></div>';
  }).join('');
  return '<header class="top"><h1>مدیر پروژه</h1><span class="sp"></span><span class="mut sm">' + esc(S.user) + '</span>' +
    '<button class="btn sm" data-act="passwd">تغییر رمز</button><button class="btn sm" data-act="logout">خروج</button></header>' +
    '<div class="wrap"><div class="row" style="margin-bottom:14px"><h2 class="sec grow" style="margin:0">پروژه‌ها</h2>' +
    '<button class="btn" data-act="sample">پروژهٔ نمونه</button><button class="btn" data-act="importnew">ایمپورت از فایل…</button>' +
    '<button class="btn pri" data-act="newproject">+ پروژهٔ جدید</button></div>' +
    (cards ? '<div class="grid">' + cards + '</div>' : '<div class="card empty">هنوز پروژه‌ای ندارید.<br>با «پروژهٔ جدید» شروع کنید یا «پروژهٔ نمونه» را ببینید.</div>') + '</div>';
}
function projectForm(p, full) {
  p = p || {};
  return '<label class="f"><span>نام پروژه</span><input name="name" value="' + esc(p.name || '') + '" required></label>' +
    '<label class="f"><span>توضیح کوتاه</span><textarea name="description">' + esc(p.description || '') + '</textarea></label>' +
    '<div class="row"><label class="f grow"><span>تاریخ شروع</span>' + dateField('start_date', p.start_date) + '</label>' +
    '<label class="f grow"><span>تاریخ هدف (پایان)</span>' + dateField('target_date', p.target_date) + '</label></div>' +
    (full ? '<label class="f"><span>وضعیت پروژه</span><select name="status">' + [['active', 'فعال'], ['hold', 'متوقف'], ['done', 'تمام‌شده'], ['archived', 'بایگانی']].map(function (s) { return '<option value="' + s[0] + '"' + (p.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>ملاحظات فنی برای هوش مصنوعی (زبان/فریم‌ورک، قواعد کدنویسی، محدودیت‌ها…)</span><textarea name="ai_brief" style="min-height:110px">' + esc(p.ai_brief || '') + '</textarea></label>' : '');
}
function saveProjectForm(f, id) {
  return api('project_save', { project_id: id || 0, name: $('[name=name]', f).value, description: $('[name=description]', f).value,
    start_date: jdVal(f, 'start_date'), target_date: jdVal(f, 'target_date'),
    status: $('[name=status]', f) ? $('[name=status]', f).value : 'active', ai_brief: $('[name=ai_brief]', f) ? $('[name=ai_brief]', f).value : '' });
}

/* ---------- داشبورد ---------- */
function nodeLink(id) {
  var n = S.idx.byId.get(id); if (!n) return '';
  return '<div data-act="pick" data-id="' + id + '"><span class="dot st-' + n.status + '"></span><span class="t grow">' + esc(n.title) + '</span><span class="mut sm">' + esc(S.idx.pathText(S.idx.parentOf(id)) || '') + '</span></div>';
}
function dashView() {
  var idx = S.idx, sch = S.sch, P = S.P, p = P.project;
  var cnt = {}; sch.order.forEach(function (id) { var s = idx.byId.get(id).status; cnt[s] = (cnt[s] || 0) + 1; });
  var tot = sch.order.length || 1;
  var stack = Object.keys(E.STATUS).map(function (s) { return cnt[s] ? '<i class="st-' + s + '" style="width:' + (cnt[s] / tot * 100) + '%" title="' + E.STATUS[s] + ': ' + cnt[s] + '"></i>' : ''; }).join('');
  var legend = Object.keys(E.STATUS).map(function (s) { return '<span><span class="dot st-' + s + '"></span> ' + E.STATUS[s] + ' ' + FA(cnt[s] || 0) + '</span>'; }).join('');
  var projEnd = sch.order.length ? J.dayToIso(sch.end - 1) : null;
  var tgt = J.isoToDay(p.target_date);
  var late = tgt != null && sch.order.length && (sch.end - 1) > tgt;
  var ready = sch.order.filter(function (id) {
    var n = idx.byId.get(id); if (n.status === 'done') return false;
    return Array.from(sch.preds.get(id) || []).every(function (q) { return idx.byId.get(q).status === 'done'; });
  }).slice(0, 8);
  var over = sch.order.filter(function (id) { return sch.info.get(id).overdue; }).slice(0, 8);
  var ms = P.milestones.filter(function (m) { return !m.done; }).slice(0, 5);
  var tops = idx.children(0).map(function (id) {
    var v = sch.info.get(id), n = idx.byId.get(id);
    return '<div data-act="pick" data-id="' + id + '"><span class="grow t">' + esc(n.title) + '</span><span style="width:110px">' + bar(v ? v.progress : 0) + '</span><b class="sm" style="width:40px">' + FA(v ? v.progress : 0) + '٪</b></div>';
  }).join('');
  var rec = P.logs.slice(0, 8).map(function (l) {
    var n = l.node_id ? idx.byId.get(l.node_id) : null;
    return '<div data-act="' + (n ? 'pick' : 'noop') + '" data-id="' + (l.node_id || 0) + '"><span class="pill">' + (l.kind === 'ai_report' ? 'AI' : 'یادداشت') + '</span><span class="grow t sm">' + esc((l.body || '').slice(0, 70)) + '</span><span class="mut sm">' + esc(n ? n.title : '') + '</span></div>';
  }).join('');
  if (!P.nodes.length) return '<div class="card empty">پروژه خالی است. اولین بخش را اضافه کنید، یا از «ایمپورت» فایلِ ساختار بیاورید.<br><br><button class="btn pri" data-act="addnode" data-parent="0">+ افزودن اولین بخش</button></div>';
  return '<div class="kpis">' +
    '<div class="card kpi"><b>' + FA(sch.root.progress) + '٪</b><span>پیشرفت کل (وزن‌دهی‌شده با زمان)</span>' + bar(sch.root.progress, sch.root.progress >= 100 ? 'ok' : '') + '</div>' +
    '<div class="card kpi"><b>' + FA(sch.root.done) + ' / ' + FA(sch.root.leaves) + '</b><span>کارِ انجام‌شده از کل</span></div>' +
    '<div class="card kpi"><b>' + num(sch.root.total) + ' روز</b><span>مجموع کار (برآورد/نهایی)</span></div>' +
    '<div class="card kpi"><b class="' + (late ? 'crit' : '') + '">' + (projEnd ? J.fmt(projEnd, true) : '—') + '</b><span>پایانِ پیش‌بینی‌شده' + (tgt != null ? ' · هدف: ' + J.fmt(p.target_date, true) + (late ? ' ⚠ دیرتر از هدف' : ' ✓') : '') + '</span></div></div>' +
    '<div class="card" style="margin-bottom:14px"><div class="stack">' + stack + '</div><div class="legend" style="margin-top:8px">' + legend + '</div></div>' +
    '<div class="two"><div class="card"><h2 class="sec">گام بعدی <span class="mut sm">(پیش‌نیازهایش انجام شده)</span></h2><div class="list">' + (ready.map(nodeLink).join('') || '<div class="mut">—</div>') + '</div>' +
    '<h2 class="sec">عقب‌افتاده</h2><div class="list">' + (over.map(nodeLink).join('') || '<div class="mut">مورد عقب‌افتاده‌ای نیست ✓</div>') + '</div></div>' +
    '<div class="card"><h2 class="sec">بخش‌های اصلی</h2><div class="list">' + tops + '</div>' +
    '<h2 class="sec">نقاط عطف پیش رو</h2><div class="list">' + (ms.map(function (m) { return '<div data-act="tab" data-v="gantt"><span>◆</span><span class="grow t">' + esc(m.title) + '</span><span class="mut sm">' + (m.date ? J.fmt(m.date, true) : '') + '</span></div>'; }).join('') || '<div class="mut">—</div>') + '</div>' +
    '<h2 class="sec">آخرین گزارش‌ها</h2><div class="list">' + (rec || '<div class="mut">—</div>') + '</div></div></div>' +
    (sch.cycle ? '<p class="crit">⚠ در وابستگی‌ها چرخه وجود دارد؛ زمان‌بندی دقیق نیست.</p>' : '');
}

/* ---------- نقشهٔ ساختار ---------- */
var CW = 236, CH = 112, GX = 130, GY = 30, PAD = 24;
function mapView() {
  var idx = S.idx, sch = S.sch, focus = S.focus;
  var fchain = focus ? idx.chain(focus) : [];
  var kids = idx.children(focus);
  var crumbs = '<a data-act="focus" data-id="0">ریشهٔ پروژه</a>' + fchain.map(function (id) { return '<span class="mut">›</span><a data-act="focus" data-id="' + id + '">' + esc(idx.byId.get(id).title) + '</a>'; }).join('');
  var head = '<div class="crumbs">' + crumbs + '<span class="grow"></span>' + (focus ? '<button class="btn sm" data-act="pick" data-id="' + focus + '">جزئیاتِ این بخش</button>' : '') +
    '<button class="btn sm pri" data-act="addnode" data-parent="' + focus + '">+ افزودن زیربخش اینجا</button></div>';
  if (!kids.length) {
    return head + '<div class="card empty">' + (focus ? 'این بخش زیرمجموعه ندارد.' : 'پروژه خالی است.') + '<br>با «افزودن زیربخش» بخش تازه بسازید.</div>';
  }
  function resolve(e) {
    var ch = idx.chain(e);
    if (focus) {
      if (ch.indexOf(focus) >= 0) return ch.length > fchain.length ? { card: ch[fchain.length] } : null;
      var p = 0; while (p < ch.length && p < fchain.length && ch[p] === fchain[p]) p++;
      return p < ch.length ? { ghost: ch[p] } : null;
    }
    return { card: ch[0] };
  }
  var edges = {}, ginIds = {}, goutIds = {}, ghosts = {};
  S.P.deps.forEach(function (d) {
    if (!idx.byId.has(d.from_id) || !idx.byId.has(d.to_id)) return;
    var a = resolve(d.from_id), b = resolve(d.to_id);
    if (!a || !b) return;
    var A, B;
    if (a.card && b.card) { if (a.card === b.card) return; A = String(a.card); B = String(b.card); }
    else if (a.ghost && b.card) { A = 'g' + a.ghost; B = String(b.card); ghosts[a.ghost] = 1; ginIds[a.ghost] = 1; }
    else if (a.card && b.ghost) { A = String(a.card); B = 'g' + b.ghost; ghosts[b.ghost] = 1; goutIds[b.ghost] = 1; }
    else return;
    var k = A + '>' + B; edges[k] = edges[k] || { a: A, b: B, labels: [] };
    if (d.label && edges[k].labels.indexOf(d.label) < 0) edges[k].labels.push(d.label);
  });
  var nodes = kids.map(String).concat(Object.keys(ghosts).map(function (g) { return 'g' + g; }));
  var preds = {}; nodes.forEach(function (n) { preds[n] = []; });
  Object.keys(edges).forEach(function (k) { var e = edges[k]; if (e.a.charAt(0) !== 'g' && e.b.charAt(0) !== 'g') preds[e.b].push(e.a); });
  var layer = {}, vis = {};
  function lay(n) { if (layer[n] != null) return layer[n]; if (vis[n]) return 0; vis[n] = 1; var m = 0; preds[n].forEach(function (p) { m = Math.max(m, lay(p) + 1); }); vis[n] = 0; layer[n] = m; return m; }
  kids.forEach(function (k) { lay(String(k)); });
  var hasIn = Object.keys(ginIds).length > 0, maxL = 0;
  kids.forEach(function (k) { layer[String(k)] += hasIn ? 1 : 0; maxL = Math.max(maxL, layer[String(k)]); });
  Object.keys(ghosts).forEach(function (g) { layer['g' + g] = ginIds[g] ? 0 : maxL + 1; });
  var cols = {}; nodes.forEach(function (n) { (cols[layer[n]] = cols[layer[n]] || []).push(n); });
  var nl = Math.max.apply(null, Object.keys(cols).map(Number)) + 1;
  var tallest = 0; Object.keys(cols).forEach(function (c) { tallest = Math.max(tallest, cols[c].length); });
  var H = PAD * 2 + tallest * CH + (tallest - 1) * GY + 20, W = PAD * 2 + nl * CW + (nl - 1) * GX;
  var pos = {};
  Object.keys(cols).forEach(function (c) {
    var list = cols[c], h = list.length * CH + (list.length - 1) * GY, y0 = PAD + (H - 20 - PAD * 2 - h) / 2;
    list.forEach(function (n, i) { pos[n] = { x: W - PAD - CW - c * (CW + GX), y: y0 + i * (CH + GY) }; });
  });
  var svg = '<svg width="' + W + '" height="' + H + '"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs><g color="#7d88a3">';
  Object.keys(edges).forEach(function (k) {
    var e = edges[k], A = pos[e.a], B = pos[e.b]; if (!A || !B) return;
    var x1 = A.x, y1 = A.y + CH / 2, x2 = B.x + CW, y2 = B.y + CH / 2, d;
    if (x2 < x1) { var c = Math.max(40, (x1 - x2) / 2); d = 'M' + x1 + ' ' + y1 + ' C' + (x1 - c) + ' ' + y1 + ' ' + (x2 + c) + ' ' + y2 + ' ' + x2 + ' ' + y2; }
    else { var yy = Math.max(A.y, B.y) + CH + 14; d = 'M' + x1 + ' ' + y1 + ' C' + (x1 - 50) + ' ' + y1 + ' ' + (x1 - 50) + ' ' + yy + ' ' + (x1 + 10) + ' ' + yy + ' L' + (x2 - 10) + ' ' + yy + ' C' + (x2 + 50) + ' ' + yy + ' ' + (x2 + 50) + ' ' + y2 + ' ' + x2 + ' ' + y2; }
    svg += '<path class="edge" d="' + d + '" marker-end="url(#ah)"/>';
    if (e.labels.length) { var lt = e.labels.join('، '); if (lt.length > 20) lt = lt.slice(0, 19) + '…'; svg += '<text class="elabel" text-anchor="middle" x="' + ((x1 + x2) / 2) + '" y="' + (((y1 + y2) / 2) - 6) + '">' + esc(lt) + '</text>'; }
  });
  svg += '</g></svg>';
  var cardsH = nodes.map(function (n) {
    var P = pos[n], isG = n.charAt(0) === 'g', id = isG ? +n.slice(1) : +n, node = idx.byId.get(id), v = sch.info.get(id) || {};
    var kc = idx.children(id).length, st = v.status || node.status, meta = [];
    if (kc) meta.push('▸ ' + FA(kc) + ' زیربخش');
    if ((node.inputs || []).length) meta.push('⇢ ' + FA(node.inputs.length) + ' ورودی');
    if ((node.outputs || []).length) meta.push('⇠ ' + FA(node.outputs.length) + ' خروجی');
    var tip = node.title + (node.summary ? '\n' + node.summary : '') + (isG ? '\n(بیرون از این سطح: ' + idx.pathText(id) + ')' : '');
    var pr = v.progress != null ? v.progress : node.progress;
    return '<div class="mcard k-' + node.kind + ' st-' + st + (isG ? ' ghost' : '') + (S.sel === id ? ' sel' : '') + '" style="left:' + P.x + 'px;top:' + P.y + 'px;width:' + CW + 'px;height:' + CH + 'px" data-act="' + (isG ? 'ghostgo' : 'cardgo') + '" data-id="' + id + '" title="' + esc(tip) + '">' +
      '<div class="kb"><span>' + E.KIND[node.kind] + (isG ? ' · بیرونی' : '') + '</span><span>' + (v.crit && S.crit ? '<b class="crit">بحرانی</b> ' : '') + E.STATUS[st] + '</span></div>' +
      '<div class="mt">' + esc(node.title) + '</div><div class="mm">' + (meta.join(' · ') || esc((node.summary || '').slice(0, 40)) || '&nbsp;') + '</div>' +
      '<div class="row" style="gap:6px;flex-wrap:nowrap"><div class="grow">' + bar(pr) + '</div><span class="sm">' + FA(pr) + '٪</span></div></div>';
  }).join('');
  return head + '<div class="mapbox" data-sk="map"><div class="mapin" style="width:' + W + 'px;height:' + H + 'px">' + svg + cardsH + '</div></div>' +
    '<p class="mut sm">روی هر کارت کلیک کنید تا زیرمجموعه‌اش باز شود و جزئیاتش کنار صفحه بیاید. پیکان‌ها = وابستگی (برچسبِ روی پیکان = چه چیزی منتقل می‌شود). کارت‌های خط‌چین = بخش‌های بیرون از این سطح که به این‌ها وصل‌اند.</p>';
}

/* ---------- فهرست ---------- */
function isOpen(id) { return id in S.open ? S.open[id] : S.idx.depth(id) < 1; }
function outlineView() {
  var idx = S.idx, rows = [];
  (function walk(pid) {
    idx.children(pid).forEach(function (id) {
      var n = idx.byId.get(id), v = S.sch.info.get(id) || {}, kc = idx.children(id).length, d = idx.depth(id);
      rows.push('<div class="tr' + (S.sel === id ? ' sel' : '') + '" style="padding-inline-start:' + (8 + d * 22) + 'px"><span class="tg" data-act="toggle" data-id="' + id + '">' + (kc ? (isOpen(id) ? '▾' : '◂') : '·') + '</span>' +
        '<span class="kb2 ' + n.kind + '">' + E.KIND[n.kind] + '</span><span class="tt" data-act="pick" data-id="' + id + '">' + esc(n.title) + '</span>' +
        statusPill(v.status || n.status) + '<span style="width:70px">' + bar(v.progress) + '</span><span class="sm mut" style="width:46px">' + FA(v.progress || 0) + '٪</span>' +
        '<span class="sm mut" style="width:54px">' + (v.dur ? num(v.dur) + ' روز' : '') + '</span>' +
        '<span class="row" style="gap:2px;flex-wrap:nowrap"><button class="btn sm ghost" title="زیربخش جدید" data-act="addnode" data-parent="' + id + '">＋</button>' +
        '<button class="btn sm ghost" title="بالاتر" data-act="mv" data-id="' + id + '" data-d="up">↑</button><button class="btn sm ghost" title="پایین‌تر" data-act="mv" data-id="' + id + '" data-d="down">↓</button>' +
        '<button class="btn sm ghost" title="تورفتگی (زیرِ بخشِ بالایی)" data-act="mv" data-id="' + id + '" data-d="in">⇥</button><button class="btn sm ghost" title="یک سطح بیرون" data-act="mv" data-id="' + id + '" data-d="out">⇤</button></span></div>');
      if (kc && isOpen(id)) walk(id);
    });
  })(0);
  return '<div class="row" style="margin-bottom:10px"><button class="btn pri" data-act="addnode" data-parent="0">+ بخش اصلی جدید</button>' +
    '<button class="btn" data-act="expand" data-v="1">باز کردن همه</button><button class="btn" data-act="expand" data-v="0">بستن همه</button></div>' +
    (rows.length ? '<div class="tree card" style="padding:0;overflow:hidden">' + rows.join('') + '</div>' : '<div class="card empty">هنوز بخشی نیست.</div>');
}
function moveNode(id, dir) {
  var idx = S.idx, par = idx.parentOf(id), sibs = idx.children(par), i = sibs.indexOf(id), np = par, ni = i;
  if (dir === 'up') { if (i === 0) return; ni = i - 1; }
  else if (dir === 'down') { if (i === sibs.length - 1) return; ni = i + 1; }
  else if (dir === 'in') { if (i === 0) return; np = sibs[i - 1]; ni = idx.children(np).length; S.open[np] = true; }
  else if (dir === 'out') { if (!par) return; var gp = idx.parentOf(par); np = gp; ni = idx.children(gp).indexOf(par) + 1; }
  return api('node_move', { project_id: S.pid, id: id, parent_id: np, index: ni }).then(reload);
}

/* ---------- ترتیب و زمان‌بندی ---------- */
function planView() {
  var idx = S.idx, sch = S.sch;
  if (!sch.order.length) return '<div class="card empty">برای زمان‌بندی ابتدا بخش‌هایی بسازید.</div>';
  var tgt = J.isoToDay(S.P.project.target_date), late = tgt != null && sch.end - 1 > tgt;
  var rows = sch.order.map(function (id, i) {
    var n = idx.byId.get(id), v = sch.info.get(id);
    var deps = Array.from(sch.preds.get(id) || []).map(function (q) { return esc(idx.byId.get(q).title); }).join('، ');
    return '<tr data-id="' + id + '"><td>' + FA(i + 1) + '</td><td><span class="pill">فاز ' + FA(v.phase) + '</span></td>' +
      '<td><a class="tt" data-act="pick" data-id="' + id + '" style="cursor:pointer">' + esc(n.title) + '</a><div class="mut sm">' + esc(idx.pathText(idx.parentOf(id))) + '</div></td>' +
      '<td class="sm mut" style="max-width:200px">' + (deps || '—') + '</td>' +
      '<td><input type="number" step="0.5" min="0" data-f="est_days" value="' + (n.est_days == null ? '' : n.est_days) + '" placeholder="' + (v.heur) + '" style="width:76px"></td>' +
      '<td><input type="number" step="0.5" min="0" data-f="final_days" value="' + (n.final_days == null ? '' : n.final_days) + '" placeholder="—" style="width:76px"></td>' +
      '<td><input class="ltr jd" data-f="start_date" data-iso="' + esc(n.start_date || '') + '" value="' + (n.start_date ? J.fmt(n.start_date) : '') + '" placeholder="' + J.fmt(J.dayToIso(v.es)) + '" style="width:104px"></td>' +
      '<td class="sm">' + J.fmt(J.dayToIso(v.ef - 1)) + (v.conflict ? ' <span class="crit" title="شروعِ دستی پیش از پایانِ پیش‌نیاز است">⚠</span>' : '') + '</td>' +
      '<td>' + (v.crit ? '<span class="crit">بحرانی</span>' : '<span class="mut sm">' + FA(v.slack) + ' روز شناور</span>') + '</td>' +
      '<td>' + statusPill(n.status) + '</td></tr>';
  }).join('');
  return '<div class="card" style="margin-bottom:12px"><div class="row"><div class="grow"><b>ترتیبِ پیشنهادیِ شروعِ کار</b><div class="mut sm">برگ‌ها بر پایهٔ وابستگی‌ها مرتب شده‌اند (پیش‌نیازها اول). کارهای هم‌فاز مستقل‌اند و می‌توانند هم‌زمان انجام شوند. ' +
    'ستون «برآورد» پیشنهاد است (اگر خالی بماند، از روی تعداد ورودی/خروجی و طول توضیح حدس زده می‌شود و در نوشتهٔ کم‌رنگ دیده می‌شود)؛ ستون «نهایی» را شما می‌نویسید و در تایم‌لاین ملاک می‌شود.</div></div>' +
    '<div><b>' + num(sch.root.total) + ' روز</b> کار · پایان: <b class="' + (late ? 'crit' : '') + '">' + J.fmt(J.dayToIso(sch.end - 1), true) + '</b></div></div>' +
    '<div class="row" style="margin-top:10px"><button class="btn" data-act="fillest">پُرکردنِ برآوردهای خالی با پیشنهاد</button>' +
    '<button class="btn pri" data-act="applysched">ثبتِ تاریخ‌های پیشنهادی در بخش‌ها</button><button class="btn" data-act="clearsched">پاک‌کردن تاریخ‌های ثبت‌شده</button></div></div>' +
    '<div style="overflow-x:auto" data-sk="plan"><table class="t"><thead><tr><th>#</th><th>فاز</th><th>بخش</th><th>پیش‌نیازها</th><th>برآورد (روز)</th><th>نهایی (روز)</th><th>شروع</th><th>پایان</th><th>شناوری</th><th>وضعیت</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (sch.cycle ? '<p class="crit">⚠ چرخه در وابستگی‌ها پیدا شد.</p>' : '');
}

/* ---------- تایم‌لاین (گانت) ---------- */
var SCOL = { todo: '#94a0b8', doing: '#2f6fed', review: '#7a5af8', done: '#1f9d63', blocked: '#d64545', hold: '#e0912b' };
function ganttView() {
  var idx = S.idx, sch = S.sch, P = S.P, today = sch.today, ppd = ZOOM[S.zoom], RH = 30;
  var rows = [];
  (function walk(pid) { idx.children(pid).forEach(function (id) { rows.push(id); if (idx.children(id).length && isOpen(id)) walk(id); }); })(0);
  var minD = sch.pStart, maxD = sch.end;
  sch.info.forEach(function (v) { if (v.es < minD) minD = v.es; if (v.ef > maxD) maxD = v.ef; });
  P.milestones.forEach(function (m) { var d = J.isoToDay(m.date); if (d != null) { if (d < minD) minD = d; if (d > maxD) maxD = d; } });
  var tgt = J.isoToDay(P.project.target_date); if (tgt != null && tgt > maxD) maxD = tgt;
  if (today < minD) minD = today; if (today > maxD) maxD = today;
  minD -= 4; maxD += 12; if (maxD - minD < 45) maxD = minD + 45;
  var W = Math.ceil((maxD - minD) * ppd), msH = P.milestones.length ? 28 : 0, H = rows.length * RH + 6;
  function X(d) { return (d - minD) * ppd; }
  // سربرگ: ماه‌های جلالی + خط‌های هفته/روز
  var head = '', grid = '';
  var d = minD, cur = null;
  var months = [];
  for (d = minD; d <= maxD; d++) {
    var j = J.dayToJ(d);
    if (!cur || cur.jm !== j.jm) { cur = { jm: j.jm, jy: j.jy, from: d }; months.push(cur); }
    cur.to = d + 1;
  }
  months.forEach(function (m, i) {
    var x = X(m.from), w = (m.to - m.from) * ppd;
    head += '<rect x="' + x + '" y="0" width="' + w + '" height="26" fill="' + (i % 2 ? 'rgba(120,130,160,.10)' : 'rgba(120,130,160,.04)') + '"/>' +
      '<text x="' + (x + 6) + '" y="17" font-size="12" fill="currentColor" direction="rtl">' + J.MONTHS[m.jm - 1] + ' ' + FA(m.jy) + '</text>';
    grid += '<line x1="' + x + '" x2="' + x + '" y1="0" y2="' + (60 + H + msH) + '" stroke="rgba(120,130,160,.35)"/>';
  });
  var step = S.zoom === 'day' ? 1 : S.zoom === 'week' ? 7 : S.zoom === 'month' ? 0 : 0;
  if (step) {
    for (d = minD; d <= maxD; d++) {
      var jj = J.dayToJ(d), wd = new Date(d * 864e5).getUTCDay(); // 6=شنبه
      if (S.zoom === 'week' ? wd !== 6 : false) continue;
      head += '<text x="' + (X(d) + 2) + '" y="48" font-size="10.5" fill="#8590a8">' + FA(jj.jd) + '</text>';
      grid += '<line x1="' + X(d) + '" x2="' + X(d) + '" y1="26" y2="' + (60 + H + msH) + '" stroke="rgba(120,130,160,.16)"/>';
    }
  } else {
    months.forEach(function (m) { for (var q = 10; q <= 20; q += 10) { var dd = m.from + q; if (dd < m.to) head += '<text x="' + (X(dd) + 2) + '" y="48" font-size="10" fill="#8590a8">' + FA(q + 1) + '</text>'; } });
  }
  // وضعیتِ هر ردیف
  var rowOf = {}; rows.forEach(function (id, i) { rowOf[id] = i; });
  function visRow(id) { var c = idx.chain(id); for (var i = 0; i < c.length; i++) if (rowOf[c[i]] != null && (i === c.length - 1 || !isOpen(c[i]))) return rowOf[c[i]]; return null; }
  var y0 = 60 + msH, bars = '', arrows = '', seen = {};
  rows.forEach(function (id, i) {
    var v = sch.info.get(id), n = idx.byId.get(id); if (!v) return;
    var x = X(v.es), w = Math.max((v.ef - v.es) * ppd, 4), y = y0 + i * RH, leaf = idx.isLeaf(id);
    var st = v.status, col = SCOL[st], tip = n.title + '\n' + J.fmt(J.dayToIso(v.es), true) + ' ← ' + J.fmt(J.dayToIso(v.ef - 1), true) + ' (' + FA(v.ef - v.es) + ' روز)\n' + E.STATUS[st] + ' ' + FA(v.progress) + '٪' + (v.crit ? '\nروی مسیر بحرانی' : '') + (v.conflict ? '\n⚠ شروعِ دستی پیش از پایانِ پیش‌نیاز' : '');
    if (leaf) {
      bars += '<g class="gbar" data-act="pick" data-id="' + id + '"><title>' + esc(tip) + '</title>' +
        '<rect x="' + x + '" y="' + (y + 6) + '" width="' + w + '" height="18" rx="5" fill="' + col + '" fill-opacity=".28" stroke="' + (S.crit && v.crit ? '#d64545' : col) + '" stroke-width="' + (S.crit && v.crit ? 2 : 1) + '"' + (v.manual ? '' : ' stroke-dasharray="4 2"') + '/>' +
        '<rect x="' + x + '" y="' + (y + 6) + '" width="' + (w * v.progress / 100) + '" height="18" rx="5" fill="' + col + '"/>' +
        (v.overdue ? '<text x="' + (x - 14) + '" y="' + (y + 20) + '" font-size="12" fill="#d64545">!</text>' : '') +
        (w > 38 ? '<text x="' + (x + 6) + '" y="' + (y + 19) + '" font-size="10.5" fill="' + (v.progress > 55 ? '#fff' : 'currentColor') + '">' + FA(v.progress) + '٪</text>' : '<text x="' + (x + w + 4) + '" y="' + (y + 19) + '" font-size="10.5" fill="currentColor">' + FA(v.progress) + '٪</text>') + '</g>';
    } else {
      bars += '<g class="gbar" data-act="pick" data-id="' + id + '"><title>' + esc(tip) + '</title><rect x="' + x + '" y="' + (y + 10) + '" width="' + w + '" height="8" rx="2" fill="#566083" fill-opacity=".35"/>' +
        '<rect x="' + x + '" y="' + (y + 10) + '" width="' + (w * v.progress / 100) + '" height="8" rx="2" fill="#566083"/>' +
        '<path d="M' + x + ' ' + (y + 10) + 'v13l5-5z M' + (x + w) + ' ' + (y + 10) + 'v13l-5-5z" fill="#566083"/><text x="' + (x + w + 6) + '" y="' + (y + 19) + '" font-size="10.5" fill="currentColor">' + FA(v.progress) + '٪</text></g>';
    }
  });
  // پیکان‌های وابستگی
  P.deps.forEach(function (dp) {
    var a = visRow(dp.from_id), b = visRow(dp.to_id); if (a == null || b == null || a === b) return;
    var k = a + '>' + b; if (seen[k]) return; seen[k] = 1;
    var va = sch.info.get(rows[a]), vb = sch.info.get(rows[b]); if (!va || !vb) return;
    var x1 = X(va.ef), y1 = y0 + a * RH + 15, x2 = X(vb.es), y2 = y0 + b * RH + 15, ym = y1 + (y2 > y1 ? RH / 2 : -RH / 2);
    var pth = x2 >= x1 + 12 ? 'M' + x1 + ' ' + y1 + 'H' + (x1 + 8) + 'V' + y2 + 'H' + (x2 - 1) : 'M' + x1 + ' ' + y1 + 'H' + (x1 + 8) + 'V' + ym + 'H' + (x2 - 8) + 'V' + y2 + 'H' + (x2 - 1);
    arrows += '<path d="' + pth + '" fill="none" stroke="#7d88a3" stroke-width="1.2" marker-end="url(#gah)"/>';
  });
  // نقاط عطف
  var msv = '';
  P.milestones.forEach(function (m) {
    var dd = J.isoToDay(m.date); if (dd == null) return;
    var x = X(dd), c = m.done ? '#1f9d63' : '#e0912b';
    msv += '<g class="gms" data-act="editms" data-id="' + m.id + '"><title>' + esc(m.title + ' — ' + J.fmt(m.date, true)) + '</title><path d="M' + x + ' 56 l9 9 l-9 9 l-9 -9z" fill="' + c + '"/>' +
      '<text x="' + (x + 13) + '" y="69" font-size="11.5" fill="currentColor" direction="rtl">' + esc(m.title) + '</text></g>';
    grid += '<line x1="' + x + '" x2="' + x + '" y1="74" y2="' + (60 + H + msH) + '" stroke="' + c + '" stroke-dasharray="3 4" opacity=".6"/>';
  });
  var tl = '<line x1="' + X(today) + '" x2="' + X(today) + '" y1="0" y2="' + (60 + H + msH) + '" stroke="#d64545" stroke-width="1.6"/><text x="' + (X(today) + 4) + '" y="58" font-size="10.5" fill="#d64545">امروز</text>';
  S._gToday = X(today);
  var tgtLine = tgt != null ? '<line x1="' + X(tgt) + '" x2="' + X(tgt) + '" y1="0" y2="' + (60 + H + msH) + '" stroke="#7a5af8" stroke-width="1.6" stroke-dasharray="6 3"/><text x="' + (X(tgt) + 4) + '" y="58" font-size="10.5" fill="#7a5af8">هدف</text>' : '';
  var rowBg = rows.map(function (id, i) { return '<rect x="0" y="' + (y0 + i * RH) + '" width="' + W + '" height="' + RH + '" fill="' + (S.sel === id ? 'rgba(47,111,237,.10)' : (i % 2 ? 'rgba(120,130,160,.05)' : 'transparent')) + '"/>'; }).join('');
  var svg = '<svg width="' + W + '" height="' + (y0 + H) + '" style="color:var(--ink)"><defs><marker id="gah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#7d88a3"/></marker></defs>' +
    head + rowBg + grid + tl + tgtLine + arrows + msv + bars + '</svg>';
  var labels = rows.map(function (id) {
    var n = idx.byId.get(id), v = sch.info.get(id) || {}, kc = idx.children(id).length, dp = idx.depth(id);
    return '<div class="glr' + (S.sel === id ? ' sel' : '') + '" style="padding-inline-start:' + (6 + dp * 16) + 'px"><span class="tg" data-act="toggle" data-id="' + id + '">' + (kc ? (isOpen(id) ? '▾' : '◂') : '') + '</span>' +
      '<span class="tt" data-act="pick" data-id="' + id + '" style="' + (kc ? 'font-weight:600' : '') + '">' + esc(n.title) + '</span><span class="sm mut">' + FA(v.progress || 0) + '٪</span></div>';
  }).join('');
  var zb = [['day', 'روز'], ['week', 'هفته'], ['month', 'ماه'], ['quarter', 'فصل']].map(function (z) { return '<button class="btn sm' + (S.zoom === z[0] ? ' pri' : '') + '" data-act="zoom" data-v="' + z[0] + '">' + z[1] + '</button>'; }).join('');
  var legend = '<div class="legend"><span><i class="dot" style="background:#2f6fed"></i> پرشده = درصد انجام</span><span>خط‌چین = تاریخِ پیشنهادی (ثبت‌نشده)</span><span style="color:#d64545">▮ مسیر بحرانی</span><span style="color:#e0912b">◆ نقطهٔ عطف</span><span style="color:#d64545">│ امروز</span></div>';
  if (!rows.length) return '<div class="card empty">برای دیدنِ تایم‌لاین ابتدا بخش بسازید.</div>';
  return '<div class="gtools">' + zb + '<label class="row sm" style="gap:4px"><input type="checkbox" data-act="critbox"' + (S.crit ? ' checked' : '') + '> مسیر بحرانی</label>' +
    '<button class="btn sm" data-act="gotoday">برو به امروز</button><span class="grow"></span><button class="btn sm" data-act="expand" data-v="1">باز کردن همه</button><button class="btn sm" data-act="expand" data-v="0">بستن همه</button>' +
    '<button class="btn sm pri" data-act="addms">+ نقطهٔ عطف (تایم‌استون)</button></div>' + legend +
    '<div class="gwrap" data-sk="gwrap" style="margin-top:8px"><div class="glabels"><div class="glh">بخش‌ها</div>' + (msH ? '<div style="height:' + msH + 'px;border-bottom:1px solid var(--line)" class="mut sm" ><span style="padding:4px 10px;display:block">نقاط عطف</span></div>' : '') + labels + '</div>' +
    '<div class="gscroll" data-sk="gscroll">' + svg + '</div></div>';
}

/* ---------- گزارش‌ها ---------- */
function logHtml(l, withNode) {
  var n = l.node_id ? S.idx.byId.get(l.node_id) : null;
  var files = S.P.files.filter(function (f) { return f.log_id === l.id; });
  var kinds = { note: 'یادداشت', ai_report: 'گزارش هوش مصنوعی', change: 'تغییر' };
  return '<div class="log ' + l.kind + '"><div class="meta"><span class="pill">' + (kinds[l.kind] || l.kind) + '</span><span>' + fmtDT(l.created_at) + '</span><span>' + esc(l.author) + '</span>' +
    (withNode && n ? '<a style="cursor:pointer" data-act="pick" data-id="' + n.id + '">' + esc(n.title) + '</a>' : '') + '<span class="grow"></span><button class="btn sm ghost danger" data-act="dellog" data-id="' + l.id + '">حذف</button></div>' +
    (l.body ? '<div class="body">' + esc(l.body) + '</div>' : '') + filesHtml(files) + '</div>';
}
function filesHtml(files) {
  if (!files.length) return '';
  return '<div class="thumbs">' + files.map(function (f) {
    var isImg = /^image\/(png|jpe?g|gif|webp)$/.test(f.mime);
    var url = 'api.php?a=file&id=' + f.id;
    return isImg ? '<img src="' + url + '" alt="' + esc(f.name) + '" title="' + esc(f.name) + '" data-act="lightbox" data-src="' + url + '">' :
      '<span class="fchip"><a href="' + url + '&dl=1" target="_blank">📎 ' + esc(f.name) + '</a> <span class="mut">' + FA(Math.round(f.size / 1024)) + 'KB</span><button class="btn sm ghost danger" data-act="delfile" data-id="' + f.id + '">×</button></span>';
  }).join('') + '</div>';
}
function logForm(nodeId) {
  return '<form data-form="addlog" data-node="' + nodeId + '"><textarea name="body" placeholder="یادداشت، توضیحِ انجام کار، تصمیم… (می‌توانید عکس را همین‌جا Paste کنید)"></textarea>' +
    '<div class="row" style="margin-top:6px"><select name="kind" style="width:auto"><option value="note">یادداشت</option><option value="ai_report">گزارش هوش مصنوعی/انجام</option><option value="change">تغییر</option></select>' +
    '<input type="file" name="files" multiple class="grow" style="padding:3px"><button class="btn pri sm" type="submit">ثبت</button></div></form>';
}
function logsView() {
  var idx = S.idx, list = S.P.logs.filter(function (l) {
    return (!S.logNode || String(l.node_id || 0) === S.logNode) && (!S.logKind || l.kind === S.logKind);
  });
  var opts = '<option value="">همهٔ بخش‌ها</option><option value="0"' + (S.logNode === '0' ? ' selected' : '') + '>(کلِ پروژه)</option>' + idx.preorder.map(function (id) { return '<option value="' + id + '"' + (S.logNode === String(id) ? ' selected' : '') + '>' + esc(new Array(idx.depth(id) + 1).join('— ') + idx.byId.get(id).title) + '</option>'; }).join('');
  return '<div class="two"><div><h2 class="sec">ثبتِ یادداشت کلی پروژه</h2><div class="card">' + logForm(0) + '</div></div>' +
    '<div><div class="row"><select data-chg="lognode" style="flex:1">' + opts + '</select><select data-chg="logkind" style="width:auto"><option value="">همه نوع‌ها</option><option value="note"' + (S.logKind === 'note' ? ' selected' : '') + '>یادداشت</option><option value="ai_report"' + (S.logKind === 'ai_report' ? ' selected' : '') + '>گزارش AI</option><option value="change"' + (S.logKind === 'change' ? ' selected' : '') + '>تغییر</option></select></div>' +
    '<div style="margin-top:10px">' + (list.map(function (l) { return logHtml(l, true); }).join('') || '<div class="card empty">گزارشی نیست.</div>') + '</div></div></div>';
}

/* ---------- هوش مصنوعی و خروجی ---------- */
var PROMPT = 'فایل پیوست (*.pm.json) مشخصاتِ کاملِ یک پروژه است: ساختار درختیِ بخش‌ها، ورودی/خروجیِ هر ماژول، پردازش، وابستگی‌ها و ترتیبِ پیشنهادیِ ساخت. ' +
  'دستورالعمل‌های کلید _instructions_for_ai را دقیق اجرا کن و پروژه را طبق build_order پیاده‌سازی کن.\n\n' +
  'دو الزام:\n۱) اگر در ساختار (ماژول‌ها، ورودی/خروجی‌ها، وابستگی‌ها، برآوردها) تغییری دادی، فایلِ به‌روزشده را با «همان ساختار» به‌صورت فایلِ قابل‌دانلود به من بده تا ایمپورتش کنم.\n' +
  '۲) در پایانِ کار (یا هر مرحله) برای هر ماژولی که کار کردی یک ردیف در work_report همان فایل بنویس: نحوهٔ انجام، فایل‌های تغییرکرده، تصمیم‌ها، نحوهٔ آزمون، تفاوت با طرح، باقی‌مانده، وضعیت و درصدِ پیشرفت — و فایل را تحویل بده.';
function aiView() {
  var p = S.P.project;
  return '<div class="two"><div><h2 class="sec">روندِ کار با هوش مصنوعی</h2><div class="card"><ol class="steps">' +
    '<li><b>خروجی بگیرید:</b> «فایل پروژه برای هوش مصنوعی» شامل کلِ ساختار، ورودی/خروجی‌ها، وابستگی‌ها، ترتیبِ ساخت و دستورالعملِ خودکار برای هوش مصنوعی است.</li>' +
    '<li><b>فایل + دستورِ آماده را به هوش مصنوعی بدهید</b> (دکمهٔ «کپیِ دستور»).</li>' +
    '<li>هوش مصنوعی اگر ساختار را عوض کند، فایلِ به‌روز می‌دهد؛ <b>همان را ایمپورت کنید</b> (بخش‌های تازه/تغییرکرده اعمال می‌شوند، چیزی بدونِ تأییدِ شما پاک نمی‌شود).</li>' +
    '<li>پس از کار، هوش مصنوعی در همان فایل <b>گزارشِ انجامِ هر ماژول</b> را می‌نویسد؛ ایمپورتش کنید تا درصد/وضعیت و تایم‌لاین و تاریخچهٔ هر بخش به‌روز شود.</li></ol></div>' +
    '<h2 class="sec">ملاحظات فنیِ پروژه برای هوش مصنوعی</h2><div class="card"><textarea id="aibrief" style="min-height:120px" placeholder="مثلاً: PHP 8.2 و MySQL، هاستِ cPanel، بدونِ فریم‌ورک، کدنویسی به سبک PSR-12، همهٔ متن‌ها فارسی…">' + esc(p.ai_brief || '') + '</textarea><div style="margin-top:8px"><button class="btn pri sm" data-act="savebrief">ذخیره</button></div></div></div>' +
    '<div><h2 class="sec">خروجی‌ها</h2><div class="card"><div class="row">' +
    '<button class="btn pri" data-act="exportjson">⬇ فایل پروژه برای هوش مصنوعی (.pm.json)</button><button class="btn" data-act="exportmd">⬇ شرحِ خوانا (Markdown)</button><button class="btn" data-act="exportzip">⬇ پیوست‌ها (zip)</button></div>' +
    '<p class="mut sm">فایل JSON همان است که بعد از ویرایشِ هوش مصنوعی ایمپورت می‌شود. تصویرها/فایل‌های پیوست داخلِ JSON نمی‌آیند (فقط نامشان)؛ اگر لازم است zip را هم به هوش مصنوعی بدهید.</p></div>' +
    '<h2 class="sec">دستورِ آماده برای هوش مصنوعی</h2><div class="card"><pre class="code" id="promptbox">' + esc(PROMPT) + '</pre><button class="btn sm" data-act="copyprompt">کپیِ دستور</button></div>' +
    '<h2 class="sec">ایمپورتِ فایلِ برگشتی</h2><div class="card"><input type="file" id="impfile" accept=".json,application/json"><div id="impinfo" class="sm" style="margin-top:8px"></div></div></div></div>';
}
function bindAi() {
  var f = $('#impfile'); if (!f) return;
  f.addEventListener('change', function () { if (f.files[0]) readImport(f.files[0], S.pid); });
}
function readImport(file, pid) {
  var r = new FileReader();
  r.onload = guard(function () {
    var doc; try { doc = JSON.parse(String(r.result).replace(/^﻿/, '')); } catch (e) { return toast('فایل JSON معتبر نیست: ' + e.message, true); }
    if (!doc || !Array.isArray(doc.nodes)) return toast('این فایل ساختارِ پروژه نیست (کلید nodes ندارد)', true);
    var existing = pid && S.idx ? S.idx : null, nNew = 0, nUpd = 0, nDel = 0;
    doc.nodes.forEach(function (n) {
      var k = String(n.id == null ? '' : n.id).replace(/^n(?=\d+$)/i, '');
      if (n.deleted) { nDel++; return; }
      if (existing && existing.byId.has(+k) && /^\d+$/.test(k)) nUpd++; else nNew++;
    });
    var reps = (doc.work_report || []).length, sameProj = doc.project && existing && doc.project.id === S.pid;
    var body = '<p>فایل: <b>' + esc(doc.project && doc.project.name || '؟') + '</b></p><ul>' +
      '<li>' + FA(doc.nodes.length) + ' بخش در فایل' + (existing ? ' ← ' + FA(nUpd) + ' به‌روزرسانی، ' + FA(nNew) + ' تازه، ' + FA(nDel) + ' حذف' : '') + '</li>' +
      '<li>' + FA((doc.dependencies || []).length) + ' وابستگی، ' + FA((doc.milestones || []).length) + ' نقطهٔ عطف</li>' +
      '<li>' + FA(reps) + ' گزارشِ انجام کار (work_report)، ' + FA((doc.logs || []).filter(function (l) { return !l.id; }).length) + ' یادداشتِ تازه</li></ul>' +
      (existing ? '<label class="f"><span>این فایل چه شود؟</span><select name="mode"><option value="update">به‌روزرسانیِ همین پروژه (ادغام)</option><option value="new">ساختِ پروژهٔ جدید از فایل</option></select></label>' + (sameProj ? '' : '<p class="crit sm">⚠ شناسهٔ پروژهٔ فایل با این پروژه یکی نیست؛ اگر از پروژهٔ دیگری است، «پروژهٔ جدید» را انتخاب کنید.</p>') : '');
    modal({ title: 'ایمپورت فایل', body: body, ok: 'اعمال', onok: function (f) {
      var mode = existing ? $('[name=mode]', f).value : 'new';
      return api('import', { project_id: pid || 0, mode: mode, doc: doc }).then(function (res) {
        var msg = 'انجام شد: ' + FA(res.nodes_new) + ' بخش تازه، ' + FA(res.nodes_updated) + ' به‌روز، ' + FA(res.reports) + ' گزارش';
        toast(msg + (res.warnings.length ? ' — ' + FA(res.warnings.length) + ' هشدار' : ''));
        if (res.warnings.length) setTimeout(function () { toast(res.warnings.slice(0, 3).join(' | '), true); }, 600);
        if (mode === 'new') { location.hash = '#/p/' + res.project_id + '/dash'; S.pid = 0; S.P = null; route(); }
        else return reload();
      });
    } });
  });
  r.readAsText(file);
}

/* ---------- کشوی جزئیات بخش ---------- */
function parentOptions(excludeId, selected) {
  var idx = S.idx, ex = {};
  if (excludeId) { ex[excludeId] = 1; idx.descendants(excludeId).forEach(function (x) { ex[x] = 1; }); }
  return '<option value="">(سطح اصلی پروژه)</option>' + idx.preorder.filter(function (id) { return !ex[id]; }).map(function (id) {
    return '<option value="' + id + '"' + (id === selected ? ' selected' : '') + '>' + esc(new Array(idx.depth(id) + 1).join('— ') + idx.byId.get(id).title) + '</option>';
  }).join('');
}
function ioRows(kind, list) {
  return (list || []).map(function (r) { return ioRow(kind, r); }).join('');
}
function ioRow(kind, r) {
  r = r || {};
  return '<div class="io"><input data-io="' + kind + '-name" placeholder="نام" value="' + esc(r.name || '') + '"><input data-io="' + kind + '-desc" placeholder="توضیح / قالب داده" value="' + esc(r.desc || '') + '"><button type="button" class="btn sm ghost danger" data-act="rmrow">×</button></div>';
}
function depBlock(id, dir) { // dir: 'in' پیش‌نیازها  |  'out' پس‌نیازها
  var idx = S.idx, list = dir === 'in' ? (idx.inn.get(id) || []) : (idx.out.get(id) || []);
  var rel = {}; rel[id] = 1; idx.descendants(id).forEach(function (x) { rel[x] = 1; }); idx.chain(id).forEach(function (x) { rel[x] = 1; });
  var used = {}; list.forEach(function (d) { used[dir === 'in' ? d.from_id : d.to_id] = 1; });
  var opts = idx.preorder.filter(function (x) { return !rel[x] && !used[x]; }).map(function (x) { return '<option value="' + x + '">' + esc(idx.pathText(x, ' › ')) + '</option>'; }).join('');
  var outNames = (idx.byId.get(id).outputs || []).map(function (o) { return '<option value="' + esc(o.name) + '">'; }).join('');
  return '<div class="sub"><h4>' + (dir === 'in' ? 'پیش‌نیازها — این بخش به این‌ها وابسته است (ورودی‌اش را از این‌ها می‌گیرد)' : 'پس‌نیازها — این بخش ورودیِ این‌هاست (خروجی‌اش را می‌گیرند)') + '</h4>' +
    (list.map(function (d) {
      var oid = dir === 'in' ? d.from_id : d.to_id;
      return '<div class="dep"><a class="grow sm" style="cursor:pointer" data-act="pick" data-id="' + oid + '">' + esc(idx.byId.get(oid).title) + '</a><input class="grow" data-dlabel="' + d.id + '" data-from="' + d.from_id + '" data-to="' + d.to_id + '" value="' + esc(d.label || '') + '" placeholder="چه چیزی منتقل می‌شود؟"' + (dir === 'out' ? ' list="outl"' : '') + '><button class="btn sm ghost danger" data-act="deldep" data-id="' + d.id + '">×</button></div>';
    }).join('') || '<div class="mut sm">—</div>') +
    (opts ? '<form data-form="adddep" data-dir="' + dir + '" data-id="' + id + '" class="dep" style="margin-top:6px"><select name="other" class="grow" style="width:auto"><option value="">افزودن…</option>' + opts + '</select><input name="label" class="grow" placeholder="برچسب (اختیاری)"' + (dir === 'out' ? ' list="outl"' : '') + '><button class="btn sm" type="submit">＋</button></form>' : '') +
    (dir === 'out' ? '<datalist id="outl">' + outNames + '</datalist>' : '') + '</div>';
}
function renderDrawer() {
  var d = $('#drawer'); if (!d) return;
  if (!S.sel || !S.idx.byId.has(S.sel)) { d.className = 'hidden'; d.innerHTML = ''; return; }
  var keepTop = d.scrollTop, idx = S.idx, n = idx.byId.get(S.sel), id = n.id, v = S.sch.info.get(id) || {}, leaf = idx.isLeaf(id);
  var nlogs = S.P.logs.filter(function (l) { return l.node_id === id; });
  var nfiles = S.P.files.filter(function (f) { return f.node_id === id && !f.log_id; });
  var kids = idx.children(id);
  var kindSel = Object.keys(E.KIND).map(function (k) { return '<option value="' + k + '"' + (n.kind === k ? ' selected' : '') + '>' + E.KIND[k] + '</option>'; }).join('');
  var stSel = Object.keys(E.STATUS).map(function (k) { return '<option value="' + k + '"' + (n.status === k ? ' selected' : '') + '>' + E.STATUS[k] + '</option>'; }).join('');
  var prSel = [1, 2, 3].map(function (k) { return '<option value="' + k + '"' + (n.priority === k ? ' selected' : '') + '>' + E.PRIO[k] + '</option>'; }).join('');
  d.className = '';
  d.innerHTML = '<div class="dh"><h3>' + esc(n.title) + '</h3><button class="btn sm" data-act="closedrawer">بستن ✕</button></div>' +
    '<div class="row sm mut" style="margin-bottom:8px">' + idx.pathText(id) + (v.es ? '<span><bdi>' + J.fmt(J.dayToIso(v.es)) + '</bdi> تا <bdi>' + J.fmt(J.dayToIso(v.ef - 1)) + '</bdi></span>' : '') + (v.crit ? '<b class="crit">بحرانی</b>' : '') + '</div>' +
    '<form data-form="savenode" data-id="' + id + '">' +
    '<label class="f"><span>عنوان</span><input name="title" value="' + esc(n.title) + '" required></label>' +
    '<div class="row"><label class="f grow"><span>نوع</span><select name="kind">' + kindSel + '</select></label><label class="f grow"><span>اولویت</span><select name="priority">' + prSel + '</select></label></div>' +
    '<label class="f"><span>والد (جابه‌جایی در درخت)</span><select name="parent_id">' + parentOptions(id, idx.parentOf(id)) + '</select></label>' +
    (leaf ? '<div class="row"><label class="f grow"><span>وضعیت</span><select name="status">' + stSel + '</select></label>' +
      '<label class="f grow"><span>درصد انجام: <b id="pv">' + FA(n.progress) + '</b>٪</span><input type="range" name="progress" min="0" max="100" step="5" value="' + n.progress + '"></label></div>' :
      '<div class="sub"><div class="row">' + statusPill(v.status) + '<div class="grow">' + bar(v.progress) + '</div><b>' + FA(v.progress) + '٪</b></div><div class="mut sm">وضعیت و درصدِ بخشی که زیرمجموعه دارد، خودکار از زیرمجموعه‌ها محاسبه می‌شود (' + FA(v.leafDone) + ' از ' + FA(v.leafCount) + ' کار انجام‌شده، مجموع ' + num(v.dur) + ' روز).</div></div>') +
    '<label class="f"><span>خلاصه (یک‌خطی)</span><input name="summary" value="' + esc(n.summary) + '"></label>' +
    '<label class="f"><span>توضیحات کامل / نیازمندی‌ها</span><textarea name="details" style="min-height:110px">' + esc(n.details) + '</textarea></label>' +
    '<div class="sub"><h4>ورودی‌ها</h4><div id="io-in">' + ioRows('in', n.inputs) + '</div><button type="button" class="btn sm" data-act="addio" data-k="in">＋ ورودی</button></div>' +
    '<div class="sub"><h4>خروجی‌ها</h4><div id="io-out">' + ioRows('out', n.outputs) + '</div><button type="button" class="btn sm" data-act="addio" data-k="out">＋ خروجی</button></div>' +
    '<label class="f"><span>پردازش (این ماژول با ورودی‌ها چه می‌کند؟)</span><textarea name="process">' + esc(n.process) + '</textarea></label>' +
    '<label class="f"><span>نکات فنی (فناوری، جدول‌ها، API، فایل‌ها…)</span><textarea name="tech">' + esc(n.tech) + '</textarea></label>' +
    (leaf ? '<div class="row"><label class="f grow"><span>برآورد (روز)</span><input type="number" step="0.5" min="0" name="est_days" value="' + (n.est_days == null ? '' : n.est_days) + '" placeholder="پیشنهاد: ' + FA(E.heuristic(n)) + '"></label>' +
      '<label class="f grow"><span>زمان نهایی (روز) — دستی</span><input type="number" step="0.5" min="0" name="final_days" value="' + (n.final_days == null ? '' : n.final_days) + '"></label></div>' +
      '<label class="f"><span>تاریخ شروع (خالی = خودکار از وابستگی‌ها)</span>' + dateField('start_date', n.start_date, v.es ? J.fmt(J.dayToIso(v.es)) : '') + '</label>' : '') +
    '<div class="row"><label class="f grow"><span>مسئول</span><input name="assignee" value="' + esc(n.assignee) + '"></label><label class="f grow"><span>برچسب‌ها</span><input name="tags" value="' + esc(n.tags) + '"></label></div>' +
    '<div class="row"><button class="btn pri" type="submit">ذخیرهٔ بخش</button><button type="button" class="btn" data-act="addnode" data-parent="' + id + '">+ زیربخش</button><span class="grow"></span><button type="button" class="btn danger" data-act="delnode" data-id="' + id + '">حذف</button></div></form>' +
    (kids.length ? '<h2 class="sec">زیرمجموعه‌ها</h2><div class="list">' + kids.map(nodeLink).join('') + '</div>' : '') +
    '<h2 class="sec">وابستگی‌ها</h2>' + depBlock(id, 'in') + depBlock(id, 'out') +
    '<h2 class="sec">پیوست‌های این بخش</h2>' + (filesHtml(nfiles) || '<div class="mut sm">—</div>') +
    '<div style="margin-top:6px"><input type="file" multiple data-chg="upnode" data-id="' + id + '"></div>' +
    '<h2 class="sec">تاریخچه و یادداشت‌ها</h2>' + logForm(id) + '<div style="margin-top:10px">' + (nlogs.map(function (l) { return logHtml(l, false); }).join('') || '<div class="mut sm">هنوز یادداشتی نیست.</div>') + '</div>';
  d.scrollTop = keepTop;
}
function collectNode(f) {
  var o = {};
  ['title', 'kind', 'summary', 'details', 'process', 'tech', 'assignee', 'tags'].forEach(function (k) { var e = $('[name=' + k + ']', f); if (e) o[k] = e.value; });
  o.priority = +$('[name=priority]', f).value;
  var pr = $('[name=parent_id]', f); o.parent_id = pr.value ? +pr.value : null;
  var st = $('[name=status]', f), pg = $('[name=progress]', f);
  if (pg) {
    var n = S.idx.byId.get(+f.getAttribute('data-id'));
    if (+pg.value !== n.progress) o.progress = +pg.value;
    if (st.value !== n.status) o.status = st.value;
  }
  ['est_days', 'final_days'].forEach(function (k) { var e = $('[name=' + k + ']', f); if (e) o[k] = e.value === '' ? null : +e.value; });
  var sd = $('[name=start_date]', f); if (sd) o.start_date = J.parse(sd.value);
  ['in', 'out'].forEach(function (k) {
    o[k === 'in' ? 'inputs' : 'outputs'] = $$('#io-' + k + ' .io', f.parentNode).map(function (r) { return { name: $('[data-io$=name]', r).value, desc: $('[data-io$=desc]', r).value }; });
  });
  return o;
}

/* ---------- افزودن بخش / نقطهٔ عطف ---------- */
function addNodeDialog(parent) {
  modal({ title: 'بخش تازه', body: '<label class="f"><span>عنوان</span><input name="title" required></label>' +
    '<div class="row"><label class="f grow"><span>نوع</span><select name="kind"><option value="section">بخش کلی (گروه)</option><option value="module" selected>ماژول (ورودی/خروجی/پردازش)</option><option value="task">جزئیات / کار</option></select></label>' +
    '<label class="f grow"><span>والد</span><select name="parent_id">' + parentOptions(0, parent) + '</select></label></div>' +
    '<label class="f"><span>خلاصه (اختیاری)</span><input name="summary"></label>',
    ok: 'ساختن', onok: function (f) {
      var pv = $('[name=parent_id]', f).value;
      return api('node_save', { project_id: S.pid, title: $('[name=title]', f).value, kind: $('[name=kind]', f).value, summary: $('[name=summary]', f).value, parent_id: pv ? +pv : null }).then(function (r) {
        if (pv) S.open[+pv] = true;
        S.sel = r.id; if (S.tab === 'map') S.focus = pv ? +pv : 0;
        return reload();
      });
    } });
}
function msDialog(m) {
  m = m || {};
  modal({ title: m.id ? 'ویرایش نقطهٔ عطف' : 'نقطهٔ عطف (تایم‌استون)', body: '<label class="f"><span>عنوان</span><input name="title" value="' + esc(m.title || '') + '" required></label>' +
    '<label class="f"><span>تاریخ</span>' + dateField('date', m.date || J.dayToIso(S.sch.today)) + '</label>' +
    '<label class="f"><span>توضیح</span><input name="note" value="' + esc(m.note || '') + '"></label>' +
    '<label class="row"><input type="checkbox" name="done"' + (m.done ? ' checked' : '') + '> انجام شده</label>' +
    (m.id ? '<div style="margin-top:10px"><button type="button" class="btn danger sm" data-del>حذف این نقطهٔ عطف</button></div>' : ''),
    setup: function (f, close) { var b = $('[data-del]', f); if (b) b.addEventListener('click', guard(function () { return api('ms_delete', { project_id: S.pid, id: m.id }).then(function () { close(); return reload(); }); })); },
    onok: function (f) { return api('ms_save', { project_id: S.pid, id: m.id || 0, title: $('[name=title]', f).value, date: jdVal(f, 'date'), note: $('[name=note]', f).value, done: $('[name=done]', f).checked }).then(reload); } });
}

/* ---------- پروژهٔ نمونه ---------- */
function sampleDoc() {
  var N = function (id, parent, kind, title, summary, ins, outs, process, est) {
    return { id: id, parent: parent, kind: kind, title: title, summary: summary, inputs: (ins || []).map(function (x) { return { name: x }; }), outputs: (outs || []).map(function (x) { return { name: x }; }), process: process || '', est_days: est || null };
  };
  return { project: { name: 'نمونه: فروشگاه اینترنتی بزرگ', description: 'پروژهٔ نمونه برای آشنایی با ابزار؛ هر زمان خواستید حذفش کنید.', start_date: J.dayToIso(J.today()), target_date: J.dayToIso(J.today() + 75),
      ai_brief: 'PHP 8 + MySQL روی cPanel؛ رابط فارسی و راست‌به‌چپ؛ بدون وابستگیِ سنگین.' },
    nodes: [
      N('a', null, 'section', 'هسته و زیرساخت', 'پایگاه‌داده، احراز هویت و تنظیمات'),
      N('a1', 'a', 'module', 'طراحی پایگاه‌داده', 'جدول‌ها و رابطه‌ها', ['فهرست موجودیت‌ها'], ['اسکیمای SQL'], 'مدل‌سازی و ساخت مهاجرت‌ها', 3),
      N('a2', 'a', 'module', 'کاربران و ورود', 'ثبت‌نام، ورود، نقش‌ها', ['اسکیمای SQL'], ['نشست کاربر', 'سطح دسترسی'], 'اعتبارسنجی و ساخت نشست امن', 4),
      N('b', null, 'section', 'کاتالوگ', 'محصولات و دسته‌بندی'),
      N('b1', 'b', 'module', 'مدیریت محصول', 'ساخت/ویرایش محصول و تصاویر', ['اسکیمای SQL', 'سطح دسترسی'], ['فهرست محصولات'], '', 5),
      N('b2', 'b', 'module', 'جست‌وجو و فیلتر', 'جست‌وجوی سریع', ['فهرست محصولات'], ['نتایج مرتب'], 'نمایه‌سازی و رتبه‌بندی', 4),
      N('c', null, 'section', 'خرید', 'سبد، پرداخت و سفارش'),
      N('c1', 'c', 'module', 'سبد خرید', 'افزودن/حذف کالا', ['فهرست محصولات', 'نشست کاربر'], ['اقلام سبد'], '', 3),
      N('c2', 'c', 'module', 'پرداخت آنلاین', 'اتصال به درگاه', ['اقلام سبد'], ['وضعیت پرداخت'], 'ساخت تراکنش، بازگشت از درگاه، تأیید', 6),
      N('c3', 'c', 'module', 'ثبت و پیگیری سفارش', 'چرخهٔ سفارش', ['وضعیت پرداخت', 'اقلام سبد'], ['سفارش', 'پیامک وضعیت'], '', 5),
      N('d', null, 'module', 'پنل مدیریت', 'گزارش و مدیریت', ['سفارش', 'فهرست محصولات'], ['گزارش فروش'], '', 8)],
    dependencies: [{ from: 'a1', to: 'a2', label: 'اسکیمای SQL' }, { from: 'a1', to: 'b1', label: 'اسکیمای SQL' }, { from: 'a2', to: 'b1', label: 'سطح دسترسی' },
      { from: 'b1', to: 'b2', label: 'فهرست محصولات' }, { from: 'b1', to: 'c1', label: 'فهرست محصولات' }, { from: 'a2', to: 'c1', label: 'نشست کاربر' },
      { from: 'c1', to: 'c2', label: 'اقلام سبد' }, { from: 'c2', to: 'c3', label: 'وضعیت پرداخت' }, { from: 'c', to: 'd', label: 'سفارش‌ها' }, { from: 'b', to: 'd', label: 'محصولات' }],
    milestones: [{ title: 'نسخهٔ آزمایشی', date: J.dayToIso(J.today() + 40) }, { title: 'انتشار', date: J.dayToIso(J.today() + 75) }] };
}

/* ---------- رویدادها ---------- */
function elId(el) { return +el.getAttribute('data-id'); }
var ACTS = {
  noop: function () {},
  home: function () { location.hash = '#/'; },
  open: function (el) { location.hash = '#/p/' + elId(el) + '/dash'; },
  tab: function (el) { go(el.getAttribute('data-v')); },
  logout: function () { return api('logout').then(function () { S.user = null; S.P = null; return loadMe().then(function () { location.hash = '#/'; render(); }); }); },
  passwd: function () { modal({ title: 'تغییر رمز', body: '<label class="f"><span>رمز تازه (حداقل ۶ نویسه)</span><input type="password" name="pw" class="ltr" required></label>', onok: function (f) { return api('passwd', { password: $('[name=pw]', f).value }).then(function () { toast('رمز عوض شد'); }); } }); },
  newproject: function () { modal({ title: 'پروژهٔ جدید', body: projectForm(null, false), ok: 'ساخت پروژه', onok: function (f) { return saveProjectForm(f, 0).then(function (r) { location.hash = '#/p/' + r.id + '/dash'; }); } }); },
  editproject: function () {
    var p = S.P.project;
    modal({ title: 'تنظیمات پروژه', body: projectForm(p, true) + '<div style="margin-top:6px"><button type="button" class="btn danger sm" data-del>حذف کاملِ پروژه</button></div>',
      setup: function (f, close) { $('[data-del]', f).addEventListener('click', guard(function () { if (!confirm('پروژه «' + p.name + '» با همهٔ بخش‌ها، گزارش‌ها و پیوست‌ها برای همیشه پاک شود؟')) return; return api('project_delete', { project_id: S.pid }).then(function () { close(); S.P = null; S.pid = 0; location.hash = '#/'; }); })); },
      onok: function (f) { return saveProjectForm(f, S.pid).then(reload); } });
  },
  sample: function () { return api('import', { mode: 'new', doc: sampleDoc() }).then(function (r) { location.hash = '#/p/' + r.project_id + '/map'; }); },
  importnew: function () { var i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = function () { if (i.files[0]) readImport(i.files[0], 0); }; i.click(); },
  pick: function (el) { var id = elId(el); if (!id) return; S.sel = id; if (S.tab === 'map') S.focus = S.idx.parentOf(id); renderContent(true); renderDrawer(); },
  focus: function (el) { S.focus = elId(el); renderContent(); },
  cardgo: function (el) { var id = elId(el); S.sel = id; if (S.idx.children(id).length) S.focus = id; renderContent(); renderDrawer(); },
  ghostgo: function (el) { var id = elId(el); S.sel = id; S.focus = S.idx.parentOf(id); renderContent(); renderDrawer(); },
  closedrawer: function () { S.sel = 0; renderContent(true); renderDrawer(); },
  addnode: function (el) { addNodeDialog(+el.getAttribute('data-parent') || 0); },
  toggle: function (el, ev) { ev.stopPropagation(); var id = elId(el); S.open[id] = !isOpen(id); renderContent(true); },
  expand: function (el) { var on = el.getAttribute('data-v') === '1'; S.idx.preorder.forEach(function (id) { if (S.idx.children(id).length) S.open[id] = on; }); renderContent(true); },
  mv: function (el) { return moveNode(elId(el), el.getAttribute('data-d')); },
  delnode: function (el) { var n = S.idx.byId.get(elId(el)), k = S.idx.descendants(n.id).length; if (!confirm('«' + n.title + '»' + (k ? ' و ' + FA(k) + ' زیرمجموعه‌اش' : '') + ' (با گزارش‌ها و پیوست‌ها) پاک شود؟')) return; return api('node_delete', { project_id: S.pid, id: n.id }).then(function () { S.sel = 0; return reload(); }); },
  deldep: function (el) { return api('dep_delete', { project_id: S.pid, id: elId(el) }).then(reload); },
  addio: function (el) { var k = el.getAttribute('data-k'), box = $('#io-' + k); box.insertAdjacentHTML('beforeend', ioRow(k)); box.lastChild.firstChild.focus(); },
  rmrow: function (el) { el.parentNode.remove(); },
  zoom: function (el) { S.zoom = el.getAttribute('data-v'); S._gToday = null; renderContent(true); },
  critbox: function (el) { S.crit = el.checked; renderContent(true); },
  gotoday: function () { var g = $('.gscroll'); if (g) g.scrollLeft = Math.max(0, S._gToday - 160); },
  addms: function () { msDialog(); },
  editms: function (el) { var m = S.P.milestones.filter(function (x) { return x.id === elId(el); })[0]; if (m) msDialog(m); },
  dellog: function (el) { if (!confirm('این یادداشت (با پیوست‌هایش) پاک شود؟')) return; return api('log_delete', { project_id: S.pid, id: elId(el) }).then(reload); },
  delfile: function (el) { if (!confirm('این پیوست پاک شود؟')) return; return api('file_delete', { project_id: S.pid, id: elId(el) }).then(reload); },
  lightbox: function (el) { modal({ title: 'تصویر', cls: 'wide', body: '<img src="' + esc(el.getAttribute('data-src')) + '" style="max-width:100%;border-radius:8px">', noOk: true, noFocus: true }); },
  savebrief: function () { var p = S.P.project; return api('project_save', { project_id: S.pid, name: p.name, description: p.description, start_date: p.start_date, target_date: p.target_date, status: p.status, ai_brief: $('#aibrief').value }).then(function () { toast('ذخیره شد'); return reload(); }); },
  exportjson: function () { download(safeName(S.P.project.name) + '.pm.json', JSON.stringify(E.buildExport(S.idx, S.sch), null, 2)); },
  exportmd: function () { download(safeName(S.P.project.name) + '.md', E.buildMarkdown(S.idx, S.sch), 'text/markdown'); },
  exportzip: function () { location.href = 'api.php?a=files_zip&project_id=' + S.pid; },
  copyprompt: function () { var t = PROMPT; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('کپی شد'); }).catch(function () { var r = document.createRange(); r.selectNodeContents($('#promptbox')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('متن انتخاب شد؛ Ctrl+C بزنید'); }); },
  fillest: function () { var items = []; S.sch.order.forEach(function (id) { var n = S.idx.byId.get(id); if (n.est_days == null && n.final_days == null) items.push({ id: id, est_days: E.heuristic(n) }); }); if (!items.length) return toast('برآوردِ خالی‌ای نبود'); return api('nodes_bulk', { project_id: S.pid, items: items }).then(function () { toast(FA(items.length) + ' برآورد ثبت شد'); return reload(); }); },
  applysched: function () {
    var items = [], clash = 0; S.sch.order.forEach(function (id) { var v = S.sch.info.get(id), n = S.idx.byId.get(id); if (n.status === 'done') return; if (v.manual) clash++; else items.push({ id: id, start_date: J.dayToIso(v.es) }); });
    if (!items.length) return toast('همه‌چیز از قبل تاریخ دارد');
    return api('nodes_bulk', { project_id: S.pid, items: items }).then(function () { toast('تاریخ شروعِ ' + FA(items.length) + ' کار ثبت شد' + (clash ? ' (' + FA(clash) + ' تاریخِ دستی دست‌نخورده)' : '')); return reload(); });
  },
  clearsched: function () { if (!confirm('همهٔ تاریخ‌های شروعِ ثبت‌شده پاک شود (برنامه دوباره خودکار از وابستگی‌ها محاسبه می‌شود)؟')) return; var items = S.sch.order.filter(function (id) { return S.idx.byId.get(id).start_date; }).map(function (id) { return { id: id, start_date: null }; }); if (!items.length) return; return api('nodes_bulk', { project_id: S.pid, items: items }).then(reload); }
};
document.addEventListener('click', function (e) {
  var el = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!el || el.tagName === 'INPUT' && el.type !== 'checkbox') return;
  var fn = ACTS[el.getAttribute('data-act')]; if (!fn) return;
  if (el.type === 'checkbox') { guard(fn)(el, e); return; }
  guard(fn)(el, e);
});
document.addEventListener('submit', function (e) {
  var f = e.target; var kind = f.getAttribute('data-form'); if (!kind) return;
  e.preventDefault();
  guard(function () {
    if (kind === 'login' || kind === 'setup') {
      return api(kind, { username: $('[name=username]', f).value, password: $('[name=password]', f).value }).then(function (j) { S.user = j.user; S.csrf = j.csrf; S.needsSetup = false; route(); });
    }
    if (kind === 'savenode') { return api('node_save', Object.assign({ project_id: S.pid, id: +f.getAttribute('data-id') }, collectNode(f))).then(function () { toast('ذخیره شد'); return reload(); }); }
    if (kind === 'adddep') {
      var other = +$('[name=other]', f).value; if (!other) return;
      var id = +f.getAttribute('data-id'), dir = f.getAttribute('data-dir');
      return api('dep_save', { project_id: S.pid, from_id: dir === 'in' ? other : id, to_id: dir === 'in' ? id : other, label: $('[name=label]', f).value }).then(reload);
    }
    if (kind === 'addlog') {
      var body = $('[name=body]', f).value, files = $('[name=files]', f).files;
      if (!body.trim() && !files.length) return;
      var fd = new FormData(); fd.append('project_id', S.pid); fd.append('node_id', f.getAttribute('data-node')); fd.append('kind', $('[name=kind]', f).value); fd.append('body', body);
      Array.prototype.forEach.call(files, function (x) { fd.append('files[]', x, x.name); });
      return api('log_add', fd).then(reload);
    }
  })();
});
document.addEventListener('change', function (e) {
  var t = e.target, ch = t.getAttribute && t.getAttribute('data-chg');
  if (t.name === 'progress' && t.type === 'range') { var pv = $('#pv'); if (pv) pv.textContent = FA(t.value); }
  if (ch === 'lognode') { S.logNode = t.value; renderContent(true); }
  else if (ch === 'logkind') { S.logKind = t.value; renderContent(true); }
  else if (ch === 'upnode') {
    var fd = new FormData(); fd.append('project_id', S.pid); fd.append('node_id', t.getAttribute('data-id'));
    Array.prototype.forEach.call(t.files, function (x) { fd.append('files[]', x, x.name); });
    guard(function () { return api('upload', fd).then(function () { toast('بارگذاری شد'); return reload(); }); })();
  } else if (t.getAttribute && t.getAttribute('data-dlabel')) {
    guard(function () { return api('dep_save', { project_id: S.pid, from_id: +t.getAttribute('data-from'), to_id: +t.getAttribute('data-to'), label: t.value }).then(function () { toast('ذخیره شد'); return loadProject(S.pid); }); })();
  } else if (t.getAttribute && t.getAttribute('data-f') && t.closest('tr')) {
    var row = t.closest('tr'), id = +row.getAttribute('data-id'), k = t.getAttribute('data-f'), val;
    if (k === 'start_date') { val = J.parse(t.value); if (val === undefined) { t.classList.add('bad'); return toast('تاریخ را مثل ۱۴۰۵/۰۸/۲۸ بنویسید', true); } t.classList.remove('bad'); }
    else val = t.value === '' ? null : +t.value;
    var it = { id: id }; it[k] = val;
    guard(function () { return api('nodes_bulk', { project_id: S.pid, items: [it] }).then(reload); })();
  }
});
document.addEventListener('paste', function (e) {
  var t = e.target; if (!t || t.name !== 'body' || !e.clipboardData) return;
  var imgs = Array.prototype.filter.call(e.clipboardData.files || [], function (f) { return /^image\//.test(f.type); });
  if (!imgs.length) return;
  var inp = $('[name=files]', t.form), dt = new DataTransfer();
  Array.prototype.forEach.call(inp.files, function (f) { dt.items.add(f); });
  imgs.forEach(function (f, i) { dt.items.add(new File([f], 'paste-' + Date.now() + '-' + i + '.png', { type: f.type })); });
  inp.files = dt.files; toast(FA(imgs.length) + ' تصویر به پیوست افزوده شد');
});
window.addEventListener('hashchange', route);
loadMe().then(route).catch(function (e) { $('#app').innerHTML = '<div class="boot">خطا در اتصال به سرور: ' + esc(e.message) + '</div>'; });
})();
