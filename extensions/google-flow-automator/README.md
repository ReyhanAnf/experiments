# Timelapse Continuity — Google Flow Automator (Chrome Extension)

Ekstensi Google Chrome (Manifest V3) untuk mengotomasi alur kerja pembuatan urutan **Gambar Milestone** dan **Transisi Video** berkesinambungan langsung di antarmuka web **Google Labs / Google Flow (Veo & Imagen)**.

---

## 🌟 Fitur Utama

1. **In-Page Floating Assistant (HUD Dock)**:
   - Tampil melayang (*docked*) di pojok kanan bawah halaman Google Flow/Labs tanpa mengganggu antarmuka utama.
   - Bisa dipindahkan (*draggable*) dan diperkecil (*minimizable*).
2. **Stage 1: Generasi Gambar (Image Milestones)**:
   - Menampilkan urutan `IMAGE 1`, `IMAGE 2`, s/d `IMAGE N`.
   - Tombol **"⚡ Auto-Paste Image Prompt"**: Otomatis mendeteksi kotak input prompt di Google Flow dan menempelkan prompt lengkap dengan penanganan event input yang tepat.
   - Fitur **Auto-advance**: Otomatis bergeser ke aset berikutnya setelah prompt ditempelkan.
3. **Stage 2: Generasi Video Transisi (Video Transitions)**:
   - Menampilkan informasi transisi: misal `VIDEO 1 (IMAGE 1 ⟶ IMAGE 2)`.
   - **Panduan Seleksi Asset**: Menampilkan aset mana yang perlu ditautkan sebagai **Start Frame** (`IMAGE 1`) dan **End Frame** (`IMAGE 2`).
   - Karena Google Flow menyimpan aset yang telah dibuat di dalam **Library Proyek**, Anda **tidak perlu mengunduh gambar ke lokal lalu mengunggahnya kembali**. Cukup gunakan tombol **"Add asset to prompt"** di Google Flow.
   - Tombol **"⚡ Auto-Paste Video Prompt"**: Menempelkan prompt transisi video lengkap sekali klik.
4. **Preset Bawaan & Custom JSON**:
   - Mendukung 5 preset kontinuitas siap pakai (*Warehouse*, *Dapur Nenek*, *Infinity Pool*, *Japanese Tea Pavilion*, *Chef's Kitchen*).
   - Mendukung penempelan JSON kustom dari web [`timelapse-continuity.html`](file:///d:/07_PROJECTS/Personal/experiments/timelapse-continuity.html).

---

## 🚀 Cara Pemasangan di Google Chrome

1. Buka browser **Google Chrome**.
2. Masuk ke halaman pengelolaan ekstensi dengan mengetik:
   ```
   chrome://extensions
   ```
3. Aktifkan sakelar **"Developer mode"** di pojok kanan atas.
4. Klik tombol **"Load unpacked"** di pojok kiri atas.
5. Pilih folder ekstensi ini:
   ```
   d:\07_PROJECTS\Personal\experiments\extensions\google-flow-automator
   ```
6. Ekstensi **Timelapse Continuity — Google Flow Automator** akan langsung aktif!

---

## 🛠️ Cara Penggunaan di Google Flow

1. Buka halaman **Google Labs / VideoFX / ImageFX / Flow** (misal: `https://labs.google/fx/` atau workspace proyek Google Flow Anda).
2. Widget **Flow Automator** akan otomatis muncul di pojok kanan bawah.
3. **Langkah 1 (Gambar)**:
   - Pastikan tab **Stage 1: Images** aktif.
   - Klik **"⚡ Auto-Paste Image Prompt"**. Prompt akan langsung masuk ke kotak input generator Google Flow.
   - Klik tombol **Generate** di Google Flow.
   - Setelah gambar selesai, lanjut ke gambar berikutnya hingga semua milestone gambar terbentuk dan tersimpan di library Google Flow Anda.
4. **Langkah 2 (Video)**:
   - Beralih ke tab **Stage 2: Videos**.
   - Perhatikan panduan **Start Frame** dan **End Frame** pada kartu.
   - Di Google Flow, klik tombol **"Add asset to prompt"** dan pilih gambar awal serta gambar akhir yang sudah ada di library Anda.
   - Klik **"⚡ Auto-Paste Video Prompt"** untuk menempelkan instruksi pergerakan dan kontinuitas video.
   - Klik **Generate Video**. Ulangi untuk seluruh transisi video hingga selesai!
