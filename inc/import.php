<?php
declare(strict_types=1);
/**
 * ایمپورت فایل پروژه (همان فایلی که «خروجی برای هوش مصنوعی» می‌دهد و هوش مصنوعی به‌روزش می‌کند).
 *
 * - گره با شناسهٔ موجود ← به‌روزرسانی (فقط کلیدهای حاضر)؛ شناسهٔ ناشناخته (مثلاً "new-1") ← گرهٔ تازه.
 * - هیچ‌چیز بدونِ "deleted": true پاک نمی‌شود.
 * - logs: فقط ردیف‌های بدونِ id موجود اضافه می‌شوند (تکرارِ ایمپورت چیزی را دوبار نمی‌نویسد).
 * - work_report: وضعیت/درصد را به‌روز و یک گزارش در تاریخچهٔ همان بخش ثبت می‌کند.
 */

function pm_key($v): string
{
    $s = trim((string)$v);
    if (preg_match('/^n(\d+)$/i', $s, $m)) return $m[1];
    return $s;
}

function pm_import(PDO $db, array $doc, string $mode, ?int $pid, string $author): array
{
    $stat = ['nodes_new' => 0, 'nodes_updated' => 0, 'nodes_deleted' => 0, 'deps' => 0, 'milestones' => 0,
             'logs' => 0, 'reports' => 0, 'warnings' => []];
    $db->beginTransaction();
    try {
        $p = is_array($doc['project'] ?? null) ? $doc['project'] : [];
        $now = pm_now();
        if ($mode !== 'update' || !$pid) {
            $name = pm_str($p['name'] ?? '', 200) ?: 'پروژهٔ واردشده';
            $db->prepare('INSERT INTO projects(name,description,start_date,target_date,status,ai_brief,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?)')->execute([
                $name, pm_str($p['description'] ?? '', 20000), pm_date($p['start_date'] ?? null),
                pm_date($p['target_date'] ?? null),
                in_array($p['status'] ?? '', ['active', 'hold', 'done', 'archived'], true) ? $p['status'] : 'active',
                pm_str($p['ai_brief'] ?? '', 20000), $now, $now]);
            $pid = (int)$db->lastInsertId();
            $mode = 'new';
        } else {
            $set = []; $arg = [];
            foreach (['name' => 200, 'description' => 20000, 'ai_brief' => 20000] as $k => $n) {
                if (array_key_exists($k, $p)) { $set[] = "$k=?"; $arg[] = pm_str($p[$k], $n); }
            }
            foreach (['start_date', 'target_date'] as $k) {
                if (array_key_exists($k, $p)) { $set[] = "$k=?"; $arg[] = pm_date($p[$k]); }
            }
            if (array_key_exists('status', $p) && in_array($p['status'], ['active', 'hold', 'done', 'archived'], true)) {
                $set[] = 'status=?'; $arg[] = $p['status'];
            }
            if ($set) {
                $set[] = 'updated_at=?'; $arg[] = $now; $arg[] = $pid;
                $db->prepare('UPDATE projects SET ' . implode(',', $set) . ' WHERE id=?')->execute($arg);
            }
        }

        // موجودها
        $ex = [];
        $st = $db->prepare('SELECT * FROM nodes WHERE project_id=?');
        $st->execute([$pid]);
        foreach ($st as $r) $ex[(string)$r['id']] = $r;

        $map = [];      // کلیدِ فایل ← شناسهٔ واقعی
        $nodes = is_array($doc['nodes'] ?? null) ? $doc['nodes'] : [];
        $todel = [];
        // گذر ۱: ساخت/یافتن
        foreach ($nodes as $i => $n) {
            if (!is_array($n)) continue;
            $key = pm_key($n['id'] ?? ('auto' . $i));
            if ($mode === 'update' && isset($ex[$key])) {
                $map[$key] = (int)$key;
                if (!empty($n['deleted'])) $todel[] = (int)$key;
                continue;
            }
            if (!empty($n['deleted'])) continue;
            $db->prepare('INSERT INTO nodes(project_id,title,created_at,updated_at) VALUES(?,?,?,?)')
               ->execute([$pid, pm_str($n['title'] ?? '', 300) ?: 'بدون عنوان', $now, $now]);
            $map[$key] = (int)$db->lastInsertId();
            $ex[(string)$map[$key]] = null;
            $n['__new'] = true;
            $nodes[$i] = $n;
            $stat['nodes_new']++;
        }
        // گذر ۲: فیلدها و والد
        $sortNext = [];
        foreach ($nodes as $n) {
            if (!is_array($n)) continue;
            $key = pm_key($n['id'] ?? '');
            if (!isset($map[$key]) || !empty($n['deleted'])) continue;
            $id = $map[$key];
            $isNew = !empty($n['__new']);
            $fields = pm_clean_node($n);
            $changed = array_keys($fields);
            $cur = $isNew ? ['status' => 'todo', 'progress' => 0, 'done_date' => null]
                          : $db->query("SELECT status,progress,done_date FROM nodes WHERE id=$id")->fetch();
            $merged = pm_norm(array_merge($cur, $fields), $changed);
            $fields['status'] = $merged['status'];
            $fields['progress'] = $merged['progress'];
            $fields['done_date'] = $merged['done_date'];
            if (array_key_exists('parent', $n) || array_key_exists('parent_id', $n) || $isNew) {
                $pk = $n['parent'] ?? ($n['parent_id'] ?? null);
                $par = null;
                if ($pk !== null && $pk !== '') {
                    $pk = pm_key($pk);
                    if (isset($map[$pk])) $par = $map[$pk];
                    elseif ($mode === 'update' && isset($ex[$pk])) $par = (int)$pk;
                    else $stat['warnings'][] = "والدِ «{$pk}» برای «" . ($n['title'] ?? $key) . "» پیدا نشد؛ در ریشه گذاشته شد";
                }
                if ($par === $id || ($par !== null && in_array($par, pm_subtree($db, $pid, $id), true))) {
                    $stat['warnings'][] = "والدِ «" . ($n['title'] ?? $key) . "» دور می‌ساخت؛ نادیده گرفته شد";
                } else {
                    $fields['parent_id'] = $par;
                    if ($isNew || !isset($n['order'])) {
                        $sk = (string)($par ?? 0);
                        $sortNext[$sk] = $sortNext[$sk] ?? pm_next_sort($db, $pid, $par);
                        if ($isNew) $fields['sort'] = $sortNext[$sk]++;
                    }
                }
            }
            if (isset($n['order']) && is_numeric($n['order'])) $fields['sort'] = (int)$n['order'];
            $fields['updated_at'] = $now;
            $set = implode(',', array_map(fn($k) => "$k=?", array_keys($fields)));
            $db->prepare("UPDATE nodes SET $set WHERE id=?")->execute([...array_values($fields), $id]);
            if (!$isNew) $stat['nodes_updated']++;
        }
        foreach ($todel as $id) { $stat['nodes_deleted'] += pm_delete_nodes($db, $pid, $id); }

        // وابستگی‌ها
        foreach (is_array($doc['dependencies'] ?? null) ? $doc['dependencies'] : [] as $d) {
            if (!is_array($d)) continue;
            $fk = pm_key($d['from'] ?? ''); $tk = pm_key($d['to'] ?? '');
            $f = $map[$fk] ?? (isset($ex[$fk]) ? (int)$fk : 0);
            $t = $map[$tk] ?? (isset($ex[$tk]) ? (int)$tk : 0);
            if (!$f || !$t || $f === $t) { $stat['warnings'][] = "وابستگیِ نامعتبر: $fk → $tk"; continue; }
            $outN = pm_str($d['out'] ?? ($d['out_name'] ?? ''), 200) ?: null;
            $inN = pm_str($d['in'] ?? ($d['in_name'] ?? ''), 200) ?: null;
            $q = $db->prepare("SELECT id FROM deps WHERE project_id=? AND from_id=? AND to_id=? AND COALESCE(out_name,'')=? AND COALESCE(in_name,'')=?");
            $q->execute([$pid, $f, $t, $outN ?? '', $inN ?? '']);
            $eid = $q->fetchColumn();
            if (!empty($d['deleted'])) {
                if ($eid) $db->prepare('DELETE FROM deps WHERE id=?')->execute([$eid]);
                continue;
            }
            if ($eid) {
                if (array_key_exists('label', $d)) $db->prepare('UPDATE deps SET label=? WHERE id=?')->execute([pm_str($d['label'], 300), $eid]);
                continue;
            }
            if (pm_is_related($db, $pid, $f, $t) || (empty($d['two']) && pm_dep_path($db, $pid, $t, $f))) {
                $stat['warnings'][] = "وابستگیِ «$fk → $tk» دور یا رابطهٔ والد/فرزند می‌ساخت؛ رد شد";
                continue;
            }
            $db->prepare('INSERT INTO deps(project_id,from_id,to_id,label,out_name,in_name,two) VALUES(?,?,?,?,?,?,?)')
               ->execute([$pid, $f, $t, pm_str($d['label'] ?? '', 300), $outN, $inN, !empty($d['two']) ? 1 : 0]);
            $stat['deps']++;
        }

        // نقاط عطف
        foreach (is_array($doc['milestones'] ?? null) ? $doc['milestones'] : [] as $m) {
            if (!is_array($m)) continue;
            $mid = isset($m['id']) && is_numeric($m['id']) ? (int)$m['id'] : 0;
            $own = false;
            if ($mid) {
                $q = $db->prepare('SELECT 1 FROM milestones WHERE id=? AND project_id=?');
                $q->execute([$mid, $pid]);
                $own = (bool)$q->fetchColumn();
            }
            if ($own && !empty($m['deleted'])) { $db->prepare('DELETE FROM milestones WHERE id=?')->execute([$mid]); continue; }
            $title = pm_str($m['title'] ?? '', 300);
            if ($title === '' && !$own) continue;
            if ($own) {
                $set = []; $arg = [];
                if ($title !== '') { $set[] = 'title=?'; $arg[] = $title; }
                if (array_key_exists('date', $m)) { $set[] = 'date=?'; $arg[] = pm_date($m['date']); }
                if (array_key_exists('done', $m)) { $set[] = 'done=?'; $arg[] = $m['done'] ? 1 : 0; }
                if (array_key_exists('note', $m)) { $set[] = 'note=?'; $arg[] = pm_str($m['note'], 2000); }
                if ($set) { $arg[] = $mid; $db->prepare('UPDATE milestones SET ' . implode(',', $set) . ' WHERE id=?')->execute($arg); }
            } else {
                $db->prepare('INSERT INTO milestones(project_id,title,date,done,note) VALUES(?,?,?,?,?)')
                   ->execute([$pid, $title, pm_date($m['date'] ?? null), !empty($m['done']) ? 1 : 0, pm_str($m['note'] ?? '', 2000)]);
                $stat['milestones']++;
            }
        }

        $resolve = function ($k) use ($map, $ex): ?int {
            if ($k === null || $k === '') return null;
            $k = pm_key($k);
            return $map[$k] ?? (isset($ex[$k]) ? (int)$k : null);
        };
        $addLog = function (?int $node, string $kind, string $body, ?string $date) use ($db, $pid, $author) {
            $d = $date ? (pm_date($date) ?: null) : null;
            $at = $d ? ($d . ' ' . (preg_match('/(\d{2}:\d{2}(:\d{2})?)/', (string)$date, $mm) ? $mm[1] : '12:00:00')) : pm_now();
            if (strlen($at) === 16) $at .= ':00';
            $db->prepare('INSERT INTO logs(project_id,node_id,kind,body,author,created_at) VALUES(?,?,?,?,?,?)')
               ->execute([$pid, $node, $kind, pm_str($body, 20000), $author, $at]);
        };

        // یادداشت‌ها (فقط بدونِ id)
        foreach (is_array($doc['logs'] ?? null) ? $doc['logs'] : [] as $l) {
            if (!is_array($l) || !empty($l['id'])) continue;
            $body = pm_str($l['body'] ?? '', 20000);
            if ($body === '') continue;
            $kind = in_array($l['kind'] ?? '', ['note', 'ai_report', 'change'], true) ? $l['kind'] : 'note';
            $addLog($resolve($l['node'] ?? null), $kind, $body, $l['date'] ?? null);
            $stat['logs']++;
        }

        // گزارش کارِ هوش مصنوعی
        foreach (is_array($doc['work_report'] ?? null) ? $doc['work_report'] : [] as $r) {
            if (!is_array($r)) continue;
            $id = $resolve($r['node'] ?? null);
            if (!$id) { $stat['warnings'][] = 'گزارش برای بخشِ نامعلوم: ' . ($r['node'] ?? '?'); continue; }
            $f = [];
            if (isset($r['status'])) $f['status'] = $r['status'];
            if (isset($r['progress'])) $f['progress'] = $r['progress'];
            if (isset($r['actual_days'])) $f['final_days'] = $r['actual_days'];
            $f = pm_clean_node($f);
            if ($f) {
                $cur = $db->query("SELECT status,progress,done_date FROM nodes WHERE id=$id")->fetch();
                $m = pm_norm(array_merge($cur, $f), array_keys($f));
                $f['status'] = $m['status']; $f['progress'] = $m['progress']; $f['done_date'] = $m['done_date'];
                $set = implode(',', array_map(fn($k) => "$k=?", array_keys($f)));
                $db->prepare("UPDATE nodes SET $set, updated_at=? WHERE id=?")->execute([...array_values($f), $now, $id]);
            }
            $parts = [];
            foreach (['summary' => 'خلاصه', 'how' => 'نحوهٔ انجام', 'files_changed' => 'فایل‌ها', 'decisions' => 'تصمیم‌ها',
                      'how_to_test' => 'نحوهٔ آزمون', 'deviations' => 'تفاوت با طرح', 'remaining' => 'باقی‌مانده', 'notes' => 'نکته‌ها'] as $k => $label) {
                if (!isset($r[$k]) || $r[$k] === '' || $r[$k] === []) continue;
                $v = is_array($r[$k]) ? '- ' . implode("\n- ", array_map('strval', $r[$k])) : (string)$r[$k];
                $parts[] = ($k === 'summary' ? '' : "$label:\n") . $v;
            }
            if ($parts) { $addLog($id, 'ai_report', implode("\n\n", $parts), $r['date'] ?? null); }
            $stat['reports']++;
        }

        pm_fix_hierarchy($db, $pid, $stat['warnings']);
        pm_chg($db, $pid, null, 'ایمپورت فایل', $stat['nodes_new'] . ' تازه، ' . $stat['nodes_updated'] . ' به‌روز، ' . $stat['reports'] . ' گزارش', $author);
        $db->prepare('UPDATE projects SET updated_at=? WHERE id=?')->execute([$now, $pid]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
    $stat['project_id'] = $pid;
    return $stat;
}
