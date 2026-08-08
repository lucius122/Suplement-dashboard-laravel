<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\StockMovement;
use App\Services\ImageUploadService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    /**
     * Master barang dikelompokkan per UKURAN/BERAT, bukan per rasa.
     *
     * Bagian yang bisa dicek mesin: ukuran selalu menyebut angka (2lb, 900gr,
     * 60 tab, 1.3kg) atau satuan eceran tanpa angka (saset). Nama rasa —
     * "Cokelat", "Vanila", "Unflavored" — tidak punya keduanya, jadi tertolak.
     * Ini penjaga kasar, bukan kamus rasa: tujuannya mencegah satu produk
     * dipecah jadi banyak master hanya karena beda rasa.
     */
    private function aturanVarian(): array
    {
        return ['nullable', 'string', 'max:60', function (string $attribute, mixed $value, \Closure $fail) {
            $v = mb_strtolower(trim((string) $value));
            if ($v === '' || $v === '-') {
                return; // kosong = boleh, nanti diisi '-'
            }
            if (preg_match('/\d/', $v)) {
                return; // menyebut angka → ukuran/berat
            }
            if (in_array($v, ['saset', 'sachet', 'renceng', 'botol', 'pcs'], true)) {
                return; // satuan eceran yang wajar tanpa angka
            }
            $fail('Varian harus menyatakan ukuran/berat (mis. 2lb, 900gr, 60 tab, saset) — bukan rasa. Rasa tidak dipisah jadi master barang sendiri.');
        }];
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
            'varian'   => $this->aturanVarian(),
            'harga'    => ['required', 'integer', 'min:0'],
            'modal'    => ['nullable', 'integer', 'min:0'],
            'stok'     => ['nullable', 'integer', 'min:0'],
            'kategori' => ['required', 'string', 'max:40', Rule::exists('categories', 'name')],
            'branch'   => [$isAdmin ? 'required' : 'nullable', 'string', 'exists:branches,name'],
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
            'exp'       => ($data['exp'] ?? null) ?: null,
            'photo'     => $photo,
            'custom'    => true,
        ]);

        if ($product->stok > 0) {
            StockMovement::record($product, 'masuk', $product->stok, 'Stok awal', $request->user()?->id);
        }

        return response()->json(['ok' => true, 'id' => $product->id]);
    }

    public function updateProduct(Request $request, Product $product)
    {
        // Edit master barang — admin saja.
        // 'stok' sengaja TIDAK bisa diedit di sini: setiap perubahan stok wajib
        // lewat restock/penjualan supaya track record mutasi tetap utuh. Kalau
        // stok boleh ditimpa lewat form, riwayatnya langsung bohong.
        // 'branch' juga tidak: memindah produk antar cabang akan memutus kaitan
        // mutasi stok & item transaksi lama yang menempel di cabang asal.
        $this->assertAdmin($request);

        $data = $request->validate([
            'name'     => ['required', 'string', 'max:120'],
            'varian'   => $this->aturanVarian(),
            'harga'    => ['required', 'integer', 'min:0'],
            'modal'    => ['nullable', 'integer', 'min:0'],
            'kategori' => ['required', 'string', 'max:40', Rule::exists('categories', 'name')],
            'exp'      => ['nullable', 'regex:/^\d{4}-\d{2}$/'],
        ]);

        $product->update([
            'name'     => trim($data['name']),
            'varian'   => trim($data['varian'] ?? '') ?: '-',
            'harga'    => (int) $data['harga'],
            'modal'    => (int) ($data['modal'] ?? 0),
            'kategori' => $data['kategori'],
            'exp'      => ($data['exp'] ?? null) ?: null,
        ]);

        return response()->json(['ok' => true]);
    }

    public function restockProduct(Request $request, Product $product)
    {
        // tambah stok (restock) dari layar Manajemen Stok — admin saja: input stok
        // dipusatkan di dashboard admin, kasir hanya boleh melihat sisa stok.
        $this->assertAdmin($request);
        $data = $request->validate(['qty' => ['required', 'integer', 'min:1', 'max:100000']]);
        $product->increment('stok', $data['qty']);
        StockMovement::record($product, 'masuk', $data['qty'], 'Restock', $request->user()?->id);

        return response()->json(['ok' => true, 'stok' => $product->stok]);
    }

    public function productMovements(Request $request, Product $product)
    {
        // "Track record" satu produk: kapan masuk (restock/stok awal) & kapan keluar
        // (penjualan, lengkap dengan id nota). Terbaru dulu, dibatasi 100 baris
        // supaya produk lama yang ramai tidak menarik ribuan baris ke klien.
        $this->assertAdmin($request);

        $rows = StockMovement::with('user')
            ->where('product_id', $product->id)
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(fn ($m) => [
                'id' => $m->id,
                'type' => $m->type,
                'qty' => $m->qty,
                'note' => $m->note,
                'nota' => $m->transaction_id,
                'oleh' => $m->user?->name,
                'tanggal' => $m->created_at->toDateTimeString(),
            ]);

        return response()->json([
            'product' => $product->name.' · '.$product->varian,
            'stok' => $product->stok,
            'movements' => $rows,
        ]);
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
}
