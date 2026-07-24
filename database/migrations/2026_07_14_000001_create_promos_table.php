<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Katalog promo/bundle (display + CRUD). Aturan diskon otomatis di
        // keranjang kasir = keputusan terpisah (belum diputuskan, ranah tim kasir).
        Schema::create('promos', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('desc')->default('');
            $table->string('type'); // Bundle | Diskon
            $table->string('value'); // teks bebas: "Hemat Rp40.000", "15%"
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promos');
    }
};
