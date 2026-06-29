/**
 * Google Maps Platform client with a hard monthly cap + 30-day cache.
 *
 * Every live Google request (Geocoding, Places Nearby, Place Details) is:
 *   1. served from the `google_api_cache` table when a fresh entry exists,
 *   2. otherwise allowed ONLY while the monthly counter is below the limit,
 *   3. counted in `google_api_usage` after a successful live call.
 *
 * The cap is enforced here (backend), never trusted from the client. With no
 * GOOGLE_MAPS_API_KEY set, live calls are disabled and callers fall back to
 * internal/free data.
 */
import { getPool } from './db.js';
import { config } from '../config.js';

const monthKey = () => new Date().toISOString().slice(0, 7); // YYYY-MM

// ---- Usage counter -------------------------------------------------------
export async function getUsage() {
  const pool = getPool();
  const limit = config.googleMonthlyLimit;
  let used = 0;
  if (pool) {
    const { rows } = await pool.query(
      'SELECT used FROM google_api_usage WHERE month = $1',
      [monthKey()]
    );
    used = rows[0]?.used ?? 0;
  }
  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
    month: monthKey(),
    keyConfigured: Boolean(config.googleMapsApiKey),
  };
}

async function incrementUsage(n = 1) {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO google_api_usage (month, used, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (month) DO UPDATE SET used = google_api_usage.used + $2, updated_at = now()`,
    [monthKey(), n]
  );
}

// ---- Cache ---------------------------------------------------------------
async function cacheGet(key) {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT payload FROM google_api_cache
      WHERE cache_key = $1 AND created_at > now() - ($2 || ' days')::interval`,
    [key, String(config.googleCacheDays)]
  );
  return rows[0]?.payload ?? null;
}

async function cacheSet(key, kind, payload) {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO google_api_cache (cache_key, kind, payload, created_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (cache_key) DO UPDATE SET payload = $3, kind = $2, created_at = now()`,
    [key, kind, JSON.stringify(payload)]
  );
}

/**
 * Core gate: return cached value if present; else make the live call only when
 * a key is set and the monthly budget allows. `liveFn` performs the fetch and
 * returns the value to cache. Returns { value, source, usage, limited }.
 */
async function throughCache(key, kind, liveFn) {
  const cached = await cacheGet(key);
  if (cached != null) {
    return { value: cached, source: 'cache' };
  }
  if (!config.googleMapsApiKey) {
    return { value: null, source: 'disabled', reason: 'No Google API key configured.' };
  }
  const usage = await getUsage();
  if (usage.remaining <= 0) {
    return {
      value: null,
      source: 'limited',
      reason: 'Google API monthly limit reached. Showing cached/internal data only.',
    };
  }
  try {
    const value = await liveFn();
    // Only cache + count successful calls — failures must not consume the cap
    // or poison the 30-day cache.
    await cacheSet(key, kind, value);
    await incrementUsage(1);
    return { value, source: 'live' };
  } catch (err) {
    return { value: null, source: 'error', reason: err.message };
  }
}

// ---- Geocoding -----------------------------------------------------------
export async function geocode(address) {
  const key = `geocode:${address.trim().toLowerCase()}`;
  return throughCache(key, 'geocode', async () => {
    const url =
      'https://maps.googleapis.com/maps/api/geocode/json' +
      `?address=${encodeURIComponent(address)}&key=${config.googleMapsApiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'ZERO_RESULTS') return null;
    if (data.status !== 'OK') {
      throw new Error(`Google Geocoding ${data.status}: ${data.error_message || ''}`.trim());
    }
    const top = data.results[0];
    return {
      lat: top.geometry.location.lat,
      lng: top.geometry.location.lng,
      formattedAddress: top.formatted_address,
    };
  });
}

// ---- Places Nearby (businesses) -----------------------------------------
// Expands the radius 50 → 100 → 200 m until something is found.
export async function placesNearby(lat, lng) {
  const key = `places:${lat.toFixed(5)},${lng.toFixed(5)}`;
  return throughCache(key, 'places', async () => {
    for (const radius of [50, 100, 200]) {
      const url =
        'https://maps.googleapis.com/maps/api/place/nearbysearch/json' +
        `?location=${lat},${lng}&radius=${radius}&key=${config.googleMapsApiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places ${data.status}: ${data.error_message || ''}`.trim());
      }
      const results = data.results || [];
      if (results.length) {
        return results.map((p) => ({
          name: p.name,
          types: p.types || [],
          businessType: (p.types?.[0] || '').replace(/_/g, ' '),
          address: p.vicinity || null,
          placeId: p.place_id,
          lat: p.geometry?.location?.lat ?? null,
          lng: p.geometry?.location?.lng ?? null,
          searchRadiusMeters: radius,
        }));
      }
    }
    return [];
  });
}
