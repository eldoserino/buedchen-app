import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();

const WHERE = "address REGEXP 'Mülheim' AND address NOT REGEXP 'Köln'";

await conn.query(`DELETE FROM enrichment_queue WHERE buedchen_id IN (SELECT id FROM buedchen WHERE ${WHERE})`);
const [result] = await conn.query(`DELETE FROM buedchen WHERE ${WHERE}`);

console.log(`✅ ${result.affectedRows} Einträge gelöscht`);

const [count] = await conn.query('SELECT COUNT(*) as n FROM buedchen');
console.log(`Verbleibend: ${count[0].n} Büdchen`);

conn.release();
await db.end();
