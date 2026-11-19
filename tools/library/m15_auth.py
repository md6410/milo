# -*- coding: utf-8 -*-
"""ماژولِ ورود و احرازِ هویت — برگرفته از Weby (auth.php, passkey.php, captcha.php, otp) و Invora (inc/passkey.php, inc/captcha.php, auth.php)."""
from dsl import Doc, P, T, S, chain_module

TITLE = 'ورودِ بی‌رمز (OTP، Passkey، کپچا)'
SLUG = 'auth-otp-passkey'


def make(doc, parent=None, notes=None):
    ins = [P('درخواستِ ورود', 'شمارهٔ موبایل/نامِ کاربری و هدفِ ورود (سایت، پنلِ مدیریت، کارکنان)'),
           P('کدِ پیامکی', 'کدی که کاربر وارد کرد'),
           P('اثباتِ دستگاه', 'پاسخِ WebAuthn (امضا + authenticatorData + clientDataJSON)')]
    outs = [P('نشستِ واردشده', 'نشست (session) با کاربر و سطحِ دسترسی'),
            P('دستگاهِ مورد اعتماد', 'ثبتِ passkey و رازِ دستگاه در کوکیِ httpOnly')]
    sections = [
        S('کپچا و محدودیتِ ارسال', [ins[0]], [P('اجازهٔ ارسالِ کد', 'ارسال مجاز است (یا کپچا حل شد)')], icon='🧩',
          summary='جلوی ربات‌هایی که اعتبارِ پنلِ پیامک را خالی می‌کنند',
          details='از درخواستِ چهارم در یک ساعت (از همین مرورگر یا همین آی‌پی) کپچا لازم است؛ شمارش از نشست و آی‌پی، هر کدام بیشتر.',
          tasks=[
            T('شمارش و کپچا',
              [('p', 'شمارِ ارسال‌های یک ساعتِ اخیر: نشست و آی‌پی'),
               ('d', 'بیش از ۳ بار بی‌کپچا؟', 'کپچا لازم است'),
               ('p', 'تصویرِ PNG با GD: پنج رقم با جابه‌جایی، چرخش، خط و نقطه؛ پاسخ هش‌شده در نشست، یک‌بارمصرف، ۵ دقیقه'),
               ('d', 'GD نیست؟', 'جمعِ ساده با SVG'),
               ('p', 'فاصلهٔ ارسالِ دوباره (cooldown ۹۰ث)')],
              'ربات نمی‌تواند پیامک پشتِ پیامک بفرستد؛ کاربرِ واقعی در سه بارِ اول چیزی نمی‌بیند.',
              tech='inc/captcha.php: df_cap_needed/count/check/image؛ Weby: captcha.php + otp_cooldown_left.', est=3, out=('مجوزِ ارسال', 'کپچای حل‌شده یا نیاز نیست')),
          ]),
        S('کدِ یک‌بارمصرف', [P('اجازهٔ ارسالِ کد', 'مجوزِ ارسال'), ins[1]], [P('کاربرِ تأییدشده', 'کاربری که کدش درست بود')], icon='🔐',
          summary='تولید، ارسالِ پیامکی (ماژولِ SMS.IR) و سنجش',
          details='کد ۵ رقمی، ۳ دقیقه اعتبار، حداکثر ۵ تلاش؛ هدفِ کد در سنجش می‌آید.',
          tasks=[
            T('تولید و ارسال',
              [('p', 'کدِ تازه با random_int؛ هشِ bcrypt (cost=8) ذخیره'),
               ('p', 'پیامک با قالب و خطِ WebOTP (@دامنه #کد)'),
               ('d', 'پیامک نرفت؟', 'ردیف پاک شود تا کاربر جریمه نشود')],
              'روی اندروید کد خودکار پر می‌شود.', tech='ماژول «پیامک SMS.IR» بخشِ OTP.', est=2, out=('کدِ فرستاده‌شده', 'ردیفِ کد')),
            T('سنجش',
              [('d', 'منقضی/بیش از ۵ تلاش؟', 'نادرست'),
               ('p', 'password_verify؛ هدف باید یکی باشد'),
               ('p', 'موفق: used=1 و تأییدِ شماره')],
              'کدِ ورودِ سایت در پنلِ مدیریت کار نمی‌کند.', tech='otp_check(mobile, code, purpose).', est=1.5),
          ]),
        S('ورودِ بی‌رمز با Passkey', [P('کاربرِ تأییدشده', 'کاربر'), ins[2]], [P('نشستِ واردشده', outs[0]['desc']), P('دستگاهِ مورد اعتماد', outs[1]['desc'])], icon='👆',
          summary='WebAuthn بدونِ کتابخانهٔ بیرونی؛ دستگاهِ مورد اعتماد',
          details='هسته: CBOR، تبدیلِ کلیدِ COSE به PEM، authenticatorData، challenge، امضا. attestation عمداً «none» است؛ دامنه (rpId)، challenge، پرچمِ «کاربر تأیید شد» و خودِ امضا سنجیده می‌شوند.',
          tasks=[
            T('ثبتِ passkey',
              [('p', 'گزینه‌های ثبت: pk_reg_options (rp، کاربر، challenge با اعتبار ۱۸۰ث)'),
               ('p', 'مرورگر navigator.credentials.create'),
               ('p', 'pk_reg_verify: clientData (type/origin/challenge)، authData، کلیدِ عمومی ← PEM'),
               ('p', 'رازِ ۳۲ بایتیِ دستگاه در کوکیِ DFDEV (httpOnly، ماندگار)؛ کلیدِ داده با آن قفل و کنارِ کاربر ذخیره')],
              'دستگاه فقط وقتی «مورد اعتماد» است که هم کوکیِ همان دستگاه و هم امضای اثرانگشت باشد.',
              details='در Invora همهٔ دادهٔ سرور با کلیدِ داده (DEK) رمز است که فقط با رمزِ کاربر باز می‌شود؛ passkey رمز نیست، پس بدونِ «دستگاهِ مورد اعتماد» نمی‌تواند DEK را باز کند.',
              tech='inc/passkey.php: pk_reg_options/verify، df_dev_ensure؛ Weby: passkey.php.', est=5, out=('ثبتِ دستگاه', 'passkey و دستگاه')),
            T('ورود با passkey',
              [('p', 'pk_login_options (challenge)'),
               ('d', 'امضا درست و rpId/origin/flags درست؟', 'رد'),
               ('p', 'کلیدِ داده از رازِ دستگاه باز شود؛ نشست ساخته شود'),
               ('p', 'برچسبِ دستگاه از UA برای فهرستِ «دستگاه‌های من»؛ حذفِ هر دستگاه')],
              'ورود بدونِ رمز و بدونِ پیامک، فقط روی دستگاهِ فعال‌شده.',
              tech='pk_login_verify، df_dev_dek، df_dev_remove.', est=4),
          ]),
    ]
    return chain_module(doc, parent, TITLE, '🔑', '#4f46e5',
        'ورودِ بی‌رمز: کدِ پیامکی با کپچای ضدِ ربات و Passkey (اثر انگشت/چهره) با دستگاهِ مورد اعتماد.',
        ins, outs, sections,
        details=('سه لایه: کپچا (ضدِ ربات)، کد (اثباتِ مالکیتِ موبایل)، passkey (اثباتِ دستگاه). هر کدام مستقل قابل‌خاموش‌اند.\n'
                 'Weby سه درِ ورود جدا دارد (سایت، مدیریت، کارکنان) و کد با «هدف» محدود می‌شود؛ Invora کلیدِ رمزگشایی را هم به همین دستگاهِ مورد اعتماد گره می‌زند.'),
        tech='Weby: auth.php, passkey.php, captcha.php؛ Invora: auth.php, inc/passkey.php, inc/captcha.php, inc/sms.php.',
        est=14, tags='ورود، OTP، Passkey، WebAuthn', notes=notes)


def build():
    d = Doc('au'); make(d)
    return d, SLUG, TITLE
