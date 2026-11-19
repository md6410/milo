<?php
declare(strict_types=1);
require __DIR__ . '/inc/db.php';
require __DIR__ . '/inc/import.php';

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
        out(['user' => $_SESSION['user'] ?? null, 'csrf' => $_SESSION['csrf'], 'needs_setup' => $users === 0]);
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

        // ---- پروژه‌ها
        case 'projects':
            $rows = $db->query('SELECT * FROM projects ORDER BY updated_at DESC')->fetchAll();
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
            } else {
                $db->prepare('INSERT INTO projects(name,description,start_date,target_date,status,ai_brief,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
                   ->execute([...array_values($f), $now, $now]);
                $pid = (int)$db->lastInsertId();
            }
            out(['id' => $pid]);

        case 'project_delete':
            $needProject();
            pm_delete_files($db, 'project_id=?', [$pid]);
            foreach (['deps', 'milestones', 'logs', 'nodes'] as $t) $db->prepare("DELETE FROM $t WHERE project_id=?")->execute([$pid]);
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
                'logs' => $q('SELECT * FROM logs WHERE project_id=? ORDER BY created_at DESC, id DESC LIMIT 3000'),
                'files' => $q('SELECT id,project_id,node_id,log_id,name,mime,size,created_at FROM files WHERE project_id=? ORDER BY id'),
            ]);

        // ---- بخش‌ها
        case 'node_save':
            $needProject();
            $id = (int)($in['id'] ?? 0);
            $f = pm_clean_node($in);
            if (!$id) {
                $parent = isset($in['parent_id']) && $in['parent_id'] !== null && $in['parent_id'] !== '' ? (int)$in['parent_id'] : null;
                if ($parent) $ownNode($parent);
                if (empty($f['title'])) fail('عنوان لازم است');
                $db->prepare('INSERT INTO nodes(project_id,parent_id,title,sort,created_at,updated_at) VALUES(?,?,?,?,?,?)')
                   ->execute([$pid, $parent, $f['title'], pm_next_sort($db, $pid, $parent), $now, $now]);
                $id = (int)$db->lastInsertId();
                $cur = ['status' => 'todo', 'progress' => 0, 'done_date' => null];
            } else {
                $cur = $ownNode($id);
                if (array_key_exists('title', $f) && $f['title'] === '') fail('عنوان لازم است');
                if (array_key_exists('parent_id', $in)) {
                    $parent = $in['parent_id'] === null || $in['parent_id'] === '' ? null : (int)$in['parent_id'];
                    if ($parent !== (isset($cur['parent_id']) ? (int)$cur['parent_id'] : null)) {
                        if ($parent) {
                            $ownNode($parent);
                            if ($parent === $id || in_array($parent, pm_subtree($db, $pid, $id), true)) fail('بخش را نمی‌شود زیرِ خودش گذاشت');
                        }
                        $f['parent_id'] = $parent;
                        $f['sort'] = pm_next_sort($db, $pid, $parent);
                    }
                }
            }
            $m = pm_norm(array_merge($cur, $f), array_keys($f));
            $f['status'] = $m['status']; $f['progress'] = $m['progress']; $f['done_date'] = $m['done_date'];
            $f['updated_at'] = $now;
            $set = implode(',', array_map(fn($k) => "$k=?", array_keys($f)));
            $db->prepare("UPDATE nodes SET $set WHERE id=?")->execute([...array_values($f), $id]);
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
                $f['updated_at'] = $now;
                $set = implode(',', array_map(fn($k) => "$k=?", array_keys($f)));
                $db->prepare("UPDATE nodes SET $set WHERE id=?")->execute([...array_values($f), $id]);
            }
            $db->commit();
            $touch();
            out(['ok' => true]);

        case 'node_move':    // id, parent_id, index
            $needProject();
            $id = (int)$in['id'];
            $ownNode($id);
            $parent = ($in['parent_id'] ?? null) ? (int)$in['parent_id'] : null;
            if ($parent) {
                $ownNode($parent);
                if ($parent === $id || in_array($parent, pm_subtree($db, $pid, $id), true)) fail('بخش را نمی‌شود زیرِ خودش گذاشت');
            }
            $st = $db->prepare('SELECT id FROM nodes WHERE project_id=? AND parent_id IS ? AND id<>? ORDER BY sort,id');
            $st->execute([$pid, $parent, $id]);
            $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
            array_splice($ids, max(0, min(count($ids), (int)($in['index'] ?? count($ids)))), 0, [$id]);
            $db->beginTransaction();
            $db->prepare('UPDATE nodes SET parent_id=? WHERE id=?')->execute([$parent, $id]);
            foreach ($ids as $i => $nid) $db->prepare('UPDATE nodes SET sort=? WHERE id=?')->execute([$i + 1, $nid]);
            $db->commit();
            $touch();
            out(['ok' => true]);

        case 'node_delete':
            $needProject();
            $n = pm_delete_nodes($db, $pid, (int)$in['id']);
            $touch();
            out(['deleted' => $n]);

        // ---- وابستگی
        case 'dep_save':
            $needProject();
            $f = (int)$in['from_id']; $t = (int)$in['to_id'];
            $ownNode($f); $ownNode($t);
            if ($f === $t) fail('یک بخش به خودش وابسته نمی‌شود');
            if (pm_is_related($db, $pid, $f, $t)) fail('بین یک بخش و زیرمجموعه‌اش وابستگی معنا ندارد');
            $st = $db->prepare('SELECT id FROM deps WHERE project_id=? AND from_id=? AND to_id=?');
            $st->execute([$pid, $f, $t]);
            $eid = $st->fetchColumn();
            $label = pm_str($in['label'] ?? '', 300);
            if ($eid) {
                $db->prepare('UPDATE deps SET label=? WHERE id=?')->execute([$label, $eid]);
            } else {
                if (pm_dep_path($db, $pid, $t, $f)) fail('این وابستگی دور می‌سازد (به‌هم‌وابستگیِ چرخه‌ای)');
                $db->prepare('INSERT INTO deps(project_id,from_id,to_id,label) VALUES(?,?,?,?)')->execute([$pid, $f, $t, $label]);
            }
            $touch();
            out(['ok' => true]);

        case 'dep_delete':
            $needProject();
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
