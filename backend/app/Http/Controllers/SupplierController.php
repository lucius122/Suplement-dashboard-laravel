<?php

namespace App\Http\Controllers;

use App\Models\Supplier;
use Illuminate\Http\Request;

class SupplierController extends Controller
{
    public function storeSupplier(Request $request)
    {
        // "Buat Purchase Order" = catat hutang baru ke supplier
        $this->assertAdmin($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'amount' => ['required', 'integer', 'min:1'],
            'due' => ['required', 'date'],
        ]);
        Supplier::create(['name' => trim($data['name']), 'amount' => $data['amount'], 'due_date' => $data['due'], 'paid' => false]);

        return response()->json(['ok' => true]);
    }

    public function paySupplier(Request $request, Supplier $supplier)
    {
        $this->assertAdmin($request);
        $supplier->update(['paid' => true]);

        return response()->json(['ok' => true]);
    }
}
