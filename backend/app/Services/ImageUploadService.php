<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\Exceptions\DecoderException;
use Intervention\Image\ImageManager;
use InvalidArgumentException;

class ImageUploadService
{
    private const MAX_BYTES = 5 * 1024 * 1024; // 5MB
    private const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

    private const DISK = 'public';
    private const DIR_THUMB = 'produk/thumb';
    private const DIR_MEDIUM = 'produk/medium';

    private const MEDIUM_MAX_WIDTH = 800;
    private const MEDIUM_QUALITY = 78;
    private const THUMB_SIZE = 200;
    private const THUMB_QUALITY = 75;

    /**
     * Proses upload foto produk: validasi, konversi WebP,
     * lalu simpan versi thumbnail (200x200) dan medium (maks lebar 800px).
     *
     * @return array{thumb: string, medium: string} path relatif di disk "public"
     *
     * @throws InvalidArgumentException jika file terlalu besar / bukan gambar valid
     */
    public function upload(UploadedFile $file): array
    {
        $this->validate($file);

        // Baca gambar; DecoderException berarti isi file bukan gambar yang valid
        try {
            $manager = ImageManager::gd();
            $medium = $manager->read($file->getRealPath());
            $thumb = $manager->read($file->getRealPath());
        } catch (DecoderException) {
            throw new InvalidArgumentException('File bukan gambar yang valid.');
        }

        // Nama unik yang sama untuk kedua versi supaya gampang dilacak berpasangan
        $filename = uniqid('produk_').'.webp';
        $thumbPath = self::DIR_THUMB.'/'.$filename;
        $mediumPath = self::DIR_MEDIUM.'/'.$filename;

        // medium: resize proporsional maks 800px — scaleDown tidak pernah memperbesar
        $medium->scaleDown(width: self::MEDIUM_MAX_WIDTH);
        Storage::disk(self::DISK)->put($mediumPath, (string) $medium->toWebp(quality: self::MEDIUM_QUALITY));

        // thumbnail: crop kotak 200x200 dari tengah gambar
        $thumb->cover(self::THUMB_SIZE, self::THUMB_SIZE);
        Storage::disk(self::DISK)->put($thumbPath, (string) $thumb->toWebp(quality: self::THUMB_QUALITY));

        return ['thumb' => $thumbPath, 'medium' => $mediumPath];
    }

    /**
     * Ganti foto produk: hapus file lama (jika ada) lalu simpan yang baru.
     * Kegagalan validasi dilempar SEBELUM file lama dihapus, jadi foto lama aman.
     *
     * @return array{thumb: string, medium: string}
     */
    public function updateImage(UploadedFile $file, ?string $oldThumbPath, ?string $oldMediumPath): array
    {
        $paths = $this->upload($file);
        $this->deleteImages($oldThumbPath, $oldMediumPath);

        return $paths;
    }

    /**
     * Hapus kedua versi file (thumb + medium), dipakai saat produk dihapus
     * atau fotonya diganti. Path null/kosong dilewati saja.
     */
    public function deleteImages(?string $thumbPath, ?string $mediumPath): void
    {
        $paths = array_filter([$thumbPath, $mediumPath]);
        if ($paths !== []) {
            Storage::disk(self::DISK)->delete($paths);
        }
    }

    /**
     * Validasi dasar sebelum diproses: ukuran maks 5MB dan tipe JPG/PNG/WebP.
     */
    private function validate(UploadedFile $file): void
    {
        if (! $file->isValid()) {
            throw new InvalidArgumentException('Upload gagal, coba lagi.');
        }
        if ($file->getSize() > self::MAX_BYTES) {
            throw new InvalidArgumentException('Ukuran gambar maksimal 5MB.');
        }
        if (! in_array($file->getMimeType(), self::ALLOWED_MIMES, true)) {
            throw new InvalidArgumentException('Format harus JPG, PNG, atau WebP.');
        }
    }
}
