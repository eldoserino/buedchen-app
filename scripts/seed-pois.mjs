/**
 * Tour-POI Seeding — Script 4
 * Befüllt die tour_pois-Tabelle aus zwei Quellen:
 *   A) Kuratierte pois-seed.json (hat Priorität bei ID-Überschneidung)
 *   B) Overpass API (Parks, Plätze, Denkmäler in Köln)
 *
 * Ausführen: node scripts/seed-pois.mjs [--skip-osm]
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from './lib/db.mjs';
import { fetchColognePois } from './lib/overpass.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const SKIP_OSM = process.argv.includes('--skip-osm');

const OSM_CATEGORY_MAP = {
  'leisure=park':          'park',
  'place=square':          'platz',
  'historic=monument':     'denkmal',
  'tourism=viewpoint':     'aussicht',
  'amenity=marketplace':   'markt',
};

function osmCategory(tags) {
  if (tags.leisure === 'park')        return 'park';
  if (tags.place   === 'square')      return 'platz';
  if (tags.historic === 'monument')   return 'denkmal';
  if (tags.tourism  === 'viewpoint')  return 'aussicht';
  if (tags.amenity  === 'marketplace') return 'markt';
  return null;
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function insertPoi(conn, poi) {
  await conn.query(
    `INSERT INTO tour_pois
       (id, name, description, category, lat, lng, address, veedel,
        photo_path, osm_id, tags, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name        = VALUES(name),
       description = VALUES(description),
       category    = VALUES(category),
       lat         = VALUES(lat),
       lng         = VALUES(lng),
       address     = VALUES(address),
       veedel      = VALUES(veedel),
       tags        = VALUES(tags),
       is_active   = VALUES(is_active)`,
    [
      poi.id,
      poi.name,
      poi.description || null,
      poi.category,
      poi.lat,
      poi.lng,
      poi.address || null,
      poi.veedel  || null,
      poi.photo_path || null,
      poi.osm_id  || null,
      JSON.stringify(poi.tags || {}),
      poi.is_active !== false,
    ]
  );
}

async function main() {
  const conn = await db.getConnection();

  // Quelle A: Kuratierte Seed-JSON
  const seedPath = join(__dir, 'data', 'pois-seed.json');
  const curated  = JSON.parse(readFileSync(seedPath, 'utf-8'));
  console.log(`\n📍 Quelle A: ${curated.length} kuratierte POIs`);

  let insertedCurated = 0;
  for (const poi of curated) {
    await insertPoi(conn, poi);
    insertedCurated++;
    process.stdout.write('.');
  }
  console.log(`\n   ✅ ${insertedCurated} POIs geschrieben\n`);

  // Quelle B: Overpass API (optional überspringen)
  if (SKIP_OSM) {
    console.log('⏭  --skip-osm gesetzt, Overpass übersprungen');
  } else {
    console.log('🌍 Quelle B: Overpass API für Köln ...');
    let elements;
    try {
      elements = await fetchColognePois();
      console.log(`   ${elements.length} Elemente aus Overpass`);
    } catch (err) {
      console.log(`   ❌ Overpass-Fehler: ${err.message} — nur Seed-Daten verwendet`);
      elements = [];
    }

    let insertedOsm = 0, skipped = 0;
    for (const el of elements) {
      const tags     = el.tags || {};
      const category = osmCategory(tags);
      if (!category || !tags.name) { skipped++; continue; }

      const center = el.type === 'node'
        ? { lat: el.lat, lon: el.lon }
        : el.center;
      if (!center) { skipped++; continue; }

      const osmId = `${el.type}/${el.id}`;
      const poi   = {
        id:          `osm-${el.type}-${el.id}`,
        name:        tags.name,
        description: tags.description || tags.note || null,
        category,
        lat:         center.lat,
        lng:         center.lon,
        address:     tags['addr:street']
          ? `${tags['addr:street']} ${tags['addr:housenumber'] || ''}`.trim()
          : null,
        veedel:     tags['addr:suburb'] || null,
        osm_id:     osmId,
        tags:       {},
        is_active:  true,
      };

      await insertPoi(conn, poi);
      insertedOsm++;
      if (insertedOsm % 20 === 0) process.stdout.write('.');
    }
    console.log(`\n   ✅ ${insertedOsm} OSM-POIs geschrieben, ${skipped} übersprungen`);
  }

  const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM tour_pois');
  console.log(`\n📊 tour_pois gesamt: ${total} POIs\n`);

  conn.release();
  await db.end();
}

main().catch(err => {
  console.error('Fataler Fehler:', err);
  process.exit(1);
});
