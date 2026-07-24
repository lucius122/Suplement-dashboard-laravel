<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\StoreController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('app');
});
Route::get('/login', fn () => redirect('/'))->name('login');

Route::post('/login', [AuthController::class, 'login']);
Route::post('/logout', [AuthController::class, 'logout']);
Route::get('/me', [AuthController::class, 'me']);

Route::middleware('auth')->prefix('api')->group(function () {
    Route::get('/bootstrap', [StoreController::class, 'bootstrap']);
    Route::get('/dashboard', [StoreController::class, 'dashboard']);
    Route::get('/dashboard/yearly', [StoreController::class, 'dashboardYearly']);
    Route::get('/sales-by-user', [StoreController::class, 'salesByUser']);
    Route::get('/sales-by-user/{username}/items', [StoreController::class, 'salesByUserItems']);
    // Route transaksi kasir DIHAPUS — dibangun ulang oleh tim kasir (lihat public/js/kasir.js).
    Route::post('/receivables/{receivable}/pay', [StoreController::class, 'payReceivable']);
    Route::post('/products', [StoreController::class, 'storeProduct']); // tambah produk (admin)
    Route::post('/products/{product}/restock', [StoreController::class, 'restockProduct']);
    Route::patch('/users/{user}', [StoreController::class, 'updateUser']);
    Route::post('/suppliers', [StoreController::class, 'storeSupplier']);
    Route::post('/suppliers/{supplier}/pay', [StoreController::class, 'paySupplier']);
    Route::post('/promos', [StoreController::class, 'storePromo']);
    Route::delete('/promos/{promo}', [StoreController::class, 'deletePromo']);
    Route::get('/expenses', [StoreController::class, 'expenses']);
    Route::post('/expenses', [StoreController::class, 'storeExpense']);
    Route::post('/expenses/{expense}/pay', [StoreController::class, 'payExpense']);
    Route::delete('/expenses/{expense}', [StoreController::class, 'deleteExpense']);
    Route::post('/branches', [StoreController::class, 'storeBranch']);
    Route::post('/categories', [StoreController::class, 'storeCategory']);
    Route::delete('/categories/{category}', [StoreController::class, 'deleteCategory']);
    Route::post('/users', [StoreController::class, 'storeUser']);
    Route::post('/users/{user}/toggle', [StoreController::class, 'toggleUser']);
});
