# Driver Maps — Koordinat Akurat

Aplikasi web untuk mengekstrak alamat dari screenshot pesanan (Ojol/Gojek/Grab/Shopee) dan menentukan **titik koordinat (lat/lng) yang sangat akurat**.

**URL**: https://driver-maps.pages.dev

---

## Arsitektur (Cloudflare)

```
Frontend (React/Vite) ──► Cloudflare Pages
Backend (Workers JS) ───► Cloudflare Workers
LLM OCR (Gemma 4) ─────► Workers AI
Cache ─────────────────► D1 (SQLite)
Rate Limit ────────────► KV
Geocoding ─────────────► Google Maps API
```

---

## Alur Kerja

1. **Upload screenshot** (max 5 gambar)
2. **OCR via Workers AI** (Gemma 4 Vision) → ekstrak alamat terstruktur
3. **Address Parser** → normalisasi alamat Indonesia
4. **Smart Geocoding** → Geocoding API primary + Places API fallback
5. **Confidence Scoring** → ROOFTOP = akurat, GEOMETRIC_CENTER = warning
6. **Cache (D1)** → simpan hasil dengan metadata
7. **Tampilkan hasil** → koordinat + badge akurasi

---

## Struktur File

```
driver-maps/
├── workers-src/              # Backend (Cloudflare Workers)
│   ├── index.js              # Entry point + router
│   ├── routes/
│   │   ├── health.js
│   │   └── extract-address.js
│   ├── lib/
│   │   ├── agent.js          # Workers AI (Gemma 4)
│   │   ├── geocoder.js       # Smart geocoding
│   │   ├── address-parser.js # Parser alamat Indonesia
│   │   ├── cache.js          # D1 cache
│   │   ├── rate-limit.js     # KV rate limit
│   │   └── cors.js           # CORS helpers
│   └── wrangler.toml         # Workers config
│
├── frontend/                 # Frontend (React/Vite)
│   ├── src/
│   │   ├── App.jsx           # UI sederhana
│   │   ├── App.css           # Styling
│   │   └── main.jsx
│   ├── dist/                 # Build output (auto via GitHub Actions)
│   └── package.json
│
├── .github/workflows/
│   └── deploy.yml            # CI/CD: deploy Workers + Pages
│
├── schema.sql                # D1 schema
├── wrangler.toml             # Workers config
├── arsip/                    # File lama (backend Express, TSP, dll)
└── README.md
```

---

## Setup (Satu Kali)

### 1. Cloudflare API Token

Buat di [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) dengan permissions:
- **Account**: Workers Scripts:Edit, Workers KV Storage:Edit, D1:Edit
- **Zone**: (tidak perlu untuk Workers)
- **User**: (tidak perlu)

### 2. GitHub Secrets

Tambahkan di repository settings → Secrets → Actions:

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | Token dari langkah 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID dari Cloudflare dashboard |
| `GOOGLE_MAPS_API_KEY` | API key Google Maps |

### 3. Push ke Main

```bash
git add .
git commit -m "Initial Cloudflare migration"
git push origin main
```

GitHub Actions akan otomatis:
- Deploy Workers (backend)
- Build frontend
- Deploy Pages (frontend)

---

## Local Development

> **CATATAN**: Hanya untuk testing lokal. Build & deploy TETAP via GitHub Actions. JANGAN build/deploy dari lokal.

```bash
# Install wrangler (untuk local dev only)
npm install -g wrangler

# Login
wrangler login

# Set secret lokal (tidak deploy)
wrangler secret put GOOGLE_MAPS_API_KEY

# Run Workers local dev server (port 8787)
wrangler dev

# Run frontend local dev server (port 5173, terminal lain)
cd frontend
npm install
npm run dev
```

### ❌ DILARANG Build/Deploy di Lokal

- ❌ `npm run build` di lokal
- ❌ `wrangler deploy` di lokal
- ❌ `wrangler pages deploy` di lokal

**Semua build & deploy HANYA via GitHub Actions.**

---

## API Endpoint

### `POST /api/extract-address`

**Request**: `multipart/form-data`
- `screenshots` (File Array, max 5): Gambar screenshot pesanan

**Response**: `application/json`
```json
{
  "success": true,
  "data": [
    {
      "pickup": {
        "seller_name": "...",
        "address": { "street": "...", "number": "...", "rt_rw": "...", "full_address": "..." },
        "coordinates": { "lat": -6.12, "lng": 106.69, "formatted_address": "..." },
        "geocoding": { "source": "geocoding", "is_accurate": true, "warning": null }
      },
      "delivery": { ... }
    }
  ],
  "stats": { "total_orders": 1, "resolved_orders": 1, "failed_count": 0 }
}
```

---

## Biaya (Estimasi)

| Item | Free Tier | Estimasi/Bulan |
|------|-----------|----------------|
| Workers Requests | 100k/hari | $0 (< 10k req/bulan) |
| Workers AI (Gemma 4) | Terbatas | ~$0-5 |
| D1 | 5GB, 5M reads | $0 |
| KV | 100k reads/hari | $0 |
| Google Maps Geocoding | - | ~$5 |
| **Total** | | **< $10** |

---

## Tech Stack

- **Frontend**: React 19, Vite 6, Lucide React
- **Backend**: Cloudflare Workers (JavaScript, ES Modules)
- **AI OCR**: Workers AI — Gemma 4 Vision (`@cf/google/gemma-4-26b-a4b-it`)
- **Cache**: Cloudflare D1 (SQLite)
- **Rate Limit**: Cloudflare KV
- **Geocoding**: Google Maps Geocoding API + Places API (New)
- **CI/CD**: GitHub Actions + Wrangler

---

## Troubleshooting

### Workers AI Error
Pastikan project di-whitelist untuk Workers AI. Jika error, cek:
- `wrangler.toml` sudah include `[[ai]]` binding
- Model ID benar: `@cf/google/gemma-4-26b-a4b-it`

### Geocoding 403
- Pastikan `GOOGLE_MAPS_API_KEY` sudah di-set via secret
- API key harus enable: Geocoding API, Places API (New), Routes API

### D1 Error
- Pastikan D1 database sudah dibuat: `wrangler d1 create driver-maps-cache`
- Jalankan schema: `wrangler d1 execute driver-maps-cache --file=./schema.sql`

---

## License

Private — untuk penggunaan internal.

**Diperbarui**: Juni 2026
