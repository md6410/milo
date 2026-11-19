# -*- coding: utf-8 -*-
"""استخراجِ تست‌های واقعیِ Weby (tests/t_*.php و t_*.py): t('ID','نام', شرط) و check("ID","نام", شرط).
هر تست: ref=شناسه، title=نام، و اگر شرط از شکل «ورودی === نتیجه» بود given/expect جدا می‌شود."""
import os, re, glob, json

SRC = os.environ.get('WEBY_TESTS', '/tmp/wm/tests')


def _scan_call(src, start):
    """از پرانتزِ باز در src[start] تا بسته‌شدنِ متناظر؛ آرگومان‌های سطحِ اول را برمی‌گرداند."""
    assert src[start] == '('
    depth = 0; i = start; args = []; cur = []; q = None; esc = False
    n = len(src)
    while i < n:
        c = src[i]
        if q:
            cur.append(c)
            if esc: esc = False
            elif c == '\\': esc = True
            elif c == q: q = None
        else:
            if c in '\'"':
                q = c; cur.append(c)
            elif c in '([{':
                depth += 1
                if depth > 1: cur.append(c)
            elif c in ')]}':
                depth -= 1
                if depth == 0:
                    args.append(''.join(cur).strip()); return args, i
                cur.append(c)
            elif c == ',' and depth == 1:
                args.append(''.join(cur).strip()); cur = []
            else:
                cur.append(c)
        i += 1
    return None, n


def _lit(s):
    s = s.strip()
    m = re.match(r'^(?:f|b|r)?(["\'])(.*)\1$', s, re.S)
    if m: return m.group(2)
    return None


def _split_expect(expr):
    """«A === B» ← (A, B)؛ وگرنه (expr, None)."""
    depth = 0; q = None; esc = False
    for i, c in enumerate(expr):
        if q:
            if esc: esc = False
            elif c == '\\': esc = True
            elif c == q: q = None
            continue
        if c in '\'"': q = c
        elif c in '([{': depth += 1
        elif c in ')]}': depth -= 1
        elif depth == 0 and expr.startswith(('===', '=='), i) and not expr.startswith('!==', i - 1) and expr[i - 1:i] not in '!<>':
            op = '===' if expr.startswith('===', i) else '=='
            a, b = expr[:i].strip(), expr[i + len(op):].strip()
            if a and b and '&&' not in a and '||' not in a and '&&' not in b and '||' not in b and 'and ' not in b and ' or ' not in b:
                return a, b
            return expr, None
    return expr, None


def _squash(s, n):
    s = re.sub(r'\s+', ' ', s).strip()
    return s if len(s) <= n else s[:n - 1] + '…'


def parse_php(path):
    src = open(path, encoding='utf-8', errors='replace').read()
    out = []
    for m in re.finditer(r'(?m)^[ \t]*(?:t|ok|ck)\(', src):
        args, end = _scan_call(src, m.end() - 1)
        if not args or len(args) < 2: continue
        tid = _lit(args[0])
        if tid is None: continue
        n1 = _lit(args[1])
        if n1 is not None and len(args) >= 3:
            out.append(_mk(tid, n1, ','.join(args[2:]) if len(args) > 3 else args[2]))
        else:                                   # t('ID', شرط [, 'نام'])
            nm = _lit(args[2]) if len(args) >= 3 else None
            out.append(_mk(tid, nm or tid, args[1]))
    return out


