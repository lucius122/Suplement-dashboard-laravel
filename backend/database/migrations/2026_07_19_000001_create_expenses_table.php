<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained();
            $table->string('category'); // Sewa | Listrik | Sampah | Plastik | Lainnya (Rule::in di controller)
            $table->string('note')->nullable();
            $table->unsignedInteger('amount');
            $table->boolean('is_recurring')->default(false);
            $table->unsignedTinyInteger('due_day')->nullable(); // 1-31, diisi hanya kalau is_recurring
            $table->date('date'); // tanggal biaya berlaku; kalau rutin = tanggal jatuh tempo bulan itu
            $table->boolean('paid')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
    }
};
