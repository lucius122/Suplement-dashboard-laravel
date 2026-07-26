(function () {
  'use strict';
  if (!window.SS) {
    console.error('kasir.js: window.SS belum ada');
    return;
  }

  var _photoFile = null;
  var _CSRF = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

  /* ---- API helpers ---- */
  async function _apiForm(path, fd) {
    var res = await fetch(path, { method:'POST', headers:{'Accept':'application/json','X-CSRF-TOKEN':_CSRF}, body:fd });
    var d = await res.json().catch(function(){ return {}; });
    if (!res.ok) throw new Error(d.message || 'Error ' + res.status);
    return d;
  }
  async function _refreshDB() {
    // Bootstrap + dashboard sekaligus (bukan cuma bootstrap) supaya kalau admin
    // "Buka Kasir" lalu balik ke Dashboard/Laporan, angkanya sudah ikut jualan ini —
    // byUser/memberItems/yearly dibuang (bukan direfetch) sama seperti loadAll() di
    // app.js, layar terkait sudah tahu cara memuat ulang sendiri saat cache kosong.
    try {
      var r = await Promise.all([SS.api('/api/bootstrap'), SS.api('/api/dashboard')]);
      Object.assign(SS.DB, r[0], {dash:r[1]});
      SS.DB.byUser={}; SS.DB.memberItems={}; SS.DB.yearly={};
    } catch(e){}
  }

  /* ---- data ---- */
  function _myProds()  { var br=(SS.USER||{}).branch||''; return SS.DB.products.filter(function(p){ return p.cabang===br && p.stok>0; }); }
  function _allProds() { var br=(SS.USER||{}).branch||''; return SS.DB.products.filter(function(p){ return p.cabang===br; }); }
  function _filtered() {
    var q=(SS.S.k_q||'').trim().toLowerCase(), cat=SS.S.k_cat||'Semua';
    return _myProds().filter(function(p){
      if(cat!=='Semua'&&p.kategori!==cat) return false;
      if(q&&!( p.name.toLowerCase().includes(q)||(p.varian||'').toLowerCase().includes(q)||(p.barcode||'').includes(q) )) return false;
      return true;
    });
  }

  /* ---- cart ---- */
  var _cart  = function(){ return SS.S.k_cart||[]; };
  var _total = function(){ return _cart().reduce(function(s,i){ return s+i.harga*i.qty; },0); };
  var _count = function(){ return _cart().reduce(function(s,i){ return s+i.qty; },0); };

  function _addToCart(prod) {
    var cart=_cart().slice(), idx=cart.findIndex(function(i){ return i.id===prod.id; });
    if(idx>=0){ var it=Object.assign({},cart[idx]); if(it.qty>=prod.stok){ SS.flash('Stok '+prod.name+' hanya '+prod.stok+' pcs'); return; } it.qty++; cart[idx]=it; }
    else cart.push({id:prod.id,name:prod.name,varian:prod.varian||'-',harga:prod.harga,stok:prod.stok,qty:1});
    SS.setState({k_cart:cart});
  }
  function _removeFromCart(idx){ var c=_cart().slice(); c.splice(idx,1); SS.setState({k_cart:c}); }
  function _changeQty(idx,d){ var c=_cart().slice(),it=Object.assign({},c[idx]),n=it.qty+d; if(n<=0){_removeFromCart(idx);return;} if(n>it.stok){SS.flash('Stok tidak cukup');return;} it.qty=n; c[idx]=it; SS.setState({k_cart:c}); }
  function _clearCart(){ SS.setState({k_cart:[],k_cash:'',k_tname:'',k_tdue:'',k_panel:'catalog',k_saving:false,k_pay:'tunai'}); }

  /* ================================================================
   * SCAN — custom event dari app.js
   * ================================================================ */
  document.addEventListener('k-scan-result', function(e) {
    var code=e.detail.code, mode=e.detail.mode;
    if(mode==='out') {
      var p=_myProds().find(function(x){ return x.barcode===code; });
      if(!p){ SS.flash('Barcode '+code+' tidak ada di cabang ini'); return; }
      _addToCart(p); SS.flash('\u2713 '+p.name+' masuk keranjang');
    }
    if(mode==='in') {
      var p2=_allProds().find(function(x){ return x.barcode===code; });
      if(!p2){ SS.flash('Barcode '+code+' tidak ada di cabang ini'); return; }
      SS.stopScanKasir(); SS.setState({k_restockId:p2.id, k_restockQty:''});
      SS.flash(p2.name+' ditemukan \u2014 masukkan jumlah stok');
    }
  });

  function _handleManualScan() {
    var code=(SS.S.k_scanManual||'').trim(), mode=SS.S.k_scanMode;
    if(!code||!mode) return;
    SS.setState({k_scanManual:''});
    document.dispatchEvent(new CustomEvent('k-scan-result',{detail:{code:code,mode:mode}}));
  }

  /* ---- restock save ---- */
  async function _saveRestock() {
    var qty=parseInt(SS.S.k_restockQty||'',10)||0;
    if(!qty){ SS.flash('Isi jumlah stok'); return; }
    var pid=SS.S.k_restockId; SS.setState({k_saving:true});
    try {
      await SS.saveRestockKasir(pid, qty); await _refreshDB();
      var p=SS.DB.products.find(function(x){ return x.id===pid; });
      SS.setState({k_saving:false, k_restockId:null, k_restockQty:''}); SS.flash('\u2713 Stok '+(p?p.name:'')+' +'+qty+' pcs');
    } catch(err){ SS.setState({k_saving:false}); SS.flash(err.message); }
  }

  /* ---- save transaction ---- */
  async function _saveTrx() {
    var cart=_cart(); if(!cart.length){ SS.flash('Keranjang kosong'); return; }
    var method=SS.S.k_pay||'tunai', total=_total();
    if(method==='tunai'){ var cash=parseInt((SS.S.k_cash||'').replace(/\D/g,''),10)||0; if(cash<total){ SS.flash('Pembayaran kurang'); return; } }
    if(method==='tempo'){ if(!(SS.S.k_tname||'').trim()){ SS.flash('Isi nama pelanggan'); return; } if(!SS.S.k_tdue){ SS.flash('Isi jatuh tempo'); return; } }
    SS.setState({k_saving:true});
    try {
      await SS.api('/api/transactions','POST',{
        items:cart.map(function(i){ return {product_id:i.id,qty:i.qty,price:i.harga}; }),
        method:method,
        cash:method==='tunai'?(parseInt((SS.S.k_cash||'').replace(/\D/g,''),10)||0):null,
        customer_name:method==='tempo'?(SS.S.k_tname||'').trim():null,
        due_date:method==='tempo'?(SS.S.k_tdue||null):null,
      });
      await _refreshDB(); _clearCart(); SS.flash('\u2713 Transaksi berhasil!');
    } catch(err){ SS.setState({k_saving:false}); SS.flash(err.message); }
  }

  /* ---- save product ---- */

  function _setupPhotoInput(){ var el=document.getElementById('k-photo-input'); if(!el||el._kb) return; el._kb=true; el.addEventListener('change',function(){ _photoFile=(el.files&&el.files[0])?el.files[0]:null; var l=document.getElementById('k-photo-label'); if(l) l.textContent=_photoFile?_photoFile.name:'Ketuk untuk pilih foto'; }); }
  async function _saveProd() {
    var name=(SS.S.k_pname||'').trim(), harga=parseInt((SS.S.k_pharga||'').replace(/\D/g,''),10);
    if(!name){ SS.flash('Isi nama produk'); return; } if(!harga){ SS.flash('Isi harga'); return; }
    var branch=(SS.USER||{}).branch||''; SS.setState({k_saving:true});
    try {
      var fd=new FormData();
      fd.append('name',name); fd.append('varian',(SS.S.k_pvarian||'').trim()||'-');
      fd.append('harga',harga); fd.append('modal',parseInt((SS.S.k_pmodal||'').replace(/\D/g,''),10)||0);
      fd.append('kategori',SS.S.k_pkat||'Protein'); fd.append('barcode',SS.S.k_pbarcode||'');
      fd.append('stok',parseInt(SS.S.k_pstok||0,10)||0); fd.append('exp',SS.S.k_pexp||'');
      fd.append('branch',branch); fd.append('custom','1');
      if(_photoFile) fd.append('photo',_photoFile);
      await _apiForm('/api/products',fd); await _refreshDB(); _photoFile=null;
      SS.setState({k_saving:false,k_addProd:false,k_pname:'',k_pvarian:'',k_pharga:'',k_pmodal:'',k_pkat:'Protein',k_pbarcode:'',k_pstok:'',k_pexp:''});
      SS.flash('Produk ditambahkan \u2713');
    } catch(err){ SS.setState({k_saving:false}); SS.flash(err.message); }
  }

  /* ================================================================
   * HTML helpers
   * ================================================================ */
  function _chip(on,lbl,fn){ return '<button '+SS.A(fn)+' style="flex:none;white-space:nowrap;height:30px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid '+(on?'var(--gold)':'var(--border)')+';background:'+(on?'var(--goldtint2)':'var(--surface2)')+';color:'+(on?'var(--gold)':'var(--muted)')+';">'+SS.esc(lbl)+'</button>'; }
  function _lbl(t){ return '<div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-bottom:7px;">'+t+'</div>'; }
  function _fld(lbl,inp){ return '<div style="margin-bottom:13px;">'+_lbl(lbl)+inp+'</div>'; }
  function _inp(id,val,fn,ex){ return '<input id="'+id+'" value="'+SS.esc(val||'')+'" '+SS.I(fn)+' '+(ex||'')+' style="width:100%;height:44px;border-radius:11px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;padding:0 13px;outline:none;">'; }

  /* ================================================================
   * MODAL: SCAN KAMERA
   * ================================================================ */
  function _scanModalHtml() {
    var mode=SS.S.k_scanMode, isOut=mode==='out';
    var mc=isOut?'var(--ok,#50c864)':'var(--gold)';
    var mb=isOut?'rgba(80,200,100,.08)':'var(--goldtint)';
    var mbd=isOut?'rgba(80,200,100,.3)':'var(--goldborder)';
    var lbl=isOut?'Scan Keluar (Transaksi)':'Scan Masuk (Tambah Stok)';
    var desc=isOut?'Scan barcode untuk menambah produk ke keranjang. Kamera tetap aktif untuk scan beberapa produk.':'Scan barcode untuk menambah stok produk ke database.';
    var scanMsg=SS.S.k_scanMsg||'';
    var devices=SS.S.k_scanDevices||[], devId=SS.S.k_scanDeviceId;
    var manual=SS.S.k_scanManual||'';

    var camArea = scanMsg
      ? '<div style="position:relative;z-index:2;max-width:300px;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;font-size:13px;color:var(--text2);line-height:1.55;">'+SS.esc(scanMsg)+'</div>'
      : '<div style="position:relative;z-index:2;width:200px;height:200px;border-radius:16px;border:2px solid '+mc+';">'
        +'<i style="position:absolute;left:5%;right:5%;height:2px;top:50%;background:'+mc+';box-shadow:0 0 10px '+mc+';animation:ssScan 1.8s ease-in-out infinite alternate;"></i>'
        +'<span style="position:absolute;top:7px;left:7px;width:20px;height:20px;border-top:3px solid '+mc+';border-left:3px solid '+mc+';border-radius:5px 0 0 0;"></span>'
        +'<span style="position:absolute;top:7px;right:7px;width:20px;height:20px;border-top:3px solid '+mc+';border-right:3px solid '+mc+';border-radius:0 5px 0 0;"></span>'
        +'<span style="position:absolute;bottom:7px;left:7px;width:20px;height:20px;border-bottom:3px solid '+mc+';border-left:3px solid '+mc+';border-radius:0 0 0 5px;"></span>'
        +'<span style="position:absolute;bottom:7px;right:7px;width:20px;height:20px;border-bottom:3px solid '+mc+';border-right:3px solid '+mc+';border-radius:0 0 5px 0;"></span>'
        +'</div>'
        +'<div style="position:absolute;bottom:12px;left:0;right:0;z-index:2;text-align:center;font-size:12.5px;color:rgba(255,255,255,.8);text-shadow:0 1px 6px rgba(0,0,0,.8);">Arahkan kamera ke barcode produk</div>';

    var devSel = devices.length>1
      ? '<select '+SS.I(function(e){ SS.changeScanDeviceKasir(e.target.value); })+' style="height:34px;max-width:130px;border-radius:9px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:11px;padding:0 7px;outline:none;">'
        +devices.map(function(d,i){ return '<option value="'+SS.esc(d.deviceId)+'"'+(d.deviceId===devId?' selected':'')+'>'+SS.esc(d.label||'Kamera '+(i+1))+'</option>'; }).join('')
        +'</select>'
      : '';

    var cnt=_count();
    var footer = isOut
      ? '<div style="display:flex;gap:8px;margin-top:12px;">'
          +'<div style="flex:1;height:44px;border-radius:11px;background:'+mb+';border:1px solid '+mbd+';display:flex;align-items:center;justify-content:center;"><span style="font-size:13px;font-weight:700;color:'+mc+';">'+(cnt>0?cnt+' item di keranjang':'Keranjang kosong')+'</span></div>'
          +'<button '+SS.A(function(){ SS.stopScanKasir(); SS.setState({k_panel:'cart'}); })+' style="flex:none;height:44px;padding:0 16px;border-radius:11px;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;border:none;font-weight:800;font-size:12.5px;cursor:pointer;">Selesai &rsaquo;</button>'
        +'</div>'
      : '';

    return '<div '+SS.A(function(){ SS.stopScanKasir(); })+' style="position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:200;"></div>'
      +'<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:201;width:min(460px,calc(100vw - 24px));background:var(--panel);border:1px solid var(--border);border-radius:22px;overflow:hidden;box-shadow:0 30px 80px -15px rgba(0,0,0,.85);">'
        // header
        +'<div style="padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid var(--divider);">'
          +'<div><div style="font-family:Saira,sans-serif;font-weight:800;font-size:16px;">'+SS.esc(lbl)+'</div>'
          +'<div style="font-size:11.5px;color:var(--muted);margin-top:2px;max-width:280px;line-height:1.4;">'+desc+'</div></div>'
          +'<div style="display:flex;align-items:center;gap:7px;flex:none;">'+devSel
            +'<button '+SS.A(function(){ SS.stopScanKasir(); })+' style="background:var(--surface2);border:1px solid var(--border);color:var(--text);width:36px;height:36px;border-radius:10px;cursor:pointer;font-size:19px;line-height:1;">&times;</button>'
          +'</div>'
        +'</div>'
        // mode badge
        +'<div style="margin:12px 18px 0;padding:8px 12px;background:'+mb+';border:1px solid '+mbd+';border-radius:10px;display:flex;align-items:center;gap:8px;">'
          +'<div style="width:8px;height:8px;border-radius:50%;background:'+mc+';flex:none;box-shadow:0 0 6px '+mc+';"></div>'
          +'<span style="font-size:12px;font-weight:600;color:'+mc+';">'
            +(isOut?'Mode Keluar: produk masuk keranjang otomatis':'Mode Masuk: stok bertambah ke database')
          +'</span>'
        +'</div>'
        // kamera
        +'<div style="height:270px;position:relative;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 45%,#1e1e28,var(--bg));overflow:hidden;margin:12px 18px;border-radius:14px;">'
          +'<video id="k-scan-video" autoplay playsinline muted style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:14px;"></video>'
          +camArea
        +'</div>'
        // manual input
        +'<div style="padding:4px 18px 18px;">'
          +_lbl('Atau ketik nomor barcode manual')
          +'<div style="display:flex;gap:8px;margin-top:6px;">'
            +'<input id="k-scan-manual" value="'+SS.esc(manual)+'" '+SS.I(function(e){ SS.setState({k_scanManual:e.target.value}); })+' inputmode="numeric" placeholder="cnt. 8991234500017" style="flex:1;height:46px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;letter-spacing:.06em;padding:0 14px;outline:none;">'
            +'<button '+SS.A(_handleManualScan)+' style="flex:none;height:46px;padding:0 16px;border-radius:12px;border:none;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-weight:800;font-size:12.5px;cursor:pointer;">GUNAKAN</button>'
          +'</div>'
          +footer
        +'</div>'
      +'</div>';
  }

  /* ================================================================
   * MODAL: RESTOCK QTY (setelah scan masuk)
   * ================================================================ */
  function _restockModalHtml() {
    var pid=SS.S.k_restockId, p=SS.DB.products.find(function(x){ return x.id===pid; }), saving=!!SS.S.k_saving;
    if(!p) return '';
    var newStok=p.stok+(parseInt(SS.S.k_restockQty)||0);
    return '<div '+SS.A(function(){ SS.setState({k_restockId:null,k_restockQty:''}); })+' style="position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:200;"></div>'
      +'<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:201;width:min(400px,calc(100vw - 32px));background:var(--panel);border:1px solid var(--border);border-radius:20px;padding:24px;box-shadow:0 30px 80px -15px rgba(0,0,0,.85);">'
        +'<div style="font-family:Saira,sans-serif;font-weight:800;font-size:18px;margin-bottom:4px;">Tambah Stok Produk</div>'
        +'<div style="font-size:13px;color:var(--muted);margin-bottom:18px;">via Scan Masuk</div>'
        +'<div style="background:var(--surface2);border:1px solid var(--border);border-radius:13px;padding:13px 15px;margin-bottom:18px;">'
          +'<div style="font-size:14px;font-weight:600;">'+SS.esc(p.name)+'</div>'
          +'<div style="font-size:12px;color:var(--muted);margin-top:2px;">'+SS.esc(p.varian||'-')+' &middot; '+SS.esc(p.kategori||'')+'</div>'
          +'<div style="margin-top:8px;display:flex;align-items:center;gap:8px;">'
            +'<span style="font-size:11.5px;color:var(--muted);">Stok saat ini:</span>'
            +'<span style="font-family:Saira,sans-serif;font-weight:700;font-size:15px;color:'+(p.stok<=5?'var(--warn)':'var(--ok)')+' ;">'+p.stok+' pcs</span>'
          +'</div>'
        +'</div>'
        +_fld('Jumlah Stok Ditambahkan',
          '<input id="k-restock-qty" value="'+SS.esc(SS.S.k_restockQty||'')+'" '+SS.I(function(e){ SS.setState({k_restockQty:e.target.value.replace(/\D/g,'')}); })+' type="text" inputmode="numeric" placeholder="Masukkan jumlah..." style="width:100%;height:50px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:20px;padding:0 15px;outline:none;font-family:Saira,sans-serif;font-weight:700;text-align:center;">')
        +(SS.S.k_restockQty?'<div style="background:var(--goldtint);border:1px solid var(--goldborder);border-radius:10px;padding:10px 14px;margin-bottom:14px;text-align:center;"><span style="font-size:13px;color:var(--gold);font-weight:600;">Stok akan menjadi <b>'+newStok+' pcs</b></span></div>':'')
        +'<div style="display:flex;gap:10px;">'
          +'<button '+SS.A(function(){ SS.setState({k_restockId:null,k_restockQty:''}); })+' style="flex:none;width:100px;height:48px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;">Batal</button>'
          +'<button '+SS.A(_saveRestock)+(saving?' disabled':'')+' class="fx-press" style="flex:1;height:48px;border-radius:12px;border:none;background:'+(saving?'var(--border)':'linear-gradient(180deg,var(--goldhi),var(--gold))')+';color:'+(saving?'var(--muted)':'#161208')+';font-family:Saira,sans-serif;font-weight:800;font-size:14px;cursor:'+(saving?'not-allowed':'pointer')+';">'+(saving?'Menyimpan...':'SIMPAN STOK')+'</button>'
        +'</div>'
      +'</div>';
  }

  /* ================================================================
   * KATALOG
   * ================================================================ */
  function _catalogHtml(isDesktop) {
    var prods=_filtered(), cats=['Semua'].concat(SS.DB.categories.map(function(c){ return c.name; }));
    var q=SS.S.k_q||'', cat=SS.S.k_cat||'Semua', cols=isDesktop?'160px':'148px';
    var chips=cats.map(function(c){ return _chip(cat===c,c,function(){ SS.setState({k_cat:c}); }); }).join('');
    var grid=prods.length===0
      ?'<div style="text-align:center;padding:60px 20px;color:var(--dim2);"><div style="font-size:42px;margin-bottom:14px;">&#128230;</div><div style="font-size:14px;">'+(q||cat!=='Semua'?'Tidak ada produk yang cocok':'Belum ada produk di cabang ini')+'</div>'+(q||cat!=='Semua'?'<button '+SS.A(function(){ SS.setState({k_q:'',k_cat:'Semua'}); })+' style="margin-top:12px;background:none;border:1px solid var(--border);color:var(--muted);border-radius:9px;padding:7px 16px;cursor:pointer;font-size:12.5px;">Reset filter</button>':'')+'</div>'
      :'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax('+cols+',1fr));gap:10px;">'+prods.map(_prodCard).join('')+'</div>';
    return '<div style="display:flex;flex-direction:column;height:100%;min-height:0;">'
      +'<div style="flex:none;padding:10px 14px 8px;border-bottom:1px solid var(--divider);">'
        +'<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">'
          +'<div style="flex:1;position:relative;">'
            +'<svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);" width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="var(--dim)" stroke-width="1.8"></circle><path d="M16 16l4 4" stroke="var(--dim)" stroke-width="1.8" stroke-linecap="round"></path></svg>'
            +'<input id="k-search" value="'+SS.esc(q)+'" '+SS.I(function(e){ SS.setState({k_q:e.target.value}); })+' placeholder="Cari nama produk atau barcode\u2026" style="width:100%;height:38px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;padding:0 12px 0 33px;outline:none;">'
          +'</div>'
        +'</div>'
        +'<div style="display:flex;gap:5px;overflow-x:auto;padding-bottom:2px;">'+chips+'</div>'
      +'</div>'
      +'<div class="scrl" style="flex:1;overflow-y:auto;padding:10px 12px 16px;">'+grid+'</div>'
    +'</div>';
  }

  function _prodCard(p) {
    var inCart=_cart().find(function(i){ return i.id===p.id; }), low=p.stok<=5;
    return '<div style="background:var(--surface);border:1px solid var(--border2);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;">'
      +(p.photo?'<img src="'+SS.esc(p.photo)+'" alt="'+SS.esc(p.name)+'" style="width:100%;height:94px;object-fit:cover;display:block;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">':'')
      +'<div style="width:100%;height:94px;background:var(--goldtint);display:'+(p.photo?'none':'flex')+';align-items:center;justify-content:center;">'+SS.ic('produk','var(--gold)',28)+'</div>'
      +'<div style="padding:9px 10px 10px;flex:1;display:flex;flex-direction:column;gap:3px;">'
        +'<div style="font-size:12px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">'+SS.esc(p.name)+'</div>'
        +'<div style="font-size:10.5px;color:var(--muted);">'+SS.esc(p.varian||'-')+'</div>'
        +'<div style="font-family:\'Saira\',sans-serif;font-weight:700;font-size:14px;color:var(--gold);margin-top:3px;">'+SS.rp(p.harga)+'</div>'
        +'<div style="font-size:10px;color:'+(low?'var(--warn)':'var(--dim)')+';">Stok: '+p.stok+(low?' \u26a0\ufe0f':'')+'</div>'
        +'<button '+SS.A(function(){ _addToCart(p); })+' class="fx-press" style="width:100%;height:30px;border-radius:8px;border:none;margin-top:5px;cursor:pointer;font-family:\'Saira\',sans-serif;font-weight:700;font-size:11.5px;background:'+(inCart?'var(--goldtint2)':'linear-gradient(180deg,var(--goldhi),var(--gold))')+';color:'+(inCart?'var(--gold)':'#161208')+';">'
          +(inCart?'&#10003; '+inCart.qty+' di keranjang':'+ Tambah')
        +'</button>'
      +'</div>'
    +'</div>';
  }

  /* ================================================================
   * KERANJANG
   * ================================================================ */
  function _cartHtml() {
    var cart=_cart(), total=_total(), empty=cart.length===0;
    return '<div style="display:flex;flex-direction:column;height:100%;min-height:0;">'
      +'<div style="flex:none;padding:13px 16px 11px;border-bottom:1px solid var(--divider);display:flex;justify-content:space-between;align-items:center;">'
        +'<div style="font-family:\'Saira\',sans-serif;font-weight:800;font-size:15px;">Keranjang</div>'
        +(!empty?'<button '+SS.A(function(){ SS.setState({k_cart:[]}); })+' style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:12px;padding:0;">Kosongkan</button>':'')
      +'</div>'
      +'<div class="scrl" style="flex:1;overflow-y:auto;padding:0 14px;">'
        +(empty?'<div style="text-align:center;padding:50px 20px;color:var(--dim2);"><div style="font-size:40px;margin-bottom:12px;">&#128722;</div><div style="font-size:13.5px;">Belum ada item di keranjang</div></div>':cart.map(_cartItem).join(''))
      +'</div>'
      +(!empty?'<div style="flex:none;padding:12px 14px;border-top:1px solid var(--divider);background:var(--panel);">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:11px;">'
          +'<span style="font-size:12.5px;color:var(--muted);">'+cart.length+' item &middot; '+_count()+' pcs</span>'
          +'<span style="font-family:\'Saira\',sans-serif;font-weight:900;font-size:21px;">'+SS.rp(total)+'</span>'
        +'</div>'
        +'<button '+SS.A(function(){ SS.setState({k_panel:'pay'}); })+' class="fx-press" style="width:100%;height:46px;border-radius:12px;border:none;background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;font-family:\'Saira\',sans-serif;font-weight:800;font-size:13.5px;letter-spacing:.04em;cursor:pointer;box-shadow:0 8px 20px -8px rgba(212,175,55,.5);">Lanjut ke Pembayaran &#8594;</button>'
      +'</div>':'')
    +'</div>';
  }

  function _cartItem(item, idx) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--divider);">'
      +'<div style="flex:1;min-width:0;">'
        +'<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+SS.esc(item.name)+'</div>'
        +'<div style="font-size:11px;color:var(--muted);">'+SS.esc(item.varian)+'</div>'
        +'<div style="font-size:12px;color:var(--gold);font-family:\'Saira\',sans-serif;font-weight:700;margin-top:2px;">'+SS.rp(item.harga)+'</div>'
      +'</div>'
      +'<div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:9px;overflow:hidden;flex:none;">'
        +'<button '+SS.A(function(){ _changeQty(idx,-1); })+' style="width:30px;height:30px;background:var(--surface2);border:none;cursor:pointer;font-size:17px;line-height:1;color:var(--text2);">&minus;</button>'
        +'<span style="width:30px;text-align:center;font-family:\'Saira\',sans-serif;font-weight:700;font-size:13px;">'+item.qty+'</span>'
        +'<button '+SS.A(function(){ _changeQty(idx,+1); })+' style="width:30px;height:30px;background:var(--surface2);border:none;cursor:pointer;font-size:17px;line-height:1;color:var(--text2);">+</button>'
      +'</div>'
      +'<div style="text-align:right;flex:none;min-width:72px;">'
        +'<div style="font-family:\'Saira\',sans-serif;font-weight:700;font-size:13px;">'+SS.rp(item.harga*item.qty)+'</div>'
        +'<button '+SS.A(function(){ _removeFromCart(idx); })+' style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--danger);padding:2px 0 0;">Hapus</button>'
      +'</div>'
    +'</div>';
  }

  /* ================================================================
   * PEMBAYARAN
   * ================================================================ */
  function _payHtml() {
    var cart=_cart(), total=_total(), method=SS.S.k_pay||'tunai';
    var cash=parseInt((SS.S.k_cash||'').replace(/\D/g,''),10)||0, change=cash-total, saving=!!SS.S.k_saving;
    function mb(k,l){ var on=method===k; return '<button '+SS.A(function(){ SS.setState({k_pay:k,k_cash:''}); })+' style="flex:1;height:44px;border-radius:11px;cursor:pointer;font-family:\'Saira\',sans-serif;font-weight:700;font-size:13px;border:1.5px solid '+(on?'var(--gold)':'var(--border)')+';background:'+(on?'var(--goldtint2)':'var(--surface2)')+';color:'+(on?'var(--gold)':'var(--muted)')+';">'+l+'</button>'; }
    var tunai=method==='tunai'
      ?_fld('Nominal Dibayar (Rp)','<input id="k-cash" value="'+SS.esc(SS.S.k_cash||'')+'" '+SS.I(function(e){ SS.setState({k_cash:e.target.value}); })+' type="text" inputmode="numeric" placeholder="Rp\u2026" style="width:100%;height:48px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:17px;padding:0 14px;outline:none;font-family:\'Saira\',sans-serif;font-weight:700;">')
        +(cash>0&&cash>=total?'<div style="background:var(--oktint);border:1px solid var(--okborder);border-radius:11px;padding:11px 14px;display:flex;justify-content:space-between;align-items:center;margin-top:-5px;margin-bottom:14px;"><span style="font-size:13px;color:var(--ok);font-weight:600;">Kembalian</span><span style="font-family:\'Saira\',sans-serif;font-weight:900;font-size:20px;color:var(--ok);">'+SS.rp(change)+'</span></div>':cash>0?'<div style="background:var(--dangertint);border:1px solid var(--dangerborder);border-radius:11px;padding:11px 14px;margin-top:-5px;margin-bottom:14px;"><span style="font-size:13px;color:var(--danger);">Kurang '+SS.rp(total-cash)+'</span></div>':'')
      :'';
    var mp=method==='marketplace'?'<div style="background:var(--infotint);border:1px solid rgba(122,167,255,.3);border-radius:12px;padding:14px;margin-bottom:14px;"><div style="font-size:13.5px;font-weight:600;color:var(--info);">Pembayaran via Marketplace</div><div style="font-size:12px;color:var(--muted);margin-top:5px;line-height:1.55;">Transaksi non-tunai. Tidak ada kembalian.</div></div>':'';
    var tempo=method==='tempo'
      ?_fld('Nama Pelanggan *','<input id="k-tname" value="'+SS.esc(SS.S.k_tname||'')+'" '+SS.I(function(e){ SS.setState({k_tname:e.target.value}); })+' placeholder="Nama pembeli\u2026" style="width:100%;height:44px;border-radius:11px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;padding:0 13px;outline:none;">')
        +_fld('Tanggal Jatuh Tempo *','<input id="k-tdue" value="'+SS.esc(SS.S.k_tdue||'')+'" '+SS.I(function(e){ SS.setState({k_tdue:e.target.value}); })+' type="date" style="width:100%;height:44px;border-radius:11px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;padding:0 13px;outline:none;">')
        +'<div style="background:var(--warntint);border:1px solid rgba(232,161,58,.3);border-radius:11px;padding:12px 14px;margin-top:-5px;margin-bottom:14px;display:flex;align-items:flex-start;gap:8px;">'+SS.ic('tempo','var(--warn)',14)+'<span style="font-size:12.5px;color:var(--warn);line-height:1.5;">Piutang senilai <b>'+SS.rp(total)+'</b> akan dibuat otomatis.</span></div>'
      :'';
    return '<div class="scrl" style="height:100%;overflow-y:auto;padding:14px 16px 30px;">'
      +'<button '+SS.A(function(){ SS.setState({k_panel:'cart'}); })+' style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:12.5px;padding:0;margin-bottom:14px;">&larr; Kembali ke Keranjang</button>'
      +'<div style="background:var(--surface);border:1px solid var(--border2);border-radius:14px;padding:13px 14px;margin-bottom:14px;">'
        +_lbl('Ringkasan '+cart.length+' item')
        +cart.map(function(i){ return '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;gap:8px;"><span style="color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+SS.esc(i.name)+' &times;'+i.qty+'</span><span style="font-weight:600;flex:none;">'+SS.rp(i.harga*i.qty)+'</span></div>'; }).join('')
        +'<div style="border-top:1px solid var(--divider);margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12.5px;color:var(--muted);">Total</span><span style="font-family:\'Saira\',sans-serif;font-weight:900;font-size:20px;color:var(--gold);">' + SS.rp(total) + '</span></div>'
      +'</div>'
      +_lbl('Metode Pembayaran')+'<div style="display:flex;gap:7px;margin-bottom:14px;">'+mb('tunai','Tunai')+mb('marketplace','Marketplace')+mb('tempo','Tempo')+'</div>'
      +tunai+mp+tempo
      +'<button '+SS.A(_saveTrx)+(saving?' disabled':'')+' class="fx-press" style="width:100%;height:52px;border-radius:14px;border:none;margin-top:4px;background:'+(saving?'var(--border)':'linear-gradient(180deg,var(--goldhi),var(--gold))')+';color:'+(saving?'var(--muted)':'#161208')+';font-family:\'Saira\',sans-serif;font-weight:800;font-size:15px;letter-spacing:.06em;cursor:'+(saving?'not-allowed':'pointer')+';">'+(saving?'Menyimpan...':'SIMPAN TRANSAKSI')+'</button>'
    +'</div>';
  }

  /* ---- TAMBAH PRODUK ---- */
  function _addProdHtml(){
    var saving=!!SS.S.k_saving, cats=SS.DB.categories.map(function(c){ return c.name; }), selCat=SS.S.k_pkat||(cats[0]||'Protein');
    return '<div class="scrl" style="height:100%;overflow-y:auto;padding:14px 16px 40px;">'
      +'<button '+SS.A(function(){ _photoFile=null; SS.setState({k_addProd:false}); })+' style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:12.5px;padding:0;margin-bottom:14px;">&larr; Kembali</button>'
      +'<div style="font-family:\'Saira\',sans-serif;font-weight:800;font-size:17px;margin-bottom:16px;">Tambah Produk Baru</div>'
      +_fld('Nama Produk *',_inp('k-pname',SS.S.k_pname,function(e){ SS.setState({k_pname:e.target.value}); },'placeholder="Nama produk..."'))
      +_fld('Varian / Rasa',_inp('k-pvarian',SS.S.k_pvarian,function(e){ SS.setState({k_pvarian:e.target.value}); },'placeholder="Cokelat, Vanila..."'))
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
        +_fld('Harga Jual (Rp) *',_inp('k-pharga',SS.S.k_pharga,function(e){ SS.setState({k_pharga:e.target.value}); },'placeholder="Rp..." type="text" inputmode="numeric"'))
        +_fld('Modal (Rp)',_inp('k-pmodal',SS.S.k_pmodal,function(e){ SS.setState({k_pmodal:e.target.value}); },'placeholder="Rp..." type="text" inputmode="numeric"'))
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
        +_fld('Stok Awal',_inp('k-pstok',SS.S.k_pstok,function(e){ SS.setState({k_pstok:e.target.value}); },'placeholder="0" type="text" inputmode="numeric"'))
        +_fld('Exp (YYYY-MM)',_inp('k-pexp',SS.S.k_pexp,function(e){ SS.setState({k_pexp:e.target.value}); },'placeholder="2026-12"'))
      +'</div>'
      +_fld('Barcode',_inp('k-pbarcode',SS.S.k_pbarcode,function(e){ SS.setState({k_pbarcode:e.target.value}); },'placeholder="Nomor barcode..."'))
      +'<div style="margin-bottom:13px;">'+_lbl('Kategori')
        +'<div style="display:flex;gap:6px;flex-wrap:wrap;">'+cats.map(function(c){ return _chip(selCat===c,c,function(){ SS.setState({k_pkat:c}); }); }).join('')+'</div>'
      +'</div>'
      +'<div style="margin-bottom:16px;">'+_lbl('Foto Produk')
        +'<label for="k-photo-input" style="display:flex;align-items:center;gap:10px;border:1.5px dashed var(--border);border-radius:12px;padding:13px 14px;cursor:pointer;background:var(--surface2);">'
          +'<div style="width:34px;height:34px;border-radius:9px;background:var(--goldtint);display:flex;align-items:center;justify-content:center;flex:none;">'+SS.ic('produk','var(--gold)',17)+'</div>'
          +'<span id="k-photo-label" style="font-size:12.5px;color:var(--dim);">'+(_photoFile?SS.esc(_photoFile.name):'Ketuk untuk pilih foto produk')+'</span>'
        +'</label>'
        +'<input id="k-photo-input" type="file" accept="image/jpeg,image/png,image/webp" style="display:none;">'
      +'</div>'
      +'<button '+SS.A(_saveProd)+(saving?' disabled':'')+' class="fx-press" style="width:100%;height:50px;border-radius:13px;border:none;background:'+(saving?'var(--border)':'linear-gradient(180deg,var(--goldhi),var(--gold))')+';color:'+(saving?'var(--muted)':'#161208')+';font-weight:800;font-size:14.5px;cursor:'+(saving?'not-allowed':'pointer')+';">'+(saving?'Menyimpan...':'SIMPAN PRODUK')+'</button>'
    +'</div>';
  }

  /* ---- HEADER ---- */
  function _headerHtml(V){
    var count=_count();
    var icoG='<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M6 12h12" stroke="var(--gold)" stroke-width="2" stroke-linecap="round"></path></svg>';
    var icoGr='<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M6 12h12" stroke="var(--ok,#50c864)" stroke-width="2" stroke-linecap="round"></path></svg>';
    return '<div style="flex:none;height:54px;border-bottom:1px solid var(--divider);display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:var(--panel);gap:8px;">'
      +'<div style="display:flex;align-items:center;gap:8px;min-width:0;">'
        +'<div style="font-family:\'Saira\',sans-serif;font-weight:800;font-size:16px;white-space:nowrap;">Kasir</div>'
        +'<div style="font-size:11.5px;color:var(--gold);background:var(--goldtint);border:1px solid var(--goldborder);border-radius:7px;padding:2px 9px;white-space:nowrap;font-weight:600;">'+SS.esc((SS.USER||{}).branch||'')+'</div>'
        +'<div style="font-size:12px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">&middot; '+SS.esc(V.who||'')+'</div>'
      +'</div>'
      +'<div style="display:flex;gap:5px;flex:none;align-items:center;">'
        +(count>0&&V.isMobile?'<div style="background:var(--gold);color:#161208;border-radius:20px;padding:2px 9px;font-family:\'Saira\',sans-serif;font-weight:800;font-size:12px;">'+count+'</div>':'')
        +'<button '+SS.A(function(){ SS.startScanKasir('in'); })+' title="Scan Masuk: tambah stok" style="height:34px;padding:0 10px;border-radius:9px;background:var(--goldtint);border:1px solid var(--goldborder);color:var(--gold);font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:5px;">'+icoG+'<span>&#9660; Masuk</span></button>'
        +'<button '+SS.A(function(){ SS.startScanKasir('out'); })+' title="Scan Keluar: ke keranjang" style="height:34px;padding:0 10px;border-radius:9px;background:rgba(80,200,100,.08);border:1px solid rgba(80,200,100,.35);color:var(--ok,#50c864);font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:5px;">'+icoGr+'<span>&#9650; Keluar</span></button>'
        +'<button '+SS.A(function(){ _photoFile=null; SS.setState({k_addProd:true,k_pname:'',k_pvarian:'',k_pharga:'',k_pmodal:'',k_pkat:(SS.DB.categories[0]||{}).name||'Protein',k_pbarcode:'',k_pstok:'',k_pexp:''}); })+' style="height:34px;padding:0 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">+ Produk</button>'
        +(V.isAdmin?'<button '+SS.A(V.goModeScreen)+' style="height:34px;padding:0 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:12px;cursor:pointer;white-space:nowrap;">Mode</button>':'')
        +'<button '+SS.A(V.openSettings)+' style="height:34px;width:34px;border-radius:9px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;">'+SS.ic('settings','var(--muted2)',16)+'</button>'
        +'<button '+SS.A(V.logout)+' style="height:34px;padding:0 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:12px;cursor:pointer;">Keluar</button>'
      +'</div>'
    +'</div>';
  }

  /* ---- RENDERER ---- */
  SS.registerCashier(function(V){
    var addProd=!!SS.S.k_addProd, panel=SS.S.k_panel||'catalog';
    var isDesktop=V.isDesktop, scanMode=SS.S.k_scanMode, restockId=SS.S.k_restockId;
    var scanModal=scanMode?_scanModalHtml():'';
    var restockModal=restockId?_restockModalHtml():'';
    if(addProd){ setTimeout(_setupPhotoInput,0); return '<div style="height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);">'+_headerHtml(V)+'<div style="flex:1;min-height:0;">'+_addProdHtml()+'</div></div>'+scanModal+restockModal; }
    if(isDesktop){ return '<div style="height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);">'+_headerHtml(V)+'<div style="flex:1;display:flex;min-height:0;overflow:hidden;"><div style="flex:1;min-width:0;border-right:1px solid var(--divider);">'+_catalogHtml(true)+'</div><div style="width:360px;flex:none;display:flex;flex-direction:column;min-height:0;">'+(panel==='pay'?_payHtml():_cartHtml())+'</div></div></div>'+scanModal+restockModal; }
    var count=_count(), tabs=[{key:'catalog',label:'Katalog'},{key:'cart',label:count>0?'Keranjang ('+count+')':'Keranjang'},{key:'pay',label:'Bayar'}];
    return '<div style="height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);">'+_headerHtml(V)
      +'<div style="flex:none;display:flex;border-bottom:1px solid var(--divider);background:var(--panel);">'+tabs.map(function(t){ return '<button '+SS.A(function(){ SS.setState({k_panel:t.key}); })+' style="flex:1;height:42px;border:none;cursor:pointer;font-family:\'Saira\',sans-serif;font-weight:700;font-size:12.5px;white-space:nowrap;background:'+(panel===t.key?'var(--goldtint)':'transparent')+';color:'+(panel===t.key?'var(--gold)':'var(--muted)')+';border-bottom:2px solid '+(panel===t.key?'var(--gold)':'transparent')+';">'+t.label+'</button>'; }).join('')+'</div>'
      +'<div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;">'+(panel==='catalog'?_catalogHtml(false):panel==='cart'?_cartHtml():_payHtml())+'</div>'
    +'</div>'+scanModal+restockModal;
  });

  /* ---- EVENTS ---- */
  document.addEventListener('keydown',function(e){ if(e.key==='Enter'&&e.target&&e.target.id==='k-scan-manual'){ e.preventDefault(); _handleManualScan(); } });
  document.addEventListener('keydown',function(e){ if(e.key==='Enter'&&e.target&&e.target.id==='k-search') e.preventDefault(); });

})();