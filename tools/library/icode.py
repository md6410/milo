# -*- coding: utf-8 -*-
"""استخراج از کدِ Invora: «ساختار فنی» (تابع‌های app.html و PHP، فایل‌های دادهٔ JSON) و «رابط کاربری» (عنصرهای هر تابعِ render و صفحه‌های PHP)."""
import os, re, glob
import wcode

REPO = os.environ.get('INVORA_REPO', '/home/user/md6410/invora')

# عنوانِ ماژول ← (الگوی نامِ تابعِ app.html، فایل‌های PHP)
MAP = {
    'فاکتورساز (پیش‌فاکتور، فاکتور، فاکتور رسمی)': (r'^(render(Editor|Docs|Items|EdPreview|Paper|Trash)|ed[A-Z]\w*|calcDoc|commitDoc|official\w*|makeOfficial|t(Official|Formal|Band|Minimal|Frame)|pg[A-Z]\w*|itemsTable|buildCtx|docStatus|newDoc|cloneDoc|convertDoc|on(Doc|Item)Field|doc[A-Z]\w*|lockCard\w*|rev\w*|signsHtml|wm|numWords|moneyWords|fmtDocNumber|peekSeq|previewNumber|nationalCodeOk|legalIdOk|idOk|fx\w*|applyProduct|convertProductPrice)$', []),
    'صدورِ گروهیِ اسناد از روی یک سندِ مرجع': (r'^(batch\w*|render(Batch\w*)|ensureSeed|seedDelta|dateOffsets|createBatch|syncBatch|bTypes|printSel|inPrint|priceSig|dateSig|hasPriceRule|baseDateFor|curBatch|bDoc)$', []),
    'تقویمِ شمسی، تعطیلات و نرخِ دلار': (r'^(jalCal|g2d|d2g|j2d|d2j|isLeapJ|monthLen|jStr|parseJ|todayJdn|holiday\w*|shiftOff|applyRule|parseHolidayText|tehran\w*|renderToday|extractTime|clockText|refreshHolidays|upcomingHolidays|reroundFx|hasDatedYear|nowTs)$', []),
    'حسابداریِ واریز، هزینه و سهمِ شرکا': (r'^(acc\w*|renderAcc|onAccField|readReceipt|payBadge|docPay\w*|docSortVal|rial)$', []),
    'لینکِ دانلودِ رمزدار و تأییدِ اصالتِ سند': (r'^(openShareModal|share\w*|vf\w*|gal\w*|xf\w*|crc32|makeZip|devDetails|parseUA|renderGal\w*|prvSaveFields|prod\w*)$', ['d.php', 'v.php', 'media.php', 'inc/verify.php', 'inc/gallery.php']),
    'چاپگر مرکزی (ایستگاهِ چاپ)': (r'^(prn\w*|pj\w*|ps[A-Z]\w*|paperMatch|docsPrintCss)$', ['print-api.php', 'inc/print.php']),
    'ساخت و چاپِ برچسب': (r'^(lbl\w*|renderLabels?\w*|env\w*|addr\w*|label\w*|qr\w+)$', []),
    'ورودِ بی‌رمز (OTP، Passkey، کپچا)': (r'^(pk\w*|dev\w*|srvLogout|srvAuthLost|ask\w*Password|renderLock\w*|lock\w*)$', ['index.php', 'auth.php', 'inc/passkey.php', 'inc/captcha.php']),
    'ذخیرهٔ رمزشده (AES-256 با کلیدِ کاربر)': (r'^(enc\w*|dec\w*|crypto\w*|backup\w*|restore\w*|exportBackup\w*|importBackup\w*|b64\w*|dfb\w*|kdf\w*)$', ['inc/crypto.php']),
    'ارسال پیامک با SMS.IR': (r'^(sms\w*|shareSmsBox|mobileOf)$', ['inc/sms.php']),
    'به‌روزرسانیِ خودکار از گیت‌هاب': (r'^(upd\w*|check\w*Update\w*|renderUpd\w*|update\w*)$', ['inc/update.php']),
    'نامه‌های رسمی': (r'^(lt\w*|letter\w*)$', ['inc/mail.php']),
    'اموال و استهلاک': (r'^(as[A-Z]\w*|renderAssets?)$', []),
    'کارمندان، حضور و حقوق': (r'^(hr[A-Z]\w*|renderHr)$', []),
    'اسنادِ شرکت و فایل‌ها': (r'^(cdoc\w*|renderFiles?|renderCdocs?)$', []),
    'کالا، پروفایل و کاتالوگ': (r'^(prv\w*|renderProd\w*|prod\w*|renderCrud|crud\w*)$', []),
    'انبار و موجودی (inv)': (r'^(inv[A-Z]\w*|renderInv\w*)$', []),
    'فروش حضوری (صندوق)': (r'^(pos[A-Z]\w*|renderPos)$', []),
    'مشتریان و دفتر تلفن': (r'^(pb\w*|cust\w*|renderPhone|renderCustomers?|telHref|smsHref|norm\w*|accProfile\w*|accDossier\w*|accCust\w*)$', []),
    'کاربران و نقش‌ها': (r'^(can|isAdminUser|offApplyPerms|OFF\w*|off[A-Z]\w*|renderUsers?|renderSettings|srvCardsHtml|onGlobalField)$', ['api.php']),
}

