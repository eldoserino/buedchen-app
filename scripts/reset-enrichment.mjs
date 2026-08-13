import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();
const [r] = await conn.execute('UPDATE buedchen SET enriched_at = NULL');
console.log(`Reset: ${r.affectedRows} Büdchen zurückgesetzt — bereit für Re-Enrichment`);
conn.release();
await db.end();
