/* Tes e2e headless: buka /?e2e=1 lalu baca div#results. Boleh dihapus kapan saja. */
(function(){
  window.__errors = window.__errors || [];
  window.addEventListener('error', e => window.__errors.push(e.message));

  const out = [];
  const R = document.createElement('div');
  R.id = 'results';
  document.body.appendChild(R);

  const appEl = () => document.getElementById('app');
  const btn = txt => [...appEl().querySelectorAll('button')].find(b => b.textContent.trim().includes(txt));
  const has = txt => appEl().textContent.includes(txt);
  const step = (name, ok) => out.push((ok ? 'PASS' : 'FAIL') + ' :: ' + name);
  const click = el => el && el.dispatchEvent(new MouseEvent('click', {bubbles:true}));
  const type = (id, val) => { const el = document.getElementById(id); if(!el) return false; el.value = val; el.dispatchEvent(new Event('input', {bubbles:true})); return true; };
  const waitFor = (cond, ms) => new Promise(res => {
    const t0 = Date.now();
    (function poll(){
      let ok = false; try { ok = cond(); } catch(e){}
      if(ok) return res(true);
      if(Date.now() - t0 > (ms||8000)) return res(false);
      setTimeout(poll, 60);
    })();
  });
  const finish = () => {
    if(window.__errors.length) out.push('ERRORS: ' + window.__errors.join(' | '));
    R.textContent = 'RESULTS[' + out.join(' ;; ') + ']END';
  };

  (async function(){
    try {
      step('login screen', await waitFor(() => has('Masuk ke Sistem')));

      if (window.innerWidth < 900) {
        /* ---- alur mobile: kasir login → layar kasir (modul kasir.js) muncul ---- */
        // Bagian kasir dikosongkan untuk tim kasir; yang diuji: login kasir sampai
        // ke layar kasir yang dirender modul kasir.js (placeholder starter).
        type('i-uname', 'kasir'); type('i-pass', 'kasir');
        click(btn('MASUK'));
        step('m: kasir masuk ke layar kasir', await waitFor(() => has('Kasir') && (has('Mulai bangun Kasir di sini') || has('produk termuat dari server'))));
        step('m: runtime kasir terhubung (SS.DB)', await waitFor(() => /\d+ produk termuat/.test(appEl().textContent)));
        step('m: tanpa error js', window.__errors.length === 0);
        finish(); return;
      }

      /* ---- alur desktop: admin ---- */
      type('i-uname', 'admin'); type('i-pass', 'admin');
      click(btn('MASUK'));
      step('login admin (auth beneran)', await waitFor(() => has('Mau ke mana?')));

      click(btn('Buka Dashboard Admin'));
      step('dashboard dari DB', await waitFor(() => has('Pemasukan Hari Ini') && /Rp[\d.]/.test(appEl().textContent)));

      click(btn('Pleburan'));
      step('menu cabang', await waitFor(() => has('Pilih Cabang')));
      click(btn('Semua Cabang'));
      step('agregat semua cabang', await waitFor(() => has('Performa per Cabang')));

      click(btn('Piutang'));
      step('piutang dari DB', await waitFor(() => has('Budi Santoso') && has('Rina Wijaya')));
      const paidBtns = () => [...appEl().querySelectorAll('button')].filter(b => b.textContent.trim() === 'Tandai Lunas').length;
      const n0 = paidBtns();
      if (n0 > 0) {
        click(btn('Tandai Lunas'));
        step('tandai lunas tersimpan', await waitFor(() => has('Tagihan ditandai lunas') && paidBtns() === n0 - 1));
      } else {
        out.push('SKIP :: tandai lunas (semua piutang sudah lunas — reset: php artisan migrate:fresh --seed)');
      }

      click(btn('Manajemen User'));
      step('daftar user dari DB', await waitFor(() => has('Pak Yusuf')));
      click(btn('+ Tambah User Baru'));
      step('form user terbuka', await waitFor(() => has('Tambah User Baru') && !!document.getElementById('i-uname-new')));
      const uname = 'tes' + String(Date.now()).slice(-6);
      type('i-uname-new', 'Tes E2E'); type('i-uuname-new', uname); type('i-upass-new', 'tes123');
      click(btn('SIMPAN USER'));
      step('user baru tersimpan ke DB', await waitFor(() => has('@' + uname)));
      // bersihkan jejak: nonaktifkan user buatan tes (baris terbaru = paling bawah)
      const toggles = [...appEl().querySelectorAll('button')].filter(b => b.textContent.trim() === 'Nonaktifkan');
      click(toggles[toggles.length - 1]);
      step('user tes dinonaktifkan (bersih-bersih)', await waitFor(() => has('Tes E2E dinonaktifkan')));

      click(btn('Laporan Omset'));
      step('laporan omset', await waitFor(() => has('Tren Omset') && has('Perbandingan Cabang')));
      step('penjualan per anggota (peringkat)', await waitFor(() => has('Penjualan per Anggota') && has('Total (') && has('Semua pegawai')));
      const memberRowBtns = () => [...appEl().querySelectorAll('button')].filter(b => (b.title || '').startsWith('detail-@'));
      const nRows = () => memberRowBtns().length;
      const nAll = nRows();
      // drill-down: klik baris anggota → produk yang dia jual
      click(memberRowBtns()[0]);
      step('detail produk anggota terbuka', await waitFor(() => / pcs/.test(appEl().textContent)));
      // dropdown pilih pegawai: buka, cari di dalamnya, pilih 2
      click(btn('Semua pegawai'));
      step('dropdown pegawai terbuka + bisa dicari', await waitFor(() => !!document.getElementById('i-membersearch')));
      const opts = () => [...appEl().querySelectorAll('button')].filter(b => (b.title || '').startsWith('opt-@'));
      type('i-membersearch', 'zzznotexist');
      step('cari di dropdown menyaring (kosong)', await waitFor(() => has('Tidak ada pegawai cocok') && opts().length === 0));
      type('i-membersearch', '');
      step('cari dikosongkan → opsi penuh', await waitFor(() => opts().length >= 2));
      click(opts()[0]); click(opts()[1]);
      step('pilih 2 pegawai → footer terpilih', await waitFor(() => has('2 pegawai terpilih')));
      step('tabel menyusut ke 2 baris terpilih', await waitFor(() => nRows() === 2));
      click(btn('Kosongkan pilihan'));
      step('kosongkan pilihan → daftar penuh lagi', await waitFor(() => nRows() === nAll && !has('terpilih')));
      click(btn('Tahunan'));
      step('ganti periode (tahunan)', await waitFor(() => has('· Tahunan') && nRows() > 0 && /Rp[\d.]/.test(appEl().textContent)));

      click(btn('Manajemen Stok'));
      step('stok terbuka', await waitFor(() => has('Tambah Stok via Scan')));
      click(btn('Kelola Kategori'));
      step('modal kategori terbuka', await waitFor(() => !!document.getElementById('i-newcat')));
      const kat = 'Kat' + String(Date.now()).slice(-5);
      type('i-newcat', kat);
      click(btn('TAMBAH'));
      const delBtnFor = name => [...appEl().querySelectorAll('button')].find(b => b.title === 'hapus-' + name);
      step('kategori baru tersimpan ke DB', await waitFor(() => !!delBtnFor(kat)));
      click(delBtnFor('Protein'));
      step('hapus kategori terpakai diblokir', await waitFor(() => has('masih dipakai')));
      click(delBtnFor(kat));
      step('kategori terhapus dari DB', await waitFor(() => !delBtnFor(kat)));
      click(btn('Tutup'));
      step('chip kategori dari DB', await waitFor(() => btn('Protein') && !appEl().textContent.includes(kat)));

      // tambah produk (admin) — form fungsional, tersimpan ke DB
      click(btn('Produk & Harga'));
      step('layar produk terbuka', await waitFor(() => has('Margin') && btn('+ Tambah Produk')));
      click(btn('+ Tambah Produk'));
      step('form tambah produk terbuka', await waitFor(() => !!document.getElementById('i-pname') && !!document.getElementById('i-pbranch')));
      const pnm = 'Produk E2E ' + String(Date.now()).slice(-5);
      type('i-pname', pnm); type('i-pharga', '99000'); type('i-pstok', '7');
      step('form produk terisi', await waitFor(() => document.getElementById('i-pname').value === pnm));
      click(btn('SIMPAN PRODUK'));
      step('produk baru tersimpan ke DB', await waitFor(() => has(pnm) && has('ditambahkan')));

      // Bagian kasir dikosongkan untuk tim kasir → admin "Buka Kasir" menampilkan
      // layar yang dirender modul kasir.js (placeholder starter), bukan POS penuh.
      click(btn('Ganti Mode / Kasir'));
      step('kembali ke pilihan mode', await waitFor(() => has('Mau ke mana?')));
      click(btn('Buka Kasir'));
      step('layar kasir didelegasikan ke kasir.js', await waitFor(() => has('Kasir') && (has('Mulai bangun Kasir di sini') || has('produk termuat dari server'))));

      step('tanpa error js', window.__errors.length === 0);
    } catch(e) {
      out.push('FAIL :: exception ' + e.message);
    }
    finish();
  })();
})();
