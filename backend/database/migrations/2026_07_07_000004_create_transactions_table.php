<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained();
            $table->foreignId('user_id')->nullable()->constrained();
            $table->string('method'); // tunai | marketplace | tempo
            $table->unsignedInteger('total');
            $table->unsignedInteger('cash')->nullable();     // tunai: uang diterima
            $table->unsignedInteger('change')->nullable();   // tunai: kembalian
            $table->timestamps();
            $table->index(['branch_id', 'created_at']);
        });

        Schema::create('transaction_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('transaction_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained();
            $table->unsignedInteger('qty');
            $table->unsignedInteger('price'); // harga satuan saat transaksi
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transaction_items');
        Schema::dropIfExists('transactions');
    }
};
