<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $name
 * @property int $amount
 * @property int $paid_amount
 * @property \Illuminate\Support\Carbon $trx_date
 * @property \Illuminate\Support\Carbon $due_date
 * @property bool $paid
 * @property int $branch_id
 * @property int|null $transaction_id
 * @property-read Branch $branch
 * @property-read \Illuminate\Database\Eloquent\Collection<int, ReceivablePayment> $payments
 */
class Receivable extends Model
{
    protected $fillable = ['name', 'amount', 'paid_amount', 'trx_date', 'due_date', 'paid', 'branch_id', 'transaction_id'];

    protected $casts = [
        'paid' => 'boolean',
        'amount' => 'integer',
        'paid_amount' => 'integer',
        'trx_date' => 'date',
        'due_date' => 'date',
    ];

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function payments()
    {
        return $this->hasMany(ReceivablePayment::class)->orderByDesc('id');
    }

    public function getRemainingAmountAttribute(): int
    {
        return max(0, $this->amount - $this->paid_amount);
    }
}
