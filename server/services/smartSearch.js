/**
 * Smart Search — one box for Address / Parcel ID / Lat,Lng.
 *
 * Search priority (minimises Google usage):
 *   1. Internal parcel DB (by parcel id, by address, or by point for coords)
 *   2. Google Geocoding (cached + capped) → locate parcel by point
 *   3. Free Census geocoder fallback when Google is unavailable
 */
import { parseInput } from './parseInput.js';
import { lookupParcel, lookupParcelByAddress, findParcelByPoint } from './parcel.js';
import { geocodeAddress } from './geocoder.js';
import { geocode as googleGeocode, getUsage } from './googleClient.js';
import { getPropertyDetails } from './property.js';

export async function smartSearch(query) {
  const parsed = parseInput(query);
  let parcel = null;
  let coordinates = null;
  let resolvedBy = null;
  let geocodeSource = null;
  let note = null;

  if (parsed.type === 'coords') {
    coordinates = { lat: parsed.lat, lng: parsed.lng };
    parcel = await findParcelByPoint(parsed.lat, parsed.lng);
    resolvedBy = parcel ? 'coordinates → parcel' : 'coordinates (no parcel here)';
  } else if (parsed.type === 'parcel') {
    parcel = await lookupParcel(parsed.parcelId); // throws if not found
    coordinates = { lat: parcel.lat, lng: parcel.lng };
    resolvedBy = 'parcel id (internal DB)';
  } else if (parsed.type === 'address') {
    // Step 1 — internal DB
    parcel = await lookupParcelByAddress(parsed.address);
    if (parcel) {
      coordinates = { lat: parcel.lat, lng: parcel.lng };
      resolvedBy = 'address (internal DB)';
    } else {
      // Step 2 — Google geocode (cached + capped)
      const g = await googleGeocode(parsed.address);
      if (g.value) {
        coordinates = { lat: g.value.lat, lng: g.value.lng };
        geocodeSource = `google (${g.source})`;
      } else {
        // Step 3 — free Census geocoder fallback
        if (g.reason) note = g.reason;
        const c = await geocodeAddress(parsed.address);
        coordinates = { lat: c.lat, lng: c.lng };
        geocodeSource = 'census (fallback)';
      }
      // locate the parcel under the geocoded point
      parcel = await findParcelByPoint(coordinates.lat, coordinates.lng);
      resolvedBy = parcel ? `address → geocode → parcel` : `address → geocode (no parcel here)`;
    }
  } else {
    throw new Error(parsed.error || 'Could not parse input');
  }

  const property = parcel ? await getPropertyDetails(parcel.parcelId) : null;
  const apiUsage = await getUsage();

  const label = parcel
    ? parcel.address
      ? `${parcel.address} — Parcel ${parcel.parcelId}`
      : `Parcel ${parcel.parcelId}`
    : coordinates
    ? `${coordinates.lat}, ${coordinates.lng}`
    : query;

  return {
    resolvedBy,
    geocodeSource,
    note,
    label,
    coordinates,
    parcel: parcel
      ? {
          parcelId: parcel.parcelId,
          address: parcel.address,
          county: parcel.county,
          lat: parcel.lat,
          lng: parcel.lng,
          polygon: parcel.polygon,
        }
      : null,
    property,
    apiUsage,
  };
}
