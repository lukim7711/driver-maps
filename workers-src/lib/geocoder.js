/**
 * workers-src/lib/geocoder.js
 * Smart geocoder dengan confidence scoring.
 * Menggunakan fetch() (Web Standard) bukan axios.
 */

import { buildGeocodingQuery, normalizeIndonesianAddress, parseFreeformAddress, hasMinimumSpecificity } from './address-parser.js';

const AXIOS_TIMEOUT = 15000;

const LOCATION_TYPE_PRIORITY = {
    'ROOFTOP': 4,
    'RANGE_INTERPOLATED': 3,
    'GEOMETRIC_CENTER': 2,
    'APPROXIMATE': 1,
};

const MIN_ACCEPTABLE_LOCATION_TYPE = 3;

async function fetchWithRetry(url, options, retries = 2) {
    let lastError;
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await fetch(url, { ...options, signal: AbortSignal.timeout(AXIOS_TIMEOUT) });
            return response;
        } catch (err) {
            lastError = err;
            if (i < retries) {
                await new Promise(r => setTimeout(r, Math.pow(2, i) * 500));
            }
        }
    }
    throw lastError;
}

async function geocodeViaGeocodingAPI(query, apiKey) {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', query);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('region', 'id');
    url.searchParams.set('components', 'country:ID');

    const response = await fetchWithRetry(url.toString(), {});
    const data = await response.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        console.warn(`Geocoding API failed: ${data.status} for query: ${query.substring(0, 60)}...`);
        return null;
    }

    let bestResult = null;
    let bestScore = -1;

    for (const r of data.results) {
        const locType = r.geometry?.location_type || 'APPROXIMATE';
        const score = LOCATION_TYPE_PRIORITY[locType] || 0;
        if (score > bestScore) {
            bestScore = score;
            bestResult = r;
        }
    }

    if (!bestResult) bestResult = data.results[0];

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
        },
        is_accurate: (LOCATION_TYPE_PRIORITY[locType] || 0) >= MIN_ACCEPTABLE_LOCATION_TYPE,
    };
}

async function geocodeViaPlacesAPI(query, apiKey) {
    const response = await fetchWithRetry('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types',
        },
        body: JSON.stringify({
            textQuery: query,
            languageCode: 'id',
            regionCode: 'id',
            rankPreference: 'DISTANCE',
        }),
    });

    const data = await response.json();

    if (!data.places || data.places.length === 0) {
        return null;
    }

    const place = data.places[0];
    const types = place.types || [];
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
        is_accurate: false,
    };
}

export async function smartGeocode({ address, name, type, apiKey }) {
    if (!address || typeof address !== 'string') {
        console.warn(`smartGeocode: alamat kosong untuk ${type} ${name || ''}`);
        return null;
    }

    const structured = parseFreeformAddress(address);
    console.log(`[smartGeocode] ${type} | ${name || 'Unknown'} | Parsed street: ${structured?.street || 'N/A'}`);

    if (!hasMinimumSpecificity(structured)) {
        console.warn(`[smartGeocode] ${type} | Alamat terlalu umum setelah parsing: ${address}`);
    }

    const cleanQuery = buildGeocodingQuery(structured);
    console.log(`[smartGeocode] ${type} | Clean query: ${cleanQuery}`);

    // 1. Geocoding API (primary)
    let result = null;
    try {
        result = await geocodeViaGeocodingAPI(cleanQuery, apiKey);
        if (result && result.is_accurate) {
            console.log(`[smartGeocode] ${type} | Geocoding API: AKURAT (${result.confidence.location_type})`);
            return { ...result, name, type, original_address: address, clean_query: cleanQuery, structured };
        } else if (result) {
            console.warn(`[smartGeocode] ${type} | Geocoding API: location_type rendah (${result.confidence.location_type}), mencoba fallback...`);
        }
    } catch (e) {
        console.warn(`[smartGeocode] ${type} | Geocoding API gagal:`, e.message);
    }

    // 2. Places API fallback
    try {
        const placeResult = await geocodeViaPlacesAPI(cleanQuery, apiKey);
        if (placeResult) {
            console.warn(`[smartGeocode] ${type} | Places API: digunakan sebagai fallback.`);
            if (result) {
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

    // 3. Return best result dengan warning jika kurang akurat
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
