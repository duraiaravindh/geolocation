const UNITS = ['Miles', 'Kilometers', 'Meters', 'Feet'];

export default function SearchPanel({
  query,
  setQuery,
  radius,
  setRadius,
  unit,
  setUnit,
  onSearch,
  onCalculate,
  hasLocation,
  loading,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">Search</h2>
      <p className="mt-1 text-xs text-slate-500">
        By address, parcel address, Parcel ID, or latitude/longitude.
      </p>

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
      >
        <div>
          <label className="text-xs font-medium text-slate-600">Search</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="725 FM 1626, Austin, TX  ·  Parcel ID: 123456789  ·  30.13672,-97.84221"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          Find Location
        </button>
      </form>

      <div className="my-4 border-t border-slate-100" />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600">Radius</label>
          <input
            type="number"
            min="0"
            step="any"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Unit</label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            {UNITS.map((u) => (
              <option key={u} value={u.toLowerCase()}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={onCalculate}
        disabled={!hasLocation || loading}
        className="mt-4 w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {loading ? 'Calculating…' : 'Calculate Population'}
      </button>
      {!hasLocation && (
        <p className="mt-2 text-center text-xs text-slate-400">Find a location first.</p>
      )}
    </div>
  );
}
