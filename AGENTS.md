# AGENTS.md

## Project overview

Monorepo yang terdiri dari:
- **Frontend**: React/Vite SPA, di-deploy ke **Cloudflare Pages**
- **Backend**: Cloudflare Workers (JavaScript), di-deploy ke **Cloudflare Workers**
- **LLM OCR**: Cloudflare Workers AI (Gemma 4 Vision)
- **Cache**: Cloudflare D1 (SQLite at the edge)
- **Rate Limit**: Cloudflare KV
- **Geocoding**: Google Maps Geocoding API (via fetch dari Workers)

**Fokus saat ini**: Akurasi penentuan titik koordinat dari screenshot pesanan Indonesia.

---

## ⛔ ATURAN BANGET: TIDAK ADA BUILD/DEPLOY DI LOKAL

**CRITICAL**: Build dan deploy dilakukan **HANYA** via **GitHub Actions** → otomatis ke Cloudflare. **DILARANG KERAS** menjalankan:
- ❌ `npm run build` di lokal
- ❌ `wrangler deploy` di lokal
- ❌ `wrangler pages deploy` di lokal
- ❌ `wrangler d1 execute` untuk production schema

**Workflow yang benar**:
1. Edit kode di lokal
2. `git add` dan `git commit`
3. `git push origin main`
4. GitHub Actions otomatis build & deploy

**Kecuali untuk development lokal**:
- ✅ `wrangler dev` (untuk testing Workers lokal)
- ✅ `npm run dev` di `frontend/` (untuk testing UI lokal)
- ✅ `wrangler d1 execute` dengan `--local` (untuk testing schema lokal)
- ✅ `wrangler secret put` (untuk set secret, tidak deploy)

---

## Commands (Lokal Development Only)

### Setup (hanya untuk development)
```bash
# Install Wrangler CLI (untuk local dev server)
npm install -g wrangler

# Login ke Cloudflare (perlu browser)
wrangler login
```

### Run Local Dev Server
```bash
# Backend (Workers) - port 8787
wrangler dev

# Frontend (Vite dev server) - port 5173
# Perlu 2 terminal:
# Terminal 1: cd frontend && npm run dev
# Terminal 2: wrangler dev
```

### Lint (frontend only)
```bash
cd frontend && npm run lint
```

---

## GitHub Actions Workflow

**Setup awal** (satu kali):

1. Buat Cloudflare API Token di [Dashboard](https://dash.cloudflare.com/profile/api-tokens) dengan permissions:
   - Account: Workers Scripts:Edit, Workers KV Storage:Edit, D1:Edit, Pages:Edit
2. Dapatkan Cloudflare Account ID dari Dashboard sidebar
3. Di GitHub repo → Settings → Secrets and variables → Actions, tambahkan:
   - `CLOUDFLARE_API_TOKEN` — Cloudflare API token
   - `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID
   - `GOOGLE_MAPS_API_KEY` — Google Maps API key (dengan Geocoding & Places API enabled)

**Workflow otomatis** (`.github/workflows/deploy.yml`):

Saat push ke branch `main`:
1. **Job 1: deploy-workers**
   - Apply D1 schema ke remote database
   - Set Google Maps API Key secret
   - Deploy Workers via `wrangler deploy`
2. **Job 2: deploy-pages** (setelah workers sukses)
   - Install dependencies
   - Build frontend (`npm run build` di `frontend/`)
   - Deploy `frontend/dist` ke Cloudflare Pages

**Push kode baru**:
```bash
git add .
git commit -m "feat: deskripsi perubahan"
git push origin main
# Tunggu GitHub Actions selesai (cek di tab Actions)
```

---

## Architecture notes

- **No TypeScript** — semua plain JS/JSX.
- **No test suite** — placeholder di package.json. Test manual via curl/Postman atau browser.
- **No build lokal** — build & deploy via GitHub Actions only.
- **Workers AI (Gemma 4 Vision)** — OCR multimodal untuk screenshot pesanan. Model ID: `@cf/google/gemma-4-26b-a4b-it`.
- **Smart geocoding** — Geocoding API primary + Places API fallback, confidence scoring berdasarkan `location_type`.
- **Address Parser** (`workers-src/lib/address-parser.js`) — Parser regex untuk alamat Indonesia.
- **Query cleaning** — geocoding query TIDAK mengandung nama seller, hanya komponen alamat fisik.
- **Geocoding API strict filter** — `components=country:ID`.
- **Cache metadata** — D1 menyimpan `source`, `confidence`, `is_accurate`, `warning`.
- **Rate limiting** — KV-based, 10 req/menit per IP.
- **Frontend SPA** — React/Vite, UI sederhana (upload + tabel hasil).
- **Old files archived** — `arsip/` berisi backend Express, TSP solver, dan deploy script lama.

---

## Environment Variables (Secrets)

Di-set via GitHub Actions secrets:
- `CLOUDFLARE_API_TOKEN` — untuk deploy via wrangler
- `CLOUDFLARE_ACCOUNT_ID` — untuk Pages deploy
- `GOOGLE_MAPS_API_KEY` — untuk Geocoding API

Lokal dev: `wrangler secret put GOOGLE_MAPS_API_KEY`

---

## Language conventions

- Code identifiers dan API names dalam bahasa Inggris.
- UI text, README, code comments, dan Gemini prompts dalam **Bahasa Indonesia**.

---

## OpenCode agents

Custom subagents ada di `.opencode/agents/`: `docs-writer`, `review`, `security-auditor`.

---

## Security

- `.env` dan `sa-key.json` di-gitignore.
- **JANGAN commit secrets ke repo**.
- Semua secrets diatur via GitHub Actions secrets atau `wrangler secret put` (lokal dev only).
