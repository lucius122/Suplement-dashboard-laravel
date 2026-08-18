<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Buku besar mutasi stok (append-only) — sumber "track record" barang masuk/keluar
 * per produk. Jangan di-update/hapus; stok saat ini tetap di products.stok,
 * tabel ini yang menyimpan sejarahnya.
 *
 * @property int $id
 * @property int $product_id
 * @property int $branch_id
 * @property string $type 'masuk'|'keluar'
 * @property int $qty
 * @property string|null $note
 * @property int|null $transaction_id
 * @property int|null $user_id
 * @property-read Product $product
 * @property-read User|null $user
 */
class StockMovement extends Model
{
    protected $fillable = ['product_id', 'branch_id', 'type', 'qty', 'note', 'transaction_id', 'user_id'];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    // Dipakai layar Riwayat Stok saat cabang "Semua": tiap baris menyebut cabangnya.
    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    /**
     * Satu-satunya jalan mencatat mutasi — memastikan branch_id ikut terisi
     * (kolom denormalisasi, gampang terlupa kalau di-insert manual di tiap pemanggil).
     */
    public static function record(Product $product, string $type, int $qty, ?string $note = null, ?int $userId = null, ?int $transactionId = null): void
    {
        static::create([
            'product_id' => $product->id,
            'branch_id' => $product->branch_id,
            'type' => $type,
            'qty' => $qty,
            'note' => $note,
            'transaction_id' => $transactionId,
            'user_id' => $userId,
        ]);
    }
}
