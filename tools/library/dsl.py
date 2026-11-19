# -*- coding: utf-8 -*-
"""
سازندهٔ ماژول‌های کتابخانهٔ Milo.

هر ماژول را با چند خط پایتون تعریف می‌کنیم و build.py آن را به فایلِ ایمپورتیِ
`library/<slug>.pm.json` تبدیل می‌کند (همان قراردادِ فایلِ پروژه). قاعده‌ها:

* هر «کار» دقیقاً یک ورودی و یک خروجی دارد و فلوچارتش از روی `steps` ساخته می‌شود؛
  شکلِ ورودی/خروجیِ فلوچارت به پورتِ همان کار وصل است (پس پورتِ بی‌هدف نمی‌ماند).
* ورودی/خروجیِ ماژول و بخش با «پیوندِ مرزی» (bnd_in / bnd_out) به زیرمجموعه‌ها وصل می‌شود.
* پیوندِ بینِ هم‌سطح‌ها با link(...) و با نامِ پورت‌ها.
* فلوچارتِ هر ماژول/بخش هم از روی همین وصل‌ها ساخته می‌شود.
"""
import json


def P(name, desc='', use='', unused=False, why=''):
    return {'name': name, 'desc': desc, 'use': use, 'unused': unused, 'why': why}


class Node:
    def __init__(self, doc, parent, kind, title, icon=None, color=None, summary='', details='', process='', tech='',
                 ins=None, outs=None, est=None, status=None, tags='', src_name=None, x=None, y=None):
        doc.n += 1
        self.doc = doc
        self.id = '%s_%d' % (doc.prefix, doc.n)
        self.parent = parent
        self.kind = kind
        self.title = title
        self.icon = icon
        self.color = color
        self.summary = summary
        self.details = details
        self.process = process
        self.tech = tech
        self.ins = list(ins or [])
        self.outs = list(outs or [])
        self.est = est
        self.tags = tags
        self.src_name = src_name
        self.x = x
        self.y = y
        self.children = []
        self.flow = None
        self.bin = []   # (port_container, child, child_port)
        self.bout = []  # (child, child_port, port_container)
        self.links = []  # (a, out, b, in, label)
        self.fin = []   # (port, child, label) فقط در فلوچارت
        self.fout = []  # (child, port, label)
        self.steps = None
        self.tests = []   # تست‌های این گره: [{ref,title,port,state,given,expect_kind,expect,min,max,unit,kind,priority,source}]
        if parent is not None:
            parent.children.append(self)
        doc.nodes.append(self)

    def add_test(self, title, port='', state='', given='', expect='', kind='unit', expect_kind='value', min=None, max=None, unit='', ref='', priority=2, source=''):
        """تست برای همین گره: «با این ورودی/پورت و در این حالت، جواب باید این مقدار (یا این بازه) باشد»."""
        t = {'title': title, 'port': port, 'state': state, 'given': given, 'expect_kind': expect_kind, 'expect': expect, 'kind': kind, 'priority': priority, 'ref': ref, 'source': source}
        if expect_kind == 'range':
            t['min'] = min; t['max'] = max; t['unit'] = unit
        elif unit:
            t['unit'] = unit
        self.tests.append(t)
        return t

    # ---- ساختنِ زیرمجموعه
    def section(self, title, icon='📂', **kw):
        assert self.kind in ('area', 'module', 'section'), 'بخش فقط زیرِ بخش‌کلی/ماژول/بخش'
        return Node(self.doc, self, 'section', title, icon=icon, **kw)

    def module(self, title, **kw):
        assert self.kind in ('area', 'module', 'section')
        return Node(self.doc, self, 'module', title, **kw)

    def task(self, title, inp, out, steps, icon='✔️', **kw):
        assert self.kind in ('module', 'section'), 'کار فقط زیرِ ماژول/بخش'
        t = Node(self.doc, self, 'task', title, icon=icon, ins=[inp], outs=[out], **kw)
        t.steps = steps
        return t

    # ---- وصل‌ها
    def bnd_in(self, port, child, child_port):
        self._need(self.ins, port); self._need(child.ins, child_port)
        self.bin.append((port, child, child_port))

    def bnd_out(self, child, child_port, port):
        self._need(child.outs, child_port); self._need(self.outs, port)
        self.bout.append((child, child_port, port))

    def fin_(self, port, child, label=''):
        self._need(self.ins, port); self.fin.append((port, child, label))

    def fout_(self, child, port, label=''):
        self._need(self.outs, port); self.fout.append((child, port, label))

    def link(self, a, out, b, inn, label='', two=False):
        self._need(a.outs, out); self._need(b.ins, inn)
        self.links.append((a, out, b, inn, label, two))
        if not b.ins[[p['name'] for p in b.ins].index(inn)].get('use'):
            b.ins[[p['name'] for p in b.ins].index(inn)]['use'] = 'از «%s»%s' % (a.title, (': ' + label) if label else '')
        if not a.outs[[p['name'] for p in a.outs].index(out)].get('use'):
            a.outs[[p['name'] for p in a.outs].index(out)]['use'] = 'به «%s»%s' % (b.title, (': ' + label) if label else '')

    # ---- ویژهٔ پروژه: درگاه‌های بخشِ کلی
    def expose_in(self, name, desc, targets, use=''):
        """ورودیِ بخش‌کلی که به چند ماژولِ درونش (ماژول, نامِ پورت) می‌رسد."""
        if not any(p['name'] == name for p in self.ins):
            self.ins.append(P(name, desc, use))
        for m, port in targets:
            self.bnd_in(name, m, port)
            pi = m.ins[[p['name'] for p in m.ins].index(port)]
            if not pi.get('use'):
                pi['use'] = 'از بیرونِ این بخش: «%s»' % name

    def expose_out(self, name, desc, source, port, use=''):
        if not any(p['name'] == name for p in self.outs):
            self.outs.append(P(name, desc, use))
        self.bnd_out(source, port, name)
        po = source.outs[[p['name'] for p in source.outs].index(port)]
        if not po.get('use'):
            po['use'] = 'به بیرونِ این بخش: «%s»' % name

    def _need(self, lst, name):
        assert any(p['name'] == name for p in lst), 'پورت «%s» در «%s» تعریف نشده' % (name, self.title)


