/* مدیر پروژه — رابط کاربری. بدونِ ?. (سازگاری با مرورگرهای قدیمی‌تر). */
(function () {
'use strict';
var J = window.JAL, E = window.ENG;
var S = { editing: false, snap: null, chgBase: 0, tool: null, libCount: 0, libId: 0, drawerOpen: false, cv: null, cvView: {}, pendingRename: 0, pendingLink: '', version: '', updAvail: false, user: null, csrf: '', needsSetup: false, projects: [], pid: 0, P: null, idx: null, sch: null,
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
    S.user = j.user; S.csrf = j.csrf; S.needsSetup = j.needs_setup; S.version = j.version || '';
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
    if (S.pid !== pid || !S.P) { S.focus = 0; S.sel = 0; S.open = {}; S.editing = false; S.snap = null; S.tool = null; S.drawerOpen = false; return loadProject(pid).then(function () { render(); }).catch(function (e) { fail(e); location.hash = '#/'; }); }
    return render();
  }
  if (S.P) flushTime();
  S.pid = 0; S.P = null; S.editing = false;
  loadProjects().then(function () { return api('library_list'); }).then(function (j) { S.libCount = j.modules.length; S.libId = j.library_id; render(); }).catch(fail);
}
function go(tab) { location.hash = '#/p/' + S.pid + '/' + tab; }

/* ---------- نمایش اصلی ---------- */
var scrollKeep = {};
/* ---------- ثابت‌ها و کمک‌های سلسله‌مراتب ---------- */
var KIND_ICON = { area: '🏛️', section: '📂', module: '🧩', task: '✔️' };
var KCOL = { area: '#2f6fed', section: '#1f9d63', module: '#7a5af8', task: '#e0912b' };
var KIND_HINT = { area: 'بخشِ کلیِ پروژه؛ فقط «بخش» و «ماژول» می‌گیرد', section: 'می‌تواند بخش، ماژول و کار داشته باشد', module: 'ابزارِ قابلِ ذخیره در کتابخانه؛ ورودی/خروجی دارد', task: 'آخرین سطح؛ یک ورودی، یک خروجی و فلوچارت' };
function projKind() { return S.P && S.P.project.kind || 'project'; }
function isLib() { return projKind() === 'library'; }
function childKindsOf(kind) { /* kind=null یعنی ریشه */
  if (kind == null) return isLib() ? ['module'] : ['area'];
  return { area: ['section', 'module'], section: ['section', 'module', 'task'], module: ['section', 'module', 'task'] }[kind] || [];
}
function childKinds(parentId) { return childKindsOf(parentId ? S.idx.byId.get(parentId).kind : null); }
function fmtDur(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return FA(sec) + ' ثانیه';
  var m = Math.floor(sec / 60), h = Math.floor(m / 60); m = m % 60;
  return h ? FA(h) + ' ساعت' + (m ? ' و ' + FA(m) + ' دقیقه' : '') : FA(m) + ' دقیقه';
}
function nodeTime(id) {
  var n = S.idx.byId.get(id); if (!n) return 0;
  var t = n.work_seconds || 0; S.idx.descendants(id).forEach(function (d) { t += S.idx.byId.get(d).work_seconds || 0; }); return t;
}
function totalTime() { var t = (S.P.project.work_seconds || 0); S.P.nodes.forEach(function (n) { t += n.work_seconds || 0; }); return t; }
function relTime(s) {
  if (!s) return ''; var d = new Date(s.replace(' ', 'T')), diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'همین الان'; if (diff < 3600) return FA(Math.floor(diff / 60)) + ' دقیقه پیش'; if (diff < 86400) return FA(Math.floor(diff / 3600)) + ' ساعت پیش';
  return FA(Math.floor(diff / 86400)) + ' روز پیش';
}
function needEdit() { if (S.editing) return true; toast('برای تغییر، اول «✎ ویرایش» را بزنید', true); return false; }

/* ---------- حالتِ ویرایش / ذخیره / لغو ---------- */
function startEdit() {
  if (S.editing || !S.P) return;
  S.editing = true; S.snap = JSON.stringify({ nodes: S.P.nodes, deps: S.P.deps, milestones: S.P.milestones });
  S.chgBase = S.P.changes.length ? S.P.changes[0].id : 0; S.tm.act = Date.now();
  render(true); toast('حالت ویرایش روشن شد');
}
function endEdit() { flushTime(); S.editing = false; S.snap = null; S.tool = null; if (S.tab === 'map') S.drawerOpen = false; }
function saveEdit() {
  if (!S.editing) return;
  var since = S.P.changes.filter(function (c) { return c.id > S.chgBase; });
  if (!since.length) { endEdit(); render(true); return toast('تغییری انجام نشده بود؛ به حالتِ مشاهده برگشتید'); }
  var list = since.slice(0, 12).map(function (c) { return '<li>' + esc(c.action) + (c.detail ? ': ' + esc(c.detail.slice(0, 70)) : '') + (c.path ? ' <span class="mut">— ' + esc(c.path) + '</span>' : '') + '</li>'; }).join('');
  modal({ title: '💾 ذخیرهٔ تغییرات', body: '<p>' + FA(since.length) + ' تغییر در این نوبتِ ویرایش:</p><ul class="sm" style="max-height:200px;overflow:auto">' + list + '</ul>' +
    '<label class="f"><span>توضیحِ کوتاه برای این نسخه (اختیاری)</span><input name="note" placeholder="مثلاً: طراحیِ بخشِ پرداخت"></label>', ok: '💾 ذخیره و بستنِ ویرایش',
    onok: function (f) {
      var sum = since.slice(0, 8).map(function (c) { return c.action + (c.detail ? ' ' + c.detail.slice(0, 40) : ''); }).join('؛ ');
      flushTime();
      return api('revision_save', { project_id: S.pid, note: $('[name=note]', f).value, summary: sum }).then(function () { endEdit(); toast('ذخیره شد؛ اکنون در حالتِ مشاهده هستید'); return reload(); });
    } });
}
function discardEdit() {
  if (!S.editing) return;
  if (!confirm('همهٔ تغییراتِ این نوبتِ ویرایش لغو شود و پروژه به حالتِ پیش از ویرایش برگردد؟\n(پیوست و یادداشتِ بخش‌هایی که در این نوبت ساخته و پاک شده‌اند از بین می‌رود.)')) return;
  var snap = S.snap ? JSON.parse(S.snap) : null; if (!snap) return;
  return api('project_restore', { project_id: S.pid, snapshot: snap }).then(function () { endEdit(); toast('تغییرات لغو شد'); return reload(); });
}

/* ---------- زمانِ کار ---------- */
S.tm = { acc: 0, act: Date.now(), nid: 0 };
function flushTime(keep) {
  if (!S.P || !S.tm.acc) return;
  var sec = S.tm.acc, nid = S.tm.nid || 0; S.tm.acc = 0;
  var body = JSON.stringify({ project_id: S.pid, node_id: nid, seconds: sec });
  try { fetch('api.php?a=time_add', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF': S.csrf }, body: body, credentials: 'same-origin', keepalive: !!keep }); } catch (e) { /* بی‌اثر */ }
}
function tickSec() {
  updClock();
  if (!(S.editing && S.P && S.user && !document.hidden && Date.now() - S.tm.act < 90000)) { updStatus(true); return; }
  var nid = S.sel || 0;
  if (S.tm.nid !== nid) { flushTime(); S.tm.nid = nid; }
  S.tm.acc++;
  if (nid) { var n = S.idx.byId.get(nid); if (n) n.work_seconds = (n.work_seconds || 0) + 1; } else S.P.project.work_seconds = (S.P.project.work_seconds || 0) + 1;
  if (S.tm.acc >= 30) flushTime();
  updStatus();
}
['mousemove', 'keydown', 'pointerdown', 'wheel', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { S.tm.act = Date.now(); }, { passive: true }); });
window.addEventListener('beforeunload', function () { flushTime(true); });
document.addEventListener('visibilitychange', function () { if (document.hidden) flushTime(); });
setInterval(tickSec, 1000);

/* ---------- نوارِ وضعیت و ساعت ---------- */
function nowStr() {
  var d = new Date(), p = function (x) { return ('0' + x).slice(-2); };
  return J.fmt(J.dayToIso(J.today()), true) + ' · ' + FA(p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()));
}
function updClock() { var c = $('#clock'); if (c) c.textContent = nowStr(); }
function statusHtml() {
  if (!S.P) return '<span class="sb-i">👤 ' + esc(S.user || '') + '</span><span class="grow"></span><span class="sb-i" id="clock">' + nowStr() + '</span>';
  var n = S.sel ? S.idx.byId.get(S.sel) : null, ch = S.P.changes[0], parts = [];
  parts.push('<span class="sb-mode ' + (S.editing ? 'edit' : 'view') + '">' + (S.editing ? '✎ در حال ویرایش' : '👁 فقط مشاهده') + '</span>');
  if (n) parts.push('<span class="sb-i" title="' + esc(S.idx.pathText(n.id)) + '">' + (n.icon || KIND_ICON[n.kind]) + ' ' + esc(S.idx.pathText(n.id)) + '</span><span class="sb-i">⏱ این بخش: <b>' + fmtDur(nodeTime(n.id)) + '</b></span>');
  parts.push('<span class="sb-i">🕘 کلِ زمانِ طراحی: <b>' + fmtDur(totalTime()) + '</b></span>');
  if (ch) parts.push('<span class="sb-i grow" title="' + esc(ch.action + ' ' + ch.detail) + '">🔄 آخرین تغییر: ' + esc(ch.action) + (ch.path ? ' در «' + esc(ch.path.split(' › ').slice(-2).join(' › ')) + '»' : '') + ' <span class="mut">(' + relTime(ch.created_at) + ')</span></span>');
  else parts.push('<span class="grow"></span>');
  parts.push('<span class="sb-i" id="clock">' + nowStr() + '</span>');
  return parts.join('');
}
function refreshMenu() { var m = $('.menubar'); if (!m) return; var open = $('.mm.open'), id = open ? open.getAttribute('data-mm') : ''; m.outerHTML = menuBar(); if (id) { var n = $('.mm[data-mm=' + id + ']'); if (n) n.classList.add('open'); } }
function updStatus(light) {
  var b = $('#statusbar'); if (!b) return;
  if (light && S.P && !S.editing) { /* بدونِ ویرایش، فقط ساعت */ if (!b.innerHTML) b.innerHTML = statusHtml(); return; }
  b.innerHTML = statusHtml();
}

/* ---------- منوی برنامه ---------- */
function mi(icon, label, act, o) {
  o = o || {};
  return '<button class="mi' + (o.dis ? ' dis' : '') + '" data-act="' + act + '"' + (o.data || '') + (o.dis ? ' disabled' : '') + '><span class="mi-i">' + icon + '</span><span class="mi-t">' + label + '</span>' + (o.key ? '<span class="mi-k">' + o.key + '</span>' : '') + '</button>';
}
function menu(id, icon, label, items, color) {
  return '<div class="mm" data-mm="' + id + '" style="--mc:' + color + '"><button class="mm-b" data-act="menu" data-id="' + id + '"><span class="mm-ic">' + icon + '</span> ' + label + '</button><div class="mm-pop">' + items + '</div></div>';
}
function menuSep() { return '<div class="mi-sep"></div>'; }
function menuBar() {
  var p = S.P, inP = !!p, ed = S.editing, nsel = inP && S.sel && S.idx.byId.get(S.sel), selMod = nsel && nsel.kind === 'module';
  var m = '';
  m += menu('file', '📁', 'پروژه',
    mi('🆕', 'پروژهٔ جدید…', 'newproject') + mi('📂', 'فهرستِ پروژه‌ها', 'home') + mi('📥', 'ایمپورت از فایل…', 'importnew') + mi('🎬', 'پروژهٔ دمو (همهٔ امکانات)', 'sample') +
    (inP ? menuSep() + mi('⚙️', 'تنظیمات پروژه…', 'editproject', { dis: !ed && false }) + mi('🤖', 'خروجی برای هوش مصنوعی (.pm.json)', 'exportjson') + mi('📄', 'شرحِ خوانا (Markdown)', 'exportmd') + mi('🗜️', 'پیوست‌ها (zip)', 'exportzip') : ''), '#2f6fed');
  if (inP) m += menu('edit', '✏️', 'ویرایش',
    mi('✎', 'شروعِ ویرایش', 'editstart', { dis: ed, key: 'Ctrl+E' }) + mi('💾', 'ذخیره و پایانِ ویرایش', 'editsave', { dis: !ed, key: 'Ctrl+S' }) + mi('↩', 'لغوِ تغییراتِ این نوبت', 'editdiscard', { dis: !ed }) +
    menuSep() + mi('🕘', 'تاریخچهٔ تغییرات و نسخه‌ها', 'tab', { data: ' data-v="hist"' }), '#e0912b');
  if (inP) m += menu('view', '👁', 'نما',
    TABS.map(function (t) { return mi(t[1], t[2], 'tab', { data: ' data-v="' + t[0] + '"' }); }).join('') + menuSep() +
    mi('🔎', 'جا دادنِ نقشه در صفحه', 'mapzoom', { data: ' data-v="fit"' }) + mi('🧹', 'بستنِ پنلِ جزئیات', 'closedrawer'), '#7a5af8');
  m += menu('tools', '🧰', 'ابزار',
    mi('📚', 'کتابخانهٔ ماژول‌ها', 'openlib') +
    (inP ? mi('📥', 'درج ماژول از کتابخانه…', 'libinsert', { dis: !ed || childKinds(S.focus).indexOf('module') < 0 }) + mi('📤', 'ذخیرهٔ ماژولِ انتخاب‌شده در کتابخانه', 'savelib', { dis: !selMod }) +
      (isLib() ? mi('🧬', 'ساختِ مشتق (ارث‌بری) از ماژولِ انتخاب‌شده', 'derive', { dis: !ed || !selMod }) : '') : ''), '#14a3a3');
  m += menu('help', '❓', 'راهنما',
    mi('📖', 'راهنمای سریع', 'help') + mi('⌨️', 'میان‌برها', 'shortcuts') + mi('🔄', 'به‌روزرسانی و نسخه (v' + esc(S.version) + ')', 'update') + menuSep() + mi('🔑', 'تغییر رمز', 'passwd') + mi('🚪', 'خروج', 'logout'), '#e0558a');
  return '<header class="menubar"><div class="mb-logo" data-act="home" title="فهرستِ پروژه‌ها">🧭 <b>Milo</b></div><nav class="mb-menus">' + m + '</nav>' +
    '<div class="mb-title">' + (inP ? (isLib() ? '📚 ' : '') + esc(p.project.name) + ' <span class="pill">' + FA(p.project.progress) + '٪</span>' : '') + '</div><div class="mb-right"><span class="mb-user">👤 ' + esc(S.user || '') + '</span></div></header>';
}
var TABS = [['dash', '📊', 'داشبورد', '#2f6fed'], ['map', '🗺️', 'ساختار', '#7a5af8'], ['outline', '📋', 'فهرست', '#14a3a3'], ['plan', '🧭', 'ترتیب و زمان‌بندی', '#e0912b'],
  ['gantt', '📅', 'تایم‌لاین', '#d64545'], ['logs', '📝', 'گزارش‌ها', '#1f9d63'], ['hist', '🕘', 'تاریخچه', '#64748b'], ['ai', '🤖', 'هوش مصنوعی', '#e0558a']];
function tabsBar() {
  var ed = S.editing;
  return '<nav class="tabs">' + TABS.map(function (t) { return '<div class="tab ' + (S.tab === t[0] ? 'on' : '') + '" style="--tc:' + t[3] + '" data-act="tab" data-v="' + t[0] + '"><span class="tab-i">' + t[1] + '</span> ' + t[2] + '</div>'; }).join('') +
    '<span class="grow"></span>' + (ed ? '<span class="pill s st-doing">✎ در حال ویرایش</span><button class="btn okb" data-act="editsave">💾 ذخیره</button><button class="btn" data-act="editdiscard">↩ لغو</button>' :
      '<button class="btn eb" data-act="editstart" title="Ctrl+E">✎ ویرایش</button>') + '</nav>';
}

