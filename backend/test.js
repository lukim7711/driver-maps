const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

async function testOCR() {
    const imagePaths = process.argv.slice(2);
    
    if (imagePaths.length === 0) {
        console.error('Harap berikan path ke gambar screenshot! Contoh: node test.js ./sample1.jpg ./sample2.jpg');
        process.exit(1);
    }

    const form = new FormData();
    
    for (const imagePath of imagePaths) {
        if (!fs.existsSync(imagePath)) {
            console.error(`File tidak ditemukan: ${imagePath}`);
            process.exit(1);
        }
        form.append('screenshots', fs.createReadStream(imagePath));
    }
    
    // Simulate driver's current location (e.g., somewhere in West Jakarta)
    form.append('driver_lat', '-6.160000');
    form.append('driver_lng', '106.750000');

    try {
        console.log(`Mengirim ${imagePaths.length} file ke server backend...`);
        const response = await axios.post('http://localhost:8080/api/extract-address', form, {
            headers: {
                ...form.getHeaders()
            }
        });

        console.log('\n✅ BERHASIL!');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('\n❌ GAGAL!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

testOCR();
