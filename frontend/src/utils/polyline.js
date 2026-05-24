/**
 * Decodes an encoded Google Maps polyline string into an array of [lat, lng] coordinates.
 * @param {string} encoded The encoded polyline string
 * @returns {Array<[number, number]>} Array of [latitude, longitude] pairs
 */
export function decodePolyline(encoded) {
    if (!encoded) return [];
    
    let len = encoded.length;
    let index = 0;
    let array = [];
    let lat = 0;
    let lng = 0;

    while (index < len) {
        let b;
        let shift = 0;
        let result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;

        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;

        array.push([lat * 1e-5, lng * 1e-5]);
    }
    return array;
}
