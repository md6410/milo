<?php
declare(strict_types=1);
/**
 * مدیر پروژه — پایگاه‌داده (SQLite) و ابزارهای مشترک.
 * همهٔ داده در data/pm.sqlite و data/uploads/ است؛ پوشهٔ data از بیرون بسته است.
 */

const PM_DATA = __DIR__ . '/../data';
const PM_STATUSES = ['todo', 'doing', 'review', 'done', 'blocked', 'hold'];
const PM_KINDS = ['area', 'section', 'module', 'task'];

function pm_db(): PDO
{
    static $db = null;
    if ($db) return $db;
    if (!is_dir(PM_DATA)) @mkdir(PM_DATA, 0755, true);
    if (!is_file(PM_DATA . '/.htaccess')) {
        @file_put_contents(PM_DATA . '/.htaccess',
            "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
    }
    @mkdir(PM_DATA . '/uploads', 0755, true);
    $db = new PDO('sqlite:' . PM_DATA . '/pm.sqlite');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $db->exec('PRAGMA busy_timeout=8000');
    pm_schema($db);
    return $db;
}

function pm_schema(PDO $db): void
{
    $v = (int)$db->query('PRAGMA user_version')->fetchColumn();
    if ($v >= 7) return;
    if ($v < 1) $db->exec("
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
      pass_hash TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects(
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '',
      start_date TEXT, target_date TEXT, status TEXT DEFAULT 'active', ai_brief TEXT DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS nodes(
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, parent_id INTEGER,
      kind TEXT DEFAULT 'module', title TEXT NOT NULL, summary TEXT DEFAULT '', details TEXT DEFAULT '',
      inputs TEXT DEFAULT '[]', outputs TEXT DEFAULT '[]', process TEXT DEFAULT '', tech TEXT DEFAULT '',
      priority INTEGER DEFAULT 2, status TEXT DEFAULT 'todo', progress INTEGER DEFAULT 0,
      est_days REAL, final_days REAL, start_date TEXT, done_date TEXT,
      assignee TEXT DEFAULT '', tags TEXT DEFAULT '', sort INTEGER DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS nodes_p ON nodes(project_id, parent_id);
    CREATE TABLE IF NOT EXISTS deps(
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, label TEXT DEFAULT '');
    CREATE INDEX IF NOT EXISTS deps_p ON deps(project_id);
    CREATE TABLE IF NOT EXISTS milestones(
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL,
      date TEXT, done INTEGER DEFAULT 0, note TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, node_id INTEGER,
      kind TEXT DEFAULT 'note', body TEXT DEFAULT '', author TEXT DEFAULT '', created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS logs_p ON logs(project_id, node_id);
    CREATE TABLE IF NOT EXISTS files(
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, node_id INTEGER, log_id INTEGER,
      name TEXT NOT NULL, stored TEXT NOT NULL, mime TEXT DEFAULT '', size INTEGER DEFAULT 0, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS files_p ON files(project_id);
    PRAGMA user_version=1;");
    if ($v < 2) {
        // v2: بوم گرافیکی (جایگاه، رنگ، آیکن) و فلوچارتِ هر بخش
        foreach (['x REAL', 'y REAL', 'color TEXT', 'icon TEXT', 'flow TEXT'] as $c) {
            try { $db->exec("ALTER TABLE nodes ADD COLUMN $c"); } catch (Throwable $e) { /* ستون از قبل هست */ }
        }
        $db->exec('PRAGMA user_version=2');
    }
    if ($v < 3) {
        // v3: سلسله‌مراتبِ بخش کلی/بخش/ماژول/کار، کتابخانهٔ ماژول، پورت‌ها، زمانِ کار، تاریخچهٔ تغییرات و نسخه‌ها
        foreach (["ALTER TABLE projects ADD COLUMN kind TEXT DEFAULT 'project'", 'ALTER TABLE projects ADD COLUMN work_seconds INTEGER DEFAULT 0',
                  'ALTER TABLE nodes ADD COLUMN work_seconds INTEGER DEFAULT 0', 'ALTER TABLE nodes ADD COLUMN src_id INTEGER', 'ALTER TABLE nodes ADD COLUMN src_name TEXT',
                  'ALTER TABLE deps ADD COLUMN out_name TEXT', 'ALTER TABLE deps ADD COLUMN in_name TEXT'] as $q) {
            try { $db->exec($q); } catch (Throwable $e) { /* ستون از قبل هست */ }
        }
        $db->exec("
        CREATE TABLE IF NOT EXISTS changes(
          id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, node_id INTEGER, path TEXT DEFAULT '',
          action TEXT DEFAULT '', detail TEXT DEFAULT '', author TEXT DEFAULT '', created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS changes_p ON changes(project_id, id);
        CREATE TABLE IF NOT EXISTS revisions(
          id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, note TEXT DEFAULT '', summary TEXT DEFAULT '',
          author TEXT DEFAULT '', created_at TEXT NOT NULL, data TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS revisions_p ON revisions(project_id, id);
        UPDATE projects SET kind='project' WHERE kind IS NULL;
        UPDATE nodes SET kind='area' WHERE parent_id IS NULL;
        PRAGMA user_version=3;");
    }
    if ($v < 4) {
        // v4: پیوندِ دوطرفه
        try { $db->exec('ALTER TABLE deps ADD COLUMN two INTEGER DEFAULT 0'); } catch (Throwable $e) { /* هست */ }
        $db->exec('PRAGMA user_version=4');
    }
    if ($v < 5) {
        // v5: پیوندِ مرزی (ورودی/خروجیِ ماژول ↔ ورودی/خروجیِ زیرمجموعه‌اش): bnd = 'in' | 'out'
        try { $db->exec('ALTER TABLE deps ADD COLUMN bnd TEXT'); } catch (Throwable $e) { /* هست */ }
        $db->exec('PRAGMA user_version=5');
    }
    if ($v < 6) {
        // v6: تست‌ها — هر گره (ماژول/بخش/کار/…) چند تست دارد: ورودی/پورت + حالت + ورودیِ نمونه + نتیجهٔ مورد انتظار (مقدار یا بازه)
        $db->exec("CREATE TABLE IF NOT EXISTS tests(
          id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, node_id INTEGER NOT NULL,
          ref TEXT DEFAULT '', title TEXT NOT NULL, port TEXT DEFAULT '', state TEXT DEFAULT '', given TEXT DEFAULT '',
          expect_kind TEXT DEFAULT 'value', expect TEXT DEFAULT '', min REAL, max REAL, unit TEXT DEFAULT '',
          kind TEXT DEFAULT 'unit', priority INTEGER DEFAULT 2, source TEXT DEFAULT '',
          status TEXT DEFAULT 'untested', last_at TEXT, last_by TEXT DEFAULT '', last_note TEXT DEFAULT '',
          sort INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS tests_n ON tests(project_id, node_id);
        CREATE INDEX IF NOT EXISTS tests_s ON tests(project_id, status);
        CREATE INDEX IF NOT EXISTS tests_r ON tests(node_id, ref);");
        $db->exec('PRAGMA user_version=6');
    }
    if ($v < 7) {
        // v7: مسیرِ ذخیره‌شدهٔ خطوطِ هر سطحِ نقشه (node_id=0 = سطحِ اصلی)؛ فقط «چیدمان خودکار» آن را می‌سازد و باز کردنِ صفحه هیچ محاسبه‌ای نمی‌کند
        $db->exec("CREATE TABLE IF NOT EXISTS routes(
          project_id INTEGER NOT NULL, node_id INTEGER NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL,
          PRIMARY KEY(project_id, node_id))");
        $db->exec('PRAGMA user_version=7');
    }
}

const PM_TEST_KINDS = ['unit' => 'واحد', 'integration' => 'یکپارچگی', 'e2e' => 'سرتاسری', 'manual' => 'دستی', 'security' => 'امنیتی', 'perf' => 'کارایی'];
const PM_TEST_EXPECT = ['value' => 'برابر مقدار', 'range' => 'در بازه', 'contains' => 'شامل متن', 'true' => 'درست باشد', 'false' => 'نادرست باشد', 'error' => 'خطا بدهد', 'any' => 'شرحِ آزاد'];
const PM_TEST_STATUS = ['untested' => 'اجرا نشده', 'pass' => 'موفق', 'fail' => 'ناموفق', 'skip' => 'ردشده'];

/** پاک‌سازیِ یک تست؛ فقط کلیدهای حاضر برمی‌گردند. */
function pm_clean_test(array $in): array
{
    $o = [];
    foreach (['title' => 400, 'ref' => 80, 'port' => 200, 'state' => 400, 'given' => 4000, 'expect' => 4000, 'unit' => 40, 'source' => 200, 'last_note' => 1000] as $k => $n) {
        if (array_key_exists($k, $in)) $o[$k] = pm_str($in[$k], $n);
    }
    if (isset($o['title']) && $o['title'] === '') $o['title'] = 'تست بدون عنوان';
    if (array_key_exists('expect_kind', $in)) $o['expect_kind'] = isset(PM_TEST_EXPECT[$in['expect_kind']]) ? $in['expect_kind'] : 'value';
    if (array_key_exists('kind', $in)) $o['kind'] = isset(PM_TEST_KINDS[$in['kind']]) ? $in['kind'] : 'unit';
    if (array_key_exists('status', $in)) $o['status'] = isset(PM_TEST_STATUS[$in['status']]) ? $in['status'] : 'untested';
    if (array_key_exists('priority', $in)) $o['priority'] = max(1, min(3, (int)$in['priority']));
    foreach (['min', 'max'] as $k) {
        if (array_key_exists($k, $in)) $o[$k] = ($in[$k] === null || $in[$k] === '' || !is_numeric($in[$k])) ? null : (float)$in[$k];
    }
    return $o;
}

/** ذخیرهٔ تست برای یک گره: با id یا ref (در همان گره) به‌روز می‌شود؛ وگرنه تازه. */
function pm_test_put(PDO $db, int $pid, int $nodeId, array $in, string $author, bool $keepStatus = false): int
{
    $f = pm_clean_test($in);
    $id = (int)($in['id'] ?? 0);
    if (!$id && !empty($f['ref'])) {
        $q = $db->prepare('SELECT id FROM tests WHERE node_id=? AND ref=?');
        $q->execute([$nodeId, $f['ref']]);
        $id = (int)$q->fetchColumn();
    }
    $now = pm_now();
    if (!$keepStatus && isset($f['status'])) { $f['last_at'] = $now; $f['last_by'] = $author; }
    if ($id) {
        $q = $db->prepare('SELECT id FROM tests WHERE id=? AND project_id=?');
        $q->execute([$id, $pid]);
        if ($q->fetchColumn()) {
            $f['updated_at'] = $now;
            $set = implode(',', array_map(fn($k) => "$k=?", array_keys($f)));
            $db->prepare("UPDATE tests SET $set WHERE id=?")->execute([...array_values($f), $id]);
            return $id;
        }
    }
    $f += ['title' => 'تست بدون عنوان'];
    $f['project_id'] = $pid; $f['node_id'] = $nodeId; $f['created_at'] = $now; $f['updated_at'] = $now;
    if (!isset($f['sort'])) {
        $q = $db->prepare('SELECT COALESCE(MAX(sort),0)+1 FROM tests WHERE node_id=?');
        $q->execute([$nodeId]);
        $f['sort'] = (int)$q->fetchColumn();
    }
    $db->prepare('INSERT INTO tests(' . implode(',', array_keys($f)) . ') VALUES(' . implode(',', array_fill(0, count($f), '?')) . ')')->execute(array_values($f));
    return (int)$db->lastInsertId();
}

/** شمارِ تست‌های هر گره (همان گره، نه زیرمجموعه): {node_id: {n, pass, fail, skip}} */
function pm_test_stats(PDO $db, int $pid): array
{
    $st = $db->prepare("SELECT node_id, COUNT(*) n, SUM(status='pass') p, SUM(status='fail') f, SUM(status='skip') s FROM tests WHERE project_id=? GROUP BY node_id");
    $st->execute([$pid]);
    $o = [];
    foreach ($st as $r) $o[(int)$r['node_id']] = ['n' => (int)$r['n'], 'pass' => (int)$r['p'], 'fail' => (int)$r['f'], 'skip' => (int)$r['s']];
    return $o;
}

/** خروجیِ یک تست برای JSON (بدونِ ستون‌های داخلی) */
function pm_test_out(array $r): array
{
    return ['id' => (int)$r['id'], 'node_id' => (int)$r['node_id'], 'ref' => $r['ref'], 'title' => $r['title'], 'port' => $r['port'], 'state' => $r['state'], 'given' => $r['given'],
        'expect_kind' => $r['expect_kind'], 'expect' => $r['expect'], 'min' => $r['min'] === null ? null : (float)$r['min'], 'max' => $r['max'] === null ? null : (float)$r['max'],
        'unit' => $r['unit'], 'kind' => $r['kind'], 'priority' => (int)$r['priority'], 'source' => $r['source'], 'status' => $r['status'], 'last_at' => $r['last_at'],
        'last_by' => $r['last_by'], 'last_note' => $r['last_note']];
}

function pm_now(): string { return date('Y-m-d H:i:s'); }

function pm_date($v): ?string
{
    if (!is_string($v) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $v, $m)) return null;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? "$m[1]-$m[2]-$m[3]" : null;
}

function pm_days($v): ?float
{
    if ($v === null || $v === '' || !is_numeric($v)) return null;
    $f = (float)$v;
    return ($f < 0 || $f > 100000) ? null : round($f, 2);
}

function pm_str($v, int $max): string
{
    return mb_substr(trim((string)$v), 0, $max);
}

/** ورودی/خروجی‌ها: فهرستی از {name, desc} */
function pm_io($v): array
{
    $out = [];
    if (!is_array($v)) return $out;
    foreach (array_slice($v, 0, 60) as $r) {
        if (is_string($r)) $r = ['name' => $r];
        if (!is_array($r)) continue;
        $name = pm_str($r['name'] ?? '', 200);
        if ($name === '') continue;
        // desc = تعریفِ ورودی/خروجی در خودِ ماژول؛ use = کاربردش در همین جایی که ماژول به کار رفته؛ unused/why = «در اینجا استفاده نمی‌شود» + دلیل
        $out[] = ['name' => $name, 'desc' => pm_str($r['desc'] ?? ($r['description'] ?? ''), 1000), 'use' => pm_str($r['use'] ?? '', 1000),
                  'unused' => !empty($r['unused']), 'why' => pm_str($r['why'] ?? '', 1000)];
    }
    return $out;
}

/** فقط کلیدهای حاضر در ورودی را پاک‌سازی می‌کند (برای ذخیرهٔ جزئی). */
function pm_clean_node(array $in): array
{
    $o = [];
    $lim = ['title' => 300, 'summary' => 2000, 'details' => 60000, 'process' => 60000, 'tech' => 20000,
            'assignee' => 200, 'tags' => 300];
    foreach ($lim as $k => $n) if (array_key_exists($k, $in)) $o[$k] = pm_str($in[$k], $n);
    if (array_key_exists('kind', $in) && in_array($in['kind'], PM_KINDS, true)) $o['kind'] = $in['kind'];
    if (array_key_exists('status', $in) && in_array($in['status'], PM_STATUSES, true)) $o['status'] = $in['status'];
    if (array_key_exists('progress', $in)) $o['progress'] = max(0, min(100, (int)$in['progress']));
    if (array_key_exists('priority', $in)) $o['priority'] = max(1, min(3, (int)$in['priority']));
    foreach (['est_days', 'final_days'] as $k) if (array_key_exists($k, $in)) $o[$k] = pm_days($in[$k]);
    foreach (['start_date', 'done_date'] as $k) if (array_key_exists($k, $in)) $o[$k] = pm_date($in[$k]);
    foreach (['inputs', 'outputs'] as $k) if (array_key_exists($k, $in)) $o[$k] = json_encode(pm_io($in[$k]), JSON_UNESCAPED_UNICODE);
    foreach (['x', 'y'] as $k) if (array_key_exists($k, $in)) $o[$k] = is_numeric($in[$k]) ? max(-100000, min(100000, round((float)$in[$k], 1))) : null;
    if (array_key_exists('color', $in)) $o['color'] = pm_color($in['color']);
    if (array_key_exists('src_name', $in)) $o['src_name'] = mb_substr(trim((string)$in['src_name']), 0, 200) ?: null;
    if (array_key_exists('icon', $in)) $o['icon'] = mb_substr(trim((string)$in['icon']), 0, 8) ?: null;
    if (array_key_exists('flow', $in)) { $fl = pm_flow_clean($in['flow']); $o['flow'] = $fl ? json_encode($fl, JSON_UNESCAPED_UNICODE) : null; }
    return $o;
}

/** هماهنگیِ وضعیت و درصد. $changed = کلیدهایی که همین بار تغییر کرده‌اند. */
function pm_norm(array $row, array $changed): array
{
    $st = $row['status'] ?? 'todo';
    $p = (int)($row['progress'] ?? 0);
    $chS = in_array('status', $changed, true);
    $chP = in_array('progress', $changed, true);
    if ($chS && !$chP) {
        if ($st === 'done') $p = 100;
        elseif ($p >= 100) $p = 90;
    } elseif ($chP) {
        if ($p >= 100) $st = 'done';
        elseif ($st === 'done') $st = $p > 0 ? 'doing' : 'todo';
        elseif ($p > 0 && $st === 'todo') $st = 'doing';
    }
    if ($st === 'done') $p = 100;
    $row['status'] = $st;
    $row['progress'] = $p;
    if ($st === 'done') { if (empty($row['done_date'])) $row['done_date'] = date('Y-m-d'); }
    else $row['done_date'] = null;
    return $row;
}

function pm_color($v): ?string
{
    return is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? strtolower($v) : null;
}

const PM_FLOW_TYPES = ['start', 'end', 'process', 'decision', 'io', 'sub', 'db', 'note', 'text'];

/** فلوچارت: {v:1, nodes:[{id,type,text,x,y,w,h,color}], edges:[{id,from,to,label,color}]} */
function pm_flow_clean($f): ?array
{
    if (!is_array($f) || !is_array($f['nodes'] ?? null) || !$f['nodes']) return null;
    $nodes = []; $ids = [];
    foreach (array_slice($f['nodes'], 0, 400) as $n) {
        if (!is_array($n)) continue;
        $id = preg_replace('/[^A-Za-z0-9_\-]/', '', (string)($n['id'] ?? ''));
        $id = substr($id, 0, 24);
        if ($id === '' || isset($ids[$id])) continue;
        $ids[$id] = true;
        $t = in_array($n['type'] ?? '', PM_FLOW_TYPES, true) ? $n['type'] : 'process';
        $nodes[] = ['id' => $id, 'type' => $t, 'text' => pm_str($n['text'] ?? '', 600),
            'x' => max(-100000, min(100000, round((float)($n['x'] ?? 0), 1))), 'y' => max(-100000, min(100000, round((float)($n['y'] ?? 0), 1))),
            'w' => max(40, min(700, round((float)($n['w'] ?? 160)))), 'h' => max(30, min(500, round((float)($n['h'] ?? 64)))),
            'color' => pm_color($n['color'] ?? null),
            'port' => (is_array($n['port'] ?? null) && in_array($n['port']['side'] ?? '', ['in', 'out'], true) && pm_str($n['port']['name'] ?? '', 200) !== '')
                ? ['side' => $n['port']['side'], 'name' => pm_str($n['port']['name'], 200)] : null];
    }
    $edges = []; $eids = [];
    foreach (array_slice(is_array($f['edges'] ?? null) ? $f['edges'] : [], 0, 800) as $e) {
        if (!is_array($e)) continue;
        $a = (string)($e['from'] ?? ''); $b = (string)($e['to'] ?? '');
        if (!isset($ids[$a]) || !isset($ids[$b]) || $a === $b) continue;
        $id = substr(preg_replace('/[^A-Za-z0-9_\-]/', '', (string)($e['id'] ?? '')), 0, 24) ?: ('e' . count($edges));
        if (isset($eids[$id])) $id .= count($edges);
        $eids[$id] = true;
        $an = function ($x) { return (is_array($x) && in_array($x['s'] ?? '', ['t', 'r', 'b', 'l'], true)) ? ['s' => $x['s'], 't' => round(max(0, min(1, (float)($x['t'] ?? 0.5))), 2)] : null; };
        $edges[] = ['id' => $id, 'from' => $a, 'to' => $b, 'label' => pm_str($e['label'] ?? '', 100), 'color' => pm_color($e['color'] ?? null), 'fa' => $an($e['fa'] ?? null), 'ta' => $an($e['ta'] ?? null)];
    }
    return $nodes ? ['v' => 1, 'nodes' => $nodes, 'edges' => $edges] : null;
}

function pm_node_out(array $r): array
{
    $r['work_seconds'] = (int)($r['work_seconds'] ?? 0);
    $r['flow'] = !empty($r['flow']) ? (json_decode((string)$r['flow'], true) ?: null) : null;
    foreach (['x', 'y'] as $k) if (($r[$k] ?? null) !== null) $r[$k] = (float)$r[$k];
    foreach (['id', 'project_id', 'parent_id', 'priority', 'progress', 'sort', 'work_seconds', 'src_id'] as $k) {
        if ($r[$k] !== null) $r[$k] = (int)$r[$k];
    }
    foreach (['est_days', 'final_days'] as $k) if ($r[$k] !== null) $r[$k] = (float)$r[$k];
    foreach (['inputs', 'outputs'] as $k) $r[$k] = json_decode((string)$r[$k], true) ?: [];
    return $r;
}

/** شناسهٔ همهٔ فرزندان (بازگشتی) */
function pm_subtree(PDO $db, int $pid, int $root): array
{
    $st = $db->prepare('SELECT id, parent_id FROM nodes WHERE project_id=?');
    $st->execute([$pid]);
    $kids = [];
    foreach ($st as $r) $kids[(int)($r['parent_id'] ?? 0)][] = (int)$r['id'];
    $out = [];
    $q = [$root];
    while ($q) {
        $x = array_pop($q);
        foreach ($kids[$x] ?? [] as $c) { $out[] = $c; $q[] = $c; }
    }
    return $out;
}

function pm_is_related(PDO $db, int $pid, int $a, int $b): bool
{
    return in_array($b, pm_subtree($db, $pid, $a), true) || in_array($a, pm_subtree($db, $pid, $b), true);
}

/** آیا از $a به $b مسیری از وابستگی‌ها هست؟ (برای جلوگیری از دور) */
function pm_dep_path(PDO $db, int $pid, int $a, int $b): bool
{
    $st = $db->prepare('SELECT from_id, to_id FROM deps WHERE project_id=? AND COALESCE(two,0)=0 AND bnd IS NULL');
    $st->execute([$pid]);
    $adj = [];
    foreach ($st as $r) $adj[(int)$r['from_id']][] = (int)$r['to_id'];
    $seen = [$a => true];
    $q = [$a];
    while ($q) {
        $x = array_pop($q);
        if ($x === $b) return true;
        foreach ($adj[$x] ?? [] as $y) if (empty($seen[$y])) { $seen[$y] = true; $q[] = $y; }
    }
    return false;
}

function pm_next_sort(PDO $db, int $pid, ?int $parent): int
{
    $st = $db->prepare('SELECT COALESCE(MAX(sort),0)+1 FROM nodes WHERE project_id=? AND parent_id IS ?');
    $st->execute([$pid, $parent]);
    return (int)$st->fetchColumn();
}

function pm_delete_files(PDO $db, string $where, array $args): void
{
    $st = $db->prepare("SELECT stored FROM files WHERE $where");
    $st->execute($args);
    foreach ($st as $f) @unlink(PM_DATA . '/uploads/' . basename($f['stored']));
    $db->prepare("DELETE FROM files WHERE $where")->execute($args);
}

function pm_delete_nodes(PDO $db, int $pid, int $id): int
{
    $ids = array_merge([$id], pm_subtree($db, $pid, $id));
    $in = implode(',', array_map('intval', $ids));
    pm_delete_files($db, "project_id=? AND node_id IN ($in)", [$pid]);
    $db->exec("DELETE FROM deps WHERE project_id=$pid AND (from_id IN ($in) OR to_id IN ($in))");
    $db->exec("DELETE FROM logs WHERE project_id=$pid AND node_id IN ($in)");
    $db->exec("DELETE FROM tests WHERE project_id=$pid AND node_id IN ($in)");
    $db->exec("DELETE FROM nodes WHERE project_id=$pid AND id IN ($in)");
    return count($ids);
}

function pm_project_summary(PDO $db, array $p): array
{
    $pid = (int)$p['id'];
    $st = $db->prepare('SELECT n.progress p, COALESCE(n.final_days,n.est_days,1) w, n.status s FROM nodes n
        WHERE n.project_id=? AND NOT EXISTS (SELECT 1 FROM nodes c WHERE c.parent_id=n.id)');
    $st->execute([$pid]);
    $sw = 0; $sp = 0; $cnt = 0; $done = 0;
    foreach ($st as $r) {
        $w = max(0.5, (float)$r['w']);
        $sw += $w; $sp += $w * (int)$r['p']; $cnt++;
        if ($r['s'] === 'done') $done++;
    }
    $p['progress'] = $sw > 0 ? (int)round($sp / $sw) : 0;
    $p['leaf_count'] = $cnt;
    $p['leaf_done'] = $done;
    $w = $db->prepare('SELECT COALESCE(SUM(work_seconds),0) FROM nodes WHERE project_id=?');
    $w->execute([$pid]);
    $p['work_total'] = (int)$w->fetchColumn() + (int)($p['work_seconds'] ?? 0);
    $n = $db->prepare('SELECT COUNT(*) FROM nodes WHERE project_id=?');
    $n->execute([$pid]);
    $p['node_count'] = (int)$n->fetchColumn();
    return $p;
}


// ===================== سلسله‌مراتب و کتابخانه =====================

/** نوعِ زیرمجموعه‌های مجاز. $parentKind = null یعنی ریشهٔ پروژه (یا ریشهٔ کتابخانه). */
function pm_child_kinds(?string $parentKind, string $projKind = 'project'): array
{
    if ($parentKind === null) return $projKind === 'library' ? ['module'] : ['area'];
    switch ($parentKind) {
        case 'area': return ['section', 'module'];
        case 'section': case 'module': return ['section', 'module', 'task'];
        default: return [];
    }
}

function pm_proj_kind(PDO $db, int $pid): string
{
    $st = $db->prepare('SELECT kind FROM projects WHERE id=?');
    $st->execute([$pid]);
    return (string)($st->fetchColumn() ?: 'project');
}

/** «کار» فقط یک ورودی و یک خروجی دارد. */
function pm_enforce_io(array &$f, string $kind): void
{
    if ($kind !== 'task') return;
    foreach (['inputs', 'outputs'] as $k) {
        if (isset($f[$k])) {
            $a = json_decode((string)$f[$k], true) ?: [];
            $f[$k] = json_encode(array_slice($a, 0, 1), JSON_UNESCAPED_UNICODE);
        }
    }
}

/** مسیرِ والدها: «A › B» (بدونِ خودِ گره) */
function pm_path(PDO $db, ?int $id, bool $self = false): string
{
    $out = []; $g = 0;
    $st = $db->prepare('SELECT parent_id, title FROM nodes WHERE id=?');
    $x = $id;
    while ($x && $g++ < 40) {
        $st->execute([$x]);
        $r = $st->fetch();
        if (!$r) break;
        if ($x !== $id || $self) array_unshift($out, $r['title']);
        $x = $r['parent_id'] ? (int)$r['parent_id'] : 0;
    }
    return implode(' › ', $out);
}

/** ثبت در «آخرین تغییرات» */
function pm_chg(PDO $db, int $pid, ?int $nodeId, string $action, string $detail, string $author): void
{
    $path = $nodeId ? pm_path($db, $nodeId, true) : '';
    $db->prepare('INSERT INTO changes(project_id,node_id,path,action,detail,author,created_at) VALUES(?,?,?,?,?,?,?)')
       ->execute([$pid, $nodeId, $path, $action, mb_substr($detail, 0, 500), $author, pm_now()]);
    $db->prepare('DELETE FROM changes WHERE project_id=? AND id<(SELECT COALESCE(MAX(id),0)-1500 FROM changes WHERE project_id=?)')->execute([$pid, $pid]);
}

function pm_library_id(PDO $db): int
{
    $id = $db->query("SELECT id FROM projects WHERE kind='library' ORDER BY id LIMIT 1")->fetchColumn();
    if ($id) return (int)$id;
    $now = pm_now();
    $db->prepare("INSERT INTO projects(name,description,status,kind,created_at,updated_at) VALUES(?,?,?,?,?,?)")
       ->execute(['کتابخانهٔ ماژول‌ها', 'ماژول‌های قابلِ ذخیره و استفاده در همهٔ پروژه‌ها؛ می‌شود از هر ماژول ارث برد و تغییرش داد.', 'active', 'library', $now, $now]);
    return (int)$db->lastInsertId();
}

/** رونوشتِ عمیق از یک گره (با زیرمجموعه و وابستگی‌های درونش) به پروژهٔ دیگر. شناسهٔ ریشهٔ تازه را می‌دهد. */
function pm_copy_subtree(PDO $db, int $srcId, int $dstPid, ?int $dstParent, array $over = []): array
{
    $st = $db->prepare('SELECT * FROM nodes WHERE id=?');
    $st->execute([$srcId]);
    $root = $st->fetch();
    if (!$root) throw new RuntimeException('بخشِ مبدأ پیدا نشد');
    $srcPid = (int)$root['project_id'];
    $dstKind = pm_proj_kind($db, $dstPid);
    $parentKind = null;
    if ($dstParent) {
        $q = $db->prepare('SELECT kind, project_id FROM nodes WHERE id=?');
        $q->execute([$dstParent]);
        $pr = $q->fetch();
        if (!$pr || (int)$pr['project_id'] !== $dstPid) throw new RuntimeException('والدِ مقصد پیدا نشد');
        $parentKind = $pr['kind'];
    }
    if (!in_array($root['kind'], pm_child_kinds($parentKind, $dstKind), true)) throw new RuntimeException('این نوع زیرِ آن بخش مجاز نیست');
    $ids = array_merge([$srcId], pm_subtree($db, $srcPid, $srcId));
    $in = implode(',', array_map('intval', $ids));
    $rows = $db->query("SELECT * FROM nodes WHERE id IN ($in) ORDER BY sort,id")->fetchAll();
    $map = []; $now = pm_now();
    $ins = $db->prepare('INSERT INTO nodes(project_id,parent_id,kind,title,summary,details,inputs,outputs,process,tech,priority,status,progress,est_days,final_days,start_date,done_date,assignee,tags,sort,x,y,color,icon,flow,work_seconds,src_id,src_name,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $byParent = [];
    foreach ($rows as $r) $byParent[(int)($r['parent_id'] ?? 0)][] = $r;
    $walk = function ($r, ?int $newParent, bool $isRoot) use (&$walk, &$map, $ins, $dstPid, $now, $over, $byParent, $db) {
        $title = $isRoot && isset($over['title']) ? $over['title'] : $r['title'];
        $x = $isRoot && array_key_exists('x', $over) ? $over['x'] : $r['x'];
        $y = $isRoot && array_key_exists('y', $over) ? $over['y'] : $r['y'];
        $sort = $isRoot ? pm_next_sort($db, $dstPid, $newParent) : (int)$r['sort'];
        $ins->execute([$dstPid, $newParent, $r['kind'], $title, $r['summary'], $r['details'], $isRoot ? pm_reset_ports($r['inputs']) : $r['inputs'], $isRoot ? pm_reset_ports($r['outputs']) : $r['outputs'], $r['process'], $r['tech'], $r['priority'],
            'todo', 0, $r['est_days'], $r['final_days'], null, null, '', $r['tags'], $sort, $x, $y, $r['color'], $r['icon'], $r['flow'], 0,
            $r['id'], $isRoot ? ($over['src_name'] ?? $r['title']) : ($r['src_name'] ?: null), $now, $now]);
        $nid = (int)$db->lastInsertId();
        $map[(int)$r['id']] = $nid;
        foreach ($byParent[(int)$r['id']] ?? [] as $c) $walk($c, $nid, false);
    };
    $walk($root, $dstParent, true);
    // تست‌های هر گره (نتیجه‌ها پاک می‌شوند؛ تست‌ها همراهِ ماژول می‌آیند)
    $tq = $db->query("SELECT * FROM tests WHERE node_id IN ($in) ORDER BY sort,id")->fetchAll();
    if ($tq) {
        $ti = $db->prepare("INSERT INTO tests(project_id,node_id,ref,title,port,state,given,expect_kind,expect,min,max,unit,kind,priority,source,status,sort,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'untested',?,?,?)");
        foreach ($tq as $t) $ti->execute([$dstPid, $map[(int)$t['node_id']], $t['ref'], $t['title'], $t['port'], $t['state'], $t['given'], $t['expect_kind'], $t['expect'], $t['min'], $t['max'], $t['unit'], $t['kind'], $t['priority'], $t['source'], $t['sort'], $now, $now]);
    }
    // وابستگی‌های درونیِ زیردرخت
    $ds = $db->query("SELECT * FROM deps WHERE from_id IN ($in) AND to_id IN ($in)")->fetchAll();
    $di = $db->prepare('INSERT INTO deps(project_id,from_id,to_id,label,out_name,in_name,two,bnd) VALUES(?,?,?,?,?,?,?,?)');
    foreach ($ds as $d) $di->execute([$dstPid, $map[(int)$d['from_id']], $map[(int)$d['to_id']], $d['label'], $d['out_name'], $d['in_name'], (int)($d['two'] ?? 0), $d['bnd'] ?? null]);
    return ['id' => $map[$srcId], 'count' => count($map)];
}

/** تصویرِ کاملِ ساختار برای نسخه/بازگردانی */
function pm_snapshot(PDO $db, int $pid): array
{
    $q = function (string $sql) use ($db, $pid) { $s = $db->prepare($sql); $s->execute([$pid]); return $s->fetchAll(); };
    return ['nodes' => $q('SELECT * FROM nodes WHERE project_id=? ORDER BY id'), 'deps' => $q('SELECT * FROM deps WHERE project_id=? ORDER BY id'),
            'milestones' => $q('SELECT * FROM milestones WHERE project_id=? ORDER BY id'), 'tests' => $q('SELECT * FROM tests WHERE project_id=? ORDER BY id')];
}

/** بازگردانیِ ساختار از تصویر. پیوست‌/یادداشتِ بخش‌هایی که در تصویر نیستند پاک می‌شود. */
function pm_restore(PDO $db, int $pid, array $snap): void
{
    $cols = ['id', 'project_id', 'parent_id', 'kind', 'title', 'summary', 'details', 'inputs', 'outputs', 'process', 'tech', 'priority', 'status', 'progress', 'est_days', 'final_days',
        'start_date', 'done_date', 'assignee', 'tags', 'sort', 'created_at', 'updated_at', 'x', 'y', 'color', 'icon', 'flow', 'work_seconds', 'src_id', 'src_name'];
    $keep = [];
    foreach ($snap['nodes'] ?? [] as $n) $keep[(int)$n['id']] = true;
    $cur = $db->prepare('SELECT id FROM nodes WHERE project_id=?');
    $cur->execute([$pid]);
    $db->beginTransaction();
    try {
        foreach ($cur->fetchAll(PDO::FETCH_COLUMN) as $id) {
            if (empty($keep[(int)$id])) {
                pm_delete_files($db, 'project_id=? AND node_id=?', [$pid, (int)$id]);
                $db->prepare('DELETE FROM logs WHERE project_id=? AND node_id=?')->execute([$pid, (int)$id]);
                $db->prepare('DELETE FROM nodes WHERE id=?')->execute([(int)$id]);
            }
        }
        $db->prepare('DELETE FROM deps WHERE project_id=?')->execute([$pid]);
        $db->prepare('DELETE FROM milestones WHERE project_id=?')->execute([$pid]);
        if (array_key_exists('tests', $snap)) {
            $db->prepare('DELETE FROM tests WHERE project_id=?')->execute([$pid]);
            $tc = ['id', 'node_id', 'ref', 'title', 'port', 'state', 'given', 'expect_kind', 'expect', 'min', 'max', 'unit', 'kind', 'priority', 'source', 'status', 'last_at', 'last_by', 'last_note', 'sort', 'created_at', 'updated_at'];
            $ti = $db->prepare('INSERT INTO tests(project_id,' . implode(',', $tc) . ') VALUES(?,' . implode(',', array_fill(0, count($tc), '?')) . ')');
            foreach ($snap['tests'] as $t) { $row = [$pid]; foreach ($tc as $c) $row[] = $t[$c] ?? null; $ti->execute($row); }
        }
        $ph = implode(',', array_fill(0, count($cols), '?'));
        $up = $db->prepare('INSERT OR REPLACE INTO nodes(' . implode(',', $cols) . ") VALUES($ph)");
        foreach ($snap['nodes'] ?? [] as $n) {
            $row = [];
            foreach ($cols as $c) $row[] = $c === 'project_id' ? $pid : ($n[$c] ?? null);
            $up->execute($row);
        }
        $di = $db->prepare('INSERT INTO deps(id,project_id,from_id,to_id,label,out_name,in_name,two,bnd) VALUES(?,?,?,?,?,?,?,?,?)');
        foreach ($snap['deps'] ?? [] as $d) $di->execute([$d['id'] ?? null, $pid, $d['from_id'], $d['to_id'], $d['label'] ?? '', $d['out_name'] ?? null, $d['in_name'] ?? null, (int)($d['two'] ?? 0), $d['bnd'] ?? null]);
        $mi = $db->prepare('INSERT INTO milestones(id,project_id,title,date,done,note) VALUES(?,?,?,?,?,?)');
        foreach ($snap['milestones'] ?? [] as $m) $mi->execute([$m['id'] ?? null, $pid, $m['title'], $m['date'] ?? null, $m['done'] ?? 0, $m['note'] ?? '']);
        $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
}

const PM_FIELD_LABELS = ['title' => 'عنوان', 'kind' => 'نوع', 'summary' => 'خلاصه', 'details' => 'توضیحات', 'inputs' => 'ورودی‌ها', 'outputs' => 'خروجی‌ها', 'process' => 'پردازش',
    'tech' => 'نکات فنی', 'priority' => 'اولویت', 'status' => 'وضعیت', 'progress' => 'درصد انجام', 'est_days' => 'برآورد', 'final_days' => 'زمان نهایی', 'start_date' => 'تاریخ شروع',
    'assignee' => 'مسئول', 'tags' => 'برچسب‌ها', 'color' => 'رنگ', 'icon' => 'آیکن', 'flow' => 'فلوچارت', 'parent_id' => 'جایگاه'];

/** پس از ایمپورت: نوعِ هر بخش را با قواعدِ سلسله‌مراتب هم‌خوان می‌کند (و «کار» را تک‌ورودی/تک‌خروجی). */
function pm_fix_hierarchy(PDO $db, int $pid, array &$warn): void
{
    $pk = pm_proj_kind($db, $pid);
    $st = $db->prepare('SELECT id, parent_id, kind, title, inputs, outputs FROM nodes WHERE project_id=? ORDER BY sort,id');
    $st->execute([$pid]);
    $by = []; $rows = [];
    foreach ($st as $r) { $rows[(int)$r['id']] = $r; $by[(int)($r['parent_id'] ?? 0)][] = (int)$r['id']; }
    $walk = function (int $parent, ?string $parentKind) use (&$walk, &$rows, &$by, $db, $pk, &$warn) {
        foreach ($by[$parent] ?? [] as $id) {
            $r = $rows[$id];
            $allowed = pm_child_kinds($parentKind, $pk);
            $kind = $r['kind'];
            if (!in_array($kind, $allowed, true) && $allowed) {
                $new = $kind === 'area' ? 'section' : $allowed[0];
                if ($kind === 'task' && in_array('task', $allowed, true)) $new = 'task';
                $db->prepare('UPDATE nodes SET kind=? WHERE id=?')->execute([$new, $id]);
                $warn[] = 'نوعِ «' . $r['title'] . '» به «' . $new . '» اصلاح شد (در این جایگاه مجاز نبود)';
                $kind = $new;
            } elseif (!$allowed) {
                $warn[] = '«' . $r['title'] . '» زیرِ «کار» است و مجاز نیست؛ نوعِ والد به «بخش» تغییر کرد';
                if ($parent) { $db->prepare("UPDATE nodes SET kind='section' WHERE id=?")->execute([$parent]); $parentKind = 'section'; }
                $kind = in_array($kind, ['section', 'module', 'task'], true) ? $kind : 'task';
                $db->prepare('UPDATE nodes SET kind=? WHERE id=?')->execute([$kind, $id]);
            }
            if ($kind === 'task') {
                $f = ['inputs' => $r['inputs'], 'outputs' => $r['outputs']];
                pm_enforce_io($f, 'task');
                if ($f['inputs'] !== $r['inputs'] || $f['outputs'] !== $r['outputs']) $db->prepare('UPDATE nodes SET inputs=?, outputs=? WHERE id=?')->execute([$f['inputs'], $f['outputs'], $id]);
            }
            $walk($id, $kind);
        }
    };
    $walk(0, null);
}


/** ورودی/خروجی‌های ریشهٔ رونوشت: «کاربردِ همین‌جا» و «بدون‌استفاده» از نو شروع می‌شود (تعریفِ ماژول می‌ماند). */
function pm_reset_ports($json): string
{
    $a = json_decode((string)$json, true);
    if (!is_array($a)) return '[]';
    foreach ($a as &$p) { $p['use'] = ''; $p['unused'] = false; $p['why'] = ''; }
    return json_encode($a, JSON_UNESCAPED_UNICODE);
}


/** تغییرِ نامِ یک ورودی/خروجی در همه‌جا: خودِ بخش، پیوندها و شکل‌های فلوچارت. */
function pm_port_rename(PDO $db, int $pid, int $nodeId, string $side, string $old, string $new): void
{
    $col = $side === 'in' ? 'inputs' : 'outputs';
    $st = $db->prepare("SELECT $col, flow FROM nodes WHERE id=? AND project_id=?");
    $st->execute([$nodeId, $pid]);
    $r = $st->fetch();
    if (!$r) throw new RuntimeException('بخش پیدا نشد');
    $list = json_decode((string)$r[$col], true) ?: [];
    $hit = false;
    foreach ($list as $p) { if ($p['name'] === $new && $new !== $old) throw new RuntimeException('ورودی/خروجی‌ای با این نام هست'); }
    foreach ($list as &$p) if ($p['name'] === $old) { $p['name'] = $new; $hit = true; }
    unset($p);
    if (!$hit) throw new RuntimeException('ورودی/خروجی پیدا نشد');
    $flow = json_decode((string)($r['flow'] ?? ''), true);
    if (is_array($flow) && isset($flow['nodes'])) {
        foreach ($flow['nodes'] as &$n) if (isset($n['port']) && $n['port']['side'] === $side && $n['port']['name'] === $old) { $n['port']['name'] = $new; if (($n['text'] ?? '') === $old) $n['text'] = $new; }
        unset($n);
    }
    $db->beginTransaction();
    $db->prepare("UPDATE nodes SET $col=?, flow=?, updated_at=? WHERE id=?")->execute([json_encode($list, JSON_UNESCAPED_UNICODE), is_array($flow) ? json_encode($flow, JSON_UNESCAPED_UNICODE) : $r['flow'], pm_now(), $nodeId]);
    if ($side === 'out') {
        $db->prepare('UPDATE deps SET out_name=? WHERE project_id=? AND from_id=? AND out_name=? AND bnd IS NULL')->execute([$new, $pid, $nodeId, $old]);
        $db->prepare("UPDATE deps SET out_name=? WHERE project_id=? AND from_id=? AND out_name=? AND bnd='out'")->execute([$new, $pid, $nodeId, $old]);
        $db->prepare("UPDATE deps SET in_name=? WHERE project_id=? AND to_id=? AND in_name=? AND bnd='out'")->execute([$new, $pid, $nodeId, $old]);
    } else {
        $db->prepare('UPDATE deps SET in_name=? WHERE project_id=? AND to_id=? AND in_name=? AND bnd IS NULL')->execute([$new, $pid, $nodeId, $old]);
        $db->prepare("UPDATE deps SET in_name=? WHERE project_id=? AND to_id=? AND in_name=? AND bnd='in'")->execute([$new, $pid, $nodeId, $old]);
        $db->prepare("UPDATE deps SET out_name=? WHERE project_id=? AND from_id=? AND out_name=? AND bnd='in'")->execute([$new, $pid, $nodeId, $old]);
    }
    $db->commit();
}
