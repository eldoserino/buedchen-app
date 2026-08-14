/**
 * Holt alle un-enriched Büdchen + Google Reviews und teilt sie in Batch-Dateien auf.
 * Muss einmal vor dem parallelen Enrichment ausgeführt werden.
 *
 * Ausführen:
 *   node scripts/prepare-batches.mjs [batch-size]
 *   Standard: 100 Büdchen pro Batch
 *
 * Output: scripts/tmp/batch-0.json, batch-1.json, ...
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import db from './lib/db.mjs';
import { calcConfidence } from './lib/enrich-prompt.mjs';

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BATCH_SIZE = parseInt(process.argv[2] || '100');
const TMP_DIR = join(dirname(fileURLToPath(import.meta.url)), 'tmp');

async function fetchReviews(placeId) {
  if (!placeId || !GOOGLE_API_KEY) return [];
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        'X-Goog-Api-Key':   GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'reviews',
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.reviews || []).slice(0, 10).map(r => ({
      text:   r.text?.text || '',
      rating: r.rating || 0,
    })).filter(r => r.text.length > 10);
  } catch {
    return [];
  }
}

const [rows] = await db.query(`
  SELECT id, name, address, veedel, google_place_id,
         google_rating, google_review_count, buedchen_type
  FROM buedchen
  WHERE enriched_at IS NULL
  ORDER BY google_review_count DESC
`);
await db.end();

console.log(`\n📦 ${rows.length} Büdchen ohne Enrichment gefunden`);
console.log(`🔍 Fetching Google Reviews (kann 5–10 Min dauern)...\n`);

mkdirSync(TMP_DIR, { recursive: true });

const enriched = [];
for (let i = 0; i < rows.length; i++) {
  const b = rows[i];
  const reviews = await fetchReviews(b.google_place_id);
  const confidence = calcConfidence(reviews);
  enriched.push({ ...b, reviews, confidence });

  if ((i + 1) % 20 === 0 || i === rows.length - 1) {
    process.stdout.write(`  ${i + 1}/${rows.length} Reviews geholt\r`);
  }

  await new Promise(r => setTimeout(r, 400));
}

console.log(`\n\n✅ ${enriched.length} Büdchen mit Reviews geladen`);
console.log(`📂 Speichere Batches nach ${TMP_DIR}\n`);

const numBatches = Math.ceil(enriched.length / BATCH_SIZE);
for (let n = 0; n < numBatches; n++) {
  const slice = enriched.slice(n * BATCH_SIZE, (n + 1) * BATCH_SIZE);
  const file = join(TMP_DIR, `batch-${n}.json`);
  writeFileSync(file, JSON.stringify(slice, null, 2), 'utf8');
  console.log(`  Batch ${n}: ${slice.length} Büdchen → tmp/batch-${n}.json`);
}

console.log(`\n🚀 ${numBatches} Batches bereit. Jetzt ${numBatches} Agents starten.\n`);
