// Cloudflare Pages Function: /api/[[path]]
// Proxy semua request /api/* ke Cloudflare Workers

const WORKER_URL = 'https://driver-maps-api.cfkim.workers.dev';

export async function onRequest(context) {
  const { request } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Bangun URL target ke Workers
  const url = new URL(request.url);
  const targetUrl = WORKER_URL + url.pathname + url.search;

  // Forward request dengan body dan headers
  const init = {
    method: request.method,
    headers: new Headers(request.headers),
    body: request.body,
  };

  // Hapus header Host agar Workers tidak bingung
  init.headers.delete('host');

  try {
    const response = await fetch(targetUrl, init);

    // Buat response baru dengan CORS headers
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    // Pastikan CORS headers ada
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    return newResponse;
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy error', details: err.message }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
