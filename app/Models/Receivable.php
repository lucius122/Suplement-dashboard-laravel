<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $name
 * @property int $amount
 * @property \Illuminate\Support\Carbon $trx_date
 * @property \Illuminate\Support\Carbon $due_date
 * @property bool $paid
 * @property int $branch_id
 * @property int|null $transaction_id
 * @property-read Branch $branch
 */
class Receivable extends Model
{
    protected $fillable = ['name', 'amount', 'trx_date', 'due_date', 'paid', 'branch_id', 'transaction_id'];

    protected $casts = ['paid' => 'boolean', 'trx_date' => 'date', 'due_date' => 'date'];

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }
}
