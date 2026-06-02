const { Firestore } = require('@google-cloud/firestore');
const crypto = require('crypto');

let db = null;
try {
    db = new Firestore();
} catch (err) {
    console.warn('Firestore init failed, caching disabled:', err.message);
}

const CACHE_COLLECTION = 'address_cache';
const CACHE_TTL_DAYS = parseInt(process.env.CACHE_TTL_DAYS || '30', 10);

function normalizeQuery(query) {
    if (!query) return '';
    return query
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getCacheKey(normalizedQuery) {
    return crypto.createHash('sha256').update(normalizedQuery).digest('hex');
}

async function getCachedAddress(normalizedQuery, apiType) {
    if (!db) return null;

    try {
        const docId = getCacheKey(normalizedQuery);
        const doc = await db.collection(CACHE_COLLECTION).doc(docId).get();

        if (!doc.exists) return null;

        const data = doc.data();
        const cached = data[apiType];

        if (!cached || !cached.lat || !cached.lng) return null;

        if (cached.cached_at) {
            const cachedTime = cached.cached_at instanceof Date
                ? cached.cached_at.getTime()
                : new Date(cached.cached_at._seconds * 1000).getTime();
            const daysSinceCache = (Date.now() - cachedTime) / (1000 * 60 * 60 * 24);
            if (daysSinceCache > CACHE_TTL_DAYS) {
                return null;
            }
        }

        try {
            await db.collection(CACHE_COLLECTION).doc(docId).update({
                hit_count: Firestore.FieldValue.increment(1),
                last_used: Firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            console.warn('Cache increment error:', err.message);
        }

        // Kembalikan seluruh metadata yang tersimpan, bukan hanya koordinat
        return cached;
    } catch (err) {
        console.warn('Cache read error:', err.message);
        return null;
    }
}

async function saveAddressToCache(normalizedQuery, apiType, result) {
    if (!db || !result || !result.lat || !result.lng) return;

    try {
        const docId = getCacheKey(normalizedQuery);
        const now = Firestore.FieldValue.serverTimestamp();

        // Simpan seluruh result object (termasuk metadata confidence)
        const cachePayload = {
            lat: result.lat,
            lng: result.lng,
            formatted_address: result.formatted_address || null,
            place_id: result.place_id || null,
            source: result.source || null,
            confidence: result.confidence || null,
            is_accurate: result.is_accurate || false,
            clean_query: result.clean_query || null,
            warning: result.warning || null,
            cached_at: now,
        };

        await db.collection(CACHE_COLLECTION).doc(docId).set({
            normalized_query: normalizedQuery,
            [`${apiType}`]: cachePayload,
            last_used: now,
            first_seen: Firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.log(`Cache SAVED for ${apiType}: ${normalizedQuery.substring(0, 40)}...`);
    } catch (err) {
        console.warn('Cache write error:', err.message);
    }
}

module.exports = {
    normalizeQuery,
    getCacheKey,
    getCachedAddress,
    saveAddressToCache
};
