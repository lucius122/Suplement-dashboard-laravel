/* ============================================================================
 * KASIR (POS) — Suplemen Semarang Store
 * Implementasi lengkap semua fitur kasir:
 *   1. Katalog produk per cabang (search, filter kategori)
 *   2. Keranjang belanja (add/remove/qty/total/validasi stok)
 *   3. Pembayaran tunai (kembalian realtime)
 *   4. Pembayaran marketplace
 *   5. Pembayaran tempo (nama + jatuh tempo + piutang otomatis)
 *   6. Simpan transaksi → POST /api/transactions
 *   7. Potong stok otomatis (di backend, DB::transaction)
 *   8. Tambah produk → POST /api/products + ImageUploadService
 *   9. Scan barcode (Enter pada input scan → addToCart)
 *  10. Layout responsif (desktop split | mobile tab)
 *
 * Runtime bersama yang disediakan app.js (window.SS):
 *   SS.A(fn)           → data-a="N"  (click handler)
 *   SS.I(fn)           → data-i="N"  (input handler)
 *   SS.setState({...}) → update state + re-render
 *   SS.S               → baca state saat ini
 *   SS.api(path, m, b) → fetch JSON + CSRF
 *   SS.flash(msg)      → toast notification
 *   SS.esc(str)        → HTML escape
 *   SS.rp(n)           → format Rupiah
 *   SS.ic(name,c,sz)   → SVG icon
 *   SS.DB.products     → [{id,name,varian,harga,stok,kategori,barcode,cabang,photo,...}]
 *   SS.DB.categories   → [{id,name}]
 *   SS.USER            → {name, role, branch}
 *   SS.go('mode'|...)  → navigasi layar
 *
 * State kasir menggunakan prefix k_ agar tidak konflik dengan state admin.
 * ============================================================================ */
