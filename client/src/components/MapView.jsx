import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { PLACE_META } from '../placeCategories.js';

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

function placeIcon(color, emoji) {
  return L.divIcon({
    className: 'place-marker',
    html:
      `<div style="display:flex;align-items:center;justify-content:center;` +
      `width:24px;height:24px;border-radius:50%;background:#fff;` +
      `border:2px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,.3);font-size:13px;">${emoji}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

export default function MapView({
  location,
  parcelPolygon,
  result,
  traffic,
  debug,
  places,
  placeVisible,
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

    // Legend overlay so the colours on the map are self-explanatory.
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div');
      div.style.cssText =
        'background:rgba(255,255,255,.92);padding:8px 10px;border-radius:10px;' +
        'box-shadow:0 1px 4px rgba(0,0,0,.2);font:11px/1.4 system-ui,sans-serif;color:#334155;';
      const row = (color, label, opts = {}) =>
        `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">` +
        `<span style="width:12px;height:12px;border-radius:${opts.round ? '50%' : '3px'};` +
        `background:${color};${opts.border ? `border:2px solid ${opts.border};` : ''}` +
        `${opts.dash ? 'background:transparent;border:2px dashed ' + color + ';' : ''}"></span>` +
        `<span>${label}</span></div>`;
      div.innerHTML =
        `<div style="font-weight:600;color:#0f172a;margin-bottom:4px">Legend</div>` +
        row('#2563eb', 'Searched location', { round: true }) +
        row('#f97316', 'Parcel boundary', { dash: true }) +
        row('#ef4444', 'Radius buffer', { dash: true }) +
        row('#a855f7', 'Census block groups') +
        row('#f59e0b', 'Traffic — on-system', { round: true, border: '#b45309' }) +
        row('#3b82f6', 'Traffic — off-system', { round: true, border: '#1d4ed8' });
      return div;
    };
    legend.addTo(map);

    mapRef.current = map;
    // Leaflet sometimes renders into a 0-height container on first paint.
    setTimeout(() => map.invalidateSize(), 0);
    return () => map.remove();
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

  // Draw the traffic search radius + AADT station points.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = layersRef.current;

    layers.trafficCircle?.remove();
    layers.trafficStations?.remove();

    if (!traffic) return;

    const { center, radius, trafficCounts } = traffic;

    layers.trafficCircle = L.circle([center.lat, center.lng], {
      radius: radius.meters,
      color: '#16a34a', // green-600
      weight: 2,
      dashArray: '5 5',
      fillColor: '#16a34a',
      fillOpacity: 0.05,
    }).addTo(map);

    const stations = (trafficCounts || []).map((t) => {
      const onSystem = t.dataset !== '5-Year (off-system)';
      return L.circleMarker([t.lat, t.lng], {
        radius: 7,
        // On-system (annual) = amber; off-system (5-year) = blue.
        color: onSystem ? '#b45309' : '#1d4ed8',
        weight: 2,
        fillColor: onSystem ? '#f59e0b' : '#3b82f6',
        fillOpacity: 0.9,
      }).bindPopup(
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

    map.fitBounds(layers.trafficCircle.getBounds(), { padding: [40, 40] });
  }, [traffic]);

  // Draw nearby place markers (respecting per-category visibility toggles).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = layersRef.current;

    layers.places?.remove();
    if (!places?.places) return;

    const markers = [];
    for (const [cat, list] of Object.entries(places.places)) {
      if (placeVisible && placeVisible[cat] === false) continue;
      const meta = PLACE_META[cat];
      if (!meta) continue;
      const icon = placeIcon(meta.color, meta.emoji);
      for (const p of list) {
        markers.push(
          L.marker([p.lat, p.lng], { icon }).bindPopup(
            `<b>${p.name || meta.label}</b><br/>` +
              `${meta.label}${p.type ? ` · ${p.type}` : ''}<br/>` +
              `Distance: ${p.distanceMiles} mi`
          )
        );
      }
    }
    layers.places = L.layerGroup(markers).addTo(map);
  }, [places, placeVisible]);

  // Frame all nearby places when a new search arrives (not on toggle).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !places?.places) return;
    const pts = [];
    for (const list of Object.values(places.places)) {
      for (const p of list) pts.push([p.lat, p.lng]);
    }
    if (places.center) pts.push([places.center.lat, places.center.lng]);
    if (pts.length > 1) {
      map.flyToBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 16, duration: 0.7 });
    }
  }, [places]);

  return <div id="map" className="h-full w-full" />;
}
