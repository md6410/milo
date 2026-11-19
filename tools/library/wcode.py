# -*- coding: utf-8 -*-
"""استخراج از کدِ واقعیِ Weby: (۱) ساختار فنی = جدول‌ها (DDL) و تابع‌ها (نام، پارامتر، شرحِ یک‌خطی)؛ (۲) رابط کاربری = برای هر صفحه عنوان، سرتیترها، فیلدها، دکمه‌ها، ستون‌های جدول، پیام‌ها.
نگاشتِ فایل ← ماژول با همان قاعده‌های wmap (روی نامِ فایل)."""
import os, re, glob, collections
from wmap import topic, SHIP, SELLER, PRODUCT, WH, MAP, PAYCORE, AUTH, EXT, ORDER, PRINT, SMS

REPO = os.environ.get('WEBY_REPO', '/tmp/wm')
FA = re.compile(r'[؀-ۿ]')
PAGE_DIRS = ['', 'admin', 'staff', 'seller', 'courier', 'includes/parts']
SKIP_ROOT = {'config-sample.php', 'boot.php', 'cron.php', 'install.php', 'setup-config.php', 'check.php'}


def _read(p):
    return open(p, encoding='utf-8', errors='replace').read()


def _stem(path):
    b = os.path.basename(path)[:-4]
    return re.sub(r'^(schema-|admin-)', '', b)


def _files():
    out = []
    for d in PAGE_DIRS:
        for f in sorted(glob.glob(os.path.join(REPO, d, '*.php'))):
            if d == '' and os.path.basename(f) in SKIP_ROOT: continue
            out.append(('page', os.path.relpath(f, REPO)))
    for f in sorted(glob.glob(REPO + '/includes/*.php')) + sorted(glob.glob(REPO + '/includes/modules/*/*.php')) + sorted(glob.glob(REPO + '/includes/modules/*/admin/*.php')):
        out.append(('lib', os.path.relpath(f, REPO)))
    for f in sorted(glob.glob(REPO + '/modules/*/*.php')):
        out.append(('lib', os.path.relpath(f, REPO)))
    return out


