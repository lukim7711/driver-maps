const { GoogleGenAI } = require('@google/genai');
const path = require('path');
const dotenvResult = require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
console.log('AGENT_JS_INIT: dotenvResult =', dotenvResult);
console.log('AGENT_JS_INIT: env =', {
    PROJECT_ID: process.env.PROJECT_ID,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
    LOCATION: process.env.LOCATION,
    GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION
});

// Configuration
const projectId = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
let location = process.env.LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const modelName = 'gemini-3.1-flash-lite';

// Initialize the new Google Gen AI SDK for Vertex AI
const ai = new GoogleGenAI({ 
    vertexai: true,
    project: projectId, 
    location: location 
});

/**
 * Calls the Vertex AI Gemini API directly with an array of image buffers.
 * @param {Array<{buffer: Buffer, originalname: string}>} files 
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

    // Add each image as a separate inlineData part
    for (const file of files) {
        contentsParts.push({
            inlineData: {
                data: file.buffer.toString('base64'),
                mimeType: 'image/jpeg' // Assume JPEG, or detect from mimetype if available
            }
        });
    }

    // Add the text instruction part at the end
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
    
    const response = await ai.models.generateContent({
        model: modelName,
        contents: contentsParts
    });
    
    let aiReply = response.text;

    // Try to parse the response as JSON
    try {
        const cleanJson = aiReply.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.warn('Could not parse agent reply as JSON directly. Returning raw text.');
        return { raw_text: aiReply };
    }
}

module.exports = {
    extractAddressesFromImages
};
