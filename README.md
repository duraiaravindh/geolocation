# Parcel Intelligence — Population, Demographics & Traffic by Radius

Search a location (address, parcel address, **Parcel ID / APN**, or lat/lng),
draw a configurable radius, and get **area‑weighted population & demographics**
(U.S. Census ACS) plus **nearby TxDOT traffic counts (AADT)** — all on one map.

Texas‑focused POC (parcel data covers **Travis** and **Williamson** counties).

---

## What it does (current behaviour)

```
Search ─▶ resolve to lat/lng (+ parcel polygon)
       ─▶ circular buffer (radius)
       ─▶ intersecting Census Block Groups (overlap %)
       ─▶ ACS demographics  → area‑weighted counts + population‑weighted medians  (left panel)
       ─▶ TxDOT AADT stations within radius                                       (map markers)
```

One **shared Radius + Unit** control drives Population, Demographics, and Traffic
together — change the radius and all three update (debounced, automatic; no
per‑feature buttons).

### UI layout
- **Two resizable panes** — left = Search + Demographics info panel; right = Map.
  Drag the splitter to resize (the map re‑renders via `ResizeObserver`).
- **Header bar** — brand + the resolved location/coordinates.
- **Demographics panel** (`RealEstateSummary.jsx`) — population, households,
  housing units, median household income, median age, owner/renter split (+ bar),
  block‑groups used, and a **"Show demographic calculation details"** toggle that
  reveals the per‑block‑group table **and highlights those block groups purple on
  the map**.
- **Map** (`MapView.jsx`) — Leaflet. Basemap toggle **Streets (CARTO Voyager) ↔
  Satellite (Esri World Imagery + labels)**, zoom + scale controls, locked to a
  **Texas extent** (`maxBounds`, `minZoom`). Draws: searched marker, parcel
  boundary (orange dashed), radius buffer (red), intersecting block groups, and
  **traffic stations with a permanent AADT label** on each point (amber =
  on‑system, blue = off‑system). Full station detail (road, year, distance,
  station ID, source) is in the click popup.

---

## Data sources

| Layer | Service / Dataset |
|------|------|
| Address → lat/lng + geography | **Census Geocoder** (`geographies/onelineaddress`) |
| lat/lng → Tract/Block Group + county/state names | **Census Geocoder** (`geographies/coordinates`) |
| Block group geometry | **TIGERweb REST** (`tigerWMS_ACS2024`, layer 10) |
| Population & demographics | **Census ACS 5‑Year Data API** (vintage **2024**) |
| Parcels (by APN) | **PostgreSQL/PostGIS** — ATTOM dataset on AWS RDS |
| Traffic counts (AADT) | **TxDOT ArcGIS** (Annual on‑system + 5‑Year off‑system) |
| Off‑system road names (optional) | **OpenStreetMap Nominatim** (reverse geocode) |
| Buffer + polygon intersection | **Turf.js** (server‑side) |

### ACS variables pulled (7)
`B01003_001E` total population · `B11001_001E` households · `B19013_001E` median
household income · `B01002_001E` median age · `B25001_001E` housing units ·
`B25003_002E` owner‑occupied · `B25003_003E` renter‑occupied.

### Calculation methods
- **Count fields** (population, households, housing units, owner, renter) — area‑weighted:
  `weighted = Σ ( ACSvalue × overlap% )`, where `overlap% = intersectionArea / blockGroupArea`.
- **Median fields** (income, age) — population‑weighted average:
  `weightedMedian = Σ ( median × weightedPop ) / Σ weightedPop`.
  Census "jam values" (negative medians) are treated as null and excluded.
- **Traffic** — station‑based, **no weighting**: stations whose point falls within
  the radius, sorted by distance.

---

## Project structure

```
server/                         Express API (ES modules, Node fetch)
  index.js                      route definitions (see API below)
  config.js                     env + Census/parcel config
  services/
    parseInput.js               detect coords / parcel id / address
    geocoder.js                 geocodeAddress(), geocodeCoordinates()
    parcel.js                   parcel lookup (PostgreSQL; sample fallback)
    db.js                       lazy pg Pool (null when no DATABASE_URL)
    tigerweb.js                 block group polygons by bbox
    census.js                   ACS: population, demographics (7 vars), tract/BG
    population.js               computeBlockGroupWeights(), calculatePopulation()
    demographics.js             calculateDemographics() (counts + medians)
    trafficCounts.js            TxDOT AADT (2 sources merged) + STARS II links
    reverseGeocode.js           OSM road-name lookup (throttled)
    places.js                   Overpass POIs  (built, not used by current UI)
    validate.js                 tract/BG official population (not used by UI)
    summary.js                  real-estate summary (demographics + traffic + geo)
client/                         React + Vite + Tailwind (CDN) + Leaflet
  src/
    App.jsx                     state, shared radius, debounced auto-fetch, layout + splitter
    api.js                      fetch wrappers
    main.jsx
    components/
      SearchPanel.jsx           search + shared radius/unit
      RealEstateSummary.jsx     Demographics info panel (+ debug table/highlight)
      MapView.jsx               Leaflet map, basemaps, all overlays, AADT labels
```

