<?php
declare(strict_types=1);
/**
 * به‌روزرسانی خودکار Milo از گیت‌هاب.
 * هر چند دقیقه (وقتی کسی وارد شده) آخرین commit شاخهٔ main بررسی می‌شود. اگر تازه بود: ZIP همان commit گرفته می‌شود،
 * نحوِ همهٔ فایل‌های PHP سنجیده می‌شود، از فایل‌های فعلی پشتیبان گرفته می‌شود، فایل‌های deploy-files.txt جایگزین می‌شوند
 * و در پایان سلامتِ سایت سنجیده می‌شود؛ اگر بالا نیامد نسخهٔ قبلی برمی‌گردد. پوشهٔ data هیچ‌وقت دست نمی‌خورد.
 */
if (!defined('PM_DATA')) { http_response_code(403); exit; }

/* برای آینه یا آزمون: data/config.local.php می‌تواند ثابت‌های PM_GH_* را پیش از این‌ها تعریف کند */
if (is_file(PM_DATA . '/config.local.php')) include PM_DATA . '/config.local.php';

defined('PM_UPDATE_REPO') || define('PM_UPDATE_REPO', 'md6410/milo');
defined('PM_UPDATE_BRANCH') || define('PM_UPDATE_BRANCH', 'main');
defined('PM_GH_API') || define('PM_GH_API', 'https://api.github.com');
defined('PM_GH_WEB') || define('PM_GH_WEB', 'https://github.com');
defined('PM_GH_RAW') || define('PM_GH_RAW', 'https://raw.githubusercontent.com');
defined('PM_GH_ZIP') || define('PM_GH_ZIP', 'https://codeload.github.com');

function pm_root(): string { return dirname(__DIR__); }
function pm_version(): string { $v = @include __DIR__ . '/version.php'; return is_string($v) ? $v : ''; }
function pm_parse_version(string $src): string { return preg_match("/return\s+'([0-9][0-9A-Za-z.\-]*)'/", $src, $m) ? $m[1] : ''; }

