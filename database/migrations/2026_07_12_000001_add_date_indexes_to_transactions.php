<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Query dashboard memfilter tanggal lintas cabang; index (branch_id, created_at)
        // yang lama tidak terpakai untuk filter tanggal saja.
        Schema::table('transactions', function (Blueprint $table) {
            $table->index('created_at');
        });
        Schema::table('transaction_items', function (Blueprint $table) {
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropIndex(['created_at']);
        });
        Schema::table('transaction_items', function (Blueprint $table) {
            $table->dropIndex(['created_at']);
        });
    }
};
