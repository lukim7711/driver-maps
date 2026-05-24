# **PRODUCT REQUIREMENT DOCUMENT (PRD)**

## **Multi-Pickup & Multi-Drop Router App**

**Nama Kode Proyek:** Ojol-Cuanbot Router  
**Versi:** 1.0  
**Tanggal:** 23 Mei 2026  
**Status Dokumen:** Siap Eksekusi

## ---

**1\. Ringkasan Eksekutif (Executive Summary)**

Dokumen ini mendefinisikan kebutuhan fungsional, teknis, dan alur kerja untuk pembuatan aplikasi mobile/web khusus kurir logistik independen dan driver online. Aplikasi ini memecahkan masalah inefisiensi rute pengiriman multi-titik dengan memanfaatkan teknologi Kecerdasan Buatan (AI) Multimodal untuk membaca tangkapan layar (screenshot) alamat pesanan secara massal, mendeteksi lokasi koordinat secara otomatis, dan menyusun rute perjalanan searah yang paling optimal.

## **2\. Analisis Masalah & Tujuan Produk**

### **2.1 Pernyataan Masalah**

* Kurir atau driver sering kali menerima lebih dari 5 pesanan sekaligus dalam satu waktu perjalanan (multi-pickup & multi-drop).  
* Proses menyalin alamat satu per satu dari aplikasi pihak ketiga, mencari koordinatnya secara manual di peta, serta mengurutkan rute pengiriman memakan waktu yang sangat lama di lapangan.  
* Ketidakpastian urutan alamat menyebabkan rute yang berputar-putar (tidak searah), yang berujung pada pemborosan bahan bakar (BBM), tenaga, dan waktu.

### **2.2 Tujuan Produk**

* Memangkas waktu input data alamat oleh driver hingga kurang dari 10 detik untuk 5+ alamat sekaligus.  
* Mengotomatiskan pemisahan entitas alamat Penjual (Pickup) dan Pembeli (Delivery) menggunakan Kecerdasan Buatan (AI).  
* Menyediakan visualisasi peta dan urutan navigasi yang paling efisien (searah) guna mengoptimalkan operasional kurir di lapangan.

## **3\. Profil Pengguna (User Persona)**

**Pengguna Utama:** Driver ojek online (ojol), kurir ekspedisi, atau driver logistik independen yang sering menangani pengiriman barang dalam jumlah banyak sekaligus dalam satu rit/perjalanan.

## **4\. Kebutuhan Fungsional Fitur (Core Features)**

| ID Fitur | Nama Fitur | Deskripsi & Kebutuhan Spesifik   |
| :---- | :---- | :---- |
| **FR-01** | Manajemen Unggahan Massal (Bulk Upload) | Driver dapat memilih dan mengunggah minimal 5 gambar screenshot detail pesanan secara bersamaan langsung dari galeri handphone. Sistem wajib menampilkan indikator proses (loading bar) selama AI bekerja. |
| **FR-02** | Ekstraksi Alamat Pintar (Vertex AI OCR) | Sistem mengirim gambar ke API Google Cloud (Gemini versi terbaru yang optimal untuk OCR, misal Gemini 1.5 Pro atau Gemini Flash terbaru). AI harus mampu menganalisis visual dan memisahkan secara akurat teks yang merupakan **Alamat Penjual (Pickup)** dan **Alamat Pembeli (Delivery)** dari setiap screenshot (misal: format screenshot detail pesanan aplikasi e-commerce/pengiriman), kemudian merapikannya ke dalam format data terstruktur (JSON). |
| **FR-03** | Penitikan Koordinat Otomatis (Geocoding) | Mengonversi teks alamat hasil ekstraksi AI menjadi titik koordinat bumi (Latitude & Longitude). Sistem menampilkan pin peta dengan warna berbeda (misal: Pin Biru untuk lokasi Pickup, Pin Hijau untuk lokasi Delivery). Menyediakan opsi edit manual jika teks alamat pada screenshot asli kurang lengkap/kurang akurat. |
| **FR-04** | Optimasi Rute Searah (Clustering Router) | Menyediakan tombol "Optimasi Rute". Sistem akan menghitung matriks jarak dan menyusun urutan titik kunjungan yang paling searah (1 → 2 → 3 → dst.) baik pada fase pengambilan barang (pickup) maupun fase pengantaran barang (delivery). |
| **FR-05** | Pintas Navigasi (Deep Linking) | Menyediakan tombol "Mulai Navigasi" pada tiap titik urutan. Jika diklik, sistem akan langsung membuka aplikasi navigasi eksternal asli yang ada di handphone driver (seperti Google Maps atau Waze) menuju titik tersebut. |

## **5\. Arsitektur Teknologi (Technical Tech Stack)**

* **Frontend Aplikasi (Tampilan):** Menggunakan Flutter atau React Native untuk aplikasi mobile Android, atau platform low-code seperti FlutterFlow/Bubble.io untuk percepatan pembuatan prototip (MVP).  
* **Otak AI (Infrastruktur Google Cloud \- Memanfaatkan Trial Credit for GenAI App Builder Rp17 Juta):**  
  * **Google Vertex AI API (Gemini versi terbaru, misal Gemini 1.5 Pro / Flash terbaru):** Digunakan sebagai model multimodal utama untuk membaca gambar screenshot dan mengekstrak entitas alamat pembeli/penjual secara cerdas dan cepat dengan biaya operasional yang sangat efisien.  
  * **Google Cloud Storage (GCS):** Digunakan sebagai tempat penyimpanan (bucket) sementara objek gambar screenshot yang diunggah dari handphone driver.  
* **Layanan Pemetaan (Google Maps Platform):**  
  * **Google Maps Geocoding API:** Mengubah teks alamat mentah menjadi titik koordinat bumi.  
  * **Google Maps Routes API (Advanced):** Menghitung matriks jarak dan mengaktifkan fitur *Optimize Waypoints* untuk menyusun urutan rute multi-titik yang paling efisien dan searah.

## **6\. Alur Kerja Pengguna (User Flow)**

1. Driver membuka aplikasi di lapangan dan menekan tombol **"Tambah Pesanan"**.  
2. Driver memilih sejumlah screenshot pesanan dari galeri HP, lalu menekan tombol **"Proses Alamat"**.  
3. Sistem mengunggah gambar ke Cloud Storage dan memprosesnya menggunakan Vertex AI (Model Gemini versi terbaru).  
4. Sistem menampilkan daftar alamat terstruktur di layar. Driver memverifikasi akurasi data.  
5. Driver menekan tombol **"Optimasi Rute Searah"**. Peta langsung menampilkan urutan pin lokasi dari titik terdekat hingga titik akhir.  
6. Driver menekan tombol navigasi di urutan pertama, lalu aplikasi otomatis mengarahkan ke Google Maps eksternal untuk mulai jalan.

## **7\. Kriteria Keberhasilan & MVP (Minimum Viable Product)**

* **Tingkat Akurasi AI:** Minimal 90% teks alamat penjual dan pembeli berhasil dipisahkan dan diekstrak dengan benar dari screenshot yang memiliki pencahayaan normal.  
* **Kecepatan Sistem (Latency):** Waktu pemrosesan total dari gambar diunggah hingga titik koordinat muncul di peta tidak boleh lebih dari 5-7 detik untuk 5 gambar sekaligus.  
* **Skalabilitas Biaya:** Memaksimalkan penggunaan Trial Credit for GenAI App Builder Rp17 juta pada Vertex AI untuk pengujian skala penuh (Prototyping) sebelum aplikasi dilempar ke tahap produksi komersial.