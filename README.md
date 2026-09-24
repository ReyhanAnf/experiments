# Experiments & Creative Lab — Reyhan Anf

Kumpulan eksperimen web interaktif, visualisasi 3D WebGL, prototipe antarmuka, dan ide kreatif berbasis web oleh [Reyhan Anf](https://reyhananf.web.id).

🔗 **Live Hub URL:** [https://reyhananf.web.id/experiments](https://reyhananf.web.id/experiments)

---

## 🚀 Daftar Eksperimen

| Eksperimen | File | Teknologi | Deskripsi |
| :--- | :--- | :--- | :--- |
| **IAM TO YOGYA (3D Showcase)** | [`tshirt.html`](tshirt.html) | Three.js, WebGL, GLTF, Scrollytelling | Showcase produk kaos 3D interaktif bertema Yogyakarta dengan scrollytelling sinematik, orbit kamera 360°, dan color switcher. |
| **Kalender Interaktif (Tailwind)** | [`calendar-tailwind.html`](calendar-tailwind.html) | FullCalendar 6, Tailwind CSS, Vanilla JS | Aplikasi kalender responsif bertema sky-blue dengan modal event scheduler dan side panel detail agenda harian. |
| **Kalender Interaktif (Bootstrap)** | [`bootstrap.html`](bootstrap.html) | FullCalendar 6, Bootstrap 5, Offcanvas | Implementasi kalender jadwal interaktif berbasis komponen native Bootstrap 5 dan Bootstrap Icons. |

---

## 🛠️ Cara Menjalankan Secara Lokal

Karena semua eksperimen dibuat menggunakan HTML, CSS, dan JavaScript murni (zero build-step), Anda dapat menjalankannya dengan local web server sederhana:

### Menggunakan Python:
```bash
python -m http.server 8000
```
Buka browser di `http://localhost:8000`

### Menggunakan Node.js / npx:
```bash
npx serve .
```

### Menggunakan VS Code:
Gunakan ekstensi **Live Server**, klik kanan pada `index.html` dan pilih **"Open with Live Server"**.

> **Catatan untuk Model 3D (`tshirt.html`):**  
> Three.js membutuhkan local web server (seperti di atas) untuk memuat model `.glb` karena kebijakan CORS browser lokal saat membuka file langsung (`file://`).

---

## ➕ Cara Menambahkan Eksperimen Baru

1. Buat file HTML baru di root folder repositori ini (misal `fluid-simulation.html`).
2. Masukkan script atau library yang dibutuhkan (disarankan menggunakan CDN).
3. Tambahkan link kembali ke Hub pada navigasi atas:
   ```html
   <a href="./">← Kembali ke Hub Eksperimen</a>
   ```
4. Tambahkan kartu eksperimen baru ke dalam [`index.html`](index.html).
5. Commit dan push ke repository. Eksperimen akan langsung aktif di `https://reyhananf.web.id/experiments/nama-file.html`!
