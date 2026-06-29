import { useState, useEffect, useRef } from 'react';
import SearchPanel from './components/SearchPanel.jsx';
import RealEstateSummary from './components/RealEstateSummary.jsx';
import PropertyCard from './components/PropertyCard.jsx';
import AdjacentCard from './components/AdjacentCard.jsx';
import BusinessesCard from './components/BusinessesCard.jsx';
import MapView from './components/MapView.jsx';
import * as api from './api.js';

export default function App() {
  const [query, setQuery] = useState('');
  // Radius + unit are shared across Population, Demographics, and Traffic.
  const [radius, setRadius] = useState(1);
  const [unit, setUnit] = useState('miles');

  const [location, setLocation] = useState(null); // { lat, lng, label }
  const [parcel, setParcel] = useState(null); // { parcelId, address, county, lat, lng, polygon }
  const [property, setProperty] = useState(null); // detailed property info
  const [parcelPolygon, setParcelPolygon] = useState(null);
  const [result, setResult] = useState(null);

  // Smart Search extras (parcel-centric — independent of radius)
  const [adjacent, setAdjacent] = useState(null);
  const [adjacentLoading, setAdjacentLoading] = useState(false);
  const [businesses, setBusinesses] = useState(null);
  const [businessesLoading, setBusinessesLoading] = useState(false);
  const [apiUsage, setApiUsage] = useState(null);
  const [note, setNote] = useState('');

  // Demographics calculation-detail toggle (also highlights block groups).
  const [showDebug, setShowDebug] = useState(false);

  // Demographics summary (auto-refreshes — no button)
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  // Traffic counts — auto-loaded with the shared radius, shown on the map only.
  const [trafficResult, setTrafficResult] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Resizable splitter between the info panel and the map.
  const [leftWidth, setLeftWidth] = useState(400);
  const draggingRef = useRef(false);
  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return;
      setLeftWidth(Math.min(Math.max(e.clientX, 300), window.innerWidth - 360));
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);
  const startDrag = () => {
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  function resetResults() {
    setResult(null);
    setTrafficResult(null);
    setSummary(null);
    setSummaryError('');
    setAdjacent(null);
    setBusinesses(null);
  }

  // Load parcel-centric extras (adjacent + businesses) in parallel.
  async function loadParcelExtras(parcelId) {
    setAdjacentLoading(true);
    setBusinessesLoading(true);
    api
      .getParcelAdjacent(parcelId)
      .then(setAdjacent)
      .catch(() => setAdjacent(null))
      .finally(() => setAdjacentLoading(false));
    api
      .getParcelBusinesses(parcelId)
      .then((b) => {
        setBusinesses(b);
        if (b.usage) setApiUsage(b.usage);
      })
      .catch(() => setBusinesses(null))
      .finally(() => setBusinessesLoading(false));
  }

  async function handleSearch() {
    setError('');
    setNote('');
    resetResults();
    setParcel(null);
    setProperty(null);
    setParcelPolygon(null);
    if (!query.trim()) {
      setError('Enter an address, parcel ID, or coordinates.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.smartSearch(query);
      setLocation({ lat: res.coordinates.lat, lng: res.coordinates.lng, label: res.label });
      setParcel(res.parcel);
      setProperty(res.property);
      setParcelPolygon(res.parcel?.polygon || null);
      if (res.apiUsage) setApiUsage(res.apiUsage);
      if (res.note) setNote(res.note);
      if (res.parcel) loadParcelExtras(res.parcel.parcelId);
      else setNote((n) => n || 'No parcel found at this location — showing coordinates only.');
    } catch (err) {
      setLocation(null);
      setParcel(null);
      setProperty(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Select an adjacent parcel — recenters, reloads property + extras, and the
  // location change re-triggers demographics/population/traffic. No reload.
  async function handleSelectParcel(p) {
    setError('');
    setNote('');
    resetResults();
    setParcel({
      parcelId: p.parcelId,
      address: p.address,
      county: p.county,
      lat: p.lat,
      lng: p.lng,
      polygon: p.polygon,
    });
    setParcelPolygon(p.polygon || null);
    setLocation({
      lat: p.lat,
      lng: p.lng,
      label: p.address ? `${p.address} — Parcel ${p.parcelId}` : `Parcel ${p.parcelId}`,
    });
    setProperty(null);
    api.getParcelProperty(p.parcelId).then(setProperty).catch(() => setProperty(null));
    loadParcelExtras(p.parcelId);
  }

  // Population (map), Demographics (panel), and Traffic (map) all auto-refresh
  // together whenever the location or the shared radius/unit changes. Debounced
  // so typing a radius doesn't fire a request per keystroke.
  useEffect(() => {
    if (!location) {
      setSummary(null);
      setResult(null);
      setTrafficResult(null);
      setSummaryError('');
      return;
    }
    const radiusValue = Number(radius);
    if (!Number.isFinite(radiusValue) || radiusValue <= 0) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSummaryLoading(true);
      setSummaryError('');
      try {
        const [pop, sum, traffic] = await Promise.all([
          api.calculatePopulation({
            lat: location.lat,
            lng: location.lng,
            radius: radiusValue,
            unit,
          }),
          api.getRealEstateSummary({
            lat: location.lat,
            lng: location.lng,
            radius: radiusValue,
            unit,
            address: parcel?.address,
            parcelId: parcel?.parcelId,
            county: parcel?.county,
          }),
          api
            .getTrafficCounts({
              lat: location.lat,
              lng: location.lng,
              radius: radiusValue,
              unit,
              sort: 'distance',
            })
            .catch(() => null), // traffic is best-effort; never block the rest
        ]);
        if (!cancelled) {
          setResult(pop); // draws the radius buffer + block groups on the map
          setSummary(sum);
          setTrafficResult(traffic); // draws AADT stations on the map
        }
      } catch (err) {
        if (!cancelled) {
          setSummary(null);
          setResult(null);
          setSummaryError(err.message);
        }
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [location, radius, unit, parcel]);

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-100">
      {/* App header */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-sm font-bold text-white">
            P
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight text-slate-800">
              Parcel Intelligence
            </h1>
            <p className="text-[11px] leading-tight text-slate-400">
              Population · Demographics · Traffic — by radius
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {location && (
            <div className="hidden text-right text-xs text-slate-500 sm:block">
              <div className="font-medium text-slate-700">{location.label}</div>
              <div className="font-mono text-[11px] text-slate-400">
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
              </div>
            </div>
          )}
          {apiUsage && <UsageChip usage={apiUsage} />}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: controls + tabbed info panel (resizable) */}
        <aside
          style={{ width: leftWidth }}
          className="flex shrink-0 flex-col overflow-hidden bg-slate-100"
        >
          <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
            <SearchPanel
              query={query}
              setQuery={setQuery}
              radius={radius}
              setRadius={setRadius}
              unit={unit}
              setUnit={setUnit}
              onSearch={handleSearch}
              loading={loading}
            />

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {note && !error && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-700">
                {note}
              </div>
            )}

            {(parcel || location) && (
              <PropertyCard property={property} parcel={parcel} coordinates={location} />
            )}

            {/* Demographics info panel (Population + Demographics combined).
                Traffic shows on the map only — no panel. */}
            <RealEstateSummary
              summary={summary}
              loading={summaryLoading || loading}
              error={summaryError}
              hasLocation={Boolean(location)}
              showDebug={showDebug}
              setShowDebug={setShowDebug}
            />

            {parcel && <BusinessesCard data={businesses} loading={businessesLoading} />}

            {parcel && (
              <AdjacentCard
                data={adjacent}
                loading={adjacentLoading}
                onSelect={handleSelectParcel}
              />
            )}
          </div>
        </aside>

        {/* Draggable splitter */}
        <div
          onMouseDown={startDrag}
          className="w-1.5 shrink-0 cursor-col-resize bg-slate-200 transition hover:bg-sky-400"
          title="Drag to resize"
        />

        {/* Right: map */}
        <main className="flex-1 overflow-hidden">
          <MapView
            location={location}
            parcelPolygon={parcelPolygon}
            result={result}
            traffic={trafficResult}
            debug={showDebug}
            adjacent={adjacent?.parcels}
            businesses={businesses?.businesses}
            onSelectParcel={handleSelectParcel}
          />
        </main>
      </div>
    </div>
  );
}

function UsageChip({ usage }) {
  const low = usage.remaining < 500;
  const off = !usage.keyConfigured;
  const color = off
    ? 'border-slate-200 bg-slate-50 text-slate-500'
    : low
    ? 'border-amber-300 bg-amber-50 text-amber-700'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return (
    <div
      className={`rounded-lg border px-3 py-1.5 text-right text-[11px] ${color}`}
      title="Google Maps Platform monthly usage"
    >
      <div className="font-semibold">Google API</div>
      {off ? (
        <div>key not set</div>
      ) : (
        <div>
          {usage.used.toLocaleString()} / {usage.limit.toLocaleString()}
          <span className="ml-1 opacity-70">({usage.remaining.toLocaleString()} left)</span>
        </div>
      )}
    </div>
  );
}
