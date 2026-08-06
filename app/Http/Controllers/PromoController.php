<?php

namespace App\Http\Controllers;

use App\Models\Promo;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PromoController extends Controller
{
    public function storePromo(Request $request)
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'desc' => ['nullable', 'string', 'max:150'],
            'type' => ['required', Rule::in(['Bundle', 'Diskon'])],
            'value' => ['required', 'string', 'max:60'],
        ]);
        Promo::create(['name' => trim($data['name']), 'desc' => trim($data['desc'] ?? ''), 'type' => $data['type'], 'value' => trim($data['value'])]);

        return response()->json(['ok' => true]);
    }

    public function deletePromo(Request $request, Promo $promo)
    {
        $this->assertAdmin($request);
        $promo->delete();

        return response()->json(['ok' => true]);
    }
}
