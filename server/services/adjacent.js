/**
 * Adjacent parcels — parcels sharing a boundary with the selected parcel
 * (PostGIS `ST_Touches`), falling back to parcels within ~15 m when none touch.
 * Owner / value come from the ATTOM detail table; no Google is used.
 */
import { getPool } from './db.js';
import { config } from '../config.js';

const q = (n) => `"${String(n).replace(/"/g, '""')}"`;
const qTable = (n) => String(n).split('.').map(q).join('.');
const DETAIL_TABLE = 'attom_dataset.boundaries_nnn';
const MAX_NEIGHBORS = 25;
const num = (v) => (v == null || v === '' ? null : Number(v));

function mapRow(r) {
  const areaSqm = num(r.area_sqm);
  const imp = num(r.imp_value);
  let polygon = null;
  if (r.geojson) {
    try {
      polygon = JSON.parse(r.geojson);
    } catch {
      polygon = null;
    }
  }
  return {
    parcelId: String(r.apn),
    address: r.address || null,
    county: r.county || null,
    lat: num(r.latitude),
    lng: num(r.longitude),
    owner: r.owner_name || null,
    marketValue: num(r.mkt_value),
    propertyType: imp != null && imp > 0 ? 'Improved (built)' : imp === 0 ? 'Vacant land' : null,
    areaAcres: areaSqm ? Number((areaSqm / 4046.8564224).toFixed(3)) : null,
    polygon,
    businessName: r.owner_name || null, // best-effort until Google business layer
  };
}

export async function getAdjacentParcels(apn) {
  const pool = getPool();
  if (!pool || !config.parcel.geomCol) return [];
  const p = config.parcel;
  const id = String(apn).trim();

  const select = `
    SELECT b.${q(p.idCol)} AS apn,
           ${p.addrCol ? `b.${q(p.addrCol)}` : 'NULL'} AS address,
           ${p.countyCol ? `b.${q(p.countyCol)}` : 'NULL'} AS county,
           b.${q(p.latCol)} AS latitude, b.${q(p.lngCol)} AS longitude,
           ROUND(ST_Area(b.${q(p.geomCol)}::geography)) AS area_sqm,
           ST_AsGeoJSON(b.${q(p.geomCol)}) AS geojson,
           nn.owner_name, nn.mkt_value, nn.imp_value
      FROM ${qTable(p.table)} b
      CROSS JOIN target t
      LEFT JOIN ${DETAIL_TABLE} nn ON nn.parcel_id = b.${q(p.idCol)}::text
     WHERE b.${q(p.idCol)}::text <> $1`;

  const touchSql =
    `WITH target AS (SELECT ${q(p.geomCol)} AS geom FROM ${qTable(p.table)} ` +
    `WHERE upper(btrim(${q(p.idCol)}::text)) = upper(btrim($1)) LIMIT 1) ` +
    `${select} AND ST_Touches(b.${q(p.geomCol)}, t.geom) ` +
    `ORDER BY ST_Distance(b.${q(p.geomCol)}::geography, t.geom::geography) LIMIT ${MAX_NEIGHBORS}`;

  let { rows } = await pool.query(touchSql, [id]);

  // Fallback: nothing touches → parcels within 15 m.
  if (rows.length === 0) {
    const nearSql =
      `WITH target AS (SELECT ${q(p.geomCol)} AS geom FROM ${qTable(p.table)} ` +
      `WHERE upper(btrim(${q(p.idCol)}::text)) = upper(btrim($1)) LIMIT 1) ` +
      `${select} AND ST_DWithin(b.${q(p.geomCol)}::geography, t.geom::geography, 15) ` +
      `ORDER BY ST_Distance(b.${q(p.geomCol)}::geography, t.geom::geography) LIMIT ${MAX_NEIGHBORS}`;
    ({ rows } = await pool.query(nearSql, [id]));
  }

  return rows.map(mapRow);
}
