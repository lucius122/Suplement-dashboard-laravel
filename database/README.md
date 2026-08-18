# Database — Dokumentasi Skema

Folder ini berisi **dokumentasi** skema database, bukan kode.
Migration, seeder, dan factory yang dijalankan Laravel ada di
[`backend/database/`](../backend/database/).

| Folder | Isi |
|---|---|
| `ERD/` | Diagram relasi antar entitas (gambar / sumber diagram) |
| `schema/` | Rincian tabel & kolom, hasil ekspor `SHOW CREATE TABLE` |

## Ringkasan entitas

Sumber kebenaran skema = file migration di `backend/database/migrations/`.
Ringkasan di bawah untuk orientasi cepat.

| Tabel | Peran |
|---|---|
| `users` | Admin & kasir. Dinonaktifkan (`active=false`), tidak dihapus, agar histori transaksi utuh |
| `branches` | Cabang toko. Hampir semua tabel transaksional menempel ke sini |
| `categories` | Kategori produk, dipakai filter stok |
| `products` | Master barang **per ukuran/berat**, bukan per rasa |
| `transactions` | Nota penjualan: `method` = tunai / marketplace / tempo |
| `transaction_items` | Baris item per nota. `price` = harga saat transaksi; `note` = alasan harga khusus |
| `stock_movements` | Mutasi stok masuk/keluar — sumber layar Riwayat Stok |
| `receivables` | Piutang dari transaksi tempo. `note` = catatan transaksi |
| `receivable_payments` | Cicilan pembayaran piutang |
| `suppliers` | Hutang ke supplier (purchase order) |
| `expenses` | Biaya operasional: rutin bulanan & sekali-pakai |
| `expense_categories` | Kategori biaya operasional |

## Aturan yang tertanam di skema

- **Uang disimpan sebagai integer rupiah**, bukan desimal — menghindari galat pembulatan.
- **Stok tidak pernah ditimpa langsung.** Setiap perubahan lewat `stock_movements`
  supaya track record-nya jujur.
- `transaction_items.price` disimpan apa adanya saat transaksi, tidak mengikuti
  `products.harga` yang bisa berubah kemudian. Laporan lama tetap akurat.

## Cara memperbarui dokumen ini

```bash
cd SuplemenSemarang
php artisan migrate:status          # pastikan skema terkini
```

Ekspor skema (MySQL Laragon harus hidup):

```bash
mysqldump -u root --no-data suplemen_semarang > database/schema/schema.sql
```
