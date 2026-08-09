<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Category;
use App\Models\ExpenseCategory;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Isian AWAL untuk server produksi — BUKAN data demo.
 *
 * DatabaseSeeder membuat ±600 transaksi dummy, 12 produk, piutang, dsb; itu hanya
 * untuk demo lokal. Di toko sungguhan semua angka harus real, jadi seeder ini
 * cuma menyiapkan yang mustahil diisi lewat UI kalau database benar-benar kosong:
 * satu cabang, kategori awal, dan satu akun admin untuk login pertama kali.
 *
 * Produk, stok, transaksi, dan biaya diinput sendiri oleh pemilik toko lewat aplikasi.
 *
 * Jalankan:
 *   php artisan db:seed --class=ProduksiSeeder --force
 *
 * Password admin WAJIB lewat environment (tidak ada default, supaya tak ada
 * server produksi yang diam-diam memakai password tebakan):
 *   SEED_ADMIN_PASSWORD='...'  php artisan db:seed --class=ProduksiSeeder --force
 *
 * Aman dijalankan berulang (firstOrCreate) — tidak menggandakan data.
 */
class ProduksiSeeder extends Seeder
{
    private const KATEGORI_PRODUK = ['Protein', 'Performa', 'Recovery', 'Kesehatan', 'Aksesoris'];

    private const KATEGORI_BIAYA = ['Sewa', 'Listrik', 'Sampah', 'Plastik', 'Lainnya'];

    public function run(): void
    {
        $password = env('SEED_ADMIN_PASSWORD');

        if (blank($password)) {
            $this->command?->error('SEED_ADMIN_PASSWORD belum diisi.');
            $this->command?->line('Contoh: SEED_ADMIN_PASSWORD=\'RahasiaKuat123\' php artisan db:seed --class=ProduksiSeeder --force');

            return;
        }

        if (strlen($password) < 8) {
            $this->command?->error('SEED_ADMIN_PASSWORD terlalu pendek (minimal 8 karakter).');

            return;
        }

        $namaCabang = env('SEED_BRANCH', 'Pusat');
        $username   = strtolower(env('SEED_ADMIN_USERNAME', 'admin'));

        $cabang = Branch::firstOrCreate(['name' => $namaCabang]);

        foreach (self::KATEGORI_PRODUK as $nama) {
            Category::firstOrCreate(['name' => $nama]);
        }

        foreach (self::KATEGORI_BIAYA as $nama) {
            ExpenseCategory::firstOrCreate(['name' => $nama]);
        }

        $admin = User::firstOrCreate(
            ['username' => $username],
            [
                'name'      => env('SEED_ADMIN_NAME', 'Administrator'),
                'email'     => env('SEED_ADMIN_EMAIL', $username.'@'.parse_url((string) config('app.url'), PHP_URL_HOST) ?: 'localhost'),
                // kolom password punya cast 'hashed' → cukup teks biasa, jangan di-Hash::make
                'password'  => $password,
                'role'      => 'Admin',
                'branch_id' => $cabang->id,
                'active'    => true,
            ]
        );

        $this->command?->info('Cabang       : '.$cabang->name);
        $this->command?->info('Kategori     : '.count(self::KATEGORI_PRODUK).' produk, '.count(self::KATEGORI_BIAYA).' biaya');
        $this->command?->info($admin->wasRecentlyCreated
            ? 'Admin dibuat : '.$admin->username.' (simpan passwordnya, tidak ditampilkan)'
            : 'Admin sudah ada: '.$admin->username.' — password TIDAK diubah oleh seeder ini');
        $this->command?->line('');
        $this->command?->info('Produk, stok, dan transaksi diinput lewat aplikasi — seeder ini sengaja tidak membuat data dummy.');
    }
}
