/* Suplemen Semarang Store — frontend (ported from the Claude Design file), data dari API Laravel */
(function () {
'use strict';

/* ================= server data ================= */
const DB = { branches: [], categories: [], products: [], receivables: [], users: [], suppliers: [], dash: {}, byUser: {}, memberItems: {} };
let USER = null;

// promo masih statis di FE — layarnya display-only di desain, belum ada aksi backend
const PROMOS = [
  { name:'Paket Pemula', desc:'Whey 2lb + Shaker Bottle', type:'Bundle', value:'Hemat Rp40.000', color:'var(--gold)' },
  { name:'Diskon Creatine', desc:'Semua varian Creatine', type:'Diskon', value:'15%', color:'var(--ok)' },
  { name:'Bundle Recovery', desc:'BCAA + L-Glutamine', type:'Bundle', value:'Hemat Rp55.000', color:'var(--gold)' },
  { name:'Flash Sale Vitamin', desc:'Vitamin C & Multivitamin', type:'Diskon', value:'Rp10.000', color:'var(--ok)' },
];

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
  DB.byUser = {}; DB.memberItems = {};        // data berubah setelah tulis → buang cache per-anggota
  if(USER && USER.role === 'admin') await loadByUser(S.uPeriod);
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

/* ================= state ================= */
let S = {
  screen: 'boot', role: null, who: '', branch: 'Pleburan', // 'boot' = latar kosong selama cek sesi

  vw: window.innerWidth, navOpen: false, sideCollapsed: false,
  uname: '', pass: '', loginErr: '',
  cart: [], pay: 'tunai', cash: 0, tempoName: '', tempoDate: '',
  search: '', bell: false, more: false, toast: '',
  pf: 'Semua', pq: '',
  stokCat: 'Semua', userRole: 'Semua',
  scan: false, userForm: false, prodForm: false,
  period: 'Harian', uPeriod: 'Mingguan', selMembers: [], memberOpen: null, memberSearch: '', memberDropdown: false, // selMembers = pegawai dipilih utk banding ([] = semua)
  pendingSlot: '',
  kName: '', kVar: '', kPrice: '', kCat: 'Protein', kStok: '',
  uName: '', uUname: '', uPass: '', uRole: 'Kasir', uCabang: 'Pleburan',
  theme: 'dark', cashierTab: 'katalog', settingsBack: 'cashier',
  branchMenu: false, branchForm: false, newBranch: '',
  catForm: false, newCat: '',
  cartSheetOpen: false,
};

const slotImages = {}; // foto produk yang diunggah, keyed by slot id (data URL)
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
    refresh:['M21 12a9 9 0 1 1-2.6-6.4','M21 3v4h-4'],
    scan:['M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M6 12h12'],
    warn:['M12 9v4M12 17h.01','M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'],
    settings:['M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z'],
  };
  const circles = { tempo:[12,12,9], settings:[12,12,3] };
  let body = (P[name]||[]).map(d => `<path d="${d}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="stroke:${color};fill:none"></path>`).join('');
  if(circles[name]){ const c=circles[name]; body += `<circle cx="${c[0]}" cy="${c[1]}" r="${c[2]}" stroke-width="1.8" style="stroke:${color};fill:none"></circle>`; }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="flex:none">${body}</svg>`;
}

/* ================= state machinery ================= */
let reg = [];
const A = fn => { reg.push(fn); return `data-a="${reg.length-1}"`; };  // click handler
const I = fn => { reg.push(fn); return `data-i="${reg.length-1}"`; };  // input handler

function setState(patch){ Object.assign(S, typeof patch==='function' ? patch(S) : patch); render(); }
const go = s => () => setState({ screen:s, more:false, bell:false, navOpen:false });

let toastT;
function flash(msg){ setState({ toast: msg }); clearTimeout(toastT); toastT = setTimeout(()=>setState({toast:''}), 2600); }

function applyThemeBg(t){ const c = t==='light' ? '#ECEAE3' : '#0a0a0c'; document.body.style.background = c; document.documentElement.style.background = c; }
function setTheme(t){ try { localStorage.setItem('ss_theme', t); } catch(e){} applyThemeBg(t); setState({ theme: t }); }

/* ================= actions (API) ================= */
function enterApp(){
  setState({
    role: USER.role, who: (USER.name||'').split(' ')[0] || 'User',
    branch: USER.branch || 'Pleburan',
    screen: USER.role === 'admin' ? 'mode' : 'cashier',
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

function addProd(id){
  setState(s=>{
    const ex = s.cart.find(c=>c.id===id);
    return { cart: ex ? s.cart.map(c=>c.id===id?{...c,qty:c.qty+1}:c) : [...s.cart, {id,qty:1}] };
  });
}
function changeQty(id,d){
  setState(s=>({ cart: s.cart.map(c=>c.id===id?{...c,qty:c.qty+d}:c).filter(c=>c.qty>0) }));
}

async function completeSale(total, change, cashBranch){
  if(S.cart.length===0) return;
  if(S.pay==='tunai' && S.cash < total){ flash('Uang yang diterima masih kurang'); return; }
  if(S.pay==='tempo' && !S.tempoName.trim()){ flash('Isi nama pembeli untuk tempo'); return; }
  const tempoName = S.tempoName;
  try {
    const r = await api('/api/transactions', 'POST', {
      branch: cashBranch, method: S.pay, cash: S.pay==='tunai' ? S.cash : null,
      tempo_name: tempoName.trim() || null, tempo_due: S.tempoDate || null,
      items: S.cart.map(c => ({ id: c.id, qty: c.qty })),
    });
    let msg;
    if(S.pay==='tunai') msg = 'Transaksi selesai · Kembalian '+rp(Math.max(0, r.change));
    else if(S.pay==='tempo') msg = 'Tempo dicatat atas nama '+tempoName;
    else msg = 'Penjualan marketplace tercatat';
    Object.assign(S, { cart:[], cash:0, pay:'tunai', tempoName:'', tempoDate:'', search:'', cartSheetOpen:false });
    await loadAll();
    flash(msg);
  } catch(e) { flash(e.message); }
}

async function markPaid(id){
  try { await api('/api/receivables/'+id+'/pay', 'POST', {}); await loadAll(); flash('Tagihan ditandai lunas'); }
  catch(e) { flash(e.message); }
}

async function saveKProduct(cashBranch){
  if(!S.kName.trim()){ flash('Isi nama produk dulu'); return; }
  const harga = parseInt((S.kPrice||'').replace(/\D/g,''))||0;
  if(!harga){ flash('Isi harga jual dulu'); return; }
  const nama = S.kName.trim();
  try {
    await api('/api/products', 'POST', {
      name: nama, varian: S.kVar.trim() || '-', harga,
      stok: parseInt(S.kStok)||0, kategori: S.kCat, branch: cashBranch,
      photo: slotImages[S.pendingSlot] || null,
    });
    Object.assign(S, { cashierTab:'katalog' });
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
  if(!S.uName.trim() || !S.uUname.trim() || !S.uPass){ flash('Lengkapi nama, username, dan password'); return; }
  try {
    await api('/api/users', 'POST', { name:S.uName.trim(), username:S.uUname.trim(), password:S.uPass, role:S.uRole, branch:S.uCabang });
    Object.assign(S, { userForm:false });
    await loadAll();
    flash('User baru tersimpan');
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

/* ================= view model (ported renderVals) ================= */
function renderVals(){
  const branch = S.branch;
  const isDesktop = S.vw >= 900;
  const isMobile = !isDesktop;
  const isNarrow = S.vw < 380;
  const recv = recvView();
  const recvBranch = recv.filter(r => branch==='Semua' || r.cabang === branch);
  const cashBranch = branch==='Semua' ? 'Pleburan' : branch;
  const dueSoon = recvBranch.filter(r => r.soon);
  const bellCount = dueSoon.length;

  const all = DB.products;
  const byId = Object.fromEntries(all.map(p=>[p.id,p]));
  const cartLines = S.cart.map(c => {
    const p = byId[c.id];
    return { id:c.id, name:p.name, varian:p.varian, qtyText:String(c.qty),
      priceText:rp(p.harga), lineText:rp(p.harga*c.qty),
      onInc:()=>changeQty(c.id,1), onDec:()=>changeQty(c.id,-1) };
  });
  const cartTotal = S.cart.reduce((s,c)=>s + byId[c.id].harga*c.qty, 0);
  const change = S.cash - cartTotal;

  const q = S.search.trim().toLowerCase();
  const catalog = all.filter(p => p.cabang===cashBranch && (!q || (p.name+' '+p.varian).toLowerCase().includes(q))).map(p => {
    let st, sc;
    if(p.stok<=0){ st='Habis'; sc='var(--danger)'; } else if(p.stok<=5){ st='Sisa '+p.stok; sc='var(--warn)'; } else { st='Stok '+p.stok; sc='var(--okbadge)'; }
    const photo = p.photo || '';
    return { id:p.id, photo, hasPhoto: !!photo,
      name:p.name, varian:p.varian, priceText:rp(p.harga), stokText:st, stokColor:sc,
      onAdd: p.stok<=0 ? (()=>flash('Stok habis')) : (()=>addProd(p.id)) };
  });

  const seg = (active) => active
    ? { Bg:'linear-gradient(180deg,var(--goldhi),var(--gold))', Color:'#161208', Border:'var(--gold)' }
    : { Bg:'var(--surface2)', Color:'var(--text2)', Border:'var(--border)' };
  const t1=seg(S.pay==='tunai'), t2=seg(S.pay==='marketplace'), t3=seg(S.pay==='tempo');

  const D = getDash(branch);
  const wmax = Math.max(...D.week.map(w=>w.v), 0.1);
  const weekBars = D.week.map((w,i)=>{ const today=i===D.week.length-1;
    return { label:w.label, valText:w.v.toFixed(1), valColor: today?'var(--gold)':'var(--muted)',
      h:(w.v/wmax*100).toFixed(0)+'%', fill: today?'linear-gradient(180deg,var(--goldhi),var(--gold))':'var(--barempty)' }; });
  const tmax = Math.max(...D.top.map(t=>t.sold), 1);
  const topProducts = D.top.map(t=>({ name:t.name, soldText:t.sold+' terjual', w:(t.sold/tmax*100).toFixed(0)+'%' }));
  const piutangTotal = recvBranch.filter(r=>!r.paid).reduce((s,r)=>s+r.amount,0);
  const dueSoonTotal = dueSoon.reduce((s,r)=>s+r.amount,0);

  const bellItems = dueSoon.slice().sort((a,b)=>a.dl-b.dl).map(r=>{ const over=r.dl<0;
    return { name:r.name, amountText:rp(r.amount), cabang:r.cabang,
      dueText: over ? 'Lewat '+Math.abs(r.dl)+'h' : (r.dl===0?'Hari ini':'H-'+r.dl),
      dueColor: over?'var(--danger)':'var(--warn)',
      dotBg: over?'var(--dangertint)':'var(--warntint)', dotColor: over?'var(--danger)':'var(--warn)' }; });

  const sectionTitlesMobile = { dashboard:'Dashboard', piutang:'Piutang', tempo:'Jatuh Tempo', stok:'Stok', users:'User', laporan:'Laporan', produk:'Produk', supplier:'Supplier', promo:'Promo', shopee:'Shopee' };
  const sectionTitles = { dashboard:'Dashboard', piutang:'Piutang & Tempo', tempo:'Jatuh Tempo', stok:'Manajemen Stok', users:'Manajemen User', laporan:'Laporan Omset', produk:'Produk & Harga', supplier:'Pembelian / Supplier', promo:'Promo & Bundle', shopee:'Integrasi Shopee' };
  const adminSet = ['dashboard','piutang','tempo','stok','users','laporan','produk','supplier','promo','shopee'];

  const chip = (on)=> on ? {bd:'var(--gold)',bg:'var(--goldtint2)',cl:'var(--gold)'} : {bd:'var(--border)',bg:'var(--surface2)',cl:'var(--muted)'};

  const sbDef = [
    {k:'dashboard',label:'Dashboard'},
    {k:'piutang',label:'Piutang'},
    {k:'tempo',label:'Jatuh Tempo'},
    {k:'stok',label:'Manajemen Stok'},
    {k:'produk',label:'Produk & Harga'},
    {k:'laporan',label:'Laporan Omset'},
    {k:'users',label:'Manajemen User'},
    {k:'supplier',label:'Pembelian'},
    {k:'promo',label:'Promo & Bundle'},
    {k:'shopee',label:'Integrasi Shopee'},
  ];
  const sidebarItems = sbDef.map(d=>{ const on = S.screen===d.k;
    return { label:d.label, icon:ic(d.k, on?'var(--gold)':'var(--muted2)', 19),
      bg:on?'var(--goldtint2)':'transparent', cl:on?'var(--gold)':'var(--muted2)', bd:on?'rgba(212,175,55,.4)':'transparent',
      onClick:go(d.k) }; });
  const giftIcon = ic('promo','var(--gold)',26);
  const refreshIcon = ic('refresh','var(--gold)',16);
  const settingsIcon = ic('settings','var(--gold)',16);

  const bottomTabsMore = ['tempo','produk','laporan','users','supplier','promo','shopee'];
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
    {k:'shopee',label:'Shopee'},
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
    return { name:p.name, varian:p.varian, kategori:p.kategori, stokText:p.stok+' pcs', status:st, color:c, bg };
  });
  const catChips = cats.map(c=>({ label:c, ...chip(S.stokCat===c), onClick:()=>setState({stokCat:c}) }));

  const userRows = DB.users.filter(u=>(branch==='Semua'||u.cabang===branch) && (S.userRole==='Semua'||u.role===S.userRole)).map(u=>({
    name:u.name, unameText:'@'+u.uname, role:u.role, roleColor:u.role==='Admin'?'var(--gold)':'var(--info)',
    roleBg:u.role==='Admin'?'var(--goldtint2)':'var(--infotint)', cabang:u.cabang,
    statusText:u.active?'Aktif':'Nonaktif', statusColor:u.active?'var(--ok)':'var(--dim)',
    toggleText:u.active?'Nonaktifkan':'Aktifkan',
    onEdit:()=>flash('Edit '+u.name), onToggle:()=>toggleUser(u) }));
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
  const lapMap={
    Harian:{ total:D.today, bars:D.week.map(w=>({label:w.label, v:w.v})) },
    Mingguan:{ total:Math.round(D.month/4), bars:[{label:'Mg 1',v:D.month/4*0.9/1e6},{label:'Mg 2',v:D.month/4*1.05/1e6},{label:'Mg 3',v:D.month/4*0.95/1e6},{label:'Mg 4',v:D.month/4*1.1/1e6}] },
    Bulanan:{ total:D.month, bars:[{label:'Jan',v:D.month*0.82/1e6},{label:'Feb',v:D.month*0.88/1e6},{label:'Mar',v:D.month*0.95/1e6},{label:'Apr',v:D.month*0.9/1e6},{label:'Mei',v:D.month*1.02/1e6},{label:'Jun',v:D.month/1e6}] },
  };
  const lapSel=lapMap[S.period]; const lmax=Math.max(...lapSel.bars.map(b=>b.v), 0.1);
  const lapBars=lapSel.bars.map((b,i)=>({label:b.label, valText:b.v.toFixed(1), h:(b.v/lmax*100).toFixed(0)+'%',
    fill:i===lapSel.bars.length-1?'linear-gradient(180deg,var(--goldhi),var(--gold))':'var(--barempty)', valColor:i===lapSel.bars.length-1?'var(--gold)':'var(--muted)'}));
  const lapTotal=lapSel.total;
  const lapMethods=[{label:'Tunai',amt:lapTotal*ratios.tunai,color:'var(--ok)'},{label:'Marketplace',amt:lapTotal*ratios.market,color:'var(--info)'},{label:'Tempo',amt:lapTotal*ratios.tempo,color:'var(--warn)'}]
    .map(m=>({label:m.label, amountText:rp(m.amt), w:(m.amt/(lapTotal||1)*100).toFixed(0)+'%', color:m.color}));
  const periodChips=['Harian','Mingguan','Bulanan'].map(p=>({label:p, ...chip(S.period===p), onClick:()=>setState({period:p})}));
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
  // tabel menampilkan yang dipilih; kalau belum ada yang dipilih → semua (peringkat penuh)
  const mVisible = mSel.size ? mRanked.filter(u=>mSel.has(u.uname)) : mRanked;
  const memberRows = mVisible.map(u => ({
    rank:u.rank, name:u.name, unameText:'@'+u.uname, roleText:u.role, cabang:u.cabang,
    totalText:rp(u.total), trxText:u.trx+'×', trxLong:u.trx+' transaksi', w:(u.total/mMax*100).toFixed(0)+'%',
    open: S.memberOpen===u.uname, onDetail: ()=>openMemberDetail(u.uname),
    items: DB.memberItems[u.uname+'|'+S.uPeriod], // undefined = sedang dimuat
  }));
  // isi dropdown: seluruh pegawai, disaring oleh teks pencarian di dalam dropdown
  const mq = S.memberSearch.trim().toLowerCase();
  const memberOptions = (mq ? mRanked.filter(u => (u.name+' @'+u.uname).toLowerCase().includes(mq)) : mRanked)
    .map(u => ({ name:u.name, unameText:'@'+u.uname, roleText:u.role, totalText:rp(u.total),
      checked: mSel.has(u.uname), onClick: ()=>toggleSel(u.uname) }));
  // footer: kalau ada yang dipilih → jumlah terpilih; kalau tidak → seluruh pegawai
  const memberTotal = mVisible.reduce((s,u)=>s+u.total,0);
  const memberTrx = mVisible.reduce((s,u)=>s+u.trx,0);

  const supplierTotal=DB.suppliers.filter(s=>!s.paid).reduce((a,s)=>a+s.amount,0);
  const supplierRows=DB.suppliers.map(s=>{ const dl=daysLeft(s.due); const over=dl<0 && !s.paid;
    return { name:s.name, amountText:rp(s.amount), dueText:fmtDate(s.due),
      status: s.paid?'Lunas':(over?'Terlambat':'Belum Lunas'), color: s.paid?'var(--ok)':(over?'var(--danger)':'var(--warn)'),
      bg: s.paid?'var(--oktint)':(over?'var(--dangertint)':'var(--warntint)') }; });

  return {
    scrLogin: S.screen==='login',
    scrMode: S.screen==='mode',
    cashierDesktop: S.screen==='cashier' && isDesktop,
    cashierMobile: S.screen==='cashier' && isMobile,
    adminShell: S.role==='admin' && adminSet.includes(S.screen),
    secDashboard: S.screen==='dashboard', secPiutang: S.screen==='piutang', secTempo: S.screen==='tempo',
    secStok: S.screen==='stok', secUsers: S.screen==='users', secLaporan: S.screen==='laporan',
    secProduk: S.screen==='produk', secSupplier: S.screen==='supplier', secPromo: S.screen==='promo', secShopee: S.screen==='shopee',
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

    who:S.who, branch, cashBranch,
    branchLabel: branch==='Semua' ? 'Semua Cabang' : branch,
    settingsBranchText: branch==='Semua' ? 'Semua Cabang' : 'Cabang '+branch,
    tempoScopeText: branch==='Semua' ? 'semua cabang' : 'cabang '+branch,
    isSemua: branch==='Semua',
    topEmpty: D.top.length===0,
    catalogEmpty: catalog.length===0,
    perBranchBars,
    logout:()=>logout(),
    goKasir:go('cashier'), goDash:go('dashboard'), goModeScreen:go('mode'),

    search:S.search, onSearch:(e)=>setState({search:e.target.value}),
    catalog,
    cartLines, cartEmpty:S.cart.length===0, cartHasItems:S.cart.length>0,
    cartCountText: S.cart.length ? S.cart.reduce((s,c)=>s+c.qty,0)+' item' : '',
    cartTotalText:rp(cartTotal),
    cartSheetOpen:S.cartSheetOpen,
    openCartSheet:()=>setState({cartSheetOpen:true}),
    closeCartSheet:()=>setState({cartSheetOpen:false}),
    payTunai:()=>setState({pay:'tunai'}), payMarket:()=>setState({pay:'marketplace'}), payTempo:()=>setState({pay:'tempo'}),
    isTunai:S.pay==='tunai', isMarket:S.pay==='marketplace', isTempo:S.pay==='tempo',
    tunaiBg:t1.Bg, tunaiColor:t1.Color, tunaiBorder:t1.Border,
    marketBg:t2.Bg, marketColor:t2.Color, marketBorder:t2.Border,
    tempoBg:t3.Bg, tempoColor:t3.Color, tempoBorder:t3.Border,
    cashText: S.cash ? rp(S.cash) : '',
    onCash:(e)=>{ const n=parseInt((e.target.value||'').replace(/\D/g,''))||0; setState({cash:n}); },
    qPas:()=>setState({cash:cartTotal}), q50:()=>setState({cash:50000}), q100:()=>setState({cash:100000}), q200:()=>setState({cash:200000}),
    changeLabel: change<0 ? 'Uang Kurang' : 'Kembalian',
    changeColor: change<0 ? 'var(--danger)' : 'var(--ok)',
    changeText: rp(Math.abs(change)),
    tempoName:S.tempoName, onTempoName:(e)=>setState({tempoName:e.target.value}),
    tempoDate:S.tempoDate, onTempoDate:(e)=>setState({tempoDate:e.target.value}),
    completeSale:()=>completeSale(cartTotal, change, cashBranch),
    openScan:()=>setState({scan:true}),
    pendingSlot:S.pendingSlot,
    kName:S.kName, onKName:(e)=>setState({kName:e.target.value}),
    kVar:S.kVar, onKVar:(e)=>setState({kVar:e.target.value}),
    kStok:S.kStok, onKStok:(e)=>setState({kStok:(e.target.value||'').replace(/\D/g,'')}),
    kPriceText: S.kPrice ? rp(parseInt(S.kPrice)) : '', onKPrice:(e)=>setState({kPrice:(e.target.value||'').replace(/\D/g,'')}),
    kCatOptions: DB.categories.map(c=>c.name),
    onKCat:(e)=>setState({kCat:e.target.value}),
    saveKProduct:()=>saveKProduct(cashBranch),

    themeClass: S.theme==='light' ? 'theme-light' : 'theme-dark',
    isLight: S.theme==='light',
    isDark: S.theme!=='light',
    toggleTheme:()=>setTheme(S.theme==='light'?'dark':'light'),

    cashierTab:S.cashierTab, isKatalogTab:S.cashierTab==='katalog', isTambahTab:S.cashierTab==='tambah',
    katalogTabSeg: chip(S.cashierTab==='katalog'),
    tambahTabSeg: chip(S.cashierTab==='tambah'),
    goKatalogTab:()=>setState({cashierTab:'katalog'}),
    goTambahTab:()=>setState({cashierTab:'tambah', pendingSlot:'foto_custom_'+Date.now(), kName:'',kVar:'',kPrice:'',kCat:(DB.categories[0]||{}).name||'',kStok:''}),

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
    d_piutangText:rp(piutangTotal), d_dueSoonText:bellCount+' tagihan · '+rpShort(dueSoonTotal),

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

    scan:S.scan, closeScan:()=>setState({scan:false}),
    doScan:()=>{ setState({scan:false}); flash('Barcode terbaca: Whey Isolate 2lb'); },

    piutangRows, pfChips, pq:S.pq, onPQ:(e)=>setState({pq:e.target.value}), piutangEmpty:piutangRows.length===0,
    tempoRows, tempoEmpty:tempoRows.length===0,
    stokRows, catChips, openScanStok:()=>setState({scan:true}), stokEmpty:stokRows.length===0,
    catForm:S.catForm, newCat:S.newCat,
    openCatForm:()=>setState({catForm:true, newCat:''}),
    closeCatForm:()=>setState({catForm:false}),
    onNewCat:(e)=>setState({newCat:e.target.value}),
    saveCategory:()=>saveCategory(),
    catRows: DB.categories.map(c=>({ id:c.id, name:c.name, onDelete:()=>deleteCategory(c) })),
    userRows, uRoleChips, userForm:S.userForm,
    openUserForm:()=>setState({userForm:true, uName:'', uUname:'', uPass:'', uRole:'Kasir', uCabang: branch==='Semua' ? (allBranches()[0]||'Pleburan') : branch}),
    closeUserForm:()=>setState({userForm:false}),
    uName:S.uName, onUName:(e)=>setState({uName:e.target.value}),
    uUname:S.uUname, onUUname:(e)=>setState({uUname:e.target.value}),
    uPass:S.uPass, onUPass:(e)=>setState({uPass:e.target.value}),
    uRoleTiles: ['Admin','Kasir'].map(r=>({ label:r, on:S.uRole===r, onClick:()=>setState({uRole:r}) })),
    uCabangTiles: allBranches().map(b=>({ label:b, on:S.uCabang===b, onClick:()=>setState({uCabang:b}) })),
    saveUser:()=>saveUser(),
    produkRows, prodForm:S.prodForm,
    openProdForm:()=>setState({prodForm:true}), closeProdForm:()=>setState({prodForm:false}),
    saveProd:()=>{ setState({prodForm:false}); flash('Produk tersimpan'); },
    lapBars, lapTotalText:rp(lapTotal), lapMethods, periodChips, branchCompare, period:S.period,
    uPeriod:S.uPeriod,
    uPeriodChips: ['Mingguan','Bulanan','Tahunan'].map(p=>({label:p, ...chip(S.uPeriod===p), onClick:()=>changeUPeriod(p)})),
    memberRows, memberLoading: mLoading,
    memberNoData: !mLoading && mRanked.length===0,
    // dropdown pilih pegawai (bisa dicari, multi-select)
    memberDropdown: S.memberDropdown,
    memberDdLabel: mSel.size ? mSel.size+' pegawai dipilih' : 'Semua pegawai',
    toggleMemberDd: ()=>setState({memberDropdown:!S.memberDropdown, memberSearch:''}),
    closeMemberDd: ()=>setState({memberDropdown:false}),
    memberSearch:S.memberSearch, onMemberSearch:(e)=>setState({memberSearch:e.target.value}),
    memberOptions, memberOptionsEmpty: memberOptions.length===0,
    memberSelCount: mSel.size,
    clearMemberSel: ()=>setState({selMembers:[]}),
    memberTotalText: rp(memberTotal), memberTrxText: memberTrx+' transaksi',
    memberFooterLabel: mSel.size ? mSel.size+' pegawai terpilih' : mRanked.length+' pegawai',
    memberCountText: mRanked.length+' pegawai',
    supplierRows, supplierTotalText:rp(supplierTotal), newPO:()=>flash('Form Purchase Order dibuka'),
    promoRows:PROMOS, newPromo:()=>flash('Buat promo / bundle baru'),

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
const lbl = t => `<label style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-family:'Saira',sans-serif;font-weight:600;">${t}</label>`;
const inputStyle = h => `width:100%;height:${h}px;margin-top:6px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;padding:0 14px;outline:none;font-family:'Hanken Grotesk',sans-serif;`;

function imageSlot(V, h, radius, placeholder){
  const img = slotImages[S.pendingSlot];
  return `<div class="img-slot" data-slot="${esc(S.pendingSlot)}" style="width:100%;height:${h}px;background:var(--input);border:1px dashed var(--border);font-size:13px;margin-bottom:18px;border-radius:${radius}px;">${img ? `<img src="${img}" alt="">` : placeholder}</div>`;
}

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

/* ================= CASHIER shared pieces ================= */
function payButtons(V, h, rad, gap){
  const b = (handler, seg, label) => `<button ${A(handler)} style="flex:1;height:${h}px;border-radius:${rad}px;cursor:pointer;font-family:'Saira',sans-serif;font-weight:700;font-size:13px;border:1px solid ${seg.Border};background:${seg.Bg};color:${seg.Color};">${label}</button>`;
  return `<div style="display:flex;gap:${gap}px;margin-bottom:14px;">
    ${b(V.payTunai, {Bg:V.tunaiBg,Color:V.tunaiColor,Border:V.tunaiBorder}, 'Tunai')}
    ${b(V.payMarket, {Bg:V.marketBg,Color:V.marketColor,Border:V.marketBorder}, 'Marketplace')}
    ${b(V.payTempo, {Bg:V.tempoBg,Color:V.tempoColor,Border:V.tempoBorder}, 'Tempo')}
  </div>`;
}
function tunaiBox(V, mobile){
  const inH = mobile?50:54, fs = mobile?22:24, qh = mobile?36:38, chFs = mobile?26:30;
  const q = (handler,label,gold) => `<button ${A(handler)} style="flex:1;height:${qh}px;border-radius:${mobile?9:10}px;background:${gold?'var(--goldtint)':'var(--chip)'};border:1px solid ${gold?'var(--goldborder)':'var(--border)'};color:${gold?'var(--gold)':'var(--text)'};font-size:${mobile?12:12.5}px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">${label}</button>`;
  return `<div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:14px;padding:${mobile?14:15}px;${mobile?'margin-bottom:14px;':''}">
    <label style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-family:'Saira',sans-serif;font-weight:600;">Uang Diterima</label>
    <input id="i-cash" value="${esc(V.cashText)}" ${I(V.onCash)} inputmode="numeric" placeholder="0" style="width:100%;height:${inH}px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:${fs}px;font-family:'Saira',sans-serif;font-weight:700;padding:0 14px;outline:none;margin:8px 0 ${mobile?11:12}px;">
    <div style="display:flex;gap:${mobile?7:8}px;margin-bottom:${mobile?14:15}px;">
      ${q(V.qPas,'Uang Pas',true)}${q(V.q50,'50rb')}${q(V.q100,'100rb')}${q(V.q200,'200rb')}
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border2);padding-top:${mobile?12:13}px;">
      <span style="font-size:${mobile?13:14}px;color:var(--muted);">${V.changeLabel}</span>
      <span style="font-family:'Saira',sans-serif;font-weight:800;font-size:${chFs}px;color:${V.changeColor};">${V.changeText}</span>
    </div>
  </div>`;
}
function tempoBox(V, mobile){
  const h = mobile?46:48;
  return `<div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:14px;padding:${mobile?14:15}px;${mobile?'margin-bottom:14px;':''}display:flex;flex-direction:column;gap:${mobile?11:12}px;">
    <div><label style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-family:'Saira',sans-serif;font-weight:600;">Nama Pembeli</label><input id="i-tname" value="${esc(V.tempoName)}" ${I(V.onTempoName)} placeholder="Nama lengkap / toko" style="width:100%;height:${h}px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;padding:0 14px;outline:none;margin-top:7px;font-family:'Hanken Grotesk',sans-serif;"></div>
    <div><label style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-family:'Saira',sans-serif;font-weight:600;">Jatuh Tempo</label><input id="i-tdate" value="${esc(V.tempoDate)}" ${I(V.onTempoDate)} type="date" style="width:100%;height:${h}px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;padding:0 14px;outline:none;margin-top:7px;font-family:'Hanken Grotesk',sans-serif;color-scheme:${V.isLight?'light':'dark'};"></div>
  </div>`;
}
function marketNote(mobile){
  return `<div style="background:var(--goldtint);border:1px solid var(--goldborder);border-radius:14px;padding:${mobile?14:15}px;${mobile?'margin-bottom:14px;':''}font-size:${mobile?13:13.5}px;color:var(--goldsoft);">Dicatat sebagai penjualan <b style="color:var(--gold);">Marketplace</b>. Pembayaran dianggap lunas.</div>`;
}
function cartLineRows(V, mobile){
  const s = mobile ? {pad:'10px 11px',name:13,sub:11,btn:28,bfs:16,qty:14,line:13,minw:64,brad:8} : {pad:'11px 12px',name:13.5,sub:11.5,btn:30,bfs:17,qty:15,line:13.5,minw:74,brad:9};
  return V.cartLines.map(ln => `
    <div style="display:flex;align-items:center;gap:${mobile?10:11}px;background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:13px;padding:${s.pad};">
      <div style="flex:1;min-width:0;">
        <div style="font-size:${s.name}px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(ln.name)}</div>
        <div style="font-size:${s.sub}px;color:var(--muted);">${ln.priceText} · ${esc(ln.varian)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:9px;">
        <button ${A(ln.onDec)} style="width:${s.btn}px;height:${s.btn}px;border-radius:${s.brad}px;background:var(--chip);border:1px solid var(--border);color:var(--text);font-size:${s.bfs}px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">−</button>
        <span style="font-family:'Saira',sans-serif;font-weight:700;font-size:${s.qty}px;color:var(--text);min-width:${mobile?16:18}px;text-align:center;">${ln.qtyText}</span>
        <button ${A(ln.onInc)} style="width:${s.btn}px;height:${s.btn}px;border-radius:${s.brad}px;background:var(--goldtint2);border:1px solid var(--goldborder);color:var(--gold);font-size:${s.bfs}px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">+</button>
      </div>
      <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:${s.line}px;color:var(--text);min-width:${s.minw}px;text-align:right;">${ln.lineText}</div>
    </div>`).join('');
}
function catalogGrid(V, mobile){
  const imgH = mobile?84:120, icon = mobile?26:34;
  return V.catalog.map(p => `
    <button ${A(p.onAdd)} class="fx-card" style="text-align:left;cursor:pointer;border:1px solid var(--border2);box-shadow:var(--cardshadow);background:var(--surface);border-radius:${mobile?14:16}px;overflow:hidden;display:flex;flex-direction:column;padding:0;font-family:'Hanken Grotesk',sans-serif;">
      ${p.hasPhoto
        ? `<div style="width:100%;height:${imgH}px;overflow:hidden;background:var(--surface3);"><img src="${p.photo}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;"></div>`
        : `<div style="width:100%;height:${imgH}px;display:flex;align-items:center;justify-content:center;background:var(--surface3);">${svgDumb(icon)}</div>`}
      <div style="padding:${mobile?'10px 11px':'13px'};display:flex;flex-direction:column;gap:${mobile?5:6}px;flex:1;">
        <div style="font-size:${mobile?12.5:13.5}px;font-weight:600;color:var(--text);line-height:1.3;flex:1;">${esc(p.name)}</div>
        <div style="font-size:${mobile?10.5:11.5}px;color:var(--muted);">${esc(p.varian)}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;${mobile?'':'margin-top:2px;'}">
          <span style="font-family:'Saira',sans-serif;font-weight:700;font-size:${mobile?13:15}px;color:var(--gold);">${p.priceText}</span>
          <span style="font-size:${mobile?9.5:10}px;color:#fff;background:${p.stokColor};padding:${mobile?'2px 6px':'3px 7px'};border-radius:${mobile?6:7}px;font-weight:600;">${p.stokText}</span>
        </div>
      </div>
    </button>`).join('');
}
function tambahForm(V, mobile){
  const h = mobile?46:48;
  return `
  <p style="font-size:13.5px;color:var(--muted);margin:0 0 16px;${mobile?'display:none;':''}">Unggah foto produk lalu isi detailnya. Produk langsung muncul di katalog.</p>
  <label style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-family:'Saira',sans-serif;font-weight:600;display:block;margin-bottom:8px;">Foto Produk</label>
  ${imageSlot(V, mobile?130:160, mobile?12:14, mobile?'Ketuk / seret untuk unggah foto':'Klik / seret untuk unggah foto')}
  <div style="display:flex;flex-direction:column;gap:${mobile?12:14}px;">
    <div>${lbl('Nama Produk')}<input id="i-kname" value="${esc(V.kName)}" ${I(V.onKName)} placeholder="cnt. Whey Isolate 2lb" style="${inputStyle(h)}"></div>
    <div style="display:flex;gap:${mobile?10:12}px;">
      <div style="flex:1;">${lbl('Varian')}<input id="i-kvar" value="${esc(V.kVar)}" ${I(V.onKVar)} placeholder="${mobile?'Rasa':'Rasa / ukuran'}" style="${inputStyle(h)}"></div>
      <div style="flex:1;">${lbl('Stok Awal')}<input id="i-kstok" value="${esc(V.kStok)}" ${I(V.onKStok)} inputmode="numeric" placeholder="0" style="${inputStyle(h)}"></div>
    </div>
    <div>${lbl('Harga Jual')}<input id="i-kprice" value="${esc(V.kPriceText)}" ${I(V.onKPrice)} inputmode="numeric" placeholder="Rp0" style="width:100%;height:${mobile?50:52}px;margin-top:6px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:${mobile?20:21}px;font-family:'Saira',sans-serif;font-weight:700;padding:0 14px;outline:none;"></div>
    <div>${lbl('Kategori')}
      <select id="i-kcat" ${I(V.onKCat)} style="${inputStyle(h)}cursor:pointer;">
        ${V.kCatOptions.map(c => `<option value="${esc(c)}"${c===V.kCat?' selected':''}>${esc(c)}</option>`).join('')}
      </select>
    </div>
  </div>
  <div style="display:flex;gap:${mobile?9:10}px;margin-top:${mobile?18:20}px;">
    <button ${A(V.goKatalogTab)} style="flex:none;width:${mobile?96:120}px;height:${mobile?50:52}px;border-radius:13px;background:var(--chip);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Batal</button>
    <button ${A(V.saveKProduct)} style="flex:1;height:${mobile?50:52}px;border:none;border-radius:13px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:15px;letter-spacing:.04em;cursor:pointer;">${mobile?'SIMPAN':'SIMPAN &amp; TAMBAH KE KATALOG'}</button>
  </div>`;
}
function tabButtons(V, h, rad, flex){
  const b = (handler, seg, label) => `<button ${A(handler)} style="${flex?'flex:1;':'padding:0 22px;flex:none;'}height:${h}px;border-radius:${rad}px;cursor:pointer;white-space:nowrap;font-family:'Saira',sans-serif;font-weight:700;font-size:${flex?13:14}px;border:1px solid ${seg.bd};background:${seg.bg};color:${seg.cl};">${label}</button>`;
  return b(V.goKatalogTab, V.katalogTabSeg, 'Katalog') + b(V.goTambahTab, V.tambahTabSeg, '+ Tambah Produk');
}

/* ================= CASHIER (desktop) ================= */
function cashierDesktopHtml(V){
  return `
  <div style="height:100dvh;display:flex;flex-direction:column;">
    <div style="flex:none;height:64px;border-bottom:1px solid var(--divider);display:flex;align-items:center;justify-content:space-between;padding:0 24px;background:var(--panel);">
      <div style="display:flex;align-items:center;gap:13px;">
        <div style="width:38px;height:38px;border-radius:12px;background:var(--goldtint);border:1px solid var(--goldborder);display:flex;align-items:center;justify-content:center;">${svgDumb(20)}</div>
        <div>
          <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:16px;line-height:1;">Transaksi Kasir</div>
          <div style="font-size:12px;color:var(--muted);margin-top:3px;white-space:nowrap;">Cabang ${esc(V.cashBranch)} · Kasir ${esc(V.who)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        ${themeBtn(V, 42, 19, 12)}
        <button ${A(V.toggleBell)} style="position:relative;width:42px;height:42px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;">
          ${svgBellIc(20)}
          <span style="position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:var(--danger);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid var(--panel);">${V.bellCount}</span>
        </button>
        <button ${A(V.openSettings)} style="width:42px;height:42px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;">${svgGear(20)}</button>
      </div>
    </div>
    <div style="flex:1;display:flex;min-height:0;">
      <div class="scrl" style="flex:1;overflow-y:auto;padding:22px 24px;">
        <div style="display:flex;gap:8px;margin-bottom:18px;max-width:880px;">${tabButtons(V, 44, 12, false)}</div>
        ${V.isKatalogTab ? `
          <div style="display:flex;gap:12px;margin-bottom:18px;max-width:880px;">
            <div style="flex:1;position:relative;display:flex;align-items:center;">
              ${svgSearchIc(18,15)}
              <input id="i-search" value="${esc(V.search)}" ${I(V.onSearch)} placeholder="Cari produk…" style="width:100%;height:50px;border-radius:14px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:15px;padding:0 16px 0 44px;outline:none;font-family:'Hanken Grotesk',sans-serif;">
            </div>
            <button ${A(V.openScan)} style="height:50px;padding:0 18px;border-radius:14px;background:var(--goldtint);border:1px solid var(--goldborder);color:var(--gold);font-size:14px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;display:flex;align-items:center;gap:9px;">${svgScanIc(20)}Scan</button>
          </div>
          ${V.catalogEmpty ? `<div style="border:1px dashed var(--border);border-radius:16px;padding:34px;text-align:center;color:var(--dim2);font-size:14px;max-width:880px;">Belum ada produk di cabang ini. Tambahkan lewat tab "+ Tambah Produk".</div>` : ''}
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;">${catalogGrid(V,false)}</div>
        ` : ''}
        ${V.isTambahTab ? `<div style="max-width:560px;">${tambahForm(V,false)}</div>` : ''}
      </div>
      <div style="width:432px;flex:none;border-left:1px solid var(--divider);background:var(--panel);display:flex;flex-direction:column;min-height:0;">
        <div style="flex:none;padding:18px 22px 14px;border-bottom:1px solid var(--divider);display:flex;align-items:center;justify-content:space-between;">
          <span style="font-family:'Saira',sans-serif;font-weight:800;font-size:17px;">Keranjang</span>
          <span style="font-size:13px;color:var(--gold);">${V.cartCountText}</span>
        </div>
        <div class="scrl" style="flex:1;overflow-y:auto;padding:16px 22px;">
          ${V.cartEmpty ? `<div style="border:1px dashed var(--border);border-radius:16px;padding:40px 20px;text-align:center;color:var(--dim2);font-size:14px;">Keranjang kosong.<br>Klik produk untuk menambah.</div>` : ''}
          ${V.cartHasItems ? `
            <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:18px;">${cartLineRows(V,false)}</div>
            <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">Metode Pembayaran</div>
            ${payButtons(V, 44, 12, 8)}
            ${V.isTunai ? tunaiBox(V,false) : ''}
            ${V.isTempo ? tempoBox(V,false) : ''}
            ${V.isMarket ? marketNote(false) : ''}
          ` : ''}
        </div>
        ${V.cartHasItems ? `
          <div style="flex:none;padding:16px 22px 20px;border-top:1px solid var(--divider);">
            <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:13px;">
              <span style="font-size:14px;color:var(--muted);">Total Belanja</span>
              <span style="font-family:'Saira',sans-serif;font-weight:900;font-size:34px;line-height:1;">${V.cartTotalText}</span>
            </div>
            <button ${A(V.completeSale)} class="fx-press" style="width:100%;height:58px;border:none;border-radius:15px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:900;font-size:17px;letter-spacing:.05em;cursor:pointer;box-shadow:0 14px 28px -12px rgba(212,175,55,.7);">SELESAIKAN TRANSAKSI</button>
          </div>` : ''}
      </div>
    </div>
  </div>`;
}

/* ================= CASHIER (mobile) ================= */
function cashierMobileHtml(V){
  return `
  <div style="height:100dvh; display:flex; flex-direction:column;">
    <div style="flex:none; padding:10px 16px 12px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--divider);">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:34px;height:34px;border-radius:11px;background:var(--goldtint);border:1px solid var(--goldborder);display:flex;align-items:center;justify-content:center;">${svgDumb(18)}</div>
        <div>
          <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:15px;color:var(--text);line-height:1;">Kasir</div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px;">Cabang ${esc(V.cashBranch)}</div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        ${V.isAdmin ? `<button ${A(V.goModeScreen)} style="background:var(--hover);border:1px solid var(--border);color:var(--text2);border-radius:9px;padding:6px 9px;font-size:11px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Mode</button>` : ''}
        ${themeBtn(V, 38, 17, 11)}
        <button ${A(V.toggleBell)} style="position:relative;width:38px;height:38px;border-radius:11px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;">
          ${svgBellIc(19)}
          <span style="position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:var(--danger);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg);">${V.bellCount}</span>
        </button>
        <button ${A(V.openSettings)} style="width:38px;height:38px;border-radius:11px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;">${svgGear(18)}</button>
      </div>
    </div>
    <div class="scrl" style="flex:1; overflow-y:auto; padding:14px 16px 16px;">
      <div style="display:flex;gap:8px;margin-bottom:14px;">${tabButtons(V, 40, 11, true)}</div>
      ${V.isKatalogTab ? `
        <div style="display:flex; gap:9px; margin-bottom:14px;">
          <div style="flex:1; position:relative; display:flex; align-items:center;">
            ${svgSearchIc(17,13)}
            <input id="i-search" value="${esc(V.search)}" ${I(V.onSearch)} placeholder="Cari produk…" style="width:100%;height:46px;border-radius:13px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;padding:0 14px 0 38px;outline:none;font-family:'Hanken Grotesk',sans-serif;">
          </div>
          <button ${A(V.openScan)} style="width:46px;height:46px;flex:none;border-radius:13px;background:var(--goldtint);border:1px solid var(--goldborder);display:flex;align-items:center;justify-content:center;cursor:pointer;">${svgScanIc(20)}</button>
        </div>
        ${V.catalogEmpty ? `<div style="border:1px dashed var(--border);border-radius:14px;padding:26px;text-align:center;color:var(--dim2);font-size:13px;margin-bottom:14px;">Belum ada produk di cabang ini. Tambahkan lewat tab "+ Tambah Produk".</div>` : ''}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-bottom:18px;">${catalogGrid(V,true)}</div>
      ` : ''}
      ${V.isTambahTab ? `<div style="margin-bottom:18px;">${tambahForm(V,true)}</div>` : ''}
    </div>
    ${V.cartHasItems ? `
      <button ${A(V.openCartSheet)} style="flex:none;width:100%;height:64px;padding:0 18px;border:none;border-top:1px solid var(--divider);background:var(--panel);display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">
        <span style="display:flex;align-items:center;gap:12px;">
          <span style="width:40px;height:40px;flex:none;border-radius:12px;background:var(--goldtint2);display:flex;align-items:center;justify-content:center;">${svgCartIc(19)}</span>
          <span style="text-align:left;">
            <span style="display:block;font-size:11.5px;color:var(--muted);">${V.cartCountText}</span>
            <span style="display:block;font-family:'Saira',sans-serif;font-weight:800;font-size:18px;color:var(--text);">${V.cartTotalText}</span>
          </span>
        </span>
        <span style="display:flex;align-items:center;gap:7px;color:var(--gold);font-size:13px;font-weight:700;">
          Lihat Keranjang
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 15l6-6 6 6" stroke="#D4AF37" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
        </span>
      </button>` : ''}
  </div>
  ${V.cartSheetOpen ? `
    <div ${A(V.closeCartSheet)} style="position:fixed;inset:0;background:var(--scrim);z-index:55;"></div>
    <div class="scrl" style="position:fixed;left:0;right:0;bottom:0;z-index:56;max-height:88dvh;overflow-y:auto;background:var(--panel);border-radius:22px 22px 0 0;box-shadow:0 -20px 50px -10px var(--shadowc);${V.pop('cartSheet')}">
      <div style="position:sticky;top:0;background:var(--panel);z-index:2;padding:10px 18px 12px;border-bottom:1px solid var(--divider);">
        <div style="width:40px;height:4px;border-radius:2px;background:var(--border);margin:0 auto 12px;"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-family:'Saira',sans-serif;font-weight:800;font-size:17px;">Keranjang <span style="color:var(--gold);font-weight:600;font-size:13px;">${V.cartCountText}</span></span>
          <button ${A(V.closeCartSheet)} style="width:32px;height:32px;border-radius:10px;background:var(--chip);border:1px solid var(--border);color:var(--text);cursor:pointer;font-size:16px;line-height:1;">×</button>
        </div>
      </div>
      <div style="padding:16px 18px 22px;">
        ${V.cartHasItems ? `
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">${cartLineRows(V,true)}</div>
          <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">Metode Pembayaran</div>
          ${payButtons(V, 42, 11, 7)}
          ${V.isTunai ? tunaiBox(V,true) : ''}
          ${V.isTempo ? tempoBox(V,true) : ''}
          ${V.isMarket ? marketNote(true) : ''}
          <div style="display:flex;align-items:flex-end;justify-content:space-between;margin:4px 0 12px;">
            <span style="font-size:13px;color:var(--muted);">Total Belanja</span>
            <span style="font-family:'Saira',sans-serif;font-weight:900;font-size:30px;color:var(--text);line-height:1;">${V.cartTotalText}</span>
          </div>
          <button ${A(V.completeSale)} class="fx-press" style="width:100%;height:56px;border:none;border-radius:15px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:900;font-size:17px;letter-spacing:.06em;cursor:pointer;box-shadow:0 14px 28px -12px rgba(212,175,55,.7);display:flex;align-items:center;justify-content:center;gap:10px;">SELESAIKAN TRANSAKSI</button>
        ` : ''}
      </div>
    </div>` : ''}`;
}

/* ================= ADMIN sections ================= */
const badge = (color,bg,text,fs) => `<span style="font-size:${fs||11}px;font-weight:700;padding:4px 9px;border-radius:7px;color:${color};background:${bg};">${text}</span>`;

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
            <span style="font-family:'Saira',sans-serif;font-weight:700;">${p.stokText}</span>
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
    <div style="display:flex;gap:8px;margin-bottom:18px;">
      ${V.periodChips.map(c => `<button ${A(c.onClick)} style="height:42px;padding:0 22px;border-radius:11px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;border:1px solid ${c.bd};background:${c.bg};color:${c.cl};">${c.label}</button>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:${V.lapTopCols};gap:16px;margin-bottom:16px;">
      <div style="background:var(--surface);border:1px solid var(--border2);box-shadow:var(--cardshadow);border-radius:18px;padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:18px;"><span style="font-family:'Saira',sans-serif;font-weight:700;font-size:15px;">Tren Omset</span><span style="font-size:12px;color:var(--muted);">juta Rupiah</span></div>
        <div style="display:flex;align-items:flex-end;justify-content:space-between;height:170px;gap:10px;">
          ${V.lapBars.map(b => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end;">
              <span style="font-family:'Saira',sans-serif;font-weight:700;font-size:11px;color:${b.valColor};">${b.valText}</span>
              <div style="width:100%;border-radius:7px 7px 3px 3px;background:${b.fill};height:${b.h};min-height:5px;"></div>
              <span style="font-size:10.5px;color:var(--muted);">${b.label}</span>
            </div>`).join('')}
        </div>
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
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap;">
        <div style="position:relative;flex:1;min-width:220px;max-width:360px;">
          <button ${A(V.toggleMemberDd)} style="width:100%;height:42px;padding:0 14px;border-radius:11px;background:var(--input);border:1px solid ${V.memberDropdown?'var(--gold)':'var(--border)'};color:var(--text);font-size:13.5px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span style="display:flex;align-items:center;gap:9px;min-width:0;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17 20a5 5 0 0 0-10 0M12 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" stroke="#D4AF37" stroke-width="1.7" stroke-linecap="round"></path></svg><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${V.memberDdLabel}</span></span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="flex:none;"><path d="M6 9l6 6 6-6" stroke="#D4AF37" stroke-width="2.4" stroke-linecap="round"></path></svg>
          </button>
          ${V.memberDropdown ? `
            <div ${A(V.closeMemberDd)} style="position:fixed;inset:0;z-index:44;"></div>
            <div style="position:absolute;top:48px;left:0;right:0;z-index:45;background:var(--surface2);border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:0 18px 40px -12px var(--shadowc);${V.pop('memberDd')}">
              <div style="padding:10px;border-bottom:1px solid var(--divider);position:relative;display:flex;align-items:center;">
                ${svgSearchIc(15,22)}
                <input id="i-membersearch" value="${esc(V.memberSearch)}" ${I(V.onMemberSearch)} placeholder="Cari nama pegawai…" style="width:100%;height:38px;border-radius:9px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:13px;padding:0 12px 0 34px;outline:none;font-family:'Hanken Grotesk',sans-serif;">
              </div>
              <div class="scrl" style="max-height:240px;overflow-y:auto;">
                ${V.memberSelCount ? `<button ${A(V.clearMemberSel)} style="width:100%;text-align:left;padding:10px 14px;background:none;border:none;border-bottom:1px solid var(--divider);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12.5px;font-weight:600;color:var(--gold);">✕ Kosongkan pilihan (${V.memberSelCount})</button>` : ''}
                ${V.memberOptionsEmpty ? `<div style="padding:16px;text-align:center;color:var(--dim2);font-size:12.5px;">Tidak ada pegawai cocok.</div>` :
                  V.memberOptions.map(o => `
                    <button ${A(o.onClick)} title="opt-${esc(o.unameText)}" class="fx-hover" style="width:100%;display:flex;align-items:center;gap:10px;padding:10px 14px;background:${o.checked?'var(--goldtint)':'none'};border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;text-align:left;">
                      <span style="width:20px;height:20px;flex:none;border-radius:6px;border:1.5px solid ${o.checked?'var(--gold)':'var(--border)'};background:${o.checked?'var(--goldtint2)':'transparent'};color:var(--gold);display:inline-flex;align-items:center;justify-content:center;font-size:13px;line-height:1;">${o.checked?'✓':''}</span>
                      <span style="flex:1;min-width:0;"><span style="font-size:13px;font-weight:600;color:var(--text);">${esc(o.name)}</span> <span style="font-size:11px;color:var(--muted);">${esc(o.unameText)} · ${o.roleText}</span></span>
                      <span style="font-size:11.5px;color:var(--muted);white-space:nowrap;font-family:'Saira',sans-serif;">${o.totalText}</span>
                    </button>`).join('')}
              </div>
            </div>` : ''}
        </div>
        <span style="font-size:12px;color:var(--muted);">${V.memberSelCount ? 'membandingkan '+V.memberSelCount+' pegawai' : 'menampilkan semua'}</span>
      </div>
      ${V.memberLoading ? `<div style="border:1px dashed var(--border);border-radius:14px;padding:26px;text-align:center;color:var(--muted);font-size:13px;">Memuat penjualan anggota…</div>`
        : V.memberNoData ? `<div style="border:1px dashed var(--border);border-radius:14px;padding:26px;text-align:center;color:var(--dim2);font-size:13px;">Belum ada anggota aktif di cabang ini.</div>` : `
        ${V.isDesktop ? `
          <div style="display:grid;grid-template-columns:40px 1fr 120px 170px;padding:0 12px 10px;font-family:'Saira',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);">
            <span>#</span><span>Pegawai</span><span style="text-align:right;">Transaksi</span><span style="text-align:right;">Total</span>
          </div>
          <div class="scrl" style="max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
            ${V.memberRows.map(m => `
              <div style="border:1px solid var(--border2);border-radius:13px;background:var(--surface2);padding:12px;">
                <button ${A(m.onDetail)} title="detail-${esc(m.unameText)}" style="width:100%;display:grid;grid-template-columns:40px 1fr 120px 170px;align-items:center;gap:6px;background:none;border:none;padding:0;cursor:pointer;text-align:left;font-family:'Hanken Grotesk',sans-serif;">
                  <span style="font-family:'Saira',sans-serif;font-weight:800;font-size:15px;color:${m.rank<=3?'var(--gold)':'var(--muted)'};">${m.rank}</span>
                  <span style="min-width:0;">
                    <span style="display:block;font-size:13.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.open?'▾':'▸'} ${esc(m.name)}</span>
                    <span style="display:block;font-size:11px;color:var(--muted);margin-top:2px;">${esc(m.unameText)} · ${m.roleText} · ${esc(m.cabang)}</span>
                    <span style="display:block;height:6px;border-radius:4px;background:var(--chip);overflow:hidden;margin-top:6px;max-width:280px;"><span style="display:block;height:100%;border-radius:4px;width:${m.w};background:linear-gradient(90deg,var(--gold),var(--goldhi));"></span></span>
                  </span>
                  <span style="text-align:right;font-size:12.5px;color:var(--text2);">${m.trxLong}</span>
                  <span style="text-align:right;font-family:'Saira',sans-serif;font-weight:700;font-size:14px;">${m.totalText}</span>
                </button>
                ${m.open ? memberDetailHtml(m) : ''}
              </div>`).join('')}
          </div>` : `
          <div class="scrl" style="max-height:60dvh;overflow-y:auto;display:flex;flex-direction:column;gap:9px;">
            ${V.memberRows.map(m => `
              <div style="border:1px solid var(--border2);border-radius:14px;background:var(--surface2);padding:13px 14px;">
                <button ${A(m.onDetail)} title="detail-${esc(m.unameText)}" style="width:100%;background:none;border:none;padding:0;cursor:pointer;text-align:left;font-family:'Hanken Grotesk',sans-serif;">
                  <span style="display:block;font-size:13.5px;font-weight:600;color:var(--text);">${m.open?'▾':'▸'} <span style="color:${m.rank<=3?'var(--gold)':'var(--muted)'};font-family:'Saira',sans-serif;font-weight:800;">#${m.rank}</span> ${esc(m.name)}</span>
                  <span style="display:block;font-size:11px;color:var(--muted);margin-top:2px;">${esc(m.unameText)} · ${m.roleText} · ${esc(m.cabang)}</span>
                  <span style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;">
                    <span style="height:7px;border-radius:4px;background:var(--chip);overflow:hidden;flex:1;"><span style="display:block;height:100%;border-radius:4px;width:${m.w};background:linear-gradient(90deg,var(--gold),var(--goldhi));"></span></span>
                    <span style="white-space:nowrap;font-size:12px;"><span style="font-family:'Saira',sans-serif;font-weight:700;font-size:14px;">${m.totalText}</span> <span style="color:var(--muted);">· ${m.trxText}</span></span>
                  </span>
                </button>
                ${m.open ? memberDetailHtml(m) : ''}
              </div>`).join('')}
          </div>`}
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border2);margin-top:16px;padding-top:14px;gap:10px;flex-wrap:wrap;">
          <span style="font-size:13px;color:var(--muted);">Total (${V.memberFooterLabel}) · ${V.uPeriod}</span>
          <span style="white-space:nowrap;"><span style="font-family:'Saira',sans-serif;font-weight:800;font-size:19px;">${V.memberTotalText}</span> <span style="color:var(--muted);font-size:12px;">· ${V.memberTrxText}</span></span>
        </div>`}
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
          <div style="display:grid;grid-template-columns:2fr 1.2fr 1.2fr 1fr;padding:15px 18px;border-bottom:1px solid var(--divider);align-items:center;font-size:13.5px;">
            <span style="font-weight:600;">${esc(s.name)}</span>
            <span style="font-family:'Saira',sans-serif;font-weight:700;">${s.amountText}</span>
            <span style="color:var(--muted);">${s.dueText}</span>
            <span style="text-align:right;">${badge(s.color,s.bg,s.status)}</span>
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
          <div style="text-align:right;"><div style="font-size:11px;color:var(--muted);">${p.type}</div><div style="font-family:'Saira',sans-serif;font-weight:800;font-size:15px;color:${p.color};">${p.value}</div></div>
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
    promo: secPromoHtml, shopee: secShopeeHtml,
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
        ${V.sidebarItems.map(m => `
          <button ${A(m.onClick)} class="fx-hover" style="display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:11px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13.5px;text-align:left;border:1px solid ${m.bd};background:${m.bg};color:${m.cl};">
            <span style="width:20px;display:inline-flex;align-items:center;justify-content:center;">${m.icon}</span>${m.label}
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
  <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:51;width:min(440px, calc(100vw - 32px));background:var(--panel);border:1px solid var(--border);border-radius:22px;overflow:hidden;${V.pop('scan')}box-shadow:0 30px 70px -15px rgba(0,0,0,.8);">
    <div style="padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--divider);">
      <span style="font-family:'Saira',sans-serif;font-weight:700;font-size:17px;">Scan Barcode</span>
      <button ${A(V.closeScan)} style="background:var(--chip);border:1px solid var(--border);color:var(--text);width:36px;height:36px;border-radius:10px;cursor:pointer;font-size:19px;line-height:1;">×</button>
    </div>
    <div style="height:300px;position:relative;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 45%,var(--surface3),var(--bg));">
      <div style="position:relative;width:230px;height:230px;border-radius:20px;overflow:hidden;border:2px solid var(--goldborder);">
        <div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,#222 0 3px,var(--panel) 3px 9px);opacity:.5;"></div>
        <i style="position:absolute;left:5%;right:5%;height:2px;background:var(--gold);box-shadow:0 0 12px var(--gold);animation:ssScan 1.8s ease-in-out infinite alternate;"></i>
        <span style="position:absolute;top:8px;left:8px;width:22px;height:22px;border-top:3px solid var(--gold);border-left:3px solid var(--gold);border-radius:5px 0 0 0;"></span>
        <span style="position:absolute;top:8px;right:8px;width:22px;height:22px;border-top:3px solid var(--gold);border-right:3px solid var(--gold);border-radius:0 5px 0 0;"></span>
        <span style="position:absolute;bottom:8px;left:8px;width:22px;height:22px;border-bottom:3px solid var(--gold);border-left:3px solid var(--gold);border-radius:0 0 0 5px;"></span>
        <span style="position:absolute;bottom:8px;right:8px;width:22px;height:22px;border-bottom:3px solid var(--gold);border-right:3px solid var(--gold);border-radius:0 0 5px 0;"></span>
      </div>
      <div style="position:absolute;bottom:18px;left:0;right:0;text-align:center;font-size:13px;color:var(--muted);">Arahkan kamera ke barcode produk</div>
    </div>
    <div style="padding:18px;"><button ${A(V.doScan)} style="width:100%;height:52px;border:none;border-radius:14px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:15px;letter-spacing:.04em;cursor:pointer;">SIMULASI: BARCODE TERBACA</button></div>
  </div>`;
}

function branchFormHtml(V){
  return `
  <div ${A(V.closeBranchForm)} style="position:fixed;inset:0;background:var(--scrim);z-index:50;"></div>
  <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:51;width:min(440px, calc(100vw - 32px));background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:22px;${V.pop('branchForm')}">
    <h3 style="font-family:'Saira',sans-serif;font-weight:800;font-size:20px;margin:0 0 6px;">Tambah Cabang</h3>
    <p style="font-size:13px;color:var(--muted);margin:0 0 16px;line-height:1.5;">Cabang baru langsung muncul di pilihan cabang. Data penjualan mulai tercatat setelah ada transaksi.</p>
    ${lbl('Nama Cabang')}
    <input id="i-newbranch" value="${esc(V.newBranch)}" ${I(V.onNewBranch)} placeholder="cnt. Yogyakarta" style="width:100%;height:48px;margin-top:7px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;padding:0 14px;outline:none;font-family:'Hanken Grotesk',sans-serif;">
    <div style="display:flex;gap:10px;margin-top:18px;">
      <button ${A(V.closeBranchForm)} style="flex:none;width:104px;height:48px;border-radius:12px;background:var(--chip);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Batal</button>
      <button ${A(V.saveBranch)} style="flex:1;height:48px;border:none;border-radius:12px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:14px;letter-spacing:.04em;cursor:pointer;">SIMPAN CABANG</button>
    </div>
  </div>`;
}

function userFormHtml(V){
  const selTile = (t) => `<button ${A(t.onClick)} style="flex:1;min-width:120px;height:46px;border-radius:11px;cursor:pointer;border:1px solid ${t.on?'var(--gold)':'var(--border)'};background:${t.on?'var(--goldtint2)':'var(--surface2)'};color:${t.on?'var(--gold)':'var(--muted)'};display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13.5px;font-family:'Hanken Grotesk',sans-serif;">${esc(t.label)}</button>`;
  return `
  <div ${A(V.closeUserForm)} style="position:fixed;inset:0;background:var(--scrim);z-index:50;"></div>
  <div class="scrl" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:51;width:min(520px, calc(100vw - 32px));max-height:90dvh;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:26px;${V.pop('userForm')}box-shadow:0 30px 70px -15px rgba(0,0,0,.8);">
    <h3 style="font-family:'Saira',sans-serif;font-weight:800;font-size:21px;margin:0 0 18px;">Tambah User Baru</h3>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div>${lbl('Nama Lengkap')}<input id="i-uname-new" value="${esc(V.uName)}" ${I(V.onUName)} placeholder="Nama user" style="${inputStyle(48)}"></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:140px;">${lbl('Username')}<input id="i-uuname-new" value="${esc(V.uUname)}" ${I(V.onUUname)} placeholder="username" style="${inputStyle(48)}"></div>
        <div style="flex:1;min-width:140px;">${lbl('Password')}<input id="i-upass-new" value="${esc(V.uPass)}" ${I(V.onUPass)} type="password" placeholder="••••••" style="${inputStyle(48)}"></div>
      </div>
      <div>${lbl('Role')}
        <div style="display:flex;gap:10px;margin-top:7px;flex-wrap:wrap;">${V.uRoleTiles.map(selTile).join('')}</div>
      </div>
      <div>${lbl('Cabang')}
        <div style="display:flex;gap:10px;margin-top:7px;flex-wrap:wrap;">${V.uCabangTiles.map(selTile).join('')}</div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:22px;">
      <button ${A(V.closeUserForm)} style="flex:none;width:110px;height:50px;border-radius:13px;background:var(--chip);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Batal</button>
      <button ${A(V.saveUser)} style="flex:1;height:50px;border:none;border-radius:13px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:15px;letter-spacing:.04em;cursor:pointer;">SIMPAN USER</button>
    </div>
  </div>`;
}

function prodFormHtml(V){
  return `
  <div ${A(V.closeProdForm)} style="position:fixed;inset:0;background:var(--scrim);z-index:50;"></div>
  <div class="scrl" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:51;width:min(560px, calc(100vw - 32px));max-height:90dvh;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:26px;${V.pop('prodForm')}box-shadow:0 30px 70px -15px rgba(0,0,0,.8);">
    <h3 style="font-family:'Saira',sans-serif;font-weight:800;font-size:21px;margin:0 0 18px;">Tambah Produk</h3>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div>${lbl('Nama Produk')}<input placeholder="Nama produk" style="${inputStyle(48)}"></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:140px;">${lbl('Varian')}<input placeholder="Rasa / ukuran" style="${inputStyle(48)}"></div>
        <div style="flex:1;min-width:140px;">${lbl('Kategori')}<select style="${inputStyle(48)}cursor:pointer;">${V.kCatOptions.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:140px;">${lbl('Harga Jual')}<input placeholder="Rp" inputmode="numeric" style="${inputStyle(48)}"></div>
        <div style="flex:1;min-width:140px;">${lbl('Harga Modal')}<input placeholder="Rp" inputmode="numeric" style="${inputStyle(48)}"></div>
      </div>
      <div style="font-size:12.5px;color:var(--ok);background:var(--oktint);border-radius:10px;padding:10px 13px;">Margin akan dihitung otomatis dari harga jual &amp; modal.</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:140px;">${lbl('Barcode')}
          <div style="display:flex;gap:8px;margin-top:6px;"><input placeholder="—" style="flex:1;height:48px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;padding:0 14px;outline:none;font-family:'Hanken Grotesk',sans-serif;"><button ${A(V.openScan)} style="width:48px;flex:none;border-radius:12px;background:var(--goldtint);border:1px solid var(--goldborder);cursor:pointer;display:flex;align-items:center;justify-content:center;">${svgScanIc(20)}</button></div>
        </div>
        <div style="flex:1;min-width:140px;">${lbl('Kedaluwarsa')}<input type="month" style="${inputStyle(48)}color-scheme:${V.isLight?'light':'dark'};"></div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:22px;">
      <button ${A(V.closeProdForm)} style="flex:none;width:110px;height:50px;border-radius:13px;background:var(--chip);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Batal</button>
      <button ${A(V.saveProd)} style="flex:1;height:50px;border:none;border-radius:13px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:15px;letter-spacing:.04em;cursor:pointer;">SIMPAN PRODUK</button>
    </div>
  </div>`;
}

function catFormHtml(V){
  return `
  <div ${A(V.closeCatForm)} style="position:fixed;inset:0;background:var(--scrim);z-index:50;"></div>
  <div class="scrl" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:51;width:min(440px, calc(100vw - 32px));max-height:85dvh;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:22px;${V.pop('catForm')}">
    <h3 style="font-family:'Saira',sans-serif;font-weight:800;font-size:20px;margin:0 0 6px;">Kelola Kategori</h3>
    <p style="font-size:13px;color:var(--muted);margin:0 0 16px;line-height:1.5;">Kategori dipakai untuk filter stok dan pengelompokan produk. Kategori yang masih dipakai produk tidak bisa dihapus.</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">
      ${V.catRows.map(c => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--surface2);border:1px solid var(--border);border-radius:11px;padding:9px 9px 9px 14px;">
          <span style="font-size:13.5px;font-weight:600;">${esc(c.name)}</span>
          <button ${A(c.onDelete)} title="hapus-${esc(c.name)}" style="width:30px;height:30px;flex:none;border-radius:9px;background:var(--dangertint);border:1px solid var(--dangerborder);color:var(--danger);font-size:16px;line-height:1;cursor:pointer;">×</button>
        </div>`).join('')}
    </div>
    ${lbl('Kategori Baru')}
    <div style="display:flex;gap:8px;margin-top:7px;">
      <input id="i-newcat" value="${esc(V.newCat)}" ${I(V.onNewCat)} placeholder="cnt. Vitamin" style="flex:1;height:46px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;padding:0 14px;outline:none;font-family:'Hanken Grotesk',sans-serif;">
      <button ${A(V.saveCategory)} style="flex:none;height:46px;padding:0 18px;border:none;border-radius:12px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:'Saira',sans-serif;font-weight:800;font-size:13px;letter-spacing:.04em;cursor:pointer;">TAMBAH</button>
    </div>
    <button ${A(V.closeCatForm)} style="width:100%;margin-top:14px;height:44px;border-radius:12px;background:var(--chip);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">Tutup</button>
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
    ${V.cashierDesktop ? cashierDesktopHtml(V) : ''}
    ${V.cashierMobile ? cashierMobileHtml(V) : ''}
    ${V.adminShell ? adminHtml(V) : ''}
    ${V.scrSettings ? settingsHtml(V) : ''}
    ${V.bell ? bellHtml(V) : ''}
    ${V.scan ? scanHtml(V) : ''}
    ${V.branchForm ? branchFormHtml(V) : ''}
    ${V.catForm ? catFormHtml(V) : ''}
    ${V.userForm ? userFormHtml(V) : ''}
    ${V.prodForm ? prodFormHtml(V) : ''}
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
    userForm:S.userForm, prodForm:S.prodForm, cartSheet:S.cartSheetOpen, more:S.more,
    branchMenu:S.branchMenu, memberDd:S.memberDropdown, toast:!!S.toast };
  V.popScreen = sameScreen ? '' : 'animation:ssPop .3s ease;';
  V.pop = k => prevOpen[k] ? '' : 'animation:ssPop .22s ease;';
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
  const slot = e.target.closest('.img-slot');
  if(slot){ pickPhoto(slot.dataset.slot); return; }
  const t = e.target.closest('[data-a]');
  if(t && reg[+t.dataset.a]) reg[+t.dataset.a](e);
});
root.addEventListener('input', e => {
  const t = e.target.closest('[data-i]');
  if(t && reg[+t.dataset.i]) reg[+t.dataset.i]({ target: t });
});
root.addEventListener('keydown', e => {
  if(e.key === 'Enter' && (e.target.id === 'i-uname' || e.target.id === 'i-pass')) login();
});

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'image/*';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);
let pendingPhotoSlot = null;
function pickPhoto(slot){ pendingPhotoSlot = slot; fileInput.value = ''; fileInput.click(); }
fileInput.addEventListener('change', () => {
  const f = fileInput.files && fileInput.files[0];
  if(!f || !pendingPhotoSlot) return;
  const r = new FileReader();
  r.onload = () => { slotImages[pendingPhotoSlot] = r.result; render(); };
  r.readAsDataURL(f);
});

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