# قاعده‌های ویژهٔ فایل‌هایی که نامشان به موضوع نمی‌خورد: (پوشه، الگوی نام) → هدف
FILE_RULES = [
    ('courier', r'.*', SHIP), ('seller', r'.*', SELLER),
    ('staff', r'^(attendance|leave)$', '+HR'), ('staff', r'^crm$', '+CRM'), ('staff', r'^(dispatch|quick|sale-amend|my-sales|org-addr)$', '+POS'), ('staff', r'.*', '+STAFF'),
    ('admin', r'^(agencies|agency-settings)$', '+MKT'), ('admin', r'^(attributes|categories|discounts|avail|offsets)$', PRODUCT),
    ('admin', r'^(inventory|item-codes)$', WH), ('admin', r'^(packaging|delivery)$', SHIP), ('admin', r'^(warranty.*|contact-watch|corp-clients)$', '+CRM'),
    ('admin', r'^(home-.*|slides|banners|fonts|theme-editor|menu|notices?|notice-seen)$', '+UX'), ('admin', r'^(authors|questions)$', '+SEO'),
    ('admin', r'^(bank-accounts|ledger-audit|fx)$', '+FIN'), ('admin', r'^(holidays|employees?|employee-view)$', '+HR'),
    ('admin', r'^(cities|org-addresses)$', MAP), ('admin', r'^(letters?|letter-.*|mail|messages)$', '+MSG'),
    ('admin', r'^(users|user-view|my-security|login.*|logout|setup)$', AUTH), ('admin', r'^(ext|modules)$', EXT), ('admin', r'^gateways$', PAYCORE),
    ('admin', r'^docx-import$', '+RICH'), ('admin', r'.*', '+INFRA'),
    ('', r'^(apay|bpay|cpay|transfer|verify|sbx-.*)$', PAYCORE), ('', r'^(auth|logout)$', AUTH), ('', r'^(shop|pc)$', PRODUCT), ('', r'^agencies$', '+MKT'),
    ('', r'^(contact)$', '+CRM'), ('', r'^(letter-print|mail-open)$', '+MSG'), ('', r'^(guide|index|favicon|manifest|jcal)$', '+UX'), ('', r'^(robots|author)$', '+SEO'),
    ('', r'^station$', PRINT), ('', r'^crate$', SHIP), ('', r'.*', '+INFRA'),
    ('includes', r'^(acc-profit|ledger-audit|sale-fees)$', '+FIN'), ('includes', r'^(admin-settings-index|manager-notify)$', '+STAFF'), ('includes', r'^agencies$', '+MKT'),
    ('includes', r'^(auth|otp-gate|user-delete)$', AUTH), ('includes', r'^(avail|shop|mini-cart)$', PRODUCT), ('includes', r'^shop-order$', ORDER),
    ('includes', r'^(brand|identity|header|footer|site-.*|i18n|home.*|content|nav-menu|pwa|trust-marks|seed-posts|panel-notices|support-widget)$', '+UX'),
    ('includes', r'^(call-survey|contact.*|corp-clients|warranty)$', '+CRM'), ('includes', r'^(mailbox|messengers|letter.*|mailer|notify-mail)$', '+MSG'), ('includes', r'^notify-rules$', SMS),
    ('includes', r'^(city-pick|city-search|iran-map|locations|org-address|ofee-box)$', MAP), ('includes', r'^(contracts|labor-rules|weekhours)$', '+HR'),
    ('includes', r'^(delivery|express-slot|packaging|parcels|tracking)$', SHIP), ('includes', r'^gateways$', PAYCORE), ('includes', r'^stage-sms$', SMS),
    ('includes', r'^(ext-install|features.*)$', EXT), ('includes', r'^(docx-import|content)$', '+RICH'), ('includes', r'^(db|db-revive|functions|loader|requirements|security-headers|server-health|setup-.*|data-tools|_missing|file-.*|filemanager|fonts|form-draft|slug-history|tag-guard|xlsx|imaging|secret-field|schema-.*)$', '+INFRA'),
]


def _module_of(rel):
    parts0 = rel.split('/')
    d0 = parts0[0] if len(parts0) > 1 else ''
    st0 = os.path.basename(rel)[:-4]
    if rel.startswith(('includes/modules/', 'modules/')):
        return _module_of2(rel)
    t0 = topic(re.sub(r'^(schema-|admin-)', '', st0))
    if t0 != '+MISC' and not (d0 in ('staff', 'seller', 'courier')):
        return t0
    for d, pat, tg in FILE_RULES:
        if d == d0 and re.match(pat, st0):
            return tg
    return _module_of2(rel)


def _module_of2(rel):
    """رابطِ فایل → هدف. برای includes/modules/<x>/… از نامِ پوشه کمک می‌گیرد."""
    parts = rel.split('/')
    stem = os.path.basename(rel)[:-4]
    if rel.startswith('includes/modules/') or rel.startswith('modules/'):
        stem = parts[2] if parts[0] == 'includes' else parts[1]
    return topic(re.sub(r'^(schema-|admin-)', '', stem))


# ---------------------------------------------------------------- توابع
FUNC = re.compile(r'(?m)^(?P<doc>(?:/\*\*?.*?\*/\s*)?)function\s+(?P<name>[A-Za-z_]\w*)\s*\((?P<args>[^)]*)\)\s*(?::\s*(?P<ret>\??[\w\\|]+))?', re.S)


def _doc1(doc):
    if not doc: return ''
    for l in doc.splitlines():
        l = re.sub(r'^[\s/*=\-]+|[\s*/]+$', '', l).strip()
        if len(l) > 3 and not l.startswith(('@', '---')): return l[:150]
    return ''


def functions(rel):
    src = _read(os.path.join(REPO, rel))
    out = []
    for m in FUNC.finditer(src):
        args = re.sub(r'\s+', ' ', m.group('args')).strip()[:150]
        out.append((m.group('name'), args, m.group('ret') or '', _doc1(m.group('doc'))))
    return out