/* ---------- نمایشِ اصلی ---------- */
function render(keep) {
  var app = $('#app');
  if (!S.user) { app.innerHTML = authView(); return; }
  if (!S.P) { app.innerHTML = homeView(); updStatus(); return; }
  if (!$('#content')) app.innerHTML = shell();
  else { $('.menubar', app).outerHTML = menuBar(); $('.tabs', app).outerHTML = tabsBar(); }
  renderContent(keep); renderDrawer(); updStatus();
}
function shell() { return menuBar() + tabsBar() + '<div class="main"><section id="content"></section><aside id="drawer" class="hidden"></aside></div><footer id="statusbar" class="statusbar"></footer>'; }
function renderContent(keep) {
  var c = $('#content'); if (!c) return;
  var mn = $('.main'); if (mn) mn.classList.toggle('overlay', S.tab === 'map');
  var sc = {};
  if (keep) { $$('[data-sk]', c).forEach(function (e) { sc[e.getAttribute('data-sk')] = [e.scrollLeft, e.scrollTop]; }); sc.win = window.scrollY; }
  var fn = { dash: dashView, map: mapView, outline: outlineView, plan: planView, gantt: ganttView, logs: logsView, hist: histView, ai: aiView }[S.tab] || dashView;
  c.innerHTML = fn();
  if (keep) { $$('[data-sk]', c).forEach(function (e) { var s = sc[e.getAttribute('data-sk')]; if (s) { e.scrollLeft = s[0]; e.scrollTop = s[1]; } }); window.scrollTo(0, sc.win || 0); }
  if (S.tab === 'gantt' && !keep) { var g = $('.gscroll'); if (g && S._gToday != null) g.scrollLeft = Math.max(0, S._gToday - 160); }
  if (S.tab === 'ai') bindAi();
  if (S.tab === 'map') mountMap();
  var tb = $('.tabs'); if (tb) tb.outerHTML = tabsBar();
}
function selectNode(id, focusToo) {
  S.sel = id;
  if (focusToo != null) S.focus = focusToo;
  renderContent(true); renderDrawer(); updStatus();
}

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
    return '<div class="card pcard" data-act="open" data-id="' + p.id + '"><h3>🗂️ ' + esc(p.name) + '</h3>' +
      '<div class="mut sm clamp2" style="min-height:22px" title="' + esc(p.description || '') + '">' + esc(p.description || '') + '</div>' +
      '<div class="row" style="margin:8px 0 4px"><div class="grow">' + bar(p.progress, p.progress >= 100 ? 'ok' : '') + '</div><b>' + FA(p.progress) + '٪</b></div>' +
      '<div class="row sm mut"><span>' + FA(p.node_count) + ' بخش</span><span>·</span><span>' + FA(p.leaf_done) + '/' + FA(p.leaf_count) + ' کار</span><span>·</span><span>⏱ ' + fmtDur(p.work_total) + '</span>' +
      (p.target_date ? '<span>·</span><span>هدف: ' + J.fmt(p.target_date) + '</span>' : '') + '</div></div>';
  }).join('');
  return menuBar() + '<div class="wrap"><div class="card libcard" data-act="openlib"><span class="lc-i">📚</span><div class="grow"><h3>کتابخانهٔ ماژول‌ها</h3><div class="mut sm">ماژول‌هایی که یک‌بار تعریف می‌کنید و در همهٔ پروژه‌ها (با امکانِ ارث‌بری و تغییر) به کار می‌برید. ' + FA(S.libCount || 0) + ' ماژول</div></div><span class="btn">باز کردن ←</span></div>' +
    '<div class="row" style="margin:14px 0"><h2 class="sec grow" style="margin:0">🗂️ پروژه‌ها</h2>' +
    '<button class="btn" data-act="sample">🎬 پروژهٔ دمو (همهٔ امکانات)</button><button class="btn" data-act="importnew">📥 ایمپورت از فایل…</button>' +
    '<button class="btn pri" data-act="newproject">🆕 پروژهٔ جدید</button></div>' +
    (cards ? '<div class="grid">' + cards + '</div>' : '<div class="card empty">هنوز پروژه‌ای ندارید.<br>با «پروژهٔ جدید» شروع کنید یا «پروژهٔ دمو» را ببینید.</div>') + '</div><footer id="statusbar" class="statusbar"></footer>';
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
  var pIss = E.portIssues(idx);
  var issHtml = pIss.length ? '<h2 class="sec">⚠ ورودی/خروجیِ بی‌هدف <span class="pill s st-blocked">' + FA(pIss.length) + ' بخش</span></h2><div class="list">' + pIss.slice(0, 8).map(function (i) { return '<div data-act="pick" data-id="' + i.id + '"><span class="grow t">' + esc(i.title) + '</span><span class="mut sm">' + i.ports.map(function (p) { return (p.side === 'in' ? '⇢' : '⇠') + esc(p.name); }).join('، ') + '</span></div>'; }).join('') + '</div>' : '<h2 class="sec">🎯 ورودی/خروجی‌ها</h2><div class="mut sm">همهٔ ورودی/خروجی‌ها هدف دارند ✓</div>';
  var chgList = P.changes.slice(0, 6).map(chgRow).join('') || '<div class="mut">—</div>';
  var rec = P.logs.slice(0, 8).map(function (l) {
    var n = l.node_id ? idx.byId.get(l.node_id) : null;
    return '<div data-act="' + (n ? 'pick' : 'noop') + '" data-id="' + (l.node_id || 0) + '"><span class="pill">' + (l.kind === 'ai_report' ? 'AI' : 'یادداشت') + '</span><span class="grow t sm" title="' + esc(l.body || '') + '">' + esc((l.body || '').slice(0, 140)) + '</span><span class="mut sm">' + esc(n ? n.title : '') + '</span></div>';
  }).join('');
  if (!P.nodes.length) return '<div class="card empty">پروژه خالی است. اولین بخش را اضافه کنید، یا از «ایمپورت» فایلِ ساختار بیاورید.<br><br><button class="btn pri" data-act="addnode" data-parent="0">＋ افزودن اولین بخشِ کلی</button></div>';
  return '<div class="kpis">' +
    '<div class="card kpi"><b>' + FA(sch.root.progress) + '٪</b><span>پیشرفت کل (وزن‌دهی‌شده با زمان)</span>' + bar(sch.root.progress, sch.root.progress >= 100 ? 'ok' : '') + '</div>' +
    '<div class="card kpi"><b>' + FA(sch.root.done) + ' / ' + FA(sch.root.leaves) + '</b><span>کارِ انجام‌شده از کل</span></div>' +
    '<div class="card kpi"><b>' + num(sch.root.total) + ' روز</b><span>مجموع کار (برآورد/نهایی)</span></div>' +
    '<div class="card kpi"><b>⏱ ' + fmtDur(totalTime()) + '</b><span>زمانِ صرف‌شده برای طراحیِ این پروژه</span></div>' +
    '<div class="card kpi"><b class="' + (late ? 'crit' : '') + '">' + (projEnd ? J.fmt(projEnd, true) : '—') + '</b><span>پایانِ پیش‌بینی‌شده' + (tgt != null ? ' · هدف: ' + J.fmt(p.target_date, true) + (late ? ' ⚠ دیرتر از هدف' : ' ✓') : '') + '</span></div></div>' +
    '<div class="card" style="margin-bottom:14px"><div class="stack">' + stack + '</div><div class="legend" style="margin-top:8px">' + legend + '</div></div>' +
    '<div class="two"><div class="card"><h2 class="sec">گام بعدی <span class="mut sm">(پیش‌نیازهایش انجام شده)</span></h2><div class="list">' + (ready.map(nodeLink).join('') || '<div class="mut">—</div>') + '</div>' +
    '<h2 class="sec">عقب‌افتاده</h2><div class="list">' + (over.map(nodeLink).join('') || '<div class="mut">مورد عقب‌افتاده‌ای نیست ✓</div>') + '</div></div>' +
    '<div class="card"><h2 class="sec">بخش‌های اصلی</h2><div class="list">' + tops + '</div>' +
    '<h2 class="sec">نقاط عطف پیش رو</h2><div class="list">' + (ms.map(function (m) { return '<div data-act="tab" data-v="gantt"><span>◆</span><span class="grow t">' + esc(m.title) + '</span><span class="mut sm">' + (m.date ? J.fmt(m.date, true) : '') + '</span></div>'; }).join('') || '<div class="mut">—</div>') + '</div>' +
    '' + issHtml + '<h2 class="sec">🔄 آخرین تغییرات</h2><div class="list chglist">' + chgList + '</div><h2 class="sec">آخرین گزارش‌ها</h2><div class="list">' + (rec || '<div class="mut">—</div>') + '</div></div></div>' +
    (sch.cycle ? '<p class="crit">⚠ در وابستگی‌ها چرخه وجود دارد؛ زمان‌بندی دقیق نیست.</p>' : '');
}

/* ---------- نقشهٔ ساختار (بومِ گرافیکی با سطح‌بندی) ---------- */
var ICONS = ['📦', '🧩', '⚙️', '🔐', '👤', '🛒', '💳', '📊', '🗄️', '🌐', '📱', '🔔', '📧', '🔍', '🧪', '🚀', '🎨', '📝', '🔗', '⭐', '🏗️', '🛍️', '📋', '🧺', '🛡️', '📈', '🔧', '💬'];
var KSIZE = { area: { w: 300, h: 160 }, section: { w: 280, h: 140 }, module: { w: 280, h: 140 }, task: { w: 250, h: 112 } };
function nodeColor(n) { return n.color || KCOL[n.kind]; }
function portTop(n) { return n.kind === 'task' ? 64 : 78; }
function blockDims(n) {
  var b = KSIZE[n.kind] || KSIZE.module, rows = Math.min(8, Math.max((n.inputs || []).length, (n.outputs || []).length));
  return { w: b.w, h: Math.max(b.h, portTop(n) + rows * 22 + 54) };
}
function portStateMap(n) { var m = {}; E.portStatus(n, S.P.deps).forEach(function (s) { m[s.side + ':' + s.name] = s.state; }); return m; }
function blockPorts(n) {
  var top = portTop(n), sm = portStateMap(n);
  var mk = function (list, side) { return (list || []).slice(0, 8).map(function (p, i) { var st = sm[side + ':' + p.name]; return { name: p.name, y: top + i * 22 + 11, unused: st === 'unused', warn: st === 'none' || st === 'dangling', tip: E.PORT_MSG[st] || '' }; }); };
  return { 'in': mk(n.inputs, 'in'), out: mk(n.outputs, 'out') };
}
function blockHtml(n, v, ghost) {
  var idx = S.idx, kc = idx.children(n.id).length, st = v.status || n.status, pr = v.progress != null ? v.progress : n.progress, meta = [], top = portTop(n);
  if (kc) meta.push('▸ ' + FA(kc) + ' زیرمجموعه');
  if (n.flow && n.flow.nodes && n.flow.nodes.length) meta.push('⎇ فلوچارت');
  if (n.src_name) meta.push('📚 ' + esc(n.src_name));
  var t = nodeTime(n.id); if (t >= 60) meta.push('⏱ ' + fmtDur(t));
  var sm = portStateMap(n), pcls = function (side, p) { var st = sm[side + ':' + p.name]; return st === 'unused' ? ' unused' : (st === 'none' || st === 'dangling' ? ' warn' : ''); };
  var pi = (n.inputs || []).slice(0, 8).map(function (p, i) { return '<span class="bk-pi' + pcls('in', p) + '" style="top:' + (top + i * 22) + 'px" title="' + esc([p.name, p.desc, p.use].filter(Boolean).join(' — ')) + '">' + esc(p.name) + '</span>'; }).join('');
  var po = (n.outputs || []).slice(0, 8).map(function (p, i) { return '<span class="bk-po' + pcls('out', p) + '" style="top:' + (top + i * 22) + 'px" title="' + esc([p.name, p.desc, p.use].filter(Boolean).join(' — ')) + '">' + esc(p.name) + '</span>'; }).join('');
  return '<div class="bk kk-' + n.kind + ' st-' + st + '"><div class="bk-h"><span class="bk-i">' + esc(n.icon || KIND_ICON[n.kind]) + '</span><span class="bk-k">' + E.KIND[n.kind] + (ghost ? ' · بیرونی' : '') + '</span>' +
    '<span class="bk-s">' + (v.crit && S.crit ? '<b class="crit">بحرانی</b> ' : '') + E.STATUS[st] + '</span></div><div class="bk-t" title="' + esc(n.title + (n.summary ? ' — ' + n.summary : '')) + '">' + esc(n.title) + '</div>' + pi + po +
    '<div class="bk-m">' + (meta.join(' · ') || '&nbsp;') + '</div><div class="bk-p"><i style="width:' + pr + '%"></i></div></div>';
}
/* چیدمانِ لایه‌ای (پیش‌نیازها راست، پس‌نیازها چپ) برای بلوک‌هایی که هنوز جایگاهِ ثبت‌شده ندارند */
function autoLayout(kids, edges, dims) {
  var preds = {}; kids.forEach(function (k) { preds[k] = []; });
  edges.forEach(function (e) { if (preds[e.b] && preds[e.a]) preds[e.b].push(e.a); });
  var layer = {}, vis = {};
  function lay(n) { if (layer[n] != null) return layer[n]; if (vis[n]) return 0; vis[n] = 1; var m = 0; preds[n].forEach(function (p) { m = Math.max(m, lay(p) + 1); }); vis[n] = 0; layer[n] = m; return m; }
  kids.forEach(lay);
  var cols = {}; kids.forEach(function (k) { (cols[layer[k]] = cols[layer[k]] || []).push(k); });
  var pos = {}, GX = 120, GY = 40, xoff = 0, ks = Object.keys(cols).map(Number).sort(function (a, b) { return a - b; });
  var colH = {}; ks.forEach(function (c) { colH[c] = cols[c].reduce(function (s, k) { return s + dims[k].h; }, 0) + (cols[c].length - 1) * GY; });
  var H = Math.max.apply(null, ks.map(function (c) { return colH[c]; }).concat([0]));
  ks.forEach(function (c) {
    var list = cols[c], w = Math.max.apply(null, list.map(function (k) { return dims[k].w; })), y = (H - colH[c]) / 2;
    xoff += w; list.forEach(function (k) { pos[k] = { x: -xoff + (w - dims[k].w) / 2, y: y }; y += dims[k].h + GY; }); xoff += GX;
  });
  return pos;
}
function mapModel(forceAuto) {
  var idx = S.idx, sch = S.sch, focus = S.focus, fchain = focus ? idx.chain(focus) : [], kids = idx.children(focus);
  function resolve(e) {
    var ch = idx.chain(e);
    if (focus) {
      if (ch.indexOf(focus) >= 0) return ch.length > fchain.length ? { card: ch[fchain.length] } : null;
      var p = 0; while (p < ch.length && p < fchain.length && ch[p] === fchain[p]) p++;
      return p < ch.length ? { ghost: ch[p] } : null;
    }
    return { card: ch[0] };
  }
  var edges = {}, ghosts = {};
  S.P.deps.forEach(function (d) {
    if (!idx.byId.has(d.from_id) || !idx.byId.has(d.to_id)) return;
    var a = resolve(d.from_id), b = resolve(d.to_id); if (!a || !b) return;
    var A, B, ea = a.card || a.ghost, eb = b.card || b.ghost;
    if (a.card && b.card) { if (a.card === b.card) return; A = String(a.card); B = String(b.card); }
    else if (a.ghost && b.card) { A = 'g' + a.ghost; B = String(b.card); ghosts[a.ghost] = 'in'; }
    else if (a.card && b.ghost) { A = String(a.card); B = 'g' + b.ghost; ghosts[b.ghost] = ghosts[b.ghost] || 'out'; }
    else return;
    var exact = ea === d.from_id && eb === d.to_id, k = exact ? A + '>' + B + '>' + d.id : A + '>' + B;
    var e = edges[k] = edges[k] || { a: A, b: B, labels: [], real: null, src: ea, both: false };
    if (exact) e.real = d; else { if (d.label && e.labels.indexOf(d.label) < 0) e.labels.push(d.label); if (d.two) e.both = true; }
  });
  /* رفت و برگشتِ لایه‌ای (A→B و B→A) یک پیوندِ دوطرفه می‌شود */
  Object.keys(edges).forEach(function (k) { var e = edges[k]; if (e.real || e.dead) return; var rk = e.b + '>' + e.a, r = edges[rk]; if (r && !r.real && !r.dead) { e.both = true; r.dead = true; r.labels.forEach(function (l) { if (e.labels.indexOf(l) < 0) e.labels.push(l); }); } });
  Object.keys(edges).forEach(function (k) { if (edges[k].dead) delete edges[k]; });
  var kidIds = kids.map(String), dims = {};
  kids.forEach(function (id) { dims[String(id)] = blockDims(idx.byId.get(id)); });
  var auto = autoLayout(kidIds, Object.keys(edges).map(function (k) { return edges[k]; }), dims);
  var items = [], minx = 1e9, maxx = -1e9, miny = 1e9;
  kids.forEach(function (id) {
    var n = idx.byId.get(id), v = sch.info.get(id) || {}, a = auto[String(id)], d = dims[String(id)];
    var x = n.x != null && !forceAuto ? n.x : a.x, y = n.y != null && !forceAuto ? n.y : a.y;
    minx = Math.min(minx, x); maxx = Math.max(maxx, x + d.w); miny = Math.min(miny, y);
    items.push({ id: String(id), x: x, y: y, w: d.w, h: d.h, shape: 'card', cls: 'kk-' + n.kind, color: nodeColor(n), html: blockHtml(n, v), text: n.title, node: n, ports: blockPorts(n) });
  });
  var gi = 0, go = 0;
  Object.keys(ghosts).forEach(function (g) {
    var n = idx.byId.get(+g), v = sch.info.get(+g) || {}, inn = ghosts[g] === 'in', d = blockDims(n), yy = miny + (inn ? gi++ : go++) * (d.h + 36);
    items.push({ id: 'g' + g, x: inn ? maxx + 140 : minx - d.w - 140, y: yy, w: d.w, h: d.h, shape: 'card', cls: 'kk-' + n.kind, color: nodeColor(n), html: blockHtml(n, v, true), text: n.title, ghost: true, node: n, ports: blockPorts(n) });
  });
  /* ورودی‌های بخشِ بازشده سمتِ راست، خروجی‌هایش سمتِ چپ (با وضعیتِ هدف)؛ برای وصل‌کردن به زیرمجموعه‌ها */
  var railLinks = [];
  if (focus && idx.byId.get(focus).kind !== 'task') {
    var F = idx.byId.get(focus), fsm = portStateMap(F), ex0 = 1e9, ex1 = -1e9, ysum = 0, cnt = 0, RH = 86, RG = 22;
    items.forEach(function (it) { ex0 = Math.min(ex0, it.x); ex1 = Math.max(ex1, it.x + it.w); ysum += it.y + it.h / 2; cnt++; });
    if (!cnt) { ex0 = 0; ex1 = 320; ysum = 140; cnt = 1; }
    var ymid = ysum / cnt, mk = function (side, list, x) {
      var total = list.length + (S.editing ? 1 : 0), y0 = ymid - (total * RH + (total - 1) * RG) / 2;
      list.forEach(function (p, i) {
        var st = fsm[side + ':' + p.name] || 'none', warn = st === 'none' || st === 'dangling';
        var pt = { name: p.name, y: RH / 2, unused: st === 'unused', warn: warn, tip: E.PORT_MSG[st] || '' };
        items.push({ id: (side === 'in' ? 'bi:' : 'bo:') + p.name, x: x, y: y0 + i * (RH + RG), w: 250, h: RH, shape: 'card', cls: 'rail rail-' + side, color: side === 'in' ? '#1f9d63' : '#e0912b', text: p.name, fixed: true, noColor: true, noEdit: true, noDelete: true,
          rail: { side: side, name: p.name }, ports: side === 'in' ? { 'in': [], out: [pt] } : { 'in': [pt], out: [] },
          html: '<div class="rl st-' + st + '"><div class="rl-h">' + (side === 'in' ? '⇢ ورودیِ «' : '⇠ خروجیِ «') + esc(F.title) + '»</div><div class="rl-n" title="' + esc([p.name, p.desc, p.use].filter(Boolean).join(' — ')) + '">' + esc(p.name) + '</div><div class="rl-s">' + E.PORT_MSG[st] + (st === 'unused' && p.why ? ': ' + esc(p.why) : '') + '</div></div>' });
      });
      if (S.editing) items.push({ id: 'badd:' + side, x: x, y: y0 + list.length * (RH + RG), w: 250, h: 54, shape: 'card', cls: 'rail rail-add', color: '#64748b', text: '', fixed: true, noColor: true, noEdit: true, noDelete: true, act: function () { portDialog(focus, side === 'in' ? 'inputs' : 'outputs'); },
        html: '<div class="rl-add">＋ ' + (side === 'in' ? 'ورودیِ تازه برای این ' : 'خروجیِ تازه برای این ') + E.KIND[F.kind] + '</div>' });
    };
    mk('in', F.inputs || [], ex1 + 190); mk('out', F.outputs || [], ex0 - 190 - 250);
    S.P.deps.forEach(function (d) {
      if (d.bnd === 'in' && d.from_id === focus && idx.byId.has(d.to_id) && idx.parentOf(d.to_id) === focus && items.some(function (i) { return i.id === 'bi:' + d.out_name; }))
        railLinks.push({ id: 'd' + d.id, from: 'bi:' + d.out_name, to: String(d.to_id), fromPort: d.out_name, toPort: d.in_name || null, label: d.label || '', color: '#1f9d63', dep: d, noFlip: true });
      else if (d.bnd === 'out' && d.to_id === focus && idx.byId.has(d.from_id) && idx.parentOf(d.from_id) === focus && items.some(function (i) { return i.id === 'bo:' + d.in_name; }))
        railLinks.push({ id: 'd' + d.id, from: String(d.from_id), to: 'bo:' + d.in_name, fromPort: d.out_name || null, toPort: d.in_name, label: d.label || '', color: '#e0912b', dep: d, noFlip: true });
    });
  }
  var links = Object.keys(edges).map(function (k) {
    var e = edges[k], sn = idx.byId.get(e.src), col = sn ? nodeColor(sn) : null, d = e.real;
    if (d) {
      var lab = d.label || (d.out_name && d.in_name ? d.out_name + ' ← ' + d.in_name : (d.out_name || d.in_name || ''));
      return { id: 'd' + d.id, from: e.a, to: e.b, fromPort: d.out_name || null, toPort: d.in_name || null, label: lab, color: col, dep: d, both: !!d.two };
    }
    return { id: 'a' + k, from: e.a, to: e.b, label: e.labels.join('، '), color: col, dashed: true, locked: true, both: e.both };
  });
  return { items: items, links: links.concat(railLinks), kids: kids };
}

