import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();

// Büdchen die enriched wurden aber keine Summary haben → neu enrichen
const [r] = await conn.query(
  'UPDATE buedchen SET enriched_at = NULL WHERE ai_summary IS NULL AND enriched_at IS NOT NULL'
);
console.log(`Reset: ${r.affectedRows} Büdchen für Re-Enrichment freigegeben`);

conn.release();
await db.end();
