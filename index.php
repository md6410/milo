<?php
declare(strict_types=1);
/* سنجش سلامت برای به‌روزرسانِ خودکار */
if (isset($_GET['health'])) { header('Content-Type: text/plain'); echo 'ok'; exit; }
header('Cache-Control: no-cache');
header("Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'");
$v = fn(string $f) => (string)@filemtime(__DIR__ . '/assets/' . $f);
?><!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>مدیر پروژه</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232f6fed'/%3E%3Cpath d='M7 10h12M11 16h14M7 22h10' stroke='white' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E">
<link rel="stylesheet" href="assets/app.css?v=<?= $v('app.css') ?>">
</head>
<body>
<div id="app"><div class="boot">در حال بارگذاری…</div></div>
<div id="toasts"></div>
<script src="assets/jalali.js?v=<?= $v('jalali.js') ?>"></script>
<script src="assets/canvas.js?v=<?= $v('canvas.js') ?>"></script>
<script src="assets/flow.js?v=<?= $v('flow.js') ?>"></script>
<script src="assets/engine.js?v=<?= $v('engine.js') ?>"></script>
<script src="assets/app.js?v=<?= $v('app.js') ?>"></script>
</body>
</html>
