import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();

// Zeige büdchen die already enriched sind (die 2 die vorhin corrupted wurden)
const [enriched] = await conn.query(
  'SELECT id, name, buedchen_type, poi_distances FROM buedchen WHERE enriched_at IS NOT NULL LIMIT 5'
);
console.log('Bereits enriched:');
enriched.forEach(r => console.log(`  [${r.id}] ${r.name} | type=${r.buedchen_type} | poi_dist=${r.poi_distances}`));

// Reset: enriched_at wieder auf NULL
const [reset] = await conn.query('UPDATE buedchen SET enriched_at = NULL WHERE enriched_at IS NOT NULL');
console.log(`\nReset: ${reset.affectedRows} Büdchen wieder auf NULL`);

conn.release();
await db.end();