class Doc:
    def __init__(self, prefix):
        self.prefix = prefix
        self.n = 0
        self.nodes = []
        self.links = []   # وابستگیِ بینِ بخش‌های‌کلی (سطحِ پروژه)

    def link(self, a, out, b, inn, label='', two=False):
        a._need(a.outs, out); b._need(b.ins, inn)
        self.links.append((a, out, b, inn, label, two))

    def module(self, title, **kw):
        return Node(self, None, 'module', title, **kw)

    def area(self, title, **kw):
        return Node(self, None, 'area', title, **kw)


# ============================ فلوچارت ============================
def _flow(nodes, edges):
    return {'v': 1, 'nodes': nodes, 'edges': edges}


def task_flow(t):
    inp, out = t.ins[0], t.outs[0]
    N, E = [], []
    cnt = [0]

    def add(typ, text, x, y, w=None, h=None, port=None):
        cnt[0] += 1
        nid = 'n%d' % cnt[0]
        dw = {'decision': 190, 'start': 140, 'end': 150}.get(typ, 190)
        dh = {'decision': 110, 'start': 52, 'end': 52, 'note': 96, 'db': 84}.get(typ, 66)
        N.append({'id': nid, 'type': typ, 'text': text, 'x': x, 'y': y, 'w': w or dw, 'h': h or dh, 'color': None, 'port': port})
        return nid

    def edge(a, b, label=''):
        E.append({'id': 'e%d' % (len(E) + 1), 'from': a, 'to': b, 'label': label, 'color': None, 'fa': None, 'ta': None})

    X = 220
    y = 0
    s = add('start', 'شروع', X + 25, y)
    y += 100
    i = add('io', inp['name'], X, y, port={'side': 'in', 'name': inp['name']})
    edge(s, i)
    prev, plabel = i, ''
    y += 110
    for st in t.steps:
        k = st[0]
        if k == 'd':
            d = add('decision', st[1], X - 5, y)
            edge(prev, d, plabel)
            side = add('process', st[2] if len(st) > 2 else 'خطا را برگردان', X + 330, y + 20)
            edge(d, side, 'خیر')
            e2 = add('end', 'پایانِ ناموفق', X + 355, y + 130)
            edge(side, e2)
            prev, plabel = d, 'بله'
            y += 175
        elif k == 'n':
            add('note', st[1], X + 330, y - 100, w=220, h=100)
        else:
            typ = {'p': 'process', 's': 'sub', 'db': 'db', 'io': 'io'}[k]
            nid = add(typ, st[1], X, y)
            edge(prev, nid, plabel)
            prev, plabel = nid, ''
            y += 115 if typ != 'db' else 120
    o = add('io', out['name'], X, y, port={'side': 'out', 'name': out['name']})
    edge(prev, o, plabel)
    y += 105
    e = add('end', 'پایان', X + 25, y)
    edge(o, e)
    return _flow(N, E)


