import { useEffect, useRef } from 'react';
import L from 'leaflet';

// Reliable marker icons. Bundled PNG imports often break the icon under Vite,
// so we point Leaflet's default icon at the CDN copies (same version as the CSS).
const ICON_BASE = 'https://unpkg.com/leaflet@1.9.4/dist/images';
const defaultIcon = L.icon({
  iconUrl: `${ICON_BASE}/marker-icon.png`,
  iconRetinaUrl: `${ICON_BASE}/marker-icon-2x.png`,
  shadowUrl: `${ICON_BASE}/marker-shadow.png`,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

// Bold, broad styling so the parcel boundary stands out above everything else.
const PARCEL_STYLE = {
  color: '#f97316', // orange-500
  weight: 4,
  opacity: 1,
  dashArray: '6 4',
  fillColor: '#f97316',
  fillOpacity: 0.25,
};

export default function MapView({
  location,
  parcelPolygon,
  result,
  traffic,
  debug,
  adjacent,
  businesses,
  onSelectParcel,
}) {
  const mapRef = useRef(null);
  const layersRef = useRef({});

  // Initialise the map once.
  useEffect(() => {
    // Keep the canvas centred on Texas (all data is Texas-based).
    const TX_BOUNDS = L.latLngBounds([25.5, -106.8], [36.8, -93.2]);
    const map = L.map('map', {
      zoomControl: false,
      zoomSnap: 0.5,
      minZoom: 5,
      maxBounds: TX_BOUNDS.pad(0.25),
      maxBoundsViscosity: 0.7,
    });
    map.fitBounds(TX_BOUNDS);
    // Cleaner, lighter basemap (CARTO Voyager) so the data layers stand out.
    const streets = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        maxZoom: 20,
        subdomains: 'abcd',
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }
    ).addTo(map);

    // Satellite (Esri World Imagery) + a thin street/label overlay so roads
    // stay readable over the aerial — handy for confirming a parcel on the ground.
    const satellite = L.layerGroup([
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 20, attribution: 'Tiles &copy; Esri' }
      ),
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
        { maxZoom: 20, subdomains: 'abcd', opacity: 0.9 }
      ),
    ]);

    L.control
      .layers(
        { Streets: streets, Satellite: satellite },
        {},
        { position: 'topright', collapsed: false }
      )
      .addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: true, metric: false }).addTo(map);

    mapRef.current = map;
    // Leaflet sometimes renders into a 0-height container on first paint.
    setTimeout(() => map.invalidateSize(), 0);

    // Redraw when the container resizes (e.g. dragging the splitter).
    const container = document.getElementById('map');
    const ro = new ResizeObserver(() => map.invalidateSize());
    if (container) ro.observe(container);

    return () => {
      ro.disconnect();
      map.remove();
    };
  }, []);

  // Update marker + parcel polygon when the location changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !location) return;
    const layers = layersRef.current;

    layers.marker?.remove();
    layers.parcel?.remove();
    layers.parcel = null;

    layers.marker = L.marker([location.lat, location.lng], { icon: defaultIcon })
      .addTo(map)
      .bindPopup(location.label || `${location.lat}, ${location.lng}`);

    if (parcelPolygon) {
      layers.parcel = L.geoJSON(parcelPolygon, { style: PARCEL_STYLE })
        .addTo(map)
        .bindPopup('Parcel boundary');
      layers.parcel.bringToFront();
      // Frame the parcel, then keep the marker visible on top.
      map.fitBounds(layers.parcel.getBounds(), { padding: [80, 80], maxZoom: 19 });
    } else {
      // Smooth zoom in close on the searched point.
      map.flyTo([location.lat, location.lng], 17, { duration: 0.7 });
    }
    layers.marker.openPopup();
  }, [location, parcelPolygon]);

  // Draw the radius buffer + intersecting block groups when a result arrives.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = layersRef.current;

    layers.blockGroups?.remove();
    layers.circle?.remove();

    if (!result) return;

    if (result.blockGroups?.length) {
      // In debug mode, draw the intersecting block groups more boldly so it's
      // obvious which geographies feed the radius estimate.
      const bgStyle = debug
        ? { color: '#7c3aed', weight: 2, fillColor: '#a855f7', fillOpacity: 0.18 }
        : { color: '#0ea5e9', weight: 1, fillOpacity: 0.08 };

      layers.blockGroups = L.geoJSON(
        {
          type: 'FeatureCollection',
          features: result.blockGroups.map((bg) => ({
            type: 'Feature',
            geometry: bg.geometry,
            properties: bg,
          })),
        },
        {
          style: bgStyle,
          onEachFeature: (feature, layer) => {
            const p = feature.properties;
            const areaLine = debug
              ? `Area in radius: ${(p.intersectionArea ?? 0).toLocaleString()} / ` +
                `${(p.blockGroupArea ?? 0).toLocaleString()} m²<br/>`
              : '';
            layer.bindPopup(
              `<b>Block Group ${p.geoid}</b><br/>` +
                `Population: ${p.population.toLocaleString()}<br/>` +
                areaLine +
                `Overlap: ${p.weightPercent}%<br/>` +
                `Weighted contribution: ${p.contribution.toLocaleString()}`
            );
          },
        }
      ).addTo(map);
    }

    layers.circle = L.geoJSON(result.circle, {
      style: { color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.08 },
    }).addTo(map);

    // Keep the parcel boundary and marker visible above the buffer/block groups.
    layers.parcel?.bringToFront();
    layers.marker?.setZIndexOffset(1000);

    // Snug, animated framing of the radius buffer.
    map.flyToBounds(layers.circle.getBounds(), { padding: [18, 18], duration: 0.7 });
  }, [result, debug]);

  // Draw AADT station points on the map (the radius buffer is the population
  // circle — no separate traffic circle, and no auto-fit so the view stays put).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = layersRef.current;

    layers.trafficStations?.remove();

    if (!traffic) return;

    const { trafficCounts } = traffic;

    const stations = (trafficCounts || []).map((t) => {
      const onSystem = t.dataset !== '5-Year (off-system)';
      const aadt = t.aadt != null ? t.aadt.toLocaleString() : '—';
      return L.circleMarker([t.lat, t.lng], {
        radius: 7,
        // On-system (annual) = amber; off-system (5-year) = blue.
        color: onSystem ? '#b45309' : '#1d4ed8',
        weight: 2,
        fillColor: onSystem ? '#f59e0b' : '#3b82f6',
        fillOpacity: 0.9,
      })
        // Always-visible AADT label (road name is in the click popup).
        .bindTooltip(`${aadt}`, {
          permanent: true,
          direction: 'top',
          offset: [0, -8],
          className: 'aadt-label',
        })
        .bindPopup(
        `<b>${t.roadName}</b><br/>` +
          `AADT: ${t.aadt != null ? t.aadt.toLocaleString() : '—'} vehicles/day<br/>` +
          `Year: ${t.year ?? '—'}<br/>` +
          `Distance: ${t.distanceMiles} mi<br/>` +
          `Station: ${t.stationId ?? '—'} (${t.source})<br/>` +
          `<span style="color:#64748b">${t.dataset ?? ''}</span>`
      );
    });
    layers.trafficStations = L.layerGroup(stations).addTo(map);
    layers.parcel?.bringToFront();
    layers.marker?.setZIndexOffset(1000);
  }, [traffic]);

  // Adjacent parcels — clickable polygons that re-select the parcel.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = layersRef.current;
    layers.adjacent?.remove();
    if (!adjacent?.length) return;

    layers.adjacent = L.geoJSON(
      {
        type: 'FeatureCollection',
        features: adjacent
          .filter((p) => p.polygon)
          .map((p) => ({ type: 'Feature', geometry: p.polygon, properties: p })),
      },
      {
        style: { color: '#0d9488', weight: 1.5, fillColor: '#14b8a6', fillOpacity: 0.12 },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          layer.bindPopup(
            `<b>Parcel ${p.parcelId}</b><br/>${p.address || ''}<br/>` +
              `${p.propertyType || ''}${p.owner ? `<br/>${p.owner}` : ''}` +
              `<br/><i>Click to inspect</i>`
          );
          layer.on('click', () => onSelectParcel?.(p));
          layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.3 }));
          layer.on('mouseout', () => layer.setStyle({ fillOpacity: 0.12 }));
        },
      }
    ).addTo(map);
    layers.parcel?.bringToFront();
  }, [adjacent, onSelectParcel]);

  // Business markers (Google Places).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = layersRef.current;
    layers.businesses?.remove();
    if (!businesses?.length) return;

    const markers = businesses
      .filter((b) => b.lat != null && b.lng != null)
      .map((b) =>
        L.circleMarker([b.lat, b.lng], {
          radius: 6,
          color: '#7c3aed',
          weight: 2,
          fillColor: '#a855f7',
          fillOpacity: 0.9,
        }).bindPopup(`<b>${b.name}</b><br/>${b.businessType || ''}<br/>${b.address || ''}`)
      );
    layers.businesses = L.layerGroup(markers).addTo(map);
  }, [businesses]);

  return <div id="map" className="h-full w-full" />;
}