---

## API endpoints

**Active (used by the current UI):**
- `POST /api/search` `{ query }` → resolves to `{ lat, lng, label, parcelPolygon?, … }`
- `POST /api/population` `{ lat, lng, radius, unit }` → radius estimate + block groups (geometry for the map)
- `GET  /api/real-estate-summary?lat&lng&radius&unit[&address&parcelId&county]` → demographics (+ per‑BG debug)
- `GET  /api/traffic-counts?lat&lng&radius&unit[&sort&roadNames]` → AADT stations
- `GET  /api/health`

**Available but not called by the current UI** (kept as API surface; safe to remove):
- `GET /api/population/validate?lat&lng` → official Tract/Block‑Group ACS population
- `GET /api/population/radius?lat&lng&radius&unit[&debug=true]` → radius population (alt GET form)
- `GET /api/demographics?lat&lng&radius&unit[&debug=true]` → demographics (standalone)
- `GET /api/places?lat&lng&radius&unit` → OSM POIs (restaurants/schools/hospitals/apartments/retail)

---

## Configuration (`server/.env`)

```bash
CENSUS_API_KEY=...                  # required for ACS (population/demographics)
PORT=5000
ACS_YEAR=2024                       # ACS 5-Year vintage (2023 also works)
TIGERWEB_SERVICE=tigerWMS_ACS2024

# Parcel database (PostgreSQL / PostGIS) — AWS RDS, ATTOM dataset
DATABASE_URL=postgresql://USER:PASS@HOST:5432/DB   # NOTE: plain postgresql:// (NOT postgresql+asyncpg://)
DB_SSL=true                         # RDS requires TLS
PARCEL_TABLE=attom_dataset.boundaries
PARCEL_ID_COL=apn
PARCEL_ADDR_COL=addr_line_1
PARCEL_LAT_COL=latitude
PARCEL_LNG_COL=longitude
PARCEL_COUNTY_COL=county
PARCEL_GEOM_COL=geom               # PostGIS geometry → returned as GeoJSON boundary
PARCEL_DATA_UPDATED=               # optional: date string shown as data freshness
```

> The Node `pg` driver does **not** understand SQLAlchemy's `postgresql+asyncpg://`
> prefix — use a plain `postgresql://` URL. Percent‑encode special chars in the
> password (e.g. `%^` → `%25%5E`).

### Parcel DB notes
- Table `attom_dataset.boundaries`: ~705k rows (Travis ~430k, Williamson ~275k),
  ~99.95% have a usable APN + address + coordinates + geometry.
- A handful of rows have `apn = '0'`; ~1,440 APNs are duplicated (lookup is `LIMIT 1`).

---

## Setup & run

```bash
npm install            # root (concurrently)
npm run install:all    # server + client deps
npm run dev            # API :5000 + client :5173 (Vite proxies /api → :5000)
```

> The backend is `node index.js` (no watch) — **restart it after changing `.env`
> or server code**. The Vite client hot‑reloads.

---

## Change log (vs. original population‑radius POC)

- **Demographics**: extended ACS from population‑only to the 7‑variable profile;
  added `demographics.js` (area‑weighted counts + population‑weighted medians) and
  refactored the shared spatial weighting into `population.js#computeBlockGroupWeights`.
- **Parcel DB**: wired the stub to a real PostgreSQL/PostGIS ATTOM dataset on AWS
  RDS (APN lookup, GeoJSON boundary).
- **Traffic**: TxDOT AADT stations rendered on the map with **permanent AADT
  labels**; click popups carry full detail + STARS II / TCDS cross‑check links.
- **Shared radius/unit**: one control now drives Population, Demographics & Traffic;
  all auto‑refresh together (debounced) — no per‑feature buttons.
- **UI overhaul**: header bar, two **resizable** panes (info | map), Streets/Satellite
  basemap toggle, Texas‑locked extent, AADT‑on‑point labels. Map legend removed.
- **Consolidation**: merged the separate *Population* + *Population Validation* panels,
  then merged Population into **Demographics** (single info panel). Traffic became
  **map‑only** (no panel). The **Nearby places** feature and the **Census cross‑check**
  panel were removed from the UI (their backend endpoints remain).
- **Map debug**: the demographics "calculation details" toggle highlights the
  intersecting block groups purple and shows the per‑BG table.

### Removed components (history)
`ResultsCard.jsx`, `ValidationPanel.jsx`, `PopulationPanel.jsx`, `TrafficPanel.jsx`,
`NearbyPanel.jsx`, `placeCategories.js` — folded into `RealEstateSummary.jsx` /
`MapView.jsx` or dropped.

---

## Known limitations (POC)
- Parcel coverage is **Travis + Williamson** only.
- Area weighting assumes population is **uniformly distributed** within a block group.
- Intersection runs in **Turf.js**; production should use **PostGIS**.
- Median household income / age use a **population‑weighted average** approximation
  (medians aren't additive).
- Tailwind is loaded via **CDN** (fine for a POC; use the build plugin for production).
- Map extent is **locked to Texas**; non‑Texas points still compute but the map is bounded.