def parse_chk(path, base):
    """chk(نام، نتیجهٔ واقعی، نتیجهٔ مورد انتظار [، تلورانس]) و chk_true(نام، شرط) — بدونِ شناسه؛ شناسه از نامِ فایل ساخته می‌شود."""
    src = open(path, encoding='utf-8', errors='replace').read()
    out = []
    for m in re.finditer(r'(?m)^[ \t]*(chk_true|chk)\(', src):
        args, end = _scan_call(src, m.end() - 1)
        if not args or len(args) < 2: continue
        name = _lit(args[0])
        if name is None: continue
        ref = '%s-%02d' % (base, len(out))
        if m.group(1) == 'chk_true':
            out.append({'ref': ref, 'title': name[:400], 'given': _squash(args[1], 900), 'expect_kind': 'true', 'expect': ''})
            continue
        if len(args) < 3: continue
        t = {'ref': ref, 'title': name[:400], 'given': _squash(args[1], 900), 'expect_kind': 'value', 'expect': _squash(args[2], 600)}
        if len(args) >= 4:
            try:
                tol = float(args[3]); w = float(args[2])
                t.update(expect_kind='range', min=round(w - tol, 6), max=round(w + tol, 6), expect='')
            except ValueError:
                pass
        out.append(t)
    return out


def parse_py(path):
    src = open(path, encoding='utf-8', errors='replace').read()
    out = []
    for m in re.finditer(r'(?m)^[ \t]*check\(', src):
        args, end = _scan_call(src, m.end() - 1)
        if not args or len(args) < 3: continue
        tid, name = _lit(args[0]), _lit(args[1])
        if tid is None or name is None: continue
        out.append(_mk(tid, name, args[2]))
    return out


def _mk(tid, name, expr):
    a, b = _split_expect(expr.strip())
    t = {'ref': tid[:80], 'title': name[:400]}
    if b is not None:
        t.update(given=_squash(a, 900), expect_kind='value', expect=_squash(b, 600))
    else:
        t.update(given=_squash(a, 900), expect_kind='true', expect='')
    return t


def head(path):
    """توضیحِ ابتدای فایل (کامنت/docstring) به‌عنوان شرحِ مجموعه."""
    s = open(path, encoding='utf-8', errors='replace').read(6000)
    m = re.search(r'/\*(.*?)\*/', s, re.S) if path.endswith('.php') else re.search(r'"""(.*?)"""', s, re.S)
    if not m: return ''
    lines = [re.sub(r'^[\s*=\-]+', '', l).rstrip() for l in m.group(1).splitlines()]
    return '\n'.join(l for l in lines if l.strip())[:1500]


def all_tests():
    res = {}
    for f in sorted(glob.glob(SRC + '/t_*.php')):
        key = os.path.basename(f)
        base = os.path.basename(f)[2:-4].upper()[:10]
        tests = parse_php(f) or parse_chk(f, base)
        if not tests:
            h = head(f)
            tests = [{'ref': 'AUD-' + base, 'title': (h.splitlines() or [key])[0][:300], 'given': 'php tests/' + key, 'expect_kind': 'true', 'expect': 'اسکریپت بدونِ گزارشِ خطا تمام شود', 'kind': 'integration'}]
        res[key] = {'head': head(f), 'tests': tests}
    for f in sorted(glob.glob(SRC + '/t_*.py')):
        key = os.path.basename(f)
        tests = parse_py(f)
        if not tests:
            h = head(f)
            tests = [{'ref': 'AUD-' + os.path.basename(f)[2:-3].upper()[:12], 'title': (h.splitlines() or [os.path.basename(f)])[0][:300],
                      'given': 'اجرای python3 tests/' + os.path.basename(f), 'expect_kind': 'true', 'expect': 'اسکریپت بدونِ گزارشِ خطا تمام شود', 'kind': 'e2e'}]
        res[key] = {'head': head(f), 'tests': tests}
    return res


if __name__ == '__main__':
    r = all_tests()
    tot = sum(len(v['tests']) for v in r.values())
    empty = [k for k, v in r.items() if not v['tests']]
    print('files', len(r), 'tests', tot, 'files without tests', len(empty))
    print(empty[:40])
    ids = {}
    dup = 0
    for k, v in r.items():
        for t in v['tests']:
            ids.setdefault((k, t['ref']), 0); ids[(k, t['ref'])] += 1
    print('dup ids within file', sum(1 for x in ids.values() if x > 1))
    k = 't_csrf.php'; print(json.dumps(r[k]['tests'][:2], ensure_ascii=False, indent=1))
