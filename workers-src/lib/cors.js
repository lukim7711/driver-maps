/**
 * workers-src/lib/cors.js
 * Helpers untuk CORS (Cross-Origin Resource Sharing).
 */

const ALLOWED_ORIGINS = [
  'https://driver-maps.pages.dev',
  'https://www.driver-maps.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000'
];

export function corsHeaders(origin = '*') {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

export function handleCors(response, requestOrigin = '*') {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(requestOrigin);
  Object.entries(cors).forEach(([key, val]) => headers.set(key, val));
  return new Response(response.body, { status: response.status, headers });
}
