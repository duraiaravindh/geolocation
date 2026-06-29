/**
 * Property details for a parcel (internal data only — no Google).
 *
 * Pulls area from the boundary geometry (PostGIS) and owner / value from the
 * ATTOM `boundaries_nnn` table (joined by parcel id = APN). Property type is
 * derived coarsely from the improvement value, since a clean land-use join is
 * not reachable by APN in this dataset.
 */
import { getPool } from './db.js';
import { config } from '../config.js';

const q = (n) => `"${String(n).replace(/"/g, '""')}"`;
const qTable = (n) => String(n).split('.').map(q).join('.');

// ATTOM table that carries owner / value / area for a parcel id.
const DETAIL_TABLE = 'attom_dataset.boundaries_nnn';

const num = (v) => (v == null || v === '' ? null : Number(v));

function derivePropertyType(impValue, mktValue) {
  const imp = num(impValue);
  if (imp != null && imp > 0) return 'Improved (built)';
  if (imp === 0) return 'Vacant land';
  if (num(mktValue) != null) return 'Land parcel';
  return null;
}

export async function getPropertyDetails(apn) {
  const pool = getPool();
  if (!pool) return null;
  const p = config.parcel;
  const id = String(apn).trim();

  // Area + county/state from the main boundary.
  const base = await pool.query(
    `SELECT ${p.countyCol ? q(p.countyCol) : 'NULL'} AS county, "state" AS state,
            ROUND(ST_Area(${q(p.geomCol)}::geography)) AS area_sqm
       FROM ${qTable(p.table)}
      WHERE upper(btrim(${q(p.idCol)}::text)) = upper(btrim($1)) LIMIT 1`,
    [id]
  );
  const b = base.rows[0] || {};

  // Owner / value from the detail table.
  let d = {};
  try {
    const det = await pool.query(
      `SELECT owner_name, mkt_value, land_value, imp_value, gis_area, legal_desc
         FROM ${DETAIL_TABLE} WHERE parcel_id = $1 LIMIT 1`,
      [id]
    );
    d = det.rows[0] || {};
  } catch {
    d = {};
  }

  const areaSqm = num(b.area_sqm);
  return {
    parcelId: id,
    county: b.county || null,
    state: b.state || null,
    propertyType: derivePropertyType(d.imp_value, d.mkt_value),
    owner: d.owner_name || null,
    marketValue: num(d.mkt_value),
    landValue: num(d.land_value),
    improvementValue: num(d.imp_value),
    legalDescription: d.legal_desc || null,
    area: areaSqm
      ? {
          squareMeters: areaSqm,
          squareFeet: Math.round(areaSqm * 10.7639104),
          acres: Number((areaSqm / 4046.8564224).toFixed(3)),
        }
      : d.gis_area != null
      ? { acres: Number(Number(d.gis_area).toFixed(3)) }
      : null,
    source: 'Internal parcel dataset (ATTOM)',
  };
}
