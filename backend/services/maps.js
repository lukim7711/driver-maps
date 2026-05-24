const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const AXIOS_TIMEOUT = 15000;
const AVG_SPEED_MPS = 8.33; // 30 km/h in m/s for Haversine fallback

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Converts a text address to Latitude and Longitude using Google Maps Geocoding API.
 * @param {string} address The physical address to geocode.
 * @returns {Promise<{lat: number, lng: number} | null>} The coordinates, or null if not found.
 */
async function geocodeAddress(address) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        throw new Error('GOOGLE_MAPS_API_KEY is not set in .env');
    }

    if (!address) return null;

    try {
        console.log(`Geocoding address: ${address.substring(0, 30)}...`);
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
                address: address,
                key: apiKey,
                region: 'id',
            },
            timeout: AXIOS_TIMEOUT
        });

        if (response.data.status === 'OK' && response.data.results.length > 0) {
            const location = response.data.results[0].geometry.location;
            return {
                lat: location.lat,
                lng: location.lng,
                formatted_address: response.data.results[0].formatted_address,
                place_id: response.data.results[0].place_id
            };
        } else {
            console.warn(`Geocoding failed for address: ${address}. Status: ${response.data.status}`);
            return null;
        }
    } catch (error) {
        console.error('Error during geocoding:', error.message);
        return null;
    }
}

/**
 * Fetches the route matrix for a list of points using the modern Routes API.
 * @param {Array<{lat: number, lng: number}>} points 
 * @returns {Promise<any>} The route matrix data array
 */
async function getRouteMatrix(points) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is not set in .env');
    
    if (!points || points.length < 2) return null;

    const origins = points.map(p => ({
        waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } },
        routeModifiers: {
            avoidTolls: true,
            avoidHighways: true
        }
    }));

    const destinations = points.map(p => ({
        waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } }
    }));
    
    // Mitigasi batasan TRAFFIC_AWARE_OPTIMAL: origins * destinations <= 100
    const numPoints = points.length;
    const useOptimal = (numPoints * numPoints) <= 100;
    const routingPreference = useOptimal ? 'TRAFFIC_AWARE_OPTIMAL' : 'TRAFFIC_AWARE';
    
    try {
        console.log(`Fetching Route Matrix (Routes API) for ${points.length} points (routingPreference: ${routingPreference})...`);
        const response = await axios.post('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
            origins: origins,
            destinations: destinations,
            travelMode: 'TWO_WHEELER',
            routingPreference: routingPreference
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,status'
            },
            timeout: AXIOS_TIMEOUT
        });

        // computeRouteMatrix may return NDJSON (newline-delimited JSON) in some contexts.
        let matrixData = response.data;
        if (typeof matrixData === 'string' && matrixData.trim().length > 0) {
            try {
                matrixData = matrixData.split('\n').filter(line => line.trim().length > 0).map(JSON.parse);
            } catch (parseErr) {
                console.error('Failed to parse NDJSON route matrix response:', parseErr.message);
                return null;
            }
        }
        return matrixData;
    } catch (error) {
        console.error('Error fetching route matrix:', error.message);
        if (error.response && error.response.data) {
            console.error('Detailed route matrix error:', JSON.stringify(error.response.data, null, 2));
        }
        return null;
    }
}

// Helper to generate permutations
function generatePermutations(arr) {
    if (arr.length === 0) return [[]];
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const rest = generatePermutations(arr.slice(0, i).concat(arr.slice(i + 1)));
        for (const p of rest) {
            result.push([arr[i]].concat(p));
        }
    }
    return result;
}

/**
 * Calculates the great-circle distance between two points on the Earth using the Haversine formula.
 * @param {{lat: number, lng: number}} p1
 * @param {{lat: number, lng: number}} p2
 * @returns {number} Distance in meters
 */
