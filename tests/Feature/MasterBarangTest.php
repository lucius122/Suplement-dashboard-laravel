<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Dua aturan master barang yang sebelumnya cuma imbauan di label form:
 *
 * 1. Varian menyatakan UKURAN/BERAT, bukan rasa. Tanpa tes ini, seeder yang
 *    memakai 'Cokelat'/'Vanila' sebagai varian lolos tanpa ada yang protes —
 *    persis yang terjadi di branch main sebelum digabung.
 * 2. Edit master barang tidak boleh menyentuh stok. Stok hanya berubah lewat
 *    restock atau penjualan, supaya riwayat mutasi tetap bisa dipercaya.
 */
class MasterBarangTest extends TestCase
{
    use RefreshDatabase;

    private function buatAdmin(): User
    {
        $cabang = Branch::create(['name' => 'Uji']);
        Category::create(['name' => 'Protein']);

        return User::create([
            'name' => 'Admin Uji', 'username' => 'adminuji', 'email' => 'adminuji@uji.local',
            'password' => Hash::make('rahasia'), 'role' => 'Admin',
            'branch_id' => $cabang->id, 'active' => true,
        ]);
    }

    private function produk(int $branchId, string $varian = '2lb', int $stok = 7): Product
    {
        return Product::create([
            'name' => 'Whey Uji', 'varian' => $varian, 'harga' => 100000, 'modal' => 70000,
            'kategori' => 'Protein', 'stok' => $stok, 'branch_id' => $branchId,
        ]);
    }

    /** @return array<string, array{string}> */
    public static function varianRasa(): array
    {
        return [
            'rasa cokelat' => ['Cokelat'],
            'rasa vanila' => ['Vanila'],
            'rasa gabungan' => ['Blue Razz'],
            'tanpa rasa pun tetap rasa' => ['Unflavored'],
        ];
    }

    #[DataProvider('varianRasa')]
    public function test_varian_berupa_rasa_ditolak(string $varian): void
    {
        $admin = $this->buatAdmin();

        $this->actingAs($admin)->postJson('/api/products', [
            'name' => 'Whey Gold Standard', 'varian' => $varian, 'harga' => 685000,
            'kategori' => 'Protein', 'branch' => 'Uji', 'stok' => 5,
        ])->assertStatus(422)->assertJsonValidationErrors('varian');

        $this->assertSame(0, Product::count());
    }

    /** @return array<string, array{string}> */
    public static function varianUkuran(): array
    {
        return [
            'berat pon' => ['2lb'],
            'berat gram' => ['900gr'],
            'berat kilo desimal' => ['1.3kg'],
            'jumlah tablet' => ['60 tab'],
            'jumlah kapsul' => ['200 kaps'],
            'takaran saji' => ['60 srv'],
            'volume' => ['600ml'],
            'satuan eceran tanpa angka' => ['saset'],
        ];
    }

    #[DataProvider('varianUkuran')]
    public function test_varian_berupa_ukuran_diterima(string $varian): void
    {
        $admin = $this->buatAdmin();

        $this->actingAs($admin)->postJson('/api/products', [
            'name' => 'Whey Gold Standard', 'varian' => $varian, 'harga' => 685000,
            'kategori' => 'Protein', 'branch' => 'Uji', 'stok' => 5,
        ])->assertOk();

        $this->assertSame($varian, Product::first()->varian);
    }

    public function test_edit_produk_menyimpan_perubahan(): void
    {
        $admin = $this->buatAdmin();
        $p = $this->produk($admin->branch_id);

        $this->actingAs($admin)->patchJson('/api/products/'.$p->id, [
            'name' => 'Whey Isolate', 'varian' => '5lb', 'harga' => 1450000,
            'modal' => 1180000, 'kategori' => 'Protein',
        ])->assertOk();

        $p->refresh();
        $this->assertSame('Whey Isolate', $p->name);
        $this->assertSame('5lb', $p->varian);
        $this->assertSame(1450000, $p->harga);
        $this->assertSame(1180000, $p->modal);
    }

    public function test_edit_produk_tidak_mengubah_stok_maupun_cabang(): void
    {
        $admin = $this->buatAdmin();
        $lain = Branch::create(['name' => 'Cabang Lain']);
        $p = $this->produk($admin->branch_id, stok: 7);

        // stok & branch sengaja dikirim — server harus mengabaikannya
        $this->actingAs($admin)->patchJson('/api/products/'.$p->id, [
            'name' => 'Whey Uji', 'varian' => '2lb', 'harga' => 100000,
            'kategori' => 'Protein', 'stok' => 999, 'branch' => 'Cabang Lain',
            'branch_id' => $lain->id,
        ])->assertOk();

        $p->refresh();
        $this->assertSame(7, $p->stok, 'stok hanya boleh berubah lewat restock/penjualan');
        $this->assertSame($admin->branch_id, $p->branch_id, 'produk tidak boleh pindah cabang lewat form edit');
        $this->assertSame(0, StockMovement::count(), 'edit master barang bukan mutasi stok');
    }

    public function test_edit_produk_menolak_varian_rasa(): void
    {
        $admin = $this->buatAdmin();
        $p = $this->produk($admin->branch_id);

        $this->actingAs($admin)->patchJson('/api/products/'.$p->id, [
            'name' => 'Whey Uji', 'varian' => 'Cokelat', 'harga' => 100000, 'kategori' => 'Protein',
        ])->assertStatus(422)->assertJsonValidationErrors('varian');

        $this->assertSame('2lb', $p->refresh()->varian);
    }

    public function test_kasir_tidak_boleh_edit_master_barang(): void
    {
        $admin = $this->buatAdmin();
        $p = $this->produk($admin->branch_id);
        $kasir = User::create([
            'name' => 'Kasir Uji', 'username' => 'kasiruji', 'email' => 'kasiruji@uji.local',
            'password' => Hash::make('rahasia'), 'role' => 'Kasir',
            'branch_id' => $admin->branch_id, 'active' => true,
        ]);

        $this->actingAs($kasir)->patchJson('/api/products/'.$p->id, [
            'name' => 'Diubah Kasir', 'varian' => '2lb', 'harga' => 1, 'kategori' => 'Protein',
        ])->assertStatus(403);

        $this->assertSame('Whey Uji', $p->refresh()->name);
    }
}
