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
        text: `Tugas kamu adalah mengekstrak informasi alamat dari gambar-gambar screenshot pesanan. Gambar bisa berjumlah lebih dari satu. Kembalikan jawaban secara ketat dalam format JSON ARRAY dengan skema persis seperti ini (berisi daftar pesanan sesuai jumlah gambar):
        [
          {
            "pickup": {
              "name": "Nama Seller/Toko",
              "address": "Alamat Lengkap Seller"
            },
            "delivery": {
              "name": "Nama Customer/Pembeli",
              "address": "Alamat Lengkap Customer"
            }
          }
        ]`
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
        console.error('Vertex AI API error:', apiError.message);
        throw apiError;
    }
}

module.exports = {
    extractAddressesFromImages
};
