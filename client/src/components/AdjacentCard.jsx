const money = (n) => (typeof n === 'number' ? `$${n.toLocaleString()}` : '—');

/** Adjacent parcels — click a row to select it (recenters + reloads details). */
export default function AdjacentCard({ data, loading, onSelect }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Adjacent Parcels</h2>
        {data?.count != null && (
          <span className="text-xs text-slate-400">{data.count}</span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Parcels sharing a boundary — click to inspect.
      </p>

      {loading && <p className="mt-3 text-sm text-slate-400">Finding neighbours…</p>}

      {!loading && data && data.count === 0 && (
        <p className="mt-3 text-sm text-slate-400">No adjacent parcels found.</p>
      )}

      {!loading && data?.parcels?.length > 0 && (
        <ul className="mt-3 max-h-72 divide-y divide-slate-100 overflow-auto">
          {data.parcels.map((p) => (
            <li key={p.parcelId}>
              <button
                type="button"
                onClick={() => onSelect(p)}
                className="w-full rounded-md px-2 py-2 text-left hover:bg-sky-50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-700">{p.parcelId}</span>
                  <span className="text-[11px] text-slate-400">
                    {p.areaAcres != null ? `${p.areaAcres} ac` : ''}
                  </span>
                </div>
                <div className="text-xs text-slate-600">{p.address || '—'}</div>
                <div className="text-[11px] text-slate-400">
                  {p.propertyType || '—'}
                  {p.marketValue != null ? ` · ${money(p.marketValue)}` : ''}
                  {p.owner ? ` · ${p.owner}` : ''}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
