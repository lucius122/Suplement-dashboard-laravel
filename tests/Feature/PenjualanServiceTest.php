<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Product;
use App\Models\Receivable;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\PenjualanService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Logika inti kasir: uang & stok. Sebelum dipisah ke service, bagian ini hanya
 * bisa diuji lewat e2e (butuh browser + server hidup); sekarang bisa diuji langsung.
 */
class PenjualanServiceTest extends TestCase
{
    use RefreshDatabase;

    private function buatKasir(): User
    {
        $cabang = Branch::create(['name' => 'Uji']);

        return User::create([
            'name' => 'Kasir Uji', 'username' => 'kasiruji', 'email' => 'kasiruji@uji.local',
            'password' => Hash::make('rahasia'), 'role' => 'Kasir',
            'branch_id' => $cabang->id, 'active' => true,
        ]);
    }

    private function buatProduk(int $branchId, int $harga, int $stok): Product
    {
        return Product::create([
            'name' => 'Whey Uji', 'varian' => '2lb', 'harga' => $harga, 'modal' => 1000,
            'kategori' => 'Protein', 'stok' => $stok, 'branch_id' => $branchId,
        ]);
    }

    public function test_total_dihitung_dari_harga_db_bukan_kiriman_client(): void
    {
        $kasir = $this->buatKasir();
        $produk = $this->buatProduk($kasir->branch_id, harga: 100000, stok: 10);

        $trx = app(PenjualanService::class)->simpan([
            'items' => [['product_id' => $produk->id, 'qty' => 2, 'price' => 1]], // client "menawar" jadi 1
            'method' => 'tunai', 'cash' => 200000,
        ], $kasir);

        $this->assertSame(200000, $trx->total, 'total wajib 2 x 100.000 dari DB, bukan dari price kiriman client');
        $this->assertSame(100000, (int) $trx->items()->first()->price);
    }

    public function test_stok_dipotong_dan_mutasi_keluar_tercatat(): void
    {
        $kasir = $this->buatKasir();
        $produk = $this->buatProduk($kasir->branch_id, harga: 50000, stok: 10);

        app(PenjualanService::class)->simpan([
            'items' => [['product_id' => $produk->id, 'qty' => 3, 'price' => 50000]],
            'method' => 'tunai', 'cash' => 150000,
        ], $kasir);

        $this->assertSame(7, $produk->fresh()->stok);

        $mutasi = StockMovement::where('product_id', $produk->id)->where('type', 'keluar')->first();
        $this->assertNotNull($mutasi, 'penjualan harus meninggalkan jejak di buku besar stok');
        $this->assertSame(3, $mutasi->qty);
        $this->assertSame('Penjualan', $mutasi->note);
    }

    public function test_stok_kurang_ditolak_dan_tidak_menyisakan_data_separuh(): void
    {
        $kasir = $this->buatKasir();
        $produk = $this->buatProduk($kasir->branch_id, harga: 50000, stok: 1);

        try {
            app(PenjualanService::class)->simpan([
                'items' => [['product_id' => $produk->id, 'qty' => 5, 'price' => 50000]],
                'method' => 'tunai', 'cash' => 250000,
            ], $kasir);
            $this->fail('penjualan melebihi stok seharusnya ditolak');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }

        // transaksi dibungkus DB::transaction → tidak boleh ada sisa apa pun
        $this->assertSame(1, $produk->fresh()->stok, 'stok tak boleh berubah saat gagal');
        $this->assertSame(0, \App\Models\Transaction::count());
        $this->assertSame(0, StockMovement::count());
    }

    public function test_metode_tempo_membuat_piutang(): void
    {
        $kasir = $this->buatKasir();
        $produk = $this->buatProduk($kasir->branch_id, harga: 75000, stok: 5);

        $trx = app(PenjualanService::class)->simpan([
            'items' => [['product_id' => $produk->id, 'qty' => 2, 'price' => 75000]],
            'method' => 'tempo', 'customer_name' => 'Bu Sari', 'due_date' => now()->addDays(7)->toDateString(),
        ], $kasir);

        $piutang = Receivable::where('transaction_id', $trx->id)->first();
        $this->assertNotNull($piutang);
        $this->assertSame('Bu Sari', $piutang->name);
        $this->assertSame(150000, (int) $piutang->amount);
        $this->assertFalse((bool) $piutang->paid);
    }
}
