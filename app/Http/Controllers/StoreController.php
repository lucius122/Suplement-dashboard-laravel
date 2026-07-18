<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\Receivable;
use App\Models\Supplier;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class StoreController extends Controller
{
    /* ---------- reads ---------- */

    public function bootstrap()
    {
        return response()->json([
            'branches' => Branch::orderBy('id')->pluck('name'),
            'categories' => Category::orderBy('id')->get(['id', 'name']),
            'products' => Product::with('branch')->orderBy('id')->get()->map(fn ($p) => [
                'id' => $p->id, 'name' => $p->name, 'varian' => $p->varian,
                'harga' => $p->harga, 'modal' => $p->modal, 'kategori' => $p->kategori,
                'barcode' => $p->barcode, 'exp' => $p->exp, 'stok' => $p->stok,
                'cabang' => $p->branch->name, 'photo' => $p->photo, 'custom' => $p->custom,
            ]),
            'receivables' => Receivable::with('branch')->orderBy('id')->get()->map(fn ($r) => [
                'id' => $r->id, 'name' => $r->name, 'amount' => $r->amount,
                'trx' => $r->trx_date->toDateString(), 'due' => $r->due_date->toDateString(),
                'cabang' => $r->branch->name, 'paid' => $r->paid,
            ]),
            'users' => User::with('branch')->orderBy('id')->get()->map(fn ($u) => [
                'id' => $u->id, 'name' => $u->name, 'uname' => $u->username,
                'role' => $u->role, 'cabang' => $u->branch?->name ?? '-', 'active' => $u->active,
            ]),
            'suppliers' => Supplier::orderBy('id')->get()->map(fn ($s) => [
                'name' => $s->name, 'amount' => $s->amount,
                'due' => $s->due_date->toDateString(), 'paid' => $s->paid,
            ]),
        ]);
    }

    public function dashboard()
    {
        // Semua agregasi di SQL (bukan menarik baris mentah ke PHP) —
        // tetap ~100ms walau ratusan ribu transaksi.
        $dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
        $todayKey = now()->toDateString();
        $yesterdayKey = now()->subDay()->toDateString();

        // total + jumlah transaksi per cabang/hari/metode, 2 hari terakhir
        $byMethod = DB::table('transactions')
            ->where('created_at', '>=', now()->subDay()->startOfDay())
            ->selectRaw('branch_id, DATE(created_at) as d, method, SUM(total) as total, COUNT(*) as trx')
            ->groupBy('branch_id', 'd', 'method')
            ->get();

        // total per cabang/hari, 7 hari terakhir (grafik mingguan)
        $daily = DB::table('transactions')
            ->where('created_at', '>=', now()->subDays(6)->startOfDay())
            ->selectRaw('branch_id, DATE(created_at) as d, SUM(total) as total')
            ->groupBy('branch_id', 'd')
            ->get()
            ->groupBy('branch_id');

        // produk terlaris 30 hari per cabang: agregasi dulu di satu tabel
        // (pakai ti_report_idx), baru join nama produk pada hasil kecilnya
        $agg = DB::table('transaction_items')
            ->where('created_at', '>=', now()->subDays(30))
            ->selectRaw('branch_id, product_id, SUM(qty) as sold')
            ->groupBy('branch_id', 'product_id');
        $tops = DB::table('products')
            ->joinSub($agg, 'agg', 'agg.product_id', '=', 'products.id')
            ->selectRaw('agg.branch_id, products.name as name, SUM(agg.sold) as sold')
            ->groupBy('agg.branch_id', 'products.name')
            ->get()
            ->groupBy('branch_id');

        $out = [];
        foreach (Branch::all() as $branch) {
            $bm = $byMethod->where('branch_id', $branch->id);
            $todayRows = $bm->where('d', $todayKey);
            $todayTotal = (int) $todayRows->sum('total');
            $yesterdayTotal = (int) $bm->where('d', $yesterdayKey)->sum('total');

            $trend = '';
            if ($yesterdayTotal > 0) {
                $pct = (int) round(($todayTotal - $yesterdayTotal) / $yesterdayTotal * 100);
                $trend = ($pct >= 0 ? '+' : '').$pct.'%';
            } elseif ($todayTotal > 0) {
                $trend = '+100%';
            }

            $bd = ($daily[$branch->id] ?? collect())->keyBy('d');
            $week = [];
            for ($d = 6; $d >= 0; $d--) {
                $day = now()->subDays($d);
                $sum = (int) ($bd->get($day->toDateString())->total ?? 0);
                $week[] = ['label' => $dayNames[$day->dayOfWeek], 'v' => round($sum / 1e6, 2)];
            }

            $top = ($tops[$branch->id] ?? collect())
                ->sortByDesc('sold')->take(4)->values()
                ->map(fn ($t) => ['name' => $t->name, 'sold' => (int) $t->sold]);

            $out[$branch->name] = [
                'today' => $todayTotal,
                'trend' => $trend,
                'tunai' => (int) $todayRows->where('method', 'tunai')->sum('total'),
                'market' => (int) $todayRows->where('method', 'marketplace')->sum('total'),
                'tempo' => (int) $todayRows->where('method', 'tempo')->sum('total'),
                // per-cabang supaya index (branch_id, created_at) terpakai penuh
                'month' => (int) Transaction::where('branch_id', $branch->id)
                    ->where('created_at', '>=', now()->startOfMonth())->sum('total'),
                'trx' => (int) $todayRows->sum('trx'),
                'week' => $week,
                'top' => $top,
            ];
        }

        return response()->json($out);
    }

    private function periodStart(string $period): \Illuminate\Support\Carbon
    {
        return match ($period) {
            'Mingguan' => now()->subDays(6)->startOfDay(),
            'Bulanan' => now()->startOfMonth(),
            default => now()->startOfYear(),
        };
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
        $data = $request->validate(['period' => ['required', Rule::in(['Mingguan', 'Bulanan', 'Tahunan'])]]);

        $since = $this->periodStart($data['period']);
        $user = User::where('username', $username)->firstOrFail();

        // rincian produk yang dijual satu anggota pada periode tsb (drill-down, on demand)
        $items = DB::table('transaction_items')
            ->join('transactions', 'transactions.id', '=', 'transaction_items.transaction_id')
            ->join('products', 'products.id', '=', 'transaction_items.product_id')
            ->where('transactions.user_id', $user->id)
            ->where('transactions.created_at', '>=', $since)
            ->groupBy('products.id', 'products.name', 'products.varian')
            ->selectRaw('products.name, products.varian, SUM(transaction_items.qty) as qty, SUM(transaction_items.qty * transaction_items.price) as total')
            ->orderByDesc('qty')
            ->get();

        return response()->json(['items' => $items]);
    }

    /* ---------- writes ---------- */

    // ============================================================
    // BAGIAN KASIR — DIKOSONGKAN untuk dikerjakan tim kasir.
    // Endpoint simpan penjualan (POST /api/transactions) & tambah produk
    // (POST /api/products) beserta logika potong stok + tempo→piutang
    // DIHAPUS. Silakan bangun ulang di sini (atau controller sendiri).
    // Kontrak yang diandalkan frontend kasir ada di public/js/kasir.js.
    // Skema tabel transactions/transaction_items/receivables masih ada.
    // ============================================================

    public function payReceivable(Request $request, Receivable $receivable)
    {
        $this->assertAdmin($request);
        $receivable->update(['paid' => true]);

        return response()->json(['ok' => true]);
    }

    private function assertAdmin(Request $request): void
    {
        abort_unless($request->user()->role === 'Admin', 403, 'Hanya admin yang boleh melakukan ini.');
    }

    public function storeProduct(Request $request)
    {
        // Tambah produk dari layar admin "Produk & Harga" (bukan bagian kasir).
        $this->assertAdmin($request);
        $data = $request->validate([
            'name'     => ['required', 'string', 'max:120'],
            'varian'   => ['nullable', 'string', 'max:60'],
            'harga'    => ['required', 'integer', 'min:1'],
            'modal'    => ['nullable', 'integer', 'min:0'],
            'stok'     => ['nullable', 'integer', 'min:0'],
            'kategori' => ['required', Rule::exists('categories', 'name')],
            'branch'   => ['required', 'string', 'exists:branches,name'],
            'barcode'  => ['nullable', 'string', 'max:60'],
            'exp'      => ['nullable', 'regex:/^\d{4}-\d{2}$/'],  // format YYYY-MM
        ]);

        $product = Product::create([
            'name'      => trim($data['name']),
            'varian'    => trim($data['varian'] ?? '') ?: '-',
            'harga'     => $data['harga'],
            'modal'     => $data['modal'] ?? 0,
            'kategori'  => $data['kategori'],
            'stok'      => $data['stok'] ?? 0,
            'branch_id' => Branch::where('name', $data['branch'])->value('id'),
            'barcode'   => $data['barcode'] ?? null,
            'exp'       => $data['exp'] ?? null,
            'custom'    => true,
        ]);

        return response()->json(['ok' => true, 'id' => $product->id]);
    }

    public function storeBranch(Request $request)
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
        ]);
        $name = trim($data['name']);
        if (strcasecmp($name, 'Semua') === 0 || Branch::whereRaw('LOWER(name) = ?', [strtolower($name)])->exists()) {
            return response()->json(['message' => "Cabang \"{$name}\" sudah ada"], 422);
        }
        Branch::create(['name' => $name]);

        return response()->json(['ok' => true]);
    }

    public function storeCategory(Request $request)
    {
        $this->assertAdmin($request);
        $data = $request->validate(['name' => ['required', 'string', 'max:40']]);
        $name = trim($data['name']);
        if (Category::whereRaw('LOWER(name) = ?', [strtolower($name)])->exists()) {
            return response()->json(['message' => 'Kategori "'.$name.'" sudah ada'], 422);
        }
        Category::create(['name' => $name]);

        return response()->json(['ok' => true]);
    }

    public function deleteCategory(Request $request, Category $category)
    {
        $this->assertAdmin($request);
        $used = Product::where('kategori', $category->name)->count();
        if ($used > 0) {
            return response()->json(['message' => 'Kategori "'.$category->name.'" masih dipakai '.$used.' produk'], 422);
        }
        $category->delete();

        return response()->json(['ok' => true]);
    }

    public function storeUser(Request $request)
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'username' => ['required', 'string', 'alpha_num', 'max:30', 'unique:users,username'],
            'password' => ['required', 'string', 'min:4'],
            'role' => ['required', Rule::in(['Admin', 'Kasir'])],
            'branch' => ['required', 'string', 'exists:branches,name'],
        ]);

        User::create([
            'name' => trim($data['name']),
            'username' => strtolower($data['username']),
            'email' => strtolower($data['username']).'@suplemen.local',
            'password' => $data['password'],
            'role' => $data['role'],
            'branch_id' => Branch::where('name', $data['branch'])->value('id'),
            'active' => true,
        ]);

        return response()->json(['ok' => true]);
    }

    public function toggleUser(Request $request, User $user)
    {
        $this->assertAdmin($request);
        $user->update(['active' => ! $user->active]);

        return response()->json(['ok' => true, 'active' => $user->active]);
    }
}
