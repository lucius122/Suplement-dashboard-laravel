/* Suplemen Semarang Store — frontend (ported from the Claude Design file), data dari API Laravel */
(function () {
'use strict';

/* ================= server data ================= */
const DB = { branches: [], categories: [], products: [], receivables: [], users: [], suppliers: [], promos: [], expenses: [], dash: {}, byUser: {}, memberItems: {}, yearly: {} };
let USER = null;

const CSRF = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
async function api(path, method, body){
  const res = await fetch(path, {
    method: method || 'GET',
    headers: {
      'Accept': 'application/json',
      'X-CSRF-TOKEN': CSRF,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    USER = null;
    setState({ screen:'login', role:null });
    throw new Error('Sesi berakhir, silakan masuk lagi.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Terjadi kesalahan ('+res.status+')');
  return data;
}
async function loadAll(){
  const [boot, dash] = await Promise.all([api('/api/bootstrap'), api('/api/dashboard')]);
  Object.assign(DB, boot, { dash });
  DB.byUser = {}; DB.memberItems = {}; DB.yearly = {}; DB.expenses = []; // data berubah setelah tulis → buang cache
  if(USER && USER.role === 'admin'){
    await loadByUser(S.uPeriod);
    if(S.period === 'Bulanan') await loadYearly(new Date().getFullYear());
    else if(S.period === 'Tahunan') await loadYearly(S.selYear);
    await loadExpenses();
  }
}
async function loadExpenses(){
  const r = await api('/api/expenses');
  DB.expenses = r.expenses;
}
// penjualan per anggota: 1 periode, on-demand, di-cache per periode (khusus admin; BE menolak kasir)
async function loadByUser(period){
  if(DB.byUser[period] || !(USER && USER.role === 'admin')) return;
  const r = await api('/api/sales-by-user?period=' + period);
  DB.byUser[period] = r.rows;
}
async function changeUPeriod(p){
  setState({ uPeriod: p, memberOpen: null });
  try { await loadByUser(p); render(); } catch(e){ flash(e.message); }
}

// tren omset per tahun (Bulanan = tahun berjalan, Tahunan = tahun pilihan) — hanya
// tahun yang sedang dilihat yang di-query, bukan semua tahun sekaligus
async function loadYearly(year){
  if(DB.yearly[year]) return;
  const r = await api('/api/dashboard/yearly?year=' + year);
  DB.yearly[year] = r;
}
async function changePeriod(p){
  setState({ period:p });
  try {
    if(p === 'Bulanan') await loadYearly(new Date().getFullYear());
    else if(p === 'Tahunan') await loadYearly(S.selYear);
    render();
  } catch(e){ flash(e.message); }
}
async function changeSelYear(y){
  setState({ selYear:y });
  try { await loadYearly(y); render(); } catch(e){ flash(e.message); }
}

/* ================= state ================= */
let S = {
  screen: 'boot', role: null, who: '', branch: 'Pleburan', // 'boot' = latar kosong selama cek sesi

  vw: window.innerWidth, navOpen: false, sideCollapsed: false,
  uname: '', pass: '', loginErr: '',
  bell: false, more: false, toast: '',
  pf: 'Semua', pq: '',
  stokCat: 'Semua', userRole: 'Semua',
  scan: false, userForm: false, prodForm: false,
  period: 'Harian', selYear: new Date().getFullYear(), uPeriod: 'Mingguan', selMembers: [], memberOpen: null, memberSearch: '', memberDropdown: false, // selMembers = pegawai dipilih utk banding ([] = semua)
  uName: '', uUname: '', uPass: '', uRole: 'Kasir', uCabang: 'Pleburan', editUserId: null, // null = mode tambah
  pName:'', pVar:'', pKat:'', pHarga:'', pModal:'', pStok:'', pBarcode:'', pExp:'', pBranch:'', // form tambah produk (admin)
  poForm:false, poName:'', poAmount:'', poDue:'',          // form Purchase Order (hutang supplier)
  promoForm:false, prName:'', prDesc:'', prType:'Bundle', prValue:'', // form promo/bundle
  restockId:null, restockQty:'',                            // modal tambah stok (null = tutup)
  scanTarget:'stok', scanManual:'', scanMsg:'',             // scan barcode (kamera + input manual)
  scanDevices:[], scanDeviceId:null,                        // daftar kamera terdeteksi (mis. DroidCam) + pilihan aktif
  biayaForm:false, bxCategory:'Sewa', bxNote:'', bxAmount:'', bxBranch:'', bxRecurring:false, bxDueDay:'', bxDate:'', // form Biaya Operasional
  uPassShow:false,                                          // tombol mata password form user
  // scan kasir (stream terpisah dari scan admin supaya tidak konflik state)
  k_scanMode:null, k_scanMsg:'', k_scanDevices:[], k_scanDeviceId:null, k_scanManual:'',
  k_restockId:null, k_restockQty:'',                        // modal restock setelah scan masuk
  theme: 'dark', settingsBack: 'dashboard',
  branchMenu: false, branchForm: false, newCat: '', catForm: false, newBranch: '',
  // catatan: state khusus kasir (cart, pay, cash, dst.) DIHAPUS — dikelola sendiri
  // oleh modul kasir (public/js/kasir.js) lewat window.SS.setState.
};

const TODAY = new Date();

/* ================= helpers ================= */
const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
const rpShort = n => { if(n>=1000000) return 'Rp'+(n/1000000).toFixed(n%1000000?1:0)+'jt'; if(n>=1000) return 'Rp'+Math.round(n/1000)+'rb'; return 'Rp'+n; };
const MON = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const fmtDate = s => { if(!s||s==='-') return '-'; const d=new Date(s); return d.getDate()+' '+MON[d.getMonth()]; };
const daysLeft = s => Math.round((new Date(s+'T00:00:00') - new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate())) / 86400000);
const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function ic(name, color, size){
  size = size || 18;
  const P = {
    dashboard:['M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-8'],
    piutang:['M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3V3Z','M9 8h6M9 12h5'],
    tempo:['M12 7v5l3 2'],
    stok:['M21 8l-9-5-9 5 9 5 9-5ZM3 8v8l9 5 9-5V8M12 13v8'],
    produk:['M20.6 12.6 12 4H5v7l8.6 8.6a1.4 1.4 0 0 0 2 0l4-4a1.4 1.4 0 0 0 0-2Z','M8 8h.01'],
    laporan:['M4 20h16','M4 14l5-5 4 4 6-7'],
    users:['M17 20a5 5 0 0 0-10 0','M12 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z'],
    supplier:['M3 6h11v10H3zM14 9h4l3 3v4h-7','M7.5 18.5a1.6 1.6 0 1 0 .01 0M16.5 18.5a1.6 1.6 0 1 0 .01 0'],
    promo:['M20 12v8H4v-8M2 7.5h20V12H2zM12 7.5V20M12 7.5C11 4 9 3 7.5 3.5S5.5 7 8 7.5M12 7.5C13 4 15 3 16.5 3.5S18.5 7 16 7.5'],
    shopee:['M5 8h14l-1 12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 8Z','M9 8V6a3 3 0 0 1 6 0v2'],
    biaya:['M8 12h8'],
    refresh:['M21 12a9 9 0 1 1-2.6-6.4','M21 3v4h-4'],
    scan:['M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M6 12h12'],
    warn:['M12 9v4M12 17h.01','M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'],
    settings:['M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z'],
  };
  const circles = { tempo:[12,12,9], settings:[12,12,3], biaya:[12,12,9] };
  let body = (P[name]||[]).map(d => `<path d="${d}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="stroke:${color};fill:none"></path>`).join('');
  if(circles[name]){ const c=circles[name]; body += `<circle cx="${c[0]}" cy="${c[1]}" r="${c[2]}" stroke-width="1.8" style="stroke:${color};fill:none"></circle>`; }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="flex:none">${body}</svg>`;
}

/* ================= state machinery ================= */
let reg = [];
const A = fn => { reg.push(fn); return `data-a="${reg.length-1}"`; };  // click handler
const I = fn => { reg.push(fn); return `data-i="${reg.length-1}"`; };  // input handler

function setState(patch){ Object.assign(S, typeof patch==='function' ? patch(S) : patch); render(); }
const go = s => () => setState({ screen:s, more:false, bell:false, navOpen:false, memberDropdown:false });

let toastT;
function flash(msg){ setState({ toast: msg }); clearTimeout(toastT); toastT = setTimeout(()=>setState({toast:''}), 2600); }

function applyThemeBg(t){ const c = t==='light' ? '#ECEAE3' : '#0a0a0c'; document.body.style.background = c; document.documentElement.style.background = c; }
function setTheme(t){ try { localStorage.setItem('ss_theme', t); } catch(e){} applyThemeBg(t); setState({ theme: t }); }

/* ================= actions (API) ================= */
function enterApp(){
  setState({
    role: USER.role, who: (USER.name||'').split(' ')[0] || 'User',
    branch: USER.branch || 'Pleburan',
    // kasir → layar 'cashier' (dirender oleh modul kasir); admin → pilih mode
    screen: USER.role === 'admin' ? 'mode' : 'cashier',
    settingsBack: USER.role === 'admin' ? 'dashboard' : 'cashier',
    loginErr:'', uname:'', pass:'',
  });
}
async function login(){
  const u = (S.uname||'').trim();
  if(!u){ setState({ loginErr:'Masukkan username terlebih dahulu.' }); return; }
  try {
    const r = await api('/login', 'POST', { username: u, password: S.pass });
    USER = r.user;
    await loadAll();
    enterApp();
  } catch(e) {
    setState({ loginErr: e.message });
  }
}
async function logout(){
  try { await api('/logout', 'POST', {}); } catch(e){}
  location.reload(); // token CSRF di-regenerate server; reload mengambil token & state segar
}

async function markPaid(id){
  try { await api('/api/receivables/'+id+'/pay', 'POST', {}); await loadAll(); flash('Tagihan ditandai lunas'); }
  catch(e) { flash(e.message); }
}

async function saveProduct(){
  if(!S.pName.trim()){ flash('Isi nama produk dulu'); return; }
  const harga = parseInt(S.pHarga)||0;
  if(!harga){ flash('Isi harga jual dulu'); return; }
  if(!S.pBranch){ flash('Pilih cabang dulu'); return; }
  const nama = S.pName.trim();
  try {
    await api('/api/products', 'POST', {
      name: nama, varian: S.pVar.trim() || '-', harga,
      modal: parseInt(S.pModal)||0, stok: parseInt(S.pStok)||0,
      kategori: S.pKat, branch: S.pBranch,
      barcode: S.pBarcode.trim() || null, exp: S.pExp || null,
    });
    setState({ prodForm:false });
    await loadAll();
    flash('Produk "'+nama+'" ditambahkan');
  } catch(e) { flash(e.message); }
}

async function saveBranch(){
  const name = (S.newBranch||'').trim();
  if(!name){ flash('Isi nama cabang terlebih dahulu'); return; }
  try {
    await api('/api/branches', 'POST', { name });
    Object.assign(S, { branch:name, branchForm:false });
    await loadAll();
    flash('Cabang "'+name+'" ditambahkan');
  } catch(e) { flash(e.message); }
}

async function saveCategory(){
  const name = (S.newCat||'').trim();
  if(!name){ flash('Isi nama kategori terlebih dahulu'); return; }
  try {
    await api('/api/categories', 'POST', { name });
    Object.assign(S, { newCat:'' });
    await loadAll();
    flash('Kategori "'+name+'" ditambahkan');
  } catch(e) { flash(e.message); }
}
async function deleteCategory(c){
  try {
    await api('/api/categories/'+c.id, 'DELETE');
    if(S.stokCat === c.name) S.stokCat = 'Semua';
    await loadAll();
    flash('Kategori "'+c.name+'" dihapus');
  } catch(e) { flash(e.message); }
}

async function openMemberDetail(uname){
  if(S.memberOpen === uname){ setState({ memberOpen: null }); return; }
  setState({ memberOpen: uname });
  const key = uname + '|' + S.uPeriod;
  if(!DB.memberItems[key]){
    try {
      const r = await api('/api/sales-by-user/' + encodeURIComponent(uname) + '/items?period=' + S.uPeriod);
      DB.memberItems[key] = r.items;
      render();
    } catch(e) { setState({ memberOpen: null }); flash(e.message); }
  }
}

async function saveUser(){
  const edit = S.editUserId !== null;
  if(!S.uName.trim() || !S.uUname.trim() || (!edit && !S.uPass)){ flash('Lengkapi nama, username, dan password'); return; }
  const body = { name:S.uName.trim(), username:S.uUname.trim(), password:S.uPass || null, role:S.uRole, branch:S.uCabang };
  try {
    if(edit) await api('/api/users/'+S.editUserId, 'PATCH', body);
    else await api('/api/users', 'POST', body);
    Object.assign(S, { userForm:false });
    await loadAll();
    flash(edit ? 'Perubahan user tersimpan' : 'User baru tersimpan');
  } catch(e) { flash(e.message); }
}

async function saveSupplier(){
  if(!S.poName.trim()){ flash('Isi nama supplier dulu'); return; }
  const amount = parseInt(S.poAmount)||0;
  if(!amount){ flash('Isi nominal hutang dulu'); return; }
  if(!S.poDue){ flash('Isi tanggal jatuh tempo dulu'); return; }
  try {
    await api('/api/suppliers', 'POST', { name:S.poName.trim(), amount, due:S.poDue });
    Object.assign(S, { poForm:false });
    await loadAll();
    flash('Purchase Order dicatat');
  } catch(e) { flash(e.message); }
}
async function paySupplier(s){
  try { await api('/api/suppliers/'+s.id+'/pay', 'POST', {}); await loadAll(); flash('Hutang '+s.name+' ditandai lunas'); }
  catch(e) { flash(e.message); }
}

async function savePromo(){
  if(!S.prName.trim()){ flash('Isi nama promo dulu'); return; }
  if(!S.prValue.trim()){ flash('Isi nilai promo (mis. 15% / Hemat Rp40.000)'); return; }
  try {
    await api('/api/promos', 'POST', { name:S.prName.trim(), desc:S.prDesc.trim(), type:S.prType, value:S.prValue.trim() });
    Object.assign(S, { promoForm:false });
    await loadAll();
    flash('Promo tersimpan');
  } catch(e) { flash(e.message); }
}
async function deletePromo(p){
  try { await api('/api/promos/'+p.id, 'DELETE'); await loadAll(); flash('Promo "'+p.name+'" dihapus'); }
  catch(e) { flash(e.message); }
}
async function saveExpense(){
  if(!S.bxBranch){ flash('Pilih cabang dulu'); return; }
  const amount = parseInt(S.bxAmount)||0;
  if(!amount){ flash('Isi nominal dulu'); return; }
  if(S.bxRecurring && !S.bxDueDay){ flash('Isi tanggal jatuh tempo tiap bulan'); return; }
  if(!S.bxRecurring && !S.bxDate){ flash('Isi tanggal biaya ini terjadi'); return; }
  try {
    await api('/api/expenses', 'POST', {
      category: S.bxCategory, note: S.bxNote.trim(), amount,
      branch: S.bxBranch, recurring: S.bxRecurring,
      dueDay: S.bxRecurring ? (parseInt(S.bxDueDay)||null) : null,
      date: S.bxRecurring ? null : S.bxDate,
    });
    Object.assign(S, { biayaForm:false });
    await loadAll();
    flash('Biaya tercatat');
  } catch(e) { flash(e.message); }
}
async function payExpense(x){
  try { await api('/api/expenses/'+x.id+'/pay', 'POST', {}); await loadAll(); flash('Biaya '+x.category+' ditandai lunas'); }
  catch(e) { flash(e.message); }
}
async function deleteExpense(x){
  try { await api('/api/expenses/'+x.id, 'DELETE'); await loadAll(); flash('Biaya dihapus'); }
  catch(e) { flash(e.message); }
}

/* ---- scan barcode (EAN-13 dsb.) via kamera ----
   BarcodeDetector bawaan browser cuma ada di Chrome Android/ChromeOS (TIDAK di
   Chrome/Edge desktop Windows/Mac/Linux, walau versi terbaru) → fallback ZXing
   (public/js/vendor/zxing.min.js, global window.ZXing) dipakai kalau native tak ada. */
let scanStream = null, scanTimer = null, scanDetector = null;
let lastScanCode = '', lastScanAt = 0;
let zxingMultiReader = null;
let zxingHints = null;
let scanCanvas = null;
let scanCtx = null;

function getZxingReader() {
  if (!zxingMultiReader && 'ZXing' in window) {
    zxingHints = new Map();
    zxingHints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    if (ZXing.BarcodeFormat) {
      zxingHints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.EAN_13,
        ZXing.BarcodeFormat.EAN_8,
        ZXing.BarcodeFormat.CODE_128,
        ZXing.BarcodeFormat.CODE_39,
        ZXing.BarcodeFormat.UPC_A,
        ZXing.BarcodeFormat.UPC_E,
        ZXing.BarcodeFormat.QR_CODE,
      ]);
    }
    zxingMultiReader = new ZXing.MultiFormatReader();
    zxingMultiReader.setHints(zxingHints);
  }
  return zxingMultiReader;
}

function decodeFrameFromVideo(videoElement) {
  if (!videoElement || videoElement.videoWidth === 0 || videoElement.readyState < 2) return null;
  const reader = getZxingReader();
  if (!reader) return null;

  try {
    let w = videoElement.videoWidth;
    let h = videoElement.videoHeight;
    // Downscale ke 600px max width agar binarisasi & ekstraksi piksel super cepat (~15ms)
    if (w > 600) {
      h = Math.round((h * 600) / w);
      w = 600;
    }
    if (!scanCanvas) {
      scanCanvas = document.createElement('canvas');
      scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (scanCanvas.width !== w || scanCanvas.height !== h) {
      scanCanvas.width = w;
      scanCanvas.height = h;
    }
    scanCtx.drawImage(videoElement, 0, 0, w, h);

    const source = new ZXing.HTMLCanvasElementLuminanceSource(scanCanvas);

    // Pass 1: HybridBinarizer (Paling cepat untuk mayoritas frame)
    try {
      const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source));
      const res = reader.decode(bitmap, zxingHints);
      if (res && res.getText()) return res.getText();
    } catch(e){}

    // Pass 2: GlobalHistogramBinarizer (Fallback ampuh untuk layar HP, Moiré pattern & kilauan cahaya)
    try {
      const bitmap = new ZXing.BinaryBitmap(new ZXing.GlobalHistogramBinarizer(source));
      const res = reader.decode(bitmap, zxingHints);
      if (res && res.getText()) return res.getText();
    } catch(e){}

  } catch(e) {}
  return null;
}

async function startScan(target){
  setState({ scan:true, scanTarget:target, scanManual:'', scanMsg:'', prodForm: target==='pbarcode' ? false : S.prodForm });
  const hasZxing = 'ZXing' in window;
  const hasNative = 'BarcodeDetector' in window;
  if(!hasNative && !hasZxing){
    setState({ scanMsg:'Browser ini tidak mendukung deteksi otomatis — ketik nomor barcode di bawah.' });
    return;
  }
  if(hasNative) {
    scanDetector = scanDetector || new BarcodeDetector({ formats:['ean_13','ean_8','upc_a','upc_e','code_128','code_39'] });
  }
  try {
    await openScanDevice(S.scanDeviceId);
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    setState({ scanDevices: devices });
  } catch(e){
    const isInsecure = location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
    const msg = isInsecure
      ? 'Kamera diblokir karena koneksi HTTP (tidak aman). Gunakan HTTPS (mis. localtunnel) atau buka via localhost — atau ketik nomor barcode di bawah.'
      : 'Kamera tidak tersedia atau izin ditolak — ketik nomor barcode di bawah.';
    setState({ scanMsg: msg });
  }
}
async function openScanDevice(deviceId){
  clearInterval(scanTimer); scanTimer = null;
  if(scanStream) scanStream.getTracks().forEach(t => t.stop());
  const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
  const vOpts = deviceId
    ? { deviceId:{ exact:deviceId } }
    : isMobile
      ? { facingMode:{ ideal:'environment' }, width:{ ideal:1280 }, height:{ ideal:720 } }
      : { width:{ ideal:1280 }, height:{ ideal:720 } };
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: vOpts });
  } catch(e){
    // Fallback universal untuk semua kamera laptop/webcam PC
    scanStream = await navigator.mediaDevices.getUserMedia({ video: true });
  }
  try {
    const track = scanStream.getVideoTracks()[0];
    if (track && track.getCapabilities) {
      const caps = track.getCapabilities();
      if (caps.focusMode && caps.focusMode.includes('continuous')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      }
    }
  } catch(e){}
  setState({ scanDeviceId: scanStream.getVideoTracks()[0]?.getSettings().deviceId || null, scanMsg:'' });
  render();
  scanTimer = setInterval(scanTick, 120);
}
async function changeScanDevice(deviceId){
  try { await openScanDevice(deviceId); }
  catch(e){ setState({ scanMsg:'Gagal ganti kamera — coba pilih lagi.' }); }
}
let scanBusy = false;
async function scanTick(){
  const v = document.getElementById('scan-video');
  if(!v || v.readyState < 2 || scanBusy) return;
  scanBusy = true;
  try {
    let codeFound = null;
    if(scanDetector){
      try {
        const codes = await scanDetector.detect(v);
        if(codes.length && codes[0].rawValue) codeFound = codes[0].rawValue;
      } catch(e){}
    }
    if(!codeFound){
      codeFound = decodeFrameFromVideo(v);
    }
    if(codeFound) handleScanResult(codeFound);
  } catch(e){ /* frame gagal dideteksi */ }
  finally { scanBusy = false; }
}
function handleScanResult(code){
  code = String(code||'').trim();
  if(!code) return;
  const now = Date.now();
  if(code === lastScanCode && now - lastScanAt < 2500) return;
  lastScanCode = code; lastScanAt = now;

  if(S.scanTarget === 'pbarcode'){
    stopScan();
    setState({ pBarcode: code });
    flash('Barcode terbaca: '+code);
    return;
  }
  const p = DB.products.find(x => x.barcode === code);
  if(!p){ flash('Barcode '+code+' tidak cocok dengan produk mana pun'); return; }
  stopScan();
  setState({ restockId:p.id, restockQty:'' });
  flash(p.name+' ditemukan — masukkan jumlah stok');
}
function stopScan(){
  clearInterval(scanTimer); scanTimer = null;
  if(scanStream){ scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  setState({ scan:false, prodForm: S.scanTarget==='pbarcode' ? true : S.prodForm });
}

/* ---- scan kamera KASIR (stream & state terpisah dari scan admin) ---- */
let kScanStream = null, kScanTimer = null, kScanDetector = null;
let kLastCode = '', kLastAt = 0, kScanBusy = false;

async function startScanKasir(mode) {
  setState({ k_scanMode: mode, k_scanMsg: '', k_scanManual: '' });
  const hasZxing  = 'ZXing' in window;
  const hasNative = 'BarcodeDetector' in window;
  if (!hasNative && !hasZxing) {
    setState({ k_scanMsg: 'Browser tidak mendukung deteksi otomatis — ketik nomor barcode di bawah.' });
    return;
  }
  if (hasNative) {
    kScanDetector = kScanDetector || new BarcodeDetector({ formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39'] });
  }
  try {
    await openKScanDevice(S.k_scanDeviceId);
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    setState({ k_scanDevices: devices });
  } catch(e) {
    const isInsecure = location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
    const msg = isInsecure
      ? 'Kamera diblokir karena koneksi HTTP (tidak aman). Gunakan HTTPS atau buka via localhost — atau ketik nomor barcode di bawah.'
      : 'Kamera tidak tersedia atau izin ditolak — ketik nomor barcode di bawah.';
    setState({ k_scanMsg: msg });
  }
}
async function openKScanDevice(deviceId) {
  clearInterval(kScanTimer); kScanTimer = null;
  if (kScanStream) kScanStream.getTracks().forEach(t => t.stop());
  const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
  const vOpts = deviceId
    ? { deviceId: { exact: deviceId } }
    : isMobile
      ? { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } };
  try {
    kScanStream = await navigator.mediaDevices.getUserMedia({ video: vOpts });
  } catch(e) {
    kScanStream = await navigator.mediaDevices.getUserMedia({ video: true });
  }
  try {
    const track = kScanStream.getVideoTracks()[0];
    if (track && track.getCapabilities) {
      const caps = track.getCapabilities();
      if (caps.focusMode && caps.focusMode.includes('continuous')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      }
    }
  } catch(e){}
  setState({ k_scanDeviceId: kScanStream.getVideoTracks()[0]?.getSettings().deviceId || null, k_scanMsg: '' });
  render();
  kScanTimer = setInterval(kScanTick, 120);
}
async function changeScanDeviceKasir(deviceId) {
  try { await openKScanDevice(deviceId); }
  catch(e) { setState({ k_scanMsg: 'Gagal ganti kamera — coba pilih lagi.' }); }
}
async function kScanTick() {
  const v = document.getElementById('k-scan-video');
  if (!v || v.readyState < 2 || kScanBusy) return;
  kScanBusy = true;
  try {
    let codeFound = null;
    if (kScanDetector) {
      try {
        const codes = await kScanDetector.detect(v);
        if (codes.length && codes[0].rawValue) codeFound = codes[0].rawValue;
      } catch(e){}
    }
    if (!codeFound) {
      codeFound = decodeFrameFromVideo(v);
    }
    } catch(e) { /* frame tidak terbaca */ }
  finally { kScanBusy = false; }
}
function handleScanKasir(code) {
  code = String(code || '').trim();
  if (!code) return;
  const now = Date.now();
  if (code === kLastCode && now - kLastAt < 2500) return;
  kLastCode = code; kLastAt = now;
  document.dispatchEvent(new CustomEvent('k-scan-result', { detail: { code, mode: S.k_scanMode } }));
}
function stopScanKasir() {
  clearInterval(kScanTimer); kScanTimer = null;
  if (kScanStream) { kScanStream.getTracks().forEach(t => t.stop()); kScanStream = null; }
  if (kZxingReader) kZxingReader.reset();
  setState({ k_scanMode: null });
}
async function saveRestockKasir(productId, qty) {
  await api('/api/products/' + productId + '/restock', 'POST', { qty });
  const boot = await api('/api/bootstrap');
  Object.assign(DB, boot);
  setState({ k_restockId: null, k_restockQty: '' });
}

async function saveRestock(){
  const qty = parseInt(S.restockQty)||0;
  if(!qty){ flash('Isi jumlah stok yang ditambahkan'); return; }
  try {
    await api('/api/products/'+S.restockId+'/restock', 'POST', { qty });
    Object.assign(S, { restockId:null });
    await loadAll();
    flash('Stok ditambah '+qty+' pcs');
  } catch(e) { flash(e.message); }
}
async function toggleUser(u){
  try {
    const r = await api('/api/users/'+u.id+'/toggle', 'POST', {});
    await loadAll();
    flash(r.active ? u.name+' diaktifkan' : u.name+' dinonaktifkan');
  } catch(e) { flash(e.message); }
}

/* ================= derived data ================= */
function recvView(){
  return DB.receivables.map(r => {
    const dl = daysLeft(r.due);
    let status, color, bg;
    if(r.paid){ status='Lunas'; color='var(--ok)'; bg='var(--oktint)'; }
    else if(dl < 0){ status='Terlambat'; color='var(--danger)'; bg='var(--dangertint)'; }
    else { status='Belum Lunas'; color='var(--warn)'; bg='var(--warntint)'; }
    return { ...r, dl, status, color, bg, soon: !r.paid && dl <= 3 };
  });
}
function expenseDueView(){
  return DB.expenses.filter(e => e.recurring && !e.paid).map(e => {
    const dl = daysLeft(e.date);
    return { ...e, dl, soon: dl <= 3 };
  });
}
function allBranches(){ return DB.branches.slice(); }
const EMPTY_DASH = { today:0, trend:'', tunai:0, market:0, tempo:0, month:0, trx:0, week:[], top:[] };
function getDash(b){
  if(DB.dash[b]) return DB.dash[b];
  if(b==='Semua'){
    const list = Object.values(DB.dash);
    if(!list.length) return EMPTY_DASH;
    const sum = k => list.reduce((s,d)=>s+(d[k]||0),0);
    const maxWeek = list.reduce((a,d)=>d.week.length>a.length?d.week:a, []);
    const week = maxWeek.map((w,i)=>({ label:w.label, v: +list.reduce((s,d)=>s+((d.week[i]||{}).v||0),0).toFixed(2) }));
    const tops = {};
    list.forEach(d=>d.top.forEach(t=>{ tops[t.name]=(tops[t.name]||0)+t.sold; }));
    const top = Object.entries(tops).map(([name,sold])=>({name,sold})).sort((a,b)=>b.sold-a.sold).slice(0,5);
    return { today:sum('today'), trend:'', tunai:sum('tunai'), market:sum('market'), tempo:sum('tempo'), month:sum('month'), trx:sum('trx'), week, top, semua:true };
  }
  return EMPTY_DASH;
}
const EMPTY_YEARLY = { months:[], year:0 };
function getYearly(b, year){
  const y = DB.yearly[year];
  if(!y) return null; // belum termuat (loadYearly sedang jalan / belum dipicu)
  if(y[b]) return y[b];
  if(b==='Semua'){
    const list = Object.values(y);
    if(!list.length) return EMPTY_YEARLY;
    const maxMonths = list.reduce((a,d)=>d.months.length>a.length?d.months:a, []);
    const months = maxMonths.map((m,i)=>({ label:m.label, v: +list.reduce((s,d)=>s+((d.months[i]||{}).v||0),0).toFixed(2) }));
    return { months, year: list.reduce((s,d)=>s+d.year,0) };
  }
  return EMPTY_YEARLY;
}

/* ================= view model (ported renderVals) ================= */
function renderVals(){
  const branch = S.branch;
  const isDesktop = S.vw >= 900;
  const isMobile = !isDesktop;
  const isNarrow = S.vw < 380;
  const recv = recvView();
  const recvBranch = recv.filter(r => branch==='Semua' || r.cabang === branch);
  const expDueBranch = expenseDueView().filter(e => branch==='Semua' || e.cabang === branch);
  const dueSoon = [
    ...recvBranch.filter(r => r.soon).map(r => ({ ...r, kind:'piutang' })),
    ...expDueBranch.filter(e => e.soon).map(e => ({ ...e, kind:'biaya' })),
  ];
  const bellCount = dueSoon.length;
  const dueSoonRecv = recvBranch.filter(r => r.soon); // KPI "Mendekati/Lewat Tempo" di dashboard = piutang saja (uang masuk); lonceng notifikasi tetap gabungan piutang+biaya di atas

  const D = getDash(branch);
  const wmax = Math.max(...D.week.map(w=>w.v), 0.1);
  const weekBars = D.week.map((w,i)=>{ const today=i===D.week.length-1;
    return { label:w.label, valText:w.v.toFixed(1), valColor: today?'var(--gold)':'var(--muted)',
      h:(w.v/wmax*100).toFixed(0)+'%', fill: today?'linear-gradient(180deg,var(--goldhi),var(--gold))':'var(--barempty)' }; });
  const tmax = Math.max(...D.top.map(t=>t.sold), 1);
  const topProducts = D.top.map(t=>({ name:t.name, soldText:t.sold+' terjual', w:(t.sold/tmax*100).toFixed(0)+'%' }));
  const piutangTotal = recvBranch.filter(r=>!r.paid).reduce((s,r)=>s+r.amount,0);
  const dueSoonTotal = dueSoonRecv.reduce((s,r)=>s+r.amount,0);

  const bellItems = dueSoon.slice().sort((a,b)=>a.dl-b.dl).map(r=>{ const over=r.dl<0;
    return { name: r.kind==='biaya' ? 'Biaya: '+r.category : r.name, amountText:rp(r.amount), cabang:r.cabang,
      dueText: over ? 'Lewat '+Math.abs(r.dl)+'h' : (r.dl===0?'Hari ini':'H-'+r.dl),
      dueColor: over?'var(--danger)':'var(--warn)',
      dotBg: over?'var(--dangertint)':'var(--warntint)', dotColor: over?'var(--danger)':'var(--warn)' }; });

  const sectionTitlesMobile = { dashboard:'Dashboard', piutang:'Piutang', tempo:'Jatuh Tempo', stok:'Stok', users:'User', laporan:'Laporan', produk:'Produk', supplier:'Supplier', promo:'Promo', biaya:'Biaya', shopee:'Shopee' };
  const sectionTitles = { dashboard:'Dashboard', piutang:'Piutang & Tempo', tempo:'Jatuh Tempo', stok:'Manajemen Stok', users:'Manajemen User', laporan:'Laporan Omset', produk:'Produk & Harga', supplier:'Pembelian / Supplier', promo:'Promo & Bundle', biaya:'Biaya Operasional', shopee:'Integrasi Shopee' };
  const adminSet = ['dashboard','piutang','tempo','stok','users','laporan','produk','supplier','promo','biaya','shopee'];

  const chip = (on)=> on ? {bd:'var(--gold)',bg:'var(--goldtint2)',cl:'var(--gold)'} : {bd:'var(--border)',bg:'var(--surface2)',cl:'var(--muted)'};

  const sbDef = [
    {k:'dashboard',label:'Dashboard'},
    {section:'Transaksi'},
    {k:'supplier',label:'Pembelian'},
    {k:'piutang',label:'Piutang'},
    {k:'tempo',label:'Jatuh Tempo',nested:true},
    {k:'biaya',label:'Biaya Operasional'},
    {section:'Inventori'},
    {k:'stok',label:'Manajemen Stok'},
    {k:'produk',label:'Produk & Harga'},
    {k:'promo',label:'Promo & Bundle'},
    {section:'Laporan'},
    {k:'laporan',label:'Laporan Omset'},
    {section:'Pengaturan'},
    {k:'users',label:'Manajemen User'},
    {k:'shopee',label:'Integrasi Shopee'},
  ];
  const sidebarItems = sbDef.map(d=>{
    if(d.section) return { section:d.section };
    const on = S.screen===d.k;
    return { label:d.label, nested:!!d.nested, icon:ic(d.k, on?'var(--gold)':'var(--muted2)', d.nested?16:19),
      bg:on?'var(--goldtint2)':'transparent', cl:on?'var(--gold)':'var(--muted2)', bd:on?'rgba(212,175,55,.4)':'transparent',
      onClick:go(d.k) }; });
  const giftIcon = ic('promo','var(--gold)',26);
  const refreshIcon = ic('refresh','var(--gold)',16);
  const settingsIcon = ic('settings','var(--gold)',16);

  const bottomTabsMore = ['tempo','produk','laporan','users','supplier','promo','biaya','shopee'];
  const moreActive = S.more || bottomTabsMore.includes(S.screen) || S.screen==='settings';
  const bnColor = (on) => on ? 'var(--gold)' : 'var(--muted2)';
  const bottomNav = [
    { key:'dashboard', label:'Beranda', on:S.screen==='dashboard', onClick:go('dashboard') },
    { key:'piutang', label:'Piutang', on:S.screen==='piutang'||S.screen==='tempo', onClick:go('piutang') },
    { key:'stok', label:'Stok', on:S.screen==='stok', onClick:go('stok') },
  ].map(t => ({ ...t, icon:ic(t.key, bnColor(t.on), 21), cl:bnColor(t.on) }));
  const moreDef = [
    {k:'tempo',label:'Jatuh Tempo'}, {k:'produk',label:'Produk & Harga'}, {k:'laporan',label:'Laporan Omset'},
    {k:'users',label:'Manajemen User'}, {k:'supplier',label:'Pembelian'}, {k:'promo',label:'Promo & Bundle'},
    {k:'biaya',label:'Biaya Operasional'}, {k:'shopee',label:'Shopee'},
  ];
  const moreItems = moreDef.map(d => ({ label:d.label, icon:ic(d.k,'var(--gold)',21), onClick:go(d.k) }));

  const pq = S.pq.trim().toLowerCase();
  const piutangRows = recvBranch.filter(r=>{
    if(S.pf==='Belum Lunas' && (r.paid || r.dl<0)) return false;
    if(S.pf==='Terlambat' && !(!r.paid && r.dl<0)) return false;
    if(S.pf==='Lunas' && !r.paid) return false;
    if(pq && !r.name.toLowerCase().includes(pq)) return false;
    return true;
  }).map(r=>({ id:r.id, name:r.name, amountText:rp(r.amount), trxText:fmtDate(r.trx), dueText:fmtDate(r.due),
    status:r.status, color:r.color, bg:r.bg, notPaid:!r.paid, onPaid:()=>markPaid(r.id) }));
  const pfChips = ['Semua','Belum Lunas','Terlambat','Lunas'].map(f=>({ label:f, ...chip(S.pf===f), onClick:()=>setState({pf:f}) }));

  const tempoRows = recvBranch.filter(r=>!r.paid).sort((a,b)=>a.dl-b.dl).map(r=>{ const over=r.dl<0;
    return { id:r.id, name:r.name, amountText:rp(r.amount), dueDateText:fmtDate(r.due),
      badge: over?'Terlambat '+Math.abs(r.dl)+' hari':(r.dl===0?'Jatuh tempo hari ini':'Sisa '+r.dl+' hari'),
      color: over?'var(--danger)':(r.dl<=1?'var(--warn)':'var(--gold)'),
      bg: over?'var(--dangertint)':'var(--warntint)', onPaid:()=>markPaid(r.id) }; });

  const cats=['Semua', ...DB.categories.map(c=>c.name)];
  const stokRows = DB.products.filter(p=>(branch==='Semua'||p.cabang===branch) && (S.stokCat==='Semua'||p.kategori===S.stokCat)).map(p=>{
    let st,c,bg; if(p.stok<=0){st='Habis';c='var(--danger)';bg='var(--dangertint)';} else if(p.stok<=5){st='Menipis';c='var(--warn)';bg='var(--warntint)';} else {st='Aman';c='var(--ok)';bg='var(--oktint)';}
    return { name:p.name, varian:p.varian, kategori:p.kategori, stokText:p.stok+' pcs', status:st, color:c, bg,
      onRestock:()=>setState({restockId:p.id, restockQty:''}) };
  });
  const catChips = cats.map(c=>({ label:c, ...chip(S.stokCat===c), onClick:()=>setState({stokCat:c}) }));

  const userRows = DB.users.filter(u=>(branch==='Semua'||u.cabang===branch) && (S.userRole==='Semua'||u.role===S.userRole)).map(u=>({
    name:u.name, unameText:'@'+u.uname, role:u.role, roleColor:u.role==='Admin'?'var(--gold)':'var(--info)',
    roleBg:u.role==='Admin'?'var(--goldtint2)':'var(--infotint)', cabang:u.cabang,
    statusText:u.active?'Aktif':'Nonaktif', statusColor:u.active?'var(--ok)':'var(--dim)',
    toggleText:u.active?'Nonaktifkan':'Aktifkan',
    onEdit:()=>setState({userForm:true, editUserId:u.id, uName:u.name, uUname:u.uname, uPass:'', uPassShow:false, uRole:u.role, uCabang:u.cabang}),
    onToggle:()=>toggleUser(u) }));
  const uRoleChips = ['Semua','Admin','Kasir'].map(r=>({ label:r, ...chip(S.userRole===r), onClick:()=>setState({userRole:r}) }));

  const produkRows = DB.products.filter(p=>branch==='Semua'||p.cabang===branch).map(p=>{
    const margin=((p.harga-p.modal)/p.harga*100).toFixed(0)+'%';
    let expB=null;
    if(p.exp && p.exp!=='-'){ const d=Math.round((new Date(p.exp+'-01')-TODAY)/86400000);
      if(d<=30) expB={t:'Kedaluwarsa <30 hari',c:'var(--danger)',bg:'var(--dangertint)'};
      else if(d<=60) expB={t:'Kedaluwarsa <60 hari',c:'var(--warn)',bg:'var(--warntint)'};
      else if(d<=90) expB={t:'Kedaluwarsa <90 hari',c:'var(--gold)',bg:'var(--goldtint)'}; }
    return { name:p.name, varian:p.varian, kategori:p.kategori, hargaText:rp(p.harga), modalText:rp(p.modal), margin,
      hasExp:!!expB, expText:expB?expB.t:'', expColor:expB?expB.c:'var(--muted)', expBg:expB?expB.bg:'transparent',
      warnIcon:ic('warn', expB?expB.c:'var(--muted)', 13) };
  });

  const dtot = D.today || 1;
  const ratios={tunai:D.tunai/dtot, market:D.market/dtot, tempo:D.tempo/dtot};
  const curYear = new Date().getFullYear();
  const yCurrent = getYearly(branch, curYear);   // Bulanan = tahun berjalan
  const ySel = getYearly(branch, S.selYear);     // Tahunan = tahun pilihan (bisa beda dari curYear)
  const lapMap={
    Harian:{ total:D.today, bars:D.week.map(w=>({label:w.label, v:w.v})) },
    Mingguan:{ total:Math.round(D.month/4), bars:[{label:'Mg 1',v:D.month/4*0.9/1e6},{label:'Mg 2',v:D.month/4*1.05/1e6},{label:'Mg 3',v:D.month/4*0.95/1e6},{label:'Mg 4',v:D.month/4*1.1/1e6}] },
    Bulanan:{ total:D.month, bars:(yCurrent?.months||[]).slice(-6) }, // 6 bulan terakhir (data asli)
    Tahunan:{ total:(ySel?.year)||0, bars:ySel?.months||[] },         // tahun pilihan, data asli
  };
  const lapSel=lapMap[S.period];
  // loading = tab Bulanan/Tahunan tapi cache-nya belum termuat (getYearly balikin null)
  const lapLoading = (S.period==='Bulanan' ? yCurrent : S.period==='Tahunan' ? ySel : {}) === null;
  const lmax=Math.max(...(lapSel.bars.length?lapSel.bars.map(b=>b.v):[0]), 0.1);
  const lapBars=lapSel.bars.map((b,i)=>({label:b.label, valText:b.v.toFixed(1), h:(b.v/lmax*100).toFixed(0)+'%',
    fill:i===lapSel.bars.length-1?'linear-gradient(180deg,var(--goldhi),var(--gold))':'var(--barempty)', valColor:i===lapSel.bars.length-1?'var(--gold)':'var(--muted)'}));
  const lapTotal=lapSel.total;
  const lapMethods=[{label:'Tunai',amt:lapTotal*ratios.tunai,color:'var(--ok)'},{label:'Marketplace',amt:lapTotal*ratios.market,color:'var(--info)'},{label:'Tempo',amt:lapTotal*ratios.tempo,color:'var(--warn)'}]
    .map(m=>({label:m.label, amountText:rp(m.amt), w:(m.amt/(lapTotal||1)*100).toFixed(0)+'%', color:m.color}));
  const periodChips=['Harian','Mingguan','Bulanan','Tahunan'].map(p=>({label:p, ...chip(S.period===p), onClick:()=>changePeriod(p)}));
  // panah pilih tahun (tampil hanya saat tab Tahunan) — dibatasi 5 tahun ke belakang;
  // ponytail: batas tetap, bukan query MIN(created_at) — cukup untuk skala toko ini
  const yearMin = curYear-5, yearMax = curYear;
  const onPrevYear = S.selYear>yearMin ? ()=>changeSelYear(S.selYear-1) : null;
  const onNextYear = S.selYear<yearMax ? ()=>changeSelYear(S.selYear+1) : null;
  const abList = allBranches();
  const bcMax = Math.max(...abList.map(b=>getDash(b).month), 1);
  const branchCompare = abList.map(b=>{ const d=getDash(b); const on = branch===b || branch==='Semua';
    return { label:b, amountText:rp(d.month), w:(d.month/bcMax*100).toFixed(1)+'%', fill: on?'linear-gradient(90deg,var(--gold),var(--goldhi))':'var(--barempty)' }; });
  const pbMax = Math.max(...abList.map(b=>getDash(b).today), 1);
  const perBranchBars = abList.map(b=>{ const d=getDash(b);
    return { label:b, amountText:rp(d.today), monthText:'Bulan ini '+rpShort(d.month),
      w:(d.today/pbMax*100).toFixed(0)+'%', onClick:()=>setState({branch:b}) }; });

  // penjualan per anggota (tahan skala): daftar peringkat semua user aktif (filter cabang),
  // angka dari byUser[periode]. Pilih pegawai lewat DROPDOWN yang bisa dicari (multi-select).
  const mLoading = DB.byUser[S.uPeriod] === undefined; // belum termuat
  const mTotals = Object.fromEntries((DB.byUser[S.uPeriod]||[]).map(r => [r.uname, r]));
  const mRanked = DB.users
    .filter(u => u.active && (branch==='Semua' || u.cabang===branch))
    .map(u => ({ name:u.name, uname:u.uname, role:u.role, cabang:u.cabang,
      total:+((mTotals[u.uname]||{}).total||0), trx:+((mTotals[u.uname]||{}).trx||0) }))
    .sort((a,b)=>b.total-a.total);
  mRanked.forEach((u,i)=>u.rank=i+1);
  const mMax = Math.max(...mRanked.map(u=>u.total), 1);
  const mSel = new Set(S.selMembers);
  const toggleSel = (uname)=>{ const n=new Set(S.selMembers); if(n.has(uname)) n.delete(uname); else n.add(uname); setState({selMembers:[...n]}); };
  const removeSel = (uname)=>{ const n=new Set(S.selMembers); n.delete(uname); setState({selMembers:[...n]}); };
  // tabel menampilkan yang dipilih; kalau belum ada yang dipilih → semua (peringkat penuh)
  const mVisible = mSel.size ? mRanked.filter(u=>mSel.has(u.uname)) : mRanked;
  const mAllZero = mVisible.length>0 && mVisible.every(u=>u.total===0);
  const memberRows = mVisible.map(u => ({
    rank:u.rank, name:u.name, unameText:'@'+u.uname, roleText:u.role, cabang:u.cabang,
    totalText:rp(u.total), trxText:u.trx+'×', trxLong:u.trx+' transaksi', w:(u.total/mMax*100).toFixed(0)+'%',
    hasSales: u.total>0,
    open: S.memberOpen===u.uname, onDetail: ()=>openMemberDetail(u.uname),
    items: DB.memberItems[u.uname+'|'+S.uPeriod], // undefined = sedang dimuat
  }));
  // isi dropdown: seluruh pegawai, disaring oleh teks pencarian di dalam dropdown
  const mq = S.memberSearch.trim().toLowerCase();
  const memberOptions = (mq ? mRanked.filter(u => (u.name+' @'+u.uname).toLowerCase().includes(mq)) : mRanked)
    .map(u => ({ name:u.name, unameText:'@'+u.uname, roleText:u.role, cabang:u.cabang, totalText: u.total>0?rp(u.total):'',
      checked: mSel.has(u.uname), onClick: ()=>toggleSel(u.uname) }));
  // chip filter aktif: satu chip per pegawai terpilih, bisa dihapus satu-satu
  const memberSelChips = mRanked.filter(u=>mSel.has(u.uname)).map(u=>({ name:u.name, onRemove:()=>removeSel(u.uname) }));
  // footer: kalau ada yang dipilih → jumlah terpilih; kalau tidak → seluruh pegawai
  const memberTotal = mVisible.reduce((s,u)=>s+u.total,0);
  const memberTrx = mVisible.reduce((s,u)=>s+u.trx,0);
  // saran periode lebih luas utk empty-state (Tahunan = sudah paling luas, tak ada saran lagi)
  const uPeriodWider = { Mingguan:'Bulanan', Bulanan:'Tahunan' }[S.uPeriod];

  const supplierTotal=DB.suppliers.filter(s=>!s.paid).reduce((a,s)=>a+s.amount,0);
  const supplierRows=DB.suppliers.map(s=>{ const dl=daysLeft(s.due); const over=dl<0 && !s.paid;
    return { name:s.name, amountText:rp(s.amount), dueText:fmtDate(s.due), notPaid:!s.paid,
      status: s.paid?'Lunas':(over?'Terlambat':'Belum Lunas'), color: s.paid?'var(--ok)':(over?'var(--danger)':'var(--warn)'),
      bg: s.paid?'var(--oktint)':(over?'var(--dangertint)':'var(--warntint)'),
      onPay:()=>paySupplier(s) }; });

  const promoRows = DB.promos.map(p => ({ ...p,
    color: p.type==='Bundle' ? 'var(--gold)' : 'var(--ok)',
    onDelete:()=>deletePromo(p) }));

  const expenseRows = DB.expenses.filter(e => branch==='Semua' || e.cabang===branch).map(e => {
    const dl = e.recurring ? daysLeft(e.date) : null;
    const over = e.recurring && !e.paid && dl < 0;
    const status = e.paid ? 'Lunas' : (e.recurring ? (over?'Terlambat':'Belum Lunas') : 'Tercatat');
    const color = (e.paid || !e.recurring) ? 'var(--ok)' : (over?'var(--danger)':'var(--warn)');
    const bg = (e.paid || !e.recurring) ? 'var(--oktint)' : (over?'var(--dangertint)':'var(--warntint)');
    return { id:e.id, category:e.category, note:e.note, amountText:rp(e.amount), cabang:e.cabang,
      dateText:fmtDate(e.date), recurringText: e.recurring ? 'Rutin · tgl '+e.dueDay : 'Sekali ini',
      status, color, bg, canPay: e.recurring && !e.paid,
      onPay:()=>payExpense(e), onDelete:()=>deleteExpense(e) };
  });
  const curMonth = TODAY.getMonth(), curYearNum = TODAY.getFullYear();
  const expenseMonthTotal = DB.expenses
    .filter(e => (branch==='Semua'||e.cabang===branch))
    .filter(e => { const d = new Date(e.date); return d.getMonth()===curMonth && d.getFullYear()===curYearNum; })
    .reduce((s,e)=>s+e.amount, 0);

  const restockProd = S.restockId !== null ? DB.products.find(p=>p.id===S.restockId) : null;

  return {
    scrLogin: S.screen==='login',
    scrMode: S.screen==='mode',
    scrCashier: S.screen==='cashier', // dirender oleh modul kasir (public/js/kasir.js) via window.SS
    adminShell: S.role==='admin' && adminSet.includes(S.screen),
    secDashboard: S.screen==='dashboard', secPiutang: S.screen==='piutang', secTempo: S.screen==='tempo',
    secStok: S.screen==='stok', secUsers: S.screen==='users', secLaporan: S.screen==='laporan',
    secProduk: S.screen==='produk', secSupplier: S.screen==='supplier', secPromo: S.screen==='promo', secBiaya: S.screen==='biaya', secShopee: S.screen==='shopee',
    sectionTitle: (isMobile ? sectionTitlesMobile[S.screen] : sectionTitles[S.screen]) || 'Dashboard',
    isAdmin: S.role==='admin',
    isNarrow,
    showBranchPin: !isNarrow,
    topbarPadX: isMobile ? 14 : 28,
    topbarGapL: isMobile ? 8 : 12,
    topbarGapR: isMobile ? 6 : 12,
    titleSize: isMobile ? 17 : 21,
    bellSize: isMobile ? 38 : 44,
    branchPadY: isMobile ? 7 : 9,
    branchPadX: isMobile ? 9 : 14,
    branchFont: isMobile ? 12 : 13,
    contentPadX: isMobile ? 14 : 28,
    contentPadTop: isMobile ? 16 : 26,
    sidebarItems, giftIcon, refreshIcon, settingsIcon,
    bottomNav, moreItems, moreOpen:S.more, moreActiveColor:bnColor(moreActive),
    openMore:()=>setState({more:true}), closeMore:()=>setState({more:false}),

    isDesktop, isMobile,
    loginCardW: isDesktop ? '960px' : '440px',
    loginCols: isDesktop ? '1fr 1fr' : '1fr',
    loginBrandDisplay: isDesktop ? 'flex' : 'none',
    modeCols: isDesktop ? '1fr 1fr' : '1fr',
    kpiCols: isDesktop ? 'repeat(4,1fr)' : '1fr',
    dashChartCols: isDesktop ? '1.5fr 1fr' : '1fr',
    dashMethodCols: isDesktop ? '1fr 1fr 1fr 1.3fr' : '1fr',
    lapTopCols: isDesktop ? '1.6fr 1fr' : '1fr',
    sideCollapsed: S.sideCollapsed,
    toggleSidebar: ()=>setState(s=>({sideCollapsed:!s.sideCollapsed})),
    sidebarStyle: S.sideCollapsed
      ? 'width:0;flex:none;background:var(--panel);border-right:1px solid transparent;display:flex;flex-direction:column;padding:20px 0;overflow:hidden;transition:width .22s ease,padding .22s ease;'
      : 'width:252px;flex:none;background:var(--panel);border-right:1px solid var(--divider);display:flex;flex-direction:column;padding:20px 14px;overflow:hidden;transition:width .22s ease,padding .22s ease;',

    uname:S.uname, pass:S.pass, loginErr:S.loginErr,
    onUname:(e)=>setState({uname:e.target.value, loginErr:''}),
    onPass:(e)=>setState({pass:e.target.value}),
    login:()=>login(),
    demoAdmin:()=>setState({uname:'admin',pass:'admin'}),
    demoKasir:()=>setState({uname:'kasir',pass:'kasir'}),

    who:S.who, branch,
    branchLabel: branch==='Semua' ? 'Semua Cabang' : branch,
    settingsBranchText: branch==='Semua' ? 'Semua Cabang' : 'Cabang '+branch,
    tempoScopeText: branch==='Semua' ? 'semua cabang' : 'cabang '+branch,
    isSemua: branch==='Semua',
    topEmpty: D.top.length===0,
    perBranchBars,
    logout:()=>logout(),
    goKasir:go('cashier'), goDash:go('dashboard'), goModeScreen:go('mode'),

    themeClass: S.theme==='light' ? 'theme-light' : 'theme-dark',
    isLight: S.theme==='light',
    isDark: S.theme!=='light',
    toggleTheme:()=>setTheme(S.theme==='light'?'dark':'light'),

    scrSettings: S.screen==='settings',
    openSettings:()=>setState({ settingsBack: S.screen, screen:'settings', more:false, bell:false, navOpen:false }),
    backFromSettings:()=>setState({ screen: S.settingsBack || (S.role==='admin'?'dashboard':'cashier') }),
    profileInitial: (S.who||'U').trim().charAt(0).toUpperCase(),
    roleLabel: S.role==='admin' ? 'Admin / Owner' : 'Kasir',

    bell:S.bell, bellCount, bellItems,
    toggleBell:()=>setState({bell:!S.bell}), closeBell:()=>setState({bell:false}),
    goTempoFromBell:()=> S.role==='admin' ? setState({bell:false, screen:'tempo'}) : setState({bell:false}),

    d_todayText:rp(D.today), d_trendText: D.trend ? D.trend+' dari kemarin' : (D.semua ? 'gabungan semua cabang' : 'Cabang baru — belum ada transaksi'),
    d_tunaiText:rpShort(D.tunai), d_marketText:rpShort(D.market), d_tempoText:rpShort(D.tempo),
    d_monthText:rp(D.month), d_trxCount:D.trx+' transaksi',
    weekBars, topProducts,
    d_piutangText:rp(piutangTotal), d_dueSoonText:dueSoonRecv.length+' tagihan · '+rpShort(dueSoonTotal),

    navPiutang:go('piutang'),
    branchMenu:S.branchMenu,
    toggleBranchMenu:()=>setState({branchMenu:!S.branchMenu, bell:false}),
    closeBranchMenu:()=>setState({branchMenu:false}),
    branchOptions: ['Semua', ...allBranches()].map(b=>({
      label: b==='Semua' ? 'Semua Cabang' : b,
      active: branch===b,
      cl: branch===b ? 'var(--gold)' : 'var(--text)',
      bg: branch===b ? 'var(--goldtint)' : 'transparent',
      fw: branch===b ? '700' : '500',
      onClick: ()=>setState({branch:b, branchMenu:false}),
    })),
    branchForm:S.branchForm, newBranch:S.newBranch,
    openBranchForm:()=>setState({branchForm:true, branchMenu:false, newBranch:''}),
    closeBranchForm:()=>setState({branchForm:false}),
    onNewBranch:(e)=>setState({newBranch:e.target.value}),
    saveBranch:()=>saveBranch(),

    scan:S.scan, closeScan:()=>stopScan(),
    scanMsg:S.scanMsg,
    scanDevices:S.scanDevices, scanDeviceId:S.scanDeviceId, onScanDevice:(e)=>changeScanDevice(e.target.value),
    scanManual:S.scanManual, onScanManual:(e)=>setState({scanManual:e.target.value}),
    useManual:()=>handleScanResult(S.scanManual),

    piutangRows, pfChips, pq:S.pq, onPQ:(e)=>setState({pq:e.target.value}), piutangEmpty:piutangRows.length===0,
    tempoRows, tempoEmpty:tempoRows.length===0,
    stokRows, catChips, openScanStok:()=>startScan('stok'), stokEmpty:stokRows.length===0,
    catForm:S.catForm, newCat:S.newCat,
    openCatForm:()=>setState({catForm:true, newCat:''}),
    closeCatForm:()=>setState({catForm:false}),
    onNewCat:(e)=>setState({newCat:e.target.value}),
    saveCategory:()=>saveCategory(),
    catRows: DB.categories.map(c=>({ id:c.id, name:c.name, onDelete:()=>deleteCategory(c) })),
    userRows, uRoleChips, userForm:S.userForm,
    openUserForm:()=>setState({userForm:true, editUserId:null, uName:'', uUname:'', uPass:'', uPassShow:false, uRole:'Kasir', uCabang: branch==='Semua' ? (allBranches()[0]||'Pleburan') : branch}),
    userFormIsEdit: S.editUserId !== null,
    uPassShow:S.uPassShow, toggleUPass:()=>setState({uPassShow:!S.uPassShow}),
    closeUserForm:()=>setState({userForm:false}),
    uName:S.uName, onUName:(e)=>setState({uName:e.target.value}),
    uUname:S.uUname, onUUname:(e)=>setState({uUname:e.target.value}),
    uPass:S.uPass, onUPass:(e)=>setState({uPass:e.target.value}),
    uRoleTiles: ['Admin','Kasir'].map(r=>({ label:r, on:S.uRole===r, onClick:()=>setState({uRole:r}) })),
    uCabangTiles: allBranches().map(b=>({ label:b, on:S.uCabang===b, onClick:()=>setState({uCabang:b}) })),
    saveUser:()=>saveUser(),
    produkRows, prodForm:S.prodForm,
    kCatOptions: DB.categories.map(c=>c.name),
    prodBranchOptions: allBranches(),
    openProdForm:()=>setState({prodForm:true, pName:'', pVar:'', pKat:(DB.categories[0]||{}).name||'',
      pHarga:'', pModal:'', pStok:'', pBarcode:'', pExp:'',
      pBranch: branch==='Semua' ? (allBranches()[0]||'') : branch }),
    closeProdForm:()=>setState({prodForm:false}),
    pName:S.pName, onPName:(e)=>setState({pName:e.target.value}),
    pVar:S.pVar, onPVar:(e)=>setState({pVar:e.target.value}),
    pKat:S.pKat, onPKat:(e)=>setState({pKat:e.target.value}),
    pHargaText: S.pHarga ? rp(parseInt(S.pHarga)) : '', onPHarga:(e)=>setState({pHarga:(e.target.value||'').replace(/\D/g,'')}),
    pModalText: S.pModal ? rp(parseInt(S.pModal)) : '', onPModal:(e)=>setState({pModal:(e.target.value||'').replace(/\D/g,'')}),
    pStok:S.pStok, onPStok:(e)=>setState({pStok:(e.target.value||'').replace(/\D/g,'')}),
    pBarcode:S.pBarcode, onPBarcode:(e)=>setState({pBarcode:e.target.value}),
    pExp:S.pExp, onPExp:(e)=>setState({pExp:e.target.value}),
    pBranch:S.pBranch, onPBranch:(e)=>setState({pBranch:e.target.value}),
    openScan:()=>startScan('pbarcode'), // tombol scan di form produk → isi kolom barcode
    saveProd:()=>saveProduct(),
    lapBars, lapTotalText:rp(lapTotal), lapMethods, periodChips, branchCompare, period:S.period,
    lapLoading, selYearText:String(S.selYear), onPrevYear, onNextYear,
    uPeriod:S.uPeriod,
    uPeriodChips: ['Mingguan','Bulanan','Tahunan'].map(p=>({label:p, ...chip(S.uPeriod===p), onClick:()=>changeUPeriod(p)})),
    memberRows, memberLoading: mLoading,
    memberNoData: !mLoading && mRanked.length===0,
    memberAllZero: !mLoading && mAllZero,
    memberWiderPeriodLabel: uPeriodWider, onMemberWiderPeriod: uPeriodWider ? ()=>changeUPeriod(uPeriodWider) : null,
    // dropdown pilih pegawai (bisa dicari, multi-select) — panel di-portal ke root level
    // (lihat memberDdPanelHtml + html(V)) supaya lolos dari ancestor overflow:hidden
    // konten admin; posisinya dihitung dari #btn-memberdd tiap render (lihat render()).
    memberDropdown: S.memberDropdown,
    memberDdLabel: mSel.size ? mSel.size+' pegawai dipilih' : 'Semua pegawai',
    toggleMemberDd: ()=>setState({memberDropdown:!S.memberDropdown, memberSearch:''}),
    closeMemberDd: ()=>setState({memberDropdown:false}),
    memberSearch:S.memberSearch, onMemberSearch:(e)=>setState({memberSearch:e.target.value}),
    memberOptions, memberOptionsEmpty: memberOptions.length===0,
    memberSelCount: mSel.size,
    memberSelChips,
    memberToolbarCountText: mSel.size ? mSel.size+' dari '+mRanked.length+' pegawai' : mRanked.length+' pegawai',
    clearMemberSel: ()=>setState({selMembers:[]}),
    memberTotalText: rp(memberTotal), memberTrxText: memberTrx+' transaksi',
    memberFooterLabel: mSel.size ? mSel.size+' pegawai terpilih' : mRanked.length+' pegawai',
    memberCountText: mRanked.length+' pegawai',
    supplierRows, supplierTotalText:rp(supplierTotal),
    poForm:S.poForm,
    newPO:()=>setState({poForm:true, poName:'', poAmount:'', poDue:''}),
    closePoForm:()=>setState({poForm:false}),
    poName:S.poName, onPoName:(e)=>setState({poName:e.target.value}),
    poAmountText: S.poAmount ? rp(parseInt(S.poAmount)) : '', onPoAmount:(e)=>setState({poAmount:(e.target.value||'').replace(/\D/g,'')}),
    poDue:S.poDue, onPoDue:(e)=>setState({poDue:e.target.value}),
    saveSupplier:()=>saveSupplier(),

    promoRows,
    promoForm:S.promoForm,
    newPromo:()=>setState({promoForm:true, prName:'', prDesc:'', prType:'Bundle', prValue:''}),
    closePromoForm:()=>setState({promoForm:false}),
    prName:S.prName, onPrName:(e)=>setState({prName:e.target.value}),
    prDesc:S.prDesc, onPrDesc:(e)=>setState({prDesc:e.target.value}),
    prValue:S.prValue, onPrValue:(e)=>setState({prValue:e.target.value}),
    prTypeTiles: ['Bundle','Diskon'].map(t=>({ label:t, on:S.prType===t, onClick:()=>setState({prType:t}) })),
    savePromo:()=>savePromo(),

    expenseRows, expenseMonthTotalText: rp(expenseMonthTotal), expenseEmpty: expenseRows.length===0,

    biayaForm:S.biayaForm,
    newBiaya:()=>setState({biayaForm:true, bxCategory:'Sewa', bxNote:'', bxAmount:'', bxBranch: branch==='Semua' ? (allBranches()[0]||'') : branch, bxRecurring:false, bxDueDay:'', bxDate:''}),
    closeBiayaForm:()=>setState({biayaForm:false}),
    bxCategory:S.bxCategory, onBxCategory:(e)=>setState({bxCategory:e.target.value}),
    bxNote:S.bxNote, onBxNote:(e)=>setState({bxNote:e.target.value}),
    bxAmountText: S.bxAmount ? rp(parseInt(S.bxAmount)) : '', onBxAmount:(e)=>setState({bxAmount:(e.target.value||'').replace(/\D/g,'')}),
    bxBranch:S.bxBranch, onBxBranch:(e)=>setState({bxBranch:e.target.value}),
    bxRecurring:S.bxRecurring,
    bxTypeTiles: ['Sekali Ini','Rutin Bulanan'].map(t=>({ label:t, on:(t==='Rutin Bulanan')===S.bxRecurring, onClick:()=>setState({bxRecurring: t==='Rutin Bulanan'}) })),
    bxDueDay:S.bxDueDay, onBxDueDay:(e)=>setState({bxDueDay:(e.target.value||'').replace(/\D/g,'')}),
    bxDate:S.bxDate, onBxDate:(e)=>setState({bxDate:e.target.value}),
    bxCategoryOptions: ['Sewa','Listrik','Sampah','Plastik','Lainnya'],
    saveExpense:()=>saveExpense(),

    restockOpen: restockProd !== null,
    restockName: restockProd ? restockProd.name+' · '+restockProd.varian : '',
    restockStokText: restockProd ? restockProd.stok+' pcs' : '',
    restockQty:S.restockQty, onRestockQty:(e)=>setState({restockQty:(e.target.value||'').replace(/\D/g,'')}),
    closeRestock:()=>setState({restockId:null}),
    saveRestock:()=>saveRestock(),

    toast:S.toast,
  };
}

/* ================= shared svg snippets ================= */
const svgBrand = w => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none"><path d="M4 9v6M20 9v6M7 7v10M17 7v10M7 12h10" stroke="#D4AF37" stroke-width="2" stroke-linecap="round"></path></svg>`;
const svgDumb = w => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none"><path d="M5 9v6M19 9v6M8 7.5v9M16 7.5v9M8 12h8" stroke="#D4AF37" stroke-width="2" stroke-linecap="round"></path></svg>`;
const svgSun = w => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.5" stroke="#D4AF37" stroke-width="1.8"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" stroke="#D4AF37" stroke-width="1.8" stroke-linecap="round"></path></svg>`;
const svgMoon = w => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke="#D4AF37" stroke-width="1.8" stroke-linejoin="round"></path></svg>`;
const svgBellIc = w => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke="#D4AF37" stroke-width="1.7" stroke-linejoin="round"></path><path d="M10 20a2 2 0 0 0 4 0" stroke="#D4AF37" stroke-width="1.7" stroke-linecap="round"></path></svg>`;
const svgGear = w => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="#D4AF37" stroke-width="1.7"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="#D4AF37" stroke-width="1.7"></path></svg>`;
const svgScanIc = w => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M6 12h12" stroke="#D4AF37" stroke-width="1.8" stroke-linecap="round"></path></svg>`;
const svgSearchIc = (w,left) => `<svg style="position:absolute;left:${left}px;" width="${w}" height="${w}" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="#6c6c74" stroke-width="1.8"></circle><path d="M16 16l4 4" stroke="#6c6c74" stroke-width="1.8" stroke-linecap="round"></path></svg>`;
const svgCartIc = w => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none"><path d="M3 4h2l2.4 12.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L21 8H6" stroke="#D4AF37" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="9" cy="20" r="1.4" fill="#D4AF37"></circle><circle cx="18" cy="20" r="1.4" fill="#D4AF37"></circle></svg>`;
const themeBtn = (V, box, icon, rad) => `<button ${A(V.toggleTheme)} style="width:${box}px;height:${box}px;border-radius:${rad}px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;">${V.isLight ? svgSun(icon) : svgMoon(icon)}</button>`;
const lbl = t => `<label style="display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-family:'Saira',sans-serif;font-weight:600;margin-bottom:6px;">${t}</label>`;
const inputStyle = h => `width:100%;box-sizing:border-box;height:${h}px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;padding:0 12px;outline:none;font-family:'Hanken Grotesk',sans-serif;`;


/* ================= LOGIN ================= */
function loginHtml(V){
  return `
  <div class="scrl" style="height:100dvh; overflow-y:auto; display:flex; padding:40px; background:radial-gradient(100% 80% at 50% 0%, var(--surface2) 0%, var(--bg) 60%);">
    <div style="margin:auto; width:${V.loginCardW}; max-width:100%; display:grid; grid-template-columns:${V.loginCols}; border-radius:28px; overflow:hidden; box-shadow:0 50px 110px -30px rgba(0,0,0,.85); border:1px solid var(--chip);">
      <div style="background:radial-gradient(120% 100% at 0% 0%, rgba(212,175,55,.18), transparent 55%), linear-gradient(160deg,var(--g1),var(--bg)); padding:56px 48px; display:${V.loginBrandDisplay}; flex-direction:column; justify-content:space-between; position:relative;">
        <div style="display:flex; align-items:center; gap:14px;">
          <div style="width:60px;height:60px;border-radius:18px;background:linear-gradient(160deg,var(--g7),var(--g8));border:1.5px solid var(--goldborder);display:flex;align-items:center;justify-content:center;">${svgBrand(34)}</div>
          <div>
            <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:18px;line-height:1;">SUPLEMEN <span style="color:var(--gold);">SEMARANG</span></div>
            <div style="font-family:'Saira',sans-serif;font-weight:600;font-size:11px;letter-spacing:.4em;color:var(--muted);margin-top:5px;">S T O R E</div>
          </div>
        </div>
        <div>
          <div style="font-family:'Saira',sans-serif;font-weight:900;font-size:40px;line-height:1.05;letter-spacing:-.01em;">Your Nutrition<br><span style="color:var(--gold);">Solution.</span></div>
          <p style="color:var(--muted);font-size:14px;line-height:1.6;margin-top:18px;max-width:330px;">Sistem operasional internal — kasir, stok, piutang &amp; laporan untuk cabang Pleburan dan Surakarta.</p>
        </div>
        <div style="display:flex;gap:10px;"></div>
      </div>
      <div style="background:var(--panel); padding:56px 48px; display:flex; flex-direction:column; justify-content:center;">
        <h1 style="font-family:'Saira',sans-serif;font-weight:800;font-size:26px;margin:0 0 6px;">Masuk ke Sistem</h1>
        <p style="color:var(--muted);font-size:13.5px;margin:0 0 28px;">Sistem akan mengenali peran Anda otomatis.</p>
        <label style="font-family:'Saira',sans-serif;font-weight:600;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:7px;display:block;">Username</label>
        <input id="i-uname" value="${esc(V.uname)}" ${I(V.onUname)} placeholder="admin atau kasir" style="width:100%;height:50px;border-radius:13px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);font-size:15px;padding:0 16px;outline:none;font-family:'Hanken Grotesk',sans-serif;margin-bottom:16px;">
        <label style="font-family:'Saira',sans-serif;font-weight:600;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:7px;display:block;">Password</label>
        <input id="i-pass" value="${esc(V.pass)}" ${I(V.onPass)} type="password" placeholder="••••••••" style="width:100%;height:50px;border-radius:13px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);font-size:15px;padding:0 16px;outline:none;font-family:'Hanken Grotesk',sans-serif;">
        ${V.loginErr ? `<div style="color:var(--danger);font-size:13px;margin-top:12px;">${esc(V.loginErr)}</div>` : ''}
        <button ${A(V.login)} class="fx-press" style="width:100%;height:54px;margin-top:26px;border:none;border-radius:14px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:16px;letter-spacing:.08em;cursor:pointer;box-shadow:0 12px 26px -10px rgba(212,175,55,.55);">MASUK</button>
        <div style="display:flex;gap:8px;margin-top:20px;align-items:center;">
          <span style="font-size:12px;color:var(--dim);">Demo cepat:</span>
          <button ${A(V.demoAdmin)} style="background:var(--goldtint);color:var(--gold);border:1px solid var(--goldborder);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">admin</button>
          <button ${A(V.demoKasir)} style="background:var(--hover);color:var(--text2);border:1px solid var(--border);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">kasir</button>
        </div>
      </div>
    </div>
  </div>`;
}

/* ================= MODE PICKER ================= */
function modeHtml(V){
  return `
  <div class="scrl" style="height:100dvh;overflow-y:auto;display:flex;flex-direction:column;padding:40px;background:radial-gradient(90% 70% at 50% 0%, var(--goldtint), transparent 55%);">
    <div style="margin:auto;width:820px;max-width:100%;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:34px;">
        <div style="min-width:0;">
          <div style="font-size:14px;color:var(--muted);">Selamat datang kembali</div>
          <h2 style="font-family:'Saira',sans-serif;font-weight:800;font-size:34px;line-height:1.15;margin:8px 0 6px;white-space:nowrap;">Halo, ${esc(V.who)}.</h2>
          <div style="font-size:17px;color:var(--gold);">Mau ke mana?</div>
        </div>
        <button ${A(V.logout)} class="ss-logout-pill" style="background:none;border:1px solid var(--border);color:var(--muted);border-radius:11px;padding:9px 16px;font-size:13px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;transition:background .15s ease,border-color .15s ease,color .15s ease;">Keluar</button>
      </div>
      <div style="display:grid;grid-template-columns:${V.modeCols};gap:22px;">
        <button ${A(V.goKasir)} class="ss-modecard" style="text-align:left;cursor:pointer;border:1.5px solid var(--border);background:linear-gradient(150deg,var(--surface3),var(--g9));box-shadow:var(--modeshadow);border-radius:24px;padding:32px;font-family:'Hanken Grotesk',sans-serif;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease;">
          <div style="width:72px;height:72px;border-radius:20px;background:var(--modetile);display:flex;align-items:center;justify-content:center;margin-bottom:22px;">
            <svg data-icon="modepick" width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M3 4h2l2.4 12.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L21 8H6" stroke="#D4AF37" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="9" cy="20" r="1.4" fill="#D4AF37"></circle><circle cx="18" cy="20" r="1.4" fill="#D4AF37"></circle></svg>
          </div>
          <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:24px;color:var(--text);">Buka Kasir</div>
          <div style="font-size:14px;color:var(--muted);margin-top:6px;">Layani pembeli &amp; catat transaksi penjualan.</div>
        </button>
        <button ${A(V.goDash)} class="ss-modecard" style="text-align:left;cursor:pointer;border:1.5px solid var(--border);background:linear-gradient(150deg,var(--surface3),var(--g9));box-shadow:var(--modeshadow);border-radius:24px;padding:32px;font-family:'Hanken Grotesk',sans-serif;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease;">
          <div style="width:72px;height:72px;border-radius:20px;background:var(--modetile);display:flex;align-items:center;justify-content:center;margin-bottom:22px;">
            <svg data-icon="modepick" width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-8" stroke="#D4AF37" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>
          </div>
          <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:24px;color:var(--text);">Buka Dashboard Admin</div>
          <div style="font-size:14px;color:var(--muted);margin-top:6px;">Laporan, stok, piutang &amp; manajemen user.</div>
        </button>
      </div>
      <div style="text-align:center;font-size:13px;color:var(--dim2);margin-top:26px;">Anda bisa berpindah mode kapan saja dari dalam aplikasi.</div>
    </div>
  </div>`;
}

/* ================= ADMIN sections ================= */
const badge = (color,bg,text,fs) => `<span style="font-size:${fs||11}px;font-weight:700;padding:4px 9px;border-radius:7px;color:${color};background:${bg};">${text}</span>`;
const chevronIc = (open,size) => `<svg width="${size||11}" height="${size||11}" viewBox="0 0 24 24" fill="none" style="display:inline-block;vertical-align:middle;flex:none;transition:transform .15s ease;transform:rotate(${open?90:0}deg);"><path d="M9 6l6 6-6 6" style="stroke:var(--muted);fill:none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

// rincian produk yang dijual satu anggota (drill-down, dimuat saat baris diklik)
function memberDetailHtml(m){
  if(m.items === undefined) return `<div style="margin-top:10px;font-size:12.5px;color:var(--muted);">Memuat rincian produk…</div>`;
  if(m.items.length === 0) return `<div style="margin-top:10px;font-size:12.5px;color:var(--dim2);">Tidak ada penjualan produk pada periode ini.</div>`;
  return `<div style="margin-top:11px;border-top:1px dashed var(--border);padding-top:10px;display:flex;flex-direction:column;gap:6px;">
    ${m.items.map(it => `
      <div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;">
        <span style="min-width:0;">${esc(it.name)} <span style="color:var(--muted);">· ${esc(it.varian)}</span></span>
        <span style="white-space:nowrap;"><span style="font-weight:700;">${+it.qty} pcs</span> <span style="color:var(--muted);">· ${rp(+it.total)}</span></span>
      </div>`).join('')}
  </div>`;
}

function secDashboardHtml(V){
  return `<div style="${V.popScreen}">
    <div style="display:grid;grid-template-columns:${V.kpiCols};gap:16px;margin-bottom:18px;">
      <div style="border-radius:18px;padding:18px;background:linear-gradient(150deg,var(--g2),var(--g1));box-shadow:var(--cardshadow);border:1px solid var(--goldborder);">
        <div style="font-size:12.5px;color:var(--goldsoft);">Pemasukan Hari Ini</div>
        <div style="font-family:'Saira',sans-serif;font-weight:900;font-size:27px;margin:6px 0 3px;line-height:1;">${V.d_todayText}</div>
        <div style="font-size:12px;color:var(--ok);">${V.d_trendText}</div>
      </div>
      <div style="border-radius:18px;padding:18px;background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);">
        <div style="font-size:12.5px;color:var(--muted);">Omset Bulan Ini</div>
        <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:23px;margin-top:6px;line-height:1.1;">${V.d_monthText}</div>
      </div>
      <div style="border-radius:18px;padding:18px;background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);">
        <div style="font-size:12.5px;color:var(--muted);">Transaksi Hari Ini</div>
        <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:23px;margin-top:6px;line-height:1.1;">${V.d_trxCount}</div>
      </div>
      <div style="border-radius:18px;padding:18px;background:linear-gradient(150deg,var(--g5),var(--g6));box-shadow:var(--cardshadow);border:1px solid var(--dangerborder);">
        <div style="font-size:12.5px;color:var(--dangersoft);">Piutang Berjalan</div>
        <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:23px;margin-top:6px;line-height:1.1;">${V.d_piutangText}</div>
      </div>
    </div>
    ${V.isSemua ? `
      <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:18px;padding:20px;margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px;flex-wrap:wrap;gap:6px;">
          <span style="font-family:'Saira',sans-serif;font-weight:700;font-size:15px;">Performa per Cabang</span>
          <span style="font-size:12px;color:var(--muted);">pemasukan hari ini · ketuk cabang untuk membuka</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:15px;">
          ${V.perBranchBars.map(b => `
            <button ${A(b.onClick)} style="display:block;width:100%;background:none;border:none;padding:0;cursor:pointer;text-align:left;font-family:'Hanken Grotesk',sans-serif;">
              <div style="display:flex;justify-content:space-between;margin-bottom:7px;">
                <span style="font-size:13.5px;font-weight:600;color:var(--text);">${esc(b.label)}</span>
                <span style="font-size:13.5px;color:var(--text);font-weight:700;font-family:'Saira',sans-serif;">${b.amountText}</span>
              </div>
              <div style="height:9px;border-radius:5px;background:var(--barempty);overflow:hidden;"><div style="height:100%;border-radius:5px;background:linear-gradient(90deg,var(--gold),var(--goldhi));width:${b.w};"></div></div>
              <div style="font-size:11.5px;color:var(--muted);margin-top:5px;">${b.monthText}</div>
            </button>`).join('')}
        </div>
      </div>` : ''}
    <div style="display:grid;grid-template-columns:${V.dashChartCols};gap:16px;margin-bottom:18px;">
      <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:18px;padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:20px;">
          <span style="font-family:'Saira',sans-serif;font-weight:700;font-size:15px;">Penjualan Minggu Ini</span>
          <span style="font-size:12px;color:var(--muted);">dalam juta Rupiah</span>
        </div>
        <div style="display:flex;align-items:flex-end;justify-content:space-between;height:180px;gap:12px;">
          ${V.weekBars.map(b => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:9px;height:100%;justify-content:flex-end;">
              <span style="font-family:'Saira',sans-serif;font-weight:700;font-size:12px;color:${b.valColor};">${b.valText}</span>
              <div style="width:100%;border-radius:8px 8px 4px 4px;background:${b.fill};height:${b.h};min-height:5px;"></div>
              <span style="font-size:11px;color:var(--muted);">${b.label}</span>
            </div>`).join('')}
        </div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:18px;padding:20px;">
        <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:15px;margin-bottom:18px;">Barang Paling Laku</div>
        ${V.topEmpty ? `<div style="border:1px dashed var(--border);border-radius:14px;padding:26px;text-align:center;color:var(--dim2);font-size:13px;">Belum ada penjualan di cabang ini.</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:15px;">
          ${V.topProducts.map(t => `
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:7px;"><span style="font-size:13px;">${esc(t.name)}</span><span style="font-size:12.5px;color:var(--muted);">${t.soldText}</span></div>
              <div style="height:8px;border-radius:4px;background:var(--chip);overflow:hidden;"><div style="height:100%;border-radius:4px;background:linear-gradient(90deg,var(--gold),var(--goldhi));width:${t.w};"></div></div>
            </div>`).join('')}
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:${V.dashMethodCols};gap:16px;">
      <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:16px;padding:16px;"><div style="font-size:12px;color:var(--muted);">Tunai</div><div style="font-family:'Saira',sans-serif;font-weight:700;font-size:20px;margin-top:5px;">${V.d_tunaiText}</div></div>
      <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:16px;padding:16px;"><div style="font-size:12px;color:var(--muted);">Marketplace</div><div style="font-family:'Saira',sans-serif;font-weight:700;font-size:20px;margin-top:5px;">${V.d_marketText}</div></div>
      <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:16px;padding:16px;"><div style="font-size:12px;color:var(--muted);">Tempo</div><div style="font-family:'Saira',sans-serif;font-weight:700;font-size:20px;margin-top:5px;">${V.d_tempoText}</div></div>
      <div style="background:linear-gradient(150deg,var(--g5),var(--g6));box-shadow:var(--cardshadow);border:1px solid var(--dangerborder);border-radius:16px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;">
        <div style="font-size:12px;color:var(--dangersoft);">Mendekati / Lewat Tempo</div>
        <div style="display:flex;align-items:flex-end;justify-content:space-between;"><span style="font-family:'Saira',sans-serif;font-weight:700;font-size:15px;color:var(--danger);">${V.d_dueSoonText}</span><button ${A(V.navPiutang)} style="background:none;border:none;color:var(--gold);font-size:12px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Kelola ›</button></div>
      </div>
    </div>
  </div>`;
}

function secPiutangHtml(V){
  return `<div style="${V.popScreen}">
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:18px;">
      <div style="position:relative;display:flex;align-items:center;width:100%;max-width:420px;">
        ${svgSearchIc(17,14)}
        <input id="i-pq" value="${esc(V.pq)}" ${I(V.onPQ)} placeholder="Cari nama pembeli…" style="width:100%;height:46px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;padding:0 14px 0 40px;outline:none;font-family:'Hanken Grotesk',sans-serif;">
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${V.pfChips.map(c => `<button ${A(c.onClick)} style="flex:none;white-space:nowrap;height:40px;padding:0 15px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;border:1px solid ${c.bd};background:${c.bg};color:${c.cl};">${c.label}</button>`).join('')}
      </div>
    </div>
    ${V.piutangEmpty ? `<div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:16px;padding:30px;text-align:center;color:var(--dim2);font-size:14px;">Tidak ada data.</div>` : ''}
    ${V.isDesktop ? `
      <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:16px;overflow:hidden;">
        <div style="display:grid;grid-template-columns:2fr 1.3fr 1fr 1fr 1.2fr 1.2fr;padding:14px 18px;border-bottom:1px solid var(--border2);font-family:'Saira',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);">
          <span>Pembeli</span><span>Nominal</span><span>Transaksi</span><span>Tempo</span><span>Status</span><span style="text-align:right;">Aksi</span>
        </div>
        ${V.piutangRows.map(r => `
          <div style="display:grid;grid-template-columns:2fr 1.3fr 1fr 1fr 1.2fr 1.2fr;padding:15px 18px;border-bottom:1px solid var(--divider);align-items:center;font-size:13.5px;">
            <span style="font-weight:600;">${esc(r.name)}</span>
            <span style="font-family:'Saira',sans-serif;font-weight:700;">${r.amountText}</span>
            <span style="color:var(--muted);">${r.trxText}</span>
            <span style="color:var(--muted);">${r.dueText}</span>
            <span>${badge(r.color,r.bg,r.status)}</span>
            <span style="text-align:right;">${r.notPaid ? `<button ${A(r.onPaid)} style="height:34px;padding:0 13px;border-radius:9px;background:var(--oktint);border:1px solid var(--okborder);color:var(--ok);font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Tandai Lunas</button>` : ''}</span>
          </div>`).join('')}
      </div>` : `
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${V.piutangRows.map(r => `
          <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:15px;padding:14px 16px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
              <span style="font-weight:600;font-size:14.5px;min-width:0;word-break:break-word;">${esc(r.name)}</span>
              <span style="font-size:11px;font-weight:700;padding:4px 9px;border-radius:7px;color:${r.color};background:${r.bg};white-space:nowrap;flex:none;">${r.status}</span>
            </div>
            <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:21px;margin-top:9px;">${r.amountText}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:5px;">Transaksi ${r.trxText} · Tempo ${r.dueText}</div>
            ${r.notPaid ? `<button ${A(r.onPaid)} style="width:100%;margin-top:12px;height:40px;border-radius:10px;background:var(--oktint);border:1px solid var(--okborder);color:var(--ok);font-size:13px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Tandai Lunas</button>` : ''}
          </div>`).join('')}
      </div>`}
  </div>`;
}

function secTempoHtml(V){
  return `<div style="${V.popScreen}">
    <div style="font-size:14px;color:var(--muted);margin-bottom:18px;">Piutang yang mendekati &amp; melewati jatuh tempo di ${esc(V.tempoScopeText)}.</div>
    ${V.tempoEmpty ? `<div style="border:1px dashed var(--border);border-radius:16px;padding:36px;text-align:center;color:var(--dim2);font-size:14px;">Tidak ada tagihan mendekati tempo.</div>` : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px;">
      ${V.tempoRows.map(r => `
        <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:15px;padding:16px;border-left:3px solid ${r.color};">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:15px;font-weight:600;">${esc(r.name)}</div>
            <span style="font-size:11px;font-weight:700;padding:4px 9px;border-radius:7px;color:${r.color};background:${r.bg};white-space:nowrap;">${r.badge}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;">
            <div><div style="font-family:'Saira',sans-serif;font-weight:800;font-size:20px;">${r.amountText}</div><div style="font-size:12px;color:var(--muted);">Tempo ${r.dueDateText}</div></div>
            <button ${A(r.onPaid)} style="height:36px;padding:0 15px;border-radius:10px;background:var(--oktint);border:1px solid var(--okborder);color:var(--ok);font-size:13px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Tandai Lunas</button>
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}

function secStokHtml(V){
  return `<div style="${V.popScreen}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;gap:12px;flex-wrap:wrap;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${V.catChips.map(c => `<button ${A(c.onClick)} style="height:38px;padding:0 14px;border-radius:10px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;border:1px solid ${c.bd};background:${c.bg};color:${c.cl};">${c.label}</button>`).join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button ${A(V.openCatForm)} style="height:42px;padding:0 16px;border-radius:12px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-size:13.5px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Kelola Kategori</button>
        <button ${A(V.openScanStok)} style="height:42px;padding:0 18px;border-radius:12px;border:1px dashed var(--goldborder);background:var(--goldtint);color:var(--gold);font-size:13.5px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;display:flex;align-items:center;gap:9px;">${svgScanIc(18)}Tambah Stok via Scan</button>
      </div>
    </div>
    ${V.isDesktop ? `
      <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:16px;overflow:hidden;">
        <div style="display:grid;grid-template-columns:2.4fr 1.3fr 1fr 1fr;padding:14px 18px;border-bottom:1px solid var(--border2);font-family:'Saira',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);">
          <span>Produk</span><span>Kategori</span><span>Stok</span><span style="text-align:right;">Status</span>
        </div>
        ${V.stokRows.map(p => `
          <div style="display:grid;grid-template-columns:2.4fr 1.3fr 1fr 1fr;padding:15px 18px;border-bottom:1px solid var(--divider);align-items:center;font-size:13.5px;">
            <span><span style="font-weight:600;">${esc(p.name)}</span> <span style="color:var(--muted);">· ${esc(p.varian)}</span></span>
            <span style="color:var(--muted);">${p.kategori}</span>
            <span style="display:flex;align-items:center;gap:8px;"><span style="font-family:'Saira',sans-serif;font-weight:700;">${p.stokText}</span><button ${A(p.onRestock)} title="restok-${esc(p.name)}" style="height:26px;padding:0 9px;border-radius:8px;background:var(--goldtint);border:1px solid var(--goldborder);color:var(--gold);font-size:11.5px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">+ Stok</button></span>
            <span style="text-align:right;">${badge(p.color,p.bg,p.status)}</span>
          </div>`).join('')}
      </div>` : `
      <div style="display:flex;flex-direction:column;gap:9px;">
        ${V.stokRows.map(p => `
          <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:14px;padding:13px 15px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <div style="min-width:0;">
              <div style="font-weight:600;font-size:13.5px;">${esc(p.name)}</div>
              <div style="font-size:11.5px;color:var(--muted);margin-top:2px;">${esc(p.varian)} · ${p.kategori}</div>
            </div>
            <div style="text-align:right;flex:none;">
              <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:14px;">${p.stokText}</div>
              <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;color:${p.color};background:${p.bg};display:inline-block;margin-top:3px;">${p.status}</span>
              <div><button ${A(p.onRestock)} title="restok-${esc(p.name)}" style="margin-top:6px;height:26px;padding:0 10px;border-radius:8px;background:var(--goldtint);border:1px solid var(--goldborder);color:var(--gold);font-size:11px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">+ Stok</button></div>
            </div>
          </div>`).join('')}
      </div>`}
  </div>`;
}

function secUsersHtml(V){
  return `<div style="${V.popScreen}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;gap:12px;flex-wrap:wrap;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${V.uRoleChips.map(c => `<button ${A(c.onClick)} style="height:40px;padding:0 16px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;border:1px solid ${c.bd};background:${c.bg};color:${c.cl};">${c.label}</button>`).join('')}
      </div>
      <button ${A(V.openUserForm)} style="height:44px;padding:0 20px;border-radius:12px;border:none;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-size:14px;font-weight:700;cursor:pointer;font-family:'Saira',sans-serif;letter-spacing:.03em;">+ Tambah User Baru</button>
    </div>
    ${V.isDesktop ? `
      <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:16px;overflow:hidden;">
        <div style="display:grid;grid-template-columns:2fr 1fr 1.2fr 1fr 1.4fr;padding:14px 18px;border-bottom:1px solid var(--border2);font-family:'Saira',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);">
          <span>Nama</span><span>Role</span><span>Cabang</span><span>Status</span><span style="text-align:right;">Aksi</span>
        </div>
        ${V.userRows.map(u => `
          <div style="display:grid;grid-template-columns:2fr 1fr 1.2fr 1fr 1.4fr;padding:14px 18px;border-bottom:1px solid var(--divider);align-items:center;font-size:13.5px;">
            <span><span style="font-weight:600;">${esc(u.name)}</span><br><span style="font-size:11.5px;color:var(--muted);">${esc(u.unameText)}</span></span>
            <span><span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:7px;color:${u.roleColor};background:${u.roleBg};">${u.role}</span></span>
            <span style="color:var(--text2);">${esc(u.cabang)}</span>
            <span style="color:${u.statusColor};font-weight:600;">${u.statusText}</span>
            <span style="text-align:right;display:flex;gap:8px;justify-content:flex-end;">
              <button ${A(u.onEdit)} style="height:32px;padding:0 13px;border-radius:8px;background:var(--chip);border:1px solid var(--border);color:var(--text2);font-size:12px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Edit</button>
              <button ${A(u.onToggle)} style="height:32px;padding:0 13px;border-radius:8px;background:var(--dangertint);border:1px solid var(--dangerborder);color:var(--danger);font-size:12px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">${u.toggleText}</button>
            </span>
          </div>`).join('')}
      </div>` : `
      <div style="display:flex;flex-direction:column;gap:9px;">
        ${V.userRows.map(u => `
          <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:14px;padding:13px 15px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <div style="display:flex;align-items:center;gap:11px;min-width:0;">
                <div style="width:38px;height:38px;flex:none;border-radius:11px;background:${u.roleBg};display:flex;align-items:center;justify-content:center;font-family:'Saira',sans-serif;font-weight:800;font-size:13px;color:${u.roleColor};">${u.role}</div>
                <div style="min-width:0;">
                  <div style="font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(u.name)}</div>
                  <div style="font-size:11px;color:var(--muted);">${esc(u.unameText)} · ${esc(u.cabang)}</div>
                </div>
              </div>
              <span style="font-size:11px;font-weight:600;color:${u.statusColor};white-space:nowrap;flex:none;">${u.statusText}</span>
            </div>
            <div style="display:flex;gap:8px;margin-top:11px;">
              <button ${A(u.onEdit)} style="flex:1;height:34px;border-radius:8px;background:var(--chip);border:1px solid var(--border);color:var(--text2);font-size:12.5px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Edit</button>
              <button ${A(u.onToggle)} style="flex:1;height:34px;border-radius:8px;background:var(--dangertint);border:1px solid var(--dangerborder);color:var(--danger);font-size:12.5px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">${u.toggleText}</button>
            </div>
          </div>`).join('')}
      </div>`}
  </div>`;
}

function secLaporanHtml(V){
  return `<div style="${V.popScreen}">
    <div style="display:flex;gap:8px;margin-bottom:18px;align-items:center;flex-wrap:wrap;">
      ${V.periodChips.map(c => `<button ${A(c.onClick)} style="height:42px;padding:0 22px;border-radius:11px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;border:1px solid ${c.bd};background:${c.bg};color:${c.cl};">${c.label}</button>`).join('')}
      ${V.period==='Tahunan' ? `
        <div style="display:flex;align-items:center;background:var(--surface2);border:1px solid var(--border);border-radius:11px;height:42px;padding:0 4px;">
          <button ${A(V.onPrevYear)} title="tahun-sebelumnya" style="width:32px;height:32px;border-radius:8px;border:none;background:none;cursor:${V.onPrevYear?'pointer':'default'};color:${V.onPrevYear?'var(--gold)':'var(--dim2)'};font-size:17px;display:flex;align-items:center;justify-content:center;font-family:'Hanken Grotesk',sans-serif;">‹</button>
          <span style="min-width:48px;text-align:center;font-family:'Saira',sans-serif;font-weight:700;font-size:13.5px;">${V.selYearText}</span>
          <button ${A(V.onNextYear)} title="tahun-berikutnya" style="width:32px;height:32px;border-radius:8px;border:none;background:none;cursor:${V.onNextYear?'pointer':'default'};color:${V.onNextYear?'var(--gold)':'var(--dim2)'};font-size:17px;display:flex;align-items:center;justify-content:center;font-family:'Hanken Grotesk',sans-serif;">›</button>
        </div>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:${V.lapTopCols};gap:16px;margin-bottom:16px;">
      <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:18px;padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:18px;"><span style="font-family:'Saira',sans-serif;font-weight:700;font-size:15px;">Tren Omset</span><span style="font-size:12px;color:var(--muted);">juta Rupiah</span></div>
        ${V.lapLoading ? `
          <div style="height:170px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px;">Memuat data…</div>
        ` : `
        <div style="display:flex;align-items:flex-end;justify-content:space-between;height:170px;gap:10px;">
          ${V.lapBars.map(b => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end;">
              <span style="font-family:'Saira',sans-serif;font-weight:700;font-size:11px;color:${b.valColor};">${b.valText}</span>
              <div style="width:100%;border-radius:7px 7px 3px 3px;background:${b.fill};height:${b.h};min-height:5px;"></div>
              <span style="font-size:10.5px;color:var(--muted);">${b.label}</span>
            </div>`).join('')}
        </div>`}
      </div>
      <div style="border-radius:18px;padding:20px;background:linear-gradient(150deg,var(--g2),var(--g1));box-shadow:var(--cardshadow);border:1px solid var(--goldborder);display:flex;flex-direction:column;justify-content:center;">
        <div style="font-size:13px;color:var(--goldsoft);">Total Omset (${V.period})</div>
        <div style="font-family:'Saira',sans-serif;font-weight:900;font-size:34px;margin-top:8px;">${V.lapTotalText}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:${V.modeCols};gap:16px;">
      <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:18px;padding:20px;">
        <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:15px;margin-bottom:16px;">Rincian per Metode</div>
        <div style="display:flex;flex-direction:column;gap:15px;">
          ${V.lapMethods.map(m => `
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:7px;"><span style="font-size:13px;">${m.label}</span><span style="font-size:13px;font-weight:600;">${m.amountText}</span></div>
              <div style="height:8px;border-radius:4px;background:var(--chip);overflow:hidden;"><div style="height:100%;border-radius:4px;width:${m.w};background:${m.color};"></div></div>
            </div>`).join('')}
        </div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:18px;padding:20px;">
        <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:15px;margin-bottom:16px;">Perbandingan Cabang <span style="font-weight:400;font-size:12px;color:var(--muted);">(bulan ini)</span></div>
        <div style="display:flex;flex-direction:column;gap:15px;">
          ${V.branchCompare.map(b => `
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:7px;"><span style="font-size:13px;">${esc(b.label)}</span><span style="font-size:13px;font-weight:600;">${b.amountText}</span></div>
              <div style="height:10px;border-radius:5px;background:var(--chip);overflow:hidden;"><div style="height:100%;border-radius:5px;width:${b.w};background:${b.fill};"></div></div>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:18px;padding:20px;margin-top:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:10px;flex-wrap:wrap;">
        <span style="font-family:'Saira',sans-serif;font-weight:700;font-size:15px;">Penjualan per Anggota <span style="font-weight:400;font-size:12px;color:var(--muted);">${V.memberCountText}</span></span>
        <div style="display:flex;gap:7px;flex-wrap:wrap;">
          ${V.uPeriodChips.map(c => `<button ${A(c.onClick)} style="height:36px;padding:0 14px;border-radius:10px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;border:1px solid ${c.bd};background:${c.bg};color:${c.cl};">${c.label}</button>`).join('')}
        </div>
      </div>
      <div style="position:relative;z-index:1;display:flex;gap:10px;align-items:center;margin-bottom:${V.memberSelChips.length?'10px':'14px'};flex-wrap:wrap;">
        <div style="flex:1;min-width:220px;max-width:360px;">
          <button id="btn-memberdd" aria-expanded="${V.memberDropdown}" aria-haspopup="listbox" ${A(V.toggleMemberDd)} style="width:100%;height:42px;padding:0 14px;border-radius:11px;background:var(--input);border:1px solid ${V.memberDropdown?'var(--gold)':'var(--border)'};color:var(--text);font-size:13.5px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span style="display:flex;align-items:center;gap:9px;min-width:0;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17 20a5 5 0 0 0-10 0M12 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" stroke="#D4AF37" stroke-width="1.7" stroke-linecap="round"></path></svg><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${V.memberDdLabel}</span></span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="flex:none;transition:transform .15s ease;transform:rotate(${V.memberDropdown?'180':'0'}deg);"><path d="M6 9l6 6 6-6" stroke="#D4AF37" stroke-width="2.4" stroke-linecap="round"></path></svg>
          </button>
        </div>
        <span style="font-size:12px;color:var(--muted);">${esc(V.memberToolbarCountText)}</span>
      </div>
      ${V.memberSelChips.length ? `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
        ${V.memberSelChips.map(c => `
          <span style="display:inline-flex;align-items:center;gap:6px;background:var(--goldtint2);color:var(--gold);border-radius:999px;padding:4px 6px 4px 12px;font-size:11.5px;font-weight:600;font-family:'Hanken Grotesk',sans-serif;">
            ${esc(c.name)}
            <button ${A(c.onRemove)} title="hapus-filter-${esc(c.name)}" style="width:18px;height:18px;flex:none;border-radius:999px;border:none;background:rgba(212,175,55,.2);color:var(--gold);cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;">×</button>
          </span>`).join('')}
      </div>` : ''}
      <div style="min-height:320px;">
      ${V.memberLoading ? `<div style="border:1px dashed var(--border);border-radius:14px;padding:26px;text-align:center;color:var(--muted);font-size:13px;">Memuat penjualan anggota…</div>`
        : V.memberNoData ? `<div style="border:1px dashed var(--border);border-radius:14px;padding:26px;text-align:center;color:var(--dim2);font-size:13px;">Belum ada anggota aktif di cabang ini.</div>`
        : V.memberAllZero ? `
          <div style="padding:44px 20px;text-align:center;">
            <div style="width:52px;height:52px;margin:0 auto 14px;border-radius:15px;background:var(--surface2);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;">${ic('laporan','var(--dim)',24)}</div>
            <div style="font-size:13.5px;color:var(--muted);margin-bottom:${V.onMemberWiderPeriod?'10px':'0'};">Belum ada transaksi ${V.uPeriod==='Mingguan'?'minggu ini':V.uPeriod==='Bulanan'?'bulan ini':'tahun ini'}.</div>
            ${V.onMemberWiderPeriod ? `<button ${A(V.onMemberWiderPeriod)} style="background:none;border:none;color:var(--gold);font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Lihat periode ${esc(V.memberWiderPeriodLabel)} ›</button>` : ''}
          </div>` : `
        ${V.isDesktop ? `
          <div style="display:grid;grid-template-columns:48px 1fr 140px 120px;padding:0 12px 10px;font-family:'Saira',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);">
            <span>#</span><span>Pegawai</span><span style="text-align:right;">Transaksi</span><span style="text-align:right;">Total</span>
          </div>
          <div class="scrl" style="max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
            ${V.memberRows.map(m => `
              <div style="border:1px solid var(--border2);border-radius:13px;background:var(--surface2);padding:12px;">
                <button ${A(m.onDetail)} title="detail-${esc(m.unameText)}" class="fx-hover" style="width:100%;display:grid;grid-template-columns:48px 1fr 140px 120px;align-items:center;gap:6px;background:none;border:none;padding:0;cursor:pointer;text-align:left;font-family:'Hanken Grotesk',sans-serif;color:var(--text);border-radius:9px;">
                  <span style="font-family:'Saira',sans-serif;font-weight:800;font-size:15px;color:${m.rank<=3?'var(--gold)':'var(--muted)'};">${m.rank}</span>
                  <span style="min-width:0;">
                    <span style="display:block;font-size:13.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${chevronIc(m.open)} ${esc(m.name)}</span>
                    <span style="display:block;font-size:11px;color:var(--text2);margin-top:2px;">${esc(m.unameText)} · ${m.roleText} · ${esc(m.cabang)}</span>
                    ${m.hasSales ? `<span style="display:block;height:6px;border-radius:4px;background:var(--chip);overflow:hidden;margin-top:6px;max-width:280px;"><span style="display:block;height:100%;border-radius:4px;width:${m.w};background:linear-gradient(90deg,var(--gold),var(--goldhi));"></span></span>` : ''}
                  </span>
                  <span style="text-align:right;font-size:12.5px;color:var(--text2);">${m.trxLong}</span>
                  <span style="text-align:right;font-family:'Saira',sans-serif;font-weight:700;font-size:14px;color:var(--text);">${m.totalText}</span>
                </button>
                ${m.open ? memberDetailHtml(m) : ''}
              </div>`).join('')}
          </div>` : `
          <div class="scrl" style="max-height:60dvh;overflow-y:auto;display:flex;flex-direction:column;gap:9px;">
            ${V.memberRows.map(m => `
              <div style="border:1px solid var(--border2);border-radius:14px;background:var(--surface2);padding:13px 14px;">
                <button ${A(m.onDetail)} title="detail-${esc(m.unameText)}" class="fx-hover" style="width:100%;background:none;border:none;padding:0;cursor:pointer;text-align:left;font-family:'Hanken Grotesk',sans-serif;color:var(--text);border-radius:10px;">
                  <span style="display:block;font-size:13.5px;font-weight:600;color:var(--text);">${chevronIc(m.open)} <span style="color:${m.rank<=3?'var(--gold)':'var(--muted)'};font-family:'Saira',sans-serif;font-weight:800;">#${m.rank}</span> ${esc(m.name)}</span>
                  <span style="display:block;font-size:11px;color:var(--text2);margin-top:2px;">${esc(m.unameText)} · ${m.roleText} · ${esc(m.cabang)}</span>
                  <span style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;">
                    ${m.hasSales ? `<span style="height:7px;border-radius:4px;background:var(--chip);overflow:hidden;flex:1;"><span style="display:block;height:100%;border-radius:4px;width:${m.w};background:linear-gradient(90deg,var(--gold),var(--goldhi));"></span></span>` : `<span style="flex:1;"></span>`}
                    <span style="white-space:nowrap;font-size:12px;"><span style="font-family:'Saira',sans-serif;font-weight:700;font-size:14px;color:var(--text);">${m.totalText}</span> <span style="color:var(--muted);">· ${m.trxText}</span></span>
                  </span>
                </button>
                ${m.open ? memberDetailHtml(m) : ''}
              </div>`).join('')}
          </div>`}
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border2);margin-top:16px;padding-top:14px;gap:10px;flex-wrap:wrap;">
          <span style="font-size:13px;color:var(--muted);">Total (${V.memberFooterLabel}) · ${V.uPeriod}</span>
          <span style="white-space:nowrap;"><span style="font-family:'Saira',sans-serif;font-weight:800;font-size:19px;color:var(--text);">${V.memberTotalText}</span> <span style="color:var(--muted);font-size:12px;">· ${V.memberTrxText}</span></span>
        </div>`}
      </div>
    </div>
  </div>`;
}

function secProdukHtml(V){
  return `<div style="${V.popScreen}">
    <div style="display:flex;justify-content:flex-end;margin-bottom:18px;">
      <button ${A(V.openProdForm)} style="height:44px;padding:0 20px;border-radius:12px;border:none;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-size:14px;font-weight:700;cursor:pointer;font-family:'Saira',sans-serif;letter-spacing:.03em;">+ Tambah Produk</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;">
      ${V.produkRows.map(p => `
        <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:15px;padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div><div style="font-size:14px;font-weight:600;">${esc(p.name)}</div><div style="font-size:11.5px;color:var(--muted);margin-top:2px;">${esc(p.varian)} · ${p.kategori}</div></div>
            <span style="font-size:10.5px;font-weight:700;color:var(--ok);background:var(--oktint);padding:3px 9px;border-radius:7px;white-space:nowrap;">Margin ${p.margin}</span>
          </div>
          <div style="display:flex;gap:22px;margin-top:13px;">
            <div><div style="font-size:10.5px;color:var(--muted);">Harga Jual</div><div style="font-family:'Saira',sans-serif;font-weight:700;font-size:15px;color:var(--gold);">${p.hargaText}</div></div>
            <div><div style="font-size:10.5px;color:var(--muted);">Harga Modal</div><div style="font-family:'Saira',sans-serif;font-weight:700;font-size:15px;color:var(--text2);">${p.modalText}</div></div>
          </div>
          ${p.hasExp ? `<div style="margin-top:12px;font-size:11.5px;font-weight:600;padding:6px 10px;border-radius:8px;display:inline-flex;align-items:center;gap:6px;color:${p.expColor};background:${p.expBg};">${p.warnIcon} ${p.expText}</div>` : ''}
        </div>`).join('')}
    </div>
  </div>`;
}

function secSupplierHtml(V){
  return `<div style="${V.popScreen}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;gap:16px;flex-wrap:wrap;">
      <div style="flex:1;min-width:220px;background:linear-gradient(150deg,var(--g5),var(--g6));box-shadow:var(--cardshadow);border:1px solid var(--dangerborder);border-radius:16px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <span style="font-size:13px;color:var(--dangersoft);">Total Hutang ke Supplier</span>
        <span style="font-family:'Saira',sans-serif;font-weight:900;font-size:26px;">${V.supplierTotalText}</span>
      </div>
      <button ${A(V.newPO)} style="height:48px;padding:0 22px;border-radius:13px;border:none;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-size:14px;font-weight:700;cursor:pointer;font-family:'Saira',sans-serif;letter-spacing:.03em;white-space:nowrap;">+ Buat Purchase Order</button>
    </div>
    ${V.isDesktop ? `
      <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:16px;overflow:hidden;">
        <div style="display:grid;grid-template-columns:2fr 1.2fr 1.2fr 1fr;padding:14px 18px;border-bottom:1px solid var(--border2);font-family:'Saira',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);">
          <span>Supplier</span><span>Nominal</span><span>Jatuh Tempo</span><span style="text-align:right;">Status</span>
        </div>
        ${V.supplierRows.map(s => `
          <div style="display:grid;grid-template-columns:2fr 1.2fr 1.2fr 1.4fr;padding:15px 18px;border-bottom:1px solid var(--divider);align-items:center;font-size:13.5px;">
            <span style="font-weight:600;">${esc(s.name)}</span>
            <span style="font-family:'Saira',sans-serif;font-weight:700;">${s.amountText}</span>
            <span style="color:var(--muted);">${s.dueText}</span>
            <span style="text-align:right;display:flex;gap:8px;justify-content:flex-end;align-items:center;">
              ${badge(s.color,s.bg,s.status)}
              ${s.notPaid ? `<button ${A(s.onPay)} style="height:32px;padding:0 12px;border-radius:9px;background:var(--oktint);border:1px solid var(--okborder);color:var(--ok);font-size:12px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Lunasi</button>` : ''}
            </span>
          </div>`).join('')}
      </div>` : `
      <div style="display:flex;flex-direction:column;gap:9px;">
        ${V.supplierRows.map(s => `
          <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:14px;padding:13px 15px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <div style="min-width:0;">
              <div style="font-weight:600;font-size:13.5px;">${esc(s.name)}</div>
              <div style="font-size:11.5px;color:var(--muted);margin-top:2px;">Jatuh tempo ${s.dueText}</div>
            </div>
            <div style="text-align:right;flex:none;">
              <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:14px;">${s.amountText}</div>
              <span style="font-size:10px;font-weight:700;color:${s.color};background:${s.bg};padding:2px 7px;border-radius:6px;display:inline-block;margin-top:3px;">${s.status}</span>
              ${s.notPaid ? `<div><button ${A(s.onPay)} style="margin-top:7px;height:30px;padding:0 12px;border-radius:8px;background:var(--oktint);border:1px solid var(--okborder);color:var(--ok);font-size:11.5px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Lunasi</button></div>` : ''}
            </div>
          </div>`).join('')}
      </div>`}
  </div>`;
}

function secBiayaHtml(V){
  return `<div style="${V.popScreen}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;gap:16px;flex-wrap:wrap;">
      <div style="flex:1;min-width:220px;background:linear-gradient(150deg,var(--g5),var(--g6));box-shadow:var(--cardshadow);border:1px solid var(--dangerborder);border-radius:16px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <span style="font-size:13px;color:var(--dangersoft);">Biaya Operasional Bulan Ini</span>
        <span style="font-family:'Saira',sans-serif;font-weight:900;font-size:26px;">${V.expenseMonthTotalText}</span>
      </div>
      <button ${A(V.newBiaya)} style="height:48px;padding:0 22px;border-radius:13px;border:none;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-size:14px;font-weight:700;cursor:pointer;font-family:'Saira',sans-serif;letter-spacing:.03em;white-space:nowrap;">+ Catat Biaya</button>
    </div>
    ${V.expenseEmpty ? `<div style="padding:40px 20px;text-align:center;color:var(--muted);font-size:13.5px;">Belum ada biaya tercatat.</div>` : V.isDesktop ? `
      <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:16px;overflow:hidden;">
        <div style="display:grid;grid-template-columns:1.4fr 1.6fr 1.2fr 1fr 1.6fr;padding:14px 18px;border-bottom:1px solid var(--border2);font-family:'Saira',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);">
          <span>Kategori</span><span>Keterangan</span><span>Nominal</span><span>Tanggal</span><span style="text-align:right;">Status</span>
        </div>
        ${V.expenseRows.map(x => `
          <div style="display:grid;grid-template-columns:1.4fr 1.6fr 1.2fr 1fr 1.6fr;padding:15px 18px;border-bottom:1px solid var(--divider);align-items:center;font-size:13.5px;">
            <span style="font-weight:600;">${esc(x.category)}</span>
            <span style="color:var(--muted);">${esc(x.note||x.recurringText)}</span>
            <span style="font-family:'Saira',sans-serif;font-weight:700;">${x.amountText}</span>
            <span style="color:var(--muted);">${x.dateText}</span>
            <span style="text-align:right;display:flex;gap:8px;justify-content:flex-end;align-items:center;">
              ${badge(x.color,x.bg,x.status)}
              ${x.canPay ? `<button ${A(x.onPay)} style="height:32px;padding:0 12px;border-radius:9px;background:var(--oktint);border:1px solid var(--okborder);color:var(--ok);font-size:12px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Lunasi</button>` : ''}
              <button ${A(x.onDelete)} title="hapus-biaya-${x.id}" style="width:30px;height:30px;flex:none;border-radius:9px;background:var(--dangertint);border:1px solid var(--dangerborder);color:var(--danger);font-size:15px;line-height:1;cursor:pointer;">×</button>
            </span>
          </div>`).join('')}
      </div>` : `
      <div style="display:flex;flex-direction:column;gap:9px;">
        ${V.expenseRows.map(x => `
          <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:14px;padding:13px 15px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <div style="min-width:0;">
              <div style="font-weight:600;font-size:13.5px;">${esc(x.category)}</div>
              <div style="font-size:11.5px;color:var(--muted);margin-top:2px;">${esc(x.note||x.recurringText)} · ${x.dateText}</div>
            </div>
            <div style="text-align:right;flex:none;">
              <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:14px;">${x.amountText}</div>
              <span style="font-size:10px;font-weight:700;color:${x.color};background:${x.bg};padding:2px 7px;border-radius:6px;display:inline-block;margin-top:3px;">${x.status}</span>
              <div style="margin-top:7px;display:flex;gap:6px;justify-content:flex-end;">
                ${x.canPay ? `<button ${A(x.onPay)} style="height:30px;padding:0 12px;border-radius:8px;background:var(--oktint);border:1px solid var(--okborder);color:var(--ok);font-size:11.5px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Lunasi</button>` : ''}
                <button ${A(x.onDelete)} title="hapus-biaya-${x.id}" style="width:30px;height:30px;flex:none;border-radius:8px;background:var(--dangertint);border:1px solid var(--dangerborder);color:var(--danger);font-size:15px;line-height:1;cursor:pointer;">×</button>
              </div>
            </div>
          </div>`).join('')}
      </div>`}
  </div>`;
}

function secPromoHtml(V){
  return `<div style="${V.popScreen}">
    <div style="display:flex;justify-content:flex-end;margin-bottom:18px;">
      <button ${A(V.newPromo)} style="height:44px;padding:0 20px;border-radius:12px;border:none;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-size:14px;font-weight:700;cursor:pointer;font-family:'Saira',sans-serif;letter-spacing:.03em;">+ Buat Promo / Bundle</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px;">
      ${V.promoRows.map(p => `
        <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:15px;padding:18px;display:flex;align-items:center;gap:15px;">
          <div style="width:52px;height:52px;flex:none;border-radius:14px;background:var(--goldtint);display:flex;align-items:center;justify-content:center;">${V.giftIcon}</div>
          <div style="flex:1;min-width:0;"><div style="font-size:15px;font-weight:600;">${esc(p.name)}</div><div style="font-size:12px;color:var(--muted);margin-top:3px;">${esc(p.desc)}</div></div>
          <div style="text-align:right;"><div style="font-size:11px;color:var(--muted);">${esc(p.type)}</div><div style="font-family:'Saira',sans-serif;font-weight:800;font-size:15px;color:${p.color};">${esc(p.value)}</div></div>
          <button ${A(p.onDelete)} title="hapus-promo-${esc(p.name)}" style="width:30px;height:30px;flex:none;border-radius:9px;background:var(--dangertint);border:1px solid var(--dangerborder);color:var(--danger);font-size:15px;line-height:1;cursor:pointer;">×</button>
        </div>`).join('')}
    </div>
  </div>`;
}

function secShopeeHtml(V){
  return `<div style="${V.popScreen}display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 20px;">
    <div style="width:96px;height:96px;border-radius:28px;background:linear-gradient(150deg,#EE4D2D,#c93b1f);display:flex;align-items:center;justify-content:center;box-shadow:0 14px 34px -10px rgba(238,77,45,.5);margin-bottom:24px;">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M5 8h14l-1 12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 8Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"></path><path d="M9 8V6a3 3 0 0 1 6 0v2" stroke="#fff" stroke-width="1.8" stroke-linecap="round"></path></svg>
    </div>
    <span style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#EE4D2D;background:rgba(238,77,45,.12);padding:6px 14px;border-radius:20px;margin-bottom:18px;">Segera Hadir</span>
    <h3 style="font-family:'Saira',sans-serif;font-weight:800;font-size:26px;margin:0 0 12px;">Integrasi Shopee</h3>
    <p style="font-size:14.5px;color:var(--muted);line-height:1.6;max-width:440px;margin:0;">Nantinya semua barang yang terjual di Shopee otomatis tersinkron &amp; tercatat di sistem ini — stok dan laporan jadi satu pintu.</p>
  </div>`;
}

/* ================= ADMIN shell ================= */
function adminHtml(V){
  const sections = {
    dashboard: secDashboardHtml, piutang: secPiutangHtml, tempo: secTempoHtml, stok: secStokHtml,
    users: secUsersHtml, laporan: secLaporanHtml, produk: secProdukHtml, supplier: secSupplierHtml,
    promo: secPromoHtml, biaya: secBiayaHtml, shopee: secShopeeHtml,
  };
  const sec = sections[S.screen] ? sections[S.screen](V) : '';
  return `
  <div style="height:100dvh;display:flex;min-height:0;position:relative;">
    ${V.isDesktop ? `
    <div style="${V.sidebarStyle}">
      <div style="display:flex;align-items:center;gap:11px;padding:0 8px 18px;border-bottom:1px solid var(--divider);margin-bottom:14px;">
        <div style="width:42px;height:42px;border-radius:13px;background:linear-gradient(160deg,var(--g7),var(--g8));border:1.5px solid var(--goldborder);display:flex;align-items:center;justify-content:center;flex:none;">${svgBrand(22)}</div>
        <div style="min-width:0;">
          <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:13.5px;line-height:1;white-space:nowrap;">SUPLEMEN <span style="color:var(--gold);">SMG</span></div>
          <div style="font-size:10.5px;color:var(--muted);margin-top:4px;">Dashboard Admin</div>
        </div>
      </div>
      <div class="scrl" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:3px;">
        ${V.sidebarItems.map(m => m.section ? `
          <div style="padding:14px 12px 5px;font-family:'Saira',sans-serif;font-weight:700;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);">${esc(m.section)}</div>
        ` : `
          <button ${A(m.onClick)} class="fx-hover" style="display:flex;align-items:center;gap:${m.nested?'10px':'12px'};padding:${m.nested?'9px 12px':'11px 12px'};${m.nested?'margin-left:16px;width:calc(100% - 16px);':''}border-radius:11px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:${m.nested?'12.5px':'13.5px'};text-align:left;border:1px solid ${m.bd};background:${m.bg};color:${m.cl};">
            <span style="width:${m.nested?16:20}px;display:inline-flex;align-items:center;justify-content:center;">${m.icon}</span>${m.label}
          </button>`).join('')}
      </div>
      <button ${A(V.openSettings)} style="margin-top:12px;height:44px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:13px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">${svgGear(16)} Pengaturan</button>
      <button ${A(V.goModeScreen)} style="margin-top:8px;height:44px;border-radius:12px;background:var(--goldtint);border:1px solid var(--goldborder);color:var(--gold);font-size:13px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">${V.refreshIcon} Ganti Mode / Kasir</button>
    </div>` : ''}
    <div style="flex:1;display:flex;flex-direction:column;min-width:0;">
      <div style="flex:none;height:66px;border-bottom:1px solid var(--divider);display:flex;align-items:center;justify-content:space-between;padding:0 ${V.topbarPadX}px;background:var(--bg);gap:8px;min-width:0;">
        <div style="display:flex;align-items:center;gap:${V.topbarGapL}px;min-width:0;flex:1;">
          ${V.isDesktop ? `
            <button ${A(V.toggleSidebar)} title="Sembunyikan / tampilkan menu" style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:11px;background:var(--surface2);border:1px solid var(--border);cursor:pointer;flex:none;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="#D4AF37" stroke-width="1.9" stroke-linecap="round"></path></svg>
            </button>` : ''}
          <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:${V.titleSize}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;">${V.sectionTitle}</div>
        </div>
        <div style="display:flex;align-items:center;gap:${V.topbarGapR}px;flex:none;">
          <div style="position:relative;">
            <button ${A(V.toggleBranchMenu)} style="white-space:nowrap;display:inline-flex;align-items:center;gap:6px;background:var(--goldtint);border:1px solid var(--goldborder);color:var(--gold);border-radius:11px;padding:${V.branchPadY}px ${V.branchPadX}px;font-size:${V.branchFont}px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">
              ${V.showBranchPin ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" stroke="#D4AF37" stroke-width="2"></path><circle cx="12" cy="10" r="2.4" stroke="#D4AF37" stroke-width="2"></circle></svg>` : ''}
              ${esc(V.branchLabel)}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#D4AF37" stroke-width="2.4" stroke-linecap="round"></path></svg>
            </button>
            ${V.branchMenu ? `
              <div ${A(V.closeBranchMenu)} style="position:fixed;inset:0;z-index:44;"></div>
              <div style="position:absolute;top:50px;right:0;width:min(232px, calc(100vw - 24px));z-index:45;background:var(--surface2);border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:0 18px 40px -12px var(--shadowc);${V.pop('branchMenu')}">
                <div style="padding:11px 14px 7px;font-family:'Saira',sans-serif;font-weight:700;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);">Pilih Cabang</div>
                ${V.branchOptions.map(b => `
                  <button ${A(b.onClick)} class="fx-hover" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;background:${b.bg};border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13.5px;text-align:left;color:${b.cl};font-weight:${b.fw};white-space:nowrap;">
                    ${esc(b.label)}
                    ${b.active ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#D4AF37" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>` : ''}
                  </button>`).join('')}
                <button ${A(V.openBranchForm)} class="fx-hover" style="width:100%;display:flex;align-items:center;gap:9px;padding:13px 14px;background:none;border:none;border-top:1px solid var(--divider);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13.5px;font-weight:600;color:var(--gold);text-align:left;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#D4AF37" stroke-width="2.2" stroke-linecap="round"></path></svg>
                  Tambah Cabang
                </button>
              </div>` : ''}
          </div>
          ${themeBtn(V, V.bellSize, 18, 13)}
          <button ${A(V.toggleBell)} style="position:relative;width:${V.bellSize}px;height:${V.bellSize}px;border-radius:13px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;">
            ${svgBellIc(19)}
            <span style="position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:var(--danger);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg);">${V.bellCount}</span>
          </button>
        </div>
      </div>
      <div class="scrl" style="flex:1;overflow-y:auto;overflow-x:hidden;padding:${V.contentPadTop}px ${V.contentPadX}px 40px;">
        <div style="max-width:1180px;margin:0 auto;overflow-x:auto;">${sec}</div>
      </div>
      ${V.isMobile ? `
        <div style="flex:none;height:64px;border-top:1px solid var(--divider);background:var(--panel);display:flex;align-items:stretch;padding:0 6px;padding-bottom:env(safe-area-inset-bottom);">
          ${V.bottomNav.map(t => `
            <button ${A(t.onClick)} style="flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">
              ${t.icon}
              <span style="font-size:10.5px;font-weight:600;font-family:'Saira',sans-serif;color:${t.cl};">${t.label}</span>
            </button>`).join('')}
          <button ${A(V.openMore)} style="flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.8" style="fill:${V.moreActiveColor}"></circle><circle cx="12" cy="12" r="1.8" style="fill:${V.moreActiveColor}"></circle><circle cx="19" cy="12" r="1.8" style="fill:${V.moreActiveColor}"></circle></svg>
            <span style="font-size:10.5px;font-weight:600;font-family:'Saira',sans-serif;color:${V.moreActiveColor};">Menu</span>
          </button>
        </div>` : ''}
    </div>
  </div>
  ${V.moreOpen ? `
    <div ${A(V.closeMore)} style="position:fixed;inset:0;background:var(--scrim);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);z-index:47;"></div>
    <div class="scrl" style="position:fixed;bottom:0;left:0;right:0;z-index:48;background:var(--panel);border-radius:22px 22px 0 0;border-top:1px solid var(--border);padding:10px 16px calc(20px + env(safe-area-inset-bottom));${V.pop('more')}max-height:78dvh;overflow-y:auto;">
      <div style="width:40px;height:4px;border-radius:2px;background:var(--border);margin:6px auto 16px;"></div>
      <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:12px;">Menu Lainnya</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
        ${V.moreItems.map(m => `
          <button ${A(m.onClick)} style="background:var(--surface2);border:1px solid var(--border);border-radius:15px;padding:14px 8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;font-family:'Hanken Grotesk',sans-serif;">
            <span style="width:40px;height:40px;border-radius:12px;background:var(--goldtint);display:flex;align-items:center;justify-content:center;">${m.icon}</span>
            <span style="font-size:11.5px;color:var(--text);text-align:center;line-height:1.25;">${m.label}</span>
          </button>`).join('')}
      </div>
      <button ${A(V.openSettings)} style="width:100%;height:48px;border-radius:13px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:13.5px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:9px;"><span style="width:18px;height:18px;display:inline-flex;">${V.settingsIcon}</span> Pengaturan</button>
      <button ${A(V.goModeScreen)} style="width:100%;height:48px;border-radius:13px;background:var(--goldtint);border:1px solid var(--goldborder);color:var(--gold);font-size:13.5px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">${V.refreshIcon} Ganti Mode / Kasir</button>
    </div>` : ''}`;
}

/* ================= SETTINGS ================= */
function settingsHtml(V){
  return `
  <div style="height:100dvh;display:flex;flex-direction:column;background:var(--bg);">
    <div style="flex:none;height:64px;border-bottom:1px solid var(--divider);display:flex;align-items:center;gap:14px;padding:0 20px;background:var(--panel);">
      <button ${A(V.backFromSettings)} style="width:40px;height:40px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="#D4AF37" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>
      <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:20px;">Pengaturan</div>
    </div>
    <div class="scrl" style="flex:1;overflow-y:auto;padding:24px 20px 40px;">
      <div style="max-width:560px;margin:0 auto;">
        <div style="display:flex;align-items:center;gap:16px;background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:18px;padding:18px;margin-bottom:24px;">
          <div style="width:60px;height:60px;flex:none;border-radius:18px;background:linear-gradient(160deg,var(--gold),var(--golddeep));display:flex;align-items:center;justify-content:center;font-family:'Saira',sans-serif;font-weight:800;font-size:26px;color:#161208;">${esc(V.profileInitial)}</div>
          <div style="min-width:0;">
            <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:18px;">${esc(V.who)}</div>
            <div style="font-size:13px;color:var(--muted);margin-top:3px;">${V.roleLabel} · ${esc(V.settingsBranchText)}</div>
          </div>
        </div>
        <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:12px;">Akun</div>
        <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:16px;overflow:hidden;margin-bottom:22px;">
          ${V.isAdmin ? `
            <button ${A(V.goModeScreen)} style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:15px 16px;background:none;border:none;border-bottom:1px solid var(--divider);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">
              <span style="display:flex;align-items:center;gap:11px;font-size:14px;color:var(--text);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v4h-4" stroke="#D4AF37" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>Ganti Mode / Buka Kasir</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="#6c6c74" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
            </button>` : ''}
          <button ${A(V.logout)} class="ss-logout-row" style="width:100%;display:flex;align-items:center;gap:11px;padding:15px 16px;background:none;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:14px;font-weight:600;color:var(--danger);text-align:left;border-radius:12px;transition:background .15s ease;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h12" stroke="#F0506E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>Keluar dari Akun
          </button>
        </div>
        <div style="text-align:center;font-size:12px;color:var(--dim2);">Suplemen Semarang Store · v1.0</div>
      </div>
    </div>
  </div>`;
}

/* ================= overlays ================= */
// dropdown "pilih pegawai" (Penjualan per Anggota) di-portal ke sini (bukan nested di
// dalam kartu Laporan) karena konten admin (lihat adminHtml) dibungkus scrl dengan
// overflow-x:hidden — position:absolute nested di dalamnya akan selalu kepotong.
// Posisi panel dihitung dari #btn-memberdd via getBoundingClientRect() tiap render()
// (satu-satunya tempat di file ini yang butuh posisi trigger-relatif, bukan cuma
// centered/viewport-anchored kayak modal/bell lain — makanya perlu pengukuran manual).
function memberDdPanelHtml(V){
  return `
  <div ${A(V.closeMemberDd)} style="position:fixed;inset:0;z-index:49;"></div>
  <div id="memberdd-panel" role="listbox" aria-label="Pilih pegawai" style="position:fixed;top:0;left:0;z-index:50;min-width:320px;background:var(--surface2);border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:0 18px 40px -12px var(--shadowc);${V.pop('memberDd')}">
    <div style="padding:10px;border-bottom:1px solid var(--divider);position:relative;display:flex;align-items:center;">
      ${svgSearchIc(15,22)}
      <input id="i-membersearch" value="${esc(V.memberSearch)}" ${I(V.onMemberSearch)} placeholder="Cari nama pegawai…" style="width:100%;height:38px;border-radius:9px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:13px;padding:0 12px 0 34px;outline:none;font-family:'Hanken Grotesk',sans-serif;">
    </div>
    <div class="scrl" style="max-height:240px;overflow-y:auto;">
      ${V.memberSelCount ? `<button ${A(V.clearMemberSel)} style="width:100%;text-align:left;padding:10px 14px;background:none;border:none;border-bottom:1px solid var(--divider);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12.5px;font-weight:600;color:var(--gold);">✕ Kosongkan pilihan (${V.memberSelCount})</button>` : ''}
      ${V.memberOptionsEmpty ? `<div style="padding:16px;text-align:center;color:var(--dim2);font-size:12.5px;">Tidak ada pegawai cocok.</div>` :
        V.memberOptions.map(o => `
          <button ${A(o.onClick)} title="opt-${esc(o.unameText)}" class="fx-hover" role="option" aria-selected="${o.checked}" style="width:100%;display:flex;align-items:center;gap:10px;padding:10px 14px;background:${o.checked?'var(--goldtint)':'none'};border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;text-align:left;">
            <span style="width:20px;height:20px;flex:none;border-radius:6px;border:1.5px solid ${o.checked?'var(--gold)':'var(--border)'};background:${o.checked?'var(--goldtint2)':'transparent'};color:var(--gold);display:inline-flex;align-items:center;justify-content:center;font-size:13px;line-height:1;">${o.checked?'✓':''}</span>
            <span style="flex:1;min-width:0;"><span style="font-size:13px;font-weight:600;color:var(--text);">${esc(o.name)}</span> <span style="font-size:11px;color:var(--text2);">${esc(o.unameText)} · ${o.roleText} · ${esc(o.cabang)}</span></span>
            ${o.totalText ? `<span style="font-size:11.5px;color:var(--muted);white-space:nowrap;font-family:'Saira',sans-serif;">${o.totalText}</span>` : ''}
          </button>`).join('')}
    </div>
  </div>`;
}
function bellHtml(V){
  return `
  <div ${A(V.closeBell)} style="position:fixed;inset:0;background:var(--scrim);z-index:40;"></div>
  <div style="position:fixed;top:70px;right:16px;left:16px;max-width:400px;margin-left:auto;z-index:41;background:var(--surface2);border:1px solid var(--border);border-radius:18px;overflow:hidden;${V.pop('bell')}box-shadow:0 24px 60px -10px var(--shadowc);">
    <div style="padding:16px 18px;border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between;">
      <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:16px;">Notifikasi Jatuh Tempo</div>
      <span style="font-size:11px;color:var(--danger);background:var(--dangertint);padding:4px 9px;border-radius:7px;font-weight:600;">${V.bellCount} perlu perhatian</span>
    </div>
    <div class="scrl" style="max-height:420px;overflow-y:auto;">
      ${V.bellItems.map(n => `
        <div style="padding:14px 18px;border-bottom:1px solid var(--divider);display:flex;gap:12px;align-items:center;">
          <div style="width:38px;height:38px;flex:none;border-radius:11px;background:${n.dotBg};display:flex;align-items:center;justify-content:center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 8v5M12 16h.01" style="stroke:${n.dotColor}" stroke-width="2" stroke-linecap="round"></path><circle cx="12" cy="12" r="9" style="stroke:${n.dotColor}" stroke-width="1.6"></circle></svg></div>
          <div style="flex:1;min-width:0;"><div style="font-size:13.5px;font-weight:600;">${esc(n.name)}</div><div style="font-size:12px;color:var(--muted);">${n.amountText} · ${esc(n.cabang)}</div></div>
          <span style="font-size:11.5px;font-weight:700;color:${n.dueColor};white-space:nowrap;font-family:'Saira',sans-serif;">${n.dueText}</span>
        </div>`).join('')}
    </div>
    <button ${A(V.goTempoFromBell)} style="width:100%;padding:14px;background:none;border:none;border-top:1px solid var(--border2);color:var(--gold);font-size:13.5px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Lihat semua jatuh tempo ›</button>
  </div>`;
}

function scanHtml(V){
  return `
  <div ${A(V.closeScan)} style="position:fixed;inset:0;background:var(--scrim);z-index:50;"></div>
  <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:51;width:min(440px, calc(100vw - 32px));background:var(--panel);border:1px solid var(--border);border-radius:22px;overflow:hidden;${V.popModal('scan')}box-shadow:0 30px 70px -15px rgba(0,0,0,.8);">
    <div style="padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid var(--divider);">
      <span style="font-family:'Saira',sans-serif;font-weight:700;font-size:17px;">Scan Barcode</span>
      <div style="display:flex;align-items:center;gap:8px;">
        ${V.scanDevices.length > 1 ? `
          <select ${I(V.onScanDevice)} title="pilih kamera (mis. DroidCam)" style="height:34px;max-width:150px;border-radius:9px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:11px;padding:0 8px;outline:none;font-family:'Hanken Grotesk',sans-serif;">
            ${V.scanDevices.map((d,i) => `<option value="${esc(d.deviceId)}"${d.deviceId===V.scanDeviceId?' selected':''}>${esc(d.label || ('Kamera '+(i+1)))}</option>`).join('')}
          </select>
        ` : ''}
        <button ${A(V.closeScan)} style="background:var(--chip);border:1px solid var(--border);color:var(--text);width:36px;height:36px;border-radius:10px;cursor:pointer;font-size:19px;line-height:1;flex:none;">×</button>
      </div>
    </div>
    <div style="height:300px;position:relative;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 45%,var(--surface3),var(--bg));overflow:hidden;">
      <video id="scan-video" autoplay playsinline muted style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></video>
      ${V.scanMsg ? `
        <div style="position:relative;z-index:2;max-width:320px;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 18px;font-size:13px;color:var(--text2);line-height:1.55;">${esc(V.scanMsg)}</div>
      ` : `
        <div style="position:relative;z-index:2;width:230px;height:230px;border-radius:20px;border:2px solid var(--goldborder);">
          <i style="position:absolute;left:5%;right:5%;height:2px;background:var(--gold);box-shadow:0 0 12px var(--gold);animation:ssScan 1.8s ease-in-out infinite alternate;"></i>
          <span style="position:absolute;top:8px;left:8px;width:22px;height:22px;border-top:3px solid var(--gold);border-left:3px solid var(--gold);border-radius:5px 0 0 0;"></span>
          <span style="position:absolute;top:8px;right:8px;width:22px;height:22px;border-top:3px solid var(--gold);border-right:3px solid var(--gold);border-radius:0 5px 0 0;"></span>
          <span style="position:absolute;bottom:8px;left:8px;width:22px;height:22px;border-bottom:3px solid var(--gold);border-left:3px solid var(--gold);border-radius:0 0 0 5px;"></span>
          <span style="position:absolute;bottom:8px;right:8px;width:22px;height:22px;border-bottom:3px solid var(--gold);border-right:3px solid var(--gold);border-radius:0 0 5px 0;"></span>
        </div>
        <div style="position:absolute;bottom:14px;left:0;right:0;z-index:2;text-align:center;font-size:13px;color:var(--text2);text-shadow:0 1px 6px rgba(0,0,0,.7);">Arahkan kamera ke barcode produk (EAN-13)</div>
      `}
    </div>
    <div style="padding:14px 18px 18px;">
      ${lbl('Atau ketik nomor barcode')}
      <div style="display:flex;gap:8px;margin-top:7px;">
        <input id="i-scanmanual" value="${esc(V.scanManual)}" ${I(V.onScanManual)} inputmode="numeric" placeholder="cnt. 8991234500017" style="flex:1;height:48px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:15px;letter-spacing:.06em;padding:0 14px;outline:none;font-family:'Saira',sans-serif;font-weight:600;">
        <button ${A(V.useManual)} style="flex:none;height:48px;padding:0 18px;border-radius:12px;border:none;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:13px;letter-spacing:.04em;cursor:pointer;">GUNAKAN</button>
      </div>
    </div>
  </div>`;
}

function branchFormHtml(V){
  const pad = V.isMobile ? '20px 16px' : '22px';
  const modalW = V.isMobile ? 'calc(100vw - 24px)' : 'min(440px, calc(100vw - 32px))';
  return `
  <div ${A(V.closeBranchForm)} style="position:fixed;inset:0;background:var(--scrim);z-index:50;"></div>
  <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:51;width:${modalW};background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:${pad};${V.popModal('branchForm')}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h3 style="font-family:'Saira',sans-serif;font-weight:800;font-size:20px;margin:0;">Tambah Cabang</h3>
      <button ${A(V.closeBranchForm)} title="tutup" style="width:30px;height:30px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);color:var(--muted);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
    </div>
    <p style="font-size:13px;color:var(--muted);margin:0 0 16px;line-height:1.5;">Cabang baru langsung muncul di pilihan cabang. Data penjualan mulai tercatat setelah ada transaksi.</p>
    <div>${lbl('Nama Cabang')}
      <input id="i-newbranch" value="${esc(V.newBranch)}" ${I(V.onNewBranch)} placeholder="cnt. Yogyakarta" style="${inputStyle(48)}">
    </div>
    <div style="display:flex;gap:10px;margin-top:18px;">
      <button ${A(V.closeBranchForm)} style="flex:none;width:95px;height:48px;border-radius:12px;background:var(--chip);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Batal</button>
      <button ${A(V.saveBranch)} style="flex:1;height:48px;border:none;border-radius:12px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:14px;letter-spacing:.04em;cursor:pointer;white-space:nowrap;">SIMPAN CABANG</button>
    </div>
  </div>`;
}

function userFormHtml(V){
  const pad = V.isMobile ? '20px 16px' : '26px';
  const modalW = V.isMobile ? 'calc(100vw - 24px)' : 'min(520px, calc(100vw - 32px))';
  const selTile = (t) => `<button ${A(t.onClick)} style="flex:1;min-width:100px;height:44px;border-radius:11px;cursor:pointer;border:1px solid ${t.on?'var(--gold)':'var(--border)'};background:${t.on?'var(--goldtint2)':'var(--surface2)'};color:${t.on?'var(--gold)':'var(--muted)'};display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13.5px;font-family:'Hanken Grotesk',sans-serif;">${esc(t.label)}</button>`;
  return `
  <div ${A(V.closeUserForm)} style="position:fixed;inset:0;background:var(--scrim);z-index:50;"></div>
  <div class="scrl" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:51;width:${modalW};max-height:90dvh;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:${pad};${V.popModal('userForm')}box-shadow:0 30px 70px -15px rgba(0,0,0,.8);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h3 style="font-family:'Saira',sans-serif;font-weight:800;font-size:${V.isMobile ? '19px' : '21px'};margin:0;">${V.userFormIsEdit ? 'Edit User' : 'Tambah User Baru'}</h3>
      <button ${A(V.closeUserForm)} title="tutup" style="width:32px;height:32px;border-radius:10px;background:var(--surface2);border:1px solid var(--border);color:var(--muted);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">×</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div>${lbl('Nama Lengkap')}<input id="i-uname-new" value="${esc(V.uName)}" ${I(V.onUName)} placeholder="Nama user" style="${inputStyle(48)}"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>${lbl('Username')}<input id="i-uuname-new" value="${esc(V.uUname)}" ${I(V.onUUname)} placeholder="username" style="${inputStyle(48)}"></div>
        <div>${lbl(V.userFormIsEdit ? 'Password Baru' : 'Password')}
          <div style="position:relative;">
            <input id="i-upass-new" value="${esc(V.uPass)}" ${I(V.onUPass)} type="${V.uPassShow ? 'text' : 'password'}" placeholder="${V.userFormIsEdit ? 'kosongkan jika tetap' : '••••••'}" style="${inputStyle(48)}padding-right:44px;">
            <button ${A(V.toggleUPass)} title="lihat-password" style="position:absolute;right:6px;bottom:6px;width:36px;height:36px;border-radius:9px;background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;">
              ${V.uPassShow
                ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" stroke="#D4AF37" stroke-width="1.7"></path><circle cx="12" cy="12" r="2.6" stroke="#D4AF37" stroke-width="1.7"></circle></svg>`
                : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" stroke="#6c6c74" stroke-width="1.7"></path><circle cx="12" cy="12" r="2.6" stroke="#6c6c74" stroke-width="1.7"></circle><path d="M4 4l16 16" stroke="#6c6c74" stroke-width="1.7" stroke-linecap="round"></path></svg>`}
            </button>
          </div>
        </div>
      </div>
      <div>${lbl('Role')}
        <div style="display:flex;gap:8px;margin-top:2px;flex-wrap:wrap;">${V.uRoleTiles.map(selTile).join('')}</div>
      </div>
      <div>${lbl('Cabang')}
        <div style="display:flex;gap:8px;margin-top:2px;flex-wrap:wrap;">${V.uCabangTiles.map(selTile).join('')}</div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:20px;">
      <button ${A(V.closeUserForm)} style="flex:none;width:95px;height:48px;border-radius:13px;background:var(--chip);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Batal</button>
      <button ${A(V.saveUser)} style="flex:1;height:48px;border:none;border-radius:13px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:14px;letter-spacing:.04em;cursor:pointer;white-space:nowrap;">SIMPAN USER</button>
    </div>
  </div>`;
}

function prodFormHtml(V){
  const pad = V.isMobile ? '20px 16px' : '26px';
  const modalW = V.isMobile ? 'calc(100vw - 24px)' : 'min(560px, calc(100vw - 32px))';
  return `
  <div ${A(V.closeProdForm)} style="position:fixed;inset:0;background:var(--scrim);z-index:50;"></div>
  <div class="scrl" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:51;width:${modalW};max-height:90dvh;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:${pad};${V.popModal('prodForm')}box-shadow:0 30px 70px -15px rgba(0,0,0,.8);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h3 style="font-family:'Saira',sans-serif;font-weight:800;font-size:${V.isMobile ? '19px' : '21px'};margin:0;">Tambah Produk</h3>
      <button ${A(V.closeProdForm)} title="tutup" style="width:32px;height:32px;border-radius:10px;background:var(--surface2);border:1px solid var(--border);color:var(--muted);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">×</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div>${lbl('Nama Produk')}<input id="i-pname" value="${esc(V.pName)}" ${I(V.onPName)} placeholder="Nama produk" style="${inputStyle(48)}"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>${lbl('Varian')}<input id="i-pvar" value="${esc(V.pVar)}" ${I(V.onPVar)} placeholder="Rasa / ukuran" style="${inputStyle(48)}"></div>
        <div>${lbl('Kategori')}<select id="i-pkat" ${I(V.onPKat)} style="${inputStyle(48)}cursor:pointer;">${V.kCatOptions.map(c => `<option value="${esc(c)}"${c===V.pKat?' selected':''}>${esc(c)}</option>`).join('')}</select></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>${lbl('Harga Jual')}<input id="i-pharga" value="${esc(V.pHargaText)}" ${I(V.onPHarga)} placeholder="Rp" inputmode="numeric" style="${inputStyle(48)}"></div>
        <div>${lbl('Harga Modal')}<input id="i-pmodal" value="${esc(V.pModalText)}" ${I(V.onPModal)} placeholder="Rp" inputmode="numeric" style="${inputStyle(48)}"></div>
      </div>
      <div style="font-size:12px;color:var(--ok);background:var(--oktint);border-radius:10px;padding:9px 12px;line-height:1.4;">Margin akan dihitung otomatis dari harga jual &amp; modal.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>${lbl('Cabang')}<select id="i-pbranch" ${I(V.onPBranch)} style="${inputStyle(48)}cursor:pointer;">${V.prodBranchOptions.map(b => `<option value="${esc(b)}"${b===V.pBranch?' selected':''}>${esc(b)}</option>`).join('')}</select></div>
        <div>${lbl('Stok Awal')}<input id="i-pstok" value="${esc(V.pStok)}" ${I(V.onPStok)} inputmode="numeric" placeholder="0" style="${inputStyle(48)}"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>${lbl('Barcode')}
          <div style="display:flex;gap:6px;"><input id="i-pbarcode" value="${esc(V.pBarcode)}" ${I(V.onPBarcode)} placeholder="—" style="flex:1;min-width:0;height:48px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;padding:0 10px;outline:none;font-family:'Hanken Grotesk',sans-serif;"><button ${A(V.openScan)} style="width:42px;flex:none;height:48px;border-radius:12px;background:var(--goldtint);border:1px solid var(--goldborder);cursor:pointer;display:flex;align-items:center;justify-content:center;">${svgScanIc(18)}</button></div>
        </div>
        <div>${lbl('Kedaluwarsa')}<input id="i-pexp" value="${esc(V.pExp)}" ${I(V.onPExp)} type="month" style="${inputStyle(48)}color-scheme:${V.isLight?'light':'dark'};"></div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:20px;">
      <button ${A(V.closeProdForm)} style="flex:none;width:95px;height:48px;border-radius:13px;background:var(--chip);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Batal</button>
      <button ${A(V.saveProd)} style="flex:1;height:48px;border:none;border-radius:13px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:14px;letter-spacing:.04em;cursor:pointer;white-space:nowrap;">SIMPAN PRODUK</button>
    </div>
  </div>`;
}

function catFormHtml(V){
  const pad = V.isMobile ? '20px 16px' : '22px';
  const modalW = V.isMobile ? 'calc(100vw - 24px)' : 'min(440px, calc(100vw - 32px))';
  return `
  <div ${A(V.closeCatForm)} style="position:fixed;inset:0;background:var(--scrim);z-index:50;"></div>
  <div class="scrl" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:51;width:${modalW};max-height:85dvh;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:${pad};${V.popModal('catForm')}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h3 style="font-family:'Saira',sans-serif;font-weight:800;font-size:20px;margin:0;">Kelola Kategori</h3>
      <button ${A(V.closeCatForm)} title="tutup" style="width:30px;height:30px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);color:var(--muted);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
    </div>
    <p style="font-size:13px;color:var(--muted);margin:0 0 16px;line-height:1.5;">Kategori dipakai untuk filter stok dan pengelompokan produk. Kategori yang masih dipakai produk tidak bisa dihapus.</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">
      ${V.catRows.map(c => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--surface2);border:1px solid var(--border);border-radius:11px;padding:9px 9px 9px 14px;">
          <span style="font-size:13.5px;font-weight:600;">${esc(c.name)}</span>
          <button ${A(c.onDelete)} title="hapus-${esc(c.name)}" style="width:30px;height:30px;flex:none;border-radius:9px;background:var(--dangertint);border:1px solid var(--dangerborder);color:var(--danger);font-size:16px;line-height:1;cursor:pointer;">×</button>
        </div>`).join('')}
    </div>
    <div>${lbl('Kategori Baru')}
      <div style="display:flex;gap:8px;">
        <input id="i-newcat" value="${esc(V.newCat)}" ${I(V.onNewCat)} placeholder="cnt. Vitamin" style="flex:1;height:46px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;padding:0 14px;outline:none;font-family:'Hanken Grotesk',sans-serif;">
        <button ${A(V.saveCategory)} style="flex:none;height:46px;padding:0 18px;border:none;border-radius:12px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:13px;letter-spacing:.04em;cursor:pointer;">TAMBAH</button>
      </div>
    </div>
    <button ${A(V.closeCatForm)} style="width:100%;margin-top:14px;height:44px;border-radius:12px;background:var(--chip);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Tutup</button>
  </div>`;
}

function poFormHtml(V){
  const pad = V.isMobile ? '20px 16px' : '22px';
  const modalW = V.isMobile ? 'calc(100vw - 24px)' : 'min(440px, calc(100vw - 32px))';
  return `
  <div ${A(V.closePoForm)} style="position:fixed;inset:0;background:var(--scrim);z-index:50;"></div>
  <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:51;width:${modalW};background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:${pad};${V.popModal('poForm')}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h3 style="font-family:'Saira',sans-serif;font-weight:800;font-size:20px;margin:0;">Buat Purchase Order</h3>
      <button ${A(V.closePoForm)} title="tutup" style="width:30px;height:30px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);color:var(--muted);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
    </div>
    <p style="font-size:13px;color:var(--muted);margin:0 0 16px;line-height:1.5;">Catat hutang pembelian ke supplier. Tandai lunas dari daftar saat sudah dibayar.</p>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>${lbl('Nama Supplier')}<input id="i-poname" value="${esc(V.poName)}" ${I(V.onPoName)} placeholder="cnt. PT Nutrisi Prima" style="${inputStyle(48)}"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>${lbl('Nominal')}<input id="i-poamount" value="${esc(V.poAmountText)}" ${I(V.onPoAmount)} inputmode="numeric" placeholder="Rp0" style="${inputStyle(48)}"></div>
        <div>${lbl('Jatuh Tempo')}<input id="i-podue" value="${esc(V.poDue)}" ${I(V.onPoDue)} type="date" style="${inputStyle(48)}color-scheme:${V.isLight?'light':'dark'};"></div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:18px;">
      <button ${A(V.closePoForm)} style="flex:none;width:95px;height:48px;border-radius:12px;background:var(--chip);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Batal</button>
      <button ${A(V.saveSupplier)} style="flex:1;height:48px;border:none;border-radius:12px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:14px;letter-spacing:.04em;cursor:pointer;white-space:nowrap;">SIMPAN PO</button>
    </div>
  </div>`;
}

function biayaFormHtml(V){
  const pad = V.isMobile ? '20px 16px' : '22px';
  const modalW = V.isMobile ? 'calc(100vw - 24px)' : 'min(460px, calc(100vw - 32px))';
  return `
  <div ${A(V.closeBiayaForm)} style="position:fixed;inset:0;background:var(--scrim);z-index:50;"></div>
  <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:51;width:${modalW};background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:${pad};${V.popModal('biayaForm')}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h3 style="font-family:'Saira',sans-serif;font-weight:800;font-size:20px;margin:0;">Catat Biaya</h3>
      <button ${A(V.closeBiayaForm)} title="tutup" style="width:30px;height:30px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);color:var(--muted);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
    </div>
    <p style="font-size:13px;color:var(--muted);margin:0 0 16px;line-height:1.5;">Sewa/listrik yang rutin tiap bulan, atau printilan sekali ini (plastik, sampah, dll).</p>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>${lbl('Jenis')}
        <div style="display:flex;gap:8px;margin-top:2px;">${V.bxTypeTiles.map(t=>`<button ${A(t.onClick)} style="flex:1;min-width:100px;height:44px;border-radius:11px;cursor:pointer;border:1px solid ${t.on?'var(--gold)':'var(--border)'};background:${t.on?'var(--goldtint2)':'var(--surface2)'};color:${t.on?'var(--gold)':'var(--muted)'};display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13.5px;font-family:'Hanken Grotesk',sans-serif;">${t.label}</button>`).join('')}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>${lbl('Kategori')}<select id="i-bxcategory" ${I(V.onBxCategory)} style="${inputStyle(48)}cursor:pointer;">${V.bxCategoryOptions.map(c => `<option value="${esc(c)}"${c===V.bxCategory?' selected':''}>${esc(c)}</option>`).join('')}</select></div>
        <div>${lbl('Cabang')}<select id="i-bxbranch" ${I(V.onBxBranch)} style="${inputStyle(48)}cursor:pointer;">${V.prodBranchOptions.map(b => `<option value="${esc(b)}"${b===V.bxBranch?' selected':''}>${esc(b)}</option>`).join('')}</select></div>
      </div>
      <div>${lbl('Keterangan (opsional)')}<input id="i-bxnote" value="${esc(V.bxNote)}" ${I(V.onBxNote)} placeholder="cnt. plastik kresek habis" style="${inputStyle(48)}"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>${lbl('Nominal')}<input id="i-bxamount" value="${esc(V.bxAmountText)}" ${I(V.onBxAmount)} inputmode="numeric" placeholder="Rp0" style="${inputStyle(48)}"></div>
        ${V.bxRecurring ? `
        <div>${lbl('Jatuh Tempo (1-31)')}<input id="i-bxdueday" value="${esc(V.bxDueDay)}" ${I(V.onBxDueDay)} inputmode="numeric" placeholder="cnt. 25" style="${inputStyle(48)}"></div>
        ` : `
        <div>${lbl('Tanggal')}<input id="i-bxdate" value="${esc(V.bxDate)}" ${I(V.onBxDate)} type="date" style="${inputStyle(48)}color-scheme:${V.isLight?'light':'dark'};"></div>
        `}
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:18px;">
      <button ${A(V.closeBiayaForm)} style="flex:none;width:95px;height:48px;border-radius:12px;background:var(--chip);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Batal</button>
      <button ${A(V.saveExpense)} style="flex:1;height:48px;border:none;border-radius:12px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:14px;letter-spacing:.04em;cursor:pointer;white-space:nowrap;">SIMPAN BIAYA</button>
    </div>
  </div>`;
}

function promoFormHtml(V){
  const pad = V.isMobile ? '20px 16px' : '22px';
  const modalW = V.isMobile ? 'calc(100vw - 24px)' : 'min(460px, calc(100vw - 32px))';
  const tile = (t) => `<button ${A(t.onClick)} style="flex:1;min-width:100px;height:44px;border-radius:11px;cursor:pointer;border:1px solid ${t.on?'var(--gold)':'var(--border)'};background:${t.on?'var(--goldtint2)':'var(--surface2)'};color:${t.on?'var(--gold)':'var(--muted)'};display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13.5px;font-family:'Hanken Grotesk',sans-serif;">${t.label}</button>`;
  return `
  <div ${A(V.closePromoForm)} style="position:fixed;inset:0;background:var(--scrim);z-index:50;"></div>
  <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:51;width:${modalW};background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:${pad};${V.popModal('promoForm')}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h3 style="font-family:'Saira',sans-serif;font-weight:800;font-size:20px;margin:0;">Buat Promo / Bundle</h3>
      <button ${A(V.closePromoForm)} title="tutup" style="width:30px;height:30px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);color:var(--muted);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>${lbl('Nama Promo')}<input id="i-prname" value="${esc(V.prName)}" ${I(V.onPrName)} placeholder="cnt. Paket Pemula" style="${inputStyle(48)}"></div>
      <div>${lbl('Deskripsi')}<input id="i-prdesc" value="${esc(V.prDesc)}" ${I(V.onPrDesc)} placeholder="cnt. Whey 2lb + Shaker Bottle" style="${inputStyle(48)}"></div>
      <div>${lbl('Tipe')}
        <div style="display:flex;gap:8px;margin-top:2px;">${V.prTypeTiles.map(tile).join('')}</div>
      </div>
      <div>${lbl('Nilai')}<input id="i-prvalue" value="${esc(V.prValue)}" ${I(V.onPrValue)} placeholder="cnt. 15% atau Hemat Rp40.000" style="${inputStyle(48)}"></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:18px;">
      <button ${A(V.closePromoForm)} style="flex:none;width:95px;height:48px;border-radius:12px;background:var(--chip);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Batal</button>
      <button ${A(V.savePromo)} style="flex:1;height:48px;border:none;border-radius:12px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:14px;letter-spacing:.04em;cursor:pointer;white-space:nowrap;">SIMPAN PROMO</button>
    </div>
  </div>`;
}

function restockHtml(V){
  const pad = V.isMobile ? '20px 16px' : '22px';
  const modalW = V.isMobile ? 'calc(100vw - 24px)' : 'min(400px, calc(100vw - 32px))';
  return `
  <div ${A(V.closeRestock)} style="position:fixed;inset:0;background:var(--scrim);z-index:50;"></div>
  <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:51;width:${modalW};background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:${pad};${V.popModal('restock')}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <h3 style="font-family:'Saira',sans-serif;font-weight:800;font-size:20px;margin:0;">Tambah Stok</h3>
      <button ${A(V.closeRestock)} title="tutup" style="width:30px;height:30px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);color:var(--muted);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
    </div>
    <p style="font-size:13px;color:var(--muted);margin:0 0 14px;">${esc(V.restockName)} · stok sekarang <b style="color:var(--text2);">${V.restockStokText}</b></p>
    <div>${lbl('Jumlah Masuk')}
      <input id="i-restockqty" value="${esc(V.restockQty)}" ${I(V.onRestockQty)} inputmode="numeric" placeholder="0" style="width:100%;box-sizing:border-box;height:52px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:21px;font-family:'Saira',sans-serif;font-weight:700;padding:0 14px;outline:none;">
    </div>
    <div style="display:flex;gap:10px;margin-top:16px;">
      <button ${A(V.closeRestock)} style="flex:none;width:95px;height:48px;border-radius:12px;background:var(--chip);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Batal</button>
      <button ${A(V.saveRestock)} style="flex:1;height:48px;border:none;border-radius:12px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:14px;letter-spacing:.04em;cursor:pointer;white-space:nowrap;">TAMBAHKAN</button>
    </div>
  </div>`;
}

function toastHtml(V){
  return `
  <div style="position:fixed;bottom:32px;left:50%;transform:translateX(-50%);z-index:60;background:var(--chip);border:1px solid var(--goldborder);border-radius:14px;padding:14px 22px;display:flex;align-items:center;gap:11px;box-shadow:0 16px 36px -10px var(--shadowc);${V.popToast}white-space:nowrap;">
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#46C46A" stroke-width="1.8"></circle><path d="M8 12l2.5 2.5L16 9" stroke="#46C46A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
    <span style="font-size:14px;font-weight:500;">${esc(V.toast)}</span>
  </div>`;
}

/* ================= root render ================= */
const root = document.getElementById('app');

function html(V){
  return `<div class="ss-root ${V.themeClass}" style="min-height:100dvh; width:100%; max-width:100vw; background:var(--bg); color:var(--text); font-family:'Hanken Grotesk',system-ui,sans-serif; position:relative; overflow:hidden;">
    ${V.scrLogin ? loginHtml(V) : ''}
    ${V.scrMode ? modeHtml(V) : ''}
    ${V.scrCashier ? renderCashier(V) : ''}
    ${V.adminShell ? adminHtml(V) : ''}
    ${V.scrSettings ? settingsHtml(V) : ''}
    ${V.memberDropdown ? memberDdPanelHtml(V) : ''}
    ${V.bell ? bellHtml(V) : ''}
    ${V.scan ? scanHtml(V) : ''}
    ${V.branchForm ? branchFormHtml(V) : ''}
    ${V.catForm ? catFormHtml(V) : ''}
    ${V.userForm ? userFormHtml(V) : ''}
    ${V.prodForm ? prodFormHtml(V) : ''}
    ${V.poForm ? poFormHtml(V) : ''}
    ${V.biayaForm ? biayaFormHtml(V) : ''}
    ${V.promoForm ? promoFormHtml(V) : ''}
    ${V.restockOpen ? restockHtml(V) : ''}
    ${V.toast ? toastHtml(V) : ''}
  </div>`;
}

let lastScreen = null;
let prevOpen = {};
function render(){
  reg = [];
  const V = renderVals();

  // Animasi masuk hanya diputar saat layar/pop-up BARU muncul — bukan di setiap
  // render ulang (full re-render tiap interaksi membuat layar terasa "bergerak").
  const sameScreen = S.screen === lastScreen;
  const openNow = { bell:S.bell, scan:S.scan, branchForm:S.branchForm, catForm:S.catForm,
    userForm:S.userForm, prodForm:S.prodForm, more:S.more,
    poForm:S.poForm, promoForm:S.promoForm, biayaForm:S.biayaForm, restock:S.restockId!==null,
    branchMenu:S.branchMenu, memberDd:S.memberDropdown, toast:!!S.toast };
  V.popScreen = sameScreen ? '' : 'animation:ssPop .3s ease;';
  V.pop = k => prevOpen[k] ? '' : 'animation:ssPop .22s ease;';
  V.popModal = k => prevOpen[k] ? '' : 'animation:ssModal .22s ease;'; // modal tengah: keyframes menyertakan translate(-50%,-50%)
  V.popToast = prevOpen.toast ? '' : 'animation:ssToast .25s ease;';

  const ae = document.activeElement;
  let fid = null, selStart = null, selEnd = null;
  if(ae && ae.id && root.contains(ae)){
    fid = ae.id;
    try { selStart = ae.selectionStart; selEnd = ae.selectionEnd; } catch(e){}
  }
  // pertahankan posisi scroll antar render (overlay selalu dirender paling akhir,
  // jadi pencocokan berdasarkan urutan aman untuk konten utama)
  const scrolls = sameScreen ? [...root.querySelectorAll('.scrl')].map(el => el.scrollTop) : null;
  root.innerHTML = html(V);
  if(scrolls){
    [...root.querySelectorAll('.scrl')].forEach((el, i) => { if(i < scrolls.length && scrolls[i]) el.scrollTop = scrolls[i]; });
  }
  lastScreen = S.screen;
  prevOpen = openNow;
  // modal scan admin: innerHTML membuat <video> baru tiap render → pasang ulang stream kamera
  if(S.scan && scanStream){
    const v = document.getElementById('scan-video');
    if(v && v.srcObject !== scanStream){ v.srcObject = scanStream; v.play().catch(()=>{}); }
  }
  // modal scan kasir: pasang stream ke elemen k-scan-video
  if(S.k_scanMode && kScanStream){
    const kv = document.getElementById('k-scan-video');
    if(kv && kv.srcObject !== kScanStream){ kv.srcObject = kScanStream; kv.play().catch(()=>{}); }
  }
  // dropdown anggota di-portal ke root (lihat memberDdPanelHtml) → posisinya tak bisa
  // dihitung CSS murni (tak nested di bawah tombolnya lagi), diukur manual dari trigger
  if(S.memberDropdown){
    const btn = document.getElementById('btn-memberdd');
    const panel = document.getElementById('memberdd-panel');
    if(btn && panel){
      const r = btn.getBoundingClientRect();
      const w = Math.max(r.width, 320);
      // jangan biarkan panel keluar tepi kanan viewport (mis. trigger dekat pinggir layar)
      const left = Math.min(r.left, window.innerWidth - w - 12);
      panel.style.top = (r.bottom + 8) + 'px';
      panel.style.left = Math.max(left, 12) + 'px';
      panel.style.width = w + 'px';
    }
  }
  if(fid){
    const el = document.getElementById(fid);
    if(el){
      el.focus();
      if(selStart != null && el.setSelectionRange){
        const len = el.value.length;
        try { el.setSelectionRange(Math.min(selStart,len), Math.min(selEnd,len)); } catch(e){}
      }
    }
  }
}

/* ================= events ================= */
root.addEventListener('click', e => {
  const t = e.target.closest('[data-a]');
  if(t && reg[+t.dataset.a]) reg[+t.dataset.a](e);
});
root.addEventListener('input', e => {
  const t = e.target.closest('[data-i]');
  if(t && reg[+t.dataset.i]) reg[+t.dataset.i]({ target: t });
});
root.addEventListener('keydown', e => {
  if(e.key === 'Enter' && (e.target.id === 'i-uname' || e.target.id === 'i-pass')) login();
  if(e.key === 'Escape' && S.memberDropdown) setState({memberDropdown:false});
});

/* ============ Kontrak runtime untuk modul kasir (public/js/kasir.js) ============
   app.js merender seluruh admin + login + mode. Layar kasir (S.screen==='cashier')
   didelegasikan ke modul kasir. Teman yang pegang kasir cukup:

     window.SS.registerCashier(function(V){ return '<div>...HTML kasir...</div>'; });

   Selama fungsi itu berjalan (di dalam render), pakai:
     SS.A(handler)  -> untuk onclick   (sisipkan di atribut tombol)
     SS.I(handler)  -> untuk oninput   (sisipkan di atribut input)
     SS.setState({...})  ubah state & render ulang
     SS.api(path, method, body)  panggil backend (CSRF & error sudah diurus)
     SS.flash(pesan)  toast; SS.esc/SS.rp  escape & format Rupiah
     SS.DB.products / SS.DB.categories  data; SS.USER  user aktif
     SS.go('mode') / SS.go('settings')  navigasi antar layar
   Detail lengkap ada di header public/js/kasir.js. */
let cashierRenderer = null;
function renderCashier(V){ return cashierRenderer ? cashierRenderer(V) : cashierPlaceholder(V); }
function cashierPlaceholder(V){
  const btn = (handler, label, gold) => `<button ${A(handler)} style="height:44px;padding:0 18px;border-radius:12px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13.5px;font-weight:600;border:1px solid ${gold?'var(--goldborder)':'var(--border)'};background:${gold?'var(--goldtint)':'var(--surface2)'};color:${gold?'var(--gold)':'var(--text2)'};">${label}</button>`;
  return `<div style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;gap:16px;background:var(--bg);color:var(--text);">
    <div style="width:74px;height:74px;border-radius:20px;background:var(--goldtint);border:1px solid var(--goldborder);display:flex;align-items:center;justify-content:center;">${svgCartIc(34)}</div>
    <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:23px;">Halaman Kasir</div>
    <div style="font-size:14px;color:var(--muted);max-width:440px;line-height:1.6;">Bagian kasir sedang dikembangkan oleh tim. Kode &amp; panduannya ada di <b style="color:var(--text2);">public/js/kasir.js</b>.</div>
    <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;justify-content:center;">
      ${V.isAdmin ? btn(V.goModeScreen, 'Ganti Mode', true) : ''}
      ${btn(V.openSettings, 'Pengaturan')}
      ${btn(V.logout, 'Keluar')}
    </div>
  </div>`;
}

// ekspose runtime minimal untuk modul kasir (dibaca oleh public/js/kasir.js)
window.SS = {
  get S(){ return S; }, get DB(){ return DB; }, get USER(){ return USER; },
  setState, api, flash, render, A, I, esc, rp, rpShort, ic, go, logout,
  // scan kamera kasir (stream terpisah dari scan admin)
  startScanKasir, stopScanKasir, changeScanDeviceKasir, saveRestockKasir,
  registerCashier(fn){ cashierRenderer = fn; if(S.screen==='cashier') render(); },
};

let rzT;
window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(()=>setState({ vw: window.innerWidth }), 100); });

/* ================= boot ================= */
let theme = 'dark';
try { theme = localStorage.getItem('ss_theme') || 'dark'; } catch(e){}
S.theme = theme;
applyThemeBg(theme);
render(); // tampilkan login dulu; sesi lama dipulihkan async di bawah
(async () => {
  try {
    const r = await api('/me');
    if (r.user) { USER = r.user; await loadAll(); enterApp(); return; }
  } catch(e) { /* belum login */ }
  setState({ screen:'login' });
})();
})();
