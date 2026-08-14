import 'dotenv/config';
import db from './lib/db.mjs';

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const COUNT = parseInt(process.argv[2] || '5');

async function fetchReviews(placeId) {
  if (!placeId || !GOOGLE_API_KEY) return [];
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: { 'X-Goog-Api-Key': GOOGLE_API_KEY, 'X-Goog-FieldMask': 'reviews' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.reviews || []).slice(0, 10).map(r => ({
      text: r.text?.text || '', rating: r.rating,
    })).filter(r => r.text.length > 10);
  } catch { return []; }
}

const conn = await db.getConnection();
const [rows] = await conn.query(`
  SELECT id, name, address, veedel, google_rating, google_review_count,
         google_place_id, buedchen_type, character_tags, ai_summary
  FROM buedchen
  WHERE google_place_id IS NOT NULL AND google_review_count >= 5
  ORDER BY RAND() LIMIT ?
`, [COUNT]);
conn.release();
await db.end();

const result = [];
for (const b of rows) {
  const reviews = await fetchReviews(b.google_place_id);
  result.push({ ...b, reviews });
  await new Promise(r => setTimeout(r, 500));
}

console.log(JSON.stringify(result, null, 2));
