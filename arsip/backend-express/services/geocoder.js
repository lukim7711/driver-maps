/**
 * geocoder.js
 * Modul geocoding terstruktur dengan prioritas akurasi tinggi.
 * Strategi untuk Indonesia:
 *   1. Geocoding API (primary) - dengan query bersih, cek location_type
 *   2. Places API Text Search (fallback) - untuk bisnis terdaftar
 *   3. Semua hasil di-scoring berdasarkan location_type.
 *
 * NOTE: Address Validation API tidak mendukung region Indonesia (ID),
 * sehingga tidak digunakan. Lihat: https://developers.google.com/maps/documentation/address-validation/coverage
 */

const axios = require('axios');
const {
    buildGeocodingQuery,
    normalizeIndonesianAddress,
    parseFreeformAddress,
    hasMinimumSpecificity,
} = require('./address-parser');

const AXIOS_TIMEOUT = 15000;

// Prioritas location_type dari Geocoding API (semakin tinggi = semakin spesifik)
const LOCATION_TYPE_PRIORITY = {
    'ROOFTOP': 4,
    'RANGE_INTERPOLATED': 3,
    'GEOMETRIC_CENTER': 2,
    'APPROXIMATE': 1,
};

// Ambang batas minimum yang diterima (skor >= ini baru dianggap akurat)
const MIN_ACCEPTABLE_LOCATION_TYPE = 3; // RANGE_INTERPOLATED atau lebih spesifik

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_MAPS_API_KEY) {
    console.error('CRITICAL: GOOGLE_MAPS_API_KEY is not set in environment.');
}

/* ============================================================
 *  Helper: fetch dengan retry
 * ============================================================ */
async function fetchWithRetry(fn, retries = 2) {
    let lastError;
    for (let i = 0; i <= retries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (i < retries) {
                const delay = Math.pow(2, i) * 500; // 500ms, 1000ms
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    throw lastError;
}

/* ============================================================
 *  API 1: Geocoding API (Primary for Indonesia)
 * ============================================================ */
async function geocodeViaGeocodingAPI(query) {
    if (!GOOGLE_MAPS_API_KEY) return null;

    try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
                address: query,
                key: GOOGLE_MAPS_API_KEY,
                region: 'id',
                components: 'country:ID', // Strict: hanya Indonesia
            },
            timeout: AXIOS_TIMEOUT,
        });

        if (response.data.status !== 'OK' || response.data.results.length === 0) {
            console.warn(`Geocoding API failed: ${response.data.status} for query: ${query.substring(0, 60)}...`);
            return null;
        }

        // Ambil result dengan location_type terbaik, bukan cuma results[0]
        let bestResult = null;
        let bestScore = -1;

        for (const r of response.data.results) {
            const locType = r.geometry?.location_type || 'APPROXIMATE';
            const score = LOCATION_TYPE_PRIORITY[locType] || 0;
            if (score > bestScore) {
                bestScore = score;
                bestResult = r;
            }
        }

        if (!bestResult) bestResult = response.data.results[0];

        const locType = bestResult.geometry?.location_type || 'APPROXIMATE';
        const location = bestResult.geometry.location;

        return {
            lat: location.lat,
            lng: location.lng,
            formatted_address: bestResult.formatted_address,
            place_id: bestResult.place_id,
            source: 'geocoding',
            confidence: {
                location_type: locType,
                location_type_score: LOCATION_TYPE_PRIORITY[locType] || 0,
                partial_match: bestResult.partial_match || false,
                viewport: bestResult.geometry.viewport || null,
            },
            is_accurate: (LOCATION_TYPE_PRIORITY[locType] || 0) >= MIN_ACCEPTABLE_LOCATION_TYPE,
        };
    } catch (error) {
        console.error('Geocoding API error:', error.message);
        return null;
    }
}

/* ============================================================
 *  API 2: Places API (New) Text Search (Fallback)
 * ============================================================ */
async function geocodeViaPlacesAPI(query) {
    if (!GOOGLE_MAPS_API_KEY) return null;

    try {
        const response = await axios.post('https://places.googleapis.com/v1/places:searchText', {
            textQuery: query,
            languageCode: 'id',
            regionCode: 'id',
            rankPreference: 'DISTANCE',
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types',
            },
            timeout: AXIOS_TIMEOUT,
        });

        if (!response.data?.places || response.data.places.length === 0) {
            return null;
        }

        const place = response.data.places[0];
        const types = place.types || [];

        // Places API kurang akurat untuk alamat rumah spesifik.
        const isStreetAddress = types.some(t =>
            t.includes('street_address') ||
            t.includes('premise') ||
            t.includes('subpremise')
        );

        return {
            lat: place.location.latitude,
            lng: place.location.longitude,
            formatted_address: place.formattedAddress,
            place_id: place.id,
            source: 'places',
            confidence: {
                place_types: types,
                is_street_address: isStreetAddress,
                location_type_score: isStreetAddress ? 2 : 1,
            },
            is_accurate: false, // Places API tidak dipercaya untuk akurasi tinggi
        };
    } catch (error) {
        console.error('Places API error:', error.message);
        if (error.response?.data) {
            console.error('Details:', JSON.stringify(error.response.data, null, 2));
        }
        return null;
    }
}

