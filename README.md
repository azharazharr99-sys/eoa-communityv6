# EOA Community v5.0

Dashboard komunitas berbasis HTML, CSS, JavaScript, dan Supabase.

## Fitur
- Supabase Auth: daftar, login, logout.
- Profil anggota otomatis dibuat setelah signup.
- Status anggota `pending` sampai admin menyetujui.
- Dashboard statistik dihitung dari database.
- Admin dapat mengedit konten dashboard.
- Admin dapat membuat dan menghapus pengumuman.
- Daftar anggota, pencarian, filter status.
- Realtime refresh untuk profil, pengumuman, dan pengaturan.
- Responsive layout, animasi reveal, hover, modal, toast, dan transisi halaman.
- Observatorium tata surya CSS interaktif: Matahari, delapan planet, zoom, jeda, dan pengaturan kecepatan orbit.
- Integrasi Spotify Playlist melalui embed resmi Spotify, dengan validasi URL dan kontrol pemutaran bawaan Spotify.

## 1. Buat project Supabase
1. Buka https://supabase.com/dashboard lalu buat project.
2. Buka Project Settings > API.
3. Salin Project URL dan anon/publishable key.
4. Masukkan ke `config.js`. URL playlist Spotify publik dapat diisi pada `SPOTIFY_PLAYLIST_URL` atau melalui halaman Observatorium.

Contoh:
```js
window.EOA_CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_xxxxxxxxx"
};
```
Gunakan anon/publishable key. Jangan pernah gunakan `service_role` key di frontend.

## 2. Buat database
1. Buka SQL Editor di Supabase.
2. Tempel seluruh isi `database.sql`.
3. Klik Run.
4. Pastikan tabel `profiles`, `community_settings`, dan `announcements` sudah dibuat.

## 3. Buat akun admin
1. Jalankan website dan daftar menggunakan email admin.
2. Jika verifikasi email aktif, verifikasi email tersebut.
3. Di Supabase buka Authentication > Users, salin UUID akun.
4. Di SQL Editor jalankan:
```sql
update public.profiles
set role = 'admin', status = 'active'
where id = 'UUID-AKUN-MILIKMU';
```
5. Logout lalu login kembali agar role admin dimuat ulang.

Jangan membuat tombol promosi admin di frontend. Role admin hanya diberikan dari dashboard/database tepercaya.

## 4. Jalankan lokal
Buka folder ini di VS Code atau Spck. Untuk hasil terbaik gunakan Live Preview / local server, bukan membuka file HTML langsung.

## 5. Deploy ke Vercel
1. Upload seluruh file ke repository GitHub.
2. Di Vercel pilih Add New > Project, lalu import repository.
3. Framework Preset: Other.
4. Build Command: kosongkan.
5. Output Directory: `.` (root).
6. Deploy.

Karena ini frontend statis, konfigurasi Supabase dibaca dari `config.js`. Jika repository publik, URL dan anon/publishable key boleh terlihat; keamanan wajib ditegakkan oleh RLS. Jangan commit service_role key.

## Catatan keamanan
- Kebijakan RLS membatasi operasi admin berdasarkan `profiles.role`.
- Akun baru otomatis menjadi `member` dengan status `pending`.
- Admin harus ditetapkan manual melalui SQL Editor.
- Sebelum dipakai publik, uji signup, verifikasi email, login, approval, dan akses admin.
- Untuk produksi, pertimbangkan pembatasan kolom profil melalui RPC atau trigger tambahan jika kelak fitur edit profil ditambahkan.


## 6. Integrasi Spotify
1. Salin URL playlist publik dari Spotify (format `https://open.spotify.com/playlist/ID`).
2. Buka halaman Observatorium dan tempel URL pada kolom Spotify, atau isi `SPOTIFY_PLAYLIST_URL` di `config.js`.
3. Tekan **Muat playlist**. Pemutar resmi Spotify akan muncul dan menangani play, pause, serta kontrol lainnya.

Catatan: website tidak mengontrol pemutaran Spotify di luar kemampuan embed resmi. Ketersediaan preview, login, dan fitur tertentu mengikuti kebijakan serta akun Spotify. Autoplay tidak diaktifkan.

## 7. Catatan visualisasi
Animasi orbit dibuat dengan CSS agar ringan tanpa library 3D tambahan. Ukuran dan jarak planet disederhanakan untuk tampilan; visualisasi bukan representasi skala astronomi sebenarnya. Kontrol zoom, jeda, dan kecepatan bekerja secara lokal di browser.
