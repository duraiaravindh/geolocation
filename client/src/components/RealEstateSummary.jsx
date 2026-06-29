const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');
const money = (n) => (typeof n === 'number' ? `$${n.toLocaleString()}` : '—');
const pct = (n) => (typeof n === 'number' ? `${n}%` : '—');

/**
 * Demographics card (ACS 5-Year). Auto-generated — area-weighted across the
 * Census block groups intersecting the search radius. Includes the official
 * Tract / Block Group cross-check (formerly the separate Population panel).
 */
export default function RealEstateSummary({
  summary,
  loading,
  error,
  hasLocation,
  showDebug,
  setShowDebug,
}) {
  const demo = summary?.demographics;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Demographics (ACS 5-Year)</h2>
        {loading && <span className="text-xs text-slate-400">Updating…</span>}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Auto-generated — area-weighted across Census block groups in the radius.
      </p>

      {!hasLocation && (
        <p className="mt-4 text-sm text-slate-400">Search a parcel to see demographics.</p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {hasLocation && !demo && !error && loading && (
        <p className="mt-4 text-sm text-slate-400">Generating demographics…</p>
      )}

      {demo && (
        <div className="mt-4">
          <Grid>
            <Item label="Population" value={fmt(demo.population)} />
            <Item label="Households" value={fmt(demo.households)} />
            <Item label="Housing Units" value={fmt(demo.housingUnits)} />
            <Item label="Median HH Income" value={money(demo.medianHouseholdIncome)} />
            <Item label="Median Age" value={demo.medianAge ?? '—'} />
            <Item label="Block Groups Used" value={fmt(demo.blockGroupsUsed)} />
            <Item label="Owner-Occupied" value={`${fmt(demo.ownerOccupied)} (${pct(demo.ownerPercent)})`} />
            <Item label="Renter-Occupied" value={`${fmt(demo.renterOccupied)} (${pct(demo.renterPercent)})`} />
          </Grid>

          {/* Owner vs renter split bar */}
          {demo.ownerPercent != null && (
            <div className="mt-3">
              <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="bg-emerald-500" style={{ width: `${demo.ownerPercent}%` }} />
                <div className="bg-amber-400" style={{ width: `${demo.renterPercent}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                <span>Owner {pct(demo.ownerPercent)}</span>
                <span>Renter {pct(demo.renterPercent)}</span>
              </div>
            </div>
          )}

          {demo.blockGroups?.length > 0 && (
            <>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={showDebug}
                  onChange={(e) => setShowDebug(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                Show demographic calculation details
              </label>

              {showDebug && (
                <div className="mt-2 max-h-72 overflow-auto">
                  <table className="w-full text-left text-[10px]">
                    <thead className="sticky top-0 bg-white text-slate-400">
                      <tr>
                        <th className="py-1 pr-2">GEOID</th>
                        <th className="py-1 pr-2 text-right">Pop</th>
                        <th className="py-1 pr-2 text-right">HH</th>
                        <th className="py-1 pr-2 text-right">Med Inc</th>
                        <th className="py-1 pr-2 text-right">Age</th>
                        <th className="py-1 pr-2 text-right">Units</th>
                        <th className="py-1 pr-2 text-right">Overlap</th>
                        <th className="py-1 text-right">Wtd Pop</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-600">
                      {demo.blockGroups.map((b) => (
                        <tr key={b.geoid} className="border-t border-slate-100">
                          <td className="py-1 pr-2 font-mono">{b.geoid}</td>
                          <td className="py-1 pr-2 text-right">{fmt(b.population)}</td>
                          <td className="py-1 pr-2 text-right">{fmt(b.households)}</td>
                          <td className="py-1 pr-2 text-right">
                            {b.medianHouseholdIncome != null ? money(b.medianHouseholdIncome) : '—'}
                          </td>
                          <td className="py-1 pr-2 text-right">{b.medianAge ?? '—'}</td>
                          <td className="py-1 pr-2 text-right">{fmt(b.housingUnits)}</td>
                          <td className="py-1 pr-2 text-right">{b.overlapPercent}%</td>
                          <td className="py-1 text-right font-medium text-slate-700">
                            {fmt(b.weightedPopulation)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-1 text-[9px] text-slate-400">
                    Counts are area-weighted; medians are population-weighted across overlapping block groups.
                  </p>
                </div>
              )}
            </>
          )}

          {summary?.sources?.population && (
            <p className="mt-3 text-[10px] text-slate-400">
              Radius demographics source: {summary.sources.population}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Grid({ children }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-2">{children}</dl>;
}

function Item({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-sm font-medium text-slate-700">{value ?? '—'}</dd>
    </div>
  );
}