function toolBtn(kind, label, icon, allowed, armed) {
  var off = !S.editing || !allowed;
  return '<button class="tool' + (armed ? ' armed' : '') + (off ? ' off' : '') + '" data-act="tool" data-kind="' + kind + '"' + (off ? ' data-off="1"' : '') + ' style="--tc:' + (KCOL[kind] || '#14a3a3') + '" title="' + (allowed ? (S.editing ? esc(KIND_HINT[kind] || label) : 'برای ساختن، اول «ویرایش» را بزنید') : 'در این سطح مجاز نیست') + '"><span class="tool-i">' + icon + '</span><span>' + label + '</span></button>';
}
function mapView() {
  var idx = S.idx, focus = S.focus, node = focus ? idx.byId.get(focus) : null, fchain = focus ? idx.chain(focus) : [];
  var rootName = isLib() ? '📚 کتابخانه' : '🏠 ریشهٔ پروژه';
  var crumbs = '<a data-act="focus" data-id="0">' + rootName + '</a>' + fchain.map(function (id) { var n = idx.byId.get(id); return '<span class="mut">›</span><a data-act="focus" data-id="' + id + '">' + (n.icon || KIND_ICON[n.kind]) + ' ' + esc(n.title) + '</a>'; }).join('');
  if (node && node.kind === 'task') return '<div class="crumbs">' + crumbs + '</div>' + taskPage(node);
  var ck = childKinds(focus);
  var tools = '<div class="mtools"><span class="mt-lbl">ابزارها:</span>' + ['area', 'section', 'module', 'task'].map(function (k) { return toolBtn(k, E.KIND[k], KIND_ICON[k], ck.indexOf(k) >= 0, S.tool === k); }).join('') +
    toolBtn('lib', 'از کتابخانه', '📚', ck.indexOf('module') >= 0, S.tool === 'lib') +
    '<span class="grow"></span>' + (focus && node && node.kind !== 'task' && ((node.inputs || []).length || (node.outputs || []).length) ? '<button class="btn sm" data-act="wirenames"' + (S.editing ? '' : ' disabled') + ' title="هر ورودی/خروجیِ ماژول به زیرمجموعه‌ای که ورودی/خروجیِ هم‌نام دارد وصل شود">🔗 وصلِ خودکارِ هم‌نام‌ها</button>' : '') + '<button class="btn sm" data-act="maplayout"' + (S.editing ? '' : ' disabled') + ' title="چیدمانِ خودکار بر پایهٔ وابستگی">✨ چیدمان خودکار</button><button class="btn sm" data-act="mapzoom" data-v="out">－</button><button class="btn sm" data-act="mapzoom" data-v="fit">جا بده</button><button class="btn sm" data-act="mapzoom" data-v="in">＋</button>' +
    (focus ? '<button class="btn sm" data-act="pick" data-id="' + focus + '">📝 جزئیاتِ این بخش</button>' : '') + '</div>';
  var rule = '<div class="rule">' + (node ? KIND_ICON[node.kind] + ' ' + E.KIND[node.kind] + ': ' : '🏠 سطحِ اصلی: ') + (ck.length ? 'اینجا می‌توانید بسازید ← ' + ck.map(function (k) { return KIND_ICON[k] + ' ' + E.KIND[k]; }).join('، ') : 'هیچ زیرمجموعه‌ای مجاز نیست') +
    (S.editing ? '' : ' <span class="pill s st-hold">حالتِ مشاهده — برای تغییر «✎ ویرایش» را بزنید</span>') + '</div>';
  var tip = idx.children(focus).length ? '' : '<div class="cv-hint">' + (S.editing ? 'بوم خالی است.<br>یک ابزار را از نوارِ بالا بردارید و روی بوم کلیک کنید (یا بکشید و رها کنید).' : 'اینجا هنوز چیزی نیست.<br>برای ساختن «✎ ویرایش» را بزنید.') + '</div>';
  return '<div class="crumbs">' + crumbs + '</div>' + tools + rule + '<div class="cvwrap"><div id="cvhost" class="cvhost' + (S.tool ? ' armed' : '') + '"></div>' + tip + '</div>' +
    '<p class="mut sm">دوبار کلیک روی بلوک = بازکردنِ زیرمجموعه · از دایره‌های کنارِ بلوک (سبز = ورودی، نارنجی = خروجی) بکشید و روی دایرهٔ بلوکِ دیگر رها کنید = اتصالِ خروجی به ورودی · ' +
    'کلیک روی بلوک/پیکان = رنگ و ابزار · چرخ ماوس = زوم · کشیدنِ پس‌زمینه = جابه‌جایی · Shift+کشیدن = انتخابِ چندتایی. خط‌ها از میانِ بلوک‌ها رد نمی‌شوند.</p>';
}
function rawId(id) { return +String(id).replace(/^g/, ''); }
function createBlock(pt, kind, srcId, srcPort) {
  var ck = childKinds(S.focus || 0); kind = kind || ck[0];
  if (ck.indexOf(kind) < 0) return toast('«' + E.KIND[kind] + '» در این سطح مجاز نیست', true);
  var d = KSIZE[kind];
  return api('node_save', { project_id: S.pid, title: 'بلوک جدید', kind: kind, parent_id: S.focus || null, x: Math.round(pt.x - d.w / 2), y: Math.round(pt.y - d.h / 2) }).then(function (r) {
    var p = srcId ? api('dep_save', { project_id: S.pid, from_id: srcId, to_id: r.id, label: '', out_name: srcPort || '' }) : Promise.resolve();
    return p.then(function () { S.sel = r.id; S.pendingRename = r.id; S.tool = null; return reload(); });
  });
}
function mountMap() {
  var host = $('#cvhost'); if (!host) return;
  var key = String(S.focus), m = mapModel(), fresh = !S.cvView[key];
  var cv = S.cv = PMCanvas.create(host, { id: 'map', view: S.cvView[key], readonly: !S.editing,
    onView: function (v) { S.cvView[key] = v; },
    onPortClick: function (it, side, name) { if (it.rail) return portDialog2(S.focus, it.rail.side, it.rail.name); if (String(it.id).indexOf('badd:') === 0) return; portDialog2(rawId(it.id), side, name); },
    onSelect: function (it, lk) {
      if (it && it.act) { cv.select([]); it.act(); return; }
      if (it && it.rail) { cv.select([]); portDialog2(S.focus, it.rail.side, it.rail.name); return; }
      var id = it ? rawId(it.id) : 0; if (id !== S.sel && !lk) { S.sel = id; if (!id) S.drawerOpen = false; renderDrawer(); updStatus(); refreshMenu(); } },
    onMove: function (list) {
      var items = list.map(function (x) { var n = S.idx.byId.get(+x.id); if (n) { n.x = x.x; n.y = x.y; } return { id: +x.id, x: x.x, y: x.y }; });
      api('nodes_bulk', { project_id: S.pid, items: items }).catch(fail);
    },
    onAdd: guard(function (pt) { var ck = childKinds(S.focus || 0); if (!ck.length) return; return createBlock(pt, S.tool && S.tool !== 'lib' ? S.tool : (ck.indexOf('module') >= 0 ? 'module' : ck[0])); }),
    onPlace: guard(function (tool, pt) { if (tool === 'lib') { return libPicker(function (mod) { return insertFromLib(mod.id, pt); }); } return createBlock(pt, tool); }),
    onDisarm: function () { S.tool = null; cv.arm(null); renderContent(true); },
    onConnectNew: guard(function (src, pt, port) { if (src.rail) return toast('از ورودیِ ماژول فقط به ورودیِ یک زیرمجموعه وصل کنید (روی دایرهٔ ورودیِ بلوک رها کنید)', true); var ck = childKinds(S.focus || 0); if (!ck.length) return; return createBlock(pt, ck.indexOf('module') >= 0 ? 'module' : ck[0], rawId(src.id), port); }),
    onConnect: guard(function (a, b, pa, pb) {
      if (a.rail || b.rail || String(a.id).indexOf('badd') === 0 || String(b.id).indexOf('badd') === 0) return connectRails(a, b, pa, pb);
      var f = rawId(a.id), t = rawId(b.id);
      return api('dep_save', { project_id: S.pid, from_id: f, to_id: t, label: '', out_name: pa || '', in_name: pb || '' }).then(function () { return loadProject(S.pid); }).then(function () {
        var d = S.P.deps.filter(function (x) { return x.from_id === f && x.to_id === t && (x.out_name || '') === (pa || '') && (x.in_name || '') === (pb || ''); })[0];
        if (d && !pa && !pb) S.pendingLink = 'd' + d.id; render(true);
      });
    }),
    onRename: guard(function (it, text) { text = (text || '').trim(); if (!text || text === it.node.title) return; return api('node_save', { project_id: S.pid, id: rawId(it.id), title: text }).then(reload); }),
    onColor: guard(function (it, c) { var n = it.node; n.color = c; var p = api('node_save', { project_id: S.pid, id: n.id, color: c || '' }); var mm = mapModel(); S.cv.setData(mm.items, mm.links, true); return p; }),
    onDelete: guard(function (ids) {
      if (!ids.length) return;
      var extra = 0; ids.forEach(function (i) { extra += S.idx.descendants(rawId(i)).length; });
      if (!confirm(FA(ids.length) + ' بلوک' + (extra ? ' و ' + FA(extra) + ' زیرمجموعه‌شان' : '') + ' (با گزارش‌ها و پیوست‌ها) پاک شود؟')) return;
      return Promise.all(ids.map(function (i) { return api('node_delete', { project_id: S.pid, id: rawId(i) }); })).then(function () { S.sel = 0; return reload(); });
    }),
    onOpen: function (it) { if (it.rail || it.act) return; var id = rawId(it.id); S.sel = id; S.focus = it.ghost ? S.idx.parentOf(id) : id; renderContent(); renderDrawer(); updStatus(); },
    onLinkLabel: guard(function (l, text) { if (!l.dep) return; return api('dep_save', { project_id: S.pid, from_id: l.dep.from_id, to_id: l.dep.to_id, label: text, out_name: l.dep.out_name || '', in_name: l.dep.in_name || '', two: !!l.dep.two }).then(reload); }),
    onLinkDelete: guard(function (l) { if (!l.dep) return; return api('dep_delete', { project_id: S.pid, id: l.dep.id }).then(reload); }),
    onLinkBoth: guard(function (l) { var d = l.dep; if (!d) return; return api('dep_save', { project_id: S.pid, from_id: d.from_id, to_id: d.to_id, label: d.label, out_name: d.out_name || '', in_name: d.in_name || '', two: !d.two }).then(reload); }),
    onLinkReverse: guard(function (l) { var d = l.dep; if (!d) return; return api('dep_delete', { project_id: S.pid, id: d.id }).then(function () { return api('dep_save', { project_id: S.pid, from_id: d.to_id, to_id: d.from_id, label: d.label, out_name: d.in_name || '', in_name: d.out_name || '', two: !!d.two }); }).then(reload); }),
    readActions: function (it) { if (!it.node) return []; var id = rawId(it.id), n = it.node, a = [{ icon: '📝', title: 'جزئیات', fn: function () { S.sel = id; S.drawerOpen = true; renderDrawer(); } }];
      a.push({ icon: n.kind === 'task' ? '📄' : '⤵', title: n.kind === 'task' ? 'باز کردنِ صفحهٔ کار' : 'باز کردنِ زیرمجموعه', fn: function () { S.sel = id; S.focus = id; renderContent(); renderDrawer(); } });
      if (n.kind === 'module') a.push({ icon: '📤', title: 'ذخیره در کتابخانه (رونوشت)', fn: function () { saveToLib(id); } }); return a; },
    itemActions: function (it) {
      if (!it.node) return [];
      var id = rawId(it.id), n = it.node, a = [{ icon: '📝', title: 'جزئیات و ویرایش', fn: function () { S.sel = id; S.drawerOpen = true; renderDrawer(); } },
        { icon: n.kind === 'task' ? '📄' : '⤵', title: n.kind === 'task' ? 'باز کردنِ صفحهٔ کار' : 'باز کردنِ زیرمجموعه', fn: function () { S.sel = id; S.focus = id; renderContent(); renderDrawer(); } },
        { icon: '🙂', title: 'آیکن', fn: function () { iconDialog(id); } },
        { icon: '⇢', title: 'افزودنِ ورودی', fn: function () { portDialog(id, 'inputs'); } }, { icon: '⇠', title: 'افزودنِ خروجی', fn: function () { portDialog(id, 'outputs'); } },
        { icon: '⎇', title: 'فلوچارت', fn: function () { ACTS.flowedit(null, null, id); } }];
      if (S.idx.parentOf(id)) a.splice(2, 0, { icon: '🔗', title: 'اتصالِ خودکار به ورودی/خروجی‌های ماژولِ بیرونی', fn: function () { autoWireDialog(id); } });
      if (childKinds(id).length) a.splice(2, 0, { icon: '＋', title: 'افزودنِ زیربخش داخلِ این بلوک', fn: function () { addNodeDialog(id); } });
      if (n.kind === 'module') a.push({ icon: '📤', title: 'ذخیره در کتابخانه', fn: function () { saveToLib(id); } });
      return a;
    } });
  cv.setData(m.items, m.links);
  if (S.tool) cv.arm(S.tool);
  if (fresh) cv.fit();
  var sid = S.pendingRename || S.sel;
  if (sid && m.items.some(function (i) { return i.id === String(sid); })) cv.select([String(sid)]);
  if (S.pendingRename) { var pr = S.pendingRename; S.pendingRename = 0; setTimeout(function () { cv.edit(String(pr)); }, 60); }
  if (S.pendingLink) { var pl = S.pendingLink; S.pendingLink = ''; cv.select([], pl); setTimeout(function () { cv.editLabel(pl); }, 60); }
}
function flowPorts(n) {
  var F = n.parent_id ? S.idx.byId.get(n.parent_id) : null, via = { 'in': {}, out: {} };
  S.P.deps.forEach(function (d) {
    if (d.bnd === 'in' && d.to_id === n.id && d.in_name) via['in'][d.in_name] = d.out_name;
    if (d.bnd === 'out' && d.from_id === n.id && d.out_name) via.out[d.out_name] = d.in_name;
  });
  var dec = function (list, side) { return (list || []).map(function (p) { var q = Object.assign({}, p); q.via = via[side][p.name] ? (side === 'in' ? 'از ورودیِ «' : 'به خروجیِ «') + (F ? F.title : 'ماژول') + '»: ' + via[side][p.name] : ''; return q; }); };
  return { inputs: dec(n.inputs, 'in'), outputs: dec(n.outputs, 'out') };
}
function iconDialog(id) {
  modal({ title: 'آیکنِ بلوک', noOk: true, body: '<div class="icons">' + ICONS.map(function (e) { return '<button type="button" class="btn ic" data-e="' + e + '">' + e + '</button>'; }).join('') + '<button type="button" class="btn ic" data-e="">∅</button></div><label class="f"><span>یا خودتان بنویسید (یک ایموجی)</span><input name="own" maxlength="4"></label>',
    setup: function (f, close) {
      function set(e) { return api('node_save', { project_id: S.pid, id: id, icon: e }).then(function () { close(); return reload(); }).catch(fail); }
      $$('.ic', f).forEach(function (b) { b.addEventListener('click', function () { set(b.getAttribute('data-e')); }); });
      $('[name=own]', f).addEventListener('change', function (e) { set(e.target.value.trim()); });
    } });
}
/* جزئیاتِ یک ورودی/خروجی: تعریفِ ماژول، کاربردِ همین‌جا، «بدون استفاده» و وضعیتِ فلوچارت */
function portDialog2(id, side, name) {
  var n = S.idx.byId.get(id); if (!n) return;
  var field = side === 'in' ? 'inputs' : 'outputs', list = n[field] || [], p = list.filter(function (x) { return x.name === name; })[0]; if (!p) return;
  var st = E.portStatus(n, S.P.deps).filter(function (x) { return x.side === side && x.name === name; })[0], ed = S.editing, dis = ed ? '' : ' disabled';
  var lbl = side === 'in' ? 'ورودی' : 'خروجی';
  modal({ title: (side === 'in' ? '⇢ ' : '⇠ ') + lbl + ' «' + name + '» — ' + n.title, noFocus: true, noOk: !ed, ok: '💾 ثبت',
    body: '<div class="ps ' + st.state + '" style="margin-bottom:10px"><span class="ps-t">' + E.PORT_MSG[st.state] + '</span></div>' +
      (n.src_name ? '<p class="sm mut">این بخش رونوشتی از ماژولِ کتابخانهٔ «' + esc(n.src_name) + '» است؛ «تعریف» از خودِ ماژول آمده و «کاربردِ اینجا» فقط برای همین استفاده است.</p>' : '') +
      '<label class="f"><span>نامِ ' + lbl + (ed ? ' (با تغییرِ نام، پیوندها و فلوچارت هم هماهنگ می‌شوند)' : '') + '</span><input name="pname" value="' + esc(p.name) + '"' + dis + '></label>' +
      '<label class="f"><span>تعریف در خودِ ماژول (' + lbl + ' چیست / چه قالبی دارد)</span><textarea name="desc"' + dis + '>' + esc(p.desc || '') + '</textarea></label>' +
      '<label class="f"><span>کاربردِ آن در همین جا (اختصاصیِ این استفاده از ماژول)</span><textarea name="use"' + dis + ' placeholder="' + (side === 'in' ? 'مثلاً: اینجا ایمیلِ مشتری به آن داده می‌شود' : 'مثلاً: خروجی به ماژولِ سفارش می‌رود') + '">' + esc(p.use || '') + '</textarea></label>' +
      '<label class="row" style="margin-bottom:6px"><input type="checkbox" name="unused"' + (p.unused ? ' checked' : '') + dis + '> ✗ این ' + lbl + ' در اینجا استفاده نمی‌شود</label>' +
      '<label class="f"><span>دلیل (لازم است اگر استفاده نمی‌شود)</span><input name="why" value="' + esc(p.why || '') + '"' + dis + '></label>' +
      '<div class="row"><button type="button" class="btn" data-fl>⎇ رفتن به فلوچارت (تعریفِ پردازش)</button></div>' +
      (ed ? '' : '<p class="mut sm">برای تغییر «✎ ویرایش» را بزنید.</p>'),
    setup: function (f, close) { $('[data-fl]', f).addEventListener('click', function () { close(); ACTS.flowedit(null, null, id); }); },
    onok: function (f) {
      var un = $('[name=unused]', f).checked, why = $('[name=why]', f).value.trim();
      if (un && !why) { toast('برای «بدون استفاده» دلیل بنویسید', true); return false; }
      var nn = $('[name=pname]', f).value.trim(); if (!nn) { toast('نام نمی‌تواند خالی باشد', true); return false; }
      var nl = list.map(function (x) { return x.name === name ? { name: nn, desc: $('[name=desc]', f).value, use: $('[name=use]', f).value, unused: un, why: un ? why : '' } : x; });
      var body = { project_id: S.pid, id: id }; body[field] = nl;
      var ren = nn !== name ? api('port_rename', { project_id: S.pid, node_id: id, side: side, old: name, 'new': nn }) : Promise.resolve();
      return ren.then(function () { return api('node_save', body); }).then(reload);
    } });
}