def container_flow(c):
    """فلوچارتِ ماژول/بخش از روی وصل‌ها: ورودی‌ها ← زیرمجموعه‌ها ← خروجی‌ها."""
    kids = c.children
    if not kids and not (c.bin or c.bout or c.fin or c.fout):
        return None
    N, E = [], []
    cnt = [0]

    def add(typ, text, x, y, port=None, w=None, h=None):
        cnt[0] += 1
        nid = 'n%d' % cnt[0]
        N.append({'id': nid, 'type': typ, 'text': text, 'x': x, 'y': y, 'w': w or 190, 'h': h or 66, 'color': None, 'port': port})
        return nid

    def edge(a, b, label=''):
        if any(e['from'] == a and e['to'] == b and e['label'] == label for e in E):
            return
        E.append({'id': 'e%d' % (len(E) + 1), 'from': a, 'to': b, 'label': label, 'color': None, 'fa': None, 'ta': None})

    # لایه‌بندیِ زیرمجموعه‌ها بر پایهٔ link ها
    layer = {k.id: 0 for k in kids}
    for _ in range(len(kids) + 1):
        for a, o, b, i, l, tw in c.links:
            layer[b.id] = max(layer[b.id], layer[a.id] + 1)
    cols = {}
    for k in kids:
        cols.setdefault(layer[k.id], []).append(k)
    ids = {}
    cx = 330
    maxl = max(layer.values()) if layer else 0
    # راست‌به‌چپ مثلِ Milo: ورودی‌ها سمتِ راست، خروجی‌ها سمتِ چپ
    for L in sorted(cols):
        for r, k in enumerate(cols[L]):
            typ = 'sub' if k.kind != 'task' else 'process'
            ids[k.id] = add(typ, k.title, cx + (maxl - L) * 300, r * 120 + 20, w=210)
    inp_ids, out_ids = {}, {}
    for r, p in enumerate(c.ins):
        inp_ids[p['name']] = add('io', p['name'], cx + (maxl + 1) * 300, r * 100 + 10, port={'side': 'in', 'name': p['name']}, w=190)
    for r, p in enumerate(c.outs):
        out_ids[p['name']] = add('io', p['name'], 0, r * 100 + 10, port={'side': 'out', 'name': p['name']}, w=190)
    for port, child, cp in c.bin:
        edge(inp_ids[port], ids[child.id], cp if cp != port else '')
    for a, o, b, i, l, tw in c.links:
        edge(ids[a.id], ids[b.id], l or (o if o == i else o + ' ← ' + i))
    for child, cp, port in c.bout:
        edge(ids[child.id], out_ids[port], cp if cp != port else '')
    for port, child, label in c.fin:
        edge(inp_ids[port], ids[child.id], label)
    for child, port, label in c.fout:
        edge(ids[child.id], out_ids[port], label)
    return _flow(N, E)


