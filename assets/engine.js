/* موتور: ایندکس درخت، زمان‌بندی (مسیر بحرانی)، خروجی هوش مصنوعی. بدون DOM — در node هم آزموده می‌شود. */
(function (W) {
  var J = W.JAL;
  var STATUS = { todo: 'انجام‌نشده', doing: 'در حال انجام', review: 'در بازبینی', done: 'انجام‌شد', blocked: 'مسدود', hold: 'متوقف' };
  var KIND = { area: 'بخش کلی', section: 'بخش', module: 'ماژول', task: 'کار' };
  var PRIO = { 1: 'بالا', 2: 'عادی', 3: 'پایین' };

  function build(P) {
    var byId = new Map(), kids = new Map(), out = new Map(), inn = new Map();
    P.nodes.forEach(function (n) { byId.set(n.id, n); });
    P.nodes.forEach(function (n) {
      var k = n.parent_id && byId.has(n.parent_id) ? n.parent_id : 0;
      if (!kids.has(k)) kids.set(k, []);
      kids.get(k).push(n.id);
    });
    P.deps.forEach(function (d) {
      if (!byId.has(d.from_id) || !byId.has(d.to_id)) return;
      if (!out.has(d.from_id)) out.set(d.from_id, []);
      if (!inn.has(d.to_id)) inn.set(d.to_id, []);
      out.get(d.from_id).push(d); inn.get(d.to_id).push(d);
    });
    var idx = { P: P, byId: byId, kids: kids, out: out, inn: inn, _chain: new Map(), _leaves: new Map() };
    idx.children = function (id) { return kids.get(id || 0) || []; };
    idx.isLeaf = function (id) { return !(kids.get(id) || []).length; };
    idx.parentOf = function (id) { var n = byId.get(id); return n && n.parent_id && byId.has(n.parent_id) ? n.parent_id : 0; };
    idx.chain = function (id) { // ریشه ← خودِ گره
      if (idx._chain.has(id)) return idx._chain.get(id);
      var c = [], x = id, g = 0;
      while (x && g++ < 100) { c.unshift(x); x = idx.parentOf(x); }
      idx._chain.set(id, c); return c;
    };
    idx.depth = function (id) { return idx.chain(id).length - 1; };
    idx.descendants = function (id) {
      var r = [], st = [id];
      while (st.length) { var x = st.pop(); (kids.get(x) || []).forEach(function (c) { r.push(c); st.push(c); }); }
      return r;
    };
    idx.leavesOf = function (id) {
      if (idx._leaves.has(id)) return idx._leaves.get(id);
      var r = idx.isLeaf(id) ? [id] : idx.descendants(id).filter(idx.isLeaf);
      idx._leaves.set(id, r); return r;
    };
    idx.preorder = [];
    (function walk(p) { (kids.get(p) || []).forEach(function (c) { idx.preorder.push(c); walk(c); }); })(0);
    idx.pos = new Map(); idx.preorder.forEach(function (id, i) { idx.pos.set(id, i); });
    idx.pathText = function (id, sep) {
      return idx.chain(id).map(function (x) { return byId.get(x).title; }).join(sep || ' › ');
    };
    return idx;
  }

  function heuristic(n) {
    var d = n.kind === 'task' ? 1 : 2;
    d += 0.5 * ((n.inputs || []).length + (n.outputs || []).length);
    d += (n.process || '').length / 400 + (n.details || '').length / 800;
    return Math.max(0.5, Math.round(d * 2) / 2);
  }
  function dur(n) { return n.final_days != null ? n.final_days : (n.est_days != null ? n.est_days : heuristic(n)); }

  /* زمان‌بندی روی برگ‌ها، تجمیع روی والدها */
  function schedule(idx) {
    var P = idx.P, today = J.today();
    var pStart = J.isoToDay(P.project.start_date); if (pStart == null) pStart = today;
    var leaves = idx.preorder.filter(idx.isLeaf);
    var preds = new Map(), succs = new Map();
    leaves.forEach(function (l) { preds.set(l, new Set()); succs.set(l, new Set()); });
    P.deps.forEach(function (d) {
      if (!idx.byId.has(d.from_id) || !idx.byId.has(d.to_id)) return;
      idx.leavesOf(d.to_id).forEach(function (t) {
        idx.leavesOf(d.from_id).forEach(function (f) { if (f !== t) { preds.get(t).add(f); succs.get(f).add(t); } });
      });
    });
    // کان (Kahn) با اولویتِ ترتیبِ درخت
    var indeg = new Map(), order = [], done = new Set(), cycle = false;
    leaves.forEach(function (l) { indeg.set(l, preds.get(l).size); });
    var left = leaves.slice();
    while (left.length) {
      var pick = -1;
      for (var i = 0; i < left.length; i++) if (indeg.get(left[i]) === 0) { pick = i; break; }
      if (pick < 0) { cycle = true; pick = 0; }
      var l = left.splice(pick, 1)[0];
      order.push(l); done.add(l);
      succs.get(l).forEach(function (s) { indeg.set(s, indeg.get(s) - 1); });
    }
    var L = new Map();
    order.forEach(function (id) {
      var n = idx.byId.get(id), dd = Math.max(1, Math.ceil(dur(n)));
      var ps = 0, phase = 1, mx = pStart;
      preds.get(id).forEach(function (p) {
        var q = L.get(p); if (!q) return;
        if (q.ef > mx) mx = q.ef;
        if (q.phase + 1 > phase) phase = q.phase + 1;
      });
      var manual = J.isoToDay(n.start_date);
      var es = manual != null ? manual : Math.ceil(mx);
      L.set(id, { id: id, es: es, dd: dd, ef: es + dd, phase: phase, manual: manual != null, conflict: manual != null && manual < mx,
        isLeaf: true, dur: dur(n), est: n.est_days, fin: n.final_days, heur: heuristic(n), progress: n.progress, status: n.status });
    });
    var end = pStart;
    L.forEach(function (v) { if (v.ef > end) end = v.ef; });
    // عقب‌گرد برای شناورِ زمانی
    var lf = new Map();
    for (var i2 = order.length - 1; i2 >= 0; i2--) {
      var id2 = order[i2], v = L.get(id2), m = end;
      succs.get(id2).forEach(function (s) { var q = lf.get(s); if (q != null && q - L.get(s).dd < m) m = q - L.get(s).dd; });
      lf.set(id2, m);
      v.slack = (m - v.dd) - v.es;
      v.crit = v.slack <= 0;
    }
    // تجمیع
    var info = new Map();
    L.forEach(function (v, id) { info.set(id, v); });
    var total = 0, wsum = 0, psum = 0, doneCount = 0;
    L.forEach(function (v) { total += v.dur; var w = Math.max(0.5, v.dur); wsum += w; psum += w * v.progress; if (v.status === 'done') doneCount++; });
    for (var k = idx.preorder.length - 1; k >= 0; k--) {
      var id3 = idx.preorder[k];
      if (idx.isLeaf(id3)) continue;
      var ls = idx.leavesOf(id3).map(function (x) { return L.get(x); }).filter(Boolean);
      var es3 = Infinity, ef3 = -Infinity, w3 = 0, p3 = 0, d3 = 0, dn = 0, doing = 0, blocked = 0, crit = false;
      ls.forEach(function (x) {
        if (x.es < es3) es3 = x.es; if (x.ef > ef3) ef3 = x.ef;
        var w = Math.max(0.5, x.dur); w3 += w; p3 += w * x.progress; d3 += x.dur;
        if (x.status === 'done') dn++; if (x.status === 'doing' || x.status === 'review') doing++; if (x.status === 'blocked') blocked++;
        if (x.crit) crit = true;
      });
      var pr = w3 ? Math.round(p3 / w3) : 0;
      var st = !ls.length ? 'todo' : dn === ls.length ? 'done' : blocked ? 'blocked' : (doing || dn || pr > 0) ? 'doing' : 'todo';
      info.set(id3, { id: id3, es: es3, ef: ef3, dd: ef3 - es3, progress: pr, dur: d3, status: st, isLeaf: false, crit: crit,
        leafCount: ls.length, leafDone: dn });
    }
    var today0 = today;
    L.forEach(function (v) { v.overdue = v.status !== 'done' && v.ef - 1 < today0; });
    info.forEach(function (v) { if (!v.isLeaf) v.overdue = v.status !== 'done' && v.ef - 1 < today0 && v.progress < 100; });
    var root = { progress: wsum ? Math.round(psum / wsum) : 0, total: total, leaves: leaves.length, done: doneCount };
    return { info: info, order: order, pStart: pStart, end: end, cycle: cycle, today: today, root: root, preds: preds };
  }

  /* ---------- خروجی هوش مصنوعی ---------- */
  var AI_INSTRUCTIONS = [
    'This file is the complete specification of a software/project plan exported from "Project Manager" (schema weby-projectmanager/1).',
    'HIERARCHY RULES (must be kept, the importer enforces them): kinds are area (بخش کلی), section (بخش), module (ماژول), task (کار). Top level (parent=null) contains ONLY areas. An area contains sections and modules. A section contains sections, modules and tasks. A module contains sections, modules (used inside it) and tasks. A task is the last level: it has NO children and exactly one input and one output. Areas, sections and modules may have several inputs/outputs. A dependency may name the ports it connects: {from,to,out:"<output name of from>",in:"<input name of to>"}. "src_name" marks a node copied from the shared module library - keep it.',
    'HOW TO READ IT: "nodes" is a tree ("parent" = id of the parent node, null = top level). kind=section groups things; kind=module is a unit of work with inputs, outputs and a process; kind=task is a concrete detail. "summary", "details", "process" and "tech" are the authoritative requirements. "dependencies" {from,to,label}: node "to" needs what node "from" produces (label = what flows between them), so build "from" first. "build_order" lists the leaf nodes in a suggested implementation order with phases (nodes in the same phase are independent). "project.ai_brief" holds the stack, conventions and constraints you must respect. "logs" is the history of notes and decisions; "files" lists attachments (names only).',
    'YOUR TASK: implement the project the way this plan describes it, following build_order unless the user says otherwise. Do not silently drift from the plan: if you must deviate, record it (see RULE 2).',
    'RULE 1 - STRUCTURE CHANGES: if you change the structure in any way (add, remove, rename or split nodes; change inputs/outputs/process; add or remove dependencies; change estimates or milestones) you MUST deliver an updated copy of THIS file in the same schema so the user can import it back. Keep every existing "id" unchanged. New nodes get a temporary string id such as "new-1" (usable as "parent" and in dependencies). To remove something set "deleted": true on it. Returning only the changed items is accepted; the full file is preferred. Never change "schema".',
    'RULE 2 - WORK REPORT: after you finish (or partly finish) work, add an entry to the top-level "work_report" array for EVERY node you worked on, and deliver the file. Entry format: {"node": <id>, "status": "todo|doing|review|done|blocked|hold", "progress": 0-100, "summary": "...", "how": "how it was implemented", "files_changed": ["path"], "decisions": ["..."], "how_to_test": "...", "deviations": "...", "remaining": "...", "actual_days": optional number}. Be honest: mark done only what really works. The user imports the file and the timeline, progress and per-node history update automatically.',
    'DELIVERY: always hand the result back as a downloadable UTF-8 JSON file named "<project>-updated.pm.json" (valid JSON, no comments) plus a short summary in chat. Write all human-readable text in the language of the existing content (Persian unless the file says otherwise).',
    'VISUAL FIELDS: x, y, color (#rrggbb) and icon on a node are canvas layout hints - keep them unchanged (new nodes may omit them). "flow" is an optional flowchart that explains the node\'s process graphically: {"nodes":[{"id","type","text","x","y","w","h"}],"edges":[{"id","from","to","label"}]} with type one of start,end,process,decision,io,sub,db,note,text (edge labels on a decision are usually yes/no). Follow it when implementing; if you change the process, update the flow too, and you may add a flow to a node that has none.',
    'Never invent ids for existing nodes, never drop the "id" of an existing item, and never put secrets or passwords in the file.'
  ];

  function nodeOut(idx, n) {
    return { id: n.id, parent: n.parent_id || null, order: n.sort, kind: n.kind, title: n.title, summary: n.summary, details: n.details,
      inputs: n.inputs, outputs: n.outputs, process: n.process, tech: n.tech, priority: n.priority, status: n.status, progress: n.progress,
      est_days: n.est_days, final_days: n.final_days, start_date: n.start_date, done_date: n.done_date, assignee: n.assignee, tags: n.tags,
      src_name: n.src_name || null, color: n.color || null, icon: n.icon || null, x: n.x == null ? null : n.x, y: n.y == null ? null : n.y, flow: n.flow || null };
  }

  function buildExport(idx, sch) {
    var P = idx.P, p = P.project;
    var bo = sch.order.map(function (id) {
      var v = sch.info.get(id), n = idx.byId.get(id);
      return { id: id, title: n.title, path: idx.pathText(id), phase: v.phase, status: n.status,
        depends_on: Array.from(sch.preds.get(id) || []), suggested_days: v.dur, planned_start: J.dayToIso(v.es), planned_end: J.dayToIso(v.ef - 1), critical: !!v.crit };
    });
    return {
      schema: 'weby-projectmanager/1',
      exported_at: new Date().toISOString(),
      _instructions_for_ai: AI_INSTRUCTIONS,
      _example_new_node: { id: 'new-1', parent: 12, kind: 'task', title: '...', summary: '', details: '', inputs: [{ name: '...', desc: '...' }], outputs: [], process: '', tech: '', status: 'todo', progress: 0, est_days: 1 },
      _example_work_report: { node: 12, status: 'done', progress: 100, summary: '...', how: '...', files_changed: ['src/x.php'], decisions: ['...'], how_to_test: '...', deviations: '', remaining: '', actual_days: 2 },
      project: { id: p.id, name: p.name, description: p.description, start_date: p.start_date, target_date: p.target_date, status: p.status, ai_brief: p.ai_brief },
      build_order: bo,
      nodes: P.nodes.map(function (n) { return nodeOut(idx, n); }),
      dependencies: P.deps.map(function (d) { return { from: d.from_id, to: d.to_id, label: d.label, out: d.out_name || null, 'in': d.in_name || null }; }),
      milestones: P.milestones.map(function (m) { return { id: m.id, title: m.title, date: m.date, done: !!m.done, note: m.note }; }),
      logs: P.logs.slice().reverse().map(function (l) { return { id: l.id, node: l.node_id, kind: l.kind, body: l.body, author: l.author, date: l.created_at }; }),
      files: P.files.map(function (f) { return { id: f.id, node: f.node_id, name: f.name, size: f.size }; }),
      work_report: []
    };
  }

  function buildMarkdown(idx, sch) {
    var P = idx.P, p = P.project, L = [];
    L.push('# ' + p.name, '');
    if (p.description) L.push(p.description, '');
    L.push('> **For AI:** the machine-readable file (`*.pm.json`) is the file to import/export. ' + AI_INSTRUCTIONS[3].replace(/^RULE 1 - /, 'Rule 1: '), '');
    if (p.ai_brief) L.push('## ملاحظات فنی پروژه (ai_brief)', '', p.ai_brief, '');
    L.push('## ترتیب پیشنهادیِ ساخت', '');
    sch.order.forEach(function (id, i) {
      var v = sch.info.get(id), n = idx.byId.get(id);
      L.push((i + 1) + '. [فاز ' + v.phase + '] ' + idx.pathText(id) + ' — ' + v.dur + ' روز' + (v.crit ? ' (بحرانی)' : ''));
    });
    L.push('', '## ساختار و جزئیات', '');
    idx.preorder.forEach(function (id) {
      var n = idx.byId.get(id), d = idx.depth(id);
      L.push(new Array(Math.min(d + 2, 6) + 1).join('#') + ' ' + n.title + '  `#' + n.id + '` — ' + KIND[n.kind] + ' — ' + STATUS[n.status] + ' ' + n.progress + '%');
      if (n.summary) L.push('', n.summary);
      if (n.details) L.push('', n.details);
      if (n.inputs.length) { L.push('', '**ورودی‌ها:**'); n.inputs.forEach(function (x) { L.push('- ' + x.name + (x.desc ? ': ' + x.desc : '')); }); }
      if (n.outputs.length) { L.push('', '**خروجی‌ها:**'); n.outputs.forEach(function (x) { L.push('- ' + x.name + (x.desc ? ': ' + x.desc : '')); }); }
      if (n.process) L.push('', '**پردازش:**', '', n.process);
      if (n.flow && W.FLOW) { var mm = W.FLOW.mermaid(n.flow); if (mm) L.push('', '**فلوچارت:**', '', '```mermaid', mm, '```'); }
      if (n.tech) L.push('', '**نکات فنی:**', '', n.tech);
      var di = (idx.inn.get(id) || []);
      if (di.length) { L.push('', '**وابسته به:**'); di.forEach(function (x) { L.push('- ' + idx.byId.get(x.from_id).title + ' `#' + x.from_id + '`' + ((x.out_name || x.in_name) ? ' [' + (x.out_name || '?') + ' ← ' + (x.in_name || '?') + ']' : '') + (x.label ? ' (' + x.label + ')' : '')); }); }
      L.push('');
    });
    return L.join('\n');
  }

  W.ENG = { STATUS: STATUS, KIND: KIND, PRIO: PRIO, build: build, schedule: schedule, heuristic: heuristic, dur: dur,
    buildExport: buildExport, buildMarkdown: buildMarkdown, AI_INSTRUCTIONS: AI_INSTRUCTIONS };
})(typeof window !== 'undefined' ? window : global);
