/**
 * Real Estate Summary.
 *
 * Combines the outputs of the existing services into one response — it does
 * NOT introduce any new calculations:
 *   - population:  calculatePopulation()   (Census ACS block groups)
 *   - traffic:     getTrafficCounts()       (TxDOT AADT stations)
 *   - geography:   geocodeCoordinates()     (state / county names)
 *
 * Property identity (address / parcel id / county) is passed through from the
 * search the user already ran, so we don't re-query the parcel database.
 */
import { config } from '../config.js';
import { toMeters } from './population.js';
import { calculateDemographics } from './demographics.js';
import { getTrafficCounts } from './trafficCounts.js';
import { geocodeCoordinates } from './geocoder.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function buildRealEstateSummary({
  lat,
  lng,
  radius,
  unit,
  address,
  parcelId,
  county,
  state,
}) {
  const radiusMeters = toMeters(radius, unit);

  // Reuse the existing services in parallel. Reverse-geocode is best-effort
  // (only used to fill in county/state names when the search didn't provide them).
  const [geo, demo, traffic] = await Promise.all([
    geocodeCoordinates(lat, lng).catch(() => null),
    calculateDemographics({ lat, lng, radiusMeters }),
    getTrafficCounts({ lat, lng, radius, unit, sort: 'distance' }),
  ]);

  const stations = traffic.trafficCounts || [];
  const nearest = stations[0] || null;
  const highest = stations.reduce(
    (best, t) => (num(t.aadt) != null && t.aadt > (best?.aadt ?? -1) ? t : best),
    null
  );
  const latestYear = stations.reduce(
    (y, t) => (num(t.year) != null && t.year > y ? t.year : y),
    0
  );

  return {
    property: {
      address: address || null,
      parcelId: parcelId || null,
      county: county || geo?.countyName || null,
      state: state || geo?.stateName || null,
      latitude: lat,
      longitude: lng,
      radius: { value: Number(radius), unit },
    },
    population: {
      estimatedPopulation: demo.estimatedPopulation,
      blockGroupsUsed: demo.blockGroupCount,
      calculationMethod: demo.method,
    },
    demographics: {
      ...demo.demographics,
      blockGroupsUsed: demo.blockGroupCount,
      calculationMethod: demo.method,
      // Per-block-group breakdown for the card's debug mode.
      blockGroups: demo.blockGroups,
    },
    traffic: {
      nearestRoad: nearest?.roadName ?? null,
      nearestAADT: nearest?.aadt ?? null,
      highestAADT: highest?.aadt ?? null,
      stationCount: stations.length,
      latestYear: latestYear || null,
      roads: stations.slice(0, 5).map((t) => ({
        roadName: t.roadName,
        distanceMiles: t.distanceMiles,
        aadt: t.aadt ?? null,
        year: t.year ?? null,
      })),
    },
    sources: {
      population: `U.S. Census ACS ${config.acsYear} 5-Year`,
      traffic: 'TxDOT Traffic Count (STARS II / TCDS)',
      parcel: 'Internal Parcel Dataset',
    },
    // How current each dataset is — surfaced in the card.
    updated: {
      population: `ACS ${config.acsYear} 5-Year`,
      traffic: latestYear ? `${latestYear} count` : null,
      parcel: config.parcelDataUpdated || null,
    },
  };
}
