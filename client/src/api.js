async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  }
  return data;
}

export function search(query) {
  return postJson('/api/search', { query });
}

// --- Smart Search & Business Intelligence ---
export function smartSearch(query) {
  return postJson('/api/smart-search', { query });
}

async function getJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  return data;
}

export const getParcelProperty = (id) => getJson(`/api/parcel/${encodeURIComponent(id)}/property`);
export const getParcelAdjacent = (id) => getJson(`/api/parcel/${encodeURIComponent(id)}/adjacent`);
export const getParcelBusinesses = (id) => getJson(`/api/parcel/${encodeURIComponent(id)}/businesses`);
export const getGoogleUsage = () => getJson('/api/google-usage');

export function calculatePopulation({ lat, lng, radius, unit }) {
  return postJson('/api/population', { lat, lng, radius, unit });
}

export async function getRealEstateSummary({
  lat,
  lng,
  radius,
  unit,
  address,
  parcelId,
  county,
}) {
  const params = new URLSearchParams({ lat, lng, radius, unit });
  if (address) params.set('address', address);
  if (parcelId) params.set('parcelId', parcelId);
  if (county) params.set('county', county);
  const res = await fetch(`/api/real-estate-summary?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  }
  return data;
}

export async function getTrafficCounts({
  lat,
  lng,
  radius,
  unit,
  sort = 'distance',
  roadNames = false,
}) {
  const params = new URLSearchParams({ lat, lng, radius, unit, sort });
  if (roadNames) params.set('roadNames', '1');
  const res = await fetch(`/api/traffic-counts?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  }
  return data;
}
