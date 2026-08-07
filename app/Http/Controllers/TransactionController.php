<?php

namespace App\Http\Controllers;

use App\Models\Receivable;
use App\Services\PenjualanService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TransactionController extends Controller
{
    // di-inject otomatis oleh service container Laravel
    public function __construct(private PenjualanService $penjualan) {}

    public function storeTransaction(Request $request)
    {
        $user = $request->user();
        abort_if(! $user->branch_id, 422, 'Akun ini belum dikaitkan ke cabang manapun.');

        $data = $request->validate([
            'items'                  => ['required', 'array', 'min:1'],
            'items.*.product_id'     => ['required', 'integer', 'exists:products,id'],
            'items.*.qty'            => ['required', 'integer', 'min:1'],
            'items.*.price'          => ['required', 'integer', 'min:0'],
            'method'                 => ['required', Rule::in(['tunai', 'marketplace', 'tempo'])],
            'cash'                   => ['nullable', 'integer', 'min:0'],
            'customer_name'          => ['required_if:method,tempo', 'nullable', 'string', 'max:100'],
            'due_date'               => ['required_if:method,tempo', 'nullable', 'date'],
        ]);

        // Controller berhenti di sini: terima request, validasi, serahkan ke service.
        $this->penjualan->simpan($data, $user);

        return response()->json(['ok' => true]);
    }

    public function payReceivable(Request $request, Receivable $receivable)
    {
        $this->assertAdmin($request);
        $receivable->update(['paid' => true]);

        return response()->json(['ok' => true]);
    }
}
