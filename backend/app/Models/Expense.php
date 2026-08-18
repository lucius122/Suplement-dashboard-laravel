<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property int $branch_id
 * @property string $category
 * @property string|null $note
 * @property int $amount
 * @property bool $is_recurring
 * @property int|null $due_day
 * @property \Illuminate\Support\Carbon $date
 * @property bool $paid
 * @property-read Branch $branch
 */
class Expense extends Model
{
    protected $fillable = ['branch_id', 'category', 'note', 'amount', 'is_recurring', 'due_day', 'date', 'paid'];

    protected $casts = ['is_recurring' => 'boolean', 'paid' => 'boolean', 'date' => 'date'];

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }
}
