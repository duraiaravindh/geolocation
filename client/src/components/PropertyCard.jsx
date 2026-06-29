const money = (n) => (typeof n === 'number' ? `$${n.toLocaleString()}` : '—');

/** Property Information — internal parcel dataset (no Google). */
export default function PropertyCard({ property, parcel, coordinates }) {
  if (!parcel && !coordinates) return null;

  const lat = parcel?.lat ?? coordinates?.lat;
  const lng = parcel?.lng ?? coordinates?.lng;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">Property</h2>

      {!parcel ? (
        <p className="mt-2 text-sm text-slate-400">
          No parcel found at this location (e.g. a road or right-of-way). Coordinates only.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm font-medium text-slate-700">
            {parcel.address || '—'}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Item label="Parcel ID" value={parcel.parcelId} mono />
            <Item label="Property Type" value={property?.propertyType || '—'} />
            <Item label="County" value={property?.county || parcel.county || '—'} />
            <Item label="State" value={property?.state || '—'} />
            <Item label="Latitude" value={lat?.toFixed(5)} mono />
            <Item label="Longitude" value={lng?.toFixed(5)} mono />
            <Item
              label="Parcel Area"
              value={
                property?.area
                  ? property.area.acres != null
                    ? `${property.area.acres} ac${property.area.squareFeet ? ` (${property.area.squareFeet.toLocaleString()} sf)` : ''}`
                    : '—'
                  : '—'
              }
            />
            <Item label="Owner" value={property?.owner || '—'} />
            <Item label="Market Value" value={money(property?.marketValue)} />
            <Item label="Land Value" value={money(property?.landValue)} />
          </dl>
          {property?.legalDescription && (
            <p className="mt-3 text-[11px] text-slate-400">{property.legalDescription}</p>
          )}
          {property?.source && (
            <p className="mt-1 text-[10px] text-slate-400">Source: {property.source}</p>
          )}
        </>
      )}
    </div>
  );
}

function Item({ label, value, mono }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-sm font-medium text-slate-700 ${mono ? 'font-mono' : ''}`}>
        {value ?? '—'}
      </dd>
    </div>
  );
}
