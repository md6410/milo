# -*- coding: utf-8 -*-
"""ماژول‌های پرداختِ آنلاین — برگرفته از Weby: includes/gateways.php و includes/modules/{snapppay,digipay}.
هستهٔ پرداخت یک ماژول است و هر درگاه یک ماژولِ جدا با همان قرارداد (شروع ← انتقال ← بازگشت ← تأیید)."""
from dsl import Doc, P, T, S, chain_module

CORE_TITLE = 'هستهٔ پرداختِ آنلاین'
CORE_SLUG = 'pay-core'


def core(doc, parent=None, notes=None):
    ins = [P('درخواستِ پرداخت', 'آرایه‌ای با id و total (تومان) و code و mobile — سفارش، فاکتورِ دستی یا مابه‌التفاوتِ اصلاح'),
           P('تنظیماتِ درگاه‌ها', 'کلیدِ فعال/غیرفعالِ هر درگاه، کلیدهای هر درگاه، حالتِ آزمایشی، فهرستِ «پنهان در لینکِ پرداخت»'),
           P('بازگشتِ درگاه', 'پارامترهای GET/POST که بانک به نشانیِ بازگشت می‌فرستد (به‌همراهِ id و نامِ درگاه در همان نشانی)'),
           P('نشانیِ تراکنشِ درگاه', 'پاسخِ ماژولِ درگاهِ انتخاب‌شده به start: redirect یا فرمِ POST'),
           P('نتیجهٔ تأییدِ درگاه', 'پاسخِ ماژولِ درگاهِ انتخاب‌شده به verify: {ok, ref, error}')]
    outs = [P('نشانیِ انتقال به درگاه', 'redirect (آدرس) یا فرمِ POST (آدرس + فیلدها) برای فرستادنِ مشتری به بانک'),
            P('نتیجهٔ پرداخت', '{ok, ref, error} — ok فقط وقتی true است که سرورِ درگاه تأیید کرده باشد'),
            P('گزارشِ رویدادهای پرداخت', 'ردیفِ لاگِ start/verify با درگاه، مبلغ، authority و پارامترهای بازگشت (بدونِ شمارهٔ کارت)')]
    sections = [
        S('انتخاب و شروعِ پرداخت', [ins[0], ins[1], ins[3]],
          [P('نشانیِ انتقال به درگاه', outs[0]['desc']),
           P('تراکنشِ ثبت‌شده', 'authority/توکنِ درگاه که کنارِ سفارش ذخیره شد تا هنگامِ تأیید با آن مقایسه شود'),
           P('رویدادِ شروع', 'ردیفِ لاگِ «start» با درگاه و مبلغ')],
          icon='🚀', summary='درگاه‌های در دسترس، مقصد، مبلغ به ریال، ساختنِ تراکنش', details='همهٔ درگاه‌ها یک قرارداد دارند: gw_start(key, order) ← {ok, method, url, fields, error}. صدازننده فقط همین را می‌شناسد.',
          tasks=[
            T('فهرستِ روش‌های پرداختِ در دسترس',
              [('p', 'gw_catalog(): فهرستِ ثابتِ درگاه‌ها با برچسب/توضیح/لوگو'),
               ('d', 'درگاه «آماده» است؟ (فعال + همهٔ کلیدهایش پر)', 'در فهرست نیاید (یا فقط در نصبِ بی‌درگاه حالتِ آزمایشی)'),
               ('d', 'مبلغ در بازهٔ مجازِ آن درگاه است؟ (مثلاً اعتباری/قسطی حداقل و حداکثر دارد)', 'نشان بده ولی غیرفعال با دلیل (gw_eligible_url)'),
               ('p', 'فیلترِ «پنهان در لینکِ پرداخت» (gw_link_filter) فقط برای لینکِ پرداختِ مستقیم')],
              'از روی کاتالوگ و تنظیمات، همان روش‌هایی نشان داده می‌شود که واقعاً کار می‌کنند. «پرداخت در محل» همیشه مستقل از کلیدها است.',
              details='قاعدهٔ طلایی: درگاهِ نیمه‌تنظیم هرگز به مشتری نشان داده نشود؛ مشتری با خطای بانک روبه‌رو می‌شود نه پیامِ شما.',
              tech='gw_catalog, gw_ready(key), gw_test_ok(key), gw_available(), gw_link_filter(), gw_order_choices(order).',
              est=1.5, out=('روشِ پرداختِ انتخاب‌شده', 'کلیدِ درگاه (zarinpal/saman/mellat/jibit/snapppay/digipay/cod) که مشتری برگزید')),
            T('تشخیصِ مقصد و مبلغِ ریالی',
              [('d', 'شناسه بزرگ‌تر از صفر است؟', 'شناسهٔ منفی: فاکتورِ دستی؛ کوچک‌تر از -OAMEND_ID_BASE: مابه‌التفاوتِ اصلاح'),
               ('p', 'gw_target_by_id(id) ← {kind: order|invoice|amend, id}'),
               ('p', 'مبلغِ ریالی = total(تومان) × ۱۰ (gw_rial)'),
               ('n', 'همهٔ درگاه‌ها ریال می‌گیرند؛ currency را صریح IRR بفرست تا به واحدِ پیش‌فرضِ پنلِ درگاه وابسته نباشد')],
              'موتورِ درگاه فقط یک آرایه با id و total می‌خواهد؛ چیزهایی که «سفارش» نیستند هم با کدگذاریِ علامت و بازهٔ شناسه از همان موتور رد می‌شوند.',
              details='چرا علامتِ شناسه: gw_callback فقط یک عدد می‌گیرد، نه کلِ آرایه. تشخیص در یک تابع مشترک است تا سه نسخهٔ کمی‌متفاوت دیر یا زود عقب نماند («پول رسید ولی جایی ثبت نشد»).',
              tech='gw_target_by_id(int), gw_target_of(order), gw_rial(order), OAMEND_ID_BASE=2e9.', est=1,
              out=('مقصد و مبلغِ ریالی', '{kind,id} و مبلغ به ریال — ورودیِ ساختنِ تراکنش')),
            T('ساختنِ تراکنش و ذخیرهٔ authority',
              [('d', 'محیطِ تست (sandbox) روشن است؟', 'authority ساختگی SBX-… + انتقال به sbx-pay.php'),
               ('d', 'درگاه آماده نیست ولی حالتِ آزمایشی مجاز است؟', 'مسیرِ test=1 هر مقصد (verify.php / invoice-verify.php / apay.php)'),
               ('p', 'ماژولِ همان درگاه: gw_<key>_start(order) ← {ok, method, url, fields}'),
               ('db', 'gw_save_authority: ذخیرهٔ authority کنارِ سفارش/فاکتور/اصلاح'),
               ('p', 'gw_log_add("start", …) با ok و مبلغ'),
               ('n', 'نشانیِ بازگشت را gw_callback(id, key) بساز: شناسه و نامِ درگاه را به نشانی می‌دهد تا بازگشت بتواند مقصد را بیابد')],
              'کلیدِ درگاه با یک switch به تابعِ همان ماژول می‌رود؛ نتیجه (redirect یا فرمِ POST) همان‌طور برمی‌گردد و ماجرای ثبت و لاگ یک‌جاست.',
              details='در محیطِ تست «درگاهِ ساختگی» جای بانک می‌نشیند اما بازگشت از همان شاخهٔ واقعیِ gw_verify می‌گذرد، نه میان‌بُر؛ پس آزمون همان کدِ تولید را می‌بیند.',
              tech='gw_start(key, order), gw_save_authority, gw_callback, gw_log_add, sbx_on().', est=2,
              out=None),
          ]),
        S('بازگشت و تأیید', [ins[2], P('تراکنشِ ثبت‌شده', 'authority/توکنِ ذخیره‌شده همین پرداخت'), ins[1], ins[4]],
          [P('نتیجهٔ تأیید', '{ok, ref, error} از gw_verify')],
          icon='🔁', summary='یافتنِ مقصد از نشانیِ بازگشت، نگهبان‌ها و تأیید با سرورِ بانک',
          details='اصلِ امنیتی: هیچ پارامترِ بازگشتی «حکمِ پرداخت» نیست؛ فقط پاسخِ سرورِ درگاه به verify مرجع است.',
          tasks=[
            T('دریافتِ بازگشت و یافتنِ تراکنش',
              [('p', 'id و نامِ درگاه از نشانیِ بازگشت'),
               ('d', 'نامِ درگاه شناخته‌شده است؟', 'پاسخِ «درگاهِ نامعتبر» و توقف'),
               ('p', 'gw_target_by_id(id) ← مقصد (order/invoice/amend)'),
               ('db', 'خواندنِ ردیف (سفارش/فاکتور/اصلاح) و authority ذخیره‌شده'),
               ('d', 'پیش‌تر پرداخت‌شده است؟', 'بازگشتِ دوباره را بدونِ تأییدِ دوباره موفق نشان بده')],
              'بازگشت با یک آدرس و چند پارامتر می‌آید؛ ابتدا مقصد و ردیفِ پرداخت پیدا می‌شود و اگر قبلاً نهایی شده، کاری تکرار نمی‌شود.',
              details='صفحهٔ بازگشت را مشتری هر وقت بخواهد دوباره باز می‌کند و بعضی بانک‌ها دو بار صدا می‌زنند؛ مسیر باید idempotent باشد.',
              tech='verify.php (سفارش)، invoice-verify.php (فاکتور)، apay.php (اصلاح) — هر سه gw_verify را صدا می‌زنند.', est=1.5,
              out=('تراکنشِ پیداشده', 'ردیفِ پرداخت + پارامترهای بازگشت')),
            T('نگهبان‌های ضدِ تقلب (رسیدِ یکتا و مبلغ)',
              [('d', 'پارامترِ شناسهٔ بازگشتی با authority ذخیره‌شده یکی است؟', 'رد: «با این سفارش هم‌خوانی ندارد»'),
               ('d', 'مبلغِ بازگشتی (اگر آمده) با مبلغِ سفارش برابر است؟', 'رد پیش از هر درخواستی به بانک'),
               ('db', 'gw_ref_once(order, ref): رسید فقط یک‌بار (ستون gw_ref روی orders)'),
               ('n', 'فاکتور/اصلاح شناسهٔ منفی دارند و ستونِ gw_ref روی orders است؛ برایشان نگهبان بی‌صدا رد می‌شود')],
              'رسیدِ بانکی در سطحِ بانک یکتاست. اگر همان رسید برای سفارشِ دیگری ثبت شده، یا خطاست یا کسی رسیدِ دیگری را جا زده: کالا نباید دوباره تحویل شود.',
              details='رسید همین‌جا، پیش از پرسیدن از بانک، به سفارش گره می‌خورد تا دو درخواستِ همزمان هر دو از نگهبان رد نشوند (Double Spending، مستندِ سپ بند ۷).',
              tech='gw_ref_once(order, ref) ← null یا پیامِ خطا.', est=1.5,
              out=('بازگشتِ معتبر', 'پارامترهایی که از نگهبان‌ها گذشته‌اند')),
            T('تأیید با سرورِ درگاه',
              [('p', 'gw_verify(key, order, req)'),
               ('d', 'محیطِ تست؟', 'gw_sbx_verify: SBX- و مقایسهٔ hash_equals با authority ذخیره‌شده'),
               ('p', 'ماژولِ همان درگاه: verify (مبلغ، کدها، settle/reverse)'),
               ('p', 'نتیجه: {ok, ref شمارهٔ پیگیریِ بانکی, error فارسی}'),
               ('p', 'لاگِ «verify» با پارامترهای بازگشت (حداکثر ۱۲۰ نویسهٔ هر کدام، بدونِ PHPSESSID)')],
              'تنها مرجعِ «پرداخت شد» پاسخِ سرورِ بانک است و مبلغِ تأییدشده باید با مبلغِ سفارش برابر باشد؛ در غیر این صورت کالا تحویل نمی‌شود.',
              details='اگر مبلغ نخواند: پرداخت موفق اعلام نمی‌شود و به مشتری گفته می‌شود وجه به حسابش برمی‌گردد (برخی بانک‌ها reverse دارند).',
              tech='gw_verify, gw_sbx_verify, gw_log_add("verify").', est=2),
          ]),
        S('ثبت و گزارش', [P('نتیجهٔ تأیید', 'نتیجهٔ gw_verify'), P('رویدادِ شروع', 'لاگِ start')],
          [P('گزارشِ رویدادهای پرداخت', outs[2]['desc']), P('نتیجهٔ پرداخت', outs[1]['desc'])],
          icon='🧾', summary='اعمالِ نتیجه روی مقصد و لاگِ قابلِ پیگیری',
          details='لاگِ پرداخت باید بتواند «چرا این پرداخت ناموفق شد» را بی‌حدس پاسخ دهد.',
          tasks=[
            T('اعمالِ نتیجه روی مقصد',
              [('d', 'پرداخت موفق است؟', 'وضعیتِ سفارش را «در انتظارِ پرداخت» نگه دار و پیامِ خطا را نشان بده'),
               ('db', 'سفارش: paid + ref؛ فاکتور: پرداخت‌شده؛ اصلاح: تسویهٔ مابه‌التفاوت'),
               ('p', 'اعلان‌ها (پیامک/ایمیل) و مرحلهٔ بعدیِ سفارش'),
               ('n', 'ثبت و اعلان در تراکنشِ دیتابیس و پشتِ نگهبانِ تکراری')],
              'نتیجهٔ تأییدشده به مقصدِ درست (سفارش/فاکتور/اصلاح) اعمال می‌شود و فقط یک بار.',
              details='ثبتِ پرداخت و اثرهای جانبی (موجودی، پیامک) باید یک‌بار اتفاق بیفتد حتی اگر بازگشت دوبار بیاید.',
              tech='verify.php، invoice-verify.php، apay.php؛ ستون‌های gateway/authority/gw_ref/gw_paytype.', est=2,
              out=('پرداختِ ثبت‌شده', 'وضعیتِ نهایی پرداخت روی مقصد')),
            T('ثبتِ رویداد و پاسخ',
              [('db', 'gw_log_add(event, in): start/verify با gateway/ok/amount/authority/detail/payload'),
               ('p', 'gw_log_last_error(orderId) برای نمایشِ «آخرین خطا» در پنل'),
               ('p', 'پاسخ به مشتری: صفحهٔ موفقیت یا بازگشت به پرداخت با پیامِ فارسی')],
              'هر رویداد با شناسهٔ سفارش و درگاه ثبت می‌شود تا پشتیبان بتواند یک پرداخت را از ابتدا تا انتها دنبال کند.',
              details='شمارهٔ کارت هرگز در payload نمی‌آید؛ فقط پارامترهایی که بانک به مرورگر برگردانده.',
              tech='gw_log_add, gw_log_recent(limit, gateway), gw_log_last_error, جدول gw_log.', est=1),
          ]),
    ]
    return chain_module(doc, parent, CORE_TITLE, '💳', '#16a34a',
        'موتورِ مشترکِ پرداختِ اینترنتی: فهرستِ روش‌ها، شروع، بازگشت، نگهبانِ رسیدِ یکتا، تأیید و لاگ — درگاه‌ها ماژول‌های جدا هستند.',
        ins, outs, sections,
        details=('هدفِ هسته: یک قرارداد برای همهٔ درگاه‌ها تا افزودنِ درگاهِ تازه فقط نوشتنِ دو تابع (start/verify) باشد.\n\n'
                 'قرارداد: gw_start(key, order) ← {ok, method: redirect|post, url, fields, error}؛ gw_verify(key, order, req) ← {ok, ref, error}.\n'
                 'ماژولِ هر درگاه: «زرین‌پال»، «سامان»، «ملت»، «جیبیت»، «اسنپ‌پی»، «دیجی‌پی» و «پرداخت در محل» که در همین کتابخانه‌اند.\n'
                 'ایمنی: مبلغ و شناسه را هرگز از مرورگر باور نکن؛ authority در دیتابیسِ خودت می‌ماند و در بازگشت با آن مقایسه می‌شود.'),
        tech=('فایل‌های Weby: includes/gateways.php (کاتالوگ، start/verify، لاگ)، verify.php، invoice-verify.php، apay.php، sbx-pay.php (درگاهِ ساختگیِ تست).\n'
              'جدول‌ها: orders(gateway, authority, gw_ref, gw_paytype)، invoices(pay_token, pay_authority)، order_amends، gw_log.'),
        est=10, tags='پرداخت، درگاه، شاپرک', notes=notes)


