const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { extractAddressesFromImages } = require('./services/agent');
const { smartGeocode } = require('./services/geocoder');
const { normalizeQuery, getCachedAddress, saveAddressToCache } = require('./services/cache');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.set('trust proxy', true);
const port = process.env.PORT || 8080;

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 5;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: MAX_FILES
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Hanya file gambar yang diizinkan'), false);
        }
    }
});

app.use(helmet({
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'", "https://*.basemaps.cartocdn.com", "https://unpkg.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://*.basemaps.cartocdn.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com", "https://*.basemaps.cartocdn.com"],
            styleSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "https://*.basemaps.cartocdn.com", "https://unpkg.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://*.basemaps.cartocdn.com", "https://unpkg.com"],
            frameSrc: ["https://www.google.com"]
        }
    }
}));

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
    res.send({ status: 'OK', message: 'Ojol-Cuanbot Router Backend is running.' });
});

const extractLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Terlalu banyak permintaan, coba lagi nanti.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: false
});

function validateGeoCoordinate(value, label) {
    const num = parseFloat(value);
    if (isNaN(num)) {
        return { valid: false, error: `${label} harus berupa angka` };
    }
    if (label.includes('lat') && (num < -90 || num > 90)) {
        return { valid: false, error: `Latitude harus antara -90 dan 90` };
    }
    if (label.includes('lng') && (num < -180 || num > 180)) {
        return { valid: false, error: `Longitude harus antara -180 dan 180` };
    }
    return { valid: true, value: num };
}

async function resolveCoordinatesSmart(name, address, type) {
    const normalized = normalizeQuery(address);

    // Cek cache terlebih dahulu
    const cached = await getCachedAddress(normalized, 'smart');
    if (cached) {
        console.log(`Cache HIT for smart geocode: ${address.substring(0, 40)}...`);
        return cached;
    }

    let result = null;
    try {
        result = await smartGeocode({ name, address, type });
    } catch (err) {
        console.warn(`Error smart geocoding for ${type} ${name}:`, err.message);
    }

    if (result) {
        await saveAddressToCache(normalized, 'smart', result);
    }

    return result;
}

/**
 * Helper to run async tasks with limited concurrency.
 */
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

async function resolveOrderCoordinates(orderData) {
    const resolved = { ...orderData };
    const errors = [];

    try {
        const pickupResult = await resolveCoordinatesSmart(
            orderData.pickup.seller_name || orderData.pickup.name,
            orderData.pickup.address?.full_address || orderData.pickup.address,
            'pickup'
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
        console.warn(`Error resolving pickup:`, err.message);
        errors.push({
            type: 'pickup',
            name: orderData.pickup.seller_name || orderData.pickup.name || 'Unknown',
            reason: `Error: ${err.message}`,
        });
    }

    try {
        const deliveryResult = await resolveCoordinatesSmart(
            orderData.delivery.customer_name || orderData.delivery.name,
            orderData.delivery.address?.full_address || orderData.delivery.address,
            'delivery'
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
        console.warn(`Error resolving delivery:`, err.message);
        errors.push({
            type: 'delivery',
            name: orderData.delivery.customer_name || orderData.delivery.name || 'Unknown',
            reason: `Error: ${err.message}`,
        });
    }

    return { resolved, errors };
}

app.post('/api/extract-address', extractLimiter, upload.array('screenshots', MAX_FILES), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).send({ error: 'No screenshots uploaded.' });
        }

        const filesToProcess = req.files.map(f => ({
            buffer: f.buffer,
            originalname: f.originalname,
            mimetype: f.mimetype
        }));

        console.log('Extracting addresses from images via Gemini...');
        const extractedDataArray = await extractAddressesFromImages(filesToProcess);

        const dataList = Array.isArray(extractedDataArray) ? extractedDataArray : [extractedDataArray];
        console.log(`Extracted ${dataList.length} orders from images.`);

        // Resolve coordinates for each order with smart geocoding
        const resolvedOrders = [];
        const allErrors = [];

        await asyncPool(3, dataList, async (orderData) => {
            if (!orderData || !orderData.pickup || !orderData.delivery) {
                allErrors.push({ reason: 'Data pesanan tidak lengkap dari OCR.' });
                return;
            }
            const { resolved, errors } = await resolveOrderCoordinates(orderData);
            resolvedOrders.push(resolved);
            if (errors.length > 0) allErrors.push(...errors);
        });

        // Filter orders that have both pickup and delivery coordinates
        const validOrders = resolvedOrders.filter(o => o.pickup.coordinates && o.delivery.coordinates);

        console.log(`Resolved ${validOrders.length}/${resolvedOrders.length} orders with coordinates.`);

        res.status(200).send({
            success: true,
            data: validOrders,
            failed_items: allErrors.length > 0 ? allErrors : undefined,
            stats: {
                total_orders: resolvedOrders.length,
                resolved_orders: validOrders.length,
                failed_count: allErrors.length,
            },
        });
    } catch (error) {
        console.error('Error extracting address:', error);
        res.status(500).send({ error: 'Internal Server Error', details: error.message });
    }
});

app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        next();
    }
});

app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).send({ error: `Ukuran file melebihi batas maksimum ${MAX_FILE_SIZE / (1024 * 1024)}MB` });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).send({ error: `Maksimum ${MAX_FILES} file yang diizinkan` });
    }
    if (err.message === 'Hanya file gambar yang diizinkan') {
        return res.status(400).send({ error: err.message });
    }
    console.error('Unhandled error:', err);
    res.status(500).send({ error: 'Internal Server Error', details: err.message });
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
