<?php
declare(strict_types=1);
/**
 * مدیر پروژه — پایگاه‌داده (SQLite) و ابزارهای مشترک.
 * همهٔ داده در data/pm.sqlite و data/uploads/ است؛ پوشهٔ data از بیرون بسته است.
 */

const PM_DATA = __DIR__ . '/../data';
const PM_STATUSES = ['todo', 'doing', 'review', 'done', 'blocked', 'hold'];
const PM_KINDS = ['section', 'module', 'task'];

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
    if ($v >= 2) return;
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
    // v2: بوم گرافیکی (جایگاه، رنگ، آیکن) و فلوچارتِ هر بخش
    foreach (['x REAL', 'y REAL', 'color TEXT', 'icon TEXT', 'flow TEXT'] as $c) {
        try { $db->exec("ALTER TABLE nodes ADD COLUMN $c"); } catch (Throwable $e) { /* ستون از قبل هست */ }
    }
    $db->exec('PRAGMA user_version=2');
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
        $out[] = ['name' => $name, 'desc' => pm_str($r['desc'] ?? ($r['description'] ?? ''), 1000)];
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
            'color' => pm_color($n['color'] ?? null)];
    }
    $edges = []; $eids = [];
    foreach (array_slice(is_array($f['edges'] ?? null) ? $f['edges'] : [], 0, 800) as $e) {
        if (!is_array($e)) continue;
        $a = (string)($e['from'] ?? ''); $b = (string)($e['to'] ?? '');
        if (!isset($ids[$a]) || !isset($ids[$b]) || $a === $b) continue;
        $id = substr(preg_replace('/[^A-Za-z0-9_\-]/', '', (string)($e['id'] ?? '')), 0, 24) ?: ('e' . count($edges));
        if (isset($eids[$id])) $id .= count($edges);
        $eids[$id] = true;
        $edges[] = ['id' => $id, 'from' => $a, 'to' => $b, 'label' => pm_str($e['label'] ?? '', 100), 'color' => pm_color($e['color'] ?? null)];
    }
    return $nodes ? ['v' => 1, 'nodes' => $nodes, 'edges' => $edges] : null;
}

function pm_node_out(array $r): array
{
    $r['flow'] = !empty($r['flow']) ? (json_decode((string)$r['flow'], true) ?: null) : null;
    foreach (['x', 'y'] as $k) if (($r[$k] ?? null) !== null) $r[$k] = (float)$r[$k];
    foreach (['id', 'project_id', 'parent_id', 'priority', 'progress', 'sort'] as $k) {
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
    $st = $db->prepare('SELECT from_id, to_id FROM deps WHERE project_id=?');
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
    $n = $db->prepare('SELECT COUNT(*) FROM nodes WHERE project_id=?');
    $n->execute([$pid]);
    $p['node_count'] = (int)$n->fetchColumn();
    return $p;
}