/* افزودنِ ورودی/خروجی (برای «کار» فقط یکی) */
function portDialog(id, field) {
  var n = S.idx.byId.get(id), list = (n[field] || []).slice(), single = n.kind === 'task', lbl = field === 'inputs' ? 'ورودی' : 'خروجی', cur = single && list[0] ? list[0] : { name: '', desc: '' };
  modal({ title: (single && list[0] ? 'ویرایشِ ' : 'افزودنِ ') + lbl, body: '<label class="f"><span>نامِ ' + lbl + '</span><input name="name" value="' + esc(cur.name) + '" required></label><label class="f"><span>توضیح / قالبِ داده (اختیاری)</span><input name="desc" value="' + esc(cur.desc) + '"></label>' +
    (single ? '<p class="mut sm">«کار» فقط یک ' + lbl + ' دارد.</p>' : ''),
    onok: function (f) {
      var it = { name: $('[name=name]', f).value.trim(), desc: $('[name=desc]', f).value.trim(), use: (single && list[0] && list[0].use) || '', unused: !!(single && list[0] && list[0].unused), why: (single && list[0] && list[0].why) || '' }; if (!it.name) return false;
      if (single) list = [it]; else list.push(it);
      var body = { project_id: S.pid, id: id }; body[field] = list;
      return api('node_save', body).then(reload);
    } });
}

/* اتصالِ ورودی/خروجیِ ماژول به زیرمجموعه‌اش (پیوندِ مرزی) */
function connectRails(a, b, pa, pb) {
  var F = S.focus, ra = a.rail, rb = b.rail;
  if (ra && ra.side === 'in' && !rb && !b.ghost && String(b.id).indexOf('badd') !== 0)
    return api('dep_save', { project_id: S.pid, from_id: F, to_id: rawId(b.id), out_name: ra.name, in_name: pb || '', bnd: 'in' }).then(reload);
  if (rb && rb.side === 'out' && !ra && !a.ghost && String(a.id).indexOf('badd') !== 0)
    return api('dep_save', { project_id: S.pid, from_id: rawId(a.id), to_id: F, out_name: pa || '', in_name: rb.name, bnd: 'out' }).then(reload);
  toast('ورودیِ ماژول فقط به ورودیِ یک زیرمجموعه و خروجیِ یک زیرمجموعه فقط به خروجیِ ماژول وصل می‌شود', true);
}
function autoWireByName() {
  if (!needEdit()) return;
  var F = S.idx.byId.get(S.focus); if (!F) return;
  var reqs = [], has = function (d) { return S.P.deps.some(function (x) { return x.bnd === d.bnd && x.from_id === d.from_id && x.to_id === d.to_id && (x.out_name || '') === d.out_name && (x.in_name || '') === d.in_name; }); };
  S.idx.children(S.focus).forEach(function (cid) {
    var c = S.idx.byId.get(cid);
    (F.inputs || []).forEach(function (p) { (c.inputs || []).forEach(function (q) { if (q.name === p.name) { var d = { bnd: 'in', from_id: F.id, to_id: cid, out_name: p.name, in_name: q.name }; if (!has(d)) reqs.push(d); } }); });
    (F.outputs || []).forEach(function (p) { (c.outputs || []).forEach(function (q) { if (q.name === p.name) { var d = { bnd: 'out', from_id: cid, to_id: F.id, out_name: q.name, in_name: p.name }; if (!has(d)) reqs.push(d); } }); });
  });
  if (!reqs.length) return toast('هم‌نامِ تازه‌ای برای وصل‌کردن پیدا نشد');
  return Promise.all(reqs.map(function (d) { return api('dep_save', { project_id: S.pid, from_id: d.from_id, to_id: d.to_id, out_name: d.out_name, in_name: d.in_name, bnd: d.bnd }); })).then(function () { toast(FA(reqs.length) + ' اتصال ساخته شد'); return reload(); });
}
/* انتخابِ خودکار: کدام ورودی/خروجی‌های ماژولِ بیرونی مربوط به این زیرمجموعه است؟ */
function autoWireDialog(childId) {
  if (!needEdit()) return;
  var idx = S.idx, C = idx.byId.get(childId), Fid = idx.parentOf(childId);
  if (!Fid) return toast('این بخش در سطحِ اصلی است و ماژولِ بیرونی ندارد', true);
  var F = idx.byId.get(Fid), single = C.kind === 'task', deps = S.P.deps;
  var curIn = {}, curOut = {};
  deps.forEach(function (d) { if (d.bnd === 'in' && d.from_id === Fid && d.to_id === childId) curIn[d.out_name] = d; if (d.bnd === 'out' && d.to_id === Fid && d.from_id === childId) curOut[d.in_name] = d; });
  var row = function (type, grp, p, checked) { return '<label class="aw"><input type="' + type + '" name="' + grp + '" value="' + esc(p.name) + '"' + (checked ? ' checked' : '') + '> <b>' + esc(p.name) + '</b> <span class="mut sm">' + esc(p.desc || '') + '</span></label>'; };
  var inRows = (F.inputs || []).map(function (p) { return row(single ? 'radio' : 'checkbox', 'ain', p, !!curIn[p.name]); }).join('');
  var outRows = (F.outputs || []).map(function (p) { return row(single ? 'radio' : 'checkbox', 'aout', p, !!curOut[p.name]); }).join('');
  if (!inRows && !outRows) return toast('ماژولِ «' + F.title + '» هنوز ورودی/خروجی ندارد؛ اول در بالا (ریل‌های راست/چپ) تعریف کنید', true);
  modal({ title: '🔗 اتصالِ خودکار — ' + C.title, cls: 'wide', ok: 'اتصال', noFocus: true,
    body: '<p class="mut sm">کدام ورودی/خروجی‌های «' + esc(F.title) + '» (بیرون) به «' + esc(C.title) + '» مربوط‌اند؟ ' + (single ? '«کار» فقط یک ورودی و یک خروجی دارد؛ اگر تعریف نشده باشد از روی انتخابِ شما ساخته می‌شود.' : 'اگر بخش ورودی/خروجیِ هم‌نام نداشته باشد ساخته می‌شود.') + '</p>' +
      '<div class="two"><div><h4>⇢ ورودیِ ماژول → ' + esc(C.title) + '</h4>' + (single ? '<label class="aw"><input type="radio" name="ain" value="" ' + (Object.keys(curIn).length ? '' : 'checked') + '> بدونِ اتصال</label>' : '') + (inRows || '<div class="mut sm">ورودی‌ای تعریف نشده</div>') + '</div>' +
      '<div><h4>⇠ ' + esc(C.title) + ' → خروجیِ ماژول</h4>' + (single ? '<label class="aw"><input type="radio" name="aout" value="" ' + (Object.keys(curOut).length ? '' : 'checked') + '> بدونِ اتصال</label>' : '') + (outRows || '<div class="mut sm">خروجی‌ای تعریف نشده</div>') + '</div></div>',
    onok: function (f) {
      var pick = function (grp) { return $$('[name=' + grp + ']:checked', f).map(function (e) { return e.value; }).filter(Boolean); };
      var wantIn = pick('ain'), wantOut = pick('aout'), inputs = (C.inputs || []).slice(), outputs = (C.outputs || []).slice(), changed = false;
      var ensure = function (list, fp, name) {
        var ex = list.filter(function (x) { return x.name === name; })[0];
        if (ex) return ex.name;
        if (single && list.length) return list[0].name;           // کار: همان تک‌ورودی/خروجیِ موجود
        list.push({ name: name, desc: fp.desc || '', use: '', unused: false, why: '' }); changed = true; return name;
      };
      var inMap = {}, outMap = {};
      wantIn.forEach(function (n) { var fp = (F.inputs || []).filter(function (x) { return x.name === n; })[0]; inMap[n] = ensure(inputs, fp, n); });
      wantOut.forEach(function (n) { var fp = (F.outputs || []).filter(function (x) { return x.name === n; })[0]; outMap[n] = ensure(outputs, fp, n); });
      var ops = [];
      if (changed) ops.push(api('node_save', { project_id: S.pid, id: childId, inputs: inputs, outputs: outputs }));
      Object.keys(curIn).forEach(function (n) { if (!inMap[n] || (curIn[n].in_name || '') !== inMap[n]) ops.push(api('dep_delete', { project_id: S.pid, id: curIn[n].id })); });
      Object.keys(curOut).forEach(function (n) { if (!outMap[n] || (curOut[n].out_name || '') !== outMap[n]) ops.push(api('dep_delete', { project_id: S.pid, id: curOut[n].id })); });
      return Promise.all(ops).then(function () {
        var adds = [];
        wantIn.forEach(function (n) { if (!curIn[n] || (curIn[n].in_name || '') !== inMap[n]) adds.push(api('dep_save', { project_id: S.pid, from_id: Fid, to_id: childId, out_name: n, in_name: inMap[n], bnd: 'in' })); });
        wantOut.forEach(function (n) { if (!curOut[n] || (curOut[n].out_name || '') !== outMap[n]) adds.push(api('dep_save', { project_id: S.pid, from_id: childId, to_id: Fid, out_name: outMap[n], in_name: n, bnd: 'out' })); });
        return Promise.all(adds);
      }).then(function () { toast('اتصال انجام شد'); return reload(); });
    } });
}

/* ---------- صفحهٔ «کار» (آخرین سطح) ---------- */
function ioBox(title, list, cls, n, side) {
  var p = list && list[0], st = p ? E.portStatus(n, S.P.deps).filter(function (x) { return x.side === side && x.name === p.name; })[0] : null;
  return '<div class="iobox ' + cls + '"><div class="io-h">' + title + '</div>' + (p ? '<div class="io-n">' + esc(p.name) + '</div><div class="mut sm">' + esc(p.desc || '') + '</div>' + (p.use ? '<div class="sm">📍 ' + esc(p.use) + '</div>' : '') +
    '<div class="ps ' + st.state + '" data-act="portdlg" data-id="' + n.id + '" data-side="' + side + '" data-name="' + esc(p.name) + '" style="cursor:pointer;margin-top:6px"><span class="ps-t">' + E.PORT_MSG[st.state] + (st.state === 'unused' && p.why ? ': ' + esc(p.why) : '') + '</span></div>' : '<div class="mut sm">تعریف نشده</div>') + '</div>';
}
function taskPage(n) {
  var files = S.P.files.filter(function (f) { return f.node_id === n.id; }), logs = S.P.logs.filter(function (l) { return l.node_id === n.id; }), v = S.sch.info.get(n.id) || {};
  var hasFlow = n.flow && n.flow.nodes && n.flow.nodes.length;
  return '<div class="task"><div class="task-h"><span class="bk-i">' + esc(n.icon || '✔️') + '</span><div class="grow"><h2>' + esc(n.title) + '</h2><div class="mut sm">' + esc(n.summary || '') + '</div></div>' + statusPill(n.status) +
    '<div style="width:140px">' + bar(n.progress) + '<div class="sm mut">' + FA(n.progress) + '٪ · ⏱ ' + fmtDur(nodeTime(n.id)) + '</div></div><button class="btn" data-act="pick" data-id="' + n.id + '">📝 ' + (S.editing ? 'ویرایشِ مشخصات' : 'مشخصات') + '</button></div>' +
    '<div class="io-row">' + ioBox('⇢ ورودی', n.inputs, 'in', n, 'in') + '<div class="io-arrow">⚙️<small>پردازش</small></div>' + ioBox('⇠ خروجی', n.outputs, 'out', n, 'out') + '</div>' +
    (n.details ? '<div class="card"><h2 class="sec">📄 توضیحات</h2><div class="pre">' + esc(n.details) + '</div></div>' : '') +
    (n.process ? '<div class="card"><h2 class="sec">⚙️ ورودی چطور به خروجی تبدیل می‌شود؟</h2><div class="pre">' + esc(n.process) + '</div></div>' : '') +
    '<div class="card"><h2 class="sec">⎇ فلوچارت <button class="btn sm" data-act="flowedit" data-id="' + n.id + '">' + (S.editing ? (hasFlow ? '✎ ویرایش' : '＋ رسم فلوچارت') : '🔍 بزرگ‌نمایی') + '</button></h2>' +
    (hasFlow ? '<div class="flthumb big" data-act="flowedit" data-id="' + n.id + '">' + FLOW.svg(n.flow, { width: '100%', height: 'auto', ink: 'currentColor' }) + '</div>' : '<div class="mut">فلوچارتی رسم نشده.</div>') + '</div>' +
    '<div class="card"><h2 class="sec">🖼️ تصویر و پیوست</h2>' + (filesHtml(files.filter(function (f) { return !f.log_id; })) || '<div class="mut sm">پیوستی نیست.</div>') +
    (S.editing ? '<div style="margin-top:8px"><input type="file" multiple data-chg="upnode" data-id="' + n.id + '"></div>' : '') + '</div>' +
    '<div class="card"><h2 class="sec">📝 یادداشت‌ها</h2>' + logForm(n.id) + '<div style="margin-top:10px">' + (logs.map(function (l) { return logHtml(l, false); }).join('') || '<div class="mut sm">هنوز یادداشتی نیست.</div>') + '</div></div></div>';
}

/* ---------- کتابخانهٔ ماژول‌ها ---------- */
function openLibrary() { return api('library').then(function (r) { location.hash = '#/p/' + r.id + '/map'; }); }
function libPicker(onPick) {
  return api('library_list').then(function (j) {
    var rows = j.modules.map(function (m) {
      return '<div class="libr" data-lid="' + m.id + '"><span class="libr-i">' + esc(m.icon || '🧩') + '</span><div class="grow"><b>' + esc(m.title) + '</b>' + (m.src_name ? ' <span class="pill">ارث از «' + esc(m.src_name) + '»</span>' : '') +
        '<div class="mut sm">' + esc(m.summary || '') + '</div><div class="sm">⇢ ' + FA((m.inputs || []).length) + ' ورودی: ' + esc((m.inputs || []).map(function (x) { return x.name; }).join('، ') || '—') + ' · ⇠ ' + FA((m.outputs || []).length) + ' خروجی: ' + esc((m.outputs || []).map(function (x) { return x.name; }).join('، ') || '—') + ' · ' + FA(m.children) + ' بخشِ داخلی</div></div>' +
        '<button type="button" class="btn pri sm" data-pick="' + m.id + '">درج</button></div>';
    }).join('');
    var mdl = modal({ title: '📚 ماژولی از کتابخانه انتخاب کنید', cls: 'wide', noOk: true, noFocus: true,
      body: rows ? '<div class="liblist">' + rows + '</div><p class="mut sm">با «درج»، یک رونوشتِ کامل (با زیرمجموعه و فلوچارت) در همین جایگاه ساخته می‌شود و می‌توانید برای این پروژه تغییرش دهید؛ منبع در بلوک نوشته می‌شود.</p>' : '<div class="empty">کتابخانه هنوز ماژولی ندارد.<br>در «ابزار ← کتابخانهٔ ماژول‌ها» بسازید، یا یک ماژولِ پروژه را «ذخیره در کتابخانه» کنید.</div>',
      setup: function (f, close) { $$('[data-pick]', f).forEach(function (b) { b.addEventListener('click', function () { var m = j.modules.filter(function (x) { return x.id === +b.getAttribute('data-pick'); })[0]; close(); onPick(m); }); }); } });
    return mdl;
  });
}
function insertFromLib(libNodeId, pt) {
  var p = pt || (S.cv ? S.cv.centerOf() : { x: 0, y: 0 });
  return api('node_copy', { src_node_id: libNodeId, dst_project_id: S.pid, dst_parent_id: S.focus || null, x: Math.round(p.x - 135), y: Math.round(p.y - 66) }).then(function (r) { S.sel = r.id; S.tool = null; toast('ماژول درج شد (' + FA(r.count) + ' بخش)'); return reload(); });
}
function saveToLib(id) {
  var n = S.idx.byId.get(id); if (!n || n.kind !== 'module') return toast('فقط «ماژول» در کتابخانه ذخیره می‌شود', true);
  modal({ title: '📤 ذخیره در کتابخانهٔ ماژول‌ها', body: '<p>یک رونوشتِ کامل از «' + esc(n.title) + '» (با زیرمجموعه، ورودی/خروجی و فلوچارت‌ها) در کتابخانه ساخته می‌شود تا در پروژه‌های دیگر هم استفاده شود.</p><label class="f"><span>نام در کتابخانه</span><input name="t" value="' + esc(n.title) + '" required></label>', ok: 'ذخیره در کتابخانه',
    onok: function (f) { return api('library').then(function (lib) { return api('node_copy', { src_node_id: id, dst_project_id: lib.id, dst_parent_id: null, title: $('[name=t]', f).value, x: 0, y: 0 }); }).then(function () { toast('در کتابخانه ذخیره شد ✓'); }); } });
}
function deriveModule(id) {
  var n = S.idx.byId.get(id); if (!n || !isLib()) return;
  modal({ title: '🧬 ساختِ مشتق', body: '<p>یک ماژولِ تازه که از «' + esc(n.title) + '» ارث می‌برد (همهٔ ساختارِ آن را دارد) و می‌توانید تغییرش دهید.</p><label class="f"><span>نامِ ماژولِ مشتق</span><input name="t" value="' + esc(n.title) + ' (مشتق)" required></label>', ok: 'ساختن',
    onok: function (f) { return api('node_copy', { src_node_id: id, dst_project_id: S.pid, dst_parent_id: null, title: $('[name=t]', f).value, x: (n.x || 0) + 60, y: (n.y || 0) + 60 }).then(function (r) { S.sel = r.id; toast('مشتق ساخته شد'); return reload(); }); } });
}

