<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Catatan transaksi tempo (notula §5: wajib mencatat identitas pembeli DAN
        // catatan transaksinya). Nullable: piutang lama tidak punya catatan, dan
        // memaksanya jadi wajib di DB akan menolak data yang sudah ada.
        Schema::table('receivables', function (Blueprint $table) {
            $table->string('note', 300)->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('receivables', function (Blueprint $table) {
            $table->dropColumn('note');
        });
    }
};
