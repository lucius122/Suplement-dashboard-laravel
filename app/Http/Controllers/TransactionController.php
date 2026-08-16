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
            // Kasir boleh menurunkan harga (diskon). Batas atasnya tidak bisa
            // dicek di sini — perlu harga DB — jadi dijaga di PenjualanService.
            'items.*.price'          => ['required', 'integer', 'min:1'],
            'method'                 => ['required', Rule::in(['tunai', 'marketplace', 'tempo'])],
            'cash'                   => ['nullable', 'integer', 'min:0'],
            'customer_name'          => ['required_if:method,tempo', 'nullable', 'string', 'max:100'],
            // due_date tidak dikirim client; PenjualanService memakai +1 bulan.
        ]);

        // Controller berhenti di sini: terima request, validasi, serahkan ke service.
        $trx = $this->penjualan->simpan($data, $user);

        // trx_id dipakai frontend kasir untuk mencetak nomor nota
        return response()->json(['ok' => true, 'trx_id' => $trx->id]);
    }

    public function payReceivable(Request $request, Receivable $receivable)
    {
        $this->assertAdmin($request);

        $request->validate([
            'amount' => ['nullable', 'integer', 'min:1'],
        ]);

        $remaining = max(0, $receivable->amount - $receivable->paid_amount);

        if ($remaining <= 0 || $receivable->paid) {
            return response()->json(['ok' => true, 'paid' => true, 'remaining' => 0]);
        }

        $inputAmount = $request->input('amount');
        $payAmount = ($inputAmount !== null && (int) $inputAmount > 0)
            ? min((int) $inputAmount, $remaining)
            : $remaining;

        $receivable->payments()->create(['amount' => $payAmount]);

        $newPaidAmount = $receivable->paid_amount + $payAmount;
        $isPaid = $newPaidAmount >= $receivable->amount;

        $receivable->update([
            'paid_amount' => $newPaidAmount,
            'paid' => $isPaid,
        ]);

        return response()->json([
            'ok' => true,
            'paid' => $isPaid,
            'paid_amount' => $newPaidAmount,
            'remaining' => max(0, $receivable->amount - $newPaidAmount),
        ]);
    }
}