function getHaversineDistance(p1, p2) {
    const R = 6371e3; // Earth radius in meters
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLng = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Optimizes the route ensuring pickups happen before deliveries.
 * @param {{lat: number, lng: number}} startLocation Driver's current location
 * @param {Array<{pickup: {coordinates: {lat: number, lng: number}}, delivery: {coordinates: {lat: number, lng: number}}}>} orders
 * @returns {Promise<Array<{lat: number, lng: number}>>} Optimized ordered points
 */
async function optimizeSmartRoute(startLocation, orders) {
    if (!startLocation || !orders || orders.length === 0) return [];

    // 1. Build points array and define rules
    const points = [startLocation];
    const rules = []; // { pickupIdx, deliveryIdx }

    for (const order of orders) {
        points.push(order.pickup.coordinates);
        const pIdx = points.length - 1;
        
        points.push(order.delivery.coordinates);
        const dIdx = points.length - 1;
        
        rules.push({ pIdx, dIdx });
    }

    // 2. Fetch Route Matrix (or fallback to local Haversine)
    let durationMap = {};
    let matrixSuccess = false;

    try {
        const matrix = await getRouteMatrix(points);
        if (matrix && Array.isArray(matrix)) {
            for (const item of matrix) {
                const oIdx = item.originIndex || 0;
                const dIdx = item.destinationIndex || 0;
                if (!durationMap[oIdx]) durationMap[oIdx] = {};
                
                // Duration format is like "120s"
                if (item.duration) {
                    durationMap[oIdx][dIdx] = parseInt(item.duration.replace('s', ''));
                } else {
                    durationMap[oIdx][dIdx] = Infinity; // Path invalid or error
                }
            }
            matrixSuccess = true;
        }
    } catch (error) {
        console.warn("Could not get route matrix, falling back to local optimization:", error.message);
    }

    if (!matrixSuccess) {
        console.log("Using local Haversine distance matrix fallback for route optimization...");
        durationMap = {};
        for (let i = 0; i < points.length; i++) {
            durationMap[i] = {};
            for (let j = 0; j < points.length; j++) {
                if (i === j) {
                    durationMap[i][j] = 0;
                } else {
                    const dist = getHaversineDistance(points[i], points[j]);
                    durationMap[i][j] = dist / AVG_SPEED_MPS;
                }
            }
        }
    }

    // 3. Route optimization: brute-force for small N, greedy heuristic for large N
    let bestRoute = null;
    let minDuration = Infinity;

    if (orders.length <= 3) {
        // Brute-force is feasible up to 6 order points (3 orders = 720 permutations)
        const indicesToPermute = [];
        for (let i = 1; i < points.length; i++) {
            indicesToPermute.push(i);
        }
        
        const permutations = generatePermutations(indicesToPermute);
        
        // 4. Evaluate permutations
        for (const perm of permutations) {
            const fullRoute = [0, ...perm];
            
            let isValid = true;
            for (const rule of rules) {
                const pPos = fullRoute.indexOf(rule.pIdx);
                const dPos = fullRoute.indexOf(rule.dIdx);
                if (pPos > dPos) {
                    isValid = false;
                    break;
                }
            }

            if (isValid) {
                let totalDuration = 0;
                for (let i = 0; i < fullRoute.length - 1; i++) {
                    const originIdx = fullRoute[i];
                    const destIdx = fullRoute[i+1];
                    
                    const duration = durationMap[originIdx] && durationMap[originIdx][destIdx];
                    if (duration !== undefined) {
                        totalDuration += duration;
                    } else {
                        totalDuration += Infinity;
                    }
                }

                if (totalDuration < minDuration) {
                    minDuration = totalDuration;
                    bestRoute = fullRoute;
                }
            }
        }
    } else {
        // Greedy Nearest Neighbor heuristic for larger N to prevent event-loop blocking
        const allIndices = [];
        for (let i = 1; i < points.length; i++) allIndices.push(i);
        
        const pickupToDelivery = {};
        const isDelivery = new Set();
        for (const rule of rules) {
            pickupToDelivery[rule.pIdx] = rule.dIdx;
            isDelivery.add(rule.dIdx);
        }
        
        const visited = new Set([0]);
        bestRoute = [0];
        let current = 0;
        minDuration = 0;
        
        while (visited.size < points.length) {
            let nearestIdx = -1;
            let nearestDuration = Infinity;
            
            for (const idx of allIndices) {
                if (visited.has(idx)) continue;
                if (isDelivery.has(idx) && !visited.has(pickupToDelivery[idx])) continue;
                
                const d = durationMap[current] && durationMap[current][idx];
                const dur = (d !== undefined ? d : Infinity);
                if (dur < nearestDuration) {
                    nearestDuration = dur;
                    nearestIdx = idx;
                }
            }
            
            if (nearestIdx === -1) {
                console.error('TSP heuristic stuck: no valid next point. Falling back to partial route.');
                break;
            }
            
            bestRoute.push(nearestIdx);
            visited.add(nearestIdx);
            minDuration += nearestDuration;
            current = nearestIdx;
        }
    }

    console.log(`Optimization complete. Best route duration: ${Math.round(minDuration/60)} mins.`);

    // 5. Reconstruct the points array in the best order as structured waypoint objects
    if (bestRoute) {
        return bestRoute.map(idx => {
            if (idx === 0) {
                return {
                    type: 'driver',
                    name: 'Driver Position',
                    coordinates: startLocation
                };
            }
            
            const orderIdx = Math.floor((idx - 1) / 2);
            const isPickup = (idx - 1) % 2 === 0;
            const order = orders[orderIdx];
            
            if (isPickup) {
                return {
                    type: 'pickup',
                    name: order.pickup.name,
                    address: order.pickup.address,
                    coordinates: order.pickup.coordinates,
                    place_id: order.pickup.coordinates?.place_id,
                    order_index: orderIdx
                };
            } else {
                return {
                    type: 'delivery',
                    name: order.delivery.name,
                    address: order.delivery.address,
                    coordinates: order.delivery.coordinates,
                    place_id: order.delivery.coordinates?.place_id,
                    order_index: orderIdx
                };
            }
        });
    }

    // Fallback if bestRoute is not found
    return points.map((p, idx) => {
        if (idx === 0) {
            return {
                type: 'driver',
                name: 'Driver Position',
                coordinates: startLocation
            };
        }
        const orderIdx = Math.floor((idx - 1) / 2);
        const isPickup = (idx - 1) % 2 === 0;
        const order = orders[orderIdx];
        
        if (isPickup) {
            return {
                type: 'pickup',
                name: order.pickup.name,
                address: order.pickup.address,
                coordinates: order.pickup.coordinates,
                place_id: order.pickup.coordinates?.place_id,
                order_index: orderIdx
            };
        } else {
            return {
                type: 'delivery',
                name: order.delivery.name,
                address: order.delivery.address,
                coordinates: order.delivery.coordinates,
                place_id: order.delivery.coordinates?.place_id,
                order_index: orderIdx
            };
        }
    });
}

/**
 * Generates a Google Maps navigation deep link. (Legacy fallback)
 */
function generateNavigationLink(points) {
    if (!points || points.length < 2) return null;
    
    // Helper to get coordinates string from a waypoint or raw coordinate
    const getLatLngStr = (p) => {
        if (p.coordinates) {
            return `${p.coordinates.lat},${p.coordinates.lng}`;
        }
        return `${p.lat},${p.lng}`;
    };
    
    const startPoint = points[0];
    const endPoint = points[points.length - 1];

    const originStr = encodeURIComponent(getLatLngStr(startPoint));
    const destStr = encodeURIComponent(getLatLngStr(endPoint));
    let destPlaceIdStr = '';

    if (endPoint.place_id) {
        destPlaceIdStr = `&destination_place_id=${encodeURIComponent(endPoint.place_id)}`;
    }

    const waypoints = points.slice(1, -1);
    let waypointsStr = '';
    let waypointsPlaceIdsStr = '';

    if (waypoints.length > 0) {
        const waypointParts = waypoints.map(wp => encodeURIComponent(getLatLngStr(wp)));
        waypointsStr = '&waypoints=' + waypointParts.join('%7C');

        const placeIds = waypoints.map(wp => wp.place_id ? encodeURIComponent(wp.place_id) : '');
        if (placeIds.some(id => id !== '')) {
            waypointsPlaceIdsStr = '&waypoints_place_ids=' + placeIds.join('%7C');
        }
    }

    return `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}${destPlaceIdStr}${waypointsStr}${waypointsPlaceIdsStr}&travelmode=two-wheeler`;
}

/**
 * Computes the final route and polyline using Google Routes API.
 * @param {Array<{lat: number, lng: number}>} points The ordered sequence of points
 * @returns {Promise<any>} The polyline and route details
 */
async function computePolylineRoute(points) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is not set in .env');
    
    if (!points || points.length < 2) return null;

    const origin = { location: { latLng: { latitude: points[0].lat, longitude: points[0].lng } } };
    const destination = { location: { latLng: { latitude: points[points.length - 1].lat, longitude: points[points.length - 1].lng } } };
    
    const intermediates = points.slice(1, -1).map(p => ({
        location: { latLng: { latitude: p.lat, longitude: p.lng } }
    }));

    try {
        const numPoints = points.length;
        const useOptimal = (numPoints * numPoints) <= 100;
        const routingPreference = useOptimal ? 'TRAFFIC_AWARE_OPTIMAL' : 'TRAFFIC_AWARE';

        console.log(`Fetching Route Polyline (Routes API) for ${points.length} points (routingPreference: ${routingPreference})...`);
        const response = await axios.post('https://routes.googleapis.com/directions/v2:computeRoutes', {
            origin: origin,
            destination: destination,
            intermediates: intermediates,
            travelMode: 'TWO_WHEELER',
            routingPreference: routingPreference,
            polylineQuality: 'HIGH_QUALITY',
            routeModifiers: {
                avoidTolls: true,
                avoidHighways: true
            }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'routes.polyline.encodedPolyline,routes.duration,routes.distanceMeters'
            },
            timeout: AXIOS_TIMEOUT
        });

        if (response.data && response.data.routes && response.data.routes.length > 0) {
            return response.data.routes[0];
        }
        return null;
    } catch (error) {
        console.error('Error fetching computeRoutes:', error.message);
        if (error.response && error.response.data) {
            console.error('Detailed computeRoutes error:', JSON.stringify(error.response.data, null, 2));
        }
        return null;
    }
}

