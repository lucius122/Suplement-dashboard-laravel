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
      // tombol mata: password terlihat ↔ tersembunyi
      const eyeBtn = () => [...appEl().querySelectorAll('button')].find(b => b.title === 'lihat-password');
      click(eyeBtn());
      step('tombol mata menampilkan password', await waitFor(() => document.getElementById('i-upass-new')?.type === 'text'));
      click(eyeBtn());
      step('tombol mata menyembunyikan lagi', await waitFor(() => document.getElementById('i-upass-new')?.type === 'password'));
      click(btn('SIMPAN USER'));
      step('user baru tersimpan ke DB', await waitFor(() => has('@' + uname)));
      // edit user buatan tes: ganti nama → tersimpan
      const edits = () => [...appEl().querySelectorAll('button')].filter(b => b.textContent.trim() === 'Edit');
      click(edits()[edits().length - 1]);
      step('form edit user terbuka', await waitFor(() => has('Edit User') && document.getElementById('i-uname-new')?.value === 'Tes E2E'));
      type('i-uname-new', 'Tes E2E Edit');
      click(btn('SIMPAN USER'));
      step('edit user tersimpan ke DB', await waitFor(() => has('Tes E2E Edit') && has('Perubahan user tersimpan')));

      // bersihkan jejak: nonaktifkan user buatan tes (baris terbaru = paling bawah)
      const toggles = [...appEl().querySelectorAll('button')].filter(b => b.textContent.trim() === 'Nonaktifkan');
      click(toggles[toggles.length - 1]);
      step('user tes dinonaktifkan (bersih-bersih)', await waitFor(() => has('dinonaktifkan')));

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
      // dua tombol "Tahunan" di layar Laporan: [0] = Tren Omset (chip periode), terakhir = kartu per-anggota
      const tahunanBtns = () => [...appEl().querySelectorAll('button')].filter(b => b.textContent.trim() === 'Tahunan');
      click(tahunanBtns()[tahunanBtns().length - 1]);
      step('ganti periode anggota (tahunan)', await waitFor(() => has('· Tahunan') && nRows() > 0 && /Rp[\d.]/.test(appEl().textContent)));
      // Tren Omset periode Tahunan: total setahun + bar per bulan (data asli DB)
      click(tahunanBtns()[0]);
      step('tren omset tahunan tampil', await waitFor(() => has('Total Omset (Tahunan)') && has('Jan')));

      // panah pilih tahun: mundur satu tahun, data ikut termuat, hanya tahun itu yang di-cache (bukan semua tahun)
      const prevYearBtn = () => appEl().querySelector('button[title="tahun-sebelumnya"]');
      const nextYearBtn = () => appEl().querySelector('button[title="tahun-berikutnya"]');
      const yearLabel = () => prevYearBtn()?.nextElementSibling?.textContent.trim();
      const y0 = yearLabel();
      click(prevYearBtn());
      step('panah tahun mundur satu tahun', await waitFor(() => yearLabel() === String(parseInt(y0) - 1)));
      // tunggu cache benar-benar terisi (bukan cuma label periode yang berubah sinkron)
      step('grafik tahun sebelumnya termuat', await waitFor(() => window.SS.DB.yearly[String(parseInt(y0) - 1)] !== undefined));
      step('cache hanya berisi tahun yang diklik (tak query semua tahun)', Object.keys(window.SS.DB.yearly).sort().join(',') === [String(parseInt(y0) - 1), y0].sort().join(','));
      click(nextYearBtn());
      step('panah tahun maju balik ke tahun ini', await waitFor(() => yearLabel() === y0));

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

      // stok: restock (+ Stok) → stok bertambah di server
      click(btn('Manajemen Stok'));
      step('kembali ke stok utk restock', await waitFor(() => !!([...appEl().querySelectorAll('button')].find(b => (b.title||'').startsWith('restok-')))));
      const stokCellOf = t => { const m = (t.closest('div[style*="grid"], div[style*="border-radius"]')?.textContent || '').match(/(\d+) pcs/); return m ? parseInt(m[1]) : null; };
      const rbtn = [...appEl().querySelectorAll('button')].find(b => (b.title||'').startsWith('restok-'));
      const stokBefore = stokCellOf(rbtn);
      click(rbtn);
      step('modal tambah stok terbuka', await waitFor(() => !!document.getElementById('i-restockqty')));
      type('i-restockqty', '5');
      click(btn('TAMBAHKAN'));
      step('stok bertambah di server', await waitFor(() => has('Stok ditambah 5 pcs') && appEl().textContent.includes((stokBefore + 5) + ' pcs')));

      // scan barcode: input manual (headless tak punya kamera) → produk ketemu → modal restock
      click(btn('Tambah Stok via Scan'));
      step('modal scan terbuka', await waitFor(() => !!document.getElementById('i-scanmanual')));
      type('i-scanmanual', '8991234500031'); // Creatine Monohydrate (Pleburan)
      click(btn('GUNAKAN'));
      step('barcode dikenali → modal restock produknya', await waitFor(() => !!document.getElementById('i-restockqty') && has('Creatine Monohydrate')));
      click(btn('Batal'));
      step('modal restock ditutup', await waitFor(() => !document.getElementById('i-restockqty')));

      // supplier: buat PO baru lalu tandai lunas
      click(btn('Pembelian'));
      step('layar supplier terbuka', await waitFor(() => has('Total Hutang ke Supplier')));
      click(btn('+ Buat Purchase Order'));
      step('form PO terbuka', await waitFor(() => !!document.getElementById('i-poname')));
      const supNm = 'Supplier E2E ' + String(Date.now()).slice(-5);
      type('i-poname', supNm); type('i-poamount', '1500000');
      const podue = document.getElementById('i-podue'); podue.value = new Date(Date.now() + 7*864e5).toISOString().slice(0,10); podue.dispatchEvent(new Event('input', {bubbles:true}));
      click(btn('SIMPAN PO'));
      step('PO tersimpan ke DB', await waitFor(() => has(supNm) && has('Purchase Order dicatat')));
      const lunasiOf = () => [...appEl().querySelectorAll('button')].filter(b => b.textContent.trim() === 'Lunasi');
      const nLunasi = lunasiOf().length;
      click(lunasiOf()[lunasiOf().length - 1]); // PO terbaru = paling bawah
      step('hutang supplier ditandai lunas', await waitFor(() => has('ditandai lunas') && lunasiOf().length === nLunasi - 1));

      // promo: tambah lalu hapus
      click(btn('Promo & Bundle'));
      step('layar promo terbuka (data DB)', await waitFor(() => has('Paket Pemula')));
      click(btn('+ Buat Promo / Bundle'));
      step('form promo terbuka', await waitFor(() => !!document.getElementById('i-prname')));
      const prNm = 'Promo E2E ' + String(Date.now()).slice(-5);
      type('i-prname', prNm); type('i-prvalue', '10%');
      click(btn('SIMPAN PROMO'));
      step('promo tersimpan ke DB', await waitFor(() => has(prNm) && has('Promo tersimpan')));
      const delPromoBtn = () => [...appEl().querySelectorAll('button')].find(b => b.title === 'hapus-promo-' + prNm);
      click(delPromoBtn());
      step('promo terhapus dari DB', await waitFor(() => has('dihapus') && !delPromoBtn()));

      // biaya operasional: catat sekali-ini, catat rutin (jatuh tempo besok → masuk lonceng), lunasi, hapus
      click(btn('Biaya Operasional'));
      step('layar biaya terbuka', await waitFor(() => has('Biaya Operasional Bulan Ini')));
      click(btn('+ Catat Biaya'));
      step('form biaya terbuka', await waitFor(() => !!document.getElementById('i-bxamount')));
      const bxNote = 'Printilan E2E ' + String(Date.now()).slice(-5);
      type('i-bxnote', bxNote); type('i-bxamount', '25000');
      const bxDateEl = document.getElementById('i-bxdate');
      bxDateEl.value = new Date().toISOString().slice(0,10); bxDateEl.dispatchEvent(new Event('input', {bubbles:true}));
      click(btn('SIMPAN BIAYA'));
      step('biaya sekali-ini tersimpan ke DB', await waitFor(() => has(bxNote) && has('Biaya tercatat')));

      click(btn('+ Catat Biaya'));
      click([...document.querySelectorAll('#app button')].find(b => b.textContent.trim() === 'Rutin Bulanan'));
      step('mode rutin bulanan aktif', await waitFor(() => !!document.getElementById('i-bxdueday')));
      const tomorrowDay = new Date(Date.now() + 864e5).getDate();
      type('i-bxamount', '35000'); // form baru dari newBiaya() reset bxAmount ke '' — wajib diisi ulang tiap form
      type('i-bxdueday', String(tomorrowDay));
      click(btn('SIMPAN BIAYA'));
      step('biaya rutin tersimpan ke DB', await waitFor(() => has('Biaya tercatat') && window.SS.DB.expenses.some(x => x.recurring && x.dueDay === tomorrowDay && x.amount === 35000)));

      // lonceng notifikasi ikut menghitung biaya rutin yang jatuh tempo ≤3 hari
      const bellBtn = () => [...document.querySelectorAll('#app button')].find(b => b.style.position === 'relative' && b.querySelector('svg'));
      click(bellBtn());
      step('lonceng menampilkan biaya rutin', await waitFor(() => has('Biaya:')));
      click(document.querySelector('#app div[style*="position:fixed"][style*="inset:0"]')); // klik scrim → tutup panel lonceng (bellHtml(): style ditulis tanpa spasi setelah ":", innerHTML tak menormalisasinya)
      step('panel lonceng tertutup', await waitFor(() => !has('Notifikasi Jatuh Tempo')));

      click(btn('Biaya Operasional'));
      const lunasiOfBiaya = () => [...document.querySelectorAll('#app button')].filter(b => b.textContent.trim() === 'Lunasi');
      // [0] ambigu: seed nanam recurring due_day 25 (Sewa) & 20 (Listrik) tiap cabang, bisa tabrakan dgn tomorrowDay.
      // Cari baris milik tes sendiri lewat nominal 35.000 (unik, tak dipakai seed manapun) — closest('div') dari tombol
      // naik ke div baris grid (tombol ada di dalam <span>, bukan <div>), textContent baris itu memuat amountText "Rp35.000".
      const myLunasiBtn = () => lunasiOfBiaya().find(b => b.closest('div').textContent.includes('Rp35.000'));
      const nLunasiBefore = lunasiOfBiaya().length;
      click(myLunasiBtn());
      step('biaya rutin ditandai lunas', await waitFor(() => has('ditandai lunas') && lunasiOfBiaya().length === nLunasiBefore - 1));

      const delBiayaBtn = () => [...document.querySelectorAll('#app button')].find(b => b.title.startsWith('hapus-biaya-') && b.closest('div').textContent.includes(bxNote));
      click(delBiayaBtn());
      step('biaya sekali-ini terhapus dari DB', await waitFor(() => has('Biaya dihapus') && !has(bxNote)));

      // tambah produk (admin) — form fungsional, tersimpan ke DB
      click(btn('Produk & Harga'));
      step('layar produk terbuka', await waitFor(() => has('Margin') && btn('+ Tambah Produk')));
      click(btn('+ Tambah Produk'));
      step('form tambah produk terbuka', await waitFor(() => !!document.getElementById('i-pname') && !!document.getElementById('i-pbranch')));
      const pnm = 'Produk E2E ' + String(Date.now()).slice(-5);
      type('i-pname', pnm); type('i-pharga', '99000'); type('i-pstok', '7');
      step('form produk terisi', await waitFor(() => document.getElementById('i-pname').value === pnm));
      // scan dari form produk: form disembunyikan → modal scan → kode terdeteksi →
      // kembali ke form dengan barcode terisi & isian lain masih utuh
      const scanBtnInForm = [...appEl().querySelectorAll('button')].find(b => b.closest('div')?.querySelector('#i-pbarcode'));
      click(scanBtnInForm);
      step('scan dibuka, form produk minggir', await waitFor(() => !!document.getElementById('i-scanmanual') && !document.getElementById('i-pname')));
      type('i-scanmanual', '1234567890123');
      click(btn('GUNAKAN'));
      step('kembali ke form + barcode terisi', await waitFor(() => document.getElementById('i-pbarcode')?.value === '1234567890123' && document.getElementById('i-pname')?.value === pnm));
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
