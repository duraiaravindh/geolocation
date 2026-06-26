import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { parseInput } from './services/parseInput.js';
import { geocodeAddress } from './services/geocoder.js';
import { lookupParcel } from './services/parcel.js';
import { calculatePopulation, toMeters } from './services/population.js';
import { validateCensusPopulation } from './services/validate.js';
import { getTrafficCounts } from './services/trafficCounts.js';

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