# ---------------------------------------------------------------- جدول‌ها
DDL = re.compile(r"CREATE TABLE IF NOT EXISTS (\w+)\s*\((.*?)\n\)\s*(?:\$\w+|ENGINE[^\"';]*)", re.S)


def _tables():
    t = {}
    for f in sorted(glob.glob(REPO + '/includes/schema*.php')) + sorted(glob.glob(REPO + '/includes/modules/*/schema.php')):
        for m in DDL.finditer(_read(f)):
            body = re.sub(r'\n\s*\n', '\n', m.group(2)).strip()
            t[m.group(1)] = (os.path.relpath(f, REPO), body)
    return t


# ---------------------------------------------------------------- رابط
def _txt(s):
    s = re.sub(r'<\?.*?\?>', '⟨…⟩', s, flags=re.S)
    s = re.sub(r'<[^>]+>', ' ', s)
    s = re.sub(r'&nbsp;|&zwnj;', ' ', s)
    return re.sub(r'\s+', ' ', s).strip(' ⟨…⟩')


def _uniq(xs, n):
    seen = [];
    for x in xs:
        x = x.strip()
        if x and FA.search(x) and len(x) < 160 and x not in seen: seen.append(x)
    return seen[:n]


def page_ui(rel):
    src = _read(os.path.join(REPO, rel))
    ui = {}
    title = ''
    m = re.search(r"\$(?:pageTitle|title|page_title)\s*=\s*'([^']+)'", src) or re.search(r'<title>(.*?)</title>', src, re.S)
    if m: title = _txt(m.group(1))
    ui['عنوان'] = [title] if title and FA.search(title) else []
    ui['سرتیتر'] = _uniq([_txt(x) for x in re.findall(r'<h[1-4][^>]*>(.*?)</h[1-4]>', src, re.S)], 14)
    fields = []
    for m in re.finditer(r'<(input|select|textarea)\b([^>]*)>', src, re.S):
        a = m.group(2)
        nm = re.search(r'name="([^"<]+)"', a)
        if not nm or nm.group(1) in ('_token', 'csrf'): continue
        ty = re.search(r'type="(\w+)"', a); ph = re.search(r'placeholder="([^"<]*)"', a)
        if ty and ty.group(1) == 'hidden': continue
        fields.append('%s (%s)%s' % (nm.group(1), ty.group(1) if ty else m.group(1), (' — ' + _txt(ph.group(1))) if ph and FA.search(ph.group(1)) else ''))
    ui['فیلدها'] = list(dict.fromkeys(fields))[:40]
    labels = [_txt(x) for x in re.findall(r'<label[^>]*>(.*?)</label>', src, re.S)]
    ui['برچسب‌های فرم'] = _uniq(labels, 25)
    btn = [_txt(x) for x in re.findall(r'<button[^>]*>(.*?)</button>', src, re.S)] + [_txt(x) for x in re.findall(r'<a[^>]*class="[^"]*btn[^"]*"[^>]*>(.*?)</a>', src, re.S)] + re.findall(r'<input[^>]*type="submit"[^>]*value="([^"<]+)"', src)
    ui['دکمه‌ها'] = _uniq(btn, 25)
    ui['ستون‌های جدول'] = _uniq([_txt(x) for x in re.findall(r'<th[^>]*>(.*?)</th>', src, re.S)], 30)
    ui['پیام‌ها'] = _uniq(re.findall(r"flash\(\s*'([^']+)'", src) + re.findall(r'flash\(\s*"([^"]+)"', src), 20)
    return {k: v for k, v in ui.items() if v}


# ---------------------------------------------------------------- نمایه
_idx = {}


