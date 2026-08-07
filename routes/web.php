<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BranchController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ExpenseController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\TransactionController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('app');
});
Route::get('/login', fn () => redirect('/'))->name('login');

Route::post('/login', [AuthController::class, 'login']);
Route::post('/logout', [AuthController::class, 'logout']);
Route::get('/me', [AuthController::class, 'me']);

// URL sengaja TIDAK berubah saat controller dipecah — frontend (app.js/kasir.js)
// memanggil path ini, bukan nama controller. Dikelompokkan per layar admin.
Route::middleware('auth')->prefix('api')->group(function () {
    // Dashboard & Laporan Omset
    Route::get('/bootstrap', [DashboardController::class, 'bootstrap']);
    Route::get('/dashboard', [DashboardController::class, 'dashboard']);
    Route::get('/dashboard/yearly', [DashboardController::class, 'dashboardYearly']);
    Route::get('/sales-by-date', [DashboardController::class, 'salesByDate']);
    Route::get('/sales-by-user', [DashboardController::class, 'salesByUser']);
    Route::get('/sales-by-user/{username}/items', [DashboardController::class, 'salesByUserItems']);

    // Kasir: simpan transaksi & pelunasan piutang
    Route::post('/transactions', [TransactionController::class, 'storeTransaction']);
    Route::post('/receivables/{receivable}/pay', [TransactionController::class, 'payReceivable']);

    // Produk, Stok & Kategori Produk
    Route::post('/products', [ProductController::class, 'storeProduct']); // tambah produk (admin)
    Route::post('/products/{product}/restock', [ProductController::class, 'restockProduct']);
    Route::get('/products/{product}/movements', [ProductController::class, 'productMovements']);
    Route::post('/categories', [ProductController::class, 'storeCategory']);
    Route::delete('/categories/{category}', [ProductController::class, 'deleteCategory']);

    // Biaya Operasional & Kategori Biaya
    Route::get('/expenses', [ExpenseController::class, 'expenses']);
    Route::post('/expenses', [ExpenseController::class, 'storeExpense']);
    Route::patch('/expenses/{expense}', [ExpenseController::class, 'updateExpense']);
    Route::post('/expenses/{expense}/pay', [ExpenseController::class, 'payExpense']);
    Route::delete('/expenses/{expense}', [ExpenseController::class, 'deleteExpense']);
    Route::post('/expense-categories', [ExpenseController::class, 'storeExpenseCategory']);
    Route::patch('/expense-categories/{expenseCategory}', [ExpenseController::class, 'updateExpenseCategory']);
    Route::delete('/expense-categories/{expenseCategory}', [ExpenseController::class, 'deleteExpenseCategory']);

    // Pembelian (hutang supplier)
    Route::post('/suppliers', [SupplierController::class, 'storeSupplier']);
    Route::post('/suppliers/{supplier}/pay', [SupplierController::class, 'paySupplier']);

    // Manajemen User
    Route::post('/users', [UserController::class, 'storeUser']);
    Route::patch('/users/{user}', [UserController::class, 'updateUser']);
    Route::post('/users/{user}/toggle', [UserController::class, 'toggleUser']);

    // Kelola Cabang
    Route::post('/branches', [BranchController::class, 'storeBranch']);
    Route::patch('/branches/{branch}', [BranchController::class, 'updateBranch']);
    Route::delete('/branches/{branch}', [BranchController::class, 'deleteBranch']);
});
