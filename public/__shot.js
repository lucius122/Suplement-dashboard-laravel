/* Sementara: login admin → Laporan → buka dropdown pegawai (untuk screenshot). */
(function(){
  const btn = txt => [...document.querySelectorAll('#app button')].find(b => b.textContent.trim().includes(txt));
  const type = (id, val) => { const el = document.getElementById(id); el.value = val; el.dispatchEvent(new Event('input', {bubbles:true})); };
  const wait = (cond, cb) => { const t = setInterval(() => { if(cond()){ clearInterval(t); cb(); } }, 120); };
  const opts = () => [...document.querySelectorAll('#app button')].filter(b => (b.title||'').startsWith('opt-@'));
  wait(() => document.getElementById('i-uname'), () => {
    type('i-uname', 'admin'); type('i-pass', 'admin'); btn('MASUK').click();
    wait(() => btn('Buka Dashboard Admin'), () => {
      btn('Buka Dashboard Admin').click();
      wait(() => btn('Laporan Omset'), () => {
        btn('Laporan Omset').click();
        wait(() => btn('Semua pegawai'), () => {
          btn('Semua pegawai').click();
          setTimeout(() => { if(opts()[1]) opts()[1].click(); setTimeout(() => { const c = [...document.querySelectorAll('#app *')].find(el => el.textContent.trim() === 'Penjualan per Anggota'); if(c) c.scrollIntoView(); }, 400); }, 500);
        });
      });
    });
  });
})();
