import { useState } from 'react';

const UNITS = ['Miles', 'Kilometers', 'Meters', 'Feet'];

const SORTS = [
  { value: 'distance', label: 'Nearest first' },
  { value: 'aadt', label: 'Highest AADT first' },
  { value: 'year', label: 'Latest year first' },
];

export default function TrafficPanel({
  radius,
  setRadius,
  unit,
  setUnit,
  sort,
  setSort,
  roadNames,
  setRoadNames,
  onGet,
  onMatchMapView,
  hasLocation,
  loading,
  result,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">Nearby Traffic Counts</h2>
      <p className="mt-1 text-xs text-slate-500">
        TxDOT AADT (Annual Average Daily Traffic) stations near the location.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600">Search Radius</label>
          <input
            type="number"
            min="0"
            step="any"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Unit</label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {UNITS.map((u) => (
              <option key={u} value={u.toLowerCase()}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label className="text-xs font-medium text-slate-600">Sort by</label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={roadNames}
          onChange={(e) => setRoadNames(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Resolve local road names for off-system stations{' '}
          <span className="text-slate-400">
            (slower — uses OpenStreetMap, ~1s per station)
          </span>
        </span>
      </label>

      <button
        type="button"
        onClick={() => onGet()}
        disabled={!hasLocation || loading}
        className="mt-4 w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {loading ? 'Loading…' : 'Get Traffic Counts'}
      </button>

      <button
        type="button"
        onClick={onMatchMapView}
        disabled={!hasLocation || loading}
        title="Set a ~1.5-mile radius to match the TxDOT STARS II map viewport"
        className="mt-2 w-full rounded-lg border border-sky-300 bg-sky-50 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
      >
        Match map view (1.5 mi · TxDOT cross-check)
      </button>
      {!hasLocation && (
        <p className="mt-2 text-center text-xs text-slate-400">Find a location first.</p>
      )}

      {result && <TrafficResults result={result} />}
    </div>
  );
}

function TrafficResults({ result }) {
  const [showDebug, setShowDebug] = useState(false);

  if (result.count === 0) {
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        No traffic count stations found within the selected radius. Try increasing the
        search radius.
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-2 text-xs text-slate-500">
        {result.count} station{result.count === 1 ? '' : 's'} within{' '}
        {result.radius.value} {result.radius.unit}
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-white text-slate-400">
            <tr>
              <th className="py-1 pr-2">Road</th>
              <th className="py-1 pr-2 text-right">AADT</th>
              <th className="py-1 pr-2 text-right">Year</th>
              <th className="py-1 pr-2 text-right">Dist.</th>
              <th className="py-1 pr-2">Station</th>
              <th className="py-1">Source</th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            {result.trafficCounts.map((t, i) => (
              <tr key={`${t.stationId}-${i}`} className="border-t border-slate-100">
                <td className="py-1 pr-2 font-medium">
                  {t.roadName}
                  {t.dataset === '5-Year (off-system)' && (
                    <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] text-blue-700">
                      5-yr
                    </span>
                  )}
                </td>
                <td className="py-1 pr-2 text-right">
                  {t.aadt != null ? t.aadt.toLocaleString() : '—'}
                </td>
                <td className="py-1 pr-2 text-right">{t.year ?? '—'}</td>
                <td className="py-1 pr-2 text-right">{t.distanceMiles} mi</td>
                <td className="py-1 pr-2 font-mono">{t.stationId ?? '—'}</td>
                <td className="py-1">{t.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={showDebug}
          onChange={(e) => setShowDebug(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
        />
        Show Traffic Debug Details
      </label>

      {showDebug && <TrafficDebug result={result} />}
    </div>
  );
}

/**
 * Station-based cross-check table. Unlike population, traffic counts are NOT
 * area-weighted — each row is one TxDOT station, shown with every field needed
 * to look it up in TxDOT STARS II / TCDS and confirm the AADT + year match.
 */
function TrafficDebug({ result }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Traffic Count Validation</h3>
        {result.sourcePortalUrl && (
          <a
            href={result.sourcePortalUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-amber-600 hover:underline"
          >
            Open TxDOT STARS II ↗
          </a>
        )}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        Search a <span className="font-medium">Station ID</span> (or road + county) in
        STARS II and confirm the AADT &amp; year match. Stations are not
        area-weighted — each row is one count location.
      </p>

      <div className="mt-2 max-h-80 overflow-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-white text-slate-400">
            <tr>
              <th className="py-1 pr-2">Station ID</th>
              <th className="py-1 pr-2">Road</th>
              <th className="py-1 pr-2 text-right">AADT</th>
              <th className="py-1 pr-2 text-right">Year</th>
              <th className="py-1 pr-2 text-right">Dist.</th>
              <th className="py-1 pr-2">Lat / Lon</th>
              <th className="py-1 pr-2">Source</th>
              <th className="py-1">Verify</th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            {result.trafficCounts.map((t, i) => (
              <tr key={`dbg-${t.stationId}-${i}`} className="border-t border-slate-100 align-top">
                <td className="py-1 pr-2 font-mono">{t.stationId ?? '—'}</td>
                <td className="py-1 pr-2">{t.roadName}</td>
                <td className="py-1 pr-2 text-right">
                  {t.aadt != null ? t.aadt.toLocaleString() : '—'}
                </td>
                <td className="py-1 pr-2 text-right">{t.year ?? '—'}</td>
                <td className="py-1 pr-2 text-right">{t.distanceMiles} mi</td>
                <td className="py-1 pr-2 font-mono">
                  {t.lat != null && t.lng != null
                    ? `${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}`
                    : '—'}
                </td>
                <td className="py-1 pr-2">
                  {t.source}
                  {t.county ? <span className="text-slate-400"> · {t.county}</span> : null}
                </td>
                <td className="py-1 space-x-2 whitespace-nowrap">
                  {t.sourceUrl && (
                    <a href={t.sourceUrl} target="_blank" rel="noreferrer" className="text-amber-600 hover:underline">
                      STARS II
                    </a>
                  )}
                  {t.mapUrl && (
                    <a href={t.mapUrl} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
                      Map
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-slate-400">Source: {result.source}</p>
    </div>
  );
}
