/**
 * address-parser.js
 * Modul untuk parsing, normalisasi, dan pembersihan alamat Indonesia.
 * Fokus: meningkatkan akurasi koordinat dengan query geocoding yang bersih dan spesifik.
 */

const ABBREVIATION_MAP = {
    'jl': 'Jalan',
    'jl.': 'Jalan',
    'jln': 'Jalan',
    'jln.': 'Jalan',
    'jalan': 'Jalan',
    'gg': 'Gang',
    'gg.': 'Gang',
    'gang': 'Gang',
    'no': 'No.',
    'no.': 'No.',
    'nomor': 'No.',
    'blok': 'Blok',
    'bl': 'Blok',
    'bl.': 'Blok',
    'rt': 'RT',
    'rt.': 'RT',
    'rw': 'RW',
    'rw.': 'RW',
    'kp': 'Kampung',
    'kp.': 'Kampung',
    'kampung': 'Kampung',
    'kel': 'Kelurahan',
    'kel.': 'Kelurahan',
    'kec': 'Kecamatan',
    'kec.': 'Kecamatan',
    'kota': 'Kota',
    'kab': 'Kabupaten',
    'kab.': 'Kabupaten',
    'prov': 'Provinsi',
    'prov.': 'Provinsi',
    'dki': 'DKI',
    'jkt': 'Jakarta',
    'jakarta': 'Jakarta',
};

/**
 * Normalisasi teks alamat dasar:
 * - Standarisasi singkatan (Jl, Gg, No, RT, RW, dll.)
 * - Bersihkan karakter tidak perlu
 * - Standarisasi RT/RW format
 */
function normalizeIndonesianAddress(text) {
    if (!text || typeof text !== 'string') return '';

    let cleaned = text
        .replace(/\s+/g, ' ')
        .replace(/\bRT\s*([\d\.\/]+)\s*\/\s*RW\s*([\d\.\/]+)\b/gi, (match, rt, rw) => {
            const rtClean = rt.replace(/\./g, '');
            const rwClean = rw.replace(/\./g, '');
            return `RT.${rtClean}/RW.${rwClean}`;
        })
        .replace(/\bRT\s*\.?\s*([\d]+)\b/gi, (match, rt) => `RT.${rt}`)
        .replace(/\bRW\s*\.?\s*([\d]+)\b/gi, (match, rw) => `RW.${rw}`)
        .trim();

    // Normalisasi singkatan dengan word boundary
    const tokens = cleaned.split(/\s+/);
    const normalizedTokens = tokens.map(token => {
        const lower = token.toLowerCase();
        if (ABBREVIATION_MAP[lower]) {
            // Pertahankan kapitalisasi asli jika token diawali huruf besar, selain singkatan
            if (token[0] === token[0].toUpperCase() && lower.length > 2) {
                return ABBREVIATION_MAP[lower];
            }
            return ABBREVIATION_MAP[lower];
        }
        return token;
    });

    let result = normalizedTokens.join(' ');

    // Standarisasi No. (spasi setelah titik)
    result = result.replace(/\bNo\.\s*/gi, 'No. ');

    return result.trim().replace(/\s+/g, ' ');
}

/**
 * Membangun query geocoding yang optimal dari komponen alamat terstruktur.
 * Prinsip: JANGAN sertakan nama bisnis/seller di query geocoding.
 * Gunakan hanya komponen alamat fisik (jalan, nomor, RT/RW, kelurahan, kota).
 */
function buildGeocodingQuery(structured) {
    const parts = [];

    if (structured.street) parts.push(structured.street);
    if (structured.number) parts.push(structured.number);
    if (structured.rt_rw) parts.push(structured.rt_rw);

    // Neighborhood: hanya gunakan jika bukan duplikat subdistrict dan tidak mengandung nomor rumah
    if (structured.neighborhood) {
        const n = structured.neighborhood.trim();
        // Skip jika neighborhood mengandung "No" atau nomor dalam kurung (itu building_info yang salah masuk)
        if (!n.match(/\bNo\.?\s*\d+/) && n !== structured.subdistrict) {
            parts.push(n);
        }
    }

    if (structured.subdistrict) {
        const s = structured.subdistrict.trim();
        // Hindari duplikasi jika neighborhood dan subdistrict sama
        // Hindari jika subdistrict mengandung nomor rumah dalam kurung (e.g., "Kalideres (No 80)")
        if (structured.neighborhood !== s && !s.match(/\bNo\.?\s*\d+/)) {
            parts.push(s);
        }
    }

    if (structured.city) parts.push(structured.city);
    if (structured.province) parts.push(structured.province);

    const query = parts.join(', ');
    return normalizeIndonesianAddress(query);
}

/**
 * Membangun alamat lengkap untuk ditampilkan ke user atau disimpan.
 */