# ====================== ماژولِ هر درگاه ======================
def _gateway(slug, title, icon, color, summary, details, tech, start_tasks, verify_tasks, est, need_settings=True):
    """همهٔ درگاه‌ها یک شکل دارند: «شروع» و «بازگشت و تأیید»."""
    def make(doc, parent=None, notes=None):
        ins = [P('درخواستِ شروعِ درگاه', 'سفارش/فاکتور/اصلاح: id، code، total (تومان)، mobile'),
               P('بازگشتِ درگاه', 'پارامترهایی که بانک به نشانیِ بازگشت می‌فرستد')]
        if need_settings:
            ins.insert(1, P('تنظیماتِ درگاه', 'کلیدها و حالتِ آزمایشی/واقعیِ همین درگاه (در جدولِ settings)'))
        outs = [P('نشانیِ انتقال به درگاه', 'redirect یا فرمِ POST'), P('نتیجهٔ تأیید', '{ok, ref, error}')]
        s1_ins = [ins[0]] + ([ins[1]] if need_settings else [])
        s2_ins = [ins[-1], P('شناسهٔ تراکنشِ ذخیره‌شده', 'authority/توکن/providerId که هنگامِ شروع ذخیره شد')] + ([ins[1]] if need_settings else [])
        secs = [
            S('شروعِ تراکنش', s1_ins, [P('نشانیِ انتقال به درگاه', outs[0]['desc']), P('شناسهٔ تراکنشِ ذخیره‌شده', s2_ins[1]['desc'])],
              icon='🚀', summary='ساختنِ تراکنش در بانک و فرستادنِ مشتری', tasks=start_tasks),
            S('بازگشت و تأیید', s2_ins, [P('نتیجهٔ تأیید', outs[1]['desc'])],
              icon='✅', summary='سنجشِ بازگشت و تأییدِ سرورِ بانک', tasks=verify_tasks),
        ]
        return chain_module(doc, parent, title, icon, color, summary, ins, outs, secs, details=details, tech=tech, est=est,
                            tags='پرداخت، درگاه', notes=notes)

    def build():
        d = Doc(slug[:6].replace('-', ''))
        make(d)
        return d, slug, title
    return make, build


