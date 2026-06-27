/**
 * Nearby points of interest from OpenStreetMap via the Overpass API (free, no
 * key). One query fetches all categories within the radius; each element is
 * classified by its OSM tags and returned grouped by category.
 *
 * Categories: Restaurants, Schools, Hospitals, Apartments, Retail.
 */
import * as turf from '@turf/turf';
import { toMeters } from './population.js';

// Overpass is frequently overloaded (504/429). Try mirrors in order with a
// per-request timeout so one slow instance doesn't hang or fail the request.
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];
const REQUEST_TIMEOUT_MS = 25000;

// Keep Overpass responsive: cap the search radius and the results per category.
const MAX_RADIUS_METERS = 4828; // ~3 miles
const MAX_PER_CATEGORY = 40;

export const PLACE_CATEGORIES = ['restaurants', 'schools', 'hospitals', 'apartments', 'retail'];

// Classify one OSM element into a category from its tags (first match wins).
function classify(tags = {}) {
  const amenity = tags.amenity;
  if (amenity && ['restaurant', 'fast_food', 'cafe'].includes(amenity)) return 'restaurants';
  if (amenity === 'school') return 'schools';
  if (amenity && ['hospital', 'clinic'].includes(amenity)) return 'hospitals';
  if (tags.building === 'apartments' || tags.residential === 'apartments') return 'apartments';
  if (tags.shop) return 'retail';
  return null;
}

function buildQuery(lat, lng, radiusMeters) {
  const a = `(around:${radiusMeters},${lat},${lng})`;
  // node + way for each tag set; `out center tags` gives ways a centroid.
  const clauses = [
    `node["amenity"~"^(restaurant|fast_food|cafe)$"]${a};`,
    `way["amenity"~"^(restaurant|fast_food|cafe)$"]${a};`,
    `node["amenity"="school"]${a};`,
    `way["amenity"="school"]${a};`,
    `node["amenity"~"^(hospital|clinic)$"]${a};`,
    `way["amenity"~"^(hospital|clinic)$"]${a};`,
    `node["building"="apartments"]${a};`,
    `way["building"="apartments"]${a};`,
    `node["shop"]${a};`,
    `way["shop"]${a};`,
  ].join('\n  ');
  return `[out:json][timeout:25];\n(\n  ${clauses}\n);\nout tags center ${MAX_PER_CATEGORY * 6};`;
}

// POST the query to each mirror in turn; return the first success.
async function queryOverpass(query) {
  let lastErr;
  for (const url of OVERPASS_MIRRORS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          // Overpass rejects requests with no User-Agent (HTTP 406).
          'User-Agent': 'population-radius-poc/1.0 (nearby places)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err.name === 'AbortError' ? new Error('timed out') : err;
      console.warn(`[places] Overpass ${url} failed: ${lastErr.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(
    `Nearby places service is busy (OpenStreetMap Overpass). Please try again. (${lastErr?.message})`
  );
}

/**
 * @param {object} opts
 * @param {number} opts.lat
 * @param {number} opts.lng
 * @param {number} opts.radius
 * @param {string} opts.unit  miles | kilometers | meters | feet
 */
export async function getNearbyPlaces({ lat, lng, radius, unit }) {
  const requested = toMeters(radius, unit);
  const radiusMeters = Math.min(requested, MAX_RADIUS_METERS);
  const clamped = requested > MAX_RADIUS_METERS;

  const query = buildQuery(lat, lng, radiusMeters);
  const data = await queryOverpass(query);

  const center = turf.point([lng, lat]);
  const places = Object.fromEntries(PLACE_CATEGORIES.map((c) => [c, []]));

  for (const el of data.elements || []) {
    const category = classify(el.tags);
    if (!category) continue;
    const plat = el.lat ?? el.center?.lat;
    const plng = el.lon ?? el.center?.lon;
    if (typeof plat !== 'number' || typeof plng !== 'number') continue;

    const distM = turf.distance(center, turf.point([plng, plat]), { units: 'meters' });
    places[category].push({
      id: el.id,
      name: el.tags?.name || null,
      type: el.tags?.amenity || el.tags?.shop || el.tags?.building || null,
      lat: plat,
      lng: plng,
      distanceMiles: Number((distM / 1609.344).toFixed(2)),
      distanceMeters: Math.round(distM),
      category,
    });
  }

  // Nearest-first, capped per category.
  const counts = {};
  for (const c of PLACE_CATEGORIES) {
    places[c].sort((a, b) => a.distanceMeters - b.distanceMeters);
    places[c] = places[c].slice(0, MAX_PER_CATEGORY);
    counts[c] = places[c].length;
  }

  return {
    center: { lat, lng },
    radius: { value: Number(radius), unit, meters: Math.round(radiusMeters), clamped },
    source: 'OpenStreetMap (Overpass API)',
    counts,
    places,
  };
}
