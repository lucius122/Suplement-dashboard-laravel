/* Kasir Module — public/js/kasir.js
   Revisi: Kasir hanya bertugas transaksi penjualan.
   Tidak ada fitur tambah/edit/hapus produk, tidak ada restock dari kasir.
   Dipanggil setelah app.js; bergantung pada window.SS. */
(function () {
  'use strict';
  if (!window.SS) {
    console.error('kasir.js: window.SS belum ada');
    return;
  }

  var _CSRF = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

  /* ================================================================
   * HTML MICRO-HELPERS (sama persis dengan pola app.js / kasir lama)
   * ================================================================ */
  function _chip(on, lbl, fn) {
    return '<button '+SS.A(fn)+' style="flex:none;white-space:nowrap;height:30px;padding:0 12px;'
      +'border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;'
      +'border:1px solid '+(on?'var(--gold)':'var(--border)')+';'
      +'background:'+(on?'var(--goldtint2)':'var(--surface2)')+';'
      +'color:'+(on?'var(--gold)':'var(--muted)')+';">'+SS.esc(lbl)+'</button>';
  }
  function _lbl(t) {
    return '<div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;'
      +'letter-spacing:.08em;font-weight:600;margin-bottom:7px;">'+t+'</div>';
  }
  function _fld(lbl, inp) {
    return '<div style="margin-bottom:13px;">'+_lbl(lbl)+inp+'</div>';
  }
  function _inp(id, val, fn, ex) {
    return '<input id="'+id+'" value="'+SS.esc(val||'')+'" '+SS.I(fn)+' '+(ex||'')+' '
      +'style="width:100%;height:44px;border-radius:11px;border:1px solid var(--border);'
      +'background:var(--input);color:var(--text);font-size:14px;padding:0 13px;outline:none;">';
  }

  /* ================================================================
   * DATA HELPERS
   * ================================================================ */
  // Produk cabang kasir yang masih ada stok (untuk katalog)
  function _myProds() {
    var br = (SS.USER || {}).branch || '';
    return SS.DB.products.filter(function(p){ return p.cabang === br && p.stok > 0; });
  }
  // Filter katalog berdasarkan search & kategori
  function _filtered() {
    var q   = (SS.S.k_q || '').trim().toLowerCase();
    var cat = SS.S.k_cat || 'Semua';
    return _myProds().filter(function(p) {
      if (cat !== 'Semua' && p.kategori !== cat) return false;
      if (q && !(
        p.name.toLowerCase().includes(q) ||
        (p.varian || '').toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }

  /* ================================================================
   * CART STATE & HELPERS
   * Setiap item: { id, name, varian, harga (normal DB), hargaJual (aktif),
   *               stok, qty, priceNote }
   * ================================================================ */
  var _cart  = function(){ return SS.S.k_cart || []; };
  var _total = function(){ return _cart().reduce(function(s,i){ return s + i.hargaJual * i.qty; }, 0); };
  var _count = function(){ return _cart().reduce(function(s,i){ return s + i.qty; }, 0); };

  function _addToCart(prod) {
    var cart = _cart().slice();
    var idx  = cart.findIndex(function(i){ return i.id === prod.id; });
    if (idx >= 0) {
      var it = Object.assign({}, cart[idx]);
      if (it.qty >= prod.stok) { SS.flash('Stok '+prod.name+' hanya '+prod.stok+' pcs'); return; }
      it.qty++;
      cart[idx] = it;
    } else {
      cart.push({
        id: prod.id, name: prod.name, varian: prod.varian || '-',
        harga: prod.harga,       // harga normal dari DB (referensi, tidak berubah)
        hargaJual: prod.harga,   // harga aktif (bisa diubah kasir)
        stok: prod.stok, qty: 1, priceNote: '',
      });
    }
    SS.setState({ k_cart: cart });
  }
  function _removeFromCart(idx) {
    var c = _cart().slice(); c.splice(idx, 1); SS.setState({ k_cart: c });
  }
  function _changeQty(idx, d) {
    var c  = _cart().slice();
    var it = Object.assign({}, c[idx]);
    var n  = it.qty + d;
    if (n <= 0) { _removeFromCart(idx); return; }
    if (n > it.stok) { SS.flash('Stok tidak cukup'); return; }
    it.qty = n; c[idx] = it; SS.setState({ k_cart: c });
  }
  function _clearCart() {
    SS.setState({
      k_cart: [], k_cash: '', k_tname: '', k_panel: 'catalog',
      k_saving: false, k_pay: 'tunai',
      k_editIdx: null, k_editType: 'normal',
      k_editCustom: '', k_editNote: '',
    });
  }

  /* ================================================================
   * EDIT HARGA PER ITEM
   * ================================================================ */
  function _openEditPrice(idx) {
    var item = _cart()[idx];
    if (!item) return;
    // Deteksi tipe saat ini: jika hargaJual sudah sama dengan harga → normal
    var type = (item.hargaJual === item.harga) ? 'normal' : 'custom';
    SS.setState({
      k_editIdx: idx,
      k_editType: type,
      k_editCustom: type === 'custom' ? String(item.hargaJual) : '',
      k_editNote: item.priceNote || '',
    });
  }

  // Hitung harga preview berdasarkan state edit saat ini
  function _getEditedPrice() {
    var idx  = SS.S.k_editIdx;
    var item = (idx !== null && idx !== undefined) ? _cart()[idx] : null;
    if (!item) return 0;
    var type = SS.S.k_editType || 'normal';
    if (type === 'normal') return item.harga;
    // custom
    return parseInt((SS.S.k_editCustom || '').replace(/\D/g, ''), 10) || 0;
  }

  function _saveEditPrice() {
    var idx = SS.S.k_editIdx;
    if (idx === null || idx === undefined) return;
    var cart     = _cart().slice();
    var item     = Object.assign({}, cart[idx]);
    var newPrice = _getEditedPrice();
    var note     = (SS.S.k_editNote || '').trim();

    // Harga berubah → catatan WAJIB
    if (newPrice !== item.harga && !note) {
      SS.flash('Isi alasan perubahan harga terlebih dahulu');
      return;
    }
    if (newPrice <= 0 && SS.S.k_editType !== 'normal') {
      SS.flash('Harga tidak boleh 0');
      return;
    }

    item.hargaJual = newPrice;
    item.priceNote = (newPrice !== item.harga) ? note : '';
    cart[idx] = item;
    SS.setState({
      k_cart: cart,
      k_editIdx: null, k_editType: 'normal',
      k_editCustom: '', k_editNote: '',
    });
  }

  /* ================================================================
   * SIMPAN TRANSAKSI + CETAK NOTA
   * ================================================================ */
  async function _saveTrx() {
    var cart      = _cart();
    if (!cart.length) { SS.flash('Keranjang kosong'); return; }

    var method    = SS.S.k_pay || 'tunai';
    var cartTotal = _total();
    var cash      = null, change = null, discount = 0;

    // Validasi: setiap item yang harganya berubah HARUS punya catatan
    var badItem = cart.find(function(i){ return i.hargaJual !== i.harga && !i.priceNote; });
    if (badItem) {
      SS.flash('Isi alasan perubahan harga untuk: '+badItem.name);
      return;
    }

    if (method === 'tunai') {
      cash = parseInt((SS.S.k_cash || '').replace(/\D/g, ''), 10) || 0;
      if (!cash) { SS.flash('Isi nominal pembayaran'); return; }
      if (cash >= cartTotal) {
        change   = cash - cartTotal;
        discount = 0;
      } else {
        // Potongan: kasir bayar kurang dari total
        discount = cartTotal - cash;
        change   = null;
      }
    }
    if (method === 'tempo') {
      if (!(SS.S.k_tname || '').trim()) { SS.flash('Isi nama pembeli untuk transaksi tempo'); return; }
    }

    SS.setState({ k_saving: true });

    // Simpan snapshot untuk nota (sebelum cart di-clear)
    var notaSnap = {
      cart:      cart.slice(),
      cartTotal: cartTotal,
      cash:      cash,
      change:    change,
      discount:  discount,
      method:    method,
      tname:     (SS.S.k_tname || '').trim(),
      branch:    (SS.USER || {}).branch || '',
      kasir:     (SS.USER || {}).name || (SS.USER || {}).username || '',
      trxId:     null,
    };

    try {
      var resp = await SS.api('/api/transactions', 'POST', {
        items: cart.map(function(i){
          return { product_id: i.id, qty: i.qty, price: i.hargaJual };
        }),
        method:        method,
        cash:          cash,
        customer_name: method === 'tempo' ? (SS.S.k_tname || '').trim() : null,
      });

      notaSnap.trxId = resp.trx_id || null;

      // Refresh data (produk stok berkurang, dashboard, dll)
      try {
        var r = await Promise.all([SS.api('/api/bootstrap'), SS.api('/api/dashboard')]);
        Object.assign(SS.DB, r[0], { dash: r[1] });
        SS.DB.byUser = {}; SS.DB.memberItems = {}; SS.DB.yearly = {};
      } catch(e){}

      _clearCart();
      SS.setState({ k_saving: false });

      // Cetak nota setelah cart clear
      _printNota(notaSnap);

    } catch(err) {
      SS.setState({ k_saving: false });
      SS.flash(err.message);
    }
  }

  /* ---- Generate dan buka nota cetak ---- */
  function _printNota(snap) {
    var MON = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    var now  = new Date();
    var tgl  = now.getDate()+' '+MON[now.getMonth()]+' '+now.getFullYear();
    var jam  = ('0'+now.getHours()).slice(-2)+':'+('0'+now.getMinutes()).slice(-2);

    var dueDateStr = '';
    if (snap.method === 'tempo') {
      var due = new Date();
      due.setMonth(due.getMonth() + 1);
      dueDateStr = due.getDate()+' '+MON[due.getMonth()]+' '+due.getFullYear();
    }

    var rp = function(n){ return 'Rp'+(Math.round(n)||0).toLocaleString('id-ID'); };

    // Baris item
    var itemRows = snap.cart.map(function(i){
      var changed = i.hargaJual !== i.harga;
      return '<tr>'
        +'<td style="padding:3px 0;font-size:11px;vertical-align:top;line-height:1.4;">'
          +'<span style="font-weight:600;">'+esc(i.name)+'</span>'
          +(i.varian && i.varian !== '-' ? '<br><span style="color:#777;font-size:10px;">'+esc(i.varian)+'</span>' : '')
          +(changed
            ? '<br><span style="font-size:9px;color:#888;">'
              +'Normal: '+rp(i.harga)
              +(i.priceNote ? ' · '+esc(i.priceNote) : '')
              +'</span>'
            : '')
        +'</td>'
        +'<td style="padding:3px 4px;font-size:11px;text-align:center;vertical-align:top;white-space:nowrap;">'+i.qty+'</td>'
        +'<td style="padding:3px 0;font-size:11px;text-align:right;vertical-align:top;white-space:nowrap;">'+rp(i.hargaJual)+'</td>'
        +'<td style="padding:3px 0 3px 6px;font-size:11px;text-align:right;vertical-align:top;font-weight:600;white-space:nowrap;">'+rp(i.hargaJual*i.qty)+'</td>'
        +'</tr>';
    }).join('');

    // Footer: subtotal, potongan, total, tunai/kembalian
    var finalTotal = snap.discount > 0 ? snap.cash : snap.cartTotal;
    var footerRows = ''
      +'<tr>'
        +'<td colspan="3" style="padding:6px 0 2px;font-size:11px;border-top:1px dashed #999;">Subtotal</td>'
        +'<td style="padding:6px 0 2px 6px;font-size:11px;text-align:right;border-top:1px dashed #999;">'+rp(snap.cartTotal)+'</td>'
      +'</tr>';

    if (snap.discount > 0) {
      footerRows += '<tr>'
        +'<td colspan="3" style="padding:2px 0;font-size:11px;color:#c00;">Potongan</td>'
        +'<td style="padding:2px 0 2px 6px;font-size:11px;text-align:right;color:#c00;">-'+rp(snap.discount)+'</td>'
        +'</tr>';
    }

    footerRows += '<tr>'
      +'<td colspan="3" style="padding:5px 0;font-size:13px;font-weight:700;border-top:2px solid #333;">TOTAL BAYAR</td>'
      +'<td style="padding:5px 0 5px 6px;font-size:13px;font-weight:700;text-align:right;border-top:2px solid #333;">'+rp(finalTotal)+'</td>'
      +'</tr>';

    if (snap.method === 'tunai' && snap.cash) {
      footerRows += '<tr>'
        +'<td colspan="3" style="padding:2px 0;font-size:11px;">Tunai Diterima</td>'
        +'<td style="padding:2px 0 2px 6px;font-size:11px;text-align:right;">'+rp(snap.cash)+'</td>'
        +'</tr>';
      if (snap.change !== null && snap.change >= 0) {
        footerRows += '<tr>'
          +'<td colspan="3" style="padding:2px 0;font-size:12px;font-weight:700;">Kembalian</td>'
          +'<td style="padding:2px 0 2px 6px;font-size:12px;font-weight:700;text-align:right;">'+rp(snap.change)+'</td>'
          +'</tr>';
      }
    }

    var metodeBadge = snap.method === 'tunai'
      ? 'Tunai'
      : snap.method === 'marketplace'
        ? 'Marketplace'
        : 'Tempo';

    // Helper escape sederhana untuk nota (tidak bergantung pada SS)
    function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    var html = '<!DOCTYPE html><html lang="id"><head>'
      +'<meta charset="utf-8">'
      +'<meta name="viewport" content="width=device-width,initial-scale=1">'
      +'<title>Nota #'+(snap.trxId||'-')+' — Suplemen Semarang</title>'
      +'<style>'
        +'*{box-sizing:border-box;margin:0;padding:0;}'
        +'body{font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;color:#000;}'
        +'.nota-wrap{max-width:80mm;margin:0 auto;background:#fff;padding:10mm 6mm;}'
        +'.nota-header{text-align:center;margin-bottom:8px;}'
        +'.nota-header h1{font-size:14px;font-weight:700;letter-spacing:1.5px;}'
        +'.nota-header .sub{font-size:10px;color:#555;}'
        +'.divider{border:none;border-top:1px solid #bbb;margin:6px 0;}'
        +'.divider-dash{border:none;border-top:1px dashed #ccc;margin:4px 0;}'
        +'.meta{display:flex;justify-content:space-between;font-size:10px;color:#555;}'
        +'table{width:100%;border-collapse:collapse;}'
        +'th{font-size:9.5px;color:#888;font-weight:600;padding-bottom:4px;border-bottom:1px dashed #ccc;}'
        +'.footer-note{margin-top:10px;text-align:center;font-size:9.5px;color:#888;border-top:1px dashed #ccc;padding-top:7px;}'
        +'.method-box{margin-top:8px;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:11px;}'
        +'.actions{text-align:center;margin-top:14px;display:flex;gap:8px;justify-content:center;}'
        +'.btn{padding:7px 18px;border:1px solid #333;border-radius:5px;cursor:pointer;font-size:12px;background:#f0f0f0;}'
        +'.btn-close{background:#fff;border-color:#ccc;color:#666;}'
        +'@media print{'
        +'  body{background:#fff;}'
        +'  .nota-wrap{max-width:100%;padding:4mm;}'
        +'  .no-print{display:none!important;}'
        +'  @page{size:80mm auto;margin:4mm;}'
        +'}'
      +'</style>'
      +'</head><body>'
      +'<div class="nota-wrap">'
        // Header
        +'<div class="nota-header">'
          +'<h1>SUPLEMEN SEMARANG</h1>'
          +'<div class="sub">Cabang '+esc(snap.branch)+'</div>'
          +'<div class="sub" style="margin-top:2px;">'+tgl+' &nbsp;&bull;&nbsp; '+jam+'</div>'
        +'</div>'
        +'<hr class="divider">'
        +'<div class="meta">'
          +'<span>No: '+(snap.trxId ? '#'+snap.trxId : '-')+'</span>'
          +'<span>Kasir: '+esc(snap.kasir)+'</span>'
        +'</div>'
        +'<hr class="divider">'
        // Tabel produk
        +'<table>'
          +'<thead><tr>'
            +'<th style="text-align:left;">Produk</th>'
            +'<th style="text-align:center;">Qty</th>'
            +'<th style="text-align:right;">Harga</th>'
            +'<th style="text-align:right;padding-left:6px;">Sub</th>'
          +'</tr></thead>'
          +'<tbody>'+itemRows+'</tbody>'
          +'<tfoot>'+footerRows+'</tfoot>'
        +'</table>'
        // Metode & info tempo
        +'<div class="method-box">'
          +'Metode: <strong>'+esc(metodeBadge)+'</strong>'
          +(snap.method === 'tempo' && snap.tname
            ? '<br>Pembeli: <strong>'+esc(snap.tname)+'</strong>'
              +'<br>Jatuh Tempo: <strong>'+esc(dueDateStr)+'</strong>'
            : '')
        +'</div>'
        // Footer
        +'<div class="footer-note">Terima kasih atas kepercayaan Anda!</div>'
        // Tombol aksi (tidak ikut cetak)
        +'<div class="actions no-print">'
          +'<button class="btn" onclick="window.print();return false;">&#128438; Cetak</button>'
          +'<button class="btn btn-close" onclick="window.close();">Tutup</button>'
        +'</div>'
      +'</div>'
      +'</body></html>';

    var w = window.open('', '_blank', 'width=420,height=660,scrollbars=yes,resizable=yes');
    if (w) {
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(function(){ w.print(); }, 500);
    } else {
      SS.flash('Popup diblokir browser — izinkan popup untuk mencetak nota, lalu coba lagi.');
    }
  }

  /* ================================================================
   * MODAL: EDIT HARGA PER ITEM
   * ================================================================ */
  function _editPriceModalHtml() {
    var idx = SS.S.k_editIdx;
    if (idx === null || idx === undefined) return '';
    var cart = _cart(), item = cart[idx];
    if (!item) return '';

    var type       = SS.S.k_editType || 'normal';
    var note       = SS.S.k_editNote || '';
    var customVal  = SS.S.k_editCustom || '';
    var preview    = _getEditedPrice();
    var hasChanged = preview !== item.harga;

    function _tabBtn(k, lbl) {
      var on = type === k;
      return '<button '+SS.A(function(){ SS.setState({k_editType:k,k_editCustom:''}); })
        +' style="flex:1;height:36px;border-radius:9px;font-size:12.5px;font-weight:700;cursor:pointer;'
        +'border:1.5px solid '+(on?'var(--gold)':'var(--border)')+';'
        +'background:'+(on?'var(--goldtint2)':'var(--surface2)')+';'
        +'color:'+(on?'var(--gold)':'var(--muted)')+';">'+lbl+'</button>';
    }

    // Panel Harga Custom
    var customPanel = '';
    if (type === 'custom') {
      customPanel = _fld('Harga Custom (Rp)',
        '<input id="k-edit-custom" value="'+SS.esc(customVal)+'" '
          +SS.I(function(e){ SS.setState({k_editCustom:(e.target.value||'').replace(/\D/g,'')}); })
          +' type="text" inputmode="numeric" placeholder="Masukkan harga\u2026" '
          +'style="width:100%;height:50px;border-radius:12px;border:1px solid var(--border);'
          +'background:var(--input);color:var(--text);font-size:20px;padding:0 14px;outline:none;'
          +'font-family:\'Saira\',sans-serif;font-weight:700;text-align:center;">'
      );
    }

    // Preview box: tampilkan harga normal vs harga yang dipilih
    var previewBox = '<div style="background:'+(hasChanged?'var(--goldtint)':'var(--surface2)')
      +';border:1px solid '+(hasChanged?'var(--goldborder)':'var(--border)')
      +';border-radius:12px;padding:12px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">'
      +'<div>'
        +'<div style="font-size:10.5px;color:var(--muted);margin-bottom:3px;">Harga Normal</div>'
        +'<div style="font-family:\'Saira\',sans-serif;font-weight:700;font-size:15px;'
          +'color:var(--muted);'+(hasChanged?'text-decoration:line-through;':'')+'">'+SS.rp(item.harga)+'</div>'
      +'</div>'
      +(hasChanged
        ? '<div style="text-align:right;">'
            +'<div style="font-size:10.5px;color:var(--gold);margin-bottom:3px;">Harga Diubah</div>'
            +'<div style="font-family:\'Saira\',sans-serif;font-weight:800;font-size:17px;color:var(--gold);">'+SS.rp(preview)+'</div>'
          +'</div>'
        : '<div style="font-size:12px;color:var(--ok);font-weight:600;">&#10003; Harga Normal</div>'
      )
      +'</div>';

    // Field catatan (wajib jika harga berubah)
    var notePanel = '<div style="margin-bottom:13px;">'
      +_lbl('Alasan Perubahan Harga'+(hasChanged?' *':''))
      +'<input id="k-edit-note" value="'+SS.esc(note)+'" '
        +SS.I(function(e){ SS.setState({k_editNote:e.target.value}); })
        +' placeholder="Contoh: Reseller, Diskon Event, Customer Tetap, Kompensasi Barang\u2026" '
        +'style="width:100%;height:44px;border-radius:11px;border:1px solid '+(hasChanged?'var(--gold)':'var(--border)')
        +';background:var(--input);color:var(--text);font-size:13.5px;padding:0 13px;outline:none;">'
      +(hasChanged?'<div style="font-size:11px;color:var(--warn);margin-top:4px;">&#9888; Wajib diisi karena harga berubah dari harga normal.</div>':'')
      +'</div>';

    return '<div '+SS.A(function(){ SS.setState({k_editIdx:null}); })
        +' style="position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:200;"></div>'
      +'<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:201;'
        +'width:min(480px,calc(100vw - 24px));max-height:90dvh;overflow-y:auto;background:var(--panel);'
        +'border:1px solid var(--border);border-radius:22px;padding:22px;'
        +'box-shadow:0 30px 80px -15px rgba(0,0,0,.85);">'
        // Header modal
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
          +'<div>'
            +'<div style="font-family:\'Saira\',sans-serif;font-weight:800;font-size:17px;">Edit Harga</div>'
            +'<div style="font-size:12px;color:var(--muted);margin-top:2px;">'+SS.esc(item.name)+' &middot; '+SS.esc(item.varian)+'</div>'
          +'</div>'
          +'<button '+SS.A(function(){ SS.setState({k_editIdx:null}); })
            +' style="background:var(--surface2);border:1px solid var(--border);color:var(--text);'
            +'width:36px;height:36px;border-radius:10px;cursor:pointer;font-size:19px;line-height:1;flex:none;">'
            +'&times;</button>'
        +'</div>'
        // Tabs
        +'<div style="display:flex;gap:6px;margin-bottom:14px;">'
          +_tabBtn('normal','Harga Normal')
          +_tabBtn('custom','Harga Custom')
        +'</div>'
        +customPanel
        +previewBox
        +notePanel
        // Tombol aksi
        +'<div style="display:flex;gap:10px;">'
          +'<button '+SS.A(function(){ SS.setState({k_editIdx:null}); })
            +' style="flex:none;width:90px;height:48px;border-radius:12px;background:var(--surface2);'
            +'border:1px solid var(--border);color:var(--text2);font-size:13px;cursor:pointer;">Batal</button>'
          +'<button '+SS.A(_saveEditPrice)+' class="fx-press" '
            +'style="flex:1;height:48px;border-radius:12px;border:none;'
            +'background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;'
            +'font-family:\'Saira\',sans-serif;font-weight:800;font-size:14px;cursor:pointer;">'
            +'SIMPAN HARGA</button>'
        +'</div>'
      +'</div>';
  }

  /* ================================================================
   * KATALOG
   * ================================================================ */
  function _catalogHtml(isDesktop) {
    var prods = _filtered();
    var cats  = ['Semua'].concat(SS.DB.categories.map(function(c){ return c.name; }));
    var q     = SS.S.k_q || '', cat = SS.S.k_cat || 'Semua';
    var cols  = isDesktop ? '160px' : '148px';
    var chips = cats.map(function(c){ return _chip(cat===c, c, function(){ SS.setState({k_cat:c}); }); }).join('');

    // Shortcut: 1 item di cart, harga tidak berubah
    var cart         = _cart();
    var showShortcut = cart.length === 1 && cart[0].hargaJual === cart[0].harga;

    var grid = prods.length === 0
      ? '<div style="text-align:center;padding:60px 20px;color:var(--dim2);">'
          +'<div style="font-size:42px;margin-bottom:14px;">&#128230;</div>'
          +'<div style="font-size:14px;">'+(q||cat!=='Semua'?'Tidak ada produk yang cocok':'Belum ada produk di cabang ini')+'</div>'
          +(q||cat!=='Semua'
            ? '<button '+SS.A(function(){ SS.setState({k_q:'',k_cat:'Semua'}); })
                +' style="margin-top:12px;background:none;border:1px solid var(--border);color:var(--muted);'
                +'border-radius:9px;padding:7px 16px;cursor:pointer;font-size:12.5px;">Reset filter</button>'
            : '')
        +'</div>'
      : '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax('+cols+',1fr));gap:10px;">'
          +prods.map(_prodCard).join('')
        +'</div>';

    return '<div style="display:flex;flex-direction:column;height:100%;min-height:0;">'
      // Search + filter chips
      +'<div style="flex:none;padding:10px 14px 8px;border-bottom:1px solid var(--divider);">'
        +'<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">'
          +'<div style="flex:1;position:relative;">'
            +'<svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);" width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="var(--dim)" stroke-width="1.8"></circle><path d="M16 16l4 4" stroke="var(--dim)" stroke-width="1.8" stroke-linecap="round"></path></svg>'
            +'<input id="k-search" value="'+SS.esc(q)+'" '+SS.I(function(e){ SS.setState({k_q:e.target.value}); })
              +' placeholder="Cari nama produk\u2026" '
              +'style="width:100%;height:38px;border-radius:10px;border:1px solid var(--border);'
              +'background:var(--surface);color:var(--text);font-size:13px;padding:0 12px 0 33px;outline:none;">'
          +'</div>'
        +'</div>'
        +'<div style="display:flex;gap:5px;overflow-x:auto;padding-bottom:2px;">'+chips+'</div>'
      +'</div>'
      // Grid produk
      +'<div class="scrl" style="flex:1;overflow-y:auto;padding:10px 12px 16px;">'+grid+'</div>'
      // Shortcut Lanjut Pembayaran (muncul saat 1 item di cart, harga normal)
      +(showShortcut
        ? '<div style="flex:none;padding:8px 14px 12px;border-top:1px solid var(--divider);background:var(--panel);">'
            +'<div style="font-size:11.5px;color:var(--muted);text-align:center;margin-bottom:7px;">'
              +'1 produk di keranjang &mdash; harga normal'
            +'</div>'
            +'<button '+SS.A(function(){ SS.setState({k_panel:'pay'}); })+' class="fx-press" '
              +'style="width:100%;height:44px;border-radius:12px;border:none;'
              +'background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;'
              +'font-family:\'Saira\',sans-serif;font-weight:800;font-size:13px;cursor:pointer;'
              +'box-shadow:0 8px 20px -8px rgba(212,175,55,.5);">'
              +'Lanjut Pembayaran &#8594;</button>'
          +'</div>'
        : ''
      )
    +'</div>';
  }

  function _prodCard(p) {
    var inCart = _cart().find(function(i){ return i.id === p.id; });
    var low    = p.stok <= 5;
    return '<div style="background:var(--surface);border:1px solid var(--border2);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;">'
      +(p.photo
        ? '<img src="'+SS.esc(p.photo)+'" alt="'+SS.esc(p.name)+'" '
            +'style="width:100%;height:94px;object-fit:cover;display:block;" '
            +'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
        : '')
      +'<div style="width:100%;height:94px;background:var(--goldtint);display:'+(p.photo?'none':'flex')
        +';align-items:center;justify-content:center;">'+SS.ic('produk','var(--gold)',28)+'</div>'
      +'<div style="padding:9px 10px 10px;flex:1;display:flex;flex-direction:column;gap:3px;">'
        +'<div style="font-size:12px;font-weight:600;line-height:1.3;'
          +'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">'+SS.esc(p.name)+'</div>'
        +'<div style="font-size:10.5px;color:var(--muted);">'+SS.esc(p.varian||'-')+'</div>'
        +'<div style="font-family:\'Saira\',sans-serif;font-weight:700;font-size:14px;color:var(--gold);margin-top:3px;">'+SS.rp(p.harga)+'</div>'
        +'<div style="font-size:10px;color:'+(low?'var(--warn)':'var(--dim)')+';">Stok: '+p.stok+(low?' &#9888;':'')+'</div>'
        +'<button '+SS.A(function(){ _addToCart(p); })+' class="fx-press" '
          +'style="width:100%;height:30px;border-radius:8px;border:none;margin-top:5px;cursor:pointer;'
          +'font-family:\'Saira\',sans-serif;font-weight:700;font-size:11.5px;'
          +'background:'+(inCart?'var(--goldtint2)':'linear-gradient(180deg,var(--goldhi),var(--gold))')+';'
          +'color:'+(inCart?'var(--gold)':'#161208')+';">'
          +(inCart?'&#10003; '+inCart.qty+' di keranjang':'+ Tambah')
        +'</button>'
      +'</div>'
    +'</div>';
  }

  /* ================================================================
   * KERANJANG BELANJA
   * ================================================================ */
  function _cartHtml() {
    var cart  = _cart(), total = _total(), empty = cart.length === 0;
    var showShortcut = cart.length === 1 && cart[0].hargaJual === cart[0].harga;

    return '<div style="display:flex;flex-direction:column;height:100%;min-height:0;">'
      // Header cart
      +'<div style="flex:none;padding:13px 16px 11px;border-bottom:1px solid var(--divider);'
        +'display:flex;justify-content:space-between;align-items:center;">'
        +'<div style="font-family:\'Saira\',sans-serif;font-weight:800;font-size:15px;">Keranjang</div>'
        +(!empty
          ? '<button '+SS.A(function(){ SS.setState({k_cart:[]}); })
              +' style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:12px;padding:0;">'
              +'Kosongkan</button>'
          : '')
      +'</div>'
      // Items
      +'<div class="scrl" style="flex:1;overflow-y:auto;padding:0 14px;">'
        +(empty
          ? '<div style="text-align:center;padding:50px 20px;color:var(--dim2);">'
              +'<div style="font-size:40px;margin-bottom:12px;">&#128722;</div>'
              +'<div style="font-size:13.5px;">Belum ada item di keranjang</div>'
            +'</div>'
          : cart.map(_cartItem).join('')
        )
      +'</div>'
      // Footer dengan total & tombol lanjut
      +(!empty
        ? '<div style="flex:none;padding:12px 14px;border-top:1px solid var(--divider);background:var(--panel);">'
            +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:11px;">'
              +'<span style="font-size:12.5px;color:var(--muted);">'+cart.length+' item &middot; '+_count()+' pcs</span>'
              +'<span style="font-family:\'Saira\',sans-serif;font-weight:900;font-size:21px;">'+SS.rp(total)+'</span>'
            +'</div>'
            +'<button '+SS.A(function(){ SS.setState({k_panel:'pay'}); })+' class="fx-press" '
              +'style="width:100%;height:46px;border-radius:12px;border:none;'
              +'background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;'
              +'font-family:\'Saira\',sans-serif;font-weight:800;font-size:13.5px;letter-spacing:.04em;'
              +'cursor:pointer;box-shadow:0 8px 20px -8px rgba(212,175,55,.5);">'
              +(showShortcut?'Lanjut Pembayaran &#8594;':'Lanjut ke Pembayaran &#8594;')
            +'</button>'
          +'</div>'
        : ''
      )
    +'</div>';
  }

  function _cartItem(item, idx) {
    var priceChanged = item.hargaJual !== item.harga;
    return '<div style="display:flex;align-items:flex-start;gap:10px;padding:11px 0;border-bottom:1px solid var(--divider);">'
      // Info produk & harga
      +'<div style="flex:1;min-width:0;">'
        +'<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+SS.esc(item.name)+'</div>'
        +'<div style="font-size:11px;color:var(--muted);">'+SS.esc(item.varian)+'</div>'
        +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;">'
          +(priceChanged
            ? '<span style="font-size:11px;color:var(--muted);text-decoration:line-through;">'+SS.rp(item.harga)+'</span>'
              +'<span style="font-size:12.5px;color:var(--gold);font-family:\'Saira\',sans-serif;font-weight:700;">'+SS.rp(item.hargaJual)+'</span>'
              +'<span style="font-size:9.5px;background:var(--goldtint);color:var(--gold);border:1px solid var(--goldborder);border-radius:4px;padding:1px 5px;">Ubah</span>'
            : '<span style="font-size:12px;color:var(--gold);font-family:\'Saira\',sans-serif;font-weight:700;">'+SS.rp(item.harga)+'</span>'
          )
          +'<button '+SS.A(function(){ _openEditPrice(idx); })
            +' style="font-size:10px;background:var(--surface2);border:1px solid var(--border);'
            +'border-radius:5px;padding:2px 7px;cursor:pointer;color:var(--muted);">Edit Harga</button>'
        +'</div>'
        +(priceChanged && item.priceNote
          ? '<div style="font-size:10.5px;color:var(--muted);margin-top:2px;font-style:italic;">'+SS.esc(item.priceNote)+'</div>'
          : '')
      +'</div>'
      // Qty stepper
      +'<div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:9px;overflow:hidden;flex:none;">'
        +'<button '+SS.A(function(){ _changeQty(idx,-1); })
          +' style="width:30px;height:30px;background:var(--surface2);border:none;cursor:pointer;font-size:17px;line-height:1;color:var(--text2);">&minus;</button>'
        +'<span style="width:30px;text-align:center;font-family:\'Saira\',sans-serif;font-weight:700;font-size:13px;">'+item.qty+'</span>'
        +'<button '+SS.A(function(){ _changeQty(idx,+1); })
          +' style="width:30px;height:30px;background:var(--surface2);border:none;cursor:pointer;font-size:17px;line-height:1;color:var(--text2);">+</button>'
      +'</div>'
      // Subtotal + hapus
      +'<div style="text-align:right;flex:none;min-width:72px;">'
        +'<div style="font-family:\'Saira\',sans-serif;font-weight:700;font-size:13px;">'+SS.rp(item.hargaJual*item.qty)+'</div>'
        +'<button '+SS.A(function(){ _removeFromCart(idx); })
          +' style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--danger);padding:2px 0 0;">Hapus</button>'
      +'</div>'
    +'</div>';
  }

  /* ================================================================
   * PEMBAYARAN
   * ================================================================ */
  function _payHtml() {
    var cart      = _cart(), cartTotal = _total(), method = SS.S.k_pay || 'tunai';
    var cashRaw   = parseInt((SS.S.k_cash || '').replace(/\D/g,''),10) || 0;
    var saving    = !!SS.S.k_saving;

    var change   = (cashRaw > 0 && cashRaw >= cartTotal) ? cashRaw - cartTotal : null;
    var discount = (cashRaw > 0 && cashRaw < cartTotal) ? cartTotal - cashRaw : null;

    // Tanggal jatuh tempo otomatis +1 bulan (tampil di UI tempo)
    var dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + 1);
    var MON = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    var dueDateStr = dueDate.getDate()+' '+MON[dueDate.getMonth()]+' '+dueDate.getFullYear();

    function mb(k, l) {
      var on = method === k;
      return '<button '+SS.A(function(){ SS.setState({k_pay:k, k_cash:''}); })
        +' style="flex:1;height:44px;border-radius:11px;cursor:pointer;'
        +'font-family:\'Saira\',sans-serif;font-weight:700;font-size:13px;'
        +'border:1.5px solid '+(on?'var(--gold)':'var(--border)')+';'
        +'background:'+(on?'var(--goldtint2)':'var(--surface2)')+';'
        +'color:'+(on?'var(--gold)':'var(--muted)')+';">'+l+'</button>';
    }

    // Panel Tunai
    var tunaiPanel = method === 'tunai'
      ? _fld('Nominal Dibayar (Rp)',
          '<input id="k-cash" value="'+SS.esc(SS.S.k_cash||'')+'" '
            +SS.I(function(e){ SS.setState({k_cash:e.target.value}); })
            +' type="text" inputmode="numeric" placeholder="Rp\u2026" '
            +'style="width:100%;height:48px;border-radius:12px;border:1px solid var(--border);'
            +'background:var(--input);color:var(--text);font-size:17px;padding:0 14px;outline:none;'
            +'font-family:\'Saira\',sans-serif;font-weight:700;">'
        )
        +(cashRaw > 0 && cashRaw >= cartTotal
          // Kembalian
          ? '<div style="background:var(--oktint);border:1px solid var(--okborder);border-radius:11px;'
              +'padding:11px 14px;display:flex;justify-content:space-between;align-items:center;'
              +'margin-top:-5px;margin-bottom:14px;">'
              +'<span style="font-size:13px;color:var(--ok);font-weight:600;">Kembalian</span>'
              +'<span style="font-family:\'Saira\',sans-serif;font-weight:900;font-size:20px;color:var(--ok);">'+SS.rp(change)+'</span>'
            +'</div>'
          : cashRaw > 0
            // Potongan
            ? '<div style="background:var(--warntint);border:1px solid rgba(232,161,58,.3);border-radius:11px;'
                +'padding:11px 14px;margin-top:-5px;margin-bottom:14px;'
                +'display:flex;justify-content:space-between;align-items:center;">'
                +'<div>'
                  +'<div style="font-size:13px;color:var(--warn);font-weight:600;">Potongan</div>'
                  +'<div style="font-size:11px;color:var(--muted);">Total yang dicatat: '+SS.rp(cashRaw)+'</div>'
                +'</div>'
                +'<span style="font-family:\'Saira\',sans-serif;font-weight:900;font-size:20px;color:var(--warn);">-'+SS.rp(discount)+'</span>'
              +'</div>'
            : ''
        )
      : '';

    // Panel Marketplace
    var mpPanel = method === 'marketplace'
      ? '<div style="background:var(--infotint);border:1px solid rgba(122,167,255,.3);border-radius:12px;padding:14px;margin-bottom:14px;">'
          +'<div style="font-size:13.5px;font-weight:600;color:var(--info);">Pembayaran via Marketplace</div>'
          +'<div style="font-size:12px;color:var(--muted);margin-top:5px;line-height:1.55;">Transaksi langsung dianggap lunas. Tidak ada kembalian.</div>'
        +'</div>'
      : '';

    // Panel Tempo
    var tempoPanel = method === 'tempo'
      ? _fld('Nama Pembeli *',
          '<input id="k-tname" value="'+SS.esc(SS.S.k_tname||'')+'" '
            +SS.I(function(e){ SS.setState({k_tname:e.target.value}); })
            +' placeholder="Nama pembeli\u2026" '
            +'style="width:100%;height:44px;border-radius:11px;border:1px solid var(--border);'
            +'background:var(--input);color:var(--text);font-size:14px;padding:0 13px;outline:none;">'
        )
        +'<div style="background:var(--warntint);border:1px solid rgba(232,161,58,.3);border-radius:11px;'
          +'padding:12px 14px;margin-top:-5px;margin-bottom:14px;display:flex;align-items:flex-start;gap:8px;">'
          +SS.ic('tempo','var(--warn)',14)
          +'<div>'
            +'<div style="font-size:12.5px;color:var(--warn);line-height:1.5;">'
              +'Piutang senilai <b>'+SS.rp(cartTotal)+'</b> akan dibuat otomatis.'
            +'</div>'
            +'<div style="font-size:11.5px;color:var(--muted);margin-top:3px;">'
              +'Jatuh tempo: <b>'+dueDateStr+'</b>'
            +'</div>'
          +'</div>'
        +'</div>'
      : '';

    // Validasi tombol: marketplace & tempo selalu bisa, tunai hanya jika ada cash
    var canPay = method === 'marketplace' || method === 'tempo' || (method === 'tunai' && cashRaw > 0);

    return '<div class="scrl" style="height:100%;overflow-y:auto;padding:14px 16px 30px;">'
      +'<button '+SS.A(function(){ SS.setState({k_panel:'cart'}); })
        +' style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:12.5px;padding:0;margin-bottom:14px;">'
        +'&larr; Kembali ke Keranjang</button>'
      // Ringkasan cart
      +'<div style="background:var(--surface);border:1px solid var(--border2);border-radius:14px;padding:13px 14px;margin-bottom:14px;">'
        +_lbl('Ringkasan '+cart.length+' item')
        +cart.map(function(i){
          var changed = i.hargaJual !== i.harga;
          return '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;gap:8px;">'
            +'<span style="color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
              +SS.esc(i.name)
              +(changed
                ? ' <span style="font-size:10.5px;color:var(--warn);background:var(--warntint);'
                    +'border-radius:3px;padding:0 4px;">[Ubah Harga]</span>'
                : '')
              +' &times;'+i.qty
            +'</span>'
            +'<span style="font-weight:600;flex:none;">'+SS.rp(i.hargaJual*i.qty)+'</span>'
          +'</div>';
        }).join('')
        +'<div style="border-top:1px solid var(--divider);margin-top:10px;padding-top:10px;'
          +'display:flex;justify-content:space-between;align-items:center;">'
          +'<span style="font-size:12.5px;color:var(--muted);">Total</span>'
          +'<span style="font-family:\'Saira\',sans-serif;font-weight:900;font-size:20px;color:var(--gold);">'+SS.rp(cartTotal)+'</span>'
        +'</div>'
      +'</div>'
      // Pilih metode
      +_lbl('Metode Pembayaran')
      +'<div style="display:flex;gap:7px;margin-bottom:14px;">'+mb('tunai','Tunai')+mb('marketplace','Marketplace')+mb('tempo','Tempo')+'</div>'
      +tunaiPanel+mpPanel+tempoPanel
      // Tombol Cetak Nota
      +'<button '+SS.A(_saveTrx)+(saving||!canPay?' disabled':'')
        +' class="fx-press" style="width:100%;height:52px;border-radius:14px;border:none;margin-top:4px;'
        +'background:'+(saving||!canPay?'var(--border)':'linear-gradient(180deg,var(--goldhi),var(--gold))')+';'
        +'color:'+(saving||!canPay?'var(--muted)':'#161208')+';'
        +'font-family:\'Saira\',sans-serif;font-weight:800;font-size:15px;letter-spacing:.06em;'
        +'cursor:'+(saving||!canPay?'not-allowed':'pointer')+';">'
        +(saving?'Menyimpan\u2026':'&#128438; Cetak Nota')
      +'</button>'
    +'</div>';
  }

  /* ================================================================
   * HEADER KASIR (tanpa tombol Masuk & + Produk)
   * ================================================================ */
  function _headerHtml(V) {
    var count = _count();

    return '<div style="flex:none;height:54px;border-bottom:1px solid var(--divider);'
      +'display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:var(--panel);gap:8px;">'
      // Judul
      +'<div style="display:flex;align-items:center;gap:8px;min-width:0;">'
        +'<div style="font-family:\'Saira\',sans-serif;font-weight:800;font-size:16px;white-space:nowrap;">Kasir</div>'
        +'<div style="font-size:11.5px;color:var(--gold);background:var(--goldtint);border:1px solid var(--goldborder);'
          +'border-radius:7px;padding:2px 9px;white-space:nowrap;font-weight:600;">'+SS.esc((SS.USER||{}).branch||'')+'</div>'
        +'<div style="font-size:12px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
          +'&middot; '+SS.esc(V.who||'')+'</div>'
      +'</div>'
      // Tombol aksi
      +'<div style="display:flex;gap:5px;flex:none;align-items:center;">'
        // Badge item di mobile
        +(count>0&&V.isMobile
          ? '<div style="background:var(--gold);color:#161208;border-radius:20px;padding:2px 9px;'
              +'font-family:\'Saira\',sans-serif;font-weight:800;font-size:12px;">'+count+'</div>'
          : '')
        // Tombol Mode (hanya admin)
        +(V.isAdmin
          ? '<button '+SS.A(V.goModeScreen)
              +' style="height:34px;padding:0 11px;border-radius:9px;background:var(--surface2);'
              +'border:1px solid var(--border);color:var(--text2);font-size:12px;cursor:pointer;white-space:nowrap;">Mode</button>'
          : '')
        // Settings
        +'<button '+SS.A(V.openSettings)
          +' style="height:34px;width:34px;border-radius:9px;background:var(--surface2);'
          +'border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;'
          +'display:flex;align-items:center;justify-content:center;">'+SS.ic('settings','var(--muted2)',16)+'</button>'
        // Keluar
        +'<button '+SS.A(V.logout)
          +' style="height:34px;padding:0 11px;border-radius:9px;background:var(--surface2);'
          +'border:1px solid var(--border);color:var(--text2);font-size:12px;cursor:pointer;">Keluar</button>'
      +'</div>'
    +'</div>';
  }

  /* ================================================================
   * RENDERER UTAMA — dipanggil oleh engine app.js setiap render
   * ================================================================ */
  SS.registerCashier(function(V) {
    var panel      = SS.S.k_panel || 'catalog';
    var isDesktop  = V.isDesktop;
    var editIdx    = SS.S.k_editIdx;

    var editModal  = (editIdx !== null && editIdx !== undefined) ? _editPriceModalHtml() : '';

    // Layout Desktop: split-view katalog kiri + cart/pay kanan
    if (isDesktop) {
      return '<div style="height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);">'
        +_headerHtml(V)
        +'<div style="flex:1;display:flex;min-height:0;overflow:hidden;">'
          +'<div style="flex:1;min-width:0;border-right:1px solid var(--divider);">'+_catalogHtml(true)+'</div>'
          +'<div style="width:380px;flex:none;display:flex;flex-direction:column;min-height:0;">'
            +(panel==='pay' ? _payHtml() : _cartHtml())
          +'</div>'
        +'</div>'
      +'</div>'+editModal;
    }

    // Layout Mobile: tabs
    var count = _count();
    var tabs = [
      { key:'catalog', label:'Katalog' },
      { key:'cart',    label: count > 0 ? 'Keranjang ('+count+')' : 'Keranjang' },
      { key:'pay',     label: 'Bayar' },
    ];
    return '<div style="height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);">'
      +_headerHtml(V)
      +'<div style="flex:none;display:flex;border-bottom:1px solid var(--divider);background:var(--panel);">'
        +tabs.map(function(t){
          var on = panel === t.key;
          return '<button '+SS.A(function(){ SS.setState({k_panel:t.key}); })
            +' style="flex:1;height:42px;border:none;cursor:pointer;'
            +'font-family:\'Saira\',sans-serif;font-weight:700;font-size:12.5px;white-space:nowrap;'
            +'background:'+(on?'var(--goldtint)':'transparent')+';'
            +'color:'+(on?'var(--gold)':'var(--muted)')+';'
            +'border-bottom:2px solid '+(on?'var(--gold)':'transparent')+';font-size:12.5px;">'
            +t.label+'</button>';
        }).join('')
      +'</div>'
      +'<div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;">'
        +(panel==='catalog' ? _catalogHtml(false) : panel==='cart' ? _cartHtml() : _payHtml())
      +'</div>'
    +'</div>'+editModal;
  });

  /* ================================================================
   * EVENTS
   * ================================================================ */
  document.addEventListener('keydown', function(e) {
  });
  document.addEventListener('keydown', function(e) {
    if (e.key==='Enter' && e.target && e.target.id==='k-search') e.preventDefault();
  });

})();