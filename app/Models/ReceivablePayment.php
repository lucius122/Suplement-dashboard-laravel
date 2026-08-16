<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property int $receivable_id
 * @property int $amount
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 * @property-read Receivable $receivable
 */
class ReceivablePayment extends Model
{
    protected $fillable = ['receivable_id', 'amount'];

    protected $casts = [
        'amount' => 'integer',
    ];

    public function receivable()
    {
        return $this->belongsTo(Receivable::class);
    }
}
