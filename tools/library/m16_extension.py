# -*- coding: utf-8 -*-
"""ماژولِ موتورِ افزونه و قالب — برگرفته از Weby: includes/hooks.php، features.php، themes.php، ext-install.php و docs/ساخت-ماژول-و-قالب.md."""
from dsl import Doc, P, T, S, chain_module

TITLE = 'موتورِ ماژول و قالب (مثلِ وردپرس)'
SLUG = 'extension-engine'


def make(doc, parent=None, notes=None):
    ins = [P('پوشهٔ ماژول/قالب', 'ext/modules/<id>/ یا ext/themes/<id>/ با module.json یا theme.json و کد'),
           P('درخواستِ صفحه', 'هر صفحهٔ سایت یا پنل که از هسته رندر می‌شود'),
           P('انتخابِ مدیر', 'روشن/خاموش‌کردنِ ماژول، تعویضِ قالب، گزینه‌های قالب')]
    outs = [P('صفحهٔ رندرشده', 'خروجیِ هسته + قلاب‌ها + تکهٔ قالب'),
            P('وضعیتِ افزونه‌ها', 'فهرستِ ماژول‌ها/قالب‌ها با روشن/خاموش، خطا و کرش')]
    sections = [
        S('کشف و نصب', [ins[0], ins[2]], [P('افزونهٔ بارگذاری‌شده', 'ماژولِ روشن با قلاب‌های ثبت‌شده'), P('وضعیتِ افزونه‌ها', outs[1]['desc'])], icon='🧩',
          summary='پوشه‌های هسته و سایت، نصب از زیپ با نگهبان، روشن/خاموش',
          details='ماژول/قالبِ مخصوصِ یک سایت در ext/ است و دیپلوی نه می‌فرستدش نه پاک می‌کند؛ شناسهٔ تکراری: نسخهٔ همراهِ هسته برنده است تا ماژولِ سایت جای ماژولِ هسته ننشیند.',
          tasks=[
            T('کشفِ ماژول و قالب',
              [('p', 'پوشه‌ها: modules/، themes/ (همراهِ هسته)، ext/modules/، ext/themes/، includes/modules/ (هسته‌ای)'),
               ('p', 'خواندنِ module.json (id، name، description، contents، requires…)'),
               ('d', 'شناسه تکراری است؟', 'نسخهٔ هسته برنده'),
               ('d', 'ماژولِ ext/ خطای نحوی دارد؟', 'علامتِ کرش، خاموش، بدونِ سقوطِ سایت')],
              'هسته ماژول را نمی‌شناسد؛ ماژول با قلاب روی سایت می‌نشیند.',
              tech='themes_all(), theme_read(dir, source), features.php.', est=3, out=('افزونهٔ شناخته‌شده', 'فهرستِ افزونه‌ها')),
            T('نصب از زیپ',
              [('d', 'نصب مجاز است؟ (EXT_DISALLOW_INSTALL)', 'رد'),
               ('p', 'پسوندهای مجاز و فهرستِ «خطرناک»؛ مسیرِ امن (بی ../)'),
               ('p', 'استخراج به ext/<kind>/<id> و ثبتِ manifest'),
               ('d', 'ویرایشِ فایل مجاز است؟ (EXT_DISALLOW_FILE_EDIT)', 'ویرایشگر خاموش')],
              'نصب همان‌قدر امن است که پوشه‌ها: مسیرِ نسبیِ امن و پسوندِ مجاز.',
              tech='includes/ext-install.php: ext_safe_rel, ext_path_ok, ext_danger_ext, ext_allowed_ext.', est=3, out=('افزونهٔ نصب‌شده', 'پوشه در ext/')),
            T('روشن/خاموش و بارگذاری',
              [('p', 'مدیر در «ماژول‌ها و امکانات» روشن می‌کند'),
               ('p', 'module.php بارگذاری و قلاب‌ها وصل می‌شود'),
               ('d', 'امکان در features.php وابستگی دارد؟', 'وابستگی روشن باشد'),
               ('p', 'pages/paths/tasks: امکانِ خاموش در پنل، سایت و کارِ پس‌زمینه بسته می‌شود')],
              'ردیفی در features.php؛ پیش‌فرضِ فهرست = پیش‌فرضِ setting در کد.',
              tech='features_builtin(), features_groups(), feature_on(key).', est=3),
          ]),
        S('قلاب‌ها', [P('افزونهٔ بارگذاری‌شده', 'ماژول روشن'), ins[1]], [P('خروجیِ قلاب', 'مقدارِ filter یا خروجیِ action')], icon='🪝',
          summary='add_action/add_filter؛ قلابِ بی‌شنونده هیچ کاری نمی‌کند',
          details='قاعدهٔ «رفتارِ امروز»: do_action چیزی چاپ نمی‌کند و apply_filters همان مقدارِ ورودی را می‌دهد؛ پس قلابِ تازه سایت را حتی یک بایت عوض نمی‌کند. هزینه: یک isset.',
          tasks=[
            T('ثبتِ قلاب',
              [('p', 'add_action(hook, fn, priority=10, args=0) / add_filter'),
               ('p', 'اولویتِ کمتر زودتر؛ مثلِ وردپرس'),
               ('p', 'remove_action/remove_filter/remove_all_hooks')],
              'ماژول فقط به نقطه‌هایی وصل می‌شود که هسته اعلام کرده؛ هسته ماژول را نمی‌شناسد.',
              tech='includes/hooks.php؛ $GLOBALS["__hooks"][hook][priority].', est=1.5, out=('قلاب‌های ثبت‌شده', 'جدول قلاب')),
            T('اجرای قلاب',
              [('p', 'do_action(hook, …args): اجرا به ترتیبِ اولویت'),
               ('p', 'apply_filters(hook, value, …args): مقدار از هر شنونده می‌گذرد'),
               ('d', 'قلاب در حالِ اجراست (بازگشتی)؟', 'حلقهٔ بی‌پایان را بشکن (پشتهٔ __hooks_run)'),
               ('p', 'capture_action: خروجی را رشته کن')],
              'هر قلابِ هسته در hooks_catalog() هم نوشته می‌شود؛ در صفحه همیشه یک خطِ کاملِ PHP است.',
              tech='do_action, apply_filters, did_action, current_hook.', est=2),
          ]),
        S('قالب', [P('خروجیِ قلاب', 'نتیجهٔ قلاب‌ها'), ins[1]], [P('صفحهٔ رندرشده', outs[0]['desc'])], icon='🎨',
          summary='تکه‌های بدنهٔ صفحه، زنجیرهٔ قالب و گزینه‌ها',
          details='بدنهٔ هر صفحه در includes/parts/<نام>.php است و صفحه فقط theme_file(...) را require می‌کند؛ قالب می‌تواند جایگزینش کند. قالبِ classic = ظاهرِ امروز و هیچ تکه/CSSی به آن اضافه نمی‌شود.',
          tasks=[
            T('زنجیرهٔ قالب و تکه',
              [('p', 'theme_chain(): قالبِ فعال ← والد ← هسته'),
               ('p', 'theme_locate(part): اولین قالبی که این تکه را دارد'),
               ('d', 'قالب کرش کرد؟', 'theme_crashed: برگشت به classic'),
               ('p', 'theme_file(name)/theme_part(name, vars)')],
              'قالب می‌تواند هر تکه را بدونِ دست‌زدن به صفحه عوض کند.',
              tech='includes/themes.php؛ WEBY_ROOT به‌جای __DIR__ در تکه‌ها.', est=3, out=('تکهٔ انتخاب‌شده', 'مسیرِ تکه')),
            T('گزینه‌ها و دارایی‌ها',
              [('p', 'theme_option/theme_mod(key, default): گزینه‌های ذخیره‌شدهٔ قالب'),
               ('p', 'theme_head_html, theme_body_classes, theme_asset_url'),
               ('p', 'تعویضِ قالب: theme_switch(id) با نگهبان')],
              'مدیر بدونِ کد ظاهر را تنظیم می‌کند.', tech='theme_mods_save, theme_mods_reset.', est=2),
          ]),
    ]
    return chain_module(doc, parent, TITLE, '🧬', '#0891b2',
        'هسته ماژول و قالب را نمی‌شناسد؛ آن‌ها با قلاب (action/filter) و تکه‌های قالب روی سایت می‌نشینند — با به‌روزرسانی از بین نمی‌روند.',
        ins, outs, sections,
        details=('قاعده‌های سخت: ۱) امکانِ تازه در هسته = یک ردیف در features.php با پیش‌فرضِ «رفتارِ امروز»؛ ۲) قلابِ تازه = hooks_catalog()؛ ۳) هسته مالِ هیچ فروشگاهی نیست: نام، رنگ، متن، قالبِ پیامک و قرارداد در تنظیمات/ext/ هر سایت است؛ ۴) پارامترِ GETِ تازه در پنل باید در فهرستِ مجاز باشد.\n'
                 'این همان معماری‌ای است که Milo هم دارد: یک هسته، افزونه‌هایی که با «دیپلوی» دست نمی‌خورند.'),
        tech='Weby: includes/hooks.php، features.php، themes.php، ext-install.php، modules/، themes/، ext/؛ docs/ساخت-ماژول-و-قالب.md.',
        est=18, tags='افزونه، قلاب، قالب، وردپرس', notes=notes)


def build():
    d = Doc('ex'); make(d)
    return d, SLUG, TITLE
