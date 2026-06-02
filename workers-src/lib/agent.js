/**
 * workers-src/lib/agent.js
 * Integrasi dengan Cloudflare Workers AI (Gemma 4 Vision).
 * Menggunakan env.AI.run() untuk memanggil model vision.
 */

export async function extractAddressesFromImages(files, env) {
    const modelName = env.GEMINI_MODEL || '@cf/google/gemma-4-26b-a4b-it';

    if (!files || files.length === 0) {
        throw new Error('No files provided');
    }

    console.log(`Processing ${files.length} images via Workers AI (model: ${modelName})...`);

    // Convert files to data URI for Workers AI vision models
    const imageUrls = files.map(file => `data:${file.mimetype};base64,${file.base64}`);

    const prompt = `Tugas kamu adalah mengekstrak informasi alamat dari gambar screenshot pesanan (Ojol/Gojek/Grab/Shopee). Gambar bisa berjumlah lebih dari satu. Setiap gambar berisi 1 pesanan.

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
10. Jika gambar tidak berisi alamat, kembalikan null untuk pickup dan delivery.`;

    try {
        console.log(`Calling Workers AI with model: ${modelName}, images: ${imageUrls.length}`);

        // Gemma 4 vision: coba format prompt + image (seperti Llama 3.2 Vision)
        // Karena docs tidak menampilkan contoh vision call, kita coba beberapa format
        let response;

        // Format 1: messages + content array dengan image_url (OpenAI-style)
        try {
            console.log('Trying format: messages with image_url content');
            response = await env.AI.run(modelName, {
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            ...imageUrls.map(url => ({
                                type: 'image_url',
                                image_url: { url }
                            }))
                        ]
                    }
                ]
            });
            console.log('Format 1 response keys:', Object.keys(response));
        } catch (e1) {
            console.warn('Format 1 failed:', e1.message);

            // Format 2: prompt + image (Llama 3.2 Vision style)
            try {
                console.log('Trying format: prompt + image');
                response = await env.AI.run(modelName, {
                    prompt: prompt,
                    image: imageUrls
                });
                console.log('Format 2 response keys:', Object.keys(response));
            } catch (e2) {
                console.error('Format 2 also failed:', e2.message);
                throw e2;
            }
        }

        console.log('Workers AI full response preview:', JSON.stringify(response).substring(0, 500));

        // Workers AI response format: { response: "string" } untuk text generation
        // Untuk vision models, response shape mungkin berbeda
        let aiReply = response.response;

        // Jika response.response tidak ada, cek field lain
        if (!aiReply) {
            // Format OpenAI-style: { choices: [{ message: { content: "..." } }] }
            if (response.choices && Array.isArray(response.choices) && response.choices[0]) {
                const choice = response.choices[0];
                if (choice.message && choice.message.content) {
                    aiReply = choice.message.content;
                } else if (choice.text) {
                    aiReply = choice.text;
                }
            }
            // Fallback ke field umum
            if (!aiReply) {
                aiReply = response.text || response.description || response.content;
            }
        }

        if (!aiReply) {
            console.warn('Workers AI response missing text. Full response:', JSON.stringify(response).substring(0, 1000));
            return [];
        }

        try {
            const cleanJson = aiReply.replace(/```json/g, '').replace(/```/g, '').trim();
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
        console.error('Workers AI API error:', apiError.message);
        console.error('Full error:', JSON.stringify(apiError));
        throw apiError;
    }
}
