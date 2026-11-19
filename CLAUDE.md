# Milo — notes for contributors (and Claude)

- Standalone PHP + SQLite project manager (no relation to the Weby store). UI in `assets/`, backend in `api.php` + `inc/`.
- Every change that ships must:
  1. bump the version in `inc/version.php` (the single source of the version);
  2. list any new deployable file in `deploy-files.txt` (paths at most one folder deep; never `data/` or `*.local.php`).
- Pushing to `main` is a release: running sites check GitHub every few minutes and install it automatically
  (`inc/update.php`: syntax check → backup → install → health check → rollback). Keep `index.php?health=1` (prints `ok`)
  and `api.php?a=me` (JSON containing `"csrf"`) working, or every update rolls back.
- `data/` (database, uploads, update state) is never overwritten by updates.
- JavaScript: no `?.` (older browsers). Before pushing: `php -l` all PHP files and `node --check assets/*.js`.

- Hierarchy (enforced in `inc/db.php` `pm_child_kinds`, mirrored in `assets/app.js` `childKindsOf`): root → area; area → section, module;
  section/module → section, module, task; task → nothing and has exactly one input/output. Change both places together.
- Every mutating UI action must be gated by `S.editing` (see `MUT` in `app.js`); the DB migrations live in `pm_schema` (bump `user_version`).

- `library/*.pm.json` is generated: edit `tools/library/*.py`, run `python3 tools/library/build.py` (also rewrites the auto section of `deploy-files.txt`)
  and `node tools/library/check.js library/*.pm.json` (must report no unused ports). API: `bundled_catalog` / `bundled_import`.
- Tests (schema v6, table `tests`): API `tests`/`tests_all`/`test_save`/`test_delete`/`test_status`/`test_reset`; `node.tests` in the `.pm.json` contract (match by `ref`). Define/edit/delete are gated by `MUT` (tadd/tedit/tdel); recording a result is not.
- Weby code is mined into per-module «ساختار فنی» (DDL + function signatures) and «رابط کاربری» (page elements + UI tests) sections by `tools/library/wcode.py`.
- Weby tests are mined by `tools/library/wtests.py` (+ `wmap.py` file→module rules, `wattach.py`); Invora's are in `tools/library/itests.py`. Rebuild projects with `python3 tools/library/build.py`.
- Light Weby modules get a «جریان‌های اصلی» section (tasks from file headers/signatures: `wdeep.py`); Invora technical/UI sections come from `icode.py`.
- Map/flowchart routing runs ONLY on «✨ چیدمان خودکار» (`PMCanvas.arrange()`); opening a page just draws saved routes (`routes` table, schema v7; flowchart edges carry `pts/mid/hide`). Never add routing or layout work to page load.
