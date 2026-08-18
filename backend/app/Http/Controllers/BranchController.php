<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Expense;
use App\Models\Product;
use App\Models\Receivable;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Http\Request;

class BranchController extends Controller
{
    public function storeBranch(Request $request)
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
        ]);
        $name = trim($data['name']);
        if (strcasecmp($name, 'Semua') === 0 || Branch::whereRaw('LOWER(name) = ?', [strtolower($name)])->exists()) {
            return response()->json(['message' => "Cabang \"{$name}\" sudah ada"], 422);
        }
        Branch::create(['name' => $name]);

        return response()->json(['ok' => true]);
    }

    public function updateBranch(Request $request, Branch $branch)
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
        ]);
        $name = trim($data['name']);
        if (strcasecmp($name, 'Semua') === 0 || Branch::whereRaw('LOWER(name) = ?', [strtolower($name)])->where('id', '!=', $branch->id)->exists()) {
            return response()->json(['message' => "Cabang \"{$name}\" sudah ada"], 422);
        }
        // branch_id di semua tabel terkait adalah foreign key (bukan string spt kategori
        // biaya), jadi rename di sini otomatis "terlihat" di mana pun tanpa cascade manual.
        $branch->update(['name' => $name]);

        return response()->json(['ok' => true]);
    }

    public function deleteBranch(Request $request, Branch $branch)
    {
        $this->assertAdmin($request);
        $used = Product::where('branch_id', $branch->id)->exists()
            || User::where('branch_id', $branch->id)->exists()
            || Transaction::where('branch_id', $branch->id)->exists()
            || Receivable::where('branch_id', $branch->id)->exists()
            || Expense::where('branch_id', $branch->id)->exists();
        if ($used) {
            return response()->json(['message' => 'Cabang "'.$branch->name.'" masih punya data terkait (produk/user/transaksi/piutang/biaya), tidak bisa dihapus'], 422);
        }
        $branch->delete();

        return response()->json(['ok' => true]);
    }
}