# ============================ خروجیِ JSON ============================
def _ports(lst):
    return [{'name': p['name'], 'desc': p.get('desc', ''), 'use': p.get('use', ''), 'unused': bool(p.get('unused')), 'why': p.get('why', '')} for p in lst]


def export(doc, slug, title):
    nodes, deps = [], []
    order = 0
    for n in doc.nodes:
        order += 1
        if n.kind == 'task':
            n.flow = task_flow(n)
        elif n.children or n.bin or n.bout or n.fin or n.fout:
            n.flow = container_flow(n)
        nodes.append({
            'id': n.id, 'parent': n.parent.id if n.parent else None, 'kind': n.kind, 'title': n.title, 'order': order,
            'summary': n.summary, 'details': n.details, 'process': n.process, 'tech': n.tech,
            'inputs': _ports(n.ins), 'outputs': _ports(n.outs), 'icon': n.icon, 'color': n.color,
            'est_days': n.est, 'tags': n.tags, 'priority': 2, 'status': 'todo', 'progress': 0,
            'flow': n.flow, 'src_name': n.src_name, 'x': n.x, 'y': n.y, **({'tests': n.tests} if n.tests else {})})
        for port, child, cp in n.bin:
            deps.append({'from': n.id, 'to': child.id, 'bnd': 'in', 'out': port, 'in': cp, 'label': ''})
        for child, cp, port in n.bout:
            deps.append({'from': child.id, 'to': n.id, 'bnd': 'out', 'out': cp, 'in': port, 'label': ''})
        for a, o, b, i, l, tw in n.links:
            d = {'from': a.id, 'to': b.id, 'out': o, 'in': i, 'label': l}
            if tw:
                d['two'] = True
            deps.append(d)
    for a, o, b, i, l, tw in doc.links:
        d = {'from': a.id, 'to': b.id, 'out': o, 'in': i, 'label': l}
        if tw:
            d['two'] = True
        deps.append(d)
    deps.sort(key=lambda d: 1 if d.get('two') else 0)   # وابستگی‌های دوطرفه آخر تا بررسیِ دور را نشکنند
    root = doc.nodes[0]
    return {'schema': 'weby-projectmanager/1', 'library_module': {'slug': slug, 'title': title, 'version': 1},
            'project': {'name': 'کتابخانهٔ ماژول‌ها'}, 'nodes': nodes, 'dependencies': deps, 'milestones': [], 'logs': [], 'work_report': []}


def dump(doc_json, path):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(doc_json, f, ensure_ascii=False, separators=(',', ':'))


def use(node, notes):
    """یادداشتِ «کاربردِ همین‌جا» برای پورت‌های یک ماژولِ درج‌شده: {'نام': 'متن'} یا {'نام': ('بدون استفاده', 'دلیل')}"""
    for p in node.ins + node.outs:
        v = notes.get(p['name'])
        if v is None:
            continue
        if isinstance(v, tuple):
            p['unused'] = True
            p['why'] = v[1]
        else:
            p['use'] = v
    return node


def instance(node, src_title):
    node.src_name = src_title
    return node


# ===================== ساختنِ ماژولِ زنجیره‌ای (کوتاه‌نویسی) =====================
def T(title, steps, process, details='', tech='', est=1, out=None, icon='✔️'):
    """مشخصاتِ یک کار. out=(نام, توضیح) خروجیِ این کار؛ برای کارِ آخرِ بخش خودکار از خروجیِ بخش می‌آید."""
    return dict(title=title, steps=steps, process=process, details=details, tech=tech, est=est, out=out, icon=icon)


def S(title, ins, outs, tasks, icon='📂', summary='', details=''):
    """مشخصاتِ یک بخش. ins/outs فهرستِ P؛ ورودیِ اول به کارِ اول و خروجیِ اول از کارِ آخر می‌آید؛
    بقیهٔ ورودی/خروجی‌ها در فلوچارتِ بخش به کارِ اول/آخر وصل می‌شوند."""
    return dict(title=title, ins=ins, outs=outs, tasks=tasks, icon=icon, summary=summary, details=details)


