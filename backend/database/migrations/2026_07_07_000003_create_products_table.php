<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('varian')->default('-');
            $table->unsignedInteger('harga');
            $table->unsignedInteger('modal')->default(0);
            $table->string('kategori')->default('Protein');
            $table->string('barcode')->nullable();
            $table->string('exp')->nullable(); // 'YYYY-MM'
            $table->unsignedInteger('stok')->default(0);
            $table->foreignId('branch_id')->constrained();
            $table->string('photo')->nullable(); // public path, e.g. /images/pr1.png or /uploads/x.png
            $table->boolean('custom')->default(false); // added from the cashier screen
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
