<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Product;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Uji beban: tambah N transaksi dummy (default 5000) di atas data yang ada,
 * tersebar 60 hari terakhir. Jalankan: php artisan db:seed --class=StressSeeder
 */
class StressSeeder extends Seeder
{
    public function run(): void
    {
        $count = (int) (env('STRESS_COUNT', 5000));
        $branches = Branch::whereIn('name', ['Pleburan', 'Surakarta'])->get();
        $productsByBranch = Product::all()->groupBy('branch_id');
        $sellersByBranch = \App\Models\User::where('active', true)->whereNotNull('branch_id')
            ->get()->groupBy('branch_id');

        $nextTrxId = (int) DB::table('transactions')->max('id') + 1;
        $now = now();
        $trxRows = [];
        $itemRows = [];

        $flush = function () use (&$trxRows, &$itemRows) {
            foreach (array_chunk($trxRows, 500) as $chunk) {
                DB::table('transactions')->insert($chunk);
            }
            foreach (array_chunk($itemRows, 500) as $chunk) {
                DB::table('transaction_items')->insert($chunk);
            }
            $trxRows = [];
            $itemRows = [];
        };

        for ($i = 0; $i < $count; $i++) {
            $branch = $branches->random();
            $products = $productsByBranch[$branch->id];
            $at = $now->copy()
                ->subDays(mt_rand(0, 59))
                ->setTime(mt_rand(8, 20), mt_rand(0, 59), mt_rand(0, 59))
                ->toDateTimeString();
            $roll = mt_rand(1, 100);
            $method = $roll <= 60 ? 'tunai' : ($roll <= 85 ? 'marketplace' : 'tempo');

            $id = $nextTrxId + $i;
            $total = 0;
            foreach ($products->random(mt_rand(1, 3)) as $prod) {
                $qty = mt_rand(1, 2);
                $itemRows[] = [
                    'transaction_id' => $id, 'product_id' => $prod->id,
                    'branch_id' => $branch->id,
                    'qty' => $qty, 'price' => $prod->harga,
                    'created_at' => $at, 'updated_at' => $at,
                ];
                $total += $qty * $prod->harga;
            }
            $cash = $method === 'tunai' ? (int) (ceil($total / 50000) * 50000) : null;
            $trxRows[] = [
                'id' => $id, 'branch_id' => $branch->id,
                'user_id' => ($sellersByBranch[$branch->id] ?? collect())->random()?->id,
                'method' => $method, 'total' => $total,
                'cash' => $cash, 'change' => $cash ? $cash - $total : null,
                'created_at' => $at, 'updated_at' => $at,
            ];

            if (count($trxRows) >= 2000) {
                $flush(); // jaga pemakaian memori tetap datar untuk jumlah besar
            }
        }
        $flush();

        $this->command?->info($count.' transaksi ditambahkan.');
    }
}
