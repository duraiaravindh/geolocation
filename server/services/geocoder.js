/**
 * Census Geocoder service.
 * Converts an address into latitude/longitude plus Census geography
 * (state / county / tract / block group GEOID).
 *
 * Docs: https://geocoding.geo.census.gov/geocoder/
 */

const GEOCODER_BASE = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';

export async function geocodeAddress(address) {
  const params = new URLSearchParams({
    address,
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    format: 'json',
  });

  const url = `${GEOCODER_BASE}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Census geocoder returned HTTP ${res.status}`);
  }
  const data = await res.json();

  const matches = data?.result?.addressMatches || [];
  if (matches.length === 0) {
    throw new Error(`No match found for address: "${address}"`);
  }

  const match = matches[0];
  const lat = match.coordinates.y;
  const lng = match.coordinates.x;

  // The "Current_Current" vintage returns 2020 Census Blocks; the block
  // group GEOID is the first 12 characters of the 15-digit block GEOID.
  const geo = match.geographies || {};
  const blocks = geo['2020 Census Blocks'] || [];
  const tracts = geo['Census Tracts'] || [];

  let geography = null;
  if (blocks.length > 0) {
    const b = blocks[0];
    const blockGroupGeoid = (b.GEOID || '').slice(0, 12);
    geography = {
      state: b.STATE,
      county: b.COUNTY,
      tract: b.TRACT,
      blockGroup: b.BLKGRP,
      blockGroupGeoid,
    };
  } else if (tracts.length > 0) {
    const t = tracts[0];
    geography = { state: t.STATE, county: t.COUNTY, tract: t.TRACT };
  }

  return {
    lat,
    lng,
    matchedAddress: match.matchedAddress,
    geography,
  };
}

const COORD_BASE = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';

/**
 * Reverse-geocode a lat/lng into Census geography (state / county / tract /
 * block group), including human-readable state & county names. Used by the
 * Census-geography validation mode, which is independent of any radius.
 *
 * @param {number} lat
 * @param {number} lng
 */
export async function geocodeCoordinates(lat, lng) {
  const params = new URLSearchParams({
    x: String(lng),
    y: String(lat),
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    format: 'json',
  });

  const res = await fetch(`${COORD_BASE}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Census geocoder returned HTTP ${res.status}`);
  }
  const data = await res.json();
  const geo = data?.result?.geographies || {};

  const blocks = geo['2020 Census Blocks'] || [];
  if (blocks.length === 0) {
    throw new Error(
      `No Census geography found for ${lat}, ${lng}. ` +
        `The point may be outside the United States.`
    );
  }

  const b = blocks[0];
  const stateName = geo.States?.[0]?.NAME || null;
  const countyName = geo.Counties?.[0]?.NAME || null;
  const tractGeoid = `${b.STATE}${b.COUNTY}${b.TRACT}`;
  const blockGroupGeoid = (b.GEOID || '').slice(0, 12);

  return {
    state: b.STATE,
    county: b.COUNTY,
    tract: b.TRACT,
    blockGroup: b.BLKGRP,
    tractGeoid,
    blockGroupGeoid,
    stateName,
    countyName,
  };
}
