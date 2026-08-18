<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Services\BiayaRutinService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ExpenseController extends Controller
{
    // di-inject otomatis oleh service container Laravel
    public function __construct(private BiayaRutinService $biayaRutin) {}

    public function expenses(Request $request)
    {
        $this->assertAdmin($request);
        $this->biayaRutin->kejarBulanIni();

        return response()->json([
            'expenses' => Expense::with('branch')->orderByDesc('date')->get()->map(fn ($e) => [
                'id' => $e->id, 'category' => $e->category, 'note' => $e->note,
                'amount' => $e->amount, 'recurring' => $e->is_recurring,
                'dueDay' => $e->due_day, 'date' => $e->date->toDateString(),
                'cabang' => $e->branch->name, 'paid' => $e->paid,
            ]),
            'expenseCategories' => ExpenseCategory::orderBy('id')->get(['id', 'name']),
        ]);
    }

    public function storeExpense(Request $request)
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'category' => ['required', 'string', 'max:40', Rule::exists('expense_categories', 'name')],
            'note' => ['nullable', 'string', 'max:150'],
            'amount' => ['required', 'integer', 'min:1'],
            'branch' => ['required', 'string', 'exists:branches,name'],
            'recurring' => ['required', 'boolean'],
            'dueDay' => [Rule::requiredIf((bool) $request->input('recurring')), 'nullable', 'integer', 'min:1', 'max:31'],
            'date' => [Rule::requiredIf(! $request->input('recurring')), 'nullable', 'date'],
        ]);

        $recurring = $data['recurring'];
        $today = now();
        $date = $recurring
            ? $today->copy()->startOfMonth()->addDays(min((int) $data['dueDay'], $today->daysInMonth) - 1)
            : $data['date'];

        Expense::create([
            'branch_id' => Branch::where('name', $data['branch'])->value('id'),
            'category' => $data['category'],
            'note' => trim($data['note'] ?? '') ?: null,
            'amount' => $data['amount'],
            'is_recurring' => $recurring,
            'due_day' => $recurring ? $data['dueDay'] : null,
            'date' => $date,
            'paid' => ! $recurring, // rutin = tagihan yg belum dibayar; sekali-ini = sudah terjadi/lunas saat itu juga
        ]);

        return response()->json(['ok' => true]);
    }

    public function updateExpense(Request $request, Expense $expense)
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'category' => ['required', 'string', 'max:40', Rule::exists('expense_categories', 'name')],
            'note' => ['nullable', 'string', 'max:150'],
            'amount' => ['required', 'integer', 'min:1'],
            'branch' => ['required', 'string', 'exists:branches,name'],
            'recurring' => ['required', 'boolean'],
            'dueDay' => [Rule::requiredIf((bool) $request->input('recurring')), 'nullable', 'integer', 'min:1', 'max:31'],
            'date' => [Rule::requiredIf(! $request->input('recurring')), 'nullable', 'date'],
        ]);

        // Jenis (sekali-ini/rutin) dikunci di form edit FE — recurring yg dikirim selalu
        // sama dengan data lama, jadi 'paid' sengaja TIDAK disentuh di sini (beda dgn
        // storeExpense yg menyimpulkan paid dari recurring saat catatan baru dibuat).
        $recurring = $data['recurring'];
        $today = now();
        $date = $recurring
            ? $today->copy()->startOfMonth()->addDays(min((int) $data['dueDay'], $today->daysInMonth) - 1)
            : $data['date'];

        $expense->update([
            'branch_id' => Branch::where('name', $data['branch'])->value('id'),
            'category' => $data['category'],
            'note' => trim($data['note'] ?? '') ?: null,
            'amount' => $data['amount'],
            'is_recurring' => $recurring,
            'due_day' => $recurring ? $data['dueDay'] : null,
            'date' => $date,
        ]);

        return response()->json(['ok' => true]);
    }

    public function payExpense(Request $request, Expense $expense)
    {
        $this->assertAdmin($request);
        $expense->update(['paid' => true]);

        return response()->json(['ok' => true]);
    }

    public function deleteExpense(Request $request, Expense $expense)
    {
        $this->assertAdmin($request);
        $expense->delete();

        return response()->json(['ok' => true]);
    }

    public function storeExpenseCategory(Request $request)
    {
        $this->assertAdmin($request);
        $data = $request->validate(['name' => ['required', 'string', 'max:40']]);
        $name = trim($data['name']);
        if (ExpenseCategory::whereRaw('LOWER(name) = ?', [strtolower($name)])->exists()) {
            return response()->json(['message' => 'Kategori "'.$name.'" sudah ada'], 422);
        }
        ExpenseCategory::create(['name' => $name]);

        return response()->json(['ok' => true]);
    }

    public function updateExpenseCategory(Request $request, ExpenseCategory $expenseCategory)
    {
        $this->assertAdmin($request);
        $data = $request->validate(['name' => ['required', 'string', 'max:40']]);
        $name = trim($data['name']);
        if (ExpenseCategory::whereRaw('LOWER(name) = ?', [strtolower($name)])->where('id', '!=', $expenseCategory->id)->exists()) {
            return response()->json(['message' => 'Kategori "'.$name.'" sudah ada'], 422);
        }
        // category di tabel expenses cuma string biasa (bukan foreign key) — ikut
        // diganti di sini supaya catatan biaya lama tidak "yatim" dari nama barunya.
        $oldName = $expenseCategory->name;
        $expenseCategory->update(['name' => $name]);
        Expense::where('category', $oldName)->update(['category' => $name]);

        return response()->json(['ok' => true]);
    }

    public function deleteExpenseCategory(Request $request, ExpenseCategory $expenseCategory)
    {
        $this->assertAdmin($request);
        $used = Expense::where('category', $expenseCategory->name)->count();
        if ($used > 0) {
            return response()->json(['message' => 'Kategori "'.$expenseCategory->name.'" masih dipakai '.$used.' catatan biaya'], 422);
        }
        $expenseCategory->delete();

        return response()->json(['ok' => true]);
    }
}
