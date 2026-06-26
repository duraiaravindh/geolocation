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

export function calculatePopulation({ lat, lng, radius, unit }) {
  return postJson('/api/population', { lat, lng, radius, unit });
}

export async function validateCensusPopulation({ lat, lng }) {
  const params = new URLSearchParams({ lat, lng });
  const res = await fetch(`/api/population/validate?${params.toString()}`);
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
