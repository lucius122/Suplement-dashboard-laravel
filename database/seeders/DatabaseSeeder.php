<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\Promo;
use App\Models\Receivable;
use App\Models\Supplier;
use App\Models\Transaction;
use App\Models\TransactionItem;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        mt_srand(42); // seed deterministik supaya angka dashboard konsisten antar `migrate:fresh --seed`

        $pleburan  = Branch::create(['name' => 'Pleburan']);
        $surakarta = Branch::create(['name' => 'Surakarta']);

        foreach (['Protein', 'Performa', 'Recovery', 'Kesehatan', 'Aksesoris'] as $cat) {
            Category::create(['name' => $cat]);
        }

        // ---- users (password = username) ----
        $users = [
            ['name' => 'Admin Toko',        'username' => 'admin', 'role' => 'Admin', 'branch' => $pleburan,  'active' => true],
            ['name' => 'Andi Saputra',      'username' => 'kasir', 'role' => 'Kasir', 'branch' => $pleburan,  'active' => true],
            ['name' => 'Pak Yusuf (Owner)', 'username' => 'owner', 'role' => 'Admin', 'branch' => $pleburan,  'active' => true],
            ['name' => 'Dewi Lestari',      'username' => 'dewi',  'role' => 'Kasir', 'branch' => $surakarta, 'active' => true],
            ['name' => 'Rudi Hartono',      'username' => 'rudi',  'role' => 'Admin', 'branch' => $surakarta, 'active' => true],
            ['name' => 'Lina Marlina',      'username' => 'lina',  'role' => 'Kasir', 'branch' => $pleburan,  'active' => false],
        ];
        foreach ($users as $u) {
            User::create([
                'name' => $u['name'],
                'username' => $u['username'],
                'email' => $u['username'].'@suplemen.local',
                'password' => $u['username'],
                'role' => $u['role'],
                'branch_id' => $u['branch']->id,
                'active' => $u['active'],
            ]);
        }

        // ---- products (exp relatif dari sekarang supaya badge kedaluwarsa selalu hidup) ----
        $exp = fn (?int $months) => $months === null ? null : now()->addMonths($months)->format('Y-m');
        $products = [
            ['Whey Gold Standard 2lb',    'Cokelat',     685000, 540000, 'Protein',   '8991234500017', 9,    12, $pleburan],
            ['Whey Gold Standard 2lb',    'Vanila',      685000, 540000, 'Protein',   '8991234500024', 2,    4,  $pleburan],
            ['Creatine Monohydrate 300g', 'Unflavored',  215000, 150000, 'Performa',  '8991234500031', 12,   20, $pleburan],
            ['BCAA 2:1:1 400g',           'Blue Razz',   245000, 175000, 'Recovery',  '8991234500048', 1,    7,  $pleburan],
            ['Mass Gainer 5lb',           'Cokelat',     540000, 430000, 'Protein',   '8991234500055', 3,    0,  $pleburan],
            ['Pre-Workout C4 60srv',      'Fruit Punch', 320000, 230000, 'Performa',  '8991234500062', 4,    9,  $pleburan],
            ['Fish Oil Omega-3',          '200 kaps',    145000,  95000, 'Kesehatan', '8991234500079', 7,    25, $pleburan],
            ['Shaker Bottle 600ml',       'Hitam',        55000,  30000, 'Aksesoris', '8991234500086', null, 30, $pleburan],
            ['Multivitamin Daily',        '60 tab',      110000,  70000, 'Kesehatan', '8991234500093', 6,    3,  $surakarta],
            ['Whey Isolate 2lb',          'Cokelat',     760000, 600000, 'Protein',   '8991234500109', 8,    6,  $surakarta],
            ['L-Glutamine 300g',          'Unflavored',  190000, 130000, 'Recovery',  '8991234500116', 2,    2,  $surakarta],
            ['Vitamin C 1000mg',          '60 tab',       65000,  38000, 'Kesehatan', '8991234500123', 1,    14, $surakarta],
        ];
        foreach ($products as $i => $p) {
            Product::create([
                'name' => $p[0], 'varian' => $p[1], 'harga' => $p[2], 'modal' => $p[3],
                'kategori' => $p[4], 'barcode' => $p[5], 'exp' => $exp($p[6]),
                'stok' => $p[7], 'branch_id' => $p[8]->id,
                'photo' => '/images/pr'.($i + 1).'.png',
            ]);
        }

        // ---- receivables (due relatif: telat, hari ini, mendekati, aman, lunas) ----
        $recv = [
            ['Budi Santoso',         520000,  -3,  1, $pleburan,  false],
            ['Rina Wijaya',         1200000, -10, -8, $pleburan,  false],
            ['Agus Pratama',         295000,  -1,  3, $pleburan,  false],
            ['Sari Dewi',            165000, -15, -8, $pleburan,  true],
            ['Toko Sehat Reseller', 2400000,  -5,  2, $surakarta, false],
            ['Hendra Gunawan',       480000,  -4, -1, $surakarta, false],
            ['Maya Putri',           350000,  -1,  0, $pleburan,  false],
            ['CV Bugar Sentosa',    1750000,  -8,  6, $surakarta, false],
        ];
        foreach ($recv as $r) {
            Receivable::create([
                'name' => $r[0], 'amount' => $r[1],
                'trx_date' => now()->addDays($r[2])->toDateString(),
                'due_date' => now()->addDays($r[3])->toDateString(),
                'branch_id' => $r[4]->id, 'paid' => $r[5],
            ]);
        }

        // ---- suppliers ----
        $sup = [
            ['PT Nutrisi Prima',      8500000,   5, false],
            ['CV Sehat Jaya',         4200000,  -2, false],
            ['Distributor Otot Kuat', 6000000,  12, false],
            ['PT Vitamin Indo',       3100000, -10, true],
        ];
        foreach ($sup as $s) {
            Supplier::create(['name' => $s[0], 'amount' => $s[1], 'due_date' => now()->addDays($s[2])->toDateString(), 'paid' => $s[3]]);
        }

        // ---- promos (katalog display) ----
        $promos = [
            ['Paket Pemula', 'Whey 2lb + Shaker Bottle', 'Bundle', 'Hemat Rp40.000'],
            ['Diskon Creatine', 'Semua varian Creatine', 'Diskon', '15%'],
            ['Bundle Recovery', 'BCAA + L-Glutamine', 'Bundle', 'Hemat Rp55.000'],
            ['Flash Sale Vitamin', 'Vitamin C & Multivitamin', 'Diskon', 'Rp10.000'],
        ];
        foreach ($promos as $p) {
            Promo::create(['name' => $p[0], 'desc' => $p[1], 'type' => $p[2], 'value' => $p[3]]);
        }

        // ---- transactions: 6 minggu terakhir per cabang, jadi sumber angka dashboard/laporan ----
        foreach ([$pleburan, $surakarta] as $branch) {
            $branchProducts = Product::where('branch_id', $branch->id)->get();
            $sellers = User::where('branch_id', $branch->id)->where('active', true)->pluck('id');
            $scale = $branch->id === $pleburan->id ? 1.0 : 0.65; // Surakarta lebih sepi
            for ($d = 42; $d >= 0; $d--) {
                $day = Carbon::now()->subDays($d);
                $isToday = $d === 0;
                $count = (int) round(mt_rand(5, 11) * $scale) + ($day->isWeekend() ? 2 : 0);
                for ($t = 0; $t < $count; $t++) {
                    $roll = mt_rand(1, 100);
                    $method = $roll <= 60 ? 'tunai' : ($roll <= 85 ? 'marketplace' : 'tempo');
                    $hour = $isToday ? mt_rand(8, max(8, min(20, $day->hour))) : mt_rand(9, 20);
                    $at = $day->copy()->setTime($hour, mt_rand(0, 59));

                    $trx = Transaction::create([
                        'branch_id' => $branch->id, 'method' => $method,
                        'user_id' => $sellers->random(),
                        'total' => 0, 'created_at' => $at,
                    ]);
                    $total = 0;
                    foreach ($branchProducts->random(mt_rand(1, 3)) as $prod) {
                        $qty = mt_rand(1, 2);
                        TransactionItem::create([
                            'transaction_id' => $trx->id, 'product_id' => $prod->id,
                            'branch_id' => $branch->id,
                            'qty' => $qty, 'price' => $prod->harga, 'created_at' => $at,
                        ]);
                        $total += $qty * $prod->harga;
                    }
                    $cash = $method === 'tunai' ? (int) (ceil($total / 50000) * 50000) : null;
                    $trx->update(['total' => $total, 'cash' => $cash, 'change' => $cash ? $cash - $total : null]);
                }
            }
        }
    }
}
