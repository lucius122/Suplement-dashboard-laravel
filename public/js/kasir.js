/* ============================================================================
 * KASIR (POS) — bagian ini milik tim kasir. Silakan bangun di file ini saja.
 * File admin/dashboard ada di app.js — usahakan TIDAK mengeditnya biar tidak
 * bentrok saat merge di Git.
 * ============================================================================
 *
 * CARA KERJA SINGKAT
 * ------------------
 * app.js menyediakan "runtime bersama" di window.SS. Kamu cukup mendaftarkan
 * satu fungsi yang mengembalikan HTML layar kasir. app.js otomatis memanggilnya
 * saat pengguna berada di layar kasir (setelah login sebagai kasir, atau admin
 * menekan "Buka Kasir").
 *
 *     SS.registerCashier(function (V) {
 *         return `<div> ...HTML layar kasir... </div>`;
 *     });
 *
 * MEMBUAT TOMBOL & INPUT (event)
 * ------------------------------
 * Jangan pakai onclick="..." biasa. Pakai SS.A (klik) dan SS.I (input),
 * sisipkan hasilnya sebagai atribut di dalam tag:
 *
 *     `<button ${SS.A(() => SS.flash('halo'))}>Klik</button>`
 *     `<input ${SS.I(e => SS.setState({ namaField: e.target.value }))}>`
 *
 * MENYIMPAN STATE
 * ---------------
 * Simpan data layar kasir di state bersama lewat SS.setState({...}); membacanya
 * lewat SS.S.namaField. Setiap setState otomatis me-render ulang layar.
 * (mis. SS.setState({ cart: [...] }) lalu baca SS.S.cart)
 * Beri input `id` unik (mis. id="k-cash") agar fokus & kursor tetap saat render.
 *
 * MEMANGGIL BACKEND
 * -----------------
 *     const r = await SS.api('/api/xxx', 'POST', { ... });   // CSRF & error diurus app.js
 * Endpoint transaksi kasir SENGAJA dihapus — kamu yang bikin di Laravel
 * (routes/web.php + StoreController atau controller sendiri). Skema tabel
 * transactions / transaction_items / receivables masih ada dan siap dipakai.
 *
 * DATA & UTIL YANG TERSEDIA DI SS
 * -------------------------------
 *   SS.S           state bersama (baca; ubah via SS.setState)
 *   SS.setState(o) ubah state + render ulang
 *   SS.api(p,m,b)  fetch ke backend (JSON, CSRF otomatis, lempar Error(message))
 *   SS.flash(msg)  tampilkan toast
 *   SS.esc(str)    WAJIB untuk teks dinamis yang masuk HTML (cegah XSS/rusak)
 *   SS.rp(n)       format Rupiah, mis. SS.rp(685000) -> "Rp685.000"
 *   SS.ic(nama,warna,ukuran)  ikon SVG bawaan (mis. 'scan','stok','produk')
 *   SS.DB.products     daftar produk [{id,name,varian,harga,stok,kategori,cabang,photo,...}]
 *   SS.DB.categories   [{id,name}]
 *   SS.USER            user aktif {name, role('admin'|'kasir'), branch}
 *   SS.go('mode'|'settings'|...)  pindah layar; SS.logout()  keluar
 *   V (argumen fungsi) berisi field bersama: isDesktop, isMobile, who, branch,
 *      logout, goModeScreen, openSettings, themeClass, dll.
 *
 * TODO tim kasir (yang tadinya ada, kini dikosongkan untuk dibangun ulang):
 *   [ ] Katalog produk (dari SS.DB.products, filter per cabang SS.USER.branch)
 *   [ ] Keranjang: tambah/kurang qty, hitung total
 *   [ ] Pembayaran: tunai (hitung kembalian) / marketplace / tempo (nama + jatuh tempo)
 *   [ ] Simpan transaksi ke backend (buat endpoint sendiri), potong stok,
 *       tempo -> buat piutang (tabel receivables)
 *   [ ] (opsional) tambah produk dari kasir, scan barcode
 *   [ ] Versi mobile (V.isMobile) — layar sempit
 * ============================================================================ */

(function () {
  if (!window.SS) { console.error('kasir.js: window.SS belum ada — pastikan app.js dimuat lebih dulu.'); return; }

  // Layar awal kasir (placeholder). Ganti isi fungsi ini dengan POS sungguhan.
  SS.registerCashier(function (V) {
    const jml = SS.DB.products.length;
    return `
      <div style="min-height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);">
        <div style="flex:none;height:60px;border-bottom:1px solid var(--divider);display:flex;align-items:center;justify-content:space-between;padding:0 18px;background:var(--panel);">
          <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:17px;">Kasir <span style="color:var(--muted);font-weight:400;font-size:13px;">· ${SS.esc(V.who || '')}</span></div>
          <div style="display:flex;gap:8px;">
            ${V.isAdmin ? `<button ${SS.A(V.goModeScreen)} style="height:38px;padding:0 14px;border-radius:10px;background:var(--goldtint);border:1px solid var(--goldborder);color:var(--gold);font-size:13px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Ganti Mode</button>` : ''}
            <button ${SS.A(V.openSettings)} style="height:38px;padding:0 14px;border-radius:10px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:13px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Pengaturan</button>
            <button ${SS.A(V.logout)} style="height:38px;padding:0 14px;border-radius:10px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:13px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Keluar</button>
          </div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;gap:14px;">
          <div style="width:70px;height:70px;border-radius:20px;background:var(--goldtint);border:1px solid var(--goldborder);display:flex;align-items:center;justify-content:center;">${SS.ic('stok', 'var(--gold)', 34)}</div>
          <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:22px;">Mulai bangun Kasir di sini</div>
          <div style="font-size:14px;color:var(--muted);max-width:460px;line-height:1.6;">Ini titik awal tim kasir. Runtime bersama sudah terhubung — panduan lengkap ada di komentar atas file <b style="color:var(--text2);">public/js/kasir.js</b>.</div>
          <div style="font-size:13px;color:var(--muted);background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:8px 14px;">Uji koneksi data: <b style="color:var(--gold);">${jml}</b> produk termuat dari server.</div>
          <button ${SS.A(() => SS.flash('Runtime kasir siap. Selamat mengerjakan!'))} style="margin-top:4px;height:44px;padding:0 20px;border:none;border-radius:12px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:14px;letter-spacing:.03em;cursor:pointer;">TES TOMBOL (SS.A + SS.flash)</button>
        </div>
      </div>`;
  });
})();
