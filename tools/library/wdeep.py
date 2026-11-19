# -*- coding: utf-8 -*-
"""عمیق‌کردنِ ماژول‌های سبک: بخشِ «جریان‌های اصلی» با یک «کار» برای هر فایلِ مهمِ کد — ورودیِ کار = پارامترهای تابعِ اصلی، خروجی = نوعِ بازگشتی/شرحش،
مراحلِ فلوچارت = تابع‌های مهمِ فایل با شرحِ یک‌خطی؛ توضیحِ کار = سرفصلِ طراحیِ فایل (خواسته/قاعده‌ها)."""
import os, re
import wcode
from dsl import P


def _port(name, desc):
    return P(name[:90], desc[:600])


def deepen(m, tg):
    fl = wcode.flows(tg)
    if not fl: return 0
    ins, outs = [], []
    sec = m.section('جریان‌های اصلی', icon='🔄', summary='یک کار برای هر فایلِ مهمِ کد: ورودی/خروجی از امضای تابع‌ها و مراحل از شرحِ توابع',
                    details='هر کار از روی کدِ واقعیِ Weby ساخته شده؛ توضیحِ کار سرفصلِ طراحیِ همان فایل است (چرا و با چه قاعده‌هایی نوشته شد).')
    sec.ins, sec.outs = [], []
    n = 0
    used = set()
    for rel, h, fn in fl:
        stem = os.path.basename(rel)[:-4]
        pub = [f for f in fn if not f[0].startswith('_')] or fn
        main = max(pub, key=lambda f: (bool(f[3]), len(f[1])))
        pin, pout = 'ورودیِ ' + stem, 'خروجیِ ' + stem
        if pin in used: continue
        used.add(pin)
        inp = _port(pin, 'پارامترهای %s(%s)' % (main[0], main[1]) if main[1] else 'بدونِ پارامترِ صریح — از حالتِ سراسری/دیتابیس می‌خواند')
        outp = _port(pout, ('نتیجهٔ %s: %s' % (main[0], main[2])) + ((' — ' + main[3]) if main[3] else '') if main[2] or main[3] else 'اثرِ جانبی (نوشتن در دیتابیس/خروجی) — بازگشتیِ صریح ندارد')
        steps = []
        for name, args, ret, doc in pub[:8]:
            steps.append(('p', '%s(%s)%s' % (name, args[:60], (' — ' + doc) if doc else '')))
        if len(pub) > 8: steps.append(('n', 'و %d تابعِ دیگر — فهرستِ کامل در «ساختار فنی»' % (len(pub) - 8)))
        first = [l for l in h.splitlines() if l.strip()][0][:80]
        t = sec.task(first, inp, outp, steps, icon='⚙️', process='؛ '.join(f[0] for f in pub[:12]), details=h, tech='فایل: ' + rel, est=1)
        sec.ins.append(P(pin, inp['desc'])); sec.outs.append(P(pout, outp['desc']))
        sec.bnd_in(pin, t, pin); sec.bnd_out(t, pout, pout)
        m.ins.append(P(pin, inp['desc'])); m.outs.append(P(pout, outp['desc']))
        m.bnd_in(pin, sec, pin); m.bnd_out(sec, pout, pout)
        n += 1
    return n