# --- زرین‌پال
ZARIN = _gateway('pay-zarinpal', 'درگاه زرین‌پال', '🟡', '#f5a623',
    'پرداختِ اینترنتی با API نسخهٔ ۴ زرین‌پال (request/verify)، مبلغ ریالی، محیطِ آزمایشیِ sandbox.',
    ('نخست request (دریافتِ authority)، سپس انتقال به StartPay، بازگشت با Authority و Status، و در پایان verify. '
     'اگر Status=OK نیست یعنی مشتری لغو کرده؛ verify را نزن. کدِ ۱۰۰ = موفق و ۱۰۱ = «قبلاً تأیید شده» که آن هم موفق حساب می‌شود (بازگشتِ دوباره).'),
    'تنظیمات: zarinpal_merchant، zarinpal_sandbox (۱=آزمایشی). نشانی‌ها: sandbox.zarinpal.com یا payment.zarinpal.com؛ /pg/v4/payment/request.json، /pg/v4/payment/verify.json، /pg/StartPay/{authority}.',
    [T('ساختنِ درخواستِ پرداخت',
       [('p', 'merchant_id از تنظیمات (trim)'),
        ('p', 'POST request.json: amount (IRR)، currency=IRR، callback_url (gw_callback)، description، metadata.mobile'),
        ('d', 'data.code === 100 و authority هست؟', 'پیامِ errors.message یا «پاسخ نامعتبر از زرین‌پال»')],
       'مبلغ به ریال و واحد صریحاً IRR فرستاده می‌شود تا تنظیمِ واحدِ پنلِ زرین‌پال اثری نداشته باشد.',
       tech='gw_zarinpal_start; gw_json(url,payload).', est=1,
       out=('شناسهٔ authority', 'authority که زرین‌پال داد')),
     T('ذخیره و انتقال به StartPay',
       [('db', 'gw_save_authority(order, "zarinpal", authority)'),
        ('io', 'redirect به {base}/pg/StartPay/{authority}')],
       'authority کنارِ سفارش ذخیره می‌شود و مشتری به صفحهٔ پرداختِ زرین‌پال می‌رود.',
       tech='خروجی {ok, method:"redirect", url}.', est=0.5)],
    [T('سنجشِ وضعیتِ بازگشتی',
       [('d', 'Status برابر OK است؟', 'پیام: «پرداخت لغو شد یا ناموفق بود» — verify نزن'),
        ('p', 'Authority بازگشتی (یا authority ذخیره‌شده)')],
       'تنها اگر مشتری پرداخت را کامل کرده باشد verify صدا زده می‌شود؛ لغو، بی‌هزینه رد می‌شود.',
       tech='پارامترهای GET: Authority, Status=OK|NOK.', est=0.5,
       out=('پرداختِ ادعاشده', 'Authority و Status=OK')),
     T('verify و خواندنِ کد',
       [('p', 'POST verify.json: merchant_id، amount (همان مبلغِ سفارش)، authority'),
        ('d', 'کد ۱۰۰ یا ۱۰۱؟', 'خطا: errors.message یا «تأیید پرداخت ناموفق بود»'),
        ('p', 'ref_id = شمارهٔ پیگیری')],
       'مبلغِ ارسالی به verify از سفارش می‌آید نه از مرورگر؛ ۱۰۱ یعنی بازگشتِ تکراری و موفق است.',
       tech='gw_zarinpal_verify ← {ok, ref}.', est=1)],
    est=3)

