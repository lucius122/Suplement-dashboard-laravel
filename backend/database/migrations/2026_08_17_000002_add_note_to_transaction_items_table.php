<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Alasan harga khusus / diskon per item (notula §3: kolom catatan wajib di
        // setiap transaksi harga khusus). Kasir sudah mewajibkannya di layar, tapi
        // sebelum ini alasannya hanya hidup di keranjang dan hilang saat disimpan —
        // jadi admin tidak pernah bisa mengaudit kenapa harga diturunkan.
        Schema::table('transaction_items', function (Blueprint $table) {
            $table->string('note', 200)->nullable()->after('price');
        });
    }

    public function down(): void
    {
        Schema::table('transaction_items', function (Blueprint $table) {
            $table->dropColumn('note');
        });
    }
};
