const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { extractAddressesFromImage } = require('./services/agent');
const { geocodeAddress, generateNavigationLink } = require('./services/maps');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Setup multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
    res.send({ status: 'OK', message: 'Ojol-Cuanbot Router Backend is running.' });
});

// Helper to resolve coordinates for a given API type
async function resolveCoordinatesForAPI(apiType, name, address) {
    const query = `${name}, ${address}`;
    const { geocodeAddress, searchPlaceText, validateAddressOffice } = require('./services/maps');
    
    try {
        if (apiType === 'geocoding') {
            return await geocodeAddress(query);
        } else if (apiType === 'places') {
            const res = await searchPlaceText(query);
            if (res) return { lat: res.lat, lng: res.lng, formatted_address: res.formatted_address };
            return await geocodeAddress(query);
        } else if (apiType === 'validation') {
            const res = await validateAddressOffice(query);
            if (res) return { lat: res.lat, lng: res.lng, formatted_address: res.formatted_address };
            return await geocodeAddress(query);
        }
    } catch (err) {
        console.warn(`Error resolving coordinate for ${apiType}:`, err.message);
    }
    return null;
}

// Helper to calculate the complete route for a given API type
async function calculateRouteForAPI(apiType, dataList, startLocation) {
    const { optimizeSmartRoute, computePolylineRoute, generateNavigationLink } = require('./services/maps');
    const validOrders = [];
    
    for (const data of dataList) {
        if (data && data.pickup && data.delivery) {
            const orderClone = JSON.parse(JSON.stringify(data));
            const pickupCoords = await resolveCoordinatesForAPI(apiType, orderClone.pickup.name, orderClone.pickup.address);
            const deliveryCoords = await resolveCoordinatesForAPI(apiType, orderClone.delivery.name, orderClone.delivery.address);
            
            if (pickupCoords && deliveryCoords) {
                orderClone.pickup.coordinates = pickupCoords;
                orderClone.delivery.coordinates = deliveryCoords;
                validOrders.push(orderClone);
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
        navigationLink = generateNavigationLink(rawCoordinates);
        routeDetails = await computePolylineRoute(rawCoordinates);
    }
    
    return {
        optimized_waypoints: optimizedPoints,
        route_details: routeDetails,
        navigation_link: navigationLink
    };
}

app.post('/api/extract-address', upload.array('screenshots', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).send({ error: 'No screenshots uploaded.' });
        }

        const filesToProcess = req.files.map(f => ({
            buffer: f.buffer,
            originalname: f.originalname
        }));
        
        const { extractAddressesFromImages } = require('./services/agent');
        const extractedDataArray = await extractAddressesFromImages(filesToProcess);

        const dataList = Array.isArray(extractedDataArray) ? extractedDataArray : [extractedDataArray];

        let startLocation = null;
        if (req.body.driver_lat && req.body.driver_lng) {
            startLocation = {
                lat: parseFloat(req.body.driver_lat),
                lng: parseFloat(req.body.driver_lng)
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

// React SPA Fallback
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        next();
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