# --- سامان
SAMAN = _gateway('pay-saman', 'درگاه بانک سامان (SEP)', '🔵', '#0ea5e9',
    'درگاهِ مستقیم سپ/سامان: توکن، فرمِ POST به OnlinePG، بازگشت با State و RefNum، تأییدِ RefNum و تطبیقِ مبلغ.',
    ('سامان توکن‌محور است: Action=Token ← token؛ مشتری با فرمِ POST (Token) به OnlinePG می‌رود. '
     'بازگشت: State و RefNum؛ RefNum خالی یعنی تراکنش از سمتِ خریدار به مشکل خورده. بعد VerifyTransaction با RefNum و TerminalNumber، و مبلغِ AffectiveAmount باید با سفارش برابر باشد. '
     'اگر مبلغ نخواند: کالا تحویل نشود و وجه برگردد (Reverse).'),
    'ثابت‌ها: SAMAN_PG_URL (OnlinePG)، SAMAN_VERIFY_URL، SAMAN_REVERSE_URL؛ تنظیمات: saman_terminal_id، saman_get_method (بازگشت با GET اگر هاست POST بیرونی را مسدود می‌کند). مستند فنیِ سپ نسخهٔ ۳٫۶.',
    [T('گرفتنِ توکن',
       [('p', 'Action=Token، TerminalId، Amount (ریال)، ResNum=کدِ سفارش، RedirectUrl=gw_callback'),
        ('d', 'موبایلِ معتبر است؟ (9xxxxxxxxx)', 'CellNumber نفرست (اختیاری است)'),
        ('p', 'POST به SAMAN_PG_URL'),
        ('d', 'token و status=1؟', 'errorDesc و errorCode را به پیامِ فارسی بده')],
       'سپ پیش از انتقالِ مشتری یک توکنِ یک‌بارمصرف می‌دهد که مبلغ و بازگشت را به آن قفل می‌کند.',
       details='موبایل را به قالبِ سپ ببر: بدونِ ۰ و ۹۸ ابتدایی، ده رقم.', tech='gw_saman_start, gw_saman_cell.', est=1.5,
       out=('توکنِ سامان', 'token برای فرمِ POST')),
     T('فرمِ POST به بانک',
       [('db', 'gw_save_authority(order, "saman", token)'),
        ('io', 'فرمِ POST: Token (و GetMethod=true اگر saman_get_method روشن است)')],
       'مشتری با یک فرمِ خودکار به OnlinePG می‌رود؛ GetMethod فقط برای هاست‌هایی است که بازگشتِ POST را مسدود می‌کنند.',
       tech='خروجی {ok, method:"post", url, fields}.', est=0.5)],
    [T('خواندنِ State و RefNum',
       [('p', 'State و RefNum از بازگشت'),
        ('d', 'RefNum خالی است؟', 'gw_saman_state_msg(State) — تراکنش از سمتِ خریدار شکست خورده'),
        ('d', 'State برابر OK است؟', 'پیامِ فارسیِ State (لغو/خطا/تمامِ مهلت/آی‌پی ثبت‌نشده/ترمینال…)')],
       'قبل از هر درخواستی به بانک، بازگشتِ ناموفق با پیامِ دقیق رد می‌شود.',
       details='پیام‌ها: CanceledByUser، SessionIsNull (مهلت تمام)، MerchantIpAddressIsInvalid (آی‌پیِ سرور نزدِ بانک ثبت نیست)، TokenNotFound، TerminalNotFound…',
       tech='gw_saman_state_msg(state).', est=1, out=('RefNum معتبر', 'رسیدِ دیجیتالیِ بانک')),
     T('نگهبانِ رسید، تأیید و تطبیقِ مبلغ',
       [('db', 'gw_ref_once(order, RefNum) — Double Spending (مستند بند ۷)'),
        ('p', 'POST VerifyTransaction: RefNum و TerminalNumber'),
        ('d', 'Success و ResultCode=0؟', 'ResultDescription یا پیامِ عمومی'),
        ('d', 'AffectiveAmount برابرِ مبلغِ سفارش است؟', 'رد: «وجه به حساب شما بازگردانده می‌شود» (Reverse)'),
        ('p', 'ref = RRN (شمارهٔ پیگیریِ بانکی)')],
       'رسید باید برای همین سفارش و فقط یک بار باشد، و مبلغِ مؤثرِ بانک با مبلغِ سفارش برابر؛ هر دو شرط نقض شد، کالا تحویل نمی‌شود.',
       tech='gw_saman_verify؛ ReverseTransaction برای برگشتِ ناهمخوانی.', est=2)],
    est=4)

