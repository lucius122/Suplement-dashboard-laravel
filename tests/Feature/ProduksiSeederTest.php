<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Category;
use App\Models\ExpenseCategory;
use App\Models\User;
use Database\Seeders\ProduksiSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Seeder produksi = satu-satunya jalan masuk saat database server masih kosong.
 * Kalau ini salah, aplikasi terpasang tapi tidak ada yang bisa login.
 */
class ProduksiSeederTest extends TestCase
{
    use RefreshDatabase;

    private function setEnvPassword(?string $password): void
    {
        if ($password === null) {
            putenv('SEED_ADMIN_PASSWORD');
            unset($_ENV['SEED_ADMIN_PASSWORD'], $_SERVER['SEED_ADMIN_PASSWORD']);

            return;
        }
        putenv("SEED_ADMIN_PASSWORD={$password}");
        $_ENV['SEED_ADMIN_PASSWORD'] = $password;
        $_SERVER['SEED_ADMIN_PASSWORD'] = $password;
    }

    protected function tearDown(): void
    {
        $this->setEnvPassword(null);
        parent::tearDown();
    }

    public function test_menolak_jalan_tanpa_password(): void
    {
        $this->setEnvPassword(null);

        $this->seed(ProduksiSeeder::class);

        $this->assertSame(0, User::count(), 'tanpa password, tidak boleh ada akun dibuat');
    }

    public function test_menolak_password_terlalu_pendek(): void
    {
        $this->setEnvPassword('pendek');

        $this->seed(ProduksiSeeder::class);

        $this->assertSame(0, User::count());
    }

    public function test_menyiapkan_cabang_kategori_dan_admin(): void
    {
        $this->setEnvPassword('RahasiaKuat123');

        $this->seed(ProduksiSeeder::class);

        $this->assertSame(1, Branch::count());
        $this->assertSame(5, Category::count(), 'kategori produk awal');
        $this->assertSame(5, ExpenseCategory::count(), 'kategori biaya awal');

        $admin = User::first();
        $this->assertSame('admin', $admin->username);
        $this->assertSame('Admin', $admin->role);
        $this->assertTrue((bool) $admin->active);
        $this->assertNotNull($admin->branch_id, 'admin wajib terkait cabang, kalau tidak transaksi/biaya gagal');
    }

    public function test_password_benar_benar_bisa_dipakai_login(): void
    {
        // Kolom password punya cast 'hashed'. Kalau seeder ikut meng-hash manual,
        // hasilnya dobel-hash: seeder "sukses" tapi admin tak bisa masuk.
        $this->setEnvPassword('RahasiaKuat123');
        $this->seed(ProduksiSeeder::class);

        $this->postJson('/login', ['username' => 'admin', 'password' => 'RahasiaKuat123'])
            ->assertOk();
    }

    public function test_tidak_membuat_data_dummy(): void
    {
        $this->setEnvPassword('RahasiaKuat123');

        $this->seed(ProduksiSeeder::class);

        // Toko sungguhan: angka harus real, seeder tak boleh menyuntik apa pun
        $this->assertSame(0, \App\Models\Product::count(), 'produk diinput pemilik toko sendiri');
        $this->assertSame(0, \App\Models\Transaction::count());
        $this->assertSame(0, \App\Models\Receivable::count());
        $this->assertSame(0, \App\Models\Expense::count());
    }

    public function test_aman_dijalankan_dua_kali(): void
    {
        $this->setEnvPassword('RahasiaKuat123');

        $this->seed(ProduksiSeeder::class);
        $this->seed(ProduksiSeeder::class);

        $this->assertSame(1, User::count(), 'jalan kedua tidak boleh menggandakan admin');
        $this->assertSame(1, Branch::count());
        $this->assertSame(5, Category::count());
        $this->assertSame(5, ExpenseCategory::count());
    }
}
