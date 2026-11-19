# -*- coding: utf-8 -*-
"""ماژولِ ترب — برگرفته از Weby: docs/ترب-API.md، includes/torob-api.php، torob-orders.php، torob-watch.php، tools/torob-webhook.php."""
from dsl import Doc, P, T, S, chain_module

TITLE = 'اتصال به ترب (API، وبهوک، انتسابِ فروش)'
SLUG = 'torob'


def make(doc, parent=None, notes=None):
    ins = [P('درخواستِ ترب', 'GET/POST از سرورهای ترب با هدرِ X-Torob-Token (JWT) و page_uniques یا نشانی‌ها یا sort/page'),
           P('کاتالوگِ فروشگاه', 'محصولات، ترکیب‌ها (variant)، قیمتِ نهایی، موجودی، تصویر، دسته‌بندی و نشانیِ صفحه'),
           P('تغییرِ قیمت و موجودی', 'ستونِ products.updated_at (و قیمت‌های لحظه‌ای: پیشنهادِ زمان‌دار، تخفیفِ گروهی)'),
           P('کلیکِ ورودیِ ترب', 'پارامترِ ?torob_clid=… در نشانیِ هر صفحهٔ عمومی'),
           P('سفارشِ ثبت‌شده', 'سفارشِ تازه‌ثبت‌شده در تسویه‌حساب (با کوکیِ torob_clid)')]
    outs = [P('پاسخِ محصولات', 'JSON با فهرستِ محصول/ترکیب: page_unique، title، current_price، availability، قیمتِ قبل، تصویر…'),
            P('اعلانِ وبهوک', 'دستهٔ تغییرها (قیمت/موجودی) که به ترب فرستاده شد و نشانگرِ پیشرفت'),
            P('گزارشِ سفارش‌های ترب', 'فهرستِ سفارش‌های منتسب به ترب برای order tracking (وضعیتِ completed/cancelled، تاریخ UTC، ارزش به تومان)')]
    sections = [
        S('API محصولاتِ نسخهٔ ۳', [ins[0], ins[1]], [P('پاسخِ محصولات', outs[0]['desc'])], icon='📦',
          summary='احرازِ هویتِ ترب، واحدِ ارسال، تطبیقِ درخواست و ساختِ پاسخ',
          details='ترب بر اساس page_uniques یا نشانی‌ها محصولِ مشخص می‌خواهد یا کلِ فهرست را صفحه‌به‌صفحه می‌خواند. هر سه حالت از همین مسیر رد می‌شوند.',
          tasks=[
            T('احرازِ هویتِ JWT (EdDSA)',
              [('p', 'خواندنِ توکن از هدرِ X-Torob-Token'),
               ('d', 'امضای ed25519 با کلیدِ عمومیِ ترب درست است؟', '۴۰۱ (امضا)'),
               ('d', 'exp و nbf معتبرند؟', '۴۰۱'),
               ('d', 'aud برابرِ مقدارِ انتظاری است؟ (از SITE_URL، نه از هدرِ Host؛ torob_api_aud بازنویسی می‌کند)', '۴۰۱ — بدونِ aud توکنِ فروشگاهِ دیگر هم کار می‌کرد'),
               ('n', 'افزونهٔ sodium نبود؟ sodium_compat (PHP خالص، ≈۱۰۰ms). هیچ‌کدام نبود: ۴۰۱ (درِ باز بدتر از درِ بسته است)')],
              'چهار چیز بررسی می‌شود: امضا، exp، nbf، aud. هر شکستی ۴۰۱ است و دلیلش در لاگِ احرازِ ناموفق می‌نشیند.',
              details='JWT بدونِ کتابخانهٔ composer نوشته شده: base64url، سه بخش، verify با sodium_crypto_sign_verify_detached. آزمون دو بار اجرا می‌شود: یک بار عادی و یک بار با sodium غیرفعال تا دو پیاده‌سازی یک بیت فرق نکنند.',
              tech='torob_token_valid(jwt,&err), torob_verify_sign, torob_expected_aud, includes/vendor/sodium-compat/ (paragonie v2.5.2).', est=3,
              out=('درخواستِ احرازشده', 'درخواستِ ترب پس از اعتبارِ توکن')),
            T('واحدِ ارسال و page_unique',
              [('d', 'محصول ترکیب (variant) دارد؟', 'واحد = خودِ محصول: page_unique=«12»'),
               ('p', 'واحد = هر ترکیب: page_unique = «شناسهٔ محصول_شناسهٔ ترکیب» مثل «12_7»'),
               ('n', 'page_unique هرگز نباید عوض شود؛ ترب با آن قیمت‌ها را نگه می‌دارد')],
              'فروشگاه‌هایی که ترکیب دارند هر ترکیب را جداگانه می‌فرستند تا قیمتِ هر رنگ/اندازه دقیق باشد.',
              details='نشانیِ صفحه از torob_page_url(product, variant) ساخته می‌شود. اگر کدِ کالا (SKU) هم پرسیده شود، همان کد یک شناسهٔ معتبر است.',
              tech='torob_units(opt), torob_page_unique(pid,vid), torob_page_url.', est=2,
              out=('واحدهای قابلِ ارسال', 'فهرستِ محصول/ترکیب با page_unique')),
            T('تطبیقِ درخواست',
              [('p', 'شناسه‌های پرسیده‌شده: page_unique، نشانی (url_key)، یا کدِ کالا'),
               ('p', 'مراحل: تطابقِ دقیق ← نشانی ← محصول یافته‌شده (همهٔ ترکیب‌ها) ← کدِ کالا ← نامِ مستعار (torob_alias_map)'),
               ('d', 'کدی که دیگر به محصولی نمی‌خورد؟', 'ردیفِ «ناموجود» با همان شناسه‌ای که پرسیده شد'),
               ('n', 'یک پرسش = یک ردیف، با همان شناسه/نشانیِ پرسیده‌شده در پاسخ')],
              'اگر ترب «خارج از فهرست» پرسید، باید هر پرسش یک ردیفِ پاسخ بگیرد؛ ردیفِ جاافتاده یعنی ترب آن را «ناموجود» می‌داند.',
              details='نشانیِ قدیمی/بازنویسی‌شده هم باید به همان محصول برسد (aliases). ابزارِ tools/torob-products.php استعلام را بدونِ ترب شبیه‌سازی می‌کند.',
              tech='torob_match_requested(units,wanted,byUrl), torob_match_units, torob_pick_one, torob_aliases.', est=3,
              out=('واحدهای تطبیق‌خورده', 'ردیف‌هایی که باید در پاسخ بیایند')),
            T('ساختنِ پاسخ',
              [('p', 'مرتب‌سازی (sort) و صفحه‌بندی'),
               ('p', 'فیلدها: title، subtitle، current_price (تومان)، old_price، availability، image_links، category_name، guarantee، page_url…'),
               ('p', 'قیمتِ لحظه‌ای: پیشنهادِ زمان‌دار (deal) و تخفیفِ گروهی بدونِ ذخیره روی ردیف'),
               ('p', 'لاگِ درخواست: نقطهٔ پایانی، حالت، تعدادِ آیتم، کد')],
              'پاسخ همان قیمتی است که مشتری در سایت می‌بیند؛ نه قیمتِ فهرستِ قدیمی.',
              details='اگر قیمت در صفحه با ترب فرق کند، ترب محصول را «ناهماهنگ» می‌شمارد و رتبه می‌دهد پایین.',
              tech='torob_products_payload(units), torob_api_log, torob_iso, torob_cut, torob_media_url.', est=3),
          ]),
        S('وبهوکِ خبرِ آنی', [ins[2]], [P('اعلانِ وبهوک', outs[1]['desc'])], icon='📡',
          summary='خبردادنِ تغییرِ قیمت و موجودی بدونِ منتظرِ ماندن برای خزش',
          details='فقط وقتی کلید روشن و توکنِ وبهوک ثبت شده باشد؛ با cron هر چند دقیقه یا با دکمه در پنل.',
          tasks=[
            T('یافتنِ تغییرها از نشانگر',
              [('p', 'torob_hook_cursor (آخرین updated_at که فرستادیم)'),
               ('db', 'SELECT محصول‌های با updated_at بزرگ‌تر از نشانگر'),
               ('d', 'بیش از سقفِ هر دسته؟', 'دسته‌های ۲۰ تایی تا maxBatches'),
               ('n', 'قیمت‌های لحظه‌ای (deal، تخفیفِ گروهی) ستونِ updated_at را عوض نمی‌کنند؛ تاریخِ شروع/پایانشان هم محرک است')],
              'نشانگر در settings می‌ماند تا اجرای بعدی از همان‌جا ادامه دهد؛ اگر ارسال نصفه ماند، نشانگر جلو نمی‌رود.',
              tech='torob_webhook_run(maxBatches), torob_hook_items_for(row), ستون products.updated_at.', est=2,
              out=('تغییرهای دسته‌بندی‌شده', 'ردیف‌ها و نشانگرِ پیشنهادی')),
            T('ارسال به ترب و جلو بردنِ نشانگر',
              [('p', 'ساختِ آیتم‌ها با همان torob_products_payload'),
               ('p', 'POST به نشانیِ وبهوکِ ترب با توکن'),
               ('d', 'پاسخ موفق؟', 'نشانگر عقب بماند + لاگِ خطا (تلاشِ بعدی)'),
               ('db', 'torob_setting_put("torob_hook_cursor", …)')],
              'هر دسته جدا تأیید می‌شود؛ شکست یک دسته چیزی را گم نمی‌کند.',
              details='دکمهٔ «ارسالِ فوری» (torob_webhook_push_now) برای تغییرِ دستی؛ تغییرِ تک‌محصول با torob_webhook_push_ids.',
              tech='torob_webhook_send(items,token)، torob_webhook_gate().', est=2),
          ]),
        S('انتسابِ فروش (Order Tracking)', [ins[3], ins[4]], [P('گزارشِ سفارش‌های ترب', outs[2]['desc'])], icon='🧭',
          summary='گرفتنِ torob_clid، نوشتن روی سفارش و پاسخ به ترب',
          details='کلیدِ torob_orders_enabled پیش‌فرض خاموش است و خاموشی ۴۰۳ می‌دهد (الزامِ ترب).',
          tasks=[
            T('گرفتنِ شناسهٔ کلیک',
              [('d', 'پارامترِ torob_clid در نشانی هست؟', 'کاری نکن (کوکیِ قبلی بماند)'),
               ('p', 'پاک‌سازی (حروف/رقم/نشانه‌های مجاز، طولِ کوتاه)'),
               ('p', 'کوکی ۷ روز (پنجرهٔ ۱۶۸ساعتهٔ ترب)'),
               ('n', 'روی هر صفحهٔ عمومی صدا زده می‌شود (ترب ممکن است به دسته یا صفحهٔ اصلی لینک بدهد)، نه فقط محصول')],
              'کاربرِ آمده از ترب تا یک هفته با همان شناسه شناخته می‌شود.',
              tech='torob_clid_capture() از header.php؛ torob_clid_current().', est=1,
              out=('شناسهٔ کلیکِ نگه‌داری‌شده', 'مقدارِ پاک‌شدهٔ torob_clid')),
            T('نوشتن روی سفارش',
              [('p', 'پس از INSERTِ سفارش، شناسه را در orders.torob_clid بنویس'),
               ('n', 'جدا از INSERT: اگر ستون هنوز ساخته نشده، ثبتِ سفارش نباید بشکند')],
              'شناسه کنارِ سفارش می‌ماند تا بعداً بشود منتسبش کرد.', tech='checkout.php؛ UPDATE جدا.', est=1,
              out=('سفارشِ منتسب', 'سفارش با torob_clid')),
            T('پاسخ به ترب',
              [('db', 'فقط سفارش‌هایی که torob_clid دارند و پرداخت‌نشده نیستند (در خودِ کوئری)'),
               ('p', 'وضعیت: canceled→cancelled و بقیه→completed؛ pending اصلاً نمی‌رود'),
               ('p', 'تاریخ‌ها UTC با Z، مبلغ‌ها تومان؛ order_value = subtotal − discount'),
               ('d', 'torob_orders_enabled خاموش است؟', '۴۰۳')],
              'گزارشِ دقیقِ فروشِ آمده از ترب برای محاسبهٔ کمیسیون و رتبه.',
              details='GET /torob/v1/orders?purchase_timestamp_gt=…&limit=…؛ احراز با همان JWT.',
              tech='torob_orders_feed(gt, limit)، torob_order_status، torob_utc.', est=2),
          ]),
    ]
    return chain_module(doc, parent, TITLE, '🛒', '#f97316',
        'اتصالِ فروشگاه به ترب: API محصولاتِ نسخهٔ ۳ با JWT، وبهوکِ آنیِ قیمت، و انتسابِ فروش با torob_clid.',
        ins, outs, sections,
        details=('سه مسیر مستقل و پیش‌فرض خاموش‌اند؛ هر کدام جدا روشن می‌شود و رفتارِ سایت بدونِ آن‌ها تغییر نمی‌کند: '
                 '۱) API نسخهٔ ۳ (برای فروشگاه‌های بزرگ)، ۲) وبهوک، ۳) انتسابِ فروش. فیدِ قدیمیِ torob.php دست‌نخورده می‌ماند.\n\n'
                 'ابزارِ عیب‌یابی: tools/torob-check.php (گزارشِ سلامت) و tools/torob-products.php (آنچه می‌فرستیم و استعلام). '
                 'پایشِ قیمتِ رقیب (torob-watch) و آینهٔ ترب (torob-mirror) ماژول‌های جدایند.'),
        tech='مرجع: Torob-Sync (product_api_v3.md, torob_api_token_guide.md, product_webhook.md, order_tracking_api.md). فایل‌ها: includes/torob-api.php, torob-orders.php, torob-notify.php; تنظیم‌ها: torob_api_enabled, torob_api_aud, torob_hook_cursor, torob_orders_enabled.',
        est=14, tags='ترب، API، وبهوک، JWT', notes=notes)


def build():
    d = Doc('tb'); make(d)
    return d, SLUG, TITLE
