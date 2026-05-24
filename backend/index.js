const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { extractAddressesFromImages } = require('./services/agent');
const { geocodeAddress, searchPlaceText, validateAddressOffice, optimizeSmartRoute, computePolylineRoute, generateNavigationLink } = require('./services/maps');
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

async function resolveCoordinatesForAPI(apiType, name, address) {
    const query = `${name}, ${address}`;
    const normalized = normalizeQuery(query);

    const cached = await getCachedAddress(normalized, apiType);
    if (cached) {
        console.log(`Cache HIT for ${apiType}: ${query.substring(0, 40)}...`);
        return cached;
    }

    let result = null;
    try {
        if (apiType === 'geocoding') {
            result = await geocodeAddress(query);
        } else if (apiType === 'places') {
            result = await searchPlaceText(query);
            if (result) result = { lat: result.lat, lng: result.lng, formatted_address: result.formatted_address, place_id: result.place_id };
            else result = await geocodeAddress(query);
        } else if (apiType === 'validation') {
            result = await validateAddressOffice(query);
            if (result) result = { lat: result.lat, lng: result.lng, formatted_address: result.formatted_address, place_id: result.place_id };
            else result = await geocodeAddress(query);
        }
    } catch (err) {
        console.warn(`Error resolving coordinate for ${apiType}:`, err.message);
    }

    if (result) {
        await saveAddressToCache(normalized, apiType, result);
    }

    return result;
}

async function calculateRouteForAPI(apiType, dataList, startLocation) {
    const validOrders = [];

    for (const data of dataList) {
        if (data && data.pickup && data.delivery) {
            const orderData = { ...data };
            const pickupCoords = await resolveCoordinatesForAPI(apiType, orderData.pickup.name, orderData.pickup.address);
            const deliveryCoords = await resolveCoordinatesForAPI(apiType, orderData.delivery.name, orderData.delivery.address);

            if (pickupCoords && deliveryCoords) {
                orderData.pickup = { ...orderData.pickup, coordinates: pickupCoords };
                orderData.delivery = { ...orderData.delivery, coordinates: deliveryCoords };
                validOrders.push(orderData);
            }
        }
    }

    if (validOrders.length === 0) return null;

    let optimizedPoints = [];
    if (startLocation) {
        optimizedPoints = await optimizeSmartRoute(startLocation, validOrders);
    } else {
        for (let i = 0; i < validOrders.length; i++) {
            const order = validOrders[i];
            optimizedPoints.push({
                type: 'pickup',
                name: order.pickup.name,
                address: order.pickup.address,
                coordinates: order.pickup.coordinates,
                order_index: i
            });
            optimizedPoints.push({
                type: 'delivery',
                name: order.delivery.name,
                address: order.delivery.address,
                coordinates: order.delivery.coordinates,
                order_index: i
            });
        }
    }

    let routeDetails = null;
    let navigationLink = null;
    if (optimizedPoints.length >= 2) {
        const rawCoordinates = optimizedPoints.map(wp => wp.coordinates);
        navigationLink = generateNavigationLink(optimizedPoints);
        routeDetails = await computePolylineRoute(rawCoordinates);
    }

    return {
        optimized_waypoints: optimizedPoints,
        route_details: routeDetails,
        navigation_link: navigationLink
    };
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

        const extractedDataArray = await extractAddressesFromImages(filesToProcess);

        const dataList = Array.isArray(extractedDataArray) ? extractedDataArray : [extractedDataArray];

        let startLocation = null;
        if (req.body.driver_lat && req.body.driver_lng) {
            const latResult = validateGeoCoordinate(req.body.driver_lat, 'Driver latitude');
            const lngResult = validateGeoCoordinate(req.body.driver_lng, 'Driver longitude');

            if (!latResult.valid || !lngResult.valid) {
                const errors = [];
                if (!latResult.valid) errors.push(latResult.error);
                if (!lngResult.valid) errors.push(lngResult.error);
                return res.status(400).send({ error: 'Invalid driver coordinates', details: errors });
            }

            startLocation = {
                lat: latResult.value,
                lng: lngResult.value
            };
        }

        console.log('Calculating parallel routes for Geocoding and Places APIs...');
        const [geocodingRoute, placesRoute] = await Promise.all([
            calculateRouteForAPI('geocoding', dataList, startLocation),
            calculateRouteForAPI('places', dataList, startLocation)
        ]);

        res.status(200).send({
            success: true,
            data: dataList,
            routes: {
                geocoding: geocodingRoute,
                places: placesRoute
            }
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
