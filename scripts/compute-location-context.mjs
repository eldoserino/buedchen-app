/**
 * Location-Context-Berechnung — Session 06
 * Befüllt location_context für alle Büdchen aus der tour_pois-Tabelle.
 *
 * Ablauf pro Büdchen:
 *   1. Alle aktiven tour_pois im 800m-Umkreis (Haversine)
 *   2. Primary: nächster POI innerhalb Kategorie-Schwellwert
 *   3. Nearby: bis zu 3 weitere POIs (importance >= 2, tour_eligible, verschiedene Kategorien)
 *   4. Rhein-Distanz: Fallback-Primary wenn < 300m und kein anderer Primary
 *   5. Schreibe JSON in location_context-Spalte
 *
 * Flags:
 *   --dry-run   Berechnen aber nicht in DB schreiben, Stichproben ausgeben
 *
 * Ausführen aus Projektroot: node scripts/compute-location-context.mjs [--dry-run]
 */

import 'dotenv/config';
import db from './lib/db.mjs';
import { RHEIN_POLYLINE } from './lib/overpass.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

// Maximale Distanz für PRIMARY je Kategorie (Meter)
const PRIMARY_THRESHOLDS = {
  platz:     120,
  markt:     100,
  park:      150,
  wasser:    150,
  rheinufer: 300,
  aussicht:  200,
  denkmal:   100,
  brücke:    200,
  streetart:  80,
};

const MAX_NEARBY_DIST = 800;

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function distToPolyline(lat, lon, polyline) {
  return Math.min(...polyline.map(([pLat, pLon]) => haversine(lat, lon, pLat, pLon)));
}

function computeContext(buedchen, allPois) {
  const { lat, lng } = buedchen;

  // Alle aktiven POIs mit Distanz, sortiert nach (Distanz asc, importance desc)
  const withDist = allPois
    .map(p => ({ ...p, distance_m: Math.round(haversine(lat, lng, p.lat, p.lng)) }))
    .filter(p => p.distance_m <= MAX_NEARBY_DIST)
    .sort((a, b) => a.distance_m - b.distance_m || b.importance - a.importance);

  // Primary bestimmen
  let primary = null;
  for (const poi of withDist) {
    const threshold = PRIMARY_THRESHOLDS[poi.category];
    if (threshold && poi.distance_m <= threshold) {
      primary = {
        type:       poi.category,
        name:       poi.name,
        distance_m: poi.distance_m,
        poi_id:     poi.id,
      };
      break;
    }
  }

  // Rhein-Fallback wenn kein anderer Primary
  const rhein_m = Math.round(distToPolyline(lat, lng, RHEIN_POLYLINE));
  if (!primary && rhein_m < 300) {
    primary = { type: 'rheinufer', name: 'Rheinufer', distance_m: rhein_m, poi_id: null };
  }

  // Nearby: bis zu 3, importance >= 2, tour_eligible, verschiedene Kategorien bevorzugt
  const primaryPoiId = primary?.poi_id;
  const candidates   = withDist.filter(p =>
    p.id !== primaryPoiId &&
    p.importance >= 2 &&
    p.tour_eligible
  );

  const usedCats = new Set(primary ? [primary.type] : []);
  const nearby   = [];

  // Erst-Durchlauf: je eine neue Kategorie
  for (const poi of candidates) {
    if (nearby.length >= 3) break;
    if (!usedCats.has(poi.category)) {
      nearby.push({ type: poi.category, name: poi.name, distance_m: poi.distance_m, poi_id: poi.id });
      usedCats.add(poi.category);
    }
  }
  // Zweiter Durchlauf: restliche Slots mit beliebigen POIs füllen
  for (const poi of candidates) {
    if (nearby.length >= 3) break;
    if (!nearby.some(n => n.poi_id === poi.id)) {
      nearby.push({ type: poi.category, name: poi.name, distance_m: poi.distance_m, poi_id: poi.id });
    }
  }

  return { primary, nearby, rhein_m };
}

async function main() {
  const conn = await db.getConnection();

  // Alle aktiven POIs laden
  const [pois] = await conn.query(
    'SELECT id, name, category, lat, lng, importance, tour_eligible, is_active FROM tour_pois WHERE is_active = 1'
  );
  pois.forEach(p => {
    p.lat = parseFloat(p.lat);
    p.lng = parseFloat(p.lng);
    p.importance    = parseInt(p.importance, 10);
    p.tour_eligible = Boolean(p.tour_eligible);
  });
  console.log(`\n📍 ${pois.length} aktive POIs geladen`);

  // Alle Büdchen laden
  const [buedchen] = await conn.query('SELECT id, name, lat, lng FROM buedchen');
  buedchen.forEach(b => { b.lat = parseFloat(b.lat); b.lng = parseFloat(b.lng); });
  console.log(`🏪 ${buedchen.length} Büdchen zu verarbeiten\n`);

  let withPrimary = 0, withoutPrimary = 0, updated = 0;
  const samples = [];

  for (const b of buedchen) {
    const ctx = computeContext(b, pois);

    if (ctx.primary) withPrimary++;
    else             withoutPrimary++;

    // Stichprobe für Dry-Run-Output
    if (ctx.primary && samples.length < 5) {
      samples.push({ name: b.name, primary: ctx.primary, nearby: ctx.nearby });
    }

    if (!DRY_RUN) {
      await conn.query(
        'UPDATE buedchen SET location_context = ? WHERE id = ?',
        [JSON.stringify({ primary: ctx.primary, nearby: ctx.nearby }), b.id]
      );
    }
    updated++;
    if (updated % 50 === 0) process.stdout.write('.');
  }

  console.log(`\n\n📊 Ergebnis:`);
  console.log(`   Mit primary:    ${withPrimary} (${Math.round(withPrimary/buedchen.length*100)} %)`);
  console.log(`   Ohne primary:   ${withoutPrimary}`);
  console.log(`   ${DRY_RUN ? 'Simuliert' : 'Aktualisiert'}: ${updated} Büdchen`);

  if (DRY_RUN && samples.length > 0) {
    console.log('\n🔍 Stichproben:');
    for (const s of samples) {
      console.log(`   ${s.name}`);
      console.log(`     primary: ${s.primary.type} "${s.primary.name}" ${s.primary.distance_m}m`);
      if (s.nearby.length > 0) {
        console.log(`     nearby:  ${s.nearby.map(n => `"${n.name}" ${n.distance_m}m`).join(', ')}`);
      }
    }
  }

  conn.release();
  await db.end();
}

main().catch(err => {
  console.error('Fataler Fehler:', err);
  process.exit(1);
});
