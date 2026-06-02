/**
 * workers-src/lib/rate-limit.js
 * Rate limiting menggunakan Cloudflare KV.
 */

const RATE_LIMIT = 10;       // 10 requests
const RATE_WINDOW = 60;      // per 60 detik

export async function rateLimitCheck(env, ip) {
    const key = `rl:${ip}:${Math.floor(Date.now() / 1000 / RATE_WINDOW)}`;

    try {
        const current = parseInt(await env.RATE_LIMIT.get(key) || '0');

        if (current >= RATE_LIMIT) {
            return { allowed: false, retryAfter: RATE_WINDOW };
        }

        await env.RATE_LIMIT.put(key, String(current + 1), {
            expirationTtl: RATE_WINDOW * 2
        });

        return { allowed: true, remaining: RATE_LIMIT - current - 1 };
    } catch (err) {
        console.warn('Rate limit error:', err.message);
        // Jika KV gagal, izinkan request
        return { allowed: true, remaining: RATE_LIMIT };
    }
}
