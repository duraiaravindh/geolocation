const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');

function unitLabel(radius, unit) {
  const singular = { miles: 'Mile', kilometers: 'Kilometer', meters: 'Meter', feet: 'Foot' }[unit];
  const plural = { miles: 'Miles', kilometers: 'Kilometers', meters: 'Meters', feet: 'Feet' }[unit];
  return `${radius} ${radius === 1 ? singular : plural}`;
}

/**
 * Population — one panel combining the two population features:
 *   1. Radius estimate (area-weighted Census block groups)
 *   2. Census cross-check (official Tract / Block Group ACS population)
 *   + a debug toggle showing the per-block-group calculation.
 */
export default function PopulationPanel({
  result,
  onValidate,
  hasLocation,
  loading,
  validation,
  showDebug,
  setShowDebug,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">Population</h2>
      <p className="mt-1 text-xs text-slate-500">
        Area-weighted radius estimate, cross-checked against official Census geography.
      </p>

      {/* 1 — Radius estimate */}
      {result ? (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">
            Estimated Population (radius)
          </div>
          <div className="text-3xl font-bold text-sky-600">
            {fmt(result.estimatedPopulation)}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Item label="Radius" value={unitLabel(result.input.radius, result.input.unit)} />
            <Item label="Block Groups" value={result.blockGroupCount} />
            <Item label="Method" value={result.method} />
            <Item label="Source" value={result.source} />
          </dl>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-400">
          {hasLocation
            ? 'Click “Calculate Population” to estimate the radius population.'
            : 'Find a location, then calculate the radius population.'}
        </p>
      )}

      {/* 2 — Census cross-check */}
      <div className="my-4 border-t border-slate-100" />
      <div className="text-xs uppercase tracking-wide text-slate-400">
        Cross-check — official Census geography
      </div>
      <button
        type="button"
        onClick={onValidate}
        disabled={!hasLocation || loading}
        className="mt-2 w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {loading ? 'Working…' : 'Validate Census Population'}
      </button>

      {validation && (
        <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Field label="State" value={validation.stateName || validation.state} />
            <Field label="County" value={validation.countyName || validation.county} />
            <Field label="Census Tract" value={validation.tract} mono />
            <Field label="Block Group" value={validation.blockGroup} mono />
            <Field label="Tract GEOID" value={validation.tractGeoid} mono />
            <Field label="Block Group GEOID" value={validation.blockGroupGeoid} mono />
          </dl>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label="Tract Population" value={fmt(validation.tractPopulation)} />
            <Stat label="Block Group Population" value={fmt(validation.blockGroupPopulation)} />
          </div>
          <p className="mt-3 text-[11px] text-emerald-700/80">
            Tract / block-group totals describe whole geographies, so they won’t match the
            radius estimate. Source: {validation.source}
          </p>
        </div>
      )}

      {/* Debug breakdown of the radius calculation */}
      {result?.blockGroups?.length > 0 && (
        <>
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            Show population calculation details
          </label>

          {showDebug && (
            <div className="mt-2">
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-white text-slate-400">
                    <tr>
                      <th className="py-1 pr-2">GEOID</th>
                      <th className="py-1 pr-2 text-right">Pop.</th>
                      <th className="py-1 pr-2 text-right">BG Area</th>
                      <th className="py-1 pr-2 text-right">In Radius</th>
                      <th className="py-1 pr-2 text-right">Overlap</th>
                      <th className="py-1 text-right">Contrib.</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600">
                    {result.blockGroups.map((bg) => (
                      <tr key={bg.geoid} className="border-t border-slate-100">
                        <td className="py-1 pr-2 font-mono">{bg.geoid}</td>
                        <td className="py-1 pr-2 text-right">{fmt(bg.population)}</td>
                        <td className="py-1 pr-2 text-right">{fmt(bg.blockGroupArea)}</td>
                        <td className="py-1 pr-2 text-right">{fmt(bg.intersectionArea)}</td>
                        <td className="py-1 pr-2 text-right">{bg.overlapPercent}%</td>
                        <td className="py-1 text-right font-medium text-slate-700">
                          {fmt(bg.weightedPopulation)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                Areas in square meters. Weighted contribution = population × overlap %.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Item({ label, value }) {
  return (
    <div>
      <dt className="uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-700">{value ?? '—'}</dd>
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div>
      <dt className="uppercase tracking-wide text-emerald-700/60">{label}</dt>
      <dd className={`font-medium text-slate-700 ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</dd>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-md bg-white p-2 ring-1 ring-emerald-100">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-xl font-bold text-emerald-600">{value}</div>
    </div>
  );
}
