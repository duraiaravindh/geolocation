import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { parseInput } from './services/parseInput.js';
import { geocodeAddress } from './services/geocoder.js';
import { lookupParcel } from './services/parcel.js';
import { calculatePopulation, toMeters } from './services/population.js';
import { validateCensusPopulation } from './services/validate.js';
import { getTrafficCounts } from './services/trafficCounts.js';
import { getNearbyPlaces } from './services/places.js';
import { buildRealEstateSummary } from './services/summary.js';
import { calculateDemographics } from './services/demographics.js';
import { smartSearch } from './services/smartSearch.js';
import { getPropertyDetails } from './services/property.js';
import { getAdjacentParcels } from './services/adjacent.js';
import { getUsage, placesNearby } from './services/googleClient.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasCensusKey: Boolean(config.censusApiKey), acsYear: config.acsYear });
});

/**
 * POST /api/search
 * Body: { query: string }
 * Detects input type and resolves it to lat/lng (+ parcel polygon / geography).
 */
app.post('/api/search', async (req, res) => {
  try {
    const { query } = req.body || {};
    const parsed = parseInput(query);

    if (parsed.type === 'coords') {
      return res.json({
        inputType: 'coords',
        lat: parsed.lat,
        lng: parsed.lng,
        label: `${parsed.lat}, ${parsed.lng}`,
      });
    }

    if (parsed.type === 'parcel') {
      const parcel = await lookupParcel(parsed.parcelId);
      const labelParts = [`Parcel ${parcel.parcelId}`];
      if (parcel.address) labelParts.push(parcel.address);
      if (parcel.county) labelParts.push(`${parcel.county} County`);
      return res.json({
        inputType: 'parcel',
        lat: parcel.lat,
        lng: parcel.lng,
        label: labelParts.join(' — '),
        parcelId: parcel.parcelId,
        address: parcel.address,
        county: parcel.county,
        parcelPolygon: parcel.polygon,
      });
    }

    if (parsed.type === 'address') {
      const geo = await geocodeAddress(parsed.address);
      return res.json({
        inputType: 'address',
        lat: geo.lat,
        lng: geo.lng,
        label: geo.matchedAddress || parsed.address,
        geography: geo.geography,
      });
    }

    return res.status(400).json({ error: parsed.error || 'Could not parse input' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/population
 * Body: { lat, lng, radius, unit }
 * Returns the area-weighted estimated population within the radius.
 */
app.post('/api/population', async (req, res) => {
  try {
    const { lat, lng, radius, unit } = req.body || {};

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat and lng must be numbers' });
    }
    const radiusValue = Number(radius);
    if (!Number.isFinite(radiusValue) || radiusValue <= 0) {
      return res.status(400).json({ error: 'radius must be a positive number' });
    }

    const radiusMeters = toMeters(radiusValue, unit);
    const result = await calculatePopulation({ lat, lng, radiusMeters });

    res.json({
      input: { lat, lng, radius: radiusValue, unit },
      ...result,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/population/validate?lat=..&lng=..
 * Census Geography Population mode: reverse-geocode the point to its Census
 * Tract + Block Group and return the official ACS population for each. Not
 * radius-based, so it can be compared with FFIEC / Census websites.
 */
app.get('/api/population/validate', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng must be numbers' });
    }
    const result = await validateCensusPopulation({ lat, lng });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/population/radius?lat=..&lng=..&radius=..&unit=..&debug=true
 * Area-weighted radius population. When debug=true the response includes a
 * per-block-group `debug` breakdown (areas, overlap %, weighted population).
 */
app.get('/api/population/radius', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusValue = Number(req.query.radius);
    const unit = (req.query.unit || 'miles').toLowerCase();
    const debug = ['1', 'true', 'yes'].includes(
      String(req.query.debug || '').toLowerCase()
    );

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng must be numbers' });
    }
    if (!Number.isFinite(radiusValue) || radiusValue <= 0) {
      return res.status(400).json({ error: 'radius must be a positive number' });
    }

    const radiusMeters = toMeters(radiusValue, unit);
    const result = await calculatePopulation({ lat, lng, radiusMeters });

    const payload = {
      estimatedPopulation: result.estimatedPopulation,
      radius: { value: radiusValue, unit },
      blockGroupCount: result.blockGroupCount,
      source: result.source,
    };
    if (debug) payload.debug = result.debug;
    res.json(payload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/demographics?lat=..&lng=..&radius=..&unit=..&debug=true
 * Area-weighted ACS demographic profile within the radius (population,
 * households, median income/age, housing units, owner/renter). debug=true
 * adds the per-block-group breakdown.
 */
app.get('/api/demographics', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusValue = Number(req.query.radius);
    const unit = (req.query.unit || 'miles').toLowerCase();
    const debug = ['1', 'true', 'yes'].includes(
      String(req.query.debug || '').toLowerCase()
    );

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng must be numbers' });
    }
    if (!Number.isFinite(radiusValue) || radiusValue <= 0) {
      return res.status(400).json({ error: 'radius must be a positive number' });
    }

    const radiusMeters = toMeters(radiusValue, unit);
    const result = await calculateDemographics({ lat, lng, radiusMeters });

    const payload = {
      radius: { value: radiusValue, unit },
      blockGroupCount: result.blockGroupCount,
      method: result.method,
      source: result.source,
      demographics: result.demographics,
    };
    if (debug) payload.debug = result.blockGroups;
    res.json(payload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/real-estate-summary?lat=..&lng=..&radius=..&unit=..
 * Optional passthrough identity params: address, parcelId, county, state.
 * Bundles the existing parcel/population/traffic outputs into one summary.
 */
app.get('/api/real-estate-summary', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius = Number(req.query.radius);
    const unit = (req.query.unit || 'miles').toLowerCase();

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng must be numbers' });
    }
    if (!Number.isFinite(radius) || radius <= 0) {
      return res.status(400).json({ error: 'radius must be a positive number' });
    }

    const summary = await buildRealEstateSummary({
      lat,
      lng,
      radius,
      unit,
      address: req.query.address,
      parcelId: req.query.parcelId,
      county: req.query.county,
      state: req.query.state,
    });
    res.json(summary);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/traffic-counts?lat=..&lng=..&radius=..&unit=..&sort=..
 * Returns nearby TxDOT AADT traffic count stations within the radius,
 * sorted by distance (default), AADT, or year.
 */
app.get('/api/traffic-counts', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius = Number(req.query.radius);
    const unit = (req.query.unit || 'miles').toLowerCase();
    const sort = (req.query.sort || 'distance').toLowerCase();
    const resolveRoadNames = ['1', 'true', 'yes'].includes(
      String(req.query.roadNames || '').toLowerCase()
    );

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng must be numbers' });
    }
    if (!Number.isFinite(radius) || radius <= 0) {
      return res.status(400).json({ error: 'radius must be a positive number' });
    }

    const result = await getTrafficCounts({ lat, lng, radius, unit, sort, resolveRoadNames });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/places?lat=..&lng=..&radius=..&unit=..
 * Nearby OSM points of interest grouped by category (restaurants, schools,
 * hospitals, apartments, retail).
 */
app.get('/api/places', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius = Number(req.query.radius);
    const unit = (req.query.unit || 'miles').toLowerCase();

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng must be numbers' });
    }
    if (!Number.isFinite(radius) || radius <= 0) {
      return res.status(400).json({ error: 'radius must be a positive number' });
    }

    const result = await getNearbyPlaces({ lat, lng, radius, unit });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// === Smart Search & Business Intelligence module ===

/**
 * POST /api/smart-search  { query }
 * One box for Address / Parcel ID / Lat,Lng. Internal-DB-first, then Google
 * (cached + capped), then Census fallback. Returns parcel + property + usage.
 */
app.post('/api/smart-search', async (req, res) => {
  try {
    const { query } = req.body || {};
    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: 'query is required' });
    }
    const result = await smartSearch(String(query).trim());
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** GET /api/parcel/:id/property → internal property details. */
app.get('/api/parcel/:id/property', async (req, res) => {
  try {
    const property = await getPropertyDetails(req.params.id);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    res.json(property);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** GET /api/parcel/:id/adjacent → parcels touching (or within 15 m of) this one. */
app.get('/api/parcel/:id/adjacent', async (req, res) => {
  try {
    const parcels = await getAdjacentParcels(req.params.id);
    res.json({ parcelId: req.params.id, count: parcels.length, parcels });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/parcel/:id/businesses → nearby businesses (Google Places, cached +
 * capped). Searches 50 → 100 → 200 m around the parcel centroid.
 */
app.get('/api/parcel/:id/businesses', async (req, res) => {
  try {
    const parcel = await lookupParcel(req.params.id);
    const result = await placesNearby(parcel.lat, parcel.lng);
    res.json({
      parcelId: req.params.id,
      source: result.source,
      note: result.reason || null,
      count: result.value?.length || 0,
      businesses: result.value || [],
      usage: await getUsage(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** GET /api/google-usage → monthly usage counter (used / limit / remaining). */
app.get('/api/google-usage', async (_req, res) => {
  try {
    res.json(await getUsage());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(config.port, () => {
  console.log(`Population-radius API listening on http://localhost:${config.port}`);
  if (!config.censusApiKey) {
    console.warn(
      '\n⚠  CENSUS_API_KEY is not set. Search & buffering will work, but the\n' +
        '   population step will fail until you add a free key to server/.env\n' +
        '   Get one at: https://api.census.gov/data/key_signup.html\n'
    );
  }
});
