<?php

namespace Tests\Unit;

use App\Services\ImageUploadService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\ImageManager;
use InvalidArgumentException;
use Tests\TestCase;

class ImageUploadServiceTest extends TestCase
{
    private ImageUploadService $svc;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        $this->svc = new ImageUploadService();
    }

    public function test_upload_menghasilkan_thumb_dan_medium_webp(): void
    {
        $paths = $this->svc->upload(UploadedFile::fake()->image('foto.jpg', 1600, 1200));

        $this->assertMatchesRegularExpression('#^produk/thumb/produk_\w+\.webp$#', $paths['thumb']);
        $this->assertMatchesRegularExpression('#^produk/medium/produk_\w+\.webp$#', $paths['medium']);
        Storage::disk('public')->assertExists([$paths['thumb'], $paths['medium']]);

        $medium = ImageManager::gd()->read(Storage::disk('public')->get($paths['medium']));
        $thumb = ImageManager::gd()->read(Storage::disk('public')->get($paths['thumb']));
        $this->assertSame(800, $medium->width());   // 1600 diperkecil ke maks 800
        $this->assertSame(600, $medium->height());  // proporsional
        $this->assertSame([200, 200], [$thumb->width(), $thumb->height()]);
    }

    public function test_gambar_kecil_tidak_di_upscale(): void
    {
        $paths = $this->svc->upload(UploadedFile::fake()->image('kecil.png', 400, 300));

        $medium = ImageManager::gd()->read(Storage::disk('public')->get($paths['medium']));
        $this->assertSame(400, $medium->width());
    }

    public function test_file_bukan_gambar_dan_terlalu_besar_ditolak(): void
    {
        try {
            $this->svc->upload(UploadedFile::fake()->create('palsu.jpg', 10, 'image/jpeg'));
            $this->fail('File non-gambar seharusnya ditolak');
        } catch (InvalidArgumentException $e) {
            $this->assertSame('File bukan gambar yang valid.', $e->getMessage());
        }

        $this->expectException(InvalidArgumentException::class);
        $this->svc->upload(UploadedFile::fake()->create('besar.jpg', 6000, 'image/jpeg')); // 6MB
    }

    public function test_update_image_menghapus_file_lama(): void
    {
        $old = $this->svc->upload(UploadedFile::fake()->image('lama.jpg', 900, 900));
        $new = $this->svc->updateImage(UploadedFile::fake()->image('baru.jpg', 900, 900), $old['thumb'], $old['medium']);

        Storage::disk('public')->assertMissing([$old['thumb'], $old['medium']]);
        Storage::disk('public')->assertExists([$new['thumb'], $new['medium']]);
    }

    public function test_delete_images_menghapus_kedua_versi(): void
    {
        $paths = $this->svc->upload(UploadedFile::fake()->image('hapus.jpg', 500, 500));
        $this->svc->deleteImages($paths['thumb'], $paths['medium']);

        Storage::disk('public')->assertMissing([$paths['thumb'], $paths['medium']]);
    }
}
