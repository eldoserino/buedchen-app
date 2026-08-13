import 'dotenv/config';
import db from './lib/db.mjs';

console.log('GOOGLE_PLACES_API_KEY gesetzt:', !!process.env.GOOGLE_PLACES_API_KEY);
console.log('Key-Prefix:', process.env.GOOGLE_PLACES_API_KEY?.slice(0, 8));

// Eine Büdchen mit google_place_id aus DB holen
const conn = await db.getConnection();
const [[sample]] = await conn.query(
  'SELECT id, name, google_place_id FROM buedchen WHERE google_place_id IS NOT NULL ORDER BY google_review_count DESC LIMIT 1'
);
conn.release();
await db.end();

console.log('\nTest-Büdchen:', sample.name);
console.log('google_place_id:', sample.google_place_id);

const url = `https://places.googleapis.com/v1/places/${sample.google_place_id}`;
const res = await fetch(url, {
  headers: {
    'X-Goog-Api-Key':   process.env.GOOGLE_PLACES_API_KEY,
    'X-Goog-FieldMask': 'reviews,displayName',
  },
});

console.log('\nAPI Response Status:', res.status);
const data = await res.json();
console.log('Response Keys:', Object.keys(data));

if (data.reviews) {
  console.log(`Reviews: ${data.reviews.length}`);
  if (data.reviews[0]) {
    console.log('Erster Review-Text:', data.reviews[0].text?.text?.slice(0, 80));
    console.log('Rating:', data.reviews[0].rating);
  }
} else if (data.error) {
  console.log('API Error:', JSON.stringify(data.error));
} else {
  console.log('Kein reviews-Feld. Volle Antwort:', JSON.stringify(data).slice(0, 200));
}
