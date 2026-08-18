<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property int $transaction_id
 * @property int $product_id
 * @property int $qty
 * @property int $price
 */
class TransactionItem extends Model
{
    protected $fillable = ['transaction_id', 'product_id', 'branch_id', 'qty', 'price', 'note', 'created_at'];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}
