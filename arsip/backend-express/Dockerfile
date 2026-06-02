# Gunakan image Node.js yang ringan
FROM node:20-slim

# Tentukan direktori kerja di dalam container
WORKDIR /app

# Salin package.json dan package-lock.json terlebih dahulu
COPY package*.json ./

# Install hanya dependensi produksi untuk efisiensi ukuran container
RUN npm ci --only=production

# Invalidate cache agar file source selalu ter-copy fresh
RUN echo "cache-bust-v2-$(date +%s)"

# Salin seluruh berkas kode sumber backend
COPY . .

# Cloud Run akan menentukan port melalui env variable PORT (default ke 8080 di backend kita)
EXPOSE 8080

# Jalankan server backend
CMD ["node", "index.js"]