FUNC = re.compile(r'(?m)^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)')
FA = re.compile(r'[؀-ۿ]')


def _src():
    return open(os.path.join(REPO, 'app.html'), encoding='utf-8', errors='replace').read()


def _funcs():
    s = _src()
    ms = list(FUNC.finditer(s))
    out = []
    for i, m in enumerate(ms):
        end = ms[i + 1].start() if i + 1 < len(ms) else len(s)
        out.append((m.group(1), m.group(2).strip(), s[m.start():end]))
    return out


def _txt(x):
    x = re.sub(r'\$\{[^}]*\}', '⟨…⟩', x)
    x = re.sub(r'<[^>]+>', ' ', x)
    return re.sub(r'\s+', ' ', x).strip(' ⟨…⟩')


def _uniq(xs, n):
    r = []
    for x in xs:
        x = _txt(x)
        if x and FA.search(x) and len(x) < 140 and x not in r: r.append(x)
    return r[:n]


def ui_of(body):
    ui = {}
    ui['سرتیتر'] = _uniq(re.findall(r'<h[1-4][^>]*>(.*?)</h[1-4]>', body, re.S), 12)
    ui['دکمه‌ها'] = _uniq(re.findall(r'<button[^>]*>(.*?)</button>', body, re.S), 24)
    ui['برچسب‌های فرم'] = _uniq(re.findall(r'<label[^>]*>(.*?)</label>', body, re.S), 30)
    ui['ستون‌های جدول'] = _uniq(re.findall(r'<th[^>]*>(.*?)</th>', body, re.S), 24)
    ui['placeholder'] = _uniq(re.findall(r'placeholder="([^"]+)"', body), 20)
    ui['راهنما/پیام'] = _uniq(re.findall(r"toast\('([^']+)'", body) + re.findall(r'class="(?:mut|sm|note)[^"]*">([^<]{8,120})<', body), 16)
    return {k: v for k, v in ui.items() if v}


def tech_ui(title):
    if title not in MAP: return [], []
    pat, php = MAP[title]
    rx = re.compile(pat)
    fs = [f for f in _funcs() if rx.match(f[0])]
    tech, ui = [], []
    if fs:
        lines = ['فایل: app.html (همهٔ منطقِ رابط و کار با داده در یک فایل)', '']
        for n, a, b in fs: lines.append('- %s(%s)' % (n, a[:120]))
        tech.append(('توابع — app.html', '%d تابع' % len(fs), '\n'.join(lines)[:58000]))
    for rel in php:
        p = os.path.join(REPO, rel)
        if not os.path.isfile(p): continue
        src = open(p, encoding='utf-8', errors='replace').read()
        old = wcode.REPO; wcode.REPO = REPO
        try:
            fn = wcode.functions(rel); hd = wcode.header(rel, 3000); pg = wcode.page_ui(rel) if rel in ('index.php', 'd.php', 'v.php', 'auth.php') else {}
        finally:
            wcode.REPO = old
        data = sorted(set(re.findall(r"df_(?:read|update)\('([\w\-]+\.json)'", src)))
        lines = ['فایل: ' + rel, '']
        if hd: lines += [hd, '']
        if data: lines += ['فایل‌های دادهٔ سرور: ' + '، '.join(data), '']
        lines += ['- %s(%s)%s%s' % (n, a, (': ' + r) if r else '', ('  — ' + d) if d else '') for n, a, r, d in fn]
        tech.append(('PHP — ' + os.path.basename(rel), '%d تابع' % len(fn), '\n'.join(lines)[:58000]))
        if pg:
            ui.append((os.path.basename(rel), rel, '\n'.join(['صفحه: ' + rel, ''] + sum([['**%s:**' % k] + ['- ' + x for x in v] + [''] for k, v in pg.items()], []))))
    for n, a, b in fs:
        u = ui_of(b)
        if sum(len(v) for v in u.values()) >= 3:
            lines = ['تابعِ رندر: %s(%s)' % (n, a[:80]), '']
            for k, v in u.items(): lines += ['**%s:**' % k] + ['- ' + x for x in v] + ['']
            t = (u.get('سرتیتر') or [n])[0]
            ui.append((t[:90], n, '\n'.join(lines)[:58000]))
    return tech, ui[:30]


if __name__ == '__main__':
    for t in MAP:
        te, ui = tech_ui(t); print('%-45s tech=%d ui=%d' % (t[:45], len(te), len(ui)))
