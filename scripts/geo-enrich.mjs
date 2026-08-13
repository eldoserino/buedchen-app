/**
 * Geo-Enrichment: buedchen_type + poi_distances für alle Büdchen.
 *
 * Strategie: EIN Overpass-Request für ganz Köln (alle Parks/Plätze/Spielplätze),
 * dann Distanzen lokal per Haversine berechnen — kein Rate-Limiting, keine 406er.
 *
 * Aufruf: node scripts/geo-enrich.mjs [--force]
 *   --force: auch bereits geo-enrichte Büdchen neu berechnen
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from './lib/db.mjs';
import { getBuedchenType, RHEIN_POLYLINE } from './lib/overpass.mjs';

const FORCE = process.argv.includes('--force');
const USE_STATIC = process.argv.includes('--static') || !process.argv.includes('--live');
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const __dirname = dirname(fileURLToPath(import.meta.url));

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

function loadStaticFeatures() {
  const path = join(__dirname, 'data', 'cologne-geo-features.json');
  const raw  = JSON.parse(readFileSync(path, 'utf-8'));
  const parks  = raw.parks.map(p  => [p.lat, p.lng]);
  const plazas = raw.plazas.map(p => [p.lat, p.lng]);
  console.log(`📂 Statische Features: ${parks.length} Parks | ${plazas.length} Plätze`);
  return { parks, plazas, playgrounds: [] };
}

function computeDistances(lat, lng, { parks, plazas, playgrounds }) {
  const nearestDist = (lat, lng, points) => {
    if (!points.length) return null;
    return Math.min(...points.map(([pLat, pLon]) => haversine(lat, lng, pLat, pLon)));
  };

  const park_d       = nearestDist(lat, lng, parks);
  const plaza_d      = nearestDist(lat, lng, plazas);
  const playground_d = nearestDist(lat, lng, playgrounds);
  const rhein_d      = distanceToPolyline(lat, lng, RHEIN_POLYLINE);

  return {
    nearest_park_m:       park_d       !== null ? Math.round(park_d)       : null,
    nearest_plaza_m:      plaza_d      !== null ? Math.round(plaza_d)      : null,
    nearest_playground_m: playground_d !== null ? Math.round(playground_d) : null,
    rhein_m:              Math.round(rhein_d),
  };
}

async function main() {
  const features = loadStaticFeatures();

  const conn = await db.getConnection();

  const whereClause = FORCE
    ? '1=1'
    : "(poi_distances IS NULL OR buedchen_type = 'straßenbüdchen')";

  const [buedchenList] = await conn.execute(
    `SELECT id, name, lat, lng FROM buedchen WHERE ${whereClause} AND lat IS NOT NULL AND lng IS NOT NULL`
  );

  console.log(`\n📍 ${buedchenList.length} Büdchen zu geo-enrichen${FORCE ? ' (--force)' : ''}\n`);

  let updated = 0;
  const typeCounts = {};

  for (let i = 0; i < buedchenList.length; i++) {
    const b = buedchenList[i];
    const distances  = computeDistances(b.lat, b.lng, features);
    const buedchenType = getBuedchenType(distances);

    await conn.execute(
      'UPDATE buedchen SET poi_distances = ?, buedchen_type = ? WHERE id = ?',
      [JSON.stringify(distances), buedchenType, b.id]
    );

    typeCounts[buedchenType] = (typeCounts[buedchenType] || 0) + 1;
    updated++;

    if ((i + 1) % 100 === 0 || i === buedchenList.length - 1) {
      const pct = Math.round(((i + 1) / buedchenList.length) * 100);
      process.stdout.write(`\r  [${i + 1}/${buedchenList.length}] ${pct}% — ${buedchenType.padEnd(20)}`);
    }
  }

  process.stdout.write('\n');
  conn.release();
  await db.end();

  console.log(`\n✅ Fertig: ${updated} Büdchen geo-enriched`);
  console.log('\nTyp-Verteilung:');
  Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => console.log(`  ${type}: ${count}`));
}

main().catch(err => {
  console.error('Fehler:', err.message);
  process.exit(1);
});
