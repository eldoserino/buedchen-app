import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();

const [rows] = await conn.query(
  "SELECT id, character_tags FROM buedchen WHERE JSON_SEARCH(character_tags, 'one', 'kiez-treff') IS NOT NULL"
);

let updated = 0;
for (const row of rows) {
  const tags = Array.isArray(row.character_tags) ? row.character_tags
    : (() => { try { return JSON.parse(row.character_tags); } catch { return null; } })();
  if (!tags) continue;
  const newTags = tags.map(t => t === 'kiez-treff' ? 'veedel-treff' : t);
  await conn.query('UPDATE buedchen SET character_tags = ? WHERE id = ?', [JSON.stringify(newTags), row.id]);
  updated++;
}

console.log(`Renamed kiez-treff → veedel-treff in ${updated} Büdchen`);
conn.release();
await db.end();
