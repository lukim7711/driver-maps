import { useEffect, useRef } from 'react';
import { decodePolyline } from '../utils/polyline';

/* global L */

export default function MapComponent({ waypoints, encodedPolyline, routesData, visibilityFlags }) {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef([]);
    const polylineRef = useRef([]); // Modified to hold multiple polylines

    // Custom marker icon generator using Leaflet DivIcon and CSS classes
    const createCustomMarkerIcon = (type, label, index) => {
        let colorClass = 'marker-driver';
        let iconHTML = '🚗';
        let badgeHTML = '';

        if (type === 'pickup') {
            colorClass = 'marker-pickup';
            iconHTML = '🏪';
            badgeHTML = `<span class="marker-badge">P${index}</span>`;
        } else if (type === 'delivery') {
            colorClass = 'marker-delivery';
            iconHTML = '👤';
            badgeHTML = `<span class="marker-badge">D${index}</span>`;
        }

        return L.divIcon({
            className: 'custom-div-icon-wrapper',
            html: `
                <div class="marker-container">
                    <div class="marker-pin ${colorClass}">
                        <span class="marker-icon">${iconHTML}</span>
                        ${badgeHTML}
                    </div>
                </div>
            `,
            iconSize: [36, 46],
            iconAnchor: [18, 46]
        });
    };



    const createRouteMarkerIcon = (apiType, label, type, index) => {
        if (type === 'driver') {
            return L.divIcon({
                className: 'custom-div-icon-wrapper',
                html: `
                    <div class="marker-container">
                        <div class="marker-pin marker-driver">
                            <span class="marker-icon">🚗</span>
                        </div>
                    </div>
                `,
                iconSize: [36, 46],
                iconAnchor: [18, 46]
            });
        }
        
        let colorClass = 'marker-geocoding';
        let iconHTML = '📍';
        let badgeHTML = '';

        if (apiType === 'geocoding') {
            colorClass = 'marker-geocoding';
            iconHTML = type === 'pickup' ? '🏪' : '👤';
            badgeHTML = `<span class="marker-badge" style="background:#ef4444">G${index}</span>`;
        } else if (apiType === 'places') {
            colorClass = 'marker-places';
            iconHTML = type === 'pickup' ? '🏪' : '👤';
            badgeHTML = `<span class="marker-badge" style="background:#3b82f6">P${index}</span>`;
        } else if (apiType === 'validation') {
            colorClass = 'marker-validation';
            iconHTML = type === 'pickup' ? '🏪' : '👤';
            badgeHTML = `<span class="marker-badge" style="background:#a855f7">V${index}</span>`;
        }

        return L.divIcon({
            className: 'custom-div-icon-wrapper',
            html: `
                <div class="marker-container">
                    <div class="marker-pin ${colorClass}">
                        <span class="marker-icon">${iconHTML}</span>
                        ${badgeHTML}
                    </div>
                </div>
            `,
            iconSize: [36, 46],
            iconAnchor: [18, 46]
        });
    };

    useEffect(() => {
        // Initialize Map
        if (mapContainerRef.current && !mapRef.current) {
            // Default view: Jakarta center
            mapRef.current = L.map(mapContainerRef.current, {
                zoomControl: false // We will style and position zoom control or just disable
            }).setView([-6.2088, 106.8456], 12);

            // Add clean map tiles (CartoDB Positron - Dark Mode style matches our dark theme!)
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 20
            }).addTo(mapRef.current);

            // Re-add Zoom control in a cleaner way
            L.control.zoom({
                position: 'bottomright'
            }).addTo(mapRef.current);
        }

        // Cleanup map instance on unmount
        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);

    // Effect to update Markers and Polylines when data changes
    useEffect(() => {
        if (!mapRef.current) return;

        // 1. Clear old markers
        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        // 2. Clear old polylines
        if (polylineRef.current && polylineRef.current.length > 0) {
            polylineRef.current.forEach(pl => pl.remove());
        }
        polylineRef.current = [];

        const boundsPoints = [];

        // CASE A: Render multiple route comparison (visual routing comparison)
        if (routesData) {
            // Render bottom-to-top: thick purple (validation) -> medium dashed blue (places) -> thin red (geocoding)
            const apiTypes = ['places', 'geocoding'];
            const colors = {
                geocoding: '#ef4444',     // Red
                places: '#3b82f6'         // Blue
            };
            const glowClasses = {
                geocoding: 'polyline-glow-red',
                places: 'polyline-glow-blue'
            };
            
            const lineStyles = {
                places: { weight: 6, opacity: 0.7, dashArray: '10, 5' },
                geocoding: { weight: 3, opacity: 1.0, dashArray: null }
            };
            
            apiTypes.forEach(apiType => {
                if (visibilityFlags && visibilityFlags[apiType] && routesData[apiType]) {
                    const route = routesData[apiType];
                    const waypointsList = route.optimized_waypoints || [];
                    const routeDetails = route.route_details;
                    
                    // 1. Draw markers for this route
                    let pickupCount = 0;
                    let deliveryCount = 0;
                    
                    waypointsList.forEach((wp) => {
                        let label = wp.name;
                        let indexText = '';
                        
                        if (wp.type === 'pickup') {
                            pickupCount++;
                            indexText = pickupCount;
                            label = `[${apiType.toUpperCase()} - Ambil #${pickupCount}] ${wp.name}`;
                        } else if (wp.type === 'delivery') {
                            deliveryCount++;
                            indexText = deliveryCount;
                            label = `[${apiType.toUpperCase()} - Kirim #${deliveryCount}] ${wp.name}`;
                        } else if (wp.type === 'driver') {
                            label = 'Posisi Anda (Driver)';
                        }
                        
                        const icon = createRouteMarkerIcon(apiType, label, wp.type, indexText);
                        const marker = L.marker([wp.coordinates.lat, wp.coordinates.lng], { icon })
                            .addTo(mapRef.current)
                            .bindPopup(`<strong>[${apiType.toUpperCase()}] ${wp.name}</strong><br><small>${wp.address || ''}</small>`);
                        
                        markersRef.current.push(marker);
                        boundsPoints.push([wp.coordinates.lat, wp.coordinates.lng]);
                    });
                    
                    // 2. Draw polyline path for this route
                    if (routeDetails && routeDetails.polyline && routeDetails.polyline.encodedPolyline) {
                        const decodedCoords = decodePolyline(routeDetails.polyline.encodedPolyline);
                        if (decodedCoords.length > 0) {
                            const style = lineStyles[apiType] || { weight: 4, opacity: 0.8, dashArray: null };
                            const pl = L.polyline(decodedCoords, {
                                color: colors[apiType],
                                weight: style.weight,
                                opacity: style.opacity,
                                lineJoin: 'round',
                                dashArray: style.dashArray,
                                className: glowClasses[apiType] || 'polyline-glow'
                            }).addTo(mapRef.current);
                            polylineRef.current.push(pl);
                        }
                    }
                }
            });
        }
        // CASE C: Draw standard single waypoints
        else if (waypoints && waypoints.length > 0) {
            let pickupCount = 0;
            let deliveryCount = 0;

            waypoints.forEach((wp) => {
                let label = wp.name;
                let indexText = '';
                
                if (wp.type === 'pickup') {
                    pickupCount++;
                    indexText = pickupCount;
                    label = `[Pickup #${pickupCount}] ${wp.name}`;
                } else if (wp.type === 'delivery') {
                    deliveryCount++;
                    indexText = deliveryCount;
                    label = `[Kirim #${deliveryCount}] ${wp.name}`;
                } else if (wp.type === 'driver') {
                    label = 'Posisi Anda (Driver)';
                }

                const icon = createCustomMarkerIcon(wp.type, label, indexText);
                const marker = L.marker([wp.coordinates.lat, wp.coordinates.lng], { icon })
                    .addTo(mapRef.current)
                    .bindPopup(`<strong>${label}</strong><br><small>${wp.address || ''}</small>`);
                
                markersRef.current.push(marker);
                boundsPoints.push([wp.coordinates.lat, wp.coordinates.lng]);
            });

            // Decode and draw Polyline if available
            if (encodedPolyline) {
                const decodedCoords = decodePolyline(encodedPolyline);
                if (decodedCoords.length > 0) {
                    const pl = L.polyline(decodedCoords, {
                        color: '#00f2fe',
                        weight: 5,
                        opacity: 0.8,
                        lineJoin: 'round',
                        dashArray: '10, 5',
                        className: 'polyline-glow'
                    }).addTo(mapRef.current);
                    polylineRef.current.push(pl);
                }
            }
        }

        // Adjust bounds
        if (boundsPoints.length > 0) {
            const bounds = L.latLngBounds(boundsPoints);
            mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
    }, [waypoints, encodedPolyline, routesData, visibilityFlags]);

    return (
        <div 
            ref={mapContainerRef} 
            style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden' }}
            id="map"
        />
    );
}
