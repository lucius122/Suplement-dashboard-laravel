<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property int $branch_id
 * @property int|null $user_id
 * @property string $method
 * @property int $total
 * @property int|null $cash
 * @property int|null $change
 * @property \Illuminate\Support\Carbon $created_at
 */
class Transaction extends Model
{
    protected $fillable = ['branch_id', 'user_id', 'method', 'total', 'cash', 'change', 'created_at'];

    public function items()
    {
        return $this->hasMany(TransactionItem::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    // Dipakai rekap Marketplace/Shopee: tiap baris menyebut siapa yang mencatat.
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
