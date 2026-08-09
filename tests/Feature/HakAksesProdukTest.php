<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Permintaan klien: input master barang & stok DIPUSATKAN di dashboard admin,
 * kasir hanya boleh MELIHAT sisa stok — supaya tidak terjadi double input.
 *
 * Menyembunyikan tombol di kasir.js saja tidak cukup: endpoint-nya tetap bisa
 * dipanggil langsung. Tes ini mengunci aturan itu di sisi server.
 */
class HakAksesProdukTest extends TestCase
{
    use RefreshDatabase;

    private Branch $cabang;

    protected function setUp(): void
    {
        parent::setUp();
        $this->cabang = Branch::create(['name' => 'Pusat']);
        Category::create(['name' => 'Protein']);
    }

    private function user(string $role): User
    {
        $u = strtolower($role);

        return User::create([
            'name' => $role.' Uji', 'username' => $u, 'email' => $u.'@uji.local',
            'password' => 'rahasia123', 'role' => $role,
            'branch_id' => $this->cabang->id, 'active' => true,
        ]);
    }

    private function produk(): Product
    {
        return Product::create([
            'name' => 'Whey Uji', 'varian' => '900gr', 'harga' => 100000, 'modal' => 60000,
            'kategori' => 'Protein', 'stok' => 5, 'branch_id' => $this->cabang->id,
        ]);
    }

    private function payloadProduk(): array
    {
        return [
            'name' => 'Produk Baru', 'varian' => '900gr', 'harga' => 50000,
            'modal' => 30000, 'stok' => 3, 'kategori' => 'Protein', 'branch' => 'Pusat',
        ];
    }

    public function test_kasir_tidak_boleh_menambah_produk(): void
    {
        $this->actingAs($this->user('Kasir'))
            ->postJson('/api/products', $this->payloadProduk())
            ->assertStatus(403);

        $this->assertSame(0, Product::count(), 'tidak boleh ada produk terbuat oleh kasir');
    }

    public function test_kasir_tidak_boleh_menambah_stok(): void
    {
        $produk = $this->produk();

        $this->actingAs($this->user('Kasir'))
            ->postJson('/api/products/'.$produk->id.'/restock', ['qty' => 10])
            ->assertStatus(403);

        $this->assertSame(5, $produk->fresh()->stok, 'stok tak boleh berubah');
    }

    public function test_kasir_tidak_boleh_mengubah_master_barang(): void
    {
        $produk = $this->produk();

        $this->actingAs($this->user('Kasir'))
            ->patchJson('/api/products/'.$produk->id, $this->payloadProduk())
            ->assertStatus(403);

        $this->assertSame('Whey Uji', $produk->fresh()->name);
    }

    public function test_admin_tetap_boleh_menambah_produk(): void
    {
        $this->actingAs($this->user('Admin'))
            ->postJson('/api/products', $this->payloadProduk())
            ->assertOk();

        $this->assertSame(1, Product::count());
        $this->assertSame(3, Product::first()->stok);
    }

    public function test_admin_tetap_boleh_menambah_stok(): void
    {
        $produk = $this->produk();

        $this->actingAs($this->user('Admin'))
            ->postJson('/api/products/'.$produk->id.'/restock', ['qty' => 10])
            ->assertOk();

        $this->assertSame(15, $produk->fresh()->stok);
    }

    public function test_varian_rasa_ditolak_varian_ukuran_diterima(): void
    {
        $admin = $this->user('Admin');

        // varian ukuran/berat → diterima
        $this->actingAs($admin)
            ->postJson('/api/products', $this->payloadProduk())
            ->assertOk();

        // varian rasa → ditolak (master barang tidak dipisah per rasa)
        $this->actingAs($admin)
            ->postJson('/api/products', array_merge($this->payloadProduk(), ['name' => 'Whey Cokelat', 'varian' => 'Cokelat']))
            ->assertStatus(422);

        $this->assertSame(1, Product::count(), 'hanya yang varian ukurannya valid yang tersimpan');
    }
}