/**
 * Searches for a place using the modern Places API (New) Text Search endpoint.
 * @param {string} query The place query text
 * @returns {Promise<any>} The parsed location result
 */
async function searchPlaceText(query) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is not set in .env');
    if (!query) return null;

    try {
        console.log(`Searching place via Places API (New) for: ${query.substring(0, 30)}...`);
        const response = await axios.post('https://places.googleapis.com/v1/places:searchText', {
            textQuery: query,
            languageCode: 'id',
            regionCode: 'id'
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location'
            },
            timeout: AXIOS_TIMEOUT
        });

        if (response.data && response.data.places && response.data.places.length > 0) {
            const place = response.data.places[0];
            return {
                lat: place.location.latitude,
                lng: place.location.longitude,
                display_name: place.displayName?.text || query,
                formatted_address: place.formattedAddress,
                place_id: place.id
            };
        }
        return null;
    } catch (error) {
        console.error('Error in searchPlaceText:', error.message);
        if (error.response && error.response.data) {
            console.error('Detailed Places API error:', JSON.stringify(error.response.data, null, 2));
        }
        return null;
    }
}

/**
 * Validates an address using the Address Validation API.
 * @param {string} addressText The address line text to validate
 * @returns {Promise<any>} The validation results
 */
async function validateAddressOffice(addressText) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is not set in .env');
    if (!addressText) return null;

    try {
        console.log(`Validating address via Address Validation API for: ${addressText.substring(0, 30)}...`);
        const response = await axios.post(`https://addressvalidation.googleapis.com/v1:validateAddress?key=${apiKey}`, {
            address: {
                addressLines: [addressText]
            }
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: AXIOS_TIMEOUT
        });

        if (response.data && response.data.result) {
            const result = response.data.result;
            const geocode = result.geocode;
            const verdict = result.verdict || {};
            
            if (geocode && geocode.location) {
                return {
                    lat: geocode.location.latitude,
                    lng: geocode.location.longitude,
                    formatted_address: result.address?.formattedAddress || addressText,
                    granularity: verdict.geocodeGranularity || 'UNKNOWN',
                    validation_status: verdict.addressComplete ? 'CONFIRMED' : 'UNCONFIRMED',
                    has_unresolved: verdict.hasUnresolvedParts || false,
                    place_id: geocode.placeId
                };
            }
        }
        return null;
    } catch (error) {
        console.error('Error in validateAddressOffice:', error.message);
        if (error.response && error.response.data) {
            console.error('Detailed Address Validation error:', JSON.stringify(error.response.data, null, 2));
        }
        return null;
    }
}

module.exports = {
    geocodeAddress,
    generateNavigationLink,
    optimizeSmartRoute,
    computePolylineRoute,
    searchPlaceText,
    getHaversineDistance
};
