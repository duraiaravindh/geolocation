import { PLACE_ORDER, PLACE_META } from '../placeCategories.js';

/**
 * Nearby points of interest (OpenStreetMap). A button fetches places within
 * the radius; per-category toggles show/hide the matching map markers.
 */
export default function NearbyPanel({
  onGet,
  hasLocation,
  loading,
  result,
  visible,
  setVisible,
}) {
  const toggle = (cat) => setVisible((v) => ({ ...v, [cat]: !v[cat] }));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">Nearby</h2>
      <p className="mt-1 text-xs text-slate-500">
        Restaurants, schools, hospitals, apartments &amp; retail from OpenStreetMap.
      </p>

      <button
        type="button"
        onClick={onGet}
        disabled={!hasLocation || loading}
        className="mt-4 w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {loading ? 'Searching…' : 'Find Nearby Places'}
      </button>
      {!hasLocation && (
        <p className="mt-2 text-center text-xs text-slate-400">Find a location first.</p>
      )}

      {result && (
        <div className="mt-4 space-y-1.5">
          {result.radius?.clamped && (
            <p className="mb-2 text-[11px] text-amber-600">
              Capped to ~3 mi for nearby places.
            </p>
          )}
          {PLACE_ORDER.map((cat) => {
            const meta = PLACE_META[cat];
            const count = result.counts?.[cat] ?? 0;
            const on = visible[cat];
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggle(cat)}
                disabled={count === 0}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                  on && count > 0
                    ? 'border-slate-200 bg-white'
                    : 'border-slate-100 bg-slate-50 opacity-60'
                } disabled:cursor-default disabled:opacity-40`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-xs"
                    style={{ border: `2px solid ${meta.color}` }}
                  >
                    {meta.emoji}
                  </span>
                  <span className="font-medium text-slate-700">{meta.label}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{count}</span>
                  {count > 0 && (
                    <span className="text-[10px] uppercase text-slate-400">
                      {on ? 'shown' : 'hidden'}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          <p className="pt-1 text-[10px] text-slate-400">Source: {result.source}</p>
        </div>
      )}
    </div>
  );
}