/* ---------- فهرست ---------- */
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
  var dis = S.editing ? '' : ' disabled';
  var rows = sch.order.map(function (id, i) {
    var n = idx.byId.get(id), v = sch.info.get(id);
    var deps = Array.from(sch.preds.get(id) || []).map(function (q) { return esc(idx.byId.get(q).title); }).join('، ');
    return '<tr data-id="' + id + '"><td>' + FA(i + 1) + '</td><td><span class="pill">فاز ' + FA(v.phase) + '</span></td>' +
      '<td><a class="tt" data-act="pick" data-id="' + id + '" style="cursor:pointer">' + esc(n.title) + '</a><div class="mut sm">' + esc(idx.pathText(idx.parentOf(id))) + '</div></td>' +
      '<td class="sm mut" style="max-width:200px">' + (deps || '—') + '</td>' +
      '<td><input type="number" step="0.5" min="0" data-f="est_days"' + dis + ' value="' + (n.est_days == null ? '' : n.est_days) + '" placeholder="' + (v.heur) + '" style="width:76px"></td>' +
      '<td><input type="number" step="0.5" min="0" data-f="final_days"' + dis + ' value="' + (n.final_days == null ? '' : n.final_days) + '" placeholder="—" style="width:76px"></td>' +
      '<td><input class="ltr jd"' + dis + ' data-f="start_date" data-iso="' + esc(n.start_date || '') + '" value="' + (n.start_date ? J.fmt(n.start_date) : '') + '" placeholder="' + J.fmt(J.dayToIso(v.es)) + '" style="width:104px"></td>' +
      '<td class="sm">' + J.fmt(J.dayToIso(v.ef - 1)) + (v.conflict ? ' <span class="crit" title="شروعِ دستی پیش از پایانِ پیش‌نیاز است">⚠</span>' : '') + '</td>' +
      '<td>' + (v.crit ? '<span class="crit">بحرانی</span>' : '<span class="mut sm">' + FA(v.slack) + ' روز شناور</span>') + '</td>' +
      '<td>' + statusPill(n.status) + '</td></tr>';
  }).join('');
  return '<div class="card" style="margin-bottom:12px"><div class="row"><div class="grow"><b>ترتیبِ پیشنهادیِ شروعِ کار</b><div class="mut sm">برگ‌ها بر پایهٔ وابستگی‌ها مرتب شده‌اند (پیش‌نیازها اول). کارهای هم‌فاز مستقل‌اند و می‌توانند هم‌زمان انجام شوند. ' +
    'ستون «برآورد» پیشنهاد است (اگر خالی بماند، از روی تعداد ورودی/خروجی و طول توضیح حدس زده می‌شود و در نوشتهٔ کم‌رنگ دیده می‌شود)؛ ستون «نهایی» را شما می‌نویسید و در تایم‌لاین ملاک می‌شود.</div></div>' +
    '<div><b>' + num(sch.root.total) + ' روز</b> کار · پایان: <b class="' + (late ? 'crit' : '') + '">' + J.fmt(J.dayToIso(sch.end - 1), true) + '</b></div></div>' +
    '<div class="row" style="margin-top:10px"><button class="btn"' + dis + ' data-act="fillest">پُرکردنِ برآوردهای خالی با پیشنهاد</button>' +
    '<button class="btn pri"' + dis + ' data-act="applysched">ثبتِ تاریخ‌های پیشنهادی در بخش‌ها</button><button class="btn"' + dis + ' data-act="clearsched">پاک‌کردن تاریخ‌های ثبت‌شده</button></div></div>' +
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
    (S.editing ? '<button class="btn sm pri" data-act="addms">+ نقطهٔ عطف (تایم‌استون)</button>' : '') + '</div>' + legend +
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
  if (!S.editing) return '<div class="mut sm">برای افزودنِ یادداشت «✎ ویرایش» را بزنید.</div>';
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
    '<h2 class="sec">ملاحظات فنیِ پروژه برای هوش مصنوعی</h2><div class="card"><textarea id="aibrief" style="min-height:120px" placeholder="مثلاً: PHP 8.2 و MySQL، هاستِ cPanel، بدونِ فریم‌ورک، کدنویسی به سبک PSR-12، همهٔ متن‌ها فارسی…">' + esc(p.ai_brief || '') + '</textarea><div style="margin-top:8px"><button class="btn pri sm" data-act="savebrief"' + (S.editing ? '' : ' disabled') + '>ذخیره</button></div></div></div>' +
    '<div><h2 class="sec">خروجی‌ها</h2><div class="card"><div class="row">' +
    '<button class="btn pri" data-act="exportjson">⬇ فایل پروژه برای هوش مصنوعی (.pm.json)</button><button class="btn" data-act="exportmd">⬇ شرحِ خوانا (Markdown)</button><button class="btn" data-act="exportzip">⬇ پیوست‌ها (zip)</button></div>' +
    '<p class="mut sm">فایل JSON همان است که بعد از ویرایشِ هوش مصنوعی ایمپورت می‌شود. تصویرها/فایل‌های پیوست داخلِ JSON نمی‌آیند (فقط نامشان)؛ اگر لازم است zip را هم به هوش مصنوعی بدهید.</p></div>' +
    '<h2 class="sec">دستورِ آماده برای هوش مصنوعی</h2><div class="card"><pre class="code" id="promptbox">' + esc(PROMPT) + '</pre><button class="btn sm" data-act="copyprompt">کپیِ دستور</button></div>' +
    '<h2 class="sec">ایمپورتِ فایلِ برگشتی</h2><div class="card"><input type="file" id="impfile" accept=".json,application/json"' + (S.editing ? '' : ' disabled') + '>' + (S.editing ? '' : '<div class="mut sm">برای ایمپورت در این پروژه «✎ ویرایش» را بزنید.</div>') + '<div id="impinfo" class="sm" style="margin-top:8px"></div></div></div></div>';
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
function chgRow(c) {
  var n = c.node_id ? S.idx.byId.get(c.node_id) : null;
  return '<div class="chg"' + (n ? ' data-act="pick" data-id="' + n.id + '"' : '') + '><span class="chg-t">' + fmtDT(c.created_at) + '</span><span class="pill">' + esc(c.action) + '</span><span class="grow sm">' + esc(c.detail || '') + (c.path ? ' <span class="mut">— ' + esc(c.path) + '</span>' : '') + '</span><span class="mut sm">' + esc(c.author) + '</span></div>';
}
function histView() {
  var P = S.P, idx = S.idx, tot = totalTime();
  var chg = P.changes.map(chgRow).join('') || '<div class="mut">هنوز تغییری ثبت نشده.</div>';
  var revs = P.revisions.map(function (r) {
    return '<div class="rev"><div class="row"><b>💾 ' + fmtDT(r.created_at) + '</b><span class="mut sm">' + esc(r.author) + '</span><span class="grow"></span>' + (S.editing ? '<button class="btn sm" data-act="revrestore" data-id="' + r.id + '">↩ بازگردانی</button>' : '') + '</div>' +
      (r.note ? '<div>' + esc(r.note) + '</div>' : '') + '<div class="mut sm">' + esc(r.summary || '') + '</div></div>';
  }).join('') || '<div class="mut">هنوز نسخه‌ای ذخیره نشده. با «💾 ذخیره» در پایانِ هر نوبتِ ویرایش، یک نسخه ساخته می‌شود.</div>';
  var roots = idx.children(0).map(function (id) { return { n: idx.byId.get(id), t: nodeTime(id) }; }).sort(function (a, b) { return b.t - a.t; });
  var rows = roots.map(function (r) { var pc = tot ? Math.round(r.t / tot * 100) : 0; return '<div data-act="pick" data-id="' + r.n.id + '"><span>' + (r.n.icon || KIND_ICON[r.n.kind]) + '</span><span class="grow t">' + esc(r.n.title) + '</span><span style="width:90px">' + bar(pc) + '</span><b class="sm" style="width:92px;text-align:left">' + fmtDur(r.t) + '</b></div>'; }).join('');
  var top = P.nodes.filter(function (n) { return (n.work_seconds || 0) > 0; }).sort(function (a, b) { return b.work_seconds - a.work_seconds; }).slice(0, 8).map(function (n) {
    return '<div data-act="pick" data-id="' + n.id + '"><span>' + (n.icon || KIND_ICON[n.kind]) + '</span><span class="grow t">' + esc(n.title) + '</span><b class="sm">' + fmtDur(n.work_seconds) + '</b></div>'; }).join('');
  return '<div class="kpis"><div class="card kpi"><b>⏱ ' + fmtDur(tot) + '</b><span>کلِ زمانِ صرف‌شده برای طراحیِ این پروژه</span></div>' +
    '<div class="card kpi"><b>' + FA(P.changes.length) + '</b><span>تغییرِ ثبت‌شده (۱۵۰ تای آخر)</span></div><div class="card kpi"><b>' + FA(P.revisions.length) + '</b><span>نسخهٔ ذخیره‌شده</span></div></div>' +
    '<div class="two"><div><h2 class="sec">🔄 آخرین تغییرات (چه، کجا، کِی)</h2><div class="card chglist">' + chg + '</div></div>' +
    '<div><h2 class="sec">💾 نسخه‌های ذخیره‌شده</h2><div class="card">' + revs + '</div>' +
    '<h2 class="sec">⏱ زمانِ طراحی به تفکیکِ بخش</h2><div class="card list">' + (rows || '<div class="mut">—</div>') +
    ((P.project.work_seconds || 0) ? '<div><span>🧭</span><span class="grow t">کارِ کلیِ پروژه (بدونِ بخشِ مشخص)</span><b class="sm">' + fmtDur(P.project.work_seconds) + '</b></div>' : '') + '</div>' +
    (top ? '<h2 class="sec">🔥 بیشترین زمان روی…</h2><div class="card list">' + top + '</div>' : '') +
    '<p class="mut sm">زمان فقط وقتی حساب می‌شود که در «حالتِ ویرایش» باشید، صفحه باز و فعال باشد و بخشی را انتخاب کرده باشید.</p></div></div>';
}

/* ---------- کشوی جزئیات ---------- */
function validParents(node) {
  var idx = S.idx, ex = {}; ex[node.id] = 1; idx.descendants(node.id).forEach(function (x) { ex[x] = 1; });
  return idx.preorder.filter(function (id) { return !ex[id] && childKindsOf(idx.byId.get(id).kind).indexOf(node.kind) >= 0; });
}
function parentSelect(node) {
  var cur = S.idx.parentOf(node.id), o = childKindsOf(null).indexOf(node.kind) >= 0 ? '<option value="">(سطحِ اصلی)</option>' : '';
  validParents(node).forEach(function (id) { var n = S.idx.byId.get(id); o += '<option value="' + id + '"' + (id === cur ? ' selected' : '') + '>' + esc(new Array(S.idx.depth(id) + 1).join('— ') + (n.icon || KIND_ICON[n.kind]) + ' ' + n.title) + '</option>'; });
  return o;
}
function ioRows(kind, list, single) { return (list || []).slice(0, single ? 1 : 99).map(function (r) { return ioRow(kind, r, true); }).join(''); }
function ioRow(kind, r, ex) {
  r = r || {};
  return '<div class="io2"><div class="io"><input data-io="' + kind + '-name" placeholder="نام" value="' + esc(r.name || '') + '"' + (ex ? ' readonly title="برای تغییرِ نام دکمهٔ ✎ را بزنید (پیوندها و فلوچارت هم هماهنگ می‌شوند)"' : '') + '>' + (ex && S.sel ? '<button type="button" class="btn sm ghost" title="تغییرِ نام و جزئیات" data-act="portdlg" data-id="' + S.sel + '" data-side="' + (kind === 'in' ? 'in' : 'out') + '" data-name="' + esc(r.name || '') + '">✎</button>' : '') + '<input data-io="' + kind + '-desc" placeholder="تعریف در خودِ ماژول / قالبِ داده" value="' + esc(r.desc || '') + '"><button type="button" class="btn sm ghost danger" data-act="rmrow">×</button></div>' +
    '<div class="io io-use"><input data-io="' + kind + '-use" placeholder="کاربردِ آن در همین جایی که به کار رفته (اختصاصیِ این‌جا)" value="' + esc(r.use || '') + '"></div>' +
    '<div class="io io-un"><label class="unl"><input type="checkbox" data-io="' + kind + '-unused"' + (r.unused ? ' checked' : '') + '> ✗ در اینجا استفاده نمی‌شود</label><input data-io="' + kind + '-why" placeholder="چرا؟ (دلیل لازم است)" value="' + esc(r.why || '') + '"></div></div>';
}
function portStatusBlock(n) {
  var ps = E.portStatus(n, S.P.deps); if (!ps.length) return '';
  var rows = ps.map(function (p) {
    return '<div class="ps ' + p.state + '"><span class="ps-s">' + (p.side === 'in' ? '⇢' : '⇠') + ' <b>' + esc(p.name) + '</b></span><span class="ps-t">' + E.PORT_MSG[p.state] + (p.state === 'unused' && p.port.why ? ': ' + esc(p.port.why) : '') + '</span>' +
      '<button type="button" class="btn sm ghost" data-act="portdlg" data-id="' + n.id + '" data-side="' + p.side + '" data-name="' + esc(p.name) + '">جزئیات</button></div>';
  }).join('');
  var bad = ps.filter(function (p) { return p.state === 'none' || p.state === 'dangling'; }).length;
  return '<div class="sub' + (bad ? ' warnsub' : '') + '"><h4>🎯 هدفِ ورودی/خروجی‌ها' + (bad ? ' — ' + FA(bad) + ' مورد بی‌هدف' : ' — همه روشن است ✓') + '</h4>' + rows +
    '<div class="mut sm">هر ورودی باید در فلوچارت نشان دهد چه پردازشی رویش انجام می‌شود، هر خروجی باید نشان دهد از کجا می‌آید؛ وگرنه «✗ بدون استفاده» با دلیل علامت بخورد.</div></div>';
}
function depBlock(id, dir) { // dir: 'in' پیش‌نیازها  |  'out' پس‌نیازها
  var idx = S.idx, list = dir === 'in' ? (idx.inn.get(id) || []) : (idx.out.get(id) || []), ed = S.editing;
  var rel = {}; rel[id] = 1; idx.descendants(id).forEach(function (x) { rel[x] = 1; }); idx.chain(id).forEach(function (x) { rel[x] = 1; });
  var opts = idx.preorder.filter(function (x) { return !rel[x]; }).map(function (x) { return '<option value="' + x + '">' + esc(idx.pathText(x, ' › ')) + '</option>'; }).join('');
  var outNames = (idx.byId.get(id).outputs || []).map(function (o) { return '<option value="' + esc(o.name) + '">'; }).join('');
  return '<div class="sub"><h4>' + (dir === 'in' ? '⇢ ورودی‌ها از… (این بخش از این‌ها می‌گیرد)' : '⇠ خروجی‌ها به… (این‌ها از این بخش می‌گیرند)') + '</h4>' +
    (list.map(function (d) {
      var oid = dir === 'in' ? d.from_id : d.to_id, ports = (d.out_name || d.in_name) ? '<span class="pill">' + esc(d.out_name || '؟') + ' ← ' + esc(d.in_name || '؟') + '</span>' : '';
      return '<div class="dep"><a class="grow sm" style="cursor:pointer" data-act="pick" data-id="' + oid + '">' + (idx.byId.get(oid).icon || KIND_ICON[idx.byId.get(oid).kind]) + ' ' + esc(idx.byId.get(oid).title) + '</a>' + ports + (d.two ? '<span class="pill" title="پیوندِ دوطرفه">⇄</span>' : '') + '<input class="grow" data-dlabel="' + d.id + '" data-two="' + (d.two ? 1 : 0) + '" data-from="' + d.from_id + '" data-to="' + d.to_id + '" data-on="' + esc(d.out_name || '') + '" data-in="' + esc(d.in_name || '') + '" value="' + esc(d.label || '') + '" placeholder="برچسب"' + (ed ? '' : ' disabled') + '>' + (ed ? '<button class="btn sm ghost" title="' + (d.two ? 'یک‌طرفه کن' : 'دوطرفه کن') + '" data-act="deptwo" data-id="' + d.id + '">' + (d.two ? '→' : '⇄') + '</button><button class="btn sm ghost danger" data-act="deldep" data-id="' + d.id + '">×</button>' : '') + '</div>';
    }).join('') || '<div class="mut sm">—</div>') +
    (ed && opts ? '<form data-form="adddep" data-dir="' + dir + '" data-id="' + id + '" class="dep" style="margin-top:6px"><select name="other" class="grow" style="width:auto"><option value="">افزودن…</option>' + opts + '</select><input name="label" class="grow" placeholder="برچسب (اختیاری)"><button class="btn sm" type="submit">＋</button></form>' : '') + '</div>';
}
function renderDrawer() {
  var d = $('#drawer'); if (!d) return;
  if (!S.sel || !S.idx.byId.has(S.sel) || (S.tab === 'map' && !S.drawerOpen)) { d.className = 'hidden'; d.innerHTML = ''; return; }
  var keepTop = d.scrollTop, idx = S.idx, n = idx.byId.get(S.sel), id = n.id, v = S.sch.info.get(id) || {}, leaf = idx.isLeaf(id), ed = S.editing, dis = ed ? '' : ' disabled', single = n.kind === 'task';
  var nlogs = S.P.logs.filter(function (l) { return l.node_id === id; });
  var nfiles = S.P.files.filter(function (f) { return f.node_id === id && !f.log_id; });
  var kids = idx.children(id), pkind = idx.parentOf(id) ? idx.byId.get(idx.parentOf(id)).kind : null;
  var kindOK = childKindsOf(pkind).filter(function (k) { var allowed = childKindsOf(k); return kids.every(function (c) { return allowed.indexOf(idx.byId.get(c).kind) >= 0; }); });
  var kindSel = kindOK.map(function (k) { return '<option value="' + k + '"' + (n.kind === k ? ' selected' : '') + '>' + KIND_ICON[k] + ' ' + E.KIND[k] + '</option>'; }).join('');
  var stSel = Object.keys(E.STATUS).map(function (k) { return '<option value="' + k + '"' + (n.status === k ? ' selected' : '') + '>' + E.STATUS[k] + '</option>'; }).join('');
  var prSel = [1, 2, 3].map(function (k) { return '<option value="' + k + '"' + (n.priority === k ? ' selected' : '') + '>' + E.PRIO[k] + '</option>'; }).join('');
  var ck = childKinds(id), hasFlow = n.flow && n.flow.nodes && n.flow.nodes.length;
  d.className = '';
  d.innerHTML = '<div class="dh"><span class="bk-i">' + esc(n.icon || KIND_ICON[n.kind]) + '</span><h3>' + esc(n.title) + '</h3><button class="btn sm" data-act="closedrawer">بستن ✕</button></div>' +
    '<div class="row sm mut" style="margin-bottom:6px"><span class="kb2 ' + n.kind + '">' + KIND_ICON[n.kind] + ' ' + E.KIND[n.kind] + '</span><span>' + esc(idx.pathText(id)) + '</span>' + (v.es ? '<span><bdi>' + J.fmt(J.dayToIso(v.es)) + '</bdi> تا <bdi>' + J.fmt(J.dayToIso(v.ef - 1)) + '</bdi></span>' : '') + (v.crit ? '<b class="crit">بحرانی</b>' : '') + '<span>⏱ ' + fmtDur(nodeTime(id)) + '</span></div>' +
    (n.src_name ? '<div class="sub lineage">📚 رونوشت/ارث‌برده از ماژولِ کتابخانه: <b>' + esc(n.src_name) + '</b></div>' : '') +
    (ed ? '' : '<div class="ro-note">👁 حالتِ مشاهده — برای تغییر «✎ ویرایش» را بزنید (بالای صفحه).</div>') +
    '<form data-form="savenode" data-id="' + id + '"><fieldset class="fs"' + dis + '>' +
    '<label class="f"><span>عنوان</span><input name="title" value="' + esc(n.title) + '" required></label>' +
    '<div class="row"><label class="f grow"><span>نوع</span><select name="kind">' + kindSel + '</select></label><label class="f grow"><span>اولویت</span><select name="priority">' + prSel + '</select></label></div>' +
    '<label class="f"><span>والد (جابه‌جایی در درخت — فقط جاهای مجاز)</span><select name="parent_id">' + parentSelect(n) + '</select></label>' +
    (leaf ? '<div class="row"><label class="f grow"><span>وضعیت</span><select name="status">' + stSel + '</select></label>' +
      '<label class="f grow"><span>درصد انجام: <b id="pv">' + FA(n.progress) + '</b>٪</span><input type="range" name="progress" min="0" max="100" step="5" value="' + n.progress + '"></label></div>' :
      '<div class="sub"><div class="row">' + statusPill(v.status) + '<div class="grow">' + bar(v.progress) + '</div><b>' + FA(v.progress) + '٪</b></div><div class="mut sm">وضعیت و درصدِ بخشی که زیرمجموعه دارد، خودکار از زیرمجموعه‌ها محاسبه می‌شود (' + FA(v.leafDone) + ' از ' + FA(v.leafCount) + ' کار انجام‌شده، مجموع ' + num(v.dur) + ' روز).</div></div>') +
    '<label class="f"><span>خلاصه (یک‌خطی)</span><input name="summary" value="' + esc(n.summary) + '"></label>' +
    '<label class="f"><span>توضیحات کامل / نیازمندی‌ها</span><textarea name="details" style="min-height:100px">' + esc(n.details) + '</textarea></label>' +
    '<div class="sub"><h4>⇢ ' + (single ? 'ورودی (فقط یکی)' : 'ورودی‌ها') + '</h4><div id="io-in">' + ioRows('in', n.inputs, single) + '</div>' + (single && (n.inputs || []).length ? '' : '<button type="button" class="btn sm" data-act="addio" data-k="in">＋ ورودی</button>') + '</div>' +
    '<div class="sub"><h4>⇠ ' + (single ? 'خروجی (فقط یکی)' : 'خروجی‌ها') + '</h4><div id="io-out">' + ioRows('out', n.outputs, single) + '</div>' + (single && (n.outputs || []).length ? '' : '<button type="button" class="btn sm" data-act="addio" data-k="out">＋ خروجی</button>') + '</div>' +
    '<label class="f"><span>پردازش (ورودی‌ها چطور به خروجی تبدیل می‌شوند؟)</span><textarea name="process">' + esc(n.process) + '</textarea></label>' +
    '</fieldset>' + portStatusBlock(n) +
    '<div class="sub"><h4>⎇ فلوچارت (توضیحِ گرافیکیِ پردازش)</h4>' + (hasFlow ?
      '<div class="flthumb" data-act="flowedit" data-id="' + id + '" title="کلیک کنید">' + FLOW.svg(n.flow, { width: '100%', height: 'auto', ink: 'currentColor' }) + '</div><div class="row" style="margin-top:6px"><button type="button" class="btn sm" data-act="flowedit" data-id="' + id + '">' + (ed ? '✎ ویرایش' : '🔍 بزرگ‌نمایی') + '</button>' + (ed ? '<button type="button" class="btn sm danger" data-act="flowdel" data-id="' + id + '">حذف</button>' : '') + '</div>' :
      (ed ? '<button type="button" class="btn sm" data-act="flowedit" data-id="' + id + '">＋ رسمِ فلوچارت</button>' : '<div class="mut sm">فلوچارتی رسم نشده.</div>')) + '</div>' +
    '<fieldset class="fs"' + dis + '><label class="f"><span>نکاتِ فنی (فناوری، جدول‌ها، API، فایل‌ها…)</span><textarea name="tech">' + esc(n.tech) + '</textarea></label>' +
    '<div class="row"><div class="f grow"><span class="mut sm" style="display:block">رنگ</span><span class="cv-dots" id="colpick">' + PMCanvas.PALETTE.map(function (c) { return '<i class="cv-dot' + (n.color === c ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '"></i>'; }).join('') + '<i class="cv-dot none' + (!n.color ? ' on' : '') + '" data-c="">∅</i></span><input type="hidden" name="color" value="' + esc(n.color || '') + '"></div>' +
    '<label class="f" style="width:90px"><span>آیکن</span><input name="icon" value="' + esc(n.icon || '') + '" maxlength="4"></label></div>' +
    (leaf ? '<div class="row"><label class="f grow"><span>برآورد (روز)</span><input type="number" step="0.5" min="0" name="est_days" value="' + (n.est_days == null ? '' : n.est_days) + '" placeholder="پیشنهاد: ' + FA(E.heuristic(n)) + '"></label>' +
      '<label class="f grow"><span>زمان نهایی (روز) — دستی</span><input type="number" step="0.5" min="0" name="final_days" value="' + (n.final_days == null ? '' : n.final_days) + '"></label></div>' +
      '<label class="f"><span>تاریخ شروع (خالی = خودکار از وابستگی‌ها)</span>' + dateField('start_date', n.start_date, v.es ? J.fmt(J.dayToIso(v.es)) : '') + '</label>' : '') +
    '<div class="row"><label class="f grow"><span>مسئول</span><input name="assignee" value="' + esc(n.assignee) + '"></label><label class="f grow"><span>برچسب‌ها</span><input name="tags" value="' + esc(n.tags) + '"></label></div></fieldset>' +
    '<div class="row">' + (ed ? '<button class="btn pri" type="submit">💾 ذخیرهٔ بخش</button>' + (ck.length ? '<button type="button" class="btn" data-act="addnode" data-parent="' + id + '">＋ زیربخش</button>' : '') : '') +
    (n.kind === 'module' ? '<button type="button" class="btn" data-act="savelib" data-id="' + id + '">📤 در کتابخانه</button>' : '') + (isLib() && n.kind === 'module' && ed ? '<button type="button" class="btn" data-act="derive" data-id="' + id + '">🧬 مشتق</button>' : '') +
    '<span class="grow"></span>' + (ed ? '<button type="button" class="btn danger" data-act="delnode" data-id="' + id + '">🗑 حذف</button>' : '') + '</div></form>' +
    (kids.length ? '<h2 class="sec">زیرمجموعه‌ها</h2><div class="list">' + kids.map(nodeLink).join('') + '</div>' : '') +
    '<h2 class="sec">پیوندها</h2>' + depBlock(id, 'in') + depBlock(id, 'out') +
    '<h2 class="sec">🖼️ پیوست‌ها</h2>' + (filesHtml(nfiles) || '<div class="mut sm">—</div>') +
    (ed ? '<div style="margin-top:6px"><input type="file" multiple data-chg="upnode" data-id="' + id + '"></div>' : '') +
    '<h2 class="sec">📝 تاریخچه و یادداشت‌ها</h2>' + logForm(id) + '<div style="margin-top:10px">' + (nlogs.map(function (l) { return logHtml(l, false); }).join('') || '<div class="mut sm">هنوز یادداشتی نیست.</div>') + '</div>';
  d.scrollTop = keepTop;
}
function collectNode(f) {
  var o = {};
  ['title', 'summary', 'details', 'process', 'tech', 'assignee', 'tags'].forEach(function (k) { var e = $('[name=' + k + ']', f); if (e) o[k] = e.value; });
  var kd = $('[name=kind]', f); if (kd && kd.value) o.kind = kd.value;
  o.priority = +$('[name=priority]', f).value;
  var cl = $('[name=color]', f); if (cl) o.color = cl.value || '';
  var ic = $('[name=icon]', f); if (ic) o.icon = ic.value.trim();
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
    o[k === 'in' ? 'inputs' : 'outputs'] = $$('#io-' + k + ' .io2', f.parentNode).map(function (r) { return { name: $('[data-io$=name]', r).value, desc: $('[data-io$=desc]', r).value, use: $('[data-io$=use]', r).value, unused: $('[data-io$=unused]', r).checked, why: $('[data-io$=why]', r).value }; });
  });
  return o;
}