# --- ملت
MELLAT = _gateway('pay-mellat', 'درگاه بانک ملت (به‌پرداخت)', '🔴', '#dc2626',
    'درگاهِ ملت با SOAP: bpPayRequest ← RefId؛ فرمِ POST به startpay؛ bpVerifyRequest و bpSettleRequest.',
    ('ملت SOAP است و بدونِ افزونهٔ SoapClient روی هاست کار نمی‌کند؛ این را پیش از هر چیز بسنج و پیامِ روشن بده. '
     'bpPayRequest با terminalId، userName، userPassword، orderId، amount (ریال)، localDate/localTime، callBackUrl؛ پاسخ «کد,RefId» (۰ = موفق). '
     'بازگشت: ResCode (۰ موفق)، SaleOrderId، SaleReferenceId. سپس verify و بعد settle (کد ۰ یا ۴۵ = تسویهٔ قبلاً انجام‌شده).'),
    'WSDL: https://bpm.shaparak.ir/pgwchannel/services/pgw?wsdl؛ startpay: https://bpm.shaparak.ir/pgwchannel/startpay.mellat؛ تنظیمات: mellat_terminal_id, mellat_username, mellat_password.',
    [T('درخواستِ پرداخت (SOAP)',
       [('d', 'کلاسِ SoapClient در PHP هست؟', 'خطا: «درگاه ملت نیاز به SOAP دارد»'),
        ('p', 'bpPayRequest: terminalId، userName، userPassword، orderId، amount، localDate=Ymd، localTime=His، additionalData، callBackUrl، payerId=0'),
        ('d', 'بخشِ اول پاسخ ۰ و RefId هست؟', 'پیامِ «درگاه ملت خطای شمارهٔ X برگرداند»')],
       'orderId عددی است (شناسهٔ سفارش) و مبلغ ریال؛ پاسخ رشتهٔ «کد,RefId» است.',
       tech='gw_mellat_client() با connection_timeout=25، exceptions=true؛ gw_mellat_start.', est=1.5,
       out=('RefId ملت', 'شناسهٔ مرجعِ بانک')),
     T('فرمِ POST به startpay',
       [('db', 'gw_save_authority(order, "mellat", RefId)'),
        ('io', 'فرمِ POST: RefId → startpay.mellat')],
       'مشتری با RefId به صفحهٔ بانک می‌رود.', tech='{method:"post", url, fields:{RefId}}.', est=0.5)],
    [T('سنجشِ ResCode',
       [('d', 'ResCode برابر ۰ است؟', 'پیام: «پرداخت لغو شد یا ناموفق بود (کد …)»'),
        ('p', 'SaleOrderId، SaleReferenceId را به عددِ صحیح ببر')],
       'کدِ غیر از صفر یعنی بانک پرداخت را نپذیرفته؛ درخواستِ verify بی‌معنی است.',
       tech='gw_mellat_verify.', est=0.5, out=('اطلاعاتِ بازگشتِ ملت', 'ResCode، SaleOrderId، SaleReferenceId')),
     T('verify و settle',
       [('p', 'bpVerifyRequest با terminalId، userName، userPassword، orderId، saleOrderId، saleReferenceId'),
        ('d', 'کدِ verify صفر است؟', 'خطا: «تأیید تراکنش ناموفق بود (کد …)»'),
        ('p', 'bpSettleRequest با همان آرگومان‌ها'),
        ('d', 'کدِ settle ۰ یا ۴۵ است؟', 'خطا: «ثبت نهایی ناموفق بود»')],
       'بدونِ settle پول به حسابِ فروشنده نمی‌نشیند؛ کدِ ۴۵ یعنی قبلاً تسویه شده و موفق حساب می‌شود.',
       details='اگر verify موفق شد و settle شکست خورد، پرداخت موفق اعلام نشود تا ابهامِ پول پیگیری شود.',
       tech='ref = SaleReferenceId.', est=1.5)],
    est=4)

