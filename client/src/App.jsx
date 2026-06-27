import { useState, useEffect } from 'react';
import SearchPanel from './components/SearchPanel.jsx';
import PopulationPanel from './components/PopulationPanel.jsx';
import RealEstateSummary from './components/RealEstateSummary.jsx';
import TrafficPanel from './components/TrafficPanel.jsx';
import NearbyPanel from './components/NearbyPanel.jsx';
import { PLACE_ORDER } from './placeCategories.js';
import MapView from './components/MapView.jsx';
import * as api from './api.js';

export default function App() {
  const [query, setQuery] = useState('');
  const [radius, setRadius] = useState(1);
  const [unit, setUnit] = useState('miles');

  const [location, setLocation] = useState(null); // { lat, lng, label }
  const [property, setProperty] = useState(null); // { address, parcelId, county }
  const [parcelPolygon, setParcelPolygon] = useState(null);
  const [result, setResult] = useState(null);

  // Population validation / debug state
  const [validation, setValidation] = useState(null);
  const [showDebug, setShowDebug] = useState(false);

  // Real Estate Summary (auto-refreshes — no button)
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  // Nearby places
  const [nearby, setNearby] = useState(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [placeVisible, setPlaceVisible] = useState(
    Object.fromEntries(PLACE_ORDER.map((c) => [c, true]))
  );

  // Traffic count state
  const [trafficRadius, setTrafficRadius] = useState(0.5);
  const [trafficUnit, setTrafficUnit] = useState('miles');
  const [trafficSort, setTrafficSort] = useState('distance');
  const [trafficRoadNames, setTrafficRoadNames] = useState(false);
  const [trafficResult, setTrafficResult] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch() {
    setError('');
    setResult(null);
    setTrafficResult(null);
    setValidation(null);
    setSummary(null);
    setSummaryError('');
    setNearby(null);
    setParcelPolygon(null);
    if (!query.trim()) {
      setError('Enter an address, parcel ID, or coordinates.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.search(query);
      setLocation({ lat: res.lat, lng: res.lng, label: res.label });
      setProperty({
        address: res.address || res.label || null,
        parcelId: res.parcelId || null,
        county: res.county || null,
      });
      if (res.parcelPolygon) setParcelPolygon(res.parcelPolygon);
    } catch (err) {
      setLocation(null);
      setProperty(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCalculate() {
    if (!location) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.calculatePopulation({
        lat: location.lat,
        lng: location.lng,
        radius: Number(radius),
        unit,
      });
      setResult(res);
    } catch (err) {
      setResult(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleValidate() {
    if (!location) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.validateCensusPopulation({
        lat: location.lat,
        lng: location.lng,
      });
      setValidation(res);
    } catch (err) {
      setValidation(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGetTraffic(overrides = {}) {
    if (!location) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.getTrafficCounts({
        lat: location.lat,
        lng: location.lng,
        radius: overrides.radius ?? Number(trafficRadius),
        unit: overrides.unit ?? trafficUnit,
        sort: trafficSort,
        roadNames: trafficRoadNames,
      });
      setTrafficResult(res);
    } catch (err) {
      setTrafficResult(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGetNearby() {
    if (!location) return;
    setError('');
    setNearbyLoading(true);
    try {
      const res = await api.getNearbyPlaces({
        lat: location.lat,
        lng: location.lng,
        radius: Number(radius),
        unit,
      });
      setNearby(res);
    } catch (err) {
      setNearby(null);
      setError(err.message);
    } finally {
      setNearbyLoading(false);
    }
  }

  // "Match map view" preset — a ~1.5-mile radius covers the typical TxDOT
  // STARS II map viewport, so the same stations line up for cross-checking.
  function handleMatchMapView() {
    setTrafficRadius(1.5);
    setTrafficUnit('miles');
    handleGetTraffic({ radius: 1.5, unit: 'miles' });
  }

  // Real Estate Summary auto-refreshes whenever the location or the
  // population radius/unit changes. Debounced so typing a radius doesn't
  // fire a request per keystroke.
  useEffect(() => {
    if (!location) {
      setSummary(null);
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
        const res = await api.getRealEstateSummary({
          lat: location.lat,
          lng: location.lng,
          radius: radiusValue,
          unit,
          address: property?.address,
          parcelId: property?.parcelId,
          county: property?.county,
        });
        if (!cancelled) setSummary(res);
      } catch (err) {
        if (!cancelled) {
          setSummary(null);
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
  }, [location, radius, unit, property]);

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
              Population · Demographics · Traffic · Nearby — by radius
            </p>
          </div>
        </div>
        {location && (
          <div className="hidden text-right text-xs text-slate-500 sm:block">
            <div className="font-medium text-slate-700">{location.label}</div>
            <div className="font-mono text-[11px] text-slate-400">
              {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </div>
          </div>
        )}
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[360px_1fr_360px]">
        {/* Left: search + population details */}
        <div className="flex flex-col gap-4 overflow-auto">
          <SearchPanel
            query={query}
            setQuery={setQuery}
            radius={radius}
            setRadius={setRadius}
            unit={unit}
            setUnit={setUnit}
            onSearch={handleSearch}
            onCalculate={handleCalculate}
            hasLocation={Boolean(location)}
            loading={loading}
          />

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <PopulationPanel
            result={result}
            onValidate={handleValidate}
            hasLocation={Boolean(location)}
            loading={loading}
            validation={validation}
            showDebug={showDebug}
            setShowDebug={setShowDebug}
          />

          <NearbyPanel
            onGet={handleGetNearby}
            hasLocation={Boolean(location)}
            loading={nearbyLoading}
            result={nearby}
            visible={placeVisible}
            setVisible={setPlaceVisible}
          />
        </div>

        {/* Center: map */}
        <div className="order-first overflow-hidden rounded-xl border border-slate-200 shadow-sm lg:order-none">
          <MapView
            location={location}
            parcelPolygon={parcelPolygon}
            result={result}
            traffic={trafficResult}
            debug={showDebug}
            places={nearby}
            placeVisible={placeVisible}
          />
        </div>

        {/* Right: real estate summary + traffic details */}
        <div className="flex flex-col gap-4 overflow-auto">
          <RealEstateSummary
            summary={summary}
            loading={summaryLoading}
            error={summaryError}
            hasLocation={Boolean(location)}
          />

          <TrafficPanel
            radius={trafficRadius}
            setRadius={setTrafficRadius}
            unit={trafficUnit}
            setUnit={setTrafficUnit}
            sort={trafficSort}
            setSort={setTrafficSort}
            roadNames={trafficRoadNames}
            setRoadNames={setTrafficRoadNames}
            onGet={handleGetTraffic}
            onMatchMapView={handleMatchMapView}
            hasLocation={Boolean(location)}
            loading={loading}
            result={trafficResult}
          />
        </div>
      </div>
    </div>
  );
}
