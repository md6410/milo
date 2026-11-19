# -*- coding: utf-8 -*-
"""تست‌های Invora. مخزنِ Invora مجموعهٔ آزمونِ خودکار ندارد؛ آنچه «تعریف‌شده» است سه چیز است:
  ۱) خودآزمونِ ایستگاه چاپ در .github/workflows/print-agent.yml (روی ویندوزِ واقعی)،
  ۲) قواعدِ الزامیِ CLAUDE.md (سلامتِ سایت/به‌روزرسانی/نحو/رمزنگاری)،
  ۳) رفتارهایی که در کدِ app.html و PHP مستند شده‌اند — با مقدارهای عددی که با اجرای واقعیِ توابعِ app.html در مرورگر راستی‌آزمایی شده‌اند.
هر تست در source می‌گوید از کدام است."""

WF = '.github/workflows/print-agent.yml'
CM = 'CLAUDE.md'
CODE = 'app.html (اجرای واقعی در مرورگر)'
DOC = 'مستندِ کد/README'


def tests():
    T = {}
    def add(mod, title, given, expect, kind='unit', port='', state='', source=CODE, ek='value', **kw):
        t = dict(title=title, given=given, expect=expect, kind=kind, port=port, state=state, source=source, expect_kind=ek)
        t.update(kw); T.setdefault(mod, []).append(t)

    INV = 'فاکتورساز (پیش‌فاکتور، فاکتور، فاکتور رسمی)'
    # ---- محاسبه (calcDoc) — مقدارها از اجرای واقعی
    add(INV, 'جمعِ ساده با مالیات', '۲ عدد × ۱٬۰۰۰٬۰۰۰ ریال، مالیات ۱۰٪', '2200000', port='سندِ ثبت‌شده با شماره', state='ریال، فاکتور عادی', ref='INV-CALC-01')
    add(INV, 'تخفیفِ درصدیِ ردیف', '۱ عدد × ۱۰۰۰، تخفیفِ ردیف ۱۰٪', '900', ref='INV-CALC-02')
    add(INV, 'تخفیفِ کلِ سند پیش از مالیات', 'ردیف ۱۰۰۰، تخفیفِ سند ۱۰۰، مالیات ۹٪', '981', ref='INV-CALC-03', state='مبنای مالیات = ۹۰۰')
    add(INV, 'ردیفِ غیرمشمول مالیات نمی‌شود', 'ردیف مشمول ۱۰۰۰ + ردیف غیرمشمول ۵۰۰، مالیات ۱۰٪', 'مالیات = 100', ref='INV-CALC-04')
    add(INV, 'تخفیفِ ردیف از ناخالصِ همان ردیف بیشتر نمی‌شود', 'ردیف ۱۰۰۰ با تخفیف ۵۰۰۰', 'جمع = 0', ref='INV-CALC-05')
    add(INV, 'تخفیفِ درصدیِ کل روی جمعِ پس از تخفیفِ ردیف‌ها', 'ردیف‌ها ۲×۵۰۰ و ۱×۱۰۰۰، تخفیفِ سند ۱۰٪', 'afterDisc = 1800', ref='INV-CALC-06')
    add(INV, 'دلار تا دو رقمِ اعشار گرد می‌شود', '۳ × ۱٫۵۵۵ دلار', '4.67', ref='INV-CALC-07', state='ارز دلار')
    add(INV, 'هزینهٔ «سایر» در فاکتورِ عادی اضافه می‌شود', 'ردیف ۱۰۰۰ + سایر ۲۵۰', '1250', ref='INV-CALC-08')
    add(INV, 'در فاکتورِ رسمی «سایر» نادیده گرفته می‌شود', 'رسمی، ردیف ۱۰۰۰، مالیات ۱۰٪، سایر ۲۵۰', '1100', ref='INV-CALC-09')
    add(INV, 'مبلغ به حروف', '۱٬۲۵۰٬۰۰۰ ریال', 'یک میلیون و دویست و پنجاه هزار ریال', ref='INV-WORDS-01')
    add(INV, 'اعدادِ پایه به حروف', '0، 1، 10، 21، 100، 1000000000', 'صفر، یک، ده، بیست و یک، یکصد، یک میلیارد', ref='INV-WORDS-02', ek='contains')
    add(INV, 'شماره‌گذاری با الگو', 'الگو INV-{Y}-{N}، شمارهٔ ۷ با ۴ رقم، تاریخ ۱۴۰۵/۰۳/۱۵', 'INV-1405-0007', ref='INV-NUM-01')
    add(INV, 'الگوی {y}{M}{D}/{N}', 'شمارهٔ ۱۲ با ۳ رقم، ۱۴۰۵/۰۳/۰۵', '050305/012', ref='INV-NUM-02')
    add(INV, 'کدِ ملیِ معتبر', '0067749828', 'درست', ref='INV-ID-01', ek='true')
    add(INV, 'کدِ ملیِ ده رقمِ تکراری رد می‌شود', '1111111111', 'نادرست', ref='INV-ID-02', ek='false')
    add(INV, 'کدِ ملی با رقمِ کنترلِ اشتباه', '0067749829', 'نادرست', ref='INV-ID-03', ek='false')
    add(INV, 'شناسهٔ ملیِ حقوقی', '10380284790 ← معتبر؛ 12345678901 ← نامعتبر', 'درست؛ نادرست', ref='INV-ID-04')
    add(INV, 'فاکتورِ رسمی با مبلغ غیرریالی تبدیل یا خطا می‌دهد', 'ارزِ تومان/دلار + makeOfficial', 'تومان ×۱۰؛ دلار با نرخِ روز؛ بی‌نرخ: خطا', ref='INV-OFF-01', kind='integration', source=DOC)
    add(INV, 'فاکتورِ رسمی بدونِ ردیف رد می‌شود', 'سند رسمی بدونِ ردیف', 'خطا: هیچ ردیفی وارد نشده', ref='INV-OFF-02', ek='error', source=DOC)
    add(INV, 'ردیفِ رسمی بدونِ شناسهٔ ۱۳ رقمی', 'شناسهٔ کالا ۱۲ رقم', 'خطا برای همان ردیف', ref='INV-OFF-03', ek='error', source=DOC)
    add(INV, 'صورتحسابِ اصلاحی/ابطالی بدونِ سندِ اصلیِ ثبت‌شده', 'offSubject=cancel بدونِ offRef', 'خطا', ref='INV-OFF-04', ek='error', source=DOC)
    add(INV, 'شماره‌ٔ تکراری هشدار می‌دهد', 'شمارهٔ دستیِ برابرِ سندِ دیگرِ همان شرکت', 'هشدارِ تکراری', ref='INV-NUM-03', ek='true', source=DOC)
    add(INV, 'تاریخِ پیش‌فاکتور باید دست‌کم یک روز پیش از فاکتور باشد', 'پیش‌فاکتور ۱۴۰۵/۰۳/۱۰ و فاکتور ۱۴۰۵/۰۳/۱۰', 'هشدار linkCheck', ref='INV-LINK-01', ek='true', source=DOC)
    add(INV, 'سندِ ثبت‌شده قفل است', 'ویرایشِ فاکتورِ committed', 'بازکردن لازم است و نسخهٔ قبلی در revisions می‌ماند', ref='INV-LOCK-01', kind='integration', source=DOC)

    CAL = 'تقویمِ شمسی، تعطیلات و نرخِ دلار'
    add(CAL, 'سالِ کبیسه', '۱۳۹۹، ۱۴۰۳، ۱۴۰۴، ۱۴۰۵', 'کبیسه، کبیسه، عادی، عادی', ref='CAL-01')
    add(CAL, 'طولِ ماه‌ها', 'فروردین ۱۴۰۵، مهر ۱۴۰۵، اسفند ۱۴۰۵، اسفند ۱۴۰۳', '31، 30، 29، 30', ref='CAL-02')
    add(CAL, 'تبدیلِ رفت‌وبرگشتیِ تاریخ', 'j2d(1405,1,1) سپس jStr', '1405/01/01', ref='CAL-03')
    add(CAL, 'قاعدهٔ تعطیلات', 'تاریخ تعطیل + holidayRule=next', 'نزدیک‌ترین روزِ کاریِ بعد', ref='CAL-04', kind='integration', source=DOC)
    add(CAL, 'سرویس‌های زمان در دسترس نیستند', 'قطعِ اینترنت', 'ساعتِ دستگاه + هشدار؛ برنامه از کار نمی‌افتد', ref='CAL-05', kind='integration', source=DOC)

    ACC = 'حسابداریِ واریز، هزینه و سهمِ شرکا'
    add(ACC, 'تقسیمِ برابر مجموعش درست است', '۱۰۰ بینِ سه شریکِ هم‌ضریب', 'a=34, b=33, c=33 (باقیِ ریز به اولین)', ref='ACC-01', port='طلبِ شرکا')
    add(ACC, 'تقسیم با ضریبِ ۲ به ۱', '۱۰۰۰ بین a(2) و b(1)', 'a=667, b=333', ref='ACC-02')
    add(ACC, 'مبلغِ صفر سهمی نمی‌سازد', 'accSplit(0, {a:1})', '{} (خالی)', ref='ACC-03')
    add(ACC, 'جمعِ سهم‌ها همیشه برابر مبلغ است', 'هر مبلغ و هر ضریبِ مثبت', 'Σ سهم‌ها = مبلغ', ref='ACC-04', ek='true')
    add(ACC, 'فقط فاکتورِ ثبت‌شده به دفتر می‌رود', 'پیش‌فاکتور/برگشت از فروش/ابطال رسمی/زیرمجموعهٔ گروهی', 'accConfirmable = نادرست', ref='ACC-05', ek='false', source=DOC)
    add(ACC, 'تأییدِ خریدار برگشت‌پذیر نیست', 'برداشتنِ تأیید پس از buyerOk', 'رد: فاکتور قفلِ همیشگی است', ref='ACC-06', ek='error', source=DOC)
    add(ACC, 'واریز هزینهٔ ماه را اول می‌پوشاند', 'هزینهٔ ماه ۶۰۰، واریز ۱۰۰۰', 'toExp=600، سهمِ شرکا=400', ref='ACC-07', kind='integration', source=DOC)
    add(ACC, 'باقیِ ماهِ گذشته به ماهِ بعد منتقل می‌شود', 'carry روشن، ماه گذشته با مانده', 'carryIn ماهِ بعد = مانده', ref='ACC-08', kind='integration', source=DOC)

    SH = 'لینکِ دانلودِ رمزدار و تأییدِ اصالتِ سند'
    add(SH, 'قبل از رمز هیچ نامی از سند دیده نمی‌شود', 'GET d.php?t=<توکن> بدونِ رمز', 'نه عنوان نه نامِ فایل', ref='SH-01', kind='security', source=DOC, ek='true')
    add(SH, 'رمزِ ناقص تلاشِ اشتباه حساب نمی‌شود', 'رمز با ۳ رقم', 'شمارنده تغییر نکند', ref='SH-02', kind='integration', source=DOC)
    add(SH, 'پنجمین رمزِ اشتباه لینک را قفل می‌کند', '۵ رمزِ ۵ رقمیِ اشتباه', 'وضعیتِ locked؛ فایل و گزارش می‌مانند', ref='SH-03', kind='security', source=DOC)
    add(SH, 'فاصله و «رمز:» از رمز حذف می‌شود', '« رمز: ۱۲۳۴۵ »', 'رمز = 12345', ref='SH-04', kind='integration', source=DOC)
    add(SH, 'لینکِ غیرموجود', 'توکنِ نامعتبر', 'HTTP 404 «این لینک وجود ندارد»', ref='SH-05', ek='error', kind='integration', source=DOC)
    add(SH, 'هر بازشدن با آی‌پی و دستگاه ثبت می‌شود', 'درست/غلط، دیدن/دانلود', 'ردیفِ share_log', ref='SH-06', kind='integration', source=DOC)
    add(SH, 'تأییدِ اصالت بدونِ رمزِ پیامکی محتوا نشان نمی‌دهد', 'GET v.php?t=<QR>', 'فقط نامِ رابط و ۴ رقمِ آخرِ شماره', ref='SH-07', kind='security', source=DOC)
    add(SH, 'کدِ QRِ ثبت‌نشده', 'توکنِ ۲۲ نویسه که وجود ندارد', '404 «اصالتِ این سند تأیید نمی‌شود»', ref='SH-08', ek='error', kind='integration', source=DOC)

    AU = 'ورودِ بی‌رمز (OTP، Passkey، کپچا)'
    add(AU, 'کپچا از درخواستِ چهارم لازم است', '۴ ارسالِ کد در یک ساعت از یک آی‌پی', 'df_cap_needed = درست (سه بارِ اول: نادرست)', ref='AU-01', port='درخواستِ ورود', kind='integration', source=DOC)
    add(AU, 'کپچا یک‌بارمصرف است و ۵ دقیقه اعتبار دارد', 'پاسخِ درست پس از ۶ دقیقه / بار دوم', 'رد', ref='AU-02', ek='false', kind='integration', source=DOC)
    add(AU, 'Passkey بدونِ کوکیِ دستگاه باز نمی‌شود', 'امضای درست ولی بدونِ DFDEV', 'رد', ref='AU-03', kind='security', ek='error', source=DOC)

    VT = 'ذخیرهٔ رمزشده (AES-256 با کلیدِ کاربر)'
    add(VT, 'رمز و رمزگشایی برمی‌گردد', 'df_enc(متن, کلید, aad) سپس df_dec با همان', 'متنِ اصلی', ref='VT-01', port='داده‌ٔ بازشده', source=DOC)
    add(VT, 'AAD اشتباه رمزگشایی نمی‌کند', 'df_dec با aad دیگر', 'null', ref='VT-02', ek='value', source=DOC, kind='security')
    add(VT, 'سرآیندِ فایل', 'خروجیِ df_enc', 'با «DFE1» شروع می‌شود', ref='VT-03', source=DOC)
    add(VT, 'کدِ بازیابیِ اشتباه', 'df_unwrap با کد غلط', 'null (kcv نمی‌خورد)', ref='VT-04', kind='security', source=DOC)
    add(VT, 'iv هر بار تازه است', 'دو رمزِ پشتِ‌سرهم از یک متن', 'خروجی‌ها یکی نیستند', ref='VT-05', kind='security', ek='true', source=DOC)

    UP = 'به‌روزرسانیِ خودکار از گیت‌هاب'
    add(UP, 'سلامتِ سایت پس از نصب', 'GET index.php?df_health=1', 'ok', ref='UP-01', source=CM, kind='integration')
    add(UP, 'api.php با GET', 'GET api.php', 'JSON {"error":"method"}', ref='UP-02', source=CM, kind='integration')
    add(UP, 'd.php بدونِ توکن', 'GET d.php', 'صفحهٔ ۴xx', ref='UP-03', source=CM, kind='integration', ek='error')
    add(UP, 'خطای نحوی نصب را رد می‌کند', 'فایلِ PHP با خطای نحوی در نسخهٔ تازه', 'نصب نمی‌شود', ref='UP-04', source=CM, ek='error', kind='integration')
    add(UP, 'سلامتِ ناموفق پس از نصب', 'df_upd_health = false', 'بازگرداندنِ خودکار + پیامِ «نسخهٔ قبلی برگردانده شد»', ref='UP-05', source=CM, kind='integration')
    add(UP, 'مسیرِ ناایمن در deploy-files.txt', 'مسیر با «..» یا بیش از یک پوشه یا *.ini', 'RuntimeException «مسیر نامعتبر»', ref='UP-06', source=CM, ek='error', kind='security')
    add(UP, 'فایلِ ضروری نیست', 'نسخه بدونِ app.html', 'نصب نمی‌شود', ref='UP-07', source=CM, ek='error')
    add(UP, 'شمارهٔ نسخه', '<meta name="app-version"> در app.html', 'همیشه موجود و تنها منبعِ نسخه', ref='UP-08', source=CM, ek='true')
    add(UP, 'به‌روزرسانیِ همزمان', 'دو درخواستِ نصب هم‌زمان', 'دومی: «به‌روزرسانی دیگری در حال انجام است»', ref='UP-09', ek='error', source=DOC, kind='integration')

    PS = 'چاپگر مرکزی (ایستگاهِ چاپ)'
    add(PS, 'خودآزمونِ ایستگاه (کاربرِ فعلی)', 'InvoraPrint.exe selftest --out selftest-user.json', 'کدِ خروج ۰', ref='PS-01', kind='e2e', source=WF)
    add(PS, 'نصب با زمان‌بندِ ویندوز', 'InvoraPrint.exe install --quiet', 'کدِ خروج ۰', ref='PS-02', kind='e2e', source=WF)
    add(PS, 'وظیفه برای کاربرانِ واردشده اجرا می‌شود', 'schtasks /XML', 'GroupId = S-1-5-32-545', ref='PS-03', kind='e2e', source=WF)
    add(PS, 'وظیفه با ورود به ویندوز شروع می‌شود', 'schtasks /XML', 'LogonTrigger موجود', ref='PS-04', kind='e2e', source=WF, ek='true')
    add(PS, 'ایستگاه بعد از نصب بالا می‌آید', 'GET http://127.0.0.1:8766/state تا ۴۰ بار', 'پاسخ ۲۰۰', ref='PS-05', kind='e2e', source=WF)
    add(PS, 'config.json در نصب برداشته می‌شود', 'config.json کنارِ برنامه با توکنِ آزمون', 'توکن در C:\\ProgramData\\InvoraPrint\\config.json همان است', ref='PS-06', kind='e2e', source=WF)
    add(PS, 'نسخهٔ نصب‌شده هم خودآزمون را می‌گذراند', 'selftest روی C:\\ProgramData\\InvoraPrint\\InvoraPrint.exe', 'Edge → PDF → تصویر، کدِ خروج ۰', ref='PS-07', kind='e2e', source=WF)
    add(PS, 'نصبِ دوباره (به‌روزرسانی) پیکربندی را نگه می‌دارد', 'install --quiet برای بار دوم', 'کدِ خروج ۰ و config.json دست‌نخورده', ref='PS-08', kind='e2e', source=WF)
    add(PS, 'کارِ چاپ‌شده دوباره چاپ نمی‌شود', 'سایت همان کار را دوباره بدهد', 'PRINTED: done گزارش شود بدونِ چاپ', ref='PS-09', kind='integration', source=DOC)

    BT = 'صدورِ گروهیِ اسناد از روی یک سندِ مرجع'
    add(BT, 'بازهٔ تاریخ «همان»', 'refDateMode=same', 'offset = {0}', ref='BT-01', source=DOC)
    add(BT, 'بازهٔ تاریخ «بعد» از ۱ تا ۳ روز', 'refDateMode=after, min=1, max=3', 'offsetها ⊆ {1,2,3}', ref='BT-02', source=DOC)
    add(BT, 'بذرِ تصادفی پایدار است', 'دو بازسازیِ پشتِ‌سرهم با قاعدهٔ یکسان', 'همان offset و دلتا', ref='BT-03', kind='integration', ek='true', source=DOC)
    add(BT, 'تغییرِ قاعده بذرِ تازه می‌سازد', 'تغییرِ refPriceMode', 'دلتای جدید', ref='BT-04', kind='integration', source=DOC)
    add(BT, 'تاریخ روی تعطیل نمی‌افتد', 'holidayRule≠warn و offset روی تعطیل', 'نزدیک‌ترین روزِ کاری', ref='BT-05', kind='integration', source=DOC)
    return T
