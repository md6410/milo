# -*- coding: utf-8 -*-
"""ساختنِ فایل‌های library/*.pm.json از ماژول‌های tools/library/m*.py  —  python3 tools/library/build.py"""
import glob, importlib.util, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import dsl

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'library')
os.makedirs(OUT, exist_ok=True)
only = sys.argv[1:]
total = 0
for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__), 'm*.py'))):
    name = os.path.basename(f)[:-3]
    if only and not any(o in name for o in only):
        continue
    spec = importlib.util.spec_from_file_location(name, f)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    items = mod.builds() if hasattr(mod, 'builds') else [mod.build()]
    for doc, slug, title in items:
        data = dsl.export(doc, slug, title)
        dsl.dump(data, os.path.join(OUT, slug + '.pm.json'))
        kinds = {}
        for n in data['nodes']:
            kinds[n['kind']] = kinds.get(n['kind'], 0) + 1
        print('%-28s %s  گره‌ها=%d پیوندها=%d' % (slug, kinds, len(data['nodes']), len(data['dependencies'])))
        total += 1
print('ماژول‌ها:', total)
