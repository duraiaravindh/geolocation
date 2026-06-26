const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');

/**
 * Population Validation panel.
 *  - "Validate Census Population" → official Tract / Block Group ACS population
 *    (independent of the radius, comparable with FFIEC / Census websites).
 *  - "Show Population Calculation Details" toggle → per-block-group breakdown of
 *    the area-weighted radius estimate (areas, overlap %, weighted contribution).
 */
export default function ValidationPanel({
  onValidate,
  hasLocation,
  loading,
  validation,
  showDebug,
  setShowDebug,
  result,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">Population Validation</h2>
      <p className="mt-1 text-xs text-slate-500">
        Cross-check the radius estimate against official Census geography values.
      </p>

      <button
        type="button"
        onClick={onValidate}
        disabled={!hasLocation || loading}
        className="mt-4 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {loading ? 'Working…' : 'Validate Census Population'}
      </button>
      {!hasLocation && (
        <p className="mt-2 text-center text-xs text-slate-400">Find a location first.</p>
      )}

      {validation && (
        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
          <h3 className="text-sm font-semibold text-emerald-800">Census Validation</h3>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
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

          <p className="mt-3 text-[11px] text-emerald-700/80">Source: {validation.source}</p>
        </div>
      )}

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={showDebug}
          onChange={(e) => setShowDebug(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
        />
        Show Population Calculation Details
      </label>

      {showDebug && (
        <DebugBreakdown result={result} />
      )}
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div>
      <dt className="uppercase tracking-wide text-emerald-700/60">{label}</dt>
      <dd className={`font-medium text-slate-700 ${mono ? 'font-mono' : ''}`}>
        {value ?? '—'}
      </dd>
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

function DebugBreakdown({ result }) {
  if (!result?.blockGroups?.length) {
    return (
      <p className="mt-3 text-xs text-slate-400">
        Run <span className="font-medium">Calculate Population</span> to see the
        radius calculation breakdown.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold text-slate-700">Radius Population Debug</h3>
      <div className="mt-2 max-h-72 overflow-auto">
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
      <p className="mt-1 text-[10px] text-slate-400">Areas in square meters.</p>

      <div className="mt-3 rounded-lg bg-sky-50 p-3 ring-1 ring-sky-100">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">
          Final Estimated Radius Population
        </div>
        <div className="text-2xl font-bold text-sky-600">
          {fmt(result.estimatedPopulation)}
        </div>
      </div>
    </div>
  );
}
