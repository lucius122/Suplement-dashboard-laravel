<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Receivable;
use App\Models\StockMovement;
use App\Models\Transaction;
use App\Models\TransactionItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class TransactionController extends Controller
{
    public function storeTransaction(Request $request)
    {
        $user = $request->user();
        abort_if(! $user->branch_id, 422, 'Akun ini belum dikaitkan ke cabang manapun.');

        $data = $request->validate([
            'items'                  => ['required', 'array', 'min:1'],
            'items.*.product_id'     => ['required', 'integer', 'exists:products,id'],
            'items.*.qty'            => ['required', 'integer', 'min:1'],
            'items.*.price'          => ['required', 'integer', 'min:0'],
            'method'                 => ['required', Rule::in(['tunai', 'marketplace', 'tempo'])],
            'cash'                   => ['nullable', 'integer', 'min:0'],
            'customer_name'          => ['required_if:method,tempo', 'nullable', 'string', 'max:100'],
            'due_date'               => ['required_if:method,tempo', 'nullable', 'date'],
        ]);

        DB::transaction(function () use ($data, $user) {
            $branchId = $user->branch_id;

            // Kunci baris produk & pakai harga ASLI dari DB (bukan dari client) — satu
            // query per item, dipakai ulang utk cek stok & potong stok, supaya tidak ada
            // celah check-then-act antar transaksi yang terjadi hampir bersamaan.
            $products = [];
            foreach ($data['items'] as $item) {
                $prod = Product::where('id', $item['product_id'])->lockForUpdate()->first();
                abort_if(
                    ! $prod || $prod->stok < $item['qty'],
                    422,
                    'Stok produk "'.($prod->name ?? '?').'" tidak mencukupi (tersisa '.($prod->stok ?? 0).').',
                );
                $products[$item['product_id']] = $prod;
            }

            $total = collect($data['items'])->sum(fn ($i) => $i['qty'] * $products[$i['product_id']]->harga);
            $cash  = ($data['method'] === 'tunai') ? ($data['cash'] ?? null) : null;

            $trx = Transaction::create([
                'branch_id' => $branchId,
                'user_id'   => $user->id,
                'method'    => $data['method'],
                'total'     => $total,
                'cash'      => $cash,
                'change'    => $cash !== null ? max(0, $cash - $total) : null,
            ]);

            foreach ($data['items'] as $item) {
                $prod = $products[$item['product_id']];

                TransactionItem::create([
                    'transaction_id' => $trx->id,
                    'product_id'     => $item['product_id'],
                    'branch_id'      => $branchId,
                    'qty'            => $item['qty'],
                    'price'          => $prod->harga,
                ]);

                // Potong stok pakai baris yang sama yang sudah dikunci & divalidasi di atas
                $prod->decrement('stok', $item['qty']);
                StockMovement::record($prod, 'keluar', $item['qty'], 'Penjualan', $user->id, $trx->id);
            }

            // Pembayaran tempo → buat piutang otomatis
            if ($data['method'] === 'tempo') {
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
        });

        return response()->json(['ok' => true]);
    }

    public function payReceivable(Request $request, Receivable $receivable)
    {
        $this->assertAdmin($request);
        $receivable->update(['paid' => true]);

        return response()->json(['ok' => true]);
    }
}
