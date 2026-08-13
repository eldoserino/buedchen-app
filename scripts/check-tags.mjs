import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();

// Wie sehen die Tags raw aus?
const [sample] = await conn.query(
  "SELECT id, name, character_tags FROM buedchen WHERE character_tags IS NOT NULL AND character_tags != '[]' LIMIT 5"
);
sample.forEach(r => console.log(r.name, '|', typeof r.character_tags, '|', JSON.stringify(r.character_tags)));

// Wie viele haben überhaupt Tags?
const [counts] = await conn.query(
  "SELECT COUNT(*) as total, SUM(character_tags IS NOT NULL AND character_tags != '[]') as with_tags FROM buedchen"
);
console.log('\nGesamt:', counts[0]);

// Suche nach kiez-treff
const [kiez] = await conn.query(
  "SELECT COUNT(*) as n FROM buedchen WHERE JSON_SEARCH(character_tags, 'one', 'kiez-treff') IS NOT NULL"
);
console.log('kiez-treff (JSON_SEARCH):', kiez[0].n);

conn.release();
await db.end();
