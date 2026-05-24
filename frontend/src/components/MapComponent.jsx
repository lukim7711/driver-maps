import { useEffect, useRef } from 'react';
import { decodePolyline } from '../utils/polyline';

/* global L */

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export default function MapComponent({ waypoints, encodedPolyline, routesData, visibilityFlags }) {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef([]);
    const polylineRef = useRef([]);

    const createCustomMarkerIcon = (type, label, index) => {
        let colorClass = 'marker-driver';
        let iconHTML = '🚗';
        let badgeHTML = '';

        if (type === 'pickup') {
            colorClass = 'marker-pickup';
            iconHTML = '🏪';
            badgeHTML = `<span class="marker-badge">P${escapeHtml(index)}</span>`;
        } else if (type === 'delivery') {
            colorClass = 'marker-delivery';
            iconHTML = '👤';
            badgeHTML = `<span class="marker-badge">D${escapeHtml(index)}</span>`;
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
            badgeHTML = `<span class="marker-badge" style="background:#ef4444">G${escapeHtml(index)}</span>`;
        } else if (apiType === 'places') {
            colorClass = 'marker-places';
            iconHTML = type === 'pickup' ? '🏪' : '👤';
            badgeHTML = `<span class="marker-badge" style="background:#3b82f6">P${escapeHtml(index)}</span>`;
        } else if (apiType === 'validation') {
            colorClass = 'marker-validation';
            iconHTML = type === 'pickup' ? '🏪' : '👤';
            badgeHTML = `<span class="marker-badge" style="background:#a855f7">V${escapeHtml(index)}</span>`;
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
        if (mapContainerRef.current && !mapRef.current) {
            mapRef.current = L.map(mapContainerRef.current, {
                zoomControl: false
            }).setView([-6.2088, 106.8456], 12);

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 20
            }).addTo(mapRef.current);

            L.control.zoom({
                position: 'bottomright'
            }).addTo(mapRef.current);
        }

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!mapRef.current) return;

        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        if (polylineRef.current && polylineRef.current.length > 0) {
            polylineRef.current.forEach(pl => pl.remove());
        }
        polylineRef.current = [];

        const boundsPoints = [];

        if (routesData) {
            const apiTypes = ['places', 'geocoding'];
            const colors = {
                geocoding: '#ef4444',
                places: '#3b82f6'
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

                    let pickupCount = 0;
                    let deliveryCount = 0;

                    waypointsList.forEach((wp) => {
                        if (!wp.coordinates?.lat || !wp.coordinates?.lng) return;

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
                            .bindPopup(`<strong>[${escapeHtml(apiType.toUpperCase())}] ${escapeHtml(wp.name)}</strong><br><small>${escapeHtml(wp.address || '')}</small>`);

                        markersRef.current.push(marker);
                        boundsPoints.push([wp.coordinates.lat, wp.coordinates.lng]);
                    });

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
        else if (waypoints && waypoints.length > 0) {
            let pickupCount = 0;
            let deliveryCount = 0;

            waypoints.forEach((wp) => {
                if (!wp.coordinates?.lat || !wp.coordinates?.lng) return;

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
                    .bindPopup(`<strong>${escapeHtml(label)}</strong><br><small>${escapeHtml(wp.address || '')}</small>`);

                markersRef.current.push(marker);
                boundsPoints.push([wp.coordinates.lat, wp.coordinates.lng]);
            });

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
