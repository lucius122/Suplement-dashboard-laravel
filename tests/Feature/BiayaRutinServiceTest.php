<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Expense;
use App\Services\BiayaRutinService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Aturan biaya rutin: tiap (cabang, kategori) rutin harus punya SATU baris per bulan,
 * digandakan dari baris terakhirnya. Dipicu saat layar Biaya dibuka (tanpa cron).
 */
class BiayaRutinServiceTest extends TestCase
{
    use RefreshDatabase;

    private Branch $cabang;

    protected function setUp(): void
    {
        parent::setUp();
        $this->cabang = Branch::create(['name' => 'Uji']);
    }

    private function biayaRutin(string $kategori, int $nominal, string $tanggal, int $dueDay = 25): Expense
    {
        return Expense::create([
            'branch_id' => $this->cabang->id, 'category' => $kategori, 'note' => null,
            'amount' => $nominal, 'is_recurring' => true, 'due_day' => $dueDay,
            'date' => $tanggal, 'paid' => false,
        ]);
    }

    public function test_membuat_baris_bulan_ini_dari_template_bulan_lalu(): void
    {
        $this->biayaRutin('Sewa', 3500000, now()->subMonth()->startOfMonth()->addDays(24)->toDateString());

        $dibuat = app(BiayaRutinService::class)->kejarBulanIni();

        $this->assertSame(1, $dibuat);
        $baru = Expense::where('category', 'Sewa')->whereDate('date', '>=', now()->startOfMonth())->first();
        $this->assertNotNull($baru, 'harus ada baris untuk bulan berjalan');
        $this->assertSame(3500000, (int) $baru->amount);
        $this->assertFalse((bool) $baru->paid, 'baris rutin baru = tagihan yang belum dibayar');
    }

    public function test_tidak_menggandakan_bila_bulan_ini_sudah_ada(): void
    {
        $this->biayaRutin('Sewa', 3500000, now()->startOfMonth()->addDays(24)->toDateString());

        $dibuat = app(BiayaRutinService::class)->kejarBulanIni();

        $this->assertSame(0, $dibuat);
        $this->assertSame(1, Expense::where('category', 'Sewa')->count());
    }

    public function test_memakai_nominal_terbaru_saat_harga_naik(): void
    {
        // sewa naik: baris 2 bulan lalu 3jt, bulan lalu jadi 4jt → yang diikuti 4jt
        $this->biayaRutin('Sewa', 3000000, now()->subMonths(2)->startOfMonth()->addDays(24)->toDateString());
        $this->biayaRutin('Sewa', 4000000, now()->subMonth()->startOfMonth()->addDays(24)->toDateString());

        app(BiayaRutinService::class)->kejarBulanIni();

        $baru = Expense::whereDate('date', '>=', now()->startOfMonth())->first();
        $this->assertSame(4000000, (int) $baru->amount, 'harus ikut nominal terbaru, bukan yang lama');
    }

    public function test_dipanggil_dua_kali_tidak_membuat_baris_dobel(): void
    {
        // Endpoint pemicunya GET — gampang terpanggil berkali-kali (refresh, dua tab).
        $this->biayaRutin('Listrik', 850000, now()->subMonth()->startOfMonth()->addDays(19)->toDateString(), 20);

        $svc = app(BiayaRutinService::class);
        $svc->kejarBulanIni();
        $svc->kejarBulanIni();

        $this->assertSame(
            1,
            Expense::where('category', 'Listrik')->whereDate('date', '>=', now()->startOfMonth())->count(),
            'panggilan kedua tidak boleh menambah baris lagi'
        );
    }

    public function test_hari_jatuh_tempo_dijepit_ke_akhir_bulan_pendek(): void
    {
        // due_day 31 di bulan yang cuma 30 hari tidak boleh bikin tanggal meluber
        $this->biayaRutin('Internet', 500000, now()->subMonth()->startOfMonth()->toDateString(), 31);

        app(BiayaRutinService::class)->kejarBulanIni();

        $baru = Expense::where('category', 'Internet')->whereDate('date', '>=', now()->startOfMonth())->first();
        $this->assertNotNull($baru);
        $this->assertSame(
            now()->startOfMonth()->addDays(min(31, now()->daysInMonth) - 1)->toDateString(),
            $baru->date->toDateString()
        );
        $this->assertTrue($baru->date->isSameMonth(now()), 'tanggal wajib tetap di bulan berjalan');
    }
}
