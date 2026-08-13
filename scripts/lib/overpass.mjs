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

/**
 * Overpass-Abfrage für das POI-Seeding (ganz Köln).
 * Gibt Array von Elementen mit center, tags, id zurück.
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

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json();
  return data.elements || [];
}
