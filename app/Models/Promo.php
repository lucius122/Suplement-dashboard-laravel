<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $name
 * @property string $desc
 * @property string $type
 * @property string $value
 */
class Promo extends Model
{
    protected $fillable = ['name', 'desc', 'type', 'value'];
}
