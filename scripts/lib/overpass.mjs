const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Vereinfachte Kölner Rhein-Mittellinie (WGS84, Nord → Süd)
export const RHEIN_POLYLINE = [
  [51.0400, 6.9850],
  [51.0150, 6.9820],
  [50.9960, 6.9740],
  [50.9740, 6.9720],
  [50.9580, 6.9800],
  [50.9420, 6.9700],
  [50.9380, 6.9680],
  [50.9300, 6.9680],
  [50.9200, 6.9750],
  [50.9148, 6.9815],
  [50.9020, 6.9870],
  [50.8870, 6.9920],
];

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceToPolyline(lat, lon, polyline) {
  return Math.min(...polyline.map(([pLat, pLon]) => haversine(lat, lon, pLat, pLon)));
}

function elementCenter(el) {
  if (el.type === 'node') return { lat: el.lat, lon: el.lon };
  if (el.center) return el.center;
  return null;
}

/**
 * Holt POI-Distanzen für ein Büdchen via Overpass API.
 * Gibt poi_distances-Objekt zurück (in Metern).
 */
export async function getPoiDistances(lat, lng, radiusM = 500) {
  const query = `
[out:json][timeout:15];
(
  node["leisure"="park"](around:${radiusM},${lat},${lng});
  way["leisure"="park"](around:${radiusM},${lat},${lng});
  node["place"="square"](around:${radiusM},${lat},${lng});
  way["place"="square"](around:${radiusM},${lat},${lng});
  node["leisure"="playground"](around:${radiusM},${lat},${lng});
  way["leisure"="playground"](around:${radiusM},${lat},${lng});
);
out center;
`.trim();

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json();

  let nearest_park_m     = Infinity;
  let nearest_plaza_m    = Infinity;
  let nearest_playground_m = Infinity;

  for (const el of (data.elements || [])) {
    const center = elementCenter(el);
    if (!center) continue;
    const dist = haversine(lat, lng, center.lat, center.lon);

    const t = el.tags || {};
    if (t.leisure === 'park')        nearest_park_m       = Math.min(nearest_park_m, dist);
    if (t.place === 'square')        nearest_plaza_m      = Math.min(nearest_plaza_m, dist);
    if (t.leisure === 'playground')  nearest_playground_m = Math.min(nearest_playground_m, dist);
  }

  const rhein_m = distanceToPolyline(lat, lng, RHEIN_POLYLINE);

  return {
    nearest_park_m:       nearest_park_m     === Infinity ? null : Math.round(nearest_park_m),
    nearest_plaza_m:      nearest_plaza_m    === Infinity ? null : Math.round(nearest_plaza_m),
    rhein_m:              Math.round(rhein_m),
    nearest_playground_m: nearest_playground_m === Infinity ? null : Math.round(nearest_playground_m),
  };
}

/**
 * Leitet buedchen_type aus poi_distances ab.
 * Priorität: platzbüdchen > parkbüdchen > uferbüdchen > straßenbüdchen
 */
export function getBuedchenType(distances) {
  if (!distances) return 'straßenbüdchen';
  // Polyline-Distanz zum Rheinzentrum; West-Ufer ist ~400m vom Zentrum entfernt
  if (distances.rhein_m         !== null && distances.rhein_m          < 500) return 'uferbüdchen';
  if (distances.nearest_plaza_m !== null && distances.nearest_plaza_m < 150) return 'platzbüdchen';
  if (distances.nearest_park_m  !== null && distances.nearest_park_m  < 120) return 'parkbüdchen';
  return 'straßenbüdchen';
}

// Overpass queries per category — eine pro Request um Timeouts zu vermeiden
const COLOGNE_AREA = `area["name"="Köln"]["admin_level"="6"]["boundary"="administrative"]->.koeln;`;

