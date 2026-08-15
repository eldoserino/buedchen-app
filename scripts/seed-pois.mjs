/**
 * Tour-POI Seeding — Session 06
 * Befüllt tour_pois aus zwei Quellen:
 *   A) Kuratierte pois-seed.json (hat Priorität)
 *   B) Overpass API (alle 10 OSM-Kategorien, eine Abfrage pro Kategorie)
 *
 * Flags:
 *   --curated-only  Nur pois-seed.json, kein OSM
 *   --osm-only      Nur OSM, kein pois-seed.json
 *   --dry-run       Nur ausgeben, nichts schreiben
 *
 * Ausführen aus Projektroot: node scripts/seed-pois.mjs [flags]
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from './lib/db.mjs';
import { fetchColognePoiCategory, OSM_CATEGORIES } from './lib/overpass.mjs';

const __dir   = dirname(fileURLToPath(import.meta.url));
const args    = process.argv.slice(2);
const CURATED_ONLY = args.includes('--curated-only');
const OSM_ONLY     = args.includes('--osm-only');
const DRY_RUN      = args.includes('--dry-run');
// --categories=park,platz begrenzt OSM-Fetch auf diese Kategorien
const CATEGORIES_ARG = args.find(a => a.startsWith('--categories='));
const ONLY_CATS = CATEGORIES_ARG ? new Set(CATEGORIES_ARG.split('=')[1].split(',')) : null;

// OSM-Tag → interne Kategorie
function osmCategory(tags) {
  const l = tags.leisure, p = tags.place, h = tags.historic,
        t = tags.tourism, a = tags.amenity, n = tags.natural;
  if (l === 'park' || l === 'garden')  return 'park';
  if (p === 'square')                  return 'platz';
  if (h === 'highway' && tags.area === 'yes') return 'platz';
  if (t === 'viewpoint')               return 'aussicht';
  if (h === 'monument' || h === 'memorial') return 'denkmal';
  if (a === 'marketplace')             return 'markt';
  if (t === 'artwork')                 return 'streetart';
  if (l === 'playground')              return 'spielplatz';
  if (t === 'museum')                  return 'museum';
  if (a === 'biergarten')              return 'biergarten';
  if (n === 'water' || l === 'swimming_area') return 'wasser';
  return null;
}

// Kategorien ohne Default-Tour-Eignung
const NOT_TOUR_ELIGIBLE = new Set(['spielplatz', 'kirche', 'museum']);

function slugify(s) {
  return s.toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Bbox-Fläche in m² aus OSM-Bbox schätzen
function estimateAreaM2(el) {
  if (!el.bounds) return null;
  const latM = haversine(el.bounds.minlat, el.bounds.minlon, el.bounds.maxlat, el.bounds.minlon);
  const lonM = haversine(el.bounds.minlat, el.bounds.minlon, el.bounds.minlat, el.bounds.maxlon);
  return latM * lonM;
}

function importanceFromArea(areaM2) {
  if (areaM2 === null || areaM2 > 50000) return 2;
  if (areaM2 < 2000) return 1;
  return 2;
}

async function upsertPoi(conn, poi) {
  if (DRY_RUN) return;
  await conn.query(
    `INSERT INTO tour_pois
       (id, name, description, category, lat, lng, address, veedel,
        photo_path, osm_id, tags, is_active,
        importance, tour_eligible, opening_info, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name         = VALUES(name),
       description  = VALUES(description),
       category     = VALUES(category),
       lat          = VALUES(lat),
       lng          = VALUES(lng),
       address      = VALUES(address),
       veedel       = VALUES(veedel),
       tags         = VALUES(tags),
       is_active    = VALUES(is_active),
       importance   = VALUES(importance),
       tour_eligible= VALUES(tour_eligible),
       opening_info = VALUES(opening_info),
       source       = VALUES(source)`,
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
      poi.importance     ?? 2,
      poi.tour_eligible  !== false,
      poi.opening_info   || null,
      poi.source         || 'curated',
    ]
  );
}

async function main() {
  const conn = await db.getConnection();
  let total = 0;

  // ── Quelle A: Kuratierte pois-seed.json ─────────────────────────
  if (!OSM_ONLY) {
    const seedPath = join(__dir, 'data', 'pois-seed.json');
    const curated  = JSON.parse(readFileSync(seedPath, 'utf-8'));
    console.log(`\n📍 Quelle A: ${curated.length} kuratierte POIs${DRY_RUN ? ' (dry-run)' : ''}`);

    let n = 0;
    for (const poi of curated) {
      await upsertPoi(conn, poi);
      n++;
      process.stdout.write('.');
    }
    console.log(`\n   ✅ ${n} POIs ${DRY_RUN ? 'simuliert' : 'geschrieben'}`);
    total += n;
  }

  // ── Quelle B: Overpass API ────────────────────────────────────────
  if (!CURATED_ONLY) {
    // Bekannte Koordinaten für Duplikat-Check (name+position)
    let curatedCoords = [];
    if (!OSM_ONLY) {
      const seedPath = join(__dir, 'data', 'pois-seed.json');
      const curated  = JSON.parse(readFileSync(seedPath, 'utf-8'));
      curatedCoords  = curated.map(p => ({ name: p.name.toLowerCase(), lat: p.lat, lng: p.lng }));
    } else {
      // --osm-only: bestehende non-OSM-POIs aus DB laden um Innenstadt-Duplikate zu vermeiden
      const [existing] = await conn.query(
        "SELECT name, lat, lng FROM tour_pois WHERE source IN ('curated','manual')"
      );
      curatedCoords = existing.map(p => ({
        name: p.name.toLowerCase(),
        lat: parseFloat(p.lat),
        lng: parseFloat(p.lng),
      }));
      console.log(`\n   ${curatedCoords.length} bestehende kuratierte POIs als Duplikat-Basis geladen`);
    }

    for (const cat of OSM_CATEGORIES) {
      if (ONLY_CATS && !ONLY_CATS.has(cat)) continue;
      console.log(`\n🌍 OSM-Kategorie: ${cat} …`);
      let elements;
      try {
        elements = await fetchColognePoiCategory(cat);
        console.log(`   ${elements.length} Elemente gefunden`);
      } catch (err) {
        console.log(`   ❌ Overpass-Fehler: ${err.message} — übersprungen`);
        continue;
      }

      let inserted = 0, skipped = 0;
      for (const el of elements) {
        const tags   = el.tags || {};
        if (!tags.name) { skipped++; continue; }

        const center = el.type === 'node'
          ? { lat: el.lat, lon: el.lon }
          : el.center;
        if (!center?.lat) { skipped++; continue; }

        // Duplikat-Erkennung: gleicher Name + Distanz < 150m → überspringen
        const nameLow = tags.name.toLowerCase();
        const isDuplicate = curatedCoords.some(c =>
          c.name === nameLow &&
          haversine(center.lat, center.lon, c.lat, c.lng) < 150
        );
        if (isDuplicate) { skipped++; continue; }

        const areaM2     = estimateAreaM2(el);
        const importance = importanceFromArea(areaM2);
        const osmId      = `${el.type}/${el.id}`;

        const poi = {
          id:           `osm-${el.type}-${el.id}`,
          name:         tags.name,
          description:  tags.description || tags.note || null,
          category:     cat,
          lat:          center.lat,
          lng:          center.lon,
          address:      tags['addr:street']
            ? `${tags['addr:street']} ${tags['addr:housenumber'] || ''}`.trim()
            : null,
          veedel:       tags['addr:suburb'] || tags['addr:quarter'] || null,
          osm_id:       osmId,
          tags:         {},
          is_active:    true,
          importance,
          tour_eligible: !NOT_TOUR_ELIGIBLE.has(cat),
          source:       'osm',
        };

        if (DRY_RUN) {
          process.stdout.write('.');
          inserted++;
          continue;
        }

        await upsertPoi(conn, poi);
        inserted++;
        // Koordinate für spätere Duplikat-Checks merken
        curatedCoords.push({ name: nameLow, lat: center.lat, lng: center.lon });

        if (inserted % 25 === 0) process.stdout.write('.');
      }
      console.log(`\n   ✅ ${inserted} geschrieben, ${skipped} übersprungen`);
      total += inserted;

      // Kurze Pause zwischen Overpass-Requests
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  if (!DRY_RUN) {
    const [[{ cnt }]] = await conn.query('SELECT COUNT(*) AS cnt FROM tour_pois');
    console.log(`\n📊 tour_pois gesamt: ${cnt} POIs (Session hat ${total} geschrieben/aktualisiert)\n`);
  } else {
    console.log(`\n📊 Dry-run: ${total} POIs würden verarbeitet werden\n`);
  }

  conn.release();
  await db.end();
}

main().catch(err => {
  console.error('Fataler Fehler:', err);
  process.exit(1);
});
