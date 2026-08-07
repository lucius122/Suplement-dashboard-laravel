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
            $total  = $this->hitungTotal($data['items'], $produk);
            $cash   = $data['method'] === 'tunai' ? ($data['cash'] ?? null) : null;

            $trx = Transaction::create([
                'branch_id' => $branchId,
                'user_id'   => $user->id,
                'method'    => $data['method'],
                'total'     => $total,
                'cash'      => $cash,
                'change'    => $cash !== null ? max(0, $cash - $total) : null,
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

    /** Total SELALU dari harga di DB, bukan dari harga kiriman client (anti-manipulasi). */
    private function hitungTotal(array $items, array $produk): int
    {
        return (int) collect($items)->sum(fn ($i) => $i['qty'] * $produk[$i['product_id']]->harga);
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
                'price'          => $p->harga,
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
            'due_date'       => $data['due_date'],
            'branch_id'      => $branchId,
            'transaction_id' => $trx->id,
            'paid'           => false,
        ]);
    }
}
