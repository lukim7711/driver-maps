const { GoogleGenAI } = require('@google/genai');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const projectId = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
let location = process.env.LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

const ai = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location: location
});

/**
 * Calls the Vertex AI Gemini API directly with an array of image buffers.
 * @param {Array<{buffer: Buffer, originalname: string, mimetype: string}>} files
 */
async function extractAddressesFromImages(files) {
    if (!projectId) {
        throw new Error('PROJECT_ID must be set in .env');
    }

    if (!files || files.length === 0) {
        throw new Error('No files provided');
    }

    console.log(`Preparing ${files.length} images for Vertex AI Gemini (model: ${modelName})...`);

    const contentsParts = [];

    for (const file of files) {
        contentsParts.push({
            inlineData: {
                data: file.buffer.toString('base64'),
                mimeType: file.mimetype || 'image/jpeg'
            }
        });
    }

    contentsParts.push({
        text: `Tugas kamu adalah mengekstrak informasi alamat dari gambar screenshot pesanan (Ojol/Gojek/Grab/Shopee). Gambar bisa berjumlah lebih dari satu. Setiap gambar berisi 1 pesanan.

EKSTRAK ALAMAT SECARA TERSTRUKTUR. Jangan hanya kembalikan "alamat lengkap" dalam satu string.

Kembalikan jawaban secara ketat dalam format JSON ARRAY dengan skema PERSIS seperti ini (perhatikan komponen terpisah):

[
  {
    "pickup": {
      "seller_name": "Nama Toko/Seller",
      "address": {
        "street": "Nama Jalan (contoh: Jalan Tanjung Pura II)",
        "number": "Nomor rumah/toko (contoh: No. 11)",
        "building_info": "Info tambahan dalam kurung (contoh: No 11 pagar cokelat)",
        "rt_rw": "RT/RW (contoh: RT.5/RW.4)",
        "neighborhood": "Kelurahan (contoh: Kalideres)",
        "subdistrict": "Kecamatan (contoh: Kalideres)",
        "city": "Kota/Kabupaten (contoh: Kota Jakarta Barat)",
        "province": "Provinsi (contoh: DKI Jakarta)",
        "postal_code": "Kode Pos (jika ada, contoh: 11840)",
        "full_address": "Alamat lengkap sebagai satu string"
      }
    },
    "delivery": {
      "customer_name": "Nama Customer",
      "address": {
        "street": "Nama Jalan (contoh: Jalan Sumur Bor)",
        "number": "Nomor (contoh: No. 80)",
        "building_info": "Info tambahan dalam kurung",
        "rt_rw": "RT/RW",
        "neighborhood": "Kelurahan",
        "subdistrict": "Kecamatan",
        "city": "Kota/Kabupaten",
        "province": "Provinsi",
        "postal_code": "Kode Pos",
        "full_address": "Alamat lengkap sebagai satu string"
      }
    }
  }
]

PETUNJUK PENTING:
1. RT/RW sangat penting untuk akurasi lokasi di Indonesia. Pastikan diekstrak dengan benar.
2. "building_info" adalah info dalam kurung seperti (No 11 pagar cokelat), (No 80), dll.
3. "number" WAJIB diisi jika ada nomor rumah/toko. Cari nomor di dalam maupun di luar kurung. Contoh: "No. 11" atau dalam kurung "(No 80)".
4. Jika ada singkatan seperti "Jl.", ubah ke "Jalan".
5. Jika ada "Gg." atau "Gang", pastikan termasuk.
6. Kota dan Provinsi harus diekstrak dari bagian bawah alamat.
7. Jika kode pos tidak terlihat, kosongkan saja.
8. "full_address" harus berisi seluruh alamat asli yang terlihat di screenshot.
9. Jangan tambahkan informasi yang tidak ada di gambar.
10. Jika gambar tidak berisi alamat, kembalikan null untuk pickup dan delivery.
`
    });

    console.log('Sending request to Vertex AI API...');

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: contentsParts
        });

        if (!response || !response.text) {
            console.warn('Vertex AI response missing text content');
            return [];
        }

        let aiReply = response.text;

        try {
            const cleanJson = aiReply.replace(new RegExp('```json', 'g'), '').replace(new RegExp('```', 'g'), '').trim();
            const parsed = JSON.parse(cleanJson);
            if (Array.isArray(parsed)) {
                return parsed;
            }
            console.warn('AI response is not an array, returning as single-item array');
            return [parsed];
        } catch (e) {
            console.warn('Could not parse AI reply as JSON. Returning raw text.');
            return { raw_text: aiReply };
        }
    } catch (apiError) {
        console.error('Vertex AI API error:', apiError.message);
        throw apiError;
    }
}

module.exports = {
    extractAddressesFromImages
};
