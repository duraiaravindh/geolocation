/**
 * Parcel lookup.
 *
 * If a PostgreSQL parcel database is configured (DATABASE_URL), parcels are
 * looked up there by parcel number. Otherwise we fall back to a tiny built-in
 * sample so the Parcel ID search path still works for a demo.
 *
 * Expected columns (configurable via env — see server/.env.example):
 *   parcel number, address, latitude, longitude, [county]
 */
import * as turf from '@turf/turf';
import { getPool } from './db.js';
import { config } from '../config.js';

// Quote a SQL identifier safely. Names come from env (trusted), but quoting
// lets mixed-case names work and avoids keyword clashes.
const q = (name) => `"${String(name).replace(/"/g, '""')}"`;
// Quote a possibly schema-qualified table name, e.g. attom_dataset.boundaries.
const qTable = (name) => String(name).split('.').map(q).join('.');

export async function lookupParcel(parcelId) {
  const id = String(parcelId).trim();
  const pool = getPool();

  if (pool) {
    return lookupFromDb(pool, id);
  }
  return lookupSample(id);
}

// Shared SELECT list + row mapper for the configured parcel table.
function parcelSelects() {
  const p = config.parcel;
  return [
    `${q(p.idCol)} AS parcel_id`,
    `${q(p.latCol)} AS lat`,
    `${q(p.lngCol)} AS lng`,
    p.addrCol ? `${q(p.addrCol)} AS address` : `NULL AS address`,
    p.countyCol ? `${q(p.countyCol)} AS county` : `NULL AS county`,
    // Return the parcel boundary as GeoJSON when a geometry column is set.
    p.geomCol ? `ST_AsGeoJSON(${q(p.geomCol)}) AS geojson` : `NULL AS geojson`,
  ].join(', ');
}

function rowToParcel(r) {
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let polygon = null;
  if (r.geojson) {
    try {
      polygon = JSON.parse(r.geojson);
    } catch {
      polygon = null;
    }
  }
  return {
    parcelId: String(r.parcel_id),
    address: r.address || null,
    county: r.county || null,
    polygon,
    lat,
    lng,
  };
}

async function lookupFromDb(pool, id) {
  const p = config.parcel;
  // Match on text form (case- and whitespace-insensitive) so numeric and
  // alphanumeric parcel numbers both resolve regardless of how they're typed.
  const sql =
    `SELECT ${parcelSelects()} FROM ${qTable(p.table)} ` +
    `WHERE upper(btrim(${q(p.idCol)}::text)) = upper(btrim($1)) LIMIT 1`;

  let rows;
  try {
    ({ rows } = await pool.query(sql, [id]));
  } catch (err) {
    throw new Error(
      `Parcel database query failed: ${err.message}. ` +
        `Check PARCEL_TABLE / PARCEL_*_COL settings in server/.env.`
    );
  }

  if (rows.length === 0) {
    throw new Error(`Parcel "${id}" not found in the parcel database.`);
  }
  const parcel = rowToParcel(rows[0]);
  if (!parcel) {
    throw new Error(`Parcel "${id}" has no valid latitude/longitude in the database.`);
  }
  return parcel;
}

/**
 * Internal address search — matches the street line (before the first comma)
 * against the parcel table. Returns the parcel or null (no throw), so callers
 * can fall back to geocoding.
 */
export async function lookupParcelByAddress(address) {
  const pool = getPool();
  const p = config.parcel;
  if (!pool || !p.addrCol) return null;
  const street = String(address).split(',')[0].trim();
  if (!street) return null;
  const sql =
    `SELECT ${parcelSelects()} FROM ${qTable(p.table)} ` +
    `WHERE ${q(p.addrCol)} ILIKE $1 ORDER BY length(${q(p.addrCol)}) LIMIT 1`;
  const { rows } = await pool.query(sql, [`%${street}%`]);
  return rows.length ? rowToParcel(rows[0]) : null;
}

/**
 * Find the parcel whose boundary contains a point (used after geocoding a
 * lat/lng). Returns the parcel or null.
 */
export async function findParcelByPoint(lat, lng) {
  const pool = getPool();
  const p = config.parcel;
  if (!pool || !p.geomCol) return null;
  const sql =
    `SELECT ${parcelSelects()} FROM ${qTable(p.table)} ` +
    `WHERE ST_Contains(${q(p.geomCol)}, ST_SetSRID(ST_Point($1, $2), 4326)) LIMIT 1`;
  const { rows } = await pool.query(sql, [lng, lat]);
  return rows.length ? rowToParcel(rows[0]) : null;
}

// --- Built-in sample (used only when no DATABASE_URL is set) ---
const SAMPLE_PARCELS = {
  '123456789': {
    parcelId: '123456789',
    address: '725 FM 1626, Austin, TX',
    polygon: {
      type: 'Polygon',
      coordinates: [
        [
          [-97.84265, 30.1364],
          [-97.8418, 30.1364],
          [-97.8418, 30.13705],
          [-97.84265, 30.13705],
          [-97.84265, 30.1364],
        ],
      ],
    },
  },
};

function lookupSample(id) {
  const parcel = SAMPLE_PARCELS[id];
  if (!parcel) {
    throw new Error(
      `Parcel "${id}" not found. No parcel database is configured (set DATABASE_URL ` +
        `in server/.env). Built-in sample parcel IDs: ${Object.keys(SAMPLE_PARCELS).join(', ')}`
    );
  }
  const centroid = turf.centroid(turf.feature(parcel.polygon)).geometry.coordinates;
  return {
    parcelId: parcel.parcelId,
    address: parcel.address,
    county: null,
    polygon: parcel.polygon,
    lng: centroid[0],
    lat: centroid[1],
  };
}
