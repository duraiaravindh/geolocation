/**
 * Traffic count service — TxDOT AADT (Annual Average Daily Traffic).
 *
 * TxDOT splits its public traffic counts across multiple ArcGIS feature
 * services. To match what the official TCDS viewer shows, we query BOTH and
 * merge the results:
 *
 *   1. "AADT Annuals (Public View)"  — on-system roads (state highways, FM
 *      roads). Includes the road name (ON_ROAD) and a per-year AADT.
 *   2. "5-Year Statewide AADT (Public)" — off-system roads (local / urban /
 *      county), counted once every ~5 years. The public view does NOT expose
 *      a road-name field, and the latest AADT may live in a historical column.
 *
 * Source fields are mapped into one standard shape and sorted by distance.
 */
import * as turf from '@turf/turf';
import { toMeters } from './population.js';
import { getRoadName } from './reverseGeocode.js';

// Cap how many off-system stations we reverse-geocode per request, so the
// (throttled, ~1.1s each) Nominatim calls can't make a request run too long.
const MAX_ROAD_NAME_LOOKUPS = 15;
const OFF_SYSTEM_LABEL = 'Local road (off-system)';

// TxDOT STARS II / TCDS public portal — where a user can look up a Station ID
// or road name and confirm the AADT/year against the official source.
const STARS_II_URL =
  'https://txdot.public.ms2soft.com/tcds/tsearch.asp?loc=Txdot&mod=TCDS';

const ORG =
  'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services';

const clean = (s) => (typeof s === 'string' ? s.trim() : '') || null;
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const firstNum = (arr) => {
  for (const v of arr) {
    const n = numOrNull(v);
    if (n != null) return n;
  }
  return null;
};

// Each source: the query URL, the fields to request, and a mapper that turns
// one ArcGIS feature (attributes + geometry) into our standard record.
const SOURCES = [
  {
    dataset: 'Annual (on-system)',
    url: `${ORG}/TxDOT_AADT_Annuals_(Public_View)/FeatureServer/0/query`,
    outFields:
      'ON_ROAD,AADT_RPT_QTY,AADT_RPT_YEAR,TRFC_STATN_ID,CNTY_NM,LATITUDE,LONGITUDE',
    map: (a, g) => ({
      roadName: clean(a.ON_ROAD) || 'Unknown road',
      aadt: numOrNull(a.AADT_RPT_QTY),
      year: a.AADT_RPT_YEAR ?? null,
      stationId: a.TRFC_STATN_ID ?? null,
      county: clean(a.CNTY_NM),
      lat: numOrNull(a.LATITUDE) ?? g?.y,
      lng: numOrNull(a.LONGITUDE) ?? g?.x,
    }),
  },
  {
    dataset: '5-Year (off-system)',
    url: `${ORG}/TxDOT_5_Year_Statewide_AADT_Traffic_Counts/FeatureServer/0/query`,
    outFields:
      'TRFC_STATN_ID,LATEST_AADT_YR,AADT_RPT_QTY,AADT_RPT_HIST_01_QTY,' +
      'AADT_RPT_HIST_02_QTY,AADT_RPT_HIST_03_QTY,AADT_RPT_HIST_04_QTY,CNTY_NM',
    map: (a, g) => ({
      // The public 5-Year view does not expose the road name.
      roadName: OFF_SYSTEM_LABEL,
      aadt: firstNum([
        a.AADT_RPT_QTY,
        a.AADT_RPT_HIST_01_QTY,
        a.AADT_RPT_HIST_02_QTY,
        a.AADT_RPT_HIST_03_QTY,
        a.AADT_RPT_HIST_04_QTY,
      ]),
      year: a.LATEST_AADT_YR ?? null,
      stationId: a.TRFC_STATN_ID ?? null,
      county: clean(a.CNTY_NM),
      lat: g?.y,
      lng: g?.x,
    }),
  },
];

const SORTERS = {
  distance: (a, b) => a.distanceMeters - b.distanceMeters,
  aadt: (a, b) => (b.aadt ?? -1) - (a.aadt ?? -1),
  year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
};

async function querySource(source, lat, lng, radiusMeters) {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    distance: String(radiusMeters),
    units: 'esriSRUnit_Meter',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: source.outFields,
    returnGeometry: 'true',
    outSR: '4326',
    f: 'json',
  });

  try {
    const res = await fetch(`${source.url}?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'service error');

    return (data.features || []).map((f) => ({
      ...source.map(f.attributes || {}, f.geometry),
      source: 'TxDOT',
      dataset: source.dataset,
    }));
  } catch (err) {
    // Don't let one failing service kill the whole response.
    console.warn(`[traffic] ${source.dataset} query failed: ${err.message}`);
    return [];
  }
}

/**
 * @param {object} opts
 * @param {number} opts.lat
 * @param {number} opts.lng
 * @param {number} opts.radius
 * @param {string} opts.unit   miles | kilometers | meters | feet
 * @param {string} [opts.sort] distance (default) | aadt | year
 */
export async function getTrafficCounts({
  lat,
  lng,
  radius,
  unit,
  sort = 'distance',
  resolveRoadNames = false,
}) {
  const radiusMeters = toMeters(radius, unit);
  const center = turf.point([lng, lat]);

  const perSource = await Promise.all(
    SOURCES.map((s) => querySource(s, lat, lng, radiusMeters))
  );

  // Merge, drop records without coordinates, attach distance, dedupe by station.
  const byStation = new Map();
  for (const record of perSource.flat()) {
    if (typeof record.lat !== 'number' || typeof record.lng !== 'number') continue;

    const distMeters = turf.distance(center, turf.point([record.lng, record.lat]), {
      units: 'meters',
    });
    const enriched = {
      ...record,
      distanceMiles: Number((distMeters / 1609.344).toFixed(2)),
      distanceMeters: Math.round(distMeters),
      // Official source to cross-check this station (Station ID / road / AADT).
      sourceUrl: STARS_II_URL,
      // Quick "is the station really near the parcel?" check.
      mapUrl: `https://www.google.com/maps?q=${record.lat},${record.lng}`,
    };

    // If the same station appears in both datasets, keep the one with a real
    // road name (the on-system annual record).
    const key = enriched.stationId || `${enriched.lat},${enriched.lng}`;
    const existing = byStation.get(key);
    if (!existing || enriched.roadName !== OFF_SYSTEM_LABEL) {
      byStation.set(key, enriched);
    }
  }

  const trafficCounts = [...byStation.values()];
  trafficCounts.sort(SORTERS[sort] || SORTERS.distance);

  // Optional: recover real street names for off-system stations whose dataset
  // doesn't publish one. Resolve the nearest few first (already distance-sorted).
  let roadNamesResolved = 0;
  if (resolveRoadNames) {
    const targets = trafficCounts
      .filter((t) => t.roadName === OFF_SYSTEM_LABEL)
      .slice(0, MAX_ROAD_NAME_LOOKUPS);
    for (const t of targets) {
      const road = await getRoadName(t.lat, t.lng);
      if (road) {
        t.roadName = road;
        t.roadNameSource = 'OpenStreetMap';
        roadNamesResolved += 1;
      }
    }
  }

  return {
    roadNamesResolved,
    center: { lat, lng },
    radius: { value: Number(radius), unit, meters: Number(radiusMeters.toFixed(2)) },
    count: trafficCounts.length,
    sort,
    source: 'TxDOT Statewide Traffic Monitoring Program (STARS II / TCDS)',
    sourcePortalUrl: STARS_II_URL,
    trafficCounts,
  };
}