const CATEGORY_QUERIES = {
  park: `
[out:json][timeout:60];
${COLOGNE_AREA}
(
  way["leisure"="park"]["name"](area.koeln);
  way["leisure"="garden"]["access"!="private"]["name"](area.koeln);
  relation["leisure"="park"]["name"](area.koeln);
  node["leisure"="park"]["name"](area.koeln);
);
out center;
`,
  platz: `
[out:json][timeout:60];
${COLOGNE_AREA}
(
  node["place"="square"]["name"](area.koeln);
  way["place"="square"]["name"](area.koeln);
  way["highway"="pedestrian"]["area"="yes"]["name"](area.koeln);
);
out center;
`,
  aussicht: `
[out:json][timeout:60];
${COLOGNE_AREA}
(
  node["tourism"="viewpoint"]["name"](area.koeln);
  way["tourism"="viewpoint"]["name"](area.koeln);
);
out center;
`,
  denkmal: `
[out:json][timeout:60];
${COLOGNE_AREA}
(
  node["historic"="monument"]["name"](area.koeln);
  node["historic"="memorial"]["name"](area.koeln);
  way["historic"="monument"]["name"](area.koeln);
);
out center;
`,
  markt: `
[out:json][timeout:60];
${COLOGNE_AREA}
(
  node["amenity"="marketplace"]["name"](area.koeln);
  way["amenity"="marketplace"]["name"](area.koeln);
);
out center;
`,
  streetart: `
[out:json][timeout:60];
${COLOGNE_AREA}
(
  node["tourism"="artwork"]["name"](area.koeln);
  way["tourism"="artwork"]["name"](area.koeln);
);
out center;
`,
  spielplatz: `
[out:json][timeout:60];
${COLOGNE_AREA}
(
  node["leisure"="playground"]["name"](area.koeln);
  way["leisure"="playground"]["name"](area.koeln);
);
out center;
`,
  museum: `
[out:json][timeout:60];
${COLOGNE_AREA}
(
  node["tourism"="museum"]["name"](area.koeln);
  way["tourism"="museum"]["name"](area.koeln);
);
out center;
`,
  biergarten: `
[out:json][timeout:60];
${COLOGNE_AREA}
(
  node["amenity"="biergarten"]["name"](area.koeln);
  way["amenity"="biergarten"]["name"](area.koeln);
);
out center;
`,
  wasser: `
[out:json][timeout:60];
${COLOGNE_AREA}
(
  node["natural"="water"]["name"](area.koeln);
  way["natural"="water"]["name"](area.koeln);
  relation["natural"="water"]["name"](area.koeln);
  node["leisure"="swimming_area"]["name"](area.koeln);
);
out center;
`,
};

async function overpassQuery(queryStr) {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':   'buedchen-app/1.0 (https://buedchen.slightlymad.de)',
      'Accept':       'application/json',
    },
    body: `data=${encodeURIComponent(queryStr.trim())}`,
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json();
  return data.elements || [];
}

/**
 * Holt POIs für eine Kategorie aus Overpass (ganz Köln).
 * @param {string} category — Key aus CATEGORY_QUERIES
 * @returns {Array} Overpass-Elemente mit tags, center, id
 */
export async function fetchColognePoiCategory(category) {
  const query = CATEGORY_QUERIES[category];
  if (!query) throw new Error(`Unbekannte Kategorie: ${category}`);
  return overpassQuery(query);
}

export const OSM_CATEGORIES = Object.keys(CATEGORY_QUERIES);

/**
 * Legacy: Overpass-Abfrage für das POI-Seeding (ganz Köln, alle Kategorien in einem Request).
 * Veraltet — seed-pois.mjs nutzt fetchColognePoiCategory() pro Kategorie.
 */
export async function fetchColognePois() {
  const query = `
[out:json][timeout:30];
area["name"="Köln"]["admin_level"="6"]->.cologne;
(
  node["leisure"="park"]["name"](area.cologne);
  way["leisure"="park"]["name"](area.cologne);
  node["place"="square"]["name"](area.cologne);
  way["place"="square"]["name"](area.cologne);
  node["historic"="monument"]["name"](area.cologne);
  node["tourism"="viewpoint"]["name"](area.cologne);
  node["amenity"="marketplace"]["name"](area.cologne);
);
out center;
`.trim();

  return overpassQuery(query);
}
