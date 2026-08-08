/* Tes e2e headless: buka /?e2e=1 lalu baca div#results. Boleh dihapus kapan saja. */
(function(){
  window.__errors = window.__errors || [];
  // Error JS diteruskan ke <title> juga: kalau skrip menggantung sebelum finish(),
  // RESULTS[] tak pernah ditulis — judul halaman jadi satu-satunya jejak di --dump-dom.
  window.addEventListener('error', e => { window.__errors.push(e.message); document.title = 'JSERR: ' + window.__errors.join(' | '); });
  window.addEventListener('unhandledrejection', e => { window.__errors.push('unhandledrejection: ' + (e.reason && e.reason.message || e.reason)); document.title = 'JSERR: ' + window.__errors.join(' | '); });

  const out = [];
  const R = document.createElement('div');
  R.id = 'results';
  document.body.appendChild(R);

  const appEl = () => document.getElementById('app');
  const btn = txt => [...appEl().querySelectorAll('button')].find(b => b.textContent.trim().includes(txt));
  const has = txt => appEl().textContent.includes(txt);
  // tiap langkah langsung di-flush ke DOM (PROGRESS[...]) supaya kalau skrip
  // menggantung di tengah, masih ketahuan langkah terakhir yang berhasil.
  // finish() nanti menimpanya dengan RESULTS[...]END sbg penanda selesai.
  const step = (name, ok) => { out.push((ok ? 'PASS' : 'FAIL') + ' :: ' + name); R.textContent = 'PROGRESS[' + out.join(' ;; ') + ']'; };
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
      // 20s (bukan 8s default): ini render PERTAMA setelah halaman dimuat — saat paling
      // lambat (parse app.js + cek sesi /me), gampang lewat batas di mesin yang sibuk.
      step('login screen', await waitFor(() => has('Masuk ke Sistem'), 20000));

      if (window.innerWidth < 900) {
        /* ---- alur mobile: kasir login → layar kasir (modul kasir.js) muncul ---- */
        // Bagian kasir dikosongkan untuk tim kasir; yang diuji: login kasir sampai
        // ke layar kasir yang dirender modul kasir.js (placeholder starter).
        type('i-uname', 'kasir'); type('i-pass', 'kasir');
        click(btn('MASUK'));
        // Diuji terhadap UI kasir yang SUNGGUHAN (kasir.js milik tim kasir), bukan
        // teks placeholder starter yang sudah lama tidak dipakai lagi.
        // 20s: login + loadAll (bootstrap & dashboard) baru lalu kasir.js merender —
        // rantai ini kerap >8s di headless, padahal layarnya benar (langkah SS.DB di bawah lolos).
        step('m: kasir masuk ke layar kasir', await waitFor(() => has('Kasir') && has('Keranjang'), 20000));
        step('m: runtime kasir terhubung (SS.DB)', await waitFor(() => (window.SS?.DB?.products || []).length > 0));

        /* ---- penjualan sungguhan lewat UI kasir (inti POS) ----
           Sampai ini ada, transaksi cuma teruji di level HTTP/service; layar kasirnya
           sendiri tidak pernah dijalankan. Stok total dipakai sebagai bukti: kalau
           berkurang tepat 1, berarti request benar-benar sampai server, stok terpotong,
           dan klien memuat ulang data. */
        const sumStok = () => (window.SS.DB.products || []).reduce((s,p) => s + p.stok, 0);
        const stok0 = sumStok();

        // window.open distub: headless tidak boleh benar-benar membuka jendela & mencetak,
        // tapi isi notanya tetap harus bisa diperiksa.
        let notaHtml = '';
        window.open = () => ({ document:{ write:(h)=>{ notaHtml = h; }, close(){} }, focus(){}, print(){} });

        const addBtn = () => [...appEl().querySelectorAll('button')].find(b => b.textContent.includes('+ Tambah'));
        step('m: katalog menampilkan produk cabangnya', await waitFor(() => !!addBtn()));
        click(addBtn());
        step('m: produk masuk keranjang', await waitFor(() => /di keranjang/.test(appEl().textContent)));

        click(btn('Bayar'));
        step('m: panel bayar terbuka', await waitFor(() => !!document.getElementById('k-cash')));
        type('k-cash', '2000000');
        step('m: kembalian dihitung otomatis', await waitFor(() => has('Kembalian')));

        click(btn('Cetak Nota'));
        step('m: transaksi tersimpan & stok server berkurang', await waitFor(() => sumStok() === stok0 - 1, 15000));
        step('m: keranjang dikosongkan setelah bayar', await waitFor(() => !/di keranjang/.test(appEl().textContent)));
        step('m: nota berisi rincian & total bayar', notaHtml.includes('TOTAL BAYAR') && notaHtml.includes('Kembalian'));

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

      // kelola cabang: tambah, edit (rename), blokir hapus yang berdata, hapus yang baru — lewat pop-up konfirmasi
      click(btn('Kelola Cabang'));
      step('modal kelola cabang terbuka', await waitFor(() => !!document.getElementById('i-newbranch')));
      const brName = 'CabangE2E' + String(Date.now()).slice(-5);
      type('i-newbranch', brName);
      click(btn('TAMBAH'));
      const editBranchBtnFor = name => [...appEl().querySelectorAll('button')].find(b => b.title === 'edit-branch-' + name);
      step('cabang baru tersimpan ke DB', await waitFor(() => !!editBranchBtnFor(brName)));

      click(editBranchBtnFor(brName));
      step('mode edit cabang aktif', await waitFor(() => document.getElementById('i-newbranch')?.value === brName && has('Hapus cabang ini')));
      const brNameRenamed = brName + 'X';
      type('i-newbranch', brNameRenamed);
      click(btn('SIMPAN'));
      step('cabang berganti nama di DB', await waitFor(() => !!editBranchBtnFor(brNameRenamed) && !editBranchBtnFor(brName)));

      click(editBranchBtnFor('Pleburan'));
      step('mode edit cabang Pleburan aktif', await waitFor(() => document.getElementById('i-newbranch')?.value === 'Pleburan' && has('Hapus cabang ini')));
      click(btn('Hapus cabang ini'));
      step('modal konfirmasi hapus cabang muncul', await waitFor(() => has('Konfirmasi Hapus')));
      click(btn('YA, HAPUS'));
      step('hapus cabang berdata diblokir', await waitFor(() => has('tidak bisa dihapus')));

      click(editBranchBtnFor(brNameRenamed));
      step('mode edit cabang baru aktif lagi', await waitFor(() => document.getElementById('i-newbranch')?.value === brNameRenamed && has('Hapus cabang ini')));
      click(btn('Hapus cabang ini'));
      step('modal konfirmasi hapus cabang muncul lagi', await waitFor(() => has('Konfirmasi Hapus')));
      click(btn('YA, HAPUS'));
      step('cabang baru terhapus dari DB', await waitFor(() => !editBranchBtnFor(brNameRenamed)));

      click(btn('Tutup'));
      step('modal kelola cabang tertutup', await waitFor(() => !document.getElementById('i-newbranch')));

      click(appEl().querySelector('[title="toggle-branch-menu"]'));
      step('menu cabang lagi', await waitFor(() => has('Pilih Cabang')));
      click(btn('Semua Cabang'));
      step('agregat semua cabang', await waitFor(() => has('Performa per Cabang')));

      click(btn('Piutang'));
      step('piutang dari DB', await waitFor(() => has('Budi Santoso') && has('Rina Wijaya')));
      const paidBtns = () => [...appEl().querySelectorAll('button')].filter(b => b.textContent.trim() === 'Tandai Lunas').length;
      const n0 = paidBtns();
      if (n0 > 0) {
        click(btn('Tandai Lunas'));
        step('modal konfirmasi lunas muncul', await waitFor(() => has('Konfirmasi Pelunasan')));
        click(btn('YA, SUDAH LUNAS'));
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
      // " pcs" = baris data terisi; "Terjual" = header tabel ikut terender
      step('detail produk anggota terbuka (tabel berkolom)', await waitFor(() => / pcs/.test(appEl().textContent) && has('Terjual')));
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
      step('counter toolbar dinamis (2 dari N)', has('2 dari ' + nAll + ' pegawai'));
      const chipBtns = () => [...appEl().querySelectorAll('button')].filter(b => (b.title || '').startsWith('hapus-filter-'));
      step('chip filter aktif tampil (2 chip)', chipBtns().length === 2);
      click(chipBtns()[0]);
      step('hapus 1 chip → tersisa 1 terpilih', await waitFor(() => nRows() === 1 && has('1 dari ' + nAll + ' pegawai')));
      click(btn('Kosongkan'));
      step('kosongkan pilihan → daftar penuh lagi', await waitFor(() => nRows() === nAll && !has('terpilih')));
      click(btn('Pilih semua'));
      step('pilih semua → seluruh pegawai terpilih', await waitFor(() => has(nAll + ' dari ' + nAll + ' pegawai')));
      click(btn('Kosongkan'));
      step('kosongkan lagi setelah pilih semua → daftar penuh', await waitFor(() => nRows() === nAll && !has('terpilih')));
      // dua tombol "Tahunan" di layar Laporan: [0] = Tren Omset (chip periode), terakhir = kartu per-anggota
      const tahunanBtns = () => [...appEl().querySelectorAll('button')].filter(b => b.textContent.trim() === 'Tahunan');
      click(tahunanBtns()[tahunanBtns().length - 1]);
      step('ganti periode anggota (tahunan)', await waitFor(() => has('· Tahunan') && nRows() > 0 && /Rp[\d.]/.test(appEl().textContent)));
      // Tren Omset periode Tahunan: total setahun + bar per bulan (data asli DB)
      click(tahunanBtns()[0]);
      step('tren omset tahunan tampil', await waitFor(() => has('Total Omset (Tahunan)') && has('Jan')));

      // laporan penjualan per tanggal: pilih tanggal → rincian barang yang laku hari itu
      step('panel penjualan per tanggal ada', has('Penjualan per Tanggal'));
      click(document.getElementById('custom-trig-saldate'));
      step('date picker laporan terbuka', await waitFor(() => has('Pilih Hari Ini')));
      click(btn('Pilih Hari Ini'));
      step('rincian per tanggal termuat', await waitFor(() => has('Omset Hari Itu') || has('Tidak ada penjualan pada tanggal ini')));

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
      step('stok terbuka', await waitFor(() => has('Kelola Kategori')));
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

      // riwayat stok (track record): restock barusan harus muncul sbg mutasi "masuk"
      const prodNm = (rbtn.title || '').replace('restok-', '');
      const histBtn = () => [...appEl().querySelectorAll('button')].find(b => b.title === 'riwayat-' + prodNm);
      click(histBtn());
      step('modal riwayat stok terbuka', await waitFor(() => has('Riwayat Stok')));
      step('restock tercatat di riwayat (+5 masuk)', await waitFor(() => has('Restock') && has('Masuk') && has('+5')));
      click(btn('Tutup'));
      step('modal riwayat tertutup', await waitFor(() => !has('Riwayat Stok')));

      // supplier: buat PO baru lalu tandai lunas
      click(btn('Pembelian'));
      step('layar supplier terbuka', await waitFor(() => has('Total Hutang ke Supplier')));
      click(btn('+ Buat Purchase Order'));
      step('form PO terbuka', await waitFor(() => !!document.getElementById('i-poname')));
      const supNm = 'Supplier E2E ' + String(Date.now()).slice(-5);
      type('i-poname', supNm); type('i-poamount', '1500000');
      click(document.getElementById('custom-trig-podue'));
      step('date picker jatuh tempo PO terbuka', await waitFor(() => has('Pilih Hari Ini')));
      click(btn('Pilih Hari Ini'));
      click(btn('SIMPAN PO'));
      step('PO tersimpan ke DB', await waitFor(() => has(supNm) && has('Purchase Order dicatat')));
      const lunasiOf = () => [...appEl().querySelectorAll('button')].filter(b => b.textContent.trim() === 'Tandai Lunas');
      const nLunasi = lunasiOf().length;
      click(lunasiOf()[0]); // PO terbaru = paling atas
      step('modal konfirmasi lunas supplier muncul', await waitFor(() => has('Konfirmasi Pelunasan')));
      click(btn('YA, SUDAH LUNAS'));
      step('hutang supplier ditandai lunas', await waitFor(() => has('ditandai lunas') && lunasiOf().length === nLunasi - 1));

      // biaya operasional: catat sekali-ini, catat rutin (jatuh tempo besok → masuk lonceng), lunasi, hapus
      click(btn('Biaya Operasional'));
      step('layar biaya terbuka', await waitFor(() => has('Biaya Operasional Bulan Ini')));

      // kelola kategori biaya: tambah, edit (rename), blokir hapus yang terpakai, hapus yang baru — lewat pop-up konfirmasi
      click(btn('Kelola Kategori'));
      step('modal kategori biaya terbuka', await waitFor(() => !!document.getElementById('i-newbxcat')));
      const bxKat = 'BxKat' + String(Date.now()).slice(-5);
      type('i-newbxcat', bxKat);
      click(btn('TAMBAH'));
      const editBxBtnFor = name => [...appEl().querySelectorAll('button')].find(b => b.title === 'edit-bxcat-' + name);
      step('kategori biaya baru tersimpan ke DB', await waitFor(() => !!editBxBtnFor(bxKat)));

      click(editBxBtnFor(bxKat));
      step('mode edit kategori aktif', await waitFor(() => document.getElementById('i-newbxcat')?.value === bxKat && has('Hapus kategori ini')));
      const bxKatRenamed = bxKat + 'X';
      type('i-newbxcat', bxKatRenamed);
      click(btn('SIMPAN'));
      step('kategori biaya berganti nama di DB', await waitFor(() => !!editBxBtnFor(bxKatRenamed) && !editBxBtnFor(bxKat)));

      click(editBxBtnFor('Sewa'));
      click(btn('Hapus kategori ini'));
      step('modal konfirmasi hapus kategori muncul', await waitFor(() => has('Konfirmasi Hapus')));
      click(btn('YA, HAPUS'));
      step('hapus kategori biaya terpakai diblokir', await waitFor(() => has('masih dipakai')));

      click(editBxBtnFor(bxKatRenamed));
      click(btn('Hapus kategori ini'));
      click(btn('YA, HAPUS'));
      step('kategori biaya terhapus dari DB', await waitFor(() => !editBxBtnFor(bxKatRenamed)));

      click(btn('Tutup'));
      step('modal kategori biaya tertutup', await waitFor(() => !document.getElementById('i-newbxcat')));

      click(btn('+ Catat Biaya'));
      step('form biaya terbuka', await waitFor(() => !!document.getElementById('i-bxamount')));
      const bxNote = 'Printilan E2E ' + String(Date.now()).slice(-5);
      type('i-bxnote', bxNote); type('i-bxamount', '25000');
      click(document.getElementById('custom-trig-bxdate'));
      step('date picker biaya terbuka', await waitFor(() => has('Pilih Hari Ini')));
      click(btn('Pilih Hari Ini'));
      click(btn('SIMPAN BIAYA'));
      step('biaya sekali-ini tersimpan ke DB', await waitFor(() => has(bxNote) && has('Biaya tercatat')));

      click(btn('+ Catat Biaya'));
      click([...document.querySelectorAll('#app button')].find(b => b.textContent.trim() === 'Rutin Bulanan'));
      step('mode rutin bulanan aktif', await waitFor(() => !!document.getElementById('i-bxdueday')));
      const tomorrowDay = new Date(Date.now() + 864e5).getDate();
      // Nominal dibuat UNIK per run (35xxx). Dulu dipatok 35000, tapi kalau satu run mati
      // di tengah, baris rutinnya tertinggal di DB dan run berikutnya melihat >1 baris
      // "Rp35.000" — pencarian baris jadi ambigu & langkah lunas/hapus ikut gagal.
      const bxAmt = 35000 + Number(String(Date.now()).slice(-3));
      const bxAmtText = 'Rp' + bxAmt.toLocaleString('id-ID');
      type('i-bxamount', String(bxAmt)); // form baru dari newBiaya() reset bxAmount ke '' — wajib diisi ulang tiap form
      type('i-bxdueday', String(tomorrowDay));
      click(btn('SIMPAN BIAYA'));
      step('biaya rutin tersimpan ke DB', await waitFor(() => has('Biaya tercatat') && window.SS.DB.expenses.some(x => x.recurring && x.dueDay === tomorrowDay && x.amount === bxAmt)));

      // Notifikasi desktop: headless tak punya Notification API. Stub dipasang SEBELUM
      // panel lonceng dibuka — app.js tak mengekspor setState ke global, jadi satu-satunya
      // cara merender ulang adalah lewat interaksi (klik lonceng) setelah stub terpasang.
      // Stub dipasang PAKSA (menimpa API asli kalau ada): headless Edge punya
      // Notification API, tapi requestPermission()-nya tak pernah 'granted' tanpa
      // klik manusia — tanpa ditimpa, jalur kodenya tak akan pernah teruji.
      let notifStub = false;
      try {
        window.__notifs = [];
        const Stub = function(judul, opt){ window.__notifs.push({ judul, body:(opt||{}).body }); };
        Stub.permission = 'default';
        Stub.requestPermission = () => { Stub.permission = 'granted'; return Promise.resolve('granted'); };
        Object.defineProperty(window, 'Notification', { value: Stub, writable: true, configurable: true });
        notifStub = window.Notification === Stub;
      } catch(e) { notifStub = false; }

      // lonceng notifikasi ikut menghitung biaya rutin yang jatuh tempo ≤3 hari
      const bellBtn = () => [...document.querySelectorAll('#app button')].find(b => b.style.position === 'relative' && b.querySelector('svg'));
      click(bellBtn());
      step('lonceng menampilkan biaya rutin', await waitFor(() => has('Biaya:')));

      if (notifStub) {
        step('tombol aktifkan notifikasi desktop muncul', await waitFor(() => has('Aktifkan notifikasi desktop')));
        click(btn('Aktifkan notifikasi desktop'));
        step('izin diberikan → notifikasi desktop terkirim', await waitFor(() => (window.__notifs || []).length > 0));
        step('isi notifikasi menyebut jatuh tempo', (window.__notifs || []).some(n => /jatuh tempo/i.test(n.judul)));
      } else {
        out.push("SKIP :: notifikasi desktop (Notification API tak bisa ditimpa di browser ini)");
      }

      click(document.querySelector('#app div[style*="position:fixed"][style*="inset:0"]')); // klik scrim → tutup panel lonceng (bellHtml(): style ditulis tanpa spasi setelah ":", innerHTML tak menormalisasinya)
      step('panel lonceng tertutup', await waitFor(() => !has('Notifikasi Jatuh Tempo')));

      click(btn('Biaya Operasional'));
      const lunasiOfBiaya = () => [...document.querySelectorAll('#app button')].filter(b => b.textContent.trim() === 'Tandai Lunas');
      // [0] ambigu: seed nanam recurring due_day 25 (Sewa) & 20 (Listrik) tiap cabang, bisa tabrakan dgn tomorrowDay.
      // Cari baris milik tes sendiri lewat nominal 35.000 (unik, tak dipakai seed manapun).
      // biayaRowOf(): tombol kini dibungkus <div inline-flex> sendiri, jadi closest('div') polos
      // berhenti di pembungkus itu (tak memuat nominal). Naik sampai div BARIS: desktop = grid,
      // mobile = kartu ber-border-radius — pola yang sama dipakai stokCellOf di atas.
      const biayaRowOf = b => b.closest('div[style*="grid"], div[style*="border-radius"]');
      const myLunasiBtn = () => lunasiOfBiaya().find(b => (biayaRowOf(b)?.textContent || '').includes(bxAmtText));
      const nLunasiBefore = lunasiOfBiaya().length;
      click(myLunasiBtn());
      step('biaya rutin ditandai lunas', await waitFor(() => has('ditandai lunas') && lunasiOfBiaya().length === nLunasiBefore - 1));

      // edit biaya sekali-ini: ganti keterangan → tersimpan (bukan tombol hapus langsung di baris lagi)
      const editBiayaBtnFor = text => [...document.querySelectorAll('#app button')].find(b => b.title.startsWith('edit-biaya-') && (biayaRowOf(b)?.textContent || '').includes(text));
      click(editBiayaBtnFor(bxNote));
      step('form edit biaya terbuka terisi', await waitFor(() => has('Edit Biaya') && document.getElementById('i-bxnote')?.value === bxNote));
      const bxNoteEdited = 'Diedit E2E ' + String(Date.now()).slice(-5);
      type('i-bxnote', bxNoteEdited);
      click(btn('SIMPAN BIAYA'));
      step('biaya sekali-ini berhasil diedit', await waitFor(() => has('Biaya diperbarui') && has(bxNoteEdited) && !has(bxNote)));

      // lalu hapus lewat Edit → Hapus Biaya Ini → pop-up konfirmasi
      click(editBiayaBtnFor(bxNoteEdited));
      click(btn('Hapus Biaya Ini'));
      step('modal konfirmasi hapus biaya muncul', await waitFor(() => has('Konfirmasi Hapus')));
      click(btn('YA, HAPUS'));
      step('biaya sekali-ini terhapus dari DB', await waitFor(() => has('Biaya dihapus') && !has(bxNoteEdited)));

      // hapus juga baris rutin (Rp35.000) — kalau dibiarkan, catchUpRecurringExpenses() di backend
      // meng-klon baris rutin PALING BARU per (cabang, kategori) jadi template bulan depan, jadi sisa
      // baris tes ini bisa membajak nominal/tanggal jatuh tempo yang ter-generate untuk "Sewa" asli
      click(editBiayaBtnFor(bxAmtText));
      step('form edit biaya rutin terbuka terisi', await waitFor(() => has('Edit Biaya') && document.getElementById('i-bxamount')?.value === String(bxAmt)));
      click(btn('Hapus Biaya Ini'));
      click(btn('YA, HAPUS'));
      step('biaya rutin terhapus dari DB', await waitFor(() => has('Biaya dihapus') && !has(bxAmtText)));

      // tambah produk (admin) — form fungsional, tersimpan ke DB
      click(btn('Produk & Harga'));
      step('layar produk terbuka', await waitFor(() => has('Margin') && btn('+ Tambah Produk')));
      click(btn('+ Tambah Produk'));
      step('form tambah produk terbuka', await waitFor(() => !!document.getElementById('i-pname') && !!document.getElementById('custom-trig-pbranch')));
      const pnm = 'Produk E2E ' + String(Date.now()).slice(-5);
      type('i-pname', pnm); type('i-pharga', '99000'); type('i-pstok', '7');
      step('form produk terisi', await waitFor(() => document.getElementById('i-pname').value === pnm));
      // varian rasa ditolak server: master barang dikelompokkan per ukuran, bukan rasa
      type('i-pvar', 'Cokelat');
      click(btn('SIMPAN PRODUK'));
      step('varian rasa ditolak server', await waitFor(() => has('bukan rasa') && !has('ditambahkan')));
      type('i-pvar', '900gr');
      click(btn('SIMPAN PRODUK'));
      step('produk baru tersimpan ke DB', await waitFor(() => has(pnm) && has('ditambahkan')));

      // edit master barang: form terisi data lama → simpan → berubah di DB
      const editBtn = () => [...appEl().querySelectorAll('button')].find(b => b.title === 'edit-produk-' + pnm);
      click(editBtn());
      step('form edit produk terbuka terisi', await waitFor(() => has('Edit Produk') && document.getElementById('i-pname')?.value === pnm && document.getElementById('i-pvar')?.value === '900gr'));
      step('stok & cabang disembunyikan saat edit', !document.getElementById('i-pstok') && !document.getElementById('custom-trig-pbranch'));
      const pnm2 = pnm + ' Edit';
      type('i-pname', pnm2); type('i-pharga', '123000');
      click(btn('SIMPAN PERUBAHAN'));
      step('perubahan produk tersimpan ke DB', await waitFor(() => has(pnm2) && has('diperbarui') && has('Rp123.000')));

      // Bagian kasir dikosongkan untuk tim kasir → admin "Buka Kasir" menampilkan
      // layar yang dirender modul kasir.js (placeholder starter), bukan POS penuh.
      click(btn('Ganti Mode / Kasir'));
      step('kembali ke pilihan mode', await waitFor(() => has('Mau ke mana?')));
      click(btn('Buka Kasir'));
      step('layar kasir didelegasikan ke kasir.js', await waitFor(() => has('Kasir') && has('Keranjang')));

      step('tanpa error js', window.__errors.length === 0);
    } catch(e) {
      out.push('FAIL :: exception ' + e.message);
    }
    finish();
  })();
})();
