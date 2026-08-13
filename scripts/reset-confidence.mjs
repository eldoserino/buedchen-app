import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();
const [r] = await conn.execute(
  'UPDATE buedchen SET enriched_at = NULL WHERE ai_confidence = 0.85'
);
console.log(`Reset: ${r.affectedRows} Büdchen zurückgesetzt`);
conn.release();
await db.end();
