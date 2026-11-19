<?php
declare(strict_types=1);
require __DIR__ . '/inc/db.php';
require __DIR__ . '/inc/import.php';
require __DIR__ . '/inc/update.php';

ini_set('display_errors', '0');
session_name('pmsid');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off']);
session_start();
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));

function out(array $a, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($a, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function fail(string $m, int $code = 400): never { out(['error' => $m], $code); }

try {
    $db = pm_db();
    $a = (string)($_GET['a'] ?? '');
    $isPost = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
    $in = [];
    if ($isPost) {
        $ct = (string)($_SERVER['CONTENT_TYPE'] ?? '');
        if (stripos($ct, 'application/json') !== false) {
            $in = json_decode((string)file_get_contents('php://input'), true);
            if (!is_array($in)) fail('JSON نامعتبر');
        } else {
            $in = $_POST;
        }
    }
    $users = (int)$db->query('SELECT COUNT(*) FROM users')->fetchColumn();

    // ---- احراز هویت
    if ($a === 'me') {
        out(['user' => $_SESSION['user'] ?? null, 'csrf' => $_SESSION['csrf'], 'needs_setup' => $users === 0, 'version' => pm_version()]);
    }
    if ($isPost && ($a === 'setup' || $a === 'login')) {
        if (!hash_equals($_SESSION['csrf'], (string)($_SERVER['HTTP_X_CSRF'] ?? ''))) fail('نشست منقضی شد؛ صفحه را تازه کنید', 403);
        $u = pm_str($in['username'] ?? '', 60);
        $pw = (string)($in['password'] ?? '');
        if ($a === 'setup') {
            if ($users > 0) fail('نصب قبلاً انجام شده', 403);
            if ($u === '' || mb_strlen($pw) < 6) fail('نام کاربری و رمز (حداقل ۶ نویسه) لازم است');
            $db->prepare('INSERT INTO users(username,pass_hash,created_at) VALUES(?,?,?)')
               ->execute([$u, password_hash($pw, PASSWORD_DEFAULT), pm_now()]);
        } else {
            $st = $db->prepare('SELECT * FROM users WHERE username=?');
            $st->execute([$u]);
            $row = $st->fetch();
            usleep(500000);
            if (!$row || !password_verify($pw, $row['pass_hash'])) fail('نام کاربری یا رمز درست نیست', 401);
        }
        session_regenerate_id(true);
        $_SESSION['user'] = $u;
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
        out(['user' => $u, 'csrf' => $_SESSION['csrf']]);
    }
    if (empty($_SESSION['user'])) fail('ورود لازم است', 401);
    if ($isPost && !hash_equals($_SESSION['csrf'], (string)($_SERVER['HTTP_X_CSRF'] ?? ''))) fail('نشست منقضی شد؛ صفحه را تازه کنید', 403);
    $author = (string)$_SESSION['user'];
    $now = pm_now();

    $pid = (int)($in['project_id'] ?? ($_GET['project_id'] ?? 0));
    $needProject = function () use ($db, $pid): array {
        $st = $db->prepare('SELECT * FROM projects WHERE id=?');
        $st->execute([$pid]);
        return $st->fetch() ?: fail('پروژه پیدا نشد', 404);
    };
    $ownNode = function (int $id) use ($db, $pid): array {
        $st = $db->prepare('SELECT * FROM nodes WHERE id=? AND project_id=?');
        $st->execute([$id, $pid]);
        return $st->fetch() ?: fail('بخش پیدا نشد', 404);
    };
    $touch = fn() => $db->prepare('UPDATE projects SET updated_at=? WHERE id=?')->execute([$now, $pid]);

    switch ($a) {
        case 'logout':
            $_SESSION = [];
            session_destroy();
            out(['ok' => true]);

        case 'passwd':
            $pw = (string)($in['password'] ?? '');
            if (mb_strlen($pw) < 6) fail('رمز حداقل ۶ نویسه باشد');
            $db->prepare('UPDATE users SET pass_hash=? WHERE username=?')->execute([password_hash($pw, PASSWORD_DEFAULT), $author]);
            out(['ok' => true]);

        // ---- به‌روزرسانی از گیت‌هاب
        case 'update_status':
            out(['ok' => true, 'upd' => pm_upd_status()]);
        case 'update_tick':      // صفحهٔ باز هر چند دقیقه صدا می‌زند؛ اگر خودکار روشن باشد نصب می‌کند
            session_write_close();
            $r = pm_upd_run(false, (bool)pm_upd_state()['auto'], 'auto');
            out(['ok' => true, 'r' => $r, 'upd' => pm_upd_status()]);
        case 'update_check':
        case 'update_apply':
            session_write_close();
            $r = pm_upd_run(true, $a === 'update_apply', $author);
            out(['ok' => empty($r['error']), 'error' => $r['error'] ?? '', 'r' => $r, 'upd' => pm_upd_status()], empty($r['error']) ? 200 : 502);
        case 'update_cfg':
            $every = max(2, min(1440, (int)($in['every'] ?? 10)));
            $auto = !empty($in['auto']);
            pm_jupdate('update.json', function (array &$s) use ($auto, $every) { $s['auto'] = $auto; $s['every'] = $every; });
            out(['ok' => true, 'upd' => pm_upd_status()]);

        // ---- پروژه‌ها
        case 'projects':
            $rows = $db->query("SELECT * FROM projects WHERE kind='project' ORDER BY updated_at DESC")->fetchAll();
            out(['projects' => array_map(fn($p) => pm_project_summary($db, $p), $rows)]);

        case 'project_save':
            $f = [
                'name' => pm_str($in['name'] ?? '', 200),
                'description' => pm_str($in['description'] ?? '', 20000),
                'start_date' => pm_date($in['start_date'] ?? null),
                'target_date' => pm_date($in['target_date'] ?? null),
                'status' => in_array($in['status'] ?? '', ['active', 'hold', 'done', 'archived'], true) ? $in['status'] : 'active',
                'ai_brief' => pm_str($in['ai_brief'] ?? '', 20000),
            ];
            if ($f['name'] === '') fail('نام پروژه لازم است');
            if ($pid) {
                $needProject();
                $db->prepare('UPDATE projects SET name=?,description=?,start_date=?,target_date=?,status=?,ai_brief=?,updated_at=? WHERE id=?')
                   ->execute([...array_values($f), $now, $pid]);
                pm_chg($db, $pid, null, 'ویرایش تنظیمات پروژه', '', $author);
            } else {
                $db->prepare('INSERT INTO projects(name,description,start_date,target_date,status,ai_brief,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
                   ->execute([...array_values($f), $now, $now]);
                $pid = (int)$db->lastInsertId();
                pm_chg($db, $pid, null, 'ساخت پروژه', $f['name'], $author);
            }
            out(['id' => $pid]);

        case 'project_delete':
            if (pm_proj_kind($db, $pid) === 'library') fail('کتابخانهٔ ماژول‌ها پاک نمی‌شود');
            $needProject();
            pm_delete_files($db, 'project_id=?', [$pid]);
            foreach (['deps', 'milestones', 'logs', 'tests', 'nodes', 'changes', 'revisions', 'routes'] as $t) $db->prepare("DELETE FROM $t WHERE project_id=?")->execute([$pid]);
            $db->prepare('DELETE FROM projects WHERE id=?')->execute([$pid]);
            out(['ok' => true]);

        case 'project_get':
            $p = pm_project_summary($db, $needProject());
            $q = function (string $sql) use ($db, $pid) { $s = $db->prepare($sql); $s->execute([$pid]); return $s->fetchAll(); };
            out([
                'project' => $p,
                'nodes' => array_map('pm_node_out', $q('SELECT * FROM nodes WHERE project_id=? ORDER BY sort,id')),
                'deps' => $q('SELECT * FROM deps WHERE project_id=? ORDER BY id'),
                'milestones' => $q('SELECT * FROM milestones WHERE project_id=? ORDER BY date,id'),
                'test_stats' => (object)pm_test_stats($db, $pid),
                'logs' => $q('SELECT * FROM logs WHERE project_id=? ORDER BY created_at DESC, id DESC LIMIT 3000'),
                'files' => $q('SELECT id,project_id,node_id,log_id,name,mime,size,created_at FROM files WHERE project_id=? ORDER BY id'),
                'changes' => $q('SELECT * FROM changes WHERE project_id=? ORDER BY id DESC LIMIT 150'),
                'revisions' => $q('SELECT id,project_id,note,summary,author,created_at FROM revisions WHERE project_id=? ORDER BY id DESC LIMIT 50'),
                'routes' => $q('SELECT node_id,data FROM routes WHERE project_id=?'),
            ]);

        case 'routes_save':   // node_id (۰ = سطحِ اصلی)، data: JSON مسیرها که «چیدمان خودکار» ساخته
            $needProject();
            $nid = (int)($in['node_id'] ?? 0);
            $data = (string)($in['data'] ?? '');
            if (strlen($data) > 4 * 1024 * 1024 || !is_array(json_decode($data, true))) fail('دادهٔ مسیرها نامعتبر است');
            $db->prepare('INSERT OR REPLACE INTO routes(project_id,node_id,data,updated_at) VALUES(?,?,?,?)')
               ->execute([$pid, $nid, $data, $now]);
            out(['ok' => true]);

        // ---- کتابخانهٔ ماژول‌ها (پروژهٔ ویژه که همهٔ پروژه‌ها از آن استفاده می‌کنند)
        case 'library':
            out(['id' => pm_library_id($db)]);

        case 'library_list':
            $lid = pm_library_id($db);
            $st = $db->prepare("SELECT * FROM nodes WHERE project_id=? AND parent_id IS NULL AND kind='module' ORDER BY title");
            $st->execute([$lid]);
            $mods = array_map('pm_node_out', $st->fetchAll());
            foreach ($mods as &$m) {
                $m['children'] = count(pm_subtree($db, $lid, $m['id']));
                unset($m['details'], $m['flow'], $m['tech']);
            }
            out(['library_id' => $lid, 'modules' => $mods]);

        // ---- ماژول‌ها و پروژه‌های آمادهٔ همراهِ برنامه (library/*.pm.json)
        case 'bundled_catalog': {
            $files = glob(__DIR__ . '/library/*.pm.json') ?: [];
            $lib = pm_library_id($db);
            $have = $db->prepare("SELECT title FROM nodes WHERE project_id=? AND parent_id IS NULL AND kind='module'");
            $have->execute([$lib]);
            $haveT = array_flip($have->fetchAll(PDO::FETCH_COLUMN));
            $hp = array_flip($db->query("SELECT name FROM projects WHERE kind='project'")->fetchAll(PDO::FETCH_COLUMN));
            $mods = []; $projs = [];
            foreach ($files as $f) {
                $j = json_decode((string)file_get_contents($f), true);
                if (!is_array($j)) continue;
                $base = basename($f);
                if (!empty($j['library_module'])) {
                    $root = null;
                    foreach ($j['nodes'] ?? [] as $n) if (empty($n['parent'])) { $root = $n; break; }
                    $mods[] = ['file' => $base, 'title' => $j['library_module']['title'] ?? $base, 'summary' => $root['summary'] ?? '', 'icon' => $root['icon'] ?? '🧩',
                        'nodes' => count($j['nodes'] ?? []), 'inputs' => count($root['inputs'] ?? []), 'outputs' => count($root['outputs'] ?? []), 'group' => $j['library_module']['group'] ?? '',
                        'installed' => isset($haveT[$j['library_module']['title'] ?? ''])];
                } elseif (!empty($j['bundled_project'])) {
                    $projs[] = ['file' => $base, 'title' => $j['bundled_project']['title'] ?? $base, 'summary' => $j['bundled_project']['summary'] ?? '', 'nodes' => count($j['nodes'] ?? []),
                        'installed' => isset($hp[$j['project']['name'] ?? ''])];
                }
            }
            out(['modules' => $mods, 'projects' => $projs]);
        }

        case 'bundled_import': {     // files: ['x.pm.json', ...] — ماژول‌ها وارد کتابخانه، پروژه‌ها پروژهٔ تازه می‌شوند
            $names = is_array($in['files'] ?? null) ? $in['files'] : [];
            $lib = pm_library_id($db);
            $res = ['modules' => 0, 'projects' => 0, 'skipped' => 0, 'warnings' => [], 'project_ids' => []];
            foreach ($names as $nm) {
                $nm = basename((string)$nm);
                if (!preg_match('/^[A-Za-z0-9_.\-]+\.pm\.json$/', $nm)) continue;
                $path = __DIR__ . '/library/' . $nm;
                $j = is_file($path) ? json_decode((string)file_get_contents($path), true) : null;
                if (!is_array($j)) continue;
                if (!empty($j['library_module'])) {
                    $t = $db->prepare("SELECT COUNT(*) FROM nodes WHERE project_id=? AND parent_id IS NULL AND kind='module' AND title=?");
                    $t->execute([$lib, $j['library_module']['title'] ?? '']);
                    if ((int)$t->fetchColumn() > 0 && empty($in['replace'])) { $res['skipped']++; continue; }
                    $r = pm_import($db, $j, 'update', $lib, $author);
                    $res['modules']++; $res['warnings'] = array_merge($res['warnings'], $r['warnings']);
                } elseif (!empty($j['bundled_project'])) {
                    $r = pm_import($db, $j, 'new', null, $author);
                    $res['projects']++; $res['project_ids'][] = $r['project_id']; $res['warnings'] = array_merge($res['warnings'], $r['warnings']);
                }
            }
            out($res);
        }

        case 'node_copy':     // src_node_id → dst_project_id / dst_parent_id (+ x,y,title)
            $src = (int)($in['src_node_id'] ?? 0);
            $dstPid = (int)($in['dst_project_id'] ?? 0);
            $dstParent = ($in['dst_parent_id'] ?? null) ? (int)$in['dst_parent_id'] : null;
            $st = $db->prepare('SELECT id FROM projects WHERE id=?'); $st->execute([$dstPid]);
            if (!$st->fetchColumn()) fail('پروژهٔ مقصد پیدا نشد', 404);
            $over = [];
            if (isset($in['title'])) $over['title'] = pm_str($in['title'], 300);
            if (isset($in['x'])) $over['x'] = (float)$in['x'];
            if (isset($in['y'])) $over['y'] = (float)$in['y'];
            $db->beginTransaction();
            try { $r = pm_copy_subtree($db, $src, $dstPid, $dstParent, $over); $db->commit(); }
            catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); fail($e->getMessage()); }
            pm_chg($db, $dstPid, $r['id'], 'درج ماژول از کتابخانه/رونوشت', $r['count'] . ' بخش', $author);
            $db->prepare('UPDATE projects SET updated_at=? WHERE id=?')->execute([$now, $dstPid]);
            out(['id' => $r['id'], 'count' => $r['count']]);


        // ---- تست‌ها
        case 'tests':   // project_id, node_id? (با sub=1 زیرمجموعه هم)، status?, q?, kind?, limit, offset
            $needProject();
            $w = ['project_id=?']; $a = [$pid];
            $nid = (int)($in['node_id'] ?? 0);
            if ($nid) {
                $ids = !empty($in['sub']) ? array_merge([$nid], pm_subtree($db, $pid, $nid)) : [$nid];
                $w[] = 'node_id IN (' . implode(',', array_map('intval', $ids)) . ')';
            }
            if (!empty($in['status']) && isset(PM_TEST_STATUS[$in['status']])) { $w[] = 'status=?'; $a[] = $in['status']; }
            if (!empty($in['kind']) && isset(PM_TEST_KINDS[$in['kind']])) { $w[] = 'kind=?'; $a[] = $in['kind']; }
            $qs = trim((string)($in['q'] ?? ''));
            if ($qs !== '') { $w[] = '(title LIKE ? OR ref LIKE ? OR port LIKE ? OR state LIKE ? OR given LIKE ? OR expect LIKE ?)'; for ($i = 0; $i < 6; $i++) $a[] = '%' . $qs . '%'; }
            $cond = implode(' AND ', $w);
            $c = $db->prepare("SELECT COUNT(*) FROM tests WHERE $cond"); $c->execute($a);
            $total = (int)$c->fetchColumn();
            $lim = max(1, min(500, (int)($in['limit'] ?? 100))); $off = max(0, (int)($in['offset'] ?? 0));
            $st = $db->prepare("SELECT * FROM tests WHERE $cond ORDER BY node_id, sort, id LIMIT $lim OFFSET $off"); $st->execute($a);
            $sum = $db->prepare("SELECT status, COUNT(*) n FROM tests WHERE project_id=? GROUP BY status"); $sum->execute([$pid]);
            out(['total' => $total, 'tests' => array_map('pm_test_out', $st->fetchAll()), 'summary' => $sum->fetchAll(PDO::FETCH_KEY_PAIR)]);

        case 'tests_all':  // برای خروجی: همهٔ تست‌های پروژه
            $needProject();
            $st = $db->prepare('SELECT * FROM tests WHERE project_id=? ORDER BY node_id, sort, id'); $st->execute([$pid]);
            out(['tests' => array_map('pm_test_out', $st->fetchAll())]);

        case 'test_save':    // node_id، id? و فیلدها
            $needProject();
            $nid = (int)($in['node_id'] ?? 0);
            $q = $db->prepare('SELECT title FROM nodes WHERE id=? AND project_id=?'); $q->execute([$nid, $pid]);
            $nt = $q->fetchColumn();
            if ($nt === false) fail('بخش پیدا نشد', 404);
            $isNew = empty($in['id']);
            $tid = pm_test_put($db, $pid, $nid, $in, $author, true);
            pm_chg($db, $pid, $nid, $isNew ? 'تستِ تازه' : 'ویرایشِ تست', pm_str($in['title'] ?? '', 120), $author);
            $r = $db->prepare('SELECT * FROM tests WHERE id=?'); $r->execute([$tid]);
            out(['test' => pm_test_out($r->fetch())]);

        case 'test_delete':
            $needProject();
            $tid = (int)($in['id'] ?? 0);
            $q = $db->prepare('SELECT node_id,title FROM tests WHERE id=? AND project_id=?'); $q->execute([$tid, $pid]);
            $t = $q->fetch();
            if (!$t) fail('تست پیدا نشد', 404);
            $db->prepare('DELETE FROM tests WHERE id=?')->execute([$tid]);
            pm_chg($db, $pid, (int)$t['node_id'], 'حذفِ تست', pm_str($t['title'], 120), $author);
            out(['ok' => true]);

        case 'test_status':   // ids[] یا id + status (+ note). ثبتِ نتیجهٔ اجرا
            $needProject();
            $ids = array_values(array_filter(array_map('intval', is_array($in['ids'] ?? null) ? $in['ids'] : [$in['id'] ?? 0])));
            $stt = (string)($in['status'] ?? '');
            if (!isset(PM_TEST_STATUS[$stt]) || !$ids) fail('وضعیت یا تست نامعتبر');
            $now = pm_now();
            $up = $db->prepare('UPDATE tests SET status=?, last_at=?, last_by=?, last_note=?, updated_at=? WHERE id=? AND project_id=?');
            foreach ($ids as $tid) $up->execute([$stt, $now, $author, pm_str($in['note'] ?? '', 1000), $now, $tid, $pid]);
            out(['ok' => true, 'count' => count($ids)]);

        case 'test_reset':    // همهٔ نتیجه‌ها (یا فقط یک گره و زیرمجموعه) را «اجرا نشده» کن
            $needProject();
            $nid = (int)($in['node_id'] ?? 0);
            $cond = '';
            if ($nid) { $ids = array_merge([$nid], pm_subtree($db, $pid, $nid)); $cond = ' AND node_id IN (' . implode(',', array_map('intval', $ids)) . ')'; }
            $db->prepare("UPDATE tests SET status='untested', last_at=NULL, last_by='', last_note='' WHERE project_id=?$cond")->execute([$pid]);
            out(['ok' => true]);

        // ---- نسخه‌ها (ذخیره / بازگردانی)
        case 'revision_save':
            $needProject();
            $snap = pm_snapshot($db, $pid);
            $note = pm_str($in['note'] ?? '', 300);
            $sum = pm_str($in['summary'] ?? '', 1000);
            $db->prepare('INSERT INTO revisions(project_id,note,summary,author,created_at,data) VALUES(?,?,?,?,?,?)')
               ->execute([$pid, $note, $sum, $author, $now, json_encode($snap, JSON_UNESCAPED_UNICODE)]);
            pm_chg($db, $pid, null, 'ذخیرهٔ نسخه', $note ?: $sum, $author);
            $db->prepare('DELETE FROM revisions WHERE project_id=? AND id NOT IN (SELECT id FROM revisions WHERE project_id=? ORDER BY id DESC LIMIT 60)')->execute([$pid, $pid]);
            out(['ok' => true, 'id' => (int)$db->lastInsertId()]);

        case 'revision_restore':
            $needProject();
            $st = $db->prepare('SELECT * FROM revisions WHERE id=? AND project_id=?');
            $st->execute([(int)($in['id'] ?? 0), $pid]);
            $rv = $st->fetch() ?: fail('نسخه پیدا نشد', 404);
            pm_restore($db, $pid, json_decode((string)$rv['data'], true) ?: []);
            pm_chg($db, $pid, null, 'بازگردانی نسخه', 'نسخهٔ ' . $rv['created_at'], $author);
            $touch();
            out(['ok' => true]);

        case 'project_restore':  // بازگشت به تصویری که کلاینت در آغازِ ویرایش گرفته بود (لغوِ تغییرات)
            $needProject();
            $snap = $in['snapshot'] ?? null;
            if (!is_array($snap) || !isset($snap['nodes'])) fail('تصویر نامعتبر');
            pm_restore($db, $pid, $snap);
            pm_chg($db, $pid, null, 'لغوِ تغییرات ویرایش', '', $author);
            $touch();
            out(['ok' => true]);

        case 'port_rename':
            $needProject();
            $nid = (int)($in['node_id'] ?? 0); $ownNode($nid);
            $side = ($in['side'] ?? '') === 'out' ? 'out' : 'in';
            $new = pm_str($in['new'] ?? '', 200); $old = pm_str($in['old'] ?? '', 200);
            if ($new === '') fail('نام نمی‌تواند خالی باشد');
            try { if ($new !== $old) pm_port_rename($db, $pid, $nid, $side, $old, $new); } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); fail($e->getMessage()); }
            if ($new !== $old) pm_chg($db, $pid, $nid, 'تغییر نامِ ' . ($side === 'in' ? 'ورودی' : 'خروجی'), $old . ' ← ' . $new, $author);
            $touch();
            out(['ok' => true]);

        // ---- زمانِ کار
        case 'time_add':
            $needProject();
            $sec = max(0, min(3600, (int)($in['seconds'] ?? 0)));
            $nid = (int)($in['node_id'] ?? 0);
            if ($sec) {
                $own = false;
                if ($nid) { $q = $db->prepare('SELECT 1 FROM nodes WHERE id=? AND project_id=?'); $q->execute([$nid, $pid]); $own = (bool)$q->fetchColumn(); }
                if ($own) $db->prepare('UPDATE nodes SET work_seconds=COALESCE(work_seconds,0)+? WHERE id=?')->execute([$sec, $nid]);
                else $db->prepare('UPDATE projects SET work_seconds=COALESCE(work_seconds,0)+? WHERE id=?')->execute([$sec, $pid]);   // بخش دیگر نیست (مثلاً لغوِ تغییرات): به کارِ کلیِ پروژه
            }
            out(['ok' => true]);

        // ---- بخش‌ها
        case 'node_save':
            $needProject();
            $pk = pm_proj_kind($db, $pid);
            $id = (int)($in['id'] ?? 0);
            $f = pm_clean_node($in);
            $isNew = !$id;
            if (!$id) {
                $parent = isset($in['parent_id']) && $in['parent_id'] !== null && $in['parent_id'] !== '' ? (int)$in['parent_id'] : null;
                $parentKind = null;
                if ($parent) { $parentKind = $ownNode($parent)['kind']; }
                if (empty($f['title'])) fail('عنوان لازم است');
                $kind = $f['kind'] ?? ($pk === 'library' && !$parent ? 'module' : (pm_child_kinds($parentKind, $pk)[0] ?? ''));
                if (!in_array($kind, pm_child_kinds($parentKind, $pk), true)) fail('این نوع در این جایگاه مجاز نیست');
                $f['kind'] = $kind;
                $db->prepare('INSERT INTO nodes(project_id,parent_id,title,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)')
                   ->execute([$pid, $parent, $f['title'], pm_next_sort($db, $pid, $parent), $now, $now]);
                $id = (int)$db->lastInsertId();
                $cur = ['status' => 'todo', 'progress' => 0, 'done_date' => null, 'kind' => $kind];
            } else {
                $cur = $ownNode($id);
                if (array_key_exists('title', $f) && $f['title'] === '') fail('عنوان لازم است');
                $curParent = isset($cur['parent_id']) ? (int)$cur['parent_id'] : null;
                $newParent = $curParent;
                if (array_key_exists('parent_id', $in)) {
                    $parent = $in['parent_id'] === null || $in['parent_id'] === '' ? null : (int)$in['parent_id'];
                    if ($parent !== $curParent) {
                        if ($parent) {
                            $ownNode($parent);
                            if ($parent === $id || in_array($parent, pm_subtree($db, $pid, $id), true)) fail('بخش را نمی‌شود زیرِ خودش گذاشت');
                        }
                        $f['parent_id'] = $parent;
                        $f['sort'] = pm_next_sort($db, $pid, $parent);
                        $newParent = $parent;
                    }
                }
                $kind = $f['kind'] ?? $cur['kind'];
                if (isset($f['kind']) || $newParent !== $curParent) {
                    $pkind = $newParent ? $ownNode($newParent)['kind'] : null;
                    if (!in_array($kind, pm_child_kinds($pkind, $pk), true)) fail('این نوع در این جایگاه مجاز نیست');
                    $allowedBelow = pm_child_kinds($kind, $pk);
                    foreach (pm_subtree($db, $pid, $id) as $cid) {
                        $ck = $db->query('SELECT parent_id, kind FROM nodes WHERE id=' . (int)$cid)->fetch();
                        if ((int)$ck['parent_id'] === $id && !in_array($ck['kind'], $allowedBelow, true)) fail('زیرمجموعه‌های فعلیِ این بخش با نوعِ تازه سازگار نیستند');
                    }
                }
            }
            pm_enforce_io($f, $kind);
            $m = pm_norm(array_merge($cur, $f), array_keys($f));
            $f['status'] = $m['status']; $f['progress'] = $m['progress']; $f['done_date'] = $m['done_date'];
            $f['updated_at'] = $now;
            $set = implode(',', array_map(fn($k) => "$k=?", array_keys($f)));
            $db->prepare("UPDATE nodes SET $set WHERE id=?")->execute([...array_values($f), $id]);
            if ($isNew) pm_chg($db, $pid, $id, 'ساخت ' . ['area' => 'بخش کلی', 'section' => 'بخش', 'module' => 'ماژول', 'task' => 'کار'][$kind], $f['title'], $author);
            else {
                $chg = [];
                foreach ($f as $k => $v) {
                    if (in_array($k, ['updated_at', 'sort', 'done_date', 'x', 'y'], true)) continue;
                    if ((string)($cur[$k] ?? '') !== (string)$v) $chg[] = PM_FIELD_LABELS[$k] ?? $k;
                }
                if ($chg) pm_chg($db, $pid, $id, 'ویرایش', implode('، ', $chg), $author);
            }
            $touch();
            out(['id' => $id]);

        case 'nodes_bulk':   // [{id, ...فیلدها}]
            $needProject();
            $db->beginTransaction();
            foreach (array_slice(is_array($in['items'] ?? null) ? $in['items'] : [], 0, 2000) as $it) {
                $id = (int)($it['id'] ?? 0);
                if (!$id) continue;
                $cur = $ownNode($id);
                $f = pm_clean_node($it);
                unset($f['title']);
                if (!$f) continue;
                $m = pm_norm(array_merge($cur, $f), array_keys($f));
                $f['status'] = $m['status']; $f['progress'] = $m['progress']; $f['done_date'] = $m['done_date'];
                pm_enforce_io($f, $cur['kind']);
                $f['updated_at'] = $now;
                $set = implode(',', array_map(fn($k) => "$k=?", array_keys($f)));
                $db->prepare("UPDATE nodes SET $set WHERE id=?")->execute([...array_values($f), $id]);
                $names = [];
                foreach ($f as $k => $v) if (!in_array($k, ['updated_at', 'x', 'y', 'done_date', 'sort', 'status', 'progress'], true) || in_array($k, ['status', 'progress'], true) && (string)$cur[$k] !== (string)$v) $names[] = PM_FIELD_LABELS[$k] ?? $k;
                if ($names) pm_chg($db, $pid, $id, 'ویرایش', implode('، ', array_unique($names)), $author);
            }
            $db->commit();
            $touch();
            out(['ok' => true]);

        case 'node_move':    // id, parent_id, index
            $needProject();
            $id = (int)$in['id'];
            $ownNode($id);
            $parent = ($in['parent_id'] ?? null) ? (int)$in['parent_id'] : null;
            $mine = $ownNode($id);
            $pkind = null;
            if ($parent) {
                $pkind = $ownNode($parent)['kind'];
                if ($parent === $id || in_array($parent, pm_subtree($db, $pid, $id), true)) fail('بخش را نمی‌شود زیرِ خودش گذاشت');
            }
            if (!in_array($mine['kind'], pm_child_kinds($pkind, pm_proj_kind($db, $pid)), true)) fail('این نوع در آن جایگاه مجاز نیست');
            $st = $db->prepare('SELECT id FROM nodes WHERE project_id=? AND parent_id IS ? AND id<>? ORDER BY sort,id');
            $st->execute([$pid, $parent, $id]);
            $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
            array_splice($ids, max(0, min(count($ids), (int)($in['index'] ?? count($ids)))), 0, [$id]);
            $db->beginTransaction();
            $db->prepare('UPDATE nodes SET parent_id=? WHERE id=?')->execute([$parent, $id]);
            foreach ($ids as $i => $nid) $db->prepare('UPDATE nodes SET sort=? WHERE id=?')->execute([$i + 1, $nid]);
            $db->commit();
            if ((int)($mine['parent_id'] ?? 0) !== (int)$parent) pm_chg($db, $pid, $id, 'جابه‌جایی', 'به ' . ($parent ? pm_path($db, $parent, true) : 'سطح اصلی'), $author);
            $touch();
            out(['ok' => true]);

        case 'node_delete':
            $needProject();
            $dn = $ownNode((int)$in['id']);
            pm_chg($db, $pid, null, 'حذف ' . ['area' => 'بخش کلی', 'section' => 'بخش', 'module' => 'ماژول', 'task' => 'کار'][$dn['kind']] ?? 'بخش', ($dn['title']) . ' — ' . pm_path($db, (int)$dn['id']), $author);
            $n = pm_delete_nodes($db, $pid, (int)$in['id']);
            $touch();
            out(['deleted' => $n]);

        // ---- وابستگی
        case 'dep_save':
            $needProject();
            $f = (int)$in['from_id']; $t = (int)$in['to_id'];
            $fn = $ownNode($f); $tn = $ownNode($t);
            if ($f === $t) fail('یک بخش به خودش وابسته نمی‌شود');
            $bnd = in_array($in['bnd'] ?? '', ['in', 'out'], true) ? $in['bnd'] : null;
            if ($bnd) {   // پیوندِ مرزی: ورودی/خروجیِ ماژول ↔ زیرمجموعهٔ مستقیمش
                $par = $bnd === 'in' ? $fn : $tn; $chd = $bnd === 'in' ? $tn : $fn;
                if ((int)($chd['parent_id'] ?? 0) !== (int)$par['id']) fail('پیوندِ مرزی فقط بین یک بخش و زیرمجموعهٔ مستقیمش ممکن است');
            } elseif (pm_is_related($db, $pid, $f, $t)) fail('بین یک بخش و زیرمجموعه‌اش وابستگی معنا ندارد');
            $outN = pm_str($in['out_name'] ?? '', 200) ?: null;
            $inN = pm_str($in['in_name'] ?? '', 200) ?: null;
            $two = !empty($in['two']) ? 1 : 0;
            $st = $db->prepare('SELECT id FROM deps WHERE project_id=? AND from_id=? AND to_id=? AND COALESCE(out_name,\'\')=? AND COALESCE(in_name,\'\')=? AND COALESCE(bnd,\'\')=?');
            $st->execute([$pid, $f, $t, $outN ?? '', $inN ?? '', $bnd ?? '']);
            $eid = $st->fetchColumn();
            $label = pm_str($in['label'] ?? '', 300);
            if ($eid) {
                if (array_key_exists('two', $in)) {
                    if ($two && !$db->query('SELECT COALESCE(two,0) FROM deps WHERE id=' . (int)$eid)->fetchColumn()) { /* یک‌طرفه→دوطرفه: چرخه ندارد، ترتیب‌دهی نادیده می‌گیرد */ }
                    elseif (!$two && pm_dep_path($db, $pid, $t, $f)) fail('با برگشتن به یک‌طرفه، چرخه ساخته می‌شود');
                    $db->prepare('UPDATE deps SET label=?, two=? WHERE id=?')->execute([$label, $two, $eid]);
                } else $db->prepare('UPDATE deps SET label=? WHERE id=?')->execute([$label, $eid]);
            } else {
                if (!$two && !$bnd && pm_dep_path($db, $pid, $t, $f)) fail('این وابستگی دور می‌سازد (به‌هم‌وابستگیِ چرخه‌ای)');
                $db->prepare('INSERT INTO deps(project_id,from_id,to_id,label,out_name,in_name,two,bnd) VALUES(?,?,?,?,?,?,?,?)')->execute([$pid, $f, $t, $label, $outN, $inN, $two, $bnd]);
                pm_chg($db, $pid, $t, 'ساخت پیوند', $fn['title'] . ($outN ? ' (' . $outN . ')' : '') . ' ← ' . $tn['title'] . ($inN ? ' (' . $inN . ')' : ''), $author);
            }
            $touch();
            out(['ok' => true]);

        case 'dep_delete':
            $needProject();
            $dd = $db->prepare('SELECT * FROM deps WHERE id=? AND project_id=?'); $dd->execute([(int)$in['id'], $pid]); $dr = $dd->fetch();
            if ($dr) pm_chg($db, $pid, (int)$dr['to_id'], 'حذف پیوند', pm_path($db, (int)$dr['from_id'], true) . ' ← ' . pm_path($db, (int)$dr['to_id'], true), $author);
            $db->prepare('DELETE FROM deps WHERE id=? AND project_id=?')->execute([(int)$in['id'], $pid]);
            $touch();
            out(['ok' => true]);

        // ---- نقاط عطف
        case 'ms_save':
            $needProject();
            $id = (int)($in['id'] ?? 0);
            $title = pm_str($in['title'] ?? '', 300);
            if ($title === '') fail('عنوان لازم است');
            $vals = [$title, pm_date($in['date'] ?? null), !empty($in['done']) ? 1 : 0, pm_str($in['note'] ?? '', 2000)];
            if ($id) $db->prepare('UPDATE milestones SET title=?,date=?,done=?,note=? WHERE id=? AND project_id=?')->execute([...$vals, $id, $pid]);
            else $db->prepare('INSERT INTO milestones(title,date,done,note,project_id) VALUES(?,?,?,?,?)')->execute([...$vals, $pid]);
            pm_chg($db, $pid, null, $id ? 'ویرایش نقطهٔ عطف' : 'ساخت نقطهٔ عطف', $title, $author);
            $touch();
            out(['ok' => true]);

        case 'ms_delete':
            $needProject();
            $db->prepare('DELETE FROM milestones WHERE id=? AND project_id=?')->execute([(int)$in['id'], $pid]);
            out(['ok' => true]);

        // ---- یادداشت/گزارش
        case 'log_add':
            $needProject();
            $node = ($in['node_id'] ?? null) ? (int)$in['node_id'] : null;
            if ($node) $ownNode($node);
            $body = pm_str($in['body'] ?? '', 20000);
            $kind = in_array($in['kind'] ?? '', ['note', 'ai_report', 'change'], true) ? $in['kind'] : 'note';
            // ثبتِ فایل‌ها هم ممکن است (multipart)
            $files = $_FILES['files'] ?? null;
            $hasFiles = $files && !empty($files['name'][0]);
            if ($body === '' && !$hasFiles) fail('متن خالی است');
            $db->prepare('INSERT INTO logs(project_id,node_id,kind,body,author,created_at) VALUES(?,?,?,?,?,?)')
               ->execute([$pid, $node, $kind, $body, $author, $now]);
            $lid = (int)$db->lastInsertId();
            $saved = $hasFiles ? pm_save_uploads($db, $pid, $node, $lid, $files) : 0;
            pm_chg($db, $pid, $node, $kind === 'ai_report' ? 'گزارش هوش مصنوعی' : 'یادداشت', mb_substr($body, 0, 80) . ($saved ? ' (+' . $saved . ' پیوست)' : ''), $author);
            $touch();
            out(['id' => $lid, 'files' => $saved]);

        case 'log_delete':
            $needProject();
            $id = (int)$in['id'];
            pm_delete_files($db, 'project_id=? AND log_id=?', [$pid, $id]);
            $db->prepare('DELETE FROM logs WHERE id=? AND project_id=?')->execute([$id, $pid]);
            out(['ok' => true]);

        // ---- فایل‌ها
        case 'upload':
            $needProject();
            $node = ($in['node_id'] ?? null) ? (int)$in['node_id'] : null;
            if ($node) $ownNode($node);
            $n = pm_save_uploads($db, $pid, $node, null, $_FILES['files'] ?? null);
            if (!$n) fail('فایلی ذخیره نشد (حجم یا نوع؟)');
            pm_chg($db, $pid, $node, 'پیوست', $n . ' فایل', $author);
            $touch();
            out(['files' => $n]);

        case 'file_delete':
            $needProject();
            pm_delete_files($db, 'project_id=? AND id=?', [$pid, (int)$in['id']]);
            out(['ok' => true]);

        case 'file':
            $st = $db->prepare('SELECT * FROM files WHERE id=?');
            $st->execute([(int)($_GET['id'] ?? 0)]);
            $f = $st->fetch() ?: fail('فایل پیدا نشد', 404);
            $path = PM_DATA . '/uploads/' . basename($f['stored']);
            if (!is_file($path)) fail('فایل روی سرور نیست', 404);
            $img = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
            $inline = in_array($f['mime'], $img, true) && empty($_GET['dl']);
            header('Content-Type: ' . ($inline ? $f['mime'] : 'application/octet-stream'));
            header('Content-Length: ' . filesize($path));
            header('X-Content-Type-Options: nosniff');
            header("Content-Security-Policy: default-src 'none'; sandbox");
            header('Cache-Control: private, max-age=3600');
            header("Content-Disposition: " . ($inline ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($f['name']));
            readfile($path);
            exit;

        case 'files_zip':
            $needProject();
            if (!class_exists('ZipArchive')) fail('ZipArchive روی این هاست فعال نیست', 501);
            $st = $db->prepare('SELECT * FROM files WHERE project_id=?');
            $st->execute([$pid]);
            $tmp = tempnam(sys_get_temp_dir(), 'pmz');
            $z = new ZipArchive();
            $z->open($tmp, ZipArchive::OVERWRITE);
            $man = [];
            foreach ($st as $f) {
                $p = PM_DATA . '/uploads/' . basename($f['stored']);
                if (!is_file($p)) continue;
                $nm = 'node' . ($f['node_id'] ?: 0) . '_' . $f['id'] . '_' . preg_replace('/[^\w.\-]+/u', '_', $f['name']);
                $z->addFile($p, $nm);
                $man[] = ['file' => $nm, 'node' => $f['node_id'] ? (int)$f['node_id'] : null, 'name' => $f['name']];
            }
            $z->addFromString('manifest.json', json_encode($man, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            $z->close();
            header('Content-Type: application/zip');
            header('Content-Disposition: attachment; filename="attachments-' . $pid . '.zip"');
            header('Content-Length: ' . filesize($tmp));
            readfile($tmp);
            @unlink($tmp);
            exit;

        // ---- ایمپورت
        case 'import':
            $doc = $in['doc'] ?? null;
            if (!is_array($doc) || !is_array($doc['nodes'] ?? null)) fail('فایل ساختار پروژه نیست (کلید nodes ندارد)');
            $mode = ($in['mode'] ?? 'new') === 'update' ? 'update' : 'new';
            if ($mode === 'update') $needProject();
            out(pm_import($db, $doc, $mode, $mode === 'update' ? $pid : null, $author));

        default:
            fail('عملیات ناشناخته', 404);
    }
} catch (Throwable $e) {
    error_log('[pm] ' . $e->getMessage());
    out(['error' => 'خطای سرور: ' . $e->getMessage()], 500);
}

function pm_save_uploads(PDO $db, int $pid, ?int $node, ?int $logId, ?array $files): int
{
    if (!$files || !isset($files['name'])) return 0;
    $names = (array)$files['name'];
    $n = 0;
    foreach ($names as $i => $name) {
        if (($files['error'][$i] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file($files['tmp_name'][$i])) continue;
        if ($files['size'][$i] > 25 * 1024 * 1024) continue;
        $mime = '';
        if (function_exists('finfo_open')) {
            $fi = finfo_open(FILEINFO_MIME_TYPE);
            $mime = (string)finfo_file($fi, $files['tmp_name'][$i]);
        }
        $stored = bin2hex(random_bytes(12));
        if (!move_uploaded_file($files['tmp_name'][$i], PM_DATA . '/uploads/' . $stored)) continue;
        $clean = pm_str(preg_replace('/[\x00-\x1f\/\\\\]+/', '_', (string)$name), 200) ?: 'file';
        $db->prepare('INSERT INTO files(project_id,node_id,log_id,name,stored,mime,size,created_at) VALUES(?,?,?,?,?,?,?,?)')
           ->execute([$pid, $node, $logId, $clean, $stored, $mime, (int)$files['size'][$i], pm_now()]);
        $n++;
    }
    return $n;
}
