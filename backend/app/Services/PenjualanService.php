<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Receivable;
use App\Models\StockMovement;
use App\Models\Transaction;
use App\Models\TransactionItem;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Logika bisnis penjualan (kasir): menyimpan satu transaksi beserta seluruh
 * akibatnya — potong stok, catat mutasi stok, dan buat piutang bila tempo.
 *
 * Dipisah dari controller karena ini logika inti yang menyentuh UANG dan STOK
 * sekaligus punya masalah konkurensi (dua kasir menjual barang sama bersamaan),
 * jadi layak diuji terpisah tanpa harus lewat browser.
 */
class PenjualanService
{
    /**
     * @param  array  $data  payload yang SUDAH divalidasi controller
     *
     * @throws \Symfony\Component\HttpKernel\Exception\HttpException 422 bila stok kurang
     */
    public function simpan(array $data, User $user): Transaction
    {
        return DB::transaction(function () use ($data, $user) {
            $branchId = $user->branch_id;

            $produk = $this->kunciDanCekStok($data['items']);
            $this->cekHargaTidakDinaikkan($data['items'], $produk);
            $total  = $this->hitungTotal($data['items']);
            $cash   = $data['method'] === 'tunai' ? ($data['cash'] ?? null) : null;

            $trx = Transaction::create([
                'branch_id' => $branchId,
                'user_id'   => $user->id,
                'method'    => $data['method'],
                'total'     => $total,
                'cash'      => $cash,
                // cash >= total → ada kembalian; cash < total → kasir memberi
                // potongan, kembalian tidak berlaku (null), bukan nol.
                'change'    => ($cash !== null && $cash >= $total) ? $cash - $total : null,
            ]);

            $this->catatItemDanPotongStok($trx, $data['items'], $produk, $branchId, $user->id);

            if ($data['method'] === 'tempo') {
                $this->buatPiutang($trx, $data, $total, $branchId);
            }

            return $trx;
        });
    }

    /**
     * Kunci baris tiap produk lalu pastikan stoknya cukup. Baris yang dikunci
     * dikembalikan untuk dipakai ulang (harga & potong stok) — supaya tidak ada
     * celah check-then-act antar transaksi yang terjadi hampir bersamaan.
     *
     * @return array<int, Product> produk ter-indeks by id
     */
    private function kunciDanCekStok(array $items): array
    {
        $produk = [];
        foreach ($items as $item) {
            $p = Product::where('id', $item['product_id'])->lockForUpdate()->first();
            abort_if(
                ! $p || $p->stok < $item['qty'],
                422,
                'Stok produk "'.($p->name ?? '?').'" tidak mencukupi (tersisa '.($p->stok ?? 0).').',
            );
            $produk[$item['product_id']] = $p;
        }

        return $produk;
    }

    /**
     * Kasir boleh MENURUNKAN harga (diskon/potongan), tidak boleh menaikkannya.
     *
     * Tanpa penjagaan ini, siapa pun yang bisa mengirim request ke endpoint
     * transaksi bebas menentukan harga jual — termasuk menaikkannya diam-diam
     * di atas harga yang tertera. Batas atasnya harus dicek di sini, bukan di
     * controller, karena harga acuan baru diketahui setelah baris produk
     * dikunci. Alasan penurunan harga diisi kasir di layar (priceNote).
     */
    private function cekHargaTidakDinaikkan(array $items, array $produk): void
    {
        foreach ($items as $item) {
            $p = $produk[$item['product_id']];
            abort_if(
                $item['price'] > $p->harga,
                422,
                'Harga "'.$p->name.'" tidak boleh melebihi harga normal ('.$p->harga.').',
            );
        }
    }

    /** Total dari harga kiriman client yang SUDAH dibatasi cekHargaTidakDinaikkan(). */
    private function hitungTotal(array $items): int
    {
        return (int) collect($items)->sum(fn ($i) => $i['qty'] * $i['price']);
    }

    private function catatItemDanPotongStok(Transaction $trx, array $items, array $produk, int $branchId, int $userId): void
    {
        foreach ($items as $item) {
            $p = $produk[$item['product_id']];

            TransactionItem::create([
                'transaction_id' => $trx->id,
                'product_id'     => $item['product_id'],
                'branch_id'      => $branchId,
                'qty'            => $item['qty'],
                // harga yang BENAR-BENAR dipakai kasir, bukan harga normal DB
                'price'          => $item['price'],
                // alasan harga khusus; null kalau harganya normal
                'note'           => trim($item['note'] ?? '') ?: null,
            ]);

            // pakai baris yang sama yang sudah dikunci & divalidasi di atas
            $p->decrement('stok', $item['qty']);
            StockMovement::record($p, 'keluar', $item['qty'], 'Penjualan', $userId, $trx->id);
        }
    }

    private function buatPiutang(Transaction $trx, array $data, int $total, int $branchId): void
    {
        Receivable::create([
            'name'           => $data['customer_name'],
            'amount'         => $total,
            'trx_date'       => now()->toDateString(),
            // jatuh tempo baku 1 bulan; client tidak lagi mengirim due_date
            'due_date'       => now()->addMonth()->toDateString(),
            'branch_id'      => $branchId,
            'transaction_id' => $trx->id,
            'paid'           => false,
        ]);
    }
}
