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

    public function test_kasir_boleh_menurunkan_harga_dan_total_ikut_turun(): void
    {
        $kasir = $this->buatKasir();
        $produk = $this->buatProduk($kasir->branch_id, harga: 100000, stok: 10);

        $trx = app(PenjualanService::class)->simpan([
            'items' => [['product_id' => $produk->id, 'qty' => 2, 'price' => 90000]], // diskon Rp10.000/pcs
            'method' => 'tunai', 'cash' => 200000,
        ], $kasir);

        $this->assertSame(180000, $trx->total, 'total mengikuti harga diskon, bukan harga normal');
        $this->assertSame(90000, (int) $trx->items()->first()->price, 'harga yang dipakai kasir wajib tersimpan apa adanya');
        $this->assertSame(20000, (int) $trx->change);
    }

    public function test_harga_di_atas_harga_normal_ditolak(): void
    {
        $kasir = $this->buatKasir();
        $produk = $this->buatProduk($kasir->branch_id, harga: 100000, stok: 10);

        try {
            app(PenjualanService::class)->simpan([
                'items' => [['product_id' => $produk->id, 'qty' => 1, 'price' => 150000]], // menaikkan diam-diam
                'method' => 'tunai', 'cash' => 150000,
            ], $kasir);
            $this->fail('harga di atas harga normal seharusnya ditolak');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }

        $this->assertSame(10, $produk->fresh()->stok, 'stok tak boleh berubah saat ditolak');
        $this->assertSame(0, \App\Models\Transaction::count());
    }

    public function test_bayar_kurang_dari_total_dicatat_tanpa_kembalian(): void
    {
        $kasir = $this->buatKasir();
        $produk = $this->buatProduk($kasir->branch_id, harga: 100000, stok: 10);

        $trx = app(PenjualanService::class)->simpan([
            'items' => [['product_id' => $produk->id, 'qty' => 1, 'price' => 100000]],
            'method' => 'tunai', 'cash' => 80000, // kasir memberi potongan Rp20.000
        ], $kasir);

        $this->assertSame(100000, $trx->total);
        $this->assertSame(80000, (int) $trx->cash);
        $this->assertNull($trx->change, 'bayar kurang = potongan, kembalian null (bukan 0)');
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
            'method' => 'tempo', 'customer_name' => 'Bu Sari',
        ], $kasir);

        $piutang = Receivable::where('transaction_id', $trx->id)->first();
        $this->assertNotNull($piutang);
        $this->assertSame('Bu Sari', $piutang->name);
        $this->assertSame(150000, (int) $piutang->amount);
        $this->assertFalse((bool) $piutang->paid);
        $this->assertSame(
            now()->addMonth()->toDateString(),
            $piutang->due_date->toDateString(),
            'jatuh tempo baku 1 bulan, tidak lagi dari kiriman client',
        );
    }
}
