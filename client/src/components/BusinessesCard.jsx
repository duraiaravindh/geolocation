/**
 * Nearby Businesses (Google Places, cached + capped). Property type and
 * business type are shown separately (per spec).
 */
export default function BusinessesCard({ data, loading }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Businesses</h2>
        {data?.count != null && (
          <span className="text-xs text-slate-400">{data.count} found</span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Nearby businesses around the parcel (Google Places, 50–200 m).
      </p>

      {loading && <p className="mt-3 text-sm text-slate-400">Loading businesses…</p>}

      {!loading && data?.note && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {data.source === 'limited'
            ? 'Google API monthly limit reached — showing cached/internal data only.'
            : data.source === 'error'
            ? `Business search unavailable: ${data.note}`
            : data.note}
        </div>
      )}

      {!loading && data && data.count === 0 && !data.note && (
        <p className="mt-3 text-sm text-slate-400">No businesses found near this parcel.</p>
      )}

      {!loading && data?.businesses?.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {data.businesses.map((b) => (
            <li key={b.placeId} className="py-2">
              <div className="text-sm font-medium text-slate-800">{b.name}</div>
              <div className="text-xs text-slate-500">
                {b.businessType || '—'}
                {b.address ? ` · ${b.address}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}

      {data?.source && !loading && (
        <p className="mt-2 text-[10px] text-slate-400">
          Source: Google Places ({data.source})
        </p>
      )}
    </div>
  );
}
