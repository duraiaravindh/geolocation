import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load server/.env regardless of the current working directory
// (so `node server/test.js` from the repo root still finds the key).
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

export const config = {
  port: process.env.PORT || 5000,
  censusApiKey: process.env.CENSUS_API_KEY || '',
  acsYear: process.env.ACS_YEAR || '2024',
  tigerwebService: process.env.TIGERWEB_SERVICE || 'tigerWMS_ACS2024',
  // Layer 10 = "Census Block Groups" in the TIGERweb ACS map services
  blockGroupLayer: 10,

  // --- Google Maps Platform (Geocoding + Places) ---
  // Geocoding fallback + nearby business search. Strictly capped per month and
  // cached (see services/googleClient.js). Empty key = Google disabled.
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  googleMonthlyLimit: Number(process.env.GOOGLE_MONTHLY_LIMIT || 4000),
  googleCacheDays: Number(process.env.GOOGLE_CACHE_DAYS || 30),

  // --- Parcel database (PostgreSQL / PostGIS) ---
  // If DATABASE_URL is empty, the app falls back to the built-in sample parcel.
  databaseUrl: process.env.DATABASE_URL || '',
  dbSsl: String(process.env.DB_SSL || '').toLowerCase() === 'true',
  // Optional: when the parcel dataset was last refreshed (shown in the
  // Real Estate Summary so users know how current the data is).
  parcelDataUpdated: process.env.PARCEL_DATA_UPDATED || '',
  parcel: {
    table: process.env.PARCEL_TABLE || 'attom_dataset.boundaries',
    idCol: process.env.PARCEL_ID_COL || 'apn',
    addrCol: process.env.PARCEL_ADDR_COL || 'addr_line_1',
    latCol: process.env.PARCEL_LAT_COL || 'latitude',
    lngCol: process.env.PARCEL_LNG_COL || 'longitude',
    countyCol: process.env.PARCEL_COUNTY_COL || 'county', // optional
    geomCol: process.env.PARCEL_GEOM_COL || 'geom', // optional PostGIS geometry
  },
};
