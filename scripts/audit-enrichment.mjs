/**
 * Audit-Script: Prüft Enrichment-Qualität anhand echter Reviews.
 * Fetcht 20 Büdchen (verschiedene Confidence-Level) und holt Reviews nach.
 * Gibt Bewertung + Raw-Output aus.
 */
import 'dotenv/config';
import db from './lib/db.mjs';

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const COUNT = parseInt(process.argv[2] || '20');

async function fetchReviews(placeId) {
  if (!placeId || !GOOGLE_API_KEY) return [];
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: { 'X-Goog-Api-Key': GOOGLE_API_KEY, 'X-Goog-FieldMask': 'reviews' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.reviews || []).slice(0, 5).map(r => ({
      text: (r.text?.text || '').slice(0, 200),
      rating: r.rating,
    })).filter(r => r.text.length > 10);
  } catch { return []; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const conn = await db.getConnection();

  // Diverse Stichprobe: verschiedene Typen, Ratings, Veedel
  const [rows] = await conn.execute(`
    SELECT id, name, address, veedel, google_rating, google_review_count,
           google_place_id, buedchen_type, character_tags, ai_summary, ai_confidence
    FROM buedchen
    WHERE enriched_at IS NOT NULL
      AND google_place_id IS NOT NULL
      AND google_review_count >= 3
    ORDER BY RAND()
    LIMIT ?
  `, [COUNT]);

  conn.release();
  await db.end();

  console.log(`\n${'='.repeat(80)}`);
  console.log(`ENRICHMENT-AUDIT — ${rows.length} Büdchen`);
  console.log('='.repeat(80));

  for (let i = 0; i < rows.length; i++) {
    const b = rows[i];
    const reviews = await fetchReviews(b.google_place_id);
    let tags = [];
    try { tags = JSON.parse(b.character_tags || '[]'); } catch { tags = [String(b.character_tags || '')]; }

    console.log(`\n[${i+1}/${rows.length}] ${b.name} (${b.veedel}) | ${b.buedchen_type} | ⭐${b.google_rating} (${b.google_review_count} Reviews) | conf=${b.ai_confidence}`);
    console.log(`TAGS:    ${tags.join(', ') || '(keine)'}`);
    console.log(`SUMMARY: ${b.ai_summary || '(keine)'}`);

    if (reviews.length > 0) {
      console.log('REVIEWS:');
      reviews.forEach(r => console.log(`  [${r.rating}★] ${r.text}`));
    } else {
      console.log('REVIEWS: (nicht abrufbar)');
    }

    // Kurze Pause zwischen Places-Calls
    if (i < rows.length - 1) await sleep(800);
  }

  console.log(`\n${'='.repeat(80)}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