/* ---------- افزودنِ بخش (با رعایتِ سلسله‌مراتب) ---------- */
function addNodeDialog(parent) {
  parent = parent || 0;
  var idx = S.idx, cands = idx.preorder.filter(function (id) { return childKindsOf(idx.byId.get(id).kind).length; });
  var rootOK = childKindsOf(null).length;
  if (!cands.length && !rootOK) return toast('هیچ جایی برای افزودن نیست', true);
  var popt = (rootOK ? '<option value="">(سطحِ اصلی)</option>' : '') + cands.map(function (id) { var n = idx.byId.get(id); return '<option value="' + id + '"' + (id === parent ? ' selected' : '') + '>' + esc(new Array(idx.depth(id) + 1).join('— ') + (n.icon || KIND_ICON[n.kind]) + ' ' + n.title) + '</option>'; }).join('');
  modal({ title: '➕ افزودنِ بخش', body: '<label class="f"><span>والد</span><select name="parent_id">' + popt + '</select></label><div class="row" id="kindrow"></div>' +
    '<label class="f"><span>عنوان</span><input name="title" required></label><label class="f"><span>خلاصه (اختیاری)</span><input name="summary"></label>',
    ok: 'ساختن',
    setup: function (f) {
      function fill() {
        var pv = $('[name=parent_id]', f).value, ks = childKinds(pv ? +pv : 0);
        $('#kindrow', f).innerHTML = ks.map(function (k, i) { return '<label class="kindopt"><input type="radio" name="kind" value="' + k + '"' + (i === (ks.indexOf('module') >= 0 ? ks.indexOf('module') : 0) ? ' checked' : '') + '><span style="--tc:' + KCOL[k] + '">' + KIND_ICON[k] + ' ' + E.KIND[k] + '</span></label>'; }).join('') || '<span class="crit">این جایگاه زیرمجموعه نمی‌گیرد</span>';
      }
      fill(); $('[name=parent_id]', f).addEventListener('change', fill);
    },
    onok: function (f) {
      var pv = $('[name=parent_id]', f).value, kd = $('[name=kind]:checked', f); if (!kd) return false;
      return api('node_save', { project_id: S.pid, title: $('[name=title]', f).value, kind: kd.value, summary: $('[name=summary]', f).value, parent_id: pv ? +pv : null }).then(function (r) {
        if (pv) S.open[+pv] = true;
        S.sel = r.id; if (S.tab === 'map') S.focus = pv ? +pv : 0;
        return reload();
      });
    } });
}

