# -*- coding: utf-8 -*-
"""ماژولِ به‌روزرسانیِ خودکار از گیت‌هاب — برگرفته از Invora: inc/update.php (و همان الگو در Milo: inc/update.php)."""
from dsl import Doc, P, T, S, chain_module

TITLE = 'به‌روزرسانیِ خودکار از گیت‌هاب'
SLUG = 'github-updater'


def make(doc, parent=None, notes=None):
    ins = [P('تنظیماتِ به‌روزرسانی', 'مخزن، شاخه، خودکار بودن، بازهٔ بررسی (پیش‌فرض ۱۰ دقیقه)'),
           P('فرمانِ مدیر', 'دکمهٔ «بررسی الان» یا «نصب نسخهٔ تازه»')]
    outs = [P('وضعیتِ نسخه', 'نسخهٔ فعلی/تازه، آخرین بررسی، نتیجه و پیام'),
            P('نسخهٔ نصب‌شده', 'فایل‌های نسخهٔ تازه روی سایت + release.json')]
    sections = [
        S('بررسیِ نسخهٔ تازه', [ins[0], ins[1]], [P('نسخهٔ تازه', 'sha و پیامِ آخرین کامیتِ شاخه + نسخهٔ app'), P('وضعیتِ نسخه', outs[0]['desc'])], icon='🔭',
          summary='مقایسهٔ sha، بدونِ نصب',
          details='بررسی ارزان است (یک درخواستِ API)؛ نصب فقط وقتی sha فرق کند.',
          tasks=[
            T('پرسش از گیت‌هاب',
              [('d', 'خودکار روشن و از آخرین بررسی بیش از بازه گذشته؟', 'نه: همان وضعیتِ ذخیره‌شده (بدونِ شبکه)'),
               ('p', 'api.github.com/repos/<repo>/commits/<branch> ← sha، پیام'),
               ('p', 'خواندنِ نسخه از app.html یا version فایل در آن sha'),
               ('d', 'شبکه/GitHub در دسترس نیست؟', 'خطا را نگه دار؛ سایت دست‌نخورده')],
              'مسیرِ کاربر هرگز منتظرِ شبکه نمی‌ماند؛ بررسی با بازدیدِ مدیر/زمان‌بندی است.',
              tech='df_upd_latest(), df_upd_remote_version(sha), df_http(url, timeout, headers), state: update.json.', est=2,
              out=('نسخهٔ پیدا‌شده', 'sha + نسخه')),
          ]),
        S('نصبِ امن', [P('نسخهٔ تازه', 'sha و نسخه'), ins[1]], [P('نسخهٔ نصب‌شده', outs[1]['desc'])], icon='🛡️',
          summary='قفل ← دانلود ← اعتبارسنجی ← پشتیبان ← نصب ← سلامت ← بازگشت',
          details='هر مرحلهٔ ناموفق یعنی سایت دست‌نخورده یا به نسخهٔ قبلی برگردد؛ سایت هرگز نیمه‌نصب نمی‌ماند.',
          tasks=[
            T('دانلود و اعتبارسنجی',
              [('p', 'قفلِ انحصاری update.lock (flock LOCK_NB)؛ همزمانیِ دوم رد'),
               ('p', 'دریافتِ ZIP از codeload/zipball؛ بررسیِ سرایندِ «PK»'),
               ('d', 'افزونهٔ zip فعال است؟', 'خطای روشن'),
               ('p', 'خواندنِ فهرستِ فایل‌ها از deploy-files.txt؛ مسیرِ امن (بی ../، سطحِ محدود)'),
               ('d', 'فایلِ ضروری (app.html/index/api/…) یا نسخه نیست؟', 'نصب نشود'),
               ('p', 'هر فایلِ .php: token_get_all(TOKEN_PARSE) برای خطای نحوی')],
              'فقط فایل‌هایی که نسخه صراحتاً در فهرست آورده نصب می‌شوند؛ داده (data/، config.local.php) هرگز.',
              tech='df_upd_apply(latest, by)، df_upd_safe_rel(path).', est=4, out=('نسخهٔ معتبر', 'فایل‌ها در حافظه')),
            T('پشتیبان، نصب، سلامت',
              [('p', 'پشتیبانِ فایل‌های فعلی در releases/previous'),
               ('p', 'نوشتنِ اتمیک هر فایل؛ .htaccess ادغام می‌شود نه جایگزین (df_upd_merge_htaccess)'),
               ('p', 'release.json: sha، نسخه، زمان، چه کسی، پیام'),
               ('p', 'opcache_invalidate روی فایل‌های نوشته‌شده'),
               ('p', 'سلامت: index.php?df_health=1 باید «ok» بدهد و api.php/d.php پاسخِ مورد انتظار'),
               ('d', 'سلامت ناموفق یا هر خطا در نصب؟', 'df_upd_restore: بازگرداندنِ پشتیبان + حذفِ فایل‌های تازه + پیامِ «نسخهٔ قبلی برگردانده شد»')],
              'سه سطح محافظت: نحو (پیش از نصب)، سلامت (پس از نصب)، بازگشت (خودکار).',
              details='در Milo همین الگو با index.php?health=1 و api.php?a=me (حاویِ "csrf") است؛ هر دو باید کار کنند وگرنه هر به‌روزرسانی برمی‌گردد.',
              tech='df_upd_write، df_upd_health()، df_upd_restore، df_upd_run(force, install, by).', est=5),
          ]),
    ]
    return chain_module(doc, parent, TITLE, '⬆️', '#16a34a',
        'نصبِ نسخهٔ تازه از شاخهٔ اصلیِ گیت‌هاب با اعتبارسنجی، پشتیبان، بررسیِ سلامت و بازگشتِ خودکار.',
        ins, outs, sections,
        details=('هر push به main یک انتشار است. فهرستِ فایل‌ها (deploy-files.txt) تنها منبعِ «چه چیزی نصب شود» است؛ داده و پیکربندیِ محلی هرگز لمس نمی‌شود.\n'
                 'نکتهٔ آزمون: روی نسخهٔ آزمایشی حتماً مخزن را با پیکربندیِ محلی عوض کنید وگرنه به‌روزرسانی فایل‌های آزمایشی را با نسخهٔ واقعی بازنویسی می‌کند.'),
        tech='Invora: inc/update.php (df_upd_*)؛ Milo: inc/update.php. فایل‌ها: deploy-files.txt، inc/release.json، data/update.json.',
        est=10, tags='به‌روزرسانی، گیت‌هاب، rollback', notes=notes)


def build():
    d = Doc('up'); make(d)
    return d, SLUG, TITLE
