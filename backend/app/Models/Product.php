<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $name
 * @property string $varian
 * @property int $harga
 * @property int $modal
 * @property string $kategori
 * @property int $stok
 * @property int $branch_id
 * @property string|null $photo
 * @property bool $custom
 * @property-read Branch $branch
 */
class Product extends Model
{
    // 'barcode' & 'exp' sengaja TIDAK fillable: fitur barcode/scan dan kedaluwarsa
    // dihapus Agustus 2026. Kolomnya masih ada di DB tapi tak diisi/dibaca lagi.
    protected $fillable = ['name', 'varian', 'harga', 'modal', 'kategori', 'stok', 'branch_id', 'photo', 'custom'];

    protected $casts = ['custom' => 'boolean'];

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }
}