# --- جیبیت
JIBIT = _gateway('pay-jibit', 'درگاه جیبیت (Jibit)', '🟣', '#7c3aed',
    'پرداختِ اینترنتیِ جیبیت نسخهٔ ۳: توکنِ ۲۴ساعته با refresh، خرید، بازگشت بدونِ امضا، verify و استعلام، استرداد.',
    ('جیبیت توکن‌محور است: accessToken (۲۴ ساعت) + refreshToken (۴۸ ساعت) در جدولِ settings نگه داشته می‌شود، نه فایل (کش فایلیِ کلاسِ رسمی روی هاستِ مشترک خاموش خراب می‌شود). '
     'بازگشت POST با purchaseId, status, amount و هیچ‌کدام امضا ندارند؛ تنها مرجع، پاسخِ verify است. '
     'clientReferenceNumber باید در هر «تلاش» یکتا باشد (کدِ سفارش + پسوندِ کوتاهِ تصادفی)، وگرنه تلاشِ دوم تکراری رد می‌شود.'),
    'JIBIT_BASE=https://napi.jibit.ir/ppg/v3؛ /tokens, /tokens/refresh, /purchases, /purchases/{id}/verify, /purchases/refund؛ تنظیمات jibit_api_key, jibit_secret_key؛ ذخیره: jibit_token(+_exp)، jibit_refresh(+_exp).',
    [T('توکنِ معتبر (refresh ← ورودِ تازه)',
       [('d', 'توکنِ ذخیره‌شده هنوز بیش از یک دقیقه اعتبار دارد؟', 'همان را بده'),
        ('d', 'refreshToken معتبر است؟', 'POST /tokens با apiKey و secretKey'),
        ('p', 'POST /tokens/refresh با accessToken و refreshToken'),
        ('db', 'ذخیرهٔ جفت‌توکن با مهلتِ خودِ جیبیت منهای ۶۰ ثانیه')],
       'refresh ارزان‌تر است و شمارندهٔ ورودِ پذیرنده را مصرف نمی‌کند؛ اگر refresh هم رد شد ورودِ تازه (کلیدها شاید عوض شده‌اند).',
       tech='gw_jibit_token(fresh), gw_jibit_token_request, gw_jibit_store.', est=2,
       out=('توکنِ دسترسی', 'Bearer معتبر')),
     T('ساختنِ خرید و انتقال',
       [('p', 'clientReferenceNumber = کدِ سفارش + «-» + ۴ نویسهٔ هگز تصادفی'),
        ('p', 'POST /purchases: amount، currency=IRR، callbackUrl، clientReferenceNumber، userIdentifier=موبایل، description'),
        ('d', 'اگر auth_required شد؟', 'یک بار با توکنِ تازه تکرار؛ بیشتر نه'),
        ('db', 'authority = purchaseId'),
        ('io', 'redirect به pspSwitchingUrl')],
       'شمارهٔ پیگیریِ پذیرنده در هر تلاش یکتا است تا سفارشی که یک‌بار شکست خورده بتواند دوباره پرداخت شود.',
       details='تکرارِ بی‌پایان روی مسیرِ مشتری یعنی صفحه‌ای که هیچ‌وقت جواب نمی‌دهد؛ پس فقط یک retry.',
       tech='gw_jibit_call(path,payload,method,retry), gw_jibit_start.', est=2)],
    [T('فیلترِ بازگشت (نشانه، نه حکم)',
       [('d', 'status شبیهِ FAIL/CANCEL/EXPIRE/REVERS/REFUND/UNSUCCESS است؟', 'رد زودهنگام با پیامِ درست'),
        ('d', 'purchaseId بازگشتی با ذخیره‌شده یکی است؟', 'رد: «با این سفارش هم‌خوانی ندارد»'),
        ('d', 'amount بازگشتی (اگر هست) برابرِ مبلغِ سفارش؟', 'رد'),
        ('db', 'gw_ref_once(order, purchaseId)')],
       'وضعیتِ ناموفق را می‌پذیریم (زودتر و بی‌خطر تمام می‌شود)، وضعیتِ موفق را نه: آن را فقط سرورِ جیبیت می‌گوید.',
       tech='gw_jibit_failed_state(state).', est=1.5, out=('بازگشتِ معتبرِ جیبیت', 'purchaseId که از فیلتر گذشت')),
     T('verify، استعلام و تطبیقِ مبلغ',
       [('p', 'GET /purchases/{id}/verify ← status'),
        ('d', 'status = SUCCESSFUL؟', 'استعلامِ وضعیت: اگر SUCCESS/SUCCESSFUL است «قبلاً تأیید شده» و موفق حساب می‌شود'),
        ('d', 'مبلغِ استعلام‌شده برابرِ سفارش؟', 'رد و «وجه بازگردانده می‌شود»'),
        ('p', 'ref = pspRRN یا pspReferenceNumber، وگرنه purchaseId')],
       '«قبلاً تأیید شده» شکست نیست: اگر مشتری صفحهٔ بازگشت را دوباره بازکند، verify دوم خطا می‌دهد ولی پول رسیده است.',
       details='استرداد: POST /purchases/refund (کامل یا بخشی) در کد هست ولی عمداً دکمه ندارد؛ استردادِ خودکار یعنی یک باگ می‌تواند پولِ فروشگاه را برگرداند.',
       tech='gw_jibit_verify, gw_jibit_status, gw_jibit_refund (بی‌مسیرِ کاربری).', est=2)],
    est=5)

