/**
 * workers-src/lib/cache.js
 * Cache menggunakan Cloudflare D1 (SQLite at the edge).
 */

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

export async function getCachedAddress(normalizedQuery, env) {
    if (!normalizedQuery) return null;

    try {
        const row = await env.DB.prepare(
            'SELECT * FROM address_cache WHERE normalized_query = ?'
        ).bind(normalizedQuery).first();

        if (!row) return null;

        // Cek TTL
        if (row.cached_at) {
            const cachedTime = row.cached_at;
            const daysSinceCache = (Date.now() - cachedTime) / (1000 * 60 * 60 * 24);
            if (daysSinceCache > 30) {
                return null;
            }
        }

        // Update hit_count dan last_used
        await env.DB.prepare(
            'UPDATE address_cache SET hit_count = hit_count + 1, last_used = ? WHERE normalized_query = ?'
        ).bind(Date.now(), normalizedQuery).run();

        return {
            lat: row.lat,
            lng: row.lng,
            formatted_address: row.formatted_address,
            place_id: row.place_id,
            source: row.source,
            confidence: row.confidence ? JSON.parse(row.confidence) : {},
            is_accurate: row.is_accurate === 1,
            clean_query: row.clean_query,
            warning: row.warning,
        };
    } catch (err) {
        console.warn('Cache read error:', err.message);
        return null;
    }
}

export async function saveAddressToCache(normalizedQuery, result, env) {
    if (!normalizedQuery || !result || !result.lat || !result.lng) return;

    try {
        const now = Date.now();
        await env.DB.prepare(`
            INSERT OR REPLACE INTO address_cache
            (normalized_query, source, lat, lng, formatted_address, place_id,
             confidence, is_accurate, clean_query, warning, cached_at, last_used)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            normalizedQuery,
            result.source || null,
            result.lat,
            result.lng,
            result.formatted_address || null,
            result.place_id || null,
            JSON.stringify(result.confidence || {}),
            result.is_accurate ? 1 : 0,
            result.clean_query || null,
            result.warning || null,
            now,
            now
        ).run();

        console.log(`Cache SAVED: ${normalizedQuery.substring(0, 40)}...`);
    } catch (err) {
        console.warn('Cache write error:', err.message);
    }
}
