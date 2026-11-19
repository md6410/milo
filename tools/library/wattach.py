# -*- coding: utf-8 -*-
"""درجِ تست‌های واقعیِ Weby در پروژه: روی ماژول‌های درج‌شده، و برای موضوع‌های بدونِ ماژولِ کتابخانه ماژولِ سبک با یک بخش برای هر مجموعه‌آزمون."""
import re, collections
from wtests import all_tests
from wmap import topic, TOPICS, SHIP
import wcode

AREAS_FOR = {'catalog': ('کاتالوگ و فروشندگان', None), 'order': ('سفارش و پرداخت', None), 'infra': ('زیرساخت و گسترش', None)}
NEW_AREAS = {
    'pos': ('فروشِ حضوری و کپسول', '🏪', '#b91c1c', 'فروشِ حضوریِ کارکنان (POS) و کالای درگردشِ کپسول با شارژ و مبادله'),
    'crm': ('مشتریان و ارتباط', '📇', '#0d9488', 'پروندهٔ مشتری، مخاطبین، نظر و پشتیبانی، ایمیل/نامه و ربات بله'),
    'admin': ('مدیریت داخلی و مالی', '🛠️', '#475569', 'پنل مدیر/کارکنان، نقش‌ها، منابع انسانی و گزارش مالی'),
    'seo': ('محتوا، وبلاگ و سئو', '📰', '#ca8a04', 'وبلاگ، صفحه‌ها، ویرایشگر، نقشهٔ سایت و جست‌وجو'),
}


UI_HINT = re.compile(r"(html|\$r->text|\.text\b|<[a-z]+[ >/]|class=|data-[a-z]|innerHTML|weby_src|file_get_contents|str_contains\(\$(src|html|body|page|out|s|h)\b|preg_match\([^)]*(class|href|<))", re.I)
UI_TITLE = re.compile(r"(دکمه|ستون|منو|آیکون|ریبون|بنر|ظاهر|موبایل|ریسپانسیو|چیدمان|کارت|نمایش داده|نمایش می|نشان می|نشان داده|رقم فارسی|ارقام|راست‌به‌چپ|کنترل|صفحهٔ (اصلی|محصول|سبد|تسویه))")


def is_ui(t):
    return bool(UI_HINT.search(t.get('given', '') or '')) or bool(UI_TITLE.search(t.get('title', '')))


def enrich(node, tg, ui_tests):
    """بخش‌های «ساختار فنی» و «رابط کاربری» را به ماژول اضافه می‌کند."""
    ts = wcode.tech_sections(tg)
    if ts:
        top = node.section('ساختار فنی (دیتابیس و توابع)', icon='🧱',
                           summary='جدول‌ها (DDL واقعی) و تابع‌های هر فایل با پارامتر و شرحِ یک‌خطی — برگرفته از کدِ Weby',
                           details='برای ساختنِ دوبارهٔ ماژول، همین نام‌ها و امضاها را نگه دارید؛ تست‌ها همین تابع‌ها را صدا می‌زنند.')
        for title, sm, det in ts:
            top.section(title, icon='📄', summary=sm, details=det)
    us = wcode.ui_sections(tg)
    if us or ui_tests:
        top = node.section('رابط کاربری', icon='🖥️',
                           summary='صفحه‌ها و عنصرهای رابط (عنوان، سرتیتر، فیلد، دکمه، ستون، پیام) و تست‌های رابط',
                           details='هر زیربخش یک صفحه است و فهرستِ عنصرهایش از کدِ صفحه استخراج شده؛ تست‌های این بخش آن چیزی را می‌سنجند که کاربر می‌بیند. رعایتِ متنِ فارسی، ارقامِ فارسی و چیدمانِ راست‌به‌چپ برای همهٔ صفحه‌ها الزامی است.')
        for title, rel, det in us:
            top.section(title, icon='📱', summary=rel, details=det)
        if ui_tests:
            _put(top, ui_tests, 'unit', '')


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
        ui = []
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
                _put(sec, v['tests'], kind, fname, ui)
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
                _put(dst, v['tests'], kind, fname, ui)
                total += len(v['tests'])
        enrich(m if tgt.startswith('+') else node, tgt, ui)
    return total


def _put(node, tests, kind, fname, ui=None):
    seen = {t['ref'] for t in node.tests}
    for t in tests:
        if ui is not None and is_ui(t):
            u = dict(t); u['source'] = fname; u['kind'] = u.get('kind') or kind
            ui.append(u)
            continue
        o = _clean(t, kind, fname) if fname else dict(t)
        r = o['ref']; k = 2
        while r in seen:
            r = '%s~%d' % (o['ref'], k); k += 1
        o['ref'] = r; seen.add(r)
        node.tests.append(o)


_cache = {}


def attach_to_module(root):
    """تست‌های واقعیِ Weby (و Invora) را روی خودِ ماژولِ کتابخانه می‌گذارد؛ برگرداندنِ شمار."""
    from itests import tests as invora_tests
    if 'all' not in _cache:
        g = collections.defaultdict(list)
        for fname, v in all_tests().items():
            stem = fname[2:].rsplit('.', 1)[0]
            g[topic(stem)].append((fname, stem, v))
        _cache['all'] = g
        _cache['inv'] = invora_tests()
    n = 0
    ui = []
    items = _cache['all'].get(root.title, [])
    secs = {c.title: c for c in root.children if c.kind == 'section'} if root.title == SHIP else {}
    for fname, stem, v in sorted(items):
        kind = 'e2e' if fname.endswith('.py') else 'unit'
        dst = root
        if root.title == SHIP:
            if stem.startswith('courier'): dst = secs.get('پیکِ فروشگاه', root)
            elif re.match(r'(tipax|post|ebz)', stem): dst = secs.get('حاملِ برون‌سازمانی (تیپاکس و پست)', root)
            else: dst = secs.get('میزِ ارسال', root)
        _put(dst, v['tests'], kind, fname, ui)
        n += len(v['tests'])
    enrich(root, root.title, ui)
    for t in _cache['inv'].get(root.title, []):
        root.add_test(t['title'], port=t.get('port', ''), state=t.get('state', ''), given=t['given'], expect=t['expect'], kind=t['kind'],
                      expect_kind=t['expect_kind'], ref=t.get('ref', ''), source=t['source'])
        n += 1
    return n
