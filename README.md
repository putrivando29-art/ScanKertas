# ScanKertas

Pemindai dokumen di browser: foto kertas dengan kamera HP atau ambil dari galeri, atur 4 sudut kertas, koreksi perspektif, perjelas hasil (putih bersih), lalu ekspor ke PDF. Semua proses berjalan di perangkat, tanpa server.

## Pakai di HP Android

Kamera browser hanya bisa dibuka dari alamat **HTTPS**, jadi aplikasi ini dipublikasikan lewat GitHub Pages:

**https://putrivando29-art.github.io/ScanKertas/**

1. Buka alamat di atas dengan Chrome di Android.
2. Izinkan akses kamera saat diminta.
3. Opsional: menu ⋮ → **Instal aplikasi** / **Tambahkan ke layar utama**. Setelah dipasang, aplikasi bisa dibuka seperti aplikasi biasa dan tetap jalan tanpa internet.

### Mengaktifkan GitHub Pages (sekali saja)

1. Gabungkan (merge) kode ke branch `main`.
2. Di GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Workflow `.github/workflows/deploy.yml` akan membangun dan menerbitkan situs setiap ada push ke `main`. Statusnya terlihat di tab **Actions**.

## Menjalankan di komputer

Butuh Node.js 22.

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint     # cek tipe TypeScript
npm test         # tes logika pemindai dan pembuat PDF
npm run build    # hasil di folder dist/
```

`npm run dev` mendengarkan di `0.0.0.0` sehingga bisa dibuka dari HP di jaringan yang sama, tetapi kamera tetap butuh HTTPS. Lewat HTTP biasa, halaman kamera jatuh ke mode simulasi.

## Aplikasi Android (APK), opsional

`capacitor.config.json` sudah disiapkan. Untuk membuat APK sendiri (butuh Android Studio):

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npm run build
npx cap add android
npx cap open android
```
