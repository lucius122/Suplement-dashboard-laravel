<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            // branch_id didenormalisasi (ikut pola transaction_items) supaya laporan
            // per-cabang tidak perlu join ke products.
            $table->foreignId('branch_id')->constrained();
            $table->string('type', 10);                 // 'masuk' | 'keluar'
            $table->unsignedInteger('qty');
            $table->string('note')->nullable();          // 'Restock', 'Stok awal', 'Penjualan'
            $table->foreignId('transaction_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            // riwayat selalu dibaca per produk & terbaru dulu
            $table->index(['product_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};