(function () {
  'use strict';
  if (!window.SS) {
    console.error('kasir.js: window.SS belum ada \u2014 pastikan app.js dimuat lebih dulu.');
    return;
  }

  /* ================================================================
   * VARIABEL MODULE-LEVEL
   * Dipertahankan antar re-render karena tidak masuk SS.S
   * ================================================================ */
  let _photoFile = null; // File object untuk upload foto produk
  const _CSRF = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

  /* ================================================================
   * API HELPERS
   * ================================================================ */

  /** Upload produk dengan FormData (SS.api hanya mendukung JSON) */
  async function _apiForm(path, formData) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': _CSRF },
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Terjadi kesalahan (' + res.status + ')');
    return data;
  }

  /**
   * Refresh SS.DB setelah transaksi/tambah produk agar stok & data
   * terupdate tanpa reload halaman. loadAll() bersifat privat di app.js,
   * sehingga kita panggil endpoint /api/bootstrap langsung.
   */
  async function _refreshDB() {
    try {
      const boot = await SS.api('/api/bootstrap');
      Object.assign(SS.DB, boot);
      SS.DB.byUser  = {};        // buang cache laporan agar tidak stale
      SS.DB.memberItems = {};
    } catch (e) { /* gagal refresh tidak kritis, abaikan */ }
  }

  /* ================================================================
   * DATA HELPERS
   * ================================================================ */

  /** Produk milik cabang kasir yang masih punya stok */
  function _myProducts() {
    const branch = (SS.USER || {}).branch || '';
    return SS.DB.products.filter(p => p.cabang === branch && p.stok > 0);
  }

  /** Produk setelah filter pencarian dan kategori */
  function _filtered() {
    const q   = (SS.S.k_q || '').trim().toLowerCase();
    const cat = SS.S.k_cat || 'Semua';
    return _myProducts().filter(p => {
      if (cat !== 'Semua' && p.kategori !== cat) return false;
      if (q) {
        const hit = p.name.toLowerCase().includes(q)
          || (p.varian || '').toLowerCase().includes(q)
          || (p.barcode || '').includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }

  /* ================================================================
   * CART HELPERS
   * ================================================================ */

  const _cart  = () => SS.S.k_cart  || [];
  const _total = () => _cart().reduce((s, i) => s + i.harga * i.qty, 0);
  const _count = () => _cart().reduce((s, i) => s + i.qty, 0);

  function _addToCart(prod) {
    const cart = _cart().slice();
    const idx  = cart.findIndex(i => i.id === prod.id);
    if (idx >= 0) {
      const item = { ...cart[idx] };
      // Cek stok: qty di cart tidak boleh melebihi stok produk
      if (item.qty >= prod.stok) {
        SS.flash('Stok ' + prod.name + ' hanya ' + prod.stok + ' pcs');
        return;
      }
      item.qty++;
      cart[idx] = item;
    } else {
      cart.push({
        id: prod.id, name: prod.name, varian: prod.varian || '-',
        harga: prod.harga, stok: prod.stok, qty: 1,
      });
    }
    SS.setState({ k_cart: cart });
  }

  function _removeFromCart(idx) {
    const cart = _cart().slice();
    cart.splice(idx, 1);
    SS.setState({ k_cart: cart });
  }

  function _changeQty(idx, delta) {
    const cart    = _cart().slice();
    const item    = { ...cart[idx] };
    const newQty  = item.qty + delta;
    if (newQty <= 0)         { _removeFromCart(idx); return; }
    if (newQty > item.stok)  { SS.flash('Stok tidak cukup'); return; }
    item.qty = newQty;
    cart[idx] = item;
    SS.setState({ k_cart: cart });
  }

  function _clearCart() {
    SS.setState({
      k_cart: [], k_cash: '', k_tname: '', k_tdue: '',
      k_panel: 'catalog', k_saving: false, k_pay: 'tunai',
    });
  }

  /* ================================================================
   * SCAN BARCODE
   * ================================================================ */

  function _handleScan(barcode) {
    barcode = (barcode || '').trim();
    if (!barcode) return;
    const prod = _myProducts().find(p => p.barcode === barcode);
    if (prod) {
      _addToCart(prod);
    } else {
      SS.flash('Barcode tidak ditemukan: ' + barcode);
    }
    SS.setState({ k_scanInput: '' });
  }

  /* ================================================================
   * SIMPAN TRANSAKSI
   * ================================================================ */

  async function _saveTransaction() {
    const cart   = _cart();
    if (!cart.length) { SS.flash('Keranjang masih kosong'); return; }

    const method = SS.S.k_pay || 'tunai';
    const total  = _total();

    // Validasi frontend sebelum kirim ke backend
    if (method === 'tunai') {
      const cash = parseInt((SS.S.k_cash || '').replace(/\D/g, ''), 10) || 0;
      if (cash < total) { SS.flash('Nominal pembayaran kurang dari total'); return; }
    }
    if (method === 'tempo') {
      if (!(SS.S.k_tname || '').trim()) { SS.flash('Isi nama pelanggan terlebih dahulu'); return; }
      if (!(SS.S.k_tdue  || ''))        { SS.flash('Isi tanggal jatuh tempo terlebih dahulu'); return; }
    }

    SS.setState({ k_saving: true });
    try {
      await SS.api('/api/transactions', 'POST', {
        items: cart.map(i => ({ product_id: i.id, qty: i.qty, price: i.harga })),
        method,
        cash:          method === 'tunai' ? (parseInt((SS.S.k_cash  || '').replace(/\D/g, ''), 10) || 0) : null,
        customer_name: method === 'tempo' ? (SS.S.k_tname || '').trim() : null,
        due_date:      method === 'tempo' ? (SS.S.k_tdue  || null)      : null,
      });
      // Refresh data agar stok di katalog dan dashboard terupdate
      await _refreshDB();
      _clearCart();
      SS.flash('\u2713 Transaksi berhasil disimpan!');
    } catch (e) {
      SS.setState({ k_saving: false });
      SS.flash(e.message);
    }
  }

  /* ================================================================
   * TAMBAH PRODUK DARI KASIR
   * ================================================================ */

  /** Pasang event listener pada input file setelah render */
  function _setupPhotoInput() {
    const el = document.getElementById('k-photo-input');
    if (!el || el._kBound) return;
    el._kBound = true;
    el.addEventListener('change', () => {
      _photoFile = (el.files && el.files[0]) ? el.files[0] : null;
      const lbl = document.getElementById('k-photo-label');
      if (lbl) lbl.textContent = _photoFile ? _photoFile.name : 'Ketuk untuk pilih foto produk';
    });
  }

  async function _saveProduct() {
    const name  = (SS.S.k_pname  || '').trim();
    const harga = parseInt((SS.S.k_pharga || '').replace(/\D/g, ''), 10);

    if (!name)  { SS.flash('Isi nama produk terlebih dahulu'); return; }
    if (!harga) { SS.flash('Isi harga jual produk'); return; }

    const branch = (SS.USER || {}).branch || '';

    SS.setState({ k_saving: true });
    try {
      const fd = new FormData();
      fd.append('name',     name);
      fd.append('varian',   (SS.S.k_pvarian || '').trim() || '-');
      fd.append('harga',    harga);
      fd.append('modal',    parseInt((SS.S.k_pmodal || '').replace(/\D/g, ''), 10) || 0);
      fd.append('kategori', SS.S.k_pkat || 'Protein');
      fd.append('barcode',  SS.S.k_pbarcode || '');
      fd.append('stok',     parseInt(SS.S.k_pstok  || 0, 10) || 0);
      fd.append('exp',      SS.S.k_pexp || '');
      fd.append('branch',   branch);
      fd.append('custom',   '1');
      if (_photoFile) fd.append('photo', _photoFile);

      await _apiForm('/api/products', fd);
      await _refreshDB();
      _photoFile = null;
      SS.setState({
        k_saving: false, k_addProd: false,
        k_pname: '', k_pvarian: '', k_pharga: '', k_pmodal: '',
        k_pkat: 'Protein', k_pbarcode: '', k_pstok: '', k_pexp: '',
      });
      SS.flash('Produk berhasil ditambahkan \u2713');
    } catch (e) {
      SS.setState({ k_saving: false });
      SS.flash(e.message);
    }
  }

  /* ================================================================
   * HTML HELPERS (reusable micro-components)
   * ================================================================ */

  /** Filter chip button */
  function _chip(active, label, handler) {
    return `<button ${SS.A(handler)} style="flex:none;white-space:nowrap;height:30px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;
      border:1px solid ${active ? 'var(--gold)' : 'var(--border)'};
      background:${active ? 'var(--goldtint2)' : 'var(--surface2)'};
      color:${active ? 'var(--gold)' : 'var(--muted)'};">${SS.esc(label)}</button>`;
  }

  /** Label form field */
  function _lbl(text) {
    return `<div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-family:'Saira',sans-serif;font-weight:600;margin-bottom:7px;">${text}</div>`;
  }

  /** Wrapper form field dengan label */
  function _field(label, inputHtml) {
    return `<div style="margin-bottom:13px;">${_lbl(label)}${inputHtml}</div>`;
  }

  /** Input teks standar */
  function _inp(id, val, handler, extra) {
    return `<input id="${id}" value="${SS.esc(val || '')}" ${SS.I(handler)} ${extra || ''}
      style="width:100%;height:44px;border-radius:11px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;padding:0 13px;outline:none;font-family:'Hanken Grotesk',sans-serif;">`;
  }

  /* ================================================================
   * PANEL: KATALOG PRODUK
   * ================================================================ */

  function _catalogHtml(isDesktop) {
    const prods = _filtered();
    const cats  = ['Semua', ...SS.DB.categories.map(c => c.name)];
    const q     = SS.S.k_q   || '';
    const cat   = SS.S.k_cat || 'Semua';
    const cols  = isDesktop ? '160px' : '148px';

    return `
      <div style="display:flex;flex-direction:column;height:100%;min-height:0;">

        <!-- Search bar + barcode input -->
        <div style="flex:none;padding:10px 14px 8px;border-bottom:1px solid var(--divider);">
          <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
            <div style="flex:1;position:relative;">
              <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);" width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="6.5" stroke="var(--dim)" stroke-width="1.8"></circle>
                <path d="M16 16l4 4" stroke="var(--dim)" stroke-width="1.8" stroke-linecap="round"></path>
              </svg>
              <input id="k-search" value="${SS.esc(q)}" ${SS.I(e => SS.setState({ k_q: e.target.value }))}
                placeholder="Cari nama produk atau barcode\u2026"
                style="width:100%;height:38px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;padding:0 12px 0 33px;outline:none;font-family:'Hanken Grotesk',sans-serif;">
            </div>
            <!-- Barcode scan input: scan barcode lalu tekan Enter -->
            <div style="flex:none;" title="Scan barcode lalu tekan Enter">
              <input id="k-barcode" value="${SS.esc(SS.S.k_scanInput || '')}"
                ${SS.I(e => SS.setState({ k_scanInput: e.target.value }))}
                placeholder="Scan\u2026"
                style="width:82px;height:38px;border-radius:10px;border:1.5px solid var(--goldborder);background:var(--goldtint);color:var(--text);font-size:12.5px;padding:0 9px;outline:none;font-family:'Hanken Grotesk',sans-serif;letter-spacing:.02em;">
            </div>
          </div>
          <!-- Category chips -->
          <div style="display:flex;gap:5px;overflow-x:auto;padding-bottom:2px;">
            ${cats.map(c => _chip(cat === c, c, () => SS.setState({ k_cat: c }))).join('')}
          </div>
        </div>

        <!-- Product grid -->
        <div class="scrl" style="flex:1;overflow-y:auto;padding:10px 12px 16px;">
          ${prods.length === 0
            ? `<div style="text-align:center;padding:60px 20px;color:var(--dim2);">
                <div style="font-size:42px;margin-bottom:14px;">&#128230;</div>
                <div style="font-size:14px;font-family:'Hanken Grotesk',sans-serif;font-weight:500;">
                  ${q || cat !== 'Semua' ? 'Tidak ada produk yang cocok' : 'Belum ada produk di cabang ini'}
                </div>
                ${q || cat !== 'Semua' ? `<button ${SS.A(() => SS.setState({ k_q: '', k_cat: 'Semua' }))}
                  style="margin-top:12px;background:none;border:1px solid var(--border);color:var(--muted);border-radius:9px;padding:7px 16px;cursor:pointer;font-size:12.5px;font-family:'Hanken Grotesk',sans-serif;">
                  Reset filter</button>` : ''}
              </div>`
            : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(${cols},1fr));gap:10px;">
                ${prods.map(_productCard).join('')}
              </div>`}
        </div>
      </div>`;
  }

  function _productCard(p) {
    const inCart  = _cart().find(i => i.id === p.id);
    const lowStok = p.stok <= 5;
    return `
      <div style="background:var(--surface);border:1px solid var(--border2);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;">
        ${p.photo
          ? `<img src="${SS.esc(p.photo)}" alt="${SS.esc(p.name)}"
              style="width:100%;height:94px;object-fit:cover;display:block;"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
          : ''}
        <div style="width:100%;height:94px;background:var(--goldtint);display:${p.photo ? 'none' : 'flex'};align-items:center;justify-content:center;">
          ${SS.ic('produk', 'var(--gold)', 28)}
        </div>
        <div style="padding:9px 10px 10px;flex:1;display:flex;flex-direction:column;gap:3px;">
          <div style="font-size:12px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${SS.esc(p.name)}</div>
          <div style="font-size:10.5px;color:var(--muted);">${SS.esc(p.varian || '-')}</div>
          <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:14px;color:var(--gold);margin-top:3px;">${SS.rp(p.harga)}</div>
          <div style="font-size:10px;color:${lowStok ? 'var(--warn)' : 'var(--dim)'};">
            Stok: ${p.stok}${lowStok ? ' \u26a0\ufe0f' : ''}
          </div>
          <button ${SS.A(() => _addToCart(p))} class="fx-press"
            style="width:100%;height:30px;border-radius:8px;border:none;margin-top:5px;cursor:pointer;
            font-family:'Saira',sans-serif;font-weight:700;font-size:11.5px;letter-spacing:.02em;
            background:${inCart ? 'var(--goldtint2)' : 'linear-gradient(180deg,var(--goldhi),var(--gold))'};
            color:${inCart ? 'var(--gold)' : '#161208'};">
            ${inCart ? `&#10003; ${inCart.qty} di keranjang` : '+ Tambah'}
          </button>
        </div>
      </div>`;
  }

  /* ================================================================
   * PANEL: KERANJANG BELANJA
   * ================================================================ */

  function _cartHtml() {
    const cart  = _cart();
    const total = _total();
    const empty = cart.length === 0;

    return `
      <div style="display:flex;flex-direction:column;height:100%;min-height:0;">
        <div style="flex:none;padding:13px 16px 11px;border-bottom:1px solid var(--divider);display:flex;justify-content:space-between;align-items:center;">
          <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:15px;">Keranjang</div>
          ${!empty ? `<button ${SS.A(() => SS.setState({ k_cart: [] }))}
            style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:12px;font-family:'Hanken Grotesk',sans-serif;padding:0;">
            Kosongkan
          </button>` : ''}
        </div>

        <div class="scrl" style="flex:1;overflow-y:auto;padding:0 14px;">
          ${empty
            ? `<div style="text-align:center;padding:50px 20px;color:var(--dim2);">
                <div style="font-size:40px;margin-bottom:12px;">&#128722;</div>
                <div style="font-size:13.5px;font-family:'Hanken Grotesk',sans-serif;">Belum ada item di keranjang</div>
                <div style="font-size:12px;color:var(--dim2);margin-top:6px;">Pilih produk dari katalog</div>
              </div>`
            : cart.map(_cartItem).join('')}
        </div>

        ${!empty ? `
          <div style="flex:none;padding:12px 14px;border-top:1px solid var(--divider);background:var(--panel);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:11px;">
              <span style="font-size:12.5px;color:var(--muted);">${cart.length} item &middot; ${_count()} pcs</span>
              <span style="font-family:'Saira',sans-serif;font-weight:900;font-size:21px;">${SS.rp(total)}</span>
            </div>
            <button ${SS.A(() => SS.setState({ k_panel: 'pay' }))} class="fx-press"
              style="width:100%;height:46px;border-radius:12px;border:none;
              background:linear-gradient(180deg,var(--goldhi),var(--gold));color:#161208;
              font-family:'Saira',sans-serif;font-weight:800;font-size:13.5px;letter-spacing:.04em;cursor:pointer;
              box-shadow:0 8px 20px -8px rgba(212,175,55,.5);">
              Lanjut ke Pembayaran \u2192
            </button>
          </div>` : ''}
      </div>`;
  }

  function _cartItem(item, idx) {
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--divider);">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${SS.esc(item.name)}</div>
          <div style="font-size:11px;color:var(--muted);">${SS.esc(item.varian)}</div>
          <div style="font-size:12px;color:var(--gold);font-family:'Saira',sans-serif;font-weight:700;margin-top:2px;">${SS.rp(item.harga)}</div>
        </div>
        <!-- Quantity control -->
        <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:9px;overflow:hidden;flex:none;">
          <button ${SS.A(() => _changeQty(idx, -1))}
            style="width:30px;height:30px;background:var(--surface2);border:none;cursor:pointer;font-size:17px;line-height:1;color:var(--text2);">&minus;</button>
          <span style="width:30px;text-align:center;font-family:'Saira',sans-serif;font-weight:700;font-size:13px;">${item.qty}</span>
          <button ${SS.A(() => _changeQty(idx, +1))}
            style="width:30px;height:30px;background:var(--surface2);border:none;cursor:pointer;font-size:17px;line-height:1;color:var(--text2);">+</button>
        </div>
        <!-- Subtotal + hapus -->
        <div style="text-align:right;flex:none;min-width:72px;">
          <div style="font-family:'Saira',sans-serif;font-weight:700;font-size:13px;">${SS.rp(item.harga * item.qty)}</div>
          <button ${SS.A(() => _removeFromCart(idx))}
            style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--danger);font-family:'Hanken Grotesk',sans-serif;padding:2px 0 0;">
            Hapus
          </button>
        </div>
      </div>`;
  }

  /* ================================================================
   * PANEL: PEMBAYARAN
   * ================================================================ */

  function _paymentHtml() {
    const cart   = _cart();
    const total  = _total();
    const method = SS.S.k_pay || 'tunai';
    const cash   = parseInt((SS.S.k_cash || '').replace(/\D/g, ''), 10) || 0;
    const change = cash - total;
    const saving = !!SS.S.k_saving;

    const _methodBtn = (key, label) => `
      <button ${SS.A(() => SS.setState({ k_pay: key, k_cash: '' }))}
        style="flex:1;height:44px;border-radius:11px;cursor:pointer;font-family:'Saira',sans-serif;font-weight:700;font-size:13px;
        border:1.5px solid ${method === key ? 'var(--gold)' : 'var(--border)'};
        background:${method === key ? 'var(--goldtint2)' : 'var(--surface2)'};
        color:${method === key ? 'var(--gold)' : 'var(--muted)'};">
        ${label}
      </button>`;

    return `
      <div class="scrl" style="height:100%;overflow-y:auto;padding:14px 16px 30px;">

        <!-- Back button -->
        <button ${SS.A(() => SS.setState({ k_panel: 'cart' }))}
          style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:12.5px;font-family:'Hanken Grotesk',sans-serif;padding:0;margin-bottom:14px;display:flex;align-items:center;gap:4px;">
          &larr; Kembali ke Keranjang
        </button>

        <!-- Cart summary -->
        <div style="background:var(--surface);border:1px solid var(--border2);border-radius:14px;padding:13px 14px;margin-bottom:14px;">
          ${_lbl('Ringkasan ' + cart.length + ' item')}
          ${cart.map(i => `
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;gap:8px;">
              <span style="color:var(--text2);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${SS.esc(i.name)} <span style="color:var(--dim);">&times;${i.qty}</span>
              </span>
              <span style="font-weight:600;flex:none;">${SS.rp(i.harga * i.qty)}</span>
            </div>`).join('')}
          <div style="border-top:1px solid var(--divider);margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12.5px;color:var(--muted);">Total</span>
            <span style="font-family:'Saira',sans-serif;font-weight:900;font-size:20px;color:var(--gold);">${SS.rp(total)}</span>
          </div>
        </div>

        <!-- Payment method selector -->
        ${_lbl('Metode Pembayaran')}
        <div style="display:flex;gap:7px;margin-bottom:14px;">
          ${_methodBtn('tunai', 'Tunai')}
          ${_methodBtn('marketplace', 'Marketplace')}
          ${_methodBtn('tempo', 'Tempo')}
        </div>

        <!-- TUNAI: input nominal + kembalian realtime -->
        ${method === 'tunai' ? `
          ${_field('Nominal Dibayar (Rp)',
            `<input id="k-cash" value="${SS.esc(SS.S.k_cash || '')}"
              ${SS.I(e => SS.setState({ k_cash: e.target.value }))}
              type="text" inputmode="numeric" placeholder="Rp\u2026"
              style="width:100%;height:48px;border-radius:12px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:17px;padding:0 14px;outline:none;font-family:'Saira',sans-serif;font-weight:700;">`)}
          ${cash > 0 && cash >= total
            ? `<div style="background:var(--oktint);border:1px solid var(--okborder);border-radius:11px;padding:11px 14px;display:flex;justify-content:space-between;align-items:center;margin-top:-5px;margin-bottom:14px;">
                <span style="font-size:13px;color:var(--ok);font-weight:600;">Kembalian</span>
                <span style="font-family:'Saira',sans-serif;font-weight:900;font-size:20px;color:var(--ok);">${SS.rp(change)}</span>
              </div>`
            : cash > 0
              ? `<div style="background:var(--dangertint);border:1px solid var(--dangerborder);border-radius:11px;padding:11px 14px;margin-top:-5px;margin-bottom:14px;">
                  <span style="font-size:13px;color:var(--danger);">Kurang ${SS.rp(total - cash)}</span>
                </div>`
              : ''}
        ` : ''}

        <!-- MARKETPLACE: info saja -->
        ${method === 'marketplace' ? `
          <div style="background:var(--infotint);border:1px solid rgba(122,167,255,.3);border-radius:12px;padding:14px;margin-bottom:14px;">
            <div style="font-size:13.5px;font-weight:600;color:var(--info);">Pembayaran via Marketplace</div>
            <div style="font-size:12px;color:var(--muted);margin-top:5px;line-height:1.55;">Transaksi dicatat sebagai non-tunai (Shopee/Tokopedia/dll). Tidak ada kembalian.</div>
          </div>` : ''}

        <!-- TEMPO: nama pelanggan + jatuh tempo -->
        ${method === 'tempo' ? `
          ${_field('Nama Pelanggan *',
            `<input id="k-tname" value="${SS.esc(SS.S.k_tname || '')}"
              ${SS.I(e => SS.setState({ k_tname: e.target.value }))}
              placeholder="Nama pembeli\u2026"
              style="width:100%;height:44px;border-radius:11px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;padding:0 13px;outline:none;font-family:'Hanken Grotesk',sans-serif;">`)}
          ${_field('Tanggal Jatuh Tempo *',
            `<input id="k-tdue" value="${SS.esc(SS.S.k_tdue || '')}"
              ${SS.I(e => SS.setState({ k_tdue: e.target.value }))}
              type="date"
              style="width:100%;height:44px;border-radius:11px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;padding:0 13px;outline:none;font-family:'Hanken Grotesk',sans-serif;">`)}
          <div style="background:var(--warntint);border:1px solid rgba(232,161,58,.3);border-radius:11px;padding:12px 14px;margin-top:-5px;margin-bottom:14px;display:flex;align-items:flex-start;gap:8px;">
            ${SS.ic('tempo','var(--warn)',14)}
            <span style="font-size:12.5px;color:var(--warn);line-height:1.5;">Piutang senilai <b>${SS.rp(total)}</b> akan dibuat otomatis dan muncul di menu Piutang admin.</span>
          </div>` : ''}

        <!-- Submit -->
        <button ${SS.A(_saveTransaction)} ${saving ? 'disabled' : ''} class="fx-press"
          style="width:100%;height:52px;border-radius:14px;border:none;margin-top:4px;
          background:${saving ? 'var(--border)' : 'linear-gradient(180deg,var(--goldhi),var(--gold))'};
          color:${saving ? 'var(--muted)' : '#161208'};
          font-family:'Saira',sans-serif;font-weight:800;font-size:15px;letter-spacing:.06em;
          cursor:${saving ? 'not-allowed' : 'pointer'};
          box-shadow:${saving ? 'none' : '0 8px 22px -8px rgba(212,175,55,.5)'};">
          ${saving ? 'Menyimpan\u2026' : 'SIMPAN TRANSAKSI'}
        </button>
      </div>`;
  }

  /* ================================================================
   * PANEL: TAMBAH PRODUK BARU
   * ================================================================ */

  function _addProductHtml() {
    const saving = !!SS.S.k_saving;
    const cats   = SS.DB.categories.map(c => c.name);
    const selCat = SS.S.k_pkat || (cats[0] || 'Protein');

    return `
      <div class="scrl" style="height:100%;overflow-y:auto;padding:14px 16px 40px;">

        <button ${SS.A(() => { _photoFile = null; SS.setState({ k_addProd: false }); })}
          style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:12.5px;font-family:'Hanken Grotesk',sans-serif;padding:0;margin-bottom:14px;">
          &larr; Kembali
        </button>
        <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:17px;margin-bottom:16px;">Tambah Produk Baru</div>

        ${_field('Nama Produk *', _inp('k-pname',    SS.S.k_pname,    e => SS.setState({ k_pname:    e.target.value }), 'placeholder="Nama produk\u2026"'))}
        ${_field('Varian / Rasa',  _inp('k-pvarian',  SS.S.k_pvarian,  e => SS.setState({ k_pvarian:  e.target.value }), 'placeholder="Cokelat, Vanila, Unflavored\u2026"'))}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${_field('Harga Jual (Rp) *', _inp('k-pharga', SS.S.k_pharga, e => SS.setState({ k_pharga: e.target.value }), 'placeholder="Rp\u2026" type="text" inputmode="numeric"'))}
          ${_field('Harga Modal (Rp)',   _inp('k-pmodal', SS.S.k_pmodal, e => SS.setState({ k_pmodal: e.target.value }), 'placeholder="Rp\u2026" type="text" inputmode="numeric"'))}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${_field('Stok Awal',      _inp('k-pstok',   SS.S.k_pstok,   e => SS.setState({ k_pstok:   e.target.value }), 'placeholder="0" type="text" inputmode="numeric"'))}
          ${_field('Exp. (YYYY-MM)', _inp('k-pexp',    SS.S.k_pexp,    e => SS.setState({ k_pexp:    e.target.value }), 'placeholder="2026-12"'))}
        </div>
        ${_field('Barcode', _inp('k-pbarcode', SS.S.k_pbarcode, e => SS.setState({ k_pbarcode: e.target.value }), 'placeholder="Nomor barcode\u2026"'))}

        <!-- Kategori -->
        <div style="margin-bottom:13px;">
          ${_lbl('Kategori')}
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${cats.map(c => _chip(selCat === c, c, () => SS.setState({ k_pkat: c }))).join('')}
          </div>
        </div>

        <!-- Upload foto -->
        <div style="margin-bottom:16px;">
          ${_lbl('Foto Produk (JPG / PNG / WebP, maks 5MB)')}
          <label for="k-photo-input"
            style="display:flex;align-items:center;gap:10px;border:1.5px dashed var(--border);border-radius:12px;padding:13px 14px;cursor:pointer;background:var(--surface2);">
            <div style="width:34px;height:34px;border-radius:9px;background:var(--goldtint);display:flex;align-items:center;justify-content:center;flex:none;">
              ${SS.ic('produk', 'var(--gold)', 17)}
            </div>
            <span id="k-photo-label" style="font-size:12.5px;color:var(--dim);font-family:'Hanken Grotesk',sans-serif;">
              ${_photoFile ? SS.esc(_photoFile.name) : 'Ketuk untuk pilih foto produk'}
            </span>
          </label>
          <input id="k-photo-input" type="file" accept="image/jpeg,image/png,image/webp" style="display:none;">
        </div>

        <!-- Submit -->
        <button ${SS.A(_saveProduct)} ${saving ? 'disabled' : ''} class="fx-press"
          style="width:100%;height:50px;border-radius:13px;border:none;
          background:${saving ? 'var(--border)' : 'linear-gradient(180deg,var(--goldhi),var(--gold))'};
          color:${saving ? 'var(--muted)' : '#161208'};
          font-family:'Saira',sans-serif;font-weight:800;font-size:14.5px;letter-spacing:.04em;
          cursor:${saving ? 'not-allowed' : 'pointer'};">
          ${saving ? 'Menyimpan\u2026' : 'SIMPAN PRODUK'}
        </button>
      </div>`;
  }

  /* ================================================================
   * HEADER BAR (dipakai oleh semua layout)
   * ================================================================ */

  function _headerHtml(V) {
    const count = _count();
    return `
      <div style="flex:none;height:54px;border-bottom:1px solid var(--divider);display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:var(--panel);gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          <div style="font-family:'Saira',sans-serif;font-weight:800;font-size:16px;white-space:nowrap;">Kasir</div>
          <div style="font-size:11.5px;color:var(--gold);background:var(--goldtint);border:1px solid var(--goldborder);border-radius:7px;padding:2px 9px;white-space:nowrap;font-weight:600;">
            ${SS.esc((SS.USER || {}).branch || '')}
          </div>
          <div style="font-size:12px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">&middot; ${SS.esc(V.who || '')}</div>
        </div>
        <div style="display:flex;gap:6px;flex:none;align-items:center;">
          ${count > 0 && V.isMobile
            ? `<div style="background:var(--gold);color:#161208;border-radius:20px;padding:2px 9px;font-family:'Saira',sans-serif;font-weight:800;font-size:12px;">${count}</div>`
            : ''}
          <button ${SS.A(() => {
              _photoFile = null;
              SS.setState({ k_addProd: true, k_pname:'', k_pvarian:'', k_pharga:'', k_pmodal:'', k_pkat: (SS.DB.categories[0] || {}).name || 'Protein', k_pbarcode:'', k_pstok:'', k_pexp:'' });
            })}
            style="height:34px;padding:0 11px;border-radius:9px;background:var(--goldtint);border:1px solid var(--goldborder);color:var(--gold);font-size:12px;font-weight:600;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;white-space:nowrap;">
            + Produk
          </button>
          ${V.isAdmin
            ? `<button ${SS.A(V.goModeScreen)} style="height:34px;padding:0 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:12px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;white-space:nowrap;">Mode</button>`
            : ''}
          <button ${SS.A(V.openSettings)} style="height:34px;width:34px;border-radius:9px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
            ${SS.ic('settings','var(--muted2)',16)}
          </button>
          <button ${SS.A(V.logout)} style="height:34px;padding:0 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:12px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">
            Keluar
          </button>
        </div>
      </div>`;
  }

  /* ================================================================
   * MAIN RENDERER — didaftarkan ke SS runtime
   * ================================================================ */

  SS.registerCashier(function (V) {
    const addProd   = !!SS.S.k_addProd;
    const panel     = SS.S.k_panel || 'catalog';
    const isDesktop = V.isDesktop;

    /* ── Form tambah produk (full-screen overlay, desktop & mobile) ── */
    if (addProd) {
      setTimeout(_setupPhotoInput, 0); // pasang listener setelah DOM terupdate
      return `
        <div style="height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);">
          ${_headerHtml(V)}
          <div style="flex:1;min-height:0;">${_addProductHtml()}</div>
        </div>`;
    }

    /* ── DESKTOP: split layout ── */
    if (isDesktop) {
      return `
        <div style="height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);">
          ${_headerHtml(V)}
          <div style="flex:1;display:flex;min-height:0;overflow:hidden;">
            <!-- Kolom kiri: katalog (flex) -->
            <div style="flex:1;min-width:0;border-right:1px solid var(--divider);">
              ${_catalogHtml(true)}
            </div>
            <!-- Kolom kanan: keranjang atau pembayaran (lebar tetap) -->
            <div style="width:360px;flex:none;display:flex;flex-direction:column;min-height:0;">
              ${panel === 'pay' ? _paymentHtml() : _cartHtml()}
            </div>
          </div>
        </div>`;
    }

    /* ── MOBILE: tab layout ── */
    const count = _count();
    const tabs  = [
      { key: 'catalog', label: 'Katalog' },
      { key: 'cart',    label: count > 0 ? `Keranjang (${count})` : 'Keranjang' },
      { key: 'pay',     label: 'Bayar' },
    ];

    return `
      <div style="height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);">
        ${_headerHtml(V)}
        <!-- Tab bar -->
        <div style="flex:none;display:flex;border-bottom:1px solid var(--divider);background:var(--panel);">
          ${tabs.map(t => `
            <button ${SS.A(() => SS.setState({ k_panel: t.key }))}
              style="flex:1;height:42px;border:none;cursor:pointer;font-family:'Saira',sans-serif;font-weight:700;font-size:12.5px;white-space:nowrap;
              background:${panel === t.key ? 'var(--goldtint)' : 'transparent'};
              color:${panel === t.key ? 'var(--gold)' : 'var(--muted)'};
              border-bottom:2px solid ${panel === t.key ? 'var(--gold)' : 'transparent'};">
              ${t.label}
            </button>`).join('')}
        </div>
        <!-- Panel aktif -->
        <div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;">
          ${panel === 'catalog' ? _catalogHtml(false) : ''}
          ${panel === 'cart'    ? _cartHtml()         : ''}
          ${panel === 'pay'     ? _paymentHtml()      : ''}
        </div>
      </div>`;
  });

  /* ================================================================
   * PERSISTENT EVENT LISTENERS
   * (dipasang sekali, tetap aktif walau DOM di-replace oleh render)
   * ================================================================ */

  // Barcode: tekan Enter pada input scan → proses barcode
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'k-barcode') {
      e.preventDefault();
      _handleScan(SS.S.k_scanInput || '');
    }
  });

  // Enter di search tetap di input (tidak submit)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'k-search') {
      e.preventDefault();
    }
  });

})();
