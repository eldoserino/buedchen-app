import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();

const [nulls] = await conn.execute(
  'SELECT id, name, address, enriched_at, ai_confidence FROM buedchen WHERE ai_confidence IS NULL LIMIT 10'
);
console.log('Büdchen mit null confidence:');
nulls.forEach(r => console.log(`  ${r.id} | ${r.name} | enriched_at: ${r.enriched_at} | conf: ${r.ai_confidence}`));

const [[{ total }]] = await conn.execute('SELECT COUNT(*) AS total FROM buedchen');
const [[{ enriched }]] = await conn.execute('SELECT COUNT(*) AS enriched FROM buedchen WHERE enriched_at IS NOT NULL');
const [[{ withType }]] = await conn.execute("SELECT COUNT(*) AS withType FROM buedchen WHERE buedchen_type != 'straßenbüdchen' AND buedchen_type IS NOT NULL");
console.log(`\nGesamt: ${total} | Enriched: ${enriched} | Non-Straßenbüdchen: ${withType}`);

conn.release();
await db.end();
