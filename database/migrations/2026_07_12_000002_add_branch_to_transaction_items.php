<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Denormalisasi branch_id ke item supaya laporan "produk terlaris" cukup
        // satu range-scan di satu tabel (tanpa join 100rb+ baris). Index komposit
        // di bawah bersifat covering untuk query tersebut.
        Schema::table('transaction_items', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->after('product_id')->constrained();
            $table->index(['created_at', 'branch_id', 'product_id', 'qty'], 'ti_report_idx');
            $table->dropIndex(['created_at']); // tercakup oleh ti_report_idx
        });

        DB::statement('UPDATE transaction_items i
            JOIN transactions t ON t.id = i.transaction_id
            SET i.branch_id = t.branch_id');
    }

    public function down(): void
    {
        Schema::table('transaction_items', function (Blueprint $table) {
            $table->index('created_at');
            $table->dropIndex('ti_report_idx');
            $table->dropConstrainedForeignId('branch_id');
        });
    }
};
