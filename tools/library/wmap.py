# -*- coding: utf-8 -*-
"""نگاشتِ فایل‌های آزمونِ Weby به ماژول‌های پروژه (به ترتیبِ اولویت؛ اولین الگوی منطبق)."""
import re

# کلیدها: عنوانِ ماژولِ درج‌شده در پروژه، یا کلیدِ موضوعِ تازه (با پیشوندِ «+»)
PRODUCT = 'کالا، قیمت و واحد'
SELLER = 'فروشنده (چندفروشنده و امانی)'
PARTNER = 'همکارِ فروش (گرید و قیمتِ همکاری)'
TOROB = 'اتصال به ترب (API، وبهوک، انتسابِ فروش)'
ORDER = 'سبد، تسویه‌حساب و چرخهٔ سفارش'
PAYCORE = 'هستهٔ پرداختِ آنلاین'
JIBIT = 'درگاه جیبیت (Jibit)'
DIGI = 'دیجی‌پی (کیف پول و اعتبار)'
SNAPPPAY = 'اسنپ‌پی (خرید اعتباری و قسطی)'
WH = 'انبارِ چندگانه با کدِ دانه'
SCAN = 'خواندنِ QR و بارکد'
LABEL = 'ساخت و چاپِ برچسب'
PRINT = 'چاپگر مرکزی (ایستگاهِ چاپ)'
MAP = 'نقشه و نشان'
SHIP = 'میزِ ارسال و حامل‌ها'
SMS = 'ارسال پیامک با SMS.IR'
AUTH = 'ورودِ بی‌رمز (OTP، Passkey، کپچا)'
INVOICE = 'فاکتورساز (پیش‌فاکتور، فاکتور، فاکتور رسمی)'
EXT = 'موتورِ ماژول و قالب (مثلِ وردپرس)'

RULES = [
    (r'^torob', TOROB),
    (r'^emalls', '+MKT'),
    (r'^jibit', JIBIT),
    (r'^digipay', DIGI),
    (r'^snapppay', SNAPPPAY),
    (r'^bnpl', '+BNPL'),
    (r'^wallet', '+WALLET'),
    (r'^cap', '+CAP'),
    (r'^(partner|pholdalloc|poshold)', PARTNER),
    (r'^(seller|prod_sellers)', SELLER),
    (r'^(qpos|pos(?!t))', '+POS'),
    (r'^(post|tipax|courier|snapp|ship|ldship|xslot|swappost|pickup|ebzpanel|quote)', SHIP),
    (r'^motherrev', '+CAP'),
    (r'^sendvar', SMS),
    (r'^multipaper', PRINT),
    (r'^(label|salelabel|waitlabel)', LABEL),
    (r'^(print|dispprint)', PRINT),
    (r'^(scan|unit_scan)', SCAN),
    (r'^(wh|warehouse|stock|minstock|out_of_stock|wrholo|orderwhcode|coding|axiscode|offshop)', WH),
    (r'^(map|geo|cover|datacover|citypick|cityloose|netnational|bgnet|vpn|mapvpn|addr|useraddr|orgaddr|caddr)', MAP),
    (r'^(mailnotify|mail_letter|msgcenter|bale|feedback|fb)', '+MSG'),
    (r'^(sms|nosms|otpgate|pksms|stagesms|smsgate|smstpl|ordersms|ordernotify|notifyrules|pnseen)', SMS),
    (r'^(passkey|captcha|csrf|sessttl|regterms|guest|usermake|impersonate|userdel|useractivity)', AUTH),
    (r'^(perms|rolefix|staff|admin|actfor|panels|psedit|psfinal|psrowfinal|psvarsame|psro)', '+STAFF'),
    (r'^(invoice|cashinv|invrace)', INVOICE),
    (r'^(order|cart|checkout|coupon|reorder|shoporder|retbanner|returnacc|salefees|finalstatus|statflag|cancelstale|quickcancel|zerobase|amend|ownbox|packing)', ORDER),
    (r'^(pay|gw|sandbox|spay)', PAYCORE),
    (r'^(product|products|prodtype|var|pdp|deal|price|units|unit|famrecode|dims|bestseller|catalog|srvline|profitpct)', PRODUCT),
    (r'^(hooks|extend|themes|extinstall|standalone|wizard|legacycss|poweredby)', EXT),
    (r'^(hr|payslip)', '+HR'),
    (r'^(accprofit|finance|bankacc|analytics|anexport|dashsales|fxavail|fxchart)', '+FIN'),
    (r'^(contacts|contactsort|contactwatch|custnotes|custrename|custpick|customer|calledit|callsurvey|quicknotes|gcontacts|outbyname|account)', '+CRM'),
    (r'^(review|tkform|ticket|qa)', '+REV'),
    (r'^(seo|blog|sitemap|ogimage|robotsfacets|slugredirect|page|search)', '+SEO'),
    (r'^(rich|bubble|wordpaste|docximport|lightbox|pageeditor)', '+RICH'),
    (r'^(backup|perf|srvhealth|probe|dbrevive|schema|release|pagecache|csp|localassets|mediaurl|photoshrink|imgprep|sbxsql|audit|getguard|tagguard|pz_|e2e_full|fixes9|quickfix4|formdraft|ticklock|sim|fileextras|docshare|install)', '+INFRA'),
    (r'^(visual|preview|ribbon|pwabanner|responsive|digits|fatext|siteicon|navmenu|navleak|navmemory|agencytitle|guides|codewidth|codecols|moneyinput|money|num_value|stack)', '+UX'),
]

