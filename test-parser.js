import { parseFreeformAddress, buildGeocodingQuery } from './workers-src/lib/address-parser.js';
const addr = "Kopi Kenangan, Jl. Sudirman No. 1, RT.01/RW.02, Senayan, Kebayoran Baru, Jakarta Selatan";
const parsed = parseFreeformAddress(addr);
console.log(parsed);
console.log("Clean:", buildGeocodingQuery(parsed));
