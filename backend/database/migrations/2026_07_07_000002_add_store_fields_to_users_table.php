<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username')->unique()->after('name');
            $table->string('role')->default('Kasir')->after('username'); // Admin | Kasir
            $table->foreignId('branch_id')->nullable()->after('role')->constrained();
            $table->boolean('active')->default(true)->after('branch_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('branch_id');
            $table->dropColumn(['username', 'role', 'active']);
        });
    }
};
