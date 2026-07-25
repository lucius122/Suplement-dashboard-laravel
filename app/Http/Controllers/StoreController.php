<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Expense;
use App\Models\Product;
use App\Models\Promo;
use App\Models\Receivable;
use App\Models\Supplier;
use App\Models\Transaction;
use App\Models\TransactionItem;
use App\Models\User;
use App\Services\ImageUploadService;
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
                'id' => $s->id, 'name' => $s->name, 'amount' => $s->amount,
                'due' => $s->due_date->toDateString(), 'paid' => $s->paid,
            ]),
            'promos' => Promo::orderBy('id')->get(['id', 'name', 'desc', 'type', 'value']),
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

        $daily = DB::table('transactions')
            ->whereYear('created_at', $year)
            ->selectRaw('branch_id, DATE(created_at) as d, SUM(total) as total')
            ->groupBy('branch_id', 'd')
            ->get()
            ->groupBy('branch_id');

        $out = [];
        foreach (Branch::all() as $branch) {
            $perMonth = array_fill(1, $lastMonth, 0);
            foreach (($daily[$branch->id] ?? collect()) as $row) {
                $m = (int) substr($row->d, 5, 2);
                if (isset($perMonth[$m])) $perMonth[$m] += (int) $row->total;
            }
            $months = [];
            foreach ($perMonth as $m => $sum) {
                $months[] = ['label' => $monthNames[$m - 1], 'v' => round($sum / 1e6, 2)];
            }
            $out[$branch->name] = ['months' => $months, 'year' => array_sum($perMonth)];
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

    public function expenses(Request $request)
    {
        $this->assertAdmin($request);
        $this->catchUpRecurringExpenses();

        return response()->json([
            'expenses' => Expense::with('branch')->orderByDesc('date')->get()->map(fn ($e) => [
                'id' => $e->id, 'category' => $e->category, 'note' => $e->note,
                'amount' => $e->amount, 'recurring' => $e->is_recurring,
                'dueDay' => $e->due_day, 'date' => $e->date->toDateString(),
                'cabang' => $e->branch->name, 'paid' => $e->paid,
            ]),
        ]);
    }

    private function catchUpRecurringExpenses(): void
    {
        // Biaya rutin (mis. sewa) butuh baris baru tiap bulan tanpa cron/scheduler —
        // begitu admin buka layar Biaya (endpoint ini dipanggil), kita cek tiap
        // (cabang, kategori) rutin apakah sudah punya baris bulan berjalan; kalau
        // belum, digandakan dari baris rutin terakhirnya (nominal ikut yang terbaru,
        // jadi kalau sewa naik, baris baru otomatis pakai nominal barunya).
        // ponytail: cuma "loncat" ke bulan ini, TIDAK mengisi bulan-bulan yang
        // terlewat kalau aplikasi lama tak dibuka — upgrade ke backfill penuh
        // kalau nanti dirasa perlu (skala toko ini kecil, jarang absen berbulan-bulan).
        $today = now();
        $templates = Expense::where('is_recurring', true)
            ->orderByDesc('date')
            ->get()
            ->unique(fn ($e) => $e->branch_id.'|'.$e->category);

        foreach ($templates as $tpl) {
            if ($tpl->date->isSameMonth($today)) {
                continue;
            }

            $day = min($tpl->due_day ?? 1, $today->daysInMonth);
            Expense::create([
                'branch_id' => $tpl->branch_id,
                'category' => $tpl->category,
                'note' => $tpl->note,
                'amount' => $tpl->amount,
                'is_recurring' => true,
                'due_day' => $tpl->due_day,
                'date' => $today->copy()->startOfMonth()->addDays($day - 1),
                'paid' => false,
            ]);
        }
    }

    /* ---------- writes ---------- */

    /* ---------- kasir: simpan transaksi ---------- */

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

    private function assertAdmin(Request $request): void
    {
        abort_unless($request->user()->role === 'Admin', 403, 'Hanya admin yang boleh melakukan ini.');
    }

    public function storeProduct(Request $request)
    {
        // Endpoint ini dipakai oleh KASIR (tambah produk dari layar kasir)
        // maupun ADMIN (tambah produk dari layar Produk & Harga).
        // Kasir hanya bisa menambah produk ke cabangnya sendiri;
        // Admin bisa memilih cabang tujuan via field 'branch'.
        $user    = $request->user();
        $isAdmin = $user->role === 'Admin';

        $data = $request->validate([
            'name'     => ['required', 'string', 'max:120'],
            'varian'   => ['nullable', 'string', 'max:60'],
            'harga'    => ['required', 'integer', 'min:0'],
            'modal'    => ['nullable', 'integer', 'min:0'],
            'stok'     => ['nullable', 'integer', 'min:0'],
            'kategori' => ['required', 'string', 'max:40', Rule::exists('categories', 'name')],
            'branch'   => [$isAdmin ? 'required' : 'nullable', 'string', 'exists:branches,name'],
            'barcode'  => ['nullable', 'string', 'max:60'],
            'exp'      => ['nullable', 'regex:/^\d{4}-\d{2}$/'],  // format YYYY-MM
            'photo'    => ['nullable', 'file', 'mimes:jpeg,png,webp', 'max:5120'],
        ]);

        // Tentukan branch: Admin bisa pilih, Kasir pakai branch akun sendiri
        if ($isAdmin) {
            $branchId = Branch::where('name', $data['branch'])->value('id');
        } else {
            abort_if(! $user->branch_id, 422, 'Akun ini belum dikaitkan ke cabang manapun.');
            $branchId = $user->branch_id;
        }

        // Proses upload foto jika ada
        $photo = null;
        if ($request->hasFile('photo')) {
            try {
                $paths = app(ImageUploadService::class)->upload($request->file('photo'));
                $photo = '/storage/'.$paths['medium'];
            } catch (\InvalidArgumentException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
        }

        $product = Product::create([
            'name'      => trim($data['name']),
            'varian'    => trim($data['varian'] ?? '') ?: '-',
            'harga'     => (int) $data['harga'],
            'modal'     => (int) ($data['modal'] ?? 0),
            'kategori'  => $data['kategori'],
            'stok'      => (int) ($data['stok'] ?? 0),
            'branch_id' => $branchId,
            'barcode'   => $data['barcode'] ?: null,
            'exp'       => $data['exp'] ?: null,
            'photo'     => $photo,
            'custom'    => true,
        ]);

        return response()->json(['ok' => true, 'id' => $product->id]);
    }

    public function restockProduct(Request $request, Product $product)
    {
        // tambah stok (restock) dari layar Manajemen Stok
        $data = $request->validate(['qty' => ['required', 'integer', 'min:1', 'max:100000']]);
        $product->increment('stok', $data['qty']);

        return response()->json(['ok' => true, 'stok' => $product->stok]);
    }

    public function updateUser(Request $request, User $user)
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'username' => ['required', 'string', 'alpha_num', 'max:30', Rule::unique('users', 'username')->ignore($user->id)],
            'password' => ['nullable', 'string', 'min:4'], // kosong = tidak diganti
            'role' => ['required', Rule::in(['Admin', 'Kasir'])],
            'branch' => ['required', 'string', 'exists:branches,name'],
        ]);

        $user->update(array_filter([
            'name' => trim($data['name']),
            'username' => strtolower($data['username']),
            'password' => $data['password'] ?: null,
            'role' => $data['role'],
            'branch_id' => Branch::where('name', $data['branch'])->value('id'),
        ]));

        return response()->json(['ok' => true]);
    }

    public function storeSupplier(Request $request)
    {
        // "Buat Purchase Order" = catat hutang baru ke supplier
        $this->assertAdmin($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'amount' => ['required', 'integer', 'min:1'],
            'due' => ['required', 'date'],
        ]);
        Supplier::create(['name' => trim($data['name']), 'amount' => $data['amount'], 'due_date' => $data['due'], 'paid' => false]);

        return response()->json(['ok' => true]);
    }

    public function paySupplier(Request $request, Supplier $supplier)
    {
        $this->assertAdmin($request);
        $supplier->update(['paid' => true]);

        return response()->json(['ok' => true]);
    }

    public function storePromo(Request $request)
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'desc' => ['nullable', 'string', 'max:150'],
            'type' => ['required', Rule::in(['Bundle', 'Diskon'])],
            'value' => ['required', 'string', 'max:60'],
        ]);
        Promo::create(['name' => trim($data['name']), 'desc' => trim($data['desc'] ?? ''), 'type' => $data['type'], 'value' => trim($data['value'])]);

        return response()->json(['ok' => true]);
    }

    public function deletePromo(Request $request, Promo $promo)
    {
        $this->assertAdmin($request);
        $promo->delete();

        return response()->json(['ok' => true]);
    }

    public function storeExpense(Request $request)
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'category' => ['required', Rule::in(['Sewa', 'Listrik', 'Sampah', 'Plastik', 'Lainnya'])],
            'note' => ['nullable', 'string', 'max:150'],
            'amount' => ['required', 'integer', 'min:1'],
            'branch' => ['required', 'string', 'exists:branches,name'],
            'recurring' => ['required', 'boolean'],
            'dueDay' => [Rule::requiredIf((bool) $request->input('recurring')), 'nullable', 'integer', 'min:1', 'max:31'],
            'date' => [Rule::requiredIf(! $request->input('recurring')), 'nullable', 'date'],
        ]);

        $recurring = $data['recurring'];
        $today = now();
        $date = $recurring
            ? $today->copy()->startOfMonth()->addDays(min((int) $data['dueDay'], $today->daysInMonth) - 1)
            : $data['date'];

        Expense::create([
            'branch_id' => Branch::where('name', $data['branch'])->value('id'),
            'category' => $data['category'],
            'note' => trim($data['note'] ?? '') ?: null,
            'amount' => $data['amount'],
            'is_recurring' => $recurring,
            'due_day' => $recurring ? $data['dueDay'] : null,
            'date' => $date,
            'paid' => ! $recurring, // rutin = tagihan yg belum dibayar; sekali-ini = sudah terjadi/lunas saat itu juga
        ]);

        return response()->json(['ok' => true]);
    }

    public function payExpense(Request $request, Expense $expense)
    {
        $this->assertAdmin($request);
        $expense->update(['paid' => true]);

        return response()->json(['ok' => true]);
    }

    public function deleteExpense(Request $request, Expense $expense)
    {
        $this->assertAdmin($request);
        $expense->delete();

        return response()->json(['ok' => true]);
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
