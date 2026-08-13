import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();

const WHERE = "veedel IS NULL AND address NOT REGEXP ', Köln'";

await conn.query(`DELETE FROM enrichment_queue WHERE buedchen_id IN (SELECT id FROM buedchen WHERE ${WHERE})`);
const [r] = await conn.query(`DELETE FROM buedchen WHERE ${WHERE}`);
console.log(`✅ ${r.affectedRows} gelöscht`);

const [c] = await conn.query('SELECT COUNT(*) as n FROM buedchen');
console.log(`Verbleibend: ${c[0].n} Büdchen`);

conn.release();
await db.end();
