# **Panduan Build & Deploy Google Cloud Run (Ojol-Cuanbot Router)**

Dokumen ini ditulis sebagai panduan teknis bagi AI maupun pengembang lain untuk membangun (build) dan menyebarkan (deploy) aplikasi **Ojol-Cuanbot Router** ke **Google Cloud Run** dengan sukses, termasuk cara mengatasi kebijakan organisasi GCP yang ketat.

---

## **1. Prasyarat & Lingkungan (Prerequisites)**

Pastikan hal-hal berikut sudah terkonfigurasi di Google Cloud Console dan SDK lokal:
1. **Google Cloud SDK (gcloud)** sudah terinstal dan terautentikasi.
2. Proyek GCP aktif (`PROJECT_ID`).
3. Kredensial Google Maps API Key dengan akses ke:
   - **Geocoding API**
   - **Places API (New)**
   - **Routes API**
4. Vertex AI API sudah diaktifkan di GCP Project Anda.

---

## **2. Langkah-Langkah Build & Bundling Frontend**

Aplikasi ini menggunakan struktur monorepo dengan frontend React (Vite) dan backend Express.js. Sebelum dideploy, frontend harus dikompilasi terlebih dahulu agar dapat disajikan sebagai berkas statis oleh Express.

### **Langkah 2.1: Kompilasi React Frontend**
Masuk ke direktori frontend, instal dependensi, lalu lakukan build produksi:
```bash
cd frontend
npm install
npm run build
```
Proses ini akan menghasilkan berkas kompilasi di dalam folder `frontend/dist/`.

### **Langkah 2.2: Pindahkan Aset ke Backend**
Hapus aset lama di folder publik backend, lalu salin berkas hasil build baru dari `frontend/dist/` ke `backend/public/`:
```bash
# Dari root project
rm -rf backend/public/*
cp -r frontend/dist/* backend/public/
```

---

## **3. Konfigurasi Backend & Variabel Lingkungan**

Agar backend dapat memuat `.env` secara konsisten terlepas dari direktori kerja saat dijalankan oleh sistem kontainer (seperti PM2 atau Cloud Run), pastikan pemanggilan dotenv di file kode backend (seperti `backend/services/maps.js` atau `backend/index.js`) menggunakan path absolut:
```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
```

Pastikan juga ada berkas `backend/.dockerignore` yang mengecualikan `.env`, `node_modules`, dan berkas development lainnya agar tidak masuk ke Docker image.

---

## **4. Langkah Deploy ke Google Cloud Run**

### **Langkah 4.1: Set API Key (sekali saja)**
Google Maps API Key harus disimpan sebagai environment variable di Cloud Run, bukan di file di repo. Set cukup satu kali:

```bash
gcloud run services update ojol-router \
  --region asia-southeast1 \
  --update-env-vars=GOOGLE_MAPS_API_KEY=<KUNCI_API_ANDA>
```

### **Langkah 4.2: Eksekusi Perintah Deploy**
Gunakan Cloud Run Source Deploy untuk memaketkan folder `backend` secara langsung tanpa perlu membuat berkas Docker image manual di Artifact Registry. Jalankan perintah ini dari direktori root project:

```bash
gcloud run deploy ojol-router \
  --source backend \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --update-env-vars="PROJECT_ID=ojol-cuanbot-router,LOCATION=global,GOOGLE_CLOUD_PROJECT=ojol-cuanbot-router,GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=true"
```

> **Catatan Variabel Lingkungan:**
> - `PORT` tidak perlu diset — Cloud Run otomatis menyediakan `PORT=8080`, dan kode backend sudah menggunakan `process.env.PORT || 8080`.
> - `GOOGLE_GENAI_USE_VERTEXAI=true` memaksa SDK AI menggunakan Vertex AI GCP.
> - `GOOGLE_MAPS_API_KEY` tidak disertakan di perintah deploy — sudah diset terpisah di Langkah 4.1 dan tidak akan ditimpa karena menggunakan `--update-env-vars` (bukan `--set-env-vars`).

---

## **5. Mengatasi Masalah Hak Akses Publik (Domain-Restricted Sharing)**

### **Masalah Utama**
Banyak organisasi GCP menerapkan kebijakan keamanan **Domain-Restricted Sharing** (`constraints/iam.allowedPolicyMemberDomains`) yang membatasi pemberian izin `allUsers` (akses publik tanpa autentikasi). Hal ini menyebabkan langkah akhir deployment Cloud Run gagal dengan peringatan:
> *Setting IAM policy failed...*

Akibatnya, URL Cloud Run yang dihasilkan akan mengembalikan error **403 Forbidden** saat diakses publik.

### **Solusi Mitigasi (Wajib Dijalankan)**
Untuk memotong pemeriksaan IAM invoker dan memaksa aplikasi agar tetap dapat diakses oleh publik, jalankan perintah pembaruan layanan berikut segera setelah deployment selesai:

```bash
gcloud run services update ojol-router \
  --region=asia-southeast1 \
  --no-invoker-iam-check
```

Perintah ini akan menonaktifkan pemeriksaan IAM pada gerbang Cloud Run sehingga aplikasi dapat diakses secara instan oleh seluruh pengguna internet.

---

## **6. Verifikasi Akhir**

Uji fungsionalitas server publik menggunakan perintah `curl` pada endpoint health check:
```bash
curl -i https://<URL-LAYANAN-CLOUD-RUN-ANDA>/health
```

**Hasil Sukses yang Diharapkan:**
- Header HTTP mengembalikan status `200 OK`.
- Body JSON merespons dengan:
  ```json
  {"status":"OK","message":"Ojol-Cuanbot Router Backend is running."}
  ```

---

## **7. Catatan Penting Lainnya bagi AI / Developer**
- **TSP Router Solver:** Pemecah rute pintar berada pada `backend/services/maps.js` (`optimizeSmartRoute`) secara lokal menggunakan brute force permutasi dengan batasan pickup-before-delivery. Jangan ubah jika jumlah titik masih skala kecil (max 5 struk).
- **Google Maps Redirection:** Pengalihan navigasi eksternal wajib menggunakan koordinat GPS mentah (`lat,lng`) sebagai parameter kueri utama untuk mencegah kegagalan geocoding di aplikasi mobile Google Maps, dengan `place_id` sebagai parameter pelengkap.
