<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\Receivable;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DashboardController extends Controller
{
    public function bootstrap()
    {
        // Stok masuk TERAKHIR per produk, untuk ditampilkan langsung di baris
        // Manajemen Stok ("kapan & berapa" tanpa perlu membuka riwayat satu per satu).
        // Dua query datar, BUKAN N+1: ambil id terakhir per produk, lalu barisnya.
        // Dipakai MAX(id), bukan MAX(created_at): id monotonik, jadi dua restock
        // pada detik yang sama tetap punya pemenang yang pasti.
        $idMasukTerakhir = StockMovement::where('type', 'masuk')
            ->groupBy('product_id')
            ->selectRaw('MAX(id) as id')
            ->pluck('id');
        $masukTerakhir = StockMovement::whereIn('id', $idMasukTerakhir)
            ->get(['id', 'product_id', 'qty', 'created_at'])
            ->keyBy('product_id');

        return response()->json([
            'branches' => Branch::orderBy('id')->get(['id', 'name']),
            'categories' => Category::orderBy('id')->get(['id', 'name']),
            'products' => Product::with('branch')->orderBy('id')->get()->map(function ($p) use ($masukTerakhir) {
                $m = $masukTerakhir->get($p->id);

                return [
                    'id' => $p->id, 'name' => $p->name, 'varian' => $p->varian,
                    'harga' => $p->harga, 'modal' => $p->modal, 'kategori' => $p->kategori,
                    'stok' => $p->stok,
                    'cabang' => $p->branch->name, 'photo' => $p->photo, 'custom' => $p->custom,
                    // null = produk ini belum pernah kemasukan stok sama sekali
                    'masukTerakhir' => $m ? ['qty' => $m->qty, 'tanggal' => $m->created_at->toDateString()] : null,
                ];
            }),
            'receivables' => Receivable::with(['branch', 'payments'])->orderByDesc('id')->get()->map(fn ($r) => [
                'id' => $r->id, 'name' => $r->name, 'note' => $r->note, 'amount' => $r->amount,
                'paid_amount' => $r->paid_amount,
                'remaining' => max(0, $r->amount - $r->paid_amount),
                'trx' => $r->trx_date->toDateString(), 'due' => $r->due_date->toDateString(),
                'cabang' => $r->branch->name, 'paid' => $r->paid,
                'payments' => $r->payments->map(fn ($p) => [
                    'id' => $p->id,
                    'amount' => $p->amount,
                    'created_at' => $p->created_at->toDateTimeString(),
                ]),
            ]),
            'users' => User::with('branch')->orderBy('id')->get()->map(fn ($u) => [
                'id' => $u->id, 'name' => $u->name, 'uname' => $u->username,
                'role' => $u->role, 'cabang' => $u->branch?->name ?? '-', 'active' => $u->active,
            ]),
            'suppliers' => Supplier::orderByDesc('id')->get()->map(fn ($s) => [
                'id' => $s->id, 'name' => $s->name, 'amount' => $s->amount,
                'due' => $s->due_date->toDateString(), 'paid' => $s->paid,
            ]),
        ]);
    }

    /**
     * Angka-angka layar Dashboard, per cabang.
     *
     * Alurnya: 4 query agregat dijalankan SEKALI untuk semua cabang (bukan di dalam
     * loop — supaya tidak N+1), lalu tiap cabang merakit angkanya sendiri dari
     * hasil itu. Semua penjumlahan dikerjakan di SQL, bukan menarik baris mentah
     * ke PHP, jadi tetap ~100ms walau transaksi sudah ratusan ribu.
     */
    public function dashboard()
    {
        $byMethod    = $this->qOmsetHariIni();       // KPI hari ini + tren vs kemarin
        $daily       = $this->qOmsetHarian();        // grafik 7 hari & omset 4 minggu
        $methodDaily = $this->qMetodeBayarPeriode(); // rincian metode utk tab Mingguan/Bulanan
        $tops        = $this->qProdukTerlaris();     // 4 produk terlaris 30 hari

        $out = [];
        foreach (Branch::all() as $branch) {
            $out[$branch->name] = $this->ringkasanCabang($branch, $byMethod, $daily, $methodDaily, $tops);
        }

        return response()->json($out);
    }

    /* ---------- query agregat (dipakai bersama semua cabang) ---------- */

    /** Omset + jumlah transaksi per cabang/hari/metode, 2 hari terakhir. */
    private function qOmsetHariIni()
    {
        return DB::table('transactions')
            ->where('created_at', '>=', now()->subDay()->startOfDay())
            ->selectRaw('branch_id, DATE(created_at) as d, method, SUM(total) as total, COUNT(*) as trx')
            ->groupBy('branch_id', 'd', 'method')
            ->get();
    }

    /**
     * Omset per cabang/hari. Rentangnya 4 minggu penuh (bukan 7 hari) supaya satu
     * query ini melayani DUA grafik sekaligus: tren 7 hari & omset 4 minggu terakhir.
     */
    private function qOmsetHarian()
    {
        return DB::table('transactions')
            ->where('created_at', '>=', now()->startOfWeek()->subWeeks(3)->startOfDay())
            ->selectRaw('branch_id, DATE(created_at) as d, SUM(total) as total')
            ->groupBy('branch_id', 'd')
            ->get()
            ->groupBy('branch_id');
    }

    /**
     * Rincian metode bayar per hari, sejak awal bulan / awal minggu (mana yang lebih
     * dulu). Dipakai tab Mingguan & Bulanan supaya angkanya dihitung dari transaksi
     * periode itu sendiri — bukan ditaksir dari rasio metode bayar HARI INI.
     */
    private function qMetodeBayarPeriode()
    {
        $mulai = min(now()->startOfMonth(), now()->startOfWeek());

        return DB::table('transactions')
            ->where('created_at', '>=', $mulai->copy()->startOfDay())
            ->selectRaw('branch_id, method, DATE(created_at) as d, SUM(total) as total')
            ->groupBy('branch_id', 'method', 'd')
            ->get()
            ->groupBy('branch_id');
    }

    /**
     * Produk terlaris 30 hari per cabang. Diagregasi dulu di transaction_items
     * (pakai index ti_report_idx), baru nama produk di-join pada hasil kecilnya.
     */
    private function qProdukTerlaris()
    {
        $agg = DB::table('transaction_items')
            ->where('created_at', '>=', now()->subDays(30))
            ->selectRaw('branch_id, product_id, SUM(qty) as sold')
            ->groupBy('branch_id', 'product_id');

        return DB::table('products')
            ->joinSub($agg, 'agg', 'agg.product_id', '=', 'products.id')
            ->selectRaw('agg.branch_id, products.name as name, SUM(agg.sold) as sold')
            ->groupBy('agg.branch_id', 'products.name')
            ->get()
            ->groupBy('branch_id');
    }

    /* ---------- perakitan angka satu cabang ---------- */

    private function ringkasanCabang($branch, $byMethod, $daily, $methodDaily, $tops): array
    {
        $bm = $byMethod->where('branch_id', $branch->id);
        $barisHariIni = $bm->where('d', now()->toDateString());
        $totalHariIni = (int) $barisHariIni->sum('total');
        $totalKemarin = (int) $bm->where('d', now()->subDay()->toDateString())->sum('total');

        $harian = ($daily[$branch->id] ?? collect())->keyBy('d');   // omset per tanggal
        $minggu = $this->omset4Minggu($harian);

        $metode = $methodDaily[$branch->id] ?? collect();
        $awalMinggu = now()->startOfWeek()->toDateString();
        $awalBulan  = now()->startOfMonth()->toDateString();

        $metodeHariIni = $this->jumlahPerMetode($barisHariIni);

        return [
            'today' => $totalHariIni,
            'trend' => $this->tren($totalHariIni, $totalKemarin),
            'tunai' => $metodeHariIni['tunai'],
            'market' => $metodeHariIni['market'],
            'tempo' => $metodeHariIni['tempo'],
            // per-cabang supaya index (branch_id, created_at) terpakai penuh
            'month' => (int) Transaction::where('branch_id', $branch->id)
                ->where('created_at', '>=', now()->startOfMonth())->sum('total'),
            'trx' => (int) $barisHariIni->sum('trx'),
            'week' => $this->grafik7Hari($harian),
            'weeks' => $minggu,                                  // 4 minggu terakhir (data asli)
            'weekNow' => (int) ($minggu[3]['total'] ?? 0),        // omset minggu berjalan
            // rincian metode bayar ASLI per periode (bukan taksiran rasio hari ini)
            'weekMethods' => $this->jumlahPerMetode($metode->filter(fn ($r) => $r->d >= $awalMinggu)),
            'monthMethods' => $this->jumlahPerMetode($metode->filter(fn ($r) => $r->d >= $awalBulan)),
            'top' => ($tops[$branch->id] ?? collect())
                ->sortByDesc('sold')->take(4)->values()
                ->map(fn ($t) => ['name' => $t->name, 'sold' => (int) $t->sold]),
        ];
    }

    /* ---------- hitungan kecil ---------- */

    /** Naik/turun omset hari ini vs kemarin, mis. "+12%". */
    private function tren(int $hariIni, int $kemarin): string
    {
        if ($kemarin > 0) {
            $pct = (int) round(($hariIni - $kemarin) / $kemarin * 100);

            return ($pct >= 0 ? '+' : '').$pct.'%';
        }

        return $hariIni > 0 ? '+100%' : '';
    }

    /** Batang omset 7 hari terakhir (dalam juta), berlabel nama hari. */
    private function grafik7Hari($harian): array
    {
        $namaHari = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
        $bar = [];
        for ($d = 6; $d >= 0; $d--) {
            $hari = now()->subDays($d);
            $sum = (int) ($harian->get($hari->toDateString())->total ?? 0);
            $bar[] = ['label' => $namaHari[$hari->dayOfWeek], 'v' => round($sum / 1e6, 2)];
        }

        return $bar;
    }

    /**
     * Omset 4 minggu kalender terakhir (Senin–Minggu), dijumlah dari baris harian
     * yang sama. Bucket terakhir = minggu berjalan, dipakai sbg total tab "Mingguan".
     */
    private function omset4Minggu($harian): array
    {
        $minggu = [];
        for ($w = 3; $w >= 0; $w--) {
            $mulai   = now()->startOfWeek()->subWeeks($w)->toDateString();
            $selesai = now()->startOfWeek()->subWeeks($w)->endOfWeek()->toDateString();
            $sum = 0;
            foreach ($harian as $tanggal => $row) {
                if ($tanggal >= $mulai && $tanggal <= $selesai) {
                    $sum += (int) $row->total;
                }
            }
            $minggu[] = ['label' => 'Mg '.(4 - $w), 'v' => round($sum / 1e6, 2), 'total' => $sum];
        }

        return $minggu;
    }

    /** Pecah sekumpulan baris transaksi jadi total per metode bayar. */
    private function jumlahPerMetode($baris): array
    {
        return [
            'tunai' => (int) $baris->where('method', 'tunai')->sum('total'),
            'market' => (int) $baris->where('method', 'marketplace')->sum('total'),
            'tempo' => (int) $baris->where('method', 'tempo')->sum('total'),
        ];
    }

    public function dashboardYearly(Request $request)
    {
        // Rincian bulanan SATU tahun (dipilih user), on-demand — bukan bagian
        // dashboard() supaya tidak dihitung tiap load kalau tab yang dilihat
        // cuma Harian/Mingguan. Dibatasi rentang wajar (5 tahun ke belakang)
        // supaya orang tidak iseng query tahun 1900.
        $data = $request->validate([
            'year' => ['required', 'integer', 'min:'.(now()->year - 5), 'max:'.now()->year],
        ]);
        $year = (int) $data['year'];
        $monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        $lastMonth = $year === now()->year ? (int) now()->format('n') : 12;

        // method ikut di-group supaya rincian Tunai/Marketplace/Tempo tab Tahunan
        // dihitung dari transaksi tahun itu sendiri. Total per bulan tetap benar:
        // baris per (tanggal, metode) dijumlahkan semua ke bulan yang sama.
        $daily = DB::table('transactions')
            ->whereYear('created_at', $year)
            ->selectRaw('branch_id, method, DATE(created_at) as d, SUM(total) as total')
            ->groupBy('branch_id', 'method', 'd')
            ->get()
            ->groupBy('branch_id');

        $out = [];
        foreach (Branch::all() as $branch) {
            $rows = $daily[$branch->id] ?? collect();
            $perMonth = array_fill(1, $lastMonth, 0);
            foreach ($rows as $row) {
                $m = (int) substr($row->d, 5, 2);
                if (isset($perMonth[$m])) $perMonth[$m] += (int) $row->total;
            }
            $months = [];
            foreach ($perMonth as $m => $sum) {
                $months[] = ['label' => $monthNames[$m - 1], 'v' => round($sum / 1e6, 2)];
            }
            $out[$branch->name] = [
                'months' => $months,
                'year' => array_sum($perMonth),
                'methods' => [
                    'tunai' => (int) $rows->where('method', 'tunai')->sum('total'),
                    'market' => (int) $rows->where('method', 'marketplace')->sum('total'),
                    'tempo' => (int) $rows->where('method', 'tempo')->sum('total'),
                ],
            ];
        }

        return response()->json($out);
    }

    private function periodStart(string $period): \Carbon\CarbonInterface
    {
        return match ($period) {
            'Mingguan' => now()->subDays(6)->startOfDay(),
            'Bulanan' => now()->startOfMonth(),
            default => now()->startOfYear(),
        };
    }

    /**
     * "Item apa saja yang laku pada hari tertentu" — laporan penjualan disortir
     * per tanggal. Dipakai layar Laporan Omset, dimuat on-demand saat admin
     * memilih tanggal (bukan bagian dashboard yang dihitung tiap load).
     */
    public function salesByDate(Request $request)
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'date' => ['required', 'date'],
            'branch' => ['nullable', 'string'],
            // username petugas; kosong/'Semua' = tidak disaring
            'user' => ['nullable', 'string'],
        ]);
        $tanggal = \Illuminate\Support\Carbon::parse($data['date'])->toDateString();
        $cabang = ($data['branch'] ?? 'Semua') !== 'Semua' ? $data['branch'] : null;
        $branchId = $cabang ? Branch::where('name', $cabang)->value('id') : null;

        $uname = ($data['user'] ?? 'Semua') !== 'Semua' ? $data['user'] : null;
        // Username tak dikenal TIDAK boleh diam-diam jadi "semua petugas" — itu
        // menampilkan angka seluruh toko seolah-olah milik satu orang.
        $userId = null;
        if ($uname !== null) {
            $userId = User::where('username', $uname)->value('id');
            if (! $userId) {
                return response()->json(['message' => 'Petugas "'.$uname.'" tidak ditemukan.'], 422);
            }
        }

        $saring = fn ($q) => $q->whereDate('transactions.created_at', $tanggal)
            ->when($branchId, fn ($qq) => $qq->where('transactions.branch_id', $branchId))
            ->when($userId, fn ($qq) => $qq->where('transactions.user_id', $userId));

        $items = $saring(DB::table('transaction_items')
            ->join('transactions', 'transactions.id', '=', 'transaction_items.transaction_id')
            ->join('products', 'products.id', '=', 'transaction_items.product_id'))
            ->groupBy('products.id', 'products.name', 'products.varian')
            ->selectRaw('products.name, products.varian, SUM(transaction_items.qty) as qty, SUM(transaction_items.qty * transaction_items.price) as total')
            ->orderByDesc('qty')
            ->get()
            ->map(fn ($r) => ['name' => $r->name, 'varian' => $r->varian, 'qty' => (int) $r->qty, 'total' => (int) $r->total]);

        $ringkas = $saring(DB::table('transactions'))
            ->selectRaw('COALESCE(SUM(transactions.total),0) as omset, COUNT(*) as trx')
            ->first();

        // Daftar petugas yang BENAR-BENAR bertransaksi pada tanggal & cabang itu —
        // sengaja dihitung TANPA filter user, supaya pilihan tidak ikut menyusut
        // jadi satu nama begitu sebuah filter dipasang.
        $petugas = DB::table('transactions')
            ->join('users', 'users.id', '=', 'transactions.user_id')
            ->whereDate('transactions.created_at', $tanggal)
            ->when($branchId, fn ($q) => $q->where('transactions.branch_id', $branchId))
            ->groupBy('users.id', 'users.username', 'users.name')
            ->selectRaw('users.username as uname, users.name, COALESCE(SUM(transactions.total),0) as omset, COUNT(*) as trx')
            ->orderByDesc('omset')
            ->get()
            ->map(fn ($u) => ['uname' => $u->uname, 'name' => $u->name, 'omset' => (int) $u->omset, 'trx' => (int) $u->trx]);

        // Audit harga khusus (notula §3): item yang dijual dengan alasan tertulis.
        // Ikut filter tanggal/cabang/petugas yang sama, jadi admin bisa menelusuri
        // "siapa memberi diskon apa, hari itu, dengan alasan apa".
        $hargaKhusus = $saring(DB::table('transaction_items')
            ->join('transactions', 'transactions.id', '=', 'transaction_items.transaction_id')
            ->join('products', 'products.id', '=', 'transaction_items.product_id')
            ->leftJoin('users', 'users.id', '=', 'transactions.user_id'))
            ->whereNotNull('transaction_items.note')
            ->orderByDesc('transaction_items.id')
            ->limit(100)
            ->get([
                'transaction_items.transaction_id as nota',
                'products.name', 'products.varian', 'products.harga as harga_normal',
                'transaction_items.qty', 'transaction_items.price', 'transaction_items.note',
                'users.name as oleh',
            ])
            ->map(fn ($r) => [
                'nota' => $r->nota,
                'produk' => $r->name.' · '.$r->varian,
                'qty' => (int) $r->qty,
                'hargaNormal' => (int) $r->harga_normal,
                'harga' => (int) $r->price,
                'selisih' => (int) $r->harga_normal - (int) $r->price,
                'note' => $r->note,
                'oleh' => $r->oleh,
            ]);

        return response()->json([
            'date' => $tanggal,
            'user' => $uname ?? 'Semua',
            'items' => $items,
            'hargaKhusus' => $hargaKhusus,
            'omset' => (int) $ringkas->omset,
            'trx' => (int) $ringkas->trx,
            'petugas' => $petugas,
        ]);
    }

    public function stockMovements(Request $request)
    {
        // Riwayat mutasi stok SATU BULAN untuk seluruh produk — layar "Riwayat Stok".
        // Menggantikan modal riwayat per-produk yang lama; filter produk dipertahankan
        // supaya tombol "Riwayat" di baris stok tetap bisa menyorot satu barang.
        $this->assertAdmin($request);
        $data = $request->validate([
            'month' => ['required', 'regex:/^\d{4}-\d{2}$/'],  // YYYY-MM
            'type' => ['nullable', Rule::in(['semua', 'masuk', 'keluar'])],
            'branch' => ['nullable', 'string'],
            'product' => ['nullable', 'integer', 'exists:products,id'],
        ]);

        [$th, $bl] = array_map('intval', explode('-', $data['month']));
        $awal = \Illuminate\Support\Carbon::create($th, $bl, 1)->startOfMonth();
        $akhir = (clone $awal)->endOfMonth();

        $cabang = ($data['branch'] ?? 'Semua') !== 'Semua' ? $data['branch'] : null;
        $branchId = $cabang ? Branch::where('name', $cabang)->value('id') : null;
        $jenis = $data['type'] ?? 'semua';

        $dasar = fn () => StockMovement::whereBetween('stock_movements.created_at', [$awal, $akhir])
            ->when($branchId, fn ($q) => $q->where('stock_movements.branch_id', $branchId))
            ->when(! empty($data['product']), fn ($q) => $q->where('stock_movements.product_id', $data['product']));

        // Ringkasan dihitung dari SELURUH baris bulan itu (tidak terpengaruh limit
        // maupun filter jenis) supaya angka masuk/keluar tetap jujur saat daftar dipotong.
        $ringkas = $dasar()
            ->selectRaw("COALESCE(SUM(CASE WHEN type = 'masuk' THEN qty ELSE 0 END),0) as masuk")
            ->selectRaw("COALESCE(SUM(CASE WHEN type = 'keluar' THEN qty ELSE 0 END),0) as keluar")
            ->first();

        $rows = $dasar()
            ->when($jenis !== 'semua', fn ($q) => $q->where('stock_movements.type', $jenis))
            ->with(['product:id,name,varian', 'user:id,name', 'branch:id,name'])
            ->orderByDesc('stock_movements.id')
            ->limit(300)   // pola batas yang sama dengan productMovements
            ->get()
            ->map(fn ($m) => [
                'id' => $m->id,
                'tanggal' => $m->created_at->toDateTimeString(),
                'produk' => $m->product ? $m->product->name.' · '.$m->product->varian : '(produk terhapus)',
                'type' => $m->type,
                'qty' => $m->qty,
                'note' => $m->note,
                'nota' => $m->transaction_id,
                'oleh' => $m->user?->name,
                'cabang' => $m->branch?->name,
            ]);

        return response()->json([
            'month' => $data['month'],
            'rows' => $rows,
            'masuk' => (int) $ringkas->masuk,
            'keluar' => (int) $ringkas->keluar,
        ]);
    }

    public function marketplaceSales(Request $request)
    {
        // Rekap penjualan Marketplace/Shopee satu bulan (notula §5: penjualan
        // marketplace masuk dashboard admin sbg metode bayar tersendiri; integrasi
        // API Shopee ditunda, jadi sumbernya transaksi ber-method 'marketplace').
        $this->assertAdmin($request);
        $data = $request->validate([
            'month' => ['required', 'regex:/^\d{4}-\d{2}$/'],
            'branch' => ['nullable', 'string'],
        ]);

        [$th, $bl] = array_map('intval', explode('-', $data['month']));
        $awal = \Illuminate\Support\Carbon::create($th, $bl, 1)->startOfMonth();
        $akhir = (clone $awal)->endOfMonth();

        $cabang = ($data['branch'] ?? 'Semua') !== 'Semua' ? $data['branch'] : null;
        $branchId = $cabang ? Branch::where('name', $cabang)->value('id') : null;

        $dasar = fn () => Transaction::where('method', 'marketplace')
            ->whereBetween('created_at', [$awal, $akhir])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId));

        // Ringkasan dari SELURUH bulan — tidak terpengaruh batas 200 baris di bawah.
        $ringkas = $dasar()->selectRaw('COALESCE(SUM(total),0) as omset, COUNT(*) as trx')->first();

        $rows = $dasar()
            ->with(['branch:id,name', 'user:id,name', 'items.product:id,name,varian'])
            ->orderByDesc('id')
            ->limit(200)
            ->get()
            ->map(fn ($t) => [
                'id' => $t->id,
                'tanggal' => $t->created_at->toDateTimeString(),
                'total' => $t->total,
                'cabang' => $t->branch?->name,
                'oleh' => $t->user?->name,
                'items' => $t->items->map(fn ($i) => [
                    'nama' => $i->product ? $i->product->name.' · '.$i->product->varian : '(produk terhapus)',
                    'qty' => $i->qty,
                ])->all(),
            ]);

        // Pembanding: total omset SEMUA metode di bulan yang sama, supaya admin tahu
        // porsi marketplace terhadap keseluruhan (bukan angka yang menggantung sendiri).
        $totalSemua = Transaction::whereBetween('created_at', [$awal, $akhir])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->sum('total');

        return response()->json([
            'month' => $data['month'],
            'rows' => $rows,
            'omset' => (int) $ringkas->omset,
            'trx' => (int) $ringkas->trx,
            'omsetSemuaMetode' => (int) $totalSemua,
        ]);
    }

    public function salesByUser(Request $request)
    {
        $this->assertAdmin($request);
        $data = $request->validate(['period' => ['required', Rule::in(['Mingguan', 'Bulanan', 'Tahunan'])]]);

        // Total penjualan per anggota untuk SATU periode (yang sedang dilihat), terurut.
        // FE menggabungkan dengan daftar user (cabang/role) di klien. Baris tanpa user_id
        // (data lama sebelum fitur ini) otomatis tak ikut (inner join).
        $rows = DB::table('transactions')
            ->join('users', 'users.id', '=', 'transactions.user_id')
            ->where('transactions.created_at', '>=', $this->periodStart($data['period']))
            ->groupBy('transactions.user_id', 'users.username')
            ->selectRaw('users.username as uname, SUM(transactions.total) as total, COUNT(*) as trx')
            ->orderByDesc('total')
            ->get();

        return response()->json(['rows' => $rows]);
    }

    public function salesByUserItems(Request $request, string $username)
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'period' => ['required', Rule::in(['Mingguan', 'Bulanan', 'Tahunan'])],
            // gabungan = satu baris per produk (total periode); tanggal = dipecah per hari
            'mode' => ['nullable', Rule::in(['gabungan', 'tanggal'])],
        ]);

        $since = $this->periodStart($data['period']);
        $user = User::where('username', $username)->firstOrFail();

        // rincian produk yang dijual satu anggota pada periode tsb (drill-down, on demand)
        $q = DB::table('transaction_items')
            ->join('transactions', 'transactions.id', '=', 'transaction_items.transaction_id')
            ->join('products', 'products.id', '=', 'transaction_items.product_id')
            ->where('transactions.user_id', $user->id)
            ->where('transactions.created_at', '>=', $since);

        if (($data['mode'] ?? 'gabungan') === 'tanggal') {
            // DATE() dipilih karena ada di MySQL DAN SQLite (tes pakai SQLite) — jangan
            // ditukar ke fungsi tanggal khusus satu dialek.
            // Dibatasi 200 baris terbaru: FE me-render ulang seluruh UI tiap setState,
            // jadi daftar tak terbatas bikin tiap klik terasa berat. Pola batas yang
            // sama dipakai productMovements.
            $items = $q
                ->groupByRaw('DATE(transactions.created_at), products.id, products.name, products.varian')
                ->selectRaw('DATE(transactions.created_at) as tanggal, products.name, products.varian, SUM(transaction_items.qty) as qty, SUM(transaction_items.qty * transaction_items.price) as total')
                ->orderByRaw('DATE(transactions.created_at) DESC')
                ->orderByDesc('qty')
                ->limit(200)
                ->get();
        } else {
            $items = $q
                ->groupBy('products.id', 'products.name', 'products.varian')
                ->selectRaw('products.name, products.varian, SUM(transaction_items.qty) as qty, SUM(transaction_items.qty * transaction_items.price) as total')
                ->orderByDesc('qty')
                ->get();
        }

        return response()->json(['items' => $items]);
    }
}