/* ---------- فهرست ---------- */
function isOpen(id) { return id in S.open ? S.open[id] : S.idx.depth(id) < 1; }
function outlineView() {
  var idx = S.idx, rows = [], ed = S.editing;
  (function walk(pid) {
    idx.children(pid).forEach(function (id) {
      var n = idx.byId.get(id), v = S.sch.info.get(id) || {}, kc = idx.children(id).length, d = idx.depth(id), cnt = childKinds(id).length;
      rows.push('<div class="tr' + (S.sel === id ? ' sel' : '') + '" style="padding-inline-start:' + (8 + d * 22) + 'px"><span class="tg" data-act="toggle" data-id="' + id + '">' + (kc ? (isOpen(id) ? '▾' : '◂') : '·') + '</span>' +
        '<span class="bk-i">' + esc(n.icon || KIND_ICON[n.kind]) + '</span><span class="kb2 ' + n.kind + '">' + E.KIND[n.kind] + '</span><span class="tt" data-act="pick" data-id="' + id + '">' + esc(n.title) + '</span>' +
        statusPill(v.status || n.status) + '<span style="width:70px">' + bar(v.progress) + '</span><span class="sm mut" style="width:46px">' + FA(v.progress || 0) + '٪</span>' +
        '<span class="sm mut" style="width:54px">' + (v.dur ? num(v.dur) + ' روز' : '') + '</span><span class="sm mut" style="width:84px">⏱ ' + fmtDur(nodeTime(id)) + '</span>' +
        (ed ? '<span class="row" style="gap:2px;flex-wrap:nowrap">' + (cnt ? '<button class="btn sm ghost" title="زیربخشِ جدید" data-act="addnode" data-parent="' + id + '">＋</button>' : '') +
        '<button class="btn sm ghost" title="بالاتر" data-act="mv" data-id="' + id + '" data-d="up">↑</button><button class="btn sm ghost" title="پایین‌تر" data-act="mv" data-id="' + id + '" data-d="down">↓</button>' +
        '<button class="btn sm ghost" title="تورفتگی (زیرِ بخشِ بالایی)" data-act="mv" data-id="' + id + '" data-d="in">⇥</button><button class="btn sm ghost" title="یک سطح بیرون" data-act="mv" data-id="' + id + '" data-d="out">⇤</button></span>' : '') + '</div>');
      if (kc && isOpen(id)) walk(id);
    });
  })(0);
  var rk = childKindsOf(null);
  return '<div class="row" style="margin-bottom:10px">' + (ed && rk.length ? '<button class="btn pri" data-act="addnode" data-parent="0">＋ ' + KIND_ICON[rk[0]] + ' ' + E.KIND[rk[0]] + ' جدید</button>' : '') +
    '<button class="btn" data-act="expand" data-v="1">باز کردن همه</button><button class="btn" data-act="expand" data-v="0">بستن همه</button>' + (ed ? '' : '<span class="pill s st-hold">حالتِ مشاهده</span>') + '</div>' +
    (rows.length ? '<div class="tree card" style="padding:0;overflow:hidden">' + rows.join('') + '</div>' : '<div class="card empty">هنوز بخشی نیست.</div>');
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
function demoImage() {
  return new Promise(function (res) {
    try {
      var c = document.createElement('canvas'); c.width = 640; c.height = 300; var g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 640, 300); g.font = '14px sans-serif'; g.textAlign = 'center';
      var bx = [['users', 40, 40, '#7a5af8'], ['products', 260, 40, '#2f6fed'], ['orders', 480, 40, '#e0912b'], ['order_items', 370, 190, '#1f9d63'], ['payments', 150, 190, '#d64545']];
      g.strokeStyle = '#7d88a3'; g.lineWidth = 2;
      [[0, 2], [1, 3], [2, 3], [2, 4], [0, 4]].forEach(function (l) { g.beginPath(); g.moveTo(bx[l[0]][1] + 60, bx[l[0]][2] + 25); g.lineTo(bx[l[1]][1] + 60, bx[l[1]][2] + 25); g.stroke(); });
      bx.forEach(function (b) { g.fillStyle = '#fff'; g.fillRect(b[1], b[2], 120, 50); g.strokeStyle = b[3]; g.lineWidth = 3; g.strokeRect(b[1], b[2], 120, 50); g.fillStyle = '#1c2333'; g.fillText(b[0], b[1] + 60, b[2] + 30); });
      c.toBlob(function (b) { res(b); }, 'image/png');
    } catch (e) { res(null); }
  });
}
/* سازنده‌های کوچکِ دمو */
function dN(id, parent, kind, title, o) {
  o = o || {};
  var n = { id: id, parent: parent, kind: kind, title: title };
  for (var k in o) n[k] = o[k];
  if (o.ins) { n.inputs = o.ins.map(function (x) { return x && x.name ? x : { name: x[0], desc: x[1] || '' }; }); delete n.ins; }
  if (o.outs) { n.outputs = o.outs.map(function (x) { return x && x.name ? x : { name: x[0], desc: x[1] || '' }; }); delete n.outs; }
  return n;
}
function dF(nodes, edges) {
  return { v: 1, nodes: nodes.map(function (a) { return { id: a[0], type: a[1], text: a[2], x: a[3], y: a[4], w: a[5] || (a[1] === 'decision' ? 180 : a[1] === 'start' || a[1] === 'end' ? 140 : 170), h: a[6] || (a[1] === 'decision' ? 104 : a[1] === 'start' || a[1] === 'end' ? 52 : 64), color: null, port: a[7] || null }; }),
    edges: edges.map(function (e, i) { return { id: 'e' + (i + 1), from: e[0], to: e[1], label: e[2] || '', color: null }; }) };
}
function demoFlows() {
  var I = function (n) { return { side: 'in', name: n }; }, O = function (n) { return { side: 'out', name: n }; };
  return {
    login: dF([['s', 'start', 'شروع', 200, 0], ['i', 'io', 'دریافتِ ایمیل و رمز', 185, 100, 0, 0, I('ایمیل و رمز')], ['c', 'process', 'یافتنِ کاربر در پایگاه‌داده', 185, 205], ['d', 'decision', 'رمز درست است؟', 180, 315],
      ['ok', 'process', 'ساختِ نشست و ثبتِ ورود', 480, 335], ['bad', 'process', 'شمارشِ تلاشِ ناموفق', -110, 335], ['lim', 'decision', 'بیش از ۵ بار؟', -115, 460], ['lock', 'process', 'قفلِ موقتِ حساب', -110, 600],
      ['r', 'io', 'نتیجهٔ بررسی', 190, 640, 0, 0, O('نتیجهٔ بررسی')], ['e', 'end', 'پایان', 205, 740]],
      [['s', 'i'], ['i', 'c'], ['c', 'd'], ['d', 'ok', 'بله'], ['d', 'bad', 'خیر'], ['bad', 'lim'], ['lim', 'lock', 'بله'], ['lim', 'r', 'خیر'], ['lock', 'r'], ['ok', 'r'], ['r', 'e']]),
    pay: dF([['s', 'start', 'شروع', 220, 0], ['k', 'io', 'شناسهٔ تراکنش', 190, 100, 0, 0, I('شناسهٔ تراکنش')], ['g', 'process', 'هدایت به درگاه', 205, 215], ['u', 'io', 'بازگشت از درگاه', 200, 320], ['v', 'decision', 'پرداخت موفق؟', 200, 430, 180, 104],
      ['ok', 'process', 'ثبتِ نتیجهٔ موفق', 500, 450], ['no', 'process', 'ثبتِ نتیجهٔ ناموفق', -110, 450], ['n', 'note', 'تأییدِ نهایی حتماً با verify سمتِ سرور', 500, 570, 200, 90], ['r', 'io', 'نتیجهٔ درگاه', 205, 600, 0, 0, O('نتیجهٔ درگاه')], ['e', 'end', 'پایان', 225, 710]],
      [['s', 'k'], ['k', 'g'], ['g', 'u'], ['u', 'v'], ['v', 'ok', 'بله'], ['v', 'no', 'خیر'], ['ok', 'r'], ['no', 'r'], ['r', 'e']]),
    modLogin: dF([['a', 'io', 'ایمیل', 0, 0, 0, 0, I('ایمیل')], ['b', 'io', 'رمز', 0, 110, 0, 0, I('رمز')], ['p', 'sub', 'اعتبارسنجی و ساختِ نشست (زیرمجموعه‌ها)', 280, 50, 210, 70], ['o1', 'io', 'نشست کاربر', 590, 0, 0, 0, O('نشست کاربر')], ['o2', 'io', 'سطح دسترسی', 590, 110, 0, 0, O('سطح دسترسی')]],
      [['a', 'p'], ['b', 'p'], ['p', 'o1'], ['p', 'o2']]),
    modPay: dF([['a', 'io', 'مبلغ', 0, 0, 0, 0, I('مبلغ')], ['b', 'io', 'اقلامِ سبد', 0, 110, 0, 0, I('اقلامِ سبد')], ['p', 'sub', 'تراکنش، درگاه و تأییدِ سرور', 280, 50, 210, 70], ['o', 'io', 'وضعیتِ پرداخت', 590, 50, 0, 0, O('وضعیتِ پرداخت')]],
      [['a', 'p'], ['b', 'p'], ['p', 'o']]),
    modSms: dF([['a', 'io', 'شماره', 0, 0, 0, 0, I('شماره')], ['b', 'io', 'متن', 0, 110, 0, 0, I('متن')], ['p', 'process', 'ارسال با تلاشِ دوباره', 280, 50, 210, 70], ['o', 'io', 'وضعیتِ ارسال', 590, 50, 0, 0, O('وضعیتِ ارسال')]],
      [['a', 'p'], ['b', 'p'], ['p', 'o']]),
    er1: dF([['i', 'io', 'نیازمندی‌ها', 0, 0, 0, 0, I('نیازمندی‌ها')], ['p', 'process', 'استخراجِ موجودیت‌ها و ارتباط‌ها', 260, 0, 200, 64], ['o', 'io', 'نمودارِ ER', 560, 0, 0, 0, O('نمودارِ ER')]], [['i', 'p'], ['p', 'o']]),
    er2: dF([['i', 'io', 'نمودارِ ER', 0, 0, 0, 0, I('نمودارِ ER')], ['p', 'process', 'نوشتنِ مهاجرت‌های SQL', 260, 0, 200, 64], ['o', 'io', 'اسکیمای SQL', 560, 0, 0, 0, O('اسکیمای SQL')]], [['i', 'p'], ['p', 'o']]),
    mdl: dF([['i', 'io', 'نیازمندی‌ها', 0, 0, 0, 0, I('نیازمندی‌ها')], ['p', 'sub', 'مدل‌سازی و مهاجرت (کارهای زیرین)', 260, 0, 220, 70], ['o', 'io', 'اسکیمای SQL', 580, 0, 0, 0, O('اسکیمای SQL')]], [['i', 'p'], ['p', 'o']])
  };
}
/* ماژول‌های کتابخانه */
function libDemoDoc() {
  var fl = demoFlows(), N = dN;
  return { nodes: [
    N('L1', null, 'module', 'ورود کاربر', { icon: '🔐', color: '#7a5af8', summary: 'اعتبارسنجی، نشست و محدودیتِ تلاش', ins: [['ایمیل'], ['رمز']], outs: [['نشست کاربر'], ['سطح دسترسی']], process: 'ایمیل و رمز اعتبارسنجی می‌شود؛ در صورتِ درستی نشستِ امن ساخته می‌شود.', flow: fl.modLogin, est_days: 4 }),
    N('L1s1', 'L1', 'section', 'اعتبارسنجی', { icon: '🛡️' }),
    N('L1t1', 'L1s1', 'task', 'بررسیِ رمز', { ins: [['ایمیل و رمز']], outs: [['نتیجهٔ بررسی']], flow: fl.login, process: 'رمزِ واردشده با هشِ ذخیره‌شده مقایسه می‌شود؛ اگر نادرست بود شمارندهٔ تلاش بالا می‌رود و بیش از ۵ بار حساب قفل می‌شود.', est_days: 1.5 }),
    N('L1t2', 'L1s1', 'task', 'محدودیتِ تلاش', { ins: [['تعدادِ تلاش']], outs: [['وضعیتِ قفل']], est_days: 1 }),
    N('L1t3', 'L1', 'task', 'ساختِ نشست', { ins: [['کاربرِ معتبر']], outs: [['کوکیِ نشست']], est_days: 1 }),
    N('L2', null, 'module', 'پرداختِ آنلاین', { icon: '💳', color: '#d64545', summary: 'اتصال به درگاه و تأییدِ پرداخت', ins: [['مبلغ'], ['اقلامِ سبد']], outs: [['وضعیتِ پرداخت']], process: 'تراکنش ساخته می‌شود، کاربر به درگاه می‌رود و پس از بازگشت، پرداخت سمتِ سرور تأیید می‌شود.', flow: fl.modPay, est_days: 6 }),
    N('L2t1', 'L2', 'task', 'ساختِ تراکنش', { ins: [['مبلغ']], outs: [['شناسهٔ تراکنش']], est_days: 1 }),
    N('L2t2', 'L2', 'task', 'درگاه و بازگشت', { ins: [['شناسهٔ تراکنش']], outs: [['نتیجهٔ درگاه']], flow: fl.pay, est_days: 3 }),
    N('L2t3', 'L2', 'task', 'تأییدِ سمتِ سرور', { ins: [['نتیجهٔ درگاه']], outs: [['وضعیتِ پرداخت']], est_days: 1 }),
    N('L3', null, 'module', 'اعلانِ پیامکی', { icon: '🔔', color: '#14a3a3', summary: 'ارسالِ پیامک با تلاشِ دوباره', ins: [['شماره'], ['متن']], outs: [['وضعیتِ ارسال']], flow: fl.modSms, est_days: 3 }),
    N('L3t1', 'L3', 'task', 'ارسال با تلاشِ دوباره', { ins: [['پیام']], outs: [['وضعیتِ ارسال']], est_days: 2 })],
    dependencies: [{ from: 'L1t1', to: 'L1t3', out: 'نتیجهٔ بررسی', 'in': 'کاربرِ معتبر', label: 'اگر درست بود' }, { from: 'L1t1', to: 'L1t2', out: 'نتیجهٔ بررسی', 'in': 'تعدادِ تلاش' },
      { from: 'L2t1', to: 'L2t2', out: 'شناسهٔ تراکنش', 'in': 'شناسهٔ تراکنش' }, { from: 'L2t2', to: 'L2t3', out: 'نتیجهٔ درگاه', 'in': 'نتیجهٔ درگاه' }] };
}
/* پروژهٔ دمو (بدونِ ماژول‌های کتابخانه — آن‌ها پس از ایمپورت درج می‌شوند) */
function sampleDoc() {
  var T = J.today(), D = function (n) { return J.dayToIso(T + n); }, N = dN, fl = demoFlows();
  var nodes = [
    N('A', null, 'area', 'هسته و زیرساخت', { icon: '🏗️', color: '#2f6fed', x: 760, y: 280, summary: 'پایگاه‌داده، ورود و دسترسی‌ها', ins: [['نیازمندی‌ها']], outs: [['اسکیمای SQL'], ['نشست کاربر']] }),
    N('A1', 'A', 'section', 'پایگاه‌داده', { icon: '🗄️' }),
    N('A1m', 'A1', 'module', 'طراحیِ اسکیما', { icon: '🧩', summary: 'جدول‌ها، رابطه‌ها و مهاجرت‌ها', ins: [['نیازمندی‌ها']], outs: [['اسکیمای SQL']], process: 'مدل‌سازی ER، نرمال‌سازی تا ۳NF و نوشتنِ مهاجرت‌ها.', tech: 'MySQL 8 · utf8mb4 · حذفِ نرم برای سفارش و محصول', flow: fl.mdl, status: 'doing', progress: 85 }),
    N('A1t1', 'A1m', 'task', 'مدلِ ER', { icon: '✔️', summary: 'نمودارِ موجودیت‌ها', ins: [['نیازمندی‌ها']], outs: [['نمودارِ ER']], status: 'done', progress: 100, final_days: 2, start_date: D(-12), assignee: 'سارا', details: 'کاربر، محصول، سفارش، پرداخت و رابطه‌هایشان.', process: 'از فهرستِ نیازمندی‌ها موجودیت‌ها و ارتباط‌ها استخراج و نرمال‌سازی می‌شود.', flow: fl.er1 }),
    N('A1t2', 'A1m', 'task', 'نوشتنِ مهاجرت‌ها', { icon: '✔️', summary: 'فایل‌های SQL', ins: [['نمودارِ ER']], outs: [['اسکیمای SQL']], status: 'doing', progress: 70, est_days: 2, final_days: 2.5, start_date: D(-10), assignee: 'سارا', flow: fl.er2 }),
    N('A2', 'A', 'section', 'احراز هویت', { icon: '🔑' }),
    N('A2t', 'A2', 'task', 'صفحهٔ ورود (UI)', { icon: '✔️', summary: 'فرمِ ورود و بازیابیِ رمز', ins: [['نشست کاربر']], outs: [['صفحهٔ ورود']], est_days: 2, status: 'todo' }),
    N('B', null, 'area', 'کاتالوگ', { icon: '🛍️', color: '#1f9d63', x: 330, y: 20, summary: 'محصولات و جست‌وجو', ins: [['اسکیمای SQL']], outs: [['فهرست محصولات']] }),
    N('B1', 'B', 'section', 'محصول', { icon: '📦' }),
    N('B1m', 'B1', 'module', 'مدیریتِ محصول', { icon: '📦', summary: 'ساخت و ویرایشِ محصول با تصویر', ins: [['اسکیمای SQL'], { name: 'سطحِ دسترسی', desc: '', use: '', unused: true, why: 'فعلاً همهٔ مدیرها یک دسترسی دارند؛ در نسخهٔ بعد استفاده می‌شود' }], outs: [['فهرست محصولات']], process: 'فرمِ محصول، تنوع (رنگ/سایز)، موجودی و آپلودِ تصویر.', status: 'review', progress: 90, assignee: 'مریم' }),
    N('B1t1', 'B1m', 'task', 'فرمِ محصول', { icon: '✔️', ins: [['اسکیمای SQL']], outs: [['محصولِ ذخیره‌شده']], status: 'done', progress: 100, final_days: 2, start_date: D(-3) }),
    N('B1t2', 'B1m', 'task', 'آپلودِ تصویر', { icon: '✔️', ins: [['فایلِ تصویر']], outs: [['نشانیِ تصویر']], status: 'review', progress: 80, est_days: 2 }),
    N('B1n', 'B1', 'module', 'جست‌وجو و فیلتر', { icon: '🔍', summary: 'جست‌وجوی سریع با فیلترها', ins: [['فهرست محصولات']], outs: [['نتایجِ مرتب']], est_days: 4, status: 'todo', process: 'نمایه‌سازیِ عنوان/برچسب، رتبه‌بندی و صفحه‌بندی.' }),
    N('C', null, 'area', 'خرید', { icon: '🛒', color: '#e0912b', x: -80, y: 280, summary: 'سبد، پرداخت و سفارش', ins: [['فهرست محصولات'], ['نشست کاربر']], outs: [['سفارش']] }),
    N('C1', 'C', 'module', 'سبدِ خرید', { x: 0, y: 0, icon: '🧺', summary: 'افزودن، حذف و تغییرِ تعداد', ins: [['فهرست محصولات'], ['نشست کاربر']], outs: [['اقلامِ سبد']], est_days: 3 }),
    N('C1t1', 'C1', 'task', 'افزودن به سبد', { icon: '✔️', ins: [['محصول و تعداد']], outs: [['اقلامِ سبد']], est_days: 1.5 }),
    N('C3', 'C', 'module', 'ثبت و پیگیریِ سفارش', { x: -800, y: 0, icon: '📋', summary: 'چرخهٔ سفارش', ins: [['وضعیتِ پرداخت'], ['اقلامِ سبد']], outs: [['سفارش'], ['پیامکِ وضعیت']], est_days: 5, process: 'پس از پرداختِ موفق سفارش ساخته و وضعیتش تا تحویل دنبال می‌شود.' }),
    N('D', null, 'area', 'اعلان‌ها', { icon: '🔔', color: '#14a3a3', x: -520, y: 340, summary: 'پیامک و ایمیل', ins: [['سفارش']], outs: [['پیام به مشتری']] }),
    N('D1', 'D', 'module', 'پیامکِ وضعیت', { icon: '💬', ins: [['سفارش']], outs: [['پیام']], est_days: 2 }),
    N('E', null, 'area', 'پنلِ مدیریت', { icon: '📊', color: '#7a5af8', x: -520, y: 40, summary: 'گزارش و مدیریت', ins: [['سفارش'], ['فهرست محصولات']], outs: [['گزارشِ فروش']] }),
    N('E1', 'E', 'module', 'گزارشِ فروش', { icon: '📈', ins: [['سفارش']], outs: [['گزارش']], est_days: 6 })];
  return { project: { name: 'دمو: فروشگاه اینترنتیِ بزرگ', description: 'پروژهٔ نمونه با همهٔ امکاناتِ Milo: سلسله‌مراتبِ بخش کلی ← بخش ← ماژول ← کار، پورت‌های ورودی/خروجی، ماژول‌های کتابخانه، فلوچارت، زمان‌بندی، نقطهٔ عطف، گزارش و پیوست. هر وقت خواستید پاکش کنید.',
      start_date: D(-12), target_date: D(70), ai_brief: 'PHP 8 + MySQL روی cPanel؛ رابطِ فارسی و راست‌به‌چپ؛ بدونِ کتابخانهٔ سنگین؛ همهٔ متن‌ها فارسی.' },
    nodes: nodes,
    dependencies: [
      { from: 'A', to: 'B', label: 'اسکیمای SQL', out: 'اسکیمای SQL', 'in': 'اسکیمای SQL' }, { from: 'B', to: 'C', label: '', out: 'فهرست محصولات', 'in': 'فهرست محصولات' }, { from: 'A', to: 'C', label: '', out: 'نشست کاربر', 'in': 'نشست کاربر' },
      { from: 'C', to: 'D', out: 'سفارش', 'in': 'سفارش' }, { from: 'C', to: 'E', out: 'سفارش', 'in': 'سفارش' }, { from: 'B', to: 'E', out: 'فهرست محصولات', 'in': 'فهرست محصولات' },
      { from: 'A1', to: 'A2', label: 'پایگاه‌داده ← ورود' }, { from: 'A1t1', to: 'A1t2', out: 'نمودارِ ER', 'in': 'نمودارِ ER' },
      { from: 'B1m', to: 'B1n', out: 'فهرست محصولات', 'in': 'فهرست محصولات' }, { from: 'B1t1', to: 'B1t2', label: 'پس از ذخیره' },
{ from: 'C1', to: 'C3', out: 'اقلامِ سبد', 'in': 'اقلامِ سبد' },
      { from: 'A1m', to: 'A1t1', bnd: 'in', out: 'نیازمندی‌ها', 'in': 'نیازمندی‌ها' }, { from: 'A1t2', to: 'A1m', bnd: 'out', out: 'اسکیمای SQL', 'in': 'اسکیمای SQL' },
      { from: 'C1', to: 'C1t1', bnd: 'in', out: 'فهرست محصولات', 'in': 'محصول و تعداد' }, { from: 'C1t1', to: 'C1', bnd: 'out', out: 'اقلامِ سبد', 'in': 'اقلامِ سبد' }],
    milestones: [{ title: 'پایانِ زیرساخت', date: D(8), note: 'دیتابیس و ورود آماده' }, { title: 'نسخهٔ آزمایشی', date: D(38) }, { title: 'انتشار', date: D(70), note: 'راه‌اندازی روی هاست' }],
    logs: [
      { node: 'A1t1', kind: 'note', body: 'از ۳NF شروع کردیم؛ جدولِ تنوعِ محصول جدا شد تا موجودیِ هر تنوع مستقل باشد.', date: D(-10) },
      { node: 'A1t2', kind: 'note', body: 'مهاجرتِ کاربران و محصولات نوشته شد؛ سفارش و پرداخت مانده.', date: D(-4) },
      { node: null, kind: 'note', body: 'جلسهٔ شروع: ترتیبِ ساخت = زیرساخت ← کاتالوگ ← خرید ← اعلان‌ها و پنل.', date: D(-12) }],
    work_report: [{ node: 'B1t1', status: 'done', progress: 100, summary: 'فرمِ محصول کامل شد.', how: 'فرمِ چندمرحله‌ای با اعتبارسنجیِ سمتِ سرور.', files_changed: ['admin/product-form.php', 'inc/product.php'], decisions: ['ذخیرهٔ تنوع‌ها در جدولِ جدا'], how_to_test: 'ساختِ محصولِ دارای ۳ تنوع', remaining: '', actual_days: 2, date: D(-1) }] };
}
/* ساختنِ دمو: ۱) ماژول‌های کتابخانه ۲) پروژه ۳) درجِ ماژول‌ها از کتابخانه با پیوند ۴) عکس و زمانِ کار */
function runSample() {
  var libId = 0, pid = 0, libMods = {};
  return api('library_list').then(function (j) {
    libId = j.library_id;
    var have = {}; j.modules.forEach(function (m) { have[m.title] = m.id; });
    if (have['ورود کاربر']) return j;
    return api('import', { mode: 'update', project_id: libId, doc: libDemoDoc() }).then(function () { return api('library_list'); });
  }).then(function (j) {
    j.modules.forEach(function (m) { libMods[m.title] = m.id; });
    // یک ماژولِ مشتق در کتابخانه (ارث‌بری)
    var p = libMods['پرداختِ آنلاین (بانک ملی)'] ? Promise.resolve() : api('node_copy', { src_node_id: libMods['پرداختِ آنلاین'], dst_project_id: libId, dst_parent_id: null, title: 'پرداختِ آنلاین (بانک ملی)', x: 320, y: 0 }).then(function (r) { libMods['پرداختِ آنلاین (بانک ملی)'] = r.id; });
    return p;
  }).then(function () { return api('import', { mode: 'new', doc: sampleDoc() }); }).then(function (r) {
    pid = r.project_id;
    return api('project_get', { project_id: pid });
  }).then(function (P) {
    var by = {}; P.nodes.forEach(function (n) { by[n.title] = n; });
    var cp = function (libTitle, parentTitle, x, y) { return api('node_copy', { src_node_id: libMods[libTitle], dst_project_id: pid, dst_parent_id: by[parentTitle].id, x: x, y: y }); };
    var ids = {};
    return cp('ورود کاربر', 'احراز هویت', 0, 0).then(function (a) { ids.login = a.id; return cp('پرداختِ آنلاین (بانک ملی)', 'خرید', -400, 0); })
      .then(function (b) { ids.pay = b.id; return Promise.all([
        api('dep_save', { project_id: pid, from_id: by['سبدِ خرید'].id, to_id: ids.pay, out_name: 'اقلامِ سبد', in_name: 'اقلامِ سبد' }),
        api('dep_save', { project_id: pid, from_id: ids.pay, to_id: by['ثبت و پیگیریِ سفارش'].id, out_name: 'وضعیتِ پرداخت', in_name: 'وضعیتِ پرداخت' })]); })
      .then(function () { return api('project_get', { project_id: pid }); })
      .then(function (P2) {
        var setUse = function (id, use, unused) {
          var n = P2.nodes.filter(function (x) { return x.id === id; })[0], upd = function (list) { return list.map(function (p) { var u = use[p.name]; if (!u) return p; return u.unused ? Object.assign({}, p, { unused: true, why: u.why }) : Object.assign({}, p, { use: u }); }); };
          return api('node_save', { project_id: pid, id: id, inputs: upd(n.inputs), outputs: upd(n.outputs) });
        };
        return Promise.all([
          setUse(ids.login, { 'ایمیل': 'ایمیلِ مشتری از فرمِ ورودیِ سایت', 'رمز': 'همان فرمِ ورود', 'نشست کاربر': 'به سبد خرید و پنلِ کاربر داده می‌شود', 'سطح دسترسی': { unused: true, why: 'در این پروژه همهٔ مشتری‌ها یک نقش دارند' } }),
          setUse(ids.pay, { 'مبلغ': 'جمعِ سبد پس از تخفیف', 'اقلامِ سبد': 'از ماژولِ «سبدِ خرید»', 'وضعیتِ پرداخت': 'به «ثبت و پیگیریِ سفارش» می‌رود' })]);
      })
      .then(function () {
        var n = by['طراحیِ اسکیما'], t = by['مدلِ ER'];
        var adds = [[t.id, 3600], [t.id, 1800], [n.id, 2400], [by['نوشتنِ مهاجرت‌ها'].id, 3600], [by['نوشتنِ مهاجرت‌ها'].id, 2700], [by['فرمِ محصول'].id, 3000], [0, 1500]];
        return Promise.all(adds.map(function (a) { return api('time_add', { project_id: pid, node_id: a[0], seconds: a[1] }); }));
      })
      .then(function () { return demoImage(); })
      .then(function (blob) {
        var n = by['مدلِ ER']; if (!blob) return;
        var fd = new FormData(); fd.append('project_id', pid); fd.append('node_id', n.id); fd.append('kind', 'note');
        fd.append('body', 'نمودارِ ER (عکسِ نمونه — می‌توانید عکسِ خودتان را در کادرِ یادداشت Paste کنید)'); fd.append('files[]', blob, 'er-diagram.png');
        return api('log_add', fd);
      });
  }).then(function () { return pid; });
}