def chain_module(doc, parent, title, icon, color, summary, ins, outs, sections, details='', tech='', est=None,
                 tags='', notes=None):
    """ماژول را از بخش‌های پشت‌سرهم می‌سازد و پورت‌ها را بر پایهٔ هم‌نامی وصل می‌کند:
    ورودیِ بخش ← خروجیِ هم‌نامِ بخشِ پیشین یا ورودیِ هم‌نامِ ماژول؛ خروجیِ ماژول ← آخرین بخشی که آن را می‌دهد."""
    m = (parent.module if parent else doc.module)(title, icon=icon, color=color, summary=summary, ins=ins, outs=outs,
                                                   details=details, tech=tech, est=est, tags=tags)
    secs = []
    for sp in sections:
        s = m.section(sp['title'], icon=sp['icon'], summary=sp['summary'], ins=list(sp['ins']), outs=list(sp['outs']),
                      details=sp['details'])
        tasks = sp['tasks']
        prev = None
        made = []
        for i, tk in enumerate(tasks):
            last = i == len(tasks) - 1
            inp = sp['ins'][0] if i == 0 else P(prev['out'][0], prev['out'][1])
            if last:
                o = sp['outs'][0]
                outp = P(o['name'], o['desc'])
            else:
                assert tk['out'], 'خروجیِ کارِ «%s» لازم است' % tk['title']
                outp = P(tk['out'][0], tk['out'][1])
            t = s.task(tk['title'], P(inp['name'], inp['desc']), outp, tk['steps'], icon=tk['icon'],
                       process=tk['process'], details=tk['details'], tech=tk['tech'], est=tk['est'])
            if made:
                pt = made[-1]
                s.link(pt, pt.outs[0]['name'], t, t.ins[0]['name'], '')
            made.append(t)
            prev = dict(out=(outp['name'], outp['desc']))
        s.bnd_in(sp['ins'][0]['name'], made[0], made[0].ins[0]['name'])
        for extra in sp['ins'][1:]:
            s.fin_(extra['name'], made[0], '')
        s.bnd_out(made[-1], made[-1].outs[0]['name'], sp['outs'][0]['name'])
        for extra in sp['outs'][1:]:
            s.fout_(made[-1], extra['name'], '')
        secs.append(s)
    # وصلِ بخش‌ها
    for j, s in enumerate(secs):
        for p in s.ins:
            nm = p['name']
            src = None
            for k in range(j - 1, -1, -1):
                if any(q['name'] == nm for q in secs[k].outs):
                    src = secs[k]; break
            if src is not None:
                m.link(src, nm, s, nm, nm if len(nm) < 24 else '')
            elif any(q['name'] == nm for q in m.ins):
                m.bnd_in(nm, s, nm)
            else:
                raise AssertionError('ورودیِ «%s» بخشِ «%s» از هیچ‌جا نمی‌آید' % (nm, s.title))
    for p in m.outs:
        src = None
        for s in secs:
            if any(q['name'] == p['name'] for q in s.outs):
                src = s
        assert src is not None, 'خروجیِ ماژول «%s» را هیچ بخشی نمی‌دهد' % p['name']
        m.bnd_out(src, p['name'], p['name'])
    # ورودیِ ماژول که هیچ بخشی نمی‌گیرد، خطاست
    for p in m.ins:
        assert any(any(q['name'] == p['name'] for q in s.ins) for s in secs), 'ورودیِ ماژولِ «%s» مصرف نمی‌شود' % p['name']
    if notes:
        use(m, notes)
    return m


def export_project(doc, slug, title, summary, name=None):
    """همان export ولی برای پروژهٔ آماده (bundled_project) نه ماژولِ کتابخانه."""
    data = export(doc, slug, title)
    data.pop('library_module', None)
    data['bundled_project'] = {'slug': slug, 'title': title, 'summary': summary, 'version': 1}
    data['project'] = {'name': name or title}
    return data