/* ============================================================
 *  Master function: Smart Geocode with fallback & scoring
 * ============================================================ */
/**
 * Melakukan geocoding alamat dengan strategi multi-API dan confidence scoring.
 * @param {Object} params - Parameter geocoding
 * @param {string} params.address - Alamat bebas (dari OCR)
 * @param {string} params.name - Nama seller/customer (TIDAK digunakan untuk query geocoding)
 * @param {string} params.type - 'pickup' atau 'delivery'
 * @returns {Promise<Object|null>} Hasil geocoding dengan confidence, atau null jika gagal.
 */
async function smartGeocode({ address, name, type }) {
    if (!address || typeof address !== 'string') {
        console.warn(`smartGeocode: alamat kosong untuk ${type} ${name || ''}`);
        return null;
    }

    // 1. Parse alamat bebas ke komponen terstruktur
    const structured = parseFreeformAddress(address);
    console.log(`[smartGeocode] ${type} | ${name || 'Unknown'} | Parsed street: ${structured?.street || 'N/A'}`);

    // 2. Cek apakah alamat cukup spesifik
    if (!hasMinimumSpecificity(structured)) {
        console.warn(`[smartGeocode] ${type} | Alamat terlalu umum setelah parsing: ${address}`);
    }

    // 3. Bangun query bersih (TANPA nama seller!)
    const cleanQuery = buildGeocodingQuery(structured);
    console.log(`[smartGeocode] ${type} | Clean query: ${cleanQuery}`);

    // 4. Coba Geocoding API (primary)
    let result = null;
    try {
        result = await fetchWithRetry(() => geocodeViaGeocodingAPI(cleanQuery));
        if (result && result.is_accurate) {
            console.log(`[smartGeocode] ${type} | Geocoding API: AKURAT (${result.confidence.location_type})`);
            return {
                ...result,
                name,
                type,
                original_address: address,
                clean_query: cleanQuery,
                structured,
            };
        } else if (result) {
            console.warn(`[smartGeocode] ${type} | Geocoding API: location_type rendah (${result.confidence.location_type}), mencoba fallback...`);
        }
    } catch (e) {
        console.warn(`[smartGeocode] ${type} | Geocoding API gagal:`, e.message);
    }

    // 5. Fallback ke Places API Text Search
    try {
        const placeResult = await fetchWithRetry(() => geocodeViaPlacesAPI(cleanQuery));
        if (placeResult) {
            console.warn(`[smartGeocode] ${type} | Places API: digunakan sebagai fallback.`);
            // Jika Geocoding API sudah memberikan hasil (meskipun kurang akurat), bandingkan dengan Places API
            if (result) {
                // Pilih yang memiliki location_type_score lebih tinggi
                const geoScore = result.confidence?.location_type_score || 0;
                const placeScore = placeResult.confidence?.location_type_score || 0;
                if (placeScore > geoScore) {
                    result = placeResult;
                }
            } else {
                result = placeResult;
            }
        }
    } catch (e) {
        console.warn(`[smartGeocode] ${type} | Places API gagal:`, e.message);
    }

    // 6. Jika semua gagal atau tidak akurat, gunakan hasil terbaik dengan peringatan
    if (result) {
        const isAccurate = (result.confidence?.location_type_score || 0) >= MIN_ACCEPTABLE_LOCATION_TYPE;
        console.warn(`[smartGeocode] ${type} | Hasil terbaik: ${result.source} (${result.confidence?.location_type || 'N/A'}). Akurat: ${isAccurate}`);
        return {
            ...result,
            name,
            type,
            original_address: address,
            clean_query: cleanQuery,
            structured,
            warning: isAccurate ? null : 'Koordinat mungkin kurang akurat (meleset 300-500m). Verifikasi di lapangan.',
        };
    }

    console.error(`[smartGeocode] ${type} | SEMUA geocoding gagal untuk: ${address}`);
    return null;
}

/* ============================================================
 *  Public API
 * ============================================================ */
module.exports = {
    smartGeocode,
    geocodeViaGeocodingAPI,
    geocodeViaPlacesAPI,
    parseFreeformAddress,
    buildGeocodingQuery,
    normalizeIndonesianAddress,
    hasMinimumSpecificity,
    LOCATION_TYPE_PRIORITY,
    MIN_ACCEPTABLE_LOCATION_TYPE,
};
