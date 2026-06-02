/**
 * workers-src/routes/extract-address.js
 * Main API endpoint: POST /api/extract-address
 * Upload gambar -> OCR (Workers AI Gemma 4) -> Geocoding -> Cache -> Response
 */

import { rateLimitCheck } from '../lib/rate-limit.js';
import { extractAddressesFromImages } from '../lib/agent.js';
import { smartGeocode } from '../lib/geocoder.js';
import { getCachedAddress, saveAddressToCache } from '../lib/cache.js';
import { normalizeIndonesianAddress } from '../lib/address-parser.js';
import { jsonResponse } from '../index.js';

async function asyncPool(concurrency, items, fn) {
    const results = [];
    const executing = [];
    for (const item of items) {
        const p = Promise.resolve().then(() => fn(item));
        results.push(p);
        if (items.length >= concurrency) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= concurrency) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(results);
}

export async function extractAddress(request, env, ctx) {
    // Rate limiting
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const rateLimit = await rateLimitCheck(env, ip);
    if (!rateLimit.allowed) {
        return jsonResponse({ error: 'Terlalu banyak permintaan, coba lagi nanti.' }, 429);
    }

    // Parse multipart form data
    let formData;
    try {
        formData = await request.formData();
    } catch (err) {
        return jsonResponse({ error: 'Invalid multipart form data' }, 400);
    }

    const files = formData.getAll('screenshots');
    if (!files || files.length === 0) {
        return jsonResponse({ error: 'No screenshots uploaded.' }, 400);
    }

    // Convert files to base64 for Workers AI
    const filesToProcess = [];
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // Maksimal 5MB per file

    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            return jsonResponse({ error: `File bukan gambar: ${file.name}` }, 400);
        }
        
        if (file.size > MAX_FILE_SIZE) {
            return jsonResponse({ error: `Ukuran file terlalu besar (Maksimal 5MB): ${file.name}` }, 400);
        }

        const buffer = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        filesToProcess.push({
            buffer,
            base64,
            mimetype: file.type,
            originalname: file.name,
        });
    }

    console.log(`Extracting addresses from ${filesToProcess.length} images via Workers AI...`);

    let extractedDataArray;
    try {
        extractedDataArray = await extractAddressesFromImages(filesToProcess, env);
    } catch (err) {
        console.error('OCR error:', err);
        return jsonResponse({ error: 'OCR gagal', details: err.message }, 500);
    }

    const dataList = Array.isArray(extractedDataArray) ? extractedDataArray : [extractedDataArray];
    console.log(`Extracted ${dataList.length} orders from images.`);

    // Resolve coordinates for each order
    const resolvedOrders = [];
    const allErrors = [];

    await asyncPool(3, dataList, async (orderData) => {
        if (!orderData || !orderData.pickup || !orderData.delivery) {
            allErrors.push({ reason: 'Data pesanan tidak lengkap dari OCR.' });
            return;
        }
        const { resolved, errors } = await resolveOrderCoordinates(orderData, env);
        resolvedOrders.push(resolved);
        if (errors.length > 0) allErrors.push(...errors);
    });

    // Filter orders that have both pickup and delivery coordinates
    const validOrders = resolvedOrders.filter(o => o.pickup.coordinates && o.delivery.coordinates);

    console.log(`Resolved ${validOrders.length}/${resolvedOrders.length} orders with coordinates.`);

    return jsonResponse({
        success: true,
        data: validOrders,
        failed_items: allErrors.length > 0 ? allErrors : undefined,
        stats: {
            total_orders: resolvedOrders.length,
            resolved_orders: validOrders.length,
            failed_count: allErrors.length,
        },
    });
}

async function resolveCoordinatesSmart(name, address, type, env) {
    const normalized = normalizeIndonesianAddress(address);

    // Check cache
    const cached = await getCachedAddress(normalized, env);
    if (cached) {
        console.log(`Cache HIT: ${address.substring(0, 40)}...`);
        return cached;
    }

    let result = null;
    try {
        result = await smartGeocode({ name, address, type, apiKey: env.GOOGLE_MAPS_API_KEY });
    } catch (err) {
        console.warn(`Error smart geocoding for ${type} ${name}:`, err.message);
    }

    if (result) {
        await saveAddressToCache(normalized, result, env);
    }

    return result;
}

async function resolveOrderCoordinates(orderData, env) {
    const resolved = JSON.parse(JSON.stringify(orderData)); // Deep copy
    const errors = [];

    // Resolve pickup
    try {
        const pickupResult = await resolveCoordinatesSmart(
            orderData.pickup.seller_name || orderData.pickup.name,
            orderData.pickup.address?.full_address || orderData.pickup.address,
            'pickup',
            env
        );

        if (pickupResult) {
            resolved.pickup.coordinates = {
                lat: pickupResult.lat,
                lng: pickupResult.lng,
                formatted_address: pickupResult.formatted_address,
                place_id: pickupResult.place_id,
            };
            resolved.pickup.geocoding = {
                source: pickupResult.source,
                confidence: pickupResult.confidence,
                is_accurate: pickupResult.is_accurate,
                clean_query: pickupResult.clean_query,
                warning: pickupResult.warning || null,
            };
        } else {
            errors.push({
                type: 'pickup',
                name: orderData.pickup.seller_name || orderData.pickup.name || 'Unknown',
                reason: 'Gagal mendapatkan koordinat alamat pickup.',
            });
        }
    } catch (err) {
        console.warn('Error resolving pickup:', err.message);
        errors.push({
            type: 'pickup',
            name: orderData.pickup.seller_name || orderData.pickup.name || 'Unknown',
            reason: `Error: ${err.message}`,
        });
    }

    // Resolve delivery
    try {
        const deliveryResult = await resolveCoordinatesSmart(
            orderData.delivery.customer_name || orderData.delivery.name,
            orderData.delivery.address?.full_address || orderData.delivery.address,
            'delivery',
            env
        );

        if (deliveryResult) {
            resolved.delivery.coordinates = {
                lat: deliveryResult.lat,
                lng: deliveryResult.lng,
                formatted_address: deliveryResult.formatted_address,
                place_id: deliveryResult.place_id,
            };
            resolved.delivery.geocoding = {
                source: deliveryResult.source,
                confidence: deliveryResult.confidence,
                is_accurate: deliveryResult.is_accurate,
                clean_query: deliveryResult.clean_query,
                warning: deliveryResult.warning || null,
            };
        } else {
            errors.push({
                type: 'delivery',
                name: orderData.delivery.customer_name || orderData.delivery.name || 'Unknown',
                reason: 'Gagal mendapatkan koordinat alamat delivery.',
            });
        }
    } catch (err) {
        console.warn('Error resolving delivery:', err.message);
        errors.push({
            type: 'delivery',
            name: orderData.delivery.customer_name || orderData.delivery.name || 'Unknown',
            reason: `Error: ${err.message}`,
        });
    }

    return { resolved, errors };
}
