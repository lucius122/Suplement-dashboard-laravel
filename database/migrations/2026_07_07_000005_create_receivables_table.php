<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('receivables', function (Blueprint $table) {
            $table->id();
            $table->string('name'); // nama pembeli
            $table->unsignedInteger('amount');
            $table->date('trx_date');
            $table->date('due_date');
            $table->boolean('paid')->default(false);
            $table->foreignId('branch_id')->constrained();
            $table->foreignId('transaction_id')->nullable()->constrained();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('receivables');
    }
};
