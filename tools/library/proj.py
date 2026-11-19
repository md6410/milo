# -*- coding: utf-8 -*-
"""کمکیِ ساختِ پروژه از ماژول‌های کتابخانه: هر ماژول با make(doc, parent) درون یک بخش‌کلی «درج» می‌شود (کپیِ عمیق + src_name)."""
import importlib.util, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from dsl import Doc, P, instance, use

_cache = {}


def load(name):
    if name not in _cache:
        spec = importlib.util.spec_from_file_location(name, os.path.join(os.path.dirname(__file__), name + '.py'))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        _cache[name] = m
    return _cache[name]


def place(area, make, title, notes=None):
    """make(doc, parent, notes) را اجرا می‌کند و ریشهٔ کپی را «نمونه‌ای از ماژولِ کتابخانه» علامت می‌زند."""
    m = make(area.doc, area, None)
    instance(m, title)
    if notes:
        use(m, notes)
    return m


def finish_area(area):
    """هر پورتِ ماژولِ درجی که هنوز جایی وصل نشده، درگاهی از خودِ بخش‌کلی می‌شود (تماسِ بخش با بیرون)."""
    wired = set()
    for a, o, b, i, l, tw in area.links:
        wired.add((a.id, 'out', o)); wired.add((b.id, 'in', i))
    for port, child, cp in area.bin:
        wired.add((child.id, 'in', cp))
    for child, cp, port in area.bout:
        wired.add((child.id, 'out', cp))
    for m in [c for c in area.children if c.kind == 'module']:
        for p in list(m.ins):
            if (m.id, 'in', p['name']) in wired:
                continue
            nm = p['name'] if not any(q['name'] == p['name'] for q in area.ins) else '%s — %s' % (m.title, p['name'])
            area.expose_in(nm, p['desc'], [(m, p['name'])])
        for p in list(m.outs):
            if (m.id, 'out', p['name']) in wired:
                continue
            nm = p['name'] if not any(q['name'] == p['name'] for q in area.outs) else '%s — %s' % (m.title, p['name'])
            area.expose_out(nm, p['desc'], m, p['name'])