# --- اسنپ‌پی
SNAPP = _gateway('pay-snapppay', 'اسنپ‌پی (خرید اعتباری و قسطی)', '🟢', '#00a86b',
    'خریدِ اعتباری/اقساطیِ اسنپ‌پی: OAuth، سبدِ کالا با جمعِ برابرِ مبلغ، token، verify، settle و revert.',
    ('اسنپ‌پی پرداخت نیست، «اعتبار» است: سبدِ کالا (cartList) باید با مبلغِ سفارش بخواند؛ اگر نخواند، سفارش به اسنپ‌پی فرستاده نمی‌شود. '
     'جریان: oauth/token (password grant) ← payment/v1/token (paymentToken و paymentPageUrl) ← بازگشت با state ← verify ← settle. '
     'اگر verify شد ولی settle نشد، revert تا اعتبارِ مشتری بسته نماند. وضعیت‌ها: VERIFY و SETTLE.'),
    'پایه: sandbox → api.snapppay.dev، تولید → api.snapppay.ir (snapppay_base_url بر هر دو مقدم است)؛ مسیرها /api/online/v1/oauth/token، /api/online/payment/v1/{token,verify,settle,status,revert,update,cancel}. تنظیمات: client_id/secret، username/password، دسته‌بندی. فایل‌های ماژول: gateway.php, cart.php, ops.php, settle.php, contract.php.',
    [T('ورود OAuth و ساختنِ سبد',
       [('p', 'POST oauth/token: grant_type=password، username، password، scope=online-merchant، Basic(client_id:secret)'),
        ('p', 'توکن را تا انقضا (حداکثر ۳۰۰۰ ثانیه، منهای ۳۰) در حافظه نگه دار'),
        ('p', 'snapppay_cart_build(order, items, category): نامِ کالا، قیمت، تعداد، تخفیف، هزینهٔ ارسال'),
        ('d', 'جمعِ سبد با مبلغِ سفارش می‌خواند؟ (snapppay_cart_ok)', 'خطا: «با پشتیبانی تماس بگیرید» — نفرست')],
       'مبلغِ نهایی همان جمعِ ردیف‌های سبد است؛ هر اختلافِ ریالی یعنی رد شدن در اسنپ‌پی.',
       details='ارسال و تخفیفِ کل باید در سبد جداگانه بیایند؛ سفارش‌های فاکتور/اصلاح (شناسه ≤۰) سبدِ خالی می‌گیرند.',
       tech='gw_snapppay_token, gw_snapppay_payload, snapppay_cart_build/ok (cart.php).', est=3,
       out=('سبدِ اسنپ‌پی', 'cartList + amount + شماره‌ها')),
     T('ساختنِ توکنِ پرداخت و انتقال',
       [('p', 'POST payment/v1/token: سبد + mobile=+98… + returnURL + transactionId=کدِ سفارش'),
        ('d', 'successful و paymentPageUrl؟', 'errorData.message'),
        ('db', 'authority = paymentToken + لاگِ snapppay_log("token")'),
        ('io', 'redirect به paymentPageUrl')],
       'forcedPaymentMethodTypes نمی‌فرستیم تا همهٔ روش‌های فعالِ مشتری دیده شود.',
       tech='gw_snapppay_start.', est=1.5)],
    [T('state بازگشت و توکنِ همین سفارش',
       [('d', 'state برابر FAILED است؟', 'رد: «پرداخت اعتباری انجام نشد»'),
        ('p', 'paymentToken را از authority ذخیره‌شده بگیر (نه از نشانی)')],
       'اگر توکنِ نشانی با ذخیره‌شده فرق داشت، همان ذخیره‌شده ملاک است.',
       tech='gw_snapppay_verify (بخش اول).', est=0.5, out=('paymentToken', 'توکنِ همین سفارش')),
     T('verify ← settle (با revert)',
       [('p', 'POST verify'),
        ('d', 'verify خطا داد؟', 'status: اگر SETTLE است موفق؛ اگر VERIFY است ادامه؛ وگرنه خطا'),
        ('p', 'POST settle (دو تلاش، بینشان status)'),
        ('d', 'settle موفق؟', 'revert (برگشتِ اعتبار) و خطای روشن'),
        ('p', 'ref = transactionId یا paymentToken')],
       'نهایی‌کردن با استعلامِ وضعیت idempotent شده است: «تأییدشده ولی نهایی‌نشده» هرگز رها نمی‌شود.',
       details='عملیاتِ بعد از پرداخت (ویرایشِ سبد، لغو، استعلام) در ops.php با لاگِ جدا؛ تسویه و کارمزد در settle.php.',
       tech='snapppay_call, snapppay_status, snapppay_revert, snapppay_update_order, snapppay_cancel_order.', est=3)],
    est=7)

