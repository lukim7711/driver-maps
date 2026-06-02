/**
 * workers-src/index.js
 * Entry point untuk Cloudflare Workers.
 * Router sederhana untuk API koordinat akurat.
 */

import { handleCors, corsHeaders } from './lib/cors.js';
import { healthCheck } from './routes/health.js';
import { extractAddress } from './routes/extract-address.js';

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    try {
      // Routing
      if (url.pathname === '/health') {
        return handleCors(healthCheck());
      }

      if (url.pathname === '/api/extract-address' && request.method === 'POST') {
        return handleCors(await extractAddress(request, env, ctx));
      }

      return handleCors(new Response('Not Found', { status: 404 }));
    } catch (err) {
      console.error('Unhandled error:', err);
      return handleCors(
        jsonResponse({ error: 'Internal Server Error', details: err.message }, 500)
      );
    }
  }
};

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