TOPICS = {
    '+MKT': ('مقایسه‌گرها و بازاریابیِ بیرونی (ایمالز…)', '📣', 'اتصال به سایت‌های مقایسهٔ قیمت و کانال‌های بیرونی غیر از ترب', 'catalog'),
    '+BNPL': ('خریدِ اقساطی و دفترِ BNPL', '🧮', 'تخفیف/کارمزدِ هر روشِ اعتباری و دفترِ طلب‌وبدهیِ اقساط (اسنپ‌پی/دیجی‌پی)', 'order'),
    '+WALLET': ('کیف پولِ مشتری', '👛', 'اعتبار در حسابِ مشتری، پرداخت از آن و اختلافِ کرایه', 'order'),
    '+CAP': ('کپسولِ شارژی (درگردش)', '🧯', 'کالای درگردش: کپسولِ پر/خالی، کدِ کپسول، شارژ، مبادله، پست و پیک، برچسب و راهنما', 'pos'),
    '+POS': ('فروشِ حضوری (POS)', '🏪', 'فروشِ حضوریِ کارکنان: سبد، مشتری، نشانی، رزرو، نگه‌داری، پرداخت و اسکن', 'pos'),
    '+MSG': ('پیام‌رسان، ایمیل و نامه', '✉️', 'مرکزِ پیام، ایمیل/نامه، ربات بله و بازخورد', 'crm'),
    '+STAFF': ('پنل مدیریت و کارکنان', '🛠️', 'پنل‌های مدیر/کارمند/فروشنده، نقش‌ها و دسترسی‌ها، منو، اعزامِ اقدام به‌جای دیگری', 'admin'),
    '+HR': ('منابع انسانی و فیش حقوقی', '👥', 'کارمندان، حضور و فیش حقوقی', 'admin'),
    '+FIN': ('حسابداری و گزارش مالی', '📊', 'سود، حساب‌های بانکی، داشبورد فروش، تحلیل و خروجی', 'admin'),
    '+CRM': ('مخاطبین و ارتباط با مشتری', '📇', 'پروندهٔ مشتری، مخاطبین، یادداشت، تماس و نظرسنجی', 'crm'),
    '+REV': ('نظر، پرسش و پشتیبانی', '💬', 'دیدگاه و عکس، پرسش و پاسخ، تیکت و فرم پشتیبانی', 'crm'),
    '+SEO': ('وبلاگ، سئو و صفحه‌ها', '📰', 'وبلاگ، نقشهٔ سایت، OG، robots، تغییرِ مسیرِ نشانی و جست‌وجو', 'seo'),
    '+RICH': ('ویرایشگرِ محتوا و صفحه‌ساز', '✍️', 'ویرایشگرِ غنی، حباب‌ها، چسباندن از Word، وارد کردن docx، نمایش تصویر', 'seo'),
    '+INFRA': ('زیرساخت، امنیت و پایداری', '🧱', 'پشتیبان، کارایی، سلامتِ سرور، مهاجرتِ دیتابیس، CSP، رسانه، ورودی‌ها و شبیه‌سازها', 'infra'),
    '+UX': ('تجربهٔ کاربری و ظاهر', '🎨', 'ارقامِ فارسی، پاسخ‌گویی، ریبون/بنر، PWA، منوها، فیلدها', 'infra'),
    '+MISC': ('سایر آزمون‌های عمومی', '🧩', 'آزمون‌هایی که به یک ماژولِ مشخص نمی‌خورند', 'infra'),
}


def topic(stem):
    for pat, tgt in RULES:
        if re.match(pat, stem):
            return tgt
    return '+MISC'


if __name__ == '__main__':
    import collections
    from wtests import all_tests
    r = all_tests(); c = collections.Counter(); files = collections.defaultdict(list)
    for k, v in r.items():
        stem = k[2:].rsplit('.', 1)[0]
        t = topic(stem); c[t] += len(v['tests']); files[t].append(stem)
    for t, n in c.most_common(): print(n, t, len(files[t]))
    print('MISC:', files['+MISC'])
