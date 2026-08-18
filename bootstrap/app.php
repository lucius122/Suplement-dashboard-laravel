<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

/*
 * Struktur direktori proyek ini SENGAJA menyimpang dari bawaan Laravel supaya
 * pembagian frontend / backend / database langsung terbaca:
 *
 *   frontend/          (dulu public/)     — document root, JS & aset
 *   backend/app/       (dulu app/)        — Models, Http, Services
 *   backend/database/  (dulu database/)   — migrations, seeders, factories
 *   backend/routes/    (dulu routes/)     — definisi rute
 *   database/                             — dokumentasi skema (ERD), bukan kode
 *
 * ApplicationBuilder tidak punya method path, jadi penyesuaiannya dipasang pada
 * instance Application setelah create(). Aman: create() belum mem-bootstrap
 * provider — path baru sudah terpasang sebelum ada yang membacanya.
 */
$app = Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../backend/routes/web.php',
        commands: __DIR__.'/../backend/routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        //
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );
    })->create();

$app->useAppPath(dirname(__DIR__).'/backend/app');
$app->useDatabasePath(dirname(__DIR__).'/backend/database');
// public_path() dipakai `php artisan serve` sbg document root (ServeCommand.php),
// helper asset(), dan `storage:link` — ketiganya otomatis ikut ke frontend/.
$app->usePublicPath(dirname(__DIR__).'/frontend');

return $app;
