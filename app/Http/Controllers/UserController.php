<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function updateUser(Request $request, User $user)
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'username' => ['required', 'string', 'alpha_num', 'max:30', Rule::unique('users', 'username')->ignore($user->id)],
            'password' => ['nullable', 'string', 'min:4'], // kosong = tidak diganti
            'role' => ['required', Rule::in(['Admin', 'Kasir'])],
            'branch' => ['required', 'string', 'exists:branches,name'],
        ]);

        $user->update(array_filter([
            'name' => trim($data['name']),
            'username' => strtolower($data['username']),
            'password' => $data['password'] ?: null,
            'role' => $data['role'],
            'branch_id' => Branch::where('name', $data['branch'])->value('id'),
        ]));

        return response()->json(['ok' => true]);
    }

    public function storeUser(Request $request)
    {
        $this->assertAdmin($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'username' => ['required', 'string', 'alpha_num', 'max:30', 'unique:users,username'],
            'password' => ['required', 'string', 'min:4'],
            'role' => ['required', Rule::in(['Admin', 'Kasir'])],
            'branch' => ['required', 'string', 'exists:branches,name'],
        ]);

        User::create([
            'name' => trim($data['name']),
            'username' => strtolower($data['username']),
            'email' => strtolower($data['username']).'@suplemen.local',
            'password' => $data['password'],
            'role' => $data['role'],
            'branch_id' => Branch::where('name', $data['branch'])->value('id'),
            'active' => true,
        ]);

        return response()->json(['ok' => true]);
    }

    public function toggleUser(Request $request, User $user)
    {
        $this->assertAdmin($request);
        $user->update(['active' => ! $user->active]);

        return response()->json(['ok' => true, 'active' => $user->active]);
    }
}
