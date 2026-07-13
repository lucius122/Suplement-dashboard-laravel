<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $name
 * @property int $amount
 * @property \Illuminate\Support\Carbon $due_date
 * @property bool $paid
 */
class Supplier extends Model
{
    protected $fillable = ['name', 'amount', 'due_date', 'paid'];

    protected $casts = ['paid' => 'boolean', 'due_date' => 'date'];
}