/* ---------- به‌روزرسانی از گیت‌هاب ---------- */
function updDialog(u) {
  var inst = u.installed, lat = u.latest, hist = (u.history || []).slice(0, 5).map(function (h) {
    return '<div class="sm ' + (h.ok ? '' : 'crit') + '">' + (h.ok ? '✓' : '✗') + ' ' + new Date(h.at).toLocaleString('fa-IR') + ' — ' + esc(h.version || '') + (h.error ? ' — ' + esc(h.error) : '') + '</div>';
  }).join('');
  var body = '<p>نسخهٔ نصب‌شده: <b class="ltr">' + esc(inst.version) + '</b>' + (inst.at ? ' <span class="mut sm">(' + new Date(inst.at).toLocaleDateString('fa-IR') + ')</span>' : '') + '</p>' +
    '<p>آخرین نسخه در گیت‌هاب: <b class="ltr">' + esc(lat.version || '—') + '</b> ' + (u.available ? '<span class="pill s st-doing">نسخهٔ تازه آماده است</span>' : (lat.sha ? '<span class="pill s st-done">به‌روز هستید</span>' : '')) +
    (lat.msg ? '<div class="mut sm">' + esc(lat.msg) + '</div>' : '') + '</p>' +
    (u.lastError ? '<p class="crit sm">' + esc(u.lastError) + '</p>' : '') +
    (u.zip ? '' : '<p class="crit sm">افزونهٔ zip در PHP فعال نیست؛ نصب خودکار کار نمی‌کند.</p>') +
    '<div class="row"><button type="button" class="btn" data-up="check">بررسی همین حالا</button><button type="button" class="btn pri" data-up="apply"' + (u.available ? '' : ' disabled') + '>نصبِ نسخهٔ تازه</button></div>' +
    '<hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><label class="row"><input type="checkbox" name="auto"' + (u.auto ? ' checked' : '') + '> نصبِ خودکارِ نسخهٔ تازه</label>' +
    '<label class="f" style="margin-top:8px"><span>هر چند دقیقه بررسی شود</span><input type="number" min="2" name="every" value="' + u.every + '" style="width:100px"></label>' +
    (hist ? '<h2 class="sec">تاریخچه</h2>' + hist : '') + '<p class="mut sm">منبع: github.com/' + esc(u.repo) + ' (شاخهٔ main). پیش از نصب نحوِ فایل‌ها سنجیده و پشتیبان گرفته می‌شود؛ اگر سایت بالا نیامد نسخهٔ قبل برمی‌گردد. پوشهٔ data هرگز دست نمی‌خورد.</p>';
  modal({ title: 'به‌روزرسانی Milo', body: body, ok: 'ذخیرهٔ تنظیمات', noFocus: true,
    setup: function (f, close) {
      $$('[data-up]', f).forEach(function (b) { b.addEventListener('click', guard(function () {
        b.disabled = true; var act = b.getAttribute('data-up');
        return api(act === 'apply' ? 'update_apply' : 'update_check', {}).then(function (j) {
          S.updAvail = !!j.upd.available; close();
          if (act === 'apply' && j.r.updated) { toast('نسخهٔ ' + j.r.version + ' نصب شد؛ صفحه تازه می‌شود…'); setTimeout(function () { location.reload(); }, 1500); }
          else { toast(j.upd.available ? 'نسخهٔ تازه‌ای هست' : 'به‌روز هستید'); render(true); }
        }).catch(function (e) { b.disabled = false; fail(e); });
      })); });
    },
    onok: function (f) { return api('update_cfg', { auto: $('[name=auto]', f).checked, every: +$('[name=every]', f).value }).then(function () { toast('ذخیره شد'); }); } });
}
function updTick() {
  if (!S.user) return;
  api('update_tick', {}).then(function (j) {
    S.updAvail = !!j.upd.available;
    if (j.r && j.r.updated) { toast('Milo به نسخهٔ ' + j.r.version + ' به‌روز شد؛ صفحه تازه می‌شود…'); setTimeout(function () { location.reload(); }, 1800); }
    else { var t = $('.menubar'); if (t) t.outerHTML = menuBar(); }
  }).catch(function () {});
}

/* ---------- رویدادها ---------- */
function elId(el) { return +el.getAttribute('data-id'); }
var ACTS = {
  noop: function () {},
  wirenames: function () { return autoWireByName(); },
  deptwo: function (el) { var d = S.P.deps.filter(function (x) { return x.id === elId(el); })[0]; if (!d) return; return api('dep_save', { project_id: S.pid, from_id: d.from_id, to_id: d.to_id, label: d.label, out_name: d.out_name || '', in_name: d.in_name || '', two: !d.two }).then(reload); },
  portdlg: function (el) { portDialog2(elId(el), el.getAttribute('data-side'), el.getAttribute('data-name')); },
  menu: function (el, ev) {
    var mm = el.closest('.mm'), was = mm.classList.contains('open');
    $$('.mm.open').forEach(function (x) { x.classList.remove('open'); });
    if (!was) mm.classList.add('open');
    ev.stopPropagation();
  },
  editstart: function () { startEdit(); },
  editsave: function () { saveEdit(); },
  editdiscard: function () { return discardEdit(); },
  tool: function (el) {
    if (!S.editing) return toast('برای ساختن، اول «✎ ویرایش» را بزنید', true);
    if (el.getAttribute('data-off')) return toast('این ابزار در این سطح مجاز نیست — ' + (S.focus ? 'سطح‌بندی را در نوارِ قوانین ببینید' : 'در سطحِ اصلی فقط «بخش کلی» ساخته می‌شود'), true);
    var k = el.getAttribute('data-kind'); S.tool = S.tool === k ? null : k; if (S.cv) S.cv.arm(S.tool); renderContent(true);
    if (S.tool) toast('روی بوم کلیک کنید تا «' + (k === 'lib' ? 'ماژولِ کتابخانه' : E.KIND[k]) + '» قرار بگیرد');
  },
  openlib: function () { return openLibrary(); },
  libinsert: function () { if (!needEdit()) return; return libPicker(function (m) { return insertFromLib(m.id); }); },
  savelib: function (el) { var id = el && el.getAttribute && el.getAttribute('data-id') ? elId(el) : S.sel; if (id) saveToLib(id); },
  derive: function (el) { var id = el && el.getAttribute && el.getAttribute('data-id') ? elId(el) : S.sel; if (id && needEdit()) deriveModule(id); },
  revrestore: function (el) { if (!needEdit()) return; if (!confirm('ساختار به این نسخه برگردد؟ تغییراتِ بعد از آن از بین می‌رود.')) return; return api('revision_restore', { project_id: S.pid, id: elId(el) }).then(function () { toast('بازگردانی شد'); return reload(); }); },
  help: function () {
    modal({ title: '📖 راهنمای سریع', cls: 'wide', noOk: true, noFocus: true, body: '<div class="help">' +
      '<h4>🏛️ ← 📂 ← 🧩 ← ✔️ سلسله‌مراتب</h4><ul><li><b>بخش کلی</b> فقط در سطحِ اصلیِ پروژه ساخته می‌شود و «بخش» و «ماژول» می‌گیرد.</li><li><b>بخش</b> می‌تواند بخش، ماژول و کار داشته باشد.</li><li><b>ماژول</b> ابزارِ قابلِ ذخیره است؛ ورودی/خروجی دارد و می‌تواند بخش، ماژولِ دیگر و کار داشته باشد.</li><li><b>کار</b> آخرین سطح است: یک ورودی، یک خروجی، فلوچارت، تصویر و توضیح — زیرمجموعه ندارد.</li></ul>' +
      '<h4>✎ ویرایش / 💾 ذخیره</h4><p>پیش‌فرض «فقط مشاهده» است. «✎ ویرایش» را بزنید، تغییر دهید، با «💾 ذخیره» نسخه ثبت می‌شود و دوباره به مشاهده برمی‌گردید. «↩ لغو» همهٔ تغییراتِ آن نوبت را برمی‌گرداند.</p>' +
      '<h4>📚 کتابخانهٔ ماژول‌ها</h4><p>ماژولی را «ذخیره در کتابخانه» کنید و در هر پروژه «درج» کنید؛ در کتابخانه می‌شود از ماژولی «مشتق» ساخت و تغییرش داد.</p>' +
      '<h4>⏱ زمانِ طراحی</h4><p>وقتی در حالتِ ویرایش هستید و بخشی را انتخاب کرده‌اید، زمانِ فعال به آن بخش اضافه می‌شود؛ مجموعش در نوارِ پایین و تب «تاریخچه» است.</p></div>' });
  },
  shortcuts: function () {
    modal({ title: '⌨️ میان‌برها', noOk: true, noFocus: true, body: '<table class="t"><tbody><tr><td>Ctrl+E</td><td>شروعِ ویرایش</td></tr><tr><td>Ctrl+S</td><td>ذخیره و پایانِ ویرایش</td></tr><tr><td>دوبار کلیک روی بوم</td><td>بلوکِ تازه</td></tr><tr><td>دوبار کلیک روی بلوک</td><td>بازکردنِ زیرمجموعه</td></tr><tr><td>Delete</td><td>حذفِ انتخاب‌شده</td></tr><tr><td>F2 / Enter</td><td>تغییرِ نام</td></tr><tr><td>Shift+کشیدن</td><td>انتخابِ چندتایی</td></tr><tr><td>چرخ ماوس</td><td>زوم</td></tr><tr><td>Esc</td><td>لغوِ ابزار / پاک‌کردنِ انتخاب</td></tr><tr><td>Ctrl+Z / Y</td><td>برگردان / از نو (فلوچارت)</td></tr></tbody></table>' });
  },
  mapadd: function (el) { return createBlock(S.cv ? S.cv.centerOf() : { x: 0, y: 0 }, el.getAttribute('data-kind')); },
  mapzoom: function (el) { var v = el.getAttribute('data-v'); if (!S.cv) return; if (v === 'fit') S.cv.fit(); else S.cv.zoomBy(v === 'in' ? 1.25 : 0.8); },
  maplayout: function () {
    var m = mapModel(true), items = m.items.filter(function (i) { return !i.ghost; }).map(function (i) { return { id: +i.id, x: Math.round(i.x), y: Math.round(i.y) }; });
    if (!items.length) return; delete S.cvView[String(S.focus)];
    return api('nodes_bulk', { project_id: S.pid, items: items }).then(function () { toast('چیدمان انجام شد'); return reload(); });
  },
  flowedit: function (el, ev, forId) {
    var id = forId || elId(el), n = S.idx.byId.get(id); if (!n) return;
    var ro = !S.editing;
    if (ro && !(n.flow && n.flow.nodes && n.flow.nodes.length)) return toast('این بخش فلوچارتی ندارد' + (ro ? ' — برای رسم «✎ ویرایش» را بزنید' : ''), true);
    FLOW.edit({ title: n.title, flow: n.flow, toast: toast, readonly: ro, ports: flowPorts(n),
      onUnused: function (side, name, un, why) {
        var field = side === 'in' ? 'inputs' : 'outputs', nl = (S.idx.byId.get(id)[field] || []).map(function (x) { return x.name === name ? { name: x.name, desc: x.desc, use: x.use, unused: un, why: un ? why : '' } : x; });
        var b = { project_id: S.pid, id: id }; b[field] = nl; return api('node_save', b).then(function () { return loadProject(S.pid); });
      },
      onSave: function (flow) { return api('node_save', { project_id: S.pid, id: id, flow: flow }).then(function () { toast('فلوچارت ذخیره شد'); return loadProject(S.pid); }); },
      onClose: function () { render(true); } });
  },
  flowdel: function (el) { if (!confirm('فلوچارتِ این بخش پاک شود؟')) return; return api('node_save', { project_id: S.pid, id: elId(el), flow: null }).then(reload); },
  update: function () { return api('update_status').then(function (j) { updDialog(j.upd); }); },
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
  sample: function () { toast('در حالِ ساختنِ دمو…'); return runSample().then(function (pid) { S.pid = 0; S.P = null; location.hash = '#/p/' + pid + '/map'; route(); }); },
  importnew: function () { var i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = function () { if (i.files[0]) readImport(i.files[0], 0); }; i.click(); },
  pick: function (el) { var id = elId(el); if (!id) return; S.sel = id; S.drawerOpen = true; if (S.tab === 'map') S.focus = S.idx.parentOf(id); renderContent(true); renderDrawer(); },
  focus: function (el) { S.focus = elId(el); renderContent(); },
  cardgo: function (el) { var id = elId(el); S.sel = id; if (S.idx.children(id).length) S.focus = id; renderContent(); renderDrawer(); },
  ghostgo: function (el) { var id = elId(el); S.sel = id; S.focus = S.idx.parentOf(id); renderContent(); renderDrawer(); },
  closedrawer: function () { S.sel = 0; S.drawerOpen = false; renderContent(true); renderDrawer(); },
  addnode: function (el) { addNodeDialog(+el.getAttribute('data-parent') || 0); },
  toggle: function (el, ev) { ev.stopPropagation(); var id = elId(el); S.open[id] = !isOpen(id); renderContent(true); },
  expand: function (el) { var on = el.getAttribute('data-v') === '1'; S.idx.preorder.forEach(function (id) { if (S.idx.children(id).length) S.open[id] = on; }); renderContent(true); },
  mv: function (el) { return moveNode(elId(el), el.getAttribute('data-d')); },
  delnode: function (el) { var n = S.idx.byId.get(elId(el)), k = S.idx.descendants(n.id).length; if (!confirm('«' + n.title + '»' + (k ? ' و ' + FA(k) + ' زیرمجموعه‌اش' : '') + ' (با گزارش‌ها و پیوست‌ها) پاک شود؟')) return; return api('node_delete', { project_id: S.pid, id: n.id }).then(function () { S.sel = 0; return reload(); }); },
  deldep: function (el) { return api('dep_delete', { project_id: S.pid, id: elId(el) }).then(reload); },
  addio: function (el) { var k = el.getAttribute('data-k'), box = $('#io-' + k); box.insertAdjacentHTML('beforeend', ioRow(k)); box.lastChild.firstChild.focus(); },
  rmrow: function (el) { var r = el.closest('.io2'); (r || el.parentNode).remove(); },
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
var MUT = { addnode: 1, mv: 1, delnode: 1, deldep: 1, deptwo: 1, addio: 1, rmrow: 1, addms: 1, editms: 1, dellog: 1, delfile: 1, savebrief: 1, fillest: 1, applysched: 1, clearsched: 1, flowdel: 1, maplayout: 1, editproject: 1 };
document.addEventListener('click', function (e) {
  if (!(e.target.closest && e.target.closest('.mm'))) $$('.mm.open').forEach(function (x) { x.classList.remove('open'); });
  var dot = e.target.closest ? e.target.closest('#colpick .cv-dot') : null;
  if (dot && !S.editing) return;
  if (dot) { var box = dot.parentNode; $$('.cv-dot', box).forEach(function (d) { d.classList.remove('on'); }); dot.classList.add('on'); $('[name=color]', box.parentNode).value = dot.getAttribute('data-c'); return; }
  var el = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!el || el.tagName === 'INPUT' && el.type !== 'checkbox') return;
  var an = el.getAttribute('data-act'), fn = ACTS[an]; if (!fn) return;
  if (!(el.closest && el.closest('.mm-b'))) $$('.mm.open').forEach(function (x) { x.classList.remove('open'); });
  if (MUT[an] && !S.editing) { toast('برای تغییر، اول «✎ ویرایش» را بزنید', true); return; }
  if (el.type === 'checkbox') { guard(fn)(el, e); return; }
  guard(fn)(el, e);
});
document.addEventListener('submit', function (e) {
  var f = e.target; var kind = f.getAttribute('data-form'); if (!kind) return;
  e.preventDefault();
  if ((kind === 'savenode' || kind === 'adddep' || kind === 'addlog') && !S.editing) { toast('برای تغییر، اول «✎ ویرایش» را بزنید', true); return; }
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
  if (!S.editing && (ch === 'upnode' || (t.getAttribute && (t.getAttribute('data-dlabel') || t.getAttribute('data-f'))))) { return; }
  if (t.name === 'progress' && t.type === 'range') { var pv = $('#pv'); if (pv) pv.textContent = FA(t.value); }
  if (ch === 'lognode') { S.logNode = t.value; renderContent(true); }
  else if (ch === 'logkind') { S.logKind = t.value; renderContent(true); }
  else if (ch === 'upnode') {
    var fd = new FormData(); fd.append('project_id', S.pid); fd.append('node_id', t.getAttribute('data-id'));
    Array.prototype.forEach.call(t.files, function (x) { fd.append('files[]', x, x.name); });
    guard(function () { return api('upload', fd).then(function () { toast('بارگذاری شد'); return reload(); }); })();
  } else if (t.getAttribute && t.getAttribute('data-dlabel')) {
    guard(function () { return api('dep_save', { project_id: S.pid, from_id: +t.getAttribute('data-from'), to_id: +t.getAttribute('data-to'), label: t.value, out_name: t.getAttribute('data-on') || '', in_name: t.getAttribute('data-in') || '', two: t.getAttribute('data-two') === '1' }).then(function () { toast('ذخیره شد'); return loadProject(S.pid); }); })();
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
document.addEventListener('keydown', function (e) {
  var meta = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape') $$('.mm.open').forEach(function (x) { x.classList.remove('open'); });
  if (!S.P || !S.user) return;
  if (meta && (e.key === 'e' || e.key === 'E')) { e.preventDefault(); if (S.editing) toast('از قبل در حالتِ ویرایش هستید'); else startEdit(); }
  else if (meta && (e.key === 's' || e.key === 'S') && S.editing && !document.querySelector('.fl-ov')) { e.preventDefault(); saveEdit(); }
});
document.addEventListener('mouseover', function (e) {
  /* هر متنِ بریده‌شده (… یا خطِ کم‌شده) با رفتن رویش کامل نشان داده شود */
  for (var el = e.target, i = 0; el && el.nodeType === 1 && i < 4; el = el.parentElement, i++) {
    if (el.title) return;
    var cs = window.getComputedStyle(el), txt = (el.textContent || '').trim();
    if (!txt || txt.length < 8) continue;
    if ((cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) || (cs.overflow === 'hidden' && el.scrollHeight > el.clientHeight + 2 && el.children.length < 4)) { el.title = txt; return; }
  }
});
window.addEventListener('hashchange', route);
loadMe().then(function () { route(); setTimeout(updTick, 3000); setInterval(updTick, 10 * 60 * 1000); }).catch(function (e) { $('#app').innerHTML = '<div class="boot">خطا در اتصال به سرور: ' + esc(e.message) + '</div>'; });
})();
