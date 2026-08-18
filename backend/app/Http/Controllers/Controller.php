<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

abstract class Controller
{
    /**
     * Gerbang aksi khusus admin. Ditaruh di induk karena hampir semua controller
     * turunan memakainya; protected (bukan private seperti dulu di StoreController)
     * supaya bisa dipanggil dari subclass.
     */
    protected function assertAdmin(Request $request): void
    {
        abort_unless($request->user()->role === 'Admin', 403, 'Hanya admin yang boleh melakukan ini.');
    }
}
