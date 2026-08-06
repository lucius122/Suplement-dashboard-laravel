<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    private function userPayload(User $user): array
    {
        return [
            'name' => $user->name,
            'role' => strtolower($user->role),
            'branch' => $user->branch?->name ?? 'Pleburan',
        ];
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        // Satu kolom isian menerima username ATAU email — dibedakan dari ada tidaknya
        // "@", jadi kasir tetap bisa login singkat sementara admin boleh pakai email.
        $login = strtolower(trim($data['username']));
        $kolom = str_contains($login, '@') ? 'email' : 'username';

        $user = User::where($kolom, $login)->first();
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => 'Username/email atau password salah.'], 401);
        }
        if (! $user->active) {
            return response()->json(['message' => 'Akun ini sudah dinonaktifkan.'], 403);
        }

        Auth::login($user);
        $request->session()->regenerate();

        return response()->json(['user' => $this->userPayload($user)]);
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    public function me(Request $request)
    {
        $user = $request->user();

        return response()->json(['user' => $user ? $this->userPayload($user) : null]);
    }
}