function pm_jread(string $name, array $def = []): array {
    $j = json_decode((string)@file_get_contents(PM_DATA . '/' . $name), true);
    return is_array($j) ? $j : $def;
}
function pm_jupdate(string $name, callable $fn): void {
    $f = fopen(PM_DATA . '/' . $name, 'c+');
    if (!$f) return;
    flock($f, LOCK_EX);
    $cur = json_decode((string)stream_get_contents($f), true);
    $cur = is_array($cur) ? $cur : [];
    $fn($cur);
    ftruncate($f, 0); rewind($f);
    fwrite($f, json_encode($cur, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    fflush($f); flock($f, LOCK_UN); fclose($f);
}
function pm_upd_state(): array { return array_merge(['auto' => true, 'every' => 10], pm_jread('update.json')); }
function pm_release(): array { return pm_jread('release.json'); }

/* GET → [status, body]؛ status 0 = خطای شبکه */
function pm_http(string $url, int $timeout = 20, array $headers = []): array {
    if (!function_exists('curl_init')) {
        $ctx = stream_context_create(['http' => ['timeout' => $timeout, 'ignore_errors' => true, 'header' => "User-Agent: Milo-Updater\r\n" . implode("\r\n", $headers)]]);
        $b = @file_get_contents($url, false, $ctx);
        $code = 0;
        foreach ($http_response_header ?? [] as $h) if (preg_match('~^HTTP/\S+\s+(\d{3})~', $h, $m)) $code = (int)$m[1];
        return [$b === false ? 0 : $code, (string)$b];
    }
    $c = curl_init($url);
    curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5,
        CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => 'Milo-Updater', CURLOPT_HTTPHEADER => $headers]);
    if (defined('CURLOPT_PROTOCOLS')) curl_setopt($c, CURLOPT_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
    $b = curl_exec($c);
    $code = $b === false ? 0 : (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
    curl_close($c);
    return [$code, $b === false ? '' : (string)$b];
}

/* آخرین commit شاخه: API گیت‌هاب، و اگر نشد فهرست refهای git */
function pm_upd_latest(): ?array {
    [$c, $b] = pm_http(PM_GH_API . '/repos/' . PM_UPDATE_REPO . '/commits/' . rawurlencode(PM_UPDATE_BRANCH), 15, ['Accept: application/vnd.github+json']);
    $j = $c === 200 ? json_decode($b, true) : null;
    if (is_array($j) && preg_match('/^[0-9a-f]{40}$/', (string)($j['sha'] ?? ''))) {
        return ['sha' => $j['sha'], 'date' => (string)($j['commit']['committer']['date'] ?? ''), 'msg' => trim((string)strtok((string)($j['commit']['message'] ?? ''), "\n"))];
    }
    [$c, $b] = pm_http(PM_GH_WEB . '/' . PM_UPDATE_REPO . '.git/info/refs?service=git-upload-pack', 15);
    if ($c === 200 && preg_match('~([0-9a-f]{40}) refs/heads/' . preg_quote(PM_UPDATE_BRANCH, '~') . '\b~', $b, $m)) return ['sha' => $m[1], 'date' => '', 'msg' => ''];
    return null;
}
function pm_upd_remote_version(string $sha): string {
    [$c, $b] = pm_http(PM_GH_RAW . '/' . PM_UPDATE_REPO . '/' . $sha . '/inc/version.php', 15);
    return $c === 200 ? pm_parse_version($b) : '';
}

function pm_upd_safe_rel(string $p): bool {
    return (bool)preg_match('~^(\.?[A-Za-z0-9_\-][A-Za-z0-9_.\-]*)(/\.?[A-Za-z0-9_\-][A-Za-z0-9_.\-]*)?$~', $p)
        && strpos($p, '..') === false && strncmp($p, 'data/', 5) !== 0 && substr($p, -4) !== '.ini' && substr($p, -9) !== '.local.php';
}
/* بلوک‌هایی که cPanel/LiteSpeed در .htaccess ساخته (مثلاً نسخهٔ PHP) نگه داشته می‌شود */
function pm_upd_merge_htaccess(string $new, string $old): string {
    $keep = []; $in = false;
    foreach (preg_split('/\r\n|\n|\r/', $old) as $line) {
        if (preg_match('/^#\s*(php -- )?BEGIN /', $line)) $in = true;
        if ($in) $keep[] = $line;
        if (preg_match('/^#\s*(php -- )?END /', $line)) $in = false;
    }
    return rtrim($new) . "\n" . ($keep ? "\n" . implode("\n", $keep) . "\n" : '');
}
function pm_upd_opcache(array $files): void { if (function_exists('opcache_invalidate')) foreach ($files as $f) @opcache_invalidate($f, true); }
function pm_upd_write(string $abs, string $content): void {
    $dir = dirname($abs);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $tmp = $abs . '.upd' . bin2hex(random_bytes(3));
    if (@file_put_contents($tmp, $content, LOCK_EX) === false) throw new RuntimeException('نوشتن فایل ممکن نشد: ' . basename($abs));
    @chmod($tmp, 0644);
    if (!@rename($tmp, $abs)) { @unlink($tmp); throw new RuntimeException('جایگزینی فایل ممکن نشد: ' . basename($abs)); }
}
function pm_base_url(): string {
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $dir = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/api.php'))), '/');
    return ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $dir . '/';
}
function pm_upd_health(): array {
    $base = pm_base_url();
    [$c, $b] = pm_http($base . 'index.php?health=1&r=' . bin2hex(random_bytes(4)), 15);
    if ($c === 0) return ['ok' => null, 'note' => 'سنجش سلامت انجام نشد (سرور به خودش دسترسی نداشت).'];
    if ($c !== 200 || strncmp($b, 'ok', 2) !== 0) return ['ok' => false, 'note' => 'index.php: HTTP ' . $c];
    [$c, $b] = pm_http($base . 'api.php?a=me', 15);
    if ($c !== 0 && ($c !== 200 || strpos($b, '"csrf"') === false)) return ['ok' => false, 'note' => 'api.php: HTTP ' . $c];
    return ['ok' => true, 'note' => 'HTTP 200'];
}

/* دریافت، اعتبارسنجی و نصبِ commit */
function pm_upd_apply(array $latest, string $by): array {
    @set_time_limit(180);
    @mkdir(PM_DATA . '/locks', 0700, true);
    $lock = fopen(PM_DATA . '/locks/update.lock', 'c');
    if (!flock($lock, LOCK_EX | LOCK_NB)) return ['ok' => false, 'error' => 'به‌روزرسانی دیگری در حال انجام است.'];
    try {
        $sha = $latest['sha'];
        [$c, $zipData] = pm_http(PM_GH_ZIP . '/' . PM_UPDATE_REPO . '/zip/' . $sha, 60);
        if ($c !== 200 || strncmp($zipData, 'PK', 2) !== 0) [$c, $zipData] = pm_http(PM_GH_API . '/repos/' . PM_UPDATE_REPO . '/zipball/' . $sha, 60);
        if ($c !== 200 || strncmp($zipData, 'PK', 2) !== 0) throw new RuntimeException('دریافت نسخهٔ تازه از گیت‌هاب ممکن نشد.');
        if (!class_exists('ZipArchive')) throw new RuntimeException('افزونهٔ zip در PHP فعال نیست (Select PHP Version ← zip).');
        $zf = PM_DATA . '/tmp-update.zip';
        file_put_contents($zf, $zipData);
        $zip = new ZipArchive();
        if ($zip->open($zf) !== true) throw new RuntimeException('فایل ZIP نسخهٔ تازه خراب است.');
        $first = (string)$zip->getNameIndex(0);
        $prefix = strpos($first, '/') !== false ? substr($first, 0, strpos($first, '/') + 1) : '';
        $manifest = $zip->getFromName($prefix . 'deploy-files.txt');
        if ($manifest === false) throw new RuntimeException('فهرست فایل‌ها (deploy-files.txt) در نسخهٔ تازه نیست.');
        $files = [];
        foreach (preg_split('/\r\n|\n|\r/', $manifest) as $line) {
            $p = trim($line);
            if ($p === '' || $p[0] === '#') continue;
            if (!pm_upd_safe_rel($p)) throw new RuntimeException('مسیر نامعتبر در فهرست: ' . $p);
            $content = $zip->getFromName($prefix . $p);
            if ($content === false || $content === '') throw new RuntimeException('فایل ' . $p . ' در نسخهٔ تازه نیست.');
            $files[$p] = $content;
        }
        $zip->close(); @unlink($zf);
        foreach (['index.php', 'api.php', 'inc/db.php', 'inc/update.php', 'inc/version.php', 'assets/app.js'] as $need)
            if (!isset($files[$need])) throw new RuntimeException('فایل ضروری ' . $need . ' در نسخهٔ تازه نیست.');
        $ver = pm_parse_version($files['inc/version.php']);
        if ($ver === '') throw new RuntimeException('شمارهٔ نسخه در inc/version.php تازه پیدا نشد.');
        foreach ($files as $p => $content) {
            if (substr($p, -4) !== '.php') continue;
            try { token_get_all($content, TOKEN_PARSE); }
            catch (Throwable $e) { throw new RuntimeException('خطای نحوی در ' . $p . ' (خط ' . $e->getLine() . '): نصب نشد.'); }
        }
        /* پشتیبان از فایل‌های فعلی */
        $root = pm_root();
        $bk = PM_DATA . '/releases/previous';
        if (is_dir($bk)) foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($bk, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $f) $f->isDir() ? @rmdir((string)$f) : @unlink((string)$f);
        $backed = [];
        foreach (array_keys($files) as $p) if (is_file($root . '/' . $p)) {
            $dst = $bk . '/' . $p;
            if (!is_dir(dirname($dst))) @mkdir(dirname($dst), 0700, true);
            if (@copy($root . '/' . $p, $dst)) $backed[] = $p;
        }
        $oldRel = pm_release();
        $written = [];
        try {
            foreach ($files as $p => $content) {
                $abs = $root . '/' . $p;
                if ($p === '.htaccess') $content = pm_upd_merge_htaccess($content, is_file($abs) ? (string)file_get_contents($abs) : '');
                pm_upd_write($abs, $content);
                $written[] = $abs;
            }
            pm_upd_write(PM_DATA . '/release.json', json_encode(['sha' => $sha, 'version' => $ver, 'at' => time(), 'by' => $by, 'msg' => $latest['msg'] ?? ''], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        } catch (Throwable $e) {
            pm_upd_restore($backed, $bk, $root, array_keys($files));
            if (empty($oldRel)) @unlink(PM_DATA . '/release.json');
            throw $e;
        }
        pm_upd_opcache($written);
        $h = pm_upd_health();
        if ($h['ok'] === false) {
            pm_upd_restore($backed, $bk, $root, array_keys($files));
            if (!empty($oldRel)) pm_upd_write(PM_DATA . '/release.json', json_encode($oldRel, JSON_UNESCAPED_UNICODE));
            else @unlink(PM_DATA . '/release.json');
            throw new RuntimeException('سایت بعد از نصبِ نسخهٔ ' . $ver . ' بالا نیامد (' . $h['note'] . ')؛ نسخهٔ قبلی برگردانده شد.');
        }
        return ['ok' => true, 'version' => $ver, 'sha' => $sha, 'from' => $oldRel['version'] ?? '', 'note' => $h['note']];
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}
function pm_upd_restore(array $backed, string $bk, string $root, array $newFiles): void {
    $touched = [];
    foreach ($backed as $p) if (@copy($bk . '/' . $p, $root . '/' . $p)) $touched[] = $root . '/' . $p;
    foreach ($newFiles as $p) if (!in_array($p, $backed, true) && is_file($root . '/' . $p)) @unlink($root . '/' . $p);
    pm_upd_opcache($touched);
}

/* بررسی (با رعایت فاصله، مگر $force) و در صورت $install نصبِ commit تازه‌تر */
function pm_upd_run(bool $force, bool $install, string $by): array {
    $st = pm_upd_state();
    $rel = pm_release();
    $out = ['checked' => false, 'updated' => false];
    if (!$force && time() - (int)($st['lastCheck'] ?? 0) < max(2, (int)$st['every']) * 60) return $out;
    pm_jupdate('update.json', function (array &$s) { $s['lastCheck'] = time(); });
    $latest = pm_upd_latest();
    $out['checked'] = true;
    if (!$latest) {
        pm_jupdate('update.json', function (array &$s) { $s['lastError'] = 'گیت‌هاب در دسترس نبود.'; $s['lastErrorAt'] = time(); });
        $out['error'] = 'اتصال به گیت‌هاب برقرار نشد.';
        return $out;
    }
    $isNew = ($rel['sha'] ?? '') !== $latest['sha'];
    $remoteVer = $isNew ? pm_upd_remote_version($latest['sha']) : ($rel['version'] ?? pm_version());
    pm_jupdate('update.json', function (array &$s) use ($latest, $remoteVer, $isNew) {
        $s['latestSha'] = $latest['sha']; $s['latestVersion'] = $remoteVer; $s['latestMsg'] = $latest['msg']; $s['latestDate'] = $latest['date'];
        if (!$isNew) unset($s['lastError'], $s['failedSha']);
    });
    /* نصبِ دستیِ اولین‌بار: اگر release.json نبود ولی نسخهٔ فعلی با نسخهٔ گیت‌هاب یکی است، فقط ثبت می‌شود */
    if ($isNew && empty($rel) && $remoteVer !== '' && $remoteVer === pm_version()) {
        pm_upd_write(PM_DATA . '/release.json', json_encode(['sha' => $latest['sha'], 'version' => $remoteVer, 'at' => time(), 'by' => 'baseline', 'msg' => $latest['msg']], JSON_UNESCAPED_UNICODE));
        return $out + ['available' => false];
    }
    if (!$isNew || !$install) return $out + ['available' => $isNew];
    if (!$force && ($st['failedSha'] ?? '') === $latest['sha']) return $out + ['available' => true, 'error' => (string)($st['lastError'] ?? '')];
    try { $r = pm_upd_apply($latest, $by); } catch (Throwable $e) { $r = ['ok' => false, 'error' => $e->getMessage()]; }
    if (empty($r['version'])) $r['version'] = $remoteVer;
    pm_jupdate('update.json', function (array &$s) use ($r, $by) {
        $s['history'] = array_slice(array_merge([['at' => time(), 'by' => $by, 'ok' => $r['ok'], 'version' => $r['version'] ?? '', 'from' => $r['from'] ?? '', 'error' => $r['error'] ?? '']], $s['history'] ?? []), 0, 20);
        if ($r['ok']) { unset($s['lastError'], $s['failedSha']); }
        else { $s['lastError'] = $r['error']; $s['lastErrorAt'] = time(); $s['failedSha'] = $s['latestSha'] ?? ''; }
    });
    return array_merge($out, ['updated' => $r['ok'], 'version' => $r['version'] ?? '', 'error' => $r['error'] ?? '']);
}
function pm_upd_status(): array {
    $st = pm_upd_state(); $rel = pm_release();
    $latestVer = (string)($st['latestVersion'] ?? '');
    return ['installed' => ['version' => pm_version(), 'sha' => $rel['sha'] ?? '', 'at' => ($rel['at'] ?? 0) * 1000, 'by' => $rel['by'] ?? ''],
        'latest' => ['sha' => $st['latestSha'] ?? '', 'version' => $latestVer, 'msg' => $st['latestMsg'] ?? '', 'date' => $st['latestDate'] ?? ''],
        'available' => !empty($st['latestSha']) && ($rel['sha'] ?? '') !== $st['latestSha'],
        'auto' => (bool)$st['auto'], 'every' => (int)$st['every'], 'lastCheck' => ($st['lastCheck'] ?? 0) * 1000,
        'lastError' => $st['lastError'] ?? '', 'history' => array_map(fn($h) => ['at' => $h['at'] * 1000] + $h, $st['history'] ?? []),
        'repo' => PM_UPDATE_REPO, 'zip' => class_exists('ZipArchive')];
}
