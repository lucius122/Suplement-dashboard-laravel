<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="csrf-token" content="{{ csrf_token() }}">
  <title>Suplemen Semarang Store</title>
  <link rel="stylesheet" href="{{ asset('css/fonts.css') }}">
  <link rel="stylesheet" href="{{ asset('css/app.css') }}">
</head>
<body>
  <div id="app"></div>
  {{-- Fallback decoding barcode: BarcodeDetector browser hanya ada di Chrome Android/ChromeOS, tak ada di Chrome/Edge desktop. --}}
  <script src="{{ asset('js/vendor/zxing.min.js') }}"></script>
  <script src="{{ asset('js/app.js') }}"></script>
  {{-- Modul kasir (dikerjakan tim kasir). Harus dimuat SETELAH app.js karena memakai window.SS. --}}
  <script src="{{ asset('js/kasir.js') }}"></script>
  @if (app()->environment('local') && request()->has('e2e'))
    <script src="{{ asset('__test.js') }}"></script>
  @endif
</body>
</html>
