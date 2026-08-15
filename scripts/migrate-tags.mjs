/**
 * Tag-Migration (einmalig):
 * - Geo-Tags aus character_tags entfernen (werden durch buedchen_type abgebildet)
 * - kiez-treff → veedel-treff umbenennen
 *
 * Ausführen: node scripts/migrate-tags.mjs
 */

import 'dotenv/config';
import db from './lib/db.mjs';

const GEO_TAGS = new Set(['platzbüdchen', 'parkbüdchen', 'uferbüdchen', 'straßenbüdchen']);

const conn = await db.getConnection();

const [rows] = await conn.query(
  `SELECT id, name, character_tags FROM buedchen WHERE character_tags IS NOT NULL`
);

let updated = 0;

for (const row of rows) {
  const tags = Array.isArray(row.character_tags)
    ? row.character_tags
    : (() => { try { return JSON.parse(row.character_tags); } catch { return []; } })();

  const newTags = tags
    .map(t => t === 'kiez-treff' ? 'veedel-treff' : t)
    .filter(t => !GEO_TAGS.has(t));

  if (JSON.stringify(tags) !== JSON.stringify(newTags)) {
    await conn.query(
      'UPDATE buedchen SET character_tags = ? WHERE id = ?',
      [JSON.stringify(newTags), row.id]
    );
    console.log(`  ${row.name}: [${tags.join(', ')}] → [${newTags.join(', ')}]`);
    updated++;
  }
}

console.log(`\n✅ ${updated} Büdchen aktualisiert (Geo-Tags entfernt, kiez-treff → veedel-treff)`);
conn.release();
await db.end();
