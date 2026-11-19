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
