/* تقویم جلالی (الگوریتم jalaali-js) + کمک‌های تاریخِ میلادیِ ISO */
(function (W) {
  function div(a, b) { return ~~(a / b); }
  function mod(a, b) { return a - ~~(a / b) * b; }
  var br = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  function jalCal(jy) {
    var bl = br.length, gy = jy + 621, leapJ = -14, jp = br[0], jm, jump = 0, leap, leapG, march, n, i;
    for (i = 1; i < bl; i += 1) {
      jm = br[i]; jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap: leap, gy: gy, march: march };
  }
  function g2d(gy, gm, gd) {
    var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  }
  function d2g(jdn) {
    var j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    var i = div(mod(j, 1461), 4) * 5 + 308;
    var gd = div(mod(i, 153), 5) + 1, gm = mod(div(i, 153), 12) + 1, gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy: gy, gm: gm, gd: gd };
  }
  function j2d(jy, jm, jd) {
    var r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }
  function d2j(jdn) {
    var gy = d2g(jdn).gy, jy = gy - 621, r = jalCal(jy), jdn1f = g2d(gy, 3, r.march), jd, jm, k;
    k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy: jy, jm: jm, jd: jd }; }
      k -= 186;
    } else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
    jm = 7 + div(k, 30); jd = mod(k, 30) + 1;
    return { jy: jy, jm: jm, jd: jd };
  }
  var MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  var FA = '۰۱۲۳۴۵۶۷۸۹';
  function fa(s) { return String(s).replace(/\d/g, function (d) { return FA[d]; }); }
  function en(s) {
    return String(s).replace(/[۰-۹]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(c); })
      .replace(/[٠-٩]/g, function (c) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(c); });
  }
  /* day number (روزهای از 1970-01-01 UTC) <-> ISO */
  function isoToDay(iso) {
    if (!iso) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : null;
  }
  function dayToIso(n) {
    var d = new Date(n * 864e5);
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }
  function dayToJ(n) { var d = new Date(n * 864e5); return d2j(g2d(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())); }
  function jToDay(jy, jm, jd) { var g = d2g(j2d(jy, jm, jd)); return Math.round(Date.UTC(g.gy, g.gm - 1, g.gd) / 864e5); }
  function fmt(iso, long) {
    var n = isoToDay(iso); if (n == null) return '';
    var j = dayToJ(n);
    return long ? fa(j.jd) + ' ' + MONTHS[j.jm - 1] + ' ' + fa(j.jy) : fa(j.jy + '/' + ('0' + j.jm).slice(-2) + '/' + ('0' + j.jd).slice(-2));
  }
  function parse(str) {
    str = en(String(str || '')).trim();
    if (!str) return null;
    var m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(str);
    if (!m) return undefined;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (y > 1700) { // میلادی
      return dayToIso(isoToDay(y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2)));
    }
    if (mo < 1 || mo > 12 || d < 1 || d > (mo <= 6 ? 31 : 30)) return undefined;
    return dayToIso(jToDay(y, mo, d));
  }
  W.JAL = { MONTHS: MONTHS, fa: fa, en: en, isoToDay: isoToDay, dayToIso: dayToIso, dayToJ: dayToJ, jToDay: jToDay, fmt: fmt, parse: parse,
    today: function () { var d = new Date(); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); } };
})(window);
