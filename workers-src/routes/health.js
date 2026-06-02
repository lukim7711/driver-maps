/**
 * workers-src/routes/health.js
 * Health check endpoint.
 */

export function healthCheck() {
    return new Response(
        JSON.stringify({ status: 'OK', message: 'Driver Maps Backend is running.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}
