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
    Route::get('/sales-by-user', [StoreController::class, 'salesByUser']);
    Route::get('/sales-by-user/{username}/items', [StoreController::class, 'salesByUserItems']);
    Route::post('/transactions', [StoreController::class, 'storeTransaction']);
    Route::post('/receivables/{receivable}/pay', [StoreController::class, 'payReceivable']);
    Route::post('/products', [StoreController::class, 'storeProduct']);
    Route::post('/branches', [StoreController::class, 'storeBranch']);
    Route::post('/categories', [StoreController::class, 'storeCategory']);
    Route::delete('/categories/{category}', [StoreController::class, 'deleteCategory']);
    Route::post('/users', [StoreController::class, 'storeUser']);
    Route::post('/users/{user}/toggle', [StoreController::class, 'toggleUser']);
});
