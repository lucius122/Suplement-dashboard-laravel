# POS Suplemen Semarang

Aplikasi kasir + dashboard admin toko suplemen.
Laravel 12 (API session-based) + SPA vanilla JS tanpa build step.

## Struktur direktori

```
SuplemenSemarang/
├── frontend/                 # yang dilihat pengguna (document root)
│   ├── js/
│   │   ├── app.js            #   dashboard admin (SPA)
│   │   ├── kasir.js          #   layar kasir
│   │   └── __test.js         #   harness e2e, aktif hanya di ?e2e=1 lokal
│   ├── css/  fonts/  images/
│   └── index.php             #   pintu masuk semua request
│
├── backend/                  # yang dikerjakan server
│   ├── app/
│   │   ├── Http/Controllers/ #   1 controller per menu
│   │   ├── Models/           #   Eloquent
│   │   └── Services/         #   logika bisnis (penjualan, biaya rutin, upload)
│   ├── database/             #   migrations, seeders, factories
│   └── routes/web.php        #   semua rute & endpoint /api/*
│
├── database/                 # DOKUMENTASI skema (ERD, schema) — bukan kode
├── config/  bootstrap/  storage/  tests/
└── composer.json
```

> Struktur ini **sengaja berbeda** dari bawaan Laravel (`app/`, `public/`,
> `database/`) supaya pembagian frontend / backend / database langsung terbaca.
> Penyesuaian path-nya ada di [`bootstrap/app.php`](bootstrap/app.php) lewat
> `useAppPath()`, `useDatabasePath()`, dan `usePublicPath()`.

## Menjalankan

MySQL (Laragon) harus hidup lebih dulu, lalu:

```bash
cd SuplemenSemarang
php artisan serve
```

Buka http://127.0.0.1:8000

## Menguji

```bash
php artisan test                     # unit & feature (SQLite in-memory)
```

E2E berjalan di browser: buka `http://127.0.0.1:8000/?e2e=1`, hasilnya
ditulis ke `div#results` sebagai `RESULTS[...]END`. Lebar layar menentukan
alur yang diuji — <900px menjalankan alur kasir, selebihnya alur admin.