function buildFullAddress(structured) {
    const parts = [];

    if (structured.street) parts.push(structured.street);
    if (structured.number) parts.push(structured.number);
    if (structured.building_info) parts.push(structured.building_info);
    if (structured.rt_rw) parts.push(structured.rt_rw);
    if (structured.neighborhood) parts.push(structured.neighborhood);
    if (structured.subdistrict && structured.subdistrict !== structured.neighborhood) {
        parts.push(structured.subdistrict);
    }
    if (structured.city) parts.push(structured.city);
    if (structured.province) parts.push(structured.province);
    if (structured.postal_code) parts.push(structured.postal_code);

    return parts.join(', ');
}

/**
 * Mencoba parse alamat bebas (dari Gemini OCR) menjadi komponen terstruktur.
 * Ini adalah best-effort parser berbasis regex untuk alamat Indonesia.
 */
function parseFreeformAddress(addressText) {
    if (!addressText) return null;

    const cleaned = normalizeIndonesianAddress(addressText);
    const structured = {
        raw: addressText,
        cleaned: cleaned,
        street: null,
        number: null,
        building_info: null,
        rt_rw: null,
        neighborhood: null,
        subdistrict: null,
        city: null,
        province: null,
        postal_code: null,
    };

    // Extract building info within parentheses FIRST, then remove from cleaned for street parsing
    const buildingMatch = cleaned.match(/\(([^)]+)\)/);
    if (buildingMatch) {
        structured.building_info = buildingMatch[1].trim();
    }
    // Remove parentheses and their content from cleaned string for street parsing
    let cleanedForStreet = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

    // Extract RT/RW
    const rtRwMatch = cleanedForStreet.match(/RT\.(\d+)\/RW\.(\d+)/i);
    if (rtRwMatch) {
        structured.rt_rw = `RT.${rtRwMatch[1]}/RW.${rtRwMatch[2]}`;
    }

    // Extract postal code (5 digits)
    const postalMatch = cleanedForStreet.match(/\b(\d{5})\b/);
    if (postalMatch) {
        structured.postal_code = postalMatch[1];
    }

    // Extract street and number using a more robust approach
    // Find the "Jalan ..." or "Gang ..." portion up to the first comma or RT/RW
    // Prefer match at START of string to avoid matching street names in building_info or patokan
    const streetPattern = /^(Jalan\s+[^,]+?)(?=\s+RT\.|\s+RW\.|,|$)/i;
    const streetMatch = cleanedForStreet.match(streetPattern);
    
    if (streetMatch) {
        let streetPart = streetMatch[1].trim();
        
        // Check if street part contains "No."
        const numInStreet = streetPart.match(/\s+No\.\s*(\S+)$/i);
        if (numInStreet) {
            structured.street = streetPart.replace(/\s+No\.\s*\S+$/i, '').trim();
            structured.number = `No. ${numInStreet[1]}`;
        } else {
            structured.street = streetPart;
        }
    }

    // If no "Jalan" found at start, try "Gang" at start
    if (!structured.street) {
        const gangPattern = /^(Gang\s+[^,]+?)(?=\s+RT\.|\s+RW\.|,|$)/i;
        const gangMatch = cleanedForStreet.match(gangPattern);
        if (gangMatch) {
            let gangPart = gangMatch[1].trim();
            const numInGang = gangPart.match(/\s+No\.\s*(\S+)$/i);
            if (numInGang) {
                structured.street = gangPart.replace(/\s+No\.\s*\S+$/i, '').trim();
                structured.number = `No. ${numInGang[1]}`;
            } else {
                structured.street = gangPart;
            }
        }
    }

    // If no "Jalan" or "Gang" at start, try "Kampung" at start
    if (!structured.street) {
        const kampungPattern = /^(Kampung\s+[^,]+?)(?=\s+RT\.|\s+RW\.|,|$)/i;
        const kampungMatch = cleanedForStreet.match(kampungPattern);
        if (kampungMatch) {
            let kampungPart = kampungMatch[1].trim();
            const numInKampung = kampungPart.match(/\s+No\.\s*(\S+)$/i);
            if (numInKampung) {
                structured.street = kampungPart.replace(/\s+No\.\s*\S+$/i, '').trim();
                structured.number = `No. ${numInKampung[1]}`;
            } else {
                structured.street = kampungPart;
            }
        }
    }

    // Fallback: if no street found at start, try anywhere BUT only if it's the FIRST street keyword in the string
    // This handles cases where the address doesn't start with Jalan/Gang/Kampung
    if (!structured.street) {
        const firstStreetPattern = /(?:^|,)\s*(Jalan\s+[^,]+?|Gang\s+[^,]+?|Kampung\s+[^,]+?)(?=\s+RT\.|\s+RW\.|,|$)/i;
        const firstStreetMatch = cleanedForStreet.match(firstStreetPattern);
        if (firstStreetMatch) {
            let streetPart = firstStreetMatch[1].trim();
            const numInStreet = streetPart.match(/\s+No\.\s*(\S+)$/i);
            if (numInStreet) {
                structured.street = streetPart.replace(/\s+No\.\s*\S+$/i, '').trim();
                structured.number = `No. ${numInStreet[1]}`;
            } else {
                structured.street = streetPart;
            }
        }
    }

    // Fallback: coba ekstrak nomor dari building_info jika number masih kosong
    // Contoh: "(No 80)" atau "depan warung (No 11)"
    if (!structured.number && structured.building_info) {
        const numInBuilding = structured.building_info.match(/\b(?:No\.?\s*|Nomor\s*)?(\d+[A-Za-z]?)\b/i);
        if (numInBuilding) {
            structured.number = `No. ${numInBuilding[1]}`;
        }
    }

    // Also extract standalone "No 123" or "no 123" patterns from full text if number still empty
    // This catches lowercase "no" without period that regex above might miss
    if (!structured.number) {
        const looseNumMatch = cleaned.match(/\b(?:No\.?|no\.?|Nomor|nomor)\s*(\d+[A-Za-z]?)\b/);
        if (looseNumMatch) {
            structured.number = `No. ${looseNumMatch[1]}`;
        }
    }

    // Extract neighborhood, subdistrict, city, province from comma-separated parts
    const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean);

    // Coba identifikasi komponen dari belakang
    const provinceKeywords = ['Jakarta', 'Jawa Barat', 'Jawa Timur', 'Jawa Tengah', 'Banten', 'DKI Jakarta', 'DI Yogyakarta'];
    const cityKeywords = ['Kota Jakarta', 'Kota Bandung', 'Kota Surabaya', 'Kabupaten', 'Kota'];

    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];

        // Province (biasanya paling belakang atau sebelum kode pos)
        if (!structured.province) {
            for (const prov of provinceKeywords) {
                if (part.toLowerCase().includes(prov.toLowerCase())) {
                    structured.province = prov;
                    break;
                }
            }
            // Fallback: jika ada "DKI" atau provinsi lain yang tidak di-list
            if (!structured.province && part.match(/\b(Jakarta|Jawa|Sumatera|Sulawesi|Kalimantan|Bali|NTT|NTB|Papua|Maluku|Aceh)\b/i)) {
                structured.province = part;
            }
        }

        // City
        if (!structured.city) {
            for (const city of cityKeywords) {
                if (part.toLowerCase().includes(city.toLowerCase())) {
                    structured.city = part;
                    break;
                }
            }
            // Jika ada "Kota ..." atau "Kabupaten ..."
            if (!structured.city && part.match(/\b(Kota|Kabupaten|Kecamatan|Kelurahan)\b/i)) {
                // Kecamatan/Kelurahan bukan kota, skip
                if (!part.match(/\bKota\b/i) && !part.match(/\bKabupaten\b/i)) {
                    continue;
                }
            }
        }

        // Subdistrict (Kecamatan) dan Neighborhood (Kelurahan)
        if (part.match(/\bKecamatan\b/i)) {
            structured.subdistrict = part.replace(/\bKecamatan\b/i, '').trim();
        } else if (part.match(/\bKelurahan\b/i)) {
            structured.neighborhood = part.replace(/\bKelurahan\b/i, '').trim();
        }
    }

    // Jika subdistrict belum terisi dan ada bagian yang mengandung nama kecamatan (biasanya sebelum kota)
    if (!structured.subdistrict && parts.length >= 3) {
        // Coba cari bagian yang mungkin kecamatan (biasanya 2-3 kata, sebelum kota)
        for (const part of parts) {
            if (part === structured.city || part === structured.province || part === structured.neighborhood) continue;
            if (part.match(/^(Jalan|Gang|RT|RW|No|Kelurahan|Kecamatan)/i)) continue;
            if (!structured.subdistrict && part.split(' ').length <= 3 && part.length > 2) {
                // Ini mungkin kecamatan atau kelurahan
                if (!structured.neighborhood) {
                    structured.neighborhood = part;
                } else if (!structured.subdistrict) {
                    structured.subdistrict = part;
                }
            }
        }
    }

    return structured;
}

/**
 * Mengecek apakah structured address memiliki komponen minimal yang cukup spesifik.
 * Alamat yang terlalu umum (hanya kota) akan ditolak.
 */
function hasMinimumSpecificity(structured) {
    if (!structured) return false;
    // Minimal harus ada jalan dan kota
    if (!structured.street && !structured.neighborhood) return false;
    if (!structured.city && !structured.province) return false;
    return true;
}

module.exports = {
    normalizeIndonesianAddress,
    buildGeocodingQuery,
    buildFullAddress,
    parseFreeformAddress,
    hasMinimumSpecificity,
};
