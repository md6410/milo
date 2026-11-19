# -*- coding: utf-8 -*-
"""درجِ تست‌های واقعیِ Weby در پروژه: روی ماژول‌های درج‌شده، و برای موضوع‌های بدونِ ماژولِ کتابخانه ماژولِ سبک با یک بخش برای هر مجموعه‌آزمون."""
import re, collections
from wtests import all_tests
from wmap import topic, TOPICS, SHIP

AREAS_FOR = {'catalog': ('کاتالوگ و فروشندگان', None), 'order': ('سفارش و پرداخت', None), 'infra': ('زیرساخت و گسترش', None)}
NEW_AREAS = {
    'pos': ('فروشِ حضوری و کپسول', '🏪', '#b91c1c', 'فروشِ حضوریِ کارکنان (POS) و کالای درگردشِ کپسول با شارژ و مبادله'),
    'crm': ('مشتریان و ارتباط', '📇', '#0d9488', 'پروندهٔ مشتری، مخاطبین، نظر و پشتیبانی، ایمیل/نامه و ربات بله'),
    'admin': ('مدیریت داخلی و مالی', '🛠️', '#475569', 'پنل مدیر/کارکنان، نقش‌ها، منابع انسانی و گزارش مالی'),
    'seo': ('محتوا، وبلاگ و سئو', '📰', '#ca8a04', 'وبلاگ، صفحه‌ها، ویرایشگر، نقشهٔ سایت و جست‌وجو'),
}


def _clean(t, kind, src):
    o = dict(t)
    o.setdefault('kind', kind)
    o['source'] = src
    if o['kind'] not in ('unit', 'integration', 'e2e', 'manual', 'security', 'perf'): o['kind'] = kind
    return o


def _title_of(head, stem):
    for l in head.splitlines():
        l = l.strip()
        if len(l) >= 4 and not re.match(r'^[-=_#\s]+$', l) and not l.startswith(('اجرا', 'php ', 'python')):
            return l[:90]
    return stem


def attach(doc, by_title, areas):
    """by_title: {عنوانِ ماژول: گره}؛ areas: {کلیدِ منطقه: گرهٔ بخشِ‌کلی}."""
    allt = all_tests()
    groups = collections.defaultdict(list)           # هدف ← [(stem, entry)]
    for fname, v in allt.items():
        stem = fname[2:].rsplit('.', 1)[0]
        groups[topic(stem)].append((fname, stem, v))
    total = 0
    for tgt, items in groups.items():
        if tgt.startswith('+'):
            title, icon, summary, akey = TOPICS[tgt]
            area = areas[akey]
            n = sum(len(v['tests']) for _, _, v in items)
            m = area.module(title, icon=icon, summary=summary + ' — %d تست در %d مجموعه (برگرفته از tests/ مخزن Weby).' % (n, len(items)),
                            details=summary + '\nاین ماژول از روی آزمون‌های واقعیِ Weby ساخته شده: هر بخشِ زیرش یک مجموعه‌آزمون است و رفتارِ مورد انتظار در «تست‌ها»ی همان بخش آمده؛ برای ساختنِ دوبارهٔ قابلیت، همین تست‌ها مشخصاتِ دقیق‌اند.',
                            tags='weby،آزمون')
            for fname, stem, v in sorted(items):
                kind = 'e2e' if fname.endswith('.py') else 'unit'
                sec = m.section(_title_of(v['head'], stem), icon='🧪', summary='مجموعه‌آزمونِ ' + fname, details=v['head'], tags=stem)
                _put(sec, v['tests'], kind, fname)
                total += len(v['tests'])
        else:
            node = by_title[tgt]
            secs = {c.title: c for c in node.children if c.kind == 'section'} if tgt == SHIP else {}
            for fname, stem, v in sorted(items):
                kind = 'e2e' if fname.endswith('.py') else 'unit'
                dst = node
                if tgt == SHIP:
                    if stem.startswith('courier'): dst = secs.get('پیکِ فروشگاه', node)
                    elif re.match(r'(tipax|post|ebz)', stem): dst = secs.get('حاملِ برون‌سازمانی (تیپاکس و پست)', node)
                    else: dst = secs.get('میزِ ارسال', node)
                _put(dst, v['tests'], kind, fname)
                total += len(v['tests'])
    return total


def _put(node, tests, kind, fname):
    seen = {t['ref'] for t in node.tests}
    for t in tests:
        o = _clean(t, kind, fname)
        r = o['ref']; k = 2
        while r in seen:
            r = '%s~%d' % (o['ref'], k); k += 1
        o['ref'] = r; seen.add(r)
        node.tests.append(o)