def index():
    if _idx: return _idx
    files = _files()
    tables = _tables()
    byt = collections.defaultdict(lambda: {'pages': [], 'libs': [], 'tables': []})
    cnt = {t: collections.Counter() for t in tables}
    for kind, rel in files:
        tg = _module_of(rel)
        if kind == 'page':
            ui = page_ui(rel)
            if ui: byt[tg]['pages'].append((rel, ui))
        else:
            if '/schema' in rel or os.path.basename(rel).startswith('schema'):
                continue
            fn = functions(rel)
            if fn: byt[tg]['libs'].append((rel, fn))
        src = _read(os.path.join(REPO, rel))
        for t in tables:
            n = len(re.findall(r'(?:FROM|INTO|UPDATE|JOIN|TABLE)\s+`?%s\b' % re.escape(t), src))
            if n: cnt[t][tg] += n
    for t, (f, body) in tables.items():
        tg = cnt[t].most_common(1)[0][0] if cnt[t] else topic(_stem(f))
        byt[tg]['tables'].append((t, f, body))
    _idx.update(byt)
    return _idx


# ---------------------------------------------------------------- متن‌ها
def tech_sections(tg):
    """[(عنوان، خلاصه، توضیح)] برای بخشِ «ساختار فنی»."""
    d = index().get(tg)
    if not d: return []
    out = []
    if d['tables']:
        txt = []
        for t, f, body in sorted(d['tables']):
            txt.append('### جدول %s  (%s)\nCREATE TABLE %s (\n%s\n)' % (t, f, t, body))
        out.append(('جدول‌های دیتابیس', '%d جدول با ستون‌ها و کلیدها (DDL واقعی)' % len(d['tables']), '\n\n'.join(txt)[:58000]))
    for rel, fn in d['libs']:
        lines = ['فایل: %s' % rel, '']
        for name, args, ret, doc in fn:
            lines.append('- %s(%s)%s%s' % (name, args, (': ' + ret) if ret else '', ('  — ' + doc) if doc else ''))
        out.append(('توابع — ' + os.path.basename(rel), '%d تابع (نام، پارامتر، شرحِ یک‌خطی)' % len(fn), '\n'.join(lines)[:58000]))
    return out


def ui_sections(tg):
    d = index().get(tg)
    if not d: return []
    out = []
    for rel, ui in d['pages']:
        lines = ['صفحه: %s' % rel, '']
        for k, v in ui.items():
            lines.append('**%s:**' % k)
            lines += ['- ' + x for x in v]
            lines.append('')
        t = (ui.get('عنوان') or ui.get('سرتیتر') or [os.path.basename(rel)])[0]
        out.append((t[:90], rel, '\n'.join(lines)[:58000]))
    return out


if __name__ == '__main__':
    ix = index()
    for tg, d in sorted(ix.items(), key=lambda x: -len(x[1]['libs'])):
        print('%-50s pages=%3d libs=%3d funcs=%4d tables=%3d' % (tg[:50], len(d['pages']), len(d['libs']), sum(len(f) for _, f in d['libs']), len(d['tables'])))


# ---------------------------------------------------------------- سرفصلِ فایل‌ها (روایتِ طراحی)
def header(rel, n=5000):
    src = _read(os.path.join(REPO, rel))
    m = re.search(r'<\?php\s*(?:declare\([^)]*\);\s*)?/\*+(.*?)\*/', src, re.S)
    if not m: return ''
    lines = [re.sub(r'^[\s*=\-]+', '', l).rstrip() for l in m.group(1).splitlines()]
    lines = [l for l in lines if l.strip() and not re.match(r'^[-=_\s]+$', l)]
    return '\n'.join(lines)[:n]


def flows(tg, limit=10):
    """برای هر فایلِ کتابخانه‌ایِ ماژول: (عنوان، سرفصل، فهرستِ تابع‌های مهم، پارامترهای تابعِ اول). فقط فایل‌هایی با سرفصلِ فارسی."""
    d = index().get(tg)
    if not d: return []
    out = []
    for rel, fn in d['libs']:
        h = header(rel)
        if not FA.search(h): continue
        out.append((rel, h, fn))
    out.sort(key=lambda x: -len(x[2]))
    return out[:limit]
