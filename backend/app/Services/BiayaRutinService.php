<?php

namespace App\Services;

use App\Models\Expense;
use Illuminate\Support\Facades\Cache;

/**
 * Biaya rutin (mis. sewa) butuh baris baru tiap bulan tanpa cron/scheduler —
 * dikejar saat admin membuka layar Biaya. Aturannya: tiap (cabang, kategori)
 * rutin dicek apakah sudah punya baris bulan berjalan; kalau belum, digandakan
 * dari baris rutin terakhirnya (nominal ikut yang terbaru, jadi kalau sewa naik
 * baris baru otomatis memakai nominal barunya).
 *
 * Dipisah dari controller karena ini aturan bisnis murni (tak butuh Request),
 * gampang diuji sendiri, dan pemicunya kebetulan sebuah endpoint GET.
 */
class BiayaRutinService
{
    /**
     * Kunci lintas-request: endpoint pemicunya GET, jadi dua admin yang membuka
     * layar Biaya bersamaan bisa sama-sama lolos pengecekan "sudah ada baris bulan
     * ini?" lalu sama-sama membuat baris (biaya rutin dobel). Yang kalah lock
     * cukup melewatkan — request lain sudah/sedang mengerjakannya.
     *
     * @return int jumlah baris yang dibuat
     */
    public function kejarBulanIni(): int
    {
        $hasil = Cache::lock('biaya-rutin-catchup', 10)->get(fn () => $this->jalankan());

        return $hasil === false ? 0 : (int) $hasil;
    }

    private function jalankan(): int
    {
        // ponytail: cuma "loncat" ke bulan ini, TIDAK mengisi bulan-bulan yang
        // terlewat kalau aplikasi lama tak dibuka — upgrade ke backfill penuh
        // kalau nanti dirasa perlu (skala toko ini kecil, jarang absen berbulan-bulan).
        $hariIni = now();
        $dibuat = 0;

        $template = Expense::where('is_recurring', true)
            ->orderByDesc('date')
            ->get()
            ->unique(fn ($e) => $e->branch_id.'|'.$e->category);

        foreach ($template as $tpl) {
            if ($tpl->date->isSameMonth($hariIni)) {
                continue;
            }

            $tgl = min($tpl->due_day ?? 1, $hariIni->daysInMonth);
            Expense::create([
                'branch_id'    => $tpl->branch_id,
                'category'     => $tpl->category,
                'note'         => $tpl->note,
                'amount'       => $tpl->amount,
                'is_recurring' => true,
                'due_day'      => $tpl->due_day,
                'date'         => $hariIni->copy()->startOfMonth()->addDays($tgl - 1),
                'paid'         => false,
            ]);
            $dibuat++;
        }

        return $dibuat;
    }
}