# --- دیجی‌پی
DIGI = _gateway('pay-digipay', 'دیجی‌پی (کیف پول و اعتبار)', '🟠', '#ea580c',
    'دیجی‌پی: توکنِ ورود، تیکتِ کسب‌وکار، بازگشت با trackingCode، verify با نوع، ثبتِ روشِ پرداخت (کارت/کیف/اعتباری/اقساط).',
    ('ورود با OAuth (client credentials + نامِ کاربری/رمز) و توکنِ ذخیره‌شده؛ تیکت با type=11 (UPG) ساخته می‌شود. providerId در هر تراکنش یکتا است (کدِ سفارش + پسوند). '
     'بازگشت: result=SUCCESS|FAILURE و trackingCode، type؛ verify با همان type. مشتری درونِ دیجی‌پی هرکدام را زد، در ستونِ gw_paytype (dp:<type>) ثبت می‌شود تا دفترِ BNPL درست بسازد.'),
    'پایه: uat.mydigipay.info (آزمایشی) یا api.mydigipay.com؛ /digipay/api/tickets/business?type=…، /digipay/api/purchases/verify?type=…؛ preferredGateway اختیاری (۲=کارت، ۰=کیف پول شارژ را می‌بندد — خریدِ قسطی دیده نمی‌شود). فایل‌ها: gateway.php, settle.php, contract.php.',
    [T('توکنِ ورود',
       [('d', 'توکنِ ذخیره‌شده معتبر است؟', 'همان'),
        ('p', 'ورود: gw_digipay_token_request (اطلاعاتِ پذیرنده با ارقامِ لاتین)'),
        ('d', '401 در درخواستِ بعدی؟', 'یک بار توکنِ تازه (fresh) و تکرار')],
       'خطای ورود پیامِ نسبت‌به‌محیط می‌دهد (آزمایشی یا واقعی) تا اشتباهِ رایجِ «کلیدِ تست روی سرورِ واقعی» دیده شود.',
       tech='gw_digipay_token(fresh), gw_digipay_cred, gw_digipay_env_hint.', est=2, out=('توکنِ دیجی‌پی', 'Bearer')),
     T('ساختنِ تیکت و انتقال',
       [('d', 'موبایلِ معتبر است؟', 'خطا: «موبایلِ معتبر لازم است»'),
        ('p', 'providerId = کدِ سفارش + پسوندِ تصادفی'),
        ('p', 'POST tickets/business?type=11: amount، cellNumber، providerId، callbackUrl (+ additionalInfo.preferredGateway اگر تنظیم شده)'),
        ('d', 'result.status = 0 و redirectUrl/payUrl؟', 'result.message'),
        ('db', 'authority = providerId'),
        ('io', 'redirect')],
       'providerId همان چیزی است که هنگامِ verify لازم می‌شود؛ پس به‌جای کدِ سفارش در authority می‌ماند.',
       tech='gw_digipay_start, gw_digipay_ticket_type=11.', est=2)],
    [T('فیلترِ بازگشت',
       [('d', 'result=FAILURE یا status≠۰؟', 'رد'),
        ('d', 'trackingCode هست؟', 'خطا'),
        ('d', 'amount بازگشتی برابر است؟', 'رد')],
       'نسخه‌های قدیمی status می‌فرستادند و جدید result؛ هر دو پذیرفته می‌شود.', tech='gw_digipay_verify (بخش اول).', est=1,
       out=('بازگشتِ معتبرِ دیجی‌پی', 'trackingCode, providerId, type')),
     T('verify و ثبتِ نوعِ پرداخت',
       [('p', 'POST purchases/verify?type=<type بازگشتی>: trackingCode و providerId'),
        ('d', 'result.status = 0؟', 'result.message'),
        ('db', 'orders.gw_paytype = "dp:" + type (شرطِ gateway و authority)'),
        ('p', 'ref = rrn یا trackingCode')],
       'نوعِ پرداخت (کارت/کیف پول/اعتباری/قسطی) برای حسابداریِ BNPL (کارمزد و تسویه) لازم است.',
       tech='digipay_fees, digipay_fee_for(paytype)، settle.php.', est=2)],
    est=5)

# --- پرداخت در محل
COD = _gateway('pay-cod', 'پرداخت در محل', '💵', '#64748b',
    'پرداختِ نقدی/کارتی هنگامِ تحویل: بدونِ بانک؛ سفارش «پرداخت‌نشده» ثبت و در تحویل تسویه می‌شود.',
    ('درگاهِ cod هیچ تماسی با بانک ندارد و در gw_start هم از شاخهٔ آزمایشی استثناست. سفارش با وضعیتِ «در انتظارِ تحویل» ثبت می‌شود؛ تسویه را پیک/انباردار با ثبتِ نقد/کارتخوان انجام می‌دهد.'),
    'تنظیم: gw_cod_enabled؛ درگاه بدونِ کلید. مبلغ‌ها و فاکتور مثلِ بقیه؛ نقد/کارت‌به‌کارت در ماژولِ پرداختِ حضوری.',
    [T('ثبتِ سفارشِ پرداخت‌درمحل',
       [('d', 'پرداخت در محل برای این شهر/روشِ ارسال مجاز است؟', 'فهرست نشان نده'),
        ('db', 'gateway = cod، authority خالی'),
        ('p', 'بدونِ انتقال: مستقیم به صفحهٔ موفقیتِ سفارش')],
       'تنها قاعده‌ها است: مجازبودن و علامت‌زدنِ سفارش؛ هیچ بانکی در کار نیست.', tech='gw_catalog()["cod"]؛ gw_start شاخهٔ ویژه.', est=1,
       out=('سفارشِ در انتظارِ تحویل', 'سفارش ثبت‌شده با روشِ cod')),
     T('بدونِ انتقال',
       [('p', 'خروجی ok بدونِ url')],
       'نشانیِ انتقالی وجود ندارد؛ صدازننده به صفحهٔ موفقیت می‌رود.', tech='{ok:true}', est=0.5)],
    [T('ثبتِ تسویه در تحویل',
       [('p', 'پیک/انباردار روشِ دریافت (نقد/کارت) و مبلغ را ثبت می‌کند'),
        ('d', 'مبلغِ دریافتی با سفارش برابر است؟', 'اختلاف را ثبت و گزارش بده'),
        ('db', 'وضعیتِ پرداخت: paid + ref داخلی')],
       'تأییدِ پرداخت در تحویل است، نه در بازگشتِ بانک.', details='تسویهٔ نقد با شیفتِ پیک (ماژولِ پیک) هم‌خوان می‌شود.', tech='پنل پیک/انبار.', est=1.5,
       out=('رسیدِ تحویل', 'مبلغ و روشِ دریافت')),
     T('نتیجه',
       [('p', '{ok:true, ref: رسیدِ داخلی}')],
       'نتیجه‌ای مثلِ بقیهٔ درگاه‌ها تا هسته بتواند یکسان لاگ کند.', tech='gw_verify("cod").', est=0.5)],
    est=2, need_settings=False)


def builds():
    out = []
    d = Doc('pc'); core(d); out.append((d, CORE_SLUG, CORE_TITLE))
    for _, b in (ZARIN, SAMAN, MELLAT, JIBIT, SNAPP, DIGI, COD):
        out.append(b())
    return out
